"use client";

import {
  Species,
  Season,
  Sex,
  Residency,
  DrawSystem,
  SEASON_LABELS,
  SEX_LABELS,
  SEX_OPTIONS,
  SPECIES_SEASONS,
} from "@/data/types";

const DRAW_SYSTEM_DESCRIPTIONS: Record<string, string> = {
  preference:
    "Applicants with the most preference points draw first. Points are earned each year you apply unsuccessfully.",
  bonus:
    "Each bonus point gives you an additional chance in the draw. More points = better odds, but not guaranteed.",
  random:
    "All applicants have equal odds regardless of history. No point accumulation system.",
  otc: "Tags are available over the counter on a first-come, first-served basis. No draw required.",
  hybrid:
    "Combines elements of preference and bonus systems. A portion of tags go to top-point holders, the rest are weighted random.",
};

const DRAW_SYSTEM_LABELS: Record<string, string> = {
  preference: "Preference Points",
  bonus: "Bonus Points",
  random: "Random Draw",
  otc: "Over the Counter",
  hybrid: "Hybrid System",
};

interface FilterPanelProps {
  species: Species;
  season: Season | "all";
  sex: Sex | "all";
  residency: Residency;
  points: number;
  onSeasonChange: (s: Season | "all") => void;
  onSexChange: (s: Sex | "all") => void;
  onResidencyChange: (r: Residency) => void;
  onPointsChange: (p: number) => void;
  stateSlug?: string;
  availableSeasons?: Season[];
  availableSexOptions?: Sex[];
  drawSystem?: DrawSystem;
}

export function FilterPanel({
  species,
  season,
  sex,
  residency,
  points,
  onSeasonChange,
  onSexChange,
  onResidencyChange,
  onPointsChange,
  availableSeasons,
  availableSexOptions,
  drawSystem,
}: FilterPanelProps) {
  const sexOptions = availableSexOptions || SEX_OPTIONS[species] || [];
  const seasonOptions = availableSeasons || SPECIES_SEASONS[species] || ["rifle", "archery", "muzzleloader"];

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-5">
      <h3 className="font-bold text-lg text-foreground">Filters</h3>

      {/* Draw System Info */}
      {drawSystem && (
        <div className="group relative">
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Draw System
            </span>
            <span className="text-sm font-bold text-foreground">
              {DRAW_SYSTEM_LABELS[drawSystem] || drawSystem}
            </span>
            <span
              className="ml-auto text-muted-foreground cursor-help"
              title={DRAW_SYSTEM_DESCRIPTIONS[drawSystem] || ""}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </span>
          </div>
          {/* Tooltip on hover */}
          <div className="absolute left-0 right-0 top-full mt-1 p-3 bg-card border border-border rounded-lg shadow-lg text-xs text-muted-foreground z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
            {DRAW_SYSTEM_DESCRIPTIONS[drawSystem] || "No description available."}
          </div>
        </div>
      )}

      {/* Residency */}
      <div>
        <label className="block text-sm font-semibold text-muted-foreground mb-2">
          Residency
        </label>
        <div className="flex gap-2">
          {(["resident", "nonresident"] as Residency[]).map((r) => (
            <button
              key={r}
              onClick={() => onResidencyChange(r)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition cursor-pointer ${
                residency === r
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {r === "resident" ? "Resident" : "Non-Resident"}
            </button>
          ))}
        </div>
      </div>

      {/* Season */}
      <div>
        <label className="block text-sm font-semibold text-muted-foreground mb-2">
          Season
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onSeasonChange("all")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition cursor-pointer ${
              season === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All
          </button>
          {seasonOptions.map((s) => (
            <button
              key={s}
              onClick={() => onSeasonChange(s)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition cursor-pointer ${
                season === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {SEASON_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Sex */}
      <div>
        <label className="block text-sm font-semibold text-muted-foreground mb-2">
          Sex
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => onSexChange("all")}
            className={`px-3 py-1.5 rounded text-sm font-medium transition cursor-pointer ${
              sex === "all"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            All
          </button>
          {sexOptions.map((s) => (
            <button
              key={s}
              onClick={() => onSexChange(s)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition cursor-pointer ${
                sex === s
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {SEX_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Preference Points Slider */}
      <div>
        <label className="block text-sm font-semibold text-muted-foreground mb-2">
          Your Preference Points
        </label>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0}
            max={25}
            value={points}
            onChange={(e) => onPointsChange(parseInt(e.target.value))}
            className="flex-1"
          />
          <div className="bg-primary text-primary-foreground font-bold rounded-lg px-3 py-1 min-w-[48px] text-center text-lg">
            {points}
          </div>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>0 pts</span>
          <span>25 pts</span>
        </div>
      </div>
    </div>
  );
}
