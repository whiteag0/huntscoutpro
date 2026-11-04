// What the reply model is told: the thread, the customer's membership and saved
// preferences, and facts copied from our agency data for the states, species and
// units the conversation mentions. Pure functions (data comes in as arguments): `npm test`.
//
// Every agency fact is written as the agency published it, with its source title,
// so the draft can only repeat what HuntScout Pro already shows on the site.

import type { DrawRecord, KeyDate, SourceRef, Species } from "@/data/agency/schema";
import { SPECIES_LABELS } from "@/data/types";
import { STATE_LIST } from "@/data/state-list";
import { formatDate, formatKeyDate, generalSeasons, keyDateEnd, seasonScope } from "@/lib/agency-format";
import { canonicalUnit, drawStats, minPointsDrawn, oddsOf } from "@/lib/agency-view";
import { memberResidencyIn } from "@/lib/reminders";
import type { HuntingPreferences } from "@/lib/preferences-schema";
import { INBOUND_LIMITS } from "@/lib/inbound/config";
import type { DraftContextSummary, Thread } from "@/lib/inbound/thread";

/** The slice of a state's agency data the facts are built from (src/lib/agency.ts StateData). */
export interface FactsState {
  slug: string;
  name: string;
  abbrev: string;
  agency: { name: string; shortName: string; url: string };
  unitTerm: string;
  lastReviewed: string;
  overview: string;
  species: {
    species: Species;
    displayName?: string;
    drawSystem: string;
    drawSystemSummary: string;
    pointsMatter: boolean;
    pointName?: string;
    residentNote?: string;
    nonresidentNote?: string;
    otcSummary?: string;
    keyDates: KeyDate[];
  }[];
  fees: { species?: Species | null; item: string; residency: "resident" | "nonresident"; amountUsd: number; licenseYear: number; note?: string; sourceId: string }[];
  seasons: { species: Species; label: string; units?: string[]; huntCodes?: string[]; residency?: "resident" | "nonresident"; start: string; end: string; year: number; sourceId: string }[];
  sources: SourceRef[];
}

export type Membership =
  | { kind: "pro"; until: string | null; admin?: boolean }
  | { kind: "expired"; until: string | null }
  | { kind: "none" }
  | { kind: "unknown" };

export interface Mentions {
  states: string[];
  species: Species[];
  units: string[];
  /** Set when they say they're a nonresident (and nothing suggests resident). */
  residency?: "nonresident";
}

const SPECIES_WORDS: [Species, RegExp][] = [
  ["elk", /\b(elk|wapiti)\b/i],
  ["mule-deer", /\b(mule\s*deer|muleys?|mulies?|blacktail)\b/i],
  ["whitetail", /\b(white[\s-]?tails?|whitetailed)\b/i],
  ["pronghorn", /\b(pronghorns?|antelope|speed\s*goats?)\b/i],
  ["moose", /\bmoose\b/i],
  ["bear", /\b(black\s*bears?|bears?\s+(hunts?|hunting|tags?|licen[cs]es?|seasons?|draws?|baiting|units?))\b/i],
  ["sheep", /\b(bighorns?|sheep|rams?)\b/i],
  ["goat", /\b(mountain\s*goats?|goats?)\b/i],
  ["lion", /\b(mountain\s*lions?|cougars?|pumas?)\b/i],
  ["turkey", /\b(turkeys?|gobblers?)\b/i],
];

// Two-letter abbreviations that are also common words or initials are only taken from names.
const AMBIGUOUS_ABBREV = new Set(["OR", "ID", "IN", "ME", "OK", "OH", "HI", "AL", "LA", "MA", "PA", "DE", "CO"]);

const UNIT_RE = /\b(?:units?|gmus?|hunt\s*areas?|areas?|hunting\s*districts?|districts?|hds?|zones?|wmus?|dau)\s*#?\s*((?:\d{1,3}[a-z]?)(?:\s*(?:,|and|&|\/)\s*\d{1,3}[a-z]?){0,4})\b/gi;

