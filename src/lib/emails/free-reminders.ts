// Emails for the free one-state deadline reminders: the double opt-in
// confirmation and the daily digest. Same branded shell as the Pro emails.

import { SPECIES_LABELS, type Species } from "@/data/types";
import { PRICE } from "@/lib/promo";
import type { DigestGroup } from "@/lib/reminders";
import { DARK, GOLD, LINK, SIGNATURE_TEXT, SITE, button, esc, layout, type RenderedEmail } from "@/lib/emails/onboarding";
import { digestGroupsHtml, digestGroupsText, subjectFor } from "@/lib/emails/reminders";

const speciesList = (species: readonly string[]) =>
  species.map((s) => SPECIES_LABELS[s as Species] ?? s).join(", ");

const WHAT_YOU_GET =
  "We email you 14 days and 3 days before each application deadline the agency publishes, and on the day an application window opens. At most one email a day.";

export interface ConfirmEmailOptions {
  stateName: string;
  agencyName: string;
  species: readonly string[];
  confirmUrl: string;
  /** "change" when an existing subscriber asked for a different state or species. */
  mode?: "new" | "change";
}

export function freeConfirmEmail({ stateName, agencyName, species, confirmUrl, mode = "new" }: ConfirmEmailOptions): RenderedEmail {
  const what = species.length ? `${stateName} (${speciesList(species)})` : stateName;
  const subject = mode === "change" ? `Confirm the change to your ${stateName} deadline reminders` : `Confirm your ${stateName} deadline reminders`;
  const lead =
    mode === "change"
      ? `Click the button to switch your free deadline reminders to <b>${esc(what)}</b>. Until you do, your current reminders stay as they are.`
      : `Click the button to start free application deadline reminders for <b>${esc(what)}</b>.`;

  const html = layout(
    `One click to start your ${stateName} deadline reminders.`,
    `<p>Hi there,</p>
<p>${lead}</p>
${button(esc(confirmUrl), mode === "change" ? "Confirm the change" : "Confirm my reminders")}
<p>${WHAT_YOU_GET} Dates are copied from ${esc(agencyName)}'s published schedule.</p>
<p style="font-size:14px;color:#555;">This link works for 7 days. If you didn't ask for this, ignore this email and we won't send anything.</p>`,
    `Someone entered this address for free deadline reminders at huntscoutpro.com. Nothing is sent unless the link is clicked.<br>
HuntScout Pro &middot; <a href="${SITE}" style="color:#8a8a8a;">www.huntscoutpro.com</a>`
  );

  const text = `Hi there,

${mode === "change" ? `Open this link to switch your free deadline reminders to ${what}. Until you do, your current reminders stay as they are.` : `Open this link to start free application deadline reminders for ${what}.`}

${confirmUrl}

${WHAT_YOU_GET} Dates are copied from ${agencyName}'s published schedule.

This link works for 7 days. If you didn't ask for this, ignore this email and we won't send anything.

${SIGNATURE_TEXT}`;

  return { subject, html, text };
}

export interface FreeDigestEmailOptions {
  stateName: string;
  groups: DigestGroup[];
  unsubscribeUrl: string;
}

export const FREE_UPSELL = "Pro shows the full draw results and harvest for every state";

export function freeRemindersEmail({ stateName, groups, unsubscribeUrl }: FreeDigestEmailOptions): RenderedEmail {
  const count = groups.reduce((n, g) => n + g.entries.length, 0);
  const subject = subjectFor(groups);
  const intro = `${count === 1 ? "An application date" : "Application dates"} in ${stateName} ${count === 1 ? "is" : "are"} coming up. We send these 14 days and 3 days before a deadline, and on the day an application window opens.`;
  const disclaimer =
    "Dates are copied from the agency's published schedule. Agencies can change them, and deadlines often have a cut-off time, so confirm on the agency's site before you apply.";
  const upsellDetail = `That means applicants and tags drawn by hunt code (with point levels where the agency publishes them) and harvest by unit, from the agency reports, for every state we cover. Pro members also get these reminders for all the states they follow. ${PRICE.summary}.`;

  const html = layout(
    `${count === 1 ? "1 application date" : `${count} application dates`} coming up in ${stateName}.`,
    `<p>Hi there,</p>
<p>${esc(intro)}</p>
${digestGroupsHtml(groups)}
<p style="background:#faf7ef;border-left:3px solid ${GOLD};padding:10px 14px;font-size:14px;margin-top:22px;">${esc(disclaimer)}</p>
<p style="font-size:14px;border-top:1px solid #eee;padding-top:14px;margin-top:22px;"><b style="color:${DARK};">${esc(FREE_UPSELL)}.</b> ${esc(upsellDetail)} <a href="${SITE}/pricing" style="color:${LINK};">See what Pro includes</a></p>`,
    `You're getting this because you confirmed free ${esc(stateName)} deadline reminders at huntscoutpro.com.<br>
<a href="${esc(unsubscribeUrl)}" style="color:#8a8a8a;">Unsubscribe</a> &middot; <a href="${SITE}/calendar#free-reminders" style="color:#8a8a8a;">Switch to another state</a><br>
HuntScout Pro &middot; <a href="${SITE}" style="color:#8a8a8a;">www.huntscoutpro.com</a>`
  );

  const text = `Hi there,

${intro}

${digestGroupsText(groups)}

${disclaimer}

${FREE_UPSELL}. ${upsellDetail}
See what Pro includes: ${SITE}/pricing

Switch to another state: ${SITE}/calendar#free-reminders
Unsubscribe: ${unsubscribeUrl}

${SIGNATURE_TEXT}`;

  return { subject, html, text };
}
