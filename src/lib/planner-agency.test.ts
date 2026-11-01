// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DrawRecord, KeyDate, SpeciesInfo } from "@/data/agency/schema";
import { buildAgencyHunt, feesFor, isApplicationLabel, nextApplicationDeadline, oddsNote, sanitizeDrawRow, type PlannerState } from "@/lib/planner-agency";

const kd = (k: Partial<KeyDate> & { label: string }): KeyDate => ({ cycle: 2027, status: "confirmed", sourceId: "d-dates", ...k });

const ELK: SpeciesInfo = {
  species: "elk",
  drawSystem: "preference",
  drawSystemSummary: "",
  pointsMatter: true,
  sourceIds: ["d-dates"],
  keyDates: [
    kd({ label: "Primary draw application period", start: "2026-03-01", end: "2026-04-07", cycle: 2026 }),
    kd({ label: "Preference-point-only application", start: "2027-03-01", end: "2027-04-07" }),
    kd({ label: "Primary draw results posted", date: "2027-05-28" }),
    kd({ label: "Primary draw license payment deadline", date: "2027-06-12" }),
    kd({ label: "Deadline to buy drawn controlled hunt tags", date: "2026-12-01" }),
    kd({ label: "Leftover licenses on sale", date: "2026-11-15" }),
    kd({ label: "Nonresident general season tag drawing — first application period", start: "2026-12-05", end: "2026-12-15" }),
    kd({ label: "Resident landowner application deadline", date: "2027-01-31" }),
    kd({ label: "Primary draw application period", start: "2027-03-01", end: "2027-04-07", note: "Apply by 8 p.m. MT." }),
  ],
};

test("application labels exclude point-only, payment, buy, leftover and results dates", () => {
  assert.ok(isApplicationLabel("Primary draw application period"));
  assert.ok(isApplicationLabel("Pronghorn & elk draw application deadline (11:59 p.m. Arizona time)"));
  assert.ok(isApplicationLabel("Secondary draw application period (no preference points)"));
  assert.equal(isApplicationLabel("Preference-point-only application (enter E-P-999-99-P)"), false);
  assert.equal(isApplicationLabel("Bonus point only applications"), false);
  assert.equal(isApplicationLabel("Bonus point purchase without applying"), false);
  assert.equal(isApplicationLabel("Primary draw license payment deadline"), false);
  assert.equal(isApplicationLabel("Primary draw surrender deadline"), false);
  assert.equal(isApplicationLabel("Nonresident draw — deadline to buy tags drawn in first period"), false);
  assert.equal(isApplicationLabel("Leftover (first-come) applications accepted by mail"), false);
  assert.equal(isApplicationLabel("Successful applicants notified by"), false);
  assert.equal(isApplicationLabel("Draw results posted"), false);
});

