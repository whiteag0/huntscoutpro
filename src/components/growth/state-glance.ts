import "server-only";
import { SPECIES_LABELS } from "@/data/types";
import type { Coverage, HarvestRecord, KeyDate, Species, SpeciesInfo } from "@/data/agency/schema";
import { readTable, type StateData } from "@/lib/agency";
import { DRAW_SYSTEM_LABELS, formatKeyDate, keyDateEnd, todayIso } from "@/lib/agency-format";
import { SITE } from "@/lib/emails/onboarding";

// Public "at a glance" facts for a live state page, and its structured data.
// Everything is read from the agency meta files or copied from agency
// statewide harvest rows. No per-unit or per-hunt figures (those stay in Pro).

export type YearSpan = [number, number] | null;

export interface GlanceDate {
  label: string;
  when: string;
  end: string;
  cycle: number;
  tentative: boolean;
  sourceUrl: string;
}

export interface GlanceStatewideRow {
  year: number;
  label: string | null;
  hunters: number | null;
  harvest: number | null;
  successPct: number | null;
  successComputed: boolean;
  sourceId: string;
}

export interface GlanceSpecies {
  species: Species;
  label: string;
  drawSystem: string;
  pointName?: string;
  drawYears: YearSpan;
  harvestYears: YearSpan;
  next: GlanceDate[];
  /** Agency statewide totals for the newest season that has them. */
  statewide: { year: number; rows: GlanceStatewideRow[]; more: number } | null;
}

export interface StateGlance {
  species: GlanceSpecies[];
  drawYears: YearSpan;
  harvestYears: YearSpan;
  /** Highest license/draw cycle the agency has published key dates for. */
  latestCycle: number | null;
  sources: { id: string; title: string; url: string; dataYear?: number }[];
}

export function yearSpan(years: number[]): YearSpan {
  return years.length ? [Math.min(...years), Math.max(...years)] : null;
}

export function spanLabel(s: YearSpan): string {
  if (!s) return "";
  return s[0] === s[1] ? String(s[0]) : `${s[0]}–${s[1]}`;
}

const yearsFor = (cov: Coverage[], species?: Species) =>
  cov.filter((c) => !species || c.species === species).flatMap((c) => c.years);

/** Upcoming key dates (not yet ended), soonest first. */
export function upcomingDates(info: SpeciesInfo, sources: StateData["sources"], agencyUrl: string, today: string, max = 2): GlanceDate[] {
  return [...info.keyDates]
    .filter((k: KeyDate) => keyDateEnd(k) >= today && formatKeyDate(k))
    .sort((a, b) => keyDateEnd(a).localeCompare(keyDateEnd(b)) || a.label.localeCompare(b.label))
    .slice(0, max)
    .map((k) => ({
      label: k.label,
      when: formatKeyDate(k),
      end: keyDateEnd(k),
      cycle: k.cycle,
      tentative: k.status === "tentative",
      sourceUrl: sources.find((s) => s.id === k.sourceId)?.url || agencyUrl,
    }));
}

/**
 * Statewide rows for the newest season: whole-state rows (no hunt, sex or residency
 * split), the agency's all-methods rows first, at most `max`.
 */
export function statewideSummary(rows: readonly HarvestRecord[], max = 3): GlanceSpecies["statewide"] {
  const whole = rows.filter(
    (r) => r.unit === "Statewide" && !r.hunt && (!r.sex || r.sex === "all") && (!r.residency || r.residency === "all") && (r.hunters != null || r.harvest != null)
  );
  if (!whole.length) return null;
  const year = Math.max(...whole.map((r) => r.year));
  const inYear = whole.filter((r) => r.year === year);
  const all = inYear.filter((r) => r.method === "all");
  const pool = (all.length ? all : inYear).sort((a, b) => (b.hunters ?? -1) - (a.hunters ?? -1));
  return {
    year,
    rows: pool.slice(0, max).map((r) => ({
      year: r.year,
      label: r.methodLabel || (r.method && r.method !== "all" ? r.method : null),
      hunters: r.hunters,
      harvest: r.harvest,
      successPct: r.successPct ?? (r.hunters && r.harvest != null ? (100 * r.harvest) / r.hunters : null),
      successComputed: r.successPct == null || !!r.successComputed,
      sourceId: r.sourceId,
    })),
    more: Math.max(0, pool.length - max),
  };
}

// Statewide rows per state, parsed once per server instance (the tables are large).
const statewideCache = new Map<string, Promise<Partial<Record<Species, GlanceSpecies["statewide"]>>>>();

