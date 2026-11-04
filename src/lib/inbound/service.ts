import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getAllStateData, readTable } from "@/lib/agency";
import { LIVE_STATE_SLUGS, todayIso } from "@/lib/agency-format";
import type { DrawRecord } from "@/data/agency/schema";
import { getEntitlement } from "@/lib/entitlement";
import { readPreferences } from "@/lib/preferences";
import { sendEmail } from "@/lib/onboarding";
import { approvalEmail, customerReplyEmail } from "@/lib/emails/replies";
import { INBOUND_LIMITS, adminEmail, inboundAddress, linkBase, replyModel, resendApiBase } from "@/lib/inbound/config";
import { buildDraftContext, membershipLine, type FactsState, type Membership } from "@/lib/inbound/context";
import { draftReply, gatewayGenerate, type GenerateFn } from "@/lib/inbound/draft";
import { parseReceived, screenInbound, threadingHeaders, type ReceivedEmail } from "@/lib/inbound/message";
import { claimRef, createThread, getThread, releaseRef, takeRate, threadForRefs, updateThread } from "@/lib/inbound/store";
import {
  appendMessage,
  cleanReplyText,
  inboundCount,
  inboundMessage,
  isSendStale,
  lastInbound,
  newThread,
  nextRev,
  newThreadId,
  type Draft,
  type Thread,
} from "@/lib/inbound/thread";
import { signActionToken } from "@/lib/inbound/tokens";

// The inbound pipeline. Logs carry ids and reasons only, never addresses, subjects or text.

const log = (msg: string, extra: Record<string, string | number | boolean | undefined> = {}) =>
  console.log(`[inbound] ${msg}`, JSON.stringify(extra));

const isResendId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{20,64}$/i.test(v);

/** GET /emails/receiving/{id}: the full message (the webhook carries metadata only). */
export async function fetchReceivedEmail(id: string): Promise<ReceivedEmail> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  const res = await fetch(`${resendApiBase()}/emails/receiving/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Resend receiving ${res.status}`);
  const text = await res.text();
  if (text.length > 30 * 1024 * 1024) throw new Error("Received email too large");
  try {
    return JSON.parse(text) as ReceivedEmail;
  } catch {
    // JSON.parse's message quotes the input, which is the customer's email: keep it out of the logs.
    throw new Error("Resend receiving: unreadable JSON");
  }
}

export type IntakeResult =
  | { status: "stored"; threadId: string; draft: boolean }
  | { status: "duplicate" | "ignored" | "invalid"; reason?: string; threadId?: string };

/** Store one received email. Throws on a transient failure so Resend retries the webhook. */
export async function intakeReceived(resendId: unknown, deps: { fetchEmail?: typeof fetchReceivedEmail } = {}): Promise<IntakeResult> {
  if (!isResendId(resendId)) return { status: "invalid", reason: "email_id" };
  const email = await (deps.fetchEmail ?? fetchReceivedEmail)(resendId);
  const parsed = parseReceived({ ...email, id: email.id || resendId });
  const own = [inboundAddress(), adminEmail(), "adam@huntscoutpro.com"].filter((x): x is string => !!x);
  const screen = screenInbound(email, parsed, { ownAddresses: own, inboundAddress: inboundAddress() });
  const dedupeKey = parsed?.messageId || `<resend-${resendId}@inbound.local>`;
  const now = new Date();

  if (!parsed || !screen.accept) {
    const reason = screen.accept ? "invalid" : screen.reason;
    // Keep a short record so a real customer caught by a filter is still visible on the admin page.
    if (parsed && reason !== "own-mail" && (await takeRate("ignored", INBOUND_LIMITS.ignoredPerDay))) {
      const id = newThreadId(now, randomBytes(8).toString("hex"));
      if (await claimRef(dedupeKey, id)) {
        const t = newThread(id, { ...parsed, text: parsed.text.slice(0, 2000), original: parsed.text.slice(0, 2000) }, now.toISOString());
        try {
          await createThread({ ...t, status: "ignored", ignoredReason: reason });
        } catch (err) {
          await releaseRef(dedupeKey);
          throw err;
        }
      }
    }
    log("ignored", { resendId, reason });
    return { status: "ignored", reason };
  }

  // A follow-up in a conversation we already have (their reply quotes our reply, whose References carry their earlier ids).
  const refs = [...parsed.references, ...(parsed.inReplyTo ? [parsed.inReplyTo] : [])];
  let existing: Thread | null = null;
  const found = refs.length ? await threadForRefs(refs) : null;
  if (found) {
    const cur = await getThread(found);
    if (cur && cur.thread.customer.email === parsed.fromEmail && cur.thread.status !== "ignored") existing = cur.thread;
  }
  const threadId = existing?.id ?? newThreadId(now, randomBytes(8).toString("hex"));
  if (!(await claimRef(dedupeKey, threadId))) {
    log("duplicate", { resendId });
    return { status: "duplicate" };
  }

  try {
    if (existing) {
      await updateThread(threadId, (t) => {
        if (t.messages.some((m) => m.resendId === parsed.resendId)) return null;
        const next = appendMessage(t, inboundMessage(parsed));
        return { ...next, status: next.status === "sending" ? "sending" : "pending" };
      });
    } else {
      await createThread(newThread(threadId, parsed, now.toISOString()));
    }
  } catch (err) {
    await releaseRef(dedupeKey);
    throw err;
  }

  // Flood guard: one sender gets at most a few drafts a day; the mail is stored either way.
  const draft = await takeRate("total", 100000, parsed.fromEmail, INBOUND_LIMITS.perSenderPerDay);
  if (!draft) {
    await updateThread(threadId, (t) => ({ ...t, draft: skippedDraft(t, "This sender reached today's draft limit.") }));
  }
  log("stored", { resendId, threadId, followUp: !!existing, draft });
  return { status: "stored", threadId, draft };
}

