// Deadline reminders: which of a member's agency key dates are due for an
// email today. Pure functions only (no data imports, no I/O) so the logic can
// be unit tested with plain Node: `npm test`.
//
// Every date here is copied from the agency key dates in
// src/data/agency/<state>/draw-meta.json. Nothing is estimated: a date the
// agency hasn't published for the coming cycle simply produces no reminder.

import type { DrawMeta, KeyDate, SourceRef, Species } from "@/data/agency/schema";

export interface ReminderMember {
  email: string;
  name?: string | null;
  /** State slugs from the member's preferences, e.g. "colorado". */
  states: string[];
  /** Species ids; empty means every species. */
  species: string[];
  residency: "resident" | "nonresident" | "both" | "";
  /** Two-letter home state, e.g. "CO"; "" when unknown. */
  homeState: string;
}

/** The parts of a state's agency data reminders need (StateData from src/lib/agency.ts fits). */
export type ReminderState = Pick<DrawMeta, "slug" | "name" | "abbrev" | "agency" | "species"> & {
  sources: SourceRef[];
};

/**
 * closes  = the window end (or the single date) is exactly 14 or 3 days away.
 * opens   = an application window starts today.
 */
export type ReminderKind = "closes" | "opens";

export interface DueReminder {
  state: string;
  stateName: string;
  agencyName: string;
  species: Species;
  label: string;
  kind: ReminderKind;
  /** Whole days from today (Mountain Time) to the end date. */
  daysLeft: number;
  date?: string;
  start?: string;
  end?: string;
  cycle: number;
  status: KeyDate["status"];
  note?: string;
  sourceUrl: string;
  sourceTitle?: string;
}

/** Days before the end date on which a reminder goes out. */
export const REMIND_DAYS_BEFORE = [14, 3] as const;

/** Key dates members apply, buy points or must act by. */
export const ACTIONABLE_LABEL = /appl|apply|deadline|point/i;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const NONRES = /\bnon-?\s?residents?\b/gi;
const RES = /\bresidents?\b/i;

/** Calendar days from a to b (both YYYY-MM-DD), no timezone drift. */
export function daysBetween(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** Which residency a key-date label is limited to, if it says so. */
export function labelResidency(label: string): "resident" | "nonresident" | "any" {
  const nonres = NONRES.test(label);
  NONRES.lastIndex = 0;
  const res = RES.test(label.replace(NONRES, " "));
  if (nonres && !res) return "nonresident";
  if (res && !nonres) return "resident";
  return "any";
}

/**
 * How the member applies in a given state. A known home state settles it
 * (resident at home, nonresident everywhere else); otherwise the residency
 * answer from the preferences form is used, and no answer keeps everything.
 */
export function memberResidencyIn(member: Pick<ReminderMember, "residency" | "homeState">, stateAbbrev: string): "resident" | "nonresident" | "both" {
  const home = (member.homeState || "").trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(home) && /^[A-Z]{2}$/i.test(stateAbbrev)) {
    return home === stateAbbrev.toUpperCase() ? "resident" : "nonresident";
  }
  return member.residency === "resident" || member.residency === "nonresident" ? member.residency : "both";
}

function keyEnd(k: KeyDate): string {
  return k.end || k.date || k.start || "";
}

/**
 * Reminders due today for one member.
 * `states` should be the live agency states (e.g. getAllStateData()); states in
 * the member's preferences without published agency data are ignored.
 * `today` is YYYY-MM-DD in Mountain Time (todayIso()).
 */
function isIsoDay(v: string): boolean {
  return ISO_DAY.test(v);
}

/** The member's actionable key dates in one state that haven't ended yet (end >= today). */
function openKeyDates(member: ReminderMember, st: ReminderState, today: string) {
  const year = Number(today.slice(0, 4));
  const wanted = new Set(member.species);
  const residency = memberResidencyIn(member, st.abbrev);
  const out: { species: Species; k: KeyDate; end: string }[] = [];
  for (const info of st.species) {
    if (wanted.size > 0 && !wanted.has(info.species)) continue;
    for (const k of info.keyDates) {
      if (k.cycle < year) continue;
      if (!ACTIONABLE_LABEL.test(k.label)) continue;
      const end = keyEnd(k);
      if (!isIsoDay(end) || end < today) continue;
      const only = labelResidency(k.label);
      if (residency === "resident" && only === "nonresident") continue;
      if (residency === "nonresident" && only === "resident") continue;
      out.push({ species: info.species, k, end });
    }
  }
  return out;
}

/**
 * Reminders due today for one member.
 * `states` should be the live agency states (e.g. getAllStateData()); states in
 * the member's preferences without published agency data are ignored.
 * `today` is YYYY-MM-DD in Mountain Time (todayIso()).
 */
