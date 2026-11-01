import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlement";
import { POINTS_MAX_CHARS, sanitizePointsUpdate, serializePoints } from "@/lib/points-schema";
import { PointsTooLongError, readPoints, writePoints } from "@/lib/points";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

// Same gate as /api/preferences: signed in, then a live Pro entitlement.
async function member() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401, headers: NO_STORE }) };
  const ent = await getEntitlement(email);
  if (!ent.isPro) return { error: NextResponse.json({ error: "Pro membership required." }, { status: 403, headers: NO_STORE }) };
  return { ent };
}

/** The signed-in member's saved point balances: {points: {"colorado.elk": 5}, pts, stored}. */
export async function GET() {
  const m = await member();
  if ("error" in m) return m.error;
  // Admin and manual-override accounts have no purchase to store points on.
  if (!m.ent.paymentIntentId) return NextResponse.json({ points: {}, pts: "", stored: false }, { headers: NO_STORE });
  try {
    const points = await readPoints(m.ent.paymentIntentId);
    return NextResponse.json({ points, pts: serializePoints(points), stored: true }, { headers: NO_STORE });
  } catch (err) {
    console.error("Points read failed:", err);
    return NextResponse.json({ error: "Couldn't load your points." }, { status: 502, headers: NO_STORE });
  }
}

/**
 * Update point balances: {points: {"colorado.elk": 5, "utah.elk": null}}.
 * Entries are merged into what's saved; null or "" removes one. {replace: true} replaces the whole list.
 */
export async function POST(req: NextRequest) {
  // JSON only: a cross-site form can't send this content type without a CORS preflight.
  if (!(req.headers.get("content-type") || "").toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Send JSON." }, { status: 415, headers: NO_STORE });
  }
  const m = await member();
  if ("error" in m) return m.error;

  const body = await req.json().catch(() => null);
  const { set, remove, invalid } = sanitizePointsUpdate(body?.points);
  if (invalid.length) {
    return NextResponse.json(
      { error: `Points must be whole numbers from 0 to 40 for a covered state and species. Not accepted: ${invalid.join(", ")}` },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!m.ent.paymentIntentId) {
    const points = { ...set };
    return NextResponse.json({ ok: true, stored: false, points, pts: serializePoints(points) }, { headers: NO_STORE });
  }

  try {
    const current = body?.replace === true ? {} : await readPoints(m.ent.paymentIntentId);
    const next = { ...current, ...set };
    for (const k of remove) delete next[k];
    const pts = await writePoints(m.ent.paymentIntentId, next);
    return NextResponse.json({ ok: true, stored: true, points: next, pts }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof PointsTooLongError) {
      return NextResponse.json(
        { error: `That's more point entries than we can store (${err.length} of ${POINTS_MAX_CHARS} characters). Clear some states you no longer apply in.` },
        { status: 400, headers: NO_STORE }
      );
    }
    console.error("Points save failed:", err);
    return NextResponse.json({ error: "Couldn't save your points right now. Please try again." }, { status: 502, headers: NO_STORE });
  }
}
