// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DrawRecord, KeyDate, SpeciesInfo } from "@/data/agency/schema";
import { buildPlannedHunt, planAgency, type PlannerState } from "@/lib/planner-agency";
import { describeAgencyChanges, refreshHunt, refreshPlanner } from "@/lib/planner-refresh";
import type { AgencyRef, PlannedHunt, PlannerData } from "@/lib/planner-schema";

const kd = (k: Partial<KeyDate> & { label: string }): KeyDate => ({ cycle: 2026, status: "confirmed", sourceId: "d-dates", ...k });
const D2026 = [
  kd({ label: "Primary draw application period", start: "2026-03-01", end: "2026-04-07" }),
  kd({ label: "Primary draw results posted", date: "2026-05-28" }),
  kd({ label: "Primary draw license payment deadline", date: "2026-06-12" }),
];
const D2027 = [
  kd({ label: "Primary draw application period", start: "2027-03-02", end: "2027-04-08", cycle: 2027 }),
  kd({ label: "Primary draw results posted", date: "2027-05-27", cycle: 2027, status: "tentative" }),
];
const info = (keyDates: KeyDate[]): SpeciesInfo => ({ species: "elk", drawSystem: "preference", drawSystemSummary: "", pointsMatter: true, keyDates, sourceIds: [] });
const STATE: PlannerState = {
  slug: "colorado",
  name: "Colorado",
  agency: { name: "Colorado Parks and Wildlife", shortName: "CPW", url: "https://cpw.state.co.us" },
  unitTerm: "GMU",
  species: [],
  seasons: [],
  sources: [{ id: "d-dates", title: "Brochure", publisher: "CPW", url: "https://cpw.state.co.us/brochure.pdf", retrieved: "2026-10-01" }],
  fees: [],
};
const ROW: DrawRecord = { species: "elk", year: 2026, huntCode: "EE001E1R", units: ["1"], description: "elk, GMU 1", choice: "first", resident: { applicants: 10, drawn: 1 }, sourceId: "d-dates" };
const TODAY = "2026-10-31";

function saved(): PlannedHunt {
  const { hunt } = buildPlannedHunt({ state: STATE, info: info(D2026), residency: "resident", today: TODAY, now: "2026-10-31T10:00:00.000Z", kind: "draw", row: ROW, id: "h1" });
  // The member's own edits.
  return {
    ...hunt,
    status: "applied",
    notes: "Camp at the trailhead",
    preferencePointsOwned: 7,
    applicationDeadline: "2027-04-01",
    stepsDone: ["apply"],
    tasks: [{ id: "t1", label: "Scout in August", done: false }],
    customDates: [{ id: "c1", label: "Book flights", date: "2027-01-10" }],
  };
}
const fresh = (keyDates: KeyDate[], row = ROW): AgencyRef => planAgency({ state: STATE, info: info(keyDates), residency: "resident", today: TODAY, now: "2027-01-05T00:00:00.000Z", kind: "draw", row }).agency;

test("refresh: newly published 2027 dates flow in, the member's edits stay", () => {
  const h = saved();
  assert.equal(h.agency!.cyclePublished, false);
  const { hunt, changes } = refreshHunt(h, fresh([...D2026, ...D2027]), "2027-01-05T00:00:00.000Z");
  assert.equal(changes[0], "CPW published 2027 dates");
  assert.ok(changes.includes("Primary draw application period: Mar 1 – Apr 7, 2026 → Mar 2 – Apr 8, 2027"), changes.join("\n"));
  assert.ok(changes.includes("Primary draw results posted: May 28, 2026 → May 27, 2027"));
  assert.ok(changes.includes("No longer listed: Primary draw license payment deadline (Jun 12, 2026)"));
  assert.deepEqual([hunt.agency!.planCycle, hunt.agency!.cyclePublished, hunt.agency!.deadline!.end], [2027, true, "2027-04-08"]);
  assert.equal(hunt.agency!.addedAt, h.agency!.addedAt);
  assert.equal(hunt.agency!.refreshedAt, "2027-01-05T00:00:00.000Z");
  // updatedAt marks the member's own edits; a refresh isn't one (so it can't win a merge over an edit made elsewhere).
  assert.equal(hunt.updatedAt, h.updatedAt);
  // Member's fields untouched.
  for (const k of ["id", "status", "notes", "preferencePointsOwned", "preferencePointsNeeded", "stepsDone", "tasks"] as const) assert.deepEqual(hunt[k], h[k], k);
  // The date the member typed before CPW published becomes one of their own dates.
  assert.equal(hunt.applicationDeadline, "2027-04-08");
  assert.deepEqual(hunt.customDates, [...h.customDates!, { id: "own20270401", label: "Application deadline you entered", date: "2027-04-01" }]);
  // Refreshing again with the same data changes nothing.
  const again = refreshHunt(hunt, fresh([...D2026, ...D2027]), "2027-01-06T00:00:00.000Z");
  assert.deepEqual(again.changes, []);
  assert.equal(again.hunt, hunt);
});

