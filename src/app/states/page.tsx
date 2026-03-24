"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { StateConfig, Species, SPECIES_LABELS } from "@/data/types";
import { getAllStates } from "@/data/hunt-data";

const HERO_BG = "https://images.unsplash.com/photo-1641113994135-a9f230b1f9b0?w=2400&q=80";

const SPECIES_ICONS: Record<Species, string> = {
  elk: "\ud83e\udece",
  "mule-deer": "\ud83e\udd8c",
  whitetail: "\ud83e\udd8c",
  pronghorn: "\ud83e\udd8c",
  moose: "\ud83e\udece",
  bear: "\ud83d\udc3b",
  sheep: "\ud83d\udc11",
  goat: "\ud83d\udc10",
  lion: "\ud83e\udd81",
  turkey: "\ud83e\udd83",
};

const SPECIES_PHOTOS: Partial<Record<Species, string>> = {
  elk: "https://images.unsplash.com/photo-1633356984559-9877a6896ba8?w=1920&q=80",
  "mule-deer": "https://images.unsplash.com/photo-1700244909533-b7ab4e4bd9ae?w=1920&q=80",
  whitetail: "https://images.unsplash.com/photo-1700244909533-b7ab4e4bd9ae?w=1920&q=80",
  turkey: "https://images.unsplash.com/photo-1649532716965-c798cda4b153?w=1920&q=80",
  moose: "https://images.unsplash.com/photo-1657582889588-1496762caac1?w=1920&q=80",
  bear: "https://images.unsplash.com/photo-1754534139545-7b733823a01a?w=1920&q=80",
  pronghorn: "https://images.unsplash.com/photo-1702338520328-ea01c36f08e8?w=1920&q=80",
  sheep: "https://images.unsplash.com/photo-1562811931-fbf7e9a79245?w=1920&q=80",
};

const DRAW_SYSTEM_LABELS: Record<string, string> = {
  preference: "Preference Points",
  bonus: "Bonus Points",
  random: "Random Draw",
  otc: "Over the Counter",
  hybrid: "Hybrid System",
};

const DRAW_SYSTEM_COLORS: Record<string, string> = {
  preference: "bg-amber-100 text-amber-800 border-amber-200",
  bonus: "bg-emerald-100 text-emerald-800 border-emerald-200",
  random: "bg-sky-100 text-sky-800 border-sky-200",
  otc: "bg-stone-100 text-stone-700 border-stone-200",
  hybrid: "bg-violet-100 text-violet-800 border-violet-200",
};

const REGION_COLORS: Record<string, string> = {
  west: "border-l-amber-500",
  pacific: "border-l-blue-500",
  plains: "border-l-yellow-600",
  midwest: "border-l-green-600",
  southeast: "border-l-orange-500",
  northeast: "border-l-indigo-500",
};

const REGIONS = [
  { key: "all", label: "All States" },
  { key: "west", label: "West" },
  { key: "pacific", label: "Pacific" },
  { key: "plains", label: "Plains" },
  { key: "midwest", label: "Midwest" },
  { key: "southeast", label: "Southeast" },
  { key: "northeast", label: "Northeast" },
] as const;

