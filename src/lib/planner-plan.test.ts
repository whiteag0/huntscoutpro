// Run with: npm test
// Date assembly per hunt, cycle selection, season matching, and the timeline/steps built from them.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DrawRecord, KeyDate, SeasonDate, SpeciesInfo } from "@/data/agency/schema";
import {
  buildPlannedHunt,
  fitFor,
  huntSeasons,
  keyDateKind,
  needsDrawingChoice,
  parseSeasonText,
  planAgency,
  relevantKeyDates,
  requirementsOf,
  selectCycle,
  type PlannerState,
} from "@/lib/planner-agency";
import { linkOf } from "@/lib/planner-schema";
import { countdown, cycleInfo, huntSteps, huntTimeline, nextForHunt, upcomingDeadlines } from "@/lib/planner-timeline";

const kd = (k: Partial<KeyDate> & { label: string }): KeyDate => ({ cycle: 2026, status: "confirmed", sourceId: "d-dates", ...k });
const TODAY = "2026-10-31";

test("key date kinds: the data's own kind wins, else read from the label", () => {
  const cases: [string, string][] = [
    ["Primary draw application period (apply by 8 p.m. MT on the last day)", "application"],
    ["Preference-point-only application (enter E-P-999-99-P as first choice)", "points"],
    ["Second chance to apply for big game bonus/preference points only", "points"],
    ["Primary draw results posted to CPW accounts", "results"],
    ["Primary draw surrender deadline (11:59 p.m. MT)", "surrender"],
    ["Primary draw license payment deadline (11:59 p.m. MT)", "payment"],
    ["Deadline to buy drawn controlled hunt tags", "payment"],
    ["Secondary draw application period (no preference points)", "leftover"],
    ["Second drawing results posted; leftover tags on sale 10 a.m. MT", "leftover"],
    ["Leftover limited and over-the-counter licenses on sale (9 a.m. MT)", "leftover"],
    ["General-season archery elk permits on sale (OTC)", "license-sale"],
    ["Application withdrawal deadline", "application-change"],
    ["Spring black bear controlled hunt application period", "application"],
    ["Hunter orientation class", "other"],
  ];
  for (const [label, kind] of cases) assert.equal(keyDateKind({ label }), kind, label);
  assert.equal(keyDateKind({ label: "Primary draw application period", kind: "points" }), "points");
});

const CPW_2026: KeyDate[] = [
  kd({ label: "Primary draw application period", start: "2026-03-01", end: "2026-04-07" }),
  kd({ label: "Preference-point-only application", start: "2026-03-01", end: "2026-04-07" }),
  kd({ label: "Primary draw results posted", start: "2026-05-26", end: "2026-05-29" }),
  kd({ label: "Primary draw license payment deadline", date: "2026-06-12" }),
  kd({ label: "Secondary draw application period", start: "2026-06-18", end: "2026-06-30" }),
  kd({ label: "Leftover licenses on sale", date: "2026-08-04" }),
];

test("cycle: every 2026 date passed and no 2027 dates -> plan 2027, show 2026 as not published", () => {
  const pick = selectCycle(CPW_2026, TODAY);
  assert.equal(pick.planCycle, 2027);
  assert.equal(pick.datesCycle, 2026);
  assert.equal(pick.published, false);
  assert.equal(pick.dates.length, 6);
  // Dates are in calendar order.
  assert.deepEqual(pick.dates.map((d) => d.end), ["2026-04-07", "2026-04-07", "2026-05-29", "2026-06-12", "2026-06-30", "2026-08-04"]);
});

