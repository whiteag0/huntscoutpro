// iCalendar (RFC 5545) export of planner dates. Pure functions only: `npm test`.
//
// All-day events (DTSTART;VALUE=DATE, DTEND = the day after, exclusive), CRLF
// line endings, lines folded at 75 octets (UTF-8 safe), TEXT values escaped,
// a stable UID per event and a UTC DTSTAMP.

import { SPECIES_LABELS } from "@/data/types";
import type { PlannedHunt } from "@/lib/planner-schema";
import { DATE_KIND_LABELS, huntTimeline, type TimelineItem } from "@/lib/planner-timeline";

export interface IcsEvent {
  uid: string;
  /** First day, YYYY-MM-DD. */
  start: string;
  /** Last day (inclusive), YYYY-MM-DD. Same as start for a one-day event. */
  end: string;
  summary: string;
  description?: string;
  url?: string;
}

/** Escape a TEXT value (RFC 5545 3.3.11). */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Fold a content line to at most 75 octets per line (RFC 5545 3.1), never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = "";
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      parts.push(cur);
      cur = "";
      bytes = 0;
      limit = 74; // continuation lines start with one space
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const day = (iso: string) => iso.replace(/-/g, "");
function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}
/** 20261031T120000Z */
export function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** A whole VCALENDAR document. */
export function buildCalendar(opts: { name: string; events: readonly IcsEvent[]; now: Date }): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//HuntScout Pro//Hunt Planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEscape(opts.name)}`];
  const stamp = icsStamp(opts.now);
  for (const e of opts.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(e.start)}`,
      `DTEND;VALUE=DATE:${day(nextDay(e.end))}`,
      `SUMMARY:${icsEscape(e.summary)}`,
      ...(e.description ? [`DESCRIPTION:${icsEscape(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url.replace(/[\r\n]/g, "")}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** "Idaho Black Bear 8001" */
export function huntName(h: PlannedHunt): string {
  const code = h.agency?.huntCode || (h.agency?.kind === "otc" ? "general/OTC" : h.unit);
  return `${h.state} ${SPECIES_LABELS[h.species]}${code ? ` ${code}` : ""}`;
}

/**
 * Whether a timeline item belongs in a calendar: not passed, and either the
 * member's own date, a published agency date for the planned cycle, or season
 * dates that are this hunt's own (statewide seasons aren't specific enough to
 * put on someone's calendar as their hunt).
 */
function exportable(t: TimelineItem, today: string): boolean {
  if (t.end < today) return false;
  if (t.mine) return true;
  if (!t.published) return false;
  return t.kind !== "season" || t.scope === "hunt" || t.scope === "units";
}

/** Calendar events for one hunt. Application and sale windows become an "opens" and a "closes" event. */
export function huntEvents(h: PlannedHunt, today: string, plannerUrl: string): IcsEvent[] {
  const name = huntName(h);
  const a = h.agency;
  const out: IcsEvent[] = [];
  const link = `${plannerUrl.replace(/\/$/, "")}/hunt/${h.id}`;
  for (const t of huntTimeline(h)) {
    if (!exportable(t, today)) continue;
    const what = t.kind === "season" ? `Season${t.label ? `: ${t.label}` : ""}` : t.label;
    const desc = [
      `${name}${a ? ` (${a.residency})` : ""}`,
      t.mine ? "Your date." : `${t.kind === "season" ? `${t.cycle} season dates` : `${DATE_KIND_LABELS[t.kind as keyof typeof DATE_KIND_LABELS] || "Agency date"} · ${t.cycle} cycle`}${t.tentative ? " (tentative)" : ""} from ${a?.agencyName || "the agency"}.`,
      t.note,
      t.sourceUrl && !t.mine ? `Source: ${t.sourceUrl}` : undefined,
      `Planner: ${link}`,
    ]
      .filter(Boolean)
      .join("\n");
    const base = `${h.id}-${t.key}`;
    if (t.kind !== "season" && t.start && t.start !== t.end) {
      if (t.start >= today) out.push({ uid: `${base}-open@huntscoutpro.com`, start: t.start, end: t.start, summary: `Opens: ${what} — ${name}`, description: desc, url: t.sourceUrl || link });
      out.push({ uid: `${base}-close@huntscoutpro.com`, start: t.end, end: t.end, summary: `Closes: ${what} — ${name}`, description: desc, url: t.sourceUrl || link });
    } else {
      out.push({ uid: `${base}@huntscoutpro.com`, start: t.start || t.end, end: t.end, summary: `${what} — ${name}`, description: desc, url: t.sourceUrl || link });
    }
  }
  return out;
}

export function plannerCalendar(hunts: readonly PlannedHunt[], today: string, now: Date, plannerUrl: string, name = "HuntScout hunt planner"): string {
  return buildCalendar({ name, events: hunts.flatMap((h) => huntEvents(h, today, plannerUrl)), now });
}
