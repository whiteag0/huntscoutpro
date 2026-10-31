"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ExternalLink, HelpCircle, Info, Shuffle, TrendingUp, CircleDashed } from "lucide-react";
import { SPECIES_LABELS, type Species } from "@/data/types";
import { stateByAbbrev } from "@/data/state-list";
import { fmtNum, fmtPct } from "@/lib/agency-format";
import type { HuntStatus, ShortlistHunt } from "@/lib/shortlist-core";
import type { ShortlistResult, ShortlistState } from "@/lib/shortlist";

const INITIAL_HUNTS = 5;

const STATUS: Record<HuntStatus, { label: string; className: string; icon: typeof Info }> = {
  "drew-at-points": { label: "Drew at your points", className: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  "min-at-or-below": { label: "Drew at or below your points", className: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  "points-unknown": { label: "Point level not published", className: "bg-muted text-muted-foreground border-border", icon: HelpCircle },
  stretch: { label: "Stretch hunt", className: "bg-warning/10 text-warning border-warning/30", icon: TrendingUp },
  random: { label: "Random draw", className: "bg-muted text-foreground border-border", icon: Shuffle },
  "no-points-entered": { label: "Points not entered", className: "bg-muted text-muted-foreground border-border", icon: CircleDashed },
};

function plural(n: number, word: string, many = `${word}s`) {
  return `${fmtNum(n)} ${n === 1 ? word : many}`;
}

/** "preference point / weighted preference point (bighorn)" -> "preference point". */
export function shortPointName(pointName: string | undefined): string {
  return (pointName || "point").split(/ \(| \//)[0].trim() || "point";
}

function pointWord(st: ShortlistState, n: number) {
  return plural(n, shortPointName(st.pointName));
}

function StatusBadge({ status }: { status: HuntStatus }) {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${s.className}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {s.label}
    </span>
  );
}

/** One plain sentence on why the hunt is on the list, from the published figures. */
function why(h: ShortlistHunt, st: ShortlistState): string | null {
  const who = h.pool === "total" ? "applicants" : `${st.residency} applicants`;
  switch (h.status) {
    case "drew-at-points":
      return h.atPoints
        ? `${h.year}: ${fmtNum(h.atPoints.drawn)} of ${fmtNum(h.atPoints.applicants)} ${who} with ${pointWord(st, h.atPoints.points)} drew (${fmtPct(h.atPoints.pct)}).`
        : null;
    case "min-at-or-below":
      return `${h.year}: lowest point level drawn was ${h.minPoints}; you have ${st.points}. No ${who} at exactly your level were listed.`;
    case "stretch":
      return h.atPoints
        ? `${h.year}: ${fmtNum(h.atPoints.drawn)} of ${fmtNum(h.atPoints.applicants)} ${who} with ${pointWord(st, h.atPoints.points)} drew. Lowest level drawn: ${h.minPoints}.`
        : `${h.year}: not drawn at your level. Lowest point level drawn: ${h.minPoints}; you have ${st.points}.`;
    case "points-unknown":
      return `The agency doesn't publish who drew at which point level for this hunt.`;
    case "no-points-entered":
      return h.minPoints !== null ? `${h.year}: lowest point level drawn was ${h.minPoints}.` : null;
    default:
      return null;
  }
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-foreground tabular-nums">
        {value}
        {sub ? <span className="block text-[11px] font-normal text-muted-foreground">{sub}</span> : null}
      </dd>
    </div>
  );
}

function unitHref(st: ShortlistState, unit: string, species: Species) {
  return `/states/${st.slug}/units/${encodeURIComponent(unit)}?species=${species}`;
}

function HuntItem({ h, st, species }: { h: ShortlistHunt; st: ShortlistState; species: Species }) {
  const single = h.units.length === 1 ? h.units[0] : null;
  const reason = why(h, st);
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {single ? (
          <Link href={unitHref(st, single, species)} className="font-mono font-semibold text-primary hover:underline break-all">
            {h.huntCode}
            <span className="sr-only"> ({st.unitTerm} {single} draw and harvest history)</span>
          </Link>
        ) : (
          <span className="font-mono font-semibold text-foreground break-all">{h.huntCode}</span>
        )}
        <StatusBadge status={h.status} />
      </div>
      <p className="text-sm text-foreground mt-1 break-words">{h.description}</p>
      {(h.methodLabel || h.seasonDates) && (
        <p className="text-xs text-muted-foreground mt-0.5">{[h.methodLabel, h.seasonDates].filter(Boolean).join(" · ")}</p>
      )}
      {h.units.length > 0 && (
        <p className="text-xs mt-0.5 text-muted-foreground">
          {st.unitTerm}{h.units.length > 1 ? "s" : ""}{" "}
          {h.units.slice(0, 8).map((u, i) => (
            <span key={u}>
              {i > 0 && ", "}
              <Link href={unitHref(st, u, species)} className="text-primary hover:underline">
                {u}
              </Link>
            </span>
          ))}
          {h.units.length > 8 && ` +${h.units.length - 8} more`}
        </p>
      )}
      {reason && <p className="text-xs text-foreground mt-2">{reason}</p>}

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mt-3">
        <Stat label="Quota" value={fmtNum(h.quota)} />
        <Stat label={h.choice === "first" ? "1st-choice apps" : "Applicants"} value={fmtNum(h.applicants)} sub={h.pool === "total" ? "combined pool" : undefined} />
        <Stat label="Drawn" value={fmtNum(h.drawn)} />
        <Stat label={`${h.year} odds`} value={fmtPct(h.odds)} sub={h.odds !== null && h.oddsComputed ? "drawn ÷ applicants" : undefined} />
        {st.pointsMatter && <Stat label="Min pts drawn" value={h.minPoints ?? "—"} />}
        {h.atPoints && (
          <Stat
            label={`At your ${h.atPoints.points} pts`}
            value={fmtPct(h.atPoints.pct)}
            sub={`${fmtNum(h.atPoints.drawn)} of ${fmtNum(h.atPoints.applicants)} drew`}
          />
        )}
        {h.harvest && (
          <Stat
            label={`${h.harvest.year} harvest success`}
            value={fmtPct(h.harvest.successPct, 0)}
            sub={[
              h.harvest.matchedBy === "hunt" ? "this hunt" : `${st.unitTerm} ${h.harvest.unit}`,
              h.harvest.label !== "All" ? h.harvest.label : null,
              h.harvest.computed ? "harvest ÷ hunters" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
      </dl>
    </li>
  );
}

function countsLine(st: ShortlistState): string[] {
  const c = st.counts;
  const out: string[] = [];
  if (c.drewAtPoints) out.push(`${plural(c.drewAtPoints, "hunt")} drew at your points`);
  if (c.minAtOrBelow) out.push(`${plural(c.minAtOrBelow, "hunt")} drew at or below your points`);
  if (c.ranked) out.push(`${plural(c.ranked, "hunt")} ranked by odds`);
  if (c.pointsUnknown) out.push(`${plural(c.pointsUnknown, "hunt")} without point-level results`);
  if (c.stretch) out.push(`${plural(c.stretch, "stretch hunt")}`);
  if (c.notDrawnAtLevel) out.push(`${plural(c.notDrawnAtLevel, "hunt")} not drawn at your level`);
  if (c.notDrawn) out.push(`${plural(c.notDrawn, "hunt")} nobody drew`);
  if (c.noFigures) out.push(`${plural(c.noFigures, "hunt")} with no ${st.residency} figures`);
  return out;
}

function StateCard({ st, species, limit }: { st: ShortlistState; species: Species; limit?: number }) {
  const [open, setOpen] = useState(false);
  const cap = limit ?? (open ? st.hunts.length : INITIAL_HUNTS);
  const shown = st.hunts.slice(0, cap);
  const headingId = `sl-${st.slug}`;
  const listId = `sl-${st.slug}-hunts`;
  const counts = countsLine(st);

  return (
    <section aria-labelledby={headingId} className="bg-card border border-border rounded-2xl p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-xl font-bold text-foreground">
            {st.name}
            <span className="ml-2 align-middle px-1.5 py-0.5 text-xs font-mono font-bold text-muted-foreground bg-muted rounded">{st.abbrev}</span>
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {st.drawYear ? `${st.drawYear} draw results` : "No published draw counts"} · {st.systemLabel} · {st.residency === "resident" ? "Resident" : "Nonresident"}
          </p>
          {st.pointsMatter && (
            <p className="text-sm text-foreground mt-0.5">
              {st.points === null ? "No points entered" : `Your points: ${pointWord(st, st.points)}`}
            </p>
          )}
        </div>
        <Link
          href={`/states/${st.slug}?species=${species}`}
          className="inline-flex items-center gap-1 shrink-0 text-sm font-semibold text-primary hover:underline"
        >
          All {st.name} hunts <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {st.notes.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {st.notes.map((n) => (
            <li key={n} className="flex gap-2 text-xs text-muted-foreground">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}

      {counts.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Of {plural(st.counts.hunts, "hunt")} in {st.drawYear}: {counts.join(" · ")}.
        </p>
      )}

      {shown.length > 0 ? (
        <ol id={listId} className="mt-4 divide-y divide-border border-t border-border pt-4">
          {shown.map((h) => (
            <HuntItem key={h.huntCode} h={h} st={st} species={species} />
          ))}
        </ol>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No {SPECIES_LABELS[species].toLowerCase()} hunts here {st.pointsMatter && st.points !== null ? "drew at your point level" : "had published odds for your pool"} last year.
          {st.counts.stretch > 0 && " Turn on stretch hunts to see the closest ones."}
        </p>
      )}

      {limit === undefined && st.hunts.length > INITIAL_HUNTS && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={listId}
          className="mt-4 w-full sm:w-auto px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors cursor-pointer"
        >
          {open ? "Show fewer" : `Show all ${st.hunts.length} hunts`}
        </button>
      )}
      {st.matched > st.hunts.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Top {st.hunts.length} of {fmtNum(st.matched)} matching hunts. See every hunt in the{" "}
          <Link href={`/states/${st.slug}?species=${species}`} className="text-primary hover:underline">
            {st.name} draw table
          </Link>
          .
        </p>
      )}

      {st.sources.length > 0 && (
        <div className="mt-4 pt-3 border-t border-border">
          <h3 className="text-xs font-semibold text-foreground">Sources</h3>
          <ul className="mt-1 space-y-1">
            {st.sources.map((s) => (
              <li key={s.id} className="text-xs text-muted-foreground">
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline inline-flex items-start gap-1">
                  <span>
                    {s.title}
                    {s.dataYear ? ` (${s.dataYear})` : ""}
                  </span>
                  <ExternalLink className="w-3 h-3 shrink-0 mt-0.5" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
                {" · "}
                {s.publisher}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function ShortlistResults({ result, huntsPerState, maxStates }: { result: ShortlistResult; huntsPerState?: number; maxStates?: number }) {
  const species = result.species;
  const home = stateByAbbrev(result.home)?.name ?? result.home;
  const withHunts = result.states.filter((s) => s.hunts.length > 0).length;
  const states = maxStates ? result.states.filter((s) => s.hunts.length > 0).slice(0, maxStates) : result.states;

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">
        Last year&apos;s results for <b className="text-foreground">{SPECIES_LABELS[species]}</b>, applying from{" "}
        <b className="text-foreground">{home}</b>: {plural(withHunts, "state")} with hunts on your list
        {result.includeStretch ? ", stretch hunts included" : ""}.
      </p>
      <div className="space-y-4 sm:space-y-6">
        {states.map((st) => (
          <StateCard key={st.slug} st={st} species={species} limit={huntsPerState} />
        ))}
      </div>
      {!maxStates && result.notCovered.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          No {SPECIES_LABELS[species].toLowerCase()} draw table in our data for: {result.notCovered.map((s) => s.name).join(", ")}.
        </p>
      )}
    </div>
  );
}
