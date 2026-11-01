// "Where can I draw?" — pure classification of one state's latest draw results
// against a member's residency and points. Client-safe and dependency-light so it
// can be unit tested with `node --experimental-strip-types` (tests/shortlist-core.test.ts).
//
// Nothing here estimates or predicts. Every figure is read from an agency row or is
// simple arithmetic on its counts (drawn ÷ applicants), and each hunt says which.
import type { DrawRecord, HarvestRecord, Method, SexClass } from "@/data/agency/schema";
import {
  drawStats,
  harvestMethodKey,
  headlineHarvestRows,
  isRealUnit,
  minPointsDrawn,
  oddsAtPoints,
  oddsOf,
  sameUnit,
  successOf,
  type DrawResidency,
  type PointOdds,
} from "./agency-view";

/**
 * - drew-at-points: the agency's point table shows applicants at exactly your level, and some drew.
 * - min-at-or-below: no applicants at your exact level were published, but the lowest point level drawn was at or below yours.
 * - points-unknown: points matter, but the agency publishes no point table or minimum for this hunt.
 * - stretch: not drawn at your level, but the lowest point level drawn was no more than 2 above yours.
 * - random: points don't affect this draw; ranked by the pool's overall odds.
 * - no-points-entered: points matter but you didn't enter any for this state; ranked by overall odds.
 */
export type HuntStatus = "drew-at-points" | "min-at-or-below" | "points-unknown" | "stretch" | "random" | "no-points-entered";

export type ExcludedReason = "no-figures" | "not-drawn" | "not-drawn-at-level";

/** How far above your points a hunt's lowest drawn level may be to count as a stretch. */
export const STRETCH_POINTS = 2;
export const MAX_HUNTS_PER_STATE = 25;

export interface HarvestPick {
  year: number;
  unit: string;
  hunt?: string;
  /** Method / license type as the agency labels the row. */
  label: string;
  successPct: number;
  /** True when the agency published hunters and harvest but not a success rate, so it's harvest ÷ hunters. */
  computed: boolean;
  hunters: number | null;
  harvest: number | null;
  /** "hunt" when the agency reports harvest for this exact hunt code, else "unit". */
  matchedBy: "hunt" | "unit";
  sourceId: string;
}

export interface ShortlistHunt {
  huntCode: string;
  year: number;
  description: string;
  units: string[];
  method?: Method;
  methodLabel?: string;
  sex?: SexClass;
  seasonDates?: string;
  /** Which applications the counts reflect. */
  choice: "first" | "all";
  /** Applicant pool the figures come from; "total" when the agency reports one combined pool. */
  pool: DrawResidency | "total";
  quota: number | null;
  /** True when the pool has no quota of its own and `quota` is the agency's total for the hunt. */
  quotaIsTotal: boolean;
  applicants: number | null;
  drawn: number | null;
  /** Overall odds for the pool, percent. */
  odds: number | null;
  /** True when odds = drawn ÷ applicants rather than a rate the agency printed. */
  oddsComputed: boolean;
  /** Lowest point level anyone in this pool drew at (points-matter draws only). */
  minPoints: number | null;
  /** Applicants and drawn at exactly the member's point level, from the agency's point table. */
  atPoints: (PointOdds & { points: number }) | null;
  status: HuntStatus;
  /** The odds used for sorting: at-your-points when published, else the pool's overall odds. */
  rankOdds: number | null;
  harvest: HarvestPick | null;
  note?: string;
  sourceId: string;
}

export interface ShortlistCounts {
  /** Distinct hunts in the results year. */
  hunts: number;
  drewAtPoints: number;
  minAtOrBelow: number;
  pointsUnknown: number;
  /** Stretch hunts found (shown only when the member asks for them). */
  stretch: number;
  /** Ranked by overall odds (random draws, or no points entered). */
  ranked: number;
  notDrawnAtLevel: number;
  notDrawn: number;
  /** No figures published for the member's applicant pool. */
  noFigures: number;
}

export interface ClassifiedState {
  /** Latest year with published draw counts, or null when the table has none. */
  drawYear: number | null;
  /** A newer year in the table that has quotas but no applicant/drawn counts yet. */
  newerYearWithoutResults: number | null;
  /** The agency published applicants by point level for at least one hunt that year. */
  hasPointTable: boolean;
  /** At least one hunt that year has a lowest-point-level-drawn figure. */
  hasMinPoints: boolean;
  counts: ShortlistCounts;
  /** Every hunt that made the list, best first (callers trim to MAX_HUNTS_PER_STATE). */
  hunts: ShortlistHunt[];
}