test("cycle: the soonest cycle whose application hasn't passed is the one planned", () => {
  const withNext = [...CPW_2026, kd({ label: "Primary draw application period", start: "2027-03-01", end: "2027-04-07", cycle: 2027, status: "tentative" })];
  const pick = selectCycle(withNext, TODAY);
  assert.deepEqual([pick.planCycle, pick.datesCycle, pick.published], [2027, 2027, true]);
  assert.equal(pick.dates.length, 1);
  assert.equal(pick.dates[0].status, "tentative");
  // Mid-window: the 2026 application is still open on Apr 1, 2026.
  assert.equal(selectCycle(withNext, "2026-04-01").planCycle, 2026);
  // The last day counts; the day after moves on.
  assert.equal(selectCycle(withNext, "2026-04-07").planCycle, 2026);
  assert.equal(selectCycle(withNext, "2026-04-08").planCycle, 2027);
  // Second-round windows don't keep a cycle "open".
  assert.equal(selectCycle(CPW_2026, "2026-06-20").published, false);
  // Nothing published at all.
  assert.deepEqual(selectCycle([], TODAY), { planCycle: null, datesCycle: null, published: false, dates: [] });
  // A cycle with no application dates is open while any of its dates is.
  assert.equal(selectCycle([kd({ label: "Licenses on sale", date: "2027-01-05", cycle: 2027 })], TODAY).published, true);
});

const IDFG_BEAR: Pick<SpeciesInfo, "keyDates"> = {
  keyDates: [
    kd({ label: "Spring black bear controlled hunt application period", start: "2027-01-15", end: "2027-02-15", cycle: 2027 }),
    kd({ label: "Fall black bear controlled hunt application period", start: "2026-05-01", end: "2026-06-05" }),
    kd({ label: "Deadline to buy drawn fall bear controlled hunt tags", date: "2026-08-01" }),
    kd({ label: "Nonresident hound hunter permit drawing", date: "2026-12-10", cycle: 2027, residency: "nonresident" }),
  ],
};

test("relevant dates: spring/fall drawings, residency field, and asking when the hunt doesn't say", () => {
  const unknown = fitFor("draw", "Controlled Hunt — Hunt Area 22-1: All of Units 22 and 31.");
  assert.equal(needsDrawingChoice(IDFG_BEAR, unknown), true);
  // Neither drawing's dates are assumed.
  assert.deepEqual(relevantKeyDates(IDFG_BEAR, "resident", unknown), []);
  const spring = fitFor("draw", "Controlled Hunt — Hunt Area 22-1", null, "spring");
  assert.equal(needsDrawingChoice(IDFG_BEAR, spring), false);
  assert.deepEqual(relevantKeyDates(IDFG_BEAR, "resident", spring).map((k) => k.label), ["Spring black bear controlled hunt application period"]);
  // KeyDate.residency limits a date even when the label doesn't say.
  assert.equal(relevantKeyDates(IDFG_BEAR, "nonresident", spring).length, 2);
  // Season dates settle it without asking.
  const fall = fitFor("draw", "Controlled Hunt — Hunt Area 1-1", { seasonDates: "2026-09-15 to 2026-10-09" });
  assert.equal(fall.season, "fall");
  assert.deepEqual(relevantKeyDates(IDFG_BEAR, "resident", fall).map((k) => k.label), [
    "Fall black bear controlled hunt application period",
    "Deadline to buy drawn fall bear controlled hunt tags",
  ]);
});

test("relevant dates: separate drawings the hunt names, OTC licenses, and draw hunts skip OTC sale dates", () => {
  const utah: Pick<SpeciesInfo, "keyDates"> = {
    keyDates: [
      kd({ label: "Big game draw application period", start: "2026-03-19", end: "2026-04-23" }),
      kd({ label: "Antlerless draw application period", start: "2026-06-09", end: "2026-06-23" }),
      kd({ label: "2027 sportsman permit drawing application period (bull elk)", start: "2026-10-20", end: "2026-11-10", cycle: 2027 }),
      kd({ label: "General-season any bull elk permits on sale (OTC)", date: "2026-07-09" }),
    ],
  };
  const labels = (fit: ReturnType<typeof fitFor>) => relevantKeyDates(utah, "resident", fit).map((k) => k.label);
  assert.deepEqual(labels(fitFor("draw", "Limited-entry bull elk - Book Cliffs")), ["Big game draw application period"]);
  // An antlerless hunt is in the antlerless draw only.
  assert.deepEqual(labels(fitFor("draw", "Antlerless Elk - Box Elder, Grouse Creek - Any Legal Weapon")), ["Antlerless draw application period"]);
  assert.deepEqual(labels(fitFor("draw", "Sportsman permit, bull elk, statewide")), ["2027 sportsman permit drawing application period (bull elk)"]);
  assert.deepEqual(labels(fitFor("otc", "General season / over-the-counter license")), ["General-season any bull elk permits on sale (OTC)"]);
});

