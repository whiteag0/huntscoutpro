import type { ReactNode } from "react";
import type { Thread, ThreadMessage, ThreadStatus } from "@/lib/inbound/thread";

export const STATUS_LABEL: Record<ThreadStatus, string> = {
  pending: "Waiting for you",
  sending: "Sending",
  sent: "Sent",
  dismissed: "Dismissed",
  ignored: "Filtered out",
};

const STATUS_STYLE: Record<ThreadStatus, string> = {
  pending: "bg-gold/15 text-[#7a5b12] border-gold/40",
  sending: "bg-muted text-foreground border-border",
  sent: "bg-[#2d7a3a]/10 text-[#2d7a3a] border-[#2d7a3a]/30",
  dismissed: "bg-muted text-muted-foreground border-border",
  ignored: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ status }: { status: ThreadStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });
}

export function Shell({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admin</p>
            <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          </div>
          {aside}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Notice({ kind, children }: { kind: "ok" | "error" | "info"; children: ReactNode }) {
  const style =
    kind === "ok"
      ? "border-[#2d7a3a]/30 bg-[#2d7a3a]/10 text-[#1f5a29]"
      : kind === "error"
        ? "border-[#a03030]/30 bg-[#a03030]/10 text-[#7d2424]"
        : "border-border bg-muted text-foreground";
  return (
    <div role={kind === "error" ? "alert" : "status"} className={`mb-5 rounded-xl border px-4 py-3 text-sm ${style}`}>
      {children}
    </div>
  );
}

export function MessageCard({ m, thread }: { m: ThreadMessage; thread: Thread }) {
  const mine = m.direction === "out";
  return (
    <article className={`rounded-xl border p-4 ${mine ? "border-gold/40 bg-gold/5" : "border-border bg-card"}`}>
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold text-foreground" data-clarity-mask="true">
          {mine ? "You (sent)" : thread.customer.name || thread.customer.email}
        </span>
        <time className="text-xs text-muted-foreground" dateTime={m.at}>
          {when(m.at)}
        </time>
      </header>
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground" data-clarity-mask="true">
        {m.text || <i className="text-muted-foreground">(no text)</i>}
      </div>
      {m.attachments?.length ? (
        <p className="mt-2 text-xs text-muted-foreground">Attachments (not opened): {m.attachments.join(", ")}</p>
      ) : null}
      {m.original ? (
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Show full message with quoted text</summary>
          <div className="mt-2 whitespace-pre-wrap break-words" data-clarity-mask="true">
            {m.original}
          </div>
        </details>
      ) : null}
    </article>
  );
}

export const inputClass =
  "w-full rounded-xl border border-border bg-card px-4 py-3 text-[15px] leading-relaxed text-foreground shadow-sm focus:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
export const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
export const secondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
