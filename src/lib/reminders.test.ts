// Run with: npm test  (node --experimental-strip-types --test src/lib/*.test.ts)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeDueReminders,
  daysBetween,
  groupReminders,
  labelResidency,
  memberResidencyIn,
  nextReminderDates,
  type ReminderMember,
  type ReminderState,
} from "@/lib/reminders";
import type { KeyDate } from "@/data/agency/schema";

const kd = (k: Partial<KeyDate> & { label: string }): KeyDate => ({ cycle: 2027, status: "confirmed", sourceId: "d-src", ...k });

const UTAH: ReminderState = {
  slug: "utah",
  name: "Utah",
  abbrev: "UT",
  agency: { name: "Utah Division of Wildlife Resources", shortName: "UDWR", url: "https://wildlife.utah.gov" },
  sources: [
    { id: "d-src", title: "Big game application guidebook", publisher: "UDWR", url: "https://wildlife.utah.gov/guidebook.pdf", retrieved: "2026-10-01" },
  ],
  species: [
    {
      species: "elk",
      drawSystem: "hybrid",
      drawSystemSummary: "",
      pointsMatter: true,
      sourceIds: ["d-src"],
      keyDates: [
        // window closing in 14 days from 2026-10-27
        kd({ label: "Sportsman permit drawing application period", start: "2026-10-20", end: "2026-11-10", note: "Apply online." }),
        // closes in 3 days from 2026-10-27
        kd({ label: "Bonus point only deadline", date: "2026-10-30" }),
        // opens today (2026-10-27)
        kd({ label: "Limited-entry application period", start: "2026-10-27", end: "2026-12-29" }),
        // residency-limited labels, closing in 14 days
        kd({ label: "Nonresident general season application deadline", date: "2026-11-10" }),
        kd({ label: "Resident general season application deadline", date: "2026-11-10" }),
        kd({ label: "Resident and nonresident youth application deadline", date: "2026-11-10" }),
        // not actionable (label), past, wrong distance, old cycle
        kd({ label: "Draw results posted", date: "2026-11-10" }),
        kd({ label: "Application period (last year)", start: "2025-01-01", end: "2025-02-01", cycle: 2025 }),
        kd({ label: "Application deadline far away", date: "2026-12-20" }),
        kd({ label: "Application deadline last cycle", date: "2026-11-10", cycle: 2025 }),
      ],
    },
    {
      species: "mule-deer",
      drawSystem: "bonus",
      drawSystemSummary: "",
      pointsMatter: true,
      sourceIds: ["d-src"],
      keyDates: [kd({ label: "Sportsman permit drawing application period", start: "2026-10-20", end: "2026-11-10", note: "Apply online." })],
    },
  ],
};

const IDAHO: ReminderState = {
  ...UTAH,
  slug: "idaho",
  name: "Idaho",
  abbrev: "ID",
  agency: { name: "Idaho Department of Fish and Game", shortName: "IDFG", url: "https://idfg.idaho.gov" },
  sources: [],
  species: [
    {
      ...UTAH.species[0],
      keyDates: [kd({ label: "Nonresident draw — second application period", start: "2026-11-05", end: "2026-11-10", sourceId: "missing" })],
    },
  ],
};

const member = (m: Partial<ReminderMember> = {}): ReminderMember => ({
  email: "hunter@example.com",
  name: "Hunter",
  states: ["utah"],
  species: ["elk"],
  residency: "",
  homeState: "",
  ...m,
});

const labels = (m: ReminderMember, today: string, states = [UTAH, IDAHO]) =>
  computeDueReminders(m, states, today).map((r) => `${r.label}|${r.kind}|${r.daysLeft}`);

test("daysBetween counts calendar days", () => {
  assert.equal(daysBetween("2026-10-27", "2026-11-10"), 14);
  assert.equal(daysBetween("2026-12-31", "2027-01-03"), 3);
  assert.equal(daysBetween("2026-03-07", "2026-03-10"), 3); // across the DST change
});

