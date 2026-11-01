import "server-only";
import { randomBytes } from "node:crypto";
import { deletePath, getJson, listPaths, putJson, StoreConflictError } from "@/lib/blob-store";
import type { FreeResidency, FreeSignup } from "@/lib/free-reminders-schema";
import { CONFIRM_TTL_MS, subscriberId } from "@/lib/free-reminders-token";

// Free deadline-reminder subscribers, one private JSON object each:
//   free-reminders/<sha256(normalized email)>.json
// Double opt-in: a signup writes a `pending` request; the emailed link applies it.

export const FREE_PREFIX = "free-reminders/";
/** Confirmation emails per address per rolling 24 h (stops anyone mail-bombing an inbox through the form). */
export const MAX_CONFIRM_SENDS_PER_DAY = 3;
/** Never-confirmed signups older than this are deleted by the daily job. */
export const STALE_PENDING_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type FreeStatus = "pending" | "active" | "unsubscribed";

export interface FreePrefs {
  state: string;
  species: string[];
  residency: FreeResidency;
}

export interface PendingRequest extends FreePrefs {
  nonce: string;
  requestedAt: string;
  /** Unix seconds; matches the x= parameter of the confirmation link. */
  expiresSec: number;
}

export interface FreeSubscriber extends FreePrefs {
  v: 1;
  id: string;
  /** As entered (trimmed); the id is derived from the normalized form. */
  email: string;
  /** pending = never confirmed; active = receives digests; unsubscribed = stopped. */
  status: FreeStatus;
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  unsubscribedAt?: string;
  /** Change waiting for its confirmation link (new signup, or new state for an existing subscriber). */
  pending?: PendingRequest;
  /** When confirmation emails were sent, last 24 h only. */
  confirmSends: string[];
  /** Page the signup came from, e.g. "calendar". */
  source?: string;
}

export const subscriberPath = (id: string) => `${FREE_PREFIX}${id}.json`;

export async function getSubscriber(id: string): Promise<FreeSubscriber | null> {
  return (await getJson<FreeSubscriber>(subscriberPath(id)))?.data ?? null;
}

/** Read-modify-write with optimistic concurrency. `fn` returns the new record, or null to leave it. */
async function update<R>(id: string, fn: (cur: FreeSubscriber | null) => { next: FreeSubscriber | null; result: R }): Promise<R> {
  for (let attempt = 0; ; attempt++) {
    const cur = await getJson<FreeSubscriber>(subscriberPath(id));
    const { next, result } = fn(cur?.data ?? null);
    if (!next) return result;
    try {
      await putJson(subscriberPath(id), next, cur ? { ifMatch: cur.etag } : { ifNew: true });
      return result;
    } catch (err) {
      if (err instanceof StoreConflictError && attempt < 3) continue;
      throw err;
    }
  }
}

const samePrefs = (a: FreePrefs, b: FreePrefs) =>
  a.state === b.state && a.residency === b.residency && [...a.species].sort().join(",") === [...b.species].sort().join(",");

export type SignupOutcome =
  /** Send this confirmation link. */
  | { kind: "send"; id: string; nonce: string; expiresSec: number; /** An active subscriber asked for different choices. */ change: boolean }
  /** Already active with exactly these choices: nothing to confirm. */
  | { kind: "unchanged"; id: string }
  /** Too many confirmation emails to this address today. */
  | { kind: "throttled"; id: string };

