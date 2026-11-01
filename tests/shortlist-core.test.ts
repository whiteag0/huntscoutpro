// Classification tests for the "Where can I draw?" shortlist, on hand-made rows.
// Run: npm run test:shortlist
//   (node --experimental-strip-types --import ./tests/register.mjs --test tests/shortlist-core.test.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DrawRecord, HarvestRecord } from "../src/data/agency/schema";
import { classifyHunt, classifyState, compareHunts, huntsForYear, pickHarvest, resultsYear, type ShortlistHunt } from "../src/lib/shortlist-core";

function draw(code: string, extra: Partial<DrawRecord> = {}): DrawRecord {
  return { species: "elk", year: 2026, huntCode: code, units: ["10"], description: `Hunt ${code}`, choice: "first", sourceId: "d-test", ...extra };
}

const pts = (...rows: [number, number, number][]) => rows.map(([points, applicants, drawn]) => ({ points, nonresident: { applicants, drawn } }));

function hunt(r: ReturnType<typeof classifyHunt>): ShortlistHunt {
  assert.ok("hunt" in r, `expected a hunt, got ${JSON.stringify(r)}`);
  return r.hunt;
}

test("drew at your exact point level uses the agency's point table", () => {
  const r = draw("A", { nonresident: { applicants: 100, drawn: 10, minPoints: 4 }, byPoints: pts([5, 4, 3], [4, 20, 1], [3, 76, 0]) });
  const h = hunt(classifyHunt(r, "nonresident", true, 5));
  assert.equal(h.status, "drew-at-points");
  assert.deepEqual(h.atPoints, { points: 5, applicants: 4, drawn: 3, pct: 75 });
  assert.equal(h.rankOdds, 75);
  assert.equal(h.odds, 10);
  assert.equal(h.oddsComputed, true, "odds came from drawn ÷ applicants");
  assert.equal(h.minPoints, 4);
});

test("no applicants at your level: falls back to the lowest point level drawn", () => {
  const r = draw("B", { nonresident: { applicants: 50, drawn: 5, oddsPct: 10 }, byPoints: pts([8, 2, 2], [3, 10, 3], [0, 38, 0]) });
  const h = hunt(classifyHunt(r, "nonresident", true, 5));
  assert.equal(h.status, "min-at-or-below");
  assert.equal(h.minPoints, 3);
  assert.equal(h.atPoints, null);
  assert.equal(h.oddsComputed, false, "agency printed the rate");
});

test("not drawn at your level: stretch only when the minimum is within 2 points", () => {
  const near = draw("C", { nonresident: { applicants: 30, drawn: 2 }, byPoints: pts([7, 2, 2], [5, 6, 0]) });
  const far = draw("D", { nonresident: { applicants: 30, drawn: 2 }, byPoints: pts([9, 2, 2], [5, 6, 0]) });
  const c = hunt(classifyHunt(near, "nonresident", true, 5));
  assert.equal(c.status, "stretch");
  assert.equal(c.minPoints, 7);
  assert.deepEqual(c.atPoints, { points: 5, applicants: 6, drawn: 0, pct: 0 });
  assert.deepEqual(classifyHunt(far, "nonresident", true, 5), { excluded: "not-drawn-at-level" });
});

test("bonus-style luck below your level is not reported as drawing at your points", () => {
  // 0 of 3 drew at 4 points, but someone drew at 1 point.
  const r = draw("L", { nonresident: { applicants: 40, drawn: 2 }, byPoints: pts([4, 3, 0], [1, 20, 2], [0, 17, 0]) });
  const h = hunt(classifyHunt(r, "nonresident", true, 4));
  assert.equal(h.status, "stretch");
  assert.equal(h.atPoints?.drawn, 0);
});

test("no point table and no minimum: points-unknown, ranked by overall odds", () => {
  const r = draw("W", { choice: "all", total: { quota: 10, applicants: 200, drawn: 10 } });
  const h = hunt(classifyHunt(r, "nonresident", true, 12));
  assert.equal(h.status, "points-unknown");
  assert.equal(h.pool, "total");
  assert.equal(h.rankOdds, 5);
});

