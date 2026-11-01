"use client";

import Link from "next/link";
import { AlertCircle, CalendarClock, Check, CloudOff, ExternalLink, Info, Loader2, Plus, X } from "lucide-react";
import { SPECIES_LABELS } from "@/data/types";
import { formatDate } from "@/lib/agency-format";
import { linkOf, type AgencyFee, type BudgetItem, type HuntStatus, type PlannedHunt } from "@/lib/planner-schema";
import { DATE_KIND_LABELS, countdown, cycleInfo, huntTimeline, type Countdown, type TimelineItem } from "@/lib/planner-timeline";
import type { SyncStatus } from "@/components/planner/usePlannerSync";

export function dateRange(start: string | undefined, end: string): string {
  if (!start || start === end) return formatDate(end);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${formatDate(start, !sameYear)} – ${formatDate(end)}`;
}

export const TONE_CLASS: Record<Countdown["tone"], string> = {
  past: "text-muted-foreground",
  urgent: "text-danger font-semibold",
  soon: "text-warning font-semibold",
  later: "text-foreground",
  active: "text-success font-semibold",
};

export const STATUS_LABELS: Record<HuntStatus, string> = {
  planning: "Planning",
  applied: "Applied",
  drawn: "Drawn",
  alternate: "Alternate",
  "not-drawn": "Not drawn",
  "tag-purchased": "Tag purchased",
  hunted: "Hunted",
};

export const STATUS_PILL: Record<HuntStatus, string> = {
  planning: "bg-blue-50 text-blue-800 border-blue-200",
  applied: "bg-amber-50 text-amber-900 border-amber-200",
  drawn: "bg-green-50 text-green-800 border-green-200",
  alternate: "bg-purple-50 text-purple-800 border-purple-200",
  "not-drawn": "bg-red-50 text-red-800 border-red-200",
  "tag-purchased": "bg-emerald-50 text-emerald-900 border-emerald-200",
  hunted: "bg-stone-100 text-stone-700 border-stone-300",
};

/** "Colorado Elk EE001E1R", "Idaho Black Bear · general/OTC", "Montana Elk 270". */
export function huntTitle(h: PlannedHunt): string {
  const a = h.agency;
  const tail = a?.huntCode ? ` ${a.huntCode}` : a?.kind === "otc" ? " · general/OTC" : h.unit ? ` ${h.unit}` : "";
  return `${h.state} ${SPECIES_LABELS[h.species]}${tail}`;
}

export function SourceLink({ href, children = "Source", className = "" }: { href?: string; children?: React.ReactNode; className?: string }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline ${className}`}>
      {children}
      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
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

/** Small badge: "2027 dates" (published) or "2026 dates · 2027 not published yet". */
export function CycleBadge({ hunt }: { hunt: PlannedHunt }) {
  const a = hunt.agency;
  if (!a) return <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Your own dates</span>;
  const c = cycleInfo(a);
  if (c.published) return <span className="inline-flex items-center rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">{c.datesCycle} dates published</span>;
  return (
    <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-xs font-medium text-[#7a5a07]">
      {c.datesCycle ? `Waiting on ${c.planCycle} dates` : "No agency dates yet"}
    </span>
  );
}

/** The cycle's honesty banner for a hunt's dates. */
export function CycleNotice({ hunt }: { hunt: PlannedHunt }) {
  const a = hunt.agency;
  if (!a) return null;
  const c = cycleInfo(a);
  const who = a.agencyShortName || a.agencyName;
  const tentative = (a.keyDates || []).filter((k) => k.status === "tentative" && k.cycle === c.datesCycle).length;
  if (c.published) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-foreground">
        <Check className="w-4 h-4 mt-0.5 shrink-0 text-success" aria-hidden />
        <span>
          {who} has published its {c.datesCycle} dates for this hunt{tentative ? ` (${tentative} marked tentative by ${who})` : ""}.
        </span>
      </p>
    );
  }
  return (
    <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
      <Info className="w-4 h-4 mt-0.5 shrink-0 text-warning" aria-hidden />
      <span>
        {c.datesCycle ? (
          <>
            <strong>{c.label}.</strong> These are {c.datesCycle} dates, for reference; they aren&apos;t your {c.planCycle} deadlines and we don&apos;t guess new
            ones. Any {c.datesCycle} date that is still open shows a countdown. This hunt updates when {who} publishes {c.planCycle} dates.
          </>
        ) : (
          <>
            {who} hasn&apos;t published dates for this hunt in our data. Check the agency&apos;s site; this hunt updates when dates are added.
          </>
        )}
      </span>
    </p>
  );
}

