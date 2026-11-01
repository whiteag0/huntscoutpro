// Builds a Hunt Planner entry from the agency's data: one draw row (or a
// general/OTC license, or a hunt the member describes) plus the state's agency
// meta. Pure functions only (no data imports, no I/O): `npm test`.
//
// Nothing is estimated or predicted. Dates are the agency's own key dates for
// the cycle being planned, or, when the agency hasn't published that cycle
// yet, its latest published cycle clearly marked as such. Seasons are the
// hunt's own published dates when there are any, else the species'
// statewide/standard seasons marked as statewide. Fees are the agency's fee
// lines, and the odds repeat the row's published counts.

import type { DrawMeta, DrawRecord, DrawResidencyStats, FeeItem, KeyDate, SeasonDate, SourceRef, SpeciesInfo } from "@/data/agency/schema";
import { canonicalUnit, drawStats, minPointsDrawn, oddsOf } from "@/lib/agency-view";
import { isNotificationLabel, labelResidency, openKeyDateEnd } from "@/lib/reminders";
import {
  PLANNER_LIMITS,
  type AgencyDate,
  type AgencyDateKind,
  type AgencyDeadline,
  type AgencyFee,
  type AgencyRef,
  type AgencySeason,
  type DrawingSeason,
  type PlanKind,
  type PlannedHunt,
  type PlannerResidency,
  type PlannerSeason,
} from "@/lib/planner-schema";

/** Key dates that are an application window or deadline. */
const APPLICATION_LABEL = /appl|deadline/i;
/**
 * Labels that mention applying or a deadline but aren't the date you apply by:
 * point-only purchases, leftover sales, surrender / payment / tag-purchase deadlines.
 */
const NOT_APPLICATION = /point[-\s]?only|point purchase|without applying|leftover|surrender|payment|\bbuy\b|mailed|on sale/i;

/**
 * Separate drawings an agency runs alongside its main draw. A hunt from the draw
 * table is only matched to one of these when its own description names it too.
 */
const SPECIAL_DRAWINGS = [
  /general[-\s]season/i,
  /sportsman/i,
  /landowner/i,
  /governor/i,
  /conservation/i,
  /\bexpo\b/i,
  /raffle/i,
  /\bDAV\b/,
  /\byouth\b/i,
  /antlerless/i,
  // Alaska's Tier II subsistence permits, Nevada's restricted nonresident guided draw, South Dakota's
  // special buck and access-permit drawings, Washington's multi-season tags, Montana's B licenses.
  /\btier\s*(ii|2)\b/i,
  // Alaska's community subsistence harvest hunts (e.g. Copper Basin CM300) have their own application.
  /community subsistence/i,
  /\bCSH\b/,
  /\brestricted\b/i,
  /special buck/i,
  /access permit/i,
  /multi[-\s]season/i,
  /\bB licen[cs]e/i,
];
/** Second (and later) rounds are for leftovers; a planned hunt's date is the main application. */
const LATER_ROUND = /\b(second(ary)?|third|fourth|fifth)\b/i;
const SPRING = /\bspring\b/i;
const FALL = /\bfall\b/i;

type HuntSeason = "spring" | "fall" | null;

/**
 * The season a key-date label is limited to ("Spring turkey ... application period"), if exactly one.
 * Parentheses are left out: "Controlled hunt first application period (deer, elk, pronghorn, fall bear)"
 * lists species, it isn't a fall-only date.
 */
function labelSeason(label: string): HuntSeason {
  return seasonIn(label.replace(/\([^)]*\)/g, " "));
}
function seasonIn(text: string): HuntSeason {
  const sp = SPRING.test(text);
  const fa = FALL.test(text);
  return sp && !fa ? "spring" : fa && !sp ? "fall" : null;
}

/**
 * The hunt's season from its description, else from its season dates' first
 * month (Mar-Jun spring, Aug-Dec fall). Null when neither tells.
 */
function huntSeason(description: string, seasonDates?: string): HuntSeason {
  const named = seasonIn(description);
  if (named) return named;
  const m = /^\d{4}-(\d{2})-\d{2}/.exec(seasonDates || "");
  const month = m ? Number(m[1]) : 0;
  if (month >= 3 && month <= 6) return "spring";
  if (month >= 8 && month <= 12) return "fall";
  return null;
}

/**
 * Whether a key date is for the drawing a hunt with this description is applied for in.
 * `seasonsInUse` = the seasons the species' application dates are split by. When the
 * agency runs separate spring and fall draws and the hunt's season can't be told,
 * neither date is assumed (a fall hunt must not get the spring deadline).
 */
function fitsHunt(label: string, huntDescription: string, seasonDates: string | undefined, seasonsInUse: ReadonlySet<HuntSeason>): boolean {
  if (LATER_ROUND.test(label)) return false;
  const ls = labelSeason(label);
  if (ls) {
    const hs = huntSeason(huntDescription, seasonDates);
    if (hs ? hs !== ls : seasonsInUse.has(ls === "spring" ? "fall" : "spring")) return false;
  }
  return SPECIAL_DRAWINGS.every((re) => !re.test(label) || re.test(huntDescription));
}

