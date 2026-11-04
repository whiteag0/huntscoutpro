import Link from "next/link";
import type { Metadata } from "next";
import { accessFor } from "@/lib/inbound/admin-auth";
import { getThread } from "@/lib/inbound/store";
import { isSendStale, isThreadId } from "@/lib/inbound/thread";
import { replySubject } from "@/lib/inbound/message";
import { STATE_LIST } from "@/data/state-list";
import { dismissAction, regenerateAction, reopenAction, saveDraftAction, sendFromEditorAction } from "../actions";
import { ConfirmSubmit } from "../ConfirmSubmit";
import { MessageCard, Notice, Shell, StatusBadge, inputClass, primaryBtn, secondaryBtn } from "../ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reply", robots: { index: false, follow: false }, referrer: "no-referrer" };

const DONE: Record<string, string> = {
  saved: "Draft saved.",
  sent: "Reply sent.",
  redrafted: "New draft written.",
  dismissed: "Dismissed. No reply will be sent.",
  reopened: "Reopened.",
};

export default async function ReplyThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; done?: string; error?: string }>;
}) {
  const { id } = await params;
  const { t: token = "", done, error } = await searchParams;

  if (!isThreadId(id)) return <Shell title="Reply"><Notice kind="error">Not found.</Notice></Shell>;
  // Check access before loading anything, then the link's single-use nonce against the thread.
  let access = await accessFor(null, id, token || null, "edit");
  const thread = access.ok ? ((await getThread(id).catch(() => null))?.thread ?? null) : null;
  if (access.ok && access.via === "token" && thread?.usedNonces.includes(access.token.n)) {
    access = { ok: false, reason: "This link was already used." };
  }

  if (!access.ok) {
    // After a link-based send the link is spent; still confirm the send without showing the thread.
    if (done === "sent") return <Shell title="Reply"><Notice kind="ok">Reply sent. You can close this page.</Notice></Shell>;
    return (
      <Shell title="Reply">
        <Notice kind="error">{access.reason}</Notice>
        <Link href={`/signin?callbackUrl=${encodeURIComponent(`/admin/replies/${id}`)}`} className={secondaryBtn}>
          Sign in
        </Link>
      </Shell>
    );
  }
  if (!thread) return <Shell title="Reply"><Notice kind="error">This thread doesn&apos;t exist.</Notice></Shell>;

  const d = thread.draft;
  const canReply = thread.status === "pending" || isSendStale(thread);
  const viaToken = access.via === "token";
  const hidden = (
    <>
      <input type="hidden" name="id" value={thread.id} />
      {viaToken && <input type="hidden" name="t" value={token} />}
    </>
  );
  const ctx = d?.context;

  return (
    <Shell
      title={thread.subject || "(no subject)"}
      aside={
        access.via === "session" ? (
          <Link href="/admin/replies" className="text-sm text-muted-foreground hover:text-foreground">
            ← All replies
          </Link>
        ) : undefined
      }
    >
      {done && DONE[done] && <Notice kind="ok">{DONE[done]}</Notice>}
      {error && <Notice kind="error">{error.slice(0, 300)}</Notice>}
      {thread.lastError && canReply && !error && <Notice kind="error">{thread.lastError}</Notice>}

      <section className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        <StatusBadge status={thread.status} />
        <span className="min-w-0 break-all" data-clarity-mask="true">
          <span className="text-muted-foreground">From </span>
          {thread.customer.name ? `${thread.customer.name} <${thread.customer.email}>` : thread.customer.email}
        </span>
        {ctx?.membershipLine && <span className="text-muted-foreground">{ctx.membershipLine}</span>}
      </section>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Conversation</h2>
      <div className="mb-8 space-y-3">
        {thread.messages.map((m, i) => (
          <MessageCard key={i} m={m} thread={thread} />
        ))}
      </div>

      {thread.status === "ignored" && (
        <Notice kind="info">
          This message was filtered out ({thread.ignoredReason}) and got no draft. If it&apos;s a real customer, reopen it to write a reply.
        </Notice>
      )}

      {canReply ? (
        <section aria-labelledby="draft-h" className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="draft-h" className="text-lg font-bold text-foreground">
              Your reply
            </h2>
            <p className="text-xs text-muted-foreground">
              {d?.status === "ready"
                ? `${d.source === "ai" ? "AI draft" : d.source === "edited" ? "AI draft, edited" : "Written by you"} · revision ${d.rev}`
                : d?.status === "failed" || d?.status === "skipped"
                  ? d.error
                  : "No draft yet. Write one, or ask for an AI draft."}
            </p>
          </div>
          <p className="mb-3 break-all text-xs text-muted-foreground" data-clarity-mask="true">
            To {thread.customer.email} · Subject “{replySubject(thread.subject)}” · from Adam (adam@huntscoutpro.com), in the same thread
          </p>

          {d?.note && d.status === "ready" && (
            <div className="mb-3 rounded-xl border border-[#c9d3f0] bg-[#f6f8ff] px-4 py-3 text-sm text-foreground">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#4a5a8a]">Note for you (not sent)</p>
              <p className="whitespace-pre-wrap" data-clarity-mask="true">{d.note}</p>
            </div>
          )}

          <form>
            {hidden}
            <label htmlFor="reply-text" className="sr-only">
              Reply text
            </label>
            <textarea
              id="reply-text"
              name="text"
              rows={14}
              defaultValue={d?.text ?? ""}
              placeholder="Write your reply. Your signature is added automatically."
              className={inputClass}
              data-clarity-mask="true"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">Your signature and their quoted message are added below the text when it&apos;s sent.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ConfirmSubmit
                formAction={sendFromEditorAction}
                className={primaryBtn}
                confirm={`Send this reply to ${thread.customer.email}?`}
                pendingLabel="Sending…"
              >
                Approve &amp; send
              </ConfirmSubmit>
              <ConfirmSubmit formAction={saveDraftAction} className={secondaryBtn} pendingLabel="Saving…">
                Save draft
              </ConfirmSubmit>
              <ConfirmSubmit
                formAction={regenerateAction}
                className={secondaryBtn}
                confirm="Replace the text above with a new AI draft?"
                pendingLabel="Drafting…"
              >
                New AI draft
              </ConfirmSubmit>
              <ConfirmSubmit formAction={dismissAction} className={`${secondaryBtn} sm:ml-auto`} confirm="Dismiss without replying?" pendingLabel="…">
                Dismiss
              </ConfirmSubmit>
            </div>
          </form>

          {ctx && (
            <p className="mt-4 text-xs text-muted-foreground">
              Draft context: membership {ctx.membership}; preferences {ctx.preferences ? "saved" : "none"}
              {ctx.states.length ? `; agency data for ${ctx.states.map((s) => STATE_LIST.find((x) => x.slug === s)?.name ?? s).join(", ")}` : "; no state matched"}
              {ctx.species.length ? ` (${ctx.species.join(", ")})` : ""}
              {ctx.units.length ? `; units ${ctx.units.join(", ")}` : ""}.{d?.model ? ` Model ${d.model}.` : ""}
            </p>
          )}
        </section>
      ) : thread.status === "sending" ? (
        <Notice kind="info">This reply is being sent.</Notice>
      ) : (
        <form className="flex flex-wrap items-center gap-3">
          {hidden}
          <p className="text-sm text-muted-foreground">
            {thread.status === "sent" ? "Reply sent. A new message from them will reopen this thread with a fresh draft." : null}
            {thread.status === "dismissed" ? "Dismissed without a reply." : null}
          </p>
          {(thread.status === "dismissed" || thread.status === "ignored") && (
            <ConfirmSubmit formAction={reopenAction} className={secondaryBtn}>
              Reopen
            </ConfirmSubmit>
          )}
        </form>
      )}
    </Shell>
  );
}
