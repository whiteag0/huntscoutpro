// Shared (client + server) shape of the member onboarding / hunting-preferences form.

export interface HuntingPreferences {
  /** State slugs, e.g. "colorado". */
  states: string[];
  residency: "resident" | "nonresident" | "both" | "";
  /** Two-letter home state, e.g. "CO". */
  homeState: string;
  /** Species ids: elk, mule-deer, whitetail, pronghorn, moose, bear, sheep, goat, lion, turkey. */
  species: string[];
  /** Free text: units / GMUs / zones they're considering. */
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

export const LIMITS = { units: 300, points: 300, notes: 480, listItems: 20 } as const;

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