// Hunts the agency limits to one residency, as their descriptions say it
// ("Nonresidents Only", "nonresident-only hunt", Nevada "NR ..."/"Res ...",
// Kansas "(nonresident)", Wyoming "Nonresident Special license").
const NONRESIDENT_ONLY = [
  /^\s*(?:\d{4}\s+)?(?:NR|non-?\s?residents?)\b/i,
  /\bnon-?\s?residents?\b(?:\s+[\w-]+){0,4}\s+only\b/i,
  /\bnon-?\s?resident-only\b/i,
  /\(non-?\s?resident\)/i,
  /\bnon-?\s?resident\s+(?:special license|permits?|tenant|landowner|archery|general|spring|fall|mule deer stamp)\b/i,
];
const RESIDENT_ONLY = [/^\s*(?:\d{4}\s+)?(?:Res|residents?)\b/i, /(?<!non-?\s?)\bresidents?\b(?:\s+[\w-]+){0,3}\s+only\b/i, /\bresident-only\b/i, /\(resident\)/i];

/** The residency a hunt is limited to, when its description says so; null when open to both. */
export function huntResidencyOnly(description: string): PlannerResidency | null {
  if (NONRESIDENT_ONLY.some((re) => re.test(description))) return "nonresident";
  if (RESIDENT_ONLY.some((re) => re.test(description))) return "resident";
  return null;
}

export function isApplicationLabel(label: string): boolean {
  return APPLICATION_LABEL.test(label) && !NOT_APPLICATION.test(label) && !isNotificationLabel(label);
}

/**
 * The agency's next application date for this species that hasn't passed for
 * someone applying as `residency`: the soonest-ending key date whose label is
 * an application window/deadline, in this year's cycle or later, and not
 * limited to the other residency (same rules as deadline reminders).
 * With `huntDescription` (adding a specific hunt; `seasonDates` helps tell spring
 * from fall when the description doesn't say), second-round dates and
 * separate drawings (general-season tags, sportsman/landowner/youth permits...)
 * are skipped unless the hunt's description names that drawing.
 */
export function nextApplicationDeadline(
  info: Pick<SpeciesInfo, "keyDates">,
  residency: PlannerResidency,
  today: string,
  huntDescription?: string,
  seasonDates?: string
): (KeyDate & { end: string }) | null {
  let best: (KeyDate & { end: string }) | null = null;
  const seasonsInUse = new Set(info.keyDates.filter((k) => isApplicationLabel(k.label)).map((k) => labelSeason(k.label)));
  for (const k of info.keyDates) {
    if (!isApplicationLabel(k.label)) continue;
    if (huntDescription !== undefined && !fitsHunt(k.label, huntDescription, seasonDates, seasonsInUse)) continue;
    const end = openKeyDateEnd(k, residency, today);
    if (!end) continue;
    if (!best || end < best.end || (end === best.end && k.label.localeCompare(best.label) < 0)) best = { ...k, end };
  }
  return best;
}

/** The parts of a state's agency meta an entry needs (StateData from src/lib/agency.ts fits). */
export type PlannerState = Pick<DrawMeta, "slug" | "name" | "agency" | "unitTerm" | "species" | "fees"> & Partial<Pick<DrawMeta, "seasons">> & { sources: SourceRef[] };

function sourceOf(st: PlannerState, sourceId: string): SourceRef | undefined {
  return st.sources.find((s) => s.id === sourceId);
}

/**
 * Fee lines for the species (plus the agency's all-species lines) and residency.
 * When an item is listed for several license years, the one for the planned
 * cycle is used if published, otherwise the newest.
 */
export function feesFor(st: PlannerState, species: string, residency: PlannerResidency, cycle: number | null): AgencyFee[] {
  const groups = new Map<string, FeeItem[]>();
  for (const f of st.fees) {
    if (f.residency !== residency) continue;
    if (f.species && f.species !== species) continue;
    const key = `${f.species ? "s" : "g"}|${f.item}`;
    const g = groups.get(key);
    if (g) g.push(f);
    else groups.set(key, [f]);
  }
  // Same item in several license years: keep the planned cycle's year when published, else the newest.
  const score = (y: number) => (cycle !== null && y === cycle ? 1e5 : 0) + y;
  const picked: FeeItem[] = [];
  for (const g of groups.values()) {
    const year = g.reduce((best, f) => (score(f.licenseYear) > score(best) ? f.licenseYear : best), g[0].licenseYear);
    picked.push(...g.filter((f) => f.licenseYear === year));
  }
  return picked
    .sort((a, b) => Number(!!b.species) - Number(!!a.species))
    .slice(0, PLANNER_LIMITS.fees)
    .map((f) => ({
      item: f.item,
      amountUsd: f.amountUsd,
      licenseYear: f.licenseYear,
      ...(f.note ? { note: f.note } : {}),
      speciesSpecific: !!f.species,
      sourceUrl: sourceOf(st, f.sourceId)?.url || st.agency.url,
    }));
}

