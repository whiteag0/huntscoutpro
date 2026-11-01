// Shared (client + server) shape of a member's Hunt Planner, plus validation and
// merging. Pure functions only (no I/O) so they can be unit tested: `npm test`.
//
// Entries planned from agency data carry an `agency` block whose dates, seasons,
// fees and odds were copied from the agency's published rows by the server
// (src/lib/planner-agency.ts). Everything else on an entry is the member's own:
// status, notes, points owned, their own dates and checklist items. Refreshing
// (src/lib/planner-refresh.ts) only ever replaces the agency block.
//
// Schema history
//   1: hunts with one agency deadline, budget, gear checklist.
//   2: agency block gains every key date (by kind), the hunt's season ranges,
//      the planning cycle and whether the agency has published it, draw-system
//      notes and requirements; hunts gain tag-purchased/hunted statuses, their
//      own checklist and dates. v1 documents load unchanged (all new fields are
//      optional or default to empty) and are written back as v2.

export type HuntStatus = "planning" | "applied" | "drawn" | "alternate" | "not-drawn" | "tag-purchased" | "hunted";
export type PlannerSeason = "rifle" | "archery" | "muzzleloader" | "shotgun" | "crossbow" | "";
export type PlannerResidency = "resident" | "nonresident";

export const HUNT_STATUSES: readonly HuntStatus[] = ["planning", "applied", "drawn", "alternate", "not-drawn", "tag-purchased", "hunted"];
/** How the hunt is obtained: an agency draw hunt, a general/over-the-counter license, or one the member described. */
export type PlanKind = "draw" | "otc" | "custom";
export const PLAN_KINDS: readonly PlanKind[] = ["draw", "otc", "custom"];
/** What an agency date is for (same values as KeyDate.kind in src/data/agency/schema.ts). */
export type AgencyDateKind = "application" | "application-change" | "results" | "payment" | "surrender" | "points" | "leftover" | "license-sale" | "other";
export const AGENCY_DATE_KINDS: readonly AgencyDateKind[] = ["application", "application-change", "results", "payment", "surrender", "points", "leftover", "license-sale", "other"];
export type DrawingSeason = "spring" | "fall";
const SEASONS: readonly PlannerSeason[] = ["rifle", "archery", "muzzleloader", "shotgun", "crossbow", ""];
const SPECIES = ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "bear", "sheep", "goat", "lion", "turkey"] as const;
export type PlannerSpecies = (typeof SPECIES)[number];

/** The agency's application date an entry was matched to, copied from draw-meta keyDates. */
export interface AgencyDeadline {
  /** Key-date label exactly as the agency data has it. */
  label: string;
  date?: string;
  start?: string;
  /** Window end or the single date (YYYY-MM-DD). */
  end: string;
  /** License/hunt year the date belongs to. */
  cycle: number;
  status: "confirmed" | "tentative";
  note?: string;
  sourceUrl: string;
  sourceTitle?: string;
}

/** One fee line from draw-meta fees, for the entry's species (or all species) and residency. */
export interface AgencyFee {
  item: string;
  amountUsd: number;
  licenseYear: number;
  note?: string;
  /** False for fees the agency lists for every species (application fee, base license). */
  speciesSpecific: boolean;
  /** "" on v2 entries, which point at agency.links by `src` instead. Read through linkOf(). */
  sourceUrl: string;
  src?: number;
}

/** One agency key date for the hunt's species and residency, copied from draw-meta keyDates. */
export interface AgencyDate {
  kind: AgencyDateKind;
  label: string;
  date?: string;
  start?: string;
  /** Window end or the single date (YYYY-MM-DD). */
  end: string;
  cycle: number;
  status: "confirmed" | "tentative";
  residency?: PlannerResidency;
  note?: string;
  /** Index into the entry's agency.links (source document). See linkOf(). */
  src?: number;
}

/**
 * One stretch of season. scope: "hunt" = the agency's dates for this hunt (its
 * row or a season entry naming its hunt code); "units" = a season entry for the
 * hunt's units; "statewide" = the species' standard/statewide season, not
 * specific to this hunt.
 */
export interface AgencySeason {
  label: string;
  start: string;
  end: string;
  year: number;
  scope: "hunt" | "units" | "statewide";
  note?: string;
  /** Index into the entry's agency.links. */
  src?: number;
}

