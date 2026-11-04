// Starting values for the Pro tools (state pages, Compare, Trends, Calendar, Plan a hunt)
// taken from what the member told us: the /welcome answers, the point balances saved
// on /shortlist (hs_pref_pts), and points entered on hunts in their planner.
// Pure functions (client-safe, no I/O) so the rules are unit tested. A value in the
// URL or one the member picks on the page always wins over these.
import { stateBySlug } from "@/data/state-list";
import { memberResidencyIn } from "@/lib/reminders";
import { pointsKey, type PointsMap } from "@/lib/points-schema";
import type { HuntingPreferences } from "@/lib/preferences-schema";
import type { PlannedHunt } from "@/lib/planner-schema";

export type ProfileResidency = "resident" | "nonresident";

/** Points the member entered on an agency hunt in their planner. */
export interface PlannerPoints {
  state: string;
  species: string;
  points: number;
  /** ISO time of the entry's last change ("" when unknown). */
  updatedAt: string;
}

/**
 * How the member applies in a state: resident at home and nonresident everywhere else when the
 * home state is known, otherwise their residency answer. Null when they said "both" or nothing.
 */
export function residencyIn(prefs: Pick<HuntingPreferences, "residency" | "homeState"> | null | undefined, stateSlug: string): ProfileResidency | null {
  if (!prefs) return null;
  const r = memberResidencyIn(prefs, stateBySlug(stateSlug)?.abbrev || "");
  return r === "both" ? null : r;
}

/** Point entries from the planner's agency hunts. Zero is skipped: the planner stores 0 when no points were entered. */
export function plannerPoints(hunts: readonly Pick<PlannedHunt, "species" | "preferencePointsOwned" | "agency" | "updatedAt">[]): PlannerPoints[] {
  const out: PlannerPoints[] = [];
  for (const h of hunts) {
    const pts = h.preferencePointsOwned;
    if (!h.agency?.stateSlug || pts == null || !(pts > 0)) continue;
    out.push({ state: h.agency.stateSlug, species: h.species, points: pts, updatedAt: h.updatedAt || h.agency.addedAt || "" });
  }
  return out;
}

/**
 * The member's points for a state and species: the balance saved to their profile first,
 * then the most recently changed planner hunt for that state and species. Null when neither has one.
 */
export function pointsIn(saved: PointsMap, planner: readonly PlannerPoints[], stateSlug: string, species: string): { points: number; from: "profile" | "planner" } | null {
  const v = saved[pointsKey(stateSlug, species)];
  if (typeof v === "number") return { points: v, from: "profile" };
  const latest = planner
    .filter((p) => p.state === stateSlug && p.species === species)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return latest ? { points: latest.points, from: "planner" } : null;
}

/** The member's saved states that are in `available`, in the order they gave them. */
export function profileStates(prefs: Pick<HuntingPreferences, "states"> | null | undefined, available: readonly string[]): string[] {
  return (prefs?.states || []).filter((s) => available.includes(s));
}

/** The member's first saved species that is in `available`. */
export function profileSpecies<T extends string>(prefs: Pick<HuntingPreferences, "species"> | null | undefined, available: readonly T[]): T | undefined {
  return (prefs?.species || []).find((s): s is T => (available as readonly string[]).includes(s));
}

/**
 * Where the member's research starts when nothing else says: their first saved state that offers
 * one of their species (with that species), else their first saved state, else null.
 */
export function profileStart<T extends string>(
  prefs: Pick<HuntingPreferences, "states" | "species"> | null | undefined,
  options: readonly { slug: string; species: readonly T[] }[]
): { state: string; species?: T } | null {
  const states = profileStates(prefs, options.map((o) => o.slug));
  for (const slug of states) {
    const sp = profileSpecies(prefs, options.find((o) => o.slug === slug)!.species);
    if (sp) return { state: slug, species: sp };
  }
  return states.length ? { state: states[0] } : null;
}
