"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { getAllStates, getTurkeyData } from "@/data/hunt-data";
import { DemoGate } from "@/components/DemoGate";
import { DataDisclaimer } from "@/components/DataDisclaimer";
import type { StateConfig } from "@/data/types";
import { TURKEY_SUBSPECIES_ALL, type TurkeySubspecies } from "@/data/types";

// --- Subspecies data ---

interface SubspeciesInfo {
  name: TurkeySubspecies;
  emoji: string;
  gradient: string;
  range: string;
  states: string[];
  stateCount: number;
  difficulty: number; // 1-5 stars
  description: string;
}

const SUBSPECIES_DATA: SubspeciesInfo[] = [
  {
    name: "Eastern",
    emoji: "\ud83c\udf3f",
    gradient: "from-green-800 to-green-600",
    range: "Most states east of the Rockies",
    states: [
      "AL", "AR", "CT", "DE", "FL", "GA", "IL", "IN", "IA", "KY",
      "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "NE", "NH",
      "NJ", "NY", "NC", "OH", "OK", "PA", "RI", "SC", "TN", "TX",
      "VT", "VA", "WV", "WI",
    ],
    stateCount: 34,
    difficulty: 2,
    description:
      "The most widespread subspecies, found across eastern and midwestern states. Known for dense forest habitat and responsive gobbling.",
  },
  {
    name: "Merriam's",
    emoji: "\u26f0\ufe0f",
    gradient: "from-amber-800 to-amber-600",
    range: "Western states, mountainous terrain",
    states: ["CO", "WY", "MT", "NM", "SD", "NE"],
    stateCount: 6,
    difficulty: 3,
    description:
      "Found at higher elevations in western mountain states. Beautiful white-tipped tail feathers. Often found on public land near ponderosa pine.",
  },
  {
    name: "Rio Grande",
    emoji: "\ud83c\udf3e",
    gradient: "from-orange-700 to-orange-500",
    range: "Plains states and Texas",
    states: ["TX", "OK", "KS", "NE", "SD", "IA"],
    stateCount: 6,
    difficulty: 2,
    description:
      "Inhabits the open prairies and river bottoms of the central plains. Texas alone harvests more Rio Grandes than most states harvest total turkeys.",
  },
  {
    name: "Osceola",
    emoji: "\ud83c\udf34",
    gradient: "from-teal-700 to-teal-500",
    range: "Florida ONLY",
    states: ["FL"],
    stateCount: 1,
    difficulty: 5,
    description:
      "The rarest and most sought-after subspecies. Found exclusively in the Florida peninsula. Darker plumage, longer legs, and notoriously call-shy.",
  },
  {
    name: "Gould's",
    emoji: "\ud83c\udfdc\ufe0f",
    gradient: "from-red-800 to-red-600",
    range: "Southern AZ and NM only",
    states: ["AZ", "NM"],
    stateCount: 2,
    difficulty: 5,
    description:
      "The largest of all turkey subspecies. Extremely limited availability with very few tags offered. Found only in the sky islands of southern Arizona and New Mexico.",
  },
];

// --- Top turkey states data ---

interface TopTurkeyState {
  rank: number;
  state: string;
  abbrev: string;
  harvest: string;
  successRate: string;
  publicLand: "Excellent" | "Good" | "Fair" | "Limited";
  subspecies: TurkeySubspecies[];
}

const TOP_TURKEY_STATES: TopTurkeyState[] = [
  { rank: 1, state: "Missouri", abbrev: "MO", harvest: "48,200", successRate: "32%", publicLand: "Excellent", subspecies: ["Eastern"] },
  { rank: 2, state: "Wisconsin", abbrev: "WI", harvest: "41,800", successRate: "28%", publicLand: "Good", subspecies: ["Eastern"] },
  { rank: 3, state: "Pennsylvania", abbrev: "PA", harvest: "38,500", successRate: "25%", publicLand: "Excellent", subspecies: ["Eastern"] },
  { rank: 4, state: "Alabama", abbrev: "AL", harvest: "36,900", successRate: "30%", publicLand: "Good", subspecies: ["Eastern"] },
  { rank: 5, state: "Texas", abbrev: "TX", harvest: "35,200", successRate: "35%", publicLand: "Limited", subspecies: ["Rio Grande", "Eastern"] },
  { rank: 6, state: "Mississippi", abbrev: "MS", harvest: "33,800", successRate: "34%", publicLand: "Good", subspecies: ["Eastern"] },
  { rank: 7, state: "Tennessee", abbrev: "TN", harvest: "32,100", successRate: "29%", publicLand: "Good", subspecies: ["Eastern"] },
  { rank: 8, state: "New York", abbrev: "NY", harvest: "29,400", successRate: "22%", publicLand: "Excellent", subspecies: ["Eastern"] },
  { rank: 9, state: "Georgia", abbrev: "GA", harvest: "28,700", successRate: "27%", publicLand: "Good", subspecies: ["Eastern"] },
  { rank: 10, state: "Kansas", abbrev: "KS", harvest: "27,500", successRate: "38%", publicLand: "Fair", subspecies: ["Rio Grande", "Eastern"] },
];

