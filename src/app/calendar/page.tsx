"use client";

import { useState, useMemo } from "react";
import type { Species, Season } from "@/data/types";
import { SPECIES_LABELS, SEASON_LABELS } from "@/data/types";
import { DemoGate } from "@/components/DemoGate";

// ============================================================
// Season Data Generator
// ============================================================

interface CalendarSeason {
  state: string;
  abbrev: string;
  species: Species;
  season: Season;
  startMonth: number; // 0-indexed (0=Jan)
  startDay: number;
  endMonth: number;
  endDay: number;
  label: string;
}

type RegionKey = "west" | "midwest" | "southeast" | "northeast" | "plains";

interface StateSeasonConfig {
  name: string;
  abbrev: string;
  region: RegionKey;
}

const STATE_CONFIGS: StateSeasonConfig[] = [
  { name: "Alabama", abbrev: "AL", region: "southeast" },
  { name: "Alaska", abbrev: "AK", region: "west" },
  { name: "Arizona", abbrev: "AZ", region: "west" },
  { name: "Arkansas", abbrev: "AR", region: "southeast" },
  { name: "California", abbrev: "CA", region: "west" },
  { name: "Colorado", abbrev: "CO", region: "west" },
  { name: "Connecticut", abbrev: "CT", region: "northeast" },
  { name: "Delaware", abbrev: "DE", region: "northeast" },
  { name: "Florida", abbrev: "FL", region: "southeast" },
  { name: "Georgia", abbrev: "GA", region: "southeast" },
  { name: "Idaho", abbrev: "ID", region: "west" },
  { name: "Illinois", abbrev: "IL", region: "midwest" },
  { name: "Indiana", abbrev: "IN", region: "midwest" },
  { name: "Iowa", abbrev: "IA", region: "midwest" },
  { name: "Kansas", abbrev: "KS", region: "plains" },
  { name: "Kentucky", abbrev: "KY", region: "southeast" },
  { name: "Louisiana", abbrev: "LA", region: "southeast" },
  { name: "Maine", abbrev: "ME", region: "northeast" },
  { name: "Maryland", abbrev: "MD", region: "northeast" },
  { name: "Massachusetts", abbrev: "MA", region: "northeast" },
  { name: "Michigan", abbrev: "MI", region: "midwest" },
  { name: "Minnesota", abbrev: "MN", region: "midwest" },
  { name: "Mississippi", abbrev: "MS", region: "southeast" },
  { name: "Missouri", abbrev: "MO", region: "midwest" },
  { name: "Montana", abbrev: "MT", region: "west" },
  { name: "Nebraska", abbrev: "NE", region: "plains" },
  { name: "Nevada", abbrev: "NV", region: "west" },
  { name: "New Hampshire", abbrev: "NH", region: "northeast" },
  { name: "New Mexico", abbrev: "NM", region: "west" },
  { name: "New York", abbrev: "NY", region: "northeast" },
  { name: "North Carolina", abbrev: "NC", region: "southeast" },
  { name: "North Dakota", abbrev: "ND", region: "plains" },
  { name: "Ohio", abbrev: "OH", region: "midwest" },
  { name: "Oklahoma", abbrev: "OK", region: "plains" },
  { name: "Oregon", abbrev: "OR", region: "west" },
  { name: "Pennsylvania", abbrev: "PA", region: "northeast" },
  { name: "South Carolina", abbrev: "SC", region: "southeast" },
  { name: "South Dakota", abbrev: "SD", region: "plains" },
  { name: "Tennessee", abbrev: "TN", region: "southeast" },
  { name: "Texas", abbrev: "TX", region: "plains" },
  { name: "Utah", abbrev: "UT", region: "west" },
  { name: "Vermont", abbrev: "VT", region: "northeast" },
  { name: "Virginia", abbrev: "VA", region: "southeast" },
  { name: "Washington", abbrev: "WA", region: "west" },
  { name: "West Virginia", abbrev: "WV", region: "southeast" },
  { name: "Wisconsin", abbrev: "WI", region: "midwest" },
  { name: "Wyoming", abbrev: "WY", region: "west" },
];

