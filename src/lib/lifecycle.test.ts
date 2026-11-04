// Run with: npm test. Pure rules for the daily onboarding check and profile nudges.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NUDGE_KEYS,
  ONBOARDING_SENT_KEY,
  findLifecycleIssues,
  lifecycleCheckKey,
  nudgeIdempotencyKey,
  selectProfileNudges,
  type PurchaseRecord,
} from "@/lib/lifecycle";
import { ONBOARDED_AT_KEY, PREFS_NOTIFY_ERROR_KEY } from "@/lib/preferences";
import { REPORT_ERROR_KEY, REPORT_PENDING_KEY, REPORT_SENT_KEY } from "@/lib/report-trigger";

const NOW = Date.parse("2026-11-04T15:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const iso = (ms: number) => new Date(ms).toISOString();

let n = 0;
function rec(o: { email?: string; ageMs: number; md?: Record<string, string>; revoked?: boolean }): PurchaseRecord {
  n++;
  return {
    sessionId: `cs_test_${n}`,
    paymentIntentId: `pi_test_${n}`,
    email: o.email ?? `member${n}@example.test`,
    name: null,
    paidAtMs: NOW - o.ageMs,
    revoked: !!o.revoked,
    metadata: o.md ?? {},
  };
}
const onboarded = (ageMs: number) => ({ [ONBOARDING_SENT_KEY]: iso(NOW - ageMs + 60_000) });
const kinds = (rs: PurchaseRecord[]) => findLifecycleIssues(rs, NOW).map((i) => `${i.kind}:${i.record.paymentIntentId}`);

test("missing onboarding is reported for purchases 30 min to 48 h old", () => {
  const fresh = rec({ ageMs: 10 * 60_000 });
  const missing = rec({ ageMs: 5 * HOUR });
  const done = rec({ ageMs: 5 * HOUR, md: onboarded(5 * HOUR) });
  const old = rec({ ageMs: 50 * HOUR });
  const refunded = rec({ ageMs: 5 * HOUR, revoked: true });
  const beforeLaunch = { ...rec({ ageMs: HOUR }), paidAtMs: Date.parse("2026-10-01T00:00:00Z") };
  assert.deepEqual(kinds([fresh, missing, done, old, refunded, beforeLaunch]), [`no-onboarding:${missing.paymentIntentId}`]);
});

test("a report queued by a form save and not sent after an hour is reported, with the last error", () => {
  const prefs = { hs_pref_states: "colorado", hs_pref_species: "elk" };
  const saved = (agoMs: number) => ({ ...prefs, [ONBOARDED_AT_KEY]: iso(NOW - agoMs), [REPORT_PENDING_KEY]: iso(NOW - agoMs) });
  const waiting = rec({ ageMs: 10 * HOUR, md: { ...onboarded(10 * HOUR), ...saved(20 * 60_000) } });
  const failed = rec({
    ageMs: 10 * HOUR,
    md: { ...onboarded(10 * HOUR), ...saved(3 * HOUR), [REPORT_ERROR_KEY]: `${iso(NOW - 3 * HOUR + 5000)} Resend 500 boom` },
  });
  // Queued, then nothing at all (the function died before it could stamp an error).
  const silent = rec({ ageMs: 10 * HOUR, md: { ...onboarded(10 * HOUR), ...saved(3 * HOUR) } });
  const sent = rec({ ageMs: 10 * HOUR, md: { ...onboarded(10 * HOUR), ...saved(3 * HOUR), [REPORT_SENT_KEY]: iso(NOW - 3 * HOUR + 9000) } });
  // Answers saved before reports existed, re-saved unchanged: no report was due.
  const legacy = rec({ ageMs: 5 * DAY, md: { ...onboarded(5 * DAY), ...prefs, [ONBOARDED_AT_KEY]: iso(NOW - 3 * HOUR) } });
  const skipped = rec({ ageMs: 10 * HOUR, md: { ...onboarded(10 * HOUR), [ONBOARDED_AT_KEY]: iso(NOW - 3 * HOUR) } });
  // Bought 5 days ago, saved the form yesterday: still checked (the save is recent).
  const lateSave = rec({ ageMs: 5 * DAY, md: { ...onboarded(5 * DAY), ...saved(20 * HOUR) } });
  const staleSave = rec({ ageMs: 5 * DAY, md: { ...onboarded(5 * DAY), ...saved(3 * DAY) } });
  // An update queued a new report that failed; the first report and an older error don't hide it.
  const update = rec({
    ageMs: 5 * DAY,
    md: { ...onboarded(5 * DAY), ...saved(2 * HOUR), [REPORT_SENT_KEY]: iso(NOW - 2 * DAY), [REPORT_ERROR_KEY]: `${iso(NOW - 3 * DAY)} old` },
  });
  const issues = findLifecycleIssues([waiting, failed, silent, sent, legacy, skipped, lateSave, staleSave, update], NOW);
  assert.deepEqual(
    issues.map((i) => `${i.kind}:${i.record.paymentIntentId}`).sort(),
    [failed, silent, lateSave, update].map((r) => `no-report:${r.paymentIntentId}`).sort()
  );
  assert.match(issues.find((i) => i.record === failed)!.problem, /Last error: Resend 500 boom/);
  assert.doesNotMatch(issues.find((i) => i.record === update)!.problem, /Last error/);
});

test("a failed owner notification is reported for 48 h, and a cleared stamp isn't", () => {
  const failed = rec({ ageMs: 4 * DAY, md: { ...onboarded(4 * DAY), [PREFS_NOTIFY_ERROR_KEY]: `${iso(NOW - 2 * HOUR)} Resend 429 rate_limit_exceeded` } });
  const cleared = rec({ ageMs: 4 * DAY, md: { ...onboarded(4 * DAY), [PREFS_NOTIFY_ERROR_KEY]: "" } });
  const old = rec({ ageMs: 9 * DAY, md: { ...onboarded(9 * DAY), [PREFS_NOTIFY_ERROR_KEY]: `${iso(NOW - 3 * DAY)} timeout` } });
  const issues = findLifecycleIssues([failed, cleared, old], NOW);
  assert.deepEqual(issues.map((i) => `${i.kind}:${i.record.paymentIntentId}`), [`prefs-notify-failed:${failed.paymentIntentId}`]);
  assert.match(issues[0].problem, /rate_limit_exceeded/);
});

test("the check key changes with the list, not with the run", () => {
  const a = findLifecycleIssues([rec({ ageMs: 5 * HOUR })], NOW);
  const b = findLifecycleIssues([rec({ ageMs: 5 * HOUR })], NOW);
  assert.equal(lifecycleCheckKey(a, "2026-11-04"), lifecycleCheckKey(a, "2026-11-04"));
  assert.notEqual(lifecycleCheckKey(a, "2026-11-04"), lifecycleCheckKey(b, "2026-11-04"));
  assert.notEqual(lifecycleCheckKey(a, "2026-11-04"), lifecycleCheckKey(a, "2026-11-05"));
});

test("nudge 1 from day 3, nudge 2 from day 7, each only once and only without states", () => {
  const day2 = rec({ ageMs: 2 * DAY });
  const day3 = rec({ ageMs: 3 * DAY + HOUR });
  const day3Species = rec({ ageMs: 4 * DAY, md: { hs_pref_species: "elk,mule-deer", [ONBOARDED_AT_KEY]: iso(NOW - DAY) } });
  const day3Done = rec({ ageMs: 4 * DAY, md: { [NUDGE_KEYS[1]]: iso(NOW - DAY) } });
  const day3States = rec({ ageMs: 4 * DAY, md: { hs_pref_states: "wyoming" } });
  const day8 = rec({ ageMs: 8 * DAY, md: { [NUDGE_KEYS[1]]: iso(NOW - 5 * DAY) } });
  // Missed nudge 1 entirely (cron down): gets only nudge 2.
  const day8Missed = rec({ ageMs: 8 * DAY });
  const day8Done = rec({ ageMs: 8 * DAY, md: { [NUDGE_KEYS[2]]: iso(NOW - DAY) } });
  const day11 = rec({ ageMs: 11 * DAY });
  const refunded = rec({ ageMs: 4 * DAY, revoked: true });
  const got = selectProfileNudges([day2, day3, day3Species, day3Done, day3States, day8, day8Missed, day8Done, day11, refunded], NOW);
  assert.deepEqual(
    got.map((g) => `${g.record.paymentIntentId}:${g.step}`).sort(),
    [`${day3.paymentIntentId}:1`, `${day3Species.paymentIntentId}:1`, `${day8.paymentIntentId}:2`, `${day8Missed.paymentIntentId}:2`].sort()
  );
  assert.deepEqual(got.find((g) => g.record === day3Species)!.species, ["elk", "mule-deer"]);
});

test("one nudge per email, on the latest purchase; any purchase with states counts", () => {
  const first = rec({ email: "Pat@Example.test", ageMs: 9 * DAY, md: { [NUDGE_KEYS[1]]: iso(NOW - 5 * DAY) } });
  const second = rec({ email: "pat@example.test", ageMs: 4 * DAY });
  const got = selectProfileNudges([first, second], NOW);
  // The later purchase is in its nudge 1 window, but nudge 2 never went out: the latest purchase decides.
  assert.deepEqual(got.map((g) => `${g.record.paymentIntentId}:${g.step}`), [`${second.paymentIntentId}:1`]);

  const withStates = rec({ email: "sam@example.test", ageMs: 9 * DAY, md: { hs_pref_states: "utah" } });
  const without = rec({ email: "sam@example.test", ageMs: 4 * DAY });
  assert.deepEqual(selectProfileNudges([withStates, without], NOW), []);

  const nudged2 = rec({ email: "lee@example.test", ageMs: 9 * DAY, md: { [NUDGE_KEYS[2]]: iso(NOW - 2 * DAY) } });
  const renewal = rec({ email: "lee@example.test", ageMs: 4 * DAY });
  assert.deepEqual(selectProfileNudges([nudged2, renewal], NOW), []);
});

test("nudge idempotency keys are per purchase and step", () => {
  assert.equal(nudgeIdempotencyKey("pi_1", 1), "hs-nudge1-pi_1");
  assert.notEqual(nudgeIdempotencyKey("pi_1", 1), nudgeIdempotencyKey("pi_1", 2));
});
