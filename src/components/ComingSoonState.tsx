import Link from "next/link";
import { ArrowRight, FileCheck2, Mail, ShieldCheck } from "lucide-react";
import { StateRequestForm } from "@/components/StateRequestForm";
import { LIVE_STATES } from "@/lib/agency-format";
import type { StateListItem } from "@/data/state-list";

export function Crosshair({ className = "w-8 h-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" className={className} aria-hidden>
      <circle cx="12" cy="12" r="9.6" />
      <line x1="22" y1="12" x2="17.5" y2="12" />
      <line x1="6.5" y1="12" x2="2" y2="12" />
      <line x1="12" y1="6.5" x2="12" y2="2" />
      <line x1="12" y1="22" x2="12" y2="17.5" />
    </svg>
  );
}

/** Branded "coming soon" page for a state we don't publish data for yet. */
export function ComingSoonState({ state }: { state?: StateListItem }) {
  const name = state?.name;
  return (
    <div className="min-h-screen bg-background">
      <section className="bg-[#1F2326] text-white border-b-4 border-gold">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <nav className="text-sm text-white/60 mb-8">
            <Link href="/states" className="hover:text-white">
              States
            </Link>
            {name && <span> / {name}</span>}
          </nav>
          <div className="flex items-center gap-3 text-gold mb-5">
            <Crosshair className="w-9 h-9" />
            <span className="text-xs font-bold tracking-[0.2em]">COMING SOON</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight max-w-3xl">
            {name ? `${name} hunting data is on the way` : "Request hunting data for your state"}
          </h1>
          <p className="mt-5 text-lg text-white/80 max-w-2xl">
            HuntScout Pro only publishes draw results and harvest numbers taken straight from official state wildlife agency
            reports, with every figure linked to its source. We haven&apos;t finished {name || "this state"} to that standard yet.
            Tell us what you hunt and we&apos;ll use it to decide which state comes next.
          </p>
          <a
            href="#request"
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-gold text-gold-foreground font-bold hover:brightness-95 transition"
          >
            <Mail className="w-4 h-4" aria-hidden />
            Request {name || "a state"}
          </a>
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 grid lg:grid-cols-5 gap-10">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex gap-3">
            <FileCheck2 className="w-6 h-6 text-gold shrink-0" aria-hidden />
            <div>
              <h2 className="font-bold text-foreground">Agency data only</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Every number comes from the state wildlife agency&apos;s own draw and harvest reports. Nothing is estimated or modeled.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <ShieldCheck className="w-6 h-6 text-gold shrink-0" aria-hidden />
            <div>
              <h2 className="font-bold text-foreground">Checked before it goes live</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Each state is independently checked against the source reports before we publish it.
              </p>
            </div>
          </div>
          <div>
            <h2 className="font-bold text-foreground mb-3">Live now</h2>
            <div className="flex flex-wrap gap-2">
              {LIVE_STATES.map((s) => (
                <Link
                  key={s.slug}
                  href={`/states/${s.slug}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-card border border-border text-sm hover:border-gold transition"
                >
                  {s.name}
                  <ArrowRight className="w-3 h-3 text-muted-foreground" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div id="request" className="lg:col-span-3 scroll-mt-24">
          <div className="relative bg-card border border-border border-t-4 border-t-gold rounded-xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-foreground">Request {name || "a state"}</h2>
            <p className="text-sm text-muted-foreground mt-1 mb-6">Takes about a minute. Your request goes straight to our team.</p>
            <StateRequestForm stateSlug={state?.slug} />
          </div>
        </div>
      </div>
    </div>
  );
}
