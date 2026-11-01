// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DrawRecord, KeyDate, SpeciesInfo } from "@/data/agency/schema";
import { buildCalendar, foldLine, huntEvents, icsEscape, icsStamp, plannerCalendar } from "@/lib/ics";
import { buildPlannedHunt, type PlannerState } from "@/lib/planner-agency";

const NOW = new Date("2026-10-31T18:04:05.678Z");

test("escaping TEXT values", () => {
  assert.equal(icsEscape("a, b; c\\d\ne\r\nf"), "a\\, b\\; c\\\\d\\ne\\nf");
});

test("folding at 75 octets without splitting UTF-8 characters", () => {
  const short = "SUMMARY:short";
  assert.equal(foldLine(short), short);
  const long = "DESCRIPTION:" + "x".repeat(200);
  const lines = foldLine(long).split("\r\n");
  assert.equal(lines[0].length, 75);
  for (const l of lines.slice(1)) {
    assert.ok(l.startsWith(" "));
    assert.ok(new TextEncoder().encode(l).length <= 75);
  }
  assert.equal(lines.map((l, i) => (i ? l.slice(1) : l)).join(""), long);
  // Multi-byte: "—" is 3 octets; no line may exceed 75 octets and no character is split.
  const dash = "SUMMARY:" + "—".repeat(60);
  const parts = foldLine(dash).split("\r\n");
  for (const p of parts) assert.ok(new TextEncoder().encode(p).length <= 75);
  assert.equal(parts.map((l, i) => (i ? l.slice(1) : l)).join(""), dash);
});

test("calendar structure: CRLF, required properties, all-day dates with exclusive end", () => {
  const ics = buildCalendar({
    name: "My, planner",
    now: NOW,
    events: [
      { uid: "e1@huntscoutpro.com", start: "2027-03-01", end: "2027-03-01", summary: "Opens: Primary draw; CPW", description: "Line 1\nSource: https://cpw.state.co.us/a,b", url: "https://cpw.state.co.us/x" },
      { uid: "e2@huntscoutpro.com", start: "2027-12-31", end: "2028-01-02", summary: "Season" },
    ],
  });
  assert.ok(ics.endsWith("\r\n"));
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false, "bare LF");
  const lines = ics.split("\r\n");
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.ok(lines.includes("VERSION:2.0"));
  assert.ok(lines.some((l) => l.startsWith("PRODID:")));
  assert.ok(lines.includes("X-WR-CALNAME:My\\, planner"));
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 2);
  assert.equal(lines.filter((l) => l === "END:VEVENT").length, 2);
  assert.ok(lines.includes("UID:e1@huntscoutpro.com"));
  assert.ok(lines.includes(`DTSTAMP:${icsStamp(NOW)}`));
  assert.equal(icsStamp(NOW), "20261031T180405Z");
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20270301"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20270302"));
  // Year rollover for the exclusive end.
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20271231"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20280103"));
  assert.ok(lines.includes("SUMMARY:Opens: Primary draw\\; CPW"));
  assert.ok(ics.includes("DESCRIPTION:Line 1\\nSource: https://cpw.state.co.us/a\\,b"));
  assert.equal(lines[lines.length - 2], "END:VCALENDAR");
  for (const l of lines) assert.ok(new TextEncoder().encode(l).length <= 75, l);
});

const kd = (k: Partial<KeyDate> & { label: string }): KeyDate => ({ cycle: 2027, status: "confirmed", sourceId: "d-dates", ...k });
const STATE: PlannerState = {
  slug: "idaho",
  name: "Idaho",
  agency: { name: "Idaho Department of Fish and Game", shortName: "IDFG", url: "https://idfg.idaho.gov" },
  unitTerm: "Unit",
  species: [],
  seasons: [{ species: "bear", label: "General spring bear", start: "2027-04-01", end: "2027-06-30", year: 2027, sourceId: "d-dates" }],
  sources: [{ id: "d-dates", title: "Big Game Seasons & Rules", publisher: "IDFG", url: "https://idfg.idaho.gov/rules", retrieved: "2026-10-31" }],
  fees: [],
};
const INFO: SpeciesInfo = {
  species: "bear",
  drawSystem: "random",
  drawSystemSummary: "",
  pointsMatter: false,
  sourceIds: [],
  keyDates: [
    kd({ label: "Spring black bear controlled hunt application period", start: "2027-01-15", end: "2027-02-15" }),
    kd({ label: "Fall black bear controlled hunt application period", start: "2026-05-01", end: "2026-06-05", cycle: 2026 }),
  ],
};
// A 2027 hunt-list row (the hunt's own 2027 season dates).
const ROW: DrawRecord = { species: "bear", year: 2027, huntCode: "8001", units: ["22"], description: "Controlled Hunt — Hunt Area 22-1", choice: "first", seasonDates: "2027-04-15 to 2027-05-15", sourceId: "d-dates" };

