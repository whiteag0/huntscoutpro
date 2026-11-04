import "server-only";
import type { DrawRecord, Species, SpeciesInfo } from "@/data/agency/schema";
import { getSpeciesData, readTable, type StateData } from "@/lib/agency";
import { canonicalUnit } from "@/lib/agency-view";
import { buildUnitTeasers, freeTrendExample, hasTeaserData, type TrendExample, type UnitTeaser } from "@/lib/unit-teaser";

// Free unit and trends summaries, computed from the full agency tables on the server.
// Each state's tables are parsed once per server instance and only the small
// per-unit summaries are kept (the tables themselves are large).

export type UnitTeasers = Partial<Record<Species, Map<string, UnitTeaser>>>;

const unitCache = new Map<string, Promise<UnitTeasers>>();

async function loadUnitTeasers(slug: string, species: Species[]): Promise<UnitTeasers> {
  const out: UnitTeasers = {};
  await Promise.all(
    species.map(async (sp) => {
      const { harvest, draw } = await getSpeciesData(slug, sp);
      out[sp] = buildUnitTeasers(harvest, draw);
    })
  );
  return out;
}

/**
 * A table that can't be read fails the page rather than leaving the species out: a missing
 * species would read as "no figures published" and noindex its units. Failures aren't cached.
 */
export function getUnitTeasers(state: StateData, species: SpeciesInfo[]): Promise<UnitTeasers> {
  let p = unitCache.get(state.slug);
  if (!p) {
    p = loadUnitTeasers(state.slug, species.map((s) => s.species)).catch((err) => {
      console.error(`unit-glance: tables for ${state.slug} unavailable:`, err);
      unitCache.delete(state.slug);
      throw err;
    });
    unitCache.set(state.slug, p);
  }
  return p;
}

/** The unit's summary for each species, keeping only species with published figures for it. */
export function teasersForUnit(all: UnitTeasers, species: SpeciesInfo[], unit: string): Map<Species, UnitTeaser> {
  const key = canonicalUnit(unit);
  const out = new Map<Species, UnitTeaser>();
  for (const s of species) {
    const t = all[s.species]?.get(key);
    if (hasTeaserData(t)) out.set(s.species, t);
  }
  return out;
}

const trendCache = new Map<string, Promise<TrendExample | null>>();

/** The /trends example hunt for a state and species. */
export function getTrendExample(slug: string, info: Pick<SpeciesInfo, "species" | "pointsMatter">): Promise<TrendExample | null> {
  const key = `${slug}/${info.species}`;
  let p = trendCache.get(key);
  if (!p) {
    p = readTable<DrawRecord>(slug, "draw", info.species)
      .then((rows) => freeTrendExample(rows, info.pointsMatter))
      .catch((err) => {
        console.error(`unit-glance: draw table ${slug}/${info.species} unavailable:`, err);
        trendCache.delete(key);
        return null;
      });
    trendCache.set(key, p);
  }
  return p;
}
