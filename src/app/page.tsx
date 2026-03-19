"use client";

import { useState } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { CountdownTimer } from "@/components/CountdownTimer";

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
/*  FEATURES                                                           */
/* ------------------------------------------------------------------ */

const FEATURES = [
  {
    icon: Crosshair,
    title: "Draw Odds Intelligence",
    description:
      "Real draw odds by preference point level for every unit across every state.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: TrendingUp,
    title: "Point Creep Analysis",
    description:
      "Track how competition changes year over year so you never waste a point.",
    color: "bg-accent/10 text-accent",
  },
  {
    icon: BarChart3,
    title: "Harvest & Success Data",
    description:
      "Know which units produce before you apply. Success rates, harvest totals, and more.",
    color: "bg-success/10 text-success",
  },
  {
    icon: Calendar,
    title: "Hunt Planner",
    description:
      "Plan your season with application deadlines, checklists, and reminders.",
    color: "bg-gold/10 text-gold",
  },
  {
    icon: Feather,
    title: "Turkey Intelligence",
    description:
      "Spring and fall turkey data with subspecies tracking across every state.",
    color: "bg-primary-light/10 text-primary-light",
  },
  {
    icon: Columns3,
    title: "Compare & Decide",
    description:
      "Side-by-side unit comparison across states to find your best opportunity.",
    color: "bg-accent/10 text-accent",
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
          open ? "max-h-48 opacity-100" : "max-h-0 opacity-0"
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
      className={`group relative rounded-lg p-2.5 sm:p-3 text-center transition-all duration-200 hover:scale-105 hover:shadow-md ${intensity}`}
      title={`${name} — ${species} species`}
    >
      <div className="text-sm sm:text-base font-bold">{abbr}</div>
      <div className="text-[10px] opacity-70">{species} spp</div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* ============================================================ */}
      {/*  HERO                                                        */}
      {/* ============================================================ */}
      <section className="relative gradient-hero text-white overflow-hidden">
        {/* Decorative background shapes */}
        <div className="absolute inset-0 opacity-[0.04]">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle at 20% 50%, rgba(212,165,55,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(196,101,26,0.2) 0%, transparent 40%)",
            }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-28 lg:py-36">
          {/* Promo badge */}
          <div className="animate-fade-in-up flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gold/15 border border-gold/30 text-sm">
              <span className="animate-pulse-soft inline-block w-2 h-2 rounded-full bg-gold" />
              <span className="text-gold font-medium">
                Limited Time: 50% off + second year FREE through April 30th
              </span>
            </div>
          </div>

          <div className="text-center max-w-4xl mx-auto">
            <h1 className="animate-fade-in-up text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.1] mb-6">
              Know Before{" "}
              <span className="text-gradient-gold">You Draw</span>
            </h1>

            <p className="animate-fade-in-up delay-200 text-lg sm:text-xl text-white/70 max-w-2xl mx-auto mb-10 leading-relaxed">
              Draw odds, harvest data, and point analysis for every hunt unit
              across all 50 states. Make smarter applications, fill more tags.
            </p>

            <div className="animate-fade-in-up delay-300 flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
              <Link
                href="/states"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold border-2 border-white/30 text-white hover:bg-white/10 transition-all duration-200"
              >
                Explore Free Preview
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold gradient-gold text-gold-foreground shadow-lg hover:shadow-xl hover:brightness-110 transition-all duration-200"
              >
                Subscribe — 50% Off
              </Link>
            </div>
          </div>

          {/* Stats bar */}
          <div className="animate-fade-in-up delay-400 max-w-3xl mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 py-5 px-6 rounded-2xl bg-white/[0.06] border border-white/10">
              {[
                "50 States",
                "9+ Species",
                "15,000+ Hunt Units",
                "6 Years of Data",
              ].map((stat, i) => (
                <span
                  key={stat}
                  className="text-sm sm:text-base font-medium text-white/80"
                >
                  {i > 0 && (
                    <span className="hidden sm:inline text-white/20 mr-8">
                      |
                    </span>
                  )}
                  {stat}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FEATURES                                                    */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-24 gradient-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Everything You Need to Plan Your Hunt
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              From draw odds to harvest data, one platform gives you the edge.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group bg-card border border-border rounded-2xl p-6 sm:p-7 hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
                >
                  <div
                    className={`w-12 h-12 rounded-xl ${f.color} flex items-center justify-center mb-5`}
                  >
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {f.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {f.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  STATE MAP GRID                                              */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              All 50 States. One Platform.
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              Select a state to explore draw odds, harvest data, and unit
              intelligence.
            </p>
          </div>

          {REGIONS.map((region) => (
            <div key={region.name} className="mb-10 last:mb-0">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {region.name}
              </h3>
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-13 gap-2">
                {region.states.map((s) => (
                  <StateCard key={s.abbr} {...s} />
                ))}
              </div>
            </div>
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
      <section className="py-20 sm:py-24 bg-card border-y border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              How It Works
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-lg">
              Three simple steps to smarter hunting applications.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {[
              {
                step: "1",
                title: "Choose Your State",
                desc: "Select from all 50 states and pick your target species. We have data for elk, deer, pronghorn, moose, bear, sheep, goat, turkey, and more.",
              },
              {
                step: "2",
                title: "Filter & Compare",
                desc: "Narrow by species, season type, and your preference points. Compare units side by side to find hidden gems.",
              },
              {
                step: "3",
                title: "Apply With Confidence",
                desc: "Make data-driven application decisions. Know your real odds before you spend money and points.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 rounded-full gradient-gold text-gold-foreground flex items-center justify-center text-xl font-bold mx-auto mb-5 shadow-md">
                  {item.step}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRICING                                                     */}
      {/* ============================================================ */}
      <section id="pricing" className="py-20 sm:py-24 gradient-hero text-white">
        <div className="max-w-xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white/[0.06] border border-white/10 rounded-3xl p-8 sm:p-10 text-center">
            {/* Badge */}
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-gold/20 text-gold text-xs font-semibold uppercase tracking-wider mb-6">
              Early Bird Special
            </div>

            {/* Price */}
            <div className="mb-2">
              <span className="text-lg text-white/40 line-through mr-2">
                $29.99
              </span>
              <span className="text-5xl sm:text-6xl font-extrabold text-white">
                $14.99
              </span>
              <span className="text-white/60 ml-1">/year</span>
            </div>
            <p className="text-gold font-semibold text-sm mb-6">
              Save 50% + Get Year 2 FREE
            </p>

            {/* Countdown */}
            <div className="mb-8">
              <p className="text-xs text-white/50 uppercase tracking-wider mb-3">
                Offer ends April 30, 2026
              </p>
              <CountdownTimer />
            </div>

            {/* Feature checklist */}
            <ul className="text-left space-y-3 mb-8">
              {PRICING_FEATURES.map((feat) => (
                <li
                  key={feat}
                  className="flex items-start gap-3 text-sm text-white/80"
                >
                  <Check className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                  {feat}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link
              href="/pricing"
              className="inline-flex items-center justify-center w-full px-6 py-4 rounded-xl text-base font-bold gradient-gold text-gold-foreground shadow-lg hover:shadow-xl hover:brightness-110 transition-all duration-200 mb-4"
            >
              Start Your Subscription
            </Link>
            <p className="text-xs text-white/40">
              30-day money-back guarantee
            </p>

            {/* Trust */}
            <div className="mt-6 pt-6 border-t border-white/10">
              <p className="text-sm text-white/50">
                Join{" "}
                <span className="text-white font-semibold">12,000+</span>{" "}
                hunters already using HuntScout Pro
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  TESTIMONIALS                                                */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              What Hunters Are Saying
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="bg-card border border-border rounded-2xl p-7 hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
              >
                {/* Stars */}
                <div className="flex items-center gap-0.5 mb-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className="w-4 h-4 fill-gold text-gold"
                    />
                  ))}
                </div>
                <blockquote className="text-sm text-foreground leading-relaxed mb-5">
                  &ldquo;{t.quote}&rdquo;
                </blockquote>
                <div className="text-sm">
                  <span className="font-semibold text-foreground">
                    {t.name}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    &mdash; {t.location}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FAQ                                                         */}
      {/* ============================================================ */}
      <section id="faq" className="py-20 sm:py-24 bg-card border-t border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Frequently Asked Questions
            </h2>
          </div>

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
      <section className="py-20 sm:py-24 gradient-hero text-white text-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to Fill More Tags?
          </h2>
          <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">
            Stop guessing. Start drawing. Join thousands of hunters making
            smarter application decisions with HuntScout Pro.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/states"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold border-2 border-white/30 text-white hover:bg-white/10 transition-all duration-200"
            >
              Explore Free Preview
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl text-base font-semibold gradient-gold text-gold-foreground shadow-lg hover:shadow-xl hover:brightness-110 transition-all duration-200"
            >
              Subscribe — 50% Off
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
