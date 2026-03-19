"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useState, useMemo } from "react";
import Link from "next/link";
import {
  Species,
  Residency,
  SPECIES_LABELS,
  SEASON_LABELS,
  SEX_LABELS,
} from "@/data/types";
import { getStateBySlug, getUnitDetail } from "@/data/hunt-data";
import { HarvestChart, SuccessRateChart } from "@/components/HarvestChart";
import { PointCreepChart } from "@/components/PointCreepChart";
import { DrawOddsTable } from "@/components/DrawOddsTable";

function UnitDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const unitId = params.unitId as string;
  const species = (searchParams.get("species") || "elk") as Species;

  const [residency, setResidency] = useState<Residency>("resident");
  const [userPoints, setUserPoints] = useState(3);

  const stateConfig = useMemo(() => {
    try {
      return getStateBySlug(slug);
    } catch {
      return undefined;
    }
  }, [slug]);

  const units = useMemo(() => {
    try {
      return getUnitDetail(slug, species, unitId);
    } catch {
      return [];
    }
  }, [slug, species, unitId]);

  const unitSystemName = stateConfig?.unitSystemName || "Unit";

  if (!stateConfig) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">State not found.</p>
        <Link
          href="/states"
          className="text-primary hover:underline mt-4 inline-block"
        >
          Browse All States
        </Link>
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground mb-4">Unit not found.</p>
        <Link
          href={`/states/${slug}`}
          className="text-primary hover:underline inline-block"
        >
          Back to {stateConfig.name} Explorer
        </Link>
      </div>
    );
  }

  const region = units[0].region;
  const firstUnit = units[0];

  // Aggregate harvest data across all hunt codes for this unit/species
  const aggregatedYears = firstUnit.years.map((y) => {
    const yearUnits = units.map(
      (u) => u.years.find((uy) => uy.year === y.year)!
    );
    return {
      ...y,
      totalHarvest: yearUnits.reduce((sum, u) => sum + (u?.totalHarvest || 0), 0),
      huntersAfield: yearUnits.reduce((sum, u) => sum + (u?.huntersAfield || 0), 0),
      licensesIssued: yearUnits.reduce((sum, u) => sum + (u?.licensesIssued || 0), 0),
      successRate:
        Math.round(
          (yearUnits.reduce((sum, u) => sum + (u?.successRate || 0), 0) /
            yearUnits.length) *
            10
        ) / 10,
    };
  });

  const latest = aggregatedYears[aggregatedYears.length - 1];

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-4">
        <Link href="/states" className="text-primary hover:underline">
          States
        </Link>
        {" / "}
        <Link
          href={`/states/${slug}`}
          className="text-primary hover:underline"
        >
          {stateConfig.name}
        </Link>
        {" / "}
        <span className="text-foreground font-medium">
          {unitSystemName} {unitId}
        </span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 text-xs font-medium bg-primary/10 text-primary rounded">
              {stateConfig.name}
            </span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {unitSystemName} {unitId} &mdash; {region}
          </h1>
          <p className="text-muted-foreground mt-1">
            {SPECIES_LABELS[species]} &middot; {units.length} hunt codes
            available
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">
              Residency:
            </label>
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
            <label className="text-sm font-medium text-muted-foreground">
              Points:
            </label>
            <input
              type="number"
              min={0}
              max={25}
              value={userPoints}
              onChange={(e) =>
                setUserPoints(
                  Math.max(0, Math.min(25, parseInt(e.target.value) || 0))
                )
              }
              className="w-16 px-2 py-1 border border-border rounded text-center font-bold bg-background text-sm"
            />
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{latest?.licensesIssued ?? 0}</div>
          <div className="text-xs text-muted-foreground">
            Licenses ({latest?.year})
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{latest?.huntersAfield ?? 0}</div>
          <div className="text-xs text-muted-foreground">Hunters Afield</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{latest?.totalHarvest ?? 0}</div>
          <div className="text-xs text-muted-foreground">Total Harvest</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{latest?.successRate ?? 0}%</div>
          <div className="text-xs text-muted-foreground">Avg Success Rate</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold">{units.length}</div>
          <div className="text-xs text-muted-foreground">Hunt Codes</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <HarvestChart
          years={aggregatedYears}
          title={`${unitSystemName} ${unitId} Harvest \u2014 ${SPECIES_LABELS[species]}`}
        />
        <SuccessRateChart
          years={aggregatedYears}
          title={`${unitSystemName} ${unitId} Success Rate Trend`}
        />
      </div>

      {/* Point Creep */}
      <div className="mb-8">
        <PointCreepChart
          units={units
            .filter(
              (u) =>
                u.sex === "bull" ||
                u.sex === "buck" ||
                u.sex === "either" ||
                u.sex === "tom"
            )
            .slice(0, 5)}
          residency={residency}
          userPoints={userPoints}
        />
      </div>

      {/* Hunt Code Details */}
      <h2 className="text-xl font-bold text-foreground mb-4">
        Hunt Code Details
      </h2>
      <div className="space-y-6">
        {units.map((u) => {
          const latestYear = u.years[u.years.length - 1];
          if (!latestYear) return null;
          return (
            <div
              key={u.huntCode}
              className="bg-card border border-border rounded-xl p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-bold text-lg">
                    {u.huntCode} &mdash; {SEASON_LABELS[u.season]} /{" "}
                    {SEX_LABELS[u.sex]}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {latestYear.totalTags} tags &middot;{" "}
                    {latestYear.totalApplicants} applicants
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">
                    Min Points ({residency === "resident" ? "R" : "NR"})
                  </div>
                  <div className="text-2xl font-bold text-primary">
                    {residency === "resident"
                      ? latestYear.minPointsResident
                      : latestYear.minPointsNonresident}
                  </div>
                </div>
              </div>
              <DrawOddsTable
                latestYear={latestYear}
                residency={residency}
                userPoints={userPoints}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function StateUnitDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-48" />
            <div className="h-8 bg-muted rounded w-96" />
            <div className="h-4 bg-muted rounded w-64" />
            <div className="grid grid-cols-5 gap-4 mt-8">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-20 bg-muted rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <UnitDetailContent />
    </Suspense>
  );
}
