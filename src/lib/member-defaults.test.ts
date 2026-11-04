// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { plannerPoints, pointsIn, profileSpecies, profileStart, profileStates, residencyIn } from "@/lib/member-defaults";
import type { PlannedHunt } from "@/lib/planner-schema";

const prefs = (p: { residency?: "resident" | "nonresident" | "both" | ""; homeState?: string; states?: string[]; species?: string[] }) => ({
  residency: p.residency ?? "",
  homeState: p.homeState ?? "",
  states: p.states ?? [],
  species: p.species ?? [],
});

test("residencyIn: home state decides, then the residency answer; 'both' or nothing gives no default", () => {
  assert.equal(residencyIn(prefs({ homeState: "CO" }), "colorado"), "resident");
  assert.equal(residencyIn(prefs({ homeState: "CO", residency: "resident" }), "wyoming"), "nonresident");
  assert.equal(residencyIn(prefs({ residency: "nonresident" }), "colorado"), "nonresident");
  assert.equal(residencyIn(prefs({ residency: "both" }), "colorado"), null);
  assert.equal(residencyIn(prefs({}), "colorado"), null);
  assert.equal(residencyIn(null, "colorado"), null);
});

const hunt = (h: { state: string; species: string; pts: number; updatedAt?: string }) =>
  ({
    species: h.species,
    preferencePointsOwned: h.pts,
    updatedAt: h.updatedAt,
    agency: { stateSlug: h.state, addedAt: "2026-01-01T00:00:00.000Z" },
  }) as unknown as PlannedHunt;

test("plannerPoints: agency hunts with points entered; zero and custom hunts skipped", () => {
  const got = plannerPoints([
    hunt({ state: "colorado", species: "elk", pts: 4, updatedAt: "2026-10-01T00:00:00.000Z" }),
    hunt({ state: "wyoming", species: "elk", pts: 0 }),
    { species: "elk", preferencePointsOwned: 7, agency: undefined } as unknown as PlannedHunt,
  ]);
  assert.deepEqual(got, [{ state: "colorado", species: "elk", points: 4, updatedAt: "2026-10-01T00:00:00.000Z" }]);
});

test("pointsIn: saved profile points first, then the latest planner hunt, else null", () => {
  const planner = [
    { state: "colorado", species: "elk", points: 2, updatedAt: "2026-09-01T00:00:00.000Z" },
    { state: "colorado", species: "elk", points: 4, updatedAt: "2026-10-01T00:00:00.000Z" },
  ];
  assert.deepEqual(pointsIn({ "colorado.elk": 0 }, planner, "colorado", "elk"), { points: 0, from: "profile" });
  assert.deepEqual(pointsIn({}, planner, "colorado", "elk"), { points: 4, from: "planner" });
  assert.equal(pointsIn({ "colorado.elk": 3 }, planner, "wyoming", "elk"), null);
});

test("profileStates / profileSpecies / profileStart keep the member's order and only offer what exists", () => {
  const p = prefs({ states: ["texas", "wyoming", "colorado"], species: ["moose", "elk"] });
  assert.deepEqual(profileStates(p, ["colorado", "wyoming", "utah"]), ["wyoming", "colorado"]);
  assert.equal(profileSpecies(p, ["elk", "mule-deer"]), "elk");
  assert.equal(profileSpecies(p, ["pronghorn"]), undefined);
  const options = [
    { slug: "colorado", species: ["elk", "moose"] },
    { slug: "wyoming", species: ["pronghorn"] },
  ];
  assert.deepEqual(profileStart(p, options), { state: "colorado", species: "moose" });
  assert.deepEqual(profileStart(prefs({ states: ["wyoming"], species: ["elk"] }), options), { state: "wyoming" });
  assert.equal(profileStart(prefs({ species: ["elk"] }), options), null);
  assert.equal(profileStart(null, options), null);
});
