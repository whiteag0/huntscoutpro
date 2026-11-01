// What a planned hunt's dates look like on a timeline: the agency's key dates,
// the season, and the member's own dates, with countdowns. Also the hunt's
// checklist steps derived from the agency block. Pure functions only (client +
// server, `npm test`).
//
// Honesty rules (see planner-agency.ts): dates from a cycle the agency hasn't
// published as the planned one are marked `published: false` and are never
// counted as upcoming deadlines or exported to calendars.

import { daysBetween } from "@/lib/reminders";
import { linkOf, type AgencyDate, type AgencyDateKind, type AgencyRef, type PlannedHunt } from "@/lib/planner-schema";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "2027-03-01" -> "Mar 1" (with the year when asked). */
export function shortDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}

export const DATE_KIND_LABELS: Record<AgencyDateKind, string> = {
  application: "Application",
  "application-change": "Modify / withdraw",
  results: "Draw results",
  payment: "Payment",
  surrender: "Surrender",
  points: "Point only",
  leftover: "Leftover / second round",
  "license-sale": "License sale",
  other: "Agency date",
};

/** Kinds that are something the member must do by the date. */
export const DEADLINE_KINDS: ReadonlySet<AgencyDateKind> = new Set(["application", "application-change", "points", "payment", "surrender", "license-sale", "leftover"]);

export interface CycleInfo {
  /** The cycle being planned, when known. */
  planCycle: number | null;
  /** The cycle the agency dates shown belong to. */
  datesCycle: number | null;
  /** The shown dates are the agency's published dates for planCycle. */
  published: boolean;
  /** Short badge text: "2027 dates" or "2026 dates — 2027 not yet published by CPW". */
  label: string;
}

const who = (a: Pick<AgencyRef, "agencyShortName" | "agencyName">) => a.agencyShortName || a.agencyName || "the agency";

/** Which cycle an entry's agency dates are for, including v1 entries (one deadline, no cycle fields). */
export function cycleInfo(a: AgencyRef): CycleInfo {
  if (a.planCycle !== undefined || a.datesCycle !== undefined) {
    const planCycle = a.planCycle ?? null;
    const datesCycle = a.datesCycle ?? null;
    const published = a.cyclePublished === true;
    if (datesCycle === null) return { planCycle, datesCycle, published: false, label: `No dates from ${who(a)} in our data yet` };
    return {
      planCycle,
      datesCycle,
      published,
      label: published ? `${datesCycle} dates` : `${datesCycle} dates — ${planCycle ?? datesCycle + 1} not yet published by ${who(a)}`,
    };
  }
  // v1 entry: the deadline was always an upcoming, published date.
  if (a.deadline) return { planCycle: a.deadline.cycle, datesCycle: a.deadline.cycle, published: true, label: `${a.deadline.cycle} dates` };
  return { planCycle: null, datesCycle: null, published: false, label: `No upcoming date from ${who(a)} when added — refresh to check` };
}

/** The entry's agency dates; a v1 entry's single deadline reads as one application date. */
export function agencyDatesOf(a: AgencyRef): AgencyDate[] {
  if (a.keyDates) return a.keyDates;
  if (!a.deadline) return [];
  const d = a.deadline;
  return [
    {
      kind: "application",
      label: d.label,
      ...(d.date ? { date: d.date } : {}),
      ...(d.start ? { start: d.start } : {}),
      end: d.end,
      cycle: d.cycle,
      status: d.status,
      ...(d.note ? { note: d.note } : {}),
      sourceUrl: d.sourceUrl,
    } as AgencyDate & { sourceUrl: string },
  ];
}

export type TimelineKind = AgencyDateKind | "season" | "custom" | "manual";

export interface TimelineItem {
  /** Stable within the hunt (calendar UIDs build on it). */
  key: string;
  huntId: string;
  kind: TimelineKind;
  label: string;
  /** Set for windows and seasons. */
  start?: string;
  end: string;
  /** Agency dates and seasons: their cycle / season year. */
  cycle?: number;
  /** False for agency dates/seasons from a cycle other than the one being planned. Member dates are always true. */
  published: boolean;
  tentative?: boolean;
  /** Seasons: whether the dates are this hunt's own, its units', or the statewide season. */
  scope?: "hunt" | "units" | "statewide";
  residency?: "resident" | "nonresident";
  note?: string;
  sourceUrl?: string;
  /** Member-entered (custom date or own application deadline). */
  mine: boolean;
}

