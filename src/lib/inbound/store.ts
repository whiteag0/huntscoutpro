import "server-only";
import { createHash } from "node:crypto";
import { StoreConflictError, deletePath, getJson, listPaths, putJson } from "@/lib/blob-store";
import { INBOUND_LIMITS } from "@/lib/inbound/config";
import { fitThread, isThreadId, type Thread } from "@/lib/inbound/thread";

// Customer threads in the private Blob store (local folder in dev/tests):
//   inbound/threads/<yyyymmddhhmmss>-<random>.json   one conversation
//   inbound/refs/<sha256(Message-ID)>.json           Message-ID -> thread (dedupe + follow-up matching)
//   inbound/rate/<yyyy-mm-dd>.json                    daily counters for the rate limits
// Keys never contain an email address or a Message-ID in clear.

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export const threadPath = (id: string) => `inbound/threads/${id}.json`;
export const refPath = (messageId: string) => `inbound/refs/${sha(messageId.toLowerCase())}.json`;
const ratePath = (day: string) => `inbound/rate/${day}.json`;

/** Short, stable, non-reversible sender key for counters. */
export const senderKey = (email: string) => sha(`sender|${email.toLowerCase()}`).slice(0, 20);

export async function getThread(id: string): Promise<{ thread: Thread; etag: string } | null> {
  if (!isThreadId(id)) return null;
  const got = await getJson<Thread>(threadPath(id));
  return got ? { thread: got.data, etag: got.etag } : null;
}

export async function createThread(t: Thread): Promise<void> {
  await putJson(threadPath(t.id), fitThread(t), { ifNew: true });
}

/**
 * Read-modify-write with optimistic concurrency. `change` returns the new thread, or null to
 * leave it alone; it may throw to abort. Returns the stored thread (new or unchanged).
 */
export async function updateThread(id: string, change: (t: Thread) => Thread | null, attempts = 5): Promise<Thread> {
  for (let i = 0; ; i++) {
    const cur = await getThread(id);
    if (!cur) throw new Error(`Thread ${id} not found`);
    const next = change(cur.thread);
    if (!next) return cur.thread;
    try {
      const fitted = fitThread(next);
      await putJson(threadPath(id), fitted, { ifMatch: cur.etag });
      return fitted;
    } catch (err) {
      if (err instanceof StoreConflictError && i < attempts - 1) continue;
      throw err;
    }
  }
}

interface RefDoc {
  threadId: string;
  at: string;
}

/** Record that a Message-ID belongs to a thread. False when it was already recorded (a duplicate delivery). */
export async function claimRef(messageId: string, threadId: string): Promise<boolean> {
  try {
    await putJson(refPath(messageId), { threadId, at: new Date().toISOString() } satisfies RefDoc, { ifNew: true });
    return true;
  } catch (err) {
    if (err instanceof StoreConflictError) return false;
    throw err;
  }
}

export async function releaseRef(messageId: string): Promise<void> {
  await deletePath(refPath(messageId)).catch(() => {});
}

/** Thread an earlier Message-ID belongs to, most recent reference first. */
export async function threadForRefs(ids: string[]): Promise<string | null> {
  for (const id of [...ids].reverse().slice(0, 15)) {
    const got = await getJson<RefDoc>(refPath(id)).catch(() => null);
    if (got && isThreadId(got.data.threadId)) return got.data.threadId;
  }
  return null;
}

/** Newest threads first. */
export async function listThreads(limit: number = INBOUND_LIMITS.listThreads): Promise<Thread[]> {
  const paths = (await listPaths("inbound/threads/")).filter((p) => p.endsWith(".json"));
  const newest = paths.sort().reverse().slice(0, limit);
  const out: Thread[] = [];
  // Small batches keep the Blob store happy.
  for (let i = 0; i < newest.length; i += 20) {
    const batch = await Promise.all(newest.slice(i, i + 20).map((p) => getJson<Thread>(p).catch(() => null)));
    for (const b of batch) if (b?.data?.id) out.push(b.data);
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// ------------------------------------------------------------ rate limits

export interface RateDoc {
  day: string;
  total: number;
  drafts: number;
  notices: number;
  ignored: number;
  senders: Record<string, number>;
}

export type RateField = "total" | "drafts" | "notices" | "ignored";

export const utcDay = (now = new Date()) => now.toISOString().slice(0, 10);

/**
 * Count one event against today's limit and say whether it's within it. A storage failure
 * fails closed for drafts/notices (no model call, no email) and open for recording mail.
 */
export async function takeRate(field: RateField, limit: number, sender?: string, senderLimit?: number): Promise<boolean> {
  const day = utcDay();
  for (let i = 0; i < 6; i++) {
    try {
      const cur = await getJson<RateDoc>(ratePath(day));
      const doc: RateDoc = cur?.data ?? { day, total: 0, drafts: 0, notices: 0, ignored: 0, senders: {} };
      if (doc[field] >= limit) return false;
      const key = sender ? senderKey(sender) : null;
      if (key && senderLimit !== undefined && (doc.senders[key] || 0) >= senderLimit) return false;
      const next: RateDoc = { ...doc, [field]: doc[field] + 1, senders: key ? { ...doc.senders, [key]: (doc.senders[key] || 0) + 1 } : doc.senders };
      await putJson(ratePath(day), next, cur ? { ifMatch: cur.etag } : { ifNew: true });
      return true;
    } catch (err) {
      if (err instanceof StoreConflictError) continue;
      console.error("inbound rate counter unavailable:", err instanceof Error ? err.name : "error");
      return field === "total" || field === "ignored";
    }
  }
  return false;
}
