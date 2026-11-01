"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SPECIES_LABELS } from "@/data/types";
import type { DrawRecord, SpeciesInfo } from "@/data/agency/schema";
import type { StateData } from "@/lib/agency";
import { fmtNum, fmtPct } from "@/lib/agency-format";
import { drawHistory, drawStats, harvestMethodKey, headlineHarvestRows, minPointsDrawn, oddsOf, sameUnit, successOf, unitNameOf, type DrawResidency } from "@/lib/agency-view";
import { DemoGate } from "@/components/DemoGate";
import { useSpeciesData } from "@/components/agency/useSpeciesData";
import { Cite, SourceNotes, footnoteIndex } from "@/components/agency/SourceNotes";
import { HScroll, pill, useIsNarrow } from "@/components/agency/mobile";
import { AddToPlannerButton, PlannerToaster } from "@/components/planner/AddToPlanner";

function PointTable({ r, residency }: { r: DrawRecord; residency: DrawResidency }) {
  const rows = (r.byPoints || []).filter((p) => p[residency]?.applicants).sort((a, b) => b.points - a.points);
  if (!rows.length) return <p className="text-xs text-muted-foreground">No {residency} applicants by point level published for {r.year}.</p>;
  return (
    <table className="text-xs w-full max-w-md tabular-nums">
      <thead className="text-muted-foreground">
        <tr>
          <th className="text-left py-1 pr-3">Points</th>
          <th className="text-right py-1 pr-3">Applicants</th>
          <th className="text-right py-1 pr-3">Drawn</th>
          <th className="text-right py-1">Odds</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const v = p[residency]!;
          return (
            <tr key={p.points} className="border-t border-border">
              <td className="py-1 pr-3 font-semibold">{p.points}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtNum(v.applicants)}</td>
              <td className="py-1 pr-3 text-right tabular-nums">{fmtNum(v.drawn)}</td>
              <td className="py-1 text-right tabular-nums">{fmtPct((100 * v.drawn) / v.applicants)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function UnitDetail({ state, unit, species: speciesList, requested }: { state: StateData; unit: string; species: SpeciesInfo[]; requested?: string }) {
  const species = speciesList.find((s) => s.species === requested)?.species || speciesList[0].species;
  const info = speciesList.find((s) => s.species === species)!;
  const { data, loading, error } = useSpeciesData(state.slug, species);
  const narrow = useIsNarrow();
  const [residency, setResidency] = useState<DrawResidency>("resident");
  const [openHunt, setOpenHunt] = useState<string | null>(null);
  const name = unitNameOf(state.unitNames[species], unit);

  const harvest = useMemo(() => headlineHarvestRows((data?.harvest || []).filter((r) => sameUnit(r.unit, unit))), [data, unit]);
  const categories = useMemo(() => Array.from(new Set(harvest.map(harvestMethodKey))), [harvest]);
  const [category, setCategory] = useState<string>("");
  const cat = category && categories.includes(category) ? category : harvest.find((r) => r.method === "all") ? harvestMethodKey(harvest.find((r) => r.method === "all")!) : categories[0];
  const series = useMemo(
    () =>
      harvest
        .filter((r) => harvestMethodKey(r) === cat && !r.hunt)
        .sort((a, b) => a.year - b.year)
        .map((r) => ({ year: r.year, Hunters: r.hunters, Harvest: r.harvest, "Success %": successOf(r) === null ? null : Number(successOf(r)!.toFixed(1)), r })),
    [harvest, cat]
  );
  const hunts = useMemo(() => drawHistory((data?.draw || []).filter((r) => r.units.some((u) => sameUnit(u, unit)))), [data, unit]);

  const cited = useMemo(() => {
    const ids = [...harvest.map((r) => r.sourceId)];
    for (const list of hunts.values()) ids.push(...list.map((r) => r.sourceId));
    return footnoteIndex(ids);
  }, [harvest, hunts]);
  const cite = (id: string) => cited.get(id);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <nav className="text-sm text-muted-foreground mb-4">
        <Link href="/states" className="text-primary hover:underline py-2">
          States
        </Link>
        {" / "}
        <Link href={`/states/${state.slug}?species=${species}`} className="text-primary hover:underline py-2">
          {state.name}
        </Link>
        {" / "}
        <span className="text-foreground font-medium">
          {state.unitTerm} {unit}
        </span>
      </nav>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
        {state.name} {state.unitTerm} {unit}
        {name ? <span className="text-muted-foreground font-normal">: {name}</span> : null}
      </h1>
      <p className="text-muted-foreground mt-1 mb-5">
        {SPECIES_LABELS[species]} draw results and harvest, as published by {state.agency.name}.
      </p>

      <HScroll className="mb-6" innerProps={{ "aria-label": "Species" } as React.HTMLAttributes<HTMLDivElement>}>
        {speciesList.map((s) => (
          <Link
            key={s.species}
            href={`/states/${state.slug}/units/${encodeURIComponent(unit)}?species=${s.species}`}
            title={s.displayName}
            aria-current={s.species === species ? "page" : undefined}
            className={`${pill(s.species === species)} whitespace-nowrap shrink-0`}
          >
            {SPECIES_LABELS[s.species]}
          </Link>
        ))}
      </HScroll>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden /> Loading…
        </div>
      ) : error ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-danger">{error}</div>
      ) : (
        <DemoGate feature={`${state.unitTerm} ${unit} history`}>
          <section className="bg-card border border-border rounded-xl p-4 sm:p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold text-foreground">Harvest history</h2>
              {categories.length > 1 && (
                <select aria-label="Harvest category" className="min-h-10 sm:min-h-0 max-w-full px-2 py-1.5 border border-border rounded-lg bg-background text-base sm:text-sm" value={cat} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              )}
            </div>
            {series.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {state.agency.shortName} doesn&apos;t publish {SPECIES_LABELS[species].toLowerCase()} harvest for this {state.unitTerm} in the years we cover.
              </p>
            ) : (
              <>
                {series.length > 1 && (
                  <div className="h-56 sm:h-64 mb-4 -mx-1 sm:mx-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series} margin={{ top: 5, right: narrow ? 0 : 10, left: narrow ? -8 : 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="year" tick={{ fontSize: narrow ? 11 : 12 }} interval="preserveStartEnd" minTickGap={narrow ? 12 : 5} />
                        <YAxis yAxisId="n" width={narrow ? 44 : 60} tick={{ fontSize: narrow ? 11 : 12 }} />
                        <YAxis yAxisId="p" orientation="right" domain={[0, 100]} unit="%" width={narrow ? 40 : 60} tick={{ fontSize: narrow ? 11 : 12 }} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: narrow ? 12 : 14 }} />
                        <Line yAxisId="n" type="monotone" dataKey="Hunters" stroke="var(--chart-4)" connectNulls={false} isAnimationActive={false} />
                        <Line yAxisId="n" type="monotone" dataKey="Harvest" stroke="var(--chart-2)" connectNulls={false} isAnimationActive={false} />
                        <Line yAxisId="p" type="monotone" dataKey="Success %" stroke="var(--chart-3)" strokeWidth={2} connectNulls={false} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <table className="w-full text-sm">
                  <thead className="text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className="text-left py-2">Season</th>
                      <th className="text-right py-2">Hunters</th>
                      <th className="text-right py-2">Harvest</th>
                      <th className="text-right py-2">Success</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().map(({ year, r }) => (
                      <tr key={year} className="border-t border-border">
                        <td className="py-2 font-semibold">
                          {year}
                          <Cite n={cite(r.sourceId)} />
                        </td>
                        <td className="py-2 text-right tabular-nums">{fmtNum(r.hunters)}</td>
                        <td className="py-2 text-right tabular-nums">{fmtNum(r.harvest)}</td>
                        <td className="py-2 text-right tabular-nums">{fmtPct(successOf(r))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>

          <section className="bg-card border border-border rounded-xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold text-foreground">Hunts that include {state.unitTerm} {unit}</h2>
              <div className="flex gap-1">
                {(["resident", "nonresident"] as const).map((r) => (
                  <button key={r} className={pill(residency === r)} onClick={() => setResidency(r)}>
                    {r === "resident" ? "Resident" : "Nonresident"}
                  </button>
                ))}
              </div>
            </div>
            {hunts.size === 0 ? (
              <p className="text-sm text-muted-foreground">No drawn hunts for this {state.unitTerm} in the draw years we cover.</p>
            ) : (
              <div className="space-y-4">
                {Array.from(hunts.entries()).map(([code, list]) => (
                  <div key={code} className="border border-border rounded-lg p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono font-semibold break-all">{code}</span>
                        <span className="block sm:inline text-sm text-muted-foreground">
                          <span className="hidden sm:inline"> · </span>
                          {list[0].description}
                        </span>
                      </div>
                      {info.pointsMatter && list.some((r) => r.byPoints?.length) && (
                        <button
                          aria-expanded={openHunt === code}
                          className="min-h-10 sm:min-h-0 -my-2 sm:my-0 text-xs font-medium text-primary hover:underline cursor-pointer"
                          onClick={() => setOpenHunt(openHunt === code ? null : code)}
                        >
                          {openHunt === code ? "Hide" : "Show"} odds by point level
                        </button>
                      )}
                    </div>
                    <div className="overflow-x-auto -mx-3 px-3">
                    <table className="w-full min-w-[260px] text-sm mt-2">
                      <thead className="text-muted-foreground text-xs">
                        <tr>
                          <th className="text-left py-1">Draw</th>
                          <th className="text-right py-1 pl-2">Quota</th>
                          <th className="text-right py-1 pl-2">
                            <span className="sm:hidden">Apps</span>
                            <span className="hidden sm:inline">Applicants</span>
                          </th>
                          <th className="text-right py-1 pl-2">Drawn</th>
                          <th className="text-right py-1 pl-3">Odds</th>
                          {info.pointsMatter && (
<th className="text-right py-1 pl-2 whitespace-nowrap">Min pts</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => {
                          const { stats, pool } = drawStats(r, residency);
                          return (
                            <tr key={r.year} className="border-t border-border">
                              <td className="py-1.5 font-semibold whitespace-nowrap">
                                {r.year}
                                <Cite n={cite(r.sourceId)} />
                                {pool === "total" && <span className="block sm:inline text-[10px] text-muted-foreground font-normal"> (all applicants)</span>}
                              </td>
                              <td className="py-1.5 pl-2 text-right tabular-nums">{fmtNum(stats?.quota)}</td>
                              <td className="py-1.5 pl-2 text-right tabular-nums">{fmtNum(stats?.applicants)}</td>
                              <td className="py-1.5 pl-2 text-right tabular-nums">{fmtNum(stats?.drawn)}</td>
                              <td className="py-1.5 pl-3 text-right tabular-nums font-semibold">{fmtPct(oddsOf(stats))}</td>
                              {info.pointsMatter && <td className="py-1.5 pl-2 text-right tabular-nums">{minPointsDrawn(r, residency) ?? "—"}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    </div>
                    {openHunt === code && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold mb-1">{list[0].year} {residency} applicants by point level</div>
                        <PointTable r={list[0]} residency={residency} />
                      </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-border">
                      <AddToPlannerButton slug={state.slug} stateName={state.name} info={info} row={list[0]} residency={residency} variant={narrow ? "card" : "inline"} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
          <PlannerToaster />
        </DemoGate>
      )}
      <SourceNotes sources={state.sources} index={cited} />
    </div>
  );
}
