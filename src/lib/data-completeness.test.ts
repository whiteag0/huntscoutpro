// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { completenessSummary, type DrawCompleteness } from "@/lib/data-completeness";

const c = (o: Partial<DrawCompleteness>): DrawCompleteness => ({
  pointsMatter: true,
  drawYear: 2026,
  newer: null,
  hunts: 10,
  odds: 10,
  split: 10,
  pointTable: 10,
  minPoints: 10,
  ...o,
});

const asMap = (items: { label: string; value: string }[]) => Object.fromEntries(items.map((i) => [i.label, i.value]));

test("a state with every figure published", () => {
  assert.deepEqual(asMap(completenessSummary({ elk: c({}), deer: c({ hunts: 5, odds: 5, split: 5, pointTable: 5, minPoints: 5 }) })), {
    "Latest draw odds": "2026",
    "Overall draw odds": "every hunt",
    "Odds by residency": "resident and nonresident separately",
    "Odds by point level": "every hunt",
  });
});

test("odds for some hunts only, newer year with quotas, one combined pool (Washington-style)", () => {
  const out = asMap(
    completenessSummary({
      elk: c({ drawYear: 2025, newer: 2026, hunts: 333, odds: 333, split: 0, pointTable: 0, minPoints: 0 }),
      bear: c({ pointsMatter: false, drawYear: 2021, hunts: 21, odds: 21, split: 0, pointTable: 0, minPoints: 0 }),
    })
  );
  assert.equal(out["Latest draw odds"], "2025 (2026 odds not published yet)");
  assert.equal(out["Overall draw odds"], "every hunt");
  assert.equal(out["Odds by residency"], "one combined pool");
  assert.equal(out["Odds by point level"], "not published");
});

test("partial counts are exact, and lowest-points-only states say so", () => {
  const wy = asMap(completenessSummary({ elk: c({ hunts: 416, odds: 47, split: 255, pointTable: 254, minPoints: 254 }), goat: c({ pointsMatter: false, drawYear: null, hunts: 4, odds: 0, split: 0, pointTable: 0, minPoints: 0 }) }));
  assert.equal(wy["Overall draw odds"], "47 of 420 hunts");
  assert.equal(wy["Odds by residency"], "255 of 420 hunts");
  assert.equal(wy["Odds by point level"], "254 of 416 hunts");
  const ca = asMap(completenessSummary({ deer: c({ drawYear: 2025, hunts: 82, odds: 82, split: 0, pointTable: 0, minPoints: 82 }), elk: c({ drawYear: null, hunts: 87, odds: 0, split: 0, pointTable: 0, minPoints: 0 }) }));
  assert.equal(ca["Latest draw odds"], "2025");
  assert.equal(ca["Overall draw odds"], "82 of 169 hunts");
  assert.equal(ca["Odds by point level"], "lowest points drawn only (82 of 169 hunts)");
});

test("no odds at all, random draws, and states without draw tables", () => {
  const none = asMap(completenessSummary({ elk: c({ pointsMatter: false, drawYear: null, hunts: 12, odds: 0, split: 0, pointTable: 0, minPoints: 0 }) }));
  assert.deepEqual(none, { "Latest draw odds": "not published", "Overall draw odds": "not published" });
  assert.deepEqual(completenessSummary(undefined), []);
  assert.deepEqual(completenessSummary({ elk: c({ hunts: 0 }) }), []);
});
