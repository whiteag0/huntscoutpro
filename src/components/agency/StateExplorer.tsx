"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { BadgeCheck, Loader2, Search } from "lucide-react";
import { SPECIES_LABELS, type Species } from "@/data/types";
import type { SpeciesInfo } from "@/data/agency/schema";
import type { StateData } from "@/lib/agency";
import { formatDate } from "@/lib/agency-format";
import { EVERY_CATEGORY, defaultHarvestMethod, harvestMethodKey, headlineHarvestRows, isRealUnit, sameUnit, maxPointLevel, methodsIn, years, type DrawResidency } from "@/lib/agency-view";
import { DemoGate } from "@/components/DemoGate";
import { useSpeciesData } from "@/components/agency/useSpeciesData";
import { DrawTable } from "@/components/agency/DrawTable";
import { HarvestTable } from "@/components/agency/HarvestTable";
import { KeyDatesSection, SpeciesInfoPanel } from "@/components/agency/SpeciesInfoPanel";
import { SourceNotes, footnoteIndex } from "@/components/agency/SourceNotes";
import { HScroll, ShowMore, pill } from "@/components/agency/mobile";
import { setSpecies as tagSpecies, setStateSlug, track } from "@/lib/analytics";
import { profileOf, useMemberProfile } from "@/components/useMemberProfile";
import { pointsIn, profileSpecies, residencyIn } from "@/lib/member-defaults";
import { stateByAbbrev } from "@/data/state-list";

type Tab = "draw" | "harvest";

const yrsLabel = (n: number) => `${n} ${n === 1 ? "yr" : "yrs"}`;

/** In-page sections the sticky nav jumps to (desktop). */
const NAV = [
  { id: "dates", label: "Dates" },
  { id: "draw-results", label: "Draw results" },
  { id: "harvest", label: "Harvest" },
  { id: "seasons", label: "Seasons" },
  { id: "fees", label: "Fees" },
] as const;

/**
 * `summary`: the free "at a glance" block. Non-members see it above the gated tables;
 * members, who have the tables, find it at the end.
 */