// Realistic season templates by region
interface SeasonTemplate {
  species: Species;
  season: Season;
  startMonth: number;
  startDay: number;
  endMonth: number;
  endDay: number;
}

const REGION_SEASONS: Record<RegionKey, SeasonTemplate[]> = {
  west: [
    { species: "elk", season: "archery", startMonth: 8, startDay: 15, endMonth: 8, endDay: 30 },
    { species: "elk", season: "rifle", startMonth: 9, startDay: 10, endMonth: 10, endDay: 31 },
    { species: "elk", season: "muzzleloader", startMonth: 8, startDay: 8, endMonth: 8, endDay: 15 },
    { species: "mule-deer", season: "archery", startMonth: 8, startDay: 1, endMonth: 8, endDay: 31 },
    { species: "mule-deer", season: "rifle", startMonth: 9, startDay: 15, endMonth: 10, endDay: 31 },
    { species: "mule-deer", season: "muzzleloader", startMonth: 8, startDay: 8, endMonth: 8, endDay: 18 },
    { species: "pronghorn", season: "archery", startMonth: 7, startDay: 15, endMonth: 8, endDay: 15 },
    { species: "pronghorn", season: "rifle", startMonth: 8, startDay: 15, endMonth: 9, endDay: 30 },
    { species: "bear", season: "archery", startMonth: 8, startDay: 1, endMonth: 8, endDay: 31 },
    { species: "bear", season: "rifle", startMonth: 8, startDay: 15, endMonth: 10, endDay: 15 },
    { species: "turkey", season: "shotgun", startMonth: 3, startDay: 15, endMonth: 4, endDay: 30 },
  ],
  midwest: [
    { species: "whitetail", season: "archery", startMonth: 9, startDay: 1, endMonth: 0, endDay: 5 },
    { species: "whitetail", season: "rifle", startMonth: 10, startDay: 15, endMonth: 11, endDay: 10 },
    { species: "whitetail", season: "muzzleloader", startMonth: 11, startDay: 11, endMonth: 11, endDay: 31 },
    { species: "turkey", season: "shotgun", startMonth: 3, startDay: 20, endMonth: 4, endDay: 31 },
    { species: "turkey", season: "archery", startMonth: 9, startDay: 15, endMonth: 10, endDay: 31 },
    { species: "bear", season: "rifle", startMonth: 8, startDay: 15, endMonth: 9, endDay: 15 },
  ],
  southeast: [
    { species: "whitetail", season: "archery", startMonth: 8, startDay: 15, endMonth: 0, endDay: 15 },
    { species: "whitetail", season: "rifle", startMonth: 10, startDay: 1, endMonth: 0, endDay: 31 },
    { species: "whitetail", season: "muzzleloader", startMonth: 9, startDay: 15, endMonth: 10, endDay: 1 },
    { species: "turkey", season: "shotgun", startMonth: 2, startDay: 15, endMonth: 4, endDay: 15 },
    { species: "bear", season: "rifle", startMonth: 9, startDay: 1, endMonth: 10, endDay: 31 },
  ],
  northeast: [
    { species: "whitetail", season: "archery", startMonth: 9, startDay: 15, endMonth: 11, endDay: 31 },
    { species: "whitetail", season: "rifle", startMonth: 10, startDay: 18, endMonth: 11, endDay: 15 },
    { species: "whitetail", season: "muzzleloader", startMonth: 11, startDay: 16, endMonth: 11, endDay: 31 },
    { species: "turkey", season: "shotgun", startMonth: 4, startDay: 1, endMonth: 4, endDay: 31 },
    { species: "turkey", season: "archery", startMonth: 9, startDay: 15, endMonth: 10, endDay: 31 },
    { species: "bear", season: "rifle", startMonth: 10, startDay: 15, endMonth: 11, endDay: 15 },
  ],
  plains: [
    { species: "whitetail", season: "archery", startMonth: 8, startDay: 15, endMonth: 11, endDay: 31 },
    { species: "whitetail", season: "rifle", startMonth: 10, startDay: 10, endMonth: 11, endDay: 5 },
    { species: "whitetail", season: "muzzleloader", startMonth: 8, startDay: 15, endMonth: 9, endDay: 15 },
    { species: "mule-deer", season: "archery", startMonth: 8, startDay: 15, endMonth: 8, endDay: 30 },
    { species: "mule-deer", season: "rifle", startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 },
    { species: "pronghorn", season: "archery", startMonth: 7, startDay: 15, endMonth: 8, endDay: 31 },
    { species: "pronghorn", season: "rifle", startMonth: 9, startDay: 1, endMonth: 9, endDay: 30 },
    { species: "turkey", season: "shotgun", startMonth: 3, startDay: 1, endMonth: 4, endDay: 30 },
    { species: "turkey", season: "archery", startMonth: 9, startDay: 1, endMonth: 10, endDay: 31 },
  ],
};