/** Facts copied from the agency's data by the server when the entry was planned or last refreshed. */
export interface AgencyRef {
  stateSlug: string;
  agencyName: string;
  agencyShortName: string;
  unitTerm: string;
  huntCode: string;
  units: string[];
  description: string;
  residency: PlannerResidency;
  /** Draw year of the row the entry was added from (the "last year" figures). */
  drawYear: number;
  /** Next agency application date for the species and residency, or null when none is published yet. */
  deadline: AgencyDeadline | null;
  fees: AgencyFee[];
  /** Last draw's figures for this hunt, written from the row (e.g. "2025 draw, residents: 8 of 173 ..."). */
  oddsNote: string;
  sourceUrl: string;
  sourceTitle?: string;
  addedAt: string;
  // ---- v2 (all optional so v1 entries load unchanged) ----
  /** draw (a hunt code from the draw table), otc (general/OTC license) or custom. v1 entries are draw. */
  kind?: PlanKind;
  /** The cycle being planned: the soonest one whose dates haven't all passed; null when the agency has published no dates. */
  planCycle?: number | null;
  /** Cycle the keyDates belong to. Lower than planCycle when the agency hasn't published planCycle yet. */
  datesCycle?: number | null;
  /** True when keyDates are the agency's published dates for planCycle. */
  cyclePublished?: boolean;
  keyDates?: AgencyDate[];
  seasons?: AgencySeason[];
  /** Source documents keyDates and seasons point at (by `src`), each listed once to keep entries small. */
  links?: string[];
  /** Season dates exactly as the agency prints them for the hunt, when that's all there is. */
  seasonText?: string;
  /** Year of `seasons` / `seasonText`. */
  seasonYear?: number | null;
  drawSystem?: string;
  drawSummary?: string;
  pointName?: string;
  pointsMatter?: boolean;
  /** The agency's note for the entry's residency. */
  residencyNote?: string;
  otcSummary?: string;
  /** Requirements the agency notes for the species (hunter education, required courses, qualifying license...), as written. */
  requirements?: string[];
  method?: string;
  sex?: string;
  /** Lowest points drawn in drawYear for the residency, when the agency publishes it. */
  minPoints?: number | null;
  /** Draw odds in percent for the residency in drawYear. */
  oddsPct?: number | null;
  refreshedAt?: string;
}

/** A checklist item the member added to one hunt. */
export interface HuntTask {
  id: string;
  label: string;
  done: boolean;
}

/** A date the member added to one hunt (YYYY-MM-DD; `end` for a span). */
export interface CustomDate {
  id: string;
  label: string;
  date: string;
  end?: string;
}

export interface PlannedHunt {
  id: string;
  /** State name, e.g. "Colorado". */
  state: string;
  species: PlannerSpecies;
  unit: string;
  season: PlannerSeason;
  preferencePointsNeeded: number;
  preferencePointsOwned: number;
  /** YYYY-MM-DD, or "" when unknown. For agency entries, the agency deadline's end. */
  applicationDeadline: string;
  seasonDates: string;
  status: HuntStatus;
  notes: string;
  /** Present only on entries added from agency data. */
  agency?: AgencyRef;
  /** ISO time of the last change, used to pick a side when two devices edited the same entry. */
  updatedAt?: string;
  // ---- v2 member fields ----
  /** Which drawing the member said the hunt is in, when the agency runs separate spring and fall draws and the hunt doesn't say. */
  drawing?: DrawingSeason;
  /** Keys of the agency-derived checklist steps the member ticked (see huntSteps in planner-timeline.ts). */
  stepsDone?: string[];
  /** The member's own checklist items for this hunt. */
  tasks?: HuntTask[];
  /** The member's own dates for this hunt. */
  customDates?: CustomDate[];
}

export interface BudgetItem {
  id: string;
  /** "" = general (not tied to a hunt). */
  huntId: string;
  category: string;
  description: string;
  amount: number;
  /** Set when the line was copied from an agency fee table. */
  licenseYear?: number;
  sourceUrl?: string;
}

export interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  checked: boolean;
  custom: boolean;
}