test("season text: ISO ranges are read, anything else is left as printed", () => {
  assert.deepEqual(parseSeasonText("2026-08-18 to 2026-08-30 (Archery, Muzzleloader, Shotgun)"), [{ start: "2026-08-18", end: "2026-08-30", label: "Archery, Muzzleloader, Shotgun" }]);
  assert.deepEqual(parseSeasonText("2026-11-06 to 2027-01-31"), [{ start: "2026-11-06", end: "2027-01-31" }]);
  assert.equal(parseSeasonText("2026-09-01 to 2026-09-10; 2026-10-01 to 2026-10-05")!.length, 2);
  assert.equal(parseSeasonText("Nov. 21 - Nov. 27"), null);
  assert.equal(parseSeasonText("Sep 25 - Oct 1, 2026"), null);
  assert.equal(parseSeasonText("2026-09-01 to 2026-09-10 except Sundays"), null);
  assert.equal(parseSeasonText("2026-09-10 to 2026-09-01"), null);
  assert.equal(parseSeasonText(undefined), null);
});

const ROW: DrawRecord = {
  species: "elk",
  year: 2026,
  huntCode: "EE061O1R",
  units: ["061"],
  description: "EE061O1R: elk, either sex, GMU 61, first rifle season",
  method: "rifle",
  choice: "first",
  resident: { applicants: 900, drawn: 90, minPoints: 6 },
  nonresident: { applicants: 400, drawn: 10, minPoints: 9 },
  sourceId: "d-draw",
};
const SEASONS: SeasonDate[] = [
  { species: "elk", label: "Archery", start: "2026-09-02", end: "2026-09-30", year: 2026, sourceId: "d-brochure" },
  { species: "elk", label: "First rifle season", start: "2026-10-14", end: "2026-10-18", year: 2026, sourceId: "d-brochure" },
  { species: "elk", label: "First rifle season", start: "2027-10-13", end: "2027-10-17", year: 2027, sourceId: "d-brochure-27" },
  { species: "elk", label: "Unit 61 rifle", method: "rifle", units: ["61"], start: "2026-10-10", end: "2026-10-20", year: 2026, sourceId: "d-brochure" },
  { species: "elk", label: "EE061O1R dates", huntCodes: ["ee061o1r"], start: "2026-10-12", end: "2026-10-19", year: 2026, sourceId: "d-brochure" },
  { species: "mule-deer", label: "Deer rifle", start: "2026-10-24", end: "2026-11-01", year: 2026, sourceId: "d-brochure" },
];
const idx = (id: string) => ["d-brochure", "d-brochure-27", "d-draw"].indexOf(id);

test("season matching: row ranges, then hunt code, then units + method, then statewide (planned year if published)", () => {
  const base = { seasons: SEASONS, species: "elk", residency: "resident" as const, kind: "draw" as const, planCycle: 2027, sourceId: idx };
  const withRanges = huntSeasons({ ...base, row: { ...ROW, seasonRanges: [{ start: "2026-10-14", end: "2026-10-18", label: "Rifle" }], seasonSourceId: "d-brochure" } });
  assert.deepEqual(withRanges.seasons.map((s) => [s.scope, s.label, s.start, s.end, s.src]), [["hunt", "Rifle", "2026-10-14", "2026-10-18", 0]]);
  assert.equal(withRanges.year, 2026);
  const fromText = huntSeasons({ ...base, row: { ...ROW, seasonDates: "2026-10-14 to 2026-10-18" } });
  assert.equal(fromText.seasons[0].scope, "hunt");
  assert.equal(fromText.text, "2026-10-14 to 2026-10-18");
  const printed = huntSeasons({ ...base, row: { ...ROW, seasonDates: "Oct. 14 - Oct. 18" } });
  assert.deepEqual([printed.seasons.length, printed.text], [0, "Oct. 14 - Oct. 18"]);
  assert.deepEqual(huntSeasons({ ...base, row: ROW }).seasons.map((s) => [s.scope, s.label]), [["hunt", "EE061O1R dates"]]);
  const noCode = SEASONS.filter((s) => !s.huntCodes);
  assert.deepEqual(huntSeasons({ ...base, seasons: noCode, row: ROW }).seasons.map((s) => [s.scope, s.label]), [["units", "Unit 61 rifle"]]);
  // Statewide: the rifle season only (archery doesn't fit a rifle hunt), and the 2027 one because 2027 is planned and published.
  const statewide = huntSeasons({ ...base, seasons: noCode.filter((s) => !s.units), row: ROW });
  assert.deepEqual(statewide.seasons.map((s) => [s.scope, s.label, s.year, s.src]), [["statewide", "First rifle season", 2027, 1]]);
  assert.equal(huntSeasons({ ...base, seasons: noCode.filter((s) => !s.units), row: ROW, planCycle: 2026 }).seasons[0].year, 2026);
  // No season data at all.
  assert.deepEqual(huntSeasons({ ...base, seasons: [], row: ROW }), { seasons: [], year: null });
});

