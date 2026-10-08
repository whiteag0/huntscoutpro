"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowRight,
  Check,
  X,
  ChevronDown,
  Shield,
  Zap,
  Globe,
  BarChart3,
  Calendar,
  TrendingUp,
} from "lucide-react";
import { CheckoutButton } from "@/components/CheckoutButton";
import { PRICE } from "@/lib/promo";

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

// Only list features that exist in the app today. Draw odds, points, and
// tag/applicant counts are modeled estimates — say so.
const FEATURE_CATEGORIES = [
  {
    category: "Draw Odds (Estimates)",
    icon: Zap,
    features: [
      "Modeled draw odds by preference/bonus point level",
      "Estimated minimum points to draw",
      "Point creep trends over time",
      "Resident vs non-resident breakdowns",
      "Draw system explainer for each state",
    ],
  },
  {
    category: "Harvest & Success",
    icon: BarChart3,
    features: [
      "Harvest totals and success rates by unit",
      "Agency harvest report figures where available (select species in CO, WY, ID, MT, WI)",
      "Hunter participation figures",
      "Clear labels on what is agency data vs. estimated",
    ],
  },
  {
    category: "Planning Tools",
    icon: Calendar,
    features: [
      "Season & application date calendar",
      "Hunt planner with application timeline",
      "Hunt budget calculator",
      "Gear checklist",
      "Export/import your plan (saved in your browser)",
    ],
  },
  {
    category: "Coverage",
    icon: Globe,
    features: [
      "All 50 states",
      "10 species: elk, mule deer, whitetail, pronghorn, moose, bear, bighorn sheep, mountain goat, mountain lion, turkey",
      "Turkey subspecies guide",
    ],
  },
  {
    category: "Analysis & Comparison",
    icon: TrendingUp,
    features: [
      "Side-by-side unit comparison",
      "Filters by residency, season, sex, and your points",
      "Sort units by odds, success rate, tags, or harvest",
    ],
  },
];

const COMPARISON = {
  without: [
    "Hours digging through state websites",
    "Scattered spreadsheets and notes",
    "No easy way to compare units",
    "Losing track of application dates",
  ],
  with: [
    "Units, odds estimates, and harvest figures in one place",
    "Agency harvest numbers clearly labeled where we have them",
    "Side-by-side unit comparison",
    "Planner and calendar to keep applications organized",
  ],
};

const BILLING_FAQS = [
  {
    q: "What do I pay, and for how long?",
    a: "HuntScout Pro is a one-time payment of $14.99, which includes 2 years (24 months) of Pro access starting on your purchase date.",
  },
  {
    q: "Will I be charged again automatically?",
    a: "No. There is no subscription and nothing auto-renews. Your card is charged once at checkout, and there is nothing to cancel.",
  },
  {
    q: "What payment methods do you accept?",
    a: "Major credit and debit cards, processed securely by Stripe. We never see or store your full card number.",
  },
  {
    q: "What is the refund policy?",
    a: "We offer a 30-day money-back guarantee. If HuntScout Pro isn't for you, email support@huntscoutpro.com within 30 days of purchase for a full refund.",
  },
  {
    q: "Are the draw odds official?",
    a: "No. Draw odds, minimum points, and tag and applicant counts are estimates from our model, not official draw results. Harvest and success figures use state agency reports where available and are labeled on each page. Always confirm with the state wildlife agency before applying.",
  },
  {
    q: "Is there a free trial?",
    a: "You can preview select data before buying, and the 30-day money-back guarantee covers your purchase.",
  },
  {
    q: "Do you offer group or family pricing?",
    a: "Not at this time. Each purchase covers one account.",
  },
];

const PLAN_FEATURES = [
  "Modeled draw odds for all 50 states",
  "10 species covered",
  "Point creep trends",
  "Harvest & success rates",
  "Side-by-side unit comparison",
  "Hunt planner & budget calculator",
  "Season & application calendar",
  "Turkey subspecies guide",
];

/* ------------------------------------------------------------------ */
/*  COMPONENTS                                                         */
/* ------------------------------------------------------------------ */

