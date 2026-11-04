// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_PREFERENCES, type HuntingPreferences } from "@/lib/preferences-schema";
import {
  REPORT_ERROR_KEY,
  REPORT_HASH_KEY,
  REPORT_MIN_INTERVAL_MS,
  REPORT_PENDING_KEY,
  REPORT_PENDING_MS,
  REPORT_SENT_KEY,
  reportDecision,
  reportFilename,
  reportIdempotencyKey,
  reportInputHash,
  reportStatus,
} from "@/lib/report-trigger";

const prefs = (p: Partial<HuntingPreferences> = {}): HuntingPreferences => ({ ...EMPTY_PREFERENCES, states: ["colorado"], species: ["elk"], ...p });
const NOW = Date.parse("2026-11-04T18:00:00Z");

test("the hash follows the answers that change the report, not goals or notes", () => {
  const base = reportInputHash(prefs({ units: "GMU 61", goals: ["meat"], notes: "hi" }));
  assert.equal(reportInputHash(prefs({ units: "gmu  61", goals: ["trophy"], notes: "something else" })), base);
  assert.equal(reportInputHash(prefs({ states: ["colorado"], species: ["elk"], units: "GMU 61" })), base);
  assert.notEqual(reportInputHash(prefs({ units: "GMU 62" })), base);
  assert.notEqual(reportInputHash(prefs({ units: "GMU 61" }), { "colorado.elk": 4 }), base);
  // List order doesn't matter.
  assert.equal(reportInputHash(prefs({ states: ["wyoming", "colorado"] })), reportInputHash(prefs({ states: ["colorado", "wyoming"] })));
});

test("first save sends; nothing to report without a state or species", () => {
  const hash = reportInputHash(prefs());
  assert.equal(reportDecision({ prefs: prefs(), metadata: {}, hash, nowMs: NOW }), "send");
  assert.equal(reportDecision({ prefs: null, metadata: {}, hash, nowMs: NOW }), "nothing-to-report");
  assert.equal(reportDecision({ prefs: prefs({ states: [], species: [] }), metadata: {}, hash, nowMs: NOW }), "nothing-to-report");
});

test("later saves send only on a material change, at most once a day", () => {
  const hash = reportInputHash(prefs());
  const sentAt = new Date(NOW - 60 * 60 * 1000).toISOString();
  const md = { [REPORT_SENT_KEY]: sentAt, [REPORT_HASH_KEY]: hash };
  assert.equal(reportDecision({ prefs: prefs(), metadata: md, hash, nowMs: NOW }), "unchanged");
  const changed = reportInputHash(prefs({ units: "GMU 61" }));
  assert.equal(reportDecision({ prefs: prefs({ units: "GMU 61" }), metadata: md, hash: changed, nowMs: NOW }), "too-soon");
  assert.equal(reportDecision({ prefs: prefs({ units: "GMU 61" }), metadata: md, hash: changed, nowMs: NOW + REPORT_MIN_INTERVAL_MS }), "send");
  // Unchanged answers never resend, however long ago.
  assert.equal(reportDecision({ prefs: prefs(), metadata: md, hash, nowMs: NOW + 30 * REPORT_MIN_INTERVAL_MS }), "unchanged");
  // An admin can force it.
  assert.equal(reportDecision({ prefs: prefs(), metadata: md, hash, nowMs: NOW, force: true }), "send");
});

test("a failed send leaves no sent marker, so the next save retries", () => {
  const hash = reportInputHash(prefs());
  assert.equal(reportDecision({ prefs: prefs(), metadata: { hs_report_error: "2026-11-04 Resend 500" }, hash, nowMs: NOW }), "send");
  assert.equal(reportDecision({ prefs: prefs(), metadata: { [REPORT_SENT_KEY]: "garbage" }, hash, nowMs: NOW }), "send");
});

