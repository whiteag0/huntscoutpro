// Daily deadline reminder digest for HuntScout Pro members. Same branded look
// as the onboarding emails (src/lib/emails/onboarding.ts).

import { SPECIES_LABELS, type Species } from "@/data/types";
import { formatDate } from "@/lib/agency-format";
import type { DigestEntry, DigestGroup } from "@/lib/reminders";
import { DARK, GOLD, LINK, SIGNATURE_TEXT, SITE, esc, firstNameOf, layout, type RenderedEmail } from "@/lib/emails/onboarding";

const speciesLabel = (s: Species) => SPECIES_LABELS[s] ?? s;

function days(n: number): string {
  return n === 1 ? "1 day" : `${n} days`;
}

/** "Closes Nov 10, 2026, 3 days from today." etc. Dates as the agency published them. */
export function whenLine(e: DigestEntry): string {
  const end = e.end || e.date || "";
  const left = `${days(e.daysLeft)} from today`;
  if (e.kind === "opens") return `Opens today. Closes ${formatDate(end)}, ${left}.`;
  if (e.start && e.end && e.start > todayFromEntry(e)) return `Opens ${formatDate(e.start)}. Closes ${formatDate(e.end)}, ${left}.`;
  if (e.start && e.end) return `Closes ${formatDate(e.end)}, ${left}.`;
  return `${formatDate(end)}, ${left}.`;
}

// The end date minus daysLeft is today; keeps the template free of clocks.
function todayFromEntry(e: DigestEntry): string {
  const end = e.end || e.date || "";
  const [y, m, d] = end.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - e.daysLeft)).toISOString().slice(0, 10);
}

/** The full window, shown only once it's already open (otherwise whenLine says it all). */
function windowLine(e: DigestEntry): string | null {
  if (!e.start || !e.end || e.kind === "opens" || e.start > todayFromEntry(e)) return null;
  const sameYear = e.start.slice(0, 4) === e.end.slice(0, 4);
  return `${formatDate(e.start, !sameYear)} – ${formatDate(e.end)}`;
}

export function stateLink(state: string, species: Species): string {
  return `${SITE}/states/${state}?species=${encodeURIComponent(species)}`;
}

export function subjectFor(groups: DigestGroup[]): string {
  const all = groups.flatMap((g) => g.entries);
  const soonest = all.filter((e) => e.kind === "closes").sort((a, b) => a.daysLeft - b.daysLeft)[0];
  const names = groups.map((g) => g.stateName);
  const where = names.length <= 3 ? names.join(", ") : `${names.slice(0, 2).join(", ")} + ${names.length - 2} more`;
  if (soonest) return `Application reminder: ${where} (${soonest.daysLeft === 1 ? "1 day" : `${soonest.daysLeft} days`} left)`;
  return `Application reminder: ${where} (opens today)`;
}

function entryHtml(g: DigestGroup, e: DigestEntry): string {
  const win = windowLine(e);
  const speciesLinks = e.species
    .map((s) => `<a href="${esc(stateLink(g.state, s))}" style="color:${LINK};">${esc(speciesLabel(s))}</a>`)
    .join(", ");
  return `<tr><td style="padding:12px 0;border-top:1px solid #eee;">
<div style="font-weight:bold;color:${DARK};">${esc(e.label)}</div>
<div style="margin-top:2px;"><span style="background:${e.kind === "opens" ? "#e8f1ea" : "#faf3e1"};color:${DARK};font-size:13px;padding:1px 6px;">${esc(whenLine(e))}</span></div>
${win ? `<div style="font-size:13px;color:#555;margin-top:4px;">Window: ${esc(win)}</div>` : ""}
${e.status === "tentative" ? `<div style="font-size:13px;color:#555;margin-top:4px;">Tentative: the agency hasn&apos;t confirmed this date yet.</div>` : ""}
${e.note ? `<div style="font-size:13px;color:#555;margin-top:4px;">${esc(e.note)}</div>` : ""}
<div style="font-size:13px;margin-top:6px;">On HuntScout: ${speciesLinks} &nbsp;&middot;&nbsp; <a href="${esc(e.sourceUrl)}" style="color:${LINK};">Agency source${e.sourceTitle ? `: ${esc(e.sourceTitle)}` : ""}</a></div>
</td></tr>`;
}

