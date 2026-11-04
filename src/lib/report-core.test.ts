// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { DrawRecord, HarvestRecord, KeyDate, SpeciesInfo } from "@/data/agency/schema";
import type { StateData } from "@/lib/agency";
import { EMPTY_PREFERENCES, type HuntingPreferences } from "@/lib/preferences-schema";
import { drawStats, oddsOf, sameUnit } from "@/lib/agency-view";
import {
  buildReport,
  isAntlerless,
  isPrivateLandOnly,
  residencyFor,
  selectCombos,
  type ReportInput,
  type ReportStateInput,
  type ReportTables,
  type ScoutingReport,
} from "@/lib/report-core";

// ------------------------------------------------------------
// A small fictional state ("Testland", abbreviation TL)
// ------------------------------------------------------------

const kd = (k: Partial<KeyDate> & { label: string }): KeyDate => ({ cycle: 2027, status: "confirmed", sourceId: "d-dates", ...k });

const ELK: SpeciesInfo = {
  species: "elk",
  drawSystem: "preference",
  drawSystemSummary: "Limited elk licenses are drawn by preference points.",
  pointsMatter: true,
  pointName: "preference point",
  residentNote: "Residents must hold a hunting license before applying.",
  nonresidentNote: "Nonresidents get up to 10% of licenses.",
  sourceIds: ["d-dates"],
  keyDates: [
    kd({ label: "Primary draw application period", start: "2026-03-01", end: "2026-04-07", cycle: 2026 }),
    kd({ label: "Draw results posted", date: "2026-05-28", cycle: 2026 }),
    kd({ label: "License payment deadline", date: "2026-06-12", cycle: 2026 }),
    kd({ label: "Primary draw application deadline", date: "2027-04-06", status: "tentative", note: "Set by rule 1.2 (first Tuesday in April); not announced yet." }),
    kd({ label: "Preference-point-only application deadline", date: "2027-04-06", status: "tentative", note: "Set by rule 1.2." }),
    kd({ label: "Landowner application deadline", date: "2027-01-31" }),
    kd({ label: "Nonresident application period", start: "2027-01-02", end: "2027-02-01", residency: "nonresident" }),
  ],
};

const SHEEP: SpeciesInfo = {
  species: "sheep",
  drawSystem: "bonus",
  drawSystemSummary: "Sheep tags are drawn with bonus points.",
  pointsMatter: true,
  pointName: "bonus point",
  sourceIds: ["d-dates"],
  keyDates: [kd({ label: "Sheep draw application deadline", date: "2026-06-02", cycle: 2026 })],
};

const LION: SpeciesInfo = { species: "lion", drawSystem: "none", drawSystemSummary: "", pointsMatter: false, sourceIds: [], keyDates: [] };