const n = (v: number) => v.toLocaleString("en-US");
const pct = (v: number) => `${Number(v.toFixed(1))}%`;

/** "2025 draw, residents: 8 of 173 first-choice applicants drawn (4.6%); quota 11; lowest points drawn 20." */
export function oddsNote(r: DrawRecord, residency: PlannerResidency, pointsMatter: boolean): string {
  const { stats, pool } = drawStats(r, residency);
  const who = pool === "total" ? "all applicants (one combined pool)" : residency === "resident" ? "residents" : "nonresidents";
  if (!stats) return `${r.year} draw: no ${residency} figures published for this hunt.`;
  const s: DrawResidencyStats = stats;
  const apps = r.choice === "first" ? "first-choice applicants" : "applicants";
  const parts: string[] = [];
  if (s.applicants != null && s.drawn != null) {
    const odds = oddsOf(s);
    parts.push(`${n(s.drawn)} of ${n(s.applicants)} ${apps} drawn${odds !== null ? ` (${pct(odds)})` : ""}`);
  } else if (s.applicants != null) parts.push(`${n(s.applicants)} ${apps}`);
  else if (s.drawn != null) parts.push(`${n(s.drawn)} drawn`);
  if (s.quota != null) parts.push(`quota ${n(s.quota)}`);
  if (pointsMatter) {
    const min = minPointsDrawn(r, residency);
    if (min !== null) parts.push(`lowest points drawn ${min}`);
  }
  return parts.length ? `${r.year} draw, ${who}: ${parts.join("; ")}.` : `${r.year} draw: no ${residency} figures published for this hunt.`;
}

const SEASON_OF: Partial<Record<string, PlannerSeason>> = { rifle: "rifle", archery: "archery", muzzleloader: "muzzleloader", shotgun: "shotgun" };

// ------------------------------------------------------------
// Key dates: what each is for, which apply to a hunt, which cycle to show
// ------------------------------------------------------------

/**
 * What a key date is for: the agency data's own `kind` when the researcher set
 * it, otherwise read from the label. Order matters: "Second drawing results
 * posted; leftover tags on sale" is a leftover date, "Preference-point-only
 * application" is a points date.
 */
export function keyDateKind(k: Pick<KeyDate, "label" | "kind">): AgencyDateKind {
  if (k.kind) return k.kind;
  const l = k.label;
  if (/point[-\s]?only|points? only|point purchase|point saver|without applying/i.test(l)) return "points";
  if (/surrender|return (a |the )?(drawn )?(license|tag)|\b(license|tag) return\b/i.test(l)) return "surrender";
  if (/leftover|\b(second(ary)?|third|fourth|fifth)\b.*\b(draw|drawing|application|round)|remaining/i.test(l)) return "leftover";
  if (/result|notified|notification|\bnotices?\b|posted|announced|mailed|by mail\b/i.test(l)) return "results";
  if (/payment|\bpay\b|deadline to (buy|purchase)|purchase deadline|must be purchased|\b(tag|license|permit) sale deadline/i.test(l)) return "payment";
  if (/on sale|over[- ]the[- ]counter|\bOTC\b|first[- ]come/i.test(l)) return "license-sale";
  if (/withdraw|modif|correction|amend|\bchanges?\b/i.test(l)) return "application-change";
  // Deadlines that aren't the application: harvest reports, asking for a paper application, orientations.
  if (/\breport(s|ing)?\b|alternative to applying|\bask\b|\brequest\b|orientation/i.test(l)) return "other";
  if (/appl|deadline|drawing|\bdraw\b/i.test(l)) return "application";
  return "other";
}

/** The residency a key date is limited to: the data's own field, else what its label says. */
export function keyDateResidency(k: Pick<KeyDate, "label" | "residency">): PlannerResidency | null {
  if (k.residency) return k.residency;
  const r = labelResidency(k.label);
  return r === "any" ? null : r;
}

/** Labels for general-season / over-the-counter licenses. */
const GENERAL = /general[-\s]season|\bgeneral\b|over[- ]the[- ]counter|\bOTC\b/i;

/** What's known about the hunt being planned, for matching the agency's dates to it. */
export interface HuntFit {
  kind: PlanKind;
  /** The hunt's description as the agency writes it (or the member's, for a custom hunt). */
  description: string;
  /** Spring or fall when known: from the member's answer, the description, or the season dates. */
  season: DrawingSeason | null;
  /** The row's weapon, when the agency gives one ("rifle", "archery", ...). */
  method?: string;
  /** The application round the hunt's description names ("Second Application Period" = 2); 1 when it names none. */
  round?: number;
}

const ROUNDS: Record<string, number> = { first: 1, second: 2, secondary: 2, third: 3, fourth: 4, fifth: 5 };
const ROUND_RE = /\b(first|second(?:ary)?|third|fourth|fifth)\b[\s-]+(?:application|draw|drawing|round)/i;
/** The application round a label or description names ("Deer third draw application period" = 3), else null. */
function roundOf(text: string): number | null {
  const m = ROUND_RE.exec(text);
  return m ? ROUNDS[m[1].toLowerCase()] : null;
}