export interface PlannerData {
  hunts: PlannedHunt[];
  budget: BudgetItem[];
  checklist: ChecklistItem[];
  /** Ids removed on some device, so a merge doesn't bring them back. Newest last. */
  deleted: string[];
}

/** What is stored per member. `version` increases by one on every write. */
export interface PlannerDoc {
  schema: typeof PLANNER_SCHEMA;
  version: number;
  updatedAt: string | null;
  data: PlannerData;
}

export const PLANNER_SCHEMA = 2;
/** Older schemas sanitizePlannerDoc can still read (migrated on load). */
export const PLANNER_SCHEMAS_READ: readonly number[] = [1, 2];
/** Largest stored planner document, in bytes of JSON. */
export const MAX_PLANNER_BYTES = 200 * 1024;
export const PLANNER_LIMITS = {
  hunts: 150,
  budget: 600,
  checklist: 300,
  deleted: 600,
  fees: 12,
  units: 60,
  keyDates: 30,
  seasons: 16,
  requirements: 4,
  tasks: 30,
  customDates: 20,
  steps: 30,
  links: 12,
  text: 2000,
  label: 300,
  short: 120,
} as const;

export const EMPTY_PLANNER: PlannerData = { hunts: [], budget: [], checklist: [], deleted: [] };

export function emptyDoc(): PlannerDoc {
  return { schema: PLANNER_SCHEMA, version: 0, updatedAt: null, data: { hunts: [], budget: [], checklist: [], deleted: [] } };
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{1,64}$/;

function str(v: unknown, max: number, collapse = true): string {
  if (typeof v !== "string") return "";
  const s = collapse ? v.replace(/\s+/g, " ").trim() : v.replace(/\r\n?/g, "\n").trim();
  return s.slice(0, max);
}
function optStr(v: unknown, max: number): string | undefined {
  const s = str(v, max);
  return s ? s : undefined;
}
function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}
function int(v: unknown, min: number, max: number, fallback: number): number {
  const n = num(v, min, max);
  return n === null ? fallback : Math.round(n);
}
function isoDay(v: unknown): string {
  return typeof v === "string" && ISO_DAY.test(v) ? v : "";
}
function isoTime(v: unknown): string | undefined {
  return typeof v === "string" && v.length <= 40 && !Number.isNaN(Date.parse(v)) ? v : undefined;
}
function httpUrl(v: unknown): string {
  if (typeof v !== "string" || v.length > 1000) return "";
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : "";
  } catch {
    return "";
  }
}
function id(v: unknown): string | null {
  return typeof v === "string" && ID.test(v) ? v : null;
}

function sanitizeDeadline(v: unknown): AgencyDeadline | null {
  if (!isObj(v)) return null;
  const end = isoDay(v.end);
  const label = str(v.label, PLANNER_LIMITS.label);
  const cycle = int(v.cycle, 1990, 2100, 0);
  if (!end || !label || !cycle) return null;
  const date = isoDay(v.date);
  const start = isoDay(v.start);
  return {
    label,
    ...(date ? { date } : {}),
    ...(start ? { start } : {}),
    end,
    cycle,
    status: v.status === "tentative" ? "tentative" : "confirmed",
    ...(optStr(v.note, PLANNER_LIMITS.label) ? { note: optStr(v.note, PLANNER_LIMITS.label) } : {}),
    sourceUrl: httpUrl(v.sourceUrl),
    ...(optStr(v.sourceTitle, PLANNER_LIMITS.label) ? { sourceTitle: optStr(v.sourceTitle, PLANNER_LIMITS.label) } : {}),
  };
}

function sanitizeFee(v: unknown): AgencyFee | null {
  if (!isObj(v)) return null;
  const item = str(v.item, PLANNER_LIMITS.label);
  const amountUsd = num(v.amountUsd, 0, 1_000_000);
  const licenseYear = int(v.licenseYear, 1990, 2100, 0);
  if (!item || amountUsd === null || !licenseYear) return null;
  const note = optStr(v.note, PLANNER_LIMITS.label);
  const src = srcIndex(v.src);
  return { item, amountUsd, licenseYear, ...(note ? { note } : {}), speciesSpecific: v.speciesSpecific !== false, sourceUrl: httpUrl(v.sourceUrl), ...(src !== null ? { src } : {}) };
}

