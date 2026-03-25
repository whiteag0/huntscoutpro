"use client";

import Image from "next/image";
import { Species, SPECIES_LABELS } from "@/data/types";

const SPECIES_IMAGES: Record<Species, string> = {
  elk: "https://images.unsplash.com/photo-1485833077593-4278bba3f11f?w=400&q=80&fit=crop&crop=faces",
  "mule-deer":
    "https://images.unsplash.com/photo-1604869632600-7137337c2ad5?w=400&q=80&fit=crop&crop=faces",
  whitetail:
    "https://images.unsplash.com/photo-1603931824372-e684cae34c70?w=400&q=80&fit=crop&crop=faces",
  pronghorn:
    "https://images.unsplash.com/photo-1619923123687-57ccb74549ce?w=400&q=80&fit=crop&crop=faces",
  moose:
    "https://images.unsplash.com/photo-1695246040798-cfa890a50377?w=400&q=80&fit=crop&crop=faces",
  bear: "https://images.unsplash.com/photo-1730466576978-1691316fe296?w=400&q=80&fit=crop&crop=faces",
  sheep:
    "https://images.unsplash.com/photo-1564846930470-4b034d717347?w=400&q=80&fit=crop&crop=faces",
  goat: "https://images.unsplash.com/photo-1598662325033-aa44604e889e?w=400&q=80&fit=crop&crop=faces",
  lion: "https://images.unsplash.com/photo-1605235900483-2cb72b54c19f?w=400&q=80&fit=crop&crop=faces",
  turkey:
    "https://images.unsplash.com/photo-1606157705364-e70c37cec460?w=400&q=80&fit=crop&crop=faces",
};

interface SpeciesCardProps {
  species: Species;
  unitCount: number;
  onClick: () => void;
  selected?: boolean;
}

export function SpeciesCard({
  species,
  unitCount,
  onClick,
  selected,
}: SpeciesCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group relative overflow-hidden rounded-xl border-2 text-left transition-all duration-200 cursor-pointer
        hover:shadow-lg hover:border-primary hover:-translate-y-0.5
        active:translate-y-0 active:shadow-sm
        ${
          selected
            ? "border-primary shadow-lg ring-2 ring-primary/30"
            : "border-border bg-card hover:bg-card/80"
        }
      `}
    >
      {/* Species photo */}
      <div className="relative w-full aspect-[4/3] overflow-hidden">
        <Image
          src={SPECIES_IMAGES[species]}
          alt={`${SPECIES_LABELS[species] || species} in natural habitat`}
          fill
          sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 180px"
          className={`object-cover transition-transform duration-300 ${
            selected
              ? "scale-105"
              : "group-hover:scale-105"
          }`}
        />
        {/* Subtle gradient overlay for text readability if needed */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
      </div>

      {/* Label area */}
      <div className="p-3">
        <div className="font-bold text-foreground text-sm leading-tight">
          {SPECIES_LABELS[species] || species}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {unitCount} units
        </div>
      </div>
    </button>
  );
}
