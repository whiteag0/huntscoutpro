"use client";

import { useState, useMemo, useSyncExternalStore } from "react";
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
// Every entry below was checked against the official state wildlife agency
// (or its published regulation) in Oct 2026. Do not add a date without a
// source URL. Dates are local calendar days ("YYYY-MM-DD").

type KeyDateType = "opens" | "deadline" | "draw" | "opener";

interface KeyDate {
  date: string;
  label: string;
  type: KeyDateType;
  state: string;
  /** Short caveat shown under the label. */
  note?: string;
  /** Official agency page the date was verified against. */
  source: string;
}

const SRC_WY_2026_APPS =
  "https://wgfd.wyo.gov/news-events/big-game-applications-open-2026-27-hunting-season-key-deadlines-approaching";
const SRC_WY_POINTS = "https://wgfd.wyo.gov/es/node/13959"; // "Apply now for Wyoming preference points" (Jul 28, 2026)
const SRC_WY_RULE = "https://www.law.cornell.edu/regulations/wyoming/040-44-Wyo-Code-R-SS-44-18"; // WGFD Ch. 44 §18 (application dates)
const SRC_MT_DATES = "https://fwp.mt.gov/buyandapply/hunting-licenses/application-drawing-dates";
const SRC_NM_DATES = "https://wildlife.dgf.nm.gov/hunting/applications-and-draw-information";
const SRC_CO_2026_APPS = "https://coloradooutdoorsmag.com/2026/04/01/2026-colorado-big-game-hunting-applications/"; // CPW's magazine
const SRC_CO_SEASONS = "https://cpw.state.co.us/sites/default/files/dam/bhdbelipot/item.11_chw02.pdf"; // CPW Ch. W-2 Big Game regs (May 2026 Commission)
const SRC_WI_DATES = "https://dnr.wisconsin.gov/topic/hunt/dates.html";
const SRC_PA_SEASONS = "https://www.pa.gov/agencies/pgc/newsroom/final-2026-27-hunting-seasons-approved";
const SRC_ID_NR_DRAW = "https://idfg.idaho.gov/licenses/tag/quotas/nonresident";

const KEY_DATES: KeyDate[] = [
  // --- 2026 application cycle (past) ---
  { date: "2026-02-02", label: "WY Nonresident Elk Application Deadline", type: "deadline", state: "WY", source: SRC_WY_2026_APPS },
  { date: "2026-03-18", label: "NM Big Game Draw Application Deadline", type: "deadline", state: "NM", source: SRC_NM_DATES },
  { date: "2026-04-01", label: "MT Nonresident Elk/Deer Combo Deadline", type: "deadline", state: "MT", source: SRC_MT_DATES },
  { date: "2026-04-07", label: "CO Big Game Primary Draw Deadline", type: "deadline", state: "CO", source: SRC_CO_2026_APPS },
  { date: "2026-04-22", label: "NM Big Game Draw Results", type: "draw", state: "NM", source: SRC_NM_DATES },
  { date: "2026-06-01", label: "WY Deer & Pronghorn Application Deadline", type: "deadline", state: "WY", source: SRC_WY_2026_APPS },

  // --- 2026 fall seasons ---
  { date: "2026-09-02", label: "CO Archery Elk Opener", type: "opener", state: "CO", source: SRC_CO_SEASONS },
  { date: "2026-09-12", label: "CO Muzzleloader Elk Opener", type: "opener", state: "CO", source: SRC_CO_SEASONS },
  { date: "2026-09-12", label: "WI Archery & Crossbow Deer Opener", type: "opener", state: "WI", source: SRC_WI_DATES },
  { date: "2026-10-03", label: "PA Archery Deer Opener", type: "opener", state: "PA", note: "WMUs 2B, 5C, 5D opened Sept. 19", source: SRC_PA_SEASONS },
  { date: "2026-10-14", label: "CO First Rifle Elk Opener", type: "opener", state: "CO", note: "Oct 14–18", source: SRC_CO_SEASONS },
  { date: "2026-10-24", label: "CO Second Rifle Elk Opener", type: "opener", state: "CO", note: "Oct 24–Nov 1", source: SRC_CO_SEASONS },
  { date: "2026-11-02", label: "WY Preference-Point-Only Deadline", type: "deadline", state: "WY", note: "Nonresident elk, deer & pronghorn points; moose & sheep too", source: SRC_WY_POINTS },
  { date: "2026-11-07", label: "CO Third Rifle Elk Opener", type: "opener", state: "CO", note: "Nov 7–15", source: SRC_CO_SEASONS },
  { date: "2026-11-18", label: "CO Fourth Rifle Elk Opener", type: "opener", state: "CO", note: "Nov 18–22", source: SRC_CO_SEASONS },
  { date: "2026-11-21", label: "WI Gun Deer Opener", type: "opener", state: "WI", note: "Statewide Nov 21–29", source: SRC_WI_DATES },
  { date: "2026-11-28", label: "PA Regular Firearms Deer Opener", type: "opener", state: "PA", note: "Nov 28–Dec 13", source: SRC_PA_SEASONS },

  // --- 2027 draw cycle (published so far) ---
  { date: "2026-12-05", label: "ID 2027 Nonresident Deer/Elk Draw Opens", type: "opens", state: "ID", note: "First application period Dec 5–15", source: SRC_ID_NR_DRAW },
  { date: "2026-12-15", label: "ID 2027 Nonresident Deer/Elk Draw Closes", type: "deadline", state: "ID", note: "First application period", source: SRC_ID_NR_DRAW },
  { date: "2027-01-20", label: "ID First-Draw Tag Claim Deadline", type: "deadline", state: "ID", note: "Results announced early January", source: SRC_ID_NR_DRAW },
  // NOT yet announced by WGFD. Derived from WGFD rule Ch. 44 §18(e): nonresident elk accepted
  // Jan–Jan 31; §18(b): a deadline on a weekend/holiday rolls to the next business day.
  // Jan 31, 2027 is a Sunday. (Same rule matches WGFD's 2026 dates: Feb 2 elk, Nov 2 points.)
  { date: "2027-02-01", label: "WY Nonresident Elk Deadline (expected, per rule)", type: "deadline", state: "WY", note: "Not yet announced by WGFD. Rule sets Jan 31, a Sunday, so it should roll to Mon Feb 1", source: SRC_WY_RULE },
  { date: "2027-02-05", label: "ID 2027 Nonresident Second Draw Opens", type: "opens", state: "ID", note: "Second application period Feb 5–15", source: SRC_ID_NR_DRAW },
  { date: "2027-02-15", label: "ID 2027 Nonresident Second Draw Closes", type: "deadline", state: "ID", note: "Results early March; claim by Mar 20", source: SRC_ID_NR_DRAW },
];