function sanitizeAgencyDate(v: unknown): AgencyDate | null {
  if (!isObj(v)) return null;
  const end = isoDay(v.end);
  const label = str(v.label, PLANNER_LIMITS.label);
  const cycle = int(v.cycle, 1990, 2100, 0);
  if (!end || !label || !cycle) return null;
  const date = isoDay(v.date);
  const start = isoDay(v.start);
  const note = optStr(v.note, PLANNER_LIMITS.label);
  const src = srcIndex(v.src);
  return {
    kind: AGENCY_DATE_KINDS.find((k) => k === v.kind) ?? "other",
    label,
    ...(date ? { date } : {}),
    ...(start && start <= end ? { start } : {}),
    end,
    cycle,
    status: v.status === "tentative" ? "tentative" : "confirmed",
    ...(v.residency === "resident" || v.residency === "nonresident" ? { residency: v.residency } : {}),
    ...(note ? { note } : {}),
    ...(src !== null ? { src } : {}),
  };
}

const srcIndex = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < PLANNER_LIMITS.links ? v : null);

function sanitizeSeason(v: unknown): AgencySeason | null {
  if (!isObj(v)) return null;
  const start = isoDay(v.start);
  const end = isoDay(v.end);
  const year = int(v.year, 1990, 2100, 0);
  if (!start || !end || start > end || !year) return null;
  const note = optStr(v.note, PLANNER_LIMITS.label);
  const src = srcIndex(v.src);
  return {
    label: str(v.label, PLANNER_LIMITS.label),
    start,
    end,
    year,
    scope: v.scope === "hunt" || v.scope === "units" ? v.scope : "statewide",
    ...(note ? { note } : {}),
    ...(src !== null ? { src } : {}),
  };
}

const list = <T>(v: unknown, fn: (x: unknown) => T | null, max: number): T[] =>
  Array.isArray(v) ? v.slice(0, max * 2).map(fn).filter((x): x is T => x !== null).slice(0, max) : [];
const optYear = (v: unknown) => (v === null || v === undefined ? null : int(v, 1990, 2100, 0) || null);
const optCount = (v: unknown, max: number) => (v === null || v === undefined ? null : num(v, 0, max));

/** An agency block exactly as it will be stored (strings trimmed and capped), for comparing a fresh build with a saved one. */
export function sanitizeAgencyRef(v: unknown): AgencyRef | undefined {
  return sanitizeAgency(v);
}

