// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_PREFERENCES, type HuntingPreferences } from "@/lib/preferences-schema";
import {
  REPORT_HASH_KEY,
  REPORT_MIN_INTERVAL_MS,
  REPORT_SENT_KEY,
  reportDecision,
  reportFilename,
  reportIdempotencyKey,
  reportInputHash,
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
