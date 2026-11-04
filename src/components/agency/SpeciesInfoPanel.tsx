"use client";

import { useState } from "react";
import { BookOpen, CalendarDays, ChevronDown, DollarSign, Info, Trees } from "lucide-react";
import type { FeeItem, KeyDate, SeasonDate, SpeciesInfo } from "@/data/agency/schema";
import { DRAW_SYSTEM_LABELS, formatDate, formatKeyDate, seasonScope, todayIso } from "@/lib/agency-format";
import { groupKeyDates, ownNote } from "@/lib/key-dates";
import { Cite } from "@/components/agency/SourceNotes";
import { ShowMore } from "@/components/agency/mobile";

type CiteFn = (id: string) => number | undefined;

function DateItem({ d, note, cite, past = false }: { d: KeyDate; note: string; cite: CiteFn; past?: boolean }) {
  return (
    <li className={`text-sm min-w-0 ${past ? "opacity-70" : ""}`}>
      <div className="font-medium text-foreground break-words">
        {d.label}
        <Cite n={cite(d.sourceId)} />
      </div>
      <div className="text-muted-foreground">
        {formatKeyDate(d)}
        {!past && ` · ${d.cycle} cycle`}
        {d.status === "tentative" && " · tentative"}
        {past && " · passed"}
      </div>
      {note && <div className="text-xs text-muted-foreground mt-0.5 break-words">{note}</div>}
    </li>
  );
}

/**
 * The species' agency key dates: those still to come first (confirmed and tentative), passed
 * ones behind one toggle, and a caveat the agency put on every date said once.
 */
