"use client";

import { Species, SPECIES_LABELS } from "@/data/types";

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

interface SpeciesCardProps {
  species: Species;
  unitCount: number;
  onClick: () => void;
  selected?: boolean;
}

export function SpeciesCard({ species, unitCount, onClick, selected }: SpeciesCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        p-4 rounded-lg border-2 text-left transition-all duration-200 cursor-pointer
        hover:shadow-md hover:border-primary hover:-translate-y-0.5
        active:translate-y-0 active:shadow-sm
        ${selected
          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
          : "border-border bg-card hover:bg-card/80"
        }
      `}
    >
      <div
        className={`text-3xl mb-2 transition-transform duration-200 ${
          selected ? "scale-110" : "group-hover:scale-105"
        }`}
      >
        {SPECIES_ICONS[species] || "\ud83e\udd8c"}
      </div>
      <div className="font-bold text-foreground text-sm sm:text-base">
        {SPECIES_LABELS[species] || species}
      </div>
      <div className="text-sm text-muted-foreground">{unitCount} units</div>
    </button>
  );
}