function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Every date of one hunt, in date order. */
export function huntTimeline(h: PlannedHunt): TimelineItem[] {
  const out: TimelineItem[] = [];
  const a = h.agency;
  if (a) {
    const cyc = cycleInfo(a);
    for (const d of agencyDatesOf(a)) {
      out.push({
        key: `${d.kind}-${hashKey(`${d.label}|${d.start || ""}|${d.end}`)}`,
        huntId: h.id,
        kind: d.kind,
        label: d.label,
        ...(d.start && d.start !== d.end ? { start: d.start } : {}),
        end: d.end,
        cycle: d.cycle,
        published: cyc.published && (cyc.planCycle === null || d.cycle === cyc.planCycle),
        ...(d.status === "tentative" ? { tentative: true } : {}),
        ...(d.residency ? { residency: d.residency } : {}),
        ...(d.note ? { note: d.note } : {}),
        sourceUrl: linkOf(a, d),
        mine: false,
      });
    }
    for (const s of a.seasons || []) {
      out.push({
        key: `season-${hashKey(`${s.label}|${s.start}|${s.end}`)}`,
        huntId: h.id,
        kind: "season",
        label: s.label,
        ...(s.start !== s.end ? { start: s.start } : {}),
        end: s.end,
        cycle: s.year,
        published: cyc.planCycle === null || s.year >= cyc.planCycle,
        scope: s.scope,
        ...(s.note ? { note: s.note } : {}),
        sourceUrl: linkOf(a, s),
        mine: false,
      });
    }
  }
  // The member's own application date: v1 manual entries, or an agency entry whose cycle wasn't published yet.
  if (ISO.test(h.applicationDeadline) && !(a && a.deadline && a.deadline.end === h.applicationDeadline)) {
    out.push({ key: `manual-${h.applicationDeadline}`, huntId: h.id, kind: "manual", label: "Application deadline (you entered)", end: h.applicationDeadline, published: true, mine: true });
  }
  for (const c of h.customDates || []) {
    out.push({ key: `custom-${c.id}`, huntId: h.id, kind: "custom", label: c.label, ...(c.end ? { start: c.date } : {}), end: c.end || c.date, published: true, mine: true });
  }
  const rank = (t: TimelineItem) => TIMELINE_ORDER.indexOf(t.kind);
  return out.sort((x, y) => (x.start || x.end).localeCompare(y.start || y.end) || x.end.localeCompare(y.end) || rank(x) - rank(y) || x.label.localeCompare(y.label));
}

/** Same-day items: the application before the point-only line on the same window, and so on. */
const TIMELINE_ORDER: readonly TimelineKind[] = ["application", "application-change", "points", "results", "payment", "surrender", "leftover", "license-sale", "other", "manual", "custom", "season"];

export interface Countdown {
  text: string;
  tone: "past" | "urgent" | "soon" | "later" | "active";
}

/** "closes in 12 days", "opens Mar 1", "today", "passed"; seasons say "opens"/"open now"/"ended". */
export function countdown(item: Pick<TimelineItem, "start" | "end" | "kind">, today: string): Countdown {
  const season = item.kind === "season";
  const toEnd = daysBetween(today, item.end);
  if (toEnd < 0) return { text: season ? "ended" : "passed", tone: "past" };
  const tone = (d: number): Countdown["tone"] => (d <= 14 ? "urgent" : d <= 45 ? "soon" : "later");
  if (item.start && item.start !== item.end) {
    const toStart = daysBetween(today, item.start);
    if (toStart > 0) {
      const text = toStart === 1 ? "opens tomorrow" : toStart <= 7 ? `opens in ${toStart} days` : `opens ${shortDate(item.start, item.start.slice(0, 4) !== today.slice(0, 4))}`;
      return { text, tone: season ? "later" : tone(toStart) };
    }
    if (season) return { text: toEnd === 0 ? "open, last day" : `open now · ends in ${toEnd} day${toEnd === 1 ? "" : "s"}`, tone: "active" };
    return { text: toEnd === 0 ? "closes today" : toEnd === 1 ? "closes tomorrow" : `closes in ${toEnd} days`, tone: tone(toEnd) };
  }
  if (season) return { text: toEnd === 0 ? "opens today" : `opens in ${toEnd} days`, tone: "later" };
  return { text: toEnd === 0 ? "today" : toEnd === 1 ? "tomorrow" : `in ${toEnd} days`, tone: tone(toEnd) };
}

