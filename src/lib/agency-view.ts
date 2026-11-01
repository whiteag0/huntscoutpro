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

/** Group draw rows by hunt code across years, newest first. */
export function drawHistory(rows: DrawRecord[]): Map<string, DrawRecord[]> {
  const m = new Map<string, DrawRecord[]>();
  for (const r of rows) {
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
