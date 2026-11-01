import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { isHuntScoutSession, normalizeEmail, sessionAccessEnd } from "@/lib/entitlement";
import { preferencesFromMetadata, REMINDERS_OFF_KEY } from "@/lib/preferences";
import type { ReminderMember } from "@/lib/reminders";

// Active HuntScout Pro members and their saved preferences, read straight from
// Stripe (there is no database). The Stripe account is shared with other
// products, so every session goes through isHuntScoutSession().

export interface Member extends ReminderMember {
  paymentIntentId: string;
  sessionId: string;
  /** ISO time the member's access ends. */
  accessEnd: string;
}

export interface MemberListStats {
  /** Completed Checkout Sessions in the window (all products). */
  sessions: number;
  /** HuntScout sessions that are paid, not refunded/disputed and still within their access period. */
  active: number;
  /** Distinct active members by email. */
  unique: number;
  optedOut: number;
  noStates: number;
  members: number;
}

/** Only the slice of the Stripe client used here, so tests can pass a fake. */
export type MemberStripe = {
  checkout: { sessions: { list: Stripe["checkout"]["sessions"]["list"] } };
  paymentIntents: { update: Stripe["paymentIntents"]["update"] };
};

const LOOKBACK_MONTHS = 25;

function buyerEmail(s: Stripe.Checkout.Session): string | null {
  return s.customer_details?.email || s.customer_email || s.metadata?.userEmail || null;
}

function paymentIntentOf(s: Stripe.Checkout.Session): Stripe.PaymentIntent | null {
  return s.payment_intent && typeof s.payment_intent === "object" ? s.payment_intent : null;
}

/**
 * Every active member who has saved at least one state and hasn't turned
 * reminders off. One entry per email: the latest qualifying purchase wins
 * (that's also the PaymentIntent /welcome writes preferences to).
 */
export async function listMembersWithPreferences(
  client: MemberStripe | null = stripe,
  now: Date = new Date()
): Promise<{ members: Member[]; stats: MemberListStats }> {
  const stats: MemberListStats = { sessions: 0, active: 0, unique: 0, optedOut: 0, noStates: 0, members: 0 };
  if (!client) throw new Error("Stripe not configured");

  const since = new Date(now);
  since.setUTCMonth(since.getUTCMonth() - LOOKBACK_MONTHS);

  const latest = new Map<string, Stripe.Checkout.Session>();
  const list = client.checkout.sessions.list({
    status: "complete",
    created: { gte: Math.floor(since.getTime() / 1000) },
    limit: 100,
    // latest_charge is needed for sessionAccessEnd's refund/dispute check.
    expand: ["data.payment_intent.latest_charge"],
  });
  for await (const s of list) {
    stats.sessions++;
    if (!isHuntScoutSession(s) || s.payment_status !== "paid") continue;
    const end = sessionAccessEnd(s);
    if (!end || end.getTime() <= now.getTime()) continue;
    const email = buyerEmail(s);
    if (!email || !paymentIntentOf(s)) continue;
    stats.active++;
    const key = normalizeEmail(email);
    const prev = latest.get(key);
    if (!prev || s.created > prev.created) latest.set(key, s);
  }
  stats.unique = latest.size;

  const members: Member[] = [];
  for (const s of latest.values()) {
    const pi = paymentIntentOf(s)!;
    const md = (pi.metadata || {}) as Record<string, string>;
    if (md[REMINDERS_OFF_KEY] === "1") {
      stats.optedOut++;
      continue;
    }
    const prefs = preferencesFromMetadata(md);
    if (!prefs || prefs.states.length === 0) {
      stats.noStates++;
      continue;
    }
    members.push({
      email: buyerEmail(s)!.trim(),
      name: s.metadata?.userName || s.customer_details?.name || null,
      states: prefs.states,
      species: prefs.species,
      residency: prefs.residency,
      homeState: prefs.homeState,
      paymentIntentId: pi.id,
      sessionId: s.id,
      accessEnd: sessionAccessEnd(s)!.toISOString(),
    });
  }
  stats.members = members.length;
  members.sort((a, b) => a.email.localeCompare(b.email));
  return { members, stats };
}

/** Every paid HuntScout PaymentIntent bought with this email (any case variant Stripe stored). */
export async function memberPaymentIntents(rawEmail: string, client: MemberStripe | null = stripe): Promise<Stripe.PaymentIntent[]> {
  if (!client) throw new Error("Stripe not configured");
  const found = new Map<string, Stripe.PaymentIntent>();
  for (const e of new Set([normalizeEmail(rawEmail), rawEmail.trim()])) {
    const list = client.checkout.sessions.list({
      customer_details: { email: e },
      status: "complete",
      limit: 100,
      expand: ["data.payment_intent"],
    });
    for await (const s of list) {
      if (!isHuntScoutSession(s) || s.payment_status !== "paid") continue;
      const pi = paymentIntentOf(s);
      if (pi) found.set(pi.id, pi);
    }
  }
  return [...found.values()];
}

/** Turn deadline reminders off (or back on) on all of a member's purchases. Returns how many were updated. */
export async function setRemindersOff(rawEmail: string, off: boolean, client: MemberStripe | null = stripe): Promise<number> {
  if (!client) throw new Error("Stripe not configured");
  const pis = await memberPaymentIntents(rawEmail, client);
  for (const pi of pis) {
    const current = pi.metadata?.[REMINDERS_OFF_KEY] === "1";
    if (current === off) continue;
    // An empty string removes the key in Stripe metadata.
    await client.paymentIntents.update(pi.id, { metadata: { [REMINDERS_OFF_KEY]: off ? "1" : "" } });
  }
  return pis.length;
}
