// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DrawRecord, HarvestRecord } from "@/data/agency/schema";
import { drawPreview, harvestPreview, previewCopy } from "@/lib/agency-preview";

const draw = (huntCode: string, year: number, o: Partial<DrawRecord> = {}): DrawRecord => ({
  species: "elk",
  year,
  huntCode,
  units: [],
  description: "",
  choice: "first",
  sourceId: "d-test",
  ...o,
});

const harvest = (unit: string, year: number, hunters: number | null, o: Partial<HarvestRecord> = {}): HarvestRecord => ({
  species: "elk",
  year,
  unit,
  method: "all",
  hunters,
  harvest: hunters === null ? null : Math.round(hunters / 5),
  successPct: null,
  sourceId: "h-test",
  ...o,
});

test("draw preview: latest year's most-applied-for hunts, with true counts and every year", () => {
  const rows = [
    draw("A1", 2026, { total: { applicants: 10 } }),
    draw("A2", 2026, { total: { applicants: 900 } }),
    draw("A3", 2026, { resident: { applicants: 300 }, nonresident: { applicants: 400 } }),
    draw("A4", 2026, { total: { applicants: null, quota: 50 } }),
    draw("A2", 2025, { total: { applicants: 800 } }),
    draw("A9", 2024, { total: { applicants: 5000 } }),
  ];
  const p = drawPreview(rows, 2);
  assert.equal(p.preview, true);
  assert.deepEqual(p.years, [2026, 2025, 2024]);
  assert.equal(p.year, 2026);
  assert.equal(p.yearTotal, 4);
  assert.equal(p.total, 6);
  assert.equal(p.rankedBy, "applicants");
  const latest = p.rows.filter((r) => r.year === 2026).map((r) => r.huntCode);
  assert.deepEqual(latest, ["A2", "A3"]);
  // A2's previous draw comes along so "prior year" figures aren't blank; older hunts that weren't picked don't.
  assert.deepEqual(
    p.rows.filter((r) => r.year !== 2026).map((r) => `${r.huntCode}-${r.year}`),
    ["A2-2025"]
  );
});

test("draw preview: one row per hunt code, first-choice preferred", () => {
  const rows = [
    draw("N1", 2026, { choice: "all", total: { applicants: 999 } }),
    draw("N1", 2026, { choice: "first", total: { applicants: 400 } }),
    draw("N2", 2026, { choice: "all", total: { applicants: 500 } }),
    draw("N2", 2026, { choice: "first", total: { applicants: 100 } }),
  ];
  const p = drawPreview(rows);
  assert.equal(p.yearTotal, 2);
  assert.deepEqual(
    p.rows.map((r) => `${r.huntCode}-${r.choice}`),
    ["N1-first", "N2-first"]
  );
});

test("draw preview: ranks by quota when the agency published no applicants that year", () => {
  const rows = [draw("W1", 2026, { resident: { quota: 5 } }), draw("W2", 2026, { resident: { quota: 40 } }), draw("W3", 2026)];
  const p = drawPreview(rows);
  assert.equal(p.rankedBy, "quota");
  assert.deepEqual(
    p.rows.map((r) => r.huntCode),
    ["W2", "W1", "W3"]
  );
});

test("draw preview: empty table", () => {
  const p = drawPreview([]);
  assert.deepEqual(p.rows, []);
  assert.deepEqual(p.years, []);
  assert.equal(p.year, null);
  assert.equal(p.yearTotal, 0);
  assert.equal(p.rankedBy, null);
});

test("harvest preview: newest season with unit rows, default category, most hunters first", () => {
  const rows = [
    // Newest season has only a statewide total, so the preview (like a member's table) opens on 2024.
    harvest("Statewide", 2025, 100000),
    harvest("1", 2024, 50),
    harvest("2", 2024, 900),
    harvest("3", 2024, null),
    harvest("2", 2024, 400, { method: "archery", methodLabel: "Archery" }),
    harvest("2", 2023, 700),
    harvest("2", 2023, 300, { method: "archery", methodLabel: "Archery" }),
  ];
  const p = harvestPreview(rows, 2);
  assert.deepEqual(p.years, [2025, 2024, 2023]);
  assert.equal(p.year, 2024);
  // Default category is the all-methods rows (they cover several units): 3 rows in 2024.
  assert.equal(p.yearTotal, 3);
  assert.equal(p.rankedBy, "hunters");
  assert.deepEqual(
    p.rows.map((r) => `${r.unit}-${r.year}-${r.method}`),
    ["2-2024-all", "1-2024-all", "2-2023-all"]
  );
});

