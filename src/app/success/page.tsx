"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
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
  Mail,
} from "lucide-react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { status: authStatus, update } = useSession();
  const [status, setStatus] = useState<"loading" | "success" | "pending" | "signin" | "error">(
    "loading"
  );
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (authStatus === "loading") return;
    if (authStatus === "unauthenticated") {
      setStatus("signin");
      return;
    }
    // Verify once per checkout session. update() below flips authStatus to
    // "loading" and back, which would otherwise re-run this effect forever.
    const key = sessionId ?? "";
    if (ranFor.current === key) return;
    ranFor.current = key;

    async function verifyPayment() {
      try {
        const qs = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
        const res = await fetch(`/api/subscription${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (data.isPro) {
          // Refresh the login session so every page unlocks immediately.
          await update({ refresh: "entitlement" });
          setExpiresAt(data.expiresAt ?? null);
          setStatus("success");
        } else if (data.checkout?.paid) {
          setStatus("pending");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    }

    verifyPayment();
  }, [sessionId, authStatus, update]);

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

  if (status === "signin") {
    const callbackUrl = `/success${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`;
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Sign in to activate Pro</h1>
          <p className="text-muted-foreground mb-6">
            Sign in with the same Google account you used at checkout and your
            membership will be linked automatically.
          </p>
          <button
            onClick={() => signIn("google", { callbackUrl })}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold gradient-gold text-gold-foreground cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (status === "pending" || status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">
            {status === "pending" ? "Payment received \u2014 activating your account" : "We couldn\u2019t confirm your membership yet"}
          </h1>
          <p className="text-muted-foreground mb-6">
            {status === "pending"
              ? "Your payment went through. Activation usually takes a moment; try refreshing this page. "
              : "If you just paid, give it a minute and refresh. Make sure you\u2019re signed in with the same Google account you used at checkout. "}
            Still stuck? Email{" "}
            <a
              href="mailto:support@huntscoutpro.com"
              className="text-gold underline"
            >
              support@huntscoutpro.com
            </a>{" "}
            and we&apos;ll unlock your account right away.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold gradient-gold text-gold-foreground cursor-pointer"
            >
              Refresh
            </button>
            <Link
              href="/account"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold border border-border hover:bg-muted transition-all"
            >
              My Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const INCLUDED_FEATURES = [
    { icon: Crosshair, label: "Draw odds estimates by unit" },
    { icon: TrendingUp, label: "Point creep analysis" },
    { icon: BarChart3, label: "Harvest & success rates" },
    { icon: Calendar, label: "Hunt planner & calendar" },
    { icon: Feather, label: "Turkey subspecies data" },
    { icon: Columns3, label: "Side-by-side unit comparison" },
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
            Your membership is active
            {expiresAt
              ? ` through ${new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
              : ""}
            . You have full access to draw odds estimates, harvest data, point
            analysis, and the hunt planner. It&apos;s a one-time payment, so
            nothing renews automatically.
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
                  Browse the states and pick the ones you plan to apply in this
                  season.
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
