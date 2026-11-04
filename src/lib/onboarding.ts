import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { PREFS_EMAIL_ID_KEY, preferencesFromMetadata } from "@/lib/preferences";
import { isHuntScoutSession, sessionAccessEnd } from "@/lib/entitlement";
import { welcomeEmail, preferencesEmail, type RenderedEmail } from "@/lib/emails/onboarding";
import { purchaseNotification } from "@/lib/emails/lifecycle";
import { ONBOARDING_SENT_KEY, ONBOARDING_SINCE, PURCHASE_ALERT_KEY } from "@/lib/lifecycle";
import { inboundAddress, isInboundConfigured, resendApiBase } from "@/lib/inbound/config";

const FROM = process.env.EMAIL_FROM || "Adam White, HuntScout Pro <adam@huntscoutpro.com>";
// Replies go to the inbound address once it's set up (INBOUND_EMAIL.md), so each one gets an
// AI-drafted answer for Adam to approve. Until then they go straight to Adam's inbox.
const REPLY_TO = (isInboundConfigured() && inboundAddress()) || process.env.EMAIL_REPLY_TO || "adam@huntscoutpro.com";
// Optional comma-separated BCC so the owner sees every onboarding email.
const BCC = (process.env.ONBOARDING_BCC || "").split(",").map((s) => s.trim()).filter(Boolean);
/** Where owner alerts go: each new purchase, and the daily onboarding check. */
export const OWNER_ALERTS_TO = process.env.OWNER_ALERTS_TO || "adam@huntscoutpro.com";

// Only act on recent payments. Must stay under Resend's 24 h idempotency-key
// window so a late retry can never produce a second copy.
const MAX_PAYMENT_AGE_MS = 20 * 60 * 60 * 1000;
// Stamped on the PaymentIntent once both emails are accepted: the durable guard.
const SENT_KEY = ONBOARDING_SENT_KEY;
// Email 2 goes out this long after purchase.
const PREFERENCES_DELAY_MS = 24 * 60 * 60 * 1000;

export interface EmailAttachment {
  filename: string;
  /** File bytes, base64-encoded (Resend's format). */
  content: string;
}

/** A send Resend refused; `code` is Resend's error name (e.g. "invalid_idempotent_request"). */
export class EmailSendError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = "EmailSendError";
    this.status = status;
    this.code = code;
  }
}

interface SendOptions {
  to: string;
  email: RenderedEmail;
  idempotencyKey?: string;
  scheduledAt?: string;
  replyTo?: string;
  /** Extra email headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
  /** Copy ONBOARDING_BCC (default true). Off for member digests, whose unsubscribe links are per member. */
  bcc?: boolean;
  /** Files to attach (e.g. the personal scouting report PDF). */
  attachments?: EmailAttachment[];
  /** Request timeout; attachments make the request larger. */
  timeoutMs?: number;
}

/**
 * Send through Resend's HTTP API. Returns the Resend email id, or null when
 * RESEND_API_KEY isn't configured.
 */
export async function sendEmail({ to, email, idempotencyKey, scheduledAt, replyTo, headers, bcc = true, attachments, timeoutMs = 10000 }: SendOptions): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`RESEND_API_KEY not set; skipping "${email.subject}"`);
    return null;
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${resendApiBase()}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: replyTo || REPLY_TO,
        ...(bcc && BCC.length ? { bcc: BCC } : {}),
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
        ...(headers && Object.keys(headers).length ? { headers } : {}),
        ...(attachments?.length ? { attachments } : {}),
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      let name = "";
      try {
        name = (JSON.parse(body) as { name?: string }).name || "";
      } catch {}
      // Another request with this key is still in flight (webhook and /success
      // racing): wait and replay; Resend then returns the original result.
      if (res.status === 409 && name === "concurrent_idempotent_requests" && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw new EmailSendError(`Resend ${res.status} ${name}: ${body.slice(0, 300)}`, res.status, name);
    }
    // Same key + same payload replays the original response (no second send).
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return data.id || "sent";
  }
}

