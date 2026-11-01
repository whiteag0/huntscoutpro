import "server-only";
// Server side of planning a hunt: everything in an entry's agency block comes
// from the server's own agency data (src/lib/agency.ts), looked up by
// state / species / hunt code / draw year. Nothing the browser sends about the
// hunt (dates, fees, odds) is trusted; it only says which hunt.

import { getStateData, readTable, type StateData } from "@/lib/agency";
import type { DrawRecord, SpeciesInfo } from "@/data/agency/schema";
import { buildPlannedHunt, huntResidencyOnly, planAgency } from "@/lib/planner-agency";
import { PLAN_KINDS, sanitizeAgencyRef, type AgencyRef, type DrawingSeason, type PlanKind, type PlannedHunt, type PlannerResidency } from "@/lib/planner-schema";

export interface PlanRequest {
  state: string;
  species: string;
  residency: PlannerResidency;
  kind: PlanKind;
  huntCode?: string;
  drawYear?: number;
  drawing?: DrawingSeason | null;
  /** Custom hunts: the member's description and unit text. */
  description?: string;
  unit?: string;
  pointsOwned?: number;
  notes?: string;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * Which hunt to plan, from a request body. Also accepts the v1 "Add to my
 * planner" body ({ state, species, residency, row }), of which only the row's
 * hunt code and year are used.
 */
export function parsePlanRequest(raw: unknown): PlanRequest | null {
  if (!isObj(raw)) return null;
  const state = typeof raw.state === "string" && /^[a-z-]{2,40}$/.test(raw.state) ? raw.state : "";
  const species = typeof raw.species === "string" && /^[a-z-]{2,20}$/.test(raw.species) ? raw.species : "";
  const residency = raw.residency === "resident" || raw.residency === "nonresident" ? raw.residency : null;
  if (!state || !species || !residency) return null;
  const row = isObj(raw.row) ? raw.row : null;
  const kind: PlanKind = row ? "draw" : (PLAN_KINDS.find((k) => k === raw.kind) ?? "draw");
  const huntCode = text(row ? row.huntCode : raw.huntCode, 120);
  const yearRaw = row ? row.year : raw.drawYear;
  const drawYear = typeof yearRaw === "number" && Number.isInteger(yearRaw) && yearRaw >= 1990 && yearRaw <= 2100 ? yearRaw : undefined;
  if (kind === "draw" && !huntCode) return null;
  const points = typeof raw.pointsOwned === "number" && Number.isFinite(raw.pointsOwned) ? Math.max(0, Math.min(99, Math.round(raw.pointsOwned))) : undefined;
  return {
    state,
    species,
    residency,
    kind,
    ...(kind === "draw" ? { huntCode } : {}),
    ...(kind === "draw" && drawYear ? { drawYear } : {}),
    drawing: raw.drawing === "spring" || raw.drawing === "fall" ? raw.drawing : null,
    ...(kind === "custom" ? { description: text(raw.description, 600), unit: text(raw.unit, 200) } : {}),
    ...(points !== undefined ? { pointsOwned: points } : {}),
    ...(typeof raw.notes === "string" ? { notes: raw.notes.replace(/\r\n?/g, "\n").trim().slice(0, 2000) } : {}),
  };
}

/** Draw tables parsed during one request, so refreshing several hunts reads each table once. */
export type RowCache = Map<string, Promise<DrawRecord[]>>;

function drawRows(slug: string, species: SpeciesInfo["species"], cache?: RowCache): Promise<DrawRecord[]> {
  const k = `${slug}|${species}`;
  let p = cache?.get(k);
  if (!p) {
    p = readTable<DrawRecord>(slug, "draw", species);
    cache?.set(k, p);
  }
  return p;
}

/** The agency's row for a hunt code: that draw year's when given and published, else the latest year's. */
export async function findDrawRow(slug: string, species: SpeciesInfo["species"], huntCode: string, year?: number, cache?: RowCache): Promise<DrawRecord | null> {
  const code = huntCode.trim().toUpperCase();
  const rows = (await drawRows(slug, species, cache)).filter((r) => r.huntCode.trim().toUpperCase() === code);
  if (!rows.length) return null;
  if (year) {
    const exact = rows.find((r) => r.year === year);
    if (exact) return exact;
  }
  return rows.reduce((best, r) => (r.year > best.year ? r : best), rows[0]);
}

export type PlanOutcome =
  | { ok: true; hunt: PlannedHunt; needsDrawing: boolean; state: StateData; info: SpeciesInfo }
  | { ok: false; status: number; error: string };

/** A planner entry for the request, built from the server's agency data. */
export async function assemblePlan(req: PlanRequest, today: string, now: string, id: string, cache?: RowCache): Promise<PlanOutcome> {
  const st = await getStateData(req.state);
  const info = st?.species.find((s) => s.species === req.species && s.drawSystem !== "none");
  if (!st || !info) return { ok: false, status: 400, error: "We don't have agency data for that state and species." };
  let row: DrawRecord | null = null;
  if (req.kind === "draw") {
    row = await findDrawRow(st.slug, info.species, req.huntCode || "", req.drawYear, cache);
    if (!row) return { ok: false, status: 404, error: `Hunt ${req.huntCode} isn't in ${st.agency.shortName || st.agency.name}'s draw data.` };
    const only = huntResidencyOnly(row.description);
    if (only && only !== req.residency) return { ok: false, status: 400, error: `Hunt ${row.huntCode} is for ${only}s only.` };
  }
  if (req.kind === "custom" && !req.description && !req.unit) return { ok: false, status: 400, error: "Describe the hunt (unit, season or license)." };
  const { hunt, needsDrawing } = buildPlannedHunt({
    state: st,
    info,
    residency: req.residency,
    today,
    now,
    kind: req.kind,
    row,
    drawing: req.drawing ?? null,
    customDescription: req.description,
    id,
    pointsOwned: req.pointsOwned,
    unit: req.unit,
    notes: req.notes,
  });
  return { ok: true, hunt, needsDrawing, state: st, info };
}

/**
 * A freshly built agency block for a saved hunt, from current data; null when
 * the hunt can't be matched any more (state/species gone, or the hunt code isn't
 * in the agency's latest draw year: a hunt the agency dropped or renumbered is
 * kept as saved rather than re-planned from an old year's row). Uses the hunt
 * code's latest published row, so new draw results flow in too.
 */
export async function freshAgencyFor(h: PlannedHunt, today: string, now: string, cache?: RowCache): Promise<AgencyRef | null> {
  const a = h.agency;
  if (!a) return null;
  const st = await getStateData(a.stateSlug);
  const info = st?.species.find((s) => s.species === h.species);
  if (!st || !info) return null;
  const kind = a.kind ?? "draw";
  const row = kind === "draw" ? await findDrawRow(st.slug, info.species, a.huntCode, undefined, cache) : null;
  if (kind === "draw" && !row) return null;
  if (row) {
    const latest = (await drawRows(st.slug, info.species, cache)).reduce((y, r) => Math.max(y, r.year), 0);
    if (row.year < latest) return null;
  }
  // Compared with the saved block as it will be stored, so trimming/capping never reads as a change.
  return sanitizeAgencyRef(planAgency({ state: st, info, residency: a.residency, today, now, kind, row, drawing: h.drawing ?? null, customDescription: a.description }).agency) ?? null;
}
