import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAllStateData } from "@/lib/agency";
import { todayIso } from "@/lib/agency-format";
import { listMembersWithPreferences, type Member } from "@/lib/members";
import { sendEmail } from "@/lib/onboarding";
import { buildDigest, parseIsoDay, type Digest } from "@/lib/reminder-digest";
import { canSignUnsubscribe } from "@/lib/reminder-unsubscribe";
import { stripe } from "@/lib/stripe";

// Daily (vercel.json crons, 14:00 UTC) deadline reminder digests: one email per
// member per day, only when one of their key dates is 14 or 3 days out or an
// application window opens today. Vercel sends `Authorization: Bearer $CRON_SECRET`.
//
// GET /api/cron/deadline-reminders            send today's digests
// GET /api/cron/deadline-reminders?dryRun=1   list them without sending
//                                 &today=YYYY-MM-DD  (dry runs only) pretend it's another day

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Resend's default limit is 2 requests/second.
const SEND_GAP_MS = 550;
// Leave headroom under maxDuration; anything left is reported, not dropped silently.
const SEND_BUDGET_MS = 50_000;

function authorized(req: NextRequest, secret: string): boolean {
  const got = Buffer.from(req.headers.get("authorization") || "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

function mask(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 2)}***@${domain || ""}`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 500 });
  if (!authorized(req, secret)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const dryRun = params.get("dryRun") === "1";
  const todayParam = params.get("today");
  if (todayParam !== null && !dryRun) {
    return NextResponse.json({ error: "today is only allowed with dryRun=1." }, { status: 400 });
  }
  const today = todayParam !== null ? parseIsoDay(todayParam) : todayIso();
  if (!today) return NextResponse.json({ error: "today must be YYYY-MM-DD." }, { status: 400 });

  if (!canSignUnsubscribe()) return NextResponse.json({ error: "AUTH_SECRET is not set; unsubscribe links can't be signed." }, { status: 500 });
  if (!stripe) return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  if (!dryRun && !process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not set; nothing sent." }, { status: 503 });
  }

  const started = Date.now();
  let listed;
  try {
    listed = await listMembersWithPreferences();
  } catch (err) {
    console.error("deadline-reminders: member list failed:", err);
    return NextResponse.json({ error: "Couldn't list members from Stripe." }, { status: 502 });
  }
  const states = await getAllStateData();

  const digests: { member: Member; digest: Digest }[] = [];
  for (const member of listed.members) {
    const digest = buildDigest(member, states, today);
    if (digest) digests.push({ member, digest });
  }

  const summary = {
    job: "deadline-reminders",
    today,
    dryRun,
    ...listed.stats,
    withDue: digests.length,
    items: digests.reduce((n, d) => n + d.digest.items.length, 0),
    sent: 0,
    failed: 0,
    deferred: 0,
  };

  if (dryRun) {
    console.log(JSON.stringify(summary));
    return NextResponse.json({
      ...summary,
      digests: digests.map(({ member, digest }) => ({
        email: member.email,
        name: member.name,
        states: member.states,
        species: member.species,
        subject: digest.email.subject,
        idempotencyKey: digest.idempotencyKey,
        items: digest.items,
        text: digest.email.text,
      })),
    });
  }

  const failures: string[] = [];
  for (let i = 0; i < digests.length; i++) {
    if (Date.now() - started > SEND_BUDGET_MS) {
      summary.deferred = digests.length - i;
      break;
    }
    const { member, digest } = digests[i];
    try {
      await sendEmail({
        to: member.email,
        email: digest.email,
        idempotencyKey: digest.idempotencyKey,
        headers: digest.headers,
        bcc: false,
      });
      summary.sent++;
    } catch (err) {
      summary.failed++;
      failures.push(mask(member.email));
      console.error(`deadline-reminders: send failed for ${mask(member.email)}:`, err);
    }
    if (i < digests.length - 1) await new Promise((r) => setTimeout(r, SEND_GAP_MS));
  }

  console.log(JSON.stringify({ ...summary, failures }));
  if (summary.deferred) console.error(`deadline-reminders: ran out of time, ${summary.deferred} digests not sent today`);
  return NextResponse.json({ ...summary, failures }, { status: summary.failed || summary.deferred ? 207 : 200 });
}
