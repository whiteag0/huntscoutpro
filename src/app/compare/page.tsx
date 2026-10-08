"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState, useMemo } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, MapPin, Sparkles } from "lucide-react";
import {
  Species,
  Residency,
  HuntUnit,
  SPECIES_LABELS,
  SEASON_LABELS,
  SEX_LABELS,
  StateConfig,
} from "@/data/types";
import { getAllStates, getSpeciesUnits } from "@/data/hunt-data";
import { DemoGate } from "@/components/DemoGate";
import { DataDisclaimer } from "@/components/DataDisclaimer";

/** Same limit the state explorer enforces when ticking units. */
const MAX_COMPARE = 4;
const DEFAULT_STATE_SLUG = "colorado";

/** "Try an example" loads real units from the data set: Colorado rifle bull elk. */
const EXAMPLE_STATE = "colorado";
const EXAMPLE_SPECIES: Species = "elk";
const EXAMPLE_SEASON = "rifle";
const EXAMPLE_SEX = "bull";
const EXAMPLE_COUNT = 3;

function clampPoints(raw: string | null): number {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return 3;
  return Math.max(0, Math.min(25, n));
}

function loadStates(): StateConfig[] {
  try {
    return getAllStates();
  } catch {
    return [];
  }
}

/**
 * Hunt codes encode the state abbreviation and a species letter, but the same
 * code can belong to two species (e.g. moose and mule deer) and can repeat across
 * regions. Resolve against the requested species first, then the state's other
 * species, and keep every region variant of a code so nothing is silently dropped.
 */
function resolveUnits(state: StateConfig, speciesHint: Species, codes: string[]): HuntUnit[] {
  const order = state.species.includes(speciesHint)
    ? [speciesHint, ...state.species.filter((s) => s !== speciesHint)]
    : state.species;
  for (const sp of order) {
    let units: HuntUnit[] = [];
    try {
      units = getSpeciesUnits(state.slug, sp).filter((u) => codes.includes(u.huntCode));
    } catch {
      units = [];
    }
    if (units.length > 0) {
      // Keep the order the units were picked in
      return [...units].sort((a, b) => codes.indexOf(a.huntCode) - codes.indexOf(b.huntCode));
    }
  }
  return [];
}

