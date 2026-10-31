"use client";

import { Crosshair } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { LIVE_STATES } from "@/lib/agency-format";

export default function AboutPage() {
  const { data: session, status } = useSession();
  const isPro = Boolean(session?.user?.isPro);
  const sessionPending = status === "loading" && !session;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
        <div className="flex items-center gap-3 mb-8">
          <Crosshair className="w-8 h-8 text-amber-500" />
          <h1 className="text-3xl sm:text-4xl font-bold text-foreground">
            About HuntScout Pro
          </h1>
        </div>

        <div className="prose prose-sm text-muted-foreground space-y-6">
          <p className="text-lg">
            HuntScout Pro puts state wildlife agency draw results, harvest numbers, and application dates for the western draw states in one place, so you can research and shortlist hunts before you apply.
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Our Mission</h2>
            <p>
              We want every hunter to be able to research draw results, harvest statistics, and point systems without digging through dozens of agency websites and PDFs, and to know exactly where each number came from.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">What We Cover</h2>
            <p>
              {LIVE_STATES.length > 0
                ? `HuntScout Pro is live for ${LIVE_STATES.length} western draw state${LIVE_STATES.length === 1 ? "" : "s"}: ${LIVE_STATES.map((s) => s.name).join(", ")}. `
                : "HuntScout Pro is launching with the western draw states, adding each one once its agency data has been checked. "}
              Depending on what each agency publishes, that includes elk, deer, pronghorn, moose, bear, bighorn sheep, mountain goat, mountain lion, and turkey. The site also has a calendar of agency dates, side-by-side hunt comparison, and a hunt planner.
            </p>
            <p>
              Other states show a coming-soon page.{" "}
              <Link href="/request-state" className="text-foreground underline underline-offset-2">
                Request a state
              </Link>{" "}
              and we&apos;ll use it to decide what comes next.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Our Data</h2>
            <p>
              Every number on HuntScout Pro comes from an official state wildlife agency publication: draw result reports (quotas, applicants, drawn, and results by point level where the agency publishes them), harvest reports (hunters, harvest, and success by unit), application dates, and license fees. Nothing is modeled, estimated, or filled in. When an agency publishes counts but not a percentage, we divide its own numbers (drawn &divide; applicants, harvest &divide; hunters). If an agency doesn&apos;t publish a figure, we leave it blank.
            </p>
            <p>
              Each table cites its source with a link, the data year, and the date we retrieved it, and each state page shows when it was last checked against the agency. Draw results describe past draws, not future odds, and agencies sometimes revise their reports.
            </p>
            <p>
              Always confirm quotas, season dates, deadlines, and regulations with the state wildlife agency before applying. Questions or corrections:{" "}
              <a href="mailto:support@huntscoutpro.com" className="text-foreground underline underline-offset-2">
                support@huntscoutpro.com
              </a>
              .
            </p>
          </section>

          {/* Members get a way back into the tools; everyone else gets the sign-up CTA.
              While the session loads, the sign-up link stays in the HTML but invisible. */}
          <div className={sessionPending ? "pt-4 invisible" : "pt-4"}>
            {isPro ? (
              <Link
                href="/states"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
              >
                Explore states
              </Link>
            ) : (
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
              >
                Get Started with HuntScout Pro
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