test("next application deadline: soonest open one for the residency, current cycle or later", () => {
  // Nonresident on Oct 31: the December nonresident window is next.
  const nr = nextApplicationDeadline(ELK, "nonresident", "2026-10-31")!;
  assert.equal(nr.label, "Nonresident general season tag drawing — first application period");
  assert.equal(nr.end, "2026-12-15");
  // Residents skip nonresident-only labels and get the resident landowner date first.
  assert.equal(nextApplicationDeadline(ELK, "resident", "2026-10-31")!.label, "Resident landowner application deadline");
  // After those, the 2027 primary draw (not the point-only line on the same dates).
  const later = nextApplicationDeadline(ELK, "resident", "2027-02-01")!;
  assert.equal(later.label, "Primary draw application period");
  assert.equal(later.cycle, 2027);
  assert.equal(later.end, "2027-04-07");
  // The last day still counts; the day after it doesn't.
  assert.equal(nextApplicationDeadline(ELK, "resident", "2027-04-07")!.end, "2027-04-07");
  assert.equal(nextApplicationDeadline(ELK, "resident", "2027-04-08"), null);
  // A past cycle's dates are never used, and nothing published means null.
  assert.equal(nextApplicationDeadline({ keyDates: [kd({ label: "Application deadline", date: "2027-01-10", cycle: 2025 })] }, "resident", "2026-10-31"), null);
  assert.equal(nextApplicationDeadline({ keyDates: [] }, "resident", "2026-10-31"), null);
  // A controlled hunt isn't applied for in a general-season tag drawing.
  assert.equal(nextApplicationDeadline(ELK, "nonresident", "2026-10-31", "Controlled Hunt Antlered — Unit 11")!.label, "Primary draw application period");
  assert.equal(nextApplicationDeadline(ELK, "nonresident", "2026-10-31", "General season elk tag")!.end, "2026-12-15");
  const special: Pick<SpeciesInfo, "keyDates"> = {
    keyDates: [
      kd({ label: "2027 sportsman permit drawing application period (bull elk)", start: "2026-10-20", end: "2026-11-10" }),
      kd({ label: "Nonresident draw — second application period", start: "2027-02-05", end: "2027-02-15" }),
      kd({ label: "Big game application period", start: "2027-03-01", end: "2027-04-20" }),
    ],
  };
  assert.equal(nextApplicationDeadline(special, "resident", "2026-10-31", "Limited-entry bull elk, Book Cliffs")!.label, "Big game application period");
  assert.equal(nextApplicationDeadline(special, "resident", "2026-10-31", "Sportsman permit, bull elk, statewide")!.end, "2026-11-10");
  const bear: Pick<SpeciesInfo, "keyDates"> = { keyDates: [kd({ label: "Spring black bear controlled hunt application period", start: "2027-01-15", end: "2027-02-15" })] };
  assert.equal(nextApplicationDeadline(bear, "resident", "2026-10-31", "Fall Black Bear Controlled Hunt — Hunt Area 1-1"), null);
  assert.equal(nextApplicationDeadline(bear, "resident", "2026-10-31", "Controlled Hunt — Hunt Area 22-1")!.end, "2027-02-15");
  // Without a hunt (generic listing) every application date counts.
  assert.equal(nextApplicationDeadline(special, "resident", "2026-10-31")!.end, "2026-11-10");
});

const STATE: PlannerState = {
  slug: "colorado",
  name: "Colorado",
  agency: { name: "Colorado Parks and Wildlife", shortName: "CPW", url: "https://cpw.state.co.us" },
  unitTerm: "GMU",
  species: [ELK],
  sources: [
    { id: "d-dates", title: "Big game brochure", publisher: "CPW", url: "https://cpw.state.co.us/brochure.pdf", retrieved: "2026-10-01" },
    { id: "d-draw", title: "2025 draw recap", publisher: "CPW", url: "https://cpw.state.co.us/recap.pdf", retrieved: "2026-10-01" },
    { id: "d-fees", title: "Fee chart", publisher: "CPW", url: "https://cpw.state.co.us/fees.pdf", retrieved: "2026-10-01" },
  ],
  fees: [
    { species: null, item: "Application fee", residency: "resident", amountUsd: 8.93, licenseYear: 2026, sourceId: "d-fees" },
    { species: "elk", item: "Elk license — resident adult", residency: "resident", amountUsd: 70.4, licenseYear: 2026, sourceId: "d-fees" },
    { species: "elk", item: "Elk license — resident adult", residency: "resident", amountUsd: 72, licenseYear: 2027, sourceId: "d-fees" },
    { species: "elk", item: "Elk license — nonresident bull", residency: "nonresident", amountUsd: 845.16, licenseYear: 2026, sourceId: "d-fees" },
    { species: "mule-deer", item: "Deer license — resident adult", residency: "resident", amountUsd: 51.25, licenseYear: 2026, sourceId: "d-fees" },
    { species: "elk", item: "Elk tag", residency: "resident", amountUsd: 30.75, licenseYear: 2026, note: "With Price Lock.", sourceId: "d-fees" },
    { species: "elk", item: "Elk tag", residency: "resident", amountUsd: 36.75, licenseYear: 2026, note: "Without Price Lock.", sourceId: "d-fees" },
  ],
};

test("fees: species + all-species lines for the residency, planned cycle's year when published", () => {
  const f2027 = feesFor(STATE, "elk", "resident", 2027);
  assert.deepEqual(
    f2027.map((f) => [f.item, f.amountUsd, f.licenseYear]),
    [
      ["Elk license — resident adult", 72, 2027],
      ["Elk tag", 30.75, 2026],
      ["Elk tag", 36.75, 2026],
      ["Application fee", 8.93, 2026],
    ]
  );
  assert.equal(f2027[3].speciesSpecific, false);
  assert.equal(f2027[0].sourceUrl, "https://cpw.state.co.us/fees.pdf");
  // No cycle known: newest license year.
  assert.equal(feesFor(STATE, "elk", "resident", null)[0].licenseYear, 2027);
  // Cycle 2026: that year's price.
  assert.equal(feesFor(STATE, "elk", "resident", 2026)[0].amountUsd, 70.4);
  assert.deepEqual(feesFor(STATE, "elk", "nonresident", 2027).map((f) => f.item), ["Elk license — nonresident bull"]);
});

