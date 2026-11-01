"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { SPECIES_LABELS, type Species } from "@/data/types";
import type { DrawRecord, HarvestRecord } from "@/data/agency/schema";
import { fmtNum, fmtPct } from "@/lib/agency-format";
import { drawHistory, drawStats, headlineHarvestRows, sameUnit, minPointsDrawn, oddsAtPoints, oddsOf, successOf, type DrawResidency } from "@/lib/agency-view";
import { DemoGate } from "@/components/DemoGate";
import { useSpeciesData } from "@/components/agency/useSpeciesData";
import { SourceNotes, footnoteIndex, Cite } from "@/components/agency/SourceNotes";
import type { SourceRef } from "@/data/agency/schema";
import { pill } from "@/components/agency/mobile";

interface Props {
  slug: string;
  stateName: string;
  unitTerm: string;
  species: Species;
  pointsMatter: boolean;
  codes: string[];
  sources: SourceRef[];
}

/** Unit-level harvest for a hunt's single unit, latest season, all-methods row when published. */
function unitHarvest(harvest: HarvestRecord[], units: string[]): HarvestRecord | null {
  if (units.length !== 1) return null;
  const rows = headlineHarvestRows(harvest.filter((r) => sameUnit(r.unit, units[0]) && !r.hunt));
  const all = rows.filter((r) => r.method === "all");
  const pick = (all.length ? all : rows).sort((a, b) => b.year - a.year);
  return pick[0] || null;
}

type Col = { code: string; list: DrawRecord[]; latest: DrawRecord; harvest: HarvestRecord | null };

type RowDef = { label: string; render: (c: Col) => React.ReactNode };

