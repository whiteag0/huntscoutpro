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

/**
 * What a key date is for, so the planner and reminders don't have to guess from the label.
 * application = the window/deadline to apply in the draw; application-change = modify/withdraw/
 * correction deadline; results = draw results posted; payment = pay for a drawn license/tag;
 * surrender = return a drawn license without penalty; points = point-only purchase/application;
 * leftover = leftover/second/secondary draw or sale; license-sale = OTC/general licenses go on sale.
 */
export type KeyDateKind = "application" | "application-change" | "results" | "payment" | "surrender" | "points" | "leftover" | "license-sale" | "other";

export interface KeyDate {
  /** e.g. "Big game draw application period", "Draw results posted". */
  label: string;
  kind?: KeyDateKind;
  /** Set when the agency limits this date to one residency. */
  residency?: "resident" | "nonresident";
  /** Single date, YYYY-MM-DD. Use start/end for windows. */
  date?: string;
  start?: string;
  end?: string;
  /** License/hunt year this date belongs to (e.g. 2027 for the 2027 draw). */
  cycle: number;
  /**
   * confirmed = published by the agency for that cycle.
   * tentative = agency-published but marked tentative, OR computed from a standing rule in the agency's
   * current regulation that fixes the date every year (the note cites the rule and says the agency
   * hasn't announced that cycle's date yet).
   */
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
  /** Weapon the season is for, when it is limited to one. */
  method?: Method;
  /** Units the dates apply to, as the agency writes them; omitted = statewide/standard season. */
  units?: string[];
  /** Hunt codes the dates apply to, when the agency ties them to specific hunts. */
  huntCodes?: string[];
  residency?: "resident" | "nonresident";
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

/** One continuous stretch of a hunt's season. */
export interface SeasonRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  /** e.g. "Any Legal Weapon", "Archery only", when the agency splits a hunt's season. */
  label?: string;
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
  /** Season dates exactly as the agency prints them for this hunt. */
  seasonDates?: string;
  /** The same dates as YYYY-MM-DD ranges (one per segment), for timelines and calendar export. */
  seasonRanges?: SeasonRange[];
  /** Source of seasonDates/seasonRanges when it isn't sourceId (e.g. the regulations booklet). */
  seasonSourceId?: string;
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