export default function StatesPage() {
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const allStates = useMemo(() => {
    try {
      return getAllStates();
    } catch {
      return [];
    }
  }, []);

  const filteredStates = useMemo(() => {
    return allStates.filter((state: StateConfig) => {
      const matchesRegion =
        regionFilter === "all" || state.region === regionFilter;
      const matchesSearch =
        !searchQuery ||
        state.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        state.abbrev.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesRegion && matchesSearch;
    });
  }, [allStates, regionFilter, searchQuery]);

  const regionCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allStates.length };
    for (const state of allStates) {
      counts[state.region] = (counts[state.region] || 0) + 1;
    }
    return counts;
  }, [allStates]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero with mountain photo */}
      <section className="relative h-[320px] sm:h-[380px] overflow-hidden">
        <Image
          src={HERO_BG}
          alt="Layered mountain range at sunset"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
        <div className="relative z-10 h-full flex items-end pb-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <h1 className="text-4xl sm:text-5xl font-bold text-white tracking-tight drop-shadow-lg">
              Explore All 50 States
            </h1>
            <p className="mt-3 text-lg text-white/80 max-w-2xl drop-shadow">
              Comprehensive draw odds, harvest data, and point analysis for every
              state in the nation. Select a state to dive into unit-level
              intelligence.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white/90">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                {allStates.length} States
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white/90">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                {allStates.reduce(
                  (sum: number, s: StateConfig) => sum + s.species.length,
                  0
                )}{" "}
                Species Listings
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full text-white/90">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                {allStates.reduce(
                  (sum: number, s: StateConfig) => sum + s.unitCount,
                  0
                ).toLocaleString()}{" "}
                Hunt Units
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search + Region Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          {/* Search */}
          <div className="relative flex-shrink-0 sm:w-72">
            <input
              type="text"
              placeholder="Search states..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-border rounded-lg bg-card text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          {/* Region Tabs */}
          <div className="flex flex-wrap gap-2">
            {REGIONS.map((region) => (
              <button
                key={region.key}
                onClick={() => setRegionFilter(region.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                  regionFilter === region.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                }`}
              >
                {region.label}
                {regionCounts[region.key] ? (
                  <span className="ml-1.5 opacity-70">
                    ({regionCounts[region.key]})
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {/* Results Count */}
        <div className="mb-4 text-sm text-muted-foreground">
          Showing {filteredStates.length} of {allStates.length} states
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="ml-2 text-primary hover:underline cursor-pointer"
            >
              Clear search
            </button>
          )}
        </div>

        {/* States Grid */}
        {filteredStates.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-12 text-center">
            <p className="text-lg text-muted-foreground">
              No states match your search. Try a different term or clear your
              filters.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredStates.map((state: StateConfig) => (
              <Link
                key={state.slug}
                href={`/states/${state.slug}`}
                className={`group block bg-card border border-border border-l-4 ${
                  REGION_COLORS[state.region] || "border-l-gray-400"
                } rounded-xl overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-primary/50 hover:-translate-y-0.5`}
              >
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">
                        {state.name}
                      </h2>
                      <span className="inline-block mt-0.5 px-1.5 py-0.5 text-xs font-mono font-semibold text-muted-foreground bg-muted rounded">
                        {state.abbrev}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {state.species.length} Species
                    </span>
                  </div>

                  {/* Draw System Badge */}
                  <div className="mb-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                        DRAW_SYSTEM_COLORS[state.drawSystem] ||
                        "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {DRAW_SYSTEM_LABELS[state.drawSystem] || state.drawSystem}
                    </span>
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span>{state.unitCount.toLocaleString()} {state.unitSystemName}s</span>
                    <span className="text-border">|</span>
                    <span>Deadline: {state.applicationDeadline}</span>
                  </div>

                  {/* Species photo thumbnails */}
                  <div className="flex gap-1.5 mb-3">
                    {state.species.slice(0, 4).map((sp: Species) => {
                      const photo = SPECIES_PHOTOS[sp];
                      if (!photo) return null;
                      return (
                        <div
                          key={sp}
                          className="relative w-10 h-10 rounded-lg overflow-hidden border border-border"
                          title={SPECIES_LABELS[sp]}
                        >
                          <Image
                            src={photo}
                            alt={SPECIES_LABELS[sp]}
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        </div>
                      );
                    })}
                    {state.species.length > 4 && (
                      <div className="w-10 h-10 rounded-lg bg-muted border border-border flex items-center justify-center text-xs font-semibold text-muted-foreground">
                        +{state.species.length - 4}
                      </div>
                    )}
                  </div>

                  {/* Species labels */}
                  <div className="flex flex-wrap gap-1.5">
                    {state.species.map((sp: Species) => (
                      <span
                        key={sp}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-muted rounded text-xs"
                        title={SPECIES_LABELS[sp]}
                      >
                        <span className="text-sm leading-none">
                          {SPECIES_ICONS[sp]}
                        </span>
                        <span className="text-muted-foreground hidden sm:inline">
                          {SPECIES_LABELS[sp]}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