function buildCalendarSeasons(): CalendarSeason[] {
  const result: CalendarSeason[] = [];
  for (const state of STATE_CONFIGS) {
    const templates = REGION_SEASONS[state.region] || [];
    for (const t of templates) {
      result.push({
        state: state.name,
        abbrev: state.abbrev,
        species: t.species,
        season: t.season,
        startMonth: t.startMonth,
        startDay: t.startDay,
        endMonth: t.endMonth,
        endDay: t.endDay,
        label: `${SPECIES_LABELS[t.species]} - ${SEASON_LABELS[t.season]}`,
      });
    }
  }
  return result;
}

// --- Key Dates ---

interface KeyDate {
  date: string;
  label: string;
  type: "deadline" | "draw" | "opener";
  state: string;
}

const KEY_DATES: KeyDate[] = [
  { date: "2026-01-15", label: "AZ Elk/Deer Application Opens", type: "deadline", state: "AZ" },
  { date: "2026-02-10", label: "AZ Application Deadline", type: "deadline", state: "AZ" },
  { date: "2026-03-01", label: "CO Elk/Deer Application Opens", type: "deadline", state: "CO" },
  { date: "2026-04-01", label: "CO Application Deadline", type: "deadline", state: "CO" },
  { date: "2026-04-01", label: "NM Elk Application Opens", type: "deadline", state: "NM" },
  { date: "2026-04-15", label: "WY Elk/Deer Application Deadline", type: "deadline", state: "WY" },
  { date: "2026-05-01", label: "MT Elk/Deer Application Opens", type: "deadline", state: "MT" },
  { date: "2026-05-15", label: "NM Application Deadline", type: "deadline", state: "NM" },
  { date: "2026-05-20", label: "CO Draw Results", type: "draw", state: "CO" },
  { date: "2026-06-01", label: "MT Application Deadline", type: "deadline", state: "MT" },
  { date: "2026-06-15", label: "WY Draw Results", type: "draw", state: "WY" },
  { date: "2026-07-01", label: "MT Draw Results", type: "draw", state: "MT" },
  { date: "2026-07-01", label: "NM Draw Results", type: "draw", state: "NM" },
  { date: "2026-08-15", label: "CO Archery Elk Opener", type: "opener", state: "CO" },
  { date: "2026-09-01", label: "WI Archery Deer Opener", type: "opener", state: "WI" },
  { date: "2026-09-10", label: "CO Rifle Elk Opener", type: "opener", state: "CO" },
  { date: "2026-10-01", label: "PA Archery Deer Opener", type: "opener", state: "PA" },
  { date: "2026-10-15", label: "WI Gun Deer Opener Approaches", type: "opener", state: "WI" },
  { date: "2026-11-18", label: "WI Gun Deer Opener", type: "opener", state: "WI" },
];

