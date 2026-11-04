// When to email a member their personal scouting report, and how to make the send
// idempotent. Pure functions (plus node:crypto) so the rules are unit tested.
//
// The durable record lives on the purchase's PaymentIntent metadata next to the
// member's preferences: when the last report went out and a hash of the answers
// it was built from. A report goes out the first time the /welcome form is saved,
// and again only when the answers that shape it change, at most once per 24 h.
import { createHash } from "node:crypto";
import type { HuntingPreferences } from "@/lib/preferences-schema";
import { serializePoints, type PointsMap } from "@/lib/points-schema";

export const REPORT_SENT_KEY = "hs_report_sent_at";
export const REPORT_HASH_KEY = "hs_report_hash";
export const REPORT_EMAIL_ID_KEY = "hs_report_email_id";
export const REPORT_ERROR_KEY = "hs_report_error";
/** Stamped with the preferences when a send is queued: blocks a second send while the first is in flight. */
export const REPORT_PENDING_KEY = "hs_report_pending_at";

/** How long a queued send blocks another one (longer than the function's time limit). */
export const REPORT_PENDING_MS = 10 * 60 * 1000;

/** Minimum time between two automatic reports for the same member. */
export const REPORT_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Hash of the answers that change the report (states, residency, home state, species,
 * units, methods, points and saved point balances). Goals and notes don't change any
 * figure, so editing only those doesn't send a new report.
 */
export function reportInputHash(prefs: HuntingPreferences, savedPoints: PointsMap = {}): string {
  const norm = (xs: readonly string[]) => [...xs].map((x) => x.trim().toLowerCase()).sort();
  const text = (v: string) => v.replace(/\s+/g, " ").trim().toLowerCase();
  const material = {
    states: norm(prefs.states),
    residency: prefs.residency,
    home: prefs.homeState.toUpperCase(),
    species: norm(prefs.species),
    units: text(prefs.units),
    methods: norm(prefs.methods),
    points: text(prefs.points),
    saved: serializePoints(savedPoints),
  };
  return createHash("sha256").update(JSON.stringify(material)).digest("hex").slice(0, 32);
}

export type ReportDecision = "send" | "unchanged" | "too-soon" | "in-progress" | "nothing-to-report";

/** The time at the start of a stamp ("2026-11-04T18:00:00.000Z" or "2026-11-04T18:00:00.000Z Resend 500 ..."). */
function stampTime(v: string | undefined): number {
  return Date.parse((v || "").split(" ")[0]);
}

/** A send queued moments ago (a double submit, or a quick second edit) that hasn't finished or failed yet. */
function inFlight(metadata: Record<string, string | undefined>, nowMs: number): boolean {
  const sentAt = stampTime(metadata[REPORT_SENT_KEY]);
  const pendingAt = stampTime(metadata[REPORT_PENDING_KEY]);
  const errorAt = stampTime(metadata[REPORT_ERROR_KEY]);
  return !Number.isNaN(pendingAt) && nowMs - pendingAt < REPORT_PENDING_MS && !(sentAt >= pendingAt) && !(errorAt >= pendingAt);
}

/** Where the member's report stands, for member home: when the last one was emailed, and whether one is on its way. */
export function reportStatus(metadata: Record<string, string | undefined>, nowMs: number): { sentAt: string | null; pending: boolean } {
  const sentAt = stampTime(metadata[REPORT_SENT_KEY]);
  return { sentAt: Number.isNaN(sentAt) ? null : new Date(sentAt).toISOString(), pending: inFlight(metadata, nowMs) };
}

/**
 * Whether saving the form should send a report now.
 * `metadata` is the PaymentIntent's metadata before this save (empty for members without one).
 * `previousHash` is reportInputHash() of the answers saved before this save, when there were any.
 */
export function reportDecision(opts: {
  prefs: HuntingPreferences | null;
  metadata: Record<string, string | undefined>;
  hash: string;
  nowMs: number;
  previousHash?: string | null;
  force?: boolean;
}): ReportDecision {
  const { prefs, metadata, hash, nowMs, previousHash, force } = opts;
  if (!prefs || (prefs.states.length === 0 && prefs.species.length === 0)) return "nothing-to-report";
  if (force) return "send";
  const sentAt = stampTime(metadata[REPORT_SENT_KEY]);
  const pendingAt = stampTime(metadata[REPORT_PENDING_KEY]);
  const errorAt = stampTime(metadata[REPORT_ERROR_KEY]);
  if (inFlight(metadata, nowMs)) return "in-progress";
  if (Number.isNaN(sentAt)) {
    // Answers saved before automatic reports existed (no report marker of any kind): re-saving them
    // unchanged doesn't send one; changing them does, as for any member.
    if (previousHash && previousHash === hash && Number.isNaN(pendingAt) && Number.isNaN(errorAt)) return "unchanged";
    return "send";
  }
  if (metadata[REPORT_HASH_KEY] === hash) return "unchanged";
  if (nowMs - sentAt < REPORT_MIN_INTERVAL_MS) return "too-soon";
  return "send";
}

/**
 * Resend Idempotency-Key for one report send: the same member, answers and previous
 * send always give the same key, so a retry or a double submit within Resend's 24 h
 * window can't deliver a second copy, while a later material update gets a new key.
 */
export function reportIdempotencyKey(memberId: string, hash: string, previousSentAt: string | undefined, force = false, nowMs = Date.now()): string {
  // A forced resend by an admin is a new send; bucket it by the hour so a double click still dedupes.
  const forced = force ? `|force|${Math.floor(nowMs / 3_600_000)}` : "";
  const digest = createHash("sha256").update(`${memberId.trim().toLowerCase()}|${hash}|${previousSentAt || "first"}${forced}`).digest("hex");
  return `hs-report-${digest.slice(0, 40)}`;
}

/** "HuntScout Pro - Scouting Report - Jordan Smith.pdf", safe for any mail client. */
export function reportFilename(name: string | null | undefined): string {
  const clean = (name || "")
    .normalize("NFKD")
    .replace(/[^\w .'-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return clean ? `HuntScout Pro - Scouting Report - ${clean}.pdf` : "HuntScout Pro - Scouting Report.pdf";
}
