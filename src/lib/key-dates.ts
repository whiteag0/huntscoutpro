// Ordering a species' agency key dates for the state page: dates still to come first,
// passed ones apart, and a caveat the agency attached to every date said once.
// Pure functions (client-safe) so the rules are unit tested.
import type { KeyDate } from "@/data/agency/schema";
import { keyDateEnd } from "@/lib/agency-format";

const SEP = "; ";

/**
 * The caveat every date in the list starts with, e.g. "2027 dates not yet published by CPW as of
 * 2026-10-31; these are the 2026 dates." Notes are compared by their "; "-separated parts, so a
 * date that adds its own detail after the shared caveat still counts. "" when there's none or
 * only one date (a single date shows its own note).
 */
export function sharedNote(dates: readonly Pick<KeyDate, "note">[]): string {
  if (dates.length < 2) return "";
  const parts = dates.map((d) => (d.note || "").split(SEP));
  let n = 0;
  while (parts.every((p) => n < p.length && p[n] && p[n] === parts[0][n])) n++;
  return parts[0].slice(0, n).join(SEP);
}

/** A date's own note once the shared caveat is taken off ("" when nothing is left). */
export function ownNote(note: string | undefined, shared: string): string {
  if (!note) return "";
  if (!shared) return note;
  if (note === shared) return "";
  return note.startsWith(shared + SEP) ? note.slice(shared.length + SEP.length) : note;
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
