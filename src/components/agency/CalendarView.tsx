"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ExternalLink } from "lucide-react";
import { SPECIES_LABELS, type Species } from "@/data/types";
import { formatDate, todayIso } from "@/lib/agency-format";

export interface CalendarItem {
  kind: "date" | "season";
  state: string;
  slug: string;
  species: Species;
  label: string;
  start: string;
  end: string;
  cycle: number;
  tentative: boolean;
  note?: string;
  sourceTitle: string;
  sourceUrl: string;
}

const pill = (on: boolean) =>
  `px-3 py-1.5 rounded-lg text-sm font-medium border transition cursor-pointer ${
    on ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/50"
  }`;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function CalendarView({ items, states }: { items: CalendarItem[]; states: { slug: string; name: string }[] }) {
  const today = todayIso();
  const [state, setState] = useState("all");
  const [species, setSpecies] = useState<Species | "all">("all");
  const [kind, setKind] = useState<"date" | "season">("date");
  const [showPast, setShowPast] = useState(false);

  const speciesInData = useMemo(() => Array.from(new Set(items.map((i) => i.species))), [items]);

  const list = useMemo(
    () =>
      items
        .filter((i) => i.kind === kind && (state === "all" || i.slug === state) && (species === "all" || i.species === species) && (showPast || i.end >= today))
        .sort((a, b) => a.start.localeCompare(b.start) || a.state.localeCompare(b.state)),
    [items, kind, state, species, showPast, today]
  );

  // Open windows first (soonest closing first), then upcoming/past grouped by start month.
  const groups = useMemo(() => {
    const open = list.filter((i) => i.start <= today && i.end >= today).sort((a, b) => a.end.localeCompare(b.end));
    const m = new Map<string, CalendarItem[]>();
    for (const i of list) {
      if (i.start <= today && i.end >= today) continue;
      const key = i.start.slice(0, 7);
      m.set(key, [...(m.get(key) || []), i]);
    }
    const out: [string, CalendarItem[]][] = open.length ? [["open", open]] : [];
    return [...out, ...Array.from(m.entries())];
  }, [list, today]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-3xl sm:text-4xl font-bold text-foreground">Application calendar</h1>
      <p className="text-muted-foreground mt-2 max-w-3xl">
        Draw application windows, results dates and seasons, copied from each state agency. Where an agency hasn&apos;t published
        its 2027 dates yet, we show the 2026 dates and say so. Always confirm on the agency site before you apply.
      </p>

      <div className="mt-6 bg-card border border-border rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div className="flex gap-1">
          <button className={pill(kind === "date")} onClick={() => setKind("date")}>
            Application dates
          </button>
          <button className={pill(kind === "season")} onClick={() => setKind("season")}>
            Seasons
          </button>
        </div>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted-foreground mb-1">State</span>
          <select className="px-2 py-1.5 border border-border rounded-lg bg-background" value={state} onChange={(e) => setState(e.target.value)}>
            <option value="all">All states</option>
            {states.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Species</span>
          <select className="px-2 py-1.5 border border-border rounded-lg bg-background" value={species} onChange={(e) => setSpecies(e.target.value as Species | "all")}>
            <option value="all">All species</option>
            {speciesInData.map((s) => (
              <option key={s} value={s}>
                {SPECIES_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} className="accent-[var(--primary)]" />
          Show past dates
        </label>
      </div>

      {groups.length === 0 ? (
        <div className="mt-6 bg-card border border-border rounded-xl p-10 text-center text-muted-foreground">
          No {kind === "date" ? "upcoming application dates" : "seasons"} match these filters.
        </div>
      ) : (
        groups.map(([month, rows]) => {
          const [y, m] = month === "open" ? [0, 0] : month.split("-").map(Number);
          return (
            <section key={month} className="mt-8">
              <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-gold" aria-hidden />
                {month === "open" ? (kind === "date" ? "Open now" : "In season now") : `${MONTHS[m - 1]} ${y}`}
              </h2>
              <ul className="space-y-2">
                {rows.map((i, idx) => {
                  const open = i.start <= today && i.end >= today;
                  return (
                    <li key={idx} className={`bg-card border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${open ? "border-gold" : "border-border"} ${i.end < today ? "opacity-60" : ""}`}>
                      <div className="sm:w-48 shrink-0 text-sm font-semibold text-foreground tabular-nums">
                        {i.start === i.end ? formatDate(i.start) : `${formatDate(i.start, false)} – ${formatDate(i.end)}`}
                        {open && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gold text-gold-foreground whitespace-nowrap">{kind === "date" ? `CLOSES ${formatDate(i.end, false).toUpperCase()}` : "NOW"}</span>}
                      </div>
                      <div className="flex-1 text-sm">
                        <Link href={`/states/${i.slug}?species=${i.species}`} className="font-semibold text-primary hover:underline">
                          {i.state}
                        </Link>{" "}
                        · {SPECIES_LABELS[i.species]} · {i.label}
                        {i.tentative && <span className="text-muted-foreground"> (tentative)</span>}
                        {i.note && <div className="text-xs text-muted-foreground mt-0.5">{i.note}</div>}
                      </div>
                      <a href={i.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 shrink-0">
                        {i.cycle} source <ExternalLink className="w-3 h-3" aria-hidden />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
