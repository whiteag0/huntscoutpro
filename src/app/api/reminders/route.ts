import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlement";
import { readPreferences } from "@/lib/preferences";
import { remindersOffFor, setRemindersOff } from "@/lib/members";
import { getAllStateData } from "@/lib/agency";
import { todayIso } from "@/lib/agency-format";
import { nextReminderDates } from "@/lib/reminders";

export const dynamic = "force-dynamic";

async function member() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401 }) };
  const ent = await getEntitlement(email);
  if (!ent.isPro) return { error: NextResponse.json({ error: "Pro membership required." }, { status: 403 }) };
  return { email, ent };
}

/**
 * The signed-in member's reminder setting and the preferences it uses.
 * available=false when there's no purchase on file to store it on (admin / manual grants).
 */
export async function GET() {
  const m = await member();
  if ("error" in m) return m.error;
  if (!m.ent.paymentIntentId) {
    return NextResponse.json({ available: false, enabled: false, states: [], species: [], residency: "", homeState: "", upcoming: [] });
  }
  try {
    // Off when any purchase carries the flag, exactly like the daily job decides.
    const [{ preferences }, off] = await Promise.all([readPreferences(m.ent.paymentIntentId), remindersOffFor(m.email)]);
    const prefs = {
      states: preferences?.states ?? [],
      species: preferences?.species ?? [],
      residency: preferences?.residency ?? "",
      homeState: preferences?.homeState ?? "",
    };
    // Next date per live state, filtered exactly like the daily emails.
    const upcoming = nextReminderDates({ email: m.email, ...prefs }, await getAllStateData(), todayIso());
    return NextResponse.json({ available: true, enabled: !off, ...prefs, upcoming });
  } catch (err) {
    console.error("Reminder settings read failed:", err);
    return NextResponse.json({ error: "Couldn't load your reminder settings." }, { status: 502 });
  }
}

/** Turn deadline reminders on or off: {enabled: boolean}. */
export async function POST(req: NextRequest) {
  const m = await member();
  if ("error" in m) return m.error;
  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json({ error: "Send {\"enabled\": true} or {\"enabled\": false}." }, { status: 400 });
  }
  if (!m.ent.paymentIntentId) {
    return NextResponse.json({ error: "Reminders need a purchase on file. Email support@huntscoutpro.com." }, { status: 409 });
  }
  try {
    const updated = await setRemindersOff(m.email, !body.enabled);
    if (updated === 0) {
      return NextResponse.json({ error: "We couldn't find your purchase. Email support@huntscoutpro.com." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, enabled: body.enabled });
  } catch (err) {
    console.error("Reminder settings save failed:", err);
    return NextResponse.json({ error: "Couldn't save right now. Please try again." }, { status: 502 });
  }
}
