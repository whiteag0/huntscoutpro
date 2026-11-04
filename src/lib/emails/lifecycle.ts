// Lifecycle emails: the owner's new-purchase alert and daily onboarding check, and the
// "finish your hunting profile" nudges to members who haven't picked a state.
// Same branded shell as the onboarding emails (src/lib/emails/onboarding.ts).

import { SPECIES_LABELS, type Species } from "@/data/types";
import { stateBySlug } from "@/data/state-list";
import { DARK, GOLD, LINK, SIGNATURE_TEXT, SITE, button, esc, firstNameOf, layout, type RenderedEmail } from "@/lib/emails/onboarding";

/** "Nov 4, 2026, 11:05 AM MT": the owner works in Mountain Time. */
export function mountainTime(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "unknown time";
  return `${d.toLocaleString("en-US", { timeZone: "America/Denver", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} MT`;
}

/** "$14.99" (USD) or "14.99 EUR". */
export function formatAmount(cents: number | null | undefined, currency: string | null | undefined): string {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return "unknown amount";
  const cur = (currency || "usd").toUpperCase();
  const value = (cents / 100).toFixed(2);
  return cur === "USD" ? `$${value}` : `${value} ${cur}`;
}

function stateNames(slugs: readonly string[]): string {
  return slugs.map((s) => stateBySlug(s)?.name ?? s).join(", ");
}

function speciesNames(ids: readonly string[]): string {
  return ids.map((id) => SPECIES_LABELS[id as Species] ?? id).join(", ");
}

function rowsHtml(rows: [string, string][]): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows
    .map(
      ([k, v]) =>
        `<tr><td valign="top" style="padding:7px 14px 7px 0;color:#555;white-space:nowrap;border-bottom:1px solid #eee;"><b>${esc(k)}</b></td><td style="padding:7px 0;border-bottom:1px solid #eee;word-break:break-word;">${esc(v || "—")}</td></tr>`
    )
    .join("\n")}</table>`;
}

const OWNER_FOOTER = `Internal alert from huntscoutpro.com. Members never see this email.`;

/** Internal: a paid HuntScout Pro checkout. No card details, only what the owner needs to follow up. */
export function purchaseNotification(opts: {
  name?: string | null;
  email: string;
  amountCents: number | null;
  currency: string | null;
  paidAtMs: number;
  accessUntil?: Date | null;
  states?: readonly string[];
  paymentIntentId: string;
}): RenderedEmail {
  const amount = formatAmount(opts.amountCents, opts.currency);
  const subject = `New HuntScout Pro purchase: ${opts.email} (${amount})`;
  const rows: [string, string][] = [
    ["Buyer", opts.name ? `${opts.name} <${opts.email}>` : opts.email],
    ["Amount", amount],
    ["Paid", mountainTime(opts.paidAtMs)],
    ["Access until", opts.accessUntil ? opts.accessUntil.toISOString().slice(0, 10) : ""],
    ["States", opts.states?.length ? stateNames(opts.states) : "Not answered yet"],
    ["Payment", opts.paymentIntentId],
  ];
  const html = layout(
    `${opts.email} bought HuntScout Pro (${amount}).`,
    `<p style="margin:0 0 6px 0;font-size:18px;"><b style="color:${DARK};">New HuntScout Pro purchase</b></p>
<p style="margin:0 0 16px 0;color:#555;">The welcome email goes out automatically. Reply to this email to write to the buyer directly.</p>
${rowsHtml(rows)}`,
    OWNER_FOOTER,
    false
  );
  const text = `NEW HUNTSCOUT PRO PURCHASE

The welcome email goes out automatically. Reply to this email to write to the buyer directly.

${rows.map(([k, v]) => `${k}: ${v || "-"}`).join("\n")}`;
  return { subject, html, text };
}

export interface OnboardingCheckRow {
  email: string;
  name?: string | null;
  paidAtMs: number;
  paymentIntentId: string;
  /** One line per problem with this purchase. */
  problems: string[];
}

/** Internal: the daily check found purchases whose onboarding didn't finish. */
export function onboardingCheckEmail(opts: { rows: OnboardingCheckRow[]; windowHours: number }): RenderedEmail {
  const n = opts.rows.length;
  const subject = `HuntScout onboarding check: ${n === 1 ? "1 purchase needs" : `${n} purchases need`} attention`;
  const block = (r: OnboardingCheckRow) => `<tr><td style="padding:12px 0;border-top:1px solid #eee;">
