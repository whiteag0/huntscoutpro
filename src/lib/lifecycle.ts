// Rules for the daily lifecycle pass (run by the deadline-reminders cron): which recent
// purchases the owner should hear about because onboarding didn't finish, and which
// members get a "finish your hunting profile" nudge. Pure functions over a list of
// purchases read from Stripe (src/lib/members.ts listRecentPurchases), so they're unit tested.
import { createHash } from "node:crypto";
import { normalizeEmail } from "@/lib/entitlement";
import { ONBOARDED_AT_KEY, PREFS_NOTIFY_ERROR_KEY, preferencesFromMetadata } from "@/lib/preferences";
import { REPORT_ERROR_KEY, REPORT_SENT_KEY } from "@/lib/report-trigger";

/** Purchases before this were onboarded by hand; never email them automatically. */
export const ONBOARDING_SINCE = Date.parse("2026-10-08T00:00:00Z");
/** Stamped on the PaymentIntent once both onboarding emails are accepted. */
export const ONBOARDING_SENT_KEY = "hs_onboarding_sent_at";
/** Stamped once the owner's "New HuntScout Pro purchase" email is accepted. */
export const PURCHASE_ALERT_KEY = "hs_purchase_alert_at";
/** Stamped when each "finish your hunting profile" nudge is accepted. */
export const NUDGE_KEYS = { 1: "hs_profile_nudge1_at", 2: "hs_profile_nudge2_at" } as const;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** The daily check reports purchases (and form saves, failures) from this far back. */
export const CHECK_WINDOW_MS = 48 * HOUR;
/** Leave the webhook this long before calling a purchase's onboarding missing. */
export const ONBOARDING_GRACE_MS = 30 * 60 * 1000;
/** A saved form with no report this long after is reported. */
export const REPORT_GRACE_MS = HOUR;
/** Nudge 1 goes out from day 3, nudge 2 from day 7; each has 3 days to catch a missed cron run. */
export const NUDGE_AFTER_MS = { 1: 3 * DAY, 2: 7 * DAY } as const;
const NUDGE_CATCH_UP_MS = 3 * DAY;
/** How far back the daily pass needs purchases (the last nudge window). */
export const LIFECYCLE_LOOKBACK_MS = NUDGE_AFTER_MS[2] + NUDGE_CATCH_UP_MS;

/** One paid HuntScout checkout, as the lifecycle rules need it. */
export interface PurchaseRecord {
  sessionId: string;
  paymentIntentId: string;
  email: string;
  name: string | null;
  /** When the payment was made (PaymentIntent created), ms. */
  paidAtMs: number;
  /** Refunded or disputed: no longer a member. */
  revoked: boolean;
  metadata: Record<string, string>;
}

export type IssueKind = "no-onboarding" | "no-report" | "prefs-notify-failed";

export interface LifecycleIssue {
  kind: IssueKind;
  record: PurchaseRecord;
  /** Plain-English line for the owner's email. */
  problem: string;
}

/** The time at the start of a stamp ("2026-11-04T18:00:00.000Z" or "2026-11-04T18:00:00.000Z Resend 500 ..."). */
function stampTime(v: string | undefined): number {
  return Date.parse((v || "").split(" ")[0]);
}

/** The message after a stamp's time, if any. */
function stampMessage(v: string | undefined): string {
  return (v || "").split(" ").slice(1).join(" ").trim();
}

function counts(r: PurchaseRecord): boolean {
  return !r.revoked && r.paidAtMs >= ONBOARDING_SINCE;
}

/**
 * Problems the owner should hear about, oldest first:
 * - paid in the last 48 h, over 30 min ago, and the onboarding emails were never stamped as sent;
 * - the /welcome form was saved in the last 48 h, over an hour ago, and no report was ever sent;
 * - the owner's copy of a form save failed (after a retry) in the last 48 h.
 */