// --- State turkey data ---

interface StateTurkeyInfo {
  name: string;
  abbrev: string;
  slug: string;
  subspecies: TurkeySubspecies[];
  spring: boolean;
  fall: boolean;
  harvestEstimate: string;
}

function buildStateTurkeyList(): StateTurkeyInfo[] {
  const states: StateTurkeyInfo[] = [
    { name: "Alabama", abbrev: "AL", slug: "alabama", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "36,900" },
    { name: "Arizona", abbrev: "AZ", slug: "arizona", subspecies: ["Merriam's", "Gould's"], spring: true, fall: true, harvestEstimate: "2,800" },
    { name: "Arkansas", abbrev: "AR", slug: "arkansas", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "18,500" },
    { name: "California", abbrev: "CA", slug: "california", subspecies: ["Rio Grande", "Merriam's"], spring: true, fall: true, harvestEstimate: "8,200" },
    { name: "Colorado", abbrev: "CO", slug: "colorado", subspecies: ["Merriam's", "Rio Grande"], spring: true, fall: true, harvestEstimate: "12,400" },
    { name: "Connecticut", abbrev: "CT", slug: "connecticut", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "2,100" },
    { name: "Delaware", abbrev: "DE", slug: "delaware", subspecies: ["Eastern"], spring: true, fall: false, harvestEstimate: "680" },
    { name: "Florida", abbrev: "FL", slug: "florida", subspecies: ["Osceola", "Eastern"], spring: true, fall: false, harvestEstimate: "7,200" },
    { name: "Georgia", abbrev: "GA", slug: "georgia", subspecies: ["Eastern"], spring: true, fall: false, harvestEstimate: "28,700" },
    { name: "Hawaii", abbrev: "HI", slug: "hawaii", subspecies: ["Rio Grande"], spring: true, fall: true, harvestEstimate: "1,200" },
    { name: "Idaho", abbrev: "ID", slug: "idaho", subspecies: ["Merriam's", "Eastern"], spring: true, fall: true, harvestEstimate: "6,400" },
    { name: "Illinois", abbrev: "IL", slug: "illinois", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "14,800" },
    { name: "Indiana", abbrev: "IN", slug: "indiana", subspecies: ["Eastern"], spring: true, fall: false, harvestEstimate: "12,300" },
    { name: "Iowa", abbrev: "IA", slug: "iowa", subspecies: ["Eastern", "Rio Grande"], spring: true, fall: true, harvestEstimate: "11,600" },
    { name: "Kansas", abbrev: "KS", slug: "kansas", subspecies: ["Rio Grande", "Eastern"], spring: true, fall: true, harvestEstimate: "27,500" },
    { name: "Kentucky", abbrev: "KY", slug: "kentucky", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "24,200" },
    { name: "Louisiana", abbrev: "LA", slug: "louisiana", subspecies: ["Eastern"], spring: true, fall: false, harvestEstimate: "3,900" },
    { name: "Maine", abbrev: "ME", slug: "maine", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "5,800" },
    { name: "Maryland", abbrev: "MD", slug: "maryland", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "4,200" },
    { name: "Massachusetts", abbrev: "MA", slug: "massachusetts", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "2,900" },
    { name: "Michigan", abbrev: "MI", slug: "michigan", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "16,200" },
    { name: "Minnesota", abbrev: "MN", slug: "minnesota", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "11,400" },
    { name: "Mississippi", abbrev: "MS", slug: "mississippi", subspecies: ["Eastern"], spring: true, fall: false, harvestEstimate: "33,800" },
    { name: "Missouri", abbrev: "MO", slug: "missouri", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "48,200" },
    { name: "Montana", abbrev: "MT", slug: "montana", subspecies: ["Merriam's", "Eastern"], spring: true, fall: true, harvestEstimate: "7,800" },
    { name: "Nebraska", abbrev: "NE", slug: "nebraska", subspecies: ["Merriam's", "Rio Grande", "Eastern"], spring: true, fall: true, harvestEstimate: "15,600" },
    { name: "New Hampshire", abbrev: "NH", slug: "new-hampshire", subspecies: ["Eastern"], spring: true, fall: false, harvestEstimate: "2,400" },
    { name: "New Jersey", abbrev: "NJ", slug: "new-jersey", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "3,100" },
    { name: "New Mexico", abbrev: "NM", slug: "new-mexico", subspecies: ["Merriam's", "Rio Grande", "Gould's"], spring: true, fall: true, harvestEstimate: "4,600" },
    { name: "New York", abbrev: "NY", slug: "new-york", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "29,400" },
    { name: "North Carolina", abbrev: "NC", slug: "north-carolina", subspecies: ["Eastern"], spring: true, fall: false, harvestEstimate: "15,800" },
    { name: "North Dakota", abbrev: "ND", slug: "north-dakota", subspecies: ["Merriam's", "Eastern"], spring: true, fall: true, harvestEstimate: "4,200" },
    { name: "Ohio", abbrev: "OH", slug: "ohio", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "18,900" },
    { name: "Oklahoma", abbrev: "OK", slug: "oklahoma", subspecies: ["Rio Grande", "Eastern"], spring: true, fall: true, harvestEstimate: "22,100" },
    { name: "Oregon", abbrev: "OR", slug: "oregon", subspecies: ["Merriam's", "Rio Grande"], spring: true, fall: true, harvestEstimate: "4,800" },
    { name: "Pennsylvania", abbrev: "PA", slug: "pennsylvania", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "38,500" },
    { name: "Rhode Island", abbrev: "RI", slug: "rhode-island", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "450" },
    { name: "South Carolina", abbrev: "SC", slug: "south-carolina", subspecies: ["Eastern"], spring: true, fall: false, harvestEstimate: "12,600" },
    { name: "South Dakota", abbrev: "SD", slug: "south-dakota", subspecies: ["Merriam's", "Rio Grande", "Eastern"], spring: true, fall: true, harvestEstimate: "13,400" },
    { name: "Tennessee", abbrev: "TN", slug: "tennessee", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "32,100" },
    { name: "Texas", abbrev: "TX", slug: "texas", subspecies: ["Rio Grande", "Eastern"], spring: true, fall: true, harvestEstimate: "35,200" },
    { name: "Utah", abbrev: "UT", slug: "utah", subspecies: ["Merriam's"], spring: true, fall: false, harvestEstimate: "2,600" },
    { name: "Vermont", abbrev: "VT", slug: "vermont", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "4,100" },
    { name: "Virginia", abbrev: "VA", slug: "virginia", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "19,800" },
    { name: "Washington", abbrev: "WA", slug: "washington", subspecies: ["Merriam's", "Rio Grande"], spring: true, fall: true, harvestEstimate: "3,600" },
    { name: "West Virginia", abbrev: "WV", slug: "west-virginia", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "8,900" },
    { name: "Wisconsin", abbrev: "WI", slug: "wisconsin", subspecies: ["Eastern"], spring: true, fall: true, harvestEstimate: "41,800" },
    { name: "Wyoming", abbrev: "WY", slug: "wyoming", subspecies: ["Merriam's"], spring: true, fall: true, harvestEstimate: "3,200" },
  ];
  return states;
}

