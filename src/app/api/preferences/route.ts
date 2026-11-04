import { createHash } from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlement";
import { sanitizePreferences, METHOD_OPTIONS, GOAL_OPTIONS, type HuntingPreferences } from "@/lib/preferences-schema";
import { readPreferences, writePreferences, PREFS_EMAIL_ID_KEY, PREFS_NOTIFY_ERROR_KEY } from "@/lib/preferences";
import { sendEmail, cancelScheduledEmail } from "@/lib/onboarding";
import { preferencesNotification } from "@/lib/emails/onboarding";
import { SPECIES_LABELS } from "@/data/types";
import { pointsFromMetadata } from "@/lib/points";
import { stripe } from "@/lib/stripe";
import { REPORT_PENDING_KEY, reportDecision, reportInputHash, type ReportDecision } from "@/lib/report-trigger";

export const dynamic = "force-dynamic";
// The personal scouting report is built and emailed after the response (next/server after()),
// within this function's time budget: typically a few seconds, most of it rendering the PDF.
export const maxDuration = 60;

const NOTIFY_TO = process.env.PREFERENCES_NOTIFY_TO || "adam@huntscoutpro.com";

async function member() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const ent = await getEntitlement(email);
  if (!ent.isPro) return { error: NextResponse.json({ error: "Pro membership required." }, { status: 403 }) };
  return { session, email, ent };
}

/** The signed-in member's saved hunting preferences. */
export async function GET() {
  const m = await member();
  if ("error" in m) return m.error;
  if (!m.ent.paymentIntentId) {
    // stored: false — no purchase record to save answers on (manual grants).
    return NextResponse.json({ preferences: null, onboarded: m.session!.user.onboarded === true, stored: false });
  }
  try {
    const { preferences, onboarded } = await readPreferences(m.ent.paymentIntentId);
    return NextResponse.json({ preferences, onboarded, stored: true });
  } catch (err) {
    console.error("Preferences read failed:", err);
    return NextResponse.json({ error: "Couldn't load your preferences." }, { status: 502 });
  }
}

function labelLines(p: HuntingPreferences): [string, string][] {
  const label = (ids: string[], opts: readonly { id: string; label: string }[]) =>
    ids.map((id) => opts.find((o) => o.id === id)?.label || id).join(", ");
  const species = p.species.map((id) => (SPECIES_LABELS as Record<string, string>)[id] || id).join(", ");
  return [
    ["States", p.states.join(", ")],
    ["Residency", p.residency],
    ["Home state", p.homeState],
    ["Species", species],
    ["Units / GMUs", p.units],
    ["Method of take", label(p.methods, METHOD_OPTIONS)],
    ["Points", p.points],
    ["Success looks like", label(p.goals, GOAL_OPTIONS)],
    ["Notes / feedback", p.notes],
  ];
}

/**
 * Email the owner a member's answers. One retry; if both attempts fail, the failure is
 * stamped on the PaymentIntent so the daily onboarding check (cron) reports it. A later
 * save that sends clears the stamp. The idempotency key makes the retry safe when the
 * first attempt was delivered but its response was lost.
 */
async function notifyOwner(opts: { email: string; name?: string | null; prefs: HuntingPreferences; paymentIntentId: string | null; hadError: boolean }) {
  const email = preferencesNotification({ name: opts.name, email: opts.email, lines: labelLines(opts.prefs) });
  const key = `hs-prefs-notify-${createHash("sha256").update(`${NOTIFY_TO}|${email.subject}|${email.text}`).digest("hex").slice(0, 40)}`;
  let error: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const id = await sendEmail({ to: NOTIFY_TO, replyTo: opts.email, email, idempotencyKey: key });
      // null: no email service configured (local and preview); a retry can't help.
      error = id ? null : "RESEND_API_KEY not set";
      break;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      console.error(`Preferences notification failed (attempt ${attempt + 1}):`, err);
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!stripe || !opts.paymentIntentId || (!error && !opts.hadError)) return;
  await stripe.paymentIntents
    .update(opts.paymentIntentId, { metadata: { [PREFS_NOTIFY_ERROR_KEY]: error ? `${new Date().toISOString()} ${error}`.slice(0, 480) : "" } })
    .catch((err) => console.error(`Could not record the preferences notification status on ${opts.paymentIntentId}:`, err));
}

/** Save the /welcome form ({preferences}) or record a skip ({skip: true}). */
export async function POST(req: NextRequest) {
  const m = await member();
  if ("error" in m) return m.error;

  const body = await req.json().catch(() => null);
  const skip = body?.skip === true;
  const prefs = skip ? null : sanitizePreferences(body?.preferences);
  if (!skip && (!prefs || (prefs.states.length === 0 && prefs.species.length === 0))) {
    return NextResponse.json({ error: "Pick at least one state or species." }, { status: 400 });
  }

  // Durable copy on the purchase's PaymentIntent (when we have one). Whether this save sends the
  // member's personal scouting report is decided against the record as it was before the save: the
  // first save sends it; later saves only when the answers that shape it change, at most once a day.
  // A queued send is stamped with the save so a double submit can't queue a second one. (Members
  // without a purchase record have no record: their sends are deduplicated by the idempotency key.)
  let reminderId: string | undefined;
  let before: Record<string, string> = {};
  let report: ReportDecision = "nothing-to-report";
  let savedPoints: ReturnType<typeof pointsFromMetadata> = {};
  if (m.ent.paymentIntentId) {
    try {
      const current = await readPreferences(m.ent.paymentIntentId);
      before = current.metadata;
      reminderId = current.metadata[PREFS_EMAIL_ID_KEY];
      savedPoints = pointsFromMetadata(before);
      if (prefs) {
        report = reportDecision({
          prefs,
          metadata: before,
          hash: reportInputHash(prefs, savedPoints),
          previousHash: current.preferences ? reportInputHash(current.preferences, savedPoints) : null,
          nowMs: Date.now(),
        });
      }
      await writePreferences(m.ent.paymentIntentId, prefs, report === "send" ? { [REPORT_PENDING_KEY]: new Date().toISOString() } : {});
    } catch (err) {
      console.error("Preferences save failed:", err);
      return NextResponse.json({ error: "Couldn't save right now. Please try again." }, { status: 502 });
    }
  } else if (prefs) {
    report = reportDecision({ prefs, metadata: {}, hash: reportInputHash(prefs), nowMs: Date.now() });
  }

  if (prefs) {
    // The owner gets every submission (reply goes straight to the member), sent after the
    // response so a retry doesn't slow the save. The scheduled "tell us about your hunts"
    // email is no longer needed.
    const notify = {
      email: m.email,
      name: m.session!.user.name,
      prefs,
      paymentIntentId: m.ent.paymentIntentId ?? null,
      hadError: !!before[PREFS_NOTIFY_ERROR_KEY],
    };
    after(() => notifyOwner(notify));
    if (reminderId) await cancelScheduledEmail(reminderId).catch(() => {});
  }

  // The member's personal scouting report: built and emailed in the background so saving stays
  // fast. The report code (PDF renderer, fonts) loads only here, not on every GET or save.
  if (prefs && report === "send") {
    const to = m.email;
    const name = m.session!.user.name;
    const paymentIntentId = m.ent.paymentIntentId ?? null;
    after(async () => {
      const { sendMemberReport } = await import("@/lib/report");
      await sendMemberReport({ to, name, prefs, savedPoints, paymentIntentId, previousMetadata: before });
    });
  }

  return NextResponse.json({ ok: true, report: report === "send" ? "queued" : report });
}
