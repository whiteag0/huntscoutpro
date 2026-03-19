"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useMemo } from "react";
import Link from "next/link";
import {
  Species,
  Residency,
  SPECIES_LABELS,
  SEASON_LABELS,
  SEX_LABELS,
  StateConfig,
} from "@/data/types";
import { getAllStates, getStateBySlug } from "@/data/hunt-data";

// Fallback: try importing huntUnits for backward compat
let huntUnitsCompat: { huntCode: string; species: string; gmu: string; season: string; sex: string; region: string; years: { year: number; totalTags: number; totalApplicants: number; minPointsResident: number; minPointsNonresident: number; drawOddsByPoint: Record<number, { resident: number; nonresident: number }>; successRate: number; totalHarvest: number; huntersAfield: number; licensesIssued: number }[] }[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@/data/hunt-data");
  if (mod.huntUnits) huntUnitsCompat = mod.huntUnits;
} catch {
  // Data layer not yet available
}

function CompareContent() {
  const searchParams = useSearchParams();
  const codes = (searchParams.get("codes") || "").split(",").filter(Boolean);
  const species = (searchParams.get("species") || "elk") as Species;
  const initialResidency = (searchParams.get("residency") || "resident") as Residency;
  const initialPoints = parseInt(searchParams.get("points") || "3");
  const stateParam = searchParams.get("state") || "";

  const [residency, setResidency] = useState<Residency>(initialResidency);
  const [userPoints, setUserPoints] = useState(initialPoints);
  const [selectedState, setSelectedState] = useState(stateParam);

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

  const selectedUnits = useMemo(
    () => huntUnitsCompat.filter((u) => codes.includes(u.huntCode)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [codes.join(",")]
  );

  // Build unit detail link
  function getUnitLink(unit: { species: string; gmu: string }) {
    if (selectedState) {
      return `/states/${selectedState}/units/${encodeURIComponent(unit.gmu)}?species=${unit.species}`;
    }
    return `/unit?species=${unit.species}&gmu=${unit.gmu}`;
  }

  // Back link
  function getBackLink() {
    if (selectedState) {
      return `/states/${selectedState}`;
    }
    return "/";
  }

  function getBackLabel() {
    if (currentState) return `${currentState.name} Explorer`;
    return "Explorer";
  }

  if (selectedUnits.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-4">Compare Units</h1>

        {/* State Selector */}
        {allStates.length > 0 && (
          <div className="mb-6">
            <label className="block text-sm font-semibold text-muted-foreground mb-2">
              Select a State
            </label>
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="px-3 py-2 border border-border rounded-lg bg-background text-sm w-full max-w-xs"
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

        <p className="text-muted-foreground mb-4">
          No units selected. Go to the{" "}
          <Link href={getBackLink()} className="text-primary hover:underline">
            {getBackLabel()}
          </Link>{" "}
          and check the boxes next to units you want to compare.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <nav className="text-sm text-muted-foreground mb-1">
            <Link href={getBackLink()} className="text-primary hover:underline">
              {getBackLabel()}
            </Link>
            {" / "}
            <span className="text-foreground font-medium">Compare</span>
          </nav>
          <h1 className="text-3xl font-bold text-foreground">
            Compare Units &mdash; {SPECIES_LABELS[species]}
          </h1>
          {currentState && (
            <p className="text-sm text-muted-foreground mt-1">
              Comparing units in {currentState.name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          {/* State Selector */}
          {allStates.length > 0 && (
            <select
              value={selectedState}
              onChange={(e) => setSelectedState(e.target.value)}
              className="px-2 py-1 border border-border rounded bg-background text-sm"
            >
              <option value="">All States</option>
              {allStates.map((s: StateConfig) => (
                <option key={s.slug} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={residency}
            onChange={(e) => setResidency(e.target.value as Residency)}
            className="px-2 py-1 border border-border rounded bg-background text-sm"
          >
            <option value="resident">Resident</option>
            <option value="nonresident">Non-Resident</option>
          </select>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">Points:</label>
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

      {/* Comparison Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase w-48">
                  Metric
                </th>
                {selectedUnits.map((u) => (
                  <th key={u.huntCode} className="px-4 py-3 text-center text-xs font-semibold uppercase">
                    <Link href={getUnitLink(u)} className="text-primary hover:underline">
                      {currentState ? `${currentState.unitSystemName} ` : "GMU "}{u.gmu}
                    </Link>
                    <div className="text-muted-foreground font-normal normal-case mt-0.5">
                      {SEASON_LABELS[u.season as keyof typeof SEASON_LABELS]} / {SEX_LABELS[u.sex as keyof typeof SEX_LABELS]}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <CompareRow label="Region" values={selectedUnits.map((u) => u.region)} />
              <CompareRow label="Hunt Code" values={selectedUnits.map((u) => u.huntCode)} />
              <CompareRow
                label={`Tags (${selectedUnits[0]?.years.at(-1)?.year})`}
                values={selectedUnits.map((u) => String(u.years.at(-1)?.totalTags ?? "-"))}
              />
              <CompareRow
                label="Total Applicants"
                values={selectedUnits.map((u) => String(u.years.at(-1)?.totalApplicants ?? "-"))}
              />
              <CompareRow
                label={`Min Points (${residency === "resident" ? "R" : "NR"})`}
                values={selectedUnits.map((u) => {
                  const latest = u.years.at(-1);
                  if (!latest) return "-";
                  return String(residency === "resident" ? latest.minPointsResident : latest.minPointsNonresident);
                })}
                highlight="low"
              />
              <CompareRow
                label={`Draw % @ ${userPoints} pts`}
                values={selectedUnits.map((u) => {
                  const latest = u.years.at(-1);
                  if (!latest) return "-";
                  const odds = latest.drawOddsByPoint[userPoints];
                  if (!odds) return "0%";
                  const val = residency === "resident" ? odds.resident : odds.nonresident;
                  return val > 0 ? `${val}%` : "\u2014";
                })}
                highlight="high"
              />
              <CompareRow
                label="Success Rate"
                values={selectedUnits.map((u) => `${u.years.at(-1)?.successRate ?? "-"}%`)}
                highlight="high"
              />
              <CompareRow
                label="Total Harvest"
                values={selectedUnits.map((u) => String(u.years.at(-1)?.totalHarvest ?? "-"))}
                highlight="high"
              />
              <CompareRow
                label="Hunters Afield"
                values={selectedUnits.map((u) => String(u.years.at(-1)?.huntersAfield ?? "-"))}
              />
              <CompareRow
                label="Licenses Issued"
                values={selectedUnits.map((u) => String(u.years.at(-1)?.licensesIssued ?? "-"))}
              />

              {/* 5-year trend rows */}
              <tr className="bg-muted/30">
                <td colSpan={selectedUnits.length + 1} className="px-4 py-2 text-xs font-bold text-muted-foreground uppercase">
                  5-Year Point Trend ({residency === "resident" ? "Resident" : "Non-Resident"})
                </td>
              </tr>
              {selectedUnits[0]?.years.map((y) => (
                <CompareRow
                  key={y.year}
                  label={String(y.year)}
                  values={selectedUnits.map((u) => {
                    const yd = u.years.find((yr) => yr.year === y.year);
                    if (!yd) return "-";
                    return String(residency === "resident" ? yd.minPointsResident : yd.minPointsNonresident) + " pts";
                  })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  values,
  highlight,
}: {
  label: string;
  values: string[];
  highlight?: "high" | "low";
}) {
  let bestIdx = -1;
  if (highlight && values.length > 1) {
    const nums = values.map((v) => parseFloat(v.replace(/[^0-9.]/g, "")) || 0);
    if (highlight === "high") {
      bestIdx = nums.indexOf(Math.max(...nums));
    } else {
      bestIdx = nums.indexOf(Math.min(...nums));
    }
  }

  return (
    <tr className="hover:bg-muted/20 transition">
      <td className="px-4 py-2.5 font-medium text-muted-foreground">{label}</td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`px-4 py-2.5 text-center ${
            i === bestIdx ? "font-bold text-success" : ""
          }`}
        >
          {v}
        </td>
      ))}
    </tr>
  );
}

export default function ComparePage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64" />
          <div className="h-4 bg-muted rounded w-96" />
          <div className="h-64 bg-muted rounded-lg" />
        </div>
      </div>
    }>
      <CompareContent />
    </Suspense>
  );
}
