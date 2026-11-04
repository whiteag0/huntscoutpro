// The email that carries a member's personal scouting report (PDF attached).
// Same branded shell as the onboarding emails; every fact in it is copied from
// the report model, which is built only from agency data.
import type { DateStatus, ScoutingReport } from "@/lib/report-core";
import { formatDate } from "@/lib/agency-format";
import { DARK, GOLD, SIGNATURE_TEXT, SITE, button, esc, firstNameOf, layout, type RenderedEmail } from "@/lib/emails/onboarding";

const STATUS_TEXT: Record<DateStatus, string> = {
  confirmed: "confirmed",
  rule: "tentative, set by agency rule",
  tentative: "tentative",
  reference: "last cycle's date; new date not published yet",
};

function listOf(xs: readonly string[]): string {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;
}

/** "Colorado elk", "Wyoming, Montana and Idaho elk and mule deer". */
export function reportTopic(r: Pick<ScoutingReport, "stateNames" | "speciesLabels">): string {
  const states = listOf(r.stateNames);
  const species = listOf(r.speciesLabels.map((x) => x.toLowerCase()));
  return [states, species].filter(Boolean).join(" ") || "your hunts";
}

export function reportEmail(opts: { report: ScoutingReport; name?: string | null; pages?: number; test?: boolean }): RenderedEmail {
  const r = opts.report;
  const first = firstNameOf(opts.name ?? r.name);
  const topic = reportTopic(r);
  const subject = `${opts.test ? "[TEST] " : ""}Your HuntScout Pro scouting report: ${topic}`;
  const agencies = [...new Set(r.combos.map((c) => c.agencyShort))];
  const takeaways = r.takeaways.slice(0, 5);
  const dates = r.glance.slice(0, 6);
  const pages = opts.pages ? `${opts.pages}-page ` : "";

  const intro = r.combos.length
    ? `Thanks for telling us about your hunts. Attached is your ${pages}personal scouting report for ${topic}, built from the draw results, harvest reports, dates and fees published by ${listOf(agencies)}. Every number in it cites the agency document it came from.`
    : `Thanks for telling us about your hunts. Attached is your ${pages}personal scouting report. Tell us ${r.stateNames.length ? "which species you're after" : "which states you hunt"} and we'll send a full version for those hunts.`;

  const takeawayHtml = takeaways.length
    ? `<p style="margin-top:22px;"><b style="color:${DARK};font-size:16px;">The short version</b></p>
<ul style="padding-left:20px;margin:8px 0;">
${takeaways.map((t) => `<li style="margin:0 0 8px 0;"><b>${esc(t.lead)}</b> ${esc(t.text)}</li>`).join("\n")}
</ul>`
    : "";

  const dateHtml = dates.length
    ? `<p style="margin-top:22px;"><b style="color:${DARK};font-size:16px;">Your next dates</b></p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;font-size:14px;">
${dates
  .map(
    (g) =>
      `<tr><td valign="top" style="padding:7px 12px 7px 0;border-bottom:1px solid #eee;white-space:nowrap;"><b>${esc(g.when)}</b></td><td style="padding:7px 0;border-bottom:1px solid #eee;">${esc(g.stateName)} ${esc(g.species.join(", ").toLowerCase())}: ${esc(g.label)} <span style="color:#777;">(${STATUS_TEXT[g.status]})</span></td></tr>`
  )
  .join("\n")}
</table>`
    : "";

  const notesHtml = r.readNotes.length
    ? `<p style="background:#faf7ef;border-left:3px solid ${GOLD};padding:10px 14px;font-size:14px;margin-top:22px;"><b>How we read your answers.</b> ${r.readNotes.map(esc).join(" ")} If we got anything wrong, just reply and I'll send an updated report.</p>`
    : "";

  const html = layout(
    `Your personal scouting report for ${topic} is attached.`,
    `<p>Hi ${esc(first)},</p>
<p>${esc(intro)}</p>
${takeawayHtml}
${dateHtml}
${notesHtml}
<p style="margin-top:22px;">The report also covers how each draw works, the seasons, fees, ${r.combos.some((c) => c.units.length) ? "your units' draw and harvest history" : "the top units by harvest success"}, where you can realistically draw, and a checklist for each state.</p>
${button(`${SITE}/planner`, "Plan these hunts in HuntScout Pro")}
<p>Questions about anything in it, or a hunt you're weighing up? Reply to this email. I read every one and answer personally.</p>
<p style="font-size:13px;color:#666;">Draw results and harvest figures describe past seasons, and dates marked tentative can change. Please confirm dates and rules with the agency before you apply. Report compiled ${esc(formatDate(r.generatedOn))}.</p>`
  );

  const text = `Hi ${first},

${intro}
${takeaways.length ? `\nTHE SHORT VERSION\n${takeaways.map((t) => `- ${t.lead} ${t.text}`).join("\n")}\n` : ""}${dates.length ? `\nYOUR NEXT DATES\n${dates.map((g) => `- ${g.when}: ${g.stateName} ${g.species.join(", ").toLowerCase()}: ${g.label} (${STATUS_TEXT[g.status]})`).join("\n")}\n` : ""}${r.readNotes.length ? `\nHOW WE READ YOUR ANSWERS\n${r.readNotes.join(" ")} If we got anything wrong, just reply and I'll send an updated report.\n` : ""}
Plan these hunts in HuntScout Pro: ${SITE}/planner

Questions about anything in it, or a hunt you're weighing up? Reply to this email. I read every one and answer personally.

Draw results and harvest figures describe past seasons, and dates marked tentative can change. Please confirm dates and rules with the agency before you apply. Report compiled ${formatDate(r.generatedOn)}.

${SIGNATURE_TEXT}`;

  return { subject, html, text };
}
