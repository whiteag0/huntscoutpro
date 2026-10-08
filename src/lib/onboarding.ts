import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { PREFS_EMAIL_ID_KEY } from "@/lib/preferences";
import { isHuntScoutSession, sessionAccessEnd } from "@/lib/entitlement";
import { welcomeEmail, preferencesEmail, type RenderedEmail } from "@/lib/emails/onboarding";

const FROM = process.env.EMAIL_FROM || "Adam White, HuntScout Pro <adam@huntscoutpro.com>";
const REPLY_TO = process.env.EMAIL_REPLY_TO || "adam@huntscoutpro.com";
// Optional comma-separated BCC so the owner sees every onboarding email.
const BCC = (process.env.ONBOARDING_BCC || "").split(",").map((s) => s.trim()).filter(Boolean);

// Purchases before this were onboarded by hand; never email them automatically.
const ONBOARDING_SINCE = Date.parse("2026-10-08T00:00:00Z");
// Only act on recent payments. Must stay under Resend's 24 h idempotency-key
// window so a late retry can never produce a second copy.
const MAX_PAYMENT_AGE_MS = 20 * 60 * 60 * 1000;
// Stamped on the PaymentIntent once both emails are accepted: the durable guard.
const SENT_KEY = "hs_onboarding_sent_at";
// Email 2 goes out this long after purchase.
const PREFERENCES_DELAY_MS = 24 * 60 * 60 * 1000;

interface SendOptions {
  to: string;
  email: RenderedEmail;
  idempotencyKey?: string;
  scheduledAt?: string;
  replyTo?: string;
}

/**
 * Send through Resend's HTTP API. Returns the Resend email id, or null when
 * RESEND_API_KEY isn't configured.
 */
export async function sendEmail({ to, email, idempotencyKey, scheduledAt, replyTo }: SendOptions): Promise<string | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`RESEND_API_KEY not set; skipping "${email.subject}"`);
    return null;
  }
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.resend.com/emails", {
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
        ...(BCC.length ? { bcc: BCC } : {}),
        subject: email.subject,
        html: email.html,
        text: email.text,
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      }),
      signal: AbortSignal.timeout(10000),
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
      throw new Error(`Resend ${res.status} ${name}: ${body.slice(0, 300)}`);
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
  const res = await fetch(`https://api.resend.com/emails/${id}/cancel`, {
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
 * 1) sign-in instructions now, 2) hunting-preferences intake 24 h after payment.
 * Safe to call repeatedly (webhook retries, /success reloads): a marker on the
 * PaymentIntent stops repeats for good, and Resend idempotency keys cover races.
 */
export async function sendOnboardingEmails(s: Stripe.Checkout.Session): Promise<"sent" | "skipped"> {
  if (!stripe || !isHuntScoutSession(s) || s.payment_status !== "paid") return "skipped";
  if (s.created * 1000 < ONBOARDING_SINCE) return "skipped";
  const to = buyerEmail(s);
  const piId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  if (!to || !piId) return "skipped";

  const pi = await stripe.paymentIntents.retrieve(piId);
  if (pi.metadata?.[SENT_KEY]) return "skipped";
  const paidMs = pi.created * 1000;
  if (Date.now() - paidMs > MAX_PAYMENT_AGE_MS) return "skipped";
  if (!process.env.RESEND_API_KEY) {
    // Throw so the webhook answers 500 and Stripe retries once the key is set.
    throw new Error("RESEND_API_KEY not set; onboarding emails not sent");
  }

  const name = s.metadata?.userName || s.customer_details?.name || null;
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
  await stripe.paymentIntents
    .update(piId, {
      metadata: {
        [SENT_KEY]: new Date().toISOString(),
        ...(prefsId && prefsId !== "sent" ? { [PREFS_EMAIL_ID_KEY]: prefsId } : {}),
      },
    })
    .catch((err) => console.error(`Could not mark onboarding sent on ${piId}:`, err));
  return "sent";
}

/** On refund/dispute: cancel the not-yet-sent intake email for that payment. */
export async function cancelOnboardingForPayment(piId: string): Promise<void> {
  if (!stripe) return;
  const pi = await stripe.paymentIntents.retrieve(piId);
  if (pi.metadata?.product !== "huntscout_pro") return;
  const id = pi.metadata?.[PREFS_EMAIL_ID_KEY];
  if (id) await cancelScheduledEmail(id);
}
