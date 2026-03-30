"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Crosshair,
  TrendingUp,
  BarChart3,
  Calendar,
  Feather,
  Columns3,
  ChevronDown,
  Star,
  Check,
  ArrowRight,
  MapPin,
  Shield,
} from "lucide-react";
import { CountdownTimer } from "@/components/CountdownTimer";
import { PROMO } from "@/lib/promo";

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
/*  STATE DATA                                                         */
/* ------------------------------------------------------------------ */

const REGIONS: {
  name: string;
  states: { abbr: string; name: string; species: number }[];
}[] = [
  {
    name: "West",
    states: [
      { abbr: "AK", name: "Alaska", species: 9 },
      { abbr: "AZ", name: "Arizona", species: 7 },
      { abbr: "CA", name: "California", species: 5 },
      { abbr: "CO", name: "Colorado", species: 8 },
      { abbr: "HI", name: "Hawaii", species: 2 },
      { abbr: "ID", name: "Idaho", species: 8 },
      { abbr: "MT", name: "Montana", species: 8 },
      { abbr: "NV", name: "Nevada", species: 6 },
      { abbr: "NM", name: "New Mexico", species: 7 },
      { abbr: "OR", name: "Oregon", species: 6 },
      { abbr: "UT", name: "Utah", species: 7 },
      { abbr: "WA", name: "Washington", species: 6 },
      { abbr: "WY", name: "Wyoming", species: 8 },
    ],
  },
  {
    name: "Midwest",
    states: [
      { abbr: "IA", name: "Iowa", species: 4 },
      { abbr: "IL", name: "Illinois", species: 3 },
      { abbr: "IN", name: "Indiana", species: 3 },
      { abbr: "KS", name: "Kansas", species: 5 },
      { abbr: "MI", name: "Michigan", species: 5 },
      { abbr: "MN", name: "Minnesota", species: 5 },
      { abbr: "MO", name: "Missouri", species: 4 },
      { abbr: "ND", name: "North Dakota", species: 5 },
      { abbr: "NE", name: "Nebraska", species: 4 },
      { abbr: "OH", name: "Ohio", species: 3 },
      { abbr: "SD", name: "South Dakota", species: 5 },
      { abbr: "WI", name: "Wisconsin", species: 5 },
    ],
  },
  {
    name: "South",
    states: [
      { abbr: "AL", name: "Alabama", species: 4 },
      { abbr: "AR", name: "Arkansas", species: 4 },
      { abbr: "FL", name: "Florida", species: 3 },
      { abbr: "GA", name: "Georgia", species: 4 },
      { abbr: "KY", name: "Kentucky", species: 4 },
      { abbr: "LA", name: "Louisiana", species: 3 },
      { abbr: "MS", name: "Mississippi", species: 3 },
      { abbr: "NC", name: "North Carolina", species: 4 },
      { abbr: "OK", name: "Oklahoma", species: 5 },
      { abbr: "SC", name: "South Carolina", species: 3 },
      { abbr: "TN", name: "Tennessee", species: 4 },
      { abbr: "TX", name: "Texas", species: 6 },
      { abbr: "VA", name: "Virginia", species: 4 },
      { abbr: "WV", name: "West Virginia", species: 3 },
    ],
  },
  {
    name: "Northeast",
    states: [
      { abbr: "CT", name: "Connecticut", species: 2 },
      { abbr: "DE", name: "Delaware", species: 2 },
      { abbr: "MA", name: "Massachusetts", species: 2 },
      { abbr: "MD", name: "Maryland", species: 3 },
      { abbr: "ME", name: "Maine", species: 4 },
      { abbr: "NH", name: "New Hampshire", species: 3 },
      { abbr: "NJ", name: "New Jersey", species: 2 },
      { abbr: "NY", name: "New York", species: 4 },
      { abbr: "PA", name: "Pennsylvania", species: 4 },
      { abbr: "RI", name: "Rhode Island", species: 2 },
      { abbr: "VT", name: "Vermont", species: 3 },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  SPECIES DATA                                                       */
/* ------------------------------------------------------------------ */

const SPECIES = [
  {
    name: "Elk",
    image: "https://images.unsplash.com/photo-1633356984559-9877a6896ba8?w=1920&q=80",
    stats: "15 states \u2022 12,000+ units",
  },
  {
    name: "Deer",
    image: "https://images.unsplash.com/photo-1700244909533-b7ab4e4bd9ae?w=1920&q=80",
    stats: "50 states \u2022 45,000+ units",
  },
  {
    name: "Turkey",
    image: "https://images.unsplash.com/photo-1649532716965-c798cda4b153?w=1920&q=80",
    stats: "49 states \u2022 8,500+ units",
  },
  {
    name: "Moose",
    image: "https://images.unsplash.com/photo-1707079139889-1b8f7648fd38?w=1920&q=80",
    stats: "8 states \u2022 2,200+ units",
  },
  {
    name: "Bear",
    image: "https://images.unsplash.com/photo-1724937954901-cc4721a7670e?w=1920&q=80",
    stats: "32 states \u2022 6,400+ units",
  },
  {
    name: "Pronghorn",
    image: "https://images.unsplash.com/photo-1702338520328-ea01c36f08e8?w=1920&q=80",
    stats: "12 states \u2022 3,800+ units",
  },
  {
    name: "Sheep",
    image: "https://images.unsplash.com/photo-1562811931-fbf7e9a79245?w=1920&q=80",
    stats: "10 states \u2022 1,200+ units",
  },
];

/* ------------------------------------------------------------------ */
/*  FEATURES                                                           */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: Crosshair,
    title: "Draw Odds Intelligence",
    description:
      "Real draw odds by preference point level for every unit across every state.",
  },
  {
    icon: TrendingUp,
    title: "Point Creep Analysis",
    description:
      "Track how competition changes year over year so you never waste a point.",
  },
  {
    icon: BarChart3,
    title: "Harvest & Success Data",
    description:
      "Know which units produce before you apply. Success rates, harvest totals, and more.",
  },
  {
    icon: Calendar,
    title: "Hunt Planner",
    description:
      "Plan your season with application deadlines, checklists, and reminders.",
  },
  {
    icon: Feather,
    title: "Turkey Intelligence",
    description:
      "Spring and fall turkey data with subspecies tracking across every state.",
  },
  {
    icon: Columns3,
    title: "Compare & Decide",
    description:
      "Side-by-side unit comparison across states to find your best opportunity.",
  },
];

/* ------------------------------------------------------------------ */
/*  FAQ                                                                */
/* ------------------------------------------------------------------ */

const FAQS = [
  {
    q: "Where does the data come from?",
    a: "All data is sourced directly from state wildlife agencies, official harvest reports, and published draw results. We aggregate and normalize it so you can compare across states.",
  },
  {
    q: "How often is data updated?",
    a: "Data is updated annually after each state completes its draw cycle and publishes results. Some states with multiple seasons may see mid-year updates.",
  },
  {
    q: "Can I access data for all 50 states?",
    a: "Yes. One subscription gives you full access to draw odds, harvest data, and point analysis for every state with a controlled hunt draw.",
  },
  {
    q: "What's your refund policy?",
    a: "We offer a 30-day money-back guarantee, no questions asked. If HuntScout Pro doesn't help your hunting, we'll refund you in full.",
  },
  {
    q: "Do you cover turkey hunting?",
    a: "Absolutely. We have comprehensive turkey data including subspecies information (Eastern, Merriam's, Rio Grande, Osceola), spring and fall season data, and harvest statistics.",
  },
  {
    q: "What preference point systems do you track?",
    a: "All major systems: preference points, bonus points, weighted bonus, loyalty points, and random draw states. We show you exactly how each system works and what your odds look like.",
  },
];

/* ------------------------------------------------------------------ */
/*  TESTIMONIALS                                                       */
/* ------------------------------------------------------------------ */

const TESTIMONIALS = [
  {
    quote:
      "I drew my dream elk tag in Montana after 6 years of applying blind. HuntScout showed me units with better odds that I never knew about.",
    name: "Jake M.",
    location: "Montana",
  },
  {
    quote:
      "The point creep analysis saved me from wasting another year on a unit that's gotten way too competitive. Drew a great mule deer tag instead.",
    name: "Sarah K.",
    location: "Colorado",
  },
  {
    quote:
      "Finally, turkey data that actually helps. Found an incredible spring hunt in Kansas I would have never discovered on my own.",
    name: "Marcus R.",
    location: "Texas",
  },
];

/* ------------------------------------------------------------------ */
/*  PRICING FEATURES                                                   */
/* ------------------------------------------------------------------ */

const PRICING_FEATURES = [
  "Draw odds for all 50 states",
  "9+ species covered",
  "6 years of historical data",
  "Point creep analysis",
  "Harvest & success rates",
  "Unit comparison tools",
  "Hunt planner & calendar",
  "Turkey subspecies data",
  "Application deadline alerts",
  "New states added as available",
];

/* ------------------------------------------------------------------ */
/*  COMPONENTS                                                         */
/* ------------------------------------------------------------------ */

function FAQItem({ question, answer }: { question: string; answer: string }) {
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

function StateCard({
  abbr,
  name,
  species,
}: {
  abbr: string;
  name: string;
  species: number;
}) {
  const intensity =
    species >= 7
      ? "bg-primary text-white"
      : species >= 5
      ? "bg-primary-light/80 text-white"
      : species >= 3
      ? "bg-primary/20 text-primary"
      : "bg-primary/10 text-primary/70";

  return (
    <Link
      href={`/states/${name.toLowerCase().replace(/\s+/g, "-")}`}
      className={`group relative rounded-lg p-3 sm:p-3.5 text-center transition-all duration-200 hover:scale-105 hover:shadow-md ${intensity}`}
      title={`${name} \u2014 ${species} species`}
    >
      <div className="text-sm sm:text-base font-bold leading-none">{abbr}</div>
      <div className="text-[10px] sm:text-xs opacity-70 mt-1">{species} spp</div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
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
          {/* Promo badge -- top-left aligned */}
          <div className="animate-fade-in-up mb-5">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/40 border border-gold/40 text-sm backdrop-blur-md">
              <span className="animate-pulse-soft inline-block w-2 h-2 rounded-full bg-gold" />
              <span className="text-gold font-medium">
                {PROMO.tagline} through {PROMO.expiresLabel}
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
              Draw odds, harvest data, and point analysis for every hunt unit
              across all 50 states. Real data. Smarter applications. More tags.
            </p>

            <div className="animate-fade-in-up delay-300 flex flex-col sm:flex-row items-start gap-3 mb-12">
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-bold gradient-gold text-gold-foreground shadow-lg hover:shadow-2xl hover:brightness-110 hover:scale-[1.02] transition-all duration-300"
              >
                {PROMO.ctaText}
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
              {[
                "50 States",
                "9+ Species",
                "15,000+ Hunt Units",
                "6 Years of Data",
              ].map((stat, i) => (
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
      {/*  SPECIES SHOWCASE                                            */}
      {/* ============================================================ */}
      <section className="py-16 sm:py-20 lg:py-24 gradient-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-foreground">
                Real Data for the Species You Hunt
              </h2>
              <p className="text-lg text-muted-foreground mt-3 max-w-2xl mx-auto">
                Comprehensive intelligence for every major game species across America.
              </p>
            </div>
          </RevealSection>

          {/* Bento grid: first item spans 2 rows */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-fr">
            {SPECIES.map((species, i) => (
              <RevealSection
                key={species.name}
                delay={i * 80}
                className={i === 0 ? "row-span-2" : ""}
              >
                <Link
                  href="/states"
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
                      {species.stats}
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
                Everything you need to make smarter applications and fill more tags.
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
      {/*  STATE MAP GRID                                              */}
      {/* ============================================================ */}
      <section className="py-16 sm:py-20 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-foreground">
                All 50 States. One Platform.
              </h2>
              <p className="text-lg text-muted-foreground mt-3 max-w-2xl mx-auto">
                Select a state to explore draw odds, harvest data, and unit
                intelligence.
              </p>
            </div>
          </RevealSection>

          {REGIONS.map((region) => (
            <RevealSection key={region.name}>
              <div className="mb-8 last:mb-0">
                <div className="flex items-baseline gap-2 mb-3">
                  <h3 className="text-base font-bold text-foreground tracking-wide">
                    {region.name}
                  </h3>
                  <span className="text-xs font-medium text-muted-foreground">
                    {region.states.length} states
                  </span>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-13 gap-2.5">
                  {region.states.map((s) => (
                    <StateCard key={s.abbr} {...s} />
                  ))}
                </div>
              </div>
            </RevealSection>
          ))}

          {/* Legend */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary" />
              7+ species
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary-light/80" />
              5-6 species
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary/20" />
              3-4 species
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-primary/10" />
              1-2 species
            </div>
          </div>
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
                desc: "Select from all 50 states and pick your target species.",
                icon: MapPin,
              },
              {
                step: "2",
                title: "Filter & Compare",
                desc: "Narrow by species, season type, and points. Compare units side by side.",
                icon: BarChart3,
              },
              {
                step: "3",
                title: "Apply With Confidence",
                desc: "Make data-driven decisions. Know your real odds before you apply.",
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
                Early Bird Special
              </div>

              {/* Price */}
              <div className="mb-1.5">
                <span className="text-lg text-white/40 line-through mr-2">
                  ${PROMO.originalPrice}
                </span>
                <span className="text-5xl sm:text-6xl font-extrabold text-white">
                  ${PROMO.salePrice}
                </span>
                <span className="text-white/60 ml-1">/year</span>
              </div>
              <p className="text-gold font-semibold text-sm mb-5">
                Save {PROMO.percentOff}% + Get Year 2 FREE
              </p>

              {/* Countdown -- prominent with urgency indicator */}
              <div className="mb-6 bg-white/[0.06] border border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  <p className="text-xs text-white/70 uppercase tracking-wider font-semibold">
                    Offer ends April 30, 2026
                  </p>
                </div>
                <CountdownTimer />
              </div>

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
                Start Your Subscription
              </Link>
              <p className="text-xs text-white/40">
                30-day money-back guarantee
              </p>

              {/* Trust */}
              <div className="mt-5 pt-5 border-t border-white/10">
                <p className="text-sm text-white/50">
                  Join{" "}
                  <span className="text-white font-semibold">{PROMO.socialProofCount}</span>{" "}
                  hunters already using HuntScout Pro
                </p>
              </div>
            </div>
          </RevealSection>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  TESTIMONIALS                                                */}
      {/* ============================================================ */}
      <section className="relative py-16 sm:py-20 lg:py-24 bg-[#111] overflow-hidden">
        {/* Subtle photo accent */}
        <div className="absolute inset-0 opacity-[0.08]">
          <Image
            src="https://images.unsplash.com/photo-1557616974-db27bfcf6f6d?w=2400&q=80"
            alt="Mountain landscape"
            fill
            sizes="100vw"
            className="object-cover"
          />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RevealSection>
            <div className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight text-white">
                What Hunters Are Saying
              </h2>
              <p className="text-white/50 text-lg mt-3">
                Real stories from hunters who draw more tags.
              </p>
            </div>
          </RevealSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS.map((t, i) => (
              <RevealSection key={t.name} delay={i * 100}>
                <div className="bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-xl p-5 hover:bg-white/[0.10] transition-all duration-300">
                  {/* Compact star indicator */}
                  <div className="flex items-center gap-1 mb-3">
                    <Star className="w-3.5 h-3.5 fill-gold text-gold" />
                    <span className="text-xs text-gold/70 font-medium">5.0</span>
                  </div>
                  <blockquote className="text-sm text-white/80 leading-relaxed mb-4">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div className="text-sm">
                    <span className="font-semibold text-white">
                      {t.name}
                    </span>
                    <span className="text-white/50">
                      {" "}
                      &mdash; {t.location}
                    </span>
                  </div>
                </div>
              </RevealSection>
            ))}
          </div>
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
            {FAQS.map((faq) => (
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
              Stop guessing. Start drawing. Join thousands of hunters making
              smarter decisions with HuntScout Pro.
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
                Subscribe &mdash; 50% Off
              </Link>
            </div>
          </RevealSection>
        </div>
      </section>
    </div>
  );
}