test("14 days before a window end, 3 days before a single date, and opens today", () => {
  const got = labels(member({ residency: "both" }), "2026-10-27");
  assert.deepEqual(got, [
    "Bonus point only deadline|closes|3",
    "Nonresident general season application deadline|closes|14",
    "Resident and nonresident youth application deadline|closes|14",
    "Resident general season application deadline|closes|14",
    "Sportsman permit drawing application period|closes|14",
    "Limited-entry application period|opens|63",
  ]);
});

test("item carries dates, note, cycle and the agency source url", () => {
  const [item] = computeDueReminders(member({ residency: "both" }), [UTAH], "2026-11-07").filter((r) => r.species === "elk");
  assert.deepEqual(item, {
    state: "utah",
    stateName: "Utah",
    agencyName: "Utah Division of Wildlife Resources",
    species: "elk",
    label: "Nonresident general season application deadline",
    kind: "closes",
    daysLeft: 3,
    date: "2026-11-10",
    cycle: 2027,
    status: "confirmed",
    sourceUrl: "https://wildlife.utah.gov/guidebook.pdf",
    sourceTitle: "Big game application guidebook",
  });
});

test("nothing is due on days that are not 14, 3 or an opening day", () => {
  assert.deepEqual(labels(member({ residency: "both" }), "2026-10-28"), []);
  assert.deepEqual(labels(member({ residency: "both" }), "2026-11-09"), []); // 1 day left
  assert.deepEqual(labels(member({ residency: "both" }), "2026-11-10"), []); // closes today: no 0-day reminder
});

test("resident members skip nonresident-only labels", () => {
  const got = labels(member({ residency: "resident" }), "2026-10-27");
  assert.ok(!got.some((l) => l.startsWith("Nonresident general")));
  assert.ok(got.some((l) => l.startsWith("Resident general")));
  assert.ok(got.some((l) => l.startsWith("Resident and nonresident youth")));
});

test("nonresident members skip resident-only labels", () => {
  const got = labels(member({ residency: "nonresident" }), "2026-10-27");
  assert.ok(got.some((l) => l.startsWith("Nonresident general")));
  assert.ok(!got.some((l) => l.startsWith("Resident general")));
  assert.ok(got.some((l) => l.startsWith("Resident and nonresident youth")));
});

test("a known home state decides residency per state", () => {
  assert.equal(memberResidencyIn({ residency: "resident", homeState: "UT" }, "UT"), "resident");
  assert.equal(memberResidencyIn({ residency: "resident", homeState: "co" }, "UT"), "nonresident");
  assert.equal(memberResidencyIn({ residency: "", homeState: "" }, "UT"), "both");
  const utahn = labels(member({ homeState: "UT" }), "2026-10-27");
  assert.ok(!utahn.some((l) => l.startsWith("Nonresident general")));
  const coloradan = labels(member({ homeState: "CO", residency: "both" }), "2026-10-27");
  assert.ok(!coloradan.some((l) => l.startsWith("Resident general")));
});

test("labelResidency reads the label", () => {
  assert.equal(labelResidency("Nonresident draw — second application period"), "nonresident");
  assert.equal(labelResidency("Non-resident deadline"), "nonresident");
  assert.equal(labelResidency("Resident deer application deadline"), "resident");
  assert.equal(labelResidency("Resident and nonresident application period"), "any");
  assert.equal(labelResidency("Big game application period"), "any");
});

test("species filter: empty means all species; other states are ignored", () => {
  const elkOnly = computeDueReminders(member({ residency: "both" }), [UTAH, IDAHO], "2026-10-27");
  assert.ok(elkOnly.every((r) => r.species === "elk" && r.state === "utah"));
  const all = computeDueReminders(member({ residency: "both", species: [] }), [UTAH, IDAHO], "2026-10-27");
  assert.ok(all.some((r) => r.species === "mule-deer"));
  // A state in preferences without agency data (not passed in) gives nothing and doesn't throw.
  assert.deepEqual(computeDueReminders(member({ states: ["texas"] }), [UTAH], "2026-10-27"), []);
});

