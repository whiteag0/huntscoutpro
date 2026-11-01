import { NextResponse } from "next/server";
import { todayIso } from "@/lib/agency-format";
import { NO_STORE, plannerMember, readJsonBody } from "@/lib/planner-auth";
import type { AgencyRef } from "@/lib/planner-schema";
import { refreshPlanner, type HuntUpdate } from "@/lib/planner-refresh";
import { freshAgencyFor, type RowCache } from "@/lib/planner-server";
import { PlannerConflictError, PlannerTooLargeError, PlannerUnavailableError, readPlanner, updatePlanner } from "@/lib/planner-store";

export const dynamic = "force-dynamic";

/**
 * Recompute the agency block of the member's saved hunts from current agency
 * data, so newly published dates, seasons, fees and draw results flow in.
 * Body: { ids?: string[] } (default: every hunt planned from agency data).
 * Only agency blocks change; status, notes, points, own dates and checklists stay.
 * Responds { updates: [{ id, changes: string[] }], checked, unmatched: string[], version }.
 */
export async function POST(req: Request) {
  const m = await plannerMember();
  if ("error" in m) return m.error;
  const parsed = await readJsonBody(req, 16 * 1024);
  if ("error" in parsed) return parsed.error;
  const rawIds = (parsed.body as { ids?: unknown } | null)?.ids;
  const only = Array.isArray(rawIds) ? new Set(rawIds.filter((x): x is string => typeof x === "string").slice(0, 200)) : null;

  try {
    const doc = await readPlanner(m.email);
    const today = todayIso();
    const now = new Date().toISOString();
    const cache: RowCache = new Map();
    const fresh = new Map<string, AgencyRef>();
    const unmatched: string[] = [];
    const targets = doc.data.hunts.filter((h) => h.agency && (!only || only.has(h.id)));
    for (const h of targets) {
      const f = await freshAgencyFor(h, today, now, cache);
      if (f) fresh.set(h.id, f);
      else unmatched.push(h.id);
    }
    const { doc: saved, result } = await updatePlanner<HuntUpdate[]>(m.email, (data) => {
      const r = refreshPlanner(data, fresh, now);
      return { data: r.updates.length ? r.data : null, result: r.updates };
    });
    return NextResponse.json({ updates: result, checked: targets.length, unmatched, version: saved.version }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof PlannerTooLargeError) {
      return NextResponse.json({ error: "Your planner is over the 200 KB limit, so updated dates couldn't be saved. Remove some hunts or notes." }, { status: 413, headers: NO_STORE });
    }
    if (err instanceof PlannerUnavailableError) {
      return NextResponse.json({ error: "Account sync is unavailable right now." }, { status: 503, headers: NO_STORE });
    }
    if (err instanceof PlannerConflictError) {
      return NextResponse.json({ error: "Your planner is being saved elsewhere. Try again in a moment." }, { status: 409, headers: NO_STORE });
    }
    console.error("Planner refresh failed:", err);
    return NextResponse.json({ error: "Couldn't check for updated dates." }, { status: 502, headers: NO_STORE });
  }
}