/** Record a signup as pending and say whether to send a confirmation email. */
export async function requestSubscription(signup: FreeSignup, opts: { now?: number; source?: string } = {}): Promise<SignupOutcome> {
  const now = opts.now ?? Date.now();
  const iso = new Date(now).toISOString();
  const id = subscriberId(signup.email);
  const prefs: FreePrefs = { state: signup.state, species: [...signup.species], residency: signup.residency };

  return update<SignupOutcome>(id, (cur) => {
    if (cur && cur.status === "active" && samePrefs(cur, prefs)) {
      // Drop a stale pending change so the old link can't switch it back later.
      return cur.pending ? { next: { ...cur, pending: undefined, updatedAt: iso }, result: { kind: "unchanged", id } } : { next: null, result: { kind: "unchanged", id } };
    }
    const sends = (cur?.confirmSends || []).filter((t) => now - Date.parse(t) < DAY_MS);
    if (sends.length >= MAX_CONFIRM_SENDS_PER_DAY) return { next: null, result: { kind: "throttled", id } };

    // Same request again while its link is still good for a day: resend the same link.
    const reuse = cur?.pending && samePrefs(cur.pending, prefs) && cur.pending.expiresSec * 1000 - now > DAY_MS ? cur.pending : null;
    const pending: PendingRequest = reuse || {
      ...prefs,
      nonce: randomBytes(12).toString("base64url"),
      requestedAt: iso,
      expiresSec: Math.floor((now + CONFIRM_TTL_MS) / 1000),
    };
    const base: FreeSubscriber = cur
      ? { ...cur, email: cur.status === "active" ? cur.email : signup.email }
      : { v: 1, id, email: signup.email, status: "pending", ...prefs, createdAt: iso, updatedAt: iso, confirmSends: [] };
    const next: FreeSubscriber = {
      ...base,
      // A pending (never confirmed) or unsubscribed record shows the latest request; an active one keeps
      // its current choices until the new link is clicked.
      ...(base.status === "active" ? {} : prefs),
      pending,
      confirmSends: [...sends, iso],
      updatedAt: iso,
      ...(opts.source ? { source: opts.source } : {}),
    };
    return { next, result: { kind: "send", id, nonce: pending.nonce, expiresSec: pending.expiresSec, change: cur?.status === "active" } };
  });
}

export type ConfirmOutcome =
  | { kind: "confirmed"; subscriber: FreeSubscriber }
  /** Link already used; the subscription is active. */
  | { kind: "already"; subscriber: FreeSubscriber }
  /** A newer signup replaced this link, or the subscriber unsubscribed after asking. */
  | { kind: "stale" }
  | { kind: "missing" };

/** Apply the pending request the link was issued for. */
export async function confirmSubscription(id: string, nonce: string, now: number = Date.now()): Promise<ConfirmOutcome> {
  const iso = new Date(now).toISOString();
  return update<ConfirmOutcome>(id, (cur) => {
    if (!cur) return { next: null, result: { kind: "missing" } };
    const p = cur.pending;
    if (!p || p.nonce !== nonce) {
      return { next: null, result: cur.status === "active" && !p ? { kind: "already", subscriber: cur } : { kind: "stale" } };
    }
    if (p.expiresSec * 1000 < now) return { next: null, result: { kind: "stale" } };
    const next: FreeSubscriber = {
      ...cur,
      state: p.state,
      species: p.species,
      residency: p.residency,
      status: "active",
      confirmedAt: iso,
      unsubscribedAt: undefined,
      pending: undefined,
      updatedAt: iso,
    };
    return { next, result: { kind: "confirmed", subscriber: next } };
  });
}

export type UnsubscribeOutcome = { kind: "unsubscribed"; subscriber: FreeSubscriber } | { kind: "missing" };

export async function unsubscribeSubscriber(id: string, now: number = Date.now()): Promise<UnsubscribeOutcome> {
  const iso = new Date(now).toISOString();
  return update<UnsubscribeOutcome>(id, (cur) => {
    if (!cur) return { next: null, result: { kind: "missing" } };
    if (cur.status === "unsubscribed" && !cur.pending) return { next: null, result: { kind: "unsubscribed", subscriber: cur } };
    const next: FreeSubscriber = { ...cur, status: "unsubscribed", unsubscribedAt: iso, pending: undefined, updatedAt: iso };
    return { next, result: { kind: "unsubscribed", subscriber: next } };
  });
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Every stored subscriber record (any status). */
export async function listSubscribers(): Promise<FreeSubscriber[]> {
  const paths = (await listPaths(FREE_PREFIX)).filter((p) => /^free-reminders\/[0-9a-f]{64}\.json$/.test(p));
  const rows = await mapLimit(paths, 16, async (p) => (await getJson<FreeSubscriber>(p))?.data ?? null);
  return rows.filter((r): r is FreeSubscriber => !!r && r.v === 1);
}

/** Never-confirmed signups past STALE_PENDING_MS: nothing to keep them for. */
export function isStalePending(s: FreeSubscriber, now: number = Date.now()): boolean {
  return s.status === "pending" && !s.confirmedAt && now - Date.parse(s.updatedAt) > STALE_PENDING_MS;
}

export async function deleteSubscriber(id: string): Promise<void> {
  await deletePath(subscriberPath(id));
}
