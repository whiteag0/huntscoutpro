"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { DrawRecord, SpeciesInfo } from "@/data/agency/schema";
import { fmtNum, fmtPct } from "@/lib/agency-format";
import { allChoiceCompanions, drawHistory, drawStats, minPointsDrawn, oddsAtPoints, oddsOf, poolQuota, type DrawResidency } from "@/lib/agency-view";
import { Cite } from "@/components/agency/SourceNotes";
import { MobileSort, useIsNarrow, useProgressive } from "@/components/agency/mobile";
import { AddToPlannerButton, PlannerToaster } from "@/components/planner/AddToPlanner";
import { stateBySlug } from "@/data/state-list";

type SortKey = "code" | "quota" | "applicants" | "odds" | "minPts" | "atPts";

type SortState = { key: SortKey; dir: 1 | -1 };

function SortTh({ k, children, right, sort, setSort, help, className = "" }: { k: SortKey; children: React.ReactNode; right?: boolean; sort: SortState; setSort: React.Dispatch<React.SetStateAction<SortState>>; help?: string; className?: string }) {
  return (
    <th title={help} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined} className={`px-3 py-2.5 font-semibold whitespace-nowrap align-bottom ${right ? "text-right" : "text-left"} ${className}`}>
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

type Item = {
  r: DrawRecord;
  pool: ReturnType<typeof drawStats>["pool"];
  quota: number | null;
  /** The pool has no quota of its own; `quota` is the hunt's total across pools. */
  quotaIsTotal: boolean;
  /** The agency's all-choice figures for the same pool, when it also publishes a first-choice row. */
  allChoice: { applicants: number | null; drawn: number | null; odds: number | null } | null;
  applicants: number | null;
  drawn: number | null;
  odds: number | null;
  minPts: number | null;
  priorMinPts: number | null;
  priorYear?: number;
  atPts: ReturnType<typeof oddsAtPoints> | null;
};

/** Units, pool caveats and agency notes under a hunt code (shared by the table and the phone cards). */
function HuntExtras({ x, residency, stateSlug, unitTerm, species }: { x: Item; residency: DrawResidency; stateSlug: string; unitTerm: string; species: string }) {
  const unitLink = x.r.units.length === 1 ? x.r.units[0] : null;
  const unitHref = (u: string) => `/states/${stateSlug}/units/${encodeURIComponent(u)}?species=${species}`;
  return (
    <>
      {x.r.units.length > 0 && (
        <div className="text-xs mt-0.5">
          {unitTerm}{" "}
          {unitLink ? (
            <Link href={unitHref(unitLink)} className="text-primary hover:underline py-2">
              {unitLink}
            </Link>
          ) : (
            x.r.units.slice(0, 8).map((u, i) => (
              <span key={u}>
                {i > 0 && ", "}
                <Link href={unitHref(u)} className="text-primary hover:underline py-2">
                  {u}
                </Link>
              </span>
            ))
          )}
          {x.r.units.length > 8 && ` +${x.r.units.length - 8} more`}
        </div>
      )}
      {x.pool === "total" && <div className="text-[11px] text-muted-foreground mt-0.5">The agency reports one combined applicant pool for this hunt.</div>}
      {x.allChoice && (x.allChoice.applicants !== null || x.allChoice.drawn !== null) && (
        <div className="text-[11px] text-muted-foreground mt-0.5">
          All choices: {fmtNum(x.allChoice.applicants)} applicants · {fmtNum(x.allChoice.drawn)} drawn
          {x.allChoice.odds !== null ? ` (${fmtPct(x.allChoice.odds)})` : ""}
        </div>
      )}
      {x.pool !== "total" && (x.quota === null || x.quotaIsTotal) && x.applicants === null && x.drawn === null && (
        <div className="text-[11px] text-muted-foreground mt-0.5">No {residency} figures published for this hunt.</div>
      )}
      {x.r.note && (
        <details className="text-[11px] text-muted-foreground mt-0.5">
          <summary className="cursor-pointer select-none py-2 -my-2 sm:py-0 sm:my-0">Agency notes</summary>
          {x.r.note}
        </details>
      )}
    </>
  );
}

function Stat({ label, children, className = "", highlight = false }: { label: React.ReactNode; children: React.ReactNode; className?: string; highlight?: boolean }) {
  return (
    <div className={`px-2.5 py-2 min-w-0 ${highlight ? "bg-[color-mix(in_oklab,var(--primary)_6%,var(--card))]" : "bg-card"}`}>
      <dt className={`text-[11px] font-semibold leading-tight ${highlight ? "text-foreground" : "text-muted-foreground"}`}>{label}</dt>
      <dd className={`mt-0.5 text-base tabular-nums leading-snug ${className}`}>{children}</dd>
    </div>
  );
}

function oddsClass(p: number | null): string {
  if (p === null) return "text-muted-foreground";
  if (p >= 80) return "text-success font-semibold";
  if (p >= 20) return "text-warning font-semibold";
  return "text-danger font-semibold";
}

/** Column help, shown as header tooltips and in the reading guide. */
const HELP = {
  quota: "Licenses or permits available for this hunt in the applicant pool shown. Marked \"total, all pools\" when the agency prints only the hunt's total quota.",
  firstApps: "People who put this hunt as their first choice, as the agency counts them.",
  apps: "Applicants for this hunt, as the agency counts them.",
  drawn: "Applicants in the pool who drew a license.",
  odds: "Drawn ÷ applicants for everyone in the pool, at every point level. This is not your chance at your points.",
  minPts: "The lowest point level anyone in the pool drew at.",
  atPts: "Applicants and drawn at exactly your point level, from the agency's point table. When it's published, this is the figure to read.",
};

function ReadingGuide({ appsLabel, showPoints, hasPointTables, points, residency }: { appsLabel: string; showPoints: boolean; hasPointTables: boolean; points: number; residency: DrawResidency }) {
  const items: [string, string][] = [
    ["Quota", HELP.quota],
    [appsLabel, appsLabel === "1st-choice apps" ? HELP.firstApps : HELP.apps],
    ["Drawn", HELP.drawn],
    ["Draw odds", HELP.odds],
    ...(showPoints ? [["Min pts drawn", HELP.minPts] as [string, string]] : []),
    ...(hasPointTables ? [[`At your ${points} pts`, HELP.atPts] as [string, string]] : []),
  ];
  return (
    <details className="mb-3 text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg p-3">
      <summary className="font-semibold text-foreground cursor-pointer py-1 -my-1">How to read this table</summary>
      <p className="mt-2">
        Figures are for {residency === "resident" ? "resident" : "nonresident"} applicants (or the agency&apos;s one combined pool, where a hunt says so) in the year
        shown, exactly as the agency published them. A dash means the agency didn&apos;t report that figure.
      </p>
      <dl className="mt-2 space-y-1.5">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="inline font-semibold text-foreground">{k}: </dt>
            <dd className="inline">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2">
        Colours: <span className="text-success font-semibold">green</span> 80% or more, <span className="text-warning font-semibold">amber</span> 20–79%,{" "}
        <span className="text-danger font-semibold">red</span> under 20%. Past results don&apos;t guarantee the next draw.
      </p>
    </details>
  );
}

export function DrawTable({ rows, allRows, info, residency, points, stateSlug, unitTerm, cite, compare, onToggleCompare }: Props) {
  const [sort, setSort] = useState<SortState>({ key: "code", dir: 1 });
  const history = useMemo(() => drawHistory(allRows), [allRows]);
  const companions = useMemo(() => allChoiceCompanions(allRows), [allRows]);
  const showPoints = info.pointsMatter;
  const hasPointTables = showPoints && rows.some((r) => r.byPoints?.length);

  const narrow = useIsNarrow();
  const { shown, button: moreButton } = useProgressive(rows.length);
  const stateName = stateBySlug(stateSlug)?.name || stateSlug;

  const view = useMemo(() => {
    const items = rows.map((r): Item => {
      const { stats, pool } = drawStats(r, residency);
      const prior = history.get(r.huntCode)?.find((h) => h.year < r.year);
      const quota = poolQuota(r, residency);
      const all = r.choice === "first" ? companions.get(r) : undefined;
      const allStats = all ? drawStats(all, residency).stats : null;
      return {
        r,
        pool,
        quota: quota.quota,
        quotaIsTotal: quota.isTotal,
        allChoice: allStats ? { applicants: allStats.applicants ?? null, drawn: allStats.drawn ?? null, odds: oddsOf(allStats) } : null,
        applicants: stats?.applicants ?? null,
        drawn: stats?.drawn ?? null,
        odds: oddsOf(stats),
        minPts: showPoints ? minPointsDrawn(r, residency) : null,
        priorMinPts: showPoints && prior ? minPointsDrawn(prior, residency) : null,
        priorYear: prior?.year,
        atPts: hasPointTables ? oddsAtPoints(r, residency, points) : null,
      };
    });
    const val = (x: Item): number | string => {
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
  }, [rows, residency, points, sort, history, companions, showPoints, hasPointTables]);

  if (rows.length === 0) {
    return <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">No hunts match these filters.</div>;
  }

  // "1st-choice apps" only when every hunt shown is the agency's first-choice row; mixed tables label each row.
  const allFirst = rows.every((r) => r.choice === "first");
  const mixedChoice = !allFirst && rows.some((r) => r.choice === "first");
  const appsLabel = allFirst ? "1st-choice apps" : "Applicants";
  const choiceNote = (x: Item) => (mixedChoice ? <span className="block text-[11px] text-muted-foreground font-normal">{x.r.choice === "first" ? "1st choice" : "all choices"}</span> : null);
  const quotaNote = (x: Item) =>
    x.quotaIsTotal ? (
      <span className="block text-[11px] text-muted-foreground font-normal whitespace-nowrap" title="Total quota (all pools)">
        total, all pools
      </span>
    ) : null;
  const atLabel = `At your ${points} pts`;

  if (narrow) {
    const sortOptions: { key: SortKey; label: string; asc?: string; desc?: string }[] = [
      { key: "code", label: "Hunt code", asc: "A → Z", desc: "Z → A" },
      { key: "odds", label: "Draw odds" },
      { key: "quota", label: "Quota" },
      { key: "applicants", label: appsLabel },
      ...(showPoints ? [{ key: "minPts" as const, label: "Min points drawn" }] : []),
      ...(hasPointTables ? [{ key: "atPts" as const, label: `Odds at your ${points} pts` }] : []),
    ];
    return (
      <div>
        <ReadingGuide appsLabel={appsLabel} showPoints={showPoints} hasPointTables={hasPointTables} points={points} residency={residency} />
        <MobileSort options={sortOptions} value={sort.key} dir={sort.dir} onChange={(key, dir) => setSort({ key, dir: key === sort.key ? dir : key === "code" ? 1 : -1 })} />
        <ul className="space-y-3" aria-label="Hunts">
          {view.slice(0, shown).map((x) => {
            const checked = compare.includes(x.r.huntCode);
            return (
              <li key={`${x.r.huntCode}-${x.r.year}-${x.r.choice}`} className={`bg-card border rounded-xl overflow-hidden ${checked ? "border-primary ring-1 ring-primary" : "border-border"}`}>
                <div className="px-3 pt-3 pb-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-mono font-semibold text-foreground text-base break-all">
                      {x.r.huntCode}
                      <Cite n={cite(x.r.sourceId)} />
                    </div>
                    <label className="shrink-0 -mt-2 -mr-1 inline-flex min-h-10 items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleCompare(x.r.huntCode)}
                        className="h-4 w-4 accent-[var(--primary)]"
                        aria-label={`Compare ${x.r.huntCode}`}
                      />
                      Compare
                    </label>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {x.r.description}
                    {x.r.seasonDates ? ` · ${x.r.seasonDates}` : ""}
                  </div>
                  <HuntExtras x={x} residency={residency} stateSlug={stateSlug} unitTerm={unitTerm} species={info.species} />
                  <div className="mt-2">
                    <AddToPlannerButton slug={stateSlug} stateName={stateName} info={info} row={x.r} residency={residency} variant="card" />
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-px bg-border border-t border-border">
                  <Stat label={x.quotaIsTotal ? "Total quota" : "Quota"}>
                    {fmtNum(x.quota)}
                    {quotaNote(x)}
                  </Stat>
                  <Stat label={appsLabel === "Applicants" ? "Apps" : "1st-choice apps"}>
                    {fmtNum(x.applicants)}
                    {choiceNote(x)}
                  </Stat>
                  <Stat label="Drawn">{fmtNum(x.drawn)}</Stat>
                  <Stat label="Odds, all apps" className={oddsClass(x.odds)}>
                    {fmtPct(x.odds)}
                  </Stat>
                  {showPoints && (
                    <Stat label="Min pts drawn">
                      {x.minPts ?? "—"}
                      {x.priorYear && x.priorMinPts !== null && x.minPts !== null && x.priorMinPts !== x.minPts && (
                        <span className="block text-[11px] text-muted-foreground">
                          {x.priorYear}: {x.priorMinPts}
                        </span>
                      )}
                    </Stat>
                  )}
                  {hasPointTables && (
                    <Stat label={atLabel} className={oddsClass(x.atPts?.pct ?? null)} highlight>
                      {x.atPts ? (
                        <>
                          {fmtPct(x.atPts.pct)}
                          <span className="block text-[11px] text-muted-foreground font-normal">
                            {x.atPts.drawn}/{x.atPts.applicants} drawn
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground font-normal">{x.r.byPoints?.length ? "no applicants" : "not published"}</span>
                      )}
                    </Stat>
                  )}
                  {/* Fill the last row so the grid has no gaps showing the border colour. */}
                  {Array.from({ length: (3 - ((4 + (showPoints ? 1 : 0) + (hasPointTables ? 1 : 0)) % 3)) % 3 }).map((_, i) => (
                    <div key={i} className="bg-card" aria-hidden />
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
        {moreButton}
        <PlannerToaster />
      </div>
    );
  }

  return (
    <div>
    <ReadingGuide appsLabel={appsLabel} showPoints={showPoints} hasPointTables={hasPointTables} points={points} residency={residency} />
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="px-3 py-2.5 w-8" aria-label="Compare" />
              <SortTh sort={sort} setSort={setSort} k="code">Hunt</SortTh>
              <SortTh sort={sort} setSort={setSort} k="quota" right help={HELP.quota}>
                Quota
              </SortTh>
              <SortTh sort={sort} setSort={setSort} k="applicants" right help={allFirst ? HELP.firstApps : HELP.apps}>
                {appsLabel}
              </SortTh>
              <th title={HELP.drawn} className="px-3 py-2.5 text-right font-semibold align-bottom">Drawn</th>
              <SortTh sort={sort} setSort={setSort} k="odds" right help={HELP.odds}>
                <span>
                  Draw odds
                  <span className="block text-[10px] font-normal normal-case tracking-normal">all applicants</span>
                </span>
              </SortTh>
              {showPoints && (
                <SortTh sort={sort} setSort={setSort} k="minPts" right help={HELP.minPts}>
                  Min pts drawn
                </SortTh>
              )}
              {hasPointTables && (
                <SortTh sort={sort} setSort={setSort} k="atPts" right help={HELP.atPts} className="bg-primary/10 text-foreground">
                  <span>
                    At your {points} pts
                    <span className="block text-[10px] font-normal normal-case tracking-normal">your odds</span>
                  </span>
                </SortTh>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {view.map((x) => {
              return (
                <tr key={`${x.r.huntCode}-${x.r.year}-${x.r.choice}`} className="hover:bg-muted/40">
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
                    <HuntExtras x={x} residency={residency} stateSlug={stateSlug} unitTerm={unitTerm} species={info.species} />
                    <div className="mt-1">
                      <AddToPlannerButton slug={stateSlug} stateName={stateName} info={info} row={x.r} residency={residency} />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    {fmtNum(x.quota)}
                    {quotaNote(x)}
                  </td>
                  <td className="px-3 py-2.5 text-right align-top tabular-nums">
                    {fmtNum(x.applicants)}
                    {choiceNote(x)}
                  </td>
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
                    <td className={`px-3 py-2.5 text-right align-top tabular-nums bg-primary/5 ${oddsClass(x.atPts?.pct ?? null)}`}>
                      {x.atPts ? (
                        <>
                          {fmtPct(x.atPts.pct)}
                          <div className="text-[11px] text-muted-foreground font-normal">
                            {x.atPts.drawn}/{x.atPts.applicants}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground font-normal">{x.r.byPoints?.length ? "no applicants" : "not published"}</span>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PlannerToaster />
    </div>
    </div>
  );
}