test("harvest preview: every category when there are no all-methods unit rows", () => {
  const rows = [
    harvest("Statewide", 2025, 1000),
    harvest("10", 2025, 30, { method: "rifle", methodLabel: "Rifle", hunt: "H1" }),
    harvest("11", 2025, 60, { method: "archery", methodLabel: "Archery", hunt: "H2" }),
  ];
  const p = harvestPreview(rows);
  assert.equal(p.year, 2025);
  assert.equal(p.yearTotal, 3);
  assert.deepEqual(
    p.rows.map((r) => r.unit),
    ["11", "10"]
  );
});

test("preview copy quotes the true counts and years", () => {
  const base = { stateName: "Colorado", species: "elk", agency: "CPW", unitTerm: "GMU", hasOther: true };
  const d = previewCopy({ ...base, kind: "draw", shown: 8, meta: { year: 2026, years: [2026, 2025, 2024, 2023, 2022], yearTotal: 1039, rankedBy: "applicants" } });
  assert.equal(d.caption, "Free preview: the 8 hunt codes with the most applicants overall in the 2026 draw.");
  assert.equal(
    d.gate,
    "Showing 8 of 1,039 Colorado elk hunt codes in the 2026 draw. Pro shows every hunt code in all 5 draw years (2022–2026), plus harvest by GMU, each figure cited to the CPW report it came from."
  );
  const q = previewCopy({ ...base, kind: "draw", shown: 8, meta: { year: 2026, years: [2026], yearTotal: 353, rankedBy: "quota" } });
  assert.match(q.caption, /largest quotas in the 2026 draw \(CPW didn't publish applicant counts for 2026\)/);
  assert.ok(!q.gate.includes("draw years"));
  const h = previewCopy({ ...base, kind: "harvest", hasOther: false, shown: 8, meta: { year: 2025, years: [2025, 2024], yearTotal: 957, rankedBy: "hunters" } });
  assert.equal(h.caption, "Free preview: the 8 rows with the most hunters in the 2025 season.");
  assert.equal(h.gate, "Showing 8 of 957 Colorado elk harvest rows for the 2025 season. Pro shows every row in all 2 seasons (2024–2025), each figure cited to the CPW report it came from.");
  const all = previewCopy({ ...base, kind: "harvest", shown: 1, meta: { year: 2022, years: [2022], yearTotal: 1, rankedBy: "harvest" } });
  assert.equal(all.caption, "Free preview: the only row for the 2022 season.");
  assert.equal(all.gate, "Showing the only Colorado elk harvest row for the 2022 season. Pro adds the draw results by hunt code, each figure cited to the CPW report it came from.");
});

test("preview copy doesn't promise more hunt codes when the preview already shows them all", () => {
  const base = { stateName: "Montana", species: "black bear", agency: "FWP", unitTerm: "Hunting District", kind: "draw" as const, shown: 2 };
  const one = previewCopy({ ...base, hasOther: true, meta: { year: 2026, years: [2026], yearTotal: 2, rankedBy: "applicants" } });
  assert.equal(one.gate, "Showing all 2 Montana black bear hunt codes in the 2026 draw. Pro adds harvest by Hunting District, each figure cited to the FWP report it came from.");
  const many = previewCopy({ ...base, hasOther: false, meta: { year: 2026, years: [2026, 2025], yearTotal: 2, rankedBy: "applicants" } });
  assert.equal(many.gate, "Showing all 2 Montana black bear hunt codes in the 2026 draw. Pro shows all 2 draw years (2025–2026), each figure cited to the FWP report it came from.");
  const only = previewCopy({ ...base, hasOther: false, meta: { year: 2026, years: [2026], yearTotal: 2, rankedBy: "applicants" } });
  assert.equal(only.gate, "Showing all 2 Montana black bear hunt codes in the 2026 draw.");
});

test("draw preview: opens on the newest year with odds, like a member's table", () => {
  const rows = [
    draw("Q1", 2026, { total: { applicants: null, quota: 40 } }),
    draw("Q2", 2026, { total: { applicants: null, quota: 90 } }),
    draw("Q1", 2025, { total: { applicants: 300, drawn: 30 } }),
    draw("Q2", 2025, { total: { applicants: 100, drawn: 50 } }),
  ];
  const p = drawPreview(rows);
  assert.equal(p.year, 2025);
  assert.deepEqual(p.years, [2026, 2025]);
  assert.equal(p.rankedBy, "applicants");
  assert.deepEqual(p.rows.map((r) => `${r.huntCode}-${r.year}`), ["Q1-2025", "Q2-2025"]);
});

test("harvest preview: opens on the season a member's table opens on", () => {
  const rows = [
    harvest("1", 2025, 500, { hunt: "H1" }),
    harvest("2", 2025, 400, { hunt: "H2" }),
    harvest("1", 2024, 300),
    harvest("2", 2024, 200),
  ];
  assert.equal(harvestPreview(rows).year, 2024);
});