/** States (live or not), species and unit numbers a piece of text mentions, in order of first mention. */
export function detectMentions(text: string): Mentions {
  const states: { slug: string; at: number }[] = [];
  for (const s of STATE_LIST) {
    const name = new RegExp(`\\b${s.name.replace(/ /g, "\\s+")}\\b`, "i").exec(text);
    let at = name ? name.index : -1;
    if (at < 0 && !AMBIGUOUS_ABBREV.has(s.abbrev)) {
      const ab = new RegExp(`\\b${s.abbrev}\\b`).exec(text);
      if (ab) at = ab.index;
    }
    // "CO" is safe when it's clearly the state: "CO elk", "in CO", "CO resident".
    if (at < 0 && s.abbrev === "CO") {
      const co = /\b(in|for|from|hunt(?:ing)?)\s+CO\b|\bCO\s+(elk|deer|mule|pronghorn|antelope|moose|bear|sheep|goat|lion|turkey|resident|nonresident|draw|unit|gmu)/.exec(text);
      if (co) at = co.index;
    }
    if (at >= 0) states.push({ slug: s.slug, at });
  }
  states.sort((a, b) => a.at - b.at);
  // "West Virginia" also contains "Virginia"; drop a state whose name sits inside another match.
  const names = states.map((s) => STATE_LIST.find((x) => x.slug === s.slug)!.name);
  const keptStates = states
    .filter((s, i) => !names.some((n, j) => j !== i && n !== names[i] && n.includes(names[i])))
    .map((s) => s.slug);

  const species: { sp: Species; at: number }[] = [];
  for (const [sp, re] of SPECIES_WORDS) {
    const m = re.exec(text);
    if (m) species.push({ sp, at: m.index });
  }
  species.sort((a, b) => a.at - b.at);

  const units: string[] = [];
  for (const m of text.matchAll(UNIT_RE)) {
    for (const u of m[1].split(/\s*(?:,|and|&|\/)\s*/i)) {
      const c = canonicalUnit(u);
      if (c && !units.includes(c)) units.push(c);
    }
  }
  const nonres = /\bnon-?\s?residents?\b/i.test(text) && !/\bresidents?\b/i.test(text.replace(/\bnon-?\s?residents?\b/gi, ""));
  return { states: keptStates, species: species.map((s) => s.sp), units: units.slice(0, 6), ...(nonres ? { residency: "nonresident" as const } : {}) };
}

function unitsFromPreferences(p: HuntingPreferences | null): string[] {
  if (!p?.units) return [];
  const found = detectMentions(p.units).units;
  if (found.length) return found;
  // The form's units box is often just "61, 62, 201".
  return Array.from(new Set((p.units.match(/\b\d{1,3}[a-z]?\b/gi) || []).map(canonicalUnit))).slice(0, 6);
}

export function membershipLine(m: Membership): string {
  switch (m.kind) {
    case "pro":
      return m.admin ? "This sender is the site owner/admin." : `Active HuntScout Pro member${m.until ? `, access through ${formatDate(m.until.slice(0, 10))}` : ""}.`;
    case "expired":
      return `Past HuntScout Pro member; access ended${m.until ? ` ${formatDate(m.until.slice(0, 10))}` : ""}.`;
    case "none":
      return "No HuntScout Pro purchase found for this email address (they may have bought with a different address, or not be a member).";
    default:
      return "Membership couldn't be checked right now (payment system unavailable). Don't state their membership status.";
  }
}

export function preferencesLines(p: HuntingPreferences | null): string | null {
  if (!p) return null;
  const name = (slug: string) => STATE_LIST.find((s) => s.slug === slug)?.name ?? slug;
  const rows: string[] = [];
  if (p.states.length) rows.push(`States: ${p.states.map(name).join(", ")}`);
  if (p.species.length) rows.push(`Species: ${p.species.map((s) => SPECIES_LABELS[s as Species] ?? s).join(", ")}`);
  if (p.residency) rows.push(`Applying as: ${p.residency}${p.homeState ? `, home state ${p.homeState}` : ""}`);
  else if (p.homeState) rows.push(`Home state: ${p.homeState}`);
  if (p.methods.length) rows.push(`Methods: ${p.methods.join(", ")}`);
  if (p.goals.length) rows.push(`Goals: ${p.goals.join(", ")}`);
  if (p.units) rows.push(`Units they named: ${p.units}`);
  if (p.points) rows.push(`Points: ${p.points}`);
  if (p.notes) rows.push(`Notes: ${p.notes}`);
  return rows.length ? rows.join("\n") : null;
}

function sourceTitle(st: FactsState, id: string): string {
  const s = st.sources.find((x) => x.id === id);
  return s ? `${s.title}${s.dataYear ? ` (${s.dataYear})` : ""}` : id;
}

function pct(n: number | null): string {
  return n == null ? "n/a" : `${Number(n.toFixed(1))}%`;
}

