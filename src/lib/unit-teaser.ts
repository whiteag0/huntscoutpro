// Free, server-rendered summary of one unit for one species, and the one-hunt
// point-creep example on /trends. Pure and client-safe so it can be unit tested.
//
// Every figure is copied from an agency row (or is drawn ÷ applicants / harvest ÷ hunters
// where the agency publishes counts only). Applicant totals are used to rank hunts, never shown summed.
import type { DrawRecord, DrawResidencyStats, HarvestRecord, KeyDate } from "@/data/agency/schema";
import { canonicalUnit, drawStats, isRealUnit, minPointsDrawn, oddsOf, successOf, years, type DrawResidency } from "./agency-view";
import { formatKeyDate, keyDateEnd } from "./agency-format";
import { huntsForYear, resultsYear } from "./shortlist-core";

export type YearRange = [number, number];

export interface TeaserHarvest {
  year: number;
  /** Set when the agency reports this unit's harvest only per hunt: the hunt the line is for. */
  hunt: string | null;
  /** Set when the agency splits this unit's harvest only by residency: the pool the line is for. */
  residency: "resident" | "nonresident" | null;
  /** The agency's category label (e.g. "All Manners of Take"), when it publishes one. */
  label: string | null;
  hunters: number | null;
  harvest: number | null;
  successPct: number | null;
  /** True when success is harvest ÷ hunters rather than the agency's own percentage. */
  successComputed: boolean;
  sourceId: string;
}

export interface TeaserPool {
  pool: DrawResidency | "total";
  applicants: number | null;
  drawn: number | null;
}

export interface TeaserHunt {
  year: number;
  huntCode: string;
  description: string;
  /** "first" when the counts are first-choice applications only. */
  choice: DrawRecord["choice"];
  pools: TeaserPool[];
  sourceId: string;
}

export interface UnitTeaser {
  /** Unit id as the agency writes it (newest harvest spelling, else the draw's). */
  unit: string;
  harvestYears: YearRange | null;
  drawYears: YearRange | null;
  /** Distinct hunt codes that include the unit in the newest draw year. */
  huntCodes: { year: number; count: number; sourceIds: string[] } | null;
  /** Newest whole-unit harvest line (no hunt, sex or residency split). */
  harvest: TeaserHarvest | null;
  /** The hunt with the most applicants in the newest draw year that has results. */
  topHunt: TeaserHunt | null;
}

const range = (ys: number[]): YearRange | null => (ys.length ? [Math.min(...ys), Math.max(...ys)] : null);
const hasFigures = (r: HarvestRecord) => r.hunters != null || r.harvest != null || r.successPct != null;
const hasApplicants = (s: DrawResidencyStats | null | undefined): s is DrawResidencyStats => s?.applicants != null;

/** Applicants used to rank hunts by demand: the agency's total, else resident + nonresident. Never displayed. */
function demand(r: DrawRecord): number {
  if (r.total?.applicants != null) return r.total.applicants;
  return (r.resident?.applicants ?? 0) + (r.nonresident?.applicants ?? 0);
}

const size = (r: HarvestRecord) => r.hunters ?? r.harvest ?? -1;

/**
 * Newest harvest line for a unit: the whole-unit row (the agency's all-methods one when it has it),
 * else, where the agency reports the unit only per hunt or only split by residency, the newest
 * year's biggest such row, labelled with its hunt and pool.
 */
export function teaserHarvest(rows: HarvestRecord[]): TeaserHarvest | null {
  const anyResidency = (r: HarvestRecord) => !r.residency || r.residency === "all";
  const figures = rows.filter(hasFigures);
  const whole = figures.filter((r) => !r.hunt && (!r.sex || r.sex === "all") && anyResidency(r));
  const all = whole.filter((r) => r.method === "all");
  // A hunt's sex (e.g. a bull hunt) describes the hunt, so per-hunt rows aren't filtered on it.
  const perHunt = figures.filter((r) => r.hunt && anyResidency(r));
  const split = figures.filter((r) => !r.sex || r.sex === "all" || r.hunt);
  const pool = [all, whole, perHunt, split].find((p) => p.length);
  if (!pool) return null;
  const year = Math.max(...pool.map((r) => r.year));
  const r = pool.filter((x) => x.year === year).sort((a, b) => size(b) - size(a))[0];
  const success = successOf(r);
  return {
    year,
    hunt: r.hunt || null,
    residency: r.residency === "resident" || r.residency === "nonresident" ? r.residency : null,
    label: r.methodLabel || (r.method && r.method !== "all" ? r.method : null),
    hunters: r.hunters,
    harvest: r.harvest,
    successPct: success,
    successComputed: r.successPct == null || !!r.successComputed,
    sourceId: r.sourceId,
  };
}

export function teaserTopHunt(rows: DrawRecord[]): TeaserHunt | null {
  const { year } = resultsYear(rows);
  if (year === null) return null;
  const top = huntsForYear(rows, year)
    .filter((r) => demand(r) > 0)
    .sort((a, b) => demand(b) - demand(a) || a.huntCode.localeCompare(b.huntCode))[0];
  if (!top) return null;
  const pools: TeaserPool[] = [];
  for (const p of ["resident", "nonresident"] as const) {
    const s = top[p];
    if (hasApplicants(s)) pools.push({ pool: p, applicants: s.applicants ?? null, drawn: s.drawn ?? null });
  }
  if (!pools.length && hasApplicants(top.total)) pools.push({ pool: "total", applicants: top.total.applicants ?? null, drawn: top.total.drawn ?? null });
  if (!pools.length) return null;
  return { year, huntCode: top.huntCode, description: top.description, choice: top.choice, pools, sourceId: top.sourceId };
}

