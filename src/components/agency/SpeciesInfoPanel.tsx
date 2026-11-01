import { CalendarDays, DollarSign, Info } from "lucide-react";
import type { FeeItem, SeasonDate, SpeciesInfo } from "@/data/agency/schema";
import { DRAW_SYSTEM_LABELS, formatDate, formatKeyDate, keyDateEnd, seasonScope, todayIso } from "@/lib/agency-format";
import { Cite } from "@/components/agency/SourceNotes";
import { ShowMore } from "@/components/agency/mobile";

interface Props {
  info: SpeciesInfo;
  fees: FeeItem[];
  seasons: SeasonDate[];
  cite: (id: string) => number | undefined;
}

export function SpeciesInfoPanel({ info, fees, seasons, cite }: Props) {
  const today = todayIso();
  const dates = [...info.keyDates].sort((a, b) => (a.start || a.date || "").localeCompare(b.start || b.date || ""));
  const latestCycle = dates.reduce((m, d) => Math.max(m, d.cycle), 0);
  // Agencies often attach the same caveat to every date; show it once.
  const notes = dates.map((d) => d.note || "");
  const sharedNote = notes.length > 1 && notes.every((n) => n && n === notes[0]) ? notes[0] : "";
  const speciesFees = fees.filter((f) => f.species === info.species);
  const generalFees = fees.filter((f) => !f.species);

  return (
    <div className="grid lg:grid-cols-3 gap-3 sm:gap-4 mb-6">
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
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

      <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <CalendarDays className="w-4 h-4 text-gold" aria-hidden />
          Key dates {latestCycle ? `(${latestCycle} cycle)` : ""}
        </div>
        <ShowMore collapsed={220} moreLabel={`Show all ${dates.length + seasons.length} dates`} lessLabel="Show fewer dates">
        {sharedNote && <p className="text-xs text-muted-foreground bg-muted/60 rounded-md px-2 py-1.5 mb-3">{sharedNote}</p>}
        {dates.length === 0 ? (
          <p className="text-sm text-muted-foreground">The agency hasn&apos;t published application dates for this species.</p>
        ) : (
          <ul className="space-y-2.5">
            {dates.map((d, i) => {
              const past = keyDateEnd(d) < today;
              return (
                <li key={i} className={`text-sm ${past ? "opacity-60" : ""}`}>
                  <div className="font-medium text-foreground">
                    {d.label}
                    <Cite n={cite(d.sourceId)} />
                  </div>
                  <div className="text-muted-foreground">
                    {formatKeyDate(d)}
                    {d.status === "tentative" && " (tentative)"}
                    {past && " · passed"}
                  </div>
                  {d.note && !sharedNote && <div className="text-xs text-muted-foreground mt-0.5">{d.note}</div>}
                </li>
              );
            })}
          </ul>
        )}
        {seasons.length > 0 && (
          <>
            <div className="text-sm font-semibold text-foreground mt-4 mb-2">Seasons</div>
            <ul className="space-y-1.5">
              {seasons.map((s, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  <span className="text-foreground">{s.label}</span>
                  {seasonScope(s) && <span> ({seasonScope(s)})</span>}: {formatDate(s.start, false)} – {formatDate(s.end)}
                  <Cite n={cite(s.sourceId)} />
                </li>
              ))}
            </ul>
          </>
        )}
        </ShowMore>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground mb-3">
          <DollarSign className="w-4 h-4 text-gold" aria-hidden />
          License &amp; application fees
        </div>
        {speciesFees.length + generalFees.length === 0 ? (
          <p className="text-sm text-muted-foreground">See the agency fee schedule.</p>
        ) : (
          <ShowMore collapsed={200} moreLabel={`Show all ${speciesFees.length + generalFees.length} fees`} lessLabel="Show fewer fees">
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
  );
}
