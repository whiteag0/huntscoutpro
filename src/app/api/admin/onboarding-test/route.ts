import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/onboarding";
import { welcomeEmail, preferencesEmail } from "@/lib/emails/onboarding";

/** Admin only: send both onboarding emails to the signed-in admin, right now. */
export async function POST() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !session.user.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not set in this environment." }, { status: 503 });
  }
  const until = new Date();
  until.setUTCMonth(until.getUTCMonth() + 24);
  const test = (e: { subject: string; html: string; text: string }) => ({ ...e, subject: `[TEST] ${e.subject}` });
  try {
    await sendEmail({ to: email, email: test(welcomeEmail({ name: session.user.name, email, accessUntil: until })) });
    await sendEmail({ to: email, email: test(preferencesEmail({ name: session.user.name })) });
    return NextResponse.json({ sent: true, to: email });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
