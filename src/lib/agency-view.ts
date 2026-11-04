// Client-safe derivations over agency rows. Every value returned here is read
// straight from a published row or is simple arithmetic on published counts.
import type { DrawRecord, DrawResidencyStats, HarvestRecord } from "@/data/agency/schema";

export type DrawResidency = "resident" | "nonresident";

const hasStats = (s: DrawResidencyStats | null | undefined): s is DrawResidencyStats =>
  !!s && (s.applicants != null || s.quota != null || s.drawn != null);

/**
 * Stats for the chosen residency. Falls back to the agency's single combined pool only when the
 * record has no resident/nonresident split at all; if only the other side is reported (e.g. a
 * resident-only hunt), the chosen side has no figures.
 */
export function drawStats(r: DrawRecord, residency: DrawResidency): { stats: DrawResidencyStats | null; pool: DrawResidency | "total" } {
  if (hasStats(r[residency])) return { stats: r[residency]!, pool: residency };
  const other = residency === "resident" ? r.nonresident : r.resident;
  if (!hasStats(other) && hasStats(r.total)) return { stats: r.total, pool: "total" };
  return { stats: null, pool: residency };
}

/**
 * Quota for the chosen pool. Some agencies print a quota only for the hunt as a whole; then the
 * hunt's total quota is returned with `isTotal` set, so it can be labelled "Total quota (all pools)".
 */
export function poolQuota(r: DrawRecord, residency: DrawResidency): { quota: number | null; isTotal: boolean } {
  const { stats, pool } = drawStats(r, residency);
  if (stats?.quota != null || pool === "total") return { quota: stats?.quota ?? null, isTotal: false };
  if (r.total?.quota != null) return { quota: r.total.quota, isTotal: true };
  return { quota: null, isTotal: false };
}

const huntYearKey = (r: Pick<DrawRecord, "year" | "huntCode">) => `${r.year}|${r.huntCode}`;

/**
 * One row per hunt code and year, preferring the agency's first-choice figures. New Mexico and
 * Nevada publish a first-choice row and an all-choice row for the same hunt.
 */
export function firstChoiceRows(rows: DrawRecord[]): DrawRecord[] {
  const byKey = new Map<string, DrawRecord>();
  for (const r of rows) {
    const k = huntYearKey(r);
    const cur = byKey.get(k);
    if (!cur || (cur.choice !== "first" && r.choice === "first")) byKey.set(k, r);
  }
  return Array.from(byKey.values());
}

/** The all-choice rows firstChoiceRows() sets aside (hunts that also have a first-choice row), for a secondary line. */
export function allChoiceCompanions(rows: DrawRecord[]): { get: (r: Pick<DrawRecord, "year" | "huntCode">) => DrawRecord | undefined } {
  const first = new Set(rows.filter((r) => r.choice === "first").map(huntYearKey));
  const m = new Map<string, DrawRecord>();
  for (const r of rows) if (r.choice === "all" && first.has(huntYearKey(r))) m.set(huntYearKey(r), r);
  return { get: (r) => m.get(huntYearKey(r)) };
}

/** The pool's figures carry odds, or the row has a point table or a lowest-points-drawn figure. */
function hasOddsData(r: DrawRecord): boolean {
  if ((r.byPoints?.length ?? 0) > 0) return true;
  return [r.resident, r.nonresident, r.total].some((s) => !!s && (oddsOf(s) !== null || s.minPoints != null));
}

/**
 * Newest draw year with any odds published (a rate, drawn and applicants, a point table or a lowest
 * point level drawn), and the newest year in the table when that is later (quotas or applicants only
 * so far). Like the shortlist's resultsYear(), but a year with applicants and no draw outcome doesn't count.
 */
export function oddsYear(rows: DrawRecord[]): { year: number | null; newer: number | null } {
  let latest: number | null = null;
  let withOdds: number | null = null;
  for (const r of rows) {
    if (latest === null || r.year > latest) latest = r.year;
    if ((withOdds === null || r.year > withOdds) && hasOddsData(r)) withOdds = r.year;
  }
  return { year: withOdds, newer: latest !== null && withOdds !== null && latest > withOdds ? latest : null };
}

