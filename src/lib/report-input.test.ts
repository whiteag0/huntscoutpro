// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchUnits, readPointsText, segmentByState, unitTokens, type MemberState } from "@/lib/report-input";

const CO: MemberState = { slug: "colorado", name: "Colorado", abbrev: "CO" };
const WY: MemberState = { slug: "wyoming", name: "Wyoming", abbrev: "WY" };
const UT: MemberState = { slug: "utah", name: "Utah", abbrev: "UT" };
const OR: MemberState = { slug: "oregon", name: "Oregon", abbrev: "OR" };

test("unit tokens skip point counts, years, ordinals and money", () => {
  assert.deepEqual(unitTokens("GMU 61 and 62"), ["61", "62"]);
  assert.deepEqual(unitTokens("4 preference points, 2nd rifle, 2025 season, $45"), []);
  assert.deepEqual(unitTokens("units 16A, 2-1 and H4A"), ["16A", "2-1", "H4A"]);
  assert.deepEqual(unitTokens("3 pts in 201"), ["201"]);
});

test("text is split by the states it names; lowercase 'or' is a word, not Oregon", () => {
  const segs = segmentByState("units 1 or 2 in CO, then WY area 7", [CO, WY, OR]);
  assert.deepEqual(
    segs.map((s) => s.slug),
    [null, "colorado", "wyoming"]
  );
});

test("units match only ids the agency publishes, tied to the state named before them", () => {
  const candidates = (slug: string) => (slug === "colorado" ? ["61", "62", "7"] : slug === "wyoming" ? ["007", "061"] : []);
  const r = matchUnits("CO GMU 61 and 62, WY elk area 7, also 999", [CO, WY], candidates);
  assert.deepEqual(r.byState.colorado, ["61", "62"]);
  assert.deepEqual(r.byState.wyoming, ["007"]);
  assert.deepEqual(r.unmatched, [{ token: "999", slug: "wyoming" }]);
});

test("with no state named, a unit is tried in each of the member's states", () => {
  const candidates = (slug: string) => (slug === "colorado" ? ["61"] : ["061", "100"]);
  const r = matchUnits("61", [CO, WY], candidates);
  assert.deepEqual(r.byState, { colorado: ["61"], wyoming: ["061"] });
});

test("named units (Utah) match when the whole name appears", () => {
  const candidates = () => ["Book Cliffs, Bitter Creek/South", "Cache", "Central Mtns, West Manti"];
  const r = matchUnits("Thinking cache or the Book Cliffs, Bitter Creek/South", [UT], candidates);
  assert.deepEqual(r.byState.utah?.sort(), ["Book Cliffs, Bitter Creek/South", "Cache"]);
});

test("empty answers match nothing", () => {
  assert.deepEqual(matchUnits("  ", [CO], () => ["61"]), { byState: {}, unmatched: [] });
  assert.deepEqual(matchUnits("61", [], () => ["61"]), { byState: {}, unmatched: [] });
});

test("points are read per state and species", () => {
  const r = readPointsText("CO elk 4 preference points, want 2nd rifle; WY antelope 1 point", [CO, WY], ["elk", "pronghorn"]);
  assert.deepEqual(r.points, { "colorado.elk": 4, "wyoming.pronghorn": 1 });
  assert.deepEqual(r.unassigned, []);
});

test("one state and one species: a bare point count is theirs", () => {
  assert.deepEqual(readPointsText("I have 3 points", [CO], ["elk"]).points, { "colorado.elk": 3 });
  assert.deepEqual(readPointsText("no points yet", [CO], ["elk"]).points, { "colorado.elk": 0 });
  assert.deepEqual(readPointsText("points: 7", [CO], ["elk"]).points, { "colorado.elk": 7 });
});

test("the state carries over between phrases until another is named", () => {
  const r = readPointsText("Colorado: elk 5 pts, mule deer 2 pts. Wyoming elk 1 pt", [CO, WY], ["elk", "mule-deer"]);
  assert.deepEqual(r.points, { "colorado.elk": 5, "colorado.mule-deer": 2, "wyoming.elk": 1 });
});

test("ambiguous phrases are reported, not guessed", () => {
  const r = readPointsText("4 points", [CO, WY], ["elk"]);
  assert.deepEqual(r.points, {});
  assert.deepEqual(r.unassigned, ["4 points"]);
  // Two species named in one phrase with one number.
  const two = readPointsText("CO elk and deer 3 points", [CO], ["elk", "mule-deer"]);
  assert.equal(two.points["colorado.elk"], undefined);
  // Plain "deer" means the member's one deer species.
  assert.deepEqual(readPointsText("CO deer 2 points", [CO], ["mule-deer"]).points, { "colorado.mule-deer": 2 });
  assert.deepEqual(readPointsText("CO deer 2 points", [CO], ["mule-deer", "whitetail"]).points, {});
});

test("species the member didn't pick are ignored", () => {
  assert.deepEqual(readPointsText("CO moose 9 points", [CO], ["elk"]).points, {});
});

test("out-of-range numbers aren't points", () => {
  assert.deepEqual(readPointsText("CO elk 99 points", [CO], ["elk"]).points, {});
});

test("a unit word narrows units with no state named to the states that use it", () => {
  const co = { ...CO, unitTerm: "GMU" };
  const wy = { ...WY, unitTerm: "Hunt Area" };
  const candidates = (slug: string) => (slug === "colorado" ? ["61", "62", "7"] : slug === "wyoming" ? ["007", "061"] : []);
  const r = matchUnits("GMU 61, 62; WY area 7", [co, wy], candidates);
  assert.deepEqual(r.byState.colorado, ["61", "62"]);
  assert.equal(r.byState.wyoming?.includes("61"), false);
  // "unit" is loose: still tried everywhere.
  assert.ok(matchUnits("unit 61", [co, wy], candidates).byState.wyoming);
});

test("a species and one bare number in the points answer is a point count", () => {
  assert.deepEqual(readPointsText("CO elk 3, WY elk 2", [CO, WY], ["elk"]).points, { "colorado.elk": 3, "wyoming.elk": 2 });
  assert.deepEqual(readPointsText("CO elk season 2", [CO], ["elk"]).points, {});
  assert.deepEqual(readPointsText("CO elk 2nd rifle", [CO], ["elk"]).points, {});
  assert.deepEqual(readPointsText("CO elk 3 or 4", [CO], ["elk"]).points, {});
});