function BillingFAQItem({
  question,
  answer,
}: {
  question: string;
  answer: string;
}) {
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

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

function formatLongDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** Shown instead of the sales page to anyone who already has Pro. */
function ProMemberPanel({
  isSuperAdmin,
  proExpiresAt,
}: {
  isSuperAdmin: boolean;
  proExpiresAt: string | null;
}) {
  const until = formatLongDate(proExpiresAt);
  return (
    <div className="min-h-screen gradient-subtle px-4 py-16 sm:py-24">
      <div className="max-w-lg mx-auto bg-card border border-border rounded-2xl p-6 sm:p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-green-500/15 flex items-center justify-center mb-5">
          <Check className="w-7 h-7 text-green-600" aria-hidden="true" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
          You&apos;re a Pro member
        </h1>
        <p className="text-muted-foreground mt-3">
          {isSuperAdmin
            ? "Your admin account has full access to every state and species."
            : until
            ? `Your access to every state and species is active through ${until}.`
            : "Your access to every state and species is active."}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
          <Link
            href="/states"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
          >
            Explore states <ArrowRight className="w-4 h-4" aria-hidden="true" />
          </Link>
          <Link
            href="/account"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-all"
          >
            My account
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  const { data: session, status } = useSession();

  // Don't flash the sales page at a member while the session loads, but keep
  // it in the server HTML (invisible) so crawlers still get the pricing copy.
  // Same wrapper element once the session resolves, so nothing remounts.
  const pending = status === "loading" && !session;

  if (session?.user?.isPro) {
    return (
      <ProMemberPanel
        isSuperAdmin={Boolean(session.user.isSuperAdmin)}
        proExpiresAt={session.user.proExpiresAt ?? null}
      />
    );
  }

  return (
    <div className={pending ? "invisible" : undefined} aria-busy={pending || undefined}>
      <PricingMarketing />
    </div>
  );
}

function PricingMarketing() {
  return (
    <div className="min-h-screen">
      {/* ============================================================ */}
      {/*  HERO                                                        */}
      {/* ============================================================ */}
      <section className="gradient-hero text-white py-20 sm:py-28">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight mb-4">
            Simple Pricing.{" "}
            <span className="text-gradient-gold">Serious Data.</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto">
            One price. Every state. Every species. Pay once &mdash; no
            subscription, no auto-renewal.
          </p>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRICING CARD                                                */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-24 gradient-subtle">
        <div className="max-w-lg mx-auto px-4 sm:px-6">
          <div className="bg-card border border-border rounded-3xl shadow-xl overflow-hidden">
            {/* Top banner */}
            <div className="gradient-gold px-6 py-3 text-center">
              <span className="text-sm font-bold text-gold-foreground uppercase tracking-wider">
                One-time payment
              </span>
            </div>

            <div className="p-8 sm:p-10 text-center">
              {/* Plan name */}
              <h2 className="text-2xl font-bold text-foreground mb-1">
                HuntScout Pro
              </h2>
              <p className="text-sm text-muted-foreground mb-6">
                Full access to everything
              </p>

              {/* Price */}
              <div className="mb-2">
                <span className="text-5xl sm:text-6xl font-extrabold text-foreground">
                  ${PRICE.amount}
                </span>
                <span className="text-muted-foreground ml-1">one-time</span>
              </div>
              <p className="text-gold font-semibold text-sm mb-8">
                2 years of Pro access &middot; No auto-renewal
              </p>

              {/* Feature checklist */}
              <ul className="text-left space-y-3 mb-8">
                {PLAN_FEATURES.map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-3 text-sm text-foreground"
                  >
                    <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    {feat}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <CheckoutButton
                className="inline-flex items-center justify-center w-full px-6 py-4 rounded-xl text-base font-bold gradient-gold text-gold-foreground shadow-lg hover:shadow-2xl hover:brightness-110 hover:scale-[1.02] transition-all duration-300 mb-3 cursor-pointer disabled:opacity-50"
              >
                Get Pro Access &mdash; ${PRICE.amount}
              </CheckoutButton>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="w-3.5 h-3.5" />
                30-day money-back guarantee
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6 max-w-sm mx-auto">
            Draw odds, minimum points, and tag &amp; applicant counts are
            modeled estimates, not official draw results. Confirm with the
            state wildlife agency before applying.
          </p>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  COMPARISON                                                  */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Stop Guessing. Start Drawing.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Without */}
            <div className="border border-border rounded-2xl p-7 bg-card">
              <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                <X className="w-5 h-5 text-danger" />
                Without HuntScout
              </h3>
              <ul className="space-y-3">
                {COMPARISON.without.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-muted-foreground"
                  >
                    <X className="w-4 h-4 text-danger/50 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* With */}
            <div className="border-2 border-gold rounded-2xl p-7 bg-gold/5 relative">
              <div className="absolute -top-3 left-6 px-3 py-0.5 rounded-full bg-gold text-gold-foreground text-xs font-bold uppercase tracking-wider">
                Better way
              </div>
              <h3 className="text-lg font-bold text-foreground mb-5 flex items-center gap-2">
                <Check className="w-5 h-5 text-success" />
                With HuntScout Pro
              </h3>
              <ul className="space-y-3">
                {COMPARISON.with.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-sm text-foreground"
                  >
                    <Check className="w-4 h-4 text-success shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  FEATURE BREAKDOWN                                           */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-24 bg-card border-y border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Everything Included
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
              One purchase unlocks every feature for 2 years. No tiers, no add-ons.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURE_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <div key={cat.category}>
                  <div className="flex items-center gap-2 mb-4">
                    <Icon className="w-5 h-5 text-gold" />
                    <h3 className="text-base font-semibold text-foreground">
                      {cat.category}
                    </h3>
                  </div>
                  <ul className="space-y-2.5">
                    {cat.features.map((feat) => (
                      <li
                        key={feat}
                        className="flex items-start gap-2 text-sm text-muted-foreground"
                      >
                        <Check className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  BILLING FAQ                                                 */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Billing Questions
            </h2>
          </div>

          <div className="space-y-3">
            {BILLING_FAQS.map((faq) => (
              <BillingFAQItem
                key={faq.q}
                question={faq.q}
                answer={faq.a}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  BOTTOM CTA                                                  */}
      {/* ============================================================ */}
      <section className="py-20 sm:py-24 gradient-hero text-white text-center">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Plan Your Next Draw Season
          </h2>
          <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">
            {PRICE.summary}.
          </p>
          <CheckoutButton
            className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-bold gradient-gold text-gold-foreground shadow-lg hover:shadow-2xl hover:brightness-110 hover:scale-[1.02] transition-all duration-300 cursor-pointer disabled:opacity-50"
          >
            Get Pro Access
          </CheckoutButton>
          <p className="text-xs text-white/40 mt-4">
            30-day money-back guarantee &middot; Nothing to cancel
          </p>
        </div>
      </section>
    </div>
  );
}
