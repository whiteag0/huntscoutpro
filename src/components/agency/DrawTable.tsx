"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { DrawRecord, SpeciesInfo } from "@/data/agency/schema";
import { fmtNum, fmtPct } from "@/lib/agency-format";
import { drawHistory, drawStats, minPointsDrawn, oddsAtPoints, oddsOf, type DrawResidency } from "@/lib/agency-view";
import { Cite } from "@/components/agency/SourceNotes";

type SortKey = "code" | "quota" | "applicants" | "odds" | "minPts" | "atPts";

type SortState = { key: SortKey; dir: 1 | -1 };

function SortTh({ k, children, right, sort, setSort }: { k: SortKey; children: React.ReactNode; right?: boolean; sort: SortState; setSort: React.Dispatch<React.SetStateAction<SortState>> }) {
  return (
    <th className={`px-3 py-2.5 font-semibold whitespace-nowrap ${right ? "text-right" : "text-left"}`}>
      <button
        type="button"
        className="inline-flex items-center gap-1 hover:text-foreground cursor-pointer"
        onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? ((-s.dir) as 1 | -1) : k === "code" ? 1 : -1 }))}
      >
        {children}
        {sort.key === k && (sort.dir === 1 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
      </button>
    </th>
  );
}

interface Props {
  rows: DrawRecord[];
  allRows: DrawRecord[];
  info: SpeciesInfo;
  residency: DrawResidency;
  points: number;
  stateSlug: string;
  unitTerm: string;
  cite: (id: string) => number | undefined;
  compare: string[];
  onToggleCompare: (code: string) => void;
}

function oddsClass(p: number | null): string {
  if (p === null) return "text-muted-foreground";
  if (p >= 80) return "text-success font-semibold";
  if (p >= 20) return "text-warning font-semibold";
  return "text-danger font-semibold";
}

