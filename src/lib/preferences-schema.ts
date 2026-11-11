// Shared (client + server) shape of the member onboarding / hunting-preferences form.

export interface HuntingPreferences {
  /** State slugs, e.g. "colorado". The first is the member's top state. */
  states: string[];
  residency: "resident" | "nonresident" | "both" | "";
  /** Two-letter home state, e.g. "CO". */
  homeState: string;
  /** Species ids: elk, mule-deer, whitetail, pronghorn, moose, bear, sheep, goat, lion, turkey. */
  species: string[];
  /** Units / GMUs / zones they're considering: "Colorado GMU: 61, 62; Wyoming Hunt Area: 7" (see joinStateUnits). */
  units: string;
  /** rifle, archery, muzzleloader, shotgun. */
  methods: string[];
  /** Free text: points held and seasons they want to apply for. */
  points: string;
  /** trophy, meat, experience, first-hunt, new-country. */
  goals: string[];
  /** Anything else / feedback. */
  notes: string;
}

export const EMPTY_PREFERENCES: HuntingPreferences = {
  states: [], residency: "", homeState: "", species: [], units: "", methods: [], points: "", goals: [], notes: "",
};

export const METHOD_OPTIONS = [
  { id: "rifle", label: "Rifle" },
  { id: "archery", label: "Archery" },
  { id: "muzzleloader", label: "Muzzleloader" },
  { id: "shotgun", label: "Shotgun (turkey)" },
] as const;

export const GOAL_OPTIONS = [
  { id: "trophy", label: "A trophy animal" },
  { id: "meat", label: "Filling the freezer" },
  { id: "experience", label: "Quality experience, less crowding" },
  { id: "first-hunt", label: "My first hunt in a new state" },
  { id: "new-country", label: "Finding new country / units" },
] as const;

// Each value is stored as one Stripe metadata value (500 characters at most).
export const LIMITS = { units: 480, unitsPerState: 120, points: 300, notes: 480, listItems: 20 } as const;

/** One live state as the form offers it: its unit word and species, and which species have points. */
export interface StateOption {
  slug: string;
  name: string;
  abbrev: string;
  /** "GMU", "Hunt Area", "Hunting District"... */
  unitTerm: string;
  species: { id: string; label: string; pointsMatter: boolean }[];
}

/**
 * The member's top state first, the rest kept in order. A slug not in the list leaves it unchanged.
 */
export function withTopState(states: readonly string[], top: string): string[] {
  if (!states.includes(top)) return [...states];
  return [top, ...states.filter((s) => s !== top)];
}

/**
 * Residency from the home state and the states picked: resident at home, nonresident elsewhere.
 * Without a home state the member's own answer stands.
 */
export function residencyFor(homeAbbrev: string, states: readonly { abbrev: string }[], answered: HuntingPreferences["residency"]): HuntingPreferences["residency"] {
  const home = homeAbbrev.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(home)) return answered;
  if (!states.length) return answered || "";
  const atHome = states.some((s) => s.abbrev.toUpperCase() === home);
  const away = states.some((s) => s.abbrev.toUpperCase() !== home);
  return atHome && away ? "both" : atHome ? "resident" : "nonresident";
}

/**
 * The units answer as one string the report reads per state ("Colorado GMU: 61, 62; Wyoming Hunt
 * Area: 7"), followed by anything that isn't tied to a state. Capped at LIMITS.units, whole entries only.
 */
export function joinStateUnits(entries: readonly { name: string; unitTerm: string; text: string }[], other = ""): string {
  const clean = (v: string) => v.replace(/[;\s]+/g, " ").trim();
  const parts = entries
    .map((e) => ({ ...e, text: clean(e.text).slice(0, LIMITS.unitsPerState) }))
    .filter((e) => e.text)
    .map((e) => `${e.name} ${e.unitTerm}: ${e.text}`);
  const rest = other.replace(/\s+/g, " ").trim();
  if (rest) parts.push(rest);
  let out = "";
  for (const p of parts) {
    const next = out ? `${out}; ${p}` : p;
    if (next.length > LIMITS.units) break;
    out = next;
  }
  return out;
}

/**
 * The reverse of joinStateUnits, for editing: each "<State name> <term>: <units>" entry by state slug,
 * and everything else (older free-text answers) as `other`.
 */
export function splitStateUnits(units: string, states: readonly { slug: string; name: string }[]): { byState: Record<string, string>; other: string } {
  const byState: Record<string, string> = {};
  const other: string[] = [];
  const byLength = [...states].sort((a, b) => b.name.length - a.name.length);
  for (const raw of units.split(";")) {
    const part = raw.trim();
    if (!part) continue;
    const st = byLength.find((s) => part.toLowerCase().startsWith(`${s.name.toLowerCase()} `) || part.toLowerCase().startsWith(`${s.name.toLowerCase()}:`));
    const colon = part.indexOf(":");
    if (st && colon > 0 && colon <= st.name.length + 25 && !byState[st.slug]) {
      const text = part.slice(colon + 1).trim();
      if (text) byState[st.slug] = text;
      continue;
    }
    other.push(part);
  }
  return { byState, other: other.join("; ") };
}

/** Validate + normalize untrusted input. Returns null when nothing usable. */
export function sanitizePreferences(raw: unknown): HuntingPreferences | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown) =>
    Array.isArray(v)
      ? Array.from(new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 40)).filter(Boolean))).slice(0, LIMITS.listItems)
      : [];
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const residency = ["resident", "nonresident", "both"].includes(r.residency as string) ? (r.residency as HuntingPreferences["residency"]) : "";
  return {
    states: list(r.states),
    residency,
    homeState: str(r.homeState, 2).toUpperCase(),
    species: list(r.species),
    units: str(r.units, LIMITS.units),
    methods: list(r.methods),
    points: str(r.points, LIMITS.points),
    goals: list(r.goals),
    notes: str(r.notes, LIMITS.notes),
  };
}