<div style="font-weight:bold;color:${DARK};word-break:break-word;">${esc(r.name ? `${r.name} <${r.email}>` : r.email)}</div>
<div style="font-size:13px;color:#555;">Paid ${esc(mountainTime(r.paidAtMs))} &middot; ${esc(r.paymentIntentId)}</div>
<ul style="padding-left:20px;margin:6px 0 0 0;">${r.problems.map((p) => `<li style="margin:0 0 4px 0;">${esc(p)}</li>`).join("")}</ul>
</td></tr>`;
  const html = layout(
    `${n} HuntScout ${n === 1 ? "purchase" : "purchases"} with missing onboarding emails or reports.`,
    `<p style="margin:0 0 6px 0;font-size:18px;"><b style="color:${DARK};">Onboarding check</b></p>
<p style="margin:0 0 12px 0;color:#555;">Purchases and form saves from the last ${opts.windowHours} hours where something didn't go out. Each one needs a manual follow-up; the payment id finds it in Stripe.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${opts.rows.map(block).join("\n")}
</table>`,
    `Daily check from the deadline-reminders job on huntscoutpro.com. It only emails when something needs attention.`,
    false
  );
  const text = `ONBOARDING CHECK

Purchases and form saves from the last ${opts.windowHours} hours where something didn't go out. Each one needs a manual follow-up; the payment id finds it in Stripe.

${opts.rows
  .map((r) => `${r.name ? `${r.name} <${r.email}>` : r.email}\nPaid ${mountainTime(r.paidAtMs)} - ${r.paymentIntentId}\n${r.problems.map((p) => `- ${p}`).join("\n")}`)
  .join("\n\n")}`;
  return { subject, html, text };
}

/**
 * To a member whose hunting profile has no states, 3 days (step 1) and 7 days (step 2)
 * after purchase. `species` is what they did pick, if anything.
 */
export function profileNudgeEmail(opts: { name?: string | null; species: readonly string[]; step: 1 | 2; unsubscribeUrl: string }): RenderedEmail {
  const first = firstNameOf(opts.name);
  const picked = opts.species.length ? speciesNames(opts.species) : "";
  const subject = opts.step === 1 ? "Which states are you applying in?" : "No deadline reminders yet: add a state to your profile";
  const status = picked
    ? `Your HuntScout Pro profile lists ${picked} as your species but has no states yet.`
    : "You haven't told us where you hunt yet, so your HuntScout Pro profile is empty.";
  const report = picked ? "an updated personal scouting report" : "your personal scouting report";
  const intro =
    opts.step === 1
      ? `${status} Add the states you hunt or plan to apply in, and you'll get:`
      : `${status} Deadline reminders only cover the states in your profile, so right now there's nothing to remind you about. This is the last time we'll ask. Add your states and you'll get:`;
  const gets = [
    "Deadline reminders by email 14 days and 3 days before each application deadline in those states, and on the day a window opens.",
    `${report[0].toUpperCase()}${report.slice(1)}, built from the state agencies' own draw, harvest, date and fee data for your answers.`,
  ];

  const footer = `You're getting this because you're a HuntScout Pro member and your hunting profile has no states yet.<br>
<a href="${SITE}/account" style="color:#8a8a8a;">Manage reminders</a> &middot; <a href="${esc(opts.unsubscribeUrl)}" style="color:#8a8a8a;">Unsubscribe from reminder emails</a><br>
HuntScout Pro &middot; <a href="${SITE}" style="color:#8a8a8a;">www.huntscoutpro.com</a>`;

  const html = layout(
    opts.step === 1 ? "Add your states for deadline reminders and your scouting report." : "Deadline reminders only cover the states in your profile.",
    `<p>Hi ${esc(first)},</p>
<p>${esc(intro)}</p>
<ul style="padding-left:20px;margin:8px 0;">
${gets.map((g) => `<li style="margin:0 0 8px 0;">${esc(g)}</li>`).join("\n")}
</ul>
${button(`${SITE}/welcome`, "Finish my hunting profile")}
<p>It takes about 2 minutes. Or just reply with your states and species, and I'll add them for you.</p>
<p style="font-size:13px;color:#555;border-left:3px solid ${GOLD};padding-left:10px;">Only want reminders for some states? Pick just those. You can change them anytime in <a href="${SITE}/account" style="color:${LINK};">My Account</a>.</p>`,
    footer
  );

  const text = `Hi ${first},

${intro}

${gets.map((g) => `- ${g}`).join("\n")}

Finish my hunting profile: ${SITE}/welcome

It takes about 2 minutes. Or just reply with your states and species, and I'll add them for you.

Only want reminders for some states? Pick just those. You can change them anytime in My Account: ${SITE}/account

Unsubscribe from reminder emails: ${opts.unsubscribeUrl}

${SIGNATURE_TEXT}`;

  return { subject, html, text };
}