test("minimum published without a point table (Kansas-style)", () => {
  const ok = draw("K1", { resident: { quota: 39, applicants: null, drawn: 39, minPoints: 1 } });
  const far = draw("K2", { resident: { quota: 5, applicants: 80, drawn: 5, minPoints: 6 } });
  const h = hunt(classifyHunt(ok, "resident", true, 2));
  assert.equal(h.status, "min-at-or-below");
  assert.equal(h.odds, null, "no applicants published, so no odds");
  assert.deepEqual(classifyHunt(far, "resident", true, 2), { excluded: "not-drawn-at-level" });
  assert.equal(hunt(classifyHunt(far, "resident", true, 4)).status, "stretch");
});

test("random draws rank by the pool's odds and skip hunts nobody drew or without figures", () => {
  const a = hunt(classifyHunt(draw("R1", { nonresident: { applicants: 100, drawn: 20 } }), "nonresident", false, null));
  assert.equal(a.status, "random");
  assert.equal(a.rankOdds, 20);
  assert.equal(a.minPoints, null, "points don't matter, so no minimum is reported");
  assert.deepEqual(classifyHunt(draw("R2", { nonresident: { applicants: 100, drawn: 0 } }), "nonresident", false, null), { excluded: "not-drawn" });
  assert.deepEqual(classifyHunt(draw("R3", { nonresident: { quota: 4 } }), "nonresident", false, null), { excluded: "no-figures" });
  // Resident-only hunt: a nonresident has no pool.
  assert.deepEqual(classifyHunt(draw("R4", { resident: { applicants: 10, drawn: 5 } }), "nonresident", false, null), { excluded: "no-figures" });
});

test("points matter but none entered: ranked by odds, flagged", () => {
  const h = hunt(classifyHunt(draw("N", { resident: { applicants: 10, drawn: 5, minPoints: 3 } }), "resident", true, null));
  assert.equal(h.status, "no-points-entered");
  assert.equal(h.minPoints, 3);
  assert.equal(h.rankOdds, 50);
});

test("results year skips a newer year that has quotas but no counts", () => {
  const rows = [draw("X", { year: 2025, total: { applicants: 10, drawn: 1 } }), draw("X", { year: 2026, total: { quota: 1 } })];
  assert.deepEqual(resultsYear(rows), { year: 2025, newer: 2026 });
  assert.deepEqual(resultsYear([draw("Y", { total: { quota: 1 } })]), { year: null, newer: null });
});

test("one row per hunt code, preferring first-choice figures", () => {
  const rows = [
    draw("H", { choice: "all", nonresident: { applicants: 300, drawn: 9 } }),
    draw("H", { choice: "first", nonresident: { applicants: 120, drawn: 8 } }),
    draw("H", { year: 2025, nonresident: { applicants: 1, drawn: 1 } }),
  ];
  const out = huntsForYear(rows, 2026);
  assert.equal(out.length, 1);
  assert.equal(out[0].choice, "first");
});

test("classifyState: counts, stretch toggle and ordering", () => {
  const rows = [
    draw("A", { nonresident: { applicants: 100, drawn: 10 }, byPoints: pts([5, 4, 1], [4, 96, 9]) }), // drew at 5: 25%
    draw("B", { nonresident: { applicants: 10, drawn: 9 }, byPoints: pts([5, 2, 2], [0, 8, 7]) }), // drew at 5: 100%
    draw("C", { nonresident: { applicants: 30, drawn: 2 }, byPoints: pts([6, 2, 2], [5, 6, 0]) }), // stretch
    draw("D", { nonresident: { applicants: 30, drawn: 2 }, byPoints: pts([12, 2, 2]) }), // not at level
    draw("E", { resident: { applicants: 30, drawn: 2 } }), // no nonresident figures
    draw("F", { nonresident: { applicants: 40, drawn: 20 } }), // no point data: unknown
  ];
  const off = classifyState({ rows, residency: "nonresident", pointsMatter: true, points: 5, includeStretch: false });
  assert.equal(off.drawYear, 2026);
  assert.equal(off.hasPointTable, true);
  assert.deepEqual(off.hunts.map((h) => h.huntCode), ["B", "A", "F"]);
  assert.deepEqual(
    { ...off.counts },
    { hunts: 6, drewAtPoints: 2, minAtOrBelow: 0, pointsUnknown: 1, stretch: 1, ranked: 0, notDrawnAtLevel: 1, notDrawn: 0, noFigures: 1 }
  );
  const on = classifyState({ rows, residency: "nonresident", pointsMatter: true, points: 5, includeStretch: true });
  assert.deepEqual(on.hunts.map((h) => h.huntCode), ["B", "A", "F", "C"]);
});