const TL: StateData = {
  slug: "testland",
  name: "Testland",
  abbrev: "TL",
  agency: { name: "Testland Wildlife", shortName: "TWD", url: "https://wildlife.test" },
  unitTerm: "GMU",
  lastReviewed: "2026-10-31",
  overview: "",
  species: [ELK, SHEEP, LION],
  fees: [
    { species: null, item: "Application fee", residency: "resident", amountUsd: 10, licenseYear: 2026, sourceId: "d-fees" },
    { species: null, item: "Hunting license", residency: "resident", amountUsd: 40, licenseYear: 2026, sourceId: "d-fees" },
    { species: null, item: "Application for moose, sheep or mountain goat", residency: "resident", amountUsd: 25, licenseYear: 2026, sourceId: "d-fees" },
    { species: "elk", item: "Elk license", residency: "resident", amountUsd: 60, licenseYear: 2026, sourceId: "d-fees" },
    { species: "elk", item: "Elk license", residency: "resident", amountUsd: 65, licenseYear: 2027, sourceId: "d-fees" },
    { species: "elk", item: "Elk preference point", residency: "resident", amountUsd: 5, licenseYear: 2026, sourceId: "d-fees" },
    { species: "elk", item: "Nonresident elk license", residency: "nonresident", amountUsd: 700, licenseYear: 2026, sourceId: "d-fees" },
  ],
  seasons: [
    { species: "elk", label: "Archery", method: "archery", start: "2027-09-02", end: "2027-09-30", year: 2027, sourceId: "d-dates" },
    { species: "elk", label: "First rifle season", method: "rifle", start: "2027-10-13", end: "2027-10-17", year: 2027, sourceId: "d-dates" },
    { species: "elk", label: "First rifle season", method: "rifle", start: "2026-10-14", end: "2026-10-18", year: 2026, sourceId: "d-dates" },
    { species: "elk", label: "Hunt-specific", start: "2027-11-01", end: "2027-11-05", year: 2027, huntCodes: ["E1"], sourceId: "d-dates" },
  ],
  unitNames: { elk: { "061": "Uncompahgre" } },
  drawCoverage: [],
  harvestCoverage: [],
  sources: [
    { id: "d-dates", title: "Testland Big Game Brochure", publisher: "Testland Wildlife", url: "https://wildlife.test/brochure.pdf", dataYear: 2026, retrieved: "2026-10-31" },
    { id: "d-fees", title: "Testland Fee Table", publisher: "Testland Wildlife", url: "https://wildlife.test/fees", dataYear: 2026, retrieved: "2026-10-31" },
    { id: "d-draw", title: "Testland Draw Recap", publisher: "Testland Wildlife", url: "https://wildlife.test/draw", dataYear: 2026, retrieved: "2026-10-31" },
    { id: "h-2024", title: "Testland Harvest 2024", publisher: "Testland Wildlife", url: "https://wildlife.test/h24", dataYear: 2024, retrieved: "2026-10-31" },
    { id: "h-2025", title: "Testland Harvest 2025", publisher: "Testland Wildlife", url: "https://wildlife.test/h25", dataYear: 2025, retrieved: "2026-10-31" },
  ],
};

const draw = (r: Partial<DrawRecord> & { huntCode: string; year: number }): DrawRecord => ({
  species: "elk",
  units: ["61"],
  description: `${r.huntCode}: elk hunt`,
  choice: "first",
  sourceId: "d-draw",
  ...r,
});

const ELK_DRAW: DrawRecord[] = [
  draw({ huntCode: "EM061O1R", year: 2026, method: "rifle", sex: "male", resident: { applicants: 100, drawn: 10, minPoints: 9 }, byPoints: [{ points: 4, resident: { applicants: 20, drawn: 0 } }, { points: 9, resident: { applicants: 10, drawn: 10 } }] }),
  draw({ huntCode: "EF061O1R", year: 2026, method: "rifle", sex: "female", resident: { applicants: 50, drawn: 50, minPoints: 0 }, byPoints: [{ points: 4, resident: { applicants: 5, drawn: 5 } }] }),
  draw({ huntCode: "EE061O1A", year: 2026, method: "archery", sex: "either", resident: { applicants: 40, drawn: 20, minPoints: 2 } }),
  draw({ huntCode: "EM061O1R", year: 2025, method: "rifle", sex: "male", resident: { applicants: 90, drawn: 9, minPoints: 8 } }),
  draw({ huntCode: "EF061O1R", year: 2025, method: "rifle", sex: "female", resident: { applicants: 60, drawn: 30, minPoints: 1 } }),
  draw({ huntCode: "EM062O1R", year: 2026, units: ["62"], method: "rifle", sex: "male", resident: { applicants: 30, drawn: 30, minPoints: 0 } }),
];

const harvest = (r: Partial<HarvestRecord> & { year: number; unit: string }): HarvestRecord => ({
  species: "elk",
  hunters: 1000,
  harvest: 500,
  successPct: 50,
  method: "all",
  methodLabel: "All Manners of Take",
  sex: "all",
  sourceId: r.year === 2024 ? "h-2024" : "h-2025",
  ...r,
});

