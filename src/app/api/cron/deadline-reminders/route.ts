import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAllStateData } from "@/lib/agency";
import { todayIso } from "@/lib/agency-format";
import { isStoreConfigured } from "@/lib/blob-store";
import { normalizeEmail } from "@/lib/entitlement";
import { selectFreeDigests, type FreeDigest, type FreeSelectionStats } from "@/lib/free-reminders-digest";
import { deleteSubscriber, isStalePending, listSubscribers } from "@/lib/free-reminders-store";
import { canSignFreeReminderLinks } from "@/lib/free-reminders-token";
import { listMembersWithPreferences, type Member } from "@/lib/members";
import { sendEmail } from "@/lib/onboarding";
import { buildDigest, parseIsoDay, type Digest } from "@/lib/reminder-digest";
import { canSignUnsubscribe } from "@/lib/reminder-unsubscribe";
import { stripe } from "@/lib/stripe";

// Daily (vercel.json crons, 14:00 UTC) deadline reminder digests: one email per
// member per day, only when one of their key dates is 14 or 3 days out or an
// application window opens today. Vercel sends `Authorization: Bearer $CRON_SECRET`.
//
// Also sends free one-state subscribers (private Blob store, free-reminders/)
// their digest by the same rules, skipping addresses Pro reminders already
// cover. Pro digests go out first if time runs short.
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
  // A dry run without Stripe (local QA) still previews free digests, with no Pro members known.
  if (!stripe && !dryRun) return NextResponse.json({ error: "Stripe not configured." }, { status: 503 });
  if (!dryRun && !process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY is not set; nothing sent." }, { status: 503 });
  }

  const started = Date.now();
  let listed: Awaited<ReturnType<typeof listMembersWithPreferences>>;
  try {
    listed = stripe
      ? await listMembersWithPreferences()
      : { members: [], stats: { sessions: 0, active: 0, unique: 0, optedOut: 0, noStates: 0, members: 0 } };
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

  // Free subscribers. A storage problem never blocks the Pro digests.
  let free: { digests: FreeDigest[]; stats: FreeSelectionStats | null; stale: string[]; error: string | null } = {
    digests: [],
    stats: null,
    stale: [],
    error: null,
  };
  if (!isStoreConfigured()) free.error = "BLOB_STORE_ID is not set; free reminders skipped.";
  else if (!canSignFreeReminderLinks()) free.error = "AUTH_SECRET is not set; free reminders skipped.";
  else {
    try {
      const subscribers = await listSubscribers();
      // Every address the Pro list above emails about its own states.
      const coveredByPro = new Set(listed.members.map((m) => normalizeEmail(m.email)));
      const sel = selectFreeDigests(subscribers, { coveredByPro, states, today });
      free = { ...sel, stale: subscribers.filter((s) => isStalePending(s)).map((s) => s.id), error: null };
    } catch (err) {
      console.error("deadline-reminders: free subscriber list failed:", err);
      free.error = "Couldn't read free subscribers from the Blob store.";
    }
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
    ...(free.stats || {}),
    freeItems: free.digests.reduce((n, d) => n + d.items.length, 0),
    freeSent: 0,
    freeFailed: 0,
    freeDeferred: 0,
    freeStalePending: free.stale.length,
    freePruned: 0,
    freeError: free.error,
    ...(stripe ? {} : { proError: "Stripe not configured; Pro members unknown (dry run only)." }),
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
      freeDigests: free.digests.map((d) => ({
        email: d.subscriber.email,
        state: d.subscriber.state,
        species: d.subscriber.species,
        residency: d.subscriber.residency,
        subject: d.email.subject,
        idempotencyKey: d.idempotencyKey,
        items: d.items,
        text: d.email.text,
      })),
    });
  }

  // Pro first, then free.
  const queue = [
    ...digests.map(({ member, digest }) => ({ kind: "pro" as const, to: member.email, digest })),
    ...free.digests.map((d) => ({ kind: "free" as const, to: d.subscriber.email, digest: d })),
  ];
  const failures: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    if (Date.now() - started > SEND_BUDGET_MS) {
      const left = queue.slice(i);
      summary.deferred = left.filter((q) => q.kind === "pro").length;
      summary.freeDeferred = left.filter((q) => q.kind === "free").length;
      break;
    }
    const { kind, to, digest } = queue[i];
    try {
      await sendEmail({
        to,
        email: digest.email,
        idempotencyKey: digest.idempotencyKey,
        headers: digest.headers,
        bcc: false,
      });
      if (kind === "pro") summary.sent++;
      else summary.freeSent++;
    } catch (err) {
      if (kind === "pro") summary.failed++;
      else summary.freeFailed++;
      failures.push(`${kind}:${mask(to)}`);
      console.error(`deadline-reminders: ${kind} send failed for ${mask(to)}:`, err);
    }
    if (i < queue.length - 1) await new Promise((r) => setTimeout(r, SEND_GAP_MS));
  }

  // Housekeeping: never-confirmed signups older than 30 days. Only with time to spare.
  for (const id of free.stale) {
    if (Date.now() - started > SEND_BUDGET_MS) break;
    try {
      await deleteSubscriber(id);
      summary.freePruned++;
    } catch (err) {
      console.error("deadline-reminders: prune failed:", err);
      break;
    }
  }

  console.log(JSON.stringify({ ...summary, failures }));
  if (summary.deferred || summary.freeDeferred) {
    console.error(`deadline-reminders: ran out of time, ${summary.deferred} Pro and ${summary.freeDeferred} free digests not sent today`);
  }
  const partial = summary.failed || summary.deferred || summary.freeFailed || summary.freeDeferred || free.error;
  return NextResponse.json({ ...summary, failures }, { status: partial ? 207 : 200 });
}
