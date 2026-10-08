import type Stripe from "stripe";
import { stripe, PRODUCT_TAG, ENTITLEMENT_MONTHS } from "@/lib/stripe";

export type EntitlementSource = "admin" | "override" | "stripe" | "none" | "error";

export interface Entitlement {
  isPro: boolean;
  expiresAt: string | null;
  source: EntitlementSource;
  /** PaymentIntent of the purchase granting access; member preferences live in its metadata. */
  paymentIntentId?: string | null;
  /** Member has completed or skipped the /welcome form (stored on the PaymentIntent). */
  onboarded?: boolean;
}

// Hosts our legacy (pre-tag) Checkout Sessions redirected back to.
const LEGACY_HOSTS = new Set(
  [
    "www.huntscoutpro.com",
    "huntscoutpro.com",
    "co-hunt-tags.vercel.app",
    safeHost(process.env.NEXTAUTH_URL),
    safeHost(process.env.AUTH_URL),
  ].filter(Boolean) as string[]
);

function safeHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  const admin = process.env.SUPER_ADMIN_EMAIL || "adam@theedgezip.com";
  return !!email && normalizeEmail(email) === normalizeEmail(admin);
}

/**
 * Manual grants, e.g. PRO_EMAIL_OVERRIDES="a@x.com, b@y.com:2028-10-07".
 * An optional ":YYYY-MM-DD" suffix sets the access end date. Kept in the
 * environment (never in the repo) because it contains customer emails.
 */
function overrideFor(email: string): Entitlement | null {
  const raw = process.env.PRO_EMAIL_OVERRIDES || "";
  for (const entry of raw.split(/[,\s]+/).filter(Boolean)) {
    const [addr, until] = entry.split(":");
    if (normalizeEmail(addr) !== email) continue;
    const expiresAt = until && !Number.isNaN(Date.parse(until)) ? new Date(until + "T23:59:59Z").toISOString() : null;
    if (expiresAt && Date.parse(expiresAt) < Date.now()) return null;
    return { isPro: true, expiresAt, source: "override" };
  }
  return null;
}

/** True when a Checkout Session is a HuntScout purchase (tagged, or legacy by redirect host). */
export function isHuntScoutSession(s: Stripe.Checkout.Session): boolean {
  if (s.metadata?.product === PRODUCT_TAG) return true;
  const host = safeHost(s.success_url);
  return !!host && LEGACY_HOSTS.has(host) && !!s.metadata?.userEmail;
}

function addMonths(unixSeconds: number, months: number): Date {
  const d = new Date(unixSeconds * 1000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** Access end date for a paid session, or null if it doesn't grant access (unpaid, refunded, disputed). */
export function sessionAccessEnd(s: Stripe.Checkout.Session): Date | null {
  if (s.status !== "complete" || s.payment_status !== "paid") return null;
  const pi = s.payment_intent;
  if (pi && typeof pi === "object") {
    const charge = pi.latest_charge;
    if (charge && typeof charge === "object" && (charge.refunded || charge.disputed)) return null;
  }
  const months = Number(s.metadata?.entitlementMonths) || ENTITLEMENT_MONTHS;
  return addMonths(s.created, months);
}

async function stripeEntitlement(email: string, rawEmail: string): Promise<Entitlement> {
  if (!stripe) return { isPro: false, expiresAt: null, source: "none" };

  // Checkout Sessions carry the buyer's email in customer_details even for
  // guest checkouts that never create a Customer object.
  const emails = Array.from(new Set([email, rawEmail.trim()]));
  let best: Date | null = null;
  let bestPi: Stripe.PaymentIntent | null = null;
  for (const e of emails) {
    const sessions = await stripe.checkout.sessions.list({
      customer_details: { email: e },
      status: "complete",
      limit: 100,
      expand: ["data.payment_intent.latest_charge"],
    });
    for (const s of sessions.data) {
      if (!isHuntScoutSession(s)) continue;
      const end = sessionAccessEnd(s);
      if (end && (!best || end > best)) {
        best = end;
        bestPi = s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent : null;
      }
    }
  }

  if (best && best.getTime() > Date.now()) {
    return {
      isPro: true,
      expiresAt: best.toISOString(),
      source: "stripe",
      paymentIntentId: bestPi?.id ?? null,
      onboarded: !!bestPi?.metadata?.hs_onboarded_at,
    };
  }
  return { isPro: false, expiresAt: best ? best.toISOString() : null, source: "none" };
}

// Short per-instance memo so one request that checks twice (auth() + route)
// only hits Stripe once. Errors are never cached.
const MEMO_MS = 30 * 1000;
const memo = new Map<string, { ent: Entitlement; at: number }>();

/** Single source of truth for whether an email has Pro access. Server-only. */
export async function getEntitlement(rawEmail: string | null | undefined): Promise<Entitlement> {
  if (!rawEmail) return { isPro: false, expiresAt: null, source: "none" };
  const email = normalizeEmail(rawEmail);
  const hit = memo.get(email);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.ent;
  const ent = await computeEntitlement(email, rawEmail);
  if (ent.source !== "error") {
    if (memo.size > 1000) memo.clear();
    memo.set(email, { ent, at: Date.now() });
  }
  return ent;
}

async function computeEntitlement(email: string, rawEmail: string): Promise<Entitlement> {

  if (isSuperAdminEmail(email)) return { isPro: true, expiresAt: null, source: "admin" };

  const override = overrideFor(email);

  try {
    const fromStripe = await stripeEntitlement(email, rawEmail);
    if (fromStripe.isPro) return fromStripe;
  } catch (error) {
    console.error("Entitlement lookup failed:", error);
    return override ?? { isPro: false, expiresAt: null, source: "error" };
  }

  return override ?? { isPro: false, expiresAt: null, source: "none" };
}
