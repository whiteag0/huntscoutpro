// Client-safe helpers for presenting agency data. No data imports here.
import { AGENCY_STATES, type DrawSystemKind, type KeyDate, type SeasonDate, type SourceRef } from "@/data/agency/schema";
import { LIVE_SLUGS } from "@/data/agency/live.generated";
import { STATE_LIST, type StateListItem } from "@/data/state-list";

export const DRAW_SYSTEM_LABELS: Record<DrawSystemKind, string> = {
  preference: "Preference points",
  bonus: "Bonus points",
  "bonus-squared": "Bonus points (squared)",
  hybrid: "Hybrid: points + random",
  random: "Random draw (no points)",
  otc: "Over the counter",
  none: "No season",
};

/** States with published agency data, in display order. */
export const LIVE_STATE_SLUGS: readonly string[] = AGENCY_STATES.filter((s) => LIVE_SLUGS.includes(s));

export function isLiveState(slug: string): boolean {
  return LIVE_STATE_SLUGS.includes(slug);
}

export const LIVE_STATES: readonly StateListItem[] = STATE_LIST.filter((s) => isLiveState(s.slug)).sort(
  (a, b) => LIVE_STATE_SLUGS.indexOf(a.slug) - LIVE_STATE_SLUGS.indexOf(b.slug)
);

export const COMING_SOON_STATES: readonly StateListItem[] = STATE_LIST.filter((s) => !isLiveState(s.slug));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2027-04-07" -> "Apr 7, 2027" without timezone drift. */
export function formatDate(iso: string | undefined, withYear = true): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}${withYear ? `, ${y}` : ""}`;
}

export function formatKeyDate(k: KeyDate): string {
  if (k.date) return formatDate(k.date);
  if (k.start && k.end) {
    const sameYear = k.start.slice(0, 4) === k.end.slice(0, 4);
    return `${formatDate(k.start, !sameYear)} – ${formatDate(k.end)}`;
  }
  return "";
}

/** The day a key date ends (window end or the single date). */
export function keyDateEnd(k: KeyDate): string {
  return k.end || k.date || k.start || "";
}

/** Today in Mountain Time (where most deadlines are set), identical on server and client. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Next key date that hasn't passed yet, preferring the latest cycle. */
export function nextKeyDate(dates: KeyDate[], today = todayIso()): KeyDate | undefined {
  return [...dates]
    .filter((d) => keyDateEnd(d) >= today)
    .sort((a, b) => keyDateEnd(a).localeCompare(keyDateEnd(b)))[0];
}

export function fmtNum(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : n.toLocaleString("en-US");
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined) return "—";
  return `${Number(n.toFixed(digits))}%`;
}

export function sourceLabel(s: SourceRef): string {
  return s.dataYear ? `${s.title} (${s.dataYear})` : s.title;
}

export function sortUnitIds(a: string, b: string): number {
  if (a === "Statewide") return 1;
  if (b === "Statewide") return -1;
  const na = parseInt(a.replace(/^\D+/, ""), 10);
  const nb = parseInt(b.replace(/^\D+/, ""), 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b, "en", { numeric: true });
}

/** Seasons for overview pages: hunt-specific ones (tied to hunt codes) are shown on each hunt instead. */
export function generalSeasons<T extends Pick<SeasonDate, "huntCodes">>(seasons: readonly T[]): T[] {
  return seasons.filter((s) => !s.huntCodes?.length);
}

/** Where a season applies, e.g. "Units 1, 2, 3, 4, 5, 6 +12" or "Residents"; "" when statewide. */
export function seasonScope(s: Pick<SeasonDate, "units" | "residency">, unitTerm = "Units", max = 6): string {
  const parts: string[] = [];
  if (s.units?.length) parts.push(`${unitTerm} ${s.units.slice(0, max).join(", ")}${s.units.length > max ? ` +${s.units.length - max}` : ""}`);
  if (s.residency) parts.push(s.residency === "resident" ? "Residents" : "Nonresidents");
  return parts.join(" · ");
}

/** Text cut to about `max` characters at a sentence or word boundary. */
export function clipText(text: string | undefined, max = 200): string | undefined {
  if (!text || text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return `${cut.slice(0, at > max * 0.6 ? at : max).trimEnd()}…`;
}