function groupHtml(g: DigestGroup): string {
  return `<p style="margin:22px 0 2px 0;"><b style="color:${DARK};font-size:17px;">${esc(g.stateName)}</b><br><span style="font-size:13px;color:#555;">${esc(g.agencyName)}</span></p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${g.entries.map((e) => entryHtml(g, e)).join("\n")}
</table>`;
}

/** Every state's dates as email HTML (agency text escaped). Shared with the free-reminder digest. */
export function digestGroupsHtml(groups: DigestGroup[]): string {
  return groups.map(groupHtml).join("\n");
}

function entryText(g: DigestGroup, e: DigestEntry): string {
  const win = windowLine(e);
  return [
    `- ${e.label}`,
    `  ${whenLine(e)}`,
    win ? `  Window: ${win}` : null,
    e.status === "tentative" ? "  Tentative: the agency hasn't confirmed this date yet." : null,
    e.note ? `  ${e.note}` : null,
    ...e.species.map((s) => `  ${speciesLabel(s)} on HuntScout: ${stateLink(g.state, s)}`),
    `  Agency source: ${e.sourceUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Plain-text version of digestGroupsHtml. */
export function digestGroupsText(groups: DigestGroup[]): string {
  return groups.map((g) => `${g.stateName.toUpperCase()} (${g.agencyName})\n${g.entries.map((e) => entryText(g, e)).join("\n\n")}`).join("\n\n");
}

export interface ReminderEmailOptions {
  name?: string | null;
  groups: DigestGroup[];
  unsubscribeUrl: string;
}

export function remindersEmail({ name, groups, unsubscribeUrl }: ReminderEmailOptions): RenderedEmail {
  const first = firstNameOf(name);
  const subject = subjectFor(groups);
  const count = groups.reduce((n, g) => n + g.entries.length, 0);

  const footer = `You're getting this because you're a HuntScout Pro member and these states are in your hunting preferences.<br>
<a href="${SITE}/account" style="color:#8a8a8a;">Manage reminders</a> &middot; <a href="${esc(unsubscribeUrl)}" style="color:#8a8a8a;">Unsubscribe from deadline reminders</a><br>
HuntScout Pro &middot; <a href="${SITE}" style="color:#8a8a8a;">www.huntscoutpro.com</a>`;

  const html = layout(
    `${count === 1 ? "1 application date" : `${count} application dates`} coming up in ${groups.map((g) => g.stateName).join(", ")}.`,
    `<p>Hi ${esc(first)},</p>
<p>${count === 1 ? "An application date" : "Application dates"} in the states you follow ${count === 1 ? "is" : "are"} coming up. We send these 14 days and 3 days before a deadline, and on the day an application window opens.</p>
${digestGroupsHtml(groups)}
<p style="background:#faf7ef;border-left:3px solid ${GOLD};padding:10px 14px;font-size:14px;margin-top:22px;">Dates are copied from each agency's published schedule. Agencies can change them, and deadlines often have a cut-off time, so confirm on the agency's site before you apply.</p>
<p>Want different states or species? <a href="${SITE}/welcome" style="color:${LINK};">Update your hunting preferences</a>, or turn these emails off in <a href="${SITE}/account" style="color:${LINK};">My Account</a>.</p>`,
    footer
  );

  const text = `Hi ${first},

${count === 1 ? "An application date" : "Application dates"} in the states you follow ${count === 1 ? "is" : "are"} coming up. We send these 14 days and 3 days before a deadline, and on the day an application window opens.

${digestGroupsText(groups)}

Dates are copied from each agency's published schedule. Agencies can change them, and deadlines often have a cut-off time, so confirm on the agency's site before you apply.

Update your hunting preferences: ${SITE}/welcome
Manage reminders: ${SITE}/account
Unsubscribe from deadline reminders: ${unsubscribeUrl}

${SIGNATURE_TEXT}`;

  return { subject, html, text };
}