/** Parse "YYYY-MM-DD" as a local calendar date (new Date("YYYY-MM-DD") is UTC and shows the previous day in US time zones). */
function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toDateKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((parseLocalDate(toKey).getTime() - parseLocalDate(fromKey).getTime()) / MS_PER_DAY);
}

// "Today" only exists in the browser: the server renders null so SSR and
// hydration agree, then the client snapshot supplies the viewer's local date.
// Re-check once a minute so a tab left open past midnight rolls over.
function subscribeToClock(onChange: () => void) {
  const id = window.setInterval(onChange, 60_000);
  return () => window.clearInterval(id);
}
function useTodayKey(): string | null {
  return useSyncExternalStore(
    subscribeToClock,
    () => toDateKey(new Date()),
    () => null
  );
}

const KEY_DATE_STYLES: Record<KeyDateType, { border: string; badge: string; label: string }> = {
  opens: { border: "border-l-primary", badge: "bg-primary/10 text-primary", label: "APPS OPEN" },
  deadline: { border: "border-l-danger", badge: "bg-danger/10 text-danger", label: "DEADLINE" },
  draw: { border: "border-l-success", badge: "bg-success/10 text-success", label: "DRAW RESULT" },
  opener: { border: "border-l-gold", badge: "bg-gold/10 text-gold", label: "OPENER" },
};

