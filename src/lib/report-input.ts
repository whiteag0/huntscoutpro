// Reading a member's free-text answers ("CO GMU 61 and 62", "CO elk 4 preference
// points") for the personal scouting report. Pure functions, no I/O: `npm test`.
//
// Nothing here guesses. A unit is kept only when it matches a unit id the agency
// actually publishes for that state and species; a point balance only when the
// answer ties a number to "points" and the state and species can be told (from
// the same phrase, or because the member picked just one). Everything that can't
// be tied down is returned as unmatched so the report can say so.

import { canonicalUnit } from "@/lib/agency-view";
import { pointsKey, type PointsMap } from "@/lib/points-schema";

export interface MemberState {
  slug: string;
  name: string;
  abbrev: string;
  /** What the agency calls a unit ("GMU", "Hunt Area", "Hunting District"...), from its draw meta. */
  unitTerm?: string;
}

// ------------------------------------------------------------
// Splitting an answer by the states it names
// ------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Where each of the member's states is named in the text: its full name (any case)
 * or its two-letter abbreviation written in capitals ("CO", "WY"; "or" stays a word).
 */
function stateMentions(text: string, states: readonly MemberState[]): { at: number; end: number; slug: string }[] {
  const out: { at: number; end: number; slug: string }[] = [];
  for (const s of states) {
    const name = new RegExp(`\\b${escapeRe(s.name)}\\b`, "gi");
    const abbrev = new RegExp(`\\b${escapeRe(s.abbrev.toUpperCase())}\\b`, "g");
    for (const re of [name, abbrev]) {
      for (const m of text.matchAll(re)) out.push({ at: m.index!, end: m.index! + m[0].length, slug: s.slug });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The text split into runs, each tagged with the state named most recently before it (null before any). */
export function segmentByState(text: string, states: readonly MemberState[]): { slug: string | null; text: string }[] {
  const marks = stateMentions(text, states);
  const out: { slug: string | null; text: string }[] = [];
  let cursor = 0;
  let current: string | null = null;
  for (const m of marks) {
    if (m.at < cursor) continue;
    if (m.at > cursor) out.push({ slug: current, text: text.slice(cursor, m.at) });
    current = m.slug;
    cursor = m.end;
  }
  if (cursor < text.length) out.push({ slug: current, text: text.slice(cursor) });
  return out.filter((s) => s.text.trim());
}

// ------------------------------------------------------------
// Units
// ------------------------------------------------------------

const YEAR = /^(19[5-9]\d|20[0-4]\d)$/;
/** Words that make a number a count of something else, not a unit ("4 points", "2 years", "3rd season"). */
const NOT_A_UNIT_AFTER = /^\s*(?:\+\s*)?(?:pref(?:erence)?\.?\s*|bonus\s*)?(?:points?|pts?|pp|bp|years?|yrs?|days?|tags?|licen[cs]es?|people|hunters?|guys|kids|%|percent)\b/i;
const ORDINAL = /^(?:st|nd|rd|th)$/i;

/** Unit-like tokens in a run of text: "61", "061", "16A", "2-1", "H4A", "701W". */
export function unitTokens(text: string): string[] {
  return unitTokensAt(text).map((t) => t.tok);
}

function unitTokensAt(text: string): { tok: string; at: number }[] {
  const out: { tok: string; at: number }[] = [];
  const re = /(?<![\w$.])([A-Z]{0,2}\d{1,4}[A-Z]{0,4}(?:-\d{1,2}[A-Z]?)?)(?![\w%])/gi;
  for (const m of text.matchAll(re)) {
    const tok = m[1];
    const digits = tok.replace(/\D/g, "");
    if (YEAR.test(tok)) continue;
    const suffix = tok.replace(/^[A-Z]{0,2}\d+/i, "");
    if (ORDINAL.test(suffix)) continue;
    if (NOT_A_UNIT_AFTER.test(text.slice(m.index! + tok.length))) continue;
    if (!digits) continue;
    out.push({ tok, at: m.index! });
  }
  return out;
}

/** Prefixes agencies put in front of an id that members leave off ("Zone 4", "Deer Area 2011"). */
const LOOSE_PREFIX = /^(?:ZONE|AREA|DEER AREA|ELK AREA|SHEEP UNIT|GOAT UNIT|BBMU|DISTRICT|REGION)\s+/;

export function looseUnit(unit: string): string {
  return canonicalUnit(unit).replace(LOOSE_PREFIX, "");
}

// The kind of unit a word names. "GMU 61" with no state named shouldn't also match Wyoming
// Hunt Area 61; "unit" is used loosely everywhere, so it doesn't narrow anything.
type UnitKind = "gmu" | "area" | "district" | "zone" | "wmu";
const KIND_WORDS = /\b(?:(GMUs?)|(hunt\s+areas?|areas?)|(hunting\s+districts?|districts?|HDs?)|(zones?)|(WMUs?))\b/gi;
const KINDS: UnitKind[] = ["gmu", "area", "district", "zone", "wmu"];

function kindOfTerm(term: string | undefined): UnitKind | null {
  const t = (term || "").toLowerCase();
  if (/\bgmu\b|\bunit\b/.test(t)) return "gmu";
  if (/\barea\b/.test(t)) return "area";
  if (/\bdistrict\b/.test(t)) return "district";
  if (/\bzone\b/.test(t)) return "zone";
  if (/\bwmu\b/.test(t)) return "wmu";
  return null;
}

/** The unit kind named most recently before `at` in the text, if any. */
function kindBefore(text: string, at: number): UnitKind | null {
  let kind: UnitKind | null = null;
  for (const m of text.slice(0, at).matchAll(KIND_WORDS)) kind = KINDS[m.slice(1).findIndex(Boolean)] ?? null;
  return kind;
}

const GENERIC_NAMES = /^(statewide|all units|various|multiple|zone|area|unit|region)$/i;

export interface UnitMatch {
  /** Units matched per state slug, as the agency writes them (one id per unit). */
  byState: Record<string, string[]>;
  /** Tokens from the answer that matched no published unit, with the state they were tied to (null: none named). */
  unmatched: { token: string; slug: string | null }[];
}

/**
 * Units in the member's answer that exist in the agency data.
 * `candidates(slug)` lists the unit ids published for that state (draw and harvest tables for the
 * member's species). A token is tied to the state named before it; with no state named, it is
 * tried in each of the member's states. Named units (Utah "Book Cliffs") match when the answer
 * contains the name.
 */
export function matchUnits(text: string, states: readonly MemberState[], candidates: (slug: string) => readonly string[]): UnitMatch {
  const byState: Record<string, string[]> = {};
  const unmatched: UnitMatch["unmatched"] = [];
  if (!text.trim() || !states.length) return { byState, unmatched };

  const index = new Map<string, Map<string, string>>();
  const indexFor = (slug: string) => {
    let m = index.get(slug);
    if (!m) {
      m = new Map();
      for (const u of candidates(slug)) {
        for (const k of [canonicalUnit(u), looseUnit(u)]) if (k && !m.has(k)) m.set(k, u);
      }
      index.set(slug, m);
    }
    return m;
  };
  const add = (slug: string, unit: string) => {
    const list = (byState[slug] ||= []);
    if (!list.some((u) => canonicalUnit(u) === canonicalUnit(unit))) list.push(unit);
  };

  for (const seg of segmentByState(text, states)) {
    const targets = seg.slug ? [seg.slug] : states.map((s) => s.slug);
    for (const { tok, at } of unitTokensAt(seg.text)) {
      const key = canonicalUnit(tok);
      let hit = false;
      // No state named: a unit word ("GMU", "area") narrows it to the states that use that word.
      const kind = seg.slug ? null : kindBefore(seg.text, at);
      const narrowed = kind ? targets.filter((slug) => kindOfTerm(states.find((s) => s.slug === slug)?.unitTerm) === kind) : [];
      for (const slug of narrowed.length ? narrowed : targets) {
        const unit = indexFor(slug).get(key) ?? indexFor(slug).get(looseUnit(tok));
        if (unit) {
          add(slug, unit);
          hit = true;
        }
      }
      if (!hit && !unmatched.some((u) => u.token === tok && u.slug === seg.slug)) unmatched.push({ token: tok, slug: seg.slug });
    }
    // Named units: the whole name appears in the answer.
    const lower = seg.text.toLowerCase();
    for (const slug of targets) {
      for (const u of candidates(slug)) {
        if (!/[a-z]{4,}/i.test(u) || GENERIC_NAMES.test(u) || u.length < 5 || /\d/.test(u)) continue;
        const re = new RegExp(`\\b${escapeRe(u.toLowerCase())}\\b`);
        if (re.test(lower)) add(slug, u);
      }
    }
  }
  return { byState, unmatched: unmatched.slice(0, 12) };
}

// ------------------------------------------------------------
// Points
// ------------------------------------------------------------

/** Species words members use, mapped to our species ids. "deer" alone is resolved later. */
const SPECIES_WORDS: [RegExp, string][] = [
  [/\belk\b/i, "elk"],
  [/\bmule\s*deer\b|\bmulies?\b|\bmuley\b/i, "mule-deer"],
  [/\bwhite\s*-?\s*tail(?:ed)?(?:\s*deer)?\b/i, "whitetail"],
  [/\bpronghorn\b|\bantelope\b|\bgoats?\s*\(antelope\)/i, "pronghorn"],
  [/\bmoose\b/i, "moose"],
  [/\bbear\b/i, "bear"],
  [/\bsheep\b|\bbighorn\b|\brams?\b/i, "sheep"],
  [/\bmountain\s*goats?\b|\bgoats?\b/i, "goat"],
  [/\blion\b|\bcougar\b|\bmountain\s*lion\b/i, "lion"],
  [/\bturkey\b/i, "turkey"],
];
const DEER = /\bdeer\b/i;

function speciesIn(clause: string, memberSpecies: readonly string[]): string[] {
  const found: string[] = [];
  let rest = clause;
  for (const [re, id] of SPECIES_WORDS) {
    if (re.test(rest)) {
      found.push(id);
      rest = rest.replace(new RegExp(re.source, "gi"), " ");
    }
  }
  if (DEER.test(rest)) {
    // Plain "deer": the member's one deer species, if they picked exactly one.
    const deer = memberSpecies.filter((s) => s === "mule-deer" || s === "whitetail");
    if (deer.length === 1) found.push(deer[0]);
  }
  return found;
}

const WORD_NUMBERS: Record<string, number> = { zero: 0, no: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const POINT_WORD = String.raw`(?:pref(?:erence)?\.?\s*|bonus\s*|loyalty\s*)?(?:points?|pts?|pp|bp)\b`;
const NUM_BEFORE = new RegExp(String.raw`(?<![\w.$-])(\d{1,2}|zero|no|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:\+\s*)?` + POINT_WORD, "gi");
const NUM_AFTER = /\b(?:points?|pts?)\s*(?::|=|-|of|at)?\s*(\d{1,2})(?![\w.%])/gi;

/** Words that make a bare number in a points answer something other than a point count. */
const NOT_POINTS_CONTEXT = /\b(?:seasons?|rifle|archery|bow|muzzle\w*|units?|gmus?|wmus?|areas?|districts?|hds?|zones?|hunts?|years?|yrs?|days?|tags?|licen[cs]es?|choices?|weeks?|people|hunters?|kids|age)\b/i;
const BARE_NUMBER = /(?<![\w.$/-])(\d{1,2})(?![\w.%/-])/g;

/** "CO elk 3": a species and one bare number, with nothing suggesting it counts something else. */
function barePointNumber(clause: string): number | null {
  if (NOT_POINTS_CONTEXT.test(clause)) return null;
  const nums = [...clause.matchAll(BARE_NUMBER)].map((m) => Number(m[1]));
  return nums.length === 1 && nums[0] <= 40 ? nums[0] : null;
}

function pointNumbers(clause: string): number[] {
  const out: number[] = [];
  for (const m of clause.matchAll(NUM_BEFORE)) {
    const raw = m[1].toLowerCase();
    const n = raw in WORD_NUMBERS ? WORD_NUMBERS[raw] : Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 40) out.push(n);
  }
  if (!out.length) {
    for (const m of clause.matchAll(NUM_AFTER)) {
      const n = Number(m[1]);
      if (n >= 0 && n <= 40) out.push(n);
    }
  }
  return out;
}

export interface PointsReading {
  /** "colorado.elk" -> 4, only for the member's live states and species. */
  points: PointsMap;
  /** Phrases that mention points but couldn't be tied to one state and species. */
  unassigned: string[];
}

/**
 * Point balances from the member's free-text answer. A phrase is a clause between
 * commas, semicolons, periods or line breaks; the state carries over from the last
 * one named. Within a clause there must be exactly one number of points.
 */
export function readPointsText(text: string, states: readonly MemberState[], species: readonly string[]): PointsReading {
  const points: PointsMap = {};
  const unassigned: string[] = [];
  if (!text.trim()) return { points, unassigned };
  const one = <T,>(list: readonly T[]) => (list.length === 1 ? list[0] : null);

  for (const seg of segmentByState(text, states)) {
    for (const rawClause of seg.text.split(/[,;\n]|\.(?=\s|$)|\band\b/i)) {
      const clause = rawClause.trim();
      if (!clause) continue;
      const mentioned = speciesIn(clause, species);
      let nums = pointNumbers(clause);
      if (!nums.length && mentioned.length === 1) {
        // The answer is to "what points do you hold", so "CO elk 3" means 3 points.
        const bare = barePointNumber(clause);
        if (bare !== null) nums = [bare];
      }
      if (!nums.length) continue;
      const state = seg.slug ?? one(states)?.slug ?? null;
      const named = mentioned.filter((s) => species.length === 0 || species.includes(s));
      // A phrase about a species the member didn't pick isn't theirs to assign.
      const sp = one(named) ?? (mentioned.length === 0 ? one(species) : null);
      if (nums.length !== 1 || !state || !sp) {
        if (unassigned.length < 6) unassigned.push(clause.slice(0, 80));
        continue;
      }
      points[pointsKey(state, sp)] = nums[0];
    }
  }
  return { points, unassigned };
}
