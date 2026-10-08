import { stripe } from "@/lib/stripe";
import { sanitizePreferences, type HuntingPreferences } from "@/lib/preferences-schema";

// Member preferences are stored as metadata on the PaymentIntent of the
// purchase (no database needed). Stripe allows 50 keys of up to 500 chars.
const K = {
  states: "hs_pref_states",
  residency: "hs_pref_residency",
  homeState: "hs_pref_home",
  species: "hs_pref_species",
  units: "hs_pref_units",
  methods: "hs_pref_methods",
  points: "hs_pref_points",
  goals: "hs_pref_goals",
  notes: "hs_pref_notes",
} as const;
export const ONBOARDED_AT_KEY = "hs_onboarded_at";
export const PREFS_EMAIL_ID_KEY = "hs_prefs_email_id";

const LIST_FIELDS = ["states", "species", "methods", "goals"] as const;

function toMetadata(p: HuntingPreferences): Record<string, string> {
  const md: Record<string, string> = {};
  for (const f of LIST_FIELDS) md[K[f]] = p[f].join(",").slice(0, 500);
  md[K.residency] = p.residency;
  md[K.homeState] = p.homeState;
  md[K.units] = p.units;
  md[K.points] = p.points;
  md[K.notes] = p.notes;
  return md;
}

function fromMetadata(md: Record<string, string>): HuntingPreferences | null {
  if (!Object.values(K).some((k) => md[k])) return null;
  const list = (k: string) => (md[k] ? md[k].split(",").filter(Boolean) : []);
  return sanitizePreferences({
    states: list(K.states),
    residency: md[K.residency] || "",
    homeState: md[K.homeState] || "",
    species: list(K.species),
    units: md[K.units] || "",
    methods: list(K.methods),
    points: md[K.points] || "",
    goals: list(K.goals),
    notes: md[K.notes] || "",
  });
}

export async function readPreferences(paymentIntentId: string) {
  if (!stripe) return { preferences: null, onboarded: false, metadata: {} as Record<string, string> };
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  return {
    preferences: fromMetadata(pi.metadata),
    onboarded: !!pi.metadata[ONBOARDED_AT_KEY],
    metadata: pi.metadata as Record<string, string>,
  };
}

export async function writePreferences(paymentIntentId: string, prefs: HuntingPreferences | null) {
  if (!stripe) throw new Error("Stripe not configured");
  await stripe.paymentIntents.update(paymentIntentId, {
    metadata: {
      ...(prefs ? toMetadata(prefs) : {}),
      [ONBOARDED_AT_KEY]: new Date().toISOString(),
    },
  });
}