const INFO: SpeciesInfo = {
  species: "elk",
  drawSystem: "preference",
  drawSystemSummary: "Limited licenses are drawn by preference points.",
  pointsMatter: true,
  pointName: "preference point",
  residentNote: "Applicants must first buy a current qualifying license (annual small game) and a Habitat Stamp. Residents get at least 80% of licenses.",
  nonresidentNote: "Nonresidents may receive up to 20% of licenses. Hunter education is required for anyone born after 1949.",
  otcSummary: "Unlimited OTC archery licenses for either-sex elk.",
  keyDates: CPW_2026,
  sourceIds: ["d-dates"],
};
const STATE: PlannerState = {
  slug: "colorado",
  name: "Colorado",
  agency: { name: "Colorado Parks and Wildlife", shortName: "CPW", url: "https://cpw.state.co.us" },
  unitTerm: "GMU",
  species: [INFO],
  seasons: SEASONS.filter((s) => !s.huntCodes && !s.units),
  sources: [
    { id: "d-dates", title: "Big game brochure", publisher: "CPW", url: "https://cpw.state.co.us/brochure.pdf", retrieved: "2026-10-01" },
    { id: "d-brochure", title: "Big game brochure", publisher: "CPW", url: "https://cpw.state.co.us/brochure.pdf", retrieved: "2026-10-01" },
    { id: "d-draw", title: "2026 draw recap", publisher: "CPW", url: "https://cpw.state.co.us/recap.pdf", retrieved: "2026-10-01" },
    { id: "d-fees", title: "Fee chart", publisher: "CPW", url: "https://cpw.state.co.us/fees.pdf", retrieved: "2026-10-01" },
  ],
  fees: [
    { species: null, item: "Annual small game license (qualifying license)", residency: "resident", amountUsd: 38.49, licenseYear: 2026, sourceId: "d-fees" },
    { species: "elk", item: "Elk license — resident adult", residency: "resident", amountUsd: 70.4, licenseYear: 2026, sourceId: "d-fees" },
  ],
};

test("plan: a Colorado-style hunt with only 2026 dates is planned for 2027 and says so", () => {
  const { agency, needsDrawing } = planAgency({ state: STATE, info: INFO, residency: "resident", today: TODAY, now: "2026-10-31T12:00:00.000Z", kind: "draw", row: ROW });
  assert.equal(needsDrawing, false);
  assert.deepEqual([agency.planCycle, agency.datesCycle, agency.cyclePublished], [2027, 2026, false]);
  // Never presented as the upcoming deadline.
  assert.equal(agency.deadline, null);
  assert.deepEqual(agency.keyDates!.map((k) => k.kind), ["application", "points", "results", "payment", "leftover", "leftover"]);
  assert.equal(linkOf(agency, agency.keyDates![0]), "https://cpw.state.co.us/brochure.pdf");
  assert.equal(linkOf(agency, agency.fees[0]), "https://cpw.state.co.us/fees.pdf");
  // Links are listed once.
  assert.equal(new Set(agency.links).size, agency.links!.length);
  // CPW published 2027 statewide seasons (in this fixture), so those are used for the 2027 plan...
  assert.deepEqual(agency.seasons!.map((s) => [s.scope, s.label, s.year]), [["statewide", "First rifle season", 2027]]);
  assert.equal(agency.seasonYear, 2027);
  // ...and with only 2026 seasons published, those come back as 2026 (shown as "2026 season dates").
  const only2026 = planAgency({ state: { ...STATE, seasons: STATE.seasons!.filter((x) => x.year === 2026) }, info: INFO, residency: "resident", today: TODAY, now: "x", kind: "draw", row: ROW }).agency;
  assert.equal(only2026.seasonYear, 2026);
  assert.equal(huntTimeline({ ...buildPlannedHunt({ state: STATE, info: INFO, residency: "resident", today: TODAY, now: "x", kind: "draw", row: ROW, id: "z" }).hunt, agency: only2026 }).find((t) => t.kind === "season")!.published, false);
  assert.deepEqual([agency.minPoints, agency.oddsPct], [6, 10]);
  assert.match(agency.oddsNote, /^2026 draw, residents: 90 of 900/);
  assert.deepEqual(agency.requirements, ["Applicants must first buy a current qualifying license (annual small game) and a Habitat Stamp."]);
  assert.equal(agency.otcSummary, undefined);
  assert.equal(cycleInfo(agency).label, "2026 dates — 2027 not yet published by CPW");
});