/** The hunt's season from the member's answer, else its description, else its season dates. */
export function fitFor(
  kind: PlanKind,
  description: string,
  row?: Pick<DrawRecord, "seasonDates" | "seasonRanges"> & Partial<Pick<DrawRecord, "method">> | null,
  drawing?: DrawingSeason | null
): HuntFit {
  const dates = row?.seasonRanges?.[0]?.start || row?.seasonDates;
  return {
    kind,
    description,
    season: drawing || huntSeason(description, dates),
    ...(row?.method ? { method: row.method } : {}),
    ...(kind === "draw" ? { round: roundOf(description) ?? 1 } : {}),
  };
}

/** Seasons the species' application dates are split by ("Spring ... application period" / "Fall ..."). */
function applicationSeasons(keyDates: readonly KeyDate[]): Set<HuntSeason> {
  return new Set(keyDates.filter((k) => keyDateKind(k) === "application").map((k) => labelSeason(k.label)));
}

/**
 * True when the agency runs separate spring and fall drawings for the species and
 * nothing tells which one this hunt is in, so the member has to say.
 */
export function needsDrawingChoice(info: Pick<SpeciesInfo, "keyDates">, fit: HuntFit): boolean {
  if (fit.season || fit.kind === "otc") return false;
  const s = applicationSeasons(info.keyDates);
  return s.has("spring") && s.has("fall");
}

/** Weapons a label is limited to when it leads with one ("Nonresident archery deer ...", "Resident firearm/muzzleloader antelope ..."). */
const LABEL_METHOD = /^(?:(?:non-?\s?)?residents?\s+)?((?:archery|firearms?|rifle|muzzleloader|shotgun)(?:\s*\/\s*(?:archery|firearms?|rifle|muzzleloader|shotgun))*)\b/i;
const FIREARMS = ["rifle", "muzzleloader", "shotgun"];
function labelMethods(label: string): Set<string> | null {
  const m = LABEL_METHOD.exec(label);
  if (!m) return null;
  const out = new Set<string>();
  for (const w of m[1].toLowerCase().split(/\s*\/\s*/)) for (const x of /^firearm/.test(w) ? FIREARMS : [w]) out.add(x);
  return out;
}
/** Whether a weapon-limited date (e.g. "Nonresident archery deer application period") is for this hunt's weapon. */
function methodFitsLabel(label: string, fit: HuntFit): boolean {
  if (fit.kind !== "draw") return true;
  const allowed = labelMethods(label);
  if (!allowed) return true;
  const m = fit.method && fit.method !== "all" && fit.method !== "other" ? fit.method : /\barchery\b|\bbow\b/i.test(fit.description) ? "archery" : /muzzleloader/i.test(fit.description) ? "muzzleloader" : null;
  // Weapon not given: the hunt isn't an archery-only hunt unless it says so.
  if (!m) return !(allowed.size === 1 && allowed.has("archery"));
  return allowed.has(m);
}

/**
 * Whether a key date belongs to the drawing/license the hunt is obtained through.
 * `ownDrawings` = separate drawings the hunt's description names that the agency
 * also lists application dates for (e.g. an antlerless hunt and the "Antlerless
 * draw application period"): the hunt's application dates are then only those.
 */
function fitsPlan(k: KeyDate, fit: HuntFit, seasonsInUse: ReadonlySet<HuntSeason>, ownDrawings: readonly RegExp[]): boolean {
  const kind = keyDateKind(k);
  const ls = labelSeason(k.label);
  if (ls) {
    if (fit.season ? fit.season !== ls : seasonsInUse.has(ls === "spring" ? "fall" : "spring")) return false;
  }
  if (fit.kind === "otc") return kind === "license-sale" || kind === "leftover" || GENERAL.test(k.label);
  if (fit.kind === "draw" && kind === "license-sale") return false;
  if (!SPECIAL_DRAWINGS.every((re) => !re.test(k.label) || re.test(fit.description))) return false;
  if (kind === "application" && ownDrawings.length && !ownDrawings.some((re) => re.test(k.label))) return false;
  if (!methodFitsLabel(k.label, fit)) return false;
  return true;
}

/** The species' key dates that apply to this hunt and residency, any cycle. */
export function relevantKeyDates(info: Pick<SpeciesInfo, "keyDates">, residency: PlannerResidency, fit: HuntFit): KeyDate[] {
  const seasonsInUse = applicationSeasons(info.keyDates);
  const apps = info.keyDates.filter((k) => keyDateKind(k) === "application");
  const ownDrawings =
    fit.kind === "otc" ? [] : SPECIAL_DRAWINGS.filter((re) => re.test(fit.description) && apps.some((k) => re.test(k.label)));
  return info.keyDates.filter((k) => {
    const only = keyDateResidency(k);
    return (!only || only === residency) && fitsPlan(k, fit, seasonsInUse, ownDrawings);
  });
}

/** The first-round application window or deadline (not a second/leftover round). */
const isFirstRoundApplication = (k: Pick<KeyDate, "label" | "kind">) => keyDateKind(k) === "application" && !LATER_ROUND.test(k.label);

