import Link from "next/link";
import { FileText } from "lucide-react";
import { SPECIES_LABELS } from "@/data/types";
import type { Species, SpeciesInfo } from "@/data/agency/schema";
import type { StateData } from "@/lib/agency";
import { fmtNum, fmtPct, formatKeyDate } from "@/lib/agency-format";
import { nextAgencyDate, type TeaserPool, type UnitTeaser } from "@/lib/unit-teaser";
import { Cite, SourceNotes, footnoteIndex } from "@/components/agency/SourceNotes";
import { spanLabel } from "@/components/growth/state-glance";

// Server-rendered free summary of one unit for one species, from the full agency
// tables: years covered, hunt codes, the newest harvest line, the most-applied hunt
// and the next agency date. Per-hunt tables and history stay behind Pro below it.

const PREFIX = "unit-src";
const POOL_LABEL: Record<TeaserPool["pool"], string> = { resident: "Residents", nonresident: "Nonresidents", total: "All applicants" };

function Fact({ term, children }: { term: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted-foreground">{term}</dt>
      <dd className="text-foreground mt-0.5 break-words">{children}</dd>
    </div>
  );
}

export function UnitAtAGlance({
  state,
  info,
  unit,
  teaser,
  otherSpecies,
  today,
}: {
  state: StateData;
  info: SpeciesInfo;
  unit: string;
  teaser: UnitTeaser | undefined;
  /** Other species with published figures for this unit. */
  otherSpecies: Species[];
  today: string;
}) {
  const label = SPECIES_LABELS[info.species];
  const unitLabel = `${state.unitTerm} ${unit}`;
  // The date is only shown alongside the unit's figures.
  const next = teaser ? nextAgencyDate(info.keyDates, today) : null;
  const ids = [...(teaser?.huntCodes?.sourceIds || []), teaser?.harvest?.sourceId, teaser?.topHunt?.sourceId, next?.sourceId].filter((id): id is string => !!id);
  const cited = footnoteIndex(ids);
  const cite = (id: string | undefined) => <Cite n={id ? cited.get(id) : undefined} prefix={PREFIX} />;
  const h = teaser?.harvest;
  const top = teaser?.topHunt;
  const apps = top?.choice === "first" ? "first-choice applicants" : "applicants";

  return (
    <section aria-labelledby="unit-glance" className="bg-card border border-border rounded-xl p-4 sm:p-5 mb-6">
      <div className="flex items-center gap-2 text-primary mb-1">
        <FileText className="w-4 h-4" aria-hidden />
        <span className="text-xs font-bold tracking-[0.2em]">FREE SUMMARY</span>
      </div>
      <h2 id="unit-glance" className="text-lg font-bold text-foreground">
        {unitLabel} {label.toLowerCase()} at a glance
      </h2>

      {!teaser ? (
        <p className="text-sm text-muted-foreground mt-2">
          The {state.agency.shortName} reports we have list no {label.toLowerCase()} draw or harvest figures for {unitLabel}.
          {otherSpecies.length > 0 && (
            <>
              {" "}
              Figures for this {state.unitTerm}:{" "}
              {otherSpecies.map((sp, i) => (
                <span key={sp}>
                  {i > 0 && ", "}
                  <Link href={`/states/${state.slug}/units/${encodeURIComponent(unit)}?species=${sp}`} className="text-primary hover:underline">
                    {SPECIES_LABELS[sp]}
                  </Link>
                </span>
              ))}
              .
            </>
          )}
        </p>
      ) : (
        <>
          <dl className="mt-3 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 text-sm">
            {(teaser.drawYears || teaser.harvestYears) && (
              <Fact term="Years covered">
                {[teaser.drawYears && `Draw ${spanLabel(teaser.drawYears)}`, teaser.harvestYears && `Harvest ${spanLabel(teaser.harvestYears)}`].filter(Boolean).join(" · ")}
              </Fact>
            )}
            {teaser.huntCodes && (
              <Fact term={`Hunt codes, ${teaser.huntCodes.year} draw`}>
                {fmtNum(teaser.huntCodes.count)} {teaser.huntCodes.count === 1 ? "hunt code includes" : "hunt codes include"} {unitLabel}
                {teaser.huntCodes.sourceIds.map((id) => (
                  <span key={id}>{cite(id)}</span>
                ))}
              </Fact>
            )}
            {h && (
              <Fact
                term={
                  <>
                    Harvest, {h.year}
                    {h.hunt && `, hunt ${h.hunt}`}
                    {h.residency && ` (${h.residency === "resident" ? "residents" : "nonresidents"})`}
                    {h.label && `: ${h.label}`}
                  </>
                }
              >
                <span className="tabular-nums">
                  {[h.hunters != null && `${fmtNum(h.hunters)} hunters`, h.harvest != null && `${fmtNum(h.harvest)} harvested`, h.successPct != null && `${fmtPct(h.successPct)} success`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {h.successPct != null && h.successComputed && <span className="text-muted-foreground"> (harvest ÷ hunters)</span>}
                {cite(h.sourceId)}
              </Fact>
            )}
            {top && (
              <Fact term={`Most-applied hunt, ${top.year} draw`}>
                <span className="font-mono font-semibold break-all">{top.huntCode}</span>
                {cite(top.sourceId)}
                {top.description && top.description !== top.huntCode && <span className="block text-xs text-muted-foreground">{top.description}</span>}
                <ul className="mt-1 space-y-0.5 tabular-nums">
                  {top.pools.map((p) => (
                    <li key={p.pool}>
                      <span className="text-muted-foreground">{POOL_LABEL[p.pool]}: </span>
                      {fmtNum(p.applicants)} {apps}, {p.drawn != null ? `${fmtNum(p.drawn)} drawn` : "drawn not published"}
                    </li>
                  ))}
                </ul>
              </Fact>
            )}
            <Fact term={`Next ${state.agency.shortName} date for ${label.toLowerCase()}`}>
              {next ? (
                <>
                  {next.label}
                  {cite(next.sourceId)}
                  <span className="block text-muted-foreground">
                    {formatKeyDate(next)} · {next.cycle} cycle · {next.status === "tentative" ? "tentative" : "confirmed"}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">No upcoming date published yet.</span>
              )}
            </Fact>
          </dl>
          <p className="text-xs text-muted-foreground mt-4">
            Figures as {state.agency.name} published them. Every hunt code, each year&apos;s results{info.pointsMatter ? " and odds by point level" : ""} are in the Pro tables below.
          </p>
        </>
      )}
      <SourceNotes sources={state.sources} index={cited} title="Sources for this summary" prefix={PREFIX} />
    </section>
  );
}
