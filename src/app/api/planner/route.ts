import { NextResponse } from "next/server";
import { NO_STORE, plannerMember, readJsonBody } from "@/lib/planner-auth";
import { MAX_PLANNER_BYTES, MAX_PLANNER_SIZE_TEXT, PLANNER_SCHEMA } from "@/lib/planner-schema";
import {
  PlannerConflictError,
  PlannerInvalidError,
  PlannerTooLargeError,
  PlannerUnavailableError,
  plannerStorage,
  readPlanner,
  writePlanner,
} from "@/lib/planner-store";

export const dynamic = "force-dynamic";

/** The signed-in member's planner: { doc: { version, updatedAt, data }, storage }. */
export async function GET() {
  const m = await plannerMember();
  if ("error" in m) return m.error;
  try {
    const doc = await readPlanner(m.email);
    return NextResponse.json({ doc, storage: plannerStorage() }, { headers: NO_STORE });
  } catch (err) {
    return failure(err, "read");
  }
}

/**
 * Replace the planner: { schema, version: <version it was based on>, data }. 409 with { current } when stale.
 * `schema` must be the current planner schema: a page loaded before an upgrade reads newer
 * documents with its older validation (dropping fields it doesn't know, e.g. a hunt's own
 * checklist), so its writes are refused until it reloads instead of erasing them.
 */
export async function PUT(req: Request) {
  const m = await plannerMember();
  if ("error" in m) return m.error;
  const parsed = await readJsonBody(req, MAX_PLANNER_BYTES + 16 * 1024);
  if ("error" in parsed) return parsed.error;
  const body = parsed.body as { schema?: unknown; version?: unknown; data?: unknown } | null;
  if (body?.schema !== PLANNER_SCHEMA) {
    return NextResponse.json(
      { error: "HuntScout was updated. Reload this page to keep saving; your changes are kept on this device." },
      { status: 400, headers: NO_STORE }
    );
  }
  const version = body?.version;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) {
    return NextResponse.json({ error: "Missing version." }, { status: 400, headers: NO_STORE });
  }
  try {
    const doc = await writePlanner(m.email, body?.data, version);
    return NextResponse.json({ version: doc.version, updatedAt: doc.updatedAt }, { headers: NO_STORE });
  } catch (err) {
    return failure(err, "save");
  }
}

function failure(err: unknown, what: "read" | "save") {
  if (err instanceof PlannerConflictError) {
    return NextResponse.json({ error: "Your planner changed on another device or tab.", current: err.current }, { status: 409, headers: NO_STORE });
  }
  if (err instanceof PlannerTooLargeError) {
    return NextResponse.json({ error: `Your planner is over the ${MAX_PLANNER_SIZE_TEXT} limit. Remove some entries or notes and it will save.` }, { status: 413, headers: NO_STORE });
  }
  if (err instanceof PlannerInvalidError) {
    return NextResponse.json({ error: err.message }, { status: 400, headers: NO_STORE });
  }
  if (err instanceof PlannerUnavailableError) {
    return NextResponse.json({ error: "Account sync is unavailable right now." }, { status: 503, headers: NO_STORE });
  }
  console.error(`Planner ${what} failed:`, err);
  return NextResponse.json({ error: what === "read" ? "Couldn't load your planner." : "Couldn't save your planner." }, { status: 502, headers: NO_STORE });
}