/**
 * Which of the hunt's dates are its own application date. Usually the first-round
 * application; for a hunt the agency lists in a later round ("West River Deer,
 * Second Application Period"), that round's application period when the agency
 * lists one.
 */
export function mainApplicationTest(dates: readonly KeyDate[], fit: Pick<HuntFit, "round">): (k: KeyDate) => boolean {
  const r = fit.round ?? 1;
  if (r > 1) {
    const ofRound = (k: KeyDate) => roundOf(k.label) === r && (keyDateKind(k) === "application" || keyDateKind(k) === "leftover");
    if (dates.some(ofRound)) return ofRound;
  }
  return isFirstRoundApplication;
}

/** Window end or single date; "" when the key date has neither (start-only notes). */
const endOf = (k: Pick<KeyDate, "end" | "date">) => k.end || k.date || "";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Same-day dates list in this order: the application before the point-only line on the same window, etc. */
const KIND_ORDER: readonly AgencyDateKind[] = ["application", "application-change", "points", "results", "payment", "surrender", "leftover", "license-sale", "other"];

export interface CyclePick {
  /** The cycle being planned; null when the agency has published no dates for this hunt. */
  planCycle: number | null;
  /** The cycle `dates` belong to. */
  datesCycle: number | null;
  /** True when `dates` are the agency's published dates for planCycle. */
  published: boolean;
  dates: (KeyDate & { end: string })[];
}

/**
 * The cycle to plan for: the soonest cycle whose application dates (or, when
 * the agency lists no application date for the hunt in any cycle, any of its
 * dates) haven't all passed. A cycle holding only other dates (another
 * drawing's payment deadline, results) while the hunt's application date is
 * listed for other cycles isn't one the hunt can be applied for yet. When every
 * such cycle has passed, the cycle being planned is the next one and the latest
 * cycle's dates are returned with published = false, so they can be shown as
 * "2026 dates — 2027 not yet published", never as the upcoming deadline.
 */
export function selectCycle(dates: readonly KeyDate[], today: string, isMain: (k: KeyDate) => boolean = isFirstRoundApplication): CyclePick {
  const withEnd = dates.map((k) => ({ ...k, end: endOf(k) })).filter((k) => ISO.test(k.end));
  const allCycles = Array.from(new Set(withEnd.map((k) => k.cycle))).sort((a, b) => a - b);
  if (!allCycles.length) return { planCycle: null, datesCycle: null, published: false, dates: [] };
  const rank = (k: KeyDate) => KIND_ORDER.indexOf(keyDateKind(k));
  const inCycle = (c: number) =>
    withEnd.filter((k) => k.cycle === c).sort((a, b) => (a.start || a.end).localeCompare(b.start || b.end) || rank(a) - rank(b) || a.label.localeCompare(b.label));
  const withApps = allCycles.filter((c) => inCycle(c).some(isMain));
  const cycles = withApps.length ? withApps : allCycles;
  for (const c of cycles) {
    const primary = withApps.length ? inCycle(c).filter(isMain) : inCycle(c);
    if (primary.some((k) => k.end >= today)) return { planCycle: c, datesCycle: c, published: true, dates: inCycle(c) };
  }
  const latest = cycles[cycles.length - 1];
  return { planCycle: latest + 1, datesCycle: latest, published: false, dates: inCycle(latest) };
}

/** The main application date to remind about: the soonest open application window in a published cycle. */
function mainDeadline(pick: CyclePick, today: string, isMain: (k: KeyDate) => boolean): (KeyDate & { end: string }) | null {
  if (!pick.published) return null;
  const apps = pick.dates.filter((k) => isMain(k) && k.end >= today);
  return apps.sort((a, b) => a.end.localeCompare(b.end) || a.label.localeCompare(b.label))[0] ?? null;
}

/** The hunt's dates and the cycle picked from them, by the same rules planAgency uses. */
export function pickForHunt(info: Pick<SpeciesInfo, "keyDates">, residency: PlannerResidency, today: string, fit: HuntFit): { pick: CyclePick; isMain: (k: KeyDate) => boolean } {
  const dates = relevantKeyDates(info, residency, fit);
  const isMain = mainApplicationTest(dates, fit);
  const pick = selectCycle(dates, today, isMain);
  // A drawn hunt the agency lists no application date for (in any cycle): its other dates
  // (a point purchase window, results) don't make a cycle one it can be applied in.
  if (fit.kind === "draw" && pick.published && !dates.some(isMain)) return { pick: { ...pick, planCycle: pick.datesCycle === null ? null : pick.datesCycle + 1, published: false }, isMain };
  return { pick, isMain };
}

/** The cycle an entry planned today would get (used by "Add to my planner" to tell if a hunt is already planned). */
export function planCycleFor(info: Pick<SpeciesInfo, "keyDates">, residency: PlannerResidency, today: string, fit: HuntFit): number | null {
  return pickForHunt(info, residency, today, fit).pick.planCycle;
}

// ------------------------------------------------------------
// Seasons
// ------------------------------------------------------------