const hasCounts = (r: DrawRecord) =>
  [r.resident, r.nonresident, r.total].some((s) => !!s && (s.applicants != null || s.drawn != null)) ||
  (r.byPoints?.length ?? 0) > 0;

/** Latest draw year that has applicant or drawn counts (a year with only quotas isn't a result yet). */
export function resultsYear(rows: DrawRecord[]): { year: number | null; newer: number | null } {
  let latest: number | null = null;
  let withCounts: number | null = null;
  for (const r of rows) {
    if (latest === null || r.year > latest) latest = r.year;
    if (hasCounts(r) && (withCounts === null || r.year > withCounts)) withCounts = r.year;
  }
  return { year: withCounts, newer: latest !== null && withCounts !== null && latest > withCounts ? latest : null };
}

/** One row per hunt code for the year, preferring the agency's first-choice figures. */
export function huntsForYear(rows: DrawRecord[], year: number): DrawRecord[] {
  const byCode = new Map<string, DrawRecord>();
  for (const r of rows) {
    if (r.year !== year) continue;
    const cur = byCode.get(r.huntCode);
    if (!cur || (cur.choice !== "first" && r.choice === "first")) byCode.set(r.huntCode, r);
  }
  return Array.from(byCode.values());
}

export type Classified = { hunt: ShortlistHunt } | { excluded: ExcludedReason };

/** Classify one hunt for a member. `points` is null when they entered none for this state. */
export function classifyHunt(r: DrawRecord, residency: DrawResidency, pointsMatter: boolean, points: number | null): Classified {
  const { stats, pool } = drawStats(r, residency);
  if (!stats) return { excluded: "no-figures" };
  const odds = oddsOf(stats);
  const minPoints = pointsMatter ? minPointsDrawn(r, residency) : null;
  const drawnNone = stats.drawn === 0 || (odds !== null && odds <= 0);

  const make = (status: HuntStatus, rankOdds: number | null, atPoints: ShortlistHunt["atPoints"] = null): { hunt: ShortlistHunt } => ({
    hunt: {
      huntCode: r.huntCode,
      year: r.year,
      description: r.description,
      units: r.units,
      method: r.method,
      methodLabel: r.methodLabel,
      sex: r.sex,
      seasonDates: r.seasonDates,
      choice: r.choice,
      pool,
      quota: stats.quota ?? (pool !== "total" ? r.total?.quota : null) ?? null,
      quotaIsTotal: stats.quota == null && pool !== "total" && r.total?.quota != null,
      applicants: stats.applicants ?? null,
      drawn: stats.drawn ?? null,
      odds,
      oddsComputed: odds !== null && (stats.oddsPct == null || stats.oddsComputed === true),
      minPoints,
      atPoints,
      status,
      rankOdds,
      harvest: null,
      note: r.note,
      sourceId: r.sourceId,
    },
  });

  if (!pointsMatter || points === null) {
    if (odds === null && minPoints === null) return { excluded: "no-figures" };
    if (drawnNone) return { excluded: "not-drawn" };
    return make(pointsMatter ? "no-points-entered" : "random", odds);
  }

  const hasTable = (r.byPoints?.length ?? 0) > 0;
  const at = hasTable ? oddsAtPoints(r, residency, points) : null;
  const atPoints = at ? { ...at, points } : null;

  if (atPoints && atPoints.drawn > 0) return make("drew-at-points", atPoints.pct, atPoints);
  if (!atPoints && minPoints !== null && minPoints <= points) return make("min-at-or-below", odds);
  if (!atPoints && !hasTable && minPoints === null) {
    if (odds === null) return { excluded: "no-figures" };
    if (drawnNone) return { excluded: "not-drawn" };
    return make("points-unknown", odds);
  }
  // Published, and not drawn at the member's level.
  if (minPoints !== null && minPoints <= points + STRETCH_POINTS) return make("stretch", odds, atPoints);
  if (!atPoints && minPoints === null && odds === null) return { excluded: "no-figures" };
  if (drawnNone) return { excluded: "not-drawn" };
  return { excluded: "not-drawn-at-level" };
}

const TIER: Record<HuntStatus, number> = {
  "drew-at-points": 0,
  "min-at-or-below": 0,
  random: 0,
  "no-points-entered": 0,
  "points-unknown": 1,
  stretch: 2,
};

/** Licenses behind the ranked odds: drawn at your level when that's what's ranked, else drawn in the pool. */
const evidence = (h: ShortlistHunt) => (h.status === "drew-at-points" && h.atPoints ? h.atPoints.drawn : (h.drawn ?? -1));

/**
 * Hunts drawn at your level first, then hunts without point data, then stretch hunts; each by odds,
 * high to low, and on equal odds the one with more licenses drawn (2 of 2 ahead of 1 of 1).
 */