// --- Helpers ---

function DifficultyStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={i < rating ? "text-gold" : "text-muted/60"}
        >
          {"\u2605"}
        </span>
      ))}
    </div>
  );
}

const SUBSPECIES_COLORS: Record<TurkeySubspecies, string> = {
  Eastern: "bg-green-700 text-white",
  "Merriam's": "bg-amber-700 text-white",
  "Rio Grande": "bg-orange-600 text-white",
  Osceola: "bg-teal-600 text-white",
  "Gould's": "bg-red-700 text-white",
};

function SubspeciesBadge({ subspecies }: { subspecies: TurkeySubspecies }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${SUBSPECIES_COLORS[subspecies]}`}
    >
      {subspecies}
    </span>
  );
}

function PublicLandBadge({ rating }: { rating: string }) {
  const colors: Record<string, string> = {
    Excellent: "bg-green-100 text-green-800 border-green-300",
    Good: "bg-blue-100 text-blue-800 border-blue-300",
    Fair: "bg-amber-100 text-amber-800 border-amber-300",
    Limited: "bg-red-100 text-red-800 border-red-300",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium border ${colors[rating] || ""}`}>
      {rating}
    </span>
  );
}

// --- Grand Slam Suggested States ---

const SLAM_SUGGESTIONS: Record<TurkeySubspecies, { state: string; notes: string }[]> = {
  Eastern: [
    { state: "Missouri", notes: "Highest harvest numbers in the nation" },
    { state: "Wisconsin", notes: "Excellent public land access" },
    { state: "Pennsylvania", notes: "Large population, public land" },
  ],
  "Merriam's": [
    { state: "Nebraska", notes: "OTC tags, easy to draw" },
    { state: "South Dakota", notes: "Good populations, public land" },
    { state: "Colorado", notes: "Abundant public land opportunities" },
  ],
  "Rio Grande": [
    { state: "Kansas", notes: "High success rates" },
    { state: "Texas", notes: "Massive populations" },
    { state: "Oklahoma", notes: "Good public land options" },
  ],
  Osceola: [
    { state: "Florida", notes: "Only option - plan for Osceola zone" },
  ],
  "Gould's": [
    { state: "Arizona", notes: "Limited tags, apply early" },
    { state: "New Mexico", notes: "Very few opportunities" },
  ],
};

