// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DrawRecord, HarvestRecord } from "@/data/agency/schema";
import { allChoiceCompanions, defaultHarvestYear, drawHistory, firstChoiceRows, huntSearchRank, oddsYear, poolQuota } from "@/lib/agency-view";

const draw = (code: string, extra: Partial<DrawRecord> = {}): DrawRecord => ({
  species: "elk",
  year: 2026,
  huntCode: code,
  units: ["10"],
  description: `Hunt ${code}`,
  choice: "first",
  sourceId: "d-test",
  ...extra,
});

const harvest = (year: number, unit: string, extra: Partial<HarvestRecord> = {}): HarvestRecord => ({
  species: "elk",
  year,
  unit,
  hunters: 10,
  harvest: 2,
  successPct: 20,
  sourceId: "h-test",
  ...extra,
});

test("poolQuota: the pool's own quota, else the hunt's total flagged as all pools", () => {
  assert.deepEqual(poolQuota(draw("A", { resident: { quota: 5, applicants: 40 }, total: { quota: 9 } }), "resident"), { quota: 5, isTotal: false });
  assert.deepEqual(poolQuota(draw("B", { resident: { applicants: 40, drawn: 3 }, total: { quota: 9 } }), "resident"), { quota: 9, isTotal: true });
  // One combined pool: its quota is the pool's own, not a fallback.
  assert.deepEqual(poolQuota(draw("C", { total: { quota: 9, applicants: 20 } }), "nonresident"), { quota: 9, isTotal: false });
  assert.deepEqual(poolQuota(draw("D", { resident: { applicants: 40 } }), "resident"), { quota: null, isTotal: false });
});

test("firstChoiceRows keeps one row per hunt and year, first-choice when both exist", () => {
  const rows = [
    draw("A", { choice: "all", total: { applicants: 300 } }),
    draw("A", { choice: "first", total: { applicants: 120 } }),
    draw("A", { year: 2025, choice: "all", total: { applicants: 280 } }),
    draw("B", { choice: "all", total: { applicants: 50 } }),
  ];
  const out = firstChoiceRows(rows);
  assert.deepEqual(
    out.map((r) => [r.huntCode, r.year, r.choice]),
    [
      ["A", 2026, "first"],
      ["A", 2025, "all"],
      ["B", 2026, "all"],
    ]
  );
  const companions = allChoiceCompanions(rows);
  assert.equal(companions.get({ huntCode: "A", year: 2026 })?.total?.applicants, 300);
  assert.equal(companions.get({ huntCode: "B", year: 2026 }), undefined, "an all-choice-only hunt is the main row, not a companion");
  assert.equal(companions.get({ huntCode: "A", year: 2025 }), undefined);
  // History has one row per year, so per-year keys don't collide.
  assert.deepEqual(drawHistory(rows).get("A")!.map((r) => [r.year, r.choice]), [
    [2026, "first"],
    [2025, "all"],
  ]);
});

test("oddsYear skips a newer year with quotas or applicants but no odds", () => {
  const rows = [
    draw("A", { year: 2026, total: { quota: 10, applicants: 500 } }),
    draw("A", { year: 2025, total: { quota: 10, applicants: 480, drawn: 10 } }),
    draw("B", { year: 2024, total: { quota: 4, oddsPct: 2 } }),
  ];
  assert.deepEqual(oddsYear(rows), { year: 2025, newer: 2026 });
  // Point tables or a lowest point level drawn count as odds data even without pool odds (Wyoming).
  assert.deepEqual(oddsYear([draw("C", { resident: { quota: 3, minPoints: 4 } })]), { year: 2026, newer: null });
  assert.deepEqual(oddsYear([draw("D", { total: { quota: 3 } })]), { year: null, newer: null });
});

test("defaultHarvestYear: newest unit-level season, passing over a switch to hunt-code reporting", () => {
  // CPW: 2020-2024 by unit, 2025 by hunt code only.
  const co = [harvest(2024, "061"), harvest(2024, "062"), harvest(2025, "061", { hunt: "EE061O1R" }), harvest(2025, "000", { hunt: "EM000U2R" })];
  assert.deepEqual(defaultHarvestYear(co), { year: 2024, byHuntInstead: 2025 });
  // Reported by hunt every year (Oregon, Arizona): newest season.
  const byHunt = [harvest(2024, "10", { hunt: "210" }), harvest(2025, "10", { hunt: "210" })];
  assert.deepEqual(defaultHarvestYear(byHunt), { year: 2025, byHuntInstead: null });
  // Newest season statewide only: the newest with units.
  assert.deepEqual(defaultHarvestYear([harvest(2025, "Statewide"), harvest(2024, "7")]), { year: 2024, byHuntInstead: null });
  assert.deepEqual(defaultHarvestYear([harvest(2025, "Statewide")]), { year: 2025, byHuntInstead: null });
  assert.deepEqual(defaultHarvestYear([]), { year: undefined, byHuntInstead: null });
});

test("huntSearchRank: exact unit or code first, then the number as its own digits, then any text", () => {
  const h = (code: string, units: string[], description = "") => ({ code, units, description });
  assert.equal(huntSearchRank(h("EE061O1A", ["061"]), "61"), 0);
  assert.equal(huntSearchRank(h("ELK-1-200", ["61"]), "61"), 0);
  assert.equal(huntSearchRank(h("EE161O1A", ["161"]), "61"), 2);
  assert.equal(huntSearchRank(h("EE061O1A", ["061", "071"]), "71"), 0);
  assert.equal(huntSearchRank(h("EE061O1A", ["001"]), "61"), 1);
  assert.equal(huntSearchRank(h("EE061O1A", ["061"]), "ee061o1a"), 0);
  assert.equal(huntSearchRank(h("EE061O1A", ["061"], "archery"), "61 archery"), 0);
  assert.equal(huntSearchRank(h("EE061O1A", ["061"], "archery"), "rifle"), null);
  assert.equal(huntSearchRank(h("A", []), ""), 2);
  const list = [h("EE161O1A", ["161"]), h("EE461O1A", ["461"]), h("EE061O1A", ["061"])];
  const sorted = list
    .map((x) => ({ x, r: huntSearchRank(x, "61") }))
    .filter((y) => y.r !== null)
    .sort((a, b) => a.r! - b.r!)
    .map((y) => y.x.code);
  assert.deepEqual(sorted, ["EE061O1A", "EE161O1A", "EE461O1A"]);
});