const ELK_HARVEST: HarvestRecord[] = [
  harvest({ year: 2023, unit: "061", successPct: 53, sourceId: "h-2024" }),
  harvest({ year: 2024, unit: "061", successPct: 56 }),
  harvest({ year: 2024, unit: "061", method: "rifle", methodLabel: "All Rifle Seasons", successPct: 40 }),
  harvest({ year: 2024, unit: "062", hunters: 20, successPct: 90 }),
  harvest({ year: 2024, unit: "063", hunters: 300, successPct: 70 }),
  harvest({ year: 2025, unit: "061", hunt: "EM061O1R", method: "rifle", sex: "male", hunters: 120, harvest: 84, successPct: 70 }),
];

const STATES: ReportStateInput[] = [{ data: TL, drawSpecies: ["elk", "sheep"], harvestSpecies: ["elk"] }];
const TABLES: Record<string, ReportTables> = { "testland|elk": { draw: ELK_DRAW, harvest: ELK_HARVEST }, "testland|sheep": { draw: [], harvest: [] } };
const tables = (slug: string, species: string) => TABLES[`${slug}|${species}`] ?? { draw: [], harvest: [] };

const prefs = (p: Partial<HuntingPreferences> = {}): HuntingPreferences => ({
  ...EMPTY_PREFERENCES,
  states: ["testland"],
  residency: "resident",
  homeState: "TL",
  species: ["elk"],
  units: "GMU 61",
  methods: ["rifle"],
  points: "4 preference points",
  ...p,
});

const build = (p: Partial<HuntingPreferences> = {}, extra: Partial<ReportInput> = {}) =>
  buildReport({ name: "Pat Example", prefs: prefs(p), today: "2026-11-04", states: STATES, tables, ...extra });

/** Every citation in the report resolves to a listed source, numbered 1..n without gaps. */
function assertCitations(r: ScoutingReport) {
  assert.deepEqual(
    r.sources.map((s) => s.n),
    r.sources.map((_, i) => i + 1)
  );
  const max = r.sources.length;
  const json = JSON.stringify(r.combos);
  for (const m of json.matchAll(/"src":(\d+|null)/g)) {
    if (m[1] !== "null") assert.ok(Number(m[1]) >= 1 && Number(m[1]) <= max, `src ${m[1]} out of range`);
  }
  for (const c of r.combos) for (const n of c.sources) assert.ok(n >= 1 && n <= max);
  assert.ok(!/NaN|Infinity/.test(JSON.stringify(r)), "no NaN or Infinity in the report");
}

// ------------------------------------------------------------

test("residency comes from the home state, then the residency answer", () => {
  assert.equal(residencyFor({ homeState: "TL", residency: "nonresident" }, "TL").residency, "resident");
  assert.equal(residencyFor({ homeState: "TX", residency: "resident" }, "TL").residency, "nonresident");
  assert.equal(residencyFor({ homeState: "", residency: "resident" }, "TL").residency, "resident");
  const unknown = residencyFor({ homeState: "", residency: "" }, "TL");
  assert.equal(unknown.residency, "nonresident");
  assert.match(unknown.basis, /no home state/);
});

test("combos follow the member's order and skip species without a season or data", () => {
  const { deep, overflow } = selectCombos({ states: ["nowhere", "testland"], species: ["lion", "sheep", "elk", "moose"] }, STATES);
  assert.deepEqual(deep, [
    { slug: "testland", species: "sheep" },
    { slug: "testland", species: "elk" },
  ]);
  assert.deepEqual(overflow, []);
});

