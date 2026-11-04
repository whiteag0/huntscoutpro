import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@/lib/auth";
import { isInboundConfigured, inboundAddress, replyModel } from "@/lib/inbound/config";
import { listThreads } from "@/lib/inbound/store";
import type { ThreadStatus } from "@/lib/inbound/thread";
import { Notice, Shell, StatusBadge, when } from "./ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customer replies", robots: { index: false, follow: false } };

const TABS: { id: "pending" | "sent" | "dismissed" | "ignored" | "all"; label: string }[] = [
  { id: "pending", label: "Waiting" },
  { id: "sent", label: "Sent" },
  { id: "dismissed", label: "Dismissed" },
  { id: "ignored", label: "Filtered out" },
  { id: "all", label: "All" },
];

const IGNORE_LABEL: Record<string, string> = {
  "not-addressed": "not sent to the reply address",
  "noreply-sender": "no-reply sender",
  "auto-reply": "auto-reply",
  bounce: "bounce",
  bulk: "bulk mail",
  "mailing-list": "mailing list",
  spam: "failed sender checks",
  invalid: "unreadable",
};

export default async function RepliesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const session = await auth();
  if (!session?.user?.email) redirect("/signin?callbackUrl=%2Fadmin%2Freplies");
  if (!session.user.isSuperAdmin) {
    return (
      <Shell title="Customer replies">
        <Notice kind="error">This page is only for the site admin.</Notice>
      </Shell>
    );
  }

  const { status: raw } = await searchParams;
  const tab = TABS.find((t) => t.id === raw)?.id ?? "pending";
  let threads: Awaited<ReturnType<typeof listThreads>> = [];
  let loadError = false;
  try {
    threads = await listThreads();
  } catch {
    loadError = true;
  }
  const counts = (s: ThreadStatus) => threads.filter((t) => t.status === s).length;
  const waiting = counts("pending") + counts("sending");
  const shown = threads.filter((t) => (tab === "all" ? true : tab === "pending" ? t.status === "pending" || t.status === "sending" : t.status === tab));

  return (
    <Shell
      title="Customer replies"
      aside={<p className="text-sm text-muted-foreground">{waiting ? `${waiting} waiting for you` : "Nothing waiting"}</p>}
    >
      {!isInboundConfigured() && (
        <Notice kind="info">
          Inbound email isn&apos;t switched on yet, so nothing new arrives here. Setup steps are in INBOUND_EMAIL.md.
        </Notice>
      )}
      {loadError && <Notice kind="error">Couldn&apos;t load threads from storage. Try again in a minute.</Notice>}

      <nav aria-label="Filter threads" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => {
          const n = t.id === "all" ? threads.length : t.id === "pending" ? waiting : counts(t.id);
          const active = t.id === tab;
          return (
            <Link
              key={t.id}
              href={`/admin/replies?status=${t.id}`}
              aria-current={active ? "page" : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? "border-gold font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label} <span className="tabular-nums text-muted-foreground">{n}</span>
            </Link>
          );
        })}
      </nav>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-10 text-center">
          <p className="font-medium text-foreground">{tab === "pending" ? "You're all caught up." : "No threads here."}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            When a customer replies to one of your emails, a drafted answer shows up here and in your inbox for approval.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {shown.map((t) => {
            const last = t.messages[t.messages.length - 1];
            const draftState =
              t.status === "pending"
                ? t.draft?.status === "ready"
                  ? "Draft ready"
                  : t.draft?.status === "failed"
                    ? "Draft failed: write it yourself"
                    : t.draft?.status === "skipped"
                      ? "No draft (limit reached)"
                      : "Drafting…"
                : t.status === "ignored"
                  ? `Filtered: ${IGNORE_LABEL[t.ignoredReason || "invalid"] || t.ignoredReason}`
                  : null;
            return (
              <li key={t.id}>
                <Link href={`/admin/replies/${t.id}`} className="block px-4 py-3.5 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-foreground" data-clarity-mask="true">
                        {t.customer.name || t.customer.email}
                      </p>
                      <p className="truncate text-sm text-foreground" data-clarity-mask="true">
                        {t.subject || "(no subject)"}
                      </p>
                      <p className="mt-0.5 line-clamp-1 break-all text-sm text-muted-foreground" data-clarity-mask="true">
                        {last?.text.slice(0, 160)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={t.status} />
                      <time className="text-xs text-muted-foreground" dateTime={t.updatedAt}>
                        {when(t.updatedAt)}
                      </time>
                    </div>
                  </div>
                  {draftState && <p className="mt-1.5 text-xs font-medium text-muted-foreground">{draftState}</p>}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Receiving address: {inboundAddress() || "not set"} · Drafts by {replyModel()} · Nothing is sent without your approval.
      </p>
    </Shell>
  );
}