function skippedDraft(t: Thread, error: string): Draft {
  return {
    rev: nextRev(t),
    text: "",
    note: "",
    source: "manual",
    status: "skipped",
    error,
    basedOn: inboundCount(t),
    updatedAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------ drafting

function membershipOf(ent: Awaited<ReturnType<typeof getEntitlement>>): Membership {
  if (ent.source === "error") return { kind: "unknown" };
  if (ent.isPro) return { kind: "pro", until: ent.expiresAt, admin: ent.source === "admin" };
  if (ent.expiresAt) return { kind: "expired", until: ent.expiresAt };
  return { kind: "none" };
}

/** Membership + saved preferences for a sender. Never throws. */
async function customerContext(email: string) {
  let membership: Membership = { kind: "unknown" };
  let preferences = null;
  try {
    const ent = await getEntitlement(email);
    membership = membershipOf(ent);
    if (ent.paymentIntentId) preferences = (await readPreferences(ent.paymentIntentId)).preferences;
  } catch {
    log("customer lookup failed");
  }
  return { membership, preferences };
}

/** Local QA only: a canned draft instead of a model call (REPLY_MODEL_MOCK=1, never in production). */
const devMockGenerate: GenerateFn = async ({ prompt }) => {
  const date = prompt.match(/^- ([^\n]*\d{4} cycle[^\n]*)$/m)?.[1]?.replace(/ \[source:.*$/, "");
  const name = prompt.match(/^Name on their email: (.+)$/m)?.[1];
  const first = name && name !== "(none given)" ? name : "";
  return {
    text: `Hi${first ? ` ${first}` : ""},\n\nThanks for reaching out. ${
      date ? `From the agency's published dates: ${date}.` : "I don't have that in front of me, so I'll look into it and get back to you."
    }\n\nPlease confirm the dates with the agency before you apply.\n\nBest,\nAdam\n===NOTE FOR ADAM===\nMock draft (REPLY_MODEL_MOCK) for local testing.`,
  };
};

function pickGenerate(): GenerateFn {
  if (process.env.REPLY_MODEL_MOCK === "1" && process.env.NODE_ENV !== "production" && !process.env.VERCEL) return devMockGenerate;
  return gatewayGenerate;
}

/**
 * Write (or rewrite) the AI draft for a pending thread and, if `notify`, email the owner.
 * A model failure still leaves the thread queued with a "failed" draft for a manual reply.
 */
export async function prepareDraft(threadId: string, opts: { notify?: boolean; generate?: GenerateFn } = {}): Promise<Thread | null> {
  const cur = await getThread(threadId);
  if (!cur || cur.thread.status !== "pending") return cur?.thread ?? null;
  const t0 = cur.thread;
  const basedOn = inboundCount(t0);

  let draft: Draft;
  if (t0.draft?.status === "skipped" && t0.draft.basedOn === basedOn) {
    draft = t0.draft;
  } else if (!(await takeRate("drafts", INBOUND_LIMITS.draftsPerDay))) {
    draft = skippedDraft(t0, "Today's draft limit was reached.");
  } else {
    const model = replyModel();
    try {
      const { membership, preferences } = await customerContext(t0.customer.email);
      const states = (await getAllStateData()) as unknown as FactsState[];
      const drawRows = (slug: string, species: FactsState["species"][number]["species"]) => readTable<DrawRecord>(slug, "draw", species);
      const ctx = await buildDraftContext({ thread: t0, membership, preferences, states, liveSlugs: LIVE_STATE_SLUGS, today: todayIso(), drawRows });
      const res = await draftReply(ctx.prompt, { model, generate: opts.generate ?? pickGenerate() });
      if (!res.ok) log("draft failed", { threadId, error: res.error });
      draft = {
        rev: nextRev(t0),
        text: res.text,
        note: res.note,
        source: "ai",
        status: res.ok ? "ready" : "failed",
        error: res.ok ? undefined : "The AI draft failed.",
        model,
        basedOn,
        updatedAt: new Date().toISOString(),
        context: { ...ctx.summary, membershipLine: membershipLine(membership) },
      };
    } catch (err) {
      log("draft context failed", { threadId, error: err instanceof Error ? err.name : "error" });
      draft = { ...skippedDraft(t0, "The AI draft failed."), status: "failed", model };
    }
  }

  const saved = await updateThread(threadId, (t) => {
    if (t.status !== "pending") return null;
    // A newer message arrived while drafting: its own draft run replaces this one.
    if (inboundCount(t) !== basedOn && t.draft && t.draft.basedOn > basedOn) return null;
    return { ...t, draft: { ...draft, rev: Math.max(draft.rev, nextRev(t)) } };
  });

  if (opts.notify && saved.draft && saved.draft.basedOn === basedOn) await notifyOwner(saved);
  return saved;
}

export function actionLinks(t: Thread): { approveUrl: string | null; editUrl: string; adminUrl: string } {
  const base = linkBase();
  const ready = t.draft?.status === "ready" && !!t.draft.text;
  return {
    approveUrl: ready ? `${base}/admin/replies/${t.id}/approve?t=${signActionToken({ purpose: "approve", threadId: t.id, rev: t.draft!.rev })}` : null,
    editUrl: `${base}/admin/replies/${t.id}?t=${signActionToken({ purpose: "edit", threadId: t.id, rev: 0 })}`,
    adminUrl: `${base}/admin/replies`,
  };
}

/** "Reply ready" email to the owner. Rate-limited; failures are logged, not thrown. */
export async function notifyOwner(t: Thread): Promise<boolean> {
  if (!(await takeRate("notices", INBOUND_LIMITS.noticesPerDay))) {
    log("notice limit reached", { threadId: t.id });
    return false;
  }
  try {
    const links = actionLinks(t);
    const membership = t.draft?.context?.membershipLine || "Membership not checked.";
    const email = approvalEmail({ thread: t, membership, ...links });
    const owner = adminEmail();
    await sendEmail({
      to: owner,
      email,
      replyTo: owner,
      bcc: false,
      idempotencyKey: `hs-reply-ready-${t.id}-${t.draft?.rev ?? 0}`,
      headers: { "Auto-Submitted": "auto-generated", "X-Auto-Response-Suppress": "All" },
    });
    log("owner notified", { threadId: t.id, rev: t.draft?.rev ?? 0 });
    return true;
  } catch (err) {
    log("owner notice failed", { threadId: t.id, error: err instanceof Error ? err.name : "error" });
    return false;
  }
}

// ------------------------------------------------------------ owner actions

export class ReplyActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplyActionError";
  }
}

export async function saveDraft(threadId: string, rawText: unknown): Promise<Thread> {
  const text = cleanReplyText(rawText);
  return updateThread(threadId, (t) => {
    if (t.status !== "pending") throw new ReplyActionError("This thread isn't waiting for a reply.");
    if (t.draft?.text === text) return null;
    const draft: Draft = {
      ...(t.draft ?? { note: "", basedOn: inboundCount(t), status: "ready", rev: 0 }),
      rev: nextRev(t),
      text,
      source: t.draft?.source === "ai" || t.draft?.source === "edited" ? "edited" : "manual",
      status: text ? "ready" : (t.draft?.status ?? "ready"),
      error: text ? undefined : t.draft?.error,
      updatedAt: new Date().toISOString(),
    } as Draft;
    return { ...t, draft };
  });
}

export async function setThreadStatus(threadId: string, status: "dismissed" | "pending"): Promise<Thread> {
  return updateThread(threadId, (t) => {
    if (status === "dismissed" && (t.status === "sending" || t.status === "sent")) throw new ReplyActionError("Already sent.");
    if (status === "pending" && t.status !== "dismissed" && t.status !== "ignored" && !isSendStale(t)) return null;
    return { ...t, status, sendingAt: undefined };
  });
}

/**
 * Send the reply. Only ever goes to the thread's stored customer address, from Adam, threaded on
 * their latest message. `expectRev` pins an approve link to the draft revision it was made for;
 * `nonce` makes a link single-use. Safe against double clicks: the thread moves to "sending" first.
 */
export async function sendReply(threadId: string, opts: { text?: unknown; expectRev?: number; nonce?: string }): Promise<Thread> {
  let finalText = "";
  let sendNo = 0;
  let answered = 0;
  const claimed = await updateThread(threadId, (t) => {
    if (t.status === "sent" && opts.expectRev !== undefined) throw new ReplyActionError("This reply was already sent.");
    if (t.status === "sending" && !isSendStale(t)) throw new ReplyActionError("This reply is being sent right now.");
    if (t.status !== "pending" && t.status !== "sending") throw new ReplyActionError("This thread isn't waiting for a reply.");
    if (opts.nonce && t.usedNonces.includes(opts.nonce)) throw new ReplyActionError("This link was already used.");
    if (opts.expectRev !== undefined && t.draft?.rev !== opts.expectRev) {
      throw new ReplyActionError("The draft changed after this link was made. Open the editor to review the latest version.");
    }
    finalText = opts.text !== undefined ? cleanReplyText(opts.text) : cleanReplyText(t.draft?.text);
    if (finalText.length < 2) throw new ReplyActionError("The reply is empty.");
    if (!lastInbound(t)) throw new ReplyActionError("Nothing to reply to.");
    sendNo = t.sentCount + 1;
    answered = inboundCount(t);
    const edited = opts.text !== undefined && finalText !== t.draft?.text;
    return {
      ...t,
      status: "sending",
      sendingAt: new Date().toISOString(),
      usedNonces: opts.nonce ? [...t.usedNonces, opts.nonce] : t.usedNonces,
      draft: t.draft && edited ? { ...t.draft, text: finalText, rev: nextRev(t), source: "edited", updatedAt: new Date().toISOString() } : t.draft,
      lastError: undefined,
    };
  });

  const last = lastInbound(claimed)!;
  const email = customerReplyEmail(claimed, finalText, last);
  const headers = threadingHeaders(last);
  try {
    const id = await sendEmail({
      to: claimed.customer.email,
      email,
      replyTo: inboundAddress() || undefined,
      headers,
      // Same thread + send number + text: a retry within Resend's 24 h window can't send twice.
      idempotencyKey: `hs-reply-${threadId}-${sendNo}-${createHash("sha256").update(finalText).digest("hex").slice(0, 16)}`,
    });
    if (!id) throw new Error("RESEND_API_KEY not set");
    // A customer message that arrived while this was sending wasn't answered by it: the thread
    // stays open for that one (the caller drafts it), instead of being marked sent and forgotten.
    const sent = await updateThread(threadId, (t) => ({
      ...appendMessage(t, {
        direction: "out",
        at: new Date().toISOString(),
        messageId: null,
        inReplyTo: headers["In-Reply-To"] ?? null,
        references: headers.References ? headers.References.split(" ") : [],
        text: finalText,
        resendId: id === "sent" ? null : id,
      }),
      status: inboundCount(t) > answered ? "pending" : "sent",
      sendingAt: undefined,
      sentCount: t.sentCount + 1,
      draft: null,
    }));
    log("reply sent", { threadId, sendNo });
    return sent;
  } catch (err) {
    const msg = err instanceof Error ? err.message.split(":")[0].slice(0, 120) : "send failed";
    log("reply send failed", { threadId, error: msg });
    await updateThread(threadId, (t) => ({
      ...t,
      status: "pending",
      sendingAt: undefined,
      lastError: `Sending failed (${msg}). Nothing was sent; try again.`,
      usedNonces: opts.nonce ? t.usedNonces.filter((n) => n !== opts.nonce) : t.usedNonces,
    })).catch(() => {});
    throw new ReplyActionError(`Sending failed (${msg}). Nothing was sent; try again.`);
  }
}