test("plan: published next-cycle dates are shown as such and the main application becomes the deadline", () => {
  const info = { ...INFO, keyDates: [...CPW_2026, kd({ label: "Primary draw application period", start: "2027-03-01", end: "2027-04-07", cycle: 2027 }), kd({ label: "Primary draw results posted", date: "2027-05-28", cycle: 2027 })] };
  const { hunt } = buildPlannedHunt({ state: STATE, info, residency: "resident", today: TODAY, now: "2026-10-31T12:00:00.000Z", kind: "draw", row: ROW, id: "h1", pointsOwned: 4 });
  const a = hunt.agency!;
  assert.deepEqual([a.planCycle, a.datesCycle, a.cyclePublished], [2027, 2027, true]);
  assert.equal(a.deadline!.end, "2027-04-07");
  assert.equal(hunt.applicationDeadline, "2027-04-07");
  assert.equal(hunt.preferencePointsOwned, 4);
  assert.equal(hunt.preferencePointsNeeded, 6);
  assert.equal(hunt.unit, "GMU 061");
  assert.equal(cycleInfo(a).label, "2027 dates");
  const tl = huntTimeline(hunt);
  assert.ok(tl.filter((t) => t.kind !== "season").every((t) => t.published));
  // 2027 is planned and CPW's 2027 statewide season is published, so that's the one used.
  const season = tl.find((t) => t.kind === "season")!;
  assert.deepEqual([season.cycle, season.published, season.scope], [2027, true, "statewide"]);
  assert.equal(nextForHunt(hunt, TODAY)!.label, "Primary draw application period");
});

test("plan: general/OTC and custom hunts", () => {
  const otc = buildPlannedHunt({ state: STATE, info: INFO, residency: "resident", today: TODAY, now: "x", kind: "otc", id: "o1" }).hunt;
  assert.equal(otc.agency!.kind, "otc");
  assert.equal(otc.agency!.huntCode, "");
  assert.equal(otc.unit, "General / OTC license");
  assert.equal(otc.agency!.otcSummary, INFO.otcSummary);
  assert.deepEqual(otc.agency!.keyDates!.map((k) => k.label), ["Secondary draw application period", "Leftover licenses on sale"]);
  assert.equal(otc.agency!.cyclePublished, false);
  const custom = buildPlannedHunt({ state: STATE, info: INFO, residency: "nonresident", today: TODAY, now: "x", kind: "custom", id: "c1", unit: "Private ranch near Craig", customDescription: "Landowner voucher hunt" }).hunt;
  assert.equal(custom.agency!.kind, "custom");
  assert.equal(custom.unit, "Private ranch near Craig");
  assert.deepEqual(custom.agency!.requirements, ["Hunter education is required for anyone born after 1949."]);
  assert.throws(() => planAgency({ state: STATE, info: INFO, residency: "resident", today: TODAY, now: "x", kind: "draw" }));
});

test("requirements: sentences from the residency's note and the draw summary that state a requirement", () => {
  assert.deepEqual(requirementsOf(INFO, "nonresident"), ["Hunter education is required for anyone born after 1949."]);
  assert.deepEqual(requirementsOf({ ...INFO, residentNote: undefined, nonresidentNote: undefined }, "resident"), []);
});

