// Refreshing saved hunts from current agency data. Pure functions only: `npm test`.
//
// The server rebuilds each entry's agency block from its own data
// (planAgency in planner-agency.ts); refreshHunt swaps it in and reports, in
// words, what changed. Only the agency block (and fields derived from it) is
// replaced: the member's status, notes, points, drawing answer, checklist,
// own dates and budget lines are never touched.

import { formatDate } from "@/lib/agency-format";
import { linkOf, withAgencyBlock, type AgencyRef, type PlannedHunt, type PlannerData } from "@/lib/planner-schema";
import { agencyDatesOf, cycleInfo } from "@/lib/planner-timeline";

function span(start: string | undefined, end: string): string {
  if (!start || start === end) return formatDate(end);
  return `${formatDate(start, start.slice(0, 4) !== end.slice(0, 4))} – ${formatDate(end)}`;
}

/** The agency block with links resolved and bookkeeping removed, for comparing two versions. */
function comparable(a: AgencyRef) {
  return {
    dates: agencyDatesOf(a).map((d) => ({ kind: d.kind, label: d.label, start: d.start || "", end: d.end, cycle: d.cycle, status: d.status, residency: d.residency || "", note: d.note || "", url: linkOf(a, d) })),
    seasons: (a.seasons || []).map((s) => ({ label: s.label, start: s.start, end: s.end, year: s.year, scope: s.scope, url: linkOf(a, s) })),
    seasonText: a.seasonText || "",
    fees: a.fees.map((f) => `${f.item}|${f.amountUsd}|${f.licenseYear}|${f.note || ""}|${linkOf(a, f)}`).sort(),
    oddsNote: a.oddsNote,
    rest: JSON.stringify([a.description, a.drawYear, a.units, a.drawSummary || "", a.residencyNote || "", a.otcSummary || "", a.requirements || [], a.pointName || "", a.minPoints ?? null, a.oddsPct ?? null, a.agencyName, a.unitTerm, a.sourceUrl]),
    cycle: cycleInfo(a),
  };
}

/** What changed between the saved agency block and a freshly built one, in plain words. Empty when nothing did. */
export function describeAgencyChanges(old: AgencyRef, fresh: AgencyRef): string[] {
  const a = comparable(old);
  const b = comparable(fresh);
  const who = fresh.agencyShortName || fresh.agencyName;
  const out: string[] = [];

  if (!a.cycle.published && b.cycle.published && b.cycle.datesCycle !== null) out.push(`${who} published ${b.cycle.datesCycle} dates`);
  else if (a.cycle.published && !b.cycle.published && b.cycle.datesCycle !== null) out.push(`The ${a.cycle.datesCycle} application period has passed; ${who} hasn't published ${b.cycle.planCycle} dates yet`);
  else if (a.cycle.datesCycle !== b.cycle.datesCycle && b.cycle.datesCycle !== null) out.push(`Dates are now for the ${b.cycle.datesCycle} cycle`);

  const v1 = old.keyDates === undefined;
  if (v1 && b.dates.length) {
    out.push(`Added every ${who} date for this hunt (${b.dates.length}), its season dates and requirements`);
  } else {
    const key = (d: { kind: string; label: string }) => `${d.kind}|${d.label.toLowerCase()}`;
    const before = new Map(a.dates.map((d) => [key(d), d] as const));
    const after = new Map(b.dates.map((d) => [key(d), d] as const));
    for (const [k, d] of after) {
      const was = before.get(k);
      if (!was) out.push(`New: ${d.label}, ${span(d.start, d.end)}${d.status === "tentative" ? " (tentative)" : ""}`);
      else if (was.start !== d.start || was.end !== d.end) out.push(`${d.label}: ${span(was.start, was.end)} → ${span(d.start, d.end)}`);
      else if (was.status !== d.status) out.push(`${d.label} is now ${d.status}`);
    }
    for (const [k, d] of before) if (!after.has(k)) out.push(`No longer listed: ${d.label} (${span(d.start, d.end)})`);
  }

  const seasonsOf = (x: typeof a) => x.seasons.map((s) => `${s.label}|${s.start}|${s.end}|${s.scope}`).join(";") + `|${x.seasonText}`;
  if (seasonsOf(a) !== seasonsOf(b)) {
    const year = fresh.seasonYear;
    out.push(b.seasons.length || b.seasonText ? `Season dates updated${year ? ` (${year})` : ""}` : "Season dates no longer listed");
  }
  if (a.fees.join(";") !== b.fees.join(";")) {
    const years = Array.from(new Set(fresh.fees.map((f) => f.licenseYear))).sort();
    out.push(`Fees updated${years.length ? ` (license year ${years.join(", ")})` : ""}`);
  }
  if (a.oddsNote !== b.oddsNote && b.oddsNote) out.push(`Draw figures: ${b.oddsNote}`);
  if (!out.length && (a.rest !== b.rest || JSON.stringify(a.dates) !== JSON.stringify(b.dates) || JSON.stringify(a.seasons) !== JSON.stringify(b.seasons))) {
    out.push(`Other ${who} details updated`);
  }
  return out;
}

/**
 * The hunt with a fresh agency block, keeping everything the member entered
 * (see withAgencyBlock). `updatedAt` isn't touched: it marks the member's own
 * edits, so a refresh never makes this copy win over an edit made elsewhere
 * (mergePlanners picks the agency block by its refreshedAt instead).
 * Returns the original object (and no changes) when nothing changed.
 */
export function refreshHunt(h: PlannedHunt, fresh: AgencyRef, now: string): { hunt: PlannedHunt; changes: string[] } {
  const old = h.agency;
  if (!old) return { hunt: h, changes: [] };
  const changes = describeAgencyChanges(old, fresh);
  if (!changes.length) return { hunt: h, changes };
  return { hunt: withAgencyBlock(h, { ...fresh, addedAt: old.addedAt, refreshedAt: now }), changes };
}

export interface HuntUpdate {
  id: string;
  changes: string[];
}

/** Apply fresh agency blocks (by hunt id) to a planner. Hunts without one are left as they are. */
export function refreshPlanner(data: PlannerData, fresh: ReadonlyMap<string, AgencyRef>, now: string): { data: PlannerData; updates: HuntUpdate[] } {
  const updates: HuntUpdate[] = [];
  let changed = false;
  const hunts = data.hunts.map((h) => {
    const f = fresh.get(h.id);
    if (!f || !h.agency) return h;
    const r = refreshHunt(h, f, now);
    if (r.changes.length) {
      changed = true;
      updates.push({ id: h.id, changes: r.changes });
    }
    return r.hunt;
  });
  return { data: changed ? { ...data, hunts } : data, updates };
}
