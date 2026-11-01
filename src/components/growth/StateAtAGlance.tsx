import { CalendarDays, ExternalLink, FileText } from "lucide-react";
import type { StateData } from "@/lib/agency";
import { fmtNum, fmtPct, formatDate } from "@/lib/agency-format";
import { spanLabel, type GlanceSpecies, type StateGlance } from "@/components/growth/state-glance";

// Server-rendered public summary of a live state: draw system, next agency
// dates, the agency's statewide harvest totals, years covered and sources.
// The per-hunt and per-unit tables stay behind Pro in the explorer above.

function StatewideLine({ s }: { s: NonNullable<GlanceSpecies["statewide"]> }) {
  return (
    <ul className="space-y-1">
      {s.rows.map((r, i) => (
        <li key={i} className="tabular-nums">
          {r.label && <span className="text-muted-foreground">{r.label}: </span>}
          {r.hunters != null && <>{fmtNum(r.hunters)} hunters</>}
          {r.hunters != null && r.harvest != null && " · "}
          {r.harvest != null && <>{fmtNum(r.harvest)} harvested</>}
          {r.successPct != null && (
            <>
              {" · "}
              {fmtPct(r.successPct)} success
              {r.successComputed && <span className="text-muted-foreground"> (harvest ÷ hunters)</span>}
            </>
          )}
          {/* Same caveats the harvest table shows (e.g. hunters counted for all deer species combined). */}
          {r.note && (
            <details className="text-xs text-muted-foreground mt-0.5">
              <summary className="cursor-pointer select-none py-1.5 -my-1.5 sm:py-0 sm:my-0">Agency notes</summary>
              <p className="break-words font-sans">{r.note}</p>
            </details>
          )}
        </li>
      ))}
      {s.more > 0 && (
        <li className="text-xs text-muted-foreground">
          +{s.more} more statewide {s.more === 1 ? "category" : "categories"} in the harvest table
        </li>
      )}
    </ul>
  );
}

function SpeciesCard({ s }: { s: GlanceSpecies }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 min-w-0">
      <h3 className="font-bold text-foreground">{s.label}</h3>
      <dl className="mt-2 space-y-2.5 text-sm">
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">Draw system</dt>
          <dd className="text-foreground">{s.drawSystem}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">Next agency dates</dt>
          <dd>
            {s.next.length ? (
              <ul className="space-y-1">
                {s.next.map((d, i) => (
                  <li key={i} className="break-words">
                    <a href={d.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">
                      {d.label}
                      <span className="sr-only"> (agency source, opens in a new tab)</span>
                    </a>
                    <span className="block text-muted-foreground">
                      {d.when} · {d.cycle} cycle{d.tentative ? " · tentative" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-muted-foreground">No upcoming date published yet.</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-muted-foreground">
            Statewide harvest{s.statewide ? `, ${s.statewide.year}` : ""}
          </dt>
          <dd className="text-foreground">
            {s.statewide ? <StatewideLine s={s.statewide} /> : <span className="text-muted-foreground">No statewide total in the agency reports we have.</span>}
          </dd>
        </div>
        {(s.drawYears || s.harvestYears) && (
          <div>
            <dt className="text-xs font-semibold text-muted-foreground">Years covered</dt>
            <dd className="text-foreground">
              {[s.drawYears && `Draw ${spanLabel(s.drawYears)}`, s.harvestYears && `Harvest ${spanLabel(s.harvestYears)}`].filter(Boolean).join(" · ")}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function StateAtAGlance({ state, glance }: { state: StateData; glance: StateGlance }) {
  return (
    <section aria-labelledby="at-a-glance" className="max-w-7xl mx-auto px-4 pb-8">
      <div className="border-t border-border pt-8">
        <div className="flex items-center gap-2 text-primary mb-1">
          <CalendarDays className="w-4 h-4" aria-hidden />
          <span className="text-xs font-bold tracking-[0.2em]">FREE SUMMARY</span>
        </div>
        <h2 id="at-a-glance" className="text-2xl sm:text-3xl font-bold text-foreground">
          {state.name} at a glance
        </h2>
        <p className="text-muted-foreground mt-2 max-w-3xl text-sm sm:text-base">
          From {state.agency.name}&apos;s published reports and schedules
          {glance.drawYears && <>: draw results {spanLabel(glance.drawYears)}</>}
          {glance.harvestYears && <>, harvest {spanLabel(glance.harvestYears)}</>}. Checked against the agency on {formatDate(state.lastReviewed)}.
          Statewide totals are the agency&apos;s own figures; results for each hunt code and {state.unitTerm} are in the tables above.
        </p>

        <div className="mt-5 grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {glance.species.map((s) => (
            <SpeciesCard key={s.species} s={s} />
          ))}
        </div>

        <div className="mt-6">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" aria-hidden />
            Agency sources
          </h3>
          <ul className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-sm">
            <li className="min-w-0 break-words">
              <a href={state.agency.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {state.agency.name}
                <ExternalLink className="inline w-3 h-3 ml-1 align-baseline" aria-hidden />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
            {glance.sources.slice(0, 11).map((s) => (
              <li key={s.id} className="min-w-0 break-words">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                  {s.title}
                  {s.dataYear ? ` (${s.dataYear})` : ""}
                  <ExternalLink className="inline w-3 h-3 ml-1 align-baseline" aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
