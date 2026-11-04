import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAllStateData } from "@/lib/agency";
import { todayIso } from "@/lib/agency-format";
import { isStoreConfigured } from "@/lib/blob-store";
import { normalizeEmail } from "@/lib/entitlement";
import { selectFreeDigests, type FreeDigest, type FreeSelectionStats } from "@/lib/free-reminders-digest";
import { deleteSubscriber, isStalePending, listSubscribers } from "@/lib/free-reminders-store";
import { canSignFreeReminderLinks } from "@/lib/free-reminders-token";
import { listMembersWithPreferences, listRecentPurchases, remindersOffFor, stampPaymentIntent, type Member } from "@/lib/members";
import { OWNER_ALERTS_TO, sendEmail } from "@/lib/onboarding";
import type { RenderedEmail } from "@/lib/emails/onboarding";
import { onboardingCheckEmail, profileNudgeEmail } from "@/lib/emails/lifecycle";
import {
  CHECK_WINDOW_MS,
  LIFECYCLE_LOOKBACK_MS,
  NUDGE_KEYS,
  findLifecycleIssues,
  lifecycleCheckKey,
  nudgeIdempotencyKey,
  selectProfileNudges,
  type LifecycleIssue,
  type ProfileNudge,
} from "@/lib/lifecycle";
import { buildDigest, parseIsoDay, type Digest } from "@/lib/reminder-digest";
import { canSignUnsubscribe, unsubscribeUrl } from "@/lib/reminder-unsubscribe";
import { stripe } from "@/lib/stripe";

