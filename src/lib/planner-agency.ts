// Builds a Hunt Planner entry from one agency draw row and the state's agency
// meta. Pure functions only (no data imports, no I/O): `npm test`.
//
// Nothing is estimated. The deadline is the agency's own key date (or none),
// the fees are the agency's fee lines, and the odds note repeats the row's
// published counts.

import type { DrawMeta, DrawRecord, DrawResidencyStats, FeeItem, KeyDate, SourceRef, SpeciesInfo } from "@/data/agency/schema";
import { drawStats, minPointsDrawn, oddsOf } from "@/lib/agency-view";
import { isNotificationLabel, openKeyDateEnd } from "@/lib/reminders";
import { PLANNER_LIMITS, type AgencyDeadline, type AgencyFee, type AgencyRef, type PlannedHunt, type PlannerResidency, type PlannerSeason } from "@/lib/planner-schema";

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
const SPECIAL_DRAWINGS = [/general[-\s]season/i, /sportsman/i, /landowner/i, /governor/i, /conservation/i, /\bexpo\b/i, /raffle/i, /\bDAV\b/, /\byouth\b/i];
/** Second / secondary rounds are for leftovers; a planned hunt's date is the main application. */
const LATER_ROUND = /\bsecond(ary)?\b/i;
const SPRING = /\bspring\b/i;
const FALL = /\bfall\b/i;

type HuntSeason = "spring" | "fall" | null;

/** The season a key-date label is limited to ("Spring turkey ... application period"), if exactly one. */
function labelSeason(label: string): HuntSeason {
  const sp = SPRING.test(label);
  const fa = FALL.test(label);
  return sp && !fa ? "spring" : fa && !sp ? "fall" : null;
}

/**
 * The hunt's season from its description, else from its season dates' first
 * month (Mar-Jun spring, Aug-Dec fall). Null when neither tells.
 */
function huntSeason(description: string, seasonDates?: string): HuntSeason {
  const named = labelSeason(description);
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
export type PlannerState = Pick<DrawMeta, "slug" | "name" | "agency" | "unitTerm" | "species" | "fees"> & { sources: SourceRef[] };

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

/** A new planner entry for one agency draw row. */
export function buildAgencyHunt(opts: {
  state: PlannerState;
  info: SpeciesInfo;
  row: DrawRecord;
  residency: PlannerResidency;
  today: string;
  now: string;
  id: string;
}): PlannedHunt {
  const { state: st, info, row, residency, today, now, id } = opts;
  const k = nextApplicationDeadline(info, residency, today, row.description, row.seasonDates);
  const kSrc = k ? sourceOf(st, k.sourceId) : undefined;
  const deadline: AgencyDeadline | null = k
    ? {
        label: k.label,
        ...(k.date ? { date: k.date } : {}),
        ...(k.start ? { start: k.start } : {}),
        end: k.end,
        cycle: k.cycle,
        status: k.status,
        ...(k.note ? { note: k.note } : {}),
        sourceUrl: kSrc?.url || st.agency.url,
        ...(kSrc?.title ? { sourceTitle: kSrc.title } : {}),
      }
    : null;
  const rowSrc = sourceOf(st, row.sourceId);
  const units = row.units.slice(0, PLANNER_LIMITS.units);
  const agency: AgencyRef = {
    stateSlug: st.slug,
    agencyName: st.agency.name,
    agencyShortName: st.agency.shortName,
    unitTerm: st.unitTerm,
    huntCode: row.huntCode,
    units,
    description: row.description,
    residency,
    drawYear: row.year,
    deadline,
    fees: feesFor(st, info.species, residency, deadline?.cycle ?? null),
    oddsNote: oddsNote(row, residency, info.pointsMatter),
    sourceUrl: rowSrc?.url || st.agency.url,
    ...(rowSrc?.title ? { sourceTitle: rowSrc.title } : {}),
    addedAt: now,
  };
  return {
    id,
    state: st.name,
    species: info.species,
    unit: units.length ? `${st.unitTerm} ${units.slice(0, 6).join(", ")}${units.length > 6 ? ` +${units.length - 6}` : ""}` : "",
    season: (row.method && SEASON_OF[row.method]) || "",
    preferencePointsNeeded: 0,
    preferencePointsOwned: 0,
    applicationDeadline: deadline?.end || "",
    seasonDates: row.seasonDates || "",
    status: "planning",
    notes: "",
    agency,
    updatedAt: now,
  };
}

// ------------------------------------------------------------
// The draw row as sent by the browser (it's the row the agency API returned)
// ------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const cnt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e8 ? v : null);

function stats(v: unknown): DrawResidencyStats | null {
  if (!isObj(v)) return null;
  const out: DrawResidencyStats = {};
  for (const k of ["quota", "applicants", "drawn", "minPoints"] as const) {
    const x = cnt(v[k]);
    if (x !== null) out[k] = x;
  }
  const odds = cnt(v.oddsPct);
  if (odds !== null && odds <= 100) out.oddsPct = odds;
  if (v.oddsComputed === true) out.oddsComputed = true;
  return out;
}

function pointCounts(v: unknown): { applicants: number; drawn: number } | null {
  if (!isObj(v)) return null;
  const a = cnt(v.applicants);
  const d = cnt(v.drawn);
  return a !== null && d !== null ? { applicants: a, drawn: d } : null;
}

/** Validate a DrawRecord from a request body. Returns null when it isn't one. */
export function sanitizeDrawRow(raw: unknown, species: string): DrawRecord | null {
  if (!isObj(raw)) return null;
  const huntCode = typeof raw.huntCode === "string" ? raw.huntCode.trim().slice(0, 120) : "";
  const year = typeof raw.year === "number" && Number.isInteger(raw.year) && raw.year >= 1990 && raw.year <= 2100 ? raw.year : 0;
  const sourceId = typeof raw.sourceId === "string" ? raw.sourceId.slice(0, 80) : "";
  if (!huntCode || !year || !sourceId || raw.species !== species) return null;
  const units = Array.isArray(raw.units) ? raw.units.filter((u): u is string => typeof u === "string").map((u) => u.slice(0, 40)).slice(0, 200) : [];
  const byPoints = Array.isArray(raw.byPoints)
    ? raw.byPoints
        .filter(isObj)
        .slice(0, 120)
        .map((p) => ({ points: cnt(p.points) ?? -1, resident: pointCounts(p.resident), nonresident: pointCounts(p.nonresident) }))
        .filter((p) => p.points >= 0)
    : undefined;
  const method = ["all", "rifle", "archery", "muzzleloader", "shotgun", "other"].includes(raw.method as string) ? (raw.method as DrawRecord["method"]) : undefined;
  return {
    species: species as DrawRecord["species"],
    year,
    huntCode,
    units,
    description: typeof raw.description === "string" ? raw.description.slice(0, 600) : "",
    ...(method ? { method } : {}),
    ...(typeof raw.seasonDates === "string" ? { seasonDates: raw.seasonDates.slice(0, 200) } : {}),
    choice: raw.choice === "first" ? "first" : "all",
    resident: stats(raw.resident),
    nonresident: stats(raw.nonresident),
    total: stats(raw.total),
    ...(byPoints && byPoints.length ? { byPoints } : {}),
    sourceId,
  };
}
