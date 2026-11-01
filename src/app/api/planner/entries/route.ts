import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getStateData } from "@/lib/agency";
import { todayIso } from "@/lib/agency-format";
import { NO_STORE, plannerMember, readJsonBody } from "@/lib/planner-auth";
import { buildAgencyHunt, sanitizeDrawRow } from "@/lib/planner-agency";
import { findAgencyDuplicate, PLANNER_LIMITS, type PlannedHunt } from "@/lib/planner-schema";
import { PlannerConflictError, PlannerTooLargeError, PlannerUnavailableError, updatePlanner } from "@/lib/planner-store";

export const dynamic = "force-dynamic";

/**
 * Add one hunt from agency draw data to the member's planner.
 * Body: { state, species, residency, row } where row is the DrawRecord the page
 * shows. The deadline, fees and agency names come from the server's copy of the
 * state's agency meta; the hunt's figures come from the row.
 * Responds { status: "added" | "duplicate", hunt, version }.
 */
export async function POST(req: Request) {
  const m = await plannerMember();
  if ("error" in m) return m.error;
  const parsed = await readJsonBody(req, 64 * 1024);
  if ("error" in parsed) return parsed.error;
  const body = (parsed.body || {}) as { state?: unknown; species?: unknown; residency?: unknown; row?: unknown };

  const slug = typeof body.state === "string" ? body.state : "";
  const st = /^[a-z-]{2,40}$/.test(slug) ? await getStateData(slug) : null;
  const info = st?.species.find((s) => s.species === body.species);
  const residency = body.residency === "nonresident" ? "nonresident" : body.residency === "resident" ? "resident" : null;
  const row = info ? sanitizeDrawRow(body.row, info.species) : null;
  if (!st || !info || !residency || !row) {
    return NextResponse.json({ error: "That hunt couldn't be matched to agency data." }, { status: 400, headers: NO_STORE });
  }

  const now = new Date().toISOString();
  const candidate = buildAgencyHunt({ state: st, info, row, residency, today: todayIso(), now, id: `a${randomUUID().replace(/-/g, "").slice(0, 20)}` });

  try {
    const { doc, result } = await updatePlanner<{ status: "added" | "duplicate" | "full"; hunt: PlannedHunt }>(m.email, (data) => {
      const dup = findAgencyDuplicate(data.hunts, candidate.agency!);
      if (dup) return { data: null, result: { status: "duplicate", hunt: dup } };
      if (data.hunts.length >= PLANNER_LIMITS.hunts) return { data: null, result: { status: "full", hunt: candidate } };
      return { data: { ...data, hunts: [...data.hunts, candidate] }, result: { status: "added", hunt: candidate } };
    });
    if (result.status === "full") {
      return NextResponse.json({ error: `Your planner already has ${PLANNER_LIMITS.hunts} hunts. Remove one to add more.` }, { status: 413, headers: NO_STORE });
    }
    return NextResponse.json({ status: result.status, hunt: result.hunt, version: doc.version }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof PlannerTooLargeError) {
      return NextResponse.json({ error: "Your planner is full (200 KB). Remove some entries to add more." }, { status: 413, headers: NO_STORE });
    }
    if (err instanceof PlannerUnavailableError) {
      return NextResponse.json({ error: "Account sync is unavailable right now." }, { status: 503, headers: NO_STORE });
    }
    if (err instanceof PlannerConflictError) {
      return NextResponse.json({ error: "Your planner is being saved elsewhere. Try again in a moment." }, { status: 409, headers: NO_STORE });
    }
    console.error("Planner add failed:", err);
    return NextResponse.json({ error: "Couldn't add to your planner." }, { status: 502, headers: NO_STORE });
  }
}