test("source falls back to the agency home page; old cycles are skipped", () => {
  const [id] = computeDueReminders(member({ states: ["idaho"], homeState: "CO" }), [UTAH, IDAHO], "2026-11-05");
  assert.equal(id.kind, "opens");
  assert.equal(id.sourceUrl, "https://idfg.idaho.gov");
  assert.deepEqual(labels(member({ residency: "both" }), "2027-10-27"), []); // 2026-dated items are past by then
});

test("results follow the member's state order", () => {
  // On 11-07 both states have 3-day items; the member listed Idaho first.
  const both = computeDueReminders(member({ states: ["idaho", "utah"], species: [], residency: "both" }), [UTAH, IDAHO], "2026-11-07");
  assert.equal(both[0].state, "idaho");
  assert.equal(both[both.length - 1].state, "utah");
});

test("groupReminders merges one key date shared by several species", () => {
  const items = computeDueReminders(member({ residency: "both", species: [] }), [UTAH], "2026-10-27");
  const [g] = groupReminders(items);
  assert.equal(g.stateName, "Utah");
  const sportsman = g.entries.filter((e) => e.label === "Sportsman permit drawing application period");
  assert.equal(sportsman.length, 1);
  assert.deepEqual(sportsman[0].species, ["elk", "mule-deer"]);
  assert.equal(sportsman[0].note, "Apply online.");
});

test("rejects a malformed today", () => {
  assert.throws(() => computeDueReminders(member(), [UTAH], "10/27/2026"));
});

test("nextReminderDates: soonest open date per live state, null when none published", () => {
  const empty: ReminderState = { ...UTAH, slug: "colorado", name: "Colorado", abbrev: "CO", species: [] };
  const got = nextReminderDates(member({ states: ["colorado", "utah", "texas"], residency: "both" }), [UTAH, empty], "2026-10-28");
  assert.deepEqual(got, [
    { state: "colorado", stateName: "Colorado", next: null },
    { state: "utah", stateName: "Utah", next: { label: "Bonus point only deadline", end: "2026-10-30", daysLeft: 2 } },
  ]);
});

test("notification/results labels and start-only dates never produce a reminder", () => {
  const st: ReminderState = {
    ...UTAH,
    species: [
      {
        ...UTAH.species[0],
        keyDates: [
          kd({ label: "Successful applicants notified by", date: "2026-11-10" }),
          kd({ label: "Point results posted", date: "2026-11-10" }),
          kd({ label: "Application period opens", start: "2026-11-10" }),
          kd({ label: "Application deadline", date: "2026-11-10" }),
        ],
      },
    ],
  };
  assert.deepEqual(labels(member(), "2026-10-27", [st]), ["Application deadline|closes|14"]);
});

test("nextReminderDates carries the window start so the card can say opens/closes", () => {
  const st: ReminderState = {
    ...UTAH,
    species: [{ ...UTAH.species[0], keyDates: [kd({ label: "Limited-entry turkey draw application period", start: "2026-12-15", end: "2026-12-29" })] }],
  };
  assert.deepEqual(nextReminderDates(member(), [st], "2026-10-31")[0].next, {
    label: "Limited-entry turkey draw application period",
    start: "2026-12-15",
    end: "2026-12-29",
    daysLeft: 59,
  });
});

test("labelResidency: a nonresident license joined to another by 'and' is for everyone", () => {
  assert.equal(labelResidency("Elk permit and nonresident combination application period"), "any");
  assert.equal(labelResidency("Nonresident and Unit 4 spring turkey application period"), "any");
  assert.equal(labelResidency("Nonresident preference point purchase without applying for a combination license"), "nonresident");
  assert.equal(labelResidency("Nonresident draw — deadline to buy second-period tags and all DAV tags"), "nonresident");
});
