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

const pill = (on: boolean) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium border transition cursor-pointer ${
    on ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/50"
  }`;

function PointTable({ r, residency }: { r: DrawRecord; residency: DrawResidency }) {
  const rows = (r.byPoints || []).filter((p) => p[residency]?.applicants).sort((a, b) => b.points - a.points);
  if (!rows.length) return <p className="text-xs text-muted-foreground">No {residency} applicants by point level published for {r.year}.</p>;
  return (
    <table className="text-xs w-full max-w-md">
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
        <Link href="/states" className="text-primary hover:underline">
          States
        </Link>
        {" / "}
        <Link href={`/states/${state.slug}?species=${species}`} className="text-primary hover:underline">
          {state.name}
        </Link>
        {" / "}
        <span className="text-foreground font-medium">
          {state.unitTerm} {unit}
        </span>
      </nav>
      <h1 className="text-3xl font-bold text-foreground">
        {state.name} {state.unitTerm} {unit}
        {name ? <span className="text-muted-foreground font-normal">: {name}</span> : null}
      </h1>
      <p className="text-muted-foreground mt-1 mb-5">
        {SPECIES_LABELS[species]} draw results and harvest, as published by {state.agency.name}.
      </p>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        {speciesList.map((s) => (
          <Link key={s.species} href={`/states/${state.slug}/units/${encodeURIComponent(unit)}?species=${s.species}`} title={s.displayName} className={`${pill(s.species === species)} whitespace-nowrap`}>
            {SPECIES_LABELS[s.species]}
          </Link>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden /> Loading…
        </div>
      ) : error ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-danger">{error}</div>
      ) : (
        <DemoGate feature={`${state.unitTerm} ${unit} history`}>
          <section className="bg-card border border-border rounded-xl p-5 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold text-foreground">Harvest history</h2>
              {categories.length > 1 && (
                <select className="px-2 py-1.5 border border-border rounded-lg bg-background text-sm" value={cat} onChange={(e) => setCategory(e.target.value)}>
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
                  <div className="h-64 mb-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="year" />
                        <YAxis yAxisId="n" />
                        <YAxis yAxisId="p" orientation="right" domain={[0, 100]} unit="%" />
                        <Tooltip />
                        <Legend />
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

          <section className="bg-card border border-border rounded-xl p-5">
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
                      <div>
                        <span className="font-mono font-semibold">{code}</span>
                        <span className="text-sm text-muted-foreground"> · {list[0].description}</span>
                      </div>
                      {info.pointsMatter && list.some((r) => r.byPoints?.length) && (
                        <button className="text-xs text-primary hover:underline cursor-pointer" onClick={() => setOpenHunt(openHunt === code ? null : code)}>
                          {openHunt === code ? "Hide" : "Show"} odds by point level
                        </button>
                      )}
                    </div>
                    <table className="w-full text-sm mt-2">
                      <thead className="text-muted-foreground text-xs">
                        <tr>
                          <th className="text-left py-1">Draw</th>
                          <th className="text-right py-1">Quota</th>
                          <th className="text-right py-1">Applicants</th>
                          <th className="text-right py-1">Drawn</th>
                          <th className="text-right py-1">Odds</th>
                          {info.pointsMatter && <th className="text-right py-1">Min pts</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((r) => {
                          const { stats, pool } = drawStats(r, residency);
                          return (
                            <tr key={r.year} className="border-t border-border">
                              <td className="py-1 font-semibold">
                                {r.year}
                                <Cite n={cite(r.sourceId)} />
                                {pool === "total" && <span className="text-[10px] text-muted-foreground font-normal"> (all applicants)</span>}
                              </td>
                              <td className="py-1 text-right tabular-nums">{fmtNum(stats?.quota)}</td>
                              <td className="py-1 text-right tabular-nums">{fmtNum(stats?.applicants)}</td>
                              <td className="py-1 text-right tabular-nums">{fmtNum(stats?.drawn)}</td>
                              <td className="py-1 text-right tabular-nums">{fmtPct(oddsOf(stats))}</td>
                              {info.pointsMatter && <td className="py-1 text-right tabular-nums">{minPointsDrawn(r, residency) ?? "—"}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {openHunt === code && (
                      <div className="mt-3">
                        <div className="text-xs font-semibold mb-1">{list[0].year} {residency} applicants by point level</div>
                        <PointTable r={list[0]} residency={residency} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </DemoGate>
      )}
      <SourceNotes sources={state.sources} index={cited} />
    </div>
  );
}
