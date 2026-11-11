// Ordering a species' agency key dates for the state page: dates still to come first,
// passed ones apart, and a caveat the agency attached to every date said once.
// Pure functions (client-safe) so the rules are unit tested.
import type { KeyDate } from "@/data/agency/schema";
import { keyDateEnd } from "@/lib/agency-format";

// A note's parts end at "; " or at a sentence end: ". " after a lowercase word or a number and
// before a capital. Initialisms ("a.m. MST", "U.S. Postal") and common abbreviations ("St. Johns")
// don't split. The capture keeps the separators so a prefix of parts joins back to the exact text.
const PART_BREAK = /(; |(?<=[^.][a-z0-9)][.!?])(?<!\b(?:St|Mt|Ft|No|vs|approx|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.) (?=[A-Z]))/;

/** [part, separator, part, separator, ..., part] */
function partsOf(note: string): string[] {
  return note.split(PART_BREAK);
}

/**
 * The caveat every date in the list starts with, e.g. "CPW hasn't published 2027 dates yet. These
 * are the 2026 dates." Notes are compared part by part (sentences and "; "-separated pieces), so a
 * date that adds its own detail after the shared caveat still counts. "" when there's none or
 * only one date (a single date shows its own note).
 */
export function sharedNote(dates: readonly Pick<KeyDate, "note">[]): string {
  if (dates.length < 2) return "";
  const parts = dates.map((d) => partsOf(d.note || ""));
  const first = parts[0];
  // Parts sit at even indexes, separators between them.
  let n = 0;
  while (n < first.length && first[n] && parts.every((p) => p[n] === first[n])) n += 2;
  return first.slice(0, Math.max(0, n - 1)).join("");
}

/** A date's own note once the shared caveat is taken off ("" when nothing is left). */
export function ownNote(note: string | undefined, shared: string): string {
  if (!note) return "";
  if (!shared) return note;
  if (note === shared) return "";
  if (!note.startsWith(shared)) return note;
  const rest = note.slice(shared.length);
  const sep = rest.match(/^(; | )/);
  return sep ? rest.slice(sep[0].length) : note;
}

const byStart = (a: KeyDate, b: KeyDate) =>
  (a.start || a.date || "").localeCompare(b.start || b.date || "") || keyDateEnd(a).localeCompare(keyDateEnd(b)) || a.label.localeCompare(b.label);

export interface KeyDateGroups {
  /** Not over yet (ends today or later), in date order: confirmed and tentative alike. */
  upcoming: KeyDate[];
  /** Already over, in date order. */
  past: KeyDate[];
  upcomingNote: string;
  pastNote: string;
  /** Cycles the passed dates belong to, oldest first (e.g. [2026]). */
  pastCycles: number[];
}

export function groupKeyDates(dates: readonly KeyDate[], today: string): KeyDateGroups {
  const upcoming = dates.filter((d) => keyDateEnd(d) >= today).sort(byStart);
  const past = dates.filter((d) => keyDateEnd(d) < today).sort(byStart);
  return {
    upcoming,
    past,
    upcomingNote: sharedNote(upcoming),
    pastNote: sharedNote(past),
    pastCycles: Array.from(new Set(past.map((d) => d.cycle))).sort((a, b) => a - b),
  };
}