function sanitizeAgency(v: unknown): AgencyRef | undefined {
  if (!isObj(v)) return undefined;
  const stateSlug = str(v.stateSlug, 40);
  const kind: PlanKind = PLAN_KINDS.find((k) => k === v.kind) ?? "draw";
  const huntCode = str(v.huntCode, PLANNER_LIMITS.short);
  const drawYear = int(v.drawYear, 1990, 2100, 0);
  // Draw entries are tied to one hunt code and draw year; general/OTC and custom entries have neither.
  if (!/^[a-z-]{2,40}$/.test(stateSlug) || (kind === "draw" && (!huntCode || !drawYear))) return undefined;
  const units = Array.isArray(v.units)
    ? v.units.map((u) => str(u, 40)).filter(Boolean).slice(0, PLANNER_LIMITS.units)
    : [];
  const fees = Array.isArray(v.fees) ? v.fees.map(sanitizeFee).filter((f): f is AgencyFee => !!f).slice(0, PLANNER_LIMITS.fees) : [];
  const sourceTitle = optStr(v.sourceTitle, PLANNER_LIMITS.label);
  const out: AgencyRef = {
    stateSlug,
    agencyName: str(v.agencyName, PLANNER_LIMITS.short),
    agencyShortName: str(v.agencyShortName, 40),
    unitTerm: str(v.unitTerm, 40) || "Unit",
    huntCode,
    units,
    description: str(v.description, 600),
    residency: v.residency === "nonresident" ? "nonresident" : "resident",
    drawYear,
    deadline: sanitizeDeadline(v.deadline),
    fees,
    oddsNote: str(v.oddsNote, 600),
    sourceUrl: httpUrl(v.sourceUrl),
    ...(sourceTitle ? { sourceTitle } : {}),
    addedAt: isoTime(v.addedAt) || new Date(0).toISOString(),
  };
  // v2 fields: only written when present, so a v1 entry round-trips exactly.
  if (v.kind !== undefined) out.kind = kind;
  if (v.planCycle !== undefined) out.planCycle = optYear(v.planCycle);
  if (v.datesCycle !== undefined) out.datesCycle = optYear(v.datesCycle);
  if (v.cyclePublished !== undefined) out.cyclePublished = v.cyclePublished === true;
  if (v.keyDates !== undefined) out.keyDates = list(v.keyDates, sanitizeAgencyDate, PLANNER_LIMITS.keyDates);
  if (v.seasons !== undefined) out.seasons = list(v.seasons, sanitizeSeason, PLANNER_LIMITS.seasons);
  if (v.links !== undefined) out.links = Array.isArray(v.links) ? v.links.slice(0, PLANNER_LIMITS.links).map(httpUrl) : [];
  if (v.seasonYear !== undefined) out.seasonYear = optYear(v.seasonYear);
  if (v.pointsMatter !== undefined) out.pointsMatter = v.pointsMatter === true;
  if (v.requirements !== undefined) out.requirements = list(v.requirements, (x) => str(x, 400) || null, PLANNER_LIMITS.requirements);
  if (v.minPoints !== undefined) out.minPoints = optCount(v.minPoints, 99);
  if (v.oddsPct !== undefined) out.oddsPct = optCount(v.oddsPct, 100);
  for (const [k, max] of [
    ["seasonText", 200],
    ["drawSystem", 60],
    ["drawSummary", 900],
    ["pointName", PLANNER_LIMITS.short],
    ["residencyNote", 900],
    ["otcSummary", 900],
    ["method", 40],
    ["sex", 20],
  ] as const) {
    const x = optStr(v[k], max);
    if (x) out[k] = x;
  }
  const refreshedAt = isoTime(v.refreshedAt);
  if (refreshedAt) out.refreshedAt = refreshedAt;
  return out;
}

function sanitizeTask(v: unknown): HuntTask | null {
  if (!isObj(v)) return null;
  const tid = id(v.id);
  const label = str(v.label, 160);
  return tid && label ? { id: tid, label, done: v.done === true } : null;
}

function sanitizeCustomDate(v: unknown): CustomDate | null {
  if (!isObj(v)) return null;
  const cid = id(v.id);
  const label = str(v.label, 160);
  const date = isoDay(v.date);
  if (!cid || !label || !date) return null;
  const end = isoDay(v.end);
  return { id: cid, label, date, ...(end && end > date ? { end } : {}) };
}

