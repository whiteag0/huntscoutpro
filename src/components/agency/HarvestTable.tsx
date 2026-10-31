"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { HarvestRecord, Species } from "@/data/agency/schema";
import { fmtNum, fmtPct, sortUnitIds } from "@/lib/agency-format";
import { harvestMethodKey, isRealUnit, successOf, unitNameOf } from "@/lib/agency-view";
import { Cite } from "@/components/agency/SourceNotes";

type SortKey = "unit" | "hunters" | "harvest" | "success";

/** Rows of the same unit/hunt/category across years. */
export const seriesKey = (r: HarvestRecord) => [r.unit, r.hunt || "", harvestMethodKey(r), r.sex || "", r.residency || ""].join("|");

type SortState = { key: SortKey; dir: 1 | -1 };

function SortTh({ k, children, right, sort, setSort }: { k: SortKey; children: React.ReactNode; right?: boolean; sort: SortState; setSort: React.Dispatch<React.SetStateAction<SortState>> }) {
  return (
    <th className={`px-3 py-2.5 font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : k === "unit" ? 1 : -1 }))}
      >
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );
}

interface Props {
  rows: HarvestRecord[];
  allRows: HarvestRecord[];
  species: Species;
  stateSlug: string;
  unitTerm: string;
  unitNames: Record<string, string>;
  cite: (id: string) => number | undefined;
}

export function HarvestTable({ rows, allRows, species, stateSlug, unitTerm, unitNames, cite }: Props) {
  const [sort, setSort] = useState<SortState>({ key: "unit", dir: 1 });

  const series = useMemo(() => {
    const m = new Map<string, HarvestRecord[]>();
    for (const r of allRows) {
      const k = seriesKey(r);
      const list = m.get(k) || [];
      list.push(r);
      m.set(k, list);
    }
    for (const list of m.values()) list.sort((a, b) => b.year - a.year);
    return m;
  }, [allRows]);

  const view = useMemo(() => {
    const priorOf = (r: HarvestRecord) => series.get(seriesKey(r))?.find((p) => p.year < r.year);
    const items = rows.map((r) => ({ r, success: successOf(r), prior: priorOf(r) }));
    const val = (x: (typeof items)[number]) =>
      sort.key === "unit" ? 0 : sort.key === "hunters" ? x.r.hunters ?? -1 : sort.key === "harvest" ? x.r.harvest ?? -1 : x.success ?? -1;
    return items.sort((a, b) => (sort.key === "unit" ? sortUnitIds(a.r.unit, b.r.unit) || (a.r.hunt || "").localeCompare(b.r.hunt || "") : val(a) - val(b)) * sort.dir);
  }, [rows, series, sort]);

  const hasHunt = rows.some((r) => r.hunt);
  const hasSplit = rows.some((r) => (r.sex && r.sex !== "all") || (r.residency && r.residency !== "all"));
  const showMethod = new Set(rows.map(harvestMethodKey)).size > 1;

  if (rows.length === 0) {
    return <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">No harvest rows match these filters.</div>;
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <SortTh sort={sort} setSort={setSort} k="unit">{unitTerm}</SortTh>
              {hasHunt && <th className="px-3 py-2.5 text-left font-semibold">Hunt</th>}
              {(showMethod || hasSplit) && <th className="px-3 py-2.5 text-left font-semibold">Category</th>}
              <SortTh sort={sort} setSort={setSort} k="hunters" right>
                Hunters
              </SortTh>
              <SortTh sort={sort} setSort={setSort} k="harvest" right>
                Harvest
              </SortTh>
              <SortTh sort={sort} setSort={setSort} k="success" right>
                Success
              </SortTh>
              <th className="px-3 py-2.5 text-right font-semibold">Prior year</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {view.map(({ r, success, prior }, i) => {
              const priorSuccess = prior ? successOf(prior) : null;
              const name = r.unitName || unitNameOf(unitNames, r.unit);
              const category = [showMethod ? harvestMethodKey(r) : "", r.sex && r.sex !== "all" ? r.sex : "", r.residency && r.residency !== "all" ? r.residency : ""]
                .filter(Boolean)
                .join(" · ");
              return (
                <tr key={`${r.unit}-${r.hunt}-${harvestMethodKey(r)}-${r.sex}-${r.residency}-${i}`} className="hover:bg-muted/40">
                  <td className="px-3 py-2.5 align-top">
                    {!isRealUnit(r.unit) ? (
                      <span className="font-semibold">{r.unit === "Statewide" ? "Statewide" : "Multi-unit"}</span>
                    ) : (
                      <Link href={`/states/${stateSlug}/units/${encodeURIComponent(r.unit)}?species=${species}`} className="font-semibold text-primary hover:underline">
                        {r.unit}
                      </Link>
                    )}
                    <Cite n={cite(r.sourceId)} />
                    {name && <div className="text-xs text-muted-foreground">{name}</div>}
                    {r.note && (
                      <details className="text-[11px] text-muted-foreground mt-0.5">
                        <summary className="cursor-pointer select-none">Agency notes</summary>
                        {r.note}
                      </details>
                    )}
                  </td>
                  {hasHunt && <td className="px-3 py-2.5 align-top font-mono text-xs">{r.hunt || "—"}</td>}
                  {(showMethod || hasSplit) && <td className="px-3 py-2.5 align-top text-xs text-muted-foreground capitalize">{category || "All"}</td>}
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">{fmtNum(r.hunters)}</td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">{fmtNum(r.harvest)}</td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums font-semibold">
                    {fmtPct(success)}
                    {r.successComputed && <div className="text-[10px] font-normal text-muted-foreground">harvest ÷ hunters</div>}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums text-xs text-muted-foreground">
                    {prior ? (
                      <>
                        {prior.year}: {fmtPct(priorSuccess)}
                        <div>{fmtNum(prior.harvest)} harvested</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