function CompareContent() {
  const searchParams = useSearchParams();
  const codesKey = searchParams.get("codes") || "";
  const speciesParam = searchParams.get("species") || "";
  const species: Species = speciesParam in SPECIES_LABELS ? (speciesParam as Species) : "elk";
  const initialResidency: Residency =
    searchParams.get("residency") === "nonresident" ? "nonresident" : "resident";
  const initialPoints = clampPoints(searchParams.get("points"));
  const stateParam = searchParams.get("state") || "";

  const [residency, setResidency] = useState<Residency>(initialResidency);
  const [userPoints, setUserPoints] = useState(initialPoints);

  const allStates = useMemo(() => loadStates(), []);

  const codes = useMemo(
    () =>
      Array.from(
        new Set(
          codesKey
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean)
        )
      ),
    [codesKey]
  );

  // The state comes from the URL, or from the hunt code prefix (state abbreviation).
  const currentState = useMemo(() => {
    const byParam = allStates.find((s) => s.slug === stateParam);
    if (byParam) return byParam;
    const abbrev = codes[0]?.slice(0, 2).toUpperCase();
    return abbrev ? allStates.find((s) => s.abbrev === abbrev) : undefined;
  }, [allStates, stateParam, codes]);

  const selectedUnits = useMemo(
    () => (currentState && codes.length > 0 ? resolveUnits(currentState, species, codes) : []),
    [currentState, species, codes]
  );

  if (selectedUnits.length === 0) {
    return (
      <CompareEmptyState
        allStates={allStates}
        initialState={currentState?.slug || ""}
        residency={residency}
        points={userPoints}
        unmatchedCodes={codes}
      />
    );
  }

  const unitSystemName = currentState?.unitSystemName || "GMU";
  const stateSlug = currentState?.slug || "";
  const unitsSpecies = selectedUnits[0].species;

  // Disambiguate headers when the same unit number shows up in more than one region
  const gmuCounts = new Map<string, number>();
  for (const u of selectedUnits) gmuCounts.set(u.gmu, (gmuCounts.get(u.gmu) || 0) + 1);
  const ambiguousCodes = codes.filter(
    (c) => selectedUnits.filter((u) => u.huntCode === c).length > 1
  );
  const missingCodes = codes.filter((c) => !selectedUnits.some((u) => u.huntCode === c));

  function getUnitLink(unit: { species: string; gmu: string }) {
    if (stateSlug) {
      return `/states/${stateSlug}/units/${encodeURIComponent(unit.gmu)}?species=${unit.species}`;
    }
    return `/unit?species=${unit.species}&gmu=${unit.gmu}`;
  }

  const backLink = stateSlug ? `/states/${stateSlug}` : "/states";
  const backLabel = currentState ? `${currentState.name} Explorer` : "States";
  const trendYears = selectedUnits[0]?.years ?? [];
  const firstYear = trendYears[0]?.year;
  const lastYear = trendYears.at(-1)?.year;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <nav className="text-sm text-muted-foreground mb-1">
            <Link href={backLink} className="text-primary hover:underline">
              {backLabel}
            </Link>
            {" / "}
            <span className="text-foreground font-medium">Compare</span>
          </nav>
          <h1 className="text-3xl font-bold text-foreground">
            Compare Units &mdash; {SPECIES_LABELS[unitsSpecies]}
          </h1>
          {currentState && (
            <p className="text-sm text-muted-foreground mt-1">
              Comparing {selectedUnits.length} hunt codes in {currentState.name}.{" "}
              <Link href={backLink} className="text-primary hover:underline">
                Change units
              </Link>
              {" · "}
              <Link href="/compare" className="text-primary hover:underline">
                Start over
              </Link>
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <select
            value={residency}
            onChange={(e) => setResidency(e.target.value as Residency)}
            aria-label="Residency"
            className="px-2 py-1 border border-border rounded bg-background text-sm"
          >
            <option value="resident">Resident</option>
            <option value="nonresident">Non-Resident</option>
          </select>
          <div className="flex items-center gap-2">
            <label htmlFor="compare-points" className="text-sm text-muted-foreground">
              Points:
            </label>
            <input
              id="compare-points"
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

      {(ambiguousCodes.length > 0 || missingCodes.length > 0) && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
          <div className="space-y-1">
            {ambiguousCodes.length > 0 && (
              <p>
                Hunt code {ambiguousCodes.join(", ")} appears in more than one region, so each
                region is shown as its own column.
              </p>
            )}
            {missingCodes.length > 0 && (
              <p>
                Couldn&apos;t find {missingCodes.join(", ")} for {SPECIES_LABELS[unitsSpecies]}
                {currentState ? ` in ${currentState.name}` : ""}.
              </p>
            )}
          </div>
        </div>
      )}

      {stateSlug && <DataDisclaimer state={stateSlug} species={unitsSpecies} />}

      {/* Comparison Table */}
      <DemoGate feature="unit comparison data">
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase w-48">
                  Metric
                </th>
                {selectedUnits.map((u, i) => (
                  <th key={`${u.huntCode}-${u.region}-${i}`} className="px-4 py-3 text-center text-xs font-semibold uppercase">
                    <Link href={getUnitLink(u)} className="text-primary hover:underline">
                      {unitSystemName} {u.gmu}
                    </Link>
                    {(gmuCounts.get(u.gmu) || 0) > 1 && (
                      <div className="text-muted-foreground font-normal normal-case mt-0.5">
                        {u.region}
                      </div>
                    )}
                    <div className="text-muted-foreground font-normal normal-case mt-0.5">
                      {SEASON_LABELS[u.season]} / {SEX_LABELS[u.sex]}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <CompareRow label="Region" values={selectedUnits.map((u) => u.region)} />
              <CompareRow label="Hunt Code" values={selectedUnits.map((u) => u.huntCode)} />
              <CompareRow
                label={`Tags (${lastYear ?? "-"})`}
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
                  return val > 0 ? `${val}%` : "—";
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

              {/* Year-by-year point trend rows */}
              <tr className="bg-muted/30">
                <td colSpan={selectedUnits.length + 1} className="px-4 py-2 text-xs font-bold text-muted-foreground uppercase">
                  Point Trend{firstYear && lastYear ? ` ${firstYear}–${lastYear}` : ""} ({residency === "resident" ? "Resident" : "Non-Resident"})
                </td>
              </tr>
              {trendYears.map((y) => (
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
      </DemoGate>
    </div>
  );
}

function CompareEmptyState({
  allStates,
  initialState,
  residency,
  points,
  unmatchedCodes,
}: {
  allStates: StateConfig[];
  initialState: string;
  residency: Residency;
  points: number;
  unmatchedCodes: string[];
}) {
  const [pickedState, setPickedState] = useState(
    () =>
      allStates.find((s) => s.slug === initialState)?.slug ??
      allStates.find((s) => s.slug === DEFAULT_STATE_SLUG)?.slug ??
      allStates[0]?.slug ??
      ""
  );
  const pickedStateName = allStates.find((s) => s.slug === pickedState)?.name;

  // Build the example from the live data set: the most-applied-for Colorado rifle
  // bull elk hunt codes that map to exactly one unit (so the example is unambiguous).
  const example = useMemo(() => {
    try {
      const units = getSpeciesUnits(EXAMPLE_STATE, EXAMPLE_SPECIES).filter(
        (u) => u.season === EXAMPLE_SEASON && u.sex === EXAMPLE_SEX
      );
      const codeCounts = new Map<string, number>();
      for (const u of units) codeCounts.set(u.huntCode, (codeCounts.get(u.huntCode) || 0) + 1);
      const picks = units
        .filter((u) => codeCounts.get(u.huntCode) === 1)
        .sort(
          (a, b) =>
            (b.years.at(-1)?.totalApplicants ?? 0) - (a.years.at(-1)?.totalApplicants ?? 0)
        )
        .slice(0, EXAMPLE_COUNT);
      if (picks.length < 2) return null;
      const params = new URLSearchParams({
        codes: picks.map((u) => u.huntCode).join(","),
        species: EXAMPLE_SPECIES,
        state: EXAMPLE_STATE,
        residency,
        points: String(points),
      });
      return { href: `/compare?${params.toString()}`, gmus: picks.map((u) => u.gmu) };
    } catch {
      return null;
    }
  }, [residency, points]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <nav className="text-sm text-muted-foreground mb-1">
        <Link href="/states" className="text-primary hover:underline">
          States
        </Link>
        {" / "}
        <span className="text-foreground font-medium">Compare</span>
      </nav>
      <h1 className="text-3xl font-bold text-foreground mb-2">Compare Units</h1>
      <p className="text-muted-foreground mb-6 max-w-2xl">
        Put up to {MAX_COMPARE} hunt codes side by side: tags, applicants, minimum points,
        your draw odds at your point level, harvest success, and how the point requirement
        has moved year to year.
      </p>

      {unmatchedCodes.length > 0 && (
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground max-w-3xl">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
          <p>
            We couldn&apos;t find hunt code{unmatchedCodes.length > 1 ? "s" : ""}{" "}
            {unmatchedCodes.join(", ")}. Pick the units again from a state explorer below.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* How-to */}
        <div className="lg:col-span-3 bg-card border border-border rounded-xl p-6">
          <h2 className="font-bold text-lg mb-4">How to add units</h2>
          <ol className="space-y-5 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                1
              </span>
              <div className="flex-1">
                <p className="font-medium text-foreground mb-2">Open a state explorer</p>
                {allStates.length > 0 ? (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={pickedState}
                      onChange={(e) => setPickedState(e.target.value)}
                      aria-label="State"
                      className="px-3 py-2 border border-border rounded-lg bg-background text-sm w-full sm:max-w-xs"
                    >
                      {allStates.map((s) => (
                        <option key={s.slug} value={s.slug}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    {pickedState && (
                      <Link
                        href={`/states/${pickedState}`}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
                      >
                        <MapPin className="w-4 h-4" />
                        Open {pickedStateName ?? "state"}
                      </Link>
                    )}
                  </div>
                ) : null}
                <p className="text-muted-foreground mt-2">
                  Or{" "}
                  <Link href="/states" className="text-primary hover:underline">
                    browse all states
                  </Link>
                  .
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                2
              </span>
              <div>
                <p className="font-medium text-foreground">Tick the units you&apos;re considering</p>
                <p className="text-muted-foreground">
                  Set your species and points, then check the box in the <strong>CMP</strong>{" "}
                  column next to up to {MAX_COMPARE} hunt codes in the results table.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                3
              </span>
              <div>
                <p className="font-medium text-foreground">Click &ldquo;Compare Selected&rdquo;</p>
                <p className="text-muted-foreground">
                  The button appears under the filters once you&apos;ve ticked a unit, and brings
                  you back here with your units side by side.
                </p>
              </div>
            </li>
          </ol>
        </div>

        {/* Example */}
        {example && (
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6 flex flex-col">
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-primary mb-2">
              <Sparkles className="w-4 h-4" />
              Not sure where to start?
            </div>
            <h2 className="font-bold text-lg mb-2">Try an example comparison</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Load {example.gmus.length} Colorado rifle bull elk units side by side
              (GMU {example.gmus.join(", ")}) to see how the comparison works.
            </p>
            <Link
              href={example.href}
              className="mt-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-accent text-accent-foreground rounded-lg font-medium hover:opacity-90 transition"
            >
              Try an example
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
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
