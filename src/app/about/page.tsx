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
            HuntScout Pro is the most comprehensive hunting draw odds and harvest data platform in the country. We aggregate, normalize, and present data from all 50 state wildlife agencies so you can make smarter application decisions.
          </p>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Our Mission</h2>
            <p>
              We believe every hunter deserves access to the same quality of data that outfitters and professional applicants have used for years. Our mission is to level the playing field by making draw odds, harvest statistics, and point analysis accessible and easy to understand.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">What We Cover</h2>
            <p>
              HuntScout Pro covers 9+ species across all 50 states, including elk, mule deer, whitetail, pronghorn, moose, bear, sheep, goat, mountain lion, and turkey. We track over 15,000 individual hunt units with 6 years of historical data.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground">Our Data</h2>
            <p>
              All data is sourced directly from state wildlife agencies, official harvest reports, and published draw results. We update data annually after each state completes its draw cycle and publishes results.
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
