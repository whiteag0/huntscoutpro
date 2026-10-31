// Shared (client + server) shape of the "Request this state" form.
import { STATE_LIST } from "@/data/state-list";
import { SPECIES_LABELS } from "@/data/types";
import { isLiveState } from "@/lib/agency-format";
import { METHOD_OPTIONS } from "@/lib/preferences-schema";

export interface StateRequest {
  /** Slug of the state they want added. */
  state: string;
  name: string;
  email: string;
  phone: string;
  residency: "resident" | "nonresident" | "both" | "";
  /** Two-letter home state, e.g. "CO". */
  homeState: string;
  species: string[];
  methods: string[];
  /** Free text, e.g. "Fall 2027". */
  timeframe: string;
  notes: string;
  /** Email me when this state goes live. */
  notify: boolean;
}

export const STATE_REQUEST_LIMITS = { name: 100, email: 200, phone: 40, timeframe: 100, notes: 1000 } as const;

const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[A-Za-z]{2,}$/;

export type StateRequestResult = { ok: true; value: StateRequest } | { ok: false; errors: Partial<Record<keyof StateRequest, string>> };

/** Validate + normalize untrusted input. */
export function parseStateRequest(raw: unknown): StateRequestResult {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const list = (v: unknown, allowed: readonly string[]) =>
    Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string" && allowed.includes(x)))) : [];

  const value: StateRequest = {
    state: str(r.state, 40),
    name: str(r.name, STATE_REQUEST_LIMITS.name),
    email: str(r.email, STATE_REQUEST_LIMITS.email).toLowerCase(),
    phone: str(r.phone, STATE_REQUEST_LIMITS.phone),
    residency: ["resident", "nonresident", "both"].includes(r.residency as string) ? (r.residency as StateRequest["residency"]) : "",
    homeState: str(r.homeState, 2).toUpperCase(),
    species: list(r.species, Object.keys(SPECIES_LABELS)),
    methods: list(r.methods, METHOD_OPTIONS.map((m) => m.id)),
    timeframe: str(r.timeframe, STATE_REQUEST_LIMITS.timeframe),
    notes: typeof r.notes === "string" ? r.notes.trim().slice(0, STATE_REQUEST_LIMITS.notes) : "",
    notify: r.notify !== false,
  };

  const errors: Partial<Record<keyof StateRequest, string>> = {};
  const st = STATE_LIST.find((s) => s.slug === value.state);
  if (!st) errors.state = "Choose a state.";
  else if (isLiveState(st.slug)) errors.state = `${st.name} is already live on HuntScout Pro.`;
  if (!value.name) errors.name = "Enter your name.";
  if (!EMAIL_RE.test(value.email)) errors.email = "Enter a valid email address.";
  if (value.phone && !/^[0-9+().\-\s]{7,40}$/.test(value.phone)) errors.phone = "Enter a valid phone number, or leave it blank.";
  if (value.homeState && !STATE_LIST.some((s) => s.abbrev === value.homeState)) errors.homeState = "Choose a home state.";
  if (value.species.length === 0) errors.species = "Pick at least one species.";

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}
