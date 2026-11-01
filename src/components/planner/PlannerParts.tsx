"use client";

import Link from "next/link";
import { AlertCircle, CalendarClock, Check, CloudOff, ExternalLink, Loader2, Plus } from "lucide-react";
import { SPECIES_LABELS } from "@/data/types";
import { formatDate } from "@/lib/agency-format";
import { daysBetween } from "@/lib/reminders";
import { deadlinesOf, type AgencyFee, type BudgetItem, type PlannedHunt, type PlannerDeadline } from "@/lib/planner-schema";
import type { SyncStatus } from "@/components/planner/usePlannerSync";

export function dateRange(start: string | undefined, end: string): string {
  if (!start || start === end) return formatDate(end);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, !sameYear)} – ${formatDate(end)}`;
}

export function daysLeftText(today: string, end: string): string {
  const d = daysBetween(today, end);
  if (d < 0) return "passed";
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  return `in ${d} days`;
}

export function urgencyClass(today: string, end: string): string {
  const d = daysBetween(today, end);
  if (d < 0) return "text-muted-foreground";
  if (d <= 14) return "text-danger font-bold";
  if (d <= 45) return "text-warning font-semibold";
  return "text-foreground font-medium";
}

/** "From CPW · 2027 cycle", or the draw year when the agency hasn't published the next cycle's dates. */
export function fromLabel(h: PlannedHunt): string | null {
  const a = h.agency;
  if (!a) return null;
  const who = a.agencyShortName || a.agencyName;
  return a.deadline ? `From ${who} · ${a.deadline.cycle} cycle` : `From ${who} · ${a.drawYear} draw data`;
}

export function huntTitle(h: PlannedHunt): string {
  return `${h.state} ${SPECIES_LABELS[h.species]}${h.agency ? ` ${h.agency.huntCode}` : h.unit ? ` ${h.unit}` : ""}`;
}

function SourceLink({ href, children = "Source" }: { href: string; children?: React.ReactNode }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary hover:underline">
      {children}
      <ExternalLink className="w-3 h-3" aria-hidden />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

export function SyncBadge({ status, onRetry }: { status: SyncStatus; onRetry: () => void }) {
  const base = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border";
  let body: React.ReactNode;
  switch (status.kind) {
    case "browser":
      body = <span className={`${base} border-white/20 text-white/70`}>Saved in this browser</span>;
      break;
    case "loading":
      body = (
        <span className={`${base} border-white/20 text-white/70`}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Loading from your account…
        </span>
      );
      break;
    case "pending":
    case "saving":
      body = (
        <span className={`${base} border-white/20 text-white/80`}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Saving…
        </span>
      );
      break;
    case "saved":
      body = (
        <span className={`${base} border-emerald-300/40 bg-emerald-400/10 text-emerald-100`}>
          <Check className="w-3.5 h-3.5" aria-hidden /> {status.justSaved ? "Saved to your account" : "Synced with your account"}
        </span>
      );
      break;
    case "offline":
      body = (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className={`${base} border-amber-300/40 bg-amber-400/10 text-amber-100`}>
            <CloudOff className="w-3.5 h-3.5" aria-hidden /> Offline: saved on this device
          </span>
          <button type="button" onClick={onRetry} className="min-h-8 px-2 text-xs font-semibold text-white underline cursor-pointer">
            Try again
          </button>
        </span>
      );
      break;
    case "error":
      body = (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className={`${base} rounded-xl border-red-300/40 bg-red-400/10 text-red-100 max-w-full whitespace-normal`}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden /> {status.message}
          </span>
          {status.canRetry && (
            <button type="button" onClick={onRetry} className="min-h-8 px-2 text-xs font-semibold text-white underline cursor-pointer">
              Try again
            </button>
          )}
        </span>
      );
      break;
  }
  return (
    <div role="status" aria-live="polite" className="min-h-8 flex items-center">
      {body}
    </div>
  );
}

export function NextDeadlineSummary({ hunts, budgetTotal, today }: { hunts: PlannedHunt[]; budgetTotal: number; today: string }) {
  const next = deadlinesOf(hunts).find((d) => d.end >= today);
  const applied = hunts.filter((h) => h.status === "applied").length;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
      <div className="sm:col-span-2 bg-card border border-border rounded-xl p-4 min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <CalendarClock className="w-4 h-4" aria-hidden /> Next deadline
        </div>
        {next ? (
          <div className="mt-1.5">
            <div className="text-lg font-bold text-foreground break-words">
              {huntTitle(next.hunt)}
              <span className={`ml-2 text-sm ${urgencyClass(today, next.end)}`}>{daysLeftText(today, next.end)}</span>
            </div>
            <div className="text-sm text-muted-foreground mt-0.5 break-words">
              {next.fromAgency ? "Closes" : "Deadline"} {formatDate(next.end)}
              {next.start && next.start !== next.end ? ` (window opens ${formatDate(next.start)})` : ""} · {next.label}
              {next.hunt.agency?.deadline?.status === "tentative" ? " · tentative" : ""}
              {next.hunt.agency?.deadline?.sourceUrl && (
                <>
                  {" · "}
                  <SourceLink href={next.hunt.agency.deadline.sourceUrl}>{next.hunt.agency.agencyShortName || "Agency"} source</SourceLink>
                </>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-1.5 text-sm text-muted-foreground">
            {hunts.length === 0
              ? "Nothing planned yet. Add hunts from a state's draw table and their agency deadlines show up here."
              : "None of your hunts has an upcoming deadline we know of. Most agencies publish next year's dates in winter; open a hunt's agency link to check."}
          </p>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-1 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hunts</div>
          <div className="text-2xl font-bold text-foreground tabular-nums">{hunts.length}</div>
          <div className="text-xs text-muted-foreground">{applied} applied</div>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Budget</div>
          <div className="text-2xl font-bold text-foreground tabular-nums">${budgetTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
        </div>
      </div>
    </div>
  );
}

/** Budget line text for a fee. Includes the agency's note so variants (e.g. with/without Price Lock) stay distinct. */
export function feeBudgetDescription(f: AgencyFee): string {
  const note = f.note ? `, ${f.note.replace(/\.$/, "")}` : "";
  return `${f.item} (${f.licenseYear}${note})`.slice(0, 300);
}

export function feeCategory(f: AgencyFee): string {
  if (/applica/i.test(f.item)) return "Application fee";
  if (/point/i.test(f.item)) return "Points";
  return f.speciesSpecific ? "Tag/Permit" : "License";
}

/** Agency facts on a planner entry: deadline, last draw, fees. */
export function AgencyDetails({
  hunt,
  today,
  budget,
  onAddFee,
  onSetDeadline,
}: {
  hunt: PlannedHunt;
  today: string;
  budget: BudgetItem[];
  onAddFee: (f: AgencyFee) => void;
  onSetDeadline: (iso: string) => void;
}) {
  const a = hunt.agency!;
  const d = a.deadline;
  const feeYears = Array.from(new Set(a.fees.map((f) => f.licenseYear))).sort();
  const cycle = d?.cycle;
  return (
    <div className="mt-3 space-y-3 text-sm">
      {a.description && <p className="text-muted-foreground break-words">{a.description}</p>}
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Application deadline</div>
        {d ? (
          <div className="break-words">
            <span className={urgencyClass(today, d.end)}>
              {dateRange(d.start, d.end)} ({daysLeftText(today, d.end)})
            </span>
            <div className="text-muted-foreground text-xs mt-0.5">
              {d.label} · {d.cycle} cycle{d.status === "tentative" ? " · tentative" : ""} · <SourceLink href={d.sourceUrl}>{d.sourceTitle || "Agency source"}</SourceLink>
            </div>
            {d.note && <div className="text-muted-foreground text-xs mt-0.5">{d.note}</div>}
            <div className="text-[11px] text-muted-foreground mt-1">
              {a.agencyShortName ? `${a.agencyShortName}'s` : "The agency's"} next {a.residency} application date for {SPECIES_LABELS[hunt.species].toLowerCase()}. Confirm this hunt is in that draw before you apply.
            </div>
          </div>
        ) : (
          <div className="text-muted-foreground">
            <p>
              No upcoming {a.agencyShortName || a.agencyName} {a.residency} {SPECIES_LABELS[hunt.species].toLowerCase()} application date in our data matches this
              hunt yet (most agencies publish next year&apos;s dates in winter).{" "}
              <SourceLink href={a.sourceUrl}>Check the agency</SourceLink>
            </p>
            <label className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold">Your date, once they publish it:</span>
              <input
                type="date"
                value={hunt.applicationDeadline}
                onChange={(e) => onSetDeadline(e.target.value)}
                className="min-h-10 px-2 py-1 border border-border rounded-lg bg-background text-foreground text-base sm:text-sm"
              />
            </label>
          </div>
        )}
      </div>
      {a.oddsNote && (
        <p className="text-muted-foreground break-words">
          <span className="font-semibold text-foreground">Last draw:</span> {a.oddsNote} <SourceLink href={a.sourceUrl}>{a.sourceTitle ? "Draw report" : "Source"}</SourceLink>
        </p>
      )}
      {a.fees.length > 0 && (
        <details className="rounded-lg border border-border">
          <summary className="cursor-pointer select-none px-3 py-2.5 min-h-10 font-semibold text-foreground">
            {a.agencyShortName || "Agency"} {a.residency} fees · license year {feeYears.join(", ")}
            {cycle && feeYears.every((y) => y < cycle) ? <span className="font-normal text-muted-foreground"> ({cycle} fees not in our data yet)</span> : null}
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {a.fees.map((f, i) => {
              const desc = feeBudgetDescription(f);
              const added = budget.some((b) => b.huntId === hunt.id && b.description === desc);
              return (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <div className="flex-1 min-w-[12rem]">
                    <div className="text-foreground break-words">{f.item}</div>
                    <div className="text-[11px] text-muted-foreground">
                      License year {f.licenseYear}
                      {f.note ? ` · ${f.note}` : ""} · <SourceLink href={f.sourceUrl} />
                    </div>
                  </div>
                  <div className="font-semibold tabular-nums">${f.amountUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  {added ? (
                    <span className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-success">
                      <Check className="w-3.5 h-3.5" aria-hidden /> In budget
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAddFee(f)}
                      className="inline-flex min-h-10 items-center gap-1 px-2 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 cursor-pointer"
                      aria-label={`Add ${f.item} to budget`}
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden /> Budget
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="px-3 pb-2.5 text-[11px] text-muted-foreground">Agencies list alternatives (adult, youth, bull, cow…); add only the lines that apply to you.</p>
        </details>
      )}
    </div>
  );
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function TimelineItem({ d, today }: { d: PlannerDeadline; today: string }) {
  const a = d.hunt.agency;
  return (
    <li className="flex gap-3 px-4 py-3">
      <div className="w-14 shrink-0 text-center">
        <div className="text-xs uppercase text-muted-foreground">{MONTHS[Number(d.end.slice(5, 7)) - 1].slice(0, 3)}</div>
        <div className="text-xl font-bold tabular-nums text-foreground">{Number(d.end.slice(8, 10))}</div>
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-foreground break-words">
          {huntTitle(d.hunt)} <span className={`text-sm ${urgencyClass(today, d.end)}`}>· {daysLeftText(today, d.end)}</span>
        </div>
        <div className="text-xs text-muted-foreground break-words mt-0.5">
          {dateRange(d.start, d.end)} · {d.label}
          {a?.deadline?.status === "tentative" ? " · tentative" : ""}
          {a?.deadline?.sourceUrl && (
            <>
              {" · "}
              <SourceLink href={a.deadline.sourceUrl}>{a.agencyShortName || "Agency"}</SourceLink>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** Every deadline in date order, grouped by month; passed ones folded away. */
export function Timeline({ hunts, today }: { hunts: PlannedHunt[]; today: string }) {
  const all = deadlinesOf(hunts);
  const upcoming = all.filter((d) => d.end >= today);
  const past = all.filter((d) => d.end < today);
  const noDate = hunts.filter((h) => !all.some((d) => d.hunt.id === h.id));
  const groups = new Map<string, PlannerDeadline[]>();
  for (const d of upcoming) {
    const k = d.end.slice(0, 7);
    groups.set(k, [...(groups.get(k) || []), d]);
  }
  if (all.length === 0) {
    return (
      <div className="text-center py-12 px-4 bg-card border border-border rounded-xl">
        <p className="text-muted-foreground">
          No deadlines yet. Use <span className="font-semibold">Add to my planner</span> on a hunt in a{" "}
          <Link href="/states" className="text-primary hover:underline">
            state&apos;s draw table
          </Link>{" "}
          to bring in the agency&apos;s date, or enter one on a hunt you add yourself.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {upcoming.length === 0 && <p className="text-sm text-muted-foreground">No upcoming deadlines. Passed ones are below.</p>}
      {Array.from(groups.entries()).map(([ym, list]) => (
        <section key={ym} className="bg-card border border-border rounded-xl overflow-hidden">
          <h3 className="px-4 py-2 bg-muted/50 border-b border-border text-sm font-bold text-foreground">
            {MONTHS[Number(ym.slice(5, 7)) - 1]} {ym.slice(0, 4)}
          </h3>
          <ul className="divide-y divide-border">
            {list.map((d) => (
              <TimelineItem key={d.hunt.id} d={d} today={today} />
            ))}
          </ul>
        </section>
      ))}
      {past.length > 0 && (
        <details className="bg-card border border-border rounded-xl overflow-hidden">
          <summary className="px-4 py-3 min-h-11 cursor-pointer select-none text-sm font-semibold text-muted-foreground">Passed ({past.length})</summary>
          <ul className="divide-y divide-border border-t border-border">
            {[...past].reverse().map((d) => (
              <TimelineItem key={d.hunt.id} d={d} today={today} />
            ))}
          </ul>
        </details>
      )}
      {noDate.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {noDate.length} hunt{noDate.length === 1 ? " has" : "s have"} no deadline yet: {noDate.map(huntTitle).join("; ")}.
        </p>
      )}
    </div>
  );
}
