import "server-only";
import { createHash } from "node:crypto";
import { normalizeEmail } from "@/lib/entitlement";
import { remindersEmail } from "@/lib/emails/reminders";
import type { RenderedEmail } from "@/lib/emails/onboarding";
import { computeDueReminders, groupReminders, type DigestGroup, type DueReminder, type ReminderMember, type ReminderState } from "@/lib/reminders";
import { unsubscribeUrl } from "@/lib/reminder-unsubscribe";

export interface Digest {
  items: DueReminder[];
  groups: DigestGroup[];
  email: RenderedEmail;
  unsubscribeUrl: string;
  idempotencyKey: string;
  headers: Record<string, string>;
}

/** Resend idempotency key: one digest per member per Mountain Time day. */
export function reminderIdempotencyKey(email: string, today: string): string {
  return `hs-remind-${createHash("sha256").update(`${normalizeEmail(email)}|${today}`).digest("hex")}`;
}

/** The digest a member gets today, or null when nothing is due. */
export function buildDigest(member: ReminderMember, states: readonly ReminderState[], today: string): Digest | null {
  const items = computeDueReminders(member, states, today);
  if (items.length === 0) return null;
  const groups = groupReminders(items);
  const unsub = unsubscribeUrl(member.email);
  return {
    items,
    groups,
    email: remindersEmail({ name: member.name, groups, unsubscribeUrl: unsub }),
    unsubscribeUrl: unsub,
    idempotencyKey: reminderIdempotencyKey(member.email, today),
    // RFC 8058 one-click unsubscribe (Gmail / Yahoo bulk-sender rules).
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** A YYYY-MM-DD that is a real calendar date, else null. */
export function parseIsoDay(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}
