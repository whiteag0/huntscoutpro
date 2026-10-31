import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { getAllStateData, getCoverageStats, speciesWithData } from "@/lib/agency";
import { DRAW_SYSTEM_LABELS, LIVE_STATE_SLUGS, fmtNum, fmtPct, formatKeyDate, nextKeyDate } from "@/lib/agency-format";
import { successOf } from "@/lib/agency-view";

// "Next date" and "open now" depend on today; rebuild hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Wild Turkey | HuntScout Pro",
  description: "Turkey licensing, application dates and harvest in the western draw states, from official agency reports.",
};

export default async function TurkeyPage() {
  const states = (await getAllStateData()).sort((a, b) => LIVE_STATE_SLUGS.indexOf(a.slug) - LIVE_STATE_SLUGS.indexOf(b.slug));
  const stats = await getCoverageStats();
  const cards = states.map((s) => {
    const info = speciesWithData(s).find((sp) => sp.species === "turkey");
    if (!info) return null;
    const t = stats.turkeyStatewide[s.slug] || { rows: [], units: 0, drawHunts: 0 };
    const src = new Map(s.sources.map((x) => [x.id, x]));
    return { s, info, totals: t.rows, units: t.units, drawHunts: t.drawHunts, src };
  });
  const live = cards.filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Wild turkey</h1>
      <p className="text-muted-foreground mt-2 max-w-3xl">
        How each state licenses turkey hunting, when to apply, and what the agency reports for harvest. Only figures the agency
        publishes are shown; states that don&apos;t publish a statewide turkey harvest are marked.
      </p>

      <div className="grid md:grid-cols-2 gap-4 mt-8">
        {live.map(({ s, info, totals, units, drawHunts, src }) => {
          const next = nextKeyDate(info.keyDates);
          const latest = totals[0];
          const source = latest ? src.get(latest.sourceId) : undefined;
          return (
            <div key={s.slug} className="bg-card border border-border border-t-4 border-t-gold rounded-xl p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-foreground">{s.name}</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gold/15 border border-gold/30">{DRAW_SYSTEM_LABELS[info.drawSystem]}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{info.drawSystemSummary}</p>
              {info.otcSummary && <p className="text-sm text-muted-foreground mt-1"><b className="text-foreground">Over the counter:</b> {info.otcSummary}</p>}
              {latest ? (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Statewide harvest</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1 text-sm">
                    {totals.slice(0, 4).map((r) => (
                      <span key={r.year}>
                        <b className="text-foreground">{r.year}:</b> {fmtNum(r.harvest)}
                        {successOf(r) !== null && (
                          <span className="text-muted-foreground">
                            {" "}
                            ({fmtPct(successOf(r))}
                            {r.successComputed ? "†" : ""})
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                  {totals.slice(0, 4).some((r) => r.successComputed) && (
                    <div className="text-xs text-muted-foreground mt-1">† Success = harvest ÷ hunters as the agency reported them; the agency didn&apos;t print a rate.</div>
                  )}
                  {source && (
                    <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:underline">
                      Source: {source.title}
                    </a>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">{s.agency.shortName} doesn&apos;t publish a statewide turkey harvest total in the years we cover.</p>
              )}
              <div className="mt-3 text-xs text-muted-foreground">
                {units > 0 && `${units} ${s.unitTerm}s with harvest data`}
                {units > 0 && drawHunts > 0 && " · "}
                {drawHunts > 0 && `${drawHunts} drawn hunts`}
              </div>
              {next && (
                <div className="mt-3 text-sm flex items-start gap-1.5">
                  <CalendarDays className="w-4 h-4 text-gold mt-0.5 shrink-0" aria-hidden />
                  <span>
                    <b>{next.label}:</b> {formatKeyDate(next)}
                  </span>
                </div>
              )}
              <Link href={`/states/${s.slug}?species=turkey`} className="mt-4 pt-3 border-t border-border text-sm font-semibold text-primary inline-flex items-center gap-1 hover:underline">
                {s.name} turkey data <ArrowRight className="w-4 h-4" aria-hidden />
              </Link>
            </div>
          );
        })}
      </div>
      {live.length === 0 && <p className="mt-8 text-muted-foreground">Turkey data is being added.</p>}
    </div>
  );
}