test("hunt events: published windows become opens/closes, hunt seasons are multi-day, and nothing passed or unpublished is exported", () => {
  const { hunt } = buildPlannedHunt({ state: STATE, info: INFO, residency: "resident", today: "2026-10-31", now: "x", kind: "draw", row: ROW, drawing: "spring", id: "bear1" });
  const withMine = { ...hunt, customDates: [{ id: "c1", label: "Book flights", date: "2026-12-01" }, { id: "c0", label: "Old", date: "2026-01-01" }] };
  const ev = huntEvents(withMine, "2026-10-31", "https://www.huntscoutpro.com/planner");
  assert.deepEqual(
    ev.map((e) => [e.summary, e.start, e.end]),
    [
      ["Book flights — Idaho Black Bear 8001", "2026-12-01", "2026-12-01"],
      ["Opens: Spring black bear controlled hunt application period — Idaho Black Bear 8001", "2027-01-15", "2027-01-15"],
      ["Closes: Spring black bear controlled hunt application period — Idaho Black Bear 8001", "2027-02-15", "2027-02-15"],
      ["Season — Idaho Black Bear 8001", "2027-04-15", "2027-05-15"],
    ]
  );
  const close = ev[2];
  assert.match(close.description!, /Application · 2027 cycle from Idaho Department of Fish and Game\./);
  assert.match(close.description!, /Source: https:\/\/idfg\.idaho\.gov\/rules/);
  assert.match(close.description!, /Planner: https:\/\/www\.huntscoutpro\.com\/planner\/hunt\/bear1/);
  assert.equal(close.url, "https://idfg.idaho.gov/rules");
  // UIDs are unique and stable.
  assert.equal(new Set(ev.map((e) => e.uid)).size, ev.length);
  assert.deepEqual(huntEvents(withMine, "2026-10-31", "https://www.huntscoutpro.com/planner").map((e) => e.uid), ev.map((e) => e.uid));
  // Once the window opens, only the close is exported.
  assert.equal(huntEvents(hunt, "2027-01-20", "https://x/planner").filter((e) => e.summary.startsWith("Opens")).length, 0);

  // Fall hunt: only 2026 dates (passed, not the planned 2027 cycle), and its 2026 row's season isn't the 2027 one -> no events at all.
  const fall = buildPlannedHunt({ state: STATE, info: INFO, residency: "resident", today: "2026-10-31", now: "x", kind: "draw", row: { ...ROW, year: 2026, huntCode: "8501", seasonDates: "2026-11-15 to 2026-12-15" }, drawing: "fall", id: "bear2" }).hunt;
  assert.equal(fall.agency!.cyclePublished, false);
  assert.deepEqual(huntEvents(fall, "2026-10-31", "https://x/planner"), []);
  // Statewide seasons (not specific to the hunt) stay off the calendar.
  const otc = buildPlannedHunt({ state: STATE, info: INFO, residency: "resident", today: "2026-10-31", now: "x", kind: "otc", id: "bear3" }).hunt;
  assert.equal(otc.agency!.seasons![0].scope, "statewide");
  assert.deepEqual(huntEvents(otc, "2026-10-31", "https://x/planner"), []);

  const cal = plannerCalendar([withMine, fall, otc], "2026-10-31", NOW, "https://www.huntscoutpro.com/planner");
  assert.equal(cal.split("\r\n").filter((l) => l === "BEGIN:VEVENT").length, 4);
});

test("tentative agency dates say so in the summary and as STATUS:TENTATIVE", () => {
  const info = { ...INFO, keyDates: [kd({ label: "Spring black bear controlled hunt application period", start: "2027-01-15", end: "2027-02-15", status: "tentative" })] };
  const { hunt } = buildPlannedHunt({ state: STATE, info, residency: "resident", today: "2026-10-31", now: "x", kind: "draw", row: ROW, drawing: "spring", id: "bear1" });
  const ev = huntEvents(hunt, "2026-10-31", "https://x/planner").filter((e) => !e.summary.startsWith("Season"));
  assert.equal(ev.length, 2);
  for (const e of ev) {
    assert.match(e.summary, /\(tentative\)/);
    assert.equal(e.tentative, true);
  }
  const cal = plannerCalendar([hunt], "2026-10-31", NOW, "https://x/planner");
  assert.equal(cal.split("\r\n").filter((l) => l === "STATUS:TENTATIVE").length, 2);
});