export function StateExplorer({
  state,
  species: speciesList,
  initialSpecies,
  summary,
}: {
  state: StateData;
  species: SpeciesInfo[];
  initialSpecies?: string;
  summary?: React.ReactNode;
}) {
  const { data: session } = useSession();
  const isPro = !!session?.user?.isPro;
  // Members start from their saved species, residency and points; the URL and their own picks win.
  const profileLoad = useMemberProfile({ planner: true });
  const profile = profileOf(profileLoad);
  const fromUrl = speciesList.some((s) => s.species === initialSpecies) ? (initialSpecies as Species) : null;
  const [speciesChoice, setSpecies] = useState<Species | null>(fromUrl);
  const species: Species =
    speciesChoice ?? profileSpecies(profile?.preferences, speciesList.map((s) => s.species)) ?? speciesList[0]?.species;
  const info = speciesList.find((s) => s.species === species)!;
  // Without a species in the URL, a member's tables wait for their saved species (one short request).
  const { data, error, loading } = useSpeciesData(state.slug, species, !!speciesChoice || profileLoad.status !== "loading");

  useEffect(() => {
    setStateSlug(state.slug);
    track("state_view", { state: state.slug });
  }, [state.slug]);
  useEffect(() => {
    tagSpecies(species);
  }, [species]);

  const [tabChoice, setTab] = useState<Tab>("draw");
  const [residencyChoice, setResidency] = useState<DrawResidency | null>(null);
  const [pointsChoice, setPoints] = useState<number | null>(null);
  const [refOpen, setRefOpen] = useState(false);
  const [drawYear, setDrawYear] = useState<number | null>(null);
  const [harvestYear, setHarvestYear] = useState<number | null>(null);
  const [method, setMethod] = useState<string>("");
  const [query, setQuery] = useState("");
  const [compare, setCompare] = useState<string[]>([]);

  const chooseSpecies = (s: Species) => {
    setSpecies(s);
    track("species_select", { state: state.slug, species: s });
    setPoints(null);
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

  const profileResidency = residencyIn(profile?.preferences, state.slug);
  const residency: DrawResidency = residencyChoice ?? profileResidency ?? "resident";
  const savedPoints = profile && info.pointsMatter ? pointsIn(profile.points, profile.planner, state.slug, species) : null;
  const points = Math.max(0, Math.min(maxPts, pointsChoice ?? savedPoints?.points ?? 0));
  const homeName = profile?.preferences?.homeState ? stateByAbbrev(profile.preferences.homeState)?.name : undefined;
  const filled = [
    residencyChoice === null && profileResidency && `${profileResidency === "resident" ? "resident" : "nonresident"}${homeName ? ` (home state ${homeName})` : ""}`,
    pointsChoice === null &&
      savedPoints &&
      maxPts > 0 &&
      `${savedPoints.points} ${info.pointName || "point"}${savedPoints.points === 1 ? "" : "s"}${savedPoints.from === "planner" ? " from your planner" : ""}${
        savedPoints.points > maxPts ? ` (shown at ${maxPts}, the highest point level in these results)` : ""
      }`,
  ].filter(Boolean);

  const openTab = (t: Tab) => {
    setTab(t);
    track("data_tab", { tab: t, state: state.slug, species });
  };
  /** Sticky nav: switch the table or open the reference panel, then scroll to the section. */
  const jump = (id: (typeof NAV)[number]["id"]) => {
    if (id === "draw-results") setTab("draw");
    if (id === "harvest") setTab("harvest");
    if (id === "seasons" || id === "fees") setRefOpen(true);
    const target = id === "draw-results" || id === "harvest" ? "data-tables" : id;
    requestAnimationFrame(() => document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

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
  const activeMethod = method && (harvestMethods.includes(method) || method === EVERY_CATEGORY) ? method : defaultHarvestMethod(harvestYearRows);
  const harvestRows = useMemo(
    () =>
      harvestYearRows.filter(
        (r) =>
          (activeMethod === EVERY_CATEGORY || harvestMethodKey(r) === activeMethod) &&
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

  // Compare opens with the same residency and points.
  const compareHref = `/compare?state=${state.slug}&species=${species}&codes=${compare.map(encodeURIComponent).join(",")}&res=${residency}${info.pointsMatter ? `&pts=${points}` : ""}`;

  const coverage = [...state.drawCoverage, ...state.harvestCoverage].filter((c) => c.species === species && c.notes);
  const toggleCompare = (code: string) =>
    setCompare((c) => (c.includes(code) ? c.filter((x) => x !== code) : c.length < 4 ? [...c, code] : c));

  return (
    <div className={`max-w-7xl mx-auto px-4 py-8 ${tab === "draw" && compare.length > 0 ? "pb-28 sm:pb-8" : ""}`}>
      <nav className="text-sm text-muted-foreground mb-4">
        <Link href="/states" className="text-primary hover:underline py-2">
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
        <ShowMore until="sm" collapsed={120} onBackground moreLabel="Read more" lessLabel="Read less">
          <p className="text-muted-foreground max-w-3xl">{state.overview}</p>
        </ShowMore>
        <div className="mt-3 inline-flex flex-wrap items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-success/10 border border-success/30 text-foreground">
          <BadgeCheck className="w-4 h-4 text-success" aria-hidden />
          Official data from{" "}
          <a href={state.agency.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
            {state.agency.name}
          </a>
          <span className="text-muted-foreground">· checked {formatDate(state.lastReviewed)}</span>
        </div>
      </header>

      <nav aria-label="On this page" className="hidden lg:block sticky top-16 z-30 -mx-4 px-4 mb-4 bg-background/95 backdrop-blur border-b border-border">
        <ul className="flex items-center gap-1 py-1.5 text-sm">
          <li className="mr-2 text-xs font-semibold text-muted-foreground">
            {state.name} {SPECIES_LABELS[species]}
          </li>
          {NAV.map((n) => {
            const off = (n.id === "draw-results" && !!data && data.totals.drawRows === 0) || (n.id === "harvest" && !!data && data.totals.harvestRows === 0);
            const on = (n.id === "draw-results" && tab === "draw") || (n.id === "harvest" && tab === "harvest");
            return (
              <li key={n.id}>
                <button
                  type="button"
                  disabled={off}
                  onClick={() => jump(n.id)}
                  className={`px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${on ? "text-foreground font-medium bg-muted" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                >
                  {n.id === "harvest" ? `Harvest by ${state.unitTerm}` : n.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <HScroll className="mb-4" innerProps={{ role: "tablist", "aria-label": "Species" }}>
        {speciesList.map((s) => (
          <button
            key={s.species}
            role="tab"
            aria-selected={species === s.species}
            title={s.displayName}
            className={`${pill(species === s.species)} whitespace-nowrap shrink-0`}
            onClick={() => chooseSpecies(s.species)}
          >
            {SPECIES_LABELS[s.species]}
          </button>
        ))}
      </HScroll>

      <KeyDatesSection key={species} id="dates" info={info} cite={cite} />

      <SpeciesInfoPanel
        info={info}
        fees={state.fees.filter((f) => f.species === species || !f.species)}
        seasons={state.seasons.filter((s) => s.species === species)}
        cite={cite}
        open={refOpen}
        onOpenChange={setRefOpen}
      />

      {/* Non-members: the free summary comes before the gated tables. Session unknown (first render) counts as not a member, so it's in the server HTML. */}
      {!isPro && summary}

      <div id="data-tables" className="grid grid-cols-2 gap-2 mb-4 sm:flex sm:flex-wrap sm:items-center scroll-mt-20 lg:scroll-mt-32" role="tablist" aria-label="Data type">
        <button role="tab" aria-selected={tab === "draw"} className={`${pill(tab === "draw")} flex-col sm:flex-row sm:gap-1 text-center disabled:opacity-50 disabled:cursor-not-allowed`} onClick={() => openTab("draw")} disabled={!!data && data.totals.drawRows === 0}>
          Draw results{" "}
          {data && <span className="block sm:inline text-xs sm:text-sm opacity-80">({data.totals.drawRows ? yrsLabel(years(data.draw).length) : "none"})</span>}
        </button>
        <button role="tab" aria-selected={tab === "harvest"} className={`${pill(tab === "harvest")} flex-col sm:flex-row sm:gap-1 text-center disabled:opacity-50 disabled:cursor-not-allowed`} onClick={() => openTab("harvest")} disabled={!!data && data.totals.harvestRows === 0}>
          Harvest by {state.unitTerm}{" "}
          {data && <span className="block sm:inline text-xs sm:text-sm opacity-80">({data.totals.harvestRows ? yrsLabel(years(data.harvest).length) : "none"})</span>}
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 sm:p-4 mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Year</span>
          <select
            className="min-h-10 sm:min-h-0 px-2 py-1.5 border border-border rounded-lg bg-background font-semibold text-base sm:text-sm"
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
              inputMode="numeric"
              min={0}
              max={maxPts}
              value={points}
              onChange={(e) => setPoints(Math.max(0, Math.min(maxPts, parseInt(e.target.value) || 0)))}
              className="w-20 min-h-10 sm:min-h-0 px-2 py-1.5 border border-border rounded-lg text-center font-bold bg-background text-base sm:text-sm"
            />
          </label>
        )}
        {tab === "harvest" && harvestMethods.length > 1 && (
          <label className="text-sm">
            <span className="block text-xs font-semibold text-muted-foreground mb-1">Category</span>
            <select className="min-h-10 sm:min-h-0 max-w-full px-2 py-1.5 border border-border rounded-lg bg-background text-base sm:text-sm" value={activeMethod} onChange={(e) => setMethod(e.target.value)}>
              <option value={EVERY_CATEGORY}>{EVERY_CATEGORY}</option>
              {harvestMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm basis-full sm:basis-auto flex-1 min-w-[180px]">
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Search</span>
          <span className="relative block">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "draw" ? `Hunt code, ${state.unitTerm}, or description` : `${state.unitTerm} or name`}
              className="w-full min-h-10 sm:min-h-0 pl-8 pr-3 py-1.5 border border-border rounded-lg bg-background text-base sm:text-sm"
            />
          </span>
        </label>
        {tab === "draw" && compare.length > 0 && (
          <Link
            href={compareHref}
            className="hidden sm:inline-flex px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90"
          >
            Compare {compare.length} hunt{compare.length > 1 ? "s" : ""}
          </Link>
        )}
      </div>

      {tab === "draw" && filled.length > 0 && (
        <p className="-mt-2 mb-4 text-xs text-muted-foreground">
          Filled in from your saved answers: {filled.join(", ")}. Change them above, or{" "}
          <Link href="/welcome" className="text-primary font-semibold hover:underline">
            update your hunting profile
          </Link>
          .
        </p>
      )}

      {/* Phones: the hunt list is long, so keep the compare action in reach at the bottom of the screen. */}
      {tab === "draw" && compare.length > 0 && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 z-40 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur border-t border-border flex items-center gap-2">
          <Link
            href={compareHref}
            className="flex-1 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent text-accent-foreground text-sm font-semibold"
          >
            Compare {compare.length} hunt{compare.length > 1 ? "s" : ""}
            <span className="sr-only">: {compare.join(", ")}</span>
          </Link>
          <button type="button" onClick={() => setCompare([])} className="min-h-11 px-3 rounded-xl border border-border bg-card text-sm font-medium cursor-pointer">
            Clear
          </button>
        </div>
      )}

      {tab === "draw" && info.pointsMatter && data && !data.draw.some((r) => r.byPoints?.length) && data.draw.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3">
          {state.agency.shortName} publishes totals for these hunts but not applicants by point level, so odds at a specific point level aren&apos;t shown.
        </p>
      )}

      {coverage.length > 0 && (
        <details className="mb-4 text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg p-3">
          <summary className="font-semibold text-foreground cursor-pointer py-1 -my-1">How {state.agency.shortName} reports this {SPECIES_LABELS[species].toLowerCase()} data (coverage and caveats)</summary>
          <div className="space-y-1 mt-2">
            {coverage.map((c, i) => (
              <p key={i}>{c.notes}</p>
            ))}
          </div>
        </details>
      )}

      {/* A member's table waits for their saved residency and points too, so it doesn't redraw as they arrive. */}
      {(loading && !data) || profileLoad.status === "loading" ? (
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
              ? `${drawRows.length} ${drawRows.length === 1 ? "hunt" : "hunts"} in the ${dYear} draw.`
              : `${harvestRows.length} ${harvestRows.length === 1 ? "row" : "rows"} for the ${hYear} season.`}{" "}
            Numbers are exactly as {state.agency.shortName} published them; a dash means the agency didn&apos;t report that figure.
          </p>
        </DemoGate>
      ) : null}

      <SourceNotes sources={state.sources} index={cited} />

      {isPro && summary}
    </div>
  );
}
