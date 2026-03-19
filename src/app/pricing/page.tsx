"use client";

import { useState } from "react";
import Link from "next/link";
import {
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
import { CountdownTimer } from "@/components/CountdownTimer";

/* ------------------------------------------------------------------ */
/*  DATA                                                               */
/* ------------------------------------------------------------------ */

const FEATURE_CATEGORIES = [
  {
    category: "Draw Intelligence",
    icon: Zap,
    features: [
      "Draw odds by preference point level",
      "Historical draw cutoffs (6 years)",
      "First-choice and second-choice odds",
      "Point creep trend analysis",
      "Bonus vs preference point modeling",
    ],
  },
  {
    category: "Harvest & Success",
    icon: BarChart3,
    features: [
      "Harvest totals by unit and season",
      "Success rate percentages",
      "Hunter participation data",
      "Average days to harvest",
      "Trophy quality indicators",
    ],
  },
  {
    category: "Planning Tools",
    icon: Calendar,
    features: [
      "Application deadline calendar",
      "Season date finder",
      "Multi-state application planner",
      "Point banking calculator",
      "Cost-per-tag estimator",
    ],
  },
  {
    category: "Coverage",
    icon: Globe,
    features: [
      "All 50 states",
      "9+ species (elk, deer, pronghorn, moose, bear, sheep, goat, turkey, lion)",
      "15,000+ individual hunt units",
      "Spring and fall turkey data",
      "Subspecies tracking",
    ],
  },
  {
    category: "Analysis & Comparison",
    icon: TrendingUp,
    features: [
      "Side-by-side unit comparison",
      "Cross-state opportunity finder",
      "Point value analysis",
      "Resident vs non-resident breakdowns",
      "Custom filters and sorting",
    ],
  },
];

const COMPARISON = {
  without: [
    "Hours searching state websites",
    "Spreadsheets with outdated data",
    "Guessing on draw odds",
    "Wasting points on overhyped units",
    "Missing application deadlines",
    "No cross-state comparison",
  ],
  with: [
    "All data in one dashboard",
    "6 years of verified data",
    "Exact odds by your point level",
    "Data-driven unit selection",
    "Deadline reminders and calendar",
    "Compare any units, any states",
  ],
};

const BILLING_FAQS = [
  {
    q: "How does the 50% off promotion work?",
    a: "Your first year is $14.99 (normally $29.99). Plus, your second year is completely free. After that, your subscription renews at the standard $29.99/year rate. You can cancel anytime.",
  },
  {
    q: "When does the promotion end?",
    a: "The 50% off + free second year deal ends April 30, 2026 at midnight. After that, new subscriptions will be at the standard $29.99/year rate.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Absolutely. You can cancel your subscription at any time from your account settings. If you cancel during the promotional period, you'll still have access through the end of your paid period.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards (Visa, Mastercard, American Express, Discover) and PayPal. All payments are processed securely.",
  },
  {
    q: "Is there a free trial?",
    a: "We offer a free preview of select data so you can see the platform in action. Combined with our 30-day money-back guarantee, you can try HuntScout Pro risk-free.",
  },
  {
    q: "Do you offer group or family pricing?",
    a: "Not yet, but it's on our roadmap. For now, each subscription covers one account. Sign up for our newsletter to be the first to know when group plans launch.",
  },
];

const PLAN_FEATURES = [
  "Draw odds for all 50 states",
  "9+ species covered",
  "15,000+ hunt units",
  "6 years of historical data",
  "Point creep analysis",
  "Harvest & success rates",
  "Side-by-side comparison",
  "Hunt planner & calendar",
  "Application deadline alerts",
  "Turkey subspecies data",
  "Cross-state opportunity finder",
  "New features as they launch",
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

/* ------------------------------------------------------------------ */
/*  PAGE                                                               */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
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
            One plan. Every state. Every species. No hidden fees, no upsells.
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
                Early Bird Special — Limited Time
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
                <span className="text-lg text-muted-foreground line-through mr-2">
                  $29.99
                </span>
                <span className="text-5xl sm:text-6xl font-extrabold text-foreground">
                  $14.99
                </span>
                <span className="text-muted-foreground ml-1">/year</span>
              </div>
              <p className="text-gold font-semibold text-sm mb-8">
                Save 50% + Get Year 2 FREE
              </p>

              {/* Countdown */}
              <div className="bg-primary rounded-2xl p-5 mb-8">
                <p className="text-xs text-white/50 uppercase tracking-wider mb-3">
                  Offer ends April 30, 2026
                </p>
                <CountdownTimer />
              </div>

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
              <button className="w-full px-6 py-4 rounded-xl text-base font-bold gradient-gold text-gold-foreground shadow-lg hover:shadow-xl hover:brightness-110 transition-all duration-200 cursor-pointer mb-3">
                Start Your Subscription
              </button>

              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Shield className="w-3.5 h-3.5" />
                30-day money-back guarantee
              </div>
            </div>
          </div>

          {/* Trust */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Join{" "}
            <span className="font-semibold text-foreground">12,000+</span>{" "}
            hunters already using HuntScout Pro
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
              One subscription unlocks every feature. No tiers, no add-ons.
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
            Don&apos;t Miss the Early Bird Deal
          </h2>
          <p className="text-white/70 text-lg mb-8 max-w-xl mx-auto">
            Lock in 50% off plus a free second year. This offer won&apos;t last
            forever.
          </p>
          <div className="mb-8">
            <CountdownTimer />
          </div>
          <button className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-base font-bold gradient-gold text-gold-foreground shadow-lg hover:shadow-xl hover:brightness-110 transition-all duration-200 cursor-pointer">
            Start Your Subscription — $14.99/year
          </button>
          <p className="text-xs text-white/40 mt-4">
            30-day money-back guarantee &middot; Cancel anytime
          </p>
        </div>
      </section>
    </div>
  );
}