function kindLabel(t: TimelineItem): string {
  if (t.kind === "season") return t.scope === "statewide" ? "Season (statewide)" : t.scope === "units" ? "Season (units)" : "Season";
  if (t.kind === "custom") return "Your date";
  if (t.kind === "manual") return "Your deadline";
  return DATE_KIND_LABELS[t.kind];
}

/** Every date of a hunt with countdowns; unpublished-cycle dates are muted and carry their year, never a countdown. */
export function DateList({
  hunt,
  today,
  include = "all",
  onRemoveCustom,
}: {
  hunt: PlannedHunt;
  today: string;
  include?: "all" | "dates" | "seasons";
  onRemoveCustom?: (customId: string) => void;
}) {
  const items = huntTimeline(hunt, today).filter((t) => (include === "all" ? true : include === "seasons" ? t.kind === "season" : t.kind !== "season"));
  if (!items.length) return null;
  return (
    <ol className="divide-y divide-border rounded-lg border border-border bg-card">
      {items.map((t) => {
        const cd = countdown(t, today);
        const muted = !t.published;
        return (
          <li key={t.key} className={`flex gap-3 px-3 py-2.5 ${muted ? "bg-muted/30" : ""}`}>
            <div className="w-12 shrink-0 text-center leading-tight" aria-hidden>
              <div className="text-[11px] uppercase text-muted-foreground">{formatDate(t.start || t.end, false).split(" ")[0]}</div>
              <div className={`text-lg font-bold tabular-nums ${muted ? "text-muted-foreground" : "text-foreground"}`}>{Number((t.start || t.end).slice(8, 10))}</div>
              {muted && <div className="text-[10px] text-muted-foreground">{(t.start || t.end).slice(0, 4)}</div>}
            </div>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{kindLabel(t)}</span>
                {t.tentative && <span className="rounded bg-amber-100 px-1.5 text-[11px] font-medium text-amber-900">tentative</span>}
                {t.residency && <span className="text-[11px] text-muted-foreground">{t.residency}s only</span>}
              </div>
              <div className="font-medium text-foreground break-words">{t.label || "Season dates"}</div>
              <div className="text-xs text-muted-foreground break-words">
                <span className={muted ? "" : "text-foreground"}>{dateRange(t.start, t.end)}</span>
                {muted ? (
                  <span> · {t.kind === "season" ? `${t.cycle} season` : `${t.cycle} cycle`}, for reference</span>
                ) : (
                  <>
                    {t.otherCycle && <span> · {t.cycle} cycle</span>}
                    <span className={TONE_CLASS[cd.tone]}> · {cd.text}</span>
                  </>
                )}
                {t.note && <span className="block">{t.note}</span>}
                {t.sourceUrl && !t.mine && (
                  <span className="block">
                    <SourceLink href={t.sourceUrl}>{hunt.agency?.agencyShortName || "Agency"} source</SourceLink>
                  </span>
                )}
              </div>
            </div>
            {t.kind === "custom" && onRemoveCustom && (
              <button
                type="button"
                onClick={() => onRemoveCustom(t.key.replace(/^custom-/, ""))}
                className="-m-1 self-start p-2.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 cursor-pointer"
                aria-label={`Remove your date ${t.label}`}
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Heading text for a hunt's season block. */
export function seasonHeading(hunt: PlannedHunt): string {
  const a = hunt.agency;
  if (!a) return "Season";
  const c = cycleInfo(a);
  const scope = a.seasons?.[0]?.scope;
  const year = a.seasonYear;
  const yearText = year ? (c.planCycle && year < c.planCycle ? `${year} season dates — ${c.planCycle} not yet published` : `${year} season dates`) : "Season dates";
  if (scope === "statewide") return `${yearText} · statewide ${SPECIES_LABELS[hunt.species].toLowerCase()} seasons, not specific to this hunt`;
  if (scope === "units") return `${yearText} · for this hunt's ${a.unitTerm.toLowerCase()}s`;
  return `${yearText} · this hunt`;
}

export function SeasonBlock({ hunt, today }: { hunt: PlannedHunt; today: string }) {
  const a = hunt.agency;
  if (!a) {
    return hunt.seasonDates ? <p className="text-sm text-foreground break-words">{hunt.seasonDates} (you entered)</p> : <p className="text-sm text-muted-foreground">No season dates entered.</p>;
  }
  const hasRanges = (a.seasons || []).length > 0;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{seasonHeading(hunt)}</p>
      {hasRanges ? (
        <DateList hunt={hunt} today={today} include="seasons" />
      ) : a.seasonText ? (
        <p className="text-sm text-foreground break-words">
          {a.seasonText} <span className="text-muted-foreground">(as {a.agencyShortName || "the agency"} prints it)</span>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No season dates for this hunt in our data. <SourceLink href={a.sourceUrl}>Check {a.agencyShortName || "the agency"}</SourceLink>
        </p>
      )}
      {hasRanges && a.seasonText && <p className="text-xs text-muted-foreground break-words">As printed: {a.seasonText}</p>}
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

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function FeeList({ hunt, budget, onAddFee }: { hunt: PlannedHunt; budget?: BudgetItem[]; onAddFee?: (f: AgencyFee) => void }) {
  const a = hunt.agency;
  if (!a || !a.fees.length) return <p className="text-sm text-muted-foreground">No {a?.residency || ""} fees for this species in our data.</p>;
  const years = Array.from(new Set(a.fees.map((f) => f.licenseYear))).sort();
  const plan = cycleInfo(a).planCycle;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1.5">
        {a.residency === "resident" ? "Resident" : "Nonresident"} fees, license year {years.join(", ")}
        {plan && years.every((y) => y < plan) ? ` (${plan} fees not published yet)` : ""}. Agencies list alternatives (adult, youth, bull, cow…); use the lines that apply to you.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {a.fees.map((f, i) => {
          const desc = feeBudgetDescription(f);
          const added = budget?.some((b) => b.huntId === hunt.id && b.description === desc);
          return (
            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <div className="flex-1 min-w-[10rem]">
                <div className="text-foreground break-words">{f.item}</div>
                <div className="text-[11px] text-muted-foreground">
                  {f.licenseYear}
                  {f.note ? ` · ${f.note}` : ""} · <SourceLink href={linkOf(a, f)} />
                </div>
              </div>
              <div className="font-semibold tabular-nums">{money(f.amountUsd)}</div>
              {onAddFee &&
                (added ? (
                  <span className="inline-flex min-h-10 items-center gap-1 text-xs font-semibold text-success">
                    <Check className="w-3.5 h-3.5" aria-hidden /> In budget
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAddFee(f)}
                    className="inline-flex min-h-10 items-center gap-1 px-2 rounded-lg text-xs font-semibold text-primary hover:bg-primary/10 cursor-pointer"
                    aria-label={`Add ${f.item}, ${money(f.amountUsd)}, to this hunt's budget`}
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden /> Add to budget
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Last draw, lowest points drawn vs the member's points, draw system and residency notes. */
export function DrawFacts({ hunt, pointsOwned }: { hunt: PlannedHunt; pointsOwned: number }) {
  const a = hunt.agency;
  if (!a) return null;
  const min = a.minPoints;
  const pointName = a.pointName || "points";
  return (
    <div className="space-y-3 text-sm">
      {a.kind !== "otc" && a.kind !== "custom" && (
        <div>
          {a.oddsNote ? (
            <p className="text-foreground break-words">
              {a.oddsNote} <SourceLink href={a.sourceUrl}>Draw report</SourceLink>
            </p>
          ) : (
            <p className="text-muted-foreground">No draw figures for this hunt in our data.</p>
          )}
          {a.pointsMatter && (
            <p className="mt-1.5 text-foreground">
              <span className="font-semibold">Your {pointName}s: {pointsOwned}</span>
              {min !== null && min !== undefined ? (
                <>
                  {" "}
                  · lowest anyone drew with in {a.drawYear}: <span className="font-semibold">{min}</span>
                  <span className={pointsOwned >= min ? "text-success" : "text-muted-foreground"}>
                    {" "}
                    ({pointsOwned >= min ? "you were at or above that level" : `${min - pointsOwned} below that level`}; past results don&apos;t guarantee the next draw)
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground"> · the agency doesn&apos;t publish the lowest points drawn for this hunt</span>
              )}
            </p>
          )}
        </div>
      )}
      {(a.drawSystem || a.drawSummary) && (
        <div>
          <div className="font-semibold text-foreground">{a.drawSystem}</div>
          {a.drawSummary && <p className="text-muted-foreground break-words">{a.drawSummary}</p>}
        </div>
      )}
      {a.otcSummary && (
        <div>
          <div className="font-semibold text-foreground">General / over-the-counter</div>
          <p className="text-muted-foreground break-words">{a.otcSummary}</p>
        </div>
      )}
      {a.residencyNote && (
        <div>
          <div className="font-semibold text-foreground">{a.residency === "resident" ? "Residents" : "Nonresidents"}</div>
          <p className="text-muted-foreground break-words">{a.residencyNote}</p>
        </div>
      )}
    </div>
  );
}

/** The next few things to do across all hunts. */
export function UpcomingStrip({ items, hunts, today }: { items: TimelineItem[]; hunts: PlannedHunt[]; today: string }) {
  const byId = new Map(hunts.map((h) => [h.id, h] as const));
  const waiting = hunts.filter((h) => h.agency && !cycleInfo(h.agency).published).length;
  return (
    <section aria-labelledby="upcoming-h" className="mb-8">
      <h2 id="upcoming-h" className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        <CalendarClock className="w-4 h-4" aria-hidden /> Upcoming deadlines
      </h2>
      {items.length ? (
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {items.slice(0, 6).map((t) => {
            const h = byId.get(t.huntId)!;
            const cd = countdown(t, today);
            return (
              <li key={`${t.huntId}-${t.key}`}>
                <Link href={`/planner/hunt/${h.id}`} className="flex h-full gap-3 rounded-xl border border-border bg-card p-3 hover:border-primary/40 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-ring">
                  <div className="w-11 shrink-0 text-center leading-tight" aria-hidden>
                    <div className="text-[11px] uppercase text-muted-foreground">{formatDate(t.end, false).split(" ")[0]}</div>
                    <div className="text-xl font-bold tabular-nums text-foreground">{Number(t.end.slice(8, 10))}</div>
                  </div>
                  <div className="min-w-0 text-sm">
                    <div className="font-semibold text-foreground break-words">{huntTitle(h)}</div>
                    <div className="text-xs text-muted-foreground break-words">{t.label}</div>
                    <div className={`text-xs ${TONE_CLASS[cd.tone]}`}>
                      {formatDate(t.end)} · {cd.text}
                      {t.tentative ? " · tentative" : ""}
                      {t.otherCycle ? ` · ${t.cycle} cycle` : ""}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {hunts.length === 0
            ? "Nothing planned yet. Plan a hunt and its agency deadlines show up here."
            : "No upcoming deadlines published for your hunts yet."}
        </p>
      )}
      {waiting > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {waiting} hunt{waiting === 1 ? " is" : "s are"} waiting on the agency&apos;s next-cycle dates; they&apos;ll appear here once published.
        </p>
      )}
    </section>
  );
}
