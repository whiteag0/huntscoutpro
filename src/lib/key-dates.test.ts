// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupKeyDates, ownNote, sharedNote } from "@/lib/key-dates";
import type { KeyDate } from "@/data/agency/schema";

const kd = (k: Partial<KeyDate> & { label: string }): KeyDate => ({ cycle: 2026, status: "confirmed", sourceId: "d-src", ...k });
const CAVEAT = "2027 dates not yet published by the agency as of 2026-10-31; these are the 2026 dates.";

test("sharedNote: the caveat every date starts with, by '; ' part", () => {
  assert.equal(sharedNote([{ note: CAVEAT }, { note: CAVEAT }]), CAVEAT);
  assert.equal(sharedNote([{ note: "Not yet published as of 2026-10-31" }, { note: "Not yet published as of 2026-10-31; Nonresident only" }]), "Not yet published as of 2026-10-31");
  assert.equal(sharedNote([{ note: CAVEAT }, { note: "Set by rule 206" }]), "");
  assert.equal(sharedNote([{ note: CAVEAT }, {}]), "");
  assert.equal(sharedNote([{ note: CAVEAT }]), "", "one date keeps its own note");
  assert.equal(sharedNote([]), "");
});

test("sharedNote and ownNote: sentence parts, without splitting times, dates or abbreviations", () => {
  const C = "CPW hasn't published 2027 dates yet. These are the 2026 dates.";
  const a = `${C} For nonresident elk points only.`;
  const b = `${C} Applications close at 8 p.m. MT. Apply online.`;
  assert.equal(sharedNote([{ note: a }, { note: b }, { note: C }]), C);
  assert.equal(ownNote(a, C), "For nonresident elk points only.");
  assert.equal(ownNote(b, C), "Applications close at 8 p.m. MT. Apply online.");
  assert.equal(ownNote(C, C), "");
  // "a.m. AKST", "Aug. 1", "U.S. Postal" are not sentence ends.
  const t1 = "Opens 8 a.m. AKST on Aug. 1. Mailed applications need a U.S. Postal Service postmark.";
  const t2 = "Opens 8 a.m. AKST on Aug. 1. Online only.";
  assert.equal(sharedNote([{ note: t1 }, { note: t2 }]), "Opens 8 a.m. AKST on Aug. 1.");
  assert.equal(sharedNote([{ note: "Opens 8 a.m. AKST. Online only." }, { note: "Opens 8 a.m. MDT. Online only." }]), "");
  assert.equal(sharedNote([{ note: "Hunt area near St. Johns. Draw only." }, { note: "Hunt area near St. Johns. Over the counter." }]), "Hunt area near St. Johns.");
  // A part shared only as a prefix of a longer sentence doesn't count.
  assert.equal(sharedNote([{ note: "Results in June. Apply early." }, { note: "Results in June and July." }]), "");
  // Either separator can follow the shared part.
  assert.equal(sharedNote([{ note: "Rule A applies. Apply early." }, { note: "Rule A applies.; apply early" }]), "Rule A applies.");
  assert.equal(ownNote("Rule A applies.; apply early", "Rule A applies."), "apply early");
});

test("ownNote: what's left after the shared caveat", () => {
  assert.equal(ownNote(CAVEAT, CAVEAT), "");
  assert.equal(ownNote("Not yet published; Nonresident only", "Not yet published"), "Nonresident only");
  assert.equal(ownNote("Set by rule 206", "Not yet published"), "Set by rule 206");
  assert.equal(ownNote("Set by rule 206", ""), "Set by rule 206");
  assert.equal(ownNote(undefined, CAVEAT), "");
});

test("groupKeyDates: upcoming (confirmed and tentative) in date order, passed apart with one caveat", () => {
  const dates = [
    kd({ label: "Secondary draw deadline", date: "2027-06-30", cycle: 2027, status: "tentative", note: "Set by rule B" }),
    kd({ label: "Primary application period", start: "2026-03-01", end: "2026-04-07", note: CAVEAT }),
    kd({ label: "Primary draw deadline", date: "2027-04-06", cycle: 2027, status: "tentative", note: "Set by rule A" }),
    kd({ label: "Results posted", date: "2026-05-26", note: CAVEAT }),
    kd({ label: "Point purchase period", start: "2026-07-01", end: "2026-11-04", note: CAVEAT }),
  ];
  const g = groupKeyDates(dates, "2026-11-04");
  assert.deepEqual(g.upcoming.map((d) => d.label), ["Point purchase period", "Primary draw deadline", "Secondary draw deadline"]);
  assert.deepEqual(g.past.map((d) => d.label), ["Primary application period", "Results posted"]);
  assert.equal(g.pastNote, CAVEAT);
  assert.equal(g.upcomingNote, "");
  assert.deepEqual(g.pastCycles, [2026]);
  const later = groupKeyDates(dates, "2027-05-01");
  assert.deepEqual(later.upcoming.map((d) => d.label), ["Secondary draw deadline"]);
  assert.deepEqual(later.pastCycles, [2026, 2027]);
});