export function computeDueReminders(member: ReminderMember, states: readonly ReminderState[], today: string): DueReminder[] {
  if (!isIsoDay(today)) throw new Error(`today must be YYYY-MM-DD, got "${today}"`);
  const order = new Map(member.states.map((s, i) => [s, i] as const));
  const out: DueReminder[] = [];
  const seen = new Set<string>();

  for (const st of states) {
    if (!order.has(st.slug)) continue;
    for (const { species, k, end } of openKeyDates(member, st, today)) {
      const daysLeft = daysBetween(today, end);
      const opens = !!k.start && !!k.end && k.start === today;
      const closes = daysLeft > 0 && (REMIND_DAYS_BEFORE as readonly number[]).includes(daysLeft);
      if (!opens && !closes) continue;

      const id = [st.slug, species, k.label, k.date, k.start, k.end].join("|");
      if (seen.has(id)) continue;
      seen.add(id);

      const src = st.sources.find((s) => s.id === k.sourceId);
      out.push({
        state: st.slug,
        stateName: st.name,
        agencyName: st.agency.name,
        species,
        label: k.label,
        kind: opens ? "opens" : "closes",
        daysLeft,
        ...(k.date ? { date: k.date } : {}),
        ...(k.start ? { start: k.start } : {}),
        ...(k.end ? { end: k.end } : {}),
        cycle: k.cycle,
        status: k.status,
        ...(k.note ? { note: k.note } : {}),
        sourceUrl: src?.url || st.agency.url,
        ...(src?.title ? { sourceTitle: src.title } : {}),
      });
    }
  }

  return out.sort(
    (a, b) =>
      (order.get(a.state) ?? 0) - (order.get(b.state) ?? 0) ||
      a.daysLeft - b.daysLeft ||
      a.label.localeCompare(b.label) ||
      a.species.localeCompare(b.species)
  );
}

export interface NextDate {
  state: string;
  stateName: string;
  /** Soonest actionable key date that hasn't ended, or null when the agency hasn't published one we have. */
  next: { label: string; end: string; daysLeft: number } | null;
}

/** For the account page: each of the member's live states and the next date reminders will cover. */
export function nextReminderDates(member: ReminderMember, states: readonly ReminderState[], today: string): NextDate[] {
  if (!isIsoDay(today)) throw new Error(`today must be YYYY-MM-DD, got "${today}"`);
  const bySlug = new Map(states.map((s) => [s.slug, s] as const));
  const out: NextDate[] = [];
  for (const slug of member.states) {
    const st = bySlug.get(slug);
    if (!st) continue;
    const soonest = openKeyDates(member, st, today).sort((a, b) => a.end.localeCompare(b.end) || a.k.label.localeCompare(b.k.label))[0];
    out.push({
      state: st.slug,
      stateName: st.name,
      next: soonest ? { label: soonest.k.label, end: soonest.end, daysLeft: daysBetween(today, soonest.end) } : null,
    });
  }
  return out;
}

export interface DigestEntry extends Omit<DueReminder, "species" | "state" | "stateName" | "agencyName"> {
  /** Every species this exact key date was published for. */
  species: Species[];
}

export interface DigestGroup {
  state: string;
  stateName: string;
  agencyName: string;
  entries: DigestEntry[];
}

/** Group due reminders by state, merging the same key date listed under several species. */
export function groupReminders(items: readonly DueReminder[]): DigestGroup[] {
  const groups = new Map<string, DigestGroup>();
  const entries = new Map<string, DigestEntry>();
  for (const it of items) {
    let g = groups.get(it.state);
    if (!g) {
      g = { state: it.state, stateName: it.stateName, agencyName: it.agencyName, entries: [] };
      groups.set(it.state, g);
    }
    const key = [it.state, it.label, it.date, it.start, it.end, it.note, it.sourceUrl].join("|");
    const existing = entries.get(key);
    if (existing) {
      if (!existing.species.includes(it.species)) existing.species.push(it.species);
      continue;
    }
    const entry: DigestEntry = {
      label: it.label,
      kind: it.kind,
      daysLeft: it.daysLeft,
      ...(it.date ? { date: it.date } : {}),
      ...(it.start ? { start: it.start } : {}),
      ...(it.end ? { end: it.end } : {}),
      cycle: it.cycle,
      status: it.status,
      ...(it.note ? { note: it.note } : {}),
      sourceUrl: it.sourceUrl,
      ...(it.sourceTitle ? { sourceTitle: it.sourceTitle } : {}),
      species: [it.species],
    };
    entries.set(key, entry);
    g.entries.push(entry);
  }
  return [...groups.values()];
}