/**
 * Upcoming things to act on across hunts (application, points, payment,
 * surrender, sale/leftover dates and the member's own dates), soonest first.
 * Only published dates for the planned cycle count; each hunt's dates were
 * already limited to its residency when it was planned.
 */
export function upcomingDeadlines(hunts: readonly PlannedHunt[], today: string, limit = 50): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const h of hunts) {
    for (const t of huntTimeline(h)) {
      if (t.end < today || !t.published) continue;
      if (t.mine || DEADLINE_KINDS.has(t.kind as AgencyDateKind)) out.push(t);
    }
  }
  return out.sort((x, y) => x.end.localeCompare(y.end) || x.huntId.localeCompare(y.huntId) || x.label.localeCompare(y.label)).slice(0, limit);
}

/** The next date of one hunt that hasn't passed: a published deadline, else any published date, else null. */
export function nextForHunt(h: PlannedHunt, today: string): TimelineItem | null {
  const live = huntTimeline(h).filter((t) => t.end >= today && t.published);
  const byEnd = (x: TimelineItem, y: TimelineItem) => x.end.localeCompare(y.end);
  return live.filter((t) => t.mine || DEADLINE_KINDS.has(t.kind as AgencyDateKind)).sort(byEnd)[0] ?? live.sort(byEnd)[0] ?? null;
}

// ------------------------------------------------------------
// Checklist steps derived from the agency block
// ------------------------------------------------------------

export interface HuntStep {
  /** Stable key, stored in hunt.stepsDone when ticked. */
  key: string;
  label: string;
  detail?: string;
}

const LICENSE_FEE = /hunting license|qualifying license|basic hunting|sportsman'?s? (package|license)|habitat stamp|conservation (certificate|license)/i;

/**
 * Steps every hunt of this kind needs, worded from the agency block: apply (or
 * buy, for general/OTC licenses), check results and pay when drawn, the
 * licenses/stamps the agency's fee table lists for every species, and each
 * requirement the agency notes (hunter education, required courses...).
 */
export function huntSteps(h: PlannedHunt): HuntStep[] {
  const a = h.agency;
  const steps: HuntStep[] = [];
  if (!a) return steps;
  const kind = a.kind ?? "draw";
  const cyc = cycleInfo(a);
  const dates = agencyDatesOf(a);
  const firstOf = (k: AgencyDateKind) => dates.find((d) => d.kind === k);
  const when = (d: AgencyDate | undefined, verb: string) =>
    !d ? undefined : cyc.published ? `${verb} ${shortDate(d.end, true)}` : `${cyc.datesCycle} date was ${shortDate(d.end, true)}; ${cyc.planCycle} not yet published`;
  const cycle = cyc.planCycle ? ` ${cyc.planCycle}` : "";
  if (kind === "otc") {
    const sale = firstOf("license-sale") || firstOf("leftover");
    steps.push({ key: "buy", label: `Buy the ${who(a)}${cycle} license/tag`, ...(sale ? { detail: when(sale, "On sale") } : {}) });
  } else {
    const app = firstOf("application");
    steps.push({ key: "apply", label: kind === "custom" ? `Apply or buy the${cycle} license/tag` : `Apply in the ${who(a)}${cycle} draw`, ...(app ? { detail: when(app, "Closes") } : {}) });
    if (kind === "draw") {
      const res = firstOf("results");
      if (res) steps.push({ key: "results", label: "Check draw results", detail: when(res, "Posted") });
      const pay = firstOf("payment");
      steps.push({ key: "pay", label: "If drawn, pay for the license/tag", ...(pay ? { detail: when(pay, "Due") } : {}) });
    }
  }
  const general = a.fees.filter((f) => !f.speciesSpecific && LICENSE_FEE.test(f.item));
  if (general.length) steps.push({ key: "license", label: `Buy the ${a.residency} hunting license or stamps the agency requires`, detail: Array.from(new Set(general.map((f) => f.item))).slice(0, 3).join("; ") });
  for (const r of a.requirements || []) steps.push({ key: `req-${hashKey(r)}`, label: /hunter (education|ed\b)/i.test(r) ? "Hunter education / required course" : "Agency requirement", detail: r });
  return steps;
}
