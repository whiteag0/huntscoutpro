// The free preview of an agency table: which published rows a non-member can read,
// and the true counts the gate quotes. Pure (no data imports) so it can be tested;
// the API route reads the table and passes the rows in.
import type { DrawRecord, DrawResidencyStats, HarvestRecord } from "@/data/agency/schema";
import { EVERY_CATEGORY, defaultHarvestMethod, harvestMethodKey, harvestSeriesKey, headlineHarvestRows, isRealUnit, years } from "@/lib/agency-view";

/** Legible rows a signed-out or non-member visitor gets per table. */
export const PREVIEW_ROWS = 8;

export interface TablePreview<T> {
  preview: true;
  /**
   * Up to PREVIEW_ROWS rows from `year`, plus each one's previous published row, so
   * "prior year" columns show the agency's figure instead of a dash.
   */
  rows: T[];
  /** Rows in the whole table, every year. */
  total: number;
  /** Every year the table covers, newest first. Only `year` (and the prior rows) are in `rows`. */
  years: number[];
  /** The year the preview rows come from; null when the agency publishes no table. */
  year: number | null;
  /** What a member sees for `year` by default: hunt codes (draw) or rows in the default category (harvest). */
  yearTotal: number;
  /** How the preview rows were chosen, so the page can say so. */
  rankedBy: "applicants" | "quota" | "hunters" | "harvest" | null;
}

/** A published count for the whole hunt: the agency's total, else resident + nonresident when either is published. */
function huntCount(r: DrawRecord, key: keyof Pick<DrawResidencyStats, "applicants" | "quota">): number | null {
  const total = r.total?.[key];
  if (total != null) return total;
  const res = r.resident?.[key];
  const nr = r.nonresident?.[key];
  return res == null && nr == null ? null : (res ?? 0) + (nr ?? 0);
}

const desc = (a: number | null, b: number | null) => (b ?? -1) - (a ?? -1);

/** The newest row older than `r` with the same key, if the agency published one. */
function priorRows<T extends { year: number }>(all: T[], picked: T[], key: (r: T) => string): T[] {
  const want = new Map(picked.map((r) => [key(r), r.year]));
  const best = new Map<string, T>();
  for (const r of all) {
    const k = key(r);
    const y = want.get(k);
    if (y === undefined || r.year >= y) continue;
    const cur = best.get(k);
    if (!cur || r.year > cur.year) best.set(k, r);
  }
  return [...best.values()];
}

/**
 * Draw preview: the latest draw year's most-applied-for hunt codes (by quota when the agency
 * published no applicant counts that year). Where a hunt is listed once for first-choice and
 * once for all-choice applications, only the first-choice row is used.
 */
export function drawPreview(all: DrawRecord[], limit = PREVIEW_ROWS): TablePreview<DrawRecord> {
  const ys = years(all);
  const year = ys[0] ?? null;
  const latest = all.filter((r) => r.year === year);
  const byCode = new Map<string, DrawRecord>();
  for (const r of latest) {
    const cur = byCode.get(r.huntCode);
    if (!cur || (cur.choice !== "first" && r.choice === "first")) byCode.set(r.huntCode, r);
  }
  const hunts = [...byCode.values()];
  const rankedBy = hunts.some((r) => huntCount(r, "applicants") != null) ? "applicants" : hunts.some((r) => huntCount(r, "quota") != null) ? "quota" : null;
  const picked = hunts
    .sort((a, b) => (rankedBy ? desc(huntCount(a, rankedBy), huntCount(b, rankedBy)) : 0) || a.huntCode.localeCompare(b.huntCode, "en", { numeric: true }))
    .slice(0, limit);
  const key = (r: DrawRecord) => `${r.huntCode}|${r.choice}`;
  return {
    preview: true,
    rows: [...picked, ...priorRows(all, picked, key)],
    total: all.length,
    years: ys,
    year,
    yearTotal: hunts.length,
    rankedBy: picked.length ? rankedBy : null,
  };
}

/**
 * Harvest preview: the newest season with unit-level rows (the season a member's table opens on),
 * in the category a member sees by default, ranked by hunters (by harvest where the agency
 * reports no hunter counts).
 */