export function unitTeaser(unit: string, harvest: HarvestRecord[], draw: DrawRecord[]): UnitTeaser {
  const withFigures = harvest.filter(hasFigures);
  const latestDraw = draw.reduce((m, r) => Math.max(m, r.year), 0);
  const latestRows = draw.filter((r) => r.year === latestDraw);
  return {
    unit,
    harvestYears: range(withFigures.map((r) => r.year)),
    drawYears: range(draw.map((r) => r.year)),
    huntCodes: latestRows.length
      ? { year: latestDraw, count: new Set(latestRows.map((r) => r.huntCode)).size, sourceIds: Array.from(new Set(latestRows.map((r) => r.sourceId))) }
      : null,
    harvest: teaserHarvest(harvest),
    topHunt: teaserTopHunt(draw),
  };
}

export function hasTeaserData(t: UnitTeaser | null | undefined): t is UnitTeaser {
  return !!t && (!!t.harvest || !!t.huntCodes || !!t.topHunt);
}

/** One teaser per unit (keyed by canonicalUnit) for a state's species tables. */
export function buildUnitTeasers(harvest: HarvestRecord[], draw: DrawRecord[]): Map<string, UnitTeaser> {
  const h = new Map<string, HarvestRecord[]>();
  const d = new Map<string, DrawRecord[]>();
  const spelling = new Map<string, { unit: string; year: number; fromHarvest: boolean }>();
  const name = (key: string, unit: string, year: number, fromHarvest: boolean) => {
    const cur = spelling.get(key);
    if (!cur || (fromHarvest && !cur.fromHarvest) || (fromHarvest === cur.fromHarvest && year > cur.year)) spelling.set(key, { unit, year, fromHarvest });
  };
  for (const r of harvest) {
    if (!isRealUnit(r.unit)) continue;
    const key = canonicalUnit(r.unit);
    (h.get(key) || h.set(key, []).get(key)!).push(r);
    name(key, r.unit, r.year, true);
  }
  for (const r of draw) {
    // A hunt that lists a unit twice under different spellings still counts once for it.
    for (const key of new Set(r.units.filter(isRealUnit).map(canonicalUnit))) {
      (d.get(key) || d.set(key, []).get(key)!).push(r);
      name(key, r.units.find((u) => canonicalUnit(u) === key)!, r.year, false);
    }
  }
  const out = new Map<string, UnitTeaser>();
  for (const [key, s] of spelling) out.set(key, unitTeaser(s.unit, h.get(key) || [], d.get(key) || []));
  return out;
}

/** The next agency date that hasn't passed, soonest first (same rule as the state page). */
export function nextAgencyDate(dates: KeyDate[], today: string): KeyDate | null {
  return (
    [...dates]
      .filter((k) => keyDateEnd(k) >= today && formatKeyDate(k))
      .sort((a, b) => keyDateEnd(a).localeCompare(keyDateEnd(b)) || a.label.localeCompare(b.label))[0] || null
  );
}

export interface TrendPoint {
  year: number;
  minPoints: number | null;
  oddsPct: number | null;
  sourceId: string;
}

export interface TrendExample {
  huntCode: string;
  description: string;
  residency: DrawResidency;
  /** "total" when the agency publishes one combined pool for the hunt. */
  pool: DrawResidency | "total";
  applicants: number;
  applicantsYear: number;
  choice: DrawRecord["choice"];
  points: TrendPoint[];
}

/**
 * One hunt to show non-members on /trends: of the hunts with the metric in at least two of the
 * newest five draw years, the one with the most applicants in its newest year. The metric is the
 * minimum points drawn when points matter, else the published (or drawn ÷ applicants) odds.
 */
export function trendExample(rows: DrawRecord[], pointsMatter: boolean, residency: DrawResidency = "resident"): TrendExample | null {
  const ys = years(rows).slice(0, 5);
  const byCode = new Map<string, DrawRecord[]>();
  for (const y of ys) {
    for (const r of huntsForYear(rows, y)) (byCode.get(r.huntCode) || byCode.set(r.huntCode, []).get(r.huntCode)!).push(r);
  }
  let best: TrendExample | null = null;
  for (const [code, list] of byCode) {
    const points = list
      .map((r) => ({ r, minPoints: pointsMatter ? minPointsDrawn(r, residency) : null, oddsPct: oddsOf(drawStats(r, residency).stats) }))
      .filter((p) => (pointsMatter ? p.minPoints !== null : p.oddsPct !== null))
      .sort((a, b) => a.r.year - b.r.year);
    if (points.length < 2) continue;
    const newest = points[points.length - 1].r;
    const { stats, pool } = drawStats(newest, residency);
    const applicants = stats?.applicants ?? 0;
    if (!applicants) continue;
    if (best && (applicants < best.applicants || (applicants === best.applicants && code >= best.huntCode))) continue;
    best = {
      huntCode: code,
      description: newest.description,
      residency,
      pool,
      applicants,
      applicantsYear: newest.year,
      choice: newest.choice,
      points: points.map((p) => ({ year: p.r.year, minPoints: p.minPoints, oddsPct: p.oddsPct, sourceId: p.r.sourceId })),
    };
  }
  return best;
}