type SidebarRange = 30 | 90 | 180 | "all";
const SIDEBAR_RANGES: SidebarRange[] = [30, 90, 180, "all"];

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
  const [sidebarRange, setSidebarRange] = useState<SidebarRange>("all");
  const todayKey = useTodayKey();

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

  // Current month indicator (client-only; null during SSR)
  const today = todayKey ? parseLocalDate(todayKey) : null;
  const currentMonth = today ? today.getMonth() : -1;
  const currentDayFraction = today
    ? (today.getDate() - 1) / new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    : 0;

  // Key dates split into upcoming (soonest first, within range) and past (most recent first)
  const { upcomingDates, upcomingTotal, pastDates } = useMemo(() => {
    if (!todayKey) return { upcomingDates: [], upcomingTotal: 0, pastDates: [] };
    const sorted = [...KEY_DATES].sort((a, b) => a.date.localeCompare(b.date));
    const upcoming = sorted.filter((kd) => kd.date >= todayKey);
    return {
      upcomingDates:
        sidebarRange === "all"
          ? upcoming
          : upcoming.filter((kd) => daysBetween(todayKey, kd.date) <= sidebarRange),
      upcomingTotal: upcoming.length,
      pastDates: sorted.filter((kd) => kd.date < todayKey).reverse(),
    };
  }, [todayKey, sidebarRange]);

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
            Visual timeline of typical hunting season windows by region. Filter by
            species, state, or region to plan your year. Season bars are
            approximate; the Key Dates list uses verified agency dates.
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

        <DemoGate feature="the full season calendar">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Timeline (desktop) / Card list (mobile) */}
          <div className="lg:col-span-3">
            <p className="mb-3 text-xs text-muted-foreground">
              Season windows below are typical regional patterns, not official state
              season dates. Check each state&apos;s regulations for exact dates and units.
            </p>
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
                              {m === currentMonth && (
                                <div
                                  className="absolute top-0 bottom-0 w-px bg-danger/60 z-10"
                                  style={{ left: `${currentDayFraction * 100}%` }}
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
                              {/* Month-level only: these are regional templates, not exact state dates */}
                              <span className="ml-auto text-xs text-muted-foreground">
                                ~{MONTH_LABELS[s.startMonth]}
                                {s.endMonth !== s.startMonth && `–${MONTH_LABELS[s.endMonth]}`}
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

          {/* Key Dates sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-card border border-border rounded-xl overflow-hidden sticky top-20">
              <div className="px-5 py-3 bg-muted/50 border-b border-border">
                <h3 className="font-bold text-foreground text-sm">Key Dates</h3>
                <div className="flex gap-1 mt-2" role="group" aria-label="Show upcoming dates within">
                  {SIDEBAR_RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSidebarRange(r)}
                      aria-pressed={sidebarRange === r}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                        sidebarRange === r
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {r === "all" ? "All" : `${r}d`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                {!todayKey ? (
                  <div className="p-5 text-center text-sm text-muted-foreground">Loading dates…</div>
                ) : (
                  <>
                    <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Upcoming
                    </div>
                    {upcomingDates.length === 0 ? (
                      <div className="px-5 pb-4 pt-2 text-center text-sm text-muted-foreground">
                        {upcomingTotal === 0
                          ? "No upcoming verified dates yet. Check back as agencies publish the next cycle."
                          : `No key dates in the next ${sidebarRange} days.`}
                      </div>
                    ) : (
                      <div className="divide-y divide-border">
                        {upcomingDates.map((kd) => (
                          <KeyDateRow key={`${kd.date}-${kd.label}`} kd={kd} todayKey={todayKey} />
                        ))}
                      </div>
                    )}

                    {pastDates.length > 0 && (
                      <details className="border-t border-border">
                        <summary className="px-4 py-2.5 text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground select-none">
                          Past dates ({pastDates.length})
                        </summary>
                        <div className="divide-y divide-border opacity-60">
                          {pastDates.map((kd) => (
                            <KeyDateRow key={`${kd.date}-${kd.label}`} kd={kd} todayKey={todayKey} />
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>
              <p className="px-4 py-3 border-t border-border text-[11px] leading-snug text-muted-foreground">
                Dates verified against official agency sites and published regulations
                as of Oct 2026 — always confirm with the agency before applying.
              </p>
            </div>
          </div>
        </div>
        </DemoGate>
      </div>
    </div>
  );
}

// ============================================================
// Key date row
// ============================================================

function KeyDateRow({ kd, todayKey }: { kd: KeyDate; todayKey: string }) {
  const styles = KEY_DATE_STYLES[kd.type];
  const daysAway = daysBetween(todayKey, kd.date);
  const isPast = daysAway < 0;
  return (
    <div className={`px-4 py-3 border-l-4 ${isPast ? "border-l-border" : styles.border} hover:bg-muted/20 transition-colors`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${styles.badge}`}>
          {styles.label}
        </span>
        {isPast && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            Past
          </span>
        )}
        <span className="text-xs font-mono text-muted-foreground ml-auto">{kd.state}</span>
      </div>
      <p className="text-sm font-medium text-foreground">{kd.label}</p>
      {kd.note && <p className="text-xs text-muted-foreground mt-0.5">{kd.note}</p>}
      <div className="flex items-center justify-between mt-1 gap-2">
        <span className="text-xs text-muted-foreground">
          {parseLocalDate(kd.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          {" · "}
          <a
            href={kd.source}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
            aria-label={`Official source for ${kd.label}`}
          >
            Source
          </a>
        </span>
        {!isPast && (
          <span
            className={`text-xs font-semibold whitespace-nowrap ${
              daysAway <= 14 ? "text-danger" : daysAway <= 30 ? "text-warning" : "text-muted-foreground"
            }`}
          >
            {daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `${daysAway} days`}
          </span>
        )}
      </div>
    </div>
  );
}