/**
 * Ranges from season text written as ISO dates ("2026-08-18 to 2026-08-30
 * (Archery, Muzzleloader)", several segments allowed). Text in any other form
 * returns null and is shown as printed; nothing is guessed.
 */
export function parseSeasonText(text: string | undefined): { start: string; end: string; label?: string }[] | null {
  if (!text) return null;
  const re = /(\d{4}-\d{2}-\d{2})\s*(?:to|–|—|-)\s*(\d{4}-\d{2}-\d{2})(?:\s*\(([^)]{1,120})\))?/g;
  const out: { start: string; end: string; label?: string }[] = [];
  for (const m of text.matchAll(re)) {
    if (m[1] > m[2]) return null;
    out.push({ start: m[1], end: m[2], ...(m[3] ? { label: m[3].trim() } : {}) });
  }
  // Anything left besides separators means the text says more than the ranges capture.
  const rest = text.replace(re, "").replace(/[\s,;&]|\band\b/g, "");
  return out.length && !rest ? out : null;
}

function methodFromLabel(label: string): string | undefined {
  if (/archery|\bbow\b/i.test(label)) return "archery";
  if (/muzzleloader/i.test(label)) return "muzzleloader";
  if (/shotgun/i.test(label)) return "shotgun";
  if (/rifle/i.test(label)) return "rifle";
  return undefined;
}

function methodFits(s: SeasonDate, rowMethod: string | undefined): boolean {
  const sm = s.method ?? methodFromLabel(s.label);
  if (!rowMethod || rowMethod === "all" || rowMethod === "other" || !sm || sm === "all") return true;
  return sm === rowMethod;
}

const srcField = (i: number) => (i >= 0 ? { src: i } : {});
const sameCode = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();
/** Statewide seasons that are for drawn/limited hunts only, not general licenses. */
const DRAW_ONLY_SEASON = /draw[- ]only|limited[- ]entry|controlled|once[- ]in[- ]a[- ]lifetime/i;

export interface HuntSeasons {
  seasons: AgencySeason[];
  year: number | null;
  /** The hunt's season dates exactly as printed, when the row has them. */
  text?: string;
}

/**
 * The hunt's season dates: the row's ranges, else its ISO season text, else a
 * season entry naming its hunt code, else entries for its units (and method),
 * else the species' statewide/standard seasons (scope "statewide"). For
 * season entries, the planned cycle's year is used when published, else the
 * latest year. Row text in another format is returned as `text` only.
 */
export function huntSeasons(opts: {
  seasons: readonly SeasonDate[];
  species: string;
  residency: PlannerResidency;
  row?: DrawRecord | null;
  kind: PlanKind;
  planCycle: number | null;
  /** Index of a source in the entry's links (negative when the list is full). */
  sourceId: (sourceId: string) => number;
}): HuntSeasons {
  const { row, kind, planCycle, residency, species } = opts;
  if (row) {
    const src = opts.sourceId(row.seasonSourceId || row.sourceId);
    const text = row.seasonDates || undefined;
    const ranges = row.seasonRanges?.length ? row.seasonRanges.filter((r) => ISO.test(r.start) && ISO.test(r.end) && r.start <= r.end) : parseSeasonText(row.seasonDates);
    if (ranges?.length) {
      return {
        seasons: ranges.slice(0, PLANNER_LIMITS.seasons).map((r) => ({ label: r.label || "", start: r.start, end: r.end, year: row.year, scope: "hunt" as const, ...(src >= 0 ? { src } : {}) })),
        year: row.year,
        ...(text ? { text } : {}),
      };
    }
    if (text) return { seasons: [], year: row.year, text };
  }
  const mine = opts.seasons.filter((s) => s.species === species && (!s.residency || s.residency === residency) && ISO.test(s.start) && ISO.test(s.end));
  const tiers: [AgencySeason["scope"], SeasonDate[]][] = [
    ["hunt", row ? mine.filter((s) => s.huntCodes?.some((c) => sameCode(c, row.huntCode))) : []],
    [
      "units",
      row ? mine.filter((s) => !s.huntCodes?.length && s.units?.some((u) => row.units.some((ru) => canonicalUnit(ru) === canonicalUnit(u))) && methodFits(s, row.method)) : [],
    ],
    [
      "statewide",
      mine.filter((s) => !s.huntCodes?.length && !s.units?.length && methodFits(s, row?.method) && (kind !== "otc" || !DRAW_ONLY_SEASON.test(s.label))),
    ],
  ];
  for (const [scope, list] of tiers) {
    if (!list.length) continue;
    const years = new Set(list.map((s) => s.year));
    const year = planCycle !== null && years.has(planCycle) ? planCycle : Math.max(...years);
    const seasons = list
      .filter((s) => s.year === year)
      .sort((a, b) => a.start.localeCompare(b.start) || a.label.localeCompare(b.label))
      .slice(0, PLANNER_LIMITS.seasons)
      .map((s) => ({ label: s.label, start: s.start, end: s.end, year: s.year, scope, ...(s.note ? { note: s.note.slice(0, 200) } : {}), ...srcField(opts.sourceId(s.sourceId)) }));
    return { seasons, year };
  }
  return { seasons: [], year: null };
}

