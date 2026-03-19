"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useMemo } from "react";
import Link from "next/link";
import { Species, Residency, SPECIES_LABELS, SEASON_LABELS, SEX_LABELS } from "@/data/types";
import { getUnitDetail } from "@/data/hunt-data";
import { HarvestChart, SuccessRateChart } from "@/components/HarvestChart";
import { PointCreepChart } from "@/components/PointCreepChart";
import { DrawOddsTable } from "@/components/DrawOddsTable";

function UnitDetailContent() {
  const searchParams = useSearchParams();
  const species = (searchParams.get("species") || "elk") as Species;
  const gmu = searchParams.get("gmu") || "1";
  const stateSlug = searchParams.get("state") || "colorado";
  const [residency, setResidency] = useState<Residency>("resident");
  const [userPoints, setUserPoints] = useState(3);

  const units = useMemo(() => getUnitDetail(stateSlug, species, gmu), [stateSlug, species, gmu]);

  if (units.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <p className="text-muted-foreground">Unit not found.</p>
        <Link href="/" className="text-primary hover:underline mt-4 inline-block">
          Back to Explorer
        </Link>
      </div>
    );
  }

  const region = units[0].region;
  const firstUnit = units[0];

  // Aggregate harvest data across all hunt codes for this GMU/species
  const aggregatedYears = firstUnit.years.map((y) => {
    const yearUnits = units.map((u) => u.years.find((uy) => uy.year === y.year)!);
    return {
      ...y,
      totalHarvest: yearUnits.reduce((sum, u) => sum + u.totalHarvest, 0),
      huntersAfield: yearUnits.reduce((sum, u) => sum + u.huntersAfield, 0),
      licensesIssued: yearUnits.reduce((sum, u) => sum + u.licensesIssued, 0),
      successRate: Math.round(
        (yearUnits.reduce((sum, u) => sum + u.successRate, 0) / yearUnits.length) * 10
      ) / 10,
    };
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <div className="text-sm text-muted-foreground mb-4">
        <Link href="/" className="text-primary hover:underline">Explorer</Link>
        {" / "}
        <span>{SPECIES_LABELS[species]}</span>
        {" / "}
        <span className="text-foreground font-medium">GMU {gmu}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            GMU {gmu} — {region}
          </h1>
          <p className="text-muted-foreground mt-1">
            {SPECIES_LABELS[species]} &middot; {units.length} hunt codes available
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">Residency:</label>
            <select
              value={residency}
              onChange={(e) => setResidency(e.target.value as Residency)}
              className="px-2 py-1 border border-border rounded bg-background text-sm"
            >
              <option value="resident">Resident</option>
              <option value="nonresident">Non-Resident</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">Points:</label>
            <input
              type="number"
              min={0}
              max={25}
              value={userPoints}
              onChange={(e) => setUserPoints(Math.max(0, Math.min(25, parseInt(e.target.value) || 0)))}
              className="w-16 px-2 py-1 border border-border rounded text-center font-bold bg-background text-sm"
            />
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        {(() => {
          const latest = aggregatedYears[aggregatedYears.length - 1];
          return (
            <>
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold">{latest.licensesIssued}</div>
                <div className="text-xs text-muted-foreground">Licenses ({latest.year})</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold">{latest.huntersAfield}</div>
                <div className="text-xs text-muted-foreground">Hunters Afield</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold">{latest.totalHarvest}</div>
                <div className="text-xs text-muted-foreground">Total Harvest</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold">{latest.successRate}%</div>
                <div className="text-xs text-muted-foreground">Avg Success Rate</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold">{units.length}</div>
                <div className="text-xs text-muted-foreground">Hunt Codes</div>
              </div>
            </>
          );
        })()}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <HarvestChart years={aggregatedYears} title={`GMU ${gmu} Harvest — ${SPECIES_LABELS[species]}`} />
        <SuccessRateChart years={aggregatedYears} title={`GMU ${gmu} Success Rate Trend`} />
      </div>

      {/* Point Creep */}
      <div className="mb-8">
        <PointCreepChart
          units={units.filter((u) => u.sex === "bull" || u.sex === "buck" || u.sex === "either").slice(0, 5)}
          residency={residency}
          userPoints={userPoints}
        />
      </div>

      {/* Hunt Code Details */}
      <h2 className="text-xl font-bold text-foreground mb-4">Hunt Code Details</h2>
      <div className="space-y-6">
        {units.map((u) => (
          <div key={u.huntCode} className="bg-card border border-border rounded-lg p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-lg">
                  {u.huntCode} — {SEASON_LABELS[u.season]} / {SEX_LABELS[u.sex]}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {u.years[u.years.length - 1].totalTags} tags &middot;{" "}
                  {u.years[u.years.length - 1].totalApplicants} applicants
                </p>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">Min Points ({residency === "resident" ? "R" : "NR"})</div>
                <div className="text-2xl font-bold text-primary">
                  {residency === "resident"
                    ? u.years[u.years.length - 1].minPointsResident
                    : u.years[u.years.length - 1].minPointsNonresident}
                </div>
              </div>
            </div>
            <DrawOddsTable
              latestYear={u.years[u.years.length - 1]}
              residency={residency}
              userPoints={userPoints}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UnitPage() {
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-8 text-muted-foreground">Loading...</div>}>
      <UnitDetailContent />
    </Suspense>
  );
}
