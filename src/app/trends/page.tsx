"use client";

import { useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import {
  Species,
  Season,
  Sex,
  Residency,
  YearData,
  SPECIES_LABELS,
  SEASON_LABELS,
  SEX_LABELS,
  SEX_OPTIONS,
  SPECIES_SEASONS,
  StateConfig,
} from "@/data/types";
import { getAllStates, getSpeciesUnits } from "@/data/hunt-data";
import type { HuntUnit } from "@/data/types";
import Link from "next/link";
import { DemoGate } from "@/components/DemoGate";
import { DataDisclaimer } from "@/components/DataDisclaimer";

const ALL_SPECIES: Species[] = [
  "elk",
  "mule-deer",
  "whitetail",
  "pronghorn",
  "moose",
  "bear",
  "sheep",
  "goat",
  "lion",
  "turkey",
];

const COLORS = [
  "#2d5016", "#c4651a", "#2d7a3a", "#8b4513", "#4a7c59",
  "#b8860b", "#6b4423", "#556b2f", "#a0522d", "#3c6e47",
  "#2e8b57", "#cd853f", "#6b8e23", "#bc8f8f", "#228b22",
];

/** Lines drawn by default (most-applied-for hunt codes). */
const DEFAULT_CHART_COUNT = 10;
/** Hard cap so the chart stays readable and every line gets its own color. */
const MAX_CHART_LINES = COLORS.length;

const DEFAULT_STATE_SLUG = "colorado";

type Metric = "minPoints" | "successRate" | "tags";

interface LabeledUnit {
  unit: HuntUnit;
  /** Unique within the current result set (hunt codes can repeat across regions). */
  key: string;
  label: string;
}

function getMetricValue(yd: YearData, metric: Metric, residency: Residency): number {
  if (metric === "minPoints") {
    return residency === "resident" ? yd.minPointsResident : yd.minPointsNonresident;
  }
  if (metric === "successRate") return yd.successRate;
  return yd.totalTags;
}

/**
 * Give every unit a unique key and a readable label. The same hunt code / unit
 * number can appear in more than one region, so disambiguate by region (and a
 * counter as a last resort) instead of letting chart lines and rows collide.
 */
function labelUnits(units: HuntUnit[], unitSystemName: string): LabeledUnit[] {
  const gmuCounts = new Map<string, number>();
  for (const u of units) gmuCounts.set(u.gmu, (gmuCounts.get(u.gmu) || 0) + 1);

  const seenKeys = new Map<string, number>();
  const seenLabels = new Map<string, number>();
  return units.map((unit) => {
    const keyBase = `${unit.huntCode}|${unit.region}`;
    const keyN = (seenKeys.get(keyBase) || 0) + 1;
    seenKeys.set(keyBase, keyN);

    let label = `${unitSystemName} ${unit.gmu}`;
    if ((gmuCounts.get(unit.gmu) || 0) > 1) label += ` (${unit.region})`;
    const labelN = (seenLabels.get(label) || 0) + 1;
    seenLabels.set(label, labelN);
    if (labelN > 1) label += ` #${labelN}`;

    return { unit, key: keyN > 1 ? `${keyBase}|${keyN}` : keyBase, label };
  });
}

export default function TrendsPage() {
  const allStates = useMemo(() => {
    try {
      return getAllStates();
    } catch {
      return [] as StateConfig[];
    }
  }, []);

  const [selectedState, setSelectedState] = useState(
    () =>
      allStates.find((s) => s.slug === DEFAULT_STATE_SLUG)?.slug ??
      allStates[0]?.slug ??
      ""
  );
  const [species, setSpecies] = useState<Species>("elk");
  const [season, setSeason] = useState<Season>("rifle");
  const [sex, setSex] = useState<Sex>("bull");
  const [residency, setResidency] = useState<Residency>("resident");
  const [userPoints, setUserPoints] = useState(5);
  const [metric, setMetric] = useState<Metric>("minPoints");
  // null = automatic selection (most-applied-for units); otherwise the user's picks
  const [chartPicks, setChartPicks] = useState<string[] | null>(null);

  const currentState = useMemo(
    () => allStates.find((s) => s.slug === selectedState),
    [allStates, selectedState]
  );
  const unitSystemName = currentState?.unitSystemName || "GMU";

  // Derive the valid options and the "effective" selections from raw state
  // (no setState during render). Only species this state has are offered, and
  // sex/season fall back to the first valid option when the current one doesn't apply.
  const {
    stateSpecies,
    effectiveSpecies,
    validSexes,
    validSeasons,
    effectiveSex,
    effectiveSeason,
  } = useMemo(() => {
    const stateSpecies = currentState
      ? ALL_SPECIES.filter((s) => currentState.species.includes(s))
      : ALL_SPECIES;
    const effectiveSpecies: Species = stateSpecies.includes(species)
      ? species
      : stateSpecies[0] || "elk";
    const validSexes = SEX_OPTIONS[effectiveSpecies] || [];
    const validSeasons =
      SPECIES_SEASONS[effectiveSpecies] || (["rifle", "archery", "muzzleloader"] as Season[]);
    const effectiveSex: Sex = validSexes.includes(sex) ? sex : validSexes[0] || "either";
    const effectiveSeason: Season = validSeasons.includes(season)
      ? season
      : validSeasons[0] || "rifle";
    return { stateSpecies, effectiveSpecies, validSexes, validSeasons, effectiveSex, effectiveSeason };
  }, [currentState, species, sex, season]);

  // Units for this species/season/sex combination in the selected state
  const matchingUnits = useMemo(() => {
    if (!selectedState) return [] as HuntUnit[];
    try {
      return getSpeciesUnits(selectedState, effectiveSpecies).filter(
        (u) => u.season === effectiveSeason && u.sex === effectiveSex
      );
    } catch {
      return [] as HuntUnit[];
    }
  }, [effectiveSpecies, effectiveSeason, effectiveSex, selectedState]);

  const labeledUnits = useMemo(
    () => labelUnits(matchingUnits, unitSystemName),
    [matchingUnits, unitSystemName]
  );

  const years = useMemo(
    () => matchingUnits[0]?.years.map((y) => y.year) || [],
    [matchingUnits]
  );

  // Default chart: the most-applied-for hunt codes in the latest year
  const defaultChartKeys = useMemo(
    () =>
      [...labeledUnits]
        .sort(
          (a, b) =>
            (b.unit.years.at(-1)?.totalApplicants ?? 0) -
            (a.unit.years.at(-1)?.totalApplicants ?? 0)
        )
        .slice(0, DEFAULT_CHART_COUNT)
        .map((lu) => lu.key),
    [labeledUnits]
  );

  const activeChartKeys = chartPicks ?? defaultChartKeys;
  const chartUnits = useMemo(
    () => labeledUnits.filter((lu) => activeChartKeys.includes(lu.key)),
    [labeledUnits, activeChartKeys]
  );
  const isCustomChart = chartPicks !== null;

  const chartData = useMemo(() => {
    return years.map((year) => {
      const row: Record<string, number> = { year };
      chartUnits.forEach((lu, i) => {
        const yd = lu.unit.years.find((y) => y.year === year);
        if (yd) row[`u${i}`] = getMetricValue(yd, metric, residency);
      });
      return row;
    });
  }, [chartUnits, years, residency, metric]);

  // Filter changes produce a new unit list, so go back to the automatic chart selection.
  function resetChartPicks() {
    setChartPicks(null);
  }

  function toggleChartUnit(key: string) {
    const base = chartPicks ?? defaultChartKeys;
    if (base.includes(key)) {
      setChartPicks(base.filter((k) => k !== key));
    } else if (base.length < MAX_CHART_LINES) {
      setChartPicks([...base, key]);
    }
  }

  // Build unit link
  function getUnitLink(unit: { species: string; gmu: string }) {
    if (selectedState) {
      return `/states/${selectedState}/units/${encodeURIComponent(unit.gmu)}?species=${unit.species}`;
    }
    return `/unit?species=${unit.species}&gmu=${unit.gmu}`;
  }

  const metricTitle =
    metric === "minPoints"
      ? `Min Points to Draw (${residency === "resident" ? "Resident" : "Non-Resident"})`
      : metric === "successRate"
      ? "Success Rate %"
      : "Tags Available";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <nav className="text-sm text-muted-foreground mb-1">
        {currentState ? (
          <>
            <Link href="/states" className="text-primary hover:underline">
              States
            </Link>
            {" / "}
            <Link
              href={`/states/${currentState.slug}`}
              className="text-primary hover:underline"
            >
              {currentState.name}
            </Link>
            {" / "}
          </>
        ) : (
          <>
            <Link href="/" className="text-primary hover:underline">
              Explorer
            </Link>
            {" / "}
          </>
        )}
        <span className="text-foreground font-medium">Trends</span>
      </nav>
      <h1 className="text-3xl font-bold text-foreground mb-2">
        Point Creep & Trend Analyzer
      </h1>
      <p className="text-muted-foreground mb-6 max-w-2xl">
        Visualize how preference point requirements, success rates, and tag
        quotas have changed for each unit over time. Identify units getting
        harder or easier to draw.
      </p>

      {/* Controls */}
      <div className="bg-card border border-border rounded-xl p-5 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-4">
          {/* State Selector */}
          {allStates.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">
                State
              </label>
              <select
                value={selectedState}
                onChange={(e) => {
                  setSelectedState(e.target.value);
                  resetChartPicks();
                }}
                className="w-full px-2 py-1.5 border border-border rounded bg-background text-sm"
              >
                {allStates.map((s: StateConfig) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Species
            </label>
            <select
              value={effectiveSpecies}
              onChange={(e) => {
                const s = e.target.value as Species;
                setSpecies(s);
                if (!SEX_OPTIONS[s].includes(effectiveSex)) {
                  setSex(SEX_OPTIONS[s][0]);
                }
                if (!SPECIES_SEASONS[s].includes(effectiveSeason)) {
                  setSeason(SPECIES_SEASONS[s][0]);
                }
                resetChartPicks();
              }}
              className="w-full px-2 py-1.5 border border-border rounded bg-background text-sm"
            >
              {stateSpecies.map((s) => (
                <option key={s} value={s}>
                  {SPECIES_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Season
            </label>
            <select
              value={effectiveSeason}
              onChange={(e) => {
                setSeason(e.target.value as Season);
                resetChartPicks();
              }}
              className="w-full px-2 py-1.5 border border-border rounded bg-background text-sm"
            >
              {validSeasons.map((s) => (
                <option key={s} value={s}>
                  {SEASON_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Sex
            </label>
            <select
              value={effectiveSex}
              onChange={(e) => {
                setSex(e.target.value as Sex);
                resetChartPicks();
              }}
              className="w-full px-2 py-1.5 border border-border rounded bg-background text-sm"
            >
              {validSexes.map((s) => (
                <option key={s} value={s}>
                  {SEX_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Residency
            </label>
            <select
              value={residency}
              onChange={(e) => setResidency(e.target.value as Residency)}
              className="w-full px-2 py-1.5 border border-border rounded bg-background text-sm"
            >
              <option value="resident">Resident</option>
              <option value="nonresident">Non-Resident</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Metric
            </label>
            <select
              value={metric}
              onChange={(e) => setMetric(e.target.value as Metric)}
              className="w-full px-2 py-1.5 border border-border rounded bg-background text-sm"
            >
              <option value="minPoints">Min Points to Draw</option>
              <option value="successRate">Success Rate %</option>
              <option value="tags">Tags Available</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1">
              Your Points
            </label>
            <input
              type="number"
              min={0}
              max={25}
              value={userPoints}
              onChange={(e) => setUserPoints(Math.max(0, Math.min(25, parseInt(e.target.value) || 0)))}
              className="w-full px-2 py-1.5 border border-border rounded text-center font-bold bg-background text-sm"
            />
          </div>
          <div className="flex items-end">
            <div className="text-sm text-muted-foreground">
              {matchingUnits.length} hunt codes
            </div>
          </div>
        </div>
      </div>

      {selectedState && (
        <DataDisclaimer state={selectedState} species={effectiveSpecies} />
      )}

      {matchingUnits.length > 0 ? (
        <DemoGate feature="trend data">
          {/* Chart */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-4">
              <div>
                <h2 className="font-bold text-lg">
                  {metricTitle} &mdash; {SPECIES_LABELS[effectiveSpecies]} / {SEASON_LABELS[effectiveSeason]} / {SEX_LABELS[effectiveSex]}
                  {currentState && ` in ${currentState.name}`}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {isCustomChart
                    ? `Charting ${chartUnits.length} of ${matchingUnits.length} hunt codes you picked.`
                    : `Charting the ${chartUnits.length} hunt codes with the most applicants.`}{" "}
                  Use the Chart column in the table below to choose up to {MAX_CHART_LINES}.
                </p>
              </div>
              {isCustomChart && (
                <button
                  type="button"
                  onClick={resetChartPicks}
                  className="text-sm text-primary hover:underline whitespace-nowrap cursor-pointer"
                >
                  Reset to most applied-for
                </button>
              )}
            </div>
            {chartUnits.length > 0 ? (
              <ResponsiveContainer width="100%" height={500}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d4ccc4" />
                  <XAxis dataKey="year" stroke="#6b6560" />
                  <YAxis
                    stroke="#6b6560"
                    label={{
                      value: metric === "minPoints" ? "Points" : metric === "successRate" ? "%" : "Tags",
                      angle: -90,
                      position: "insideLeft",
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #d4ccc4",
                      borderRadius: "8px",
                      maxHeight: "300px",
                      overflow: "auto",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  {metric === "minPoints" && (
                    <ReferenceLine
                      y={userPoints}
                      stroke="#c4651a"
                      strokeWidth={2}
                      strokeDasharray="8 4"
                      label={{
                        value: `Your Points (${userPoints})`,
                        fill: "#c4651a",
                        fontSize: 13,
                        fontWeight: "bold",
                      }}
                    />
                  )}
                  {chartUnits.map((lu, i) => (
                    <Line
                      key={lu.key}
                      type="monotone"
                      dataKey={`u${i}`}
                      stroke={COLORS[i % COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      name={lu.label}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-16 text-center text-muted-foreground">
                No units selected. Tick the Chart box next to a unit in the table below to plot it.
              </div>
            )}
          </div>

          {/* Summary Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden mt-6">
            <div className="p-4 border-b border-border">
              <h2 className="font-bold text-lg">
                Unit Summary &mdash; Sorted by{" "}
                {metric === "minPoints" ? "Easiest to Draw" : metric === "successRate" ? "Highest Success" : "Most Tags"}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase w-14">
                      Chart
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">
                      {unitSystemName}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Region</th>
                    {years.map((y) => (
                      <th key={y} className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase">
                        {y}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-center text-xs font-semibold text-muted-foreground uppercase">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...labeledUnits]
                    .sort((a, b) => {
                      const aLatest = a.unit.years.at(-1);
                      const bLatest = b.unit.years.at(-1);
                      if (!aLatest || !bLatest) return 0;
                      const av = getMetricValue(aLatest, metric, residency);
                      const bv = getMetricValue(bLatest, metric, residency);
                      return metric === "minPoints" ? av - bv : bv - av;
                    })
                    .map((lu) => {
                      const u = lu.unit;
                      const vals = u.years.map((y) => getMetricValue(y, metric, residency));
                      const first = vals[0] ?? 0;
                      const last = vals[vals.length - 1] ?? 0;
                      // Round to one decimal: success rates are 1-dp values and raw
                      // float subtraction would print e.g. 3.8999999999999986.
                      const trend = Math.round((last - first) * 10) / 10;
                      const trendLabel =
                        metric === "minPoints"
                          ? trend > 0
                            ? "Harder"
                            : trend < 0
                            ? "Easier"
                            : "Stable"
                          : trend > 0
                          ? "Improving"
                          : trend < 0
                          ? "Declining"
                          : "Stable";
                      const trendColor =
                        metric === "minPoints"
                          ? trend > 0
                            ? "text-danger"
                            : trend < 0
                            ? "text-success"
                            : "text-muted-foreground"
                          : trend > 0
                          ? "text-success"
                          : trend < 0
                          ? "text-danger"
                          : "text-muted-foreground";
                      const charted = activeChartKeys.includes(lu.key);
                      const chartFull = !charted && activeChartKeys.length >= MAX_CHART_LINES;

                      return (
                        <tr key={lu.key} className="hover:bg-muted/20 transition">
                          <td className="px-4 py-2">
                            <input
                              type="checkbox"
                              checked={charted}
                              disabled={chartFull}
                              onChange={() => toggleChartUnit(lu.key)}
                              aria-label={`Show ${lu.label} on chart`}
                              title={chartFull ? `Up to ${MAX_CHART_LINES} units can be charted` : "Show on chart"}
                              className="rounded accent-primary"
                            />
                          </td>
                          <td className="px-4 py-2 font-bold">
                            <Link
                              href={getUnitLink(u)}
                              className="text-primary hover:underline"
                            >
                              {u.gmu}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">{u.region}</td>
                          {vals.map((v, i) => (
                            <td
                              key={i}
                              className={`px-4 py-2 text-center ${
                                metric === "minPoints" && userPoints >= v
                                  ? "text-success font-bold"
                                  : ""
                              }`}
                            >
                              {metric === "successRate" ? `${v}%` : v}
                            </td>
                          ))}
                          <td className={`px-4 py-2 text-center font-semibold ${trendColor}`}>
                            {trend > 0 ? "+" : ""}
                            {metric === "successRate" ? `${trend}%` : trend} {trendLabel}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </DemoGate>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          {currentState
            ? `No ${SPECIES_LABELS[effectiveSpecies]} ${SEASON_LABELS[effectiveSeason].toLowerCase()} / ${SEX_LABELS[effectiveSex].toLowerCase()} hunt codes in ${currentState.name}. Try a different season or sex.`
            : "No data available for this combination. Try adjusting your filters."}
        </div>
      )}
    </div>
  );
}
