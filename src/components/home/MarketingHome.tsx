"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  ChevronDown,
  Columns3,
  Crosshair,
  FileCheck2,
  Mail,
  MapPin,
  Shield,
  TrendingUp,
} from "lucide-react";
import { PRICE } from "@/lib/promo";
import { Crosshair as BrandCrosshair } from "@/components/ComingSoonState";
import type { HomeData } from "@/components/home/types";

/* ------------------------------------------------------------------ */
/*  SCROLL ANIMATION HOOK                                              */
/* ------------------------------------------------------------------ */

function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function RevealSection({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useScrollReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-8"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  COPY                                                               */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: Crosshair,
    title: "Draw Results by Point Level",
    description:
      "Quota, applicants, and drawn for each hunt code, by point level where the agency publishes it.",
  },
  {
    icon: TrendingUp,
    title: "Point Creep",
    description:
      "Minimum points drawn year over year, read from the agency's own draw results.",
  },
  {
    icon: BarChart3,
    title: "Harvest & Success by Unit",
    description:
      "Hunters, harvest, and success rate by unit, from agency harvest reports.",
  },
  {
    icon: Columns3,
    title: "Compare & Decide",
    description:
      "Line up hunts side by side, across units and states, before you apply.",
  },
  {
    icon: Calendar,
    title: "Calendar & Planner",
    description:
      "Agency application and draw dates in one calendar, plus a planner for your applications, budget, and gear.",
  },
  {
    icon: FileCheck2,
    title: "Cited to the Source",
    description:
      "Every table links to the agency report it came from, with the data year and the date we pulled it.",
  },
];

const PRICING_FEATURES = [
  "Agency draw results by hunt code",
  "Applicants & drawn by point level (where published)",
  "Minimum points drawn, year over year",
  "Harvest & success by unit",
  "Side-by-side hunt comparison",
  "Calendar of agency dates",
  "Hunt planner",
  "Source link on every table",
  "New states as they go live",
];

function yearSpan(y: [number, number] | null): string | null {
  if (!y) return null;
  return y[0] === y[1] ? String(y[0]) : `${y[0]}–${y[1]}`;
}

function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function plural(n: number, word: string): string {
  return `${n.toLocaleString("en-US")} ${word}${n === 1 ? "" : "s"}`;
}

const faqLink = "text-foreground font-medium underline underline-offset-2";

