"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Bird,
  Calendar,
  Check,
  ClipboardList,
  GitCompareArrows,
  Info,
  Map as MapIcon,
  Pencil,
  TrendingUp,
  User,
} from "lucide-react";
import { SPECIES_LABELS, type Species } from "@/data/types";
import { GOAL_OPTIONS, METHOD_OPTIONS, sanitizePreferences, type HuntingPreferences } from "@/lib/preferences-schema";
import { stateByAbbrev, stateBySlug } from "@/data/state-list";
import { isLiveState } from "@/lib/agency-format";

/* ------------------------------------------------------------------ */
/*  MEMBER HOME (Pro members never see the marketing page)             */
/* ------------------------------------------------------------------ */

const QUICK_LAUNCH = [
  { href: "/states", label: "States", desc: "Agency draw results and harvest by unit", icon: MapIcon },
  { href: "/compare", label: "Compare", desc: "Line up hunts side by side", icon: GitCompareArrows },
  { href: "/trends", label: "Trends", desc: "Minimum points drawn, year over year", icon: TrendingUp },
  { href: "/planner", label: "Planner", desc: "Applications, budget, and gear", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", desc: "Agency application and draw dates", icon: Calendar },
  { href: "/turkey", label: "Turkey", desc: "Turkey licensing, dates, and harvest", icon: Bird },
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
                if (!st) return <Chip key={slug}>{slug}</Chip>;
                // States without published agency data link to their coming-soon page.
                return isLiveState(st.slug) ? (
                  <Link
                    key={slug}
                    href={`/states/${st.slug}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors"
                  >
                    {st.name}
                    <ArrowRight className="w-3 h-3" aria-hidden="true" />
                  </Link>
                ) : (
                  <Link
                    key={slug}
                    href={`/states/${st.slug}#request`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted text-xs font-medium text-foreground hover:bg-muted/70 transition-colors"
                  >
                    {st.name}
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Coming soon
                    </span>
                  </Link>
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

export function MemberHome({
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
                Application periods, draw results, and other dates the agencies publish, in one calendar.
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
          Every figure is a state wildlife agency&apos;s published result, cited to its report.
          Past draws don&apos;t guarantee future odds. Confirm dates, quotas, and rules with the
          agency before you apply.
        </p>
      </div>
    </div>
  );
}