export function CompareView({ slug, stateName, unitTerm, species, pointsMatter, codes, sources }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { data, loading, error } = useSpeciesData(slug, species);
  const [residency, setResidency] = useState<DrawResidency>("resident");
  const [points, setPoints] = useState(0);

  const cols = useMemo((): Col[] => {
    if (!data) return [];
    const hist = drawHistory(data.draw);
    return codes
      .map((c) => ({ code: c, list: hist.get(c) || [] }))
      .filter((c) => c.list.length > 0)
      .map((c) => ({ ...c, latest: c.list[0] as DrawRecord, harvest: unitHarvest(data.harvest, c.list[0].units) }));
  }, [data, codes]);

  const cited = useMemo(() => footnoteIndex(cols.flatMap((c) => [...c.list.map((r) => r.sourceId), ...(c.harvest ? [c.harvest.sourceId] : [])])), [cols]);
  const cite = (id: string) => cited.get(id);

  const rowDefs: RowDef[] = [
    { label: unitTerm, render: (c) => c.latest.units.join(", ") || "—" },
    { label: "Latest draw", render: (c) => <>{c.latest.year}<Cite n={cite(c.latest.sourceId)} /></> },
    { label: "Quota", render: (c) => fmtNum(drawStats(c.latest, residency).stats?.quota) },
    { label: "Applicants", render: (c) => fmtNum(drawStats(c.latest, residency).stats?.applicants) },
    { label: "Drawn", render: (c) => fmtNum(drawStats(c.latest, residency).stats?.drawn) },
    { label: "Draw odds", render: (c) => <b>{fmtPct(oddsOf(drawStats(c.latest, residency).stats))}</b> },
    ...(pointsMatter
      ? [
          { label: "Min points drawn", render: (c: Col) => minPointsDrawn(c.latest, residency) ?? "—" },
          {
            label: `Odds at ${points} pts`,
            render: (c: Col) => {
              const o = oddsAtPoints(c.latest, residency, points);
              return o ? `${fmtPct(o.pct)} (${o.drawn}/${o.applicants})` : c.latest.byPoints ? "no applicants" : "not published";
            },
          },
        ]
      : []),
    {
      label: "Odds by year",
      render: (c) => (
        <div className="space-y-0.5 text-xs">
          {c.list.map((r) => (
            <div key={r.year}>
              {r.year}: {fmtPct(oddsOf(drawStats(r, residency).stats))}
              {pointsMatter && minPointsDrawn(r, residency) !== null ? ` · min ${minPointsDrawn(r, residency)} pts` : ""}
            </div>
          ))}
        </div>
      ),
    },
    {
      label: "Unit harvest (latest)",
      render: (c) =>
        c.harvest ? (
          <>
            {c.harvest.year}: {fmtNum(c.harvest.harvest)} of {fmtNum(c.harvest.hunters)} hunters ({fmtPct(successOf(c.harvest))})
            <Cite n={cite(c.harvest.sourceId)} />
          </>
        ) : (
          <span className="text-xs text-muted-foreground">{c.latest.units.length > 1 ? "multi-unit hunt" : "not published"}</span>
        ),
    },
  ];

  const swipeRef = useRef<HTMLDivElement>(null);
  const [activeRaw, setActive] = useState(0);
  // Removing a hunt shrinks the list without a scroll event; keep the indicator in range.
  const active = Math.min(activeRaw, Math.max(0, cols.length - 1));
  const onSwipe = () => {
    const el = swipeRef.current;
    if (!el || !el.children.length) return;
    const w = (el.children[0] as HTMLElement).offsetWidth + 12;
    setActive(Math.max(0, Math.min(cols.length - 1, Math.round(el.scrollLeft / w))));
  };

  const remove = (code: string) => {
    const next = codes.filter((c) => c !== code);
    router.replace(`${pathname}?state=${slug}&species=${species}&codes=${next.map(encodeURIComponent).join(",")}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 sm:py-10">
      <nav className="text-sm text-muted-foreground mb-4">
        <Link href={`/states/${slug}?species=${species}`} className="text-primary hover:underline py-2">
          {stateName} {SPECIES_LABELS[species]}
        </Link>{" "}
        / Compare
      </nav>
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Compare hunts</h1>
      <p className="text-muted-foreground mt-1 mb-6">Agency draw results for each hunt, side by side, with the latest harvest for single-{unitTerm} hunts.</p>

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div className="flex gap-1">
          {(["resident", "nonresident"] as const).map((r) => (
            <button key={r} className={pill(residency === r)} onClick={() => setResidency(r)}>
              {r === "resident" ? "Resident" : "Nonresident"}
            </button>
          ))}
        </div>
        {pointsMatter && (
          <label className="text-sm">
            <span className="block text-xs font-semibold text-muted-foreground mb-1">My points</span>
            <input type="number" inputMode="numeric" min={0} max={40} value={points} onChange={(e) => setPoints(Math.max(0, Math.min(40, parseInt(e.target.value) || 0)))} className="w-20 min-h-10 sm:min-h-0 px-2 py-1.5 border border-border rounded-lg text-center font-bold bg-background text-base sm:text-sm" />
          </label>
        )}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden /> Loading…
        </div>
      ) : error ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-danger">{error}</div>
      ) : (
        <DemoGate feature="hunt comparisons">
          {cols.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
              Pick up to four hunts on the{" "}
              <Link href={`/states/${slug}?species=${species}`} className="text-primary hover:underline">
                {stateName} page
              </Link>{" "}
              to compare them here.
            </div>
          ) : (
            <>
              {/* Phones: one card per hunt, swiped sideways; rows stay in the same order on every card. */}
              <div className="sm:hidden">
                {cols.length > 1 && (
                  <p className="text-xs text-muted-foreground mb-2" aria-live="polite">
                    Hunt {active + 1} of {cols.length} · swipe sideways to compare
                  </p>
                )}
                <div
                  ref={swipeRef}
                  onScroll={onSwipe}
                  className="-mx-4 px-4 flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 no-scrollbar pb-2"
                  aria-label="Hunts being compared"
                  role="region"
                  tabIndex={0}
                >
                  {cols.map((c) => (
                    <article key={c.code} className={`snap-start shrink-0 ${cols.length > 1 ? "w-[86%]" : "w-full"} bg-card border border-border rounded-xl p-4`}>
                      <div className="flex items-start justify-between gap-2">
                        <h2 className="font-mono font-bold text-foreground text-base break-all">{c.code}</h2>
                        <button
                          onClick={() => remove(c.code)}
                          aria-label={`Remove ${c.code}`}
                          className="-mt-2 -mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground cursor-pointer"
                        >
                          <X className="w-4 h-4" aria-hidden />
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground -mt-1">{c.latest.description}</p>
                      <dl className="mt-3 divide-y divide-border border-t border-border text-sm">
                        {rowDefs.map((row) => (
                          <div key={row.label} className="flex items-start justify-between gap-3 py-2">
                            <dt className="text-xs font-semibold text-muted-foreground pt-0.5">{row.label}</dt>
                            <dd className="text-right tabular-nums">{row.render(c)}</dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  ))}
                </div>
                {cols.length > 1 && (
                  <div className="flex justify-center gap-1.5 mt-2" aria-hidden>
                    {cols.map((c, i) => (
                      <span key={c.code} className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-primary" : "w-1.5 bg-border"}`} />
                    ))}
                  </div>
                )}
              </div>

              <div className="hidden sm:block bg-card border border-border rounded-xl p-4 overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th />
                      {cols.map((c) => (
                        <th key={c.code} className="text-left px-3 pb-2 align-top min-w-[200px]">
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-mono font-bold text-foreground">{c.code}</span>
                            <button onClick={() => remove(c.code)} aria-label={`Remove ${c.code}`} className="-m-1.5 p-1.5 rounded text-muted-foreground hover:text-foreground cursor-pointer">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="text-xs font-normal text-muted-foreground">{c.latest.description}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rowDefs.map((row) => (
                      <tr key={row.label} className="border-t border-border">
                        <th className="text-left py-2.5 pr-4 text-xs font-semibold text-muted-foreground whitespace-nowrap align-top">{row.label}</th>
                        {cols.map((c) => (
                          <td key={c.code} className="py-2.5 px-3 text-sm align-top tabular-nums">
                            {row.render(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </DemoGate>
      )}
      <SourceNotes sources={sources} index={cited} />
    </div>
  );
}
