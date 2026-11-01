// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deadlinesOf,
  findAgencyDuplicate,
  mergePlanners,
  nextDeadline,
  sanitizePlannerData,
  sanitizePlannerDoc,
  samePlanner,
  type AgencyRef,
  type PlannedHunt,
  type PlannerData,
} from "@/lib/planner-schema";

const agency = (o: Partial<AgencyRef> = {}): AgencyRef => ({
  stateSlug: "colorado",
  agencyName: "Colorado Parks and Wildlife",
  agencyShortName: "CPW",
  unitTerm: "GMU",
  huntCode: "EE001E1R",
  units: ["1"],
  description: "elk, either sex, GMU 1",
  residency: "resident",
  drawYear: 2025,
  deadline: { label: "Primary draw application period", start: "2027-03-01", end: "2027-04-07", cycle: 2027, status: "confirmed", sourceUrl: "https://cpw.state.co.us/brochure.pdf" },
  fees: [],
  oddsNote: "2025 draw, residents: 8 of 173 first-choice applicants drawn (4.6%).",
  sourceUrl: "https://cpw.state.co.us/draw.pdf",
  addedAt: "2026-10-31T00:00:00.000Z",
  ...o,
});
const hunt = (o: Partial<PlannedHunt> & { id: string }): PlannedHunt => ({
  state: "Colorado",
  species: "elk",
  unit: "GMU 1",
  season: "rifle",
  preferencePointsNeeded: 0,
  preferencePointsOwned: 0,
  applicationDeadline: "",
  seasonDates: "",
  status: "planning",
  notes: "",
  ...o,
});
const data = (o: Partial<PlannerData> = {}): PlannerData => ({ hunts: [], budget: [], checklist: [], deleted: [], ...o });

test("sanitize accepts the old browser-only format and drops invalid entries", () => {
  const old = {
    hunts: [
      { id: "lx1abc", state: "Montana", species: "elk", unit: "270", season: "archery", preferencePointsOwned: 3, applicationDeadline: "2027-04-01", seasonDates: "", status: "applied", notes: "hi" },
      { id: "bad id with spaces", state: "X", species: "elk" },
      { id: "nospecies", state: "X", species: "unicorn" },
      "not an object",
    ],
    budget: [{ id: "b1", huntId: "lx1abc", category: "Travel", description: "Gas", amount: "120.456" }, { id: "b2", description: "", amount: 5 }],
    checklist: [{ id: "c1", category: "Safety", label: "First aid kit", checked: true, custom: false }],
  };
  const d = sanitizePlannerData(old)!;
  assert.equal(d.hunts.length, 1);
  assert.equal(d.hunts[0].status, "applied");
  assert.equal(d.hunts[0].preferencePointsOwned, 3);
  assert.deepEqual(d.budget.map((b) => [b.id, b.amount]), [["b1", 120.46]]);
  assert.equal(d.checklist[0].checked, true);
  assert.deepEqual(d.deleted, []);
});

test("sanitize rejects non-planner input", () => {
  assert.equal(sanitizePlannerData(null), null);
  assert.equal(sanitizePlannerData([]), null);
  assert.equal(sanitizePlannerData({}), null);
  assert.equal(sanitizePlannerData({ hunts: "nope" }), null);
  assert.equal(sanitizePlannerDoc({ schema: 99, version: 1, data: { hunts: [] } }), null);
  assert.equal(sanitizePlannerDoc({ schema: 1, version: -1, data: { hunts: [] } }), null);
  assert.equal(sanitizePlannerDoc({ schema: 1, version: 3, data: { hunts: [] } })!.version, 3);
});

test("sanitize caps strings and lists and keeps only http(s) source links", () => {
  const many = Array.from({ length: 400 }, (_, i) => hunt({ id: `h${i}`, notes: "x".repeat(5000) }));
  const d = sanitizePlannerData({ hunts: many })!;
  assert.equal(d.hunts.length, 150);
  assert.equal(d.hunts[0].notes.length, 2000);
  const a = sanitizePlannerData({ hunts: [hunt({ id: "a1", agency: agency({ sourceUrl: "javascript:alert(1)" }) })] })!;
  assert.equal(a.hunts[0].agency!.sourceUrl, "");
  // Agency entries take their deadline from the agency block.
  assert.equal(a.hunts[0].applicationDeadline, "2027-04-07");
});