function sanitizeHunt(v: unknown): PlannedHunt | null {
  if (!isObj(v)) return null;
  const hid = id(v.id);
  const species = SPECIES.find((s) => s === v.species);
  if (!hid || !species) return null;
  const agency = sanitizeAgency(v.agency);
  const state = str(v.state, 60);
  const unit = str(v.unit, 200);
  if (!state && !agency) return null;
  const season = SEASONS.find((s) => s === v.season) ?? "";
  const status = HUNT_STATUSES.find((s) => s === v.status) ?? "planning";
  const updatedAt = isoTime(v.updatedAt);
  const out: PlannedHunt = {
    id: hid,
    state: state || agency!.stateSlug,
    species,
    unit,
    season,
    preferencePointsNeeded: int(v.preferencePointsNeeded, 0, 99, 0),
    preferencePointsOwned: int(v.preferencePointsOwned, 0, 99, 0),
    applicationDeadline: agency?.deadline ? agency.deadline.end : isoDay(v.applicationDeadline),
    seasonDates: str(v.seasonDates, 200),
    status,
    notes: str(v.notes, PLANNER_LIMITS.text, false),
    ...(agency ? { agency } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  };
  if (v.drawing === "spring" || v.drawing === "fall") out.drawing = v.drawing;
  if (v.stepsDone !== undefined) {
    out.stepsDone = Array.from(new Set(list(v.stepsDone, (x) => (typeof x === "string" && /^[a-z0-9:-]{1,64}$/.test(x) ? x : null), PLANNER_LIMITS.steps)));
  }
  if (v.tasks !== undefined) out.tasks = uniqueById(list(v.tasks, sanitizeTask, PLANNER_LIMITS.tasks));
  if (v.customDates !== undefined) out.customDates = uniqueById(list(v.customDates, sanitizeCustomDate, PLANNER_LIMITS.customDates));
  return out;
}

function sanitizeBudget(v: unknown): BudgetItem | null {
  if (!isObj(v)) return null;
  const bid = id(v.id);
  const amount = num(v.amount, -1_000_000, 1_000_000);
  const description = str(v.description, PLANNER_LIMITS.label);
  if (!bid || amount === null || !description) return null;
  const huntId = id(v.huntId) || "";
  const licenseYear = v.licenseYear === undefined ? 0 : int(v.licenseYear, 1990, 2100, 0);
  const sourceUrl = httpUrl(v.sourceUrl);
  return {
    id: bid,
    huntId,
    category: str(v.category, 40) || "Other",
    description,
    amount: Math.round(amount * 100) / 100,
    ...(licenseYear ? { licenseYear } : {}),
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}

function sanitizeChecklist(v: unknown): ChecklistItem | null {
  if (!isObj(v)) return null;
  const cid = id(v.id);
  const label = str(v.label, 160);
  if (!cid || !label) return null;
  return { id: cid, category: str(v.category, 60) || "Other", label, checked: v.checked === true, custom: v.custom === true };
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

/**
 * Validate + normalize untrusted planner data (an API body, localStorage, an
 * imported file, or the older browser-only format without `deleted`). Invalid
 * entries are dropped, strings trimmed and capped, lists capped. Returns null
 * when the input isn't planner-shaped at all.
 */
export function sanitizePlannerData(raw: unknown): PlannerData | null {
  if (!isObj(raw)) return null;
  const lists = ["hunts", "budget", "checklist"] as const;
  for (const k of lists) if (raw[k] !== undefined && !Array.isArray(raw[k])) return null;
  if (lists.every((k) => raw[k] === undefined)) return null;
  const arr = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]) : []);
  const hunts = uniqueById(arr("hunts").map(sanitizeHunt).filter((h): h is PlannedHunt => !!h)).slice(0, PLANNER_LIMITS.hunts);
  const budget = uniqueById(arr("budget").map(sanitizeBudget).filter((b): b is BudgetItem => !!b)).slice(0, PLANNER_LIMITS.budget);
  const checklist = uniqueById(arr("checklist").map(sanitizeChecklist).filter((c): c is ChecklistItem => !!c)).slice(0, PLANNER_LIMITS.checklist);
  const deleted = Array.from(new Set(arr("deleted").map(id).filter((x): x is string => !!x))).slice(-PLANNER_LIMITS.deleted);
  return { hunts, budget, checklist, deleted };
}

/**
 * A stored document as the current schema, or null when it isn't one (corrupt or
 * an unknown schema). Older schemas are migrated: see migratePlannerData.
 */
export function sanitizePlannerDoc(raw: unknown): PlannerDoc | null {
  if (!isObj(raw) || typeof raw.schema !== "number" || !PLANNER_SCHEMAS_READ.includes(raw.schema)) return null;
  const version = raw.version;
  const data = sanitizePlannerData(migratePlannerData(raw.data, raw.schema));
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0 || !data) return null;
  return { schema: PLANNER_SCHEMA, version, updatedAt: isoTime(raw.updatedAt) ?? null, data };
}

/**
 * Upgrade stored planner data from `fromSchema` to the current schema.
 * v1 -> v2: nothing to rewrite. Every v2 field is optional (agency blocks
 * without keyDates are read through their v1 `deadline`; see agencyDatesOf in
 * planner-timeline.ts), so the member's hunts, statuses, notes, points, budget
 * and checklist come through exactly as saved.
 */
export function migratePlannerData(data: unknown, fromSchema: number): unknown {
  // Later migrations chain here, e.g. `if (fromSchema < 3) data = v2to3(data);`.
  return fromSchema <= PLANNER_SCHEMA ? data : null;
}

/** Bytes of the JSON a document serializes to. */
export function docBytes(doc: PlannerDoc): number {
  return new TextEncoder().encode(JSON.stringify(doc)).length;
}

