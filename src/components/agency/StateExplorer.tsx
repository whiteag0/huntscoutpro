"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, Search } from "lucide-react";
import { SPECIES_LABELS, type Species } from "@/data/types";
import type { SpeciesInfo } from "@/data/agency/schema";
import type { StateData } from "@/lib/agency";
import { formatDate } from "@/lib/agency-format";
import { defaultHarvestMethod, harvestMethodKey, headlineHarvestRows, isRealUnit, sameUnit, maxPointLevel, methodsIn, years, type DrawResidency } from "@/lib/agency-view";
import { DemoGate } from "@/components/DemoGate";
import { useSpeciesData } from "@/components/agency/useSpeciesData";
import { DrawTable } from "@/components/agency/DrawTable";
import { HarvestTable } from "@/components/agency/HarvestTable";
import { SpeciesInfoPanel } from "@/components/agency/SpeciesInfoPanel";
import { SourceNotes, footnoteIndex } from "@/components/agency/SourceNotes";

type Tab = "draw" | "harvest";

const pill = (on: boolean) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium border transition cursor-pointer ${
    on ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/50"
  }`;

export function StateExplorer({ state, species: speciesList, initialSpecies }: { state: StateData; species: SpeciesInfo[]; initialSpecies?: string }) {
  const initial = initialSpecies as Species;
  const [species, setSpecies] = useState<Species>(speciesList.some((s) => s.species === initial) ? initial : speciesList[0]?.species);
  const info = speciesList.find((s) => s.species === species)!;
  const { data, error, loading } = useSpeciesData(state.slug, species);

  const [tabChoice, setTab] = useState<Tab>("draw");
  const [residency, setResidency] = useState<DrawResidency>("resident");
  const [points, setPoints] = useState(0);
  const [drawYear, setDrawYear] = useState<number | null>(null);
  const [harvestYear, setHarvestYear] = useState<number | null>(null);
  const [method, setMethod] = useState<string>("");
  const [query, setQuery] = useState("");
  const [compare, setCompare] = useState<string[]>([]);

  const chooseSpecies = (s: Species) => {
    setSpecies(s);
    setDrawYear(null);
    setHarvestYear(null);
    setMethod("");
    setCompare([]);
    setQuery("");
    const url = new URL(window.location.href);
    url.searchParams.set("species", s);
    window.history.replaceState(window.history.state, "", url);
  };

  // Open whichever table this species actually has.
  const tab: Tab = data && data.totals.drawRows === 0 ? "harvest" : data && data.totals.harvestRows === 0 ? "draw" : tabChoice;

  const drawYears = useMemo(() => years(data?.draw || []), [data]);
  const harvestYears = useMemo(() => years(data?.harvest || []), [data]);
  const dYear = drawYear ?? drawYears[0];
  // Default to the newest season with unit-level rows; some agencies publish only a statewide total at first.
  const unitYear = useMemo(() => harvestYears.find((y) => (data?.harvest || []).some((r) => r.year === y && isRealUnit(r.unit))), [data, harvestYears]);
  const hYear = harvestYear ?? unitYear ?? harvestYears[0];
  const maxPts = useMemo(() => maxPointLevel(data?.draw || []), [data]);

  const q = query.trim().toLowerCase();
  const drawRows = useMemo(
    () =>
      (data?.draw || []).filter(
        (r) =>
          r.year === dYear &&
          (!q || r.huntCode.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.units.some((u) => sameUnit(u, q)))
      ),
    [data, dYear, q]
  );

  const harvestYearRows = useMemo(() => headlineHarvestRows((data?.harvest || []).filter((r) => r.year === hYear)), [data, hYear]);
  const harvestMethods = useMemo(() => methodsIn(harvestYearRows), [harvestYearRows]);
  const activeMethod = method && harvestMethods.includes(method) ? method : defaultHarvestMethod(harvestYearRows);
  const harvestRows = useMemo(
    () =>
      harvestYearRows.filter(
        (r) =>
          harvestMethodKey(r) === activeMethod &&
          (!q || r.unit.toLowerCase().includes(q) || (r.unitName || state.unitNames[species]?.[r.unit] || "").toLowerCase().includes(q) || (r.hunt || "").toLowerCase().includes(q))
      ),
    [harvestYearRows, activeMethod, q, state.unitNames, species]
  );

  const cited = useMemo(() => {
    const ids: string[] = [...info.sourceIds, ...info.keyDates.map((d) => d.sourceId)];
    const fees = state.fees.filter((f) => f.species === species || !f.species);
    const seasons = state.seasons.filter((s) => s.species === species);
    ids.push(...fees.map((f) => f.sourceId), ...seasons.map((s) => s.sourceId));
    for (const r of tab === "draw" ? drawRows : harvestRows) ids.push(r.sourceId);
    return footnoteIndex(ids);
  }, [info, state.fees, state.seasons, species, tab, drawRows, harvestRows]);
  const cite = (id: string) => cited.get(id);

  const coverage = [...state.drawCoverage, ...state.harvestCoverage].filter((c) => c.species === species && c.notes);
  const toggleCompare = (code: string) =>
    setCompare((c) => (c.includes(code) ? c.filter((x) => x !== code) : c.length < 4 ? [...c, code] : c));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <nav className="text-sm text-muted-foreground mb-4">
        <Link href="/states" className="text-primary hover:underline">
          States
        </Link>
        {" / "}
        <span className="text-foreground font-medium">{state.name}</span>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">{state.name}</h1>
          <span className="px-2 py-1 text-sm font-mono font-bold text-muted-foreground bg-muted rounded">{state.abbrev}</span>
        </div>
        <p className="text-muted-foreground max-w-3xl">{state.overview}</p>
        <div className="mt-3 inline-flex flex-wrap items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-success/10 border border-success/30 text-foreground">
          <BadgeCheck className="w-4 h-4 text-success" aria-hidden />
          Official data from{" "}
          <a href={state.agency.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
            {state.agency.name}
          </a>
          <span className="text-muted-foreground">· checked {formatDate(state.lastReviewed)}</span>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6" role="tablist" aria-label="Species">
        {speciesList.map((s) => (
          <button
            key={s.species}
            role="tab"
            aria-selected={species === s.species}
            title={s.displayName}
            className={`${pill(species === s.species)} whitespace-nowrap`}
            onClick={() => chooseSpecies(s.species)}
          >
            {SPECIES_LABELS[s.species]}
          </button>
        ))}
      </div>

      <SpeciesInfoPanel
        info={info}
        fees={state.fees.filter((f) => f.species === species || !f.species)}
        seasons={state.seasons.filter((s) => s.species === species)}
        cite={cite}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4" role="tablist" aria-label="Data type">
        <button role="tab" aria-selected={tab === "draw"} className={pill(tab === "draw")} onClick={() => setTab("draw")} disabled={!!data && data.totals.drawRows === 0}>
          Draw results {data ? `(${data.totals.drawRows ? years(data.draw).length + " yrs" : "none"})` : ""}
        </button>
        <button role="tab" aria-selected={tab === "harvest"} className={pill(tab === "harvest")} onClick={() => setTab("harvest")} disabled={!!data && data.totals.harvestRows === 0}>
          Harvest by {state.unitTerm} {data ? `(${data.totals.harvestRows ? years(data.harvest).length + " yrs" : "none"})` : ""}
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 mb-4 flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Year</span>
          <select
            className="px-2 py-1.5 border border-border rounded-lg bg-background font-semibold"
            value={(tab === "draw" ? dYear : hYear) ?? ""}
            onChange={(e) => (tab === "draw" ? setDrawYear(Number(e.target.value)) : setHarvestYear(Number(e.target.value)))}
          >
            {(tab === "draw" ? drawYears : harvestYears).map((y) => (
              <option key={y} value={y}>
                {y}
                {tab === "harvest" && !(data?.harvest || []).some((r) => r.year === y && isRealUnit(r.unit)) ? " (statewide only)" : ""}
              </option>
            ))}
          </select>
        </label>
        {tab === "draw" && (
          <div className="text-sm">
            <span className="block text-xs font-semibold text-muted-foreground mb-1">Applying as</span>
            <div className="flex gap-1">
              {(["resident", "nonresident"] as const).map((r) => (
                <button key={r} className={pill(residency === r)} onClick={() => setResidency(r)}>
                  {r === "resident" ? "Resident" : "Nonresident"}
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === "draw" && info.pointsMatter && maxPts > 0 && (
          <label className="text-sm">
            <span className="block text-xs font-semibold text-muted-foreground mb-1">My {info.pointName ? `${info.pointName}s` : "points"}</span>
            <input
              type="number"
              min={0}
              max={maxPts}
              value={points}
              onChange={(e) => setPoints(Math.max(0, Math.min(maxPts, parseInt(e.target.value) || 0)))}
              className="w-20 px-2 py-1.5 border border-border rounded-lg text-center font-bold bg-background"
            />
          </label>
        )}
        {tab === "harvest" && harvestMethods.length > 1 && (
          <label className="text-sm">
            <span className="block text-xs font-semibold text-muted-foreground mb-1">Category</span>
            <select className="px-2 py-1.5 border border-border rounded-lg bg-background" value={activeMethod} onChange={(e) => setMethod(e.target.value)}>
              {harvestMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm flex-1 min-w-[180px]">
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Search</span>
          <span className="relative block">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "draw" ? `Hunt code, ${state.unitTerm}, or description` : `${state.unitTerm} or name`}
              className="w-full pl-8 pr-3 py-1.5 border border-border rounded-lg bg-background"
            />
          </span>
        </label>
        {tab === "draw" && compare.length > 0 && (
          <Link
            href={`/compare?state=${state.slug}&species=${species}&codes=${compare.map(encodeURIComponent).join(",")}`}
            className="px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90"
          >
            Compare {compare.length} hunt{compare.length > 1 ? "s" : ""}
          </Link>
        )}
      </div>

      {tab === "draw" && info.pointsMatter && data && !data.draw.some((r) => r.byPoints?.length) && data.draw.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3">
          {state.agency.shortName} publishes totals for these hunts but not applicants by point level, so odds at a specific point level aren&apos;t shown.
        </p>
      )}

      {coverage.length > 0 && (
        <details className="mb-4 text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg p-3">
          <summary className="font-semibold text-foreground cursor-pointer">How {state.agency.shortName} reports this {SPECIES_LABELS[species].toLowerCase()} data (coverage and caveats)</summary>
          <div className="space-y-1 mt-2">
            {coverage.map((c, i) => (
              <p key={i}>{c.notes}</p>
            ))}
          </div>
        </details>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden /> Loading {SPECIES_LABELS[species]} data…
        </div>
      ) : error ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-danger">{error}</div>
      ) : data ? (
        <DemoGate feature={`${state.name} draw results and harvest data`}>
          {tab === "draw" ? (
            <DrawTable
              rows={drawRows}
              allRows={data.draw}
              info={info}
              residency={residency}
              points={points}
              stateSlug={state.slug}
              unitTerm={state.unitTerm}
              cite={cite}
              compare={compare}
              onToggleCompare={toggleCompare}
            />
          ) : (
            <HarvestTable
              rows={harvestRows}
              allRows={data.harvest}
              species={species}
              stateSlug={state.slug}
              unitTerm={state.unitTerm}
              unitNames={state.unitNames[species] || {}}
              cite={cite}
            />
          )}
          <p className="text-xs text-muted-foreground mt-3">
            {tab === "draw"
              ? `${drawRows.length} hunts in the ${dYear} draw.`
              : `${harvestRows.length} rows for the ${hYear} season.`}{" "}
            Numbers are exactly as {state.agency.shortName} published them; a dash means the agency didn&apos;t report that figure.
          </p>
        </DemoGate>
      ) : null}

      <SourceNotes sources={state.sources} index={cited} />
    </div>
  );
}