// ============================================================
// Page Component
// ============================================================

export default function TurkeyPage() {
  const allStateTurkey = useMemo(() => buildStateTurkeyList(), []);
  const [search, setSearch] = useState("");
  const [subspeciesFilter, setSubspeciesFilter] = useState<TurkeySubspecies | "all">("all");
  const [seasonFilter, setSeasonFilter] = useState<"all" | "spring" | "fall">("all");
  const [slamChecked, setSlamChecked] = useState<Record<TurkeySubspecies, boolean>>({
    Eastern: false,
    "Merriam's": false,
    "Rio Grande": false,
    Osceola: false,
    "Gould's": false,
  });

  const filteredStates = useMemo(() => {
    return allStateTurkey.filter((s) => {
      if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.abbrev.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (subspeciesFilter !== "all" && !s.subspecies.includes(subspeciesFilter)) {
        return false;
      }
      if (seasonFilter === "spring" && !s.spring) return false;
      if (seasonFilter === "fall" && !s.fall) return false;
      return true;
    });
  }, [allStateTurkey, search, subspeciesFilter, seasonFilter]);

  const slamCount = Object.values(slamChecked).filter(Boolean).length;
  const mainFourChecked = slamChecked["Eastern"] && slamChecked["Merriam's"] && slamChecked["Rio Grande"] && slamChecked["Osceola"];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="bg-gradient-to-br from-[#1a3a1a] via-[#0f2a0f] to-[#1c1917] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="text-center animate-fade-in-up">
            <div className="text-6xl mb-6">{"\ud83e\udd83"}</div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
              Turkey Hunting Intelligence
            </h1>
            <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto mb-8">
              Spring and fall turkey data across 49 states. Subspecies tracking,
              harvest data, and season dates.
            </p>
            <div className="flex flex-wrap justify-center gap-6 text-sm sm:text-base">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold" />
                <span className="text-white/80 font-medium">49 States</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold" />
                <span className="text-white/80 font-medium">5 Subspecies</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-gold" />
                <span className="text-white/80 font-medium">Spring &amp; Fall Seasons</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16">
        {/* ââ Subspecies Section ââ */}
        <section>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Wild Turkey Subspecies
          </h2>
          <p className="text-muted-foreground mb-8 max-w-2xl">
            Five distinct subspecies of wild turkey inhabit North America, each
            with unique characteristics and hunting challenges.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {SUBSPECIES_DATA.map((sub, idx) => (
              <div
                key={sub.name}
                className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-lg hover:border-primary/30 transition-all duration-300 animate-fade-in-up"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                {/* Image area */}
                <div
                  className={`h-36 bg-gradient-to-br ${sub.gradient} flex items-center justify-center`}
                >
                  <span className="text-5xl">{sub.emoji}</span>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-foreground">
                      {sub.name}
                    </h3>
                    <DifficultyStars rating={sub.difficulty} />
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {sub.description}
                  </p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-foreground">{sub.stateCount}</span>{" "}
                      {sub.stateCount === 1 ? "state" : "states"}
                    </span>
                    <span className="text-xs text-muted-foreground italic">
                      {sub.range}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {sub.states.slice(0, 8).map((st) => (
                      <span
                        key={st}
                        className="inline-block px-1.5 py-0.5 bg-muted rounded text-xs font-medium text-muted-foreground"
                      >
                        {st}
                      </span>
                    ))}
                    {sub.states.length > 8 && (
                      <span className="inline-block px-1.5 py-0.5 bg-muted rounded text-xs font-medium text-muted-foreground">
                        +{sub.states.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>


        {/* Data Disclaimer */}
        <DataDisclaimer />

        {/* State-by-State Turkey Data — gated */}
        <DemoGate feature="state-by-state turkey data">
        <section>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            State-by-State Turkey Data
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl">
            Browse turkey hunting opportunities across the country. Filter by
            subspecies, season, or search for a specific state.
          </p>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search states..."
              className="px-4 py-2.5 border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 sm:w-64"
            />
            <select
              value={subspeciesFilter}
              onChange={(e) => setSubspeciesFilter(e.target.value as TurkeySubspecies | "all")}
              className="px-4 py-2.5 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="all">All Subspecies</option>
              {TURKEY_SUBSPECIES_ALL.map((sub) => (
                <option key={sub} value={sub}>{sub}</option>
              ))}
            </select>
            <select
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value as "all" | "spring" | "fall")}
              className="px-4 py-2.5 border border-border rounded-lg bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <option value="all">All Seasons</option>
              <option value="spring">Spring Only</option>
              <option value="fall">Fall Only</option>
            </select>
            <div className="flex items-center text-sm text-muted-foreground ml-auto">
              {filteredStates.length} states
            </div>
          </div>

          {/* State Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredStates.map((state) => (
              <Link
                key={state.abbrev}
                href={`/states/${state.slug}?species=turkey`}
                className="group bg-card border border-border rounded-xl p-4 hover:shadow-lg hover:border-primary/30 transition-all duration-200"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-foreground group-hover:text-primary transition-colors">
                    {state.name}
                  </h3>
                  <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {state.abbrev}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {state.subspecies.map((sub) => (
                    <SubspeciesBadge key={sub} subspecies={sub} />
                  ))}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className={`flex items-center gap-1 ${state.spring ? "text-success font-medium" : "opacity-50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    Spring
                  </span>
                  <span className={`flex items-center gap-1 ${state.fall ? "text-accent font-medium" : "opacity-50"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                    Fall
                  </span>
                  <span className="ml-auto font-semibold text-foreground">
                    ~{state.harvestEstimate}
                  </span>
                  <span className="text-[10px]">harvest</span>
                </div>
              </Link>
            ))}
          </div>

          {filteredStates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No states match your filters. Try adjusting your search.
            </div>
          )}
        </section>

        {/* ââ Grand Slam Tracker ââ */}
        <section>
          <div className="bg-gradient-to-br from-[#1a3a1a] via-[#0f2a0f] to-[#1c1917] rounded-2xl p-6 sm:p-10 text-white">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">
              Grand Slam Tracker
            </h2>
            <p className="text-white/60 mb-8 max-w-2xl">
              The <span className="font-bold text-gold">Grand Slam</span> requires
              harvesting all 4 main subspecies (Eastern, Merriam&apos;s, Rio Grande,
              Osceola). The{" "}
              <span className="font-bold text-gold">Royal Slam</span> adds the
              rare Gould&apos;s for all 5.
            </p>

            {/* Progress */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-medium text-white/70">Progress</span>
                <span className="text-xl font-bold text-gold">{slamCount} / 5</span>
                {mainFourChecked && !slamChecked["Gould's"] && (
                  <span className="ml-2 px-3 py-1 rounded-full bg-gold/20 text-gold text-xs font-bold animate-pulse-soft">
                    GRAND SLAM!
                  </span>
                )}
                {slamCount === 5 && (
                  <span className="ml-2 px-3 py-1 rounded-full bg-gold text-gold-foreground text-xs font-bold animate-pulse-soft">
                    ROYAL SLAM!
                  </span>
                )}
              </div>
              <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold to-amber-400 rounded-full transition-all duration-500"
                  style={{ width: `${(slamCount / 5) * 100}%` }}
                />
              </div>
            </div>

            {/* Subspecies checkboxes + suggestions */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {SUBSPECIES_DATA.map((sub) => (
                <div
                  key={sub.name}
                  className={`rounded-xl border p-4 transition-all duration-300 ${
                    slamChecked[sub.name]
                      ? "bg-gold/10 border-gold/40"
                      : "bg-white/5 border-white/10 hover:border-white/20"
                  }`}
                >
                  <label className="flex items-center gap-3 cursor-pointer mb-3">
                    <input
                      type="checkbox"
                      checked={slamChecked[sub.name]}
                      onChange={() =>
                        setSlamChecked((prev) => ({
                          ...prev,
                          [sub.name]: !prev[sub.name],
                        }))
                      }
                      className="w-5 h-5 rounded accent-gold cursor-pointer"
                    />
                    <span className="text-2xl">{sub.emoji}</span>
                    <span className={`font-bold ${slamChecked[sub.name] ? "text-gold" : "text-white"}`}>
                      {sub.name}
                    </span>
                    {slamChecked[sub.name] && (
                      <span className="ml-auto text-gold text-sm">{"\u2713"}</span>
                    )}
                  </label>
                  <div className="pl-8 space-y-1.5">
                    <p className="text-xs text-white/40 font-medium uppercase tracking-wider mb-1">
                      Suggested States
                    </p>
                    {SLAM_SUGGESTIONS[sub.name].map((sug) => (
                      <div key={sug.state} className="text-sm">
                        <span className="font-medium text-white/80">{sug.state}</span>
                        <span className="text-white/40"> â {sug.notes}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ââ Top Turkey States Ranking ââ */}
        <section>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            Top 10 Turkey States
          </h2>
          <p className="text-muted-foreground mb-6 max-w-2xl">
            Ranked by total annual harvest, with success rates and public land
            access ratings.
          </p>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <div className="col-span-1">Rank</div>
              <div className="col-span-3">State</div>
              <div className="col-span-2">Harvest</div>
              <div className="col-span-2">Success Rate</div>
              <div className="col-span-2">Public Land</div>
              <div className="col-span-2">Subspecies</div>
            </div>

            {TOP_TURKEY_STATES.map((state, idx) => (
              <div
                key={state.abbrev}
                className={`grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-4 border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors ${
                  idx < 3 ? "bg-gold/5" : ""
                }`}
              >
                <div className="sm:col-span-1 flex items-center">
                  <span
                    className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold ${
                      idx === 0
                        ? "bg-gold text-gold-foreground"
                        : idx === 1
                        ? "bg-gray-300 text-gray-700"
                        : idx === 2
                        ? "bg-amber-700 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {state.rank}
                  </span>
                </div>
                <div className="sm:col-span-3 flex items-center gap-2">
                  <span className="font-bold text-foreground">{state.state}</span>
                  <span className="text-xs font-mono text-muted-foreground">{state.abbrev}</span>
                </div>
                <div className="sm:col-span-2 flex items-center">
                  <span className="font-semibold text-foreground">{state.harvest}</span>
                </div>
                <div className="sm:col-span-2 flex items-center">
                  <span className="font-semibold text-primary">{state.successRate}</span>
                </div>
                <div className="sm:col-span-2 flex items-center">
                  <PublicLandBadge rating={state.publicLand} />
                </div>
                <div className="sm:col-span-2 flex items-center flex-wrap gap-1">
                  {state.subspecies.map((sub) => (
                    <SubspeciesBadge key={sub} subspecies={sub} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>


        </DemoGate>
        {/* CTA */}
        <section className="text-center py-8">
          <p className="text-muted-foreground mb-4">
            Ready to plan your turkey hunt?
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/planner"
              className="inline-flex items-center px-6 py-3 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-light transition-colors"
            >
              Open Hunt Planner
            </Link>
            <Link
              href="/calendar"
              className="inline-flex items-center px-6 py-3 rounded-lg border-2 border-primary text-primary font-semibold hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              View Season Calendar
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
