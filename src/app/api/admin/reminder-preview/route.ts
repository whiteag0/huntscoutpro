import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAllStateData } from "@/lib/agency";
import { todayIso } from "@/lib/agency-format";
import { sanitizePreferences } from "@/lib/preferences-schema";
import { buildDigest, parseIsoDay } from "@/lib/reminder-digest";
import { canSignUnsubscribe } from "@/lib/reminder-unsubscribe";

export const dynamic = "force-dynamic";

/**
 * Super admin QA: the deadline reminder digest the signed-in admin would get
 * for a test set of preferences. Never sends anything.
 * Body: {preferences: {states, species, residency, homeState}, today?: "YYYY-MM-DD", format?: "json" | "html"}
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!canSignUnsubscribe()) return NextResponse.json({ error: "AUTH_SECRET is not set." }, { status: 500 });

  const body = await req.json().catch(() => null);
  const prefs = sanitizePreferences(body?.preferences);
  if (!prefs || prefs.states.length === 0) {
    return NextResponse.json({ error: "Send preferences with at least one state." }, { status: 400 });
  }
  const today = body?.today === undefined || body?.today === null ? todayIso() : parseIsoDay(body.today);
  if (!today) return NextResponse.json({ error: "today must be YYYY-MM-DD." }, { status: 400 });

  const states = await getAllStateData();
  const member = {
    email,
    name: session.user.name,
    states: prefs.states,
    species: prefs.species,
    residency: prefs.residency,
    homeState: prefs.homeState,
  };
  const digest = buildDigest(member, states, today);

  if (body?.format === "html") {
    return new Response(digest?.email.html ?? "<p>Nothing due for these preferences on this day.</p>", {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({
    today,
    member,
    due: digest?.items.length ?? 0,
    items: digest?.items ?? [],
    groups: digest?.groups ?? [],
    email: digest ? { to: email, subject: digest.email.subject, headers: digest.headers, html: digest.email.html, text: digest.email.text } : null,
    sent: false,
  });
}
