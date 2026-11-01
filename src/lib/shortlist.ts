import "server-only";
import type { DrawRecord, DrawSystemKind, HarvestRecord, SourceRef, Species } from "@/data/agency/schema";
import { AGENCY_FILES } from "@/data/agency/index.generated";
import { SPECIES_LABELS } from "@/data/types";
import { getStateData, readTable, speciesWithData, type StateData } from "@/lib/agency";
import { DRAW_SYSTEM_LABELS, LIVE_STATE_SLUGS } from "@/lib/agency-format";
import type { DrawResidency } from "@/lib/agency-view";
import { pointsKey, type PointsMap } from "@/lib/points-schema";
import {
  MAX_HUNTS_PER_STATE,
  classifyState,
  pickHarvest,
  type ShortlistCounts,
  type ShortlistHunt,
} from "@/lib/shortlist-core";

export interface ShortlistSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  dataYear?: number;
}

export interface ShortlistState {
  slug: string;
  name: string;
  abbrev: string;
  unitTerm: string;
  agencyName: string;
  residency: DrawResidency;
  drawYear: number | null;
  newerYearWithoutResults: number | null;
  drawSystem: DrawSystemKind;
  systemLabel: string;
  pointsMatter: boolean;
  pointName?: string;
  /** The member's points for this state and species, or null when none entered. */
  points: number | null;
  hasPointTable: boolean;
  hasMinPoints: boolean;
  /** Plain-language caveats for this state (no point table, random draw, older year, ...). */
  notes: string[];
  counts: ShortlistCounts;
  /** Qualifying hunts before trimming to `hunts`. */
  matched: number;
  hunts: ShortlistHunt[];
  /** Agency documents behind the hunts shown (draw first, then harvest). */
  sources: ShortlistSource[];
}

export interface ShortlistResult {
  species: Species;
  home: string;
  includeStretch: boolean;
  states: ShortlistState[];
  /** Live states with no draw table for this species. */
  notCovered: { slug: string; name: string }[];
}

export interface ShortlistQuery {
  species: Species;
  /** Two-letter home state. */
  home: string;
  points: PointsMap;
  includeStretch: boolean;
}

// Tiny LRU of computed per-state results (each is at most 25 hunts). The tables
// themselves are not cached: they're read and parsed on a miss, then dropped.
const LRU_MAX = 300;
const lru = new Map<string, ShortlistState>();

function lruGet(key: string): ShortlistState | undefined {
  const hit = lru.get(key);
  if (hit) {
    lru.delete(key);
    lru.set(key, hit);
  }
  return hit;
}

function lruSet(key: string, value: ShortlistState) {
  lru.set(key, value);
  while (lru.size > LRU_MAX) lru.delete(lru.keys().next().value!);
}

