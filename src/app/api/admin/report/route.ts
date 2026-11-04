import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement, normalizeEmail } from "@/lib/entitlement";
import { sanitizePreferences, type HuntingPreferences } from "@/lib/preferences-schema";
import { readPreferences } from "@/lib/preferences";
import { pointsFromMetadata } from "@/lib/points";
import { parsePoints, sanitizePointsUpdate, type PointsMap } from "@/lib/points-schema";
import { parseIsoDay } from "@/lib/reminder-digest";
import { generateMemberReport, sendMemberReport } from "@/lib/report";
import { reportEmail } from "@/lib/emails/report";
import { reportFilename, REPORT_ERROR_KEY, REPORT_HASH_KEY, REPORT_SENT_KEY } from "@/lib/report-trigger";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Super admin: preview or (re)send a member's personal scouting report.
 *
 * Preview (never sends):
 *   {preferences: {...}, name?, points?: {"colorado.elk": 4} | "colorado.elk=4", today?: "YYYY-MM-DD", format?: "pdf" | "json" | "email"}
 *   {memberEmail, format?}  - the member's saved answers and points
 * Send:
 *   {memberEmail, action: "send"}              - (re)send to the member now, ignoring the once-a-day limit
 *   {memberEmail, action: "send", to: "me"}    - a [TEST] copy to the signed-in admin; the member's record is untouched
 *   {preferences: {...}, action: "send", to: "me"} - a [TEST] copy of a report for any answers
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const admin = session?.user?.email;
  if (!admin || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403, headers: NO_STORE });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Send a JSON body." }, { status: 400, headers: NO_STORE });

  let prefs: HuntingPreferences | null = null;
  let savedPoints: PointsMap = {};
  let name: string | null = typeof body.name === "string" ? body.name.slice(0, 80) : null;
  let member: { email: string; paymentIntentId: string | null; metadata: Record<string, string> } | null = null;

  if (typeof body.memberEmail === "string" && body.memberEmail.includes("@")) {
    const email = normalizeEmail(body.memberEmail);
    const ent = await getEntitlement(email);
    if (!ent.isPro) return NextResponse.json({ error: `${email} has no active Pro membership.` }, { status: 404, headers: NO_STORE });
    if (!ent.paymentIntentId) {
      return NextResponse.json({ error: `${email} has Pro (${ent.source}) but no purchase record, so no saved answers. Preview with a preferences payload instead.` }, { status: 409, headers: NO_STORE });
    }
    const saved = await readPreferences(ent.paymentIntentId);
    if (!saved.preferences) return NextResponse.json({ error: `${email} hasn't saved the /welcome form.` }, { status: 404, headers: NO_STORE });
    prefs = saved.preferences;
    savedPoints = pointsFromMetadata(saved.metadata);
    member = { email, paymentIntentId: ent.paymentIntentId, metadata: saved.metadata };
  } else {
    prefs = sanitizePreferences(body.preferences);
    if (!prefs || (prefs.states.length === 0 && prefs.species.length === 0)) {
      return NextResponse.json({ error: "Send memberEmail, or preferences with at least one state or species." }, { status: 400, headers: NO_STORE });
    }
    if (typeof body.points === "string") savedPoints = parsePoints(body.points).points;
    else if (body.points && typeof body.points === "object") savedPoints = sanitizePointsUpdate(body.points).set;
  }

  const today = body.today === undefined || body.today === null ? undefined : parseIsoDay(body.today);
  if (body.today != null && !today) return NextResponse.json({ error: "today must be YYYY-MM-DD." }, { status: 400, headers: NO_STORE });

  if (body.action === "send") {
    const toMe = body.to === "me";
    if (!toMe && !member) {
      return NextResponse.json({ error: 'A preferences payload can only be sent to yourself: add "to": "me".' }, { status: 400, headers: NO_STORE });
    }
    const result = await sendMemberReport({
      to: toMe ? admin : member!.email,
      name: name ?? (toMe ? session.user.name : null),
      prefs,
      savedPoints,
      paymentIntentId: member?.paymentIntentId ?? null,
      previousMetadata: member?.metadata,
      force: true,
      test: toMe,
    });
    return NextResponse.json({ to: toMe ? admin : member!.email, test: toMe, ...result }, { status: result.status === "failed" ? 502 : 200, headers: NO_STORE });
  }

  // Preview.
  const generated = await generateMemberReport({ name: name ?? (member ? null : session.user.name), prefs, savedPoints, today: today ?? undefined });
  name = name ?? generated.report.name;
  if (body.format === "json") {
    return NextResponse.json(
      {
        report: generated.report,
        pages: generated.pages,
        bytes: generated.pdf.length,
        timings: generated.timings,
        ...(member
          ? { member: { email: member.email, reportSentAt: member.metadata[REPORT_SENT_KEY] || null, reportHash: member.metadata[REPORT_HASH_KEY] || null, reportError: member.metadata[REPORT_ERROR_KEY] || null } }
          : {}),
        sent: false,
      },
      { headers: NO_STORE }
    );
  }
  if (body.format === "email") {
    const email = reportEmail({ report: generated.report, name, pages: generated.pages });
    return new Response(email.html, { headers: { "Content-Type": "text/html; charset=utf-8", ...NO_STORE } });
  }
  return new Response(new Uint8Array(generated.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${reportFilename(name).replace(/"/g, "")}"`,
      "X-Report-Pages": String(generated.pages),
      "X-Report-Timings": JSON.stringify(generated.timings),
      ...NO_STORE,
    },
  });
}