// Daily (vercel.json crons, 14:00 UTC) deadline reminder digests: one email per
// member per day, only when one of their key dates is 14 or 3 days out or an
// application window opens today. Vercel sends `Authorization: Bearer $CRON_SECRET`.
//
// Also sends free one-state subscribers (private Blob store, free-reminders/)
// their digest by the same rules, skipping addresses Pro reminders already
// cover. Pro digests go out first if time runs short.
//
// Lifecycle pass (src/lib/lifecycle.ts), on the same daily run because the Hobby
// plan allows few crons: emails the owner a list of recent purchases whose
// onboarding didn't finish (only when there are any; it goes out first), and
// nudges members whose hunting profile has no states 3 and 7 days after purchase
// (skipping anyone who turned reminder emails off).
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

  // Lifecycle pass. A Stripe problem here never blocks the digests.
  const lifecycle: { issues: LifecycleIssue[]; nudges: ProfileNudge[]; optedOut: number; error: string | null } = {
    issues: [],
    nudges: [],
    optedOut: 0,
    error: null,
  };
  if (stripe) {
    try {
      const nowMs = Date.now();
      const recent = await listRecentPurchases(LIFECYCLE_LOOKBACK_MS);
      lifecycle.issues = findLifecycleIssues(recent, nowMs);
      for (const n of selectProfileNudges(recent, nowMs)) {
        if (await remindersOffFor(n.record.email)) lifecycle.optedOut++;
        else lifecycle.nudges.push(n);
      }
    } catch (err) {
      console.error("deadline-reminders: lifecycle pass failed:", err);
      lifecycle.error = "Couldn't list recent purchases from Stripe; onboarding check and nudges skipped.";
    }
  }
  const checkRows = groupIssues(lifecycle.issues);

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
    checkIssues: lifecycle.issues.length,
    checkSent: 0,
    checkFailed: 0,
    nudgesDue: lifecycle.nudges.length,
    nudgesOptedOut: lifecycle.optedOut,
    nudgeSent: 0,
    nudgeFailed: 0,
    nudgeDeferred: 0,
    lifecycleError: lifecycle.error,
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
      check: checkRows,
      nudges: lifecycle.nudges.map((n) => ({
        email: n.record.email,
        step: n.step,
        species: n.species,
        paidAt: new Date(n.record.paidAtMs).toISOString(),
        idempotencyKey: nudgeIdempotencyKey(n.record.paymentIntentId, n.step),
      })),
    });
  }

  // The owner's check first (one email), then Pro digests, profile nudges, free digests.
  type Item = {
    kind: "check" | "pro" | "nudge" | "free";
    to: string;
    email: RenderedEmail;
    idempotencyKey: string;
    headers?: Record<string, string>;
    /** Stamp the durable marker once Resend has accepted it. */
    onSent?: () => Promise<void>;
  };
  const queue: Item[] = [
    ...(checkRows.length
      ? [{ kind: "check" as const, to: OWNER_ALERTS_TO, email: onboardingCheckEmail({ rows: checkRows, windowHours: CHECK_WINDOW_MS / 3_600_000 }), idempotencyKey: lifecycleCheckKey(lifecycle.issues, today) }]
      : []),
    ...digests.map(({ member, digest }) => ({ kind: "pro" as const, to: member.email, email: digest.email, idempotencyKey: digest.idempotencyKey, headers: digest.headers })),
    ...lifecycle.nudges.map((n): Item => {
      const unsub = unsubscribeUrl(n.record.email);
      return {
        kind: "nudge",
        to: n.record.email,
        email: profileNudgeEmail({ name: n.record.name, species: n.species, step: n.step, unsubscribeUrl: unsub }),
        idempotencyKey: nudgeIdempotencyKey(n.record.paymentIntentId, n.step),
        headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        onSent: () => stampPaymentIntent(n.record.paymentIntentId, { [NUDGE_KEYS[n.step]]: new Date().toISOString() }),
      };
    }),
    ...free.digests.map((d) => ({ kind: "free" as const, to: d.subscriber.email, email: d.email, idempotencyKey: d.idempotencyKey, headers: d.headers })),
  ];
  const failures: string[] = [];
  for (let i = 0; i < queue.length; i++) {
    if (Date.now() - started > SEND_BUDGET_MS) {
      const left = queue.slice(i);
      summary.deferred = left.filter((q) => q.kind === "pro").length;
      summary.nudgeDeferred = left.filter((q) => q.kind === "nudge").length;
      summary.freeDeferred = left.filter((q) => q.kind === "free").length;
      break;
    }
    const { kind, to, email, idempotencyKey, headers, onSent } = queue[i];
    try {
      await sendEmail({ to, email, idempotencyKey, headers, bcc: false });
      if (kind === "pro") summary.sent++;
      else if (kind === "free") summary.freeSent++;
      else if (kind === "nudge") summary.nudgeSent++;
      else summary.checkSent++;
    } catch (err) {
      if (kind === "pro") summary.failed++;
      else if (kind === "free") summary.freeFailed++;
      else if (kind === "nudge") summary.nudgeFailed++;
      else summary.checkFailed++;
      failures.push(`${kind}:${mask(to)}`);
      console.error(`deadline-reminders: ${kind} send failed for ${mask(to)}:`, err);
      if (i < queue.length - 1) await new Promise((r) => setTimeout(r, SEND_GAP_MS));
      continue;
    }
    // A lost marker could repeat a nudge after Resend's 24 h key window, so it's logged loudly.
    if (onSent) await onSent().catch((err) => console.error(`deadline-reminders: couldn't mark ${kind} sent for ${mask(to)}:`, err));
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
  const partial =
    summary.failed || summary.deferred || summary.freeFailed || summary.freeDeferred || free.error ||
    summary.checkFailed || summary.nudgeFailed || summary.nudgeDeferred || lifecycle.error;
  return NextResponse.json({ ...summary, failures }, { status: partial ? 207 : 200 });
}

/** One row per purchase for the owner's check email, problems combined. */
function groupIssues(issues: readonly LifecycleIssue[]) {
  const rows = new Map<string, { email: string; name: string | null; paidAtMs: number; paymentIntentId: string; problems: string[] }>();
  for (const i of issues) {
    const r = i.record;
    const row = rows.get(r.paymentIntentId) ?? { email: r.email, name: r.name, paidAtMs: r.paidAtMs, paymentIntentId: r.paymentIntentId, problems: [] };
    row.problems.push(i.problem);
    rows.set(r.paymentIntentId, row);
  }
  return [...rows.values()];
}
