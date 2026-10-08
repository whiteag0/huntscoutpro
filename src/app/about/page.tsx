import { Crosshair } from "lucide-react";
import Link from "next/link";

export default function AboutPage() {
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
            HuntScout Pro puts estimated draw odds, harvest figures, and planning tools for all 50 states in one place, so you can research and shortlist hunts before you apply.
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Our Mission</h2>
            <p>
              We want every hunter to be able to research draw odds, harvest statistics, and point systems without digging through dozens of agency websites, and to see clearly which numbers are agency data and which are estimates.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">What We Cover</h2>
            <p>
              HuntScout Pro covers 10 species across all 50 states: elk, mule deer, whitetail, pronghorn, moose, bear, bighorn sheep, mountain goat, mountain lion, and turkey. It also includes a hunt planner, season and application calendar, and side-by-side unit comparison.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Our Data</h2>
            <p>
              Draw odds, minimum points, and tag and applicant counts are estimates from our own statistical model. They are not published draw results, and they can differ substantially from what a state reports.
            </p>
            <p>
              Harvest and success figures use unit-level totals from state wildlife agency harvest reports where we have them (currently select species in Colorado, Wyoming, Idaho, Montana, and Wisconsin) and are calibrated to statewide agency totals or estimated elsewhere. Each state page labels which harvest figures come from agency reports.
            </p>
            <p>
              Always confirm draw odds, quotas, season dates, and deadlines with the state wildlife agency before applying. Questions or corrections:{" "}
              <a href="mailto:support@huntscoutpro.com" className="text-foreground underline underline-offset-2">
                support@huntscoutpro.com
              </a>
              .
            </p>
          </section>

          <div className="pt-4">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
            >
              Get Started with HuntScout Pro
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