test("timeline countdowns", () => {
  assert.deepEqual(countdown({ kind: "application", start: "2027-03-01", end: "2027-04-07" }, TODAY), { text: "opens Mar 1, 2027", tone: "later" });
  assert.deepEqual(countdown({ kind: "application", start: "2026-11-01", end: "2026-11-30" }, TODAY), { text: "opens tomorrow", tone: "urgent" });
  assert.deepEqual(countdown({ kind: "application", start: "2026-10-20", end: "2026-11-12" }, TODAY), { text: "closes in 12 days", tone: "urgent" });
  assert.deepEqual(countdown({ kind: "application", start: "2026-10-20", end: "2026-10-31" }, TODAY), { text: "closes today", tone: "urgent" });
  assert.deepEqual(countdown({ kind: "payment", end: "2026-12-30" }, TODAY), { text: "in 60 days", tone: "later" });
  assert.deepEqual(countdown({ kind: "payment", end: "2026-10-30" }, TODAY), { text: "passed", tone: "past" });
  assert.deepEqual(countdown({ kind: "season", start: "2026-11-07", end: "2026-11-15" }, TODAY), { text: "opens in 7 days", tone: "later" });
  assert.equal(countdown({ kind: "season", start: "2026-10-24", end: "2026-11-01" }, TODAY).text, "open now · ends in 1 day");
  assert.equal(countdown({ kind: "season", start: "2026-09-01", end: "2026-09-30" }, TODAY).text, "ended");
});

test("upcoming deadlines across hunts: published deadlines and the member's own dates only, soonest first", () => {
  const unpublished = buildPlannedHunt({ state: STATE, info: INFO, residency: "resident", today: TODAY, now: "x", kind: "draw", row: ROW, id: "co" }).hunt;
  const pubInfo = { ...INFO, keyDates: [kd({ label: "Spring application period", start: "2027-01-15", end: "2027-02-15", cycle: 2027 }), kd({ label: "Draw results posted", date: "2027-03-01", cycle: 2027 })] };
  const published = buildPlannedHunt({ state: STATE, info: pubInfo, residency: "resident", today: TODAY, now: "x", kind: "draw", row: { ...ROW, huntCode: "B1" }, id: "id" }).hunt;
  const mine = { ...unpublished, id: "mine", customDates: [{ id: "c1", label: "Book flights", date: "2026-12-01" }] };
  const up = upcomingDeadlines([unpublished, published, mine], TODAY);
  assert.deepEqual(up.map((t) => [t.huntId, t.label]), [["mine", "Book flights"], ["id", "Spring application period"]]);
});

test("checklist steps come from the agency block", () => {
  const h = buildPlannedHunt({ state: STATE, info: INFO, residency: "resident", today: TODAY, now: "x", kind: "draw", row: ROW, id: "co" }).hunt;
  const steps = huntSteps(h);
  assert.deepEqual(steps.map((s) => s.key.replace(/^req-.*/, "req")), ["apply", "results", "pay", "license", "req"]);
  assert.equal(steps[0].label, "Apply in the CPW 2027 draw");
  assert.equal(steps[0].detail, "2026 date was Apr 7, 2026; 2027 not yet published");
  assert.match(steps[3].detail!, /Annual small game license/);
  // Keys are stable across rebuilds (ticks survive a refresh).
  assert.deepEqual(huntSteps(h).map((s) => s.key), steps.map((s) => s.key));
  const otc = buildPlannedHunt({ state: STATE, info: INFO, residency: "resident", today: TODAY, now: "x", kind: "otc", id: "o" }).hunt;
  assert.equal(huntSteps(otc)[0].key, "buy");
  assert.deepEqual(huntSteps({ ...h, agency: undefined }), []);
});

test("timeline: same-day dates list the application before the point-only line", () => {
  const { hunt } = buildPlannedHunt({ state: STATE, info: INFO, residency: "resident", today: TODAY, now: "x", kind: "draw", row: ROW, id: "o" });
  assert.deepEqual(huntTimeline(hunt).slice(0, 2).map((t) => t.kind), ["application", "points"]);
});