/** Odds in percent from the stats: published value, else drawn / applicants. */
export function oddsOf(s: DrawResidencyStats | null): number | null {
  if (!s) return null;
  if (s.oddsPct != null) return s.oddsPct;
  if (s.applicants && s.drawn != null) return (100 * s.drawn) / s.applicants;
  return null;
}

export interface PointOdds {
  applicants: number;
  drawn: number;
  pct: number;
}

/** Applicants and drawn at exactly this point level, from the agency's point table. */
export function oddsAtPoints(r: DrawRecord, residency: DrawResidency, points: number): PointOdds | null {
  const row = r.byPoints?.find((p) => p.points === points)?.[residency];
  if (!row || !row.applicants) return null;
  return { applicants: row.applicants, drawn: row.drawn, pct: (100 * row.drawn) / row.applicants };
}

/** Lowest point level anyone drew at: published, or read from the point table. */
export function minPointsDrawn(r: DrawRecord, residency: DrawResidency): number | null {
  const { stats } = drawStats(r, residency);
  if (stats?.minPoints != null) return stats.minPoints;
  const rows = (r.byPoints || []).filter((p) => (p[residency]?.drawn || 0) > 0).map((p) => p.points);
  return rows.length ? Math.min(...rows) : null;
}

export function maxPointLevel(rows: DrawRecord[]): number {
  let max = 0;
  for (const r of rows) for (const p of r.byPoints || []) if (p.points > max) max = p.points;
  return max;
}

export function years<T extends { year: number }>(rows: T[]): number[] {
  return Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => b - a);
}

/** Group draw rows by hunt code across years, newest first; one row per year (first-choice when published). */
export function drawHistory(rows: DrawRecord[]): Map<string, DrawRecord[]> {
  const m = new Map<string, DrawRecord[]>();
  for (const r of firstChoiceRows(rows)) {
    const list = m.get(r.huntCode) || [];
    list.push(r);
    m.set(r.huntCode, list);
  }
  for (const list of m.values()) list.sort((a, b) => b.year - a.year);
  return m;
}

export function methodsIn(rows: HarvestRecord[]): string[] {
  const set = new Set(rows.map((r) => r.methodLabel || r.method || "All"));
  return Array.from(set);
}

export const harvestMethodKey = (r: HarvestRecord) => r.methodLabel || r.method || "All";

/** One harvest line followed across seasons: same unit, hunt, category, sex and residency. */
export const harvestSeriesKey = (r: HarvestRecord) => [r.unit, r.hunt || "", harvestMethodKey(r), r.sex || "", r.residency || ""].join("|");

/** Default harvest view: the agency's all-methods rows when they exist, otherwise the first method published. */
/** Pseudo-category: show every published row for the season, with the category in its own column. */
export const EVERY_CATEGORY = "Every category";

/**
 * Default harvest view: the agency's all-methods rows when they cover individual units; otherwise
 * every row (e.g. CPW's 2025 report is per hunt code by method, with only a statewide all-methods total).
 */
export function defaultHarvestMethod(rows: HarvestRecord[]): string {
  const allRows = rows.filter((r) => r.method === "all");
  const allUnits = new Set(allRows.filter((r) => isRealUnit(r.unit)).map((r) => r.unit));
  if (allRows.length && allUnits.size >= 2) return harvestMethodKey(allRows[0]);
  const keys = methodsIn(rows);
  return keys.length > 1 ? EVERY_CATEGORY : keys[0] || "All";
}

/**
 * Default harvest season: the newest one with rows for individual units (some agencies publish only a
 * statewide total at first). When that season is reported only by hunt code but the season before it
 * was reported mostly by unit (CPW switched in 2025), the newest season reported by unit is used, so
 * the default view lines up with the earlier years. `byHuntInstead` is the hunt-code season passed over.
 */