export function harvestPreview(all: HarvestRecord[], limit = PREVIEW_ROWS): TablePreview<HarvestRecord> {
  const ys = years(all);
  const year = ys.find((y) => all.some((r) => r.year === y && isRealUnit(r.unit))) ?? ys[0] ?? null;
  const yearRows = headlineHarvestRows(all.filter((r) => r.year === year));
  const method = defaultHarvestMethod(yearRows);
  const shown = method === EVERY_CATEGORY ? yearRows : yearRows.filter((r) => harvestMethodKey(r) === method);
  const units = shown.filter((r) => isRealUnit(r.unit));
  const pool = units.length ? units : shown;
  const rankedBy = pool.some((r) => r.hunters != null) ? "hunters" : pool.some((r) => r.harvest != null) ? "harvest" : null;
  const picked = pool
    .slice()
    .sort(
      (a, b) =>
        (rankedBy ? desc(a[rankedBy], b[rankedBy]) : 0) ||
        a.unit.localeCompare(b.unit, "en", { numeric: true }) ||
        (a.hunt || "").localeCompare(b.hunt || "")
    )
    .slice(0, limit);
  return {
    preview: true,
    rows: [...picked, ...priorRows(all, picked, harvestSeriesKey)],
    total: all.length,
    years: ys,
    year,
    yearTotal: shown.length,
    rankedBy: picked.length ? rankedBy : null,
  };
}

export interface PreviewCopyInput {
  kind: "draw" | "harvest";
  meta: Omit<TablePreview<unknown>, "preview" | "rows" | "total">;
  /** Preview rows on screen for meta.year (draw: hunt codes). */
  shown: number;
  stateName: string;
  /** Lower-case species label, e.g. "elk". */
  species: string;
  /** Agency short name, e.g. "CPW". */
  agency: string;
  unitTerm: string;
  /** The state also has the other table (harvest for draw, draw for harvest). */
  hasOther: boolean;
}

const n = (x: number) => x.toLocaleString("en-US");

/**
 * The line above a preview table and the gate's sentence about what it hides, from the
 * true counts in the preview response (never from the preview rows alone).
 */
export function previewCopy({ kind, meta, shown, stateName, species, agency, unitTerm, hasOther }: PreviewCopyInput): { caption: string; gate: string } {
  const { year, years: ys, yearTotal, rankedBy } = meta;
  const all = shown >= yearTotal;
  const span = ys.length > 1 ? `${ys[ys.length - 1]}–${ys[0]}` : String(ys[0] ?? "");
  const cited = `each figure cited to the ${agency} report it came from`;
  if (kind === "draw") {
    const caption = all
      ? `Free preview: ${shown === 1 ? "the only hunt code" : `all ${n(shown)} hunt codes`} in the ${year} draw.`
      : rankedBy === "applicants"
        ? `Free preview: the ${n(shown)} hunt codes with the most applicants overall in the ${year} draw.`
        : rankedBy === "quota"
          ? `Free preview: the ${n(shown)} hunt codes with the largest quotas in the ${year} draw (${agency} didn't publish applicant counts for ${year}).`
          : `Free preview: ${n(shown)} hunt codes from the ${year} draw.`;
    const gate = `Showing ${n(shown)} of ${n(yearTotal)} ${stateName} ${species} hunt codes in the ${year} draw. Pro shows every hunt code${ys.length > 1 ? ` in all ${ys.length} draw years (${span})` : ""}${hasOther ? `, plus harvest by ${unitTerm}` : ""}, ${cited}.`;
    return { caption, gate };
  }
  const caption = all
    ? `Free preview: ${shown === 1 ? "the only row" : `all ${n(shown)} rows`} for the ${year} season.`
    : rankedBy
      ? `Free preview: the ${n(shown)} rows with the most ${rankedBy} in the ${year} season.`
      : `Free preview: ${n(shown)} rows from the ${year} season.`;
  const gate = `Showing ${n(shown)} of ${n(yearTotal)} ${stateName} ${species} harvest rows for the ${year} season. Pro shows every row${ys.length > 1 ? ` in all ${ys.length} seasons (${span})` : ""}${hasOther ? ", plus the draw results by hunt code" : ""}, ${cited}.`;
  return { caption, gate };
}
