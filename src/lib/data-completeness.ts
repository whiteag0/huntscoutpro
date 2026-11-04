// What each state's agency publishes in its draw results, in plain words, from hunt counts
// made at build time (scripts/agency/build-index.mjs -> stats.generated.json "completeness").
// Client-safe and pure. Every figure is a count of published rows; nothing is estimated.

/** One species' latest draw with odds published (or its latest draw, when no year has odds). */
export interface DrawCompleteness {
  pointsMatter: boolean;
  /** Newest draw year with any odds published; null when the agency publishes none for this species. */
  drawYear: number | null;
  /** A later year in the data that has quotas or applicants but no odds yet. */
  newer: number | null;
  /** Hunt codes in that year (one per hunt, first-choice when both are published). */
  hunts: number;
  /** Hunts with odds for some applicant pool (a rate, or drawn and applicants). */
  odds: number;
  /** Hunts with odds for residents or nonresidents on their own, or a point table (split by residency). */
  split: number;
  /** Hunts with applicants and drawn by point level. */
  pointTable: number;
  /** Hunts with a lowest-points-drawn figure or a point table. */
  minPoints: number;
}

export interface CompletenessItem {
  label: string;
  value: string;
}

const n = (v: number) => v.toLocaleString("en-US");
const share = (part: number, whole: number, all: string, none: string) => (part >= whole ? all : part === 0 ? none : `${n(part)} of ${n(whole)} hunts`);

/** Short label/value lines for a state's cards and header; empty when the state has no draw tables. */
export function completenessSummary(bySpecies: Record<string, DrawCompleteness> | undefined): CompletenessItem[] {
  const list = Object.values(bySpecies || {}).filter((c) => c.hunts > 0);
  if (!list.length) return [];
  const sum = (rows: DrawCompleteness[], k: "hunts" | "odds" | "split" | "pointTable" | "minPoints") => rows.reduce((t, c) => t + c[k], 0);
  const hunts = sum(list, "hunts");
  const items: CompletenessItem[] = [];

  const years = list.map((c) => c.drawYear).filter((y): y is number => y !== null);
  const latest = years.length ? Math.max(...years) : null;
  const newer = Array.from(new Set(list.map((c) => c.newer).filter((y): y is number => y !== null && (latest === null || y > latest)))).sort((a, b) => a - b);
  items.push({
    label: "Latest draw odds",
    value: latest === null ? "not published" : `${latest}${newer.length ? ` (${newer.join(", ")} odds not published yet)` : ""}`,
  });

  const odds = sum(list, "odds");
  items.push({ label: "Overall draw odds", value: share(odds, hunts, "every hunt", "not published") });
  if (odds > 0 || sum(list, "pointTable") > 0) items.push({ label: "Odds by residency", value: share(sum(list, "split"), hunts, "resident and nonresident separately", "one combined pool") });

  const points = list.filter((c) => c.pointsMatter);
  if (points.length) {
    const ph = sum(points, "hunts");
    const table = sum(points, "pointTable");
    const min = sum(points, "minPoints");
    items.push({
      label: "Odds by point level",
      value: table > 0 ? share(table, ph, "every hunt", "not published") : min > 0 ? `lowest points drawn only (${share(min, ph, "every hunt", "")})` : "not published",
    });
  }
  return items;
}