export function KeyDatesSection({ info, cite, id }: { info: SpeciesInfo; cite: CiteFn; id?: string }) {
  const [showPast, setShowPast] = useState(false);
  const g = groupKeyDates(info.keyDates, todayIso());
  const pastYear = g.pastCycles.length === 1 ? ` ${g.pastCycles[0]}` : "";

  return (
    <section id={id} aria-labelledby={id && `${id}-heading`} className="bg-card border border-border rounded-xl p-4 sm:p-5 mb-4 scroll-mt-20 lg:scroll-mt-32">
      <h2 id={id && `${id}-heading`} className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
        <CalendarDays className="w-4 h-4 text-gold" aria-hidden />
        Key dates
      </h2>
      {info.keyDates.length === 0 ? (
        <p className="text-sm text-muted-foreground">The agency hasn&apos;t published application dates for this species.</p>
      ) : (
        <>
          {g.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming dates published yet.
              {g.pastNote && <span className="block text-xs mt-1">{g.pastNote}</span>}
            </p>
          ) : (
            <>
              {g.upcomingNote && <p className="text-xs text-muted-foreground bg-muted/60 rounded-md px-2 py-1.5 mb-3">{g.upcomingNote}</p>}
              <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {g.upcoming.map((d, i) => (
                  <DateItem key={i} d={d} note={ownNote(d.note, g.upcomingNote)} cite={cite} />
                ))}
              </ul>
            </>
          )}
          {g.past.length > 0 && (
            <div className="mt-3 border-t border-border pt-2">
              <button
                type="button"
                aria-expanded={showPast}
                aria-controls={id ? `${id}-past` : undefined}
                onClick={() => setShowPast((v) => !v)}
                className="inline-flex min-h-10 sm:min-h-0 items-center gap-1 py-1 text-sm font-semibold text-primary hover:underline cursor-pointer"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showPast ? "rotate-180" : ""}`} aria-hidden />
                {showPast ? `Hide past${pastYear} dates` : `Show ${g.past.length} past${pastYear} ${g.past.length === 1 ? "date" : "dates"}`}
              </button>
              {showPast && (
                <div id={id ? `${id}-past` : undefined} className="mt-2">
                  {g.pastNote && g.upcoming.length > 0 && <p className="text-xs text-muted-foreground bg-muted/60 rounded-md px-2 py-1.5 mb-3">{g.pastNote}</p>}
                  <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                    {g.past.map((d, i) => (
                      <DateItem key={i} d={d} note={ownNote(d.note, g.pastNote)} cite={cite} past />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface Props {
  info: SpeciesInfo;
  fees: FeeItem[];
  seasons: SeasonDate[];
  cite: CiteFn;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Reference for the species (how the draw works, seasons, fees), collapsed by default so the tables come first. */
export function SpeciesInfoPanel({ info, fees, seasons, cite, open, onOpenChange }: Props) {
  const speciesFees = fees.filter((f) => f.species === info.species);
  const generalFees = fees.filter((f) => !f.species);
  const feeCount = speciesFees.length + generalFees.length;

  return (
    <details
      open={open}
      onToggle={(e) => onOpenChange(e.currentTarget.open)}
      className="group mb-6 bg-card border border-border rounded-xl"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground [&::-webkit-details-marker]:hidden">
        <BookOpen className="w-4 h-4 text-gold shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          How the draw works, seasons and fees
          <span className="block sm:inline text-xs font-normal text-muted-foreground sm:ml-2">
            {DRAW_SYSTEM_LABELS[info.drawSystem]}
            {seasons.length > 0 && ` · ${seasons.length} ${seasons.length === 1 ? "season" : "seasons"}`}
            {feeCount > 0 && ` · ${feeCount} ${feeCount === 1 ? "fee" : "fees"}`}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 transition-transform group-open:rotate-180" aria-hidden />
      </summary>

      <div className="grid lg:grid-cols-3 gap-3 sm:gap-4 border-t border-border p-3 sm:p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-2">
            <Info className="w-4 h-4 text-gold" aria-hidden />
            How the draw works
          </div>
          <ShowMore collapsed={150} moreLabel="Read the full draw summary" lessLabel="Show less">
            {info.displayName && <div className="text-xs text-muted-foreground mb-2">Covers: {info.displayName}</div>}
            <div className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-foreground border border-gold/30 mb-2">
              {DRAW_SYSTEM_LABELS[info.drawSystem]}
            </div>
            <p className="text-sm text-muted-foreground">
              {info.drawSystemSummary}
              {info.sourceIds.slice(0, 2).map((id) => (
                <Cite key={id} n={cite(id)} />
              ))}
            </p>
            {info.residentNote && (
              <p className="text-sm text-muted-foreground mt-2">
                <b className="text-foreground">Residents:</b> {info.residentNote}
              </p>
            )}
            {info.nonresidentNote && (
              <p className="text-sm text-muted-foreground mt-2">
                <b className="text-foreground">Nonresidents:</b> {info.nonresidentNote}
              </p>
            )}
            {info.otcSummary && (
              <p className="text-sm text-muted-foreground mt-2">
                <b className="text-foreground">Over the counter:</b> {info.otcSummary}
              </p>
            )}
          </ShowMore>
        </div>

        <div id="seasons" className="min-w-0 scroll-mt-20 lg:scroll-mt-32">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <Trees className="w-4 h-4 text-gold" aria-hidden />
            Seasons
          </div>
          {seasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No general season dates listed. Where the agency gives dates for a hunt, they&apos;re on its row.</p>
          ) : (
            <ShowMore collapsed={220} moreLabel={`Show all ${seasons.length} seasons`} lessLabel="Show fewer seasons">
              <ul className="space-y-1.5">
                {seasons.map((s, i) => (
                  <li key={i} className="text-sm text-muted-foreground">
                    <span className="text-foreground">{s.label}</span>
                    {seasonScope(s) && <span> ({seasonScope(s)})</span>}: {formatDate(s.start, false)} – {formatDate(s.end)}
                    <Cite n={cite(s.sourceId)} />
                  </li>
                ))}
              </ul>
            </ShowMore>
          )}
        </div>

        <div id="fees" className="min-w-0 scroll-mt-20 lg:scroll-mt-32">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
            <DollarSign className="w-4 h-4 text-gold" aria-hidden />
            License &amp; application fees
          </div>
          {feeCount === 0 ? (
            <p className="text-sm text-muted-foreground">See the agency fee schedule.</p>
          ) : (
            <ShowMore collapsed={200} moreLabel={`Show all ${feeCount} fees`} lessLabel="Show fewer fees">
              <table className="w-full text-sm">
                <tbody>
                  {[...speciesFees, ...generalFees].map((f, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {f.item}
                        <span className="text-xs"> · {f.residency === "resident" ? "Res" : "NR"} · {f.licenseYear}</span>
                        {f.note && <div className="text-xs">{f.note}</div>}
                      </td>
                      <td className="py-1.5 text-right font-semibold text-foreground whitespace-nowrap">
                        ${f.amountUsd.toLocaleString("en-US", { minimumFractionDigits: f.amountUsd % 1 ? 2 : 0 })}
                        <Cite n={cite(f.sourceId)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ShowMore>
          )}
        </div>
      </div>
    </details>
  );
}