/** Source link of an agency date or season: its entry in agency.links, else the entry's main source. */
export function linkOf(a: Pick<AgencyRef, "links" | "sourceUrl">, item: { src?: number; sourceUrl?: string }): string {
  return item.sourceUrl || (item.src !== undefined && a.links?.[item.src]) || a.sourceUrl;
}

// ------------------------------------------------------------
// Duplicates and merging
// ------------------------------------------------------------

/**
 * Two agency entries are the same planned hunt when they share state and hunt
 * code and plan for the same application cycle. An entry without a published
 * deadline (cycle unknown) matches any cycle, so adding the same hunt code
 * from another draw year doesn't create a second entry.
 */
export function sameAgencyHunt(a: AgencyRef, b: AgencyRef): boolean {
  if (a.stateSlug !== b.stateSlug) return false;
  const ka = a.kind ?? "draw";
  const kb = b.kind ?? "draw";
  // Custom entries are whatever the member described: never collapsed. General/OTC entries are
  // matched by species (in sameHunt below), residency and cycle.
  if (ka !== kb || ka === "custom") return false;
  if (ka === "otc" && a.residency !== b.residency) return false;
  if (a.huntCode.trim().toUpperCase() !== b.huntCode.trim().toUpperCase()) return false;
  const ca = a.planCycle ?? a.deadline?.cycle ?? null;
  const cb = b.planCycle ?? b.deadline?.cycle ?? null;
  return ca === null || cb === null || ca === cb;
}

function sameHunt(a: PlannedHunt, b: PlannedHunt): boolean {
  return !!a.agency && !!b.agency && (a.agency.kind !== "otc" || a.species === b.species) && sameAgencyHunt(a.agency, b.agency);
}

/** The existing entry that `candidate` would duplicate, if any. */
export function findAgencyDuplicate(hunts: readonly PlannedHunt[], agency: AgencyRef, species?: PlannerSpecies): PlannedHunt | undefined {
  return hunts.find((h) => h.agency && sameAgencyHunt(h.agency, agency) && (agency.kind !== "otc" || !species || h.species === species));
}

const manualKey = (h: PlannedHunt) =>
  [h.state, h.species, h.unit, h.season, h.applicationDeadline, h.seasonDates, h.notes].join("\u0000").toLowerCase();
const budgetKey = (b: BudgetItem) => [b.huntId, b.category, b.description, b.amount, b.licenseYear ?? ""].join("\u0000").toLowerCase();
const checklistKey = (c: ChecklistItem) => `${c.category}\u0000${c.label}`.toLowerCase();

/**
 * Merge two copies of a planner (e.g. the account copy and this browser's copy).
 * - Items are matched by id; when both sides have one, the newer `updatedAt`
 *   wins for hunts, otherwise the `prefer` side.
 * - Anything either side deleted stays deleted.
 * - Duplicate agency entries (same state + hunt code + cycle), identical manual
 *   entries, identical budget lines and same-named checklist items collapse to
 *   one; budget lines follow the hunt they were attached to.
 */