// ============================================================
// Helpers
// ============================================================

// Hunting year months: Jul(6) Aug(7) Sep(8) Oct(9) Nov(10) Dec(11) Jan(0) Feb(1) Mar(2) Apr(3) May(4) Jun(5)
const HUNTING_YEAR_MONTHS = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function huntingYearIndex(month: number): number {
  return HUNTING_YEAR_MONTHS.indexOf(month);
}

const SEASON_COLORS: Record<Season, { bg: string; text: string; border: string }> = {
  archery: { bg: "bg-teal-500/80", text: "text-white", border: "border-teal-600" },
  rifle: { bg: "bg-orange-500/80", text: "text-white", border: "border-orange-600" },
  muzzleloader: { bg: "bg-purple-500/80", text: "text-white", border: "border-purple-600" },
  shotgun: { bg: "bg-green-600/80", text: "text-white", border: "border-green-700" },
  crossbow: { bg: "bg-blue-500/80", text: "text-white", border: "border-blue-600" },
};

const REGION_LABELS: Record<RegionKey, string> = {
  west: "Western",
  midwest: "Midwest",
  southeast: "Southeast",
  northeast: "Northeast",
  plains: "Plains",
};

const ALL_SPECIES_LIST: Species[] = ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "bear", "sheep", "goat", "lion", "turkey"];
const ALL_REGIONS: RegionKey[] = ["west", "midwest", "southeast", "northeast", "plains"];

// ============================================================
// Page Component
// ============================================================

