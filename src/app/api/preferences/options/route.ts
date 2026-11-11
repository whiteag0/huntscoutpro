import { NextResponse } from "next/server";
import { SPECIES_LABELS } from "@/data/types";
import { getAllStateData, speciesWithData } from "@/lib/agency";
import { LIVE_STATE_SLUGS } from "@/lib/agency-format";
import type { StateOption } from "@/lib/preferences-schema";

// What the /welcome form offers per live state: its unit word (for the units question) and its
// species with agency data, marking those whose draw uses points (for the points question).
// Public agency facts only, so no sign-in; cached at the edge.

export const revalidate = 3600;

export async function GET() {
  const states = await getAllStateData();
  const options: StateOption[] = states
    .filter((s) => LIVE_STATE_SLUGS.includes(s.slug))
    .sort((a, b) => LIVE_STATE_SLUGS.indexOf(a.slug) - LIVE_STATE_SLUGS.indexOf(b.slug))
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      abbrev: s.abbrev,
      unitTerm: s.unitTerm || "Unit",
      species: speciesWithData(s).map((sp) => ({ id: sp.species, label: SPECIES_LABELS[sp.species] ?? sp.species, pointsMatter: !!sp.pointsMatter })),
    }));
  return NextResponse.json({ states: options });
}