export function compareHunts(a: ShortlistHunt, b: ShortlistHunt): number {
  return (
    TIER[a.status] - TIER[b.status] ||
    (b.rankOdds ?? -1) - (a.rankOdds ?? -1) ||
    evidence(b) - evidence(a) ||
    (b.quota ?? -1) - (a.quota ?? -1) ||
    a.huntCode.localeCompare(b.huntCode, "en", { numeric: true })
  );
}

export interface ClassifyStateInput {
  rows: DrawRecord[];
  residency: DrawResidency;
  pointsMatter: boolean;
  points: number | null;
  includeStretch: boolean;
}

export function classifyState({ rows, residency, pointsMatter, points, includeStretch }: ClassifyStateInput): ClassifiedState {
  const { year, newer } = resultsYear(rows);
  const counts: ShortlistCounts = {
    hunts: 0,
    drewAtPoints: 0,
    minAtOrBelow: 0,
    pointsUnknown: 0,
    stretch: 0,
    ranked: 0,
    notDrawnAtLevel: 0,
    notDrawn: 0,
    noFigures: 0,
  };
  if (year === null) return { drawYear: null, newerYearWithoutResults: null, hasPointTable: false, hasMinPoints: false, counts, hunts: [] };

  const yearRows = huntsForYear(rows, year);
  counts.hunts = yearRows.length;
  const hunts: ShortlistHunt[] = [];
  for (const r of yearRows) {
    const c = classifyHunt(r, residency, pointsMatter, points);
    if ("excluded" in c) {
      if (c.excluded === "no-figures") counts.noFigures++;
      else if (c.excluded === "not-drawn") counts.notDrawn++;
      else counts.notDrawnAtLevel++;
      continue;
    }
    const s = c.hunt.status;
    if (s === "drew-at-points") counts.drewAtPoints++;
    else if (s === "min-at-or-below") counts.minAtOrBelow++;
    else if (s === "points-unknown") counts.pointsUnknown++;
    else if (s === "stretch") counts.stretch++;
    else counts.ranked++;
    if (s === "stretch" && !includeStretch) continue;
    hunts.push(c.hunt);
  }
  hunts.sort(compareHunts);
  return {
    drawYear: year,
    newerYearWithoutResults: newer,
    hasPointTable: pointsMatter && yearRows.some((r) => (r.byPoints?.length ?? 0) > 0),
    hasMinPoints: pointsMatter && yearRows.some((r) => minPointsDrawn(r, residency) !== null),
    counts,
    hunts,
  };
}

/** Keep the preferred rows when at least one matches; otherwise leave the list as is. */
function prefer<T>(rows: T[], pick: (r: T) => boolean): T[] {
  const kept = rows.filter(pick);
  return kept.length ? kept : rows;
}

/**
 * The unit's latest harvest success for a single-unit hunt: the agency's row for this exact hunt
 * code when it reports harvest by hunt, else the unit's whole-unit row (all methods when published).
 * Returns null rather than guessing when the rows don't narrow to one.
 */
export function pickHarvest(rows: HarvestRecord[], hunt: Pick<DrawRecord, "huntCode" | "units" | "method" | "sex">, residency: DrawResidency): HarvestPick | null {
  if (hunt.units.length !== 1 || !isRealUnit(hunt.units[0])) return null;
  const unit = hunt.units[0];
  const forUnit = rows.filter((r) => isRealUnit(r.unit) && sameUnit(r.unit, unit) && successOf(r) !== null);
  if (!forUnit.length) return null;
  const year = Math.max(...forUnit.map((r) => r.year));
  const head = headlineHarvestRows(forUnit.filter((r) => r.year === year));

  const exact = head.filter((r) => r.hunt === hunt.huntCode);
  let c = exact.length ? exact : head.filter((r) => !r.hunt);
  if (!c.length) return null;
  c = prefer(c, (r) => !r.residency || r.residency === "all");
  c = prefer(c, (r) => r.residency === residency || !r.residency || r.residency === "all");
  c = prefer(c, (r) => !r.sex || r.sex === "all" || r.sex === hunt.sex);
  c = prefer(c, (r) => r.method === "all");
  if (hunt.method) c = prefer(c, (r) => r.method === hunt.method);
  if (c.length !== 1) return null;

  const r = c[0];
  return {
    year,
    unit: r.unit,
    hunt: r.hunt,
    label: harvestMethodKey(r),
    successPct: successOf(r)!,
    computed: r.successPct == null || r.successComputed === true,
    hunters: r.hunters,
    harvest: r.harvest,
    matchedBy: exact.length ? "hunt" : "unit",
    sourceId: r.sourceId,
  };
}