test("a queued send blocks another until it finishes, fails or goes stale", () => {
  const hash = reportInputHash(prefs());
  const pending = new Date(NOW - 30_000).toISOString();
  assert.equal(reportDecision({ prefs: prefs(), metadata: { [REPORT_PENDING_KEY]: pending }, hash, nowMs: NOW }), "in-progress");
  // A different answer saved right after is held too (at most one report in flight).
  assert.equal(reportDecision({ prefs: prefs({ units: "GMU 61" }), metadata: { [REPORT_PENDING_KEY]: pending }, hash: "other", nowMs: NOW }), "in-progress");
  // It failed: the next save retries.
  assert.equal(reportDecision({ prefs: prefs(), metadata: { [REPORT_PENDING_KEY]: pending, [REPORT_ERROR_KEY]: `${new Date(NOW - 10_000).toISOString()} Resend 500` }, hash, nowMs: NOW }), "send");
  // It went out: the usual rules apply.
  assert.equal(reportDecision({ prefs: prefs(), metadata: { [REPORT_PENDING_KEY]: pending, [REPORT_SENT_KEY]: new Date(NOW - 10_000).toISOString(), [REPORT_HASH_KEY]: hash }, hash, nowMs: NOW }), "unchanged");
  // The function died without a trace: retried once the marker is stale, even with the same answers.
  assert.equal(reportDecision({ prefs: prefs(), metadata: { [REPORT_PENDING_KEY]: pending }, hash, previousHash: hash, nowMs: NOW + REPORT_PENDING_MS }), "send");
});

test("members who answered before automatic reports: unchanged answers don't send one, changed answers do", () => {
  const hash = reportInputHash(prefs());
  assert.equal(reportDecision({ prefs: prefs(), metadata: {}, hash, previousHash: hash, nowMs: NOW }), "unchanged");
  assert.equal(reportDecision({ prefs: prefs({ units: "GMU 61" }), metadata: {}, hash: reportInputHash(prefs({ units: "GMU 61" })), previousHash: hash, nowMs: NOW }), "send");
  // A first send that failed is retried even when the answers are the same.
  assert.equal(reportDecision({ prefs: prefs(), metadata: { [REPORT_ERROR_KEY]: "2026-11-04T17:00:00.000Z Resend 500" }, hash, previousHash: hash, nowMs: NOW }), "send");
});

test("idempotency keys repeat for a retry and change for a new send", () => {
  const k = reportIdempotencyKey("pi_123", "abc", undefined);
  assert.equal(reportIdempotencyKey("PI_123 ", "abc", undefined), k);
  assert.match(k, /^hs-report-[0-9a-f]{40}$/);
  assert.notEqual(reportIdempotencyKey("pi_123", "abd", undefined), k);
  assert.notEqual(reportIdempotencyKey("pi_123", "abc", "2026-11-01T00:00:00.000Z"), k);
  const forced = reportIdempotencyKey("pi_123", "abc", undefined, true, NOW);
  assert.notEqual(forced, k);
  assert.equal(reportIdempotencyKey("pi_123", "abc", undefined, true, NOW + 60_000), forced);
});

test("filenames are safe and fall back without a name", () => {
  assert.equal(reportFilename("Jordan O'Neil"), "HuntScout Pro - Scouting Report - Jordan O'Neil.pdf");
  assert.equal(reportFilename('Bad "name" <x>/\\'), "HuntScout Pro - Scouting Report - Bad name x.pdf");
  assert.equal(reportFilename(null), "HuntScout Pro - Scouting Report.pdf");
  assert.equal(reportFilename("José Núñez"), "HuntScout Pro - Scouting Report - Jose Nunez.pdf");
});

test("reportStatus: when the last report went out, and whether one is on its way", () => {
  const at = (ms: number) => new Date(NOW - ms).toISOString();
  assert.deepEqual(reportStatus({}, NOW), { sentAt: null, pending: false });
  assert.deepEqual(reportStatus({ [REPORT_SENT_KEY]: at(86_400_000) }, NOW), { sentAt: at(86_400_000), pending: false });
  assert.deepEqual(reportStatus({ [REPORT_PENDING_KEY]: at(30_000) }, NOW), { sentAt: null, pending: true });
  // Queued after the last one went out: on its way again.
  assert.deepEqual(reportStatus({ [REPORT_SENT_KEY]: at(86_400_000), [REPORT_PENDING_KEY]: at(30_000) }, NOW), { sentAt: at(86_400_000), pending: true });
  // Finished, failed, or stale: no longer pending.
  assert.equal(reportStatus({ [REPORT_PENDING_KEY]: at(30_000), [REPORT_SENT_KEY]: at(10_000) }, NOW).pending, false);
  assert.equal(reportStatus({ [REPORT_PENDING_KEY]: at(30_000), [REPORT_ERROR_KEY]: `${at(10_000)} Resend 500` }, NOW).pending, false);
  assert.equal(reportStatus({ [REPORT_PENDING_KEY]: at(REPORT_PENDING_MS) }, NOW).pending, false);
  assert.equal(reportStatus({ [REPORT_SENT_KEY]: "garbage" }, NOW).sentAt, null);
});