test("key dates: the coming cycle's dates, last cycle's for steps not yet published", () => {
  const c = build().combos[0];
  const d = c.dates;
  assert.equal(d.planCycle, 2027);
  assert.equal(d.nextApplication?.label, "Primary draw application deadline");
  assert.equal(d.nextApplication?.status, "rule");
  // Landowner and nonresident-only dates aren't the member's main application.
  assert.ok(d.upcoming.some((r) => r.label === "Landowner application deadline"));
  assert.ok(!d.upcoming.some((r) => r.label === "Nonresident application period"));
  // 2026 results and payment shown for reference only; the 2026 application isn't (2027's is known).
  assert.deepEqual(
    d.reference.map((r) => [r.label, r.status]),
    [
      ["Draw results posted", "reference"],
      ["License payment deadline", "reference"],
    ]
  );
  assert.equal(d.referenceCycle, 2026);
});

test("key dates: nothing published for the coming cycle shows last cycle's application", () => {
  const r = build({ species: ["sheep"] });
  const d = r.combos[0].dates;
  assert.equal(d.nextApplication, null);
  assert.equal(d.lastApplication?.label, "Sheep draw application deadline");
  assert.equal(d.planCycle, 2027);
  assert.equal(r.glance[0].status, "reference");
  assert.match(r.takeaways[0].lead, /2027 application dates aren't published yet/);
});

test("seasons: the plan year, the member's methods, general seasons only", () => {
  const s = build().combos[0].seasons;
  assert.equal(s.year, 2027);
  assert.equal(s.forPlanCycle, true);
  assert.equal(s.methodFiltered, true);
  assert.deepEqual(
    s.rows.map((r) => r.label),
    ["First rifle season"]
  );
});

test("fees: the residency's lines, the plan year when published, other species' lines dropped", () => {
  const f = build().combos[0].fees;
  const items = f.rows.map((r) => `${r.item} ${r.amount} ${r.licenseYear} ${r.group}`);
  assert.deepEqual(items, ["Elk preference point 5 2026 apply", "Application fee 10 2026 apply", "Hunting license 40 2026 general", "Elk license 65 2027 species"]);
  assert.deepEqual(f.speciesRange, { min: 65, max: 65, count: 1 });
});

test("units: matched from the answer, hunts filtered to the member's methods, odds at their points", () => {
  const r = build();
  const c = r.combos[0];
  assert.equal(c.points, 4);
  assert.equal(c.pointsFrom, "answer");
  assert.equal(c.units.length, 1);
  const u = c.units[0];
  assert.equal(u.unit, "61");
  assert.equal(u.name, "Uncompahgre");
  assert.equal(u.drawYear, 2026);
  assert.deepEqual(
    u.hunts.map((h) => h.huntCode),
    ["EF061O1R", "EM061O1R"]
  );
  assert.match(u.methodNote || "", /1 other GMU 61 hunt is on HuntScout/);
  const bull = u.hunts.find((h) => h.huntCode === "EM061O1R")!;
  assert.deepEqual([bull.applicants, bull.drawn, bull.odds, bull.minPoints], [100, 10, 10, 9]);
  assert.deepEqual(bull.atPoints, { points: 4, applicants: 20, drawn: 0, pct: 0 });
  assert.equal(bull.antlerless, false);
  assert.deepEqual(bull.harvest && [bull.harvest.year, bull.harvest.pct, bull.harvest.matchedBy], [2025, 70, "hunt"]);
  // Harvest trend: the agency's all-methods series by year, ignoring per-hunt rows.
  assert.deepEqual(
    u.harvest?.points.map((p) => [p.year, p.success]),
    [
      [2023, 53],
      [2024, 56],
    ]
  );
  assert.equal(u.harvest?.label, "All Manners of Take");
  // Draw history for the same hunt codes.
  assert.deepEqual(u.history.years, [2025, 2026]);
  const drawSrc = r.sources.find((x) => x.title === "Testland Draw Recap")!.n;
  assert.deepEqual(u.history.rows.find((h) => h.huntCode === "EM061O1R")?.cells, [
    { odds: 10, minPoints: 8, src: drawSrc },
    { odds: 10, minPoints: 9, src: drawSrc },
  ]);
  assertCitations(r);
});

test("saved point balances win over the free-text answer", () => {
  const c = build({}, { savedPoints: { "testland.elk": 9 } }).combos[0];
  assert.equal(c.points, 9);
  assert.equal(c.pointsFrom, "saved");
  assert.deepEqual(c.units[0].hunts.find((h) => h.huntCode === "EM061O1R")?.atPoints, { points: 9, applicants: 10, drawn: 10, pct: 100 });
});

test("shortlist: hunts drawn at the member's level, antlerless listed separately", () => {
  const s = build({ units: "" }).combos[0].shortlist!;
  assert.equal(s.drawYear, 2026);
  const codes = s.rows.map((r) => [r.huntCode, r.antlerless]);
  assert.deepEqual(codes, [
    ["EM062O1R", false],
    ["EF061O1R", true],
  ]);
  assert.equal(s.atLevelPrimary, 1);
  assert.equal(s.atLevelAntlerless, 1);
});

test("no units given: top units by harvest success, small samples left out", () => {
  const c = build({ units: "" }).combos[0];
  assert.deepEqual(c.units, []);
  assert.equal(c.topUnits?.year, 2024);
  assert.deepEqual(
    c.topUnits?.rows.map((r) => [r.unit, r.success]),
    [
      ["063", 70],
      ["061", 56],
    ]
  );
});

test("takeaways and glance are built only from the sections' data", () => {
  const r = build();
  assert.ok(r.takeaways.length >= 3 && r.takeaways.length <= 5);
  assert.match(r.takeaways[0].lead, /^Testland elk: apply by Apr 6, 2027\./);
  assert.match(r.takeaways[1].lead, /GMU 61 \(Uncompahgre\): lowest resident points drawn in 2026 were 9 for bull and either-sex hunts and 0 for antlerless/);
  assert.match(r.takeaways[1].text, /^Residents with 4 or fewer points drew in 0 of 1 listed bull and either-sex hunts and 1 of 1 antlerless/);
  assert.deepEqual(
    r.glance.map((g) => g.label),
    ["Landowner application deadline", "Primary draw application deadline", "Preference-point-only application deadline"]
  );
});

test("the checklist follows the agency's own steps", () => {
  const list = build().combos[0].checklist;
  assert.ok(list.some((x) => x.startsWith("Apply: Primary draw application deadline, Apr 6, 2027 (tentative, set by agency rule)")));
  assert.ok(list.some((x) => x.startsWith("Point-only option: Preference-point-only application deadline")));
  assert.ok(list.some((x) => x.startsWith("Results: Draw results posted, May 28, 2026 (last cycle's date)")));
  assert.ok(list.includes("Residents must hold a hunting license before applying."));
});

test("sparse answers: no species, no live states, coming-soon states", () => {
  const noSpecies = build({ species: [] });
  assert.deepEqual(noSpecies.combos, []);
  assert.deepEqual(
    noSpecies.compact.map((x) => x.speciesLabel),
    ["Elk", "Bighorn Sheep"]
  );
  const elsewhere = build({ states: ["texas"], homeState: "TX" });
  assert.deepEqual(elsewhere.combos, []);
  assert.deepEqual(elsewhere.comingSoon, ["Texas"]);
  assert.deepEqual(
    elsewhere.compact.map((x) => [x.stateName, x.residency]),
    [["Testland", "nonresident"]]
  );
  const notCovered = build({ species: ["elk", "lion", "moose"] });
  assert.equal(notCovered.combos.length, 1);
  assert.deepEqual(notCovered.notCovered, ["Testland mountain lion: TWD lists no season or license for it.", "Testland moose: not in HuntScout's Testland data yet."]);
});

test("free-text we can't read is reported back, not guessed", () => {
  const r = build({ states: ["testland"], units: "unit 999", points: "lots of points" });
  assert.ok(r.readNotes.some((n) => /Not matched to a published unit for your states and species: 999/.test(n)));
  assert.ok(r.readNotes.some((n) => /No point balance for Testland elk/.test(n)));
  assert.equal(r.combos[0].points, null);
});

test("antlerless detection uses the sex code, else the description", () => {
  assert.equal(isAntlerless({ sex: "female", description: "x" }), true);
  assert.equal(isAntlerless({ sex: "either", description: "antlerless" }), false);
  assert.equal(isAntlerless({ description: "038-4: ANTLERLESS ELK" }), true);
  assert.equal(isAntlerless({ description: "117-3: SPIKE OR ANTLERLESS" }), false);
  assert.equal(isAntlerless({ description: "Any ram" }), false);
  assert.equal(isAntlerless({ description: "Cow/calf elk" }), true);
});

test("a main drawing that also takes DAV applications is the member's application; other unpublished applications stay listed", () => {
  const info: SpeciesInfo = {
    ...ELK,
    keyDates: [
      kd({ label: "Controlled hunt first application period", start: "2026-05-01", end: "2026-06-05", cycle: 2026 }),
      kd({ label: "Nonresident general season tag drawing — first application period (also DAV draw)", start: "2026-12-05", end: "2026-12-15", residency: "nonresident" }),
      kd({ label: "DAV tag drawing application", date: "2026-12-20", residency: "nonresident" }),
      kd({ label: "Draw results posted", date: "2026-06-20", cycle: 2026 }),
    ],
  };
  const st: ReportStateInput = { data: { ...TL, species: [info] }, drawSpecies: ["elk"], harvestSpecies: [] };
  const r = buildReport({ name: null, prefs: prefs({ homeState: "TX", residency: "nonresident", units: "", points: "" }), today: "2026-11-04", states: [st], tables });
  const d = r.combos[0].dates;
  assert.equal(d.nextApplication?.label, "Nonresident general season tag drawing — first application period (also DAV draw)");
  assert.deepEqual(
    d.otherApplications.map((x) => [x.label, x.status]),
    [["Controlled hunt first application period", "reference"]]
  );
  assert.ok(d.reference.some((x) => x.label === "Controlled hunt first application period"));
  assert.match(r.takeaways[0].lead, /^Testland elk: apply by Dec 15, 2026\./);
  const list = r.combos[0].checklist;
  assert.ok(list.some((x) => x.startsWith("Apply: Nonresident general season tag drawing")));
  assert.ok(list.some((x) => x.startsWith("Also apply: Controlled hunt first application period. 2027 dates not yet published; last cycle: May 1 – Jun 5, 2026")), list.join("\n"));
  assert.deepEqual(
    r.glance.map((g) => [g.label, g.status]),
    [
      ["Nonresident general season tag drawing — first application period (also DAV draw)", "confirmed"],
      ["DAV tag drawing application", "confirmed"],
      ["Controlled hunt first application period", "reference"],
    ]
  );
});

test("a single date that opens applications isn't called a deadline", () => {
  const info: SpeciesInfo = {
    ...ELK,
    keyDates: [
      kd({ label: "2027 special hunt permit applications go on sale", kind: "application", date: "2026-12-01" }),
      kd({ label: "Special permit application submission period", start: "2026-04-20", end: "2026-05-27", cycle: 2026 }),
    ],
  };
  const r = buildReport({ name: null, prefs: prefs({ units: "", points: "" }), today: "2026-11-04", states: [{ data: { ...TL, species: [info] }, drawSpecies: ["elk"], harvestSpecies: [] }], tables });
  assert.match(r.takeaways[0].lead, /^Testland elk: applications open Dec 1, 2026\./);
  assert.deepEqual(
    r.combos[0].dates.otherApplications.map((x) => x.label),
    ["Special permit application submission period"]
  );
});

test("plan-at-a-glance dates: soonest deadline first, whatever order the member picked", () => {
  const OTHER: StateData = {
    ...TL,
    slug: "otherland",
    name: "Otherland",
    abbrev: "OL",
    species: [{ ...ELK, keyDates: [kd({ label: "Elk application deadline", date: "2026-12-10" })] }],
  };
  const r = buildReport({
    name: null,
    prefs: prefs({ states: ["testland", "otherland"], units: "", points: "" }),
    today: "2026-11-04",
    states: [...STATES, { data: OTHER, drawSpecies: ["elk"], harvestSpecies: [] }],
    tables,
  });
  assert.deepEqual(
    r.combos.map((c) => c.stateName),
    ["Testland", "Otherland"]
  );
  assert.match(r.takeaways[0].lead, /^Otherland elk: apply by Dec 10, 2026\./);
  assert.match(r.takeaways[1].lead, /^Testland elk: apply by Apr 6, 2027\./);
});

test("shortlist: private-land-only hunts after the public ones, with a note", () => {
  const rows: DrawRecord[] = [
    draw({ huntCode: "EE070P1R", year: 2026, units: ["70"], method: "rifle", sex: "either", description: "EE070P1R: elk, either sex, GMU 70, private-land-only hunt 1 (P1)", resident: { applicants: 5, drawn: 5, minPoints: 0 } }),
    draw({ huntCode: "EE071O1R", year: 2026, units: ["71"], method: "rifle", sex: "either", description: "EE071O1R: elk, either sex, GMU 71, season 1", resident: { applicants: 50, drawn: 40, minPoints: 0 } }),
  ];
  const r = buildReport({ name: null, prefs: prefs({ units: "" }), today: "2026-11-04", states: STATES, tables: () => ({ draw: rows, harvest: [] }) });
  const s = r.combos[0].shortlist!;
  assert.deepEqual(
    s.rows.map((x) => x.huntCode),
    ["EE071O1R", "EE070P1R"]
  );
  assert.ok(s.notes.some((n) => /limits to private land are listed after the others/.test(n)));
  assert.equal(isPrivateLandOnly({ description: "Unit 4 private land only" }), true);
  assert.equal(isPrivateLandOnly({ description: "Controlled Hunt Antlered — Hunt Area 76: Private land within Unit 76" }), true);
  assert.equal(isPrivateLandOnly({ description: "That portion of Unit 1 on or within one mile of private agricultural land" }), false);
});

test("seasons: special-area hunts printed without a hunt number aren't shown as the general seasons", () => {
  const special = (label: string, start: string) => ({ species: "elk" as const, label, method: "rifle" as const, start, end: "2027-12-01", year: 2027, note: "Draw hunt TWD prints without a hunt number (special-area/eligibility hunt).", sourceId: "d-dates" });
  const mixed = buildReport({ name: null, prefs: prefs(), today: "2026-11-04", states: [{ ...STATES[0], data: { ...TL, seasons: [...TL.seasons!, special("Tribal area hunt", "2027-11-20")] } }], tables }).combos[0].seasons;
  assert.deepEqual(
    mixed.rows.map((x) => x.label),
    ["First rifle season"]
  );
  assert.equal(mixed.specialOnly, false);
  const only = buildReport({ name: null, prefs: prefs(), today: "2026-11-04", states: [{ ...STATES[0], data: { ...TL, seasons: [special("Tribal area hunt", "2027-11-20")] } }], tables }).combos[0].seasons;
  assert.equal(only.specialOnly, true);
  assert.equal(only.rows.length, 1);
});

// ------------------------------------------------------------
// Real agency data: every figure in a report matches its source row
// ------------------------------------------------------------

const DATA = path.join(process.cwd(), "src", "data", "agency");

function realState(slug: string): ReportStateInput {
  const read = (f: string) => JSON.parse(readFileSync(path.join(DATA, slug, f), "utf8"));
  const drawMeta = read("draw-meta.json");
  const harvestMeta = existsSync(path.join(DATA, slug, "harvest-meta.json")) ? read("harvest-meta.json") : { unitNames: {}, coverage: [], sources: [] };
  const { coverage, sources, ...rest } = drawMeta;
  const list = (k: string) => (existsSync(path.join(DATA, slug, k)) ? readdirSync(path.join(DATA, slug, k)).map((f) => f.replace(/\.json$/, "")) : []);
  return {
    data: { ...rest, unitNames: harvestMeta.unitNames || {}, drawCoverage: coverage || [], harvestCoverage: harvestMeta.coverage || [], sources: [...(sources || []), ...(harvestMeta.sources || [])] },
    drawSpecies: list("draw"),
    harvestSpecies: list("harvest"),
  };
}

function realTables(slug: string, species: string): ReportTables {
  const read = (k: string) => {
    const p = path.join(DATA, slug, k, `${species}.json`);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : [];
  };
  return { draw: read("draw"), harvest: read("harvest") };
}

test("real data: a Colorado report's hunt figures and citations match the agency rows", { skip: !existsSync(path.join(DATA, "colorado", "draw", "elk.json")) }, () => {
  const co = realState("colorado");
  const t = realTables("colorado", "elk");
  const r = buildReport({
    name: "Fictional Member",
    prefs: { ...EMPTY_PREFERENCES, states: ["colorado"], residency: "resident", homeState: "CO", species: ["elk"], units: "GMU 61 and 62", methods: ["rifle"], points: "CO elk 4 preference points" },
    today: "2026-11-04",
    states: [co],
    tables: () => t,
  });
  assertCitations(r);
  const c = r.combos[0];
  assert.equal(c.points, 4);
  assert.deepEqual(
    c.units.map((u) => u.unit),
    ["61", "62"]
  );
  const sourceIds = new Map(co.data.sources.map((s) => [s.url, s.id]));
  for (const u of c.units) {
    for (const h of u.hunts) {
      const row = t.draw.find((d: DrawRecord) => d.huntCode === h.huntCode && d.year === u.drawYear && d.choice === "first") ?? t.draw.find((d: DrawRecord) => d.huntCode === h.huntCode && d.year === u.drawYear);
      assert.ok(row, `${h.huntCode} ${u.drawYear} exists`);
      assert.ok(row!.units.some((x) => sameUnit(x, u.unit)));
      const { stats } = drawStats(row!, "resident");
      assert.equal(h.applicants, stats?.applicants ?? null);
      assert.equal(h.drawn, stats?.drawn ?? null);
      assert.equal(h.odds, oddsOf(stats));
      // The hunt's citation is the row's own document.
      assert.equal(sourceIds.get(r.sources[h.src! - 1].url), row!.sourceId);
    }
  }
});

test("real data: an Idaho nonresident's next application is the general-season tag drawing", { skip: !existsSync(path.join(DATA, "idaho", "draw-meta.json")) }, () => {
  const id = realState("idaho");
  const r = buildReport({
    name: null,
    prefs: { ...EMPTY_PREFERENCES, states: ["idaho"], residency: "nonresident", homeState: "TX", species: ["elk"] },
    today: "2026-11-04",
    states: [id],
    tables: (slug, sp) => realTables(slug, sp),
  });
  assertCitations(r);
  const d = r.combos[0].dates;
  const want = id.data.species.find((s) => s.species === "elk")!.keyDates.find((k) => /general season deer\/elk tag drawing — first application/i.test(k.label));
  if (want && (want.end || want.date || "") >= "2026-11-04") {
    assert.equal(d.nextApplication?.label, want.label);
    assert.ok(r.takeaways.some((t) => t.lead.startsWith("Idaho elk: apply by")));
  }
});