export function findLifecycleIssues(records: readonly PurchaseRecord[], nowMs: number): LifecycleIssue[] {
  const issues: LifecycleIssue[] = [];
  const recent = (t: number) => !Number.isNaN(t) && nowMs - t <= CHECK_WINDOW_MS;
  for (const r of [...records].sort((a, b) => a.paidAtMs - b.paidAtMs)) {
    if (!counts(r)) continue;
    const md = r.metadata;
    if (recent(r.paidAtMs) && nowMs - r.paidAtMs > ONBOARDING_GRACE_MS && !md[ONBOARDING_SENT_KEY]) {
      issues.push({
        kind: "no-onboarding",
        record: r,
        problem: "Welcome emails not sent. Automatic sending stops 20 hours after payment, so send them by hand.",
      });
    }
    const prefs = preferencesFromMetadata(md);
    const savedAt = stampTime(md[ONBOARDED_AT_KEY]);
    if (prefs && (prefs.states.length || prefs.species.length) && recent(savedAt) && nowMs - savedAt > REPORT_GRACE_MS && !md[REPORT_SENT_KEY]) {
      const why = stampMessage(md[REPORT_ERROR_KEY]);
      issues.push({
        kind: "no-report",
        record: r,
        problem: `Hunting profile saved, but no scouting report was sent.${why ? ` Last error: ${why.slice(0, 200)}` : ""}`,
      });
    }
    const notifyFailed = md[PREFS_NOTIFY_ERROR_KEY];
    if (notifyFailed && recent(stampTime(notifyFailed))) {
      const why = stampMessage(notifyFailed);
      issues.push({
        kind: "prefs-notify-failed",
        record: r,
        problem: `Your copy of their hunting profile answers didn't send.${why ? ` Error: ${why.slice(0, 200)}` : ""} See their answers in the PaymentIntent metadata.`,
      });
    }
  }
  return issues;
}

/** Resend Idempotency-Key for the owner's check email: one per day per distinct list. */
export function lifecycleCheckKey(issues: readonly LifecycleIssue[], today: string): string {
  const material = issues.map((i) => `${i.kind}|${i.record.paymentIntentId}`).join(",");
  return `hs-check-${today}-${createHash("sha256").update(material).digest("hex").slice(0, 24)}`;
}

export interface ProfileNudge {
  record: PurchaseRecord;
  step: 1 | 2;
  /** Species already in the profile (they picked some but no state). */
  species: string[];
}

/**
 * Members to nudge today: their profile has no states, and their purchase is 3 to 6 days
 * old (nudge 1) or 7 to 9 days old (nudge 2), and that nudge hasn't gone out. One per
 * email, on their latest purchase. A member past day 7 who missed nudge 1 gets only nudge 2.
 * Reminder opt-outs are checked by the caller (they can be on any of a member's purchases).
 */
export function selectProfileNudges(records: readonly PurchaseRecord[], nowMs: number): ProfileNudge[] {
  const byEmail = new Map<string, PurchaseRecord[]>();
  for (const r of records) {
    if (!counts(r)) continue;
    const key = normalizeEmail(r.email);
    byEmail.set(key, [...(byEmail.get(key) || []), r]);
  }
  const nudges: ProfileNudge[] = [];
  for (const list of byEmail.values()) {
    if (list.some((r) => (preferencesFromMetadata(r.metadata)?.states.length ?? 0) > 0)) continue;
    const latest = list.reduce((a, b) => (b.paidAtMs > a.paidAtMs ? b : a));
    const age = nowMs - latest.paidAtMs;
    const step = age >= NUDGE_AFTER_MS[2] ? 2 : age >= NUDGE_AFTER_MS[1] ? 1 : null;
    if (!step || age >= NUDGE_AFTER_MS[step] + NUDGE_CATCH_UP_MS) continue;
    if (latest.metadata[NUDGE_KEYS[step]]) continue;
    // Nudge 2 already went out on another purchase of theirs? Never send nudge 1 after it.
    if (list.some((r) => r.metadata[NUDGE_KEYS[2]])) continue;
    nudges.push({ record: latest, step, species: preferencesFromMetadata(latest.metadata)?.species ?? [] });
  }
  return nudges.sort((a, b) => a.record.email.localeCompare(b.record.email));
}

/** Resend Idempotency-Key for one nudge (the PaymentIntent marker is the durable guard). */
export function nudgeIdempotencyKey(paymentIntentId: string, step: 1 | 2): string {
  return `hs-nudge${step}-${paymentIntentId}`;
}