function buildFaqs(data: HomeData): { q: string; a: React.ReactNode }[] {
  const draw = yearSpan(data.drawYears);
  const harvest = yearSpan(data.harvestYears);
  const live = data.liveStates.map((s) => s.name);

  const years =
    draw || harvest
      ? `Right now we have ${[draw && `draw results from ${draw}`, harvest && `harvest results from ${harvest}`]
          .filter(Boolean)
          .join(" and ")}, depending on the state and species. Each state page lists exactly which years it has.`
      : "It depends on the state and species. Each state page lists exactly which draw and harvest years it has.";

  return [
    {
      q: "Where does the data come from?",
      a: "From official state wildlife agency publications: draw result reports, harvest reports, application calendars, and license fee tables. Each table cites the report it came from, with a link, the data year, and the date we retrieved it. Nothing is modeled or estimated. When an agency publishes counts but not a percentage, we divide its own numbers (drawn ÷ applicants, harvest ÷ hunters). If an agency doesn't publish a figure, we leave it blank.",
    },
    { q: "Which years do you cover?", a: years },
    {
      q: "Are these draw odds predictions?",
      a: "No. They're the agency's published results from past draws: how many tags there were, how many people applied, how many drew, and, where the agency publishes it, the results at each point level. Past results don't guarantee future odds, so use them to build your short list and confirm the details with the agency before you apply.",
    },
    {
      q: "Which states do you cover?",
      a: (
        <>
          {live.length > 0
            ? `Live now: ${listNames(live)}. `
            : `We're finishing checks on our first western draw states${
                data.upcomingStates.length ? `: ${listNames(data.upcomingStates)}` : ""
              }. `}
          {live.length > 0 && data.upcomingStates.length > 0 && `Coming next: ${listNames(data.upcomingStates)}. `}
          Every other state shows a coming-soon page.{" "}
          <Link href="/request-state" className={faqLink}>
            Request your state
          </Link>{" "}
          and we&apos;ll use it to decide what comes next.
        </>
      ),
    },
    {
      q: "How often is data updated?",
      a: "We add agency reports as states publish them, usually once a year after the draws and after harvest reports come out. Each state page shows the date it was last checked against the agency.",
    },
    {
      q: "Do you cover turkey hunting?",
      a: "Yes, where the agency publishes it. The Turkey page shows how turkey licenses are issued, the agency's application dates, and the harvest numbers each state publishes. Some states only report statewide turkey harvest, and we show exactly what they report.",
    },
    {
      q: "What preference point systems do you track?",
      a: "Whatever system each state actually uses: preference points, bonus points, squared bonus points, hybrid draws, and random draws. Each species page explains how that state allocates its licenses.",
    },
    {
      q: "What do I get for $14.99?",
      a: "One $14.99 payment gives you 2 years of full access to everything on HuntScout Pro, including states that go live during those 2 years. No auto-renewal.",
    },
    {
      q: "What's your refund policy?",
      a: "We offer a 30-day money-back guarantee, no questions asked. If HuntScout Pro doesn't help your hunting, we'll refund you in full.",
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  COMPONENTS                                                         */
/* ------------------------------------------------------------------ */

function FAQItem({ question, answer }: { question: string; answer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-5 text-left cursor-pointer hover:bg-muted/30 transition-colors"
      >
        <span className="text-base font-semibold text-foreground pr-4">
          {question}
        </span>
        <ChevronDown
          className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`transition-all duration-300 ease-in-out ${
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        } overflow-hidden`}
      >
        <div className="px-6 pb-5 text-sm text-muted-foreground leading-relaxed">
          {answer}
        </div>
      </div>
    </div>
  );
}

function StateCard({ slug, abbrev, name, speciesCount }: { slug: string; abbrev: string; name: string; speciesCount: number }) {
  return (
    <Link
      href={`/states/${slug}`}
      className="group relative rounded-lg p-3 sm:p-3.5 text-center bg-primary text-white transition-all duration-200 hover:scale-105 hover:shadow-md"
      title={name}
    >
      <div className="text-sm sm:text-base font-bold leading-none">{abbrev}</div>
      <div className="text-[11px] sm:text-xs opacity-80 mt-1 truncate">{name}</div>
      {speciesCount > 0 && <div className="text-[10px] opacity-60 mt-0.5">{speciesCount} species</div>}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  MARKETING HOME                                                     */
/* ------------------------------------------------------------------ */

export function MarketingHome({ data }: { data: HomeData }) {
  const { stateCount, speciesCount, totalHuntCodes, liveStates, upcomingStates, speciesCards } = data;
  const faqs = buildFaqs(data);

  const heroStats = [
    stateCount > 0 && `${stateCount} Western Draw State${stateCount === 1 ? "" : "s"}`,
    speciesCount > 0 && `${speciesCount} Species`,
    totalHuntCodes > 0 && `${totalHuntCodes.toLocaleString("en-US")} Draw Hunts`,
    "Official Agency Data",
    "Every Number Cited",
  ].filter((s): s is string => !!s).slice(0, 4);

  return (
    <div className="min-h-screen -mt-16">
      {/* ============================================================ */}
      {/*  HERO                                                        */}
      {/* ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center text-white overflow-hidden">
        {/* Background photo */}
        <Image
          src="https://images.unsplash.com/photo-1758163462432-3c704d8d43d9?w=2400&q=80"
          alt="Bull elk standing in a grassy field with mountain range in background"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/20" />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-28 w-full">
          {/* Price badge -- top-left aligned */}
          <div className="animate-fade-in-up mb-5">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 border border-gold/40 text-sm backdrop-blur-md">
              <span className="animate-pulse-soft inline-block w-2 h-2 rounded-full bg-gold" />
              <span className="text-gold font-medium">
                {PRICE.tagline}
              </span>
            </div>
          </div>

          <div className="max-w-4xl">
            <h1
              className="animate-fade-in-up text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-tight leading-[1.05] mb-5"
              style={{ textShadow: "0 4px 24px rgba(0,0,0,0.5)" }}
            >
              Know Before{" "}
              <span className="text-gradient-gold">You Draw</span>
            </h1>

            <p
              className="animate-fade-in-up delay-200 text-lg sm:text-xl md:text-2xl text-white/80 max-w-2xl mb-8 leading-relaxed"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}
            >
              Draw results and harvest by unit for{" "}
              {stateCount > 0 ? `${stateCount} western draw state${stateCount === 1 ? "" : "s"}` : "the western draw states"},
              straight from each state wildlife agency&apos;s reports. Every number is cited to its source.
            </p>

            <div className="animate-fade-in-up delay-300 flex flex-col sm:flex-row items-start gap-3 mb-12">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-bold gradient-gold text-gold-foreground shadow-lg hover:shadow-2xl hover:brightness-110 hover:scale-[1.02] transition-all duration-300"
              >
                {PRICE.ctaText}
              </Link>
              <Link
                href="/states"
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold border-2 border-white/40 text-white hover:bg-white/15 hover:border-white/60 backdrop-blur-sm transition-all duration-300"
              >
                Explore States
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

          {/* Stats bar -- compact */}
          <div className="animate-fade-in-up delay-400 max-w-2xl">
            <div className="flex flex-wrap items-center gap-x-5 sm:gap-x-8 gap-y-2 py-3.5 px-5 rounded-xl bg-black/30 border border-white/10 backdrop-blur-md">
              {heroStats.map((stat, i) => (
                <span
                  key={stat}
                  className="flex items-center text-sm font-semibold text-white/90"
                >
                  {i > 0 && (
                    <span className="hidden sm:inline text-white/25 mr-5 sm:mr-8">
                      |
                    </span>
                  )}
                  {stat}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom fade into next section */}
        <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </section>

      {/* ============================================================ */}
      {/*  SPECIES SHOWCASE (only species with published data)         */}
      {/* ============================================================ */}
      {speciesCards.length > 0 && (
        <section className="py-16 sm:py-20 lg:py-24 gradient-subtle">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <RevealSection>
              <div className="text-center mb-10">
                <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-foreground">
                  Agency Data for the Species You Hunt
                </h2>
                <p className="text-lg text-muted-foreground mt-3 max-w-2xl mx-auto">
                  Hunt counts come from each state&apos;s most recent published draw.
                </p>
              </div>
            </RevealSection>

            {/* Bento grid: first item spans 2 rows */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-fr">
              {speciesCards.map((species, i) => (
                <RevealSection
                  key={species.name}
                  delay={i * 80}
                  className={i === 0 ? "row-span-2" : ""}
                >
                  <Link
                    href={species.href}
                    className={`group relative overflow-hidden rounded-xl cursor-pointer block h-full ${
                      i === 0 ? "aspect-auto" : "aspect-[4/5]"
                    }`}
                  >
                    <Image
                      src={species.image}
                      alt={`${species.name} in natural habitat`}
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <h3 className="text-white text-lg sm:text-xl font-bold mb-0.5">
                        {species.name}
                      </h3>
                      <p className="text-white/70 text-xs sm:text-sm">
                        {plural(species.states, "state")} &bull;{" "}
                        {species.huntCodes > 0
                          ? plural(species.huntCodes, "draw hunt")
                          : plural(species.units, "harvest unit")}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs text-white/0 group-hover:text-white/70 transition-colors duration-300 mt-1.5">
                        Explore <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </Link>
                </RevealSection>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ============================================================ */}
      {/*  WHY HUNTSCOUT PRO (Photo background)                        */}
      {/* ============================================================ */}
      <section className="relative py-16 sm:py-20 lg:py-24 overflow-hidden">
        {/* Parallax-style background */}
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1685208509027-f81d05e41cdf?w=2400&q=80"
            alt="Mountain silhouettes at sunset with vibrant orange and purple sky"
            fill
            sizes="100vw"
            className="object-cover"
            style={{ objectPosition: "center 40%" }}
          />
          <div className="absolute inset-0 bg-black/70" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-white">
                Why HuntScout Pro?
              </h2>
              <p className="text-white/60 mt-3 max-w-2xl mx-auto text-lg">
                The agency numbers you need to apply smarter, in one place.
              </p>
            </div>
          </RevealSection>

          {/* Horizontal icon+text layout in 2 cols */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <RevealSection key={f.title} delay={i * 80}>
                  <div className="group flex items-start gap-4 bg-white/[0.07] backdrop-blur-md border border-white/10 rounded-xl p-5 hover:bg-white/[0.12] transition-all duration-300">
                    <div className="w-10 h-10 rounded-lg bg-gold/20 text-gold flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-white mb-1">
                        {f.title}
                      </h3>
                      <p className="text-sm text-white/60 leading-relaxed">
                        {f.description}
                      </p>
                    </div>
                  </div>
                </RevealSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  STATES                                                      */}
      {/* ============================================================ */}
      <section className="py-16 sm:py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-foreground">
                {stateCount > 0
                  ? `${stateCount} Western Draw State${stateCount === 1 ? "" : "s"}. Agency Data Only.`
                  : "Western Draw States. Agency Data Only."}
              </h2>
              <p className="text-lg text-muted-foreground mt-3 max-w-2xl mx-auto">
                {liveStates.length > 0
                  ? "Pick a state to see its draw results, harvest by unit, and application dates."
                  : "Our first states are being checked against the agency reports and will appear here once they pass."}
              </p>
            </div>
          </RevealSection>

          {liveStates.length > 0 && (
            <RevealSection>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {liveStates.map((s) => (
                  <StateCard key={s.slug} slug={s.slug} abbrev={s.abbrev} name={s.name} speciesCount={s.speciesCount} />
                ))}
              </div>
            </RevealSection>
          )}

          {upcomingStates.length > 0 && (
            <p className="mt-6 text-center text-sm text-muted-foreground max-w-3xl mx-auto">
              <span className="font-semibold text-foreground">Being checked against agency reports now:</span>{" "}
              {listNames(upcomingStates)}.
            </p>
          )}

          {/* Coming soon / request a state */}
          <RevealSection>
            <div className="mt-10 rounded-2xl bg-[#1F2326] text-white border-b-4 border-gold px-6 sm:px-8 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
              <div>
                <div className="flex items-center gap-2 text-gold mb-2">
                  <BrandCrosshair className="w-5 h-5" />
                  <span className="text-xs font-bold tracking-[0.2em]">MORE STATES COMING SOON</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold">Hunt somewhere else?</h3>
                <p className="text-white/75 mt-1.5 max-w-2xl text-sm sm:text-base">
                  We add a state only once its agency data is complete and checked. Tell us where you hunt
                  and we&apos;ll use it to decide what comes next.
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
          </RevealSection>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  HOW IT WORKS                                                */}
      {/* ============================================================ */}
      <section className="relative py-16 sm:py-20 overflow-hidden">
        {/* Subtle background image */}
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1557616974-db27bfcf6f6d?w=2400&q=80"
            alt="Grass meadow with mountains in background"
            fill
            sizes="100vw"
            className="object-cover opacity-[0.06]"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-background" />

        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-foreground">
                How It Works
              </h2>
              <p className="text-lg text-muted-foreground mt-3 max-w-xl mx-auto">
                Three simple steps to smarter hunting applications.
              </p>
            </div>
          </RevealSection>

          {/* Horizontal steps on desktop */}
          <div className="flex flex-col md:flex-row gap-6 md:gap-4 relative items-stretch">
            {/* Connecting line (desktop only) */}
            <div className="hidden md:block absolute top-6 left-[calc(16.67%+24px)] right-[calc(16.67%+24px)] h-0.5 bg-gradient-to-r from-gold/40 via-gold to-gold/40" />

            {[
              {
                step: "1",
                title: "Choose Your State",
                desc: "Pick a western draw state and the species you're after.",
                icon: MapPin,
              },
              {
                step: "2",
                title: "Read the Agency Numbers",
                desc: "See quota, applicants, drawn, and points for each hunt, plus harvest and success by unit.",
                icon: BarChart3,
              },
              {
                step: "3",
                title: "Apply With Confidence",
                desc: "Build your short list from past results, then confirm the details with the agency before you apply.",
                icon: Shield,
              },
            ].map((item, i) => (
              <RevealSection key={item.step} delay={i * 120} className="flex-1">
                <div className="text-center relative">
                  <div className="w-12 h-12 rounded-full gradient-gold text-gold-foreground flex items-center justify-center text-lg font-bold mx-auto mb-4 shadow-lg ring-4 ring-background relative z-10">
                    {item.step}
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1.5">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-[240px] mx-auto">
                    {item.desc}
                  </p>
                </div>
              </RevealSection>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRICING                                                     */}
      {/* ============================================================ */}
      <section id="pricing" className="relative py-16 sm:py-20 lg:py-24 overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1760715659986-75c7207cac61?w=2400&q=80"
            alt="Mountain peaks bathed in golden hour light"
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/75" />
        </div>

        <div className="relative z-10 max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="bg-white/[0.08] backdrop-blur-lg border border-white/15 rounded-3xl p-7 sm:p-9 text-center shadow-2xl shadow-black/30">
              {/* Badge */}
              <div className="inline-flex items-center px-4 py-1.5 rounded-full bg-gold/20 text-gold text-xs font-semibold uppercase tracking-wider mb-5">
                HuntScout Pro
              </div>

              {/* Price */}
              <div className="mb-1.5">
                <span className="text-5xl sm:text-6xl font-extrabold text-white">
                  ${PRICE.amount}
                </span>
                <span className="text-white/60 ml-1">one-time</span>
              </div>
              <p className="text-gold font-semibold text-sm mb-5">
                2 years of Pro access · No auto-renewal
              </p>

              {/* Feature checklist -- two columns */}
              <ul className="text-left grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 mb-7">
                {PRICING_FEATURES.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2.5 text-sm text-white/80"
                  >
                    <Check className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                    {feat}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center w-full px-6 py-4 rounded-xl text-base font-bold gradient-gold text-gold-foreground shadow-lg hover:shadow-2xl hover:brightness-110 hover:scale-[1.02] transition-all duration-300 mb-3"
              >
                Get Pro — $14.99
              </Link>
              <p className="text-xs text-white/40">
                30-day money-back guarantee
              </p>

            </div>
          </RevealSection>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FAQ                                                         */}
      {/* ============================================================ */}
      <section id="faq" className="py-16 sm:py-20 lg:py-24 bg-card border-t border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-foreground">
                Frequently Asked Questions
              </h2>
            </div>
          </RevealSection>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <FAQItem key={faq.q} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FINAL CTA                                                   */}
      {/* ============================================================ */}
      <section className="relative py-16 sm:py-20 text-white text-center overflow-hidden">
        {/* Background photo */}
        <div className="absolute inset-0">
          <Image
            src="https://images.unsplash.com/photo-1563730212-61510cf2d704?w=1920&q=80"
            alt="Camping tents at dawn with warm golden light"
            fill
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/60" />
        </div>

        <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <h2
              className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-4"
              style={{ textShadow: "0 2px 16px rgba(0,0,0,0.4)" }}
            >
              Start Planning Your Next Hunt
            </h2>
            <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">
              Stop guessing. Start drawing. See what the agency numbers say before you
              spend your points.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href="/states"
                className="group inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold border-2 border-white/40 text-white hover:bg-white/15 hover:border-white/60 backdrop-blur-sm transition-all duration-300"
              >
                Explore States
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-bold gradient-gold text-gold-foreground shadow-lg hover:shadow-2xl hover:brightness-110 hover:scale-[1.02] transition-all duration-300"
              >
                Get Pro &mdash; $14.99
              </Link>
            </div>
          </RevealSection>
        </div>
      </section>
    </div>
  );
}