test("agency duplicates: same state + hunt code + cycle, or either cycle unknown", () => {
  const hunts = [hunt({ id: "a1", agency: agency() })];
  assert.ok(findAgencyDuplicate(hunts, agency({ drawYear: 2024 })));
  assert.ok(findAgencyDuplicate(hunts, agency({ huntCode: "ee001e1r" })));
  assert.ok(findAgencyDuplicate(hunts, agency({ deadline: null })));
  assert.equal(findAgencyDuplicate(hunts, agency({ deadline: { ...agency().deadline!, cycle: 2028 } })), undefined);
  assert.equal(findAgencyDuplicate(hunts, agency({ stateSlug: "wyoming" })), undefined);
  assert.equal(findAgencyDuplicate(hunts, agency({ huntCode: "EE002E1R" })), undefined);
});

test("merge: union by id, deletions stick, duplicates collapse and budget follows", () => {
  const account = data({
    hunts: [hunt({ id: "a1", agency: agency() }), hunt({ id: "m1", state: "Utah", unit: "Book Cliffs" })],
    budget: [{ id: "b1", huntId: "a1", category: "License", description: "Elk license (2026)", amount: 70.4 }],
    checklist: [{ id: "c1", category: "Safety", label: "First aid kit", checked: false, custom: false }],
    deleted: ["gone1"],
  });
  const browser = data({
    hunts: [
      hunt({ id: "a2", agency: agency({ drawYear: 2024 }) }), // same hunt added on another device
      hunt({ id: "m2", state: "Utah", unit: "Book Cliffs" }), // identical manual entry
      hunt({ id: "m3", state: "Idaho", unit: "39" }),
      hunt({ id: "gone1", state: "Nevada" }),
    ],
    budget: [
      { id: "b2", huntId: "a2", category: "Travel", description: "Gas", amount: 200 },
      { id: "b3", huntId: "gone1", category: "Travel", description: "Hotel", amount: 90 },
    ],
    checklist: [
      { id: "c9", category: "Safety", label: "first aid kit", checked: true, custom: false },
      { id: "c2", category: "Safety", label: "Bear spray", checked: false, custom: true },
    ],
  });
  const m = mergePlanners(account, browser, "a");
  assert.deepEqual(m.hunts.map((h) => h.id), ["a1", "m1", "m3"]);
  assert.deepEqual(m.budget.map((b) => [b.id, b.huntId]), [["b1", "a1"], ["b2", "a1"]]);
  assert.deepEqual(m.checklist.map((c) => [c.id, c.checked]), [["c1", true], ["c2", false]]);
  assert.ok(m.deleted.includes("gone1"));

  // Removing on one side wins over an older copy on the other.
  const removed = mergePlanners(data({ ...m, hunts: m.hunts.filter((h) => h.id !== "m3"), deleted: [...m.deleted, "m3"] }), m, "b");
  assert.equal(removed.hunts.some((h) => h.id === "m3"), false);
  // Merging is idempotent.
  assert.ok(samePlanner(mergePlanners(m, m), m));
});

test("merge: same id edited on both sides keeps the newer edit, else the preferred side", () => {
  const a = data({ hunts: [hunt({ id: "h1", notes: "old", updatedAt: "2026-10-30T10:00:00.000Z" })] });
  const b = data({ hunts: [hunt({ id: "h1", notes: "new", updatedAt: "2026-10-31T10:00:00.000Z" })] });
  assert.equal(mergePlanners(a, b, "a").hunts[0].notes, "new");
  assert.equal(mergePlanners(b, a, "b").hunts[0].notes, "new");
  const c = data({ hunts: [hunt({ id: "h1", notes: "mine" })] });
  const d = data({ hunts: [hunt({ id: "h1", notes: "theirs" })] });
  assert.equal(mergePlanners(c, d, "a").hunts[0].notes, "mine");
  assert.equal(mergePlanners(c, d, "b").hunts[0].notes, "theirs");
});

test("deadlines sort by real date; next deadline skips passed ones", () => {
  const hunts = [
    hunt({ id: "late", agency: agency({ huntCode: "X", deadline: { ...agency().deadline!, end: "2027-04-07" } }) }),
    hunt({ id: "manual", applicationDeadline: "2026-12-15" }),
    hunt({ id: "past", applicationDeadline: "2026-10-01" }),
    hunt({ id: "none" }),
  ];
  assert.deepEqual(deadlinesOf(hunts).map((d) => d.hunt.id), ["past", "manual", "late"]);
  assert.equal(nextDeadline(hunts, "2026-10-31")!.hunt.id, "manual");
  assert.equal(nextDeadline(hunts, "2026-12-16")!.hunt.id, "late");
  assert.equal(nextDeadline(hunts, "2027-04-08"), undefined);
});
