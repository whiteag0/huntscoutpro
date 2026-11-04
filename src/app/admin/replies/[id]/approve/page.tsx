import Link from "next/link";
import type { Metadata } from "next";
import { getThread } from "@/lib/inbound/store";
import { isThreadId, lastInbound } from "@/lib/inbound/thread";
import { replySubject } from "@/lib/inbound/message";
import { signActionToken, verifyActionToken } from "@/lib/inbound/tokens";
import { approveAction } from "../../actions";
import { ConfirmSubmit } from "../../ConfirmSubmit";
import { Notice, Shell, primaryBtn, secondaryBtn } from "../../ui";

// Landing page for "Approve & send" in the owner's email. Opening it (a GET, which mail
// scanners prefetch) never sends anything: the Send button POSTs the form.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Approve reply", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ApproveReplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ t?: string; done?: string; error?: string }>;
}) {
  const { id } = await params;
  const { t: token = "", done, error } = await searchParams;

  if (done === "sent") {
    return (
      <Shell title="Reply sent">
        <Notice kind="ok">Sent from adam@huntscoutpro.com in the same email thread. You can close this page.</Notice>
      </Shell>
    );
  }

  const check = verifyActionToken(token, "approve");
  if (!isThreadId(id) || !check.ok || check.token.th !== id) {
    const msg = !check.ok && check.error === "expired" ? "This approval link has expired." : "This approval link isn't valid.";
    return (
      <Shell title="Approve reply">
        <Notice kind="error">{msg}</Notice>
        <Link href={`/admin/replies/${isThreadId(id) ? id : ""}`} className={secondaryBtn}>
          Open the reply (sign-in required)
        </Link>
      </Shell>
    );
  }

  const thread = (await getThread(id).catch(() => null))?.thread ?? null;
  // An edit link for the same thread, for when this draft needs changes.
  const editHref = `/admin/replies/${id}?t=${encodeURIComponent(signActionToken({ purpose: "edit", threadId: id, rev: 0 }))}`;

  let problem: string | null = null;
  if (!thread) problem = "This thread doesn't exist.";
  else if (thread.usedNonces.includes(check.token.n) || thread.status === "sent") problem = "This reply was already sent.";
  else if (thread.status === "dismissed") problem = "This thread was dismissed.";
  else if (thread.status === "sending") problem = "This reply is being sent right now.";
  else if (thread.status !== "pending") problem = "This thread isn't waiting for a reply.";
  else if (thread.draft?.rev !== check.token.r || thread.draft?.status !== "ready") {
    problem = "The draft changed after this email was sent. Review the latest version before sending.";
  }

  if (problem || !thread) {
    return (
      <Shell title="Approve reply">
        <Notice kind={problem === "This reply was already sent." ? "ok" : "error"}>{problem}</Notice>
        {thread && thread.status === "pending" && (
          <Link href={editHref} className={secondaryBtn}>
            Review the latest draft
          </Link>
        )}
      </Shell>
    );
  }

  const last = lastInbound(thread);
  return (
    <Shell title="Send this reply?">
      {error && <Notice kind="error">{error.slice(0, 300)}</Notice>}
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
        <dt className="text-muted-foreground">To</dt>
        <dd className="min-w-0 break-all" data-clarity-mask="true">
          {thread.customer.name ? `${thread.customer.name} <${thread.customer.email}>` : thread.customer.email}
        </dd>
        <dt className="text-muted-foreground">Subject</dt>
        <dd className="min-w-0 break-words" data-clarity-mask="true">{replySubject(thread.subject)}</dd>
        <dt className="text-muted-foreground">From</dt>
        <dd>Adam White, HuntScout Pro &lt;adam@huntscoutpro.com&gt;</dd>
      </dl>

      {last && (
        <details className="mb-4 rounded-2xl border border-border bg-card px-4 py-3 text-sm">
          <summary className="cursor-pointer font-medium">Their message</summary>
          <div className="mt-2 whitespace-pre-wrap break-words text-foreground" data-clarity-mask="true">
            {last.text}
          </div>
        </details>
      )}

      <section className="mb-5 rounded-2xl border border-gold/40 bg-card p-4 sm:p-5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reply</p>
        <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground" data-clarity-mask="true">
          {thread.draft!.text}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">+ your signature and their quoted message</p>
      </section>

      <form className="flex flex-wrap gap-2">
        <input type="hidden" name="id" value={thread.id} />
        <input type="hidden" name="t" value={token} />
        <ConfirmSubmit formAction={approveAction} className={primaryBtn} pendingLabel="Sending…">
          Send reply
        </ConfirmSubmit>
        <Link href={editHref} className={secondaryBtn}>
          Edit first
        </Link>
      </form>
    </Shell>
  );
}