test("refresh: nothing changed -> same object, no write", () => {
  const h = saved();
  const r = refreshHunt(h, fresh(D2026), "2026-11-01T00:00:00.000Z");
  assert.deepEqual(r.changes, []);
  assert.equal(r.hunt, h);
  const data: PlannerData = { hunts: [h], budget: [], checklist: [], deleted: [] };
  const out = refreshPlanner(data, new Map([["h1", fresh(D2026)]]), "x");
  assert.equal(out.data, data);
  assert.deepEqual(out.updates, []);
});

test("refresh: new draw results and tentative -> confirmed are described", () => {
  const h0 = saved();
  const first = refreshHunt(h0, fresh([...D2026, ...D2027]), "2027-01-05T00:00:00.000Z").hunt;
  const confirmed = D2027.map((k) => ({ ...k, status: "confirmed" as const }));
  const row2027: DrawRecord = { ...ROW, year: 2027, resident: { applicants: 12, drawn: 2 } };
  const { changes } = refreshHunt(first, fresh([...D2026, ...confirmed], row2027), "2027-06-05T00:00:00.000Z");
  assert.ok(changes.includes("Primary draw results posted is now confirmed"), changes.join("\n"));
  assert.ok(changes.some((c) => c.startsWith("Draw figures: 2027 draw, residents: 2 of 12")));
});

test("refresh: a v1 entry (one deadline) gets every date and says so", () => {
  const h = saved();
  const v1Agency: AgencyRef = { ...h.agency!, deadline: { label: "Primary draw application period", start: "2027-03-02", end: "2027-04-08", cycle: 2027, status: "confirmed", sourceUrl: "https://cpw.state.co.us/brochure.pdf" } };
  for (const k of ["kind", "planCycle", "datesCycle", "cyclePublished", "keyDates", "seasons", "links", "seasonYear", "drawSystem", "pointsMatter", "requirements", "minPoints", "oddsPct"] as const) delete v1Agency[k];
  const v1: PlannedHunt = { id: "old", state: "Colorado", species: "elk", unit: "GMU 1", season: "rifle", preferencePointsNeeded: 0, preferencePointsOwned: 3, applicationDeadline: "2027-04-08", seasonDates: "", status: "planning", notes: "Craig's note", agency: v1Agency };
  const { hunt, changes } = refreshHunt(v1, fresh([...D2026, ...D2027]), "2027-01-05T00:00:00.000Z");
  assert.equal(changes[0], "Added every CPW date for this hunt (2), its season dates and requirements");
  assert.equal(hunt.notes, "Craig's note");
  assert.equal(hunt.preferencePointsOwned, 3);
  // Derived from the old agency deadline, so it follows the agency (no stray "own" date).
  assert.equal(hunt.customDates, undefined);
  assert.equal(hunt.agency!.keyDates!.length, 2);
});

test("refresh: when the published cycle passes, the deadline clears and the change says why", () => {
  const h = refreshHunt(saved(), fresh([...D2026, ...D2027]), "2027-01-05T00:00:00.000Z").hunt;
  const later = planAgency({ state: STATE, info: info([...D2026, ...D2027]), residency: "resident", today: "2027-05-01", now: "x", kind: "draw", row: ROW }).agency;
  // The 2027 application closed Apr 8: 2028 is now the cycle being planned and isn't published.
  assert.deepEqual([later.planCycle, later.datesCycle, later.cyclePublished, later.deadline], [2028, 2027, false, null]);
  const r = refreshHunt(h, later, "2027-05-01T00:00:00.000Z");
  assert.equal(r.hunt.applicationDeadline, "");
  assert.equal(describeAgencyChanges(h.agency!, later)[0], "The 2027 application period has passed; CPW hasn't published 2028 dates yet");
});

test("refreshPlanner only touches hunts it has fresh data for and reports each", () => {
  const a = saved();
  const b: PlannedHunt = { ...saved(), id: "h2" };
  const manual: PlannedHunt = { id: "m1", state: "Montana", species: "elk", unit: "270", season: "", preferencePointsNeeded: 0, preferencePointsOwned: 0, applicationDeadline: "", seasonDates: "", status: "planning", notes: "" };
  const data: PlannerData = { hunts: [a, b, manual], budget: [{ id: "b1", huntId: "h1", category: "License", description: "Elk license", amount: 70 }], checklist: [], deleted: [] };
  const out = refreshPlanner(data, new Map([["h2", fresh([...D2026, ...D2027])]]), "now");
  assert.deepEqual(out.updates.map((u) => u.id), ["h2"]);
  assert.equal(out.data.hunts[0], a);
  assert.equal(out.data.hunts[2], manual);
  assert.deepEqual(out.data.budget, data.budget);
});

test("refresh: a fresh block compared after storage sanitizing reports no change for long agency text", async () => {
  const { sanitizeAgencyRef } = await import("@/lib/planner-schema");
  const long = "General  season licenses.\n" + "x ".repeat(700);
  const st = { ...STATE, species: [] };
  const inf = { ...info(D2026), otcSummary: long };
  const saved = planAgency({ state: st, info: inf, residency: "resident", today: TODAY, now: "a", kind: "otc" }).agency;
  const stored = sanitizeAgencyRef(JSON.parse(JSON.stringify(saved)))!;
  const again = sanitizeAgencyRef(planAgency({ state: st, info: inf, residency: "resident", today: TODAY, now: "b", kind: "otc" }).agency)!;
  assert.deepEqual(describeAgencyChanges(stored, again), []);
});