// ------------------------------------------------------------
// Requirements and draw-system notes
// ------------------------------------------------------------

const REQUIREMENT =
  /hunter (education|ed\b)|certificat|\bcourse\b|orientation|must (first )?(buy|hold|have|purchase|complete|carry)|qualifying license|habitat stamp|\brequired\b|hound hunter permit/i;

/** Sentences in the agency's species notes that state a requirement (hunter education, a course, a qualifying license...). Copied, not paraphrased. */
export function requirementsOf(info: Pick<SpeciesInfo, "residentNote" | "nonresidentNote" | "drawSystemSummary" | "otcSummary">, residency: PlannerResidency): string[] {
  const texts = [residency === "resident" ? info.residentNote : info.nonresidentNote, info.drawSystemSummary, info.otcSummary];
  const out: string[] = [];
  for (const t of texts) {
    for (const sentence of (t || "").split(/(?<=[.!?])\s+(?=[A-Z(])/)) {
      const s = sentence.trim();
      if (s && REQUIREMENT.test(s) && !out.includes(s)) out.push(s.slice(0, 300));
    }
  }
  return out.slice(0, PLANNER_LIMITS.requirements);
}

const DRAW_SYSTEM: Record<string, string> = {
  preference: "Preference points",
  bonus: "Bonus points",
  "bonus-squared": "Bonus points (squared)",
  hybrid: "Hybrid: points + random",
  random: "Random draw (no points)",
  otc: "Over the counter",
  none: "No season",
};

// ------------------------------------------------------------
// Building an entry
// ------------------------------------------------------------

export interface PlanInput {
  state: PlannerState;
  info: SpeciesInfo;
  residency: PlannerResidency;
  /** YYYY-MM-DD, Mountain Time (todayIso()). */
  today: string;
  /** ISO time. */
  now: string;
  kind: PlanKind;
  /** The agency's draw row, for kind "draw". */
  row?: DrawRecord | null;
  /** The member's answer when the agency runs separate spring and fall drawings and the hunt doesn't say. */
  drawing?: DrawingSeason | null;
  /** For kind "custom": the member's description of the hunt. */
  customDescription?: string;
}

export interface PlanResult {
  agency: AgencyRef;
  /** The species has separate spring and fall drawings and this hunt doesn't say which: ask the member. */
  needsDrawing: boolean;
}

const OTC_DESCRIPTION = "General season / over-the-counter license";

/**
 * Researcher notes saying the next cycle isn't published yet are left off each date:
 * the entry carries that as cyclePublished/datesCycle and shows it once. Keeps entries small.
 */
const keepNote = (note: string | undefined) => !!note && !/not (yet )?(been )?published/i.test(note);

/** Text cut at a sentence or word boundary, with an ellipsis when cut. */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const at = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return `${cut.slice(0, at > max * 0.6 ? at + (cut[at] === "." ? 1 : 0) : cut.length).trimEnd()}…`;
}

