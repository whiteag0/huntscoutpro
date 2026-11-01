// Shared (client + server) shape of a member's Hunt Planner, plus validation and
// merging. Pure functions only (no I/O) so they can be unit tested: `npm test`.
//
// Entries added from agency data carry an `agency` block whose deadline, fees and
// odds note were copied from the agency's published rows (src/lib/planner-agency.ts).
// Manual entries hold only what the member typed.

export type HuntStatus = "planning" | "applied" | "drawn" | "alternate" | "not-drawn";
export type PlannerSeason = "rifle" | "archery" | "muzzleloader" | "shotgun" | "crossbow" | "";
export type PlannerResidency = "resident" | "nonresident";

export const HUNT_STATUSES: readonly HuntStatus[] = ["planning", "applied", "drawn", "alternate", "not-drawn"];
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
  sourceUrl: string;
}

/** Facts copied from one agency draw row and the state's meta when the entry was added. */
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

export const PLANNER_SCHEMA = 1;
/** Largest stored planner document, in bytes of JSON. */
export const MAX_PLANNER_BYTES = 200 * 1024;
export const PLANNER_LIMITS = {
  hunts: 150,
  budget: 600,
  checklist: 300,
  deleted: 600,
  fees: 12,
  units: 60,
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
  return { item, amountUsd, licenseYear, ...(note ? { note } : {}), speciesSpecific: v.speciesSpecific !== false, sourceUrl: httpUrl(v.sourceUrl) };
}

function sanitizeAgency(v: unknown): AgencyRef | undefined {
  if (!isObj(v)) return undefined;
  const stateSlug = str(v.stateSlug, 40);
  const huntCode = str(v.huntCode, PLANNER_LIMITS.short);
  const drawYear = int(v.drawYear, 1990, 2100, 0);
  if (!/^[a-z-]{2,40}$/.test(stateSlug) || !huntCode || !drawYear) return undefined;
  const units = Array.isArray(v.units)
    ? v.units.map((u) => str(u, 40)).filter(Boolean).slice(0, PLANNER_LIMITS.units)
    : [];
  const fees = Array.isArray(v.fees) ? v.fees.map(sanitizeFee).filter((f): f is AgencyFee => !!f).slice(0, PLANNER_LIMITS.fees) : [];
  const sourceTitle = optStr(v.sourceTitle, PLANNER_LIMITS.label);
  return {
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
  return {
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

/** A stored document, or null when it isn't one (corrupt or a different schema). */
export function sanitizePlannerDoc(raw: unknown): PlannerDoc | null {
  if (!isObj(raw) || raw.schema !== PLANNER_SCHEMA) return null;
  const version = raw.version;
  const data = sanitizePlannerData(raw.data);
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0 || !data) return null;
  return { schema: PLANNER_SCHEMA, version, updatedAt: isoTime(raw.updatedAt) ?? null, data };
}

/** Bytes of the JSON a document serializes to. */
export function docBytes(doc: PlannerDoc): number {
  return new TextEncoder().encode(JSON.stringify(doc)).length;
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
  if (a.huntCode.trim().toUpperCase() !== b.huntCode.trim().toUpperCase()) return false;
  const ca = a.deadline?.cycle ?? null;
  const cb = b.deadline?.cycle ?? null;
  return ca === null || cb === null || ca === cb;
}

/** The existing entry that `agency` would duplicate, if any. */
export function findAgencyDuplicate(hunts: readonly PlannedHunt[], agency: AgencyRef): PlannedHunt | undefined {
  return hunts.find((h) => h.agency && sameAgencyHunt(h.agency, agency));
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
      const dup = hunts.find((x) => x.agency && sameAgencyHunt(x.agency, h.agency!));
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
