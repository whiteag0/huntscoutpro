// Shape of one stored conversation with a customer, and pure helpers on it.

import { INBOUND_LIMITS } from "@/lib/inbound/config";
import type { IgnoreReason, ParsedInbound } from "@/lib/inbound/message";

export const THREAD_SCHEMA = 1;

export type ThreadStatus = "pending" | "sending" | "sent" | "dismissed" | "ignored";

export interface ThreadMessage {
  direction: "in" | "out";
  at: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  /** in: what the customer wrote (quoted history removed). out: the reply we sent (without signature). */
  text: string;
  /** in only: full original text (capped). */
  original?: string;
  attachments?: string[];
  /** Resend id: received email id (in) or sent email id (out). */
  resendId: string | null;
  auth?: ParsedInbound["auth"];
}

export interface DraftContextSummary {
  membership: string;
  /** What the owner sees about membership in the approval email. */
  membershipLine?: string;
  preferences: string | null;
  states: string[];
  species: string[];
  units: string[];
  factsChars: number;
}

export interface Draft {
  /** Bumped on every change; approve links are bound to one revision. */
  rev: number;
  text: string;
  /** Private note from the model to the owner (never sent). */
  note: string;
  source: "ai" | "edited" | "manual";
  status: "ready" | "failed" | "skipped";
  /** Short reason when status isn't ready (no customer data). */
  error?: string;
  model?: string;
  /** Inbound message count the draft answers. */
  basedOn: number;
  updatedAt: string;
  context?: DraftContextSummary;
}

export interface Thread {
  schema: typeof THREAD_SCHEMA;
  id: string;
  status: ThreadStatus;
  ignoredReason?: IgnoreReason;
  customer: { email: string; name: string | null };
  subject: string;
  createdAt: string;
  updatedAt: string;
  messages: ThreadMessage[];
  draft: Draft | null;
  /** Single-use link nonces already spent. */
  usedNonces: string[];
  sendingAt?: string;
  lastError?: string;
  sentCount: number;
  /**
   * Highest draft revision this thread has ever had. A sent reply clears `draft`, so without this
   * the next draft would restart at revision 1: an older, unused approve link would then match it,
   * and its "Reply ready" email would reuse an earlier Resend idempotency key and be refused.
   */
  lastRev?: number;
}

/** Revision for the next draft change: always above every earlier revision of this thread. */
export function nextRev(t: Pick<Thread, "draft" | "lastRev">): number {
  return Math.max(t.draft?.rev ?? 0, t.lastRev ?? 0) + 1;
}

/** Sortable, unguessable id: yyyymmddhhmmss-<16 hex>. */
export function newThreadId(now: Date, random: string): string {
  const stamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${stamp}-${random.slice(0, 16)}`;
}

export const isThreadId = (v: unknown): v is string => typeof v === "string" && /^\d{14}-[0-9a-f]{16}$/.test(v);

export function inboundMessage(p: ParsedInbound): ThreadMessage {
  return {
    direction: "in",
    at: p.receivedAt,
    messageId: p.messageId,
    inReplyTo: p.inReplyTo,
    references: p.references,
    text: p.text,
    original: p.original !== p.text ? p.original : undefined,
    attachments: p.attachments.length ? p.attachments : undefined,
    resendId: p.resendId,
    auth: p.auth,
  };
}

export function newThread(id: string, p: ParsedInbound, now: string): Thread {
  return {
    schema: THREAD_SCHEMA,
    id,
    status: "pending",
    customer: { email: p.fromEmail, name: p.fromName },
    subject: p.subject,
    createdAt: now,
    updatedAt: now,
    messages: [inboundMessage(p)],
    draft: null,
    usedNonces: [],
    sentCount: 0,
  };
}

/** Append a message, keeping the thread under its message and size caps (oldest text trimmed first). */
export function appendMessage(t: Thread, m: ThreadMessage): Thread {
  const messages = [...t.messages, m].slice(-INBOUND_LIMITS.messagesPerThread);
  const next = { ...t, messages, updatedAt: m.at > t.updatedAt ? m.at : t.updatedAt };
  return fitThread(next);
}

export function threadBytes(t: Thread): number {
  return Buffer.byteLength(JSON.stringify(t), "utf8");
}

export function fitThread(t: Thread): Thread {
  let out = { ...t, usedNonces: t.usedNonces.slice(-50), lastRev: Math.max(t.lastRev ?? 0, t.draft?.rev ?? 0) };
  for (let i = 0; i < out.messages.length && threadBytes(out) > INBOUND_LIMITS.threadBytes; i++) {
    const messages = out.messages.map((m, j) => (j === i ? { ...m, original: undefined, text: m.text.slice(0, 1000) } : m));
    out = { ...out, messages };
  }
  return out;
}

export function lastInbound(t: Thread): ThreadMessage | null {
  for (let i = t.messages.length - 1; i >= 0; i--) if (t.messages[i].direction === "in") return t.messages[i];
  return null;
}

export function inboundCount(t: Thread): number {
  return t.messages.filter((m) => m.direction === "in").length;
}

/** All Message-IDs in a thread (ours unknown: Resend assigns them), for matching follow-ups. */
export function threadMessageIds(t: Thread): string[] {
  return t.messages.map((m) => m.messageId).filter((x): x is string => !!x);
}

/** A send that never finished (crashed function) can be retried after this long. */
export const SENDING_STALE_MS = 2 * 60 * 1000;

export function isSendStale(t: Thread, now = Date.now()): boolean {
  return t.status === "sending" && (!t.sendingAt || now - Date.parse(t.sendingAt) > SENDING_STALE_MS);
}

/** Owner-supplied reply text: trimmed, control characters removed, capped. */
export function cleanReplyText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, INBOUND_LIMITS.draftChars);
}
