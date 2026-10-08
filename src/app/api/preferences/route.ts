import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlement";
import { sanitizePreferences, METHOD_OPTIONS, GOAL_OPTIONS, type HuntingPreferences } from "@/lib/preferences-schema";
import { readPreferences, writePreferences, PREFS_EMAIL_ID_KEY } from "@/lib/preferences";
import { sendEmail, cancelScheduledEmail } from "@/lib/onboarding";
import { preferencesNotification } from "@/lib/emails/onboarding";
import { SPECIES_LABELS } from "@/data/types";

export const dynamic = "force-dynamic";

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
    return NextResponse.json({ preferences: null, onboarded: m.session!.user.onboarded === true });
  }
  try {
    const { preferences, onboarded } = await readPreferences(m.ent.paymentIntentId);
    return NextResponse.json({ preferences, onboarded });
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

  // Durable copy on the purchase's PaymentIntent (when we have one).
  let reminderId: string | undefined;
  if (m.ent.paymentIntentId) {
    try {
      const current = await readPreferences(m.ent.paymentIntentId);
      reminderId = current.metadata[PREFS_EMAIL_ID_KEY];
      await writePreferences(m.ent.paymentIntentId, prefs);
    } catch (err) {
      console.error("Preferences save failed:", err);
      return NextResponse.json({ error: "Couldn't save right now. Please try again." }, { status: 502 });
    }
  }

  if (prefs) {
    // The owner gets every submission (reply goes straight to the member), and
    // the scheduled "tell us about your hunts" email is no longer needed.
    await sendEmail({
      to: NOTIFY_TO,
      replyTo: m.email,
      email: preferencesNotification({ name: m.session!.user.name, email: m.email, lines: labelLines(prefs) }),
    }).catch((err) => console.error("Preferences notification failed:", err));
    if (reminderId) await cancelScheduledEmail(reminderId).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
