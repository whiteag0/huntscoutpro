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
  Check,
  ArrowRight,
  MapPin,
  Shield,
  Map as MapIcon,
  Bird,
  GitCompareArrows,
  ClipboardList,
  Pencil,
  User,
  Info,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { PROMO } from "@/lib/promo";
import { SPECIES_LABELS, type Species } from "@/data/types";
import {
  GOAL_OPTIONS,
  METHOD_OPTIONS,
  sanitizePreferences,
  type HuntingPreferences,
} from "@/lib/preferences-schema";
import { stateByAbbrev, stateBySlug } from "@/data/state-list";

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
    stats: "15 states \u2022 5,700+ hunt codes",
  },
  {
    name: "Deer",
    image: "https://images.unsplash.com/photo-1700244909533-b7ab4e4bd9ae?w=1920&q=80",
    stats: "50 states \u2022 16,000+ hunt codes",
  },
  {
    name: "Turkey",
    image: "https://images.unsplash.com/photo-1649532716965-c798cda4b153?w=1920&q=80",
    stats: "48 states \u2022 8,200+ hunt codes",
  },
  {
    name: "Moose",
    image: "https://images.unsplash.com/photo-1707079139889-1b8f7648fd38?w=1920&q=80",
    stats: "12 states \u2022 880+ hunt codes",
  },
  {
    name: "Bear",
    image: "https://images.unsplash.com/photo-1781088172575-479cf75858e5?w=1920&q=80",
    stats: "36 states \u2022 1,400+ hunt codes",
  },
  {
    name: "Pronghorn",
    image: "https://images.unsplash.com/photo-1702338520328-ea01c36f08e8?w=1920&q=80",
    stats: "13 states \u2022 2,900+ hunt codes",
  },
  {
    name: "Sheep",
    image: "https://images.unsplash.com/photo-1562811931-fbf7e9a79245?w=1920&q=80",
    stats: "13 states \u2022 120+ hunt codes",
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
      "Estimated draw odds by preference point level, unit by unit, so you can shortlist before you apply.",
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
      "Plan your season with application deadlines, budgets, gear checklists, and a timeline.",
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
    a: "Harvest and success figures come from state wildlife agency reports where available (each state page labels its source). Draw odds, minimum points, and tag counts are modeled estimates, not official draw results, so always confirm with the state agency before you apply.",
  },
  {
    q: "How often is data updated?",
    a: "We add agency reports as states publish them, typically once a year after harvest and draw results are released.",
  },
  {
    q: "Can I access data for all 50 states?",
    a: "Yes. One $14.99 payment gives you 2 years of full access to draw odds estimates, harvest data, and point analysis for every state. No auto-renewal.",
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
/*  PRICING FEATURES                                                   */
/* ------------------------------------------------------------------ */

const PRICING_FEATURES = [
  "Draw odds estimates by unit",
  "10 species covered",
  "Multi-year trend charts",
  "Point creep analysis",
  "Harvest & success rates",
  "Unit comparison tools",
  "Hunt planner & calendar",
  "Turkey subspecies data",
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
/*  MEMBER HOME (Pro members never see the marketing page)             */
/* ------------------------------------------------------------------ */

const QUICK_LAUNCH = [
  { href: "/states", label: "States", desc: "Draw odds estimates and harvest data by unit", icon: MapIcon },
  { href: "/compare", label: "Compare", desc: "Line up units side by side", icon: GitCompareArrows },
  { href: "/trends", label: "Trends", desc: "Point creep over the years", icon: TrendingUp },
  { href: "/planner", label: "Planner", desc: "Applications, budget, and gear", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", desc: "Application deadlines and season dates", icon: Calendar },
  { href: "/turkey", label: "Turkey", desc: "Spring and fall seasons by subspecies", icon: Bird },
];

type PrefsLoad =
  | { state: "loading" }
  | { state: "ready"; preferences: HuntingPreferences | null }
  | { state: "error" };

function usePreferences(enabled: boolean): PrefsLoad {
  const [load, setLoad] = useState<PrefsLoad>({ state: "loading" });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch("/api/preferences", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setLoad({ state: "ready", preferences: sanitizePreferences(data?.preferences) });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return load;
}

function hasAnswers(p: HuntingPreferences | null): p is HuntingPreferences {
  if (!p) return false;
  return Boolean(
    p.states.length || p.species.length || p.methods.length || p.goals.length ||
      p.residency || p.homeState || p.units || p.points || p.notes
  );
}

const RESIDENCY_LABELS: Record<string, string> = {
  resident: "Resident",
  nonresident: "Nonresident",
  both: "Resident and nonresident",
};

function formatLongDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[7.5rem_1fr] gap-1 sm:gap-3 py-3 border-t border-border first:border-t-0 first:pt-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:pt-1">
        {label}
      </dt>
      <dd className="min-w-0 flex flex-wrap gap-1.5 text-sm text-foreground">{children}</dd>
    </div>
  );
}

function YourHuntsCard({ load }: { load: PrefsLoad }) {
  const prefs = load.state === "ready" ? load.preferences : null;
  const filled = hasAnswers(prefs);

  return (
    <section
      aria-labelledby="your-hunts-heading"
      className="bg-card border border-border rounded-2xl p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 id="your-hunts-heading" className="text-lg font-bold text-foreground">
            Your hunts
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            What you told us you&apos;re after this season.
          </p>
        </div>
        {filled && (
          <Link
            href="/welcome"
            className="inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium border border-border hover:bg-muted transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            Edit<span className="sr-only"> your hunting preferences</span>
          </Link>
        )}
      </div>

      {load.state === "loading" ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading your hunting preferences">
          <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
          <div className="h-4 w-3/5 rounded bg-muted animate-pulse" />
        </div>
      ) : load.state === "error" ? (
        <div className="text-sm text-muted-foreground">
          We couldn&apos;t load your hunting preferences right now.{" "}
          <Link href="/welcome" className="text-primary font-semibold underline underline-offset-2">
            View or update them
          </Link>
          .
        </div>
      ) : filled ? (
        <dl>
          {prefs.states.length > 0 && (
            <SummaryRow label="States">
              {prefs.states.map((slug) => {
                // Only link slugs we know; anything else is shown as typed.
                const st = stateBySlug(slug);
                return st ? (
                  <Link
                    key={slug}
                    href={`/states/${st.slug}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                  >
                    {st.name}
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                ) : (
                  <Chip key={slug}>{slug}</Chip>
                );
              })}
            </SummaryRow>
          )}
          {prefs.species.length > 0 && (
            <SummaryRow label="Species">
              {prefs.species.map((id) => (
                <Chip key={id}>{SPECIES_LABELS[id as Species] ?? id}</Chip>
              ))}
            </SummaryRow>
          )}
          {prefs.methods.length > 0 && (
            <SummaryRow label="Methods">
              {prefs.methods.map((id) => (
                <Chip key={id}>{METHOD_OPTIONS.find((m) => m.id === id)?.label ?? id}</Chip>
              ))}
            </SummaryRow>
          )}
          {(prefs.residency || prefs.homeState) && (
            <SummaryRow label="Applying as">
              <span>
                {[
                  RESIDENCY_LABELS[prefs.residency],
                  prefs.homeState &&
                    `home state ${stateByAbbrev(prefs.homeState)?.name ?? prefs.homeState}`,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            </SummaryRow>
          )}
          {prefs.goals.length > 0 && (
            <SummaryRow label="Goals">
              {prefs.goals.map((id) => (
                <Chip key={id}>{GOAL_OPTIONS.find((g) => g.id === id)?.label ?? id}</Chip>
              ))}
            </SummaryRow>
          )}
          {prefs.units && (
            <SummaryRow label="Units">
              <span className="break-words">{prefs.units}</span>
            </SummaryRow>
          )}
        </dl>
      ) : (
        <div className="rounded-xl border border-dashed border-gold/50 bg-gold/5 p-4 sm:p-5">
          <p className="font-semibold text-foreground">Tell us what you&apos;re hunting</p>
          <p className="text-sm text-muted-foreground mt-1">
            A few quick questions about your states, species, and weapons so we can
            tailor HuntScout to your hunts.
          </p>
          <Link
            href="/welcome"
            className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
          >
            Set up my hunts <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}

function MemberHome({
  firstName,
  isSuperAdmin,
  proExpiresAt,
}: {
  firstName: string | null;
  isSuperAdmin: boolean;
  proExpiresAt: string | null;
}) {
  const prefs = usePreferences(true);
  const until = formatLongDate(proExpiresAt);

  return (
    <div className="min-h-screen gradient-subtle">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
        {/* Greeting */}
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/15 text-xs font-semibold uppercase tracking-wide text-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-gold" aria-hidden="true" />
            Pro member
          </span>
          <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Welcome back{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-muted-foreground mt-2">
            Pick up your research where you left off.
          </p>
        </div>

        {/* Quick launch */}
        <nav aria-label="Pro tools" className="mb-8">
          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {QUICK_LAUNCH.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex h-full flex-col gap-2 bg-card border border-border rounded-2xl p-4 hover:border-gold/60 hover:shadow-md transition-all"
                  >
                    <span className="w-9 h-9 rounded-lg bg-gold/15 text-gold flex items-center justify-center">
                      <Icon className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                      {item.label}
                      <ArrowRight
                        className="w-3.5 h-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="text-xs sm:text-sm text-muted-foreground leading-snug">
                      {item.desc}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <div className="lg:col-span-2">
            <YourHuntsCard load={prefs} />
          </div>

          <div className="space-y-4 sm:space-y-6">
            <section
              aria-labelledby="key-dates-heading"
              className="bg-card border border-border rounded-2xl p-5 sm:p-6"
            >
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-5 h-5 text-gold" aria-hidden="true" />
                <h2 id="key-dates-heading" className="text-lg font-bold text-foreground">
                  Key dates
                </h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Application deadlines, draw results, and season openers in one calendar.
              </p>
              <Link
                href="/calendar"
                className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-primary hover:underline"
              >
                See upcoming dates <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </section>

            <section
              aria-labelledby="membership-heading"
              className="bg-card border border-border rounded-2xl p-5 sm:p-6"
            >
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-gold" aria-hidden="true" />
                <h2 id="membership-heading" className="text-lg font-bold text-foreground">
                  Membership
                </h2>
              </div>
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Check className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />
                {isSuperAdmin
                  ? "Admin, full access"
                  : until
                  ? `Pro access active through ${until}`
                  : "Pro access active"}
              </p>
              <Link
                href="/account"
                className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-primary hover:underline"
              >
                My account <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </section>
          </div>
        </div>

        <p className="mt-10 flex items-start gap-2 text-xs text-muted-foreground max-w-2xl">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          Draw odds, minimum points, and tag and applicant counts are modeled estimates,
          not official draw results. Confirm with the state wildlife agency before you apply.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

export default function HomePage() {
  const { data: session, status } = useSession();

  // Until we know who's here (first load only; a refetch via update() keeps
  // `session` populated), the marketing page is rendered but invisible.
  // That keeps it in the server HTML for crawlers and the hero image preload
  // for visitors, while a Pro member never sees it flash. The wrapper stays
  // the same element when the session resolves, so nothing remounts.
  const pending = status === "loading" && !session;

  if (session?.user?.isPro) {
    return (
      <MemberHome
        firstName={session.user.name?.trim().split(/\s+/)[0] || null}
        isSuperAdmin={Boolean(session.user.isSuperAdmin)}
        proExpiresAt={session.user.proExpiresAt ?? null}
      />
    );
  }

  return (
    <div className={pending ? "invisible" : undefined} aria-busy={pending || undefined}>
      <MarketingHome />
    </div>
  );
}

function MarketingHome() {
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
                {PROMO.tagline}
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
              Draw odds estimates, agency harvest data, and point analysis
              across all 50 states. Research smarter before you apply.
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
                "35,000+ Hunt Codes",
                "Agency Harvest Data",
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
                HuntScout Pro
              </div>

              {/* Price */}
              <div className="mb-1.5">
                <span className="text-5xl sm:text-6xl font-extrabold text-white">
                  ${PROMO.salePrice}
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
                Get Pro &mdash; $14.99
              </Link>
            </div>
          </RevealSection>
        </div>
      </section>
    </div>
  );
}