function drawLine(r: DrawRecord, residency: "resident" | "nonresident" | "both"): string {
  const sides = residency === "both" ? (["resident", "nonresident"] as const) : ([residency] as const);
  const parts = sides.map((side) => {
    const { stats, pool } = drawStats(r, side);
    if (!stats) return `${side}: no ${side} figures`;
    const label = pool === "total" ? "all applicants" : side;
    const min = minPointsDrawn(r, side);
    return `${label}: ${stats.drawn ?? "?"} drawn of ${stats.applicants ?? "?"} applicants (${pct(oddsOf(stats))})${stats.quota != null ? `, quota ${stats.quota}` : ""}${min != null ? `, lowest points drawn ${min}` : ""}`;
  });
  return `- ${r.huntCode} — ${r.description}${r.seasonDates ? ` — season ${r.seasonDates}` : ""}: ${parts.join("; ")} (${r.choice === "first" ? "first-choice applications" : "all choices"})`;
}

export interface FactsInput {
  states: FactsState[];
  mentions: Mentions;
  preferences: HuntingPreferences | null;
  today: string;
  /** Draw rows for a state/species (loaded only for mentioned units). */
  drawRows?: (slug: string, species: Species) => Promise<DrawRecord[]>;
  maxChars?: number;
}

/** Agency facts block for the prompt. Bounded: at most 3 states x 3 species, capped in characters. */
export async function buildAgencyFacts(input: FactsInput): Promise<{ text: string; states: string[]; species: Species[]; units: string[] }> {
  const { states, mentions, preferences, today } = input;
  const max = input.maxChars ?? INBOUND_LIMITS.factsChars;
  const bySlug = new Map(states.map((s) => [s.slug, s]));

  const wantedStates = Array.from(new Set([...mentions.states, ...(preferences?.states || [])])).filter((s) => bySlug.has(s)).slice(0, 3);
  const wantedSpecies = Array.from(new Set<Species>([...mentions.species, ...((preferences?.species || []) as Species[])])).slice(0, 3);
  const units = Array.from(new Set([...mentions.units, ...unitsFromPreferences(preferences)])).slice(0, 4);

  const blocks: string[] = [];
  for (const slug of wantedStates) {
    const st = bySlug.get(slug)!;
    const residency = memberResidencyIn({ residency: preferences?.residency || mentions.residency || "", homeState: preferences?.homeState || "" }, st.abbrev);
    const lines: string[] = [
      `## ${st.name} — ${st.agency.name} (${st.agency.url}); HuntScout Pro last checked this state's facts ${formatDate(st.lastReviewed)}; hunt areas are called "${st.unitTerm}".`,
      `How the draw works: ${st.overview}`,
    ];
    const speciesHere = st.species.filter((s) => s.drawSystem !== "none");
    const chosen = wantedSpecies.length ? speciesHere.filter((s) => wantedSpecies.includes(s.species)) : [];
    if (!chosen.length) {
      lines.push(`Species HuntScout Pro covers here: ${speciesHere.map((s) => SPECIES_LABELS[s.species]).join(", ")}.`);
    }
    for (const info of chosen) {
      const label = info.displayName || SPECIES_LABELS[info.species];
      lines.push(`### ${st.name} ${label}`);
      lines.push(`Draw system: ${info.drawSystemSummary}${info.pointsMatter && info.pointName ? ` (points are called "${info.pointName}s")` : ""}`);
      if (info.residentNote) lines.push(`Residents: ${info.residentNote}`);
      if (info.nonresidentNote) lines.push(`Nonresidents: ${info.nonresidentNote}`);
      if (info.otcSummary) lines.push(`Over the counter: ${info.otcSummary}`);
      const upcoming = info.keyDates
        .filter((k) => keyDateEnd(k) >= today)
        .filter((k) => !k.residency || residency === "both" || k.residency === residency)
        .sort((a, b) => keyDateEnd(a).localeCompare(keyDateEnd(b)))
        .slice(0, 8);
      if (upcoming.length) {
        lines.push("Upcoming key dates:");
        for (const k of upcoming) {
          lines.push(`- ${k.label}: ${formatKeyDate(k)} (${k.cycle} cycle, ${k.status}${k.residency ? `, ${k.residency}s` : ""})${k.note ? ` — ${k.note}` : ""} [source: ${sourceTitle(st, k.sourceId)}]`);
        }
      } else {
        lines.push("Upcoming key dates: none published in our data yet.");
      }
      const fees = st.fees
        .filter((f) => f.species === info.species)
        .filter((f) => residency === "both" || f.residency === residency)
        .slice(0, 6);
      for (const f of fees) {
        lines.push(`- Fee: ${f.item} (${f.residency}, ${f.licenseYear}): $${f.amountUsd.toFixed(2)}${f.note ? ` — ${f.note}` : ""} [source: ${sourceTitle(st, f.sourceId)}]`);
      }
      const seasons = generalSeasons(st.seasons.filter((s) => s.species === info.species)).slice(0, 6);
      for (const s of seasons) {
        const scope = seasonScope(s, st.unitTerm);
        lines.push(`- Season: ${s.label}: ${formatDate(s.start)} – ${formatDate(s.end)}${scope ? ` (${scope})` : ""} [source: ${sourceTitle(st, s.sourceId)}]`);
      }
      if (units.length && input.drawRows) {
        const rows = await input.drawRows(st.slug, info.species).catch(() => [] as DrawRecord[]);
        const latest = rows.reduce((m, r) => Math.max(m, r.year), 0);
        for (const u of units) {
          const hits = rows.filter((r) => r.year === latest && r.units.some((x) => canonicalUnit(x) === u)).slice(0, 8);
          if (!hits.length) continue;
          lines.push(`${st.unitTerm} ${u} — ${latest} draw results (agency figures):`);
          for (const r of hits) lines.push(`${drawLine(r, residency)} [source: ${sourceTitle(st, r.sourceId)}]`);
        }
      }
    }
    blocks.push(lines.join("\n"));
  }

  let text = blocks.join("\n\n");
  if (text.length > max) text = `${text.slice(0, max)}\n[facts trimmed]`;
  return { text, states: wantedStates, species: wantedSpecies, units };
}

