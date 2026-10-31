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
import { LIVE_STATES } from "@/lib/agency-format";

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

// Only list features that exist in the app today. Every figure on the site is
// published state wildlife agency data, cited to its source; nothing is modeled.
const coverageLine =
  LIVE_STATES.length > 0
    ? `${LIVE_STATES.length} western draw state${LIVE_STATES.length === 1 ? "" : "s"}: ${LIVE_STATES.map((s) => s.name).join(", ")}`
    : "Western draw states, each added once its agency data is checked";

const FEATURE_CATEGORIES = [
  {
    category: "Draw Results",
    icon: Zap,
    features: [
      "Quota, applicants, and drawn for each hunt code",
      "Applicants and drawn by point level, where the agency publishes it",
      "Minimum points drawn, year over year",
      "Resident and nonresident results, where published",
      "How each state's draw works, by species",
    ],
  },
  {
    category: "Harvest & Success",
    icon: BarChart3,
    features: [
      "Hunters, harvest, and success rate by unit",
      "Taken from each agency's harvest reports",
      "Multi-year history for each unit",
      "Source link on every table",
    ],
  },
  {
    category: "Planning Tools",
    icon: Calendar,
    features: [
      "Calendar of agency application and draw dates",
      "Agency license and application fees",
      "Hunt planner with application timeline",
      "Hunt budget tracker and gear checklist",
      "Export/import your plan (saved in your browser)",
    ],
  },
  {
    category: "Coverage",
    icon: Globe,
    features: [
      coverageLine,
      "Elk, deer, pronghorn, moose, bear, bighorn sheep, mountain goat, mountain lion, and turkey, where each agency publishes them",
      "More states coming soon. Request yours anytime",
    ],
  },
  {
    category: "Analysis & Comparison",
    icon: TrendingUp,
    features: [
      "Side-by-side hunt comparison",
      "Resident or nonresident view at your point level",
      "Sort draws by quota, applicants, odds, or minimum points",
      "Sort harvest by hunters, harvest, or success rate",
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
    "Agency draw results and harvest by unit in one place",
    "Every number cited to the agency report it came from",
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
    q: "Where do the numbers come from?",
    a: "Every figure comes from a state wildlife agency's own published reports: draw results, harvest reports, application dates, and license fees. Each table links to its source. Nothing is modeled or estimated. These are past results, not predictions, so confirm dates and rules with the agency before applying.",
  },
  {
    q: "Is there a free trial?",
    a: "You can see a short preview of each state's tables before buying, and the 30-day money-back guarantee covers your purchase.",
  },
  {
    q: "Do you offer group or family pricing?",
    a: "Not at this time. Each purchase covers one account.",
  },
];

const PLAN_FEATURES = [
  "Agency draw results by hunt code",
  "Applicants & drawn by point level (where published)",
  "Minimum points drawn, year over year",
  "Harvest & success by unit",
  "Side-by-side hunt comparison",
  "Calendar of agency dates",
  "Hunt planner & budget tracker",
  "Source link on every table",
  "New states as they go live",
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
            ? "Your admin account has full access to everything on HuntScout Pro."
            : until
            ? `Your full access to HuntScout Pro is active through ${until}.`
            : "Your full access to HuntScout Pro is active."}
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
            One price. Every live state and species, with every number taken
            from agency reports. Pay once &mdash; no subscription, no auto-renewal.
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
            Every figure is a state wildlife agency&apos;s published result,
            cited to its source. Past draws don&apos;t guarantee future odds.
            Confirm dates and rules with the agency before applying.
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
