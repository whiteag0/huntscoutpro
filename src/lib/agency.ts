import "server-only";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import path from "node:path";
import { AGENCY_FILES } from "@/data/agency/index.generated";
import STATS from "@/data/agency/stats.generated.json";
import type {
  Coverage,
  DrawMeta,
  DrawRecord,
  HarvestMeta,
  HarvestRecord,
  SourceRef,
  Species,
  SpeciesInfo,
} from "@/data/agency/schema";

/** Everything known about a state except the per-species tables. Small enough to pass to client components. */
export interface StateData extends Omit<DrawMeta, "coverage" | "sources"> {
  unitNames: HarvestMeta["unitNames"];
  drawCoverage: Coverage[];
  harvestCoverage: Coverage[];
  sources: SourceRef[];
}

export interface SpeciesData {
  harvest: HarvestRecord[];
  draw: DrawRecord[];
}

const metaCache = new Map<string, Promise<StateData | null>>();

export function hasAgencyData(slug: string): boolean {
  return Object.hasOwn(AGENCY_FILES, slug);
}

export function agencySlugs(): string[] {
  return Object.keys(AGENCY_FILES);
}

async function loadMeta(slug: string): Promise<StateData | null> {
  const files = AGENCY_FILES[slug];
  if (!files) return null;
  const draw = files.drawMeta as DrawMeta;
  const harvest = (files.harvestMeta as HarvestMeta | null) || { unitNames: {}, coverage: [], sources: [] };
  const { coverage, sources, ...rest } = draw;
  return {
    ...rest,
    unitNames: harvest.unitNames || {},
    drawCoverage: coverage || [],
    harvestCoverage: harvest.coverage || [],
    sources: [...(sources || []), ...(harvest.sources || [])],
  };
}

export function getStateData(slug: string): Promise<StateData | null> {
  if (!hasAgencyData(slug)) return Promise.resolve(null);
  let p = metaCache.get(slug);
  if (!p) {
    p = loadMeta(slug);
    metaCache.set(slug, p);
  }
  return p;
}

/** Species we can show for a state: described by the agency and backed by at least one table. */
export function speciesWithData(state: StateData): SpeciesInfo[] {
  const files = AGENCY_FILES[state.slug];
  return state.species.filter(
    (s) => s.drawSystem !== "none" && (!!files?.draw.includes(s.species) || !!files?.harvest.includes(s.species))
  );
}

/** Species tables live outside the JS bundle as gzipped copies (scripts/agency/build-index.mjs); next.config traces them into the API function. */
const DATA_DIR = path.join(process.cwd(), ".agency-gz");

export type TableKind = "draw" | "harvest";

function hasTable(slug: string, kind: TableKind, species: Species): boolean {
  return Object.hasOwn(AGENCY_FILES, slug) && AGENCY_FILES[slug][kind].includes(species);
}

/** The gzipped JSON array for one table, exactly as built, or null when the agency publishes none. */
export async function readTableGzip(slug: string, kind: TableKind, species: Species): Promise<Buffer | null> {
  if (!hasTable(slug, kind, species)) return null;
  return readFile(path.join(DATA_DIR, slug, kind, `${species}.json.gz`));
}

export async function readTable<T>(slug: string, kind: TableKind, species: Species): Promise<T[]> {
  const gz = await readTableGzip(slug, kind, species);
  return gz ? (JSON.parse(gunzipSync(gz).toString("utf8")) as T[]) : [];
}

/** Both tables for a state/species. Not cached: the big tables are only parsed for previews and build-time pages. */
export async function getSpeciesData(slug: string, species: Species): Promise<SpeciesData> {
  const [harvest, draw] = await Promise.all([readTable<HarvestRecord>(slug, "harvest", species), readTable<DrawRecord>(slug, "draw", species)]);
  return { harvest, draw };
}

export async function getAllStateData(): Promise<StateData[]> {
  const all = await Promise.all(agencySlugs().map(getStateData));
  return all.filter((s): s is StateData => !!s);
}

export interface CoverageStats {
  states: number;
  /** Per species: live states covering it, distinct hunt codes in each state's latest draw year, distinct harvest units. */
  species: Partial<Record<Species, { states: number; huntCodes: number; units: number }>>;
  drawYears: [number, number] | null;
  harvestYears: [number, number] | null;
  /** Agency statewide turkey rows by state, newest first. */
  turkeyStatewide: Record<string, { rows: HarvestRecord[]; units: number; drawHunts: number }>;
}

/** Counts computed from the published agency files at build time (scripts/agency/build-index.mjs). */
export async function getCoverageStats(): Promise<CoverageStats> {
  return STATS as unknown as CoverageStats;
}
