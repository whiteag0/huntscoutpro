// The personal scouting report a member gets after the /welcome form: every
// section assembled from HuntScout's agency data for the member's answers.
// Pure functions only (no data imports, no I/O) so it can be unit tested with
// plain Node (`npm test`); src/lib/report.ts loads the data and renders it.
//
// Same rules as the rest of the site: nothing is estimated, predicted or
// ranked by opinion. Each figure is copied from an agency row or is simple
// arithmetic on published counts (drawn / applicants, a price range), dates
// carry the agency's own status (confirmed, tentative, or last cycle's date
// shown for reference), and every table cites the documents it came from.

import type { StateData } from "@/lib/agency";
import type { DrawRecord, HarvestRecord, KeyDate, SeasonDate, SpeciesInfo, Species } from "@/data/agency/schema";
import { SPECIES_LABELS } from "@/data/types";
import { DRAW_SYSTEM_LABELS, formatDate, formatKeyDate, seasonScope, clipText } from "@/lib/agency-format";
import {
  canonicalUnit,
  drawStats,
  harvestMethodKey,
  isRealUnit,
  minPointsDrawn,
  oddsAtPoints,
  oddsOf,
  sameUnit,
  successOf,
  unitNameOf,
  type DrawResidency,
} from "@/lib/agency-view";
import { classifyState, huntsForYear, pickHarvest, resultsYear, type HuntStatus, type ShortlistHunt } from "@/lib/shortlist-core";
import { keyDateKind, keyDateResidency, requirementsOf } from "@/lib/planner-agency";
import type { AgencyDateKind } from "@/lib/planner-schema";
import { GOAL_OPTIONS, METHOD_OPTIONS, type HuntingPreferences } from "@/lib/preferences-schema";
import { pointsKey, type PointsMap } from "@/lib/points-schema";
import { matchUnits, readPointsText, type MemberState } from "@/lib/report-input";
import { STATE_LIST } from "@/data/state-list";

// ------------------------------------------------------------
// Limits (keep the PDF a readable length and the build fast)
// ------------------------------------------------------------

export const REPORT_LIMITS = {
  /** State × species sections covered in depth; the rest get a summary row. */
  combos: 6,
  unitsPerCombo: 4,
  huntsPerUnit: 10,
  historyYears: 5,
  shortlist: 10,
  topUnits: 8,
  takeaways: 5,
  glance: 14,
  upcomingDates: 12,
  referenceDates: 10,
  seasons: 12,
} as const;

/** Units with fewer reported hunters than this are left out of "top units by harvest success". */
export const TOP_UNIT_MIN_HUNTERS = 50;

// ------------------------------------------------------------
// Input
// ------------------------------------------------------------

export interface ReportStateInput {
  data: StateData;
  /** Species with a draw table in our data for this state. */
  drawSpecies: readonly string[];
  /** Species with a harvest table in our data for this state. */
  harvestSpecies: readonly string[];
}

export interface ReportTables {
  draw: DrawRecord[];
  harvest: HarvestRecord[];
}

export interface ReportInput {
  name?: string | null;
  prefs: HuntingPreferences;
  /** Structured point balances saved on the member's account ("colorado.elk" -> 4); win over the free-text answer. */
  savedPoints?: PointsMap;
  /** YYYY-MM-DD, Mountain Time. */
  today: string;
  /** Every live state's agency meta (small). */
  states: readonly ReportStateInput[];
  /** Tables for the combos returned by selectCombos(); others are never asked for. */
  tables: (slug: string, species: Species) => ReportTables;
}

// ------------------------------------------------------------
// Output model
// ------------------------------------------------------------

export interface ReportSource {
  n: number;
  title: string;
  publisher: string;
  url: string;
  dataYear?: number;
  retrieved: string;
}

export type DateStatus = "confirmed" | "tentative" | "rule" | "reference";

export interface DateRow {
  label: string;
  /** "Apr 6, 2027" or "Jan 4 – Feb 1, 2027". */
  when: string;
  /** Sort key: start (or the date). */
  sort: string;
  end: string;
  kind: AgencyDateKind;
  cycle: number;
  status: DateStatus;
  note?: string;
  src: number | null;
}

export interface SeasonRow {
  label: string;
  when: string;
  scope: string;
  note?: string;
  src: number | null;
}

export interface FeeRow {
  item: string;
  amount: number;
  licenseYear: number;
  group: "apply" | "general" | "species";
  note?: string;
  src: number | null;
}

export interface HarvestPoint {
  year: number;
  hunters: number | null;
  harvest: number | null;
  success: number;
  computed: boolean;
  src: number | null;
}

export interface HarvestSeries {
  /** Method / license type as the agency labels the rows, e.g. "All Manners of Take". */
  label: string;
  points: HarvestPoint[];
}

export interface HuntRow {
  huntCode: string;
  label: string;
  /** Season dates as the agency prints them for this hunt, when published. */
  season?: string;
  antlerless: boolean;
  units: string[];
  quota: number | null;
  applicants: number | null;
  drawn: number | null;
  odds: number | null;
  oddsComputed: boolean;
  pool: DrawResidency | "total";
  minPoints: number | null;
  atPoints: { points: number; applicants: number; drawn: number; pct: number } | null;
  harvest: { year: number; pct: number; label: string; matchedBy: "hunt" | "unit"; computed: boolean; src: number | null } | null;
  src: number | null;
}

export interface HistoryCell {
  odds: number | null;
  minPoints: number | null;
  src: number | null;
}

export interface UnitDive {
  unit: string;
  name?: string;
  harvest: HarvestSeries | null;
  harvestNote?: string;
  drawYear: number | null;
  hunts: HuntRow[];
  moreHunts: number;
  methodNote?: string;
  history: { years: number[]; rows: { huntCode: string; cells: (HistoryCell | null)[] }[] };
}

export interface TopUnitRow {
  unit: string;
  name?: string;
  hunters: number | null;
  harvest: number | null;
  success: number;
  computed: boolean;
  src: number | null;
}

export interface ShortlistRow {
  huntCode: string;
  label: string;
  units: string[];
  status: HuntStatus;
  /** Antlerless / female-only hunt (listed after the others). */
  antlerless: boolean;
  /** Plain-language result for the member's pool, e.g. "12 of 12 drew at 4 pts (100%)". */
  result: string;
  odds: number | null;
  minPoints: number | null;
  harvestPct: number | null;
  harvestYear: number | null;
  src: number | null;
}

export interface ComboSection {
  id: string;
  stateSlug: string;
  stateName: string;
  abbrev: string;
  agencyName: string;
  agencyShort: string;
  agencyUrl: string;
  unitTerm: string;
  species: Species;
  speciesLabel: string;
  /** The agency's own name for the species when it differs, e.g. "Mule deer (Wyoming deer licenses)". */
  speciesNote?: string;
  residency: DrawResidency;
  residencyBasis: string;
  drawSystemLabel: string;
  pointsMatter: boolean;
  pointName?: string;
  points: number | null;
  pointsFrom: "saved" | "answer" | null;
  /** How the draw works, copied from our agency notes. */
  summary: string;
  residencyNote?: string;
  otcSummary?: string;
  requirements: string[];
  dates: {
    upcoming: DateRow[];
    reference: DateRow[];
    referenceCycle: number | null;
    planCycle: number | null;
    nextApplication: DateRow | null;
    lastApplication: DateRow | null;
    /** Other main applications whose new dates aren't published yet (last cycle's dates), when nextApplication is set. */
    otherApplications: DateRow[];
  };
  /** specialOnly: every listed season is a special-area / eligibility hunt the agency prints without a hunt number. */
  seasons: { year: number | null; rows: SeasonRow[]; forPlanCycle: boolean; methodFiltered: boolean; specialOnly: boolean };
  fees: { rows: FeeRow[]; speciesRange: { min: number; max: number; count: number } | null };
  units: UnitDive[];
  unitsAsked: boolean;
  topUnits: { year: number; label: string; rows: TopUnitRow[] } | null;
  shortlist: {
    drawYear: number | null;
    rows: ShortlistRow[];
    matched: number;
    drewAtPoints: number;
    /** The member's methods when the list was limited to them ("rifle or archery"), else null. */
    methods: string | null;
    /** Of those, male / either-sex hunts and antlerless hunts. */
    atLevelPrimary: number;
    atLevelAntlerless: number;
    stretch: number;
    notes: string[];
  } | null;
  checklist: string[];
  sources: number[];
}