/** The agency block for a planned hunt, built only from the server's agency data. */
export function planAgency(input: PlanInput): PlanResult {
  const { state: st, info, residency, today, now, kind } = input;
  const row = kind === "draw" ? input.row ?? null : null;
  if (kind === "draw" && !row) throw new Error("A draw hunt needs its agency row.");
  const description = clip(row ? row.description : kind === "otc" ? info.otcSummary || OTC_DESCRIPTION : input.customDescription || "", 600);
  const fit = fitFor(kind, kind === "otc" ? `${OTC_DESCRIPTION} ${description}` : description, row, input.drawing);
  const { pick, isMain } = pickForHunt(info, residency, today, fit);
  const srcOf = (id: string) => sourceOf(st, id);
  const urlOf = (id: string) => srcOf(id)?.url || st.agency.url;
  const links: string[] = [];
  const linkIndex = (id: string) => {
    const url = urlOf(id);
    let i = links.indexOf(url);
    if (i < 0 && links.length < PLANNER_LIMITS.links) i = links.push(url) - 1;
    return i;
  };

  const keyDates: AgencyDate[] = pick.dates.slice(0, PLANNER_LIMITS.keyDates).map((k) => {
    const src = linkIndex(k.sourceId);
    const only = keyDateResidency(k);
    return {
      kind: keyDateKind(k),
      label: k.label,
      ...(k.date ? { date: k.date } : {}),
      ...(k.start && k.start <= k.end ? { start: k.start } : {}),
      end: k.end,
      cycle: k.cycle,
      status: k.status,
      ...(only ? { residency: only } : {}),
      ...(keepNote(k.note) ? { note: k.note!.slice(0, 200) } : {}),
      ...(src >= 0 ? { src } : {}),
    };
  });
  const main = mainDeadline(pick, today, isMain);
  const mainSrc = main ? srcOf(main.sourceId) : undefined;
  const deadline: AgencyDeadline | null = main
    ? {
        label: main.label,
        ...(main.date ? { date: main.date } : {}),
        ...(main.start ? { start: main.start } : {}),
        end: main.end,
        cycle: main.cycle,
        status: main.status,
        ...(main.note ? { note: main.note.slice(0, 300) } : {}),
        sourceUrl: mainSrc?.url || st.agency.url,
        ...(mainSrc?.title ? { sourceTitle: mainSrc.title.slice(0, 300) } : {}),
      }
    : null;

  const seasons = huntSeasons({ seasons: st.seasons || [], species: info.species, residency, row, kind, planCycle: pick.planCycle, sourceId: linkIndex });
  const rowSrc = row ? srcOf(row.sourceId) : undefined;
  const units = (row?.units || []).slice(0, PLANNER_LIMITS.units);
  const odds = row ? oddsOf(drawStats(row, residency).stats) : null;
  const minPts = row && info.pointsMatter ? minPointsDrawn(row, residency) : null;
  const note = residency === "resident" ? info.residentNote : info.nonresidentNote;
  const requirements = requirementsOf(info, residency);

  const agency: AgencyRef = {
    stateSlug: st.slug,
    agencyName: st.agency.name,
    agencyShortName: st.agency.shortName,
    unitTerm: st.unitTerm,
    huntCode: row?.huntCode || "",
    units,
    description,
    residency,
    drawYear: row?.year || 0,
    deadline,
    fees: feesFor(st, info.species, residency, pick.planCycle).map(({ sourceUrl, ...f }) => {
      const i = links.indexOf(sourceUrl) >= 0 ? links.indexOf(sourceUrl) : links.length < PLANNER_LIMITS.links ? links.push(sourceUrl) - 1 : -1;
      return i >= 0 ? { ...f, sourceUrl: "", src: i } : { ...f, sourceUrl };
    }),
    oddsNote: row ? oddsNote(row, residency, info.pointsMatter) : "",
    sourceUrl: rowSrc?.url || st.agency.url,
    ...(rowSrc?.title ? { sourceTitle: rowSrc.title } : {}),
    addedAt: now,
    kind,
    planCycle: pick.planCycle,
    datesCycle: pick.datesCycle,
    cyclePublished: pick.published,
    keyDates,
    seasons: seasons.seasons,
    links,
    ...(seasons.text ? { seasonText: seasons.text.slice(0, 200) } : {}),
    seasonYear: seasons.year,
    drawSystem: DRAW_SYSTEM[info.drawSystem] || info.drawSystem,
    ...(info.drawSystemSummary ? { drawSummary: clip(info.drawSystemSummary, 600) } : {}),
    ...(info.pointName ? { pointName: info.pointName.slice(0, PLANNER_LIMITS.short) } : {}),
    pointsMatter: info.pointsMatter,
    ...(note ? { residencyNote: clip(note, 600) } : {}),
    ...(kind !== "draw" && info.otcSummary ? { otcSummary: clip(info.otcSummary, 600) } : {}),
    requirements,
    ...(row?.method ? { method: row.methodLabel || row.method } : {}),
    ...(row?.sex ? { sex: row.sex } : {}),
    minPoints: minPts,
    oddsPct: odds === null ? null : Math.round(odds * 10) / 10,
  };
  return { agency, needsDrawing: needsDrawingChoice(info, fit) };
}

/** A new planner entry built from planAgency(). */
export function buildPlannedHunt(
  input: PlanInput & { id: string; pointsOwned?: number; unit?: string; notes?: string }
): { hunt: PlannedHunt; needsDrawing: boolean } {
  const { agency, needsDrawing } = planAgency(input);
  const { state: st, info, row, now, id } = input;
  const units = agency.units;
  const unit =
    input.kind === "draw"
      ? units.length
        ? `${st.unitTerm} ${units.slice(0, 6).join(", ")}${units.length > 6 ? ` +${units.length - 6}` : ""}`
        : ""
      : input.kind === "otc"
        ? "General / OTC license"
        : (input.unit || "").slice(0, 200);
  const hunt: PlannedHunt = {
    id,
    state: st.name,
    species: info.species,
    unit,
    season: (row?.method && SEASON_OF[row.method]) || "",
    preferencePointsNeeded: agency.minPoints ?? 0,
    preferencePointsOwned: Math.max(0, Math.min(99, Math.round(input.pointsOwned || 0))),
    applicationDeadline: agency.deadline?.end || "",
    seasonDates: row?.seasonDates || "",
    status: "planning",
    notes: (input.notes || "").slice(0, PLANNER_LIMITS.text),
    agency,
    updatedAt: now,
    ...(input.drawing ? { drawing: input.drawing } : {}),
    stepsDone: [],
    tasks: [],
    customDates: [],
  };
  return { hunt, needsDrawing };
}

/** A new planner entry for one agency draw row (the v1 "Add to my planner" shape, now with every v2 field). */
export function buildAgencyHunt(opts: {
  state: PlannerState;
  info: SpeciesInfo;
  row: DrawRecord;
  residency: PlannerResidency;
  today: string;
  now: string;
  id: string;
}): PlannedHunt {
  return buildPlannedHunt({ ...opts, kind: "draw" }).hunt;
}
