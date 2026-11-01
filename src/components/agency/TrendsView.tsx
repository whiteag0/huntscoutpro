"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import { SPECIES_LABELS, type Species } from "@/data/types";
import type { SourceRef } from "@/data/agency/schema";
import { fmtNum, fmtPct, sortUnitIds } from "@/lib/agency-format";
import { drawHistory, drawStats, harvestMethodKey, headlineHarvestRows, minPointsDrawn, oddsOf, successOf, years, type DrawResidency } from "@/lib/agency-view";
import { DemoGate } from "@/components/DemoGate";
import { useSpeciesData } from "@/components/agency/useSpeciesData";
import { SourceNotes, footnoteIndex } from "@/components/agency/SourceNotes";
import { pill } from "@/components/agency/mobile";

// First column stays put while the year columns scroll sideways on a phone.
const stickyTh = "sticky left-0 z-10 bg-muted text-left px-3 py-2.5 shadow-[1px_0_0_var(--border)]";
const stickyTd = "sticky left-0 z-10 bg-card px-3 py-2 shadow-[1px_0_0_var(--border)]";

interface Option {
  slug: string;
  name: string;
  unitTerm: string;
  species: { species: Species; pointsMatter: boolean }[];
}

function Delta({ v, invert, suffix = "" }: { v: number | null; invert?: boolean; suffix?: string }) {
  if (v === null || v === 0) return <span className="text-muted-foreground">{v === 0 ? "no change" : "—"}</span>;
  const up = v > 0;
  const bad = invert ? !up : up;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${bad ? "text-danger" : "text-success"}`}>
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {up ? "+" : ""}
      {Number(v.toFixed(1))}
      {suffix}
    </span>
  );
}

export function TrendsView({ options, slug, species, pointsMatter, sources }: { options: Option[]; slug: string; species: Species; pointsMatter: boolean; sources: SourceRef[] }) {
  const router = useRouter();
  const opt = options.find((o) => o.slug === slug)!;
  const { data, loading, error } = useSpeciesData(slug, species);
  const [residency, setResidency] = useState<DrawResidency>("resident");

  const go = (s: string, spc?: Species) => {
    const o = options.find((x) => x.slug === s)!;
    const next = o.species.some((x) => x.species === spc) ? spc : o.species[0].species;
    router.push(`/trends?state=${s}&species=${next}`);
  };

  const drawYears = useMemo(() => years(data?.draw || []).slice(0, 5).reverse(), [data]);
  const drawTrends = useMemo(() => {
    if (!data) return [];
    return Array.from(drawHistory(data.draw).entries())
      .map(([code, all]) => [code, all.filter((r) => drawYears.includes(r.year))] as const)
      .filter(([, list]) => list.length > 1)
      .map(([code, list]) => {
        const byYear = new Map(list.map((r) => [r.year, r]));
        const first = list[list.length - 1];
        const last = list[0];
        const mp = (r: typeof first) => (pointsMatter ? minPointsDrawn(r, residency) : null);
        const od = (r: typeof first) => oddsOf(drawStats(r, residency).stats);
        const dPts = mp(first) !== null && mp(last) !== null ? mp(last)! - mp(first)! : null;
        const dOdds = od(first) !== null && od(last) !== null ? od(last)! - od(first)! : null;
        return { code, desc: last.description, byYear, mp, od, dPts, dOdds, ids: list.map((r) => r.sourceId) };
      })
      .sort((a, b) => (pointsMatter ? (b.dPts ?? -99) - (a.dPts ?? -99) : (a.dOdds ?? 99) - (b.dOdds ?? 99)))
      .slice(0, 60);
  }, [data, residency, pointsMatter, drawYears]);

  const harvestYears = useMemo(() => years(data?.harvest || []).slice(0, 6).reverse(), [data]);
  const harvestTrends = useMemo(() => {
    if (!data) return [];
    const rows = headlineHarvestRows(data.harvest).filter((r) => !r.hunt);
    const hasAll = rows.some((r) => r.method === "all");
    const use = hasAll ? rows.filter((r) => r.method === "all") : rows.filter((r) => harvestMethodKey(r) === harvestMethodKey(rows[0] || ({} as never)));
    const m = new Map<string, Map<number, (typeof use)[number]>>();
    for (const r of use) {
      const inner = m.get(r.unit) || new Map();
      inner.set(r.year, r);
      m.set(r.unit, inner);
    }
    return Array.from(m.entries())
      .map(([unit, all]) => [unit, new Map(Array.from(all.entries()).filter(([y]) => harvestYears.includes(y)))] as const)
      .filter(([, byYear]) => byYear.size > 1)
      .map(([unit, byYear]) => {
        const ys = Array.from(byYear.keys()).sort();
        const a = successOf(byYear.get(ys[0])!);
        const b = successOf(byYear.get(ys[ys.length - 1])!);
        return { unit, byYear, d: a !== null && b !== null ? b - a : null, ids: Array.from(byYear.values()).map((r) => r.sourceId) };
      })
      .sort((x, y) => sortUnitIds(x.unit, y.unit));
  }, [data, harvestYears]);

  const cited = useMemo(() => footnoteIndex([...drawTrends.flatMap((t) => t.ids), ...harvestTrends.flatMap((t) => t.ids)]), [drawTrends, harvestTrends]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:py-10">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Trends</h1>
      <p className="text-muted-foreground mt-2 max-w-3xl">
        How draw odds, the points it takes to draw, and harvest success have moved over the years the agency has published. Only
        hunts and units with at least two years of agency data appear.
      </p>

      <div className="mt-6 bg-card border border-border rounded-xl p-3 sm:p-4 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end sm:gap-4">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted-foreground mb-1">State</span>
          <select className="w-full sm:w-auto min-h-10 sm:min-h-0 px-2 py-1.5 border border-border rounded-lg bg-background font-semibold text-base sm:text-sm" value={slug} onChange={(e) => go(e.target.value, species)}>
            {options.map((o) => (
              <option key={o.slug} value={o.slug}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Species</span>
          <select className="w-full sm:w-auto min-h-10 sm:min-h-0 px-2 py-1.5 border border-border rounded-lg bg-background font-semibold text-base sm:text-sm" value={species} onChange={(e) => go(slug, e.target.value as Species)}>
            {opt.species.map((s) => (
              <option key={s.species} value={s.species}>
                {SPECIES_LABELS[s.species]}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 grid grid-cols-2 gap-1 sm:flex">
          {(["resident", "nonresident"] as const).map((r) => (
            <button key={r} className={pill(residency === r)} onClick={() => setResidency(r)}>
              {r === "resident" ? "Resident" : "Nonresident"}
            </button>
          ))}
        </div>
        <Link href={`/states/${slug}?species=${species}`} className="col-span-2 inline-flex min-h-10 sm:min-h-0 items-center text-sm text-primary hover:underline sm:ml-auto">
          Open {opt.name} {SPECIES_LABELS[species]} →
        </Link>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden /> Loading…
        </div>
      ) : error ? (
        <div className="mt-6 bg-card border border-border rounded-xl p-8 text-center text-danger">{error}</div>
      ) : (
        <DemoGate feature="draw and harvest trends">
          <section className="mt-8">
            <h2 className="text-xl font-bold text-foreground mb-1">{pointsMatter ? "Point creep and draw odds" : "Draw odds by year"}</h2>
            <p className="text-sm text-muted-foreground mb-3">
              {pointsMatter
                ? "Minimum points drawn and overall odds per draw year. Hunts where the points needed rose the most are listed first."
                : `${opt.name} doesn't use points for ${SPECIES_LABELS[species].toLowerCase()}, so only overall odds are shown. Hunts whose odds fell the most are listed first.`}
            </p>
            {drawTrends.length > 0 && drawYears.length > 2 && <p className="sm:hidden text-xs text-muted-foreground mb-2">Swipe the table sideways to see every year.</p>}
            {drawTrends.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-card border border-border rounded-xl p-6">Not enough draw years published to show a trend.</p>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-x-auto overscroll-x-contain" role="region" aria-label="Scrollable table" tabIndex={0}>
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className={stickyTh}>Hunt</th>
                      {drawYears.map((y) => (
                        <th key={y} className="text-right px-3 py-2.5">
                          {y}
                        </th>
                      ))}
                      <th className="text-right px-3 py-2.5">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {drawTrends.map((t) => (
                      <tr key={t.code}>
                        <td className={`${stickyTd} min-w-[9.5rem] max-w-[11rem] sm:min-w-[200px] sm:max-w-none`}>
                          <div className="font-mono font-semibold break-all">{t.code}</div>
                          <div className="text-xs text-muted-foreground line-clamp-3 sm:line-clamp-none" title={t.desc}>
                            {t.desc}
                          </div>
                        </td>
                        {drawYears.map((y) => {
                          const r = t.byYear.get(y);
                          return (
                            <td key={y} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                              {r ? (
                                <>
                                  {pointsMatter && <div className="font-semibold">{t.mp(r) ?? "—"} pts</div>}
                                  <div className={pointsMatter ? "text-xs text-muted-foreground" : "font-semibold"}>{fmtPct(t.od(r))}</div>
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right whitespace-nowrap text-xs">
                          {pointsMatter ? <Delta v={t.dPts} suffix=" pts" /> : <Delta v={t.dOdds} invert suffix=" pp" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-bold text-foreground mb-1">Harvest success by {opt.unitTerm}</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Success rate per season as published. On a computer, hover a cell for hunters and harvest; open a {opt.unitTerm} for the full numbers.
            </p>
            {harvestTrends.length > 0 && harvestYears.length > 3 && <p className="sm:hidden text-xs text-muted-foreground mb-2">Swipe the table sideways to see every season.</p>}
            {harvestTrends.length === 0 ? (
              <p className="text-sm text-muted-foreground bg-card border border-border rounded-xl p-6">Not enough harvest seasons published to show a trend.</p>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-x-auto overscroll-x-contain" role="region" aria-label="Scrollable table" tabIndex={0}>
                <table className="w-full text-sm">
                  <thead className="bg-muted text-muted-foreground text-xs uppercase">
                    <tr>
                      <th className={stickyTh}>{opt.unitTerm}</th>
                      {harvestYears.map((y) => (
                        <th key={y} className="text-right px-3 py-2.5">
                          {y}
                        </th>
                      ))}
                      <th className="text-right px-3 py-2.5">Change</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {harvestTrends.map((t) => (
                      <tr key={t.unit}>
                        <td className={`${stickyTd} font-semibold whitespace-nowrap`}>
                          {t.unit === "Statewide" ? (
                            "Statewide"
                          ) : (
                            <Link href={`/states/${slug}/units/${encodeURIComponent(t.unit)}?species=${species}`} className="inline-flex min-h-10 min-w-10 items-center text-primary hover:underline -my-2">
                              {t.unit}
                            </Link>
                          )}
                        </td>
                        {harvestYears.map((y) => {
                          const r = t.byYear.get(y);
                          return (
                            <td key={y} className="px-3 py-2 text-right tabular-nums" title={r ? `${fmtNum(r.harvest)} harvested / ${fmtNum(r.hunters)} hunters` : undefined}>
                              {r ? fmtPct(successOf(r)) : <span className="text-muted-foreground">—</span>}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right text-xs whitespace-nowrap">
                          <Delta v={t.d} invert suffix=" pp" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </DemoGate>
      )}
      <SourceNotes sources={sources} index={cited} />
    </div>
  );
}