export interface CompactRow {
  stateName: string;
  speciesLabel: string;
  drawSystemLabel: string;
  residency: DrawResidency;
  next: string;
  status: DateStatus | "none";
}

export interface GlanceRow {
  when: string;
  sort: string;
  stateName: string;
  species: string[];
  label: string;
  status: DateStatus;
}

export interface ScoutingReport {
  name: string | null;
  firstName: string | null;
  generatedOn: string;
  /** Plan year shown on the cover ("2027 application season"). */
  season: number;
  answers: { label: string; value: string }[];
  readNotes: string[];
  takeaways: { lead: string; text: string }[];
  glance: GlanceRow[];
  combos: ComboSection[];
  /** Combos beyond the in-depth limit, plus states picked without a species. */
  compact: CompactRow[];
  comingSoon: string[];
  notCovered: string[];
  sources: ReportSource[];
  /** Live states chosen, in order. */
  stateNames: string[];
  speciesLabels: string[];
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const n0 = (v: number) => v.toLocaleString("en-US");
export const pctText = (v: number) => `${Number(v.toFixed(1))}%`;
const speciesLabel = (s: string) => (SPECIES_LABELS as Record<string, string>)[s] || s;

/**
 * Separate drawings that aren't the main application for a species. A DAV (disabled
 * veteran) date counts as special unless the label is a main drawing that also takes
 * DAV applications (Idaho: "Nonresident general season deer/elk tag drawing — first
 * application period (also DAV draw)").
 */
const SPECIAL = /super\s*hunt|raffle|landowner|governor|auction|\bexpo\b|sportsman|conservation|youth|tier\s*(ii|2)\b|^(?!.*(?:first application|also DAV)).*\bDAV\b|apprentice|disabled|mentor|access permit|multi-season|community subsistence|\bCSH\b/i;

class SourceBook {
  private ids = new Map<string, number>();
  readonly list: ReportSource[] = [];
  cite(st: StateData, sourceId: string | undefined): number | null {
    if (!sourceId) return null;
    const key = `${st.slug}|${sourceId}`;
    const hit = this.ids.get(key);
    if (hit) return hit;
    const s = st.sources.find((x) => x.id === sourceId);
    if (!s) return null;
    const n = this.list.length + 1;
    this.list.push({ n, title: s.title, publisher: s.publisher, url: s.url, dataYear: s.dataYear, retrieved: s.retrieved });
    this.ids.set(key, n);
    return n;
  }
}

/** How the member applies in a state, and why we think so. */
export function residencyFor(prefs: Pick<HuntingPreferences, "homeState" | "residency">, abbrev: string): { residency: DrawResidency; basis: string } {
  const home = (prefs.homeState || "").toUpperCase();
  if (/^[A-Z]{2}$/.test(home)) {
    return home === abbrev
      ? { residency: "resident", basis: `Resident (home state ${home})` }
      : { residency: "nonresident", basis: `Nonresident (home state ${home})` };
  }
  if (prefs.residency === "resident" || prefs.residency === "nonresident") {
    return { residency: prefs.residency, basis: `${prefs.residency === "resident" ? "Resident" : "Nonresident"} (from your answer)` };
  }
  return { residency: "nonresident", basis: "Nonresident figures shown (no home state given)" };
}

function infoFor(st: ReportStateInput, species: string): SpeciesInfo | null {
  const info = st.data.species.find((s) => s.species === species);
  if (!info || info.drawSystem === "none") return null;
  return st.drawSpecies.includes(species) || st.harvestSpecies.includes(species) ? info : null;
}

export interface ComboKey {
  slug: string;
  species: Species;
}

/** Which state × species pairs get an in-depth section, in the member's order. */
export function selectCombos(prefs: Pick<HuntingPreferences, "states" | "species">, states: readonly ReportStateInput[]): { deep: ComboKey[]; overflow: ComboKey[] } {
  const bySlug = new Map(states.map((s) => [s.data.slug, s]));
  const all: ComboKey[] = [];
  for (const slug of prefs.states) {
    const st = bySlug.get(slug);
    if (!st) continue;
    for (const sp of prefs.species) if (infoFor(st, sp)) all.push({ slug, species: sp as Species });
  }
  return { deep: all.slice(0, REPORT_LIMITS.combos), overflow: all.slice(REPORT_LIMITS.combos) };
}

// ------------------------------------------------------------
// Key dates
// ------------------------------------------------------------

const KIND_ORDER: readonly AgencyDateKind[] = ["license-sale", "application", "application-change", "points", "results", "payment", "surrender", "leftover", "other"];
const NOTE_NOT_PUBLISHED = /not (yet )?(been )?published|these are the \d{4} dates/i;

function endOf(k: KeyDate): string {
  return k.end || k.date || "";
}

function statusOf(k: KeyDate): DateStatus {
  if (k.status === "confirmed") return "confirmed";
  return /\brule\b|set by|standing/i.test(k.note || "") ? "rule" : "tentative";
}

function dateRow(st: StateData, k: KeyDate, book: SourceBook, status?: DateStatus): DateRow {
  const end = endOf(k);
  const note = k.note && !NOTE_NOT_PUBLISHED.test(k.note) ? clipText(k.note, 190) : undefined;
  return {
    label: k.label,
    when: formatKeyDate(k) || formatDate(end),
    sort: k.start || end,
    end,
    kind: keyDateKind(k),
    cycle: k.cycle,
    status: status ?? statusOf(k),
    ...(note ? { note } : {}),
    src: book.cite(st, k.sourceId),
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

const byDate = (a: DateRow, b: DateRow) => a.sort.localeCompare(b.sort) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label);

export function datesFor(st: StateData, info: SpeciesInfo, residency: DrawResidency, today: string, book: SourceBook): ComboSection["dates"] {
  const mine = info.keyDates.filter((k) => {
    const only = keyDateResidency(k);
    return (!only || only === residency) && ISO.test(endOf(k));
  });
  const upcomingKeys = mine.filter((k) => endOf(k) >= today);
  const upcoming = upcomingKeys.map((k) => dateRow(st, k, book)).sort(byDate);
  const isMainApp = (r: DateRow) => r.kind === "application" && !SPECIAL.test(r.label);
  const nextApplication = upcoming.find(isMainApp) ?? null;

  // Last cycle's schedule, for the steps the coming cycle hasn't published yet.
  const past = mine.filter((k) => endOf(k) < today);
  const referenceCycle = past.length ? Math.max(...past.map((k) => k.cycle)) : null;
  const haveKinds = new Set(upcoming.filter((r) => !SPECIAL.test(r.label)).map((r) => r.kind));
  // A main application with no upcoming counterpart is still unpublished, even when another
  // application is (Idaho: the nonresident general-season drawing is published, the controlled
  // hunt application isn't). Agencies relabel steps between cycles ("application period" /
  // "application deadline"), so the counterpart is the upcoming main application that closes
  // within 45 days of the same date a year later.
  const upcomingAppEnds = upcoming.filter(isMainApp).map((r) => Date.parse(r.end));
  const hasCounterpart = (r: DateRow) => {
    const nextYear = Date.parse(r.end) + 365 * DAY_MS;
    return upcomingAppEnds.some((e) => Math.abs(e - nextYear) <= 45 * DAY_MS);
  };
  const reference =
    referenceCycle === null
      ? []
      : past
          .filter((k) => k.cycle === referenceCycle)
          .map((k) => dateRow(st, k, book, "reference"))
          .filter((r) => !haveKinds.has(r.kind) || (isMainApp(r) && !hasCounterpart(r)))
          .sort(byDate)
          .slice(0, REPORT_LIMITS.referenceDates);
  // The last cycle's main application: its earliest-closing one (later windows are second rounds or side draws).
  const pastApps = past.filter((k) => keyDateKind(k) === "application" && !SPECIAL.test(k.label));
  const lastAppCycle = pastApps.length ? Math.max(...pastApps.map((k) => k.cycle)) : null;
  const lastApplication =
    pastApps
      .filter((k) => k.cycle === lastAppCycle)
      .sort((a, b) => endOf(a).localeCompare(endOf(b)))
      .map((k) => dateRow(st, k, book, "reference"))[0] ?? null;
  const planCycle = nextApplication?.cycle ?? (referenceCycle !== null ? referenceCycle + 1 : upcoming[0]?.cycle ?? null);
  return {
    upcoming: upcoming.slice(0, REPORT_LIMITS.upcomingDates),
    reference,
    referenceCycle: reference.length ? referenceCycle : null,
    planCycle,
    nextApplication,
    lastApplication: nextApplication ? null : lastApplication,
    otherApplications: nextApplication ? reference.filter(isMainApp) : [],
  };
}


// ------------------------------------------------------------
// Seasons and fees
// ------------------------------------------------------------

function methodOfSeason(s: Pick<SeasonDate, "method" | "label">): string | undefined {
  if (s.method && s.method !== "all" && s.method !== "other") return s.method;
  const l = s.label;
  if (/archery|\bbow\b/i.test(l)) return "archery";
  if (/muzzleloader/i.test(l)) return "muzzleloader";
  if (/shotgun/i.test(l)) return "shotgun";
  if (/rifle|firearm/i.test(l)) return "rifle";
  return undefined;
}

const UNIT_ID = /^[A-Z]{0,3}\d+[A-Z0-9-]*$/i;

/** Where a season applies: "GMUs 1, 2, 3 +12", the agency's own wording when units aren't plain ids, else statewide. */
function scopeOf(s: Pick<SeasonDate, "units" | "residency">, unitTerm: string): string {
  const units = s.units || [];
  const ids = units.filter((u) => UNIT_ID.test(u.trim()));
  const other = units.filter((u) => !UNIT_ID.test(u.trim()));
  if (other.length && !ids.length) {
    return clipText(`${other.slice(0, 2).join("; ")}${other.length > 2 ? ` +${other.length - 2}` : ""}`, 90)!;
  }
  if (other.length) {
    const shown = ids.slice(0, 8);
    const more = ids.length - shown.length + other.length;
    return `${/s$/.test(unitTerm) ? unitTerm : `${unitTerm}s`} ${shown.join(", ")}${more ? ` +${more} more` : ""}`;
  }
  return seasonScope(s, /s$/.test(unitTerm) ? unitTerm : `${unitTerm}s`, 8) || "Statewide / standard";
}

const SPECIAL_AREA_SEASON = /special-area\/eligibility hunt|prints without a hunt number/i;

export function seasonsFor(
  st: StateData,
  species: string,
  residency: DrawResidency,
  methods: readonly string[],
  planCycle: number | null,
  book: SourceBook
): ComboSection["seasons"] {
  const mine = (st.seasons || []).filter(
    (s) => s.species === species && !s.huntCodes?.length && (!s.residency || s.residency === residency) && ISO.test(s.start) && ISO.test(s.end)
  );
  if (!mine.length) return { year: null, rows: [], forPlanCycle: false, methodFiltered: false, specialOnly: false };
  const years = new Set(mine.map((s) => s.year));
  const year = planCycle !== null && years.has(planCycle) ? planCycle : Math.max(...years);
  let rows = mine.filter((s) => s.year === year);
  // Special-area / eligibility hunts (Arizona's Hopi and Camp Navajo hunts) aren't the species' general
  // seasons: left out when there are other seasons, and labelled as such when they're all there is.
  const special = rows.filter((s) => SPECIAL_AREA_SEASON.test(s.note || ""));
  let specialOnly = false;
  if (special.length && special.length < rows.length) rows = rows.filter((s) => !SPECIAL_AREA_SEASON.test(s.note || ""));
  else if (special.length) specialOnly = true;
  let methodFiltered = false;
  if (methods.length) {
    const kept = rows.filter((s) => {
      const m = methodOfSeason(s);
      return !m || methods.includes(m);
    });
    if (kept.length && kept.length < rows.length) {
      rows = kept;
      methodFiltered = true;
    }
  }
  return {
    year,
    forPlanCycle: planCycle === year,
    methodFiltered,
    specialOnly,
    rows: rows
      .sort((a, b) => a.start.localeCompare(b.start) || a.label.localeCompare(b.label))
      .slice(0, REPORT_LIMITS.seasons)
      .map((s) => {
        const sameYear = s.start.slice(0, 4) === s.end.slice(0, 4);
        return {
          label: s.label,
          when: `${formatDate(s.start, !sameYear)} – ${formatDate(s.end)}`,
          scope: scopeOf(s, st.unitTerm),
          ...(s.note ? { note: clipText(s.note, 150) } : {}),
          src: book.cite(st, s.sourceId),
        };
      }),
  };
}

const FEE_SPECIES_WORDS: [RegExp, string[]][] = [
  [/\belk\b/i, ["elk"]],
  [/\bdeer\b/i, ["mule-deer", "whitetail"]],
  [/\bpronghorn|antelope\b/i, ["pronghorn"]],
  [/\bmoose\b/i, ["moose"]],
  [/\bbear\b/i, ["bear"]],
  [/\bsheep\b|bighorn/i, ["sheep"]],
  [/\bgoat\b/i, ["goat"]],
  [/\blion\b|cougar/i, ["lion"]],
  [/\bturkey\b/i, ["turkey"]],
  [/\bbison|buffalo|javelina|bobcat|furbearer|waterfowl|upland|fishing\b/i, ["other"]],
];

/** True when an all-species fee line names other species but not this one ("...for moose, sheep or mountain goat"). */
function namesOtherSpeciesOnly(item: string, species: string): boolean {
  const named = FEE_SPECIES_WORDS.filter(([re]) => re.test(item)).flatMap(([, ids]) => ids);
  return named.length > 0 && !named.includes(species) && !/\bfishing\b/i.test(item);
}

const APPLY_FEE = /\bapplication\b|processing|\bpoints?\b|pointguard|draw(?:ing)? fee|entry fee/i;

export function feesFor(st: StateData, species: string, residency: DrawResidency, planCycle: number | null, book: SourceBook): ComboSection["fees"] {
  const groups = new Map<string, StateData["fees"]>();
  for (const f of st.fees) {
    if (f.residency !== residency) continue;
    if (f.species && f.species !== species) continue;
    if (!f.species && namesOtherSpeciesOnly(f.item, species)) continue;
    const key = `${f.species ? "s" : "g"}|${f.item}`;
    const g = groups.get(key);
    if (g) g.push(f);
    else groups.set(key, [f]);
  }
  const score = (y: number) => (planCycle !== null && y === planCycle ? 1e5 : 0) + y;
  const rows: FeeRow[] = [];
  for (const g of groups.values()) {
    const year = g.reduce((best, f) => (score(f.licenseYear) > score(best) ? f.licenseYear : best), g[0].licenseYear);
    for (const f of g.filter((x) => x.licenseYear === year)) {
      rows.push({
        item: f.item,
        amount: f.amountUsd,
        licenseYear: f.licenseYear,
        group: APPLY_FEE.test(f.item) ? "apply" : f.species ? "species" : "general",
        ...(f.note ? { note: clipText(f.note, 140) } : {}),
        src: book.cite(st, f.sourceId),
      });
    }
  }
  const order = { apply: 0, general: 1, species: 2 } as const;
  rows.sort((a, b) => order[a.group] - order[b.group] || a.amount - b.amount || a.item.localeCompare(b.item));
  const lic = rows.filter((r) => r.group === "species");
  return {
    rows: rows.slice(0, 16),
    speciesRange: lic.length ? { min: Math.min(...lic.map((r) => r.amount)), max: Math.max(...lic.map((r) => r.amount)), count: lic.length } : null,
  };
}

// ------------------------------------------------------------
// Harvest
// ------------------------------------------------------------

const isWhole = (r: HarvestRecord) => (!r.sex || r.sex === "all") && (!r.residency || r.residency === "all");

/** Unit-level, whole-unit rows (no hunt, sex or residency split) with a success rate. */
function unitLevel(rows: readonly HarvestRecord[]): HarvestRecord[] {
  return rows.filter((r) => !r.hunt && isRealUnit(r.unit) && isWhole(r) && successOf(r) !== null);
}

/**
 * Which method series to follow: the agency's all-methods rows when it publishes them,
 * else the member's one method, else the series published in the most years.
 */
function pickMethodKey(rows: readonly HarvestRecord[], methods: readonly string[]): string | null {
  if (!rows.length) return null;
  const years = new Map<string, Set<number>>();
  for (const r of rows) {
    const k = harvestMethodKey(r);
    (years.get(k) || years.set(k, new Set()).get(k)!).add(r.year);
  }
  const most = (keys: string[]) => keys.sort((a, b) => years.get(b)!.size - years.get(a)!.size || a.localeCompare(b))[0] ?? null;
  const all = [...new Set(rows.filter((r) => r.method === "all").map(harvestMethodKey))];
  if (all.length) return most(all);
  if (methods.length === 1) {
    const mine = [...new Set(rows.filter((r) => r.method === methods[0]).map(harvestMethodKey))];
    // "All Rifle Seasons" over "First Rifle Seasons".
    const allSeasons = mine.filter((k) => /^all\b/i.test(k));
    if (allSeasons.length) return most(allSeasons);
    if (mine.length) return most(mine);
  }
  return most([...years.keys()]);
}

export function unitHarvest(rows: readonly HarvestRecord[], unit: string, methods: readonly string[], st: StateData, book: SourceBook): HarvestSeries | null {
  const forUnit = unitLevel(rows.filter((r) => sameUnit(r.unit, unit)));
  const key = pickMethodKey(forUnit, methods);
  if (!key) return null;
  const byYear = new Map<number, HarvestRecord>();
  for (const r of forUnit) {
    if (harvestMethodKey(r) !== key) continue;
    // One row per year; when an agency repeats a unit, keep the larger sample.
    const cur = byYear.get(r.year);
    if (!cur || (r.hunters ?? 0) > (cur.hunters ?? 0)) byYear.set(r.year, r);
  }
  const points = [...byYear.values()]
    .sort((a, b) => a.year - b.year)
    .slice(-6)
    .map((r) => ({
      year: r.year,
      hunters: r.hunters,
      harvest: r.harvest,
      success: successOf(r)!,
      computed: r.successPct == null || r.successComputed === true,
      src: book.cite(st, r.sourceId),
    }));
  return points.length ? { label: key, points } : null;
}

export function topUnits(rows: readonly HarvestRecord[], methods: readonly string[], unitNames: Record<string, string> | undefined, st: StateData, book: SourceBook): ComboSection["topUnits"] {
  const level = unitLevel(rows);
  if (!level.length) return null;
  const year = Math.max(...level.map((r) => r.year));
  const inYear = level.filter((r) => r.year === year);
  const key = pickMethodKey(inYear, methods);
  if (!key) return null;
  const best = new Map<string, HarvestRecord>();
  for (const r of inYear) {
    if (harvestMethodKey(r) !== key || (r.hunters ?? 0) < TOP_UNIT_MIN_HUNTERS) continue;
    const c = canonicalUnit(r.unit);
    const cur = best.get(c);
    if (!cur || (r.hunters ?? 0) > (cur.hunters ?? 0)) best.set(c, r);
  }
  const list = [...best.values()]
    .sort((a, b) => successOf(b)! - successOf(a)! || (b.hunters ?? 0) - (a.hunters ?? 0) || a.unit.localeCompare(b.unit, "en", { numeric: true }))
    .slice(0, REPORT_LIMITS.topUnits);
  if (!list.length) return null;
  return {
    year,
    label: key,
    rows: list.map((r) => ({
      unit: r.unit,
      name: r.unitName || unitNameOf(unitNames, r.unit),
      hunters: r.hunters,
      harvest: r.harvest,
      success: successOf(r)!,
      computed: r.successPct == null || r.successComputed === true,
      src: book.cite(st, r.sourceId),
    })),
  };
}

// ------------------------------------------------------------
// Draw rows
// ------------------------------------------------------------

/** Rows for the member's weapons: the method matches, or the agency gives none / "any". Empty methods keeps all. */
function forMethods<T extends { method?: string }>(rows: readonly T[], methods: readonly string[]): { rows: T[]; filtered: boolean } {
  if (!methods.length) return { rows: [...rows], filtered: false };
  const kept = rows.filter((r) => !r.method || r.method === "all" || r.method === "other" || methods.includes(r.method));
  return kept.length ? { rows: kept, filtered: kept.length < rows.length } : { rows: [...rows], filtered: false };
}

const ANTLERLESS_WORDS = /antlerless|\bcows?\b|\bdoes?\b|\bewes?\b|\bfemale\b|\bcalf\b|\bhens?\b/i;
const MALE_OR_EITHER_WORDS = /either|any elk|any deer|any antelope|any ram|\bspike|\bbulls?\b|\bbucks?\b|\brams?\b|antlered|\bmale\b|\bgobblers?\b|\btoms?\b|bearded/i;

/** Antlerless / female-only hunt: the agency's sex code, or its description when it gives no code. */
export function isAntlerless(r: Pick<DrawRecord, "sex" | "description">): boolean {
  if (r.sex) return r.sex === "female";
  const d = r.description.replace(/^[^:]*:\s*/, "");
  return ANTLERLESS_WORDS.test(d) && !MALE_OR_EITHER_WORDS.test(d.replace(/\bfemale\b/gi, ""));
}

/** A hunt the agency limits to private land ("private-land-only hunt 5 (P5)", "Unit 4 private land only"). */
export function isPrivateLandOnly(r: Pick<DrawRecord, "description">): boolean {
  return /private[-\s]lands?[-\s]only|(?:^|:)\s*private lands? (?:only|within)\b|antlerless deer private land\b/i.test(r.description);
}

const MALE_WORD: Partial<Record<string, string>> = { elk: "bull", moose: "bull", "mule-deer": "buck", whitetail: "buck", pronghorn: "buck", sheep: "ram", turkey: "bearded" };
/** "bull and either-sex" for elk, "ram and either-sex" for sheep... */
export function maleGroupName(species: string): string {
  return `${MALE_WORD[species] || "male"} and either-sex`;
}

const SEX_LABEL: Record<string, string> = { male: "Antlered / male", female: "Antlerless / female", either: "Either sex" };

/** Short hunt label: the agency's description without the repeated hunt code, clipped. */
export function huntLabel(r: Pick<DrawRecord, "huntCode" | "description" | "methodLabel" | "method" | "sex">): string {
  let d = r.description.replace(new RegExp(`^${r.huntCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[:—–-]\\s*`), "").trim();
  if (!d) d = [r.methodLabel || r.method, r.sex ? SEX_LABEL[r.sex] : ""].filter(Boolean).join(" · ");
  return clipText(d, 110) || r.huntCode;
}

function huntRow(r: DrawRecord, residency: DrawResidency, pointsMatter: boolean, points: number | null, harvest: readonly HarvestRecord[], st: StateData, book: SourceBook): HuntRow {
  const { stats, pool } = drawStats(r, residency);
  const odds = oddsOf(stats);
  const at = pointsMatter && points !== null ? oddsAtPoints(r, residency, points) : null;
  const h = harvest.length ? pickHarvest([...harvest], r, residency) : null;
  return {
    huntCode: r.huntCode,
    label: huntLabel(r),
    ...(r.seasonDates ? { season: clipText(r.seasonDates, 80) } : {}),
    antlerless: isAntlerless(r),
    units: r.units,
    quota: stats?.quota ?? (pool !== "total" ? r.total?.quota : null) ?? null,
    applicants: stats?.applicants ?? null,
    drawn: stats?.drawn ?? null,
    odds,
    oddsComputed: odds !== null && (stats?.oddsPct == null || stats?.oddsComputed === true),
    pool,
    minPoints: pointsMatter ? minPointsDrawn(r, residency) : null,
    atPoints: at && points !== null ? { points, ...at } : null,
    harvest: h ? { year: h.year, pct: h.successPct, label: h.label, matchedBy: h.matchedBy, computed: h.computed, src: book.cite(st, h.sourceId) } : null,
    src: book.cite(st, r.sourceId),
  };
}

const METHOD_RANK: Record<string, number> = { archery: 0, muzzleloader: 1, rifle: 2, shotgun: 3, all: 4, other: 5 };

export function unitDive(
  unit: string,
  draw: readonly DrawRecord[],
  harvest: readonly HarvestRecord[],
  ctx: { residency: DrawResidency; pointsMatter: boolean; points: number | null; methods: readonly string[]; unitNames?: Record<string, string>; st: StateData; book: SourceBook }
): UnitDive {
  const { residency, pointsMatter, points, methods, st, book } = ctx;
  const inUnit = draw.filter((r) => r.units.some((u) => sameUnit(u, unit)));
  const { year } = resultsYear(inUnit);
  let hunts: HuntRow[] = [];
  let more = 0;
  let methodNote: string | undefined;
  const history: UnitDive["history"] = { years: [], rows: [] };
  if (year !== null) {
    const latest = huntsForYear(inUnit, year);
    const { rows: mine, filtered } = forMethods(latest, methods);
    if (filtered) methodNote = `Showing ${methods.map((m) => METHOD_OPTIONS.find((o) => o.id === m)?.label.toLowerCase() || m).join(" and ")} hunts (and hunts open to any weapon); ${latest.length - mine.length} other ${st.unitTerm} ${unit} hunt${latest.length - mine.length === 1 ? " is" : "s are"} on HuntScout.`;
    const sorted = mine.sort(
      (a, b) =>
        (a.units.length === 1 ? 0 : 1) - (b.units.length === 1 ? 0 : 1) ||
        (METHOD_RANK[a.method || "other"] ?? 9) - (METHOD_RANK[b.method || "other"] ?? 9) ||
        a.huntCode.localeCompare(b.huntCode, "en", { numeric: true })
    );
    more = Math.max(0, sorted.length - REPORT_LIMITS.huntsPerUnit);
    const shown = sorted.slice(0, REPORT_LIMITS.huntsPerUnit);
    hunts = shown.map((r) => huntRow(r, residency, pointsMatter, points, harvest, st, book));

    // Same hunt codes in earlier draws.
    const years = [...new Set(inUnit.map((r) => r.year))].filter((y) => y <= year).sort((a, b) => a - b).slice(-REPORT_LIMITS.historyYears);
    const byYear = new Map(years.map((y) => [y, new Map(huntsForYear(inUnit, y).map((r) => [r.huntCode, r]))]));
    const rows = shown.map((r) => ({
      huntCode: r.huntCode,
      cells: years.map((y) => {
        const row = byYear.get(y)?.get(r.huntCode);
        if (!row) return null;
        const { stats } = drawStats(row, residency);
        const odds = oddsOf(stats);
        const minPoints = pointsMatter ? minPointsDrawn(row, residency) : null;
        return odds === null && minPoints === null ? null : { odds, minPoints, sourceId: row.sourceId };
      }),
    }));
    // Drop the history table when it would only repeat the latest year. Sources are cited only
    // for a table that is shown, so the source list has no entries nothing refers to.
    if (years.length >= 2 && rows.some((h) => h.cells.filter(Boolean).length >= 2)) {
      history.years = years;
      history.rows = rows.map((h) => ({
        huntCode: h.huntCode,
        cells: h.cells.map((c) => (c ? { odds: c.odds, minPoints: c.minPoints, src: book.cite(st, c.sourceId) } : null)),
      }));
    }
  }
  const series = unitHarvest(harvest, unit, methods, st, book);
  const reportedByHunt = !series && harvest.some((r) => !!r.hunt && sameUnit(r.unit, unit));
  return {
    unit,
    name: unitNameOf(ctx.unitNames, unit),
    harvest: series,
    ...(series
      ? {}
      : { harvestNote: reportedByHunt ? `${st.agency.shortName || st.agency.name} reports harvest for ${st.unitTerm} ${unit} by hunt, so it's shown per hunt below.` : `No unit-level harvest figures for ${st.unitTerm} ${unit} in our ${st.agency.shortName || st.agency.name} data.` }),
    drawYear: year,
    hunts,
    moreHunts: more,
    ...(methodNote ? { methodNote } : {}),
    history,
  };
}

function statusResult(h: ShortlistHunt): string {
  const pool = h.pool === "total" ? "all applicants" : h.pool === "resident" ? "residents" : "nonresidents";
  switch (h.status) {
    case "drew-at-points":
      return `${h.atPoints!.drawn} of ${h.atPoints!.applicants} drew at ${h.atPoints!.points} pts (${pctText(h.atPoints!.pct)})`;
    case "all-drew":
      return `Every applicant drew (${n0(h.drawn ?? 0)} ${pool})`;
    case "min-at-or-below":
      return `Lowest drawn: ${h.minPoints} pts${h.odds !== null ? `; ${pctText(h.odds)} overall` : ""}`;
    case "stretch":
      return `Lowest drawn: ${h.minPoints} pts`;
    default:
      return h.applicants != null && h.drawn != null ? `${n0(h.drawn)} of ${n0(h.applicants)} ${pool} drew (${pctText(h.odds ?? 0)})` : h.odds !== null ? `${pctText(h.odds)} of ${pool}` : "—";
  }
}

function shortlistFor(
  draw: readonly DrawRecord[],
  harvest: readonly HarvestRecord[],
  ctx: { residency: DrawResidency; info: SpeciesInfo; points: number | null; methods: readonly string[]; st: StateData; book: SourceBook }
): ComboSection["shortlist"] {
  const { residency, info, points, methods, st, book } = ctx;
  if (!draw.length) return null;
  const { rows, filtered } = forMethods(draw, methods);
  const c = classifyState({ rows, residency, pointsMatter: info.pointsMatter, points: info.pointsMatter ? points : null, includeStretch: false });
  if (c.drawYear === null) return null;
  const agency = st.agency.shortName || st.agency.name;
  const pointName = info.pointName || "point";
  const notes: string[] = [];
  if (c.newerYearWithoutResults) notes.push(`${agency} has published ${c.newerYearWithoutResults} quotas but not applicant counts yet, so these are ${c.drawYear} results.`);
  if (!info.pointsMatter) notes.push(`This draw doesn't use points, so hunts are ranked by the ${c.drawYear} odds for ${residency} applicants.`);
  else if (points === null) notes.push(`We don't have your ${pointName}s for ${st.name} ${speciesLabel(info.species).toLowerCase()}, so hunts are ranked by overall odds. Reply with your points and we'll match hunts to your level.`);
  else if (!c.hasPointTable && !c.hasMinPoints) notes.push(`${agency} doesn't publish applicants by point level or the lowest point level drawn, so hunts are ranked by overall odds.`);
  else if (!c.hasPointTable) notes.push(`${agency} doesn't publish applicants by point level; where it publishes the lowest point level drawn, we compare that with your ${points}.`);
  if (c.counts.stretch > 0) notes.push(`${c.counts.stretch} more hunt${c.counts.stretch === 1 ? "" : "s"} drew at up to 2 points above yours (not listed).`);
  if (filtered) notes.push(`Limited to your methods (${methods.join(", ")}) and hunts open to any weapon.`);
  // Antlerless hunts often dominate by odds; keep most of the list for bucks, bulls, rams and either-sex hunts.
  // Hunts the agency limits to private land go after the others (stable: each group keeps its order),
  // since they need access to private land.
  const publicFirst = (hs: ShortlistHunt[]) => [...hs.filter((h) => !isPrivateLandOnly(h)), ...hs.filter((h) => isPrivateLandOnly(h))];
  const primary = publicFirst(c.hunts.filter((h) => !isAntlerless(h)));
  const antlerless = publicFirst(c.hunts.filter((h) => isAntlerless(h)));
  const max = REPORT_LIMITS.shortlist;
  const takeAntlerless = Math.min(antlerless.length, Math.max(3, max - primary.length));
  const top = [...primary.slice(0, max - takeAntlerless), ...antlerless.slice(0, takeAntlerless)];
  for (const h of top) if (h.units.length === 1 && harvest.length) h.harvest = pickHarvest([...harvest], h, residency);
  if (top.some(isPrivateLandOnly)) notes.push(`Hunts ${agency} limits to private land are listed after the others in each group; they need access to private land.`);
  const atLevel = (h: ShortlistHunt) => h.status === "drew-at-points" || h.status === "all-drew" || h.status === "min-at-or-below";
  return {
    drawYear: c.drawYear,
    matched: c.hunts.length,
    drewAtPoints: c.counts.drewAtPoints + c.counts.allDrew + c.counts.minAtOrBelow,
    atLevelPrimary: primary.filter(atLevel).length,
    atLevelAntlerless: antlerless.filter(atLevel).length,
    stretch: c.counts.stretch,
    notes,
    methods: filtered ? methods.join(" or ") : null,
    rows: top.map((h) => ({
      huntCode: h.huntCode,
      label: huntLabel(h),
      units: h.units,
      status: h.status,
      antlerless: isAntlerless(h),
      result: statusResult(h),
      odds: h.rankOdds,
      minPoints: h.minPoints,
      harvestPct: h.harvest?.successPct ?? null,
      harvestYear: h.harvest?.year ?? null,
      src: book.cite(st, h.sourceId),
    })),
  };
}

// ------------------------------------------------------------
// Checklist and takeaways
// ------------------------------------------------------------

const STATUS_WORD: Record<DateStatus, string> = {
  confirmed: "confirmed",
  tentative: "tentative",
  rule: "tentative, set by agency rule",
  reference: "last cycle's date",
};

function dateText(r: DateRow): string {
  return `${r.when} (${STATUS_WORD[r.status]})`;
}

function checklistFor(c: Omit<ComboSection, "checklist" | "sources">): string[] {
  const out: string[] = [];
  const { dates } = c;
  const all = [...dates.upcoming, ...dates.reference];
  const first = (kind: AgencyDateKind, pred: (r: DateRow) => boolean = () => true) =>
    dates.upcoming.find((r) => r.kind === kind && pred(r) && !SPECIAL.test(r.label)) ?? dates.reference.find((r) => r.kind === kind && pred(r) && !SPECIAL.test(r.label));
  const qualifying = first("license-sale", (r) => /qualif|required|before applying|licen[cs]es go on sale/i.test(r.label));
  if (qualifying) out.push(`${qualifying.label}: ${dateText(qualifying)}.`);
  for (const req of c.requirements.slice(0, 3)) out.push(req);
  if (dates.nextApplication) {
    out.push(`Apply: ${dates.nextApplication.label}, ${dateText(dates.nextApplication)}.`);
    for (const r of dates.otherApplications.slice(0, 2)) out.push(`Also apply: ${r.label}. ${dates.planCycle ?? "Next"} dates not yet published; last cycle: ${r.when}.`);
  } else if (dates.lastApplication) out.push(`Apply: ${dates.planCycle ?? "next"} dates not yet published. Last cycle: ${dates.lastApplication.label}, ${dates.lastApplication.when}.`);
  const pts = first("points");
  if (pts && c.pointsMatter) out.push(`Point-only option: ${pts.label}, ${dateText(pts)}.`);
  const results = first("results");
  if (results) out.push(`Results: ${results.label}, ${dateText(results)}.`);
  const pay = first("payment");
  if (pay) out.push(`Pay for a drawn license: ${pay.label}, ${dateText(pay)}.`);
  const leftover = first("leftover");
  if (leftover) out.push(`If you don't draw: ${leftover.label}, ${dateText(leftover)}.`);
  if (!all.length) out.push(`${c.agencyShort} hasn't published key dates for this species in our data. Check ${c.agencyUrl}.`);
  return out;
}

/** "GMU 61 (Hermosa)" */
function unitTitle(unitTerm: string, u: Pick<UnitDive, "unit" | "name">): string {
  return `${unitTerm} ${u.unit}${u.name && u.name !== u.unit ? ` (${u.name})` : ""}`;
}

/** A label set inside parentheses: its own parentheses dropped ("All license types (pooled)" -> "All license types, pooled"). */
export function unparen(label: string): string {
  return label.replace(/\s*\(([^()]*)\)/g, ", $1").trim();
}

/** "4 or fewer points", "no points". */
function upTo(points: number): string {
  return points === 0 ? "no points" : `${points} or fewer points`;
}

function andList(xs: readonly string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

function takeawaysFor(combos: readonly ComboSection[]): { lead: string; text: string }[] {
  // Application dates first, one line per state and date (species with the same deadline share it).
  const dated = new Map<string, { state: string; species: string[]; suffix: string; text: string; sort: string }>();
  for (const c of combos) {
    const d = c.dates;
    let suffix: string | null = null;
    let text = "";
    // Soonest published deadline first; unpublished cycles after every published one.
    const sort = d.nextApplication ? d.nextApplication.end : `~${d.lastApplication?.end ?? ""}`;
    if (d.nextApplication) {
      const a = d.nextApplication;
      const status =
        a.status === "confirmed" ? "Confirmed by the agency." : a.status === "rule" ? `Tentative: set by ${c.agencyShort} rule; the ${a.cycle} date isn't announced yet.` : "Tentative.";
      // A single date that opens applications ("applications go on sale Dec 1") isn't a deadline.
      const opens = a.sort === a.end && /on sale|available|\bopens?\b|opening|\bbegins?\b|\bstarts?\b/i.test(a.label);
      suffix = opens ? `: applications open ${formatDate(a.end)}.` : `: apply by ${formatDate(a.end)}.`;
      text = `${a.label}${a.sort !== a.end ? `, open ${a.when}` : ""}. ${status}`;
    } else if (d.lastApplication) {
      suffix = `: ${d.planCycle ?? "next"} application dates aren't published yet.`;
      text = `Last cycle: ${d.lastApplication.label}, ${d.lastApplication.when}. Deadline reminders cover the new dates once ${c.agencyShort} publishes them.`;
    }
    if (!suffix) continue;
    const key = `${c.stateSlug}|${suffix}|${text}`;
    const hit = dated.get(key);
    if (hit) hit.species.push(c.speciesLabel.toLowerCase());
    else dated.set(key, { state: c.stateName, species: [c.speciesLabel.toLowerCase()], suffix, text, sort });
  }
  const dates = [...dated.values()]
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .map((x) => ({ lead: `${x.state} ${andList(x.species)}${x.suffix}`, text: x.text }));

  const perCombo: { lead: string; text: string }[][] = combos.map((c) => {
    const out: { lead: string; text: string }[] = [];
    const who = c.residency === "resident" ? "resident" : "nonresident";
    const title = `${c.stateName} ${c.speciesLabel.toLowerCase()}`;
    for (const u of c.units) {
      if (!c.pointsMatter || !u.hunts.length) continue;
      const groups = [
        { name: maleGroupName(c.species), hunts: u.hunts.filter((h) => !h.antlerless) },
        { name: "antlerless", hunts: u.hunts.filter((h) => h.antlerless) },
      ].filter((g) => g.hunts.some((h) => h.minPoints !== null));
      if (!groups.length) continue;
      const range = (hs: HuntRow[]) => {
        const mins = hs.map((h) => h.minPoints).filter((m): m is number => m !== null);
        const lo = Math.min(...mins);
        const hi = Math.max(...mins);
        return lo === hi ? `${lo}` : `${lo}–${hi}`;
      };
      const drewAt = (hs: HuntRow[]) => hs.filter((h) => (h.atPoints && h.atPoints.drawn > 0) || (h.minPoints !== null && c.points !== null && h.minPoints <= c.points)).length;
      const [g0, g1] = groups;
      out.push({
        lead: `${unitTitle(c.unitTerm, u)}: lowest ${who} points drawn in ${u.drawYear} were ${range(g0.hunts)} for ${g0.name} hunts${g1 ? ` and ${range(g1.hunts)} for ${g1.name}` : ""}.`,
        text:
          c.points !== null
            ? `${who[0].toUpperCase()}${who.slice(1)}s with ${upTo(c.points)} drew in ${drewAt(g0.hunts)} of ${g0.hunts.length} listed ${g0.name} hunts${g1 ? ` and ${drewAt(g1.hunts)} of ${g1.hunts.length} ${g1.name} hunts` : ""}. Section ${c.id} has each hunt.`
            : `Section ${c.id} lists each hunt; send us your points to see your level.`,
      });
      break;
    }
    const s = c.shortlist;
    if (s && s.rows.length) {
      const best = s.rows[0];
      if (c.pointsMatter && c.points !== null && s.drewAtPoints > 0) {
        const parts = [s.atLevelPrimary ? `${s.atLevelPrimary} ${maleGroupName(c.species)}` : "", s.atLevelAntlerless ? `${s.atLevelAntlerless} antlerless` : ""].filter(Boolean);
        out.push({
          lead: `In the ${s.drawYear} draw, ${who}s with ${upTo(c.points)} were drawn for ${parts.join(" and ")} ${title}${s.methods ? ` ${s.methods}` : ""} hunts.`,
          text: `First on your list in section ${c.id}: ${best.huntCode}${best.units.length ? ` (${c.unitTerm} ${best.units.slice(0, 3).join(", ")}${best.units.length > 3 ? " +" + (best.units.length - 3) : ""})` : ""}, ${best.result.charAt(0).toLowerCase()}${best.result.slice(1)}.`,
        });
      } else if (!c.pointsMatter) {
        out.push({
          lead: `${title}: ${c.drawSystemLabel.toLowerCase()}.`,
          text: `Highest ${who} odds in the ${s.drawYear} draw: ${best.huntCode}${best.units.length ? ` (${c.unitTerm} ${best.units.slice(0, 3).join(", ")}${best.units.length > 3 ? " +" + (best.units.length - 3) : ""})` : ""}, ${best.result.charAt(0).toLowerCase()}${best.result.slice(1)}.`,
        });
      }
    }
    for (const u of c.units) {
      const pts = u.harvest?.points || [];
      if (pts.length >= 2) {
        const a = pts[0];
        const b = pts[pts.length - 1];
        out.push({
          lead: `${unitTitle(c.unitTerm, u)} ${c.speciesLabel.toLowerCase()} harvest success: ${pctText(b.success)} in ${b.year}.`,
          text: `It was ${pctText(a.success)} in ${a.year} (${unparen(u.harvest!.label).toLowerCase()}, ${c.agencyShort} harvest reports).`,
        });
        break;
      }
    }
    if (!c.units.length && c.topUnits?.rows.length) {
      const t = c.topUnits.rows[0];
      out.push({ lead: `Top ${c.stateName} ${c.speciesLabel.toLowerCase()} harvest success in ${c.topUnits.year}: ${c.unitTerm} ${t.unit}, ${pctText(t.success)}.`, text: `Among units with ${TOP_UNIT_MIN_HUNTERS}+ hunters (${unparen(c.topUnits.label)}).` });
    }
    return out;
  });
  // Up to three date lines, then round-robin so each state and species gets a line before any gets a second.
  const out: { lead: string; text: string }[] = dates.slice(0, 3);
  for (let i = 0; out.length < REPORT_LIMITS.takeaways && perCombo.some((l) => l.length > i); i++) {
    for (const list of perCombo) if (list[i] && out.length < REPORT_LIMITS.takeaways) out.push(list[i]);
  }
  for (const d of dates.slice(3)) if (out.length < REPORT_LIMITS.takeaways) out.push(d);
  return out;
}

function glanceFor(combos: readonly ComboSection[]): GlanceRow[] {
  const rows = new Map<string, GlanceRow>();
  const add = (c: ComboSection, r: DateRow) => {
    const key = `${c.stateSlug}|${r.label}|${r.when}`;
    const hit = rows.get(key);
    if (hit) {
      if (!hit.species.includes(c.speciesLabel)) hit.species.push(c.speciesLabel);
      return;
    }
    rows.set(key, { when: r.when, sort: r.sort, stateName: c.stateName, species: [c.speciesLabel], label: r.label, status: r.status });
  };
  for (const c of combos) {
    const d = c.dates;
    for (const r of d.upcoming) if (r.kind === "application" || r.kind === "points") add(c, r);
    if (!d.nextApplication && d.lastApplication) add(c, d.lastApplication);
    for (const r of d.otherApplications) add(c, r);
  }
  return [...rows.values()].sort((a, b) => (a.status === "reference" ? 1 : 0) - (b.status === "reference" ? 1 : 0) || a.sort.localeCompare(b.sort)).slice(0, REPORT_LIMITS.glance);
}

function compactRow(st: StateData, info: SpeciesInfo, residency: DrawResidency, today: string, book: SourceBook): CompactRow {
  const d = datesFor(st, info, residency, today, book);
  const next = d.nextApplication ?? d.lastApplication;
  return {
    stateName: st.name,
    speciesLabel: speciesLabel(info.species),
    drawSystemLabel: DRAW_SYSTEM_LABELS[info.drawSystem],
    residency,
    next: next ? `${next.label}: ${next.when}` : "No application date in our data",
    status: next ? next.status : "none",
  };
}

// ------------------------------------------------------------
// The report
// ------------------------------------------------------------

function labelsOf(ids: readonly string[], opts: readonly { id: string; label: string }[]): string {
  return ids.map((id) => opts.find((o) => o.id === id)?.label || id).join(", ");
}

export function buildReport(input: ReportInput): ScoutingReport {
  const { prefs, today } = input;
  const book = new SourceBook();
  const bySlug = new Map(input.states.map((s) => [s.data.slug, s]));
  const liveChosen = prefs.states.map((s) => bySlug.get(s)).filter((s): s is ReportStateInput => !!s);
  const comingSoon = prefs.states.filter((s) => !bySlug.has(s)).map((s) => STATE_LIST.find((x) => x.slug === s)?.name || s);
  const memberStates: MemberState[] = liveChosen.map((s) => ({ slug: s.data.slug, name: s.data.name, abbrev: s.data.abbrev, unitTerm: s.data.unitTerm }));
  const { deep, overflow } = selectCombos(prefs, input.states);

  // Points: saved balances first, then what the free-text answer says.
  const pointsReading = readPointsText(prefs.points, memberStates, prefs.species);
  const saved = input.savedPoints || {};

  // Units from the answer, matched against the units published for the member's species.
  const unitCandidates = new Map<string, string[]>();
  for (const k of deep) {
    const t = input.tables(k.slug, k.species);
    const list = unitCandidates.get(k.slug) || [];
    for (const r of t.draw) for (const u of r.units) list.push(u);
    for (const r of t.harvest) if (isRealUnit(r.unit)) list.push(r.unit);
    unitCandidates.set(k.slug, list);
  }
  for (const [slug, list] of unitCandidates) unitCandidates.set(slug, [...new Set(list)]);
  const units = matchUnits(prefs.units, memberStates, (slug) => unitCandidates.get(slug) || []);

  const combos: ComboSection[] = [];
  for (const [i, k] of deep.entries()) {
    const sti = bySlug.get(k.slug)!;
    const st = sti.data;
    const info = infoFor(sti, k.species)!;
    const t = input.tables(k.slug, k.species);
    const { residency, basis } = residencyFor(prefs, st.abbrev);
    const key = pointsKey(k.slug, k.species);
    const savedPts = saved[key];
    const answerPts = pointsReading.points[key];
    const points = info.pointsMatter ? (savedPts ?? answerPts ?? null) : null;
    const pointsFrom = !info.pointsMatter ? null : savedPts !== undefined ? "saved" : answerPts !== undefined ? "answer" : null;
    const dates = datesFor(st, info, residency, today, book);
    const seasons = seasonsFor(st, k.species, residency, prefs.methods, dates.planCycle, book);
    const fees = feesFor(st, k.species, residency, dates.planCycle, book);
    const unitNames = st.unitNames?.[k.species];
    const wanted = (units.byState[k.slug] || []).filter(
      (u) => t.draw.some((r) => r.units.some((x) => sameUnit(x, u))) || t.harvest.some((r) => sameUnit(r.unit, u))
    );
    const dives = wanted
      .slice(0, REPORT_LIMITS.unitsPerCombo)
      .map((u) => unitDive(u, t.draw, t.harvest, { residency, pointsMatter: info.pointsMatter, points, methods: prefs.methods, unitNames, st, book }));
    const base: Omit<ComboSection, "checklist" | "sources"> = {
      id: String(i + 1),
      stateSlug: st.slug,
      stateName: st.name,
      abbrev: st.abbrev,
      agencyName: st.agency.name,
      agencyShort: st.agency.shortName || st.agency.name,
      agencyUrl: st.agency.url,
      unitTerm: st.unitTerm,
      species: k.species,
      speciesLabel: speciesLabel(k.species),
      ...(info.displayName && info.displayName.toLowerCase() !== speciesLabel(k.species).toLowerCase() ? { speciesNote: info.displayName } : {}),
      residency,
      residencyBasis: basis,
      drawSystemLabel: DRAW_SYSTEM_LABELS[info.drawSystem],
      pointsMatter: info.pointsMatter,
      ...(info.pointName ? { pointName: info.pointName } : {}),
      points,
      pointsFrom,
      summary: info.drawSystemSummary,
      ...((residency === "resident" ? info.residentNote : info.nonresidentNote) ? { residencyNote: residency === "resident" ? info.residentNote : info.nonresidentNote } : {}),
      ...(info.otcSummary ? { otcSummary: info.otcSummary } : {}),
      requirements: requirementsOf(info, residency),
      dates,
      seasons,
      fees,
      units: dives,
      unitsAsked: wanted.length > 0,
      topUnits: dives.length ? null : topUnits(t.harvest, prefs.methods, unitNames, st, book),
      shortlist: shortlistFor(t.draw, t.harvest, { residency, info, points, methods: prefs.methods, st, book }),
    };
    // Every source this section cites, for its footer.
    const srcs = new Set<number>();
    const addSrc = (n: number | null | undefined) => n && srcs.add(n);
    for (const id of info.sourceIds) addSrc(book.cite(st, id));
    [...dates.upcoming, ...dates.reference].forEach((r) => addSrc(r.src));
    seasons.rows.forEach((r) => addSrc(r.src));
    fees.rows.forEach((r) => addSrc(r.src));
    for (const d of dives) {
      d.hunts.forEach((h) => (addSrc(h.src), addSrc(h.harvest?.src)));
      d.harvest?.points.forEach((p) => addSrc(p.src));
      d.history.rows.forEach((h) => h.cells.forEach((cell) => addSrc(cell?.src)));
    }
    base.topUnits?.rows.forEach((r) => addSrc(r.src));
    base.shortlist?.rows.forEach((r) => addSrc(r.src));
    combos.push({ ...base, checklist: checklistFor(base), sources: [...srcs].sort((a, b) => a - b) });
  }

  // Everything else the member picked, in one summary table.
  const compact: CompactRow[] = [];
  for (const k of overflow) {
    const sti = bySlug.get(k.slug)!;
    compact.push(compactRow(sti.data, infoFor(sti, k.species)!, residencyFor(prefs, sti.data.abbrev).residency, today, book));
  }
  if (!prefs.species.length) {
    for (const sti of liveChosen) {
      const { residency } = residencyFor(prefs, sti.data.abbrev);
      for (const info of sti.data.species) if (infoFor(sti, info.species) && sti.drawSpecies.includes(info.species)) compact.push(compactRow(sti.data, info, residency, today, book));
    }
  } else if (!liveChosen.length) {
    for (const sp of prefs.species) {
      for (const sti of input.states) {
        const info = infoFor(sti, sp);
        if (info && sti.drawSpecies.includes(sp)) compact.push(compactRow(sti.data, info, residencyFor(prefs, sti.data.abbrev).residency, today, book));
      }
    }
  }

  const notCovered: string[] = [];
  for (const sti of liveChosen) {
    for (const sp of prefs.species) {
      if (infoFor(sti, sp)) continue;
      const info = sti.data.species.find((s) => s.species === sp);
      notCovered.push(
        info?.drawSystem === "none"
          ? `${sti.data.name} ${speciesLabel(sp).toLowerCase()}: ${sti.data.agency.shortName || sti.data.agency.name} lists no season or license for it.`
          : `${sti.data.name} ${speciesLabel(sp).toLowerCase()}: not in HuntScout's ${sti.data.name} data yet.`
      );
    }
  }

  // How we read the free-text answers, so the member can correct us.
  const readNotes: string[] = [];
  const matched = Object.entries(units.byState).filter(([, l]) => l.length);
  if (prefs.units.trim()) {
    if (matched.length) {
      readNotes.push(
        `Units we matched from your answer: ${matched.map(([slug, l]) => { const s = bySlug.get(slug)!.data; return `${s.name} ${s.unitTerm} ${l.join(", ")}`; }).join("; ")}.`
      );
    }
    const deepStates = new Set(deep.map((k) => k.slug));
    const missed = units.unmatched.filter((u) => u.slug === null || deepStates.has(u.slug));
    const summaryOnly = units.unmatched.filter((u) => u.slug !== null && !deepStates.has(u.slug));
    if (missed.length) readNotes.push(`Not matched to a published unit for your states and species: ${missed.map((u) => u.token).join(", ")}.`);
    if (summaryOnly.length) {
      const names = [...new Set(summaryOnly.map((u) => bySlug.get(u.slug!)?.data.name || u.slug))];
      readNotes.push(`Units you named in ${names.join(", ")} aren't covered here because ${names.length === 1 ? "that state is" : "those states are"} in the summary table only. Reply and we'll send a report focused on ${names.length === 1 ? "it" : "them"}.`);
    }
    if (!matched.length && !units.unmatched.length) readNotes.push("We couldn't match any units from your answer, so each section lists the top units by harvest success instead.");
  }
  const ptsUsed = combos.filter((c) => c.points !== null).map((c) => `${c.stateName} ${c.speciesLabel.toLowerCase()} ${c.points} (${c.pointsFrom === "saved" ? "saved on your account" : "from your answer"})`);
  if (ptsUsed.length) readNotes.push(`Points used: ${ptsUsed.join("; ")}.`);
  if (pointsReading.unassigned.length) readNotes.push(`We couldn't tie these to one state and species: "${pointsReading.unassigned.join('", "')}". Reply and we'll update your report.`);
  const noPts = combos.filter((c) => c.pointsMatter && c.points === null);
  if (noPts.length) readNotes.push(`No point balance for ${noPts.map((c) => `${c.stateName} ${c.speciesLabel.toLowerCase()}`).join(", ")}: odds are shown for all applicants in your pool, not your level.`);

  const residencies = [...new Set(liveChosen.map((s) => residencyFor(prefs, s.data.abbrev).basis))];
  const answers = [
    { label: "States", value: liveChosen.map((s) => s.data.name).concat(comingSoon.map((c) => `${c} (coming soon)`)).join(", ") || "None picked" },
    { label: "Species", value: prefs.species.map(speciesLabel).join(", ") || "None picked" },
    { label: "Residency", value: residencies.join("; ") || (prefs.homeState ? `Home state ${prefs.homeState}` : "Not given") },
    { label: "Method of take", value: labelsOf(prefs.methods, METHOD_OPTIONS) || "Any" },
    { label: "Units", value: prefs.units || "Not given" },
    { label: "Points", value: prefs.points || "Not given" },
    { label: "Success looks like", value: labelsOf(prefs.goals, GOAL_OPTIONS) || "Not given" },
  ];

  const season = combos.map((c) => c.dates.planCycle).find((y): y is number => y !== null) ?? Number(today.slice(0, 4)) + 1;
  const first = (input.name || "").trim().split(/\s+/)[0] || null;
  return {
    name: input.name?.trim() || null,
    firstName: first && first.length <= 40 ? first : null,
    generatedOn: today,
    season,
    answers,
    readNotes,
    takeaways: takeawaysFor(combos),
    glance: glanceFor(combos),
    combos,
    compact,
    comingSoon,
    notCovered,
    sources: book.list,
    stateNames: liveChosen.map((s) => s.data.name),
    speciesLabels: prefs.species.map(speciesLabel),
  };
}