test("compareHunts puts unknown odds last within a tier", () => {
  const base = hunt(classifyHunt(draw("Z", { nonresident: { applicants: 10, drawn: 1 } }), "nonresident", false, null));
  const list = [
    { ...base, huntCode: "n", rankOdds: null },
    { ...base, huntCode: "lo", rankOdds: 5 },
    { ...base, huntCode: "hi", rankOdds: 50 },
  ];
  assert.deepEqual(list.sort(compareHunts).map((h) => h.huntCode), ["hi", "lo", "n"]);
});

function harvest(unit: string, extra: Partial<HarvestRecord> = {}): HarvestRecord {
  return { species: "elk", year: 2025, unit, hunters: 100, harvest: 25, successPct: 25, sourceId: "h-test", ...extra };
}

test("pickHarvest: exact hunt row, else the unit's all-methods row from its latest year", () => {
  const rows = [
    harvest("010", { method: "all", successPct: 30 }),
    harvest("10", { method: "rifle", successPct: 22 }),
    harvest("10", { year: 2024, method: "all", successPct: 99 }),
    harvest("10", { hunt: "EXACT", method: "rifle", successPct: 41 }),
  ];
  const exact = pickHarvest(rows, { huntCode: "EXACT", units: ["10"], method: "rifle" }, "resident");
  assert.equal(exact?.successPct, 41);
  assert.equal(exact?.matchedBy, "hunt");
  const unit = pickHarvest(rows, { huntCode: "OTHER", units: ["10"], method: "archery" }, "resident");
  assert.equal(unit?.successPct, 30, "matched '010' to '10', latest year, all-methods row");
  assert.equal(unit?.year, 2025);
  assert.equal(unit?.matchedBy, "unit");
});

test("pickHarvest: multi-unit hunts, computed success and ambiguity", () => {
  assert.equal(pickHarvest([harvest("10")], { huntCode: "M", units: ["10", "11"] }, "resident"), null);
  const computed = pickHarvest([harvest("10", { successPct: null, hunters: 200, harvest: 50 })], { huntCode: "M", units: ["10"] }, "resident");
  assert.equal(computed?.successPct, 25);
  assert.equal(computed?.computed, true);
  // Two archery license types for the unit, no all-methods row: don't guess.
  const ambiguous = [harvest("10", { method: "archery", methodLabel: "Type 1" }), harvest("10", { method: "archery", methodLabel: "Type 2" })];
  assert.equal(pickHarvest(ambiguous, { huntCode: "M", units: ["10"], method: "archery" }, "resident"), null);
  // Only per-hunt rows for other hunts: don't borrow another hunt's success.
  assert.equal(pickHarvest([harvest("10", { hunt: "OTHER" })], { huntCode: "M", units: ["10"] }, "resident"), null);
});

test("equal odds: more licenses drawn at your level ranks first", () => {
  const one = hunt(classifyHunt(draw("ONE", { nonresident: { applicants: 1, drawn: 1 }, byPoints: pts([2, 1, 1]) }), "nonresident", true, 2));
  const many = hunt(classifyHunt(draw("MANY", { nonresident: { applicants: 48, drawn: 48 }, byPoints: pts([2, 48, 48]) }), "nonresident", true, 2));
  assert.deepEqual([one, many].sort(compareHunts).map((h) => h.huntCode), ["MANY", "ONE"]);
});

test("pool without its own quota shows the hunt's total quota, flagged", () => {
  const h = hunt(classifyHunt(draw("Q", { nonresident: { applicants: 10, drawn: 2 }, total: { quota: 11, applicants: 30, drawn: 9 } }), "nonresident", false, null));
  assert.equal(h.quota, 11);
  assert.equal(h.quotaIsTotal, true);
  assert.equal(h.applicants, 10, "applicants stay the member's pool");
  const own = hunt(classifyHunt(draw("Q2", { nonresident: { quota: 3, applicants: 10, drawn: 2 }, total: { quota: 11 } }), "nonresident", false, null));
  assert.equal(own.quota, 3);
  assert.equal(own.quotaIsTotal, false);
});
