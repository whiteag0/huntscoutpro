// Shared (client + server) shape of the free deadline-reminder signup.
// One live state per address; Pro members get every state in their preferences.
import { SPECIES_LABELS } from "@/data/types";
import { isLiveState } from "@/lib/agency-format";

export type FreeResidency = "resident" | "nonresident" | "both";

export interface FreeSignup {
  email: string;
  /** One live state slug, e.g. "colorado". */
  state: string;
  /** Species ids; empty means every species the state publishes dates for. */
  species: string[];
  residency: FreeResidency;
}

export const FREE_RESIDENCY_OPTIONS: { id: FreeResidency; label: string }[] = [
  { id: "resident", label: "Resident" },
  { id: "nonresident", label: "Nonresident" },
  { id: "both", label: "Not sure (send both)" },
];

/** Options the form offers: live states and the species each one publishes. */
export interface FreeReminderStateOption {
  slug: string;
  name: string;
  species: { id: string; label: string }[];
}

export const FREE_EMAIL_MAX = 200;
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/;

export function isValidEmail(email: string): boolean {
  return email.length <= FREE_EMAIL_MAX && EMAIL_RE.test(email);
}

export type FreeSignupResult = { ok: true; value: FreeSignup } | { ok: false; errors: Partial<Record<keyof FreeSignup, string>> };

/**
 * Validate + normalize untrusted input. `speciesFor` returns the species the
 * state publishes (server: from the agency data); unknown species are dropped.
 */
export function parseFreeSignup(raw: unknown, speciesFor?: (state: string) => readonly string[] | null): FreeSignupResult {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const email = typeof r.email === "string" ? r.email.trim().slice(0, FREE_EMAIL_MAX + 1) : "";
  const state = typeof r.state === "string" ? r.state.trim().toLowerCase().slice(0, 40) : "";
  const allowed = (speciesFor ? speciesFor(state) : null) || Object.keys(SPECIES_LABELS);
  const species = Array.isArray(r.species)
    ? Array.from(new Set(r.species.filter((x): x is string => typeof x === "string" && allowed.includes(x)))).slice(0, 12)
    : [];
  const residency = (["resident", "nonresident", "both"] as const).find((x) => x === r.residency);

  const errors: Partial<Record<keyof FreeSignup, string>> = {};
  if (!isValidEmail(email)) errors.email = "Enter a valid email address.";
  if (!state || !isLiveState(state) || (speciesFor && !speciesFor(state)?.length)) errors.state = "Choose a state.";
  if (!residency) errors.residency = "Choose how you apply in this state.";

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { email, state, species, residency: residency! } };
}
