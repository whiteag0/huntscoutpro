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
  SPECIES_LABELS,
  SEASON_LABELS,
  SEX_LABELS,
  SEX_OPTIONS,
  SPECIES_SEASONS,
  StateConfig,
} from "@/data/types";
import { getAllStates, getStateBySlug, getSpeciesUnits } from "@/data/hunt-data";
import type { HuntUnit } from "@/data/types";
import Link from "next/link";

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

export default function TrendsPage() {
  const [species, setSpecies] = useState<Species>("elk");
  const [season, setSeason] = useState<Season>("rifle");
  const [sex, setSex] = useState<Sex>("bull");
  const [residency, setResidency] = useState<Residency>("resident");
  const [userPoints, setUserPoints] = useState(5);
  const [metric, setMetric] = useState<"minPoints" | "successRate" | "tags">("minPoints");
  const [selectedState, setSelectedState] = useState("");

  const allStates = useMemo(() => {
    try {
      return getAllStates();
    } catch {
      return [];
    }
  }, []);

  const currentState = useMemo(() => {
    if (!selectedState) return undefined;
    try {
      return getStateBySlug(selectedState);
    } catch {
      return undefined;
    }
  }, [selectedState]);

  // Determine which sex/season options are valid
  const validSexes = SEX_OPTIONS[species] || [];
  const validSeasons = SPECIES_SEASONS[species] || ["rifle", "archery", "muzzleloader"] as Season[];

  // If current sex/season is no longer valid after species change, reset
  const effectiveSex = validSexes.includes(sex) ? sex : validSexes[0] || "either";
  const effectiveSeason = validSeasons.includes(season) ? season : validSeasons[0] || "rifle";
  if (effectiveSex !== sex) setSex(effectiveSex);
  if (effectiveSeason !== season) setSeason(effectiveSeason);

  // Get unique units for this species/season/sex combination, filtered by state
  const matchingUnits = useMemo(() => {
    if (!selectedState) return [] as HuntUnit[];
    try {
      return getSpeciesUnits(selectedState, species).filter(
        (u) => u.season === effectiveSeason && u.sex === effectiveSex
      );
    } catch {
      return [] as HuntUnit[];
    }
  }, [species, effectiveSeason, effectiveSex, selectedState]);

  const years = matchingUnits[0]?.years.map((y: { year: number }) => y.year) || [];

  const chartData = useMemo(() => {
    return years.map((year: number) => {
      const row: Record<string, number | string> = { year };
      for (const u of matchingUnits) {
        const yd = u.years.find((y) => y.year === year);
        if (yd) {
          const label = `${currentState?.unitSystemName || "GMU"} ${u.gmu}`;
          switch (metric) {
            case "minPoints":
              row[label] = residency === "resident" ? yd.minPointsResident : yd.minPointsNonresident;
              break;
            case "successRate":
              row[label] = yd.successRate;
              break;
            case "tags":
              row[label] = yd.totalTags;
              break;
          }
        }
      }
      return row;
    });
  }, [matchingUnits, years, residency, metric, currentState]);

  const lineKeys = matchingUnits.map(
    (u) => `${currentState?.unitSystemName || "GMU"} ${u.gmu}`
  );

  // Build unit link
  function getUnitLink(unit: { species: string; gmu: string }) {
    if (selectedState) {
      return `/states/${selectedState}/units/${encodeURIComponent(unit.gmu)}?species=${unit.species}`;
    }
    return `/unit?species=${unit.species}&gmu=${unit.gmu}`;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <nav className="text-sm text-muted-foreground mb-1">
        {selectedState ? (
          <>
            <Link href="/states" className="text-primary hover:underline">
              States
            </Link>
            {" / "}
            <Link
              href={`/states/${selectedState}`}
              className="text-primary hover:underline"
            >
              {currentState?.name || selectedState}
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
        quotas have changed across all units over time. Identify units getting
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
                onChange={(e) => setSelectedState(e.target.value)}
                className="w-full px-2 py-1.5 border border-border rounded bg-background text-sm"
              >
                <option value="">All States</option>
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
              value={species}
              onChange={(e) => {
                const s = e.target.value as Species;
                setSpecies(s);
                if (!SEX_OPTIONS[s].includes(sex)) {
                  setSex(SEX_OPTIONS[s][0]);
                }
                if (!SPECIES_SEASONS[s].includes(season)) {
                  setSeason(SPECIES_SEASONS[s][0]);
                }
              }}
              className="w-full px-2 py-1.5 border border-border rounded bg-background text-sm"
            >
              {ALL_SPECIES.map((s) => (
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
              onChange={(e) => setSeason(e.target.value as Season)}
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
              onChange={(e) => setSex(e.target.value as Sex)}
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
              onChange={(e) => setMetric(e.target.value as "minPoints" | "successRate" | "tags")}
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
              {matchingUnits.length} units
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      {matchingUnits.length > 0 ? (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">
            {metric === "minPoints"
              ? `Min Points to Draw (${residency === "resident" ? "Resident" : "Non-Resident"})`
              : metric === "successRate"
              ? "Success Rate %"
              : "Tags Available"}{" "}
            &mdash; {SPECIES_LABELS[species]} / {SEASON_LABELS[effectiveSeason]} / {SEX_LABELS[effectiveSex]}
            {currentState && ` in ${currentState.name}`}
          </h2>
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
              {lineKeys.map((key, i) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name={key}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No data available for this combination. Try adjusting your filters.
        </div>
      )}

      {/* Summary Table */}
      {matchingUnits.length > 0 && (
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
                  <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">
                    {currentState?.unitSystemName || "GMU"}
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
                {[...matchingUnits]
                  .sort((a, b) => {
                    const aLatest = a.years.at(-1)!;
                    const bLatest = b.years.at(-1)!;
                    if (metric === "minPoints") {
                      const av = residency === "resident" ? aLatest.minPointsResident : aLatest.minPointsNonresident;
                      const bv = residency === "resident" ? bLatest.minPointsResident : bLatest.minPointsNonresident;
                      return av - bv;
                    }
                    if (metric === "successRate") return bLatest.successRate - aLatest.successRate;
                    return bLatest.totalTags - aLatest.totalTags;
                  })
                  .map((u) => {
                    const vals = u.years.map((y) => {
                      if (metric === "minPoints")
                        return residency === "resident" ? y.minPointsResident : y.minPointsNonresident;
                      if (metric === "successRate") return y.successRate;
                      return y.totalTags;
                    });
                    const first = vals[0];
                    const last = vals[vals.length - 1];
                    const trend = last - first;
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

                    return (
                      <tr key={u.huntCode} className="hover:bg-muted/20 transition">
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
      )}
    </div>
  );
}
