// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { DrawRecord, HarvestRecord, KeyDate } from "@/data/agency/schema";
import { buildUnitTeasers, hasTeaserData, nextAgencyDate, teaserHarvest, teaserTopHunt, trendExample, unitTeaser } from "@/lib/unit-teaser";

const hv = (r: Partial<HarvestRecord> & { year: number; unit: string }): HarvestRecord => ({
  species: "elk",
  hunters: 100,
  harvest: 25,
  successPct: 25,
  sourceId: `h-${r.year}`,
  ...r,
});

const dr = (r: Partial<DrawRecord> & { year: number; huntCode: string }): DrawRecord => ({
  species: "elk",
  units: ["061"],
  description: r.huntCode,
  choice: "first",
  sourceId: `d-${r.year}`,
  ...r,
});

test("harvest line: newest whole-unit all-methods row, skipping per-hunt and split rows", () => {
  const h = teaserHarvest([
    hv({ year: 2023, unit: "061", method: "all", methodLabel: "All Manners of Take", hunters: 900, harvest: 400, successPct: 44 }),
    hv({ year: 2024, unit: "061", method: "all", methodLabel: "All Manners of Take", hunters: 1000, harvest: 500, successPct: 50 }),
    hv({ year: 2025, unit: "061", hunt: "EE061O1A", method: "archery", hunters: 50 }),
    hv({ year: 2025, unit: "061", method: "all", sex: "male", hunters: 600 }),
    hv({ year: 2025, unit: "061", method: "rifle", hunters: 700 }),
  ]);
  assert.deepEqual(h, { year: 2024, hunt: null, residency: null, label: "All Manners of Take", hunters: 1000, harvest: 500, successPct: 50, successComputed: false, sourceId: "h-2024" });
});

test("harvest line: harvest ÷ hunters is flagged as computed; rows without figures are ignored", () => {
  const h = teaserHarvest([hv({ year: 2025, unit: "7", hunters: 200, harvest: 50, successPct: null }), hv({ year: 2026, unit: "7", hunters: null, harvest: null, successPct: null })]);
  assert.equal(h?.year, 2025);
  assert.equal(h?.successPct, 25);
  assert.equal(h?.successComputed, true);
  assert.equal(teaserHarvest([hv({ year: 2026, unit: "7", hunters: null, harvest: null, successPct: null })]), null);
  assert.equal(teaserHarvest([hv({ year: 2026, unit: "7", hunters: null, harvest: null, successPct: 100 })])?.successPct, 100);
});

test("harvest line: a unit reported only per hunt shows the newest year's biggest hunt", () => {
  const h = teaserHarvest([
    hv({ year: 2025, unit: "30-1", hunt: "2007", sex: "male", hunters: 29, harvest: 27 }),
    hv({ year: 2025, unit: "30-1", hunt: "2008", hunters: 40, harvest: 10 }),
    hv({ year: 2025, unit: "30-1", hunt: "2008", residency: "nonresident", hunters: 400, harvest: 10 }),
    hv({ year: 2024, unit: "30-1", hunt: "2009", hunters: 900, harvest: 10 }),
  ]);
  assert.equal(h?.hunt, "2008");
  assert.equal(h?.hunters, 40);
  assert.equal(h?.residency, null);
});

test("harvest line: residency-split hunts are labelled with their pool", () => {
  const h = teaserHarvest([
    hv({ year: 2025, unit: "032", hunt: "Any Ram", residency: "resident", hunters: 3, harvest: 3 }),
    hv({ year: 2025, unit: "032", hunt: "Any Ram", residency: "nonresident", hunters: 1, harvest: 1 }),
  ]);
  assert.equal(h?.residency, "resident");
  assert.equal(h?.hunters, 3);
});

test("top hunt: most applicants in the newest year with results, first-choice row, pools shown separately", () => {
  const top = teaserTopHunt([
    dr({ year: 2026, huntCode: "A", resident: { quota: 10 } }), // quota only: not a result year
    dr({ year: 2025, huntCode: "A", resident: { applicants: 300, drawn: 30 }, nonresident: { applicants: 100, drawn: 5 } }),
    dr({ year: 2025, huntCode: "B", resident: { applicants: 350, drawn: 70 } }),
    dr({ year: 2025, huntCode: "A", choice: "all", resident: { applicants: 900, drawn: 30 } }),
    dr({ year: 2024, huntCode: "C", resident: { applicants: 5000, drawn: 1 } }),
  ]);
  assert.equal(top?.year, 2025);
  assert.equal(top?.huntCode, "A");
  assert.deepEqual(top?.pools, [
    { pool: "resident", applicants: 300, drawn: 30 },
    { pool: "nonresident", applicants: 100, drawn: 5 },
  ]);
});

