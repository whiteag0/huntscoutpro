import "server-only";
import { createHash } from "node:crypto";
import { normalizeEmail } from "@/lib/entitlement";
import { SITE, type RenderedEmail } from "@/lib/emails/onboarding";
import { freeRemindersEmail } from "@/lib/emails/free-reminders";
import { computeDueReminders, groupReminders, type DigestGroup, type DueReminder, type ReminderMember, type ReminderState } from "@/lib/reminders";
import type { FreeSubscriber } from "@/lib/free-reminders-store";
import { freeUnsubscribeUrl } from "@/lib/free-reminders-token";

// Which free subscribers get a digest today. Same computeDueReminders() rules
// as Pro members (14 and 3 days before a deadline, and the day a window opens),
// limited to the subscriber's one state.

export interface FreeDigest {
  subscriber: FreeSubscriber;
  items: DueReminder[];
  groups: DigestGroup[];
  email: RenderedEmail;
  unsubscribeUrl: string;
  idempotencyKey: string;
  headers: Record<string, string>;
}

export interface FreeSelectionStats {
  /** Stored records of any status. */
  freeRecords: number;
  freeActive: number;
  freePending: number;
  freeUnsubscribed: number;
  /** Active free subscribers skipped because Pro reminders already cover their email. */
  freeSkippedPro: number;
  /** Active subscribers whose state has no live agency data (state retired). */
  freeNoState: number;
  freeWithDue: number;
}

/** Resend idempotency key: one free digest per address per Mountain Time day (distinct from the Pro key). */
export function freeReminderIdempotencyKey(email: string, today: string): string {
  return `hs-free-remind-${createHash("sha256").update(`${normalizeEmail(email)}|${today}`).digest("hex")}`;
}

/** A free subscriber as a reminder "member" with exactly one state. */
export function freeSubscriberAsMember(s: FreeSubscriber): ReminderMember {
  return { email: s.email, name: null, states: [s.state], species: s.species, residency: s.residency, homeState: "" };
}

export function buildFreeDigest(s: FreeSubscriber, states: readonly ReminderState[], today: string, base: string = SITE): FreeDigest | null {
  const st = states.find((x) => x.slug === s.state);
  if (!st) return null;
  const items = computeDueReminders(freeSubscriberAsMember(s), [st], today);
  if (items.length === 0) return null;
  const groups = groupReminders(items);
  const unsub = freeUnsubscribeUrl(s.id, base);
  return {
    subscriber: s,
    items,
    groups,
    email: freeRemindersEmail({ stateName: st.name, groups, unsubscribeUrl: unsub }),
    unsubscribeUrl: unsub,
    idempotencyKey: freeReminderIdempotencyKey(s.email, today),
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/**
 * Today's free digests. `coveredByPro` holds normalized emails that already get
 * Pro reminders (active members with saved states and reminders on); those
 * addresses are skipped so nobody gets two emails for the same dates.
 */
export function selectFreeDigests(
  subscribers: readonly FreeSubscriber[],
  opts: { coveredByPro: ReadonlySet<string>; states: readonly ReminderState[]; today: string; base?: string }
): { digests: FreeDigest[]; stats: FreeSelectionStats } {
  const stats: FreeSelectionStats = {
    freeRecords: subscribers.length,
    freeActive: 0,
    freePending: 0,
    freeUnsubscribed: 0,
    freeSkippedPro: 0,
    freeNoState: 0,
    freeWithDue: 0,
  };
  const live = new Set(opts.states.map((s) => s.slug));
  const digests: FreeDigest[] = [];
  const seen = new Set<string>();
  for (const s of subscribers) {
    if (s.status === "pending") stats.freePending++;
    if (s.status === "unsubscribed") stats.freeUnsubscribed++;
    if (s.status !== "active") continue;
    stats.freeActive++;
    const key = normalizeEmail(s.email);
    if (seen.has(key)) continue;
    seen.add(key);
    if (opts.coveredByPro.has(key)) {
      stats.freeSkippedPro++;
      continue;
    }
    if (!live.has(s.state)) {
      stats.freeNoState++;
      continue;
    }
    const d = buildFreeDigest(s, opts.states, opts.today, opts.base);
    if (d) digests.push(d);
  }
  stats.freeWithDue = digests.length;
  digests.sort((a, b) => a.subscriber.email.localeCompare(b.subscriber.email));
  return { digests, stats };
}