export function defaultHarvestYear(rows: HarvestRecord[]): { year: number | undefined; byHuntInstead: number | null } {
  const all = years(rows);
  const unitYears = all.filter((y) => rows.some((r) => r.year === y && isRealUnit(r.unit)));
  if (!unitYears.length) return { year: all[0], byHuntInstead: null };
  const huntShare = (y: number) => {
    const inYear = rows.filter((r) => r.year === y && isRealUnit(r.unit));
    return inYear.filter((r) => r.hunt).length / inYear.length;
  };
  const [newest, before] = unitYears;
  if (before !== undefined && huntShare(newest) === 1 && huntShare(before) < 0.5) return { year: before, byHuntInstead: newest };
  return { year: newest, byHuntInstead: null };
}

const isWhole = (r: HarvestRecord) => (!r.sex || r.sex === "all") && (!r.residency || r.residency === "all");

/**
 * Per unit (and hunt, when reported by hunt): the whole-unit rows (no sex/residency split),
 * or the split rows when that unit only has split rows.
 */
export function headlineHarvestRows(rows: HarvestRecord[]): HarvestRecord[] {
  const groups = new Map<string, HarvestRecord[]>();
  for (const r of rows) {
    const k = `${r.unit}|${r.hunt || ""}`;
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const out: HarvestRecord[] = [];
  for (const g of groups.values()) {
    const whole = g.filter(isWhole);
    out.push(...(whole.length ? whole : g));
  }
  return out;
}

export function successOf(r: HarvestRecord): number | null {
  if (r.successPct != null) return r.successPct;
  if (r.hunters && r.harvest != null) return (100 * r.harvest) / r.hunters;
  return null;
}

/** Placeholder unit ids for hunts that span several units (e.g. CPW 2025 OTC codes use "000"). */
export function isRealUnit(unit: string): boolean {
  return unit !== "Statewide" && !/^0+$/.test(unit);
}

/**
 * Comparable unit id: agencies write the same unit differently across reports
 * ("061" vs "61", "Unit 1" vs "01", "Mountain Goat Unit 2-1" vs "2-1").
 */
/**
 * Alaska units with no subunits. ADF&G harvest reports write them "08Z" while the draw supplements write "8";
 * for units that do have subunits (e.g. 13Z) the Z means "subunit not reported", so those stay distinct.
 */
const AK_WHOLE_UNITS = new Set(["2", "3", "4", "7", "8", "10", "11", "12", "18", "23"]);

export function canonicalUnit(unit: string): string {
  return unit
    .trim()
    .replace(/^(mountain goat unit|deer management unit|hunt area|hunting district|unit|gmu|hd)\s+/i, "")
    .replace(/^0+(?=\d)/, "")
    .toUpperCase()
    .replace(/^(\d+)Z$/, (code, n: string) => (AK_WHOLE_UNITS.has(n) ? n : code));
}

export function sameUnit(a: string, b: string): boolean {
  return canonicalUnit(a) === canonicalUnit(b);
}

/** Agency name for a unit, matching ids written differently across reports. */
export function unitNameOf(names: Record<string, string> | undefined, unit: string): string | undefined {
  if (!names) return undefined;
  if (names[unit]) return names[unit];
  const c = canonicalUnit(unit);
  const key = Object.keys(names).find((k) => canonicalUnit(k) === c);
  return key ? names[key] : undefined;
}

/**
 * How well a hunt matches a search, for ordering results: 0 = a word is the hunt code or one of its
 * units ("61" finds unit 061), 1 = the code holds that number as its own digits (EE061O1A, not
 * EE161O1A), 2 = any other text match; null when a word isn't found at all.
 */
export function huntSearchRank(h: { code: string; units: string[]; description: string; seasonDates?: string }, query: string): number | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${h.code} ${h.units.join(" ")} ${h.description} ${h.seasonDates || ""}`.toLowerCase();
  if (!words.every((w) => hay.includes(w))) return null;
  let rank = 2;
  for (const w of words) {
    if (h.code.toLowerCase() === w || h.units.some((u) => sameUnit(u, w))) return 0;
    if (/^\d+$/.test(w) && new RegExp(`(^|\\D)0*${w}(\\D|$)`).test(h.code)) rank = 1;
  }
  return rank;
}