export function DrawTable({ rows, allRows, info, residency, points, stateSlug, unitTerm, cite, compare, onToggleCompare }: Props) {
  const [sort, setSort] = useState<SortState>({ key: "code", dir: 1 });
  const history = useMemo(() => drawHistory(allRows), [allRows]);
  const showPoints = info.pointsMatter;
  const hasPointTables = showPoints && rows.some((r) => r.byPoints?.length);

  const view = useMemo(() => {
    const items = rows.map((r) => {
      const { stats, pool } = drawStats(r, residency);
      const prior = history.get(r.huntCode)?.find((h) => h.year < r.year);
      return {
        r,
        pool,
        quota: stats?.quota ?? null,
        applicants: stats?.applicants ?? null,
        drawn: stats?.drawn ?? null,
        odds: oddsOf(stats),
        minPts: showPoints ? minPointsDrawn(r, residency) : null,
        priorMinPts: showPoints && prior ? minPointsDrawn(prior, residency) : null,
        priorYear: prior?.year,
        atPts: hasPointTables ? oddsAtPoints(r, residency, points) : null,
      };
    });
    const val = (x: (typeof items)[number]): number | string => {
      switch (sort.key) {
        case "code":
          return x.r.huntCode;
        case "quota":
          return x.quota ?? -1;
        case "applicants":
          return x.applicants ?? -1;
        case "odds":
          return x.odds ?? -1;
        case "minPts":
          return x.minPts ?? -1;
        case "atPts":
          return x.atPts?.pct ?? -1;
      }
    };
    return items.sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      const c = typeof av === "string" ? av.localeCompare(String(bv), "en", { numeric: true }) : av - (bv as number);
      return c * sort.dir;
    });
  }, [rows, residency, points, sort, history, showPoints, hasPointTables]);

  if (rows.length === 0) {
    return <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">No hunts match these filters.</div>;
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2.5 w-8" aria-label="Compare" />
              <SortTh sort={sort} setSort={setSort} k="code">Hunt</SortTh>
              <SortTh sort={sort} setSort={setSort} k="quota" right>
                Quota
              </SortTh>
              <SortTh sort={sort} setSort={setSort} k="applicants" right>
                {rows[0]?.choice === "first" ? "1st-choice apps" : "Applicants"}
              </SortTh>
              <th className="px-3 py-2.5 text-right font-semibold">Drawn</th>
              <SortTh sort={sort} setSort={setSort} k="odds" right>
                Draw odds
              </SortTh>
              {showPoints && (
                <SortTh sort={sort} setSort={setSort} k="minPts" right>
                  Min pts drawn
                </SortTh>
              )}
              {hasPointTables && (
                <SortTh sort={sort} setSort={setSort} k="atPts" right>
                  At {points} pts
                </SortTh>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {view.map((x) => {
              const unitLink = x.r.units.length === 1 ? x.r.units[0] : null;
              return (
                <tr key={`${x.r.huntCode}-${x.r.year}`} className="hover:bg-muted/40">
                  <td className="px-3 py-2.5 align-top">
                    <input
                      type="checkbox"
                      aria-label={`Compare ${x.r.huntCode}`}
                      checked={compare.includes(x.r.huntCode)}
                      onChange={() => onToggleCompare(x.r.huntCode)}
                      className="accent-[var(--primary)]"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-top min-w-[220px]">
                    <div className="font-mono font-semibold text-foreground">
                      {x.r.huntCode}
                      <Cite n={cite(x.r.sourceId)} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {x.r.description}
                      {x.r.seasonDates ? ` · ${x.r.seasonDates}` : ""}
                    </div>
                    {x.r.units.length > 0 && (
                      <div className="text-xs mt-0.5">
                        {unitTerm} {unitLink ? (
                          <Link href={`/states/${stateSlug}/units/${encodeURIComponent(unitLink)}?species=${info.species}`} className="text-primary hover:underline">
                            {unitLink}
                          </Link>
                        ) : (
                          x.r.units.slice(0, 8).map((u, i) => (
                            <span key={u}>
                              {i > 0 && ", "}
                              <Link href={`/states/${stateSlug}/units/${encodeURIComponent(u)}?species=${info.species}`} className="text-primary hover:underline">
                                {u}
                              </Link>
                            </span>
                          ))
                        )}
                        {x.r.units.length > 8 && ` +${x.r.units.length - 8} more`}
                      </div>
                    )}
                    {x.pool === "total" && <div className="text-[11px] text-muted-foreground mt-0.5">The agency reports one combined applicant pool for this hunt.</div>}
                    {x.pool !== "total" && x.quota === null && x.applicants === null && x.drawn === null && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">No {residency} figures published for this hunt.</div>
                    )}
                    {x.r.note && (
                      <details className="text-[11px] text-muted-foreground mt-0.5">
                        <summary className="cursor-pointer select-none">Agency notes</summary>
                        {x.r.note}
                      </details>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">{fmtNum(x.quota)}</td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">{fmtNum(x.applicants)}</td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">{fmtNum(x.drawn)}</td>
                  <td className={`px-3 py-2.5 text-right align-top tabular-nums ${oddsClass(x.odds)}`}>{fmtPct(x.odds)}</td>
                  {showPoints && (
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">
                      {x.minPts ?? "—"}
                      {x.priorYear && x.priorMinPts !== null && x.minPts !== null && x.priorMinPts !== x.minPts && (
                        <div className="text-[11px] text-muted-foreground">
                          {x.priorYear}: {x.priorMinPts}
                        </div>
                      )}
                    </td>
                  )}
                  {hasPointTables && (
                    <td className={`px-3 py-2.5 text-right align-top tabular-nums ${oddsClass(x.atPts?.pct ?? null)}`}>
                      {x.atPts ? (
                        <>
                          {fmtPct(x.atPts.pct)}
                          <div className="text-[11px] text-muted-foreground font-normal">
                            {x.atPts.drawn}/{x.atPts.applicants}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground font-normal">no applicants</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
