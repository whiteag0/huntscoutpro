import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { todayIso } from "@/lib/agency-format";
import { NO_STORE, plannerMember, readJsonBody } from "@/lib/planner-auth";
import { findAgencyDuplicate, MAX_PLANNER_SIZE_TEXT, PLANNER_LIMITS, type PlannedHunt } from "@/lib/planner-schema";
import { assemblePlan, parsePlanRequest } from "@/lib/planner-server";
import { PlannerConflictError, PlannerTooLargeError, PlannerUnavailableError, readPlanner, updatePlanner } from "@/lib/planner-store";

export const dynamic = "force-dynamic";

/**
 * Plan one hunt: { state, species, residency, kind: "draw" | "otc" | "custom",
 * huntCode?, drawYear?, drawing?: "spring" | "fall", description?, unit?,
 * pointsOwned?, notes?, preview? }. The older { state, species, residency, row }
 * body still works (only row.huntCode and row.year are read).
 *
 * The entry's agency block (dates, seasons, fees, odds, notes) is built here from
 * the server's agency data, looked up by state / species / hunt code / year.
 * preview: true returns the assembled entry without saving (the review screen):
 *   { hunt, needsDrawing, duplicateOf? }
 * Otherwise it is saved to the member's planner: { status: "added" | "duplicate", hunt, version }.
 */
export async function POST(req: Request) {
  const m = await plannerMember();
  if ("error" in m) return m.error;
  const parsed = await readJsonBody(req, 64 * 1024);
  if ("error" in parsed) return parsed.error;
  const request = parsePlanRequest(parsed.body);
  if (!request) return NextResponse.json({ error: "That hunt couldn't be matched to agency data." }, { status: 400, headers: NO_STORE });
  const preview = (parsed.body as { preview?: unknown }).preview === true;

  const now = new Date().toISOString();
  const plan = await assemblePlan(request, todayIso(), now, `a${randomUUID().replace(/-/g, "").slice(0, 20)}`);
  if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status, headers: NO_STORE });
  const candidate = plan.hunt;

  try {
    if (preview) {
      const doc = await readPlanner(m.email).catch(() => null);
      const dup = doc ? findAgencyDuplicate(doc.data.hunts, candidate.agency!, candidate.species) : undefined;
      return NextResponse.json({ hunt: candidate, needsDrawing: plan.needsDrawing, ...(dup ? { duplicateOf: dup.id } : {}) }, { headers: NO_STORE });
    }
    const { doc, result } = await updatePlanner<{ status: "added" | "duplicate" | "full"; hunt: PlannedHunt }>(m.email, (data) => {
      const dup = findAgencyDuplicate(data.hunts, candidate.agency!, candidate.species);
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
      return NextResponse.json({ error: `Your planner is full (${MAX_PLANNER_SIZE_TEXT}). Remove some hunts or notes to add more.` }, { status: 413, headers: NO_STORE });
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