test("top hunt: falls back to the agency's combined pool, and is null with no applicants", () => {
  const top = teaserTopHunt([dr({ year: 2025, huntCode: "X", total: { applicants: 40, drawn: 4 } })]);
  assert.deepEqual(top?.pools, [{ pool: "total", applicants: 40, drawn: 4 }]);
  assert.equal(teaserTopHunt([dr({ year: 2025, huntCode: "X", total: { quota: 4, drawn: 4 } })]), null);
});

test("units are matched across spellings and a draw-only unit still gets a summary", () => {
  const m = buildUnitTeasers(
    [hv({ year: 2020, unit: "61" }), hv({ year: 2024, unit: "061" }), hv({ year: 2024, unit: "Statewide" })],
    [dr({ year: 2026, huntCode: "A", units: ["061", "61"] }), dr({ year: 2026, huntCode: "B", units: ["999"], resident: { applicants: 5, drawn: 1 } })]
  );
  assert.equal(m.has("STATEWIDE"), false);
  const t = m.get("61");
  assert.equal(t?.unit, "061");
  assert.deepEqual(t?.harvestYears, [2020, 2024]);
  assert.deepEqual(t?.huntCodes, { year: 2026, count: 1, sourceIds: ["d-2026"] });
  assert.equal(m.get("999")?.unit, "999");
  assert.ok(hasTeaserData(m.get("999")));
});

test("a unit with no figures has no teaser data", () => {
  assert.equal(hasTeaserData(unitTeaser("5", [hv({ year: 2024, unit: "5", hunters: null, harvest: null, successPct: null })], [])), false);
  assert.equal(hasTeaserData(undefined), false);
});

test("next agency date: soonest not yet ended", () => {
  const kd = (k: Partial<KeyDate> & { label: string }): KeyDate => ({ cycle: 2027, status: "confirmed", sourceId: "d", ...k });
  const dates = [
    kd({ label: "Past", date: "2026-04-07", cycle: 2026 }),
    kd({ label: "Window", start: "2026-12-01", end: "2027-01-15", status: "tentative" }),
    kd({ label: "Later", date: "2027-04-06" }),
  ];
  assert.equal(nextAgencyDate(dates, "2026-11-04")?.label, "Window");
  assert.equal(nextAgencyDate(dates, "2027-05-01"), null);
});

test("trend example: the most-applied hunt with the metric in at least two years", () => {
  const ex = trendExample(
    [
      dr({ year: 2025, huntCode: "BIG", resident: { applicants: 999, drawn: 9, minPoints: 5 } }),
      dr({ year: 2024, huntCode: "A", resident: { applicants: 100, drawn: 10, minPoints: 3 } }),
      dr({ year: 2025, huntCode: "A", resident: { applicants: 120, drawn: 10, minPoints: 4 } }),
      dr({ year: 2025, huntCode: "A", choice: "all", resident: { applicants: 500, drawn: 10, minPoints: 1 } }),
      dr({ year: 2024, huntCode: "B", resident: { applicants: 90, drawn: 10, minPoints: 1 } }),
      dr({ year: 2025, huntCode: "B", resident: { applicants: 110, drawn: 10, minPoints: 2 } }),
    ],
    true
  );
  assert.equal(ex?.huntCode, "A");
  assert.equal(ex?.applicants, 120);
  assert.deepEqual(
    ex?.points.map((p) => [p.year, p.minPoints]),
    [
      [2024, 3],
      [2025, 4],
    ]
  );
  assert.equal(trendExample([dr({ year: 2025, huntCode: "A", resident: { applicants: 1, drawn: 1 } })], false), null);
});

// The published Colorado files: GMU 061 elk has hunts and harvest, so its free summary is never empty.
const read = <T,>(kind: string) => JSON.parse(readFileSync(`src/data/agency/colorado/${kind}/elk.json`, "utf8")) as T[];

test("CO GMU 061 elk summary comes from the full tables", () => {
  const t = buildUnitTeasers(read<HarvestRecord>("harvest"), read<DrawRecord>("draw")).get("61");
  assert.ok(hasTeaserData(t));
  assert.ok((t.huntCodes?.count ?? 0) > 0, "hunt codes include GMU 061");
  assert.ok(t.harvest && t.harvest.hunters, "harvest line has hunters");
  assert.ok(t.topHunt?.huntCode.includes("061"), "most-applied hunt is a GMU 061 code");
});