/** Cancel a scheduled Resend email (e.g. the intake reminder once the form is done). */
export async function cancelScheduledEmail(id: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !/^[0-9a-f-]{20,}$/i.test(id)) return;
  const res = await fetch(`${resendApiBase()}/emails/${id}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) console.warn(`Resend cancel ${id}: ${res.status}`);
}

function buyerEmail(s: Stripe.Checkout.Session): string | null {
  return s.customer_details?.email || s.customer_email || s.metadata?.userEmail || null;
}

/**
 * Send the two onboarding emails for a paid HuntScout checkout:
 * 1) welcome now, 2) hunting-preferences intake 24 h after payment,
 * plus the owner's "New HuntScout Pro purchase" alert.
 * Safe to call repeatedly (webhook retries, /success reloads): markers on the
 * PaymentIntent stop repeats for good, and Resend idempotency keys cover races.
 * Throws when anything wasn't sent, so the webhook answers 500 and Stripe retries
 * (whatever did go out is already marked and won't repeat).
 */
export async function sendOnboardingEmails(s: Stripe.Checkout.Session): Promise<"sent" | "skipped"> {
  if (!stripe || !isHuntScoutSession(s) || s.payment_status !== "paid") return "skipped";
  if (s.created * 1000 < ONBOARDING_SINCE) return "skipped";
  const to = buyerEmail(s);
  const piId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  if (!to || !piId) return "skipped";

  const pi = await stripe.paymentIntents.retrieve(piId);
  const onboarded = !!pi.metadata?.[SENT_KEY];
  const alerted = !!pi.metadata?.[PURCHASE_ALERT_KEY];
  if (onboarded && alerted) return "skipped";
  const paidMs = pi.created * 1000;
  if (Date.now() - paidMs > MAX_PAYMENT_AGE_MS) return "skipped";
  if (!process.env.RESEND_API_KEY) {
    // Throw so the webhook answers 500 and Stripe retries once the key is set.
    throw new Error("RESEND_API_KEY not set; onboarding emails not sent");
  }

  const name = s.metadata?.userName || s.customer_details?.name || null;
  const stamps: Record<string, string> = {};
  let alertError: unknown = null;
  try {
    // The owner's alert first: a failure here never holds up the buyer's welcome email.
    if (!alerted) {
      try {
        await sendEmail({
          to: OWNER_ALERTS_TO,
          replyTo: to,
          bcc: false,
          email: purchaseNotification({
            name,
            email: to,
            amountCents: s.amount_total ?? pi.amount ?? null,
            currency: s.currency ?? pi.currency ?? null,
            paidAtMs: paidMs,
            accessUntil: sessionAccessEnd(s),
            states: preferencesFromMetadata(pi.metadata)?.states,
            paymentIntentId: piId,
          }),
          idempotencyKey: `hs-sale-${s.id}`,
        });
        stamps[PURCHASE_ALERT_KEY] = new Date().toISOString();
      } catch (err) {
        alertError = err;
        console.error(`Purchase alert failed for checkout ${s.id}:`, err);
      }
    }

    if (!onboarded) {
      await sendEmail({
        to,
        email: welcomeEmail({ name, email: to, accessUntil: sessionAccessEnd(s) }),
        idempotencyKey: `hs-welcome-${s.id}`,
      });

      const prefsId = await sendEmail({
        to,
        email: preferencesEmail({ name }),
        idempotencyKey: `hs-prefs-${s.id}`,
        // Derived from the payment, so every trigger sends an identical payload.
        scheduledAt: new Date(paidMs + PREFERENCES_DELAY_MS).toISOString(),
      });

      // Mark done, and keep the scheduled email's id so it can be cancelled if the
      // member fills in /welcome first or is refunded.
      stamps[SENT_KEY] = new Date().toISOString();
      if (prefsId && prefsId !== "sent") stamps[PREFS_EMAIL_ID_KEY] = prefsId;
    }
  } finally {
    if (Object.keys(stamps).length) {
      await stripe.paymentIntents
        .update(piId, { metadata: stamps })
        .catch((err) => console.error(`Could not mark onboarding sent on ${piId}:`, err));
    }
  }
  if (alertError) throw new Error(`Purchase alert not sent: ${alertError instanceof Error ? alertError.message : String(alertError)}`);
  return onboarded ? "skipped" : "sent";
}

/** On refund/dispute: cancel the not-yet-sent intake email for that payment. */
export async function cancelOnboardingForPayment(piId: string): Promise<void> {
  if (!stripe) return;
  const pi = await stripe.paymentIntents.retrieve(piId);
  if (pi.metadata?.product !== "huntscout_pro") return;
  const id = pi.metadata?.[PREFS_EMAIL_ID_KEY];
  if (id) await cancelScheduledEmail(id);
}