const ROW: DrawRecord = {
  species: "elk",
  year: 2025,
  huntCode: "EE001E1R",
  units: ["1"],
  description: "EE001E1R: elk, either sex, GMU 1, early season 1, rifle",
  method: "rifle",
  choice: "first",
  resident: { applicants: 173, drawn: 8, minPoints: 20 },
  nonresident: { applicants: 204, drawn: 1, minPoints: 29 },
  total: { quota: 11, applicants: 411, drawn: 9 },
  sourceId: "d-draw",
};

test("odds note repeats the row's published counts", () => {
  assert.equal(oddsNote(ROW, "resident", true), "2025 draw, residents: 8 of 173 first-choice applicants drawn (4.6%); lowest points drawn 20.");
  assert.equal(oddsNote(ROW, "nonresident", false), "2025 draw, nonresidents: 1 of 204 first-choice applicants drawn (0.5%).");
  const pooled: DrawRecord = { ...ROW, choice: "all", resident: null, nonresident: null, total: { quota: 5, applicants: 50, drawn: 5 } };
  assert.equal(oddsNote(pooled, "resident", false), "2025 draw, all applicants (one combined pool): 5 of 50 applicants drawn (10%); quota 5.");
  const residentOnly: DrawRecord = { ...ROW, nonresident: null };
  assert.equal(oddsNote(residentOnly, "nonresident", false), "2025 draw: no nonresident figures published for this hunt.");
});

test("buildAgencyHunt fills deadline, cycle, source links and fees from agency data", () => {
  const h = buildAgencyHunt({ state: STATE, info: ELK, row: ROW, residency: "resident", today: "2027-02-01", now: "2027-02-01T12:00:00.000Z", id: "abc123" });
  assert.equal(h.state, "Colorado");
  assert.equal(h.unit, "GMU 1");
  assert.equal(h.season, "rifle");
  assert.equal(h.applicationDeadline, "2027-04-07");
  assert.equal(h.agency!.deadline!.cycle, 2027);
  assert.equal(h.agency!.deadline!.start, "2027-03-01");
  assert.equal(h.agency!.deadline!.note, "Apply by 8 p.m. MT.");
  assert.equal(h.agency!.deadline!.sourceUrl, "https://cpw.state.co.us/brochure.pdf");
  assert.equal(h.agency!.sourceUrl, "https://cpw.state.co.us/recap.pdf");
  assert.equal(h.agency!.drawYear, 2025);
  assert.equal(h.agency!.fees[0].licenseYear, 2027);
  assert.match(h.agency!.oddsNote, /^2025 draw, residents: 8 of 173/);

  const none = buildAgencyHunt({ state: STATE, info: { ...ELK, keyDates: [] }, row: ROW, residency: "resident", today: "2026-10-31", now: "x", id: "abc124" });
  assert.equal(none.agency!.deadline, null);
  assert.equal(none.applicationDeadline, "");
});

test("sanitizeDrawRow keeps a well-formed row and rejects mismatches", () => {
  const r = sanitizeDrawRow({ ...ROW, byPoints: [{ points: 3, resident: { applicants: 4, drawn: 1 } }, { points: "x" }] }, "elk")!;
  assert.equal(r.huntCode, "EE001E1R");
  assert.equal(r.resident!.applicants, 173);
  assert.deepEqual(r.byPoints, [{ points: 3, resident: { applicants: 4, drawn: 1 }, nonresident: null }]);
  assert.equal(sanitizeDrawRow(ROW, "mule-deer"), null);
  assert.equal(sanitizeDrawRow({ ...ROW, year: "2025" }, "elk"), null);
  assert.equal(sanitizeDrawRow({ ...ROW, huntCode: "" }, "elk"), null);
  assert.equal(sanitizeDrawRow({ ...ROW, resident: { applicants: -5, drawn: 1 } }, "elk")!.resident!.applicants, undefined);
});