export default function CalendarPage() {
  const allSeasons = useMemo(() => buildCalendarSeasons(), []);

  const [speciesFilter, setSpeciesFilter] = useState<Species[]>([]);
  const [stateSearch, setStateSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<RegionKey | "all">("all");
  const [sidebarDays, setSidebarDays] = useState<30 | 60 | 90>(60);

  // Get unique states from data
  const availableStates = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of STATE_CONFIGS) {
      map.set(s.abbrev, s.name);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, []);

  // Filtered seasons
  const filtered = useMemo(() => {
    return allSeasons.filter((s) => {
      if (speciesFilter.length > 0 && !speciesFilter.includes(s.species)) return false;
      if (stateSearch) {
        const q = stateSearch.toLowerCase();
        if (!s.state.toLowerCase().includes(q) && !s.abbrev.toLowerCase().includes(q)) return false;
      }
      if (regionFilter !== "all") {
        const stateConfig = STATE_CONFIGS.find((sc) => sc.abbrev === s.abbrev);
        if (stateConfig && stateConfig.region !== regionFilter) return false;
      }
      return true;
    });
  }, [allSeasons, speciesFilter, stateSearch, regionFilter]);

  // Group by state
  const stateRows = useMemo(() => {
    const map = new Map<string, CalendarSeason[]>();
    for (const s of filtered) {
      const arr = map.get(s.abbrev) || [];
      arr.push(s);
      map.set(s.abbrev, arr);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const nameA = a[1][0]?.state || "";
      const nameB = b[1][0]?.state || "";
      return nameA.localeCompare(nameB);
    });
  }, [filtered]);

  // Current month indicator
  const currentMonth = new Date().getMonth();
  const currentDay = new Date().getDate();
  const currentHuntingIdx = huntingYearIndex(currentMonth);

  // Key dates filtered by sidebar days
  const upcomingDates = useMemo(() => {
    const now = Date.now();
    const cutoff = now + sidebarDays * 24 * 60 * 60 * 1000;
    return KEY_DATES.filter((kd) => {
      const d = new Date(kd.date).getTime();
      return d >= now && d <= cutoff;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [sidebarDays]);

  function toggleSpecies(sp: Species) {
    setSpeciesFilter((prev) =>
      prev.includes(sp) ? prev.filter((s) => s !== sp) : [...prev, sp]
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="bg-gradient-to-br from-[#1a3a1a] via-[#0f2a0f] to-[#1c1917] text-white">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
            Season Calendar
          </h1>
          <p className="text-white/60 max-w-xl">
            Visual timeline of hunting seasons across all states. Filter by
            species, state, or region to plan your year.
          </p>
          <div className="flex flex-wrap gap-4 mt-6 text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-teal-500" /> Archery
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-orange-500" /> Rifle / General
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-purple-500" /> Muzzleloader
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-green-600" /> Shotgun / Turkey
            </span>
          </div>
        </div>
      </section>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls */}
        <div className="bg-card border border-border rounded-xl p-5 mb-8 space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            {/* State search */}
            <div className="flex-1">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Search State
              </label>
              <input
                type="text"
                value={stateSearch}
                onChange={(e) => setStateSearch(e.target.value)}
                placeholder="Type state name or abbreviation..."
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            {/* Region */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Region
              </label>
              <select
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value as RegionKey | "all")}
                className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                <option value="all">All Regions</option>
                {ALL_REGIONS.map((r) => (
                  <option key={r} value={r}>{REGION_LABELS[r]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Species filter chips */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Filter by Species
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_SPECIES_LIST.map((sp) => (
                <button
                  key={sp}
                  onClick={() => toggleSpecies(sp)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                    speciesFilter.includes(sp)
                      ? "bg-primary text-primary-foreground border-primary"
                      : speciesFilter.length === 0
                      ? "bg-muted/50 text-foreground border-border hover:border-primary/40"
                      : "bg-muted/30 text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {SPECIES_LABELS[sp]}
                </button>
              ))}
              {speciesFilter.length > 0 && (
                <button
                  onClick={() => setSpeciesFilter([])}
                  className="px-3 py-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Showing {stateRows.length} states, {filtered.length} seasons
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <DemoGate feature="the full season calendar">
          {/* ââ Timeline (desktop) / Card list (mobile) ââ */}
          <div className="lg:col-span-3">
            {/* Desktop timeline */}
            <div className="hidden md:block bg-card border border-border rounded-xl overflow-hidden">
              {/* Month header */}
              <div className="grid grid-cols-[140px_repeat(12,1fr)] border-b border-border bg-muted/50">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-r border-border">
                  State
                </div>
                {HUNTING_YEAR_MONTHS.map((m, i) => (
                  <div
                    key={i}
                    className={`text-center text-xs font-semibold py-2 border-r border-border last:border-r-0 ${
                      m === currentMonth ? "bg-primary/10 text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {MONTH_LABELS[m]}
                  </div>
                ))}
              </div>

              {/* Rows */}
              {stateRows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No seasons match your filters.
                </div>
              ) : (
                <div className="divide-y divide-border max-h-[70vh] overflow-y-auto">
                  {stateRows.map(([abbrev, seasons]) => {
                    const stateName = seasons[0]?.state || abbrev;
                    return (
                      <div
                        key={abbrev}
                        className="grid grid-cols-[140px_repeat(12,1fr)] group hover:bg-muted/20 transition-colors min-h-[2.75rem]"
                      >
                        <div className="px-3 py-2 text-sm font-medium text-foreground border-r border-border flex items-center gap-1.5 truncate">
                          <span className="font-mono text-xs text-muted-foreground">{abbrev}</span>
                          <span className="truncate">{stateName}</span>
                        </div>
                        {HUNTING_YEAR_MONTHS.map((m, colIdx) => {
                          const barsInMonth = seasons.filter((s) => {
                            const startIdx = huntingYearIndex(s.startMonth);
                            let endIdx = huntingYearIndex(s.endMonth);
                            // Handle wrap (e.g. season that spans Dec->Jan)
                            if (endIdx < startIdx) endIdx = 11;
                            return colIdx >= startIdx && colIdx <= endIdx;
                          });
                          return (
                            <div
                              key={colIdx}
                              className={`border-r border-border last:border-r-0 px-0.5 py-1 flex flex-col gap-0.5 relative ${
                                m === currentMonth ? "bg-primary/5" : ""
                              }`}
                            >
                              {/* Current date indicator */}
                              {m === currentMonth && colIdx === currentHuntingIdx && (
                                <div
                                  className="absolute top-0 bottom-0 w-px bg-danger/60 z-10"
                                  style={{ left: `${(currentDay / 30) * 100}%` }}
                                />
                              )}
                              {barsInMonth.map((s, bi) => {
                                const colors = SEASON_COLORS[s.season];
                                return (
                                  <div
                                    key={bi}
                                    className={`${colors.bg} rounded-sm h-[6px] w-full relative group/bar`}
                                    title={`${s.label} (${s.state})`}
                                  >
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-foreground text-background text-[10px] rounded whitespace-nowrap opacity-0 group-hover/bar:opacity-100 pointer-events-none z-20 transition-opacity">
                                      {s.label}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3">
              {stateRows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground bg-card border border-border rounded-xl">
                  No seasons match your filters.
                </div>
              ) : (
                stateRows.map(([abbrev, seasons]) => {
                  const stateName = seasons[0]?.state || abbrev;
                  return (
                    <div
                      key={abbrev}
                      className="bg-card border border-border rounded-xl p-4"
                    >
                      <div className="flex items-center gap-2 mb-3">
                        <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {abbrev}
                        </span>
                        <h3 className="font-bold text-foreground">{stateName}</h3>
                      </div>
                      <div className="space-y-1.5">
                        {seasons.map((s, i) => {
                          const colors = SEASON_COLORS[s.season];
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <div className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${colors.bg}`} />
                              <span className="text-sm text-foreground">{SPECIES_LABELS[s.species]}</span>
                              <span className="text-xs text-muted-foreground">{SEASON_LABELS[s.season]}</span>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {MONTH_LABELS[s.startMonth]} {s.startDay} - {MONTH_LABELS[s.endMonth]} {s.endDay}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ââ Key Dates Sidebar ââ */}
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-xl overflow-hidden sticky top-20">
              <div className="px-5 py-3 bg-muted/50 border-b border-border">
                <h3 className="font-bold text-foreground text-sm">Key Dates</h3>
                <div className="flex gap-1 mt-2">
                  {([30, 60, 90] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setSidebarDays(d)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                        sidebarDays === d
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
                {upcomingDates.length === 0 ? (
                  <div className="p-5 text-center text-sm text-muted-foreground">
                    No key dates in the next {sidebarDays} days.
                  </div>
                ) : (
                  upcomingDates.map((kd, i) => {
                    const d = new Date(kd.date);
                    const daysAway = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                    const typeColors: Record<string, string> = {
                      deadline: "border-l-danger",
                      draw: "border-l-success",
                      opener: "border-l-gold",
                    };
                    const typeLabels: Record<string, string> = {
                      deadline: "DEADLINE",
                      draw: "DRAW RESULT",
                      opener: "OPENER",
                    };
                    const typeBadgeColors: Record<string, string> = {
                      deadline: "bg-danger/10 text-danger",
                      draw: "bg-success/10 text-success",
                      opener: "bg-gold/10 text-gold",
                    };
                    return (
                      <div
                        key={i}
                        className={`px-4 py-3 border-l-4 ${typeColors[kd.type]} hover:bg-muted/20 transition-colors`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${typeBadgeColors[kd.type]}`}>
                            {typeLabels[kd.type]}
                          </span>
                          <span className="text-xs font-mono text-muted-foreground ml-auto">
                            {kd.state}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-foreground">{kd.label}</p>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-muted-foreground">
                            {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                          <span
                            className={`text-xs font-semibold ${
                              daysAway <= 14 ? "text-danger" : daysAway <= 30 ? "text-warning" : "text-muted-foreground"
                            }`}
                          >
                            {daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `${daysAway} days`}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      </DemoGate>
      </DemoGate>
    </div>
  );
}