async function loadStatewide(slug: string, species: Species[]) {
  const out: Partial<Record<Species, GlanceSpecies["statewide"]>> = {};
  await Promise.all(
    species.map(async (sp) => {
      try {
        out[sp] = statewideSummary(await readTable<HarvestRecord>(slug, "harvest", sp));
      } catch (err) {
        console.error(`state-glance: harvest table ${slug}/${sp} unavailable:`, err);
        out[sp] = null;
      }
    })
  );
  return out;
}

export async function getStateGlance(state: StateData, species: SpeciesInfo[], today: string = todayIso()): Promise<StateGlance> {
  let sw = statewideCache.get(state.slug);
  if (!sw) {
    sw = loadStatewide(state.slug, species.map((s) => s.species));
    statewideCache.set(state.slug, sw);
  }
  const statewide = await sw;

  const list: GlanceSpecies[] = species.map((info) => ({
    species: info.species,
    label: SPECIES_LABELS[info.species] ?? info.species,
    drawSystem: DRAW_SYSTEM_LABELS[info.drawSystem],
    ...(info.pointName && info.pointsMatter ? { pointName: info.pointName } : {}),
    drawYears: yearSpan(yearsFor(state.drawCoverage, info.species)),
    harvestYears: yearSpan(yearsFor(state.harvestCoverage, info.species)),
    next: upcomingDates(info, state.sources, state.agency.url, today),
    statewide: statewide[info.species] ?? null,
  }));

  // Sources behind what this section shows: key dates first, then statewide harvest.
  const ids = new Set<string>();
  for (const info of species) for (const k of info.keyDates) ids.add(k.sourceId);
  for (const s of list) for (const r of s.statewide?.rows || []) ids.add(r.sourceId);
  const sources = [...ids]
    .map((id) => state.sources.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .filter((s, i, arr) => arr.findIndex((x) => x.url === s.url) === i)
    .map((s) => ({ id: s.id, title: s.title, url: s.url, ...(s.dataYear ? { dataYear: s.dataYear } : {}) }));

  const cycles = species.flatMap((s) => s.keyDates.map((k) => k.cycle));
  return {
    species: list,
    drawYears: yearSpan(yearsFor(state.drawCoverage)),
    harvestYears: yearSpan(yearsFor(state.harvestCoverage)),
    latestCycle: cycles.length ? Math.max(...cycles) : null,
    sources,
  };
}

/** "elk, mule deer, pronghorn and 4 more" */
export function speciesPhrase(species: SpeciesInfo[], max = 4): string {
  const names = species.map((s) => (SPECIES_LABELS[s.species] ?? s.species).toLowerCase());
  if (names.length <= max) return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0] || "";
  return `${names.slice(0, max).join(", ")} and ${names.length - max} more`;
}

/** schema.org Dataset (plus breadcrumb) for a live state page. */
export function stateJsonLd(state: StateData, species: SpeciesInfo[], glance: StateGlance): object[] {
  const url = `${SITE}/states/${state.slug}`;
  const span = yearSpan([...(glance.drawYears || []), ...(glance.harvestYears || [])]);
  const pointsPublished = species.some((s) => s.pointsMatter);
  return [
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: `${state.name} draw results and harvest data`,
      description: `Draw results (applicants and tags drawn${pointsPublished ? ", with point levels where published" : ""}) and harvest by ${state.unitTerm} for ${speciesPhrase(species, 20)} in ${state.name}, as published by ${state.agency.name}${span ? `, ${spanLabel(span)}` : ""}. Every figure is cited to the agency report it came from.`,
      url,
      creator: { "@type": "GovernmentOrganization", name: state.agency.name, url: state.agency.url },
      publisher: { "@type": "Organization", name: "HuntScout Pro", url: SITE },
      license: { "@type": "CreativeWork", name: `Published by ${state.agency.name}`, url: state.agency.url },
      creditText: `Published by ${state.agency.name}`,
      ...(span ? { temporalCoverage: `${span[0]}/${span[1]}` } : {}),
      spatialCoverage: { "@type": "Place", name: `${state.name}, United States` },
      dateModified: state.lastReviewed,
      isAccessibleForFree: false,
      keywords: [`${state.name} draw results`, `${state.name} draw odds`, `${state.name} harvest statistics`, ...species.map((s) => `${state.name} ${(SPECIES_LABELS[s.species] ?? s.species).toLowerCase()}`)],
      variableMeasured: ["Applicants", "Tags drawn", "Hunters", "Harvest", "Hunter success rate"],
      isBasedOn: glance.sources.slice(0, 10).map((s) => s.url),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "States", item: `${SITE}/states` },
        { "@type": "ListItem", position: 2, name: state.name, item: url },
      ],
    },
  ];
}

/** JSON for a <script type="application/ld+json">, safe against "</script>" in agency text. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
