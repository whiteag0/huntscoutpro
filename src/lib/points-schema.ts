// Shared (client + server) format of a member's structured point balances.
//
// Stored on the purchase's PaymentIntent as one metadata value (POINTS_KEY), e.g.
//   "colorado.elk=5;utah.mule-deer=2;wyoming.elk=3"
// Stripe metadata values are capped at 500 characters, so the whole string must fit.
import { AGENCY_STATES } from "@/data/agency/schema";
import { SPECIES_LABELS, type Species } from "@/data/types";

export const POINTS_KEY = "hs_pref_pts";
export const POINTS_MAX_CHARS = 500;
export const POINTS_MIN = 0;
export const POINTS_MAX = 40;

/** "colorado.elk" -> 5 */
export type PointsMap = Record<string, number>;

export function pointsKey(state: string, species: string): string {
  return `${state}.${species}`;
}

export function isPointsKey(key: string): boolean {
  const dot = key.indexOf(".");
  if (dot <= 0) return false;
  const state = key.slice(0, dot);
  const species = key.slice(dot + 1);
  return (AGENCY_STATES as readonly string[]).includes(state) && Object.hasOwn(SPECIES_LABELS, species);
}

export function splitPointsKey(key: string): { state: string; species: Species } {
  const dot = key.indexOf(".");
  return { state: key.slice(0, dot), species: key.slice(dot + 1) as Species };
}

/** A whole number of points 0–40, from a number or a numeric string; null otherwise. */
export function parsePointValue(v: unknown): number | null {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  if (!/^\d{1,2}$/.test(s)) return null;
  const n = Number(s);
  return n >= POINTS_MIN && n <= POINTS_MAX ? n : null;
}

/** Sorted, deterministic compact form. */
export function serializePoints(points: PointsMap): string {
  return Object.keys(points)
    .filter((k) => isPointsKey(k) && parsePointValue(points[k]) !== null)
    .sort()
    .map((k) => `${k}=${points[k]}`)
    .join(";");
}

export interface ParsedPoints {
  points: PointsMap;
  /** Entries that were not understood, as written. */
  invalid: string[];
}

/** Parse the compact form. Unknown states/species and out-of-range values are reported, not kept. */
export function parsePoints(raw: string | null | undefined): ParsedPoints {
  const points: PointsMap = {};
  const invalid: string[] = [];
  if (!raw) return { points, invalid };
  for (const part of raw.slice(0, 2000).split(";")) {
    const entry = part.trim();
    if (!entry) continue;
    const eq = entry.indexOf("=");
    const key = eq > 0 ? entry.slice(0, eq).trim().toLowerCase() : "";
    const value = eq > 0 ? parsePointValue(entry.slice(eq + 1)) : null;
    if (!key || !isPointsKey(key) || value === null) {
      invalid.push(entry.slice(0, 60));
      continue;
    }
    points[key] = value;
  }
  return { points, invalid };
}

/**
 * Validate an update from the client: {"colorado.elk": 5, "utah.elk": null}.
 * null (or "") removes an entry. Returns the accepted changes and the rejected keys.
 */
export function sanitizePointsUpdate(raw: unknown): { set: PointsMap; remove: string[]; invalid: string[] } {
  const set: PointsMap = {};
  const remove: string[] = [];
  const invalid: string[] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { set, remove, invalid: ["(not an object)"] };
  const entries = Object.entries(raw as Record<string, unknown>).slice(0, 200);
  for (const [rawKey, v] of entries) {
    const key = rawKey.trim().toLowerCase();
    if (!isPointsKey(key)) {
      invalid.push(rawKey.slice(0, 60));
      continue;
    }
    if (v === null || v === "") {
      remove.push(key);
      continue;
    }
    const n = parsePointValue(v);
    if (n === null) invalid.push(rawKey.slice(0, 60));
    else set[key] = n;
  }
  return { set, remove, invalid };
}

/** Points for one species, keyed by state slug. */
export function pointsForSpecies(points: PointsMap, species: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(points)) {
    const { state, species: sp } = splitPointsKey(k);
    if (sp === species) out[state] = v;
  }
  return out;
}