function toSource(s: SourceRef): ShortlistSource {
  return { id: s.id, title: s.title, publisher: s.publisher, url: s.url, dataYear: s.dataYear };
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function stateNotes(st: StateData, info: StateData["species"][number], r: Omit<ShortlistState, "notes" | "sources">, includeStretch: boolean): string[] {
  const notes: string[] = [];
  const agency = st.agency.shortName || st.agency.name;
  const point = info.pointName || "point";
  if (r.drawYear === null) {
    notes.push(`${agency} hasn't published applicant or drawn counts in the tables we have for this species.`);
    return notes;
  }
  if (r.newerYearWithoutResults) {
    notes.push(`${agency} has published ${r.newerYearWithoutResults} quotas but not applicant counts yet, so these are ${r.drawYear} results.`);
  }
  if (r.counts.hunts > 0 && r.counts.noFigures === r.counts.hunts) {
    notes.push(`${agency} published no ${r.residency} figures for any of these hunts.`);
    return notes;
  }
  if (info.drawSystem === "otc") {
    notes.push(`${agency} sells most of these licenses over the counter; this list covers only the drawn hunts in its draw report.`);
  }
  if (!r.pointsMatter) {
    notes.push(`This draw doesn't use points (${r.systemLabel.replace(/ \(.*\)$/, "").toLowerCase()}), so hunts are ranked by last year's odds for ${r.residency} applicants.`);
  } else if (r.points === null) {
    notes.push(`Add your ${point}s for ${st.name} to see which hunts drew at your level. Until then, hunts are ranked by overall odds; check each hunt's lowest point level drawn.`);
  } else if (!r.hasPointTable && !r.hasMinPoints) {
    notes.push(`${agency} doesn't publish applicants by point level or the lowest point level drawn, so we can't tell which hunts drew at your points. Hunts are ranked by overall odds.`);
  } else if (!r.hasPointTable) {
    notes.push(`${agency} doesn't publish applicants by point level. Where it publishes the lowest point level drawn, we compare that with your points.`);
  }
  if (r.hunts.some((h) => h.pool === "total")) {
    notes.push(`Some hunts are reported as one combined resident and nonresident pool.`);
  }
  if (r.counts.stretch > 0 && !includeStretch) {
    notes.push(`${plural(r.counts.stretch, "stretch hunt")} (lowest point level drawn within 2 of yours) hidden. Turn on stretch hunts to see them.`);
  }
  return notes;
}

async function stateShortlist(st: StateData, q: ShortlistQuery): Promise<ShortlistState | null> {
  const info = speciesWithData(st).find((s) => s.species === q.species);
  if (!info) return null;
  const residency: DrawResidency = q.home === st.abbrev ? "resident" : "nonresident";
  const points = info.pointsMatter ? (q.points[pointsKey(st.slug, q.species)] ?? null) : null;
  const cacheKey = [st.slug, q.species, residency, points ?? "-", q.includeStretch ? 1 : 0].join("|");
  const cached = lruGet(cacheKey);
  if (cached) return cached;

  const rows = await readTable<DrawRecord>(st.slug, "draw", q.species);
  if (!rows.length) return null;
  const c = classifyState({ rows, residency, pointsMatter: info.pointsMatter, points, includeStretch: q.includeStretch });
  const hunts = c.hunts.slice(0, MAX_HUNTS_PER_STATE);

  // Harvest success for the single-unit hunts we're showing.
  if (hunts.some((h) => h.units.length === 1)) {
    const harvest = await readTable<HarvestRecord>(st.slug, "harvest", q.species);
    if (harvest.length) {
      for (const h of hunts) {
        if (h.units.length !== 1) continue;
        h.harvest = pickHarvest(harvest, h, residency);
      }
    }
  }

  const base = {
    slug: st.slug,
    name: st.name,
    abbrev: st.abbrev,
    unitTerm: st.unitTerm,
    agencyName: st.agency.name,
    residency,
    drawYear: c.drawYear,
    newerYearWithoutResults: c.newerYearWithoutResults,
    drawSystem: info.drawSystem,
    systemLabel: DRAW_SYSTEM_LABELS[info.drawSystem],
    pointsMatter: info.pointsMatter,
    pointName: info.pointName,
    points,
    hasPointTable: c.hasPointTable,
    hasMinPoints: c.hasMinPoints,
    counts: c.counts,
    matched: c.hunts.length,
    hunts,
  };
  const byId = new Map(st.sources.map((s) => [s.id, s]));
  const ids = [...new Set([...hunts.map((h) => h.sourceId), ...hunts.flatMap((h) => (h.harvest ? [h.harvest.sourceId] : []))])];
  const result: ShortlistState = {
    ...base,
    notes: stateNotes(st, info, base, q.includeStretch),
    sources: ids.map((id) => byId.get(id)).filter((s): s is SourceRef => !!s).map(toSource),
  };
  lruSet(cacheKey, result);
  return result;
}

const bestOdds = (s: ShortlistState) => {
  const top = s.hunts.find((h) => h.status !== "stretch" && h.status !== "points-unknown");
  return top?.rankOdds ?? -1;
};

/**
 * Card order: states where your points matched hunts, then draws that don't use points, then
 * states you haven't entered points for, then states without point-level data; empty states last.
 */
function stateGroup(s: ShortlistState): number {
  if (!s.hunts.length) return 4;
  if (s.hunts.some((h) => h.status === "drew-at-points" || h.status === "min-at-or-below")) return 0;
  if (!s.pointsMatter) return 1;
  if (s.points === null) return 2;
  return 3;
}

/** Cross-state shortlist from each live state's latest published draw results. */
export async function buildShortlist(q: ShortlistQuery): Promise<ShortlistResult> {
  const states = (await Promise.all(LIVE_STATE_SLUGS.map((slug) => getStateData(slug)))).filter((s): s is StateData => !!s);
  const results = await Promise.all(states.map((st) => stateShortlist(st, q).then((r) => [st, r] as const)));
  const shown = results.flatMap(([, r]) => (r ? [r] : []));
  shown.sort((a, b) => stateGroup(a) - stateGroup(b) || bestOdds(b) - bestOdds(a) || a.name.localeCompare(b.name));
  return {
    species: q.species,
    home: q.home,
    includeStretch: q.includeStretch,
    states: shown,
    notCovered: results.filter(([, r]) => !r).map(([st]) => ({ slug: st.slug, name: st.name })),
  };
}

/** Live states with a draw table for each species, for the shortlist form. */
export interface ShortlistSpeciesOption {
  species: Species;
  states: { slug: string; name: string; abbrev: string; pointsMatter: boolean; pointName?: string; drawSystem: DrawSystemKind }[];
}

export async function shortlistSpeciesOptions(): Promise<ShortlistSpeciesOption[]> {
  const states = (await Promise.all(LIVE_STATE_SLUGS.map((slug) => getStateData(slug)))).filter((s): s is StateData => !!s);
  const map = new Map<Species, ShortlistSpeciesOption>();
  for (const st of states) {
    for (const info of speciesWithData(st)) {
      if (!AGENCY_FILES[st.slug]?.draw.includes(info.species)) continue;
      const opt = map.get(info.species) || { species: info.species, states: [] };
      opt.states.push({ slug: st.slug, name: st.name, abbrev: st.abbrev, pointsMatter: info.pointsMatter, pointName: info.pointName, drawSystem: info.drawSystem });
      map.set(info.species, opt);
    }
  }
  const order = Object.keys(SPECIES_LABELS);
  return Array.from(map.values()).sort((a, b) => order.indexOf(a.species) - order.indexOf(b.species));
}