/** Plain-text transcript of the conversation, oldest first. Untrusted: wrapped and defanged by buildPrompt. */
export function transcript(thread: Thread, maxChars = 16000): string {
  const parts = thread.messages.map((m) => {
    const who = m.direction === "in" ? "CUSTOMER" : "ADAM (already sent)";
    const files = m.attachments?.length ? `\n[attachments: ${m.attachments.join(", ")}]` : "";
    return `--- ${who}, ${m.at.slice(0, 16).replace("T", " ")} UTC ---\n${m.text}${files}`;
  });
  // Keep the newest messages when it's long.
  let out = parts.join("\n\n");
  while (out.length > maxChars && parts.length > 1) {
    parts.shift();
    out = `[earlier messages omitted]\n\n${parts.join("\n\n")}`;
  }
  return out.slice(-maxChars);
}

/** Customer text can't open or close our prompt sections. */
export function defang(s: string): string {
  return s.replace(/</g, "‹").replace(/>/g, "›");
}

export interface DraftContext {
  prompt: string;
  summary: DraftContextSummary;
}

export async function buildDraftContext(input: {
  thread: Thread;
  membership: Membership;
  preferences: HuntingPreferences | null;
  states: FactsState[];
  liveSlugs: readonly string[];
  today: string;
  drawRows?: FactsInput["drawRows"];
}): Promise<DraftContext> {
  const { thread, membership, preferences } = input;
  const said = [thread.subject, ...thread.messages.filter((m) => m.direction === "in").map((m) => m.text)].join("\n");
  const mentions = detectMentions(said);
  const facts = await buildAgencyFacts({ states: input.states, mentions, preferences, today: input.today, drawRows: input.drawRows });
  const live = input.states.map((s) => s.name).sort();
  const notLive = mentions.states.filter((s) => !input.liveSlugs.includes(s)).map((s) => STATE_LIST.find((x) => x.slug === s)?.name ?? s);
  const prefs = preferencesLines(preferences);
  const first = (thread.customer.name || "").trim().split(/\s+/)[0] || "";

  const prompt = `Today is ${formatDate(input.today)}.

<customer>
Name on their email: ${first ? defang(first) : "(none given)"}
Membership: ${membershipLine(membership)}
</customer>

<saved_preferences>
${prefs ? defang(prefs) : "None saved."}
</saved_preferences>

<huntscout_facts>
States with official agency data on HuntScout Pro: ${live.join(", ")}.${notLive.length ? `\nOther states named in the conversation that HuntScout Pro doesn't cover yet (only relevant if they asked about hunting there; they can request one at https://www.huntscoutpro.com/request-state): ${notLive.join(", ")}.` : ""}
${facts.text || "No state-specific facts matched this conversation."}
</huntscout_facts>

<conversation subject="${defang(thread.subject).replace(/"/g, "'")}">
${defang(transcript(thread))}
</conversation>

Write Adam's reply to the customer's latest message.`;

  return {
    prompt,
    summary: {
      membership: membership.kind,
      preferences: prefs ? "saved" : null,
      states: facts.states,
      species: facts.species,
      units: facts.units,
      factsChars: facts.text.length,
    },
  };
}
