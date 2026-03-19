"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Species,
  Season,
  Sex,
  Residency,
  SPECIES_LABELS,
  SEASON_LABELS,
  SEX_OPTIONS,
  SPECIES_SEASONS,
} from "@/data/types";
import {
  getStateBySlug,
  getStateSpecies,
  getFilteredUnits,
  getSpeciesUnits,
} from "@/data/hunt-data";
import { SpeciesCard } from "@/components/SpeciesCard";
import { FilterPanel } from "@/components/FilterPanel";
import { ResultsTable } from "@/components/ResultsTable";
import { DrawOddsLegend } from "@/components/DrawOddsLegend";

const DRAW_SYSTEM_LABELS: Record<string, string> = {
  preference: "Preference Points",
  bonus: "Bonus Points",
  random: "Random Draw",
  otc: "Over the Counter",
  hybrid: "Hybrid System",
};

export default function StateExplorerPage() {
  const params = useParams();
  const slug = params.slug as string;

  const stateConfig = useMemo(() => {
    try {
      return getStateBySlug(slug);
    } catch {
      return undefined;
    }
  }, [slug]);

  const stateSpecies = useMemo(() => {
    try {
      return getStateSpecies(slug);
    } catch {
      return [];
    }
  }, [slug]);

  const availableSpecies = stateSpecies.length > 0 ? stateSpecies : stateConfig?.species || [];

  const [species, setSpecies] = useState<Species>(availableSpecies[0] || "elk");
  const [season, setSeason] = useState<Season | "all">("all");
  const [sex, setSex] = useState<Sex | "all">("all");
  const [residency, setResidency] = useState<Residency>("resident");
  const [points, setPoints] = useState(3);
  const [compareList, setCompareList] = useState<string[]>([]);

  const filteredUnits = useMemo(() => {
    try {
      return getFilteredUnits(slug, species, season, sex, residency, points);
    } catch {
      return [];
    }
  }, [slug, species, season, sex, residency, points]);

  const speciesUnitCounts = useMemo(() => {
    const counts: Partial<Record<Species, number>> = {};
    for (const sp of availableSpecies) {
      try {
        const units = getSpeciesUnits(slug, sp);
        const gmus = new Set(units.map((u: { gmu: string }) => u.gmu));
        counts[sp] = gmus.size;
      } catch {
        counts[sp] = 0;
      }
    }
    return counts;
  }, [slug, availableSpecies]);

  const toggleCompare = (huntCode: string) => {
    setCompareList((prev) =>
      prev.includes(huntCode)
        ? prev.filter((c) => c !== huntCode)
        : prev.length < 4
        ? [...prev, huntCode]
        : prev
    );
  };

  const drawableCount = filteredUnits.filter(
    (u: { drawOdds: number }) => u.drawOdds >= 80
  ).length;
  const competitiveCount = filteredUnits.filter(
    (u: { drawOdds: number }) => u.drawOdds >= 20 && u.drawOdds < 80
  ).length;

  // Available seasons for the current species
  const currentSeasons = SPECIES_SEASONS[species] || [];
  const currentSexOptions = SEX_OPTIONS[species] || [];

  if (!stateConfig) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">
          State Not Found
        </h1>
        <p className="text-muted-foreground mb-6">
          We could not find data for this state. It may not be available yet.
        </p>
        <Link
          href="/states"
          className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
        >
          Browse All States
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted-foreground mb-4">
        <Link href="/states" className="text-primary hover:underline">
          States
        </Link>
        {" / "}
        <span className="text-foreground font-medium">{stateConfig.name}</span>
      </nav>

      {/* State Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
                {stateConfig.name}
              </h1>
              <span className="px-2 py-1 text-sm font-mono font-bold text-muted-foreground bg-muted rounded">
                {stateConfig.abbrev}
              </span>
            </div>
            <p className="text-muted-foreground">
              Draw odds, harvest data, and point analysis for every{" "}
              {stateConfig.unitSystemName} in {stateConfig.name}.
            </p>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-lg font-medium">
            {availableSpecies.length} Species
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-lg font-medium">
            {stateConfig.unitCount.toLocaleString()} {stateConfig.unitSystemName}s
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-lg font-medium">
            Draw System:{" "}
            <span className="text-primary font-semibold">
              {DRAW_SYSTEM_LABELS[stateConfig.drawSystem] || stateConfig.drawSystem}
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card border border-border rounded-lg font-medium">
            Deadline:{" "}
            <span className="text-warning font-semibold">
              {stateConfig.applicationDeadline}
            </span>
          </span>
        </div>
      </div>

      {/* Quick Start */}
      <div className="bg-card border border-border rounded-lg p-5 mb-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="text-sm font-semibold text-muted-foreground whitespace-nowrap">
            Quick Start:
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">I have</span>
            <input
              type="number"
              min={0}
              max={25}
              value={points}
              onChange={(e) =>
                setPoints(
                  Math.max(0, Math.min(25, parseInt(e.target.value) || 0))
                )
              }
              className="w-16 px-2 py-1 border border-border rounded text-center font-bold bg-background"
            />
            <span className="text-sm">preference points for</span>
            <select
              value={species}
              onChange={(e) => {
                const newSpecies = e.target.value as Species;
                setSpecies(newSpecies);
                setSex("all");
                setSeason("all");
              }}
              className="px-2 py-1 border border-border rounded font-bold bg-background"
            >
              {availableSpecies.map((s: Species) => (
                <option key={s} value={s}>
                  {SPECIES_LABELS[s]}
                </option>
              ))}
            </select>
            <span className="text-sm">as a</span>
            <select
              value={residency}
              onChange={(e) => setResidency(e.target.value as Residency)}
              className="px-2 py-1 border border-border rounded font-bold bg-background"
            >
              <option value="resident">Resident</option>
              <option value="nonresident">Non-Resident</option>
            </select>
          </div>
        </div>
      </div>

      {/* Species Cards */}
      {availableSpecies.length > 0 && (
        <div className="mb-6">
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
            {availableSpecies.map((s: Species) => (
              <div key={s} className="flex-shrink-0">
                <SpeciesCard
                  species={s}
                  unitCount={speciesUnitCounts[s] || 0}
                  onClick={() => {
                    setSpecies(s);
                    setSex("all");
                    setSeason("all");
                  }}
                  selected={species === s}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-foreground">
            {filteredUnits.length}
          </div>
          <div className="text-sm text-muted-foreground">Hunt Codes</div>
        </div>
        <div className="bg-success/10 border border-success/30 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-success">{drawableCount}</div>
          <div className="text-sm text-muted-foreground">Drawable (80%+)</div>
        </div>
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-warning">
            {competitiveCount}
          </div>
          <div className="text-sm text-muted-foreground">Competitive</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-foreground">{points}</div>
          <div className="text-sm text-muted-foreground">Your Points</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Filter Panel */}
        <div className="lg:col-span-1">
          <FilterPanel
            species={species}
            season={season}
            sex={sex}
            residency={residency}
            points={points}
            onSeasonChange={setSeason}
            onSexChange={setSex}
            onResidencyChange={setResidency}
            onPointsChange={setPoints}
            stateSlug={slug}
            availableSeasons={currentSeasons}
            availableSexOptions={currentSexOptions}
            drawSystem={stateConfig.drawSystem}
          />

          {compareList.length > 0 && (
            <div className="mt-4 bg-accent/10 border border-accent/30 rounded-lg p-4">
              <div className="font-bold text-sm mb-2">
                {compareList.length}/4 selected for comparison
              </div>
              <Link
                href={`/compare?codes=${compareList.join(",")}&species=${species}&residency=${residency}&points=${points}&state=${slug}`}
                className="block text-center bg-accent text-accent-foreground px-4 py-2 rounded font-medium hover:opacity-90 transition"
              >
                Compare Selected
              </Link>
              <button
                onClick={() => setCompareList([])}
                className="block w-full text-center text-sm text-muted-foreground mt-2 hover:text-foreground cursor-pointer"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>

        {/* Results */}
        <div className="lg:col-span-3 space-y-4">
          <DrawOddsLegend />
          <ResultsTable
            units={filteredUnits}
            residency={residency}
            points={points}
            compareList={compareList}
            onToggleCompare={toggleCompare}
            stateSlug={slug}
            unitSystemName={stateConfig.unitSystemName}
          />
        </div>
      </div>
    </div>
  );
}
