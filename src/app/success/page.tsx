"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ArrowRight,
  MapPin,
  SlidersHorizontal,
  Columns3,
  Crosshair,
  TrendingUp,
  BarChart3,
  Calendar,
  Feather,
  Globe,
  Mail,
} from "lucide-react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading"
  );

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      return;
    }

    async function verifyPayment() {
      try {
        const res = await fetch(
          `/api/subscription?session_id=${encodeURIComponent(sessionId!)}`
        );
        if (res.ok) {
          setStatus("success");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    }

    verifyPayment();
  }, [sessionId]);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-4" />
          <p className="text-muted-foreground">Verifying your payment...</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
          <p className="text-muted-foreground mb-6">
            We couldn&apos;t verify your payment. If you believe this is an
            error, please contact support at{" "}
            <a
              href="mailto:support@huntscoutpro.com"
              className="text-gold underline"
            >
              support@huntscoutpro.com
            </a>
            .
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold gradient-gold text-gold-foreground"
          >
            Back to Pricing
          </Link>
        </div>
      </div>
    );
  }

  const INCLUDED_FEATURES = [
    { icon: Crosshair, label: "Draw odds for all 50 states" },
    { icon: TrendingUp, label: "Point creep analysis" },
    { icon: BarChart3, label: "Harvest & success rates" },
    { icon: Calendar, label: "Hunt planner & calendar" },
    { icon: Feather, label: "Turkey subspecies data" },
    { icon: Columns3, label: "Side-by-side unit comparison" },
    { icon: Globe, label: "15,000+ hunt units" },
  ];

  return (
    <div className="min-h-screen py-16 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success header */}
        <div className="text-center mb-12">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6">
            <Check className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-3xl font-bold mb-3">
            Welcome to HuntScout Pro!
          </h1>
          <p className="text-muted-foreground text-lg">
            Your membership is now active. You have full access to draw odds,
            harvest data, point analysis, and everything else across all 50
            states.
          </p>
        </div>

        {/* Get Started steps */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-8">
          <h2 className="text-xl font-bold text-foreground mb-6">
            Get Started in 3 Steps
          </h2>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full gradient-gold text-gold-foreground flex items-center justify-center text-sm font-bold shrink-0">
                1
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-gold" />
                  Choose Your State
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Browse all 50 states and select the ones you plan to apply in
                  this season.
                </p>
                <Link
                  href="/states"
                  className="inline-flex items-center gap-1 text-sm text-gold font-medium hover:underline"
                >
                  Browse states <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full gradient-gold text-gold-foreground flex items-center justify-center text-sm font-bold shrink-0">
                2
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-gold" />
                  Set Your Preference Points
                </h3>
                <p className="text-sm text-muted-foreground">
                  Use the preference point filter on any state page to see draw
                  odds specific to your point level. This helps you find units
                  where you have a realistic chance of drawing.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full gradient-gold text-gold-foreground flex items-center justify-center text-sm font-bold shrink-0">
                3
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                  <Columns3 className="w-4 h-4 text-gold" />
                  Compare Units
                </h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Put your top units side by side to compare draw odds, harvest
                  rates, and success data before you apply.
                </p>
                <Link
                  href="/compare"
                  className="inline-flex items-center gap-1 text-sm text-gold font-medium hover:underline"
                >
                  Open comparison tool <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* What you have access to */}
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 mb-8">
          <h2 className="text-xl font-bold text-foreground mb-5">
            Your Pro Access Includes
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {INCLUDED_FEATURES.map((feat) => {
              const Icon = feat.icon;
              return (
                <li
                  key={feat.label}
                  className="flex items-center gap-3 text-sm text-foreground"
                >
                  <Icon className="w-4 h-4 text-gold shrink-0" />
                  {feat.label}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Quick actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
          <Link
            href="/states"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
          >
            Explore States <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/planner"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold border border-border hover:bg-muted transition-all"
          >
            Open Hunt Planner
          </Link>
        </div>

        {/* Need help */}
        <div className="text-center border-t border-border pt-8">
          <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
            <Mail className="w-4 h-4" />
            <span className="text-sm font-medium">Need help?</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Reach out anytime at{" "}
            <a
              href="mailto:support@huntscoutpro.com"
              className="text-gold hover:underline"
            >
              support@huntscoutpro.com
            </a>{" "}
            and we&apos;ll get you sorted.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
