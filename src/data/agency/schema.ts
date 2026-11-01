// ============================================================
// HuntScout Pro — agency data schema
// ============================================================
// Every number in src/data/agency/<state>/ was copied or parsed from an
// official state wildlife agency publication and carries a sourceId that
// resolves to a SourceRef in that state's meta files. Nothing is modeled,
// estimated or interpolated. Missing values are null or omitted, never filled.
// ============================================================

import type { Species } from "@/data/types";

export type { Species };

export interface SourceRef {
  /** Unique within the state. Harvest sources start with "h-", draw/meta sources with "d-". */
  id: string;
  /** Title as the agency publishes it. */
  title: string;
  /** e.g. "Colorado Parks and Wildlife" */
  publisher: string;
  /** Direct link to the document (PDF/XLSX/CSV) or the page holding the table. */
  url: string;
  /** Index page where the document is listed, when different from url. */
  pageUrl?: string;
  /** Season, license or draw year the document covers. */
  dataYear?: number;
  /** Date the document was downloaded, YYYY-MM-DD. */
  retrieved: string;
  /** e.g. "Preliminary — subject to revision". */
  notes?: string;
}

export type DrawSystemKind =
  | "preference" // applicants with the most points draw first
  | "bonus" // each point adds chances in a random draw
  | "bonus-squared" // chances grow with points squared
  | "hybrid" // a share by points, the rest random
  | "random" // no points
  | "otc" // licenses sold over the counter, no draw
  | "none"; // species not hunted / no license available

export type Method = "all" | "rifle" | "archery" | "muzzleloader" | "shotgun" | "other";
export type SexClass = "all" | "male" | "female" | "either";
export type ResidencyClass = "all" | "resident" | "nonresident";

export interface KeyDate {
  /** e.g. "Big game draw application period", "Draw results posted". */
  label: string;
  /** Single date, YYYY-MM-DD. Use start/end for windows. */
  date?: string;
  start?: string;
  end?: string;
  /** License/hunt year this date belongs to (e.g. 2027 for the 2027 draw). */
  cycle: number;
  /** confirmed = published by the agency for that cycle. tentative = agency-published but marked tentative. */
  status: "confirmed" | "tentative";
  note?: string;
  sourceId: string;
}

export interface SpeciesInfo {
  species: Species;
  /** e.g. "Bighorn sheep (Rocky Mountain & desert)". */
  displayName?: string;
  drawSystem: DrawSystemKind;
  /** draw system for the years in draw/<species>.json when it differs from the current one */
  pastDrawSystem?: DrawSystemKind;
  /** 1–3 factual sentences on how licenses for this species are allocated. */
  drawSystemSummary: string;
  /** True only when the agency's draw uses points, so odds-by-point-level is meaningful. */
  pointsMatter: boolean;
  /** "preference point", "bonus point", ... */
  pointName?: string;
  residentNote?: string;
  nonresidentNote?: string;
  /** What can be bought over the counter for this species, if anything. */
  otcSummary?: string;
  keyDates: KeyDate[];
  sourceIds: string[];
}

export interface FeeItem {
  species?: Species | null;
  /** As named by the agency, e.g. "Nonresident elk license (bull)". */
  item: string;
  residency: "resident" | "nonresident";
  amountUsd: number;
  licenseYear: number;
  note?: string;
  sourceId: string;
}

export interface SeasonDate {
  species: Species;
  /** e.g. "First rifle season (elk)", "General archery". */
  label: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  year: number;
  note?: string;
  sourceId: string;
}

export interface Coverage {
  species: Species;
  years: number[];
  notes?: string;
}

/** Written by the harvest researcher: src/data/agency/<slug>/harvest-meta.json */
export interface HarvestMeta {
  /** Unit names by species, keyed by unit id exactly as the agency writes it. */
  unitNames: Partial<Record<Species, Record<string, string>>>;
  coverage: Coverage[];
  sources: SourceRef[];
}

/** Written by the draw researcher: src/data/agency/<slug>/draw-meta.json */
export interface DrawMeta {
  slug: string;
  name: string;
  abbrev: string;
  agency: { name: string; shortName: string; url: string };
  /** "GMU", "Hunt Area", "Hunting District", "Unit", "WMU", ... */
  unitTerm: string;
  /** Date this state's facts were last checked against the agency, YYYY-MM-DD. */
  lastReviewed: string;
  /** 2–4 factual sentences about how the state's draw works. */
  overview: string;
  species: SpeciesInfo[];
  fees: FeeItem[];
  seasons: SeasonDate[];
  coverage: Coverage[];
  sources: SourceRef[];
}

/** src/data/agency/<slug>/harvest/<species>.json — HarvestRecord[] */
export interface HarvestRecord {
  species: Species;
  /** Season/license year. */
  year: number;
  /** Agency unit id exactly as published ("061", "7", "100", "16A"), or "Statewide". */
  unit: string;
  unitName?: string;
  /** Agency hunt code/number, when harvest is reported per hunt. */
  hunt?: string;
  method?: Method;
  /** As published, e.g. "All Manners of Take", "Any Legal Weapon". */
  methodLabel?: string;
  sex?: SexClass;
  residency?: ResidencyClass;
  hunters: number | null;
  harvest: number | null;
  harvestMale?: number | null;
  harvestFemale?: number | null;
  /** Percent 0–100, as published; or harvest/hunters when not published (then successComputed = true). */
  successPct: number | null;
  successComputed?: boolean;
  daysHunted?: number | null;
  licenses?: number | null;
  note?: string;
  sourceId: string;
}

export interface DrawResidencyStats {
  quota?: number | null;
  applicants?: number | null;
  drawn?: number | null;
  /** Percent 0–100, as published or drawn/applicants (then oddsComputed = true). */
  oddsPct?: number | null;
  oddsComputed?: boolean;
  /** Lowest point level at which an applicant drew this hunt, as published or read from the point table. */
  minPoints?: number | null;
}

export interface DrawPointRow {
  points: number;
  resident?: { applicants: number; drawn: number } | null;
  nonresident?: { applicants: number; drawn: number } | null;
}

/** src/data/agency/<slug>/draw/<species>.json — DrawRecord[] */
export interface DrawRecord {
  species: Species;
  /** Draw year (the year applications were drawn). */
  year: number;
  /** Agency hunt code exactly as published. */
  huntCode: string;
  /** Agency units the hunt covers. */
  units: string[];
  /** As the agency describes the hunt. */
  description: string;
  method?: Method;
  methodLabel?: string;
  sex?: SexClass;
  seasonDates?: string;
  /** Which applications the counts reflect. */
  choice: "first" | "all";
  resident?: DrawResidencyStats | null;
  nonresident?: DrawResidencyStats | null;
  total?: DrawResidencyStats | null;
  /** Only when the agency publishes applicants/drawn by point level. */
  byPoints?: DrawPointRow[];
  note?: string;
  sourceId: string;
}

export const AGENCY_STATES = [
  "colorado",
  "wyoming",
  "montana",
  "idaho",
  "utah",
  "arizona",
  "nevada",
  "new-mexico",
  "oregon",
  "washington",
  "kansas",
  "south-dakota",
  "california",
  "alaska",
] as const;

export type AgencyStateSlug = (typeof AGENCY_STATES)[number];
