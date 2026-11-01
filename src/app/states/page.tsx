import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays, Mail } from "lucide-react";
import { SPECIES_LABELS } from "@/data/types";
import { getAllStateData, speciesWithData } from "@/lib/agency";
import { COMING_SOON_STATES, DRAW_SYSTEM_LABELS, LIVE_STATE_SLUGS, formatKeyDate, nextKeyDate } from "@/lib/agency-format";
import { Crosshair } from "@/components/ComingSoonState";

// "Next date" and "open now" depend on today; rebuild hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "States | HuntScout Pro",
  description: "Official draw results and harvest data for 12 western draw states, straight from state wildlife agency reports.",
};

const HERO_BG = "https://images.unsplash.com/photo-1641113994135-a9f230b1f9b0?w=2400&q=80";

export default async function StatesPage() {
  const states = (await getAllStateData()).sort((a, b) => LIVE_STATE_SLUGS.indexOf(a.slug) - LIVE_STATE_SLUGS.indexOf(b.slug));

  return (
    <div className="min-h-screen bg-background">
      <section className="relative h-[300px] sm:h-[360px] overflow-hidden">
        <Image src={HERO_BG} alt="Layered mountain range at sunset" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
        <div className="relative z-10 h-full flex items-end pb-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight drop-shadow-lg">Western draw states</h1>
            <p className="mt-3 text-lg text-white/85 max-w-2xl drop-shadow">
              Draw results, point levels and harvest by unit for {states.length} states, taken straight from each state wildlife
              agency&apos;s reports. Every number links to its source.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {states.map((s) => {
            const species = speciesWithData(s);
            const next = nextKeyDate(species.flatMap((sp) => sp.keyDates));
            const systems = Array.from(new Set(species.filter((sp) => sp.drawSystem !== "otc").map((sp) => sp.drawSystem)));
            return (
              <Link
                key={s.slug}
                href={`/states/${s.slug}`}
                className="group block bg-card border border-border border-l-4 border-l-gold rounded-xl p-5 transition hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-foreground group-hover:text-primary">{s.name}</h2>
                    <div className="text-xs text-muted-foreground mt-0.5 inline-flex items-center gap-1">
                      <BadgeCheck className="w-3.5 h-3.5 text-success" aria-hidden />
                      {s.agency.shortName} data
                    </div>
                  </div>
                  <span className="px-1.5 py-0.5 text-xs font-mono font-semibold text-muted-foreground bg-muted rounded">{s.abbrev}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {systems.map((d) => (
                    <span key={d} className="px-2 py-0.5 rounded-full text-xs font-medium bg-gold/15 border border-gold/30 text-foreground">
                      {DRAW_SYSTEM_LABELS[d]}
                    </span>
                  ))}
                </div>
                {next && (
                  <div className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 mt-0.5 text-gold shrink-0" aria-hidden />
                    <span>
                      <span className="text-foreground font-medium">{next.label}:</span> {formatKeyDate(next)}
                    </span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {species.map((sp) => (
                    <span key={sp.species} className="px-1.5 py-0.5 bg-muted rounded text-xs text-muted-foreground">
                      {SPECIES_LABELS[sp.species]}
                    </span>
                  ))}
                </div>
                <div className="mt-4 text-sm font-semibold text-primary inline-flex items-center gap-1">
                  Explore {s.name}
                  <ArrowRight className="w-4 h-4 transition group-hover:translate-x-0.5" aria-hidden />
                </div>
              </Link>
            );
          })}
        </div>

        <section className="mt-14 rounded-2xl overflow-hidden border border-border">
          <div className="bg-[#1F2326] text-white px-6 sm:px-8 py-8 border-b-4 border-gold flex flex-col md:flex-row md:items-center md:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-gold mb-2">
                <Crosshair className="w-6 h-6" />
                <span className="text-xs font-bold tracking-[0.2em]">COMING SOON</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold">More states are on the way</h2>
              <p className="text-white/75 mt-2 max-w-2xl">
                We only publish a state once its agency data is complete and checked. Tell us which state you hunt and we&apos;ll
                use it to decide what comes next.
              </p>
            </div>
            <Link
              href="/request-state"
              className="shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-gold text-gold-foreground font-bold hover:brightness-95"
            >
              <Mail className="w-4 h-4" aria-hidden />
              Request a state
            </Link>
          </div>
          <div className="bg-card p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {COMING_SOON_STATES.map((s) => (
              <Link
                key={s.slug}
                href={`/states/${s.slug}#request`}
                className="group flex min-h-10 items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border hover:border-gold text-sm transition"
              >
                <span className="text-foreground">{s.name}</span>
                <span className="text-[10px] font-semibold text-muted-foreground group-hover:text-gold">REQUEST</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