export function mergePlanners(a: PlannerData, b: PlannerData, prefer: "a" | "b" = "a"): PlannerData {
  const deleted = Array.from(new Set([...a.deleted, ...b.deleted])).slice(-PLANNER_LIMITS.deleted);
  const gone = new Set(deleted);
  const [first, second] = prefer === "a" ? [a, b] : [b, a];

  // Hunts by id.
  const huntsById = new Map<string, PlannedHunt>();
  const order: string[] = [];
  for (const h of [...a.hunts, ...b.hunts]) if (!order.includes(h.id)) order.push(h.id);
  for (const h of second.hunts) huntsById.set(h.id, h);
  for (const h of first.hunts) {
    const other = huntsById.get(h.id);
    if (other && other.updatedAt && h.updatedAt && other.updatedAt > h.updatedAt) continue;
    huntsById.set(h.id, h);
  }
  // Collapse duplicates; remember which id each dropped one became.
  const alias = new Map<string, string>();
  const hunts: PlannedHunt[] = [];
  const manualSeen = new Map<string, string>();
  for (const hid of order) {
    const h = huntsById.get(hid);
    if (!h || gone.has(hid)) continue;
    if (h.agency) {
      const dup = hunts.find((x) => sameHunt(x, h));
      if (dup) {
        alias.set(hid, dup.id);
        continue;
      }
    } else {
      const k = manualKey(h);
      const dup = manualSeen.get(k);
      if (dup) {
        alias.set(hid, dup);
        continue;
      }
      manualSeen.set(k, hid);
    }
    hunts.push(h);
  }
  const huntIds = new Set(hunts.map((h) => h.id));

  // Budget by id, re-pointed at surviving hunts; lines for removed hunts go too.
  const budgetById = new Map<string, BudgetItem>();
  for (const x of second.budget) budgetById.set(x.id, x);
  for (const x of first.budget) budgetById.set(x.id, x);
  const budgetOrder = uniqueById([...a.budget, ...b.budget]).map((x) => x.id);
  const budget: BudgetItem[] = [];
  const budgetSeen = new Set<string>();
  for (const bid of budgetOrder) {
    const x0 = budgetById.get(bid);
    if (!x0 || gone.has(bid)) continue;
    const huntId = x0.huntId ? alias.get(x0.huntId) || x0.huntId : "";
    if (huntId && !huntIds.has(huntId)) continue;
    const x = huntId === x0.huntId ? x0 : { ...x0, huntId };
    const k = budgetKey(x);
    if (budgetSeen.has(k)) continue;
    budgetSeen.add(k);
    budget.push(x);
  }

  // Checklist by id, then by name; an item is checked if either copy checked it.
  const checkById = new Map<string, ChecklistItem>();
  for (const x of second.checklist) checkById.set(x.id, x);
  for (const x of first.checklist) checkById.set(x.id, x);
  const checklist: ChecklistItem[] = [];
  const byName = new Map<string, number>();
  for (const cid of uniqueById([...a.checklist, ...b.checklist]).map((x) => x.id)) {
    const x = checkById.get(cid);
    if (!x || gone.has(cid)) continue;
    const k = checklistKey(x);
    const at = byName.get(k);
    if (at !== undefined) {
      if (x.checked && !checklist[at].checked) checklist[at] = { ...checklist[at], checked: true };
      continue;
    }
    byName.set(k, checklist.length);
    checklist.push(x);
  }

  return {
    hunts: hunts.slice(0, PLANNER_LIMITS.hunts),
    budget: budget.slice(0, PLANNER_LIMITS.budget),
    checklist: checklist.slice(0, PLANNER_LIMITS.checklist),
    deleted,
  };
}

/** Same content, ignoring key order. */
export function samePlanner(a: PlannerData, b: PlannerData): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (isObj(v)) {
    const out: Obj = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = canonical(v[k]);
    return out;
  }
  return v;
}

/** Whether a planner has anything the member entered (the default checklist alone doesn't count). */
export function hasPlannerContent(d: PlannerData): boolean {
  return d.hunts.length > 0 || d.budget.length > 0 || d.checklist.some((c) => c.checked || c.custom);
}

// ------------------------------------------------------------
// Deadlines
// ------------------------------------------------------------

export interface PlannerDeadline {
  hunt: PlannedHunt;
  /** Window end or single date. */
  end: string;
  start?: string;
  label: string;
  fromAgency: boolean;
}

/** Every entry with a deadline, soonest first (agency entries use the agency's date). */
export function deadlinesOf(hunts: readonly PlannedHunt[]): PlannerDeadline[] {
  const out: PlannerDeadline[] = [];
  for (const h of hunts) {
    const d = h.agency?.deadline;
    if (d) out.push({ hunt: h, end: d.end, ...(d.start ? { start: d.start } : {}), label: d.label, fromAgency: true });
    else if (ISO_DAY.test(h.applicationDeadline)) out.push({ hunt: h, end: h.applicationDeadline, label: "Application deadline (you entered)", fromAgency: false });
  }
  return out.sort((x, y) => x.end.localeCompare(y.end) || x.hunt.state.localeCompare(y.hunt.state) || x.hunt.id.localeCompare(y.hunt.id));
}

/** The soonest deadline that is today or later. */
export function nextDeadline(hunts: readonly PlannedHunt[], today: string): PlannerDeadline | undefined {
  return deadlinesOf(hunts).find((d) => d.end >= today);
}
