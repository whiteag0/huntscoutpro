// Branded onboarding emails sent to new HuntScout Pro members.
// Inline styles and tables only, so they render in Gmail, Outlook and Apple Mail.

// Shared with the other branded emails (src/lib/emails/reminders.ts).
export const GOLD = "#C9A24A";
export const DARK = "#1F2326";
export const LINK = "#9a7a2c";
export const SITE = "https://www.huntscoutpro.com";
const REPLY_TO = "adam@huntscoutpro.com";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_FOOTER = `You're receiving this because you purchased HuntScout Pro at huntscoutpro.com.<br>
HuntScout Pro &middot; <a href="${SITE}" style="color:#8a8a8a;">www.huntscoutpro.com</a>`;

/**
 * Branded shell: dark header, white card with signature, small grey footer (HTML, already escaped).
 * `signature: false` drops Adam's signature (internal emails to the owner).
 */
export function layout(preheader: string, body: string, footerHtml: string = DEFAULT_FOOTER, signature = true): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HuntScout Pro</title></head>
<body style="margin:0;padding:0;background:#f4f2ee;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:Arial,Helvetica,sans-serif;color:#2b2f33;font-size:15px;line-height:1.6;">
<tr><td style="background:${DARK};padding:22px 28px;">
<img src="${SITE}/apple-icon.png" width="26" height="26" alt="" style="vertical-align:middle;border:0;margin-right:6px;border-radius:5px;"><span style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:.3px;vertical-align:middle;">HuntScout</span>
<span style="background:${GOLD};color:${DARK};font-size:11px;font-weight:bold;padding:2px 7px;margin-left:6px;vertical-align:middle;">PRO</span>
<div style="color:${GOLD};font-size:13px;letter-spacing:1.5px;margin-top:6px;">KNOW BEFORE YOU DRAW</div>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e3e3e3;border-top:3px solid ${GOLD};padding:26px 28px;">
${body}
${signature ? signatureHtml() : ""}
</td></tr>
<tr><td style="padding:16px 28px;font-size:12px;color:#8a8a8a;text-align:center;">
${footerHtml}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Adam's signature block (HTML). */
export function signatureHtml(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-top:2px solid ${GOLD};margin-top:24px;"><tr><td style="padding-top:10px;">
<div style="font-size:16px;font-weight:bold;color:${DARK};">Adam White</div>
<div style="color:#555;">CEO &amp; Founder</div>
<div style="font-weight:bold;color:${DARK};margin-top:2px;">HuntScout Pro <span style="color:${GOLD};">| Know Before You Draw</span></div>
<div style="margin-top:4px;"><a href="mailto:${REPLY_TO}" style="color:#555;text-decoration:none;">${REPLY_TO}</a> &nbsp;|&nbsp; <a href="${SITE}" style="color:${LINK};">www.huntscoutpro.com</a></div>
</td></tr></table>`;
}

export const SIGNATURE_TEXT = `Adam White
CEO & Founder
HuntScout Pro | Know Before You Draw
${REPLY_TO} | www.huntscoutpro.com`;

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr><td style="background:${GOLD};border-radius:6px;">
<a href="${href}" style="display:inline-block;padding:12px 22px;color:${DARK};font-weight:bold;text-decoration:none;font-size:15px;">${label}</a>
</td></tr></table>`;
}

export function firstNameOf(name: string | null | undefined): string {
  const first = (name || "").trim().split(/\s+/)[0];
  return first && first.length <= 40 ? first : "there";
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * Email 1: sent right after purchase. Buyers are signed in by then (checkout needs a
 * Google sign-in), so it skips sign-in steps and points at the one thing to do next:
 * the /welcome form, which emails them their personal scouting report.
 */
export function welcomeEmail(opts: { name?: string | null; email: string; accessUntil: Date | null }): RenderedEmail {
  const first = firstNameOf(opts.name);
  const until = opts.accessUntil ? formatDate(opts.accessUntil) : null;
  const subject = "You're in \u2014 2 minutes to get your personal scouting report";

  const html = layout(
    "Answer a few questions and we'll email you a scouting report built from agency data.",
    `<p>Hi ${esc(first)},</p>
<p>Thanks for joining HuntScout Pro. Your membership is active${until ? ` through <b>${until}</b>` : ""} and linked to <b>${esc(opts.email)}</b>, the Google account you checked out with.</p>
<p>One step left, and it takes about 2 minutes: tell us which states and species you're after, your points, and the units you're looking at. When you save, we email you a <b>personal scouting report</b> (PDF) built from the state agencies' own draw, harvest, date and fee data for your answers.</p>
${button(`${SITE}/welcome`, "Get my scouting report")}
<p>One favor: please reply <b>&ldquo;got it&rdquo;</b> to this email. It tells your inbox you want mail from us, so your report and deadline reminders don't land in spam or Promotions.</p>
<p>It's a one-time payment, so nothing renews. If HuntScout Pro isn't what you expected, reply within 30 days for a full refund. Questions? Reply here and I'll take care of it personally.</p>`
  );

  const text = `Hi ${first},

Thanks for joining HuntScout Pro. Your membership is active${until ? ` through ${until}` : ""} and linked to ${opts.email}, the Google account you checked out with.

One step left, and it takes about 2 minutes: tell us which states and species you're after, your points, and the units you're looking at. When you save, we email you a personal scouting report (PDF) built from the state agencies' own draw, harvest, date and fee data for your answers.

Get my scouting report: ${SITE}/welcome

One favor: please reply "got it" to this email. It tells your inbox you want mail from us, so your report and deadline reminders don't land in spam or Promotions.

It's a one-time payment, so nothing renews. If HuntScout Pro isn't what you expected, reply within 30 days for a full refund. Questions? Reply here and I'll take care of it personally.

${SIGNATURE_TEXT}`;

  return { subject, html, text };
}

const QUESTIONS: [string, string][] = [
  ["Where will you hunt?", "Which state or states are you focused on (resident or non-resident)?"],
  ["What species are you after?", "Elk, mule deer, whitetail, pronghorn, bear, moose, sheep, turkey?"],
  ["Which hunt area, unit or zone?", "Which units or GMUs are you considering or already know? Even a short list helps."],
  ["What is your method of take?", "Rifle, archery, muzzleloader, or shotgun (for turkey)?"],
  ["Where do you stand on points?", "Preference or bonus points already held, and the seasons you want to apply for."],
  ["What does success look like for you?", "A trophy animal, filling the freezer, or a quality experience with less crowding?"],
];

/** Email 2: sent a day after purchase. Asks about the member's hunting plans. */
export function preferencesEmail(opts: { name?: string | null }): RenderedEmail {
  const first = firstNameOf(opts.name);
  const subject = "Help us tailor HuntScout Pro to your hunts";
  const html = layout(
    "Tell us where and what you hunt. Short answers are perfect.",
    `<p>Dear ${esc(first)},</p>
<p>Thank you again for joining the HuntScout Pro community. As one of our early members, you get something we don't offer the general public: <b>one-on-one attention from our team</b>. Our goal is for HuntScout Pro to be a hands-on, genuinely powerful resource for your hunting, not just a website you log in to.</p>
<p style="margin-top:22px;"><b style="color:${DARK};font-size:16px;">Help us tailor HuntScout Pro to your hunts</b><br>Answer a few quick questions on the site (four short steps, about 2 minutes), or just reply to this email with whatever you know. Short answers are perfect.</p>
${button(`${SITE}/welcome`, "Tell us about your hunts")}
<ol style="padding-left:20px;margin:12px 0;">
${QUESTIONS.map(([q, d]) => `<li style="margin:0 0 8px 0;"><b>${q}</b> ${d}</li>`).join("\n")}
</ol>
<p>What you tell us shapes the work that follows. We'll <b>point you to the agency numbers that matter for your hunts</b>, and we use members' answers to decide which states and species to add next, always from official agency reports.</p>
<p>We also want your honest feedback, good or bad: what's helping, what's missing, and what you'd change. Your input directly shapes what we build next.</p>
<p>Thank you for trusting us with your hunt planning, ${esc(first)}. We look forward to helping you apply smarter and make the most of every season.</p>
<p style="margin:24px 0 4px 0;">Sincerely,</p>`
  );

  const text = `Dear ${first},

Thank you again for joining the HuntScout Pro community. As one of our early members, you get something we don't offer the general public: one-on-one attention from our team. Our goal is for HuntScout Pro to be a hands-on, genuinely powerful resource for your hunting, not just a website you log in to.

HELP US TAILOR HUNTSCOUT PRO TO YOUR HUNTS
Answer a few quick questions at ${SITE}/welcome (four short steps, about 2 minutes), or just reply to this email with whatever you know. Short answers are perfect.

${QUESTIONS.map(([q, d], i) => `${i + 1}. ${q} ${d}`).join("\n")}

What you tell us shapes the work that follows. We'll point you to the agency numbers that matter for your hunts, and we use members' answers to decide which states and species to add next, always from official agency reports.

We also want your honest feedback, good or bad: what's helping, what's missing, and what you'd change. Your input directly shapes what we build next.

Thank you for trusting us with your hunt planning, ${first}. We look forward to helping you apply smarter and make the most of every season.

Sincerely,

${SIGNATURE_TEXT}`;

  return { subject, html, text };
}

/** Internal: notify the owner when a member submits the /welcome form. */
export function preferencesNotification(opts: {
  name?: string | null;
  email: string;
  lines: [string, string][];
}): RenderedEmail {
  const who = opts.name ? `${opts.name} <${opts.email}>` : opts.email;
  const subject = `New member hunting preferences: ${opts.name || opts.email}`;
  const rows = opts.lines
    .map(([k, v]) => `<tr><td valign="top" style="padding:6px 12px 6px 0;color:#555;white-space:nowrap;"><b>${esc(k)}</b></td><td style="padding:6px 0;">${esc(v || "\u2014")}</td></tr>`)
    .join("\n");
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#2b2f33;max-width:640px;">
<p><b>${esc(who)}</b> completed the HuntScout Pro onboarding form. Reply to this email to answer them directly.</p>
<table role="presentation" cellpadding="0" cellspacing="0">${rows}</table>
</div>`;
  const text = `${who} completed the HuntScout Pro onboarding form.\n\n${opts.lines.map(([k, v]) => `${k}: ${v || "-"}`).join("\n")}`;
  return { subject, html, text };
}

/** Internal: a visitor asked us to add hunting data for a state that isn't live yet. */
export function stateRequestNotification(opts: {
  stateName: string;
  name: string;
  email: string;
  lines: [string, string][];
}): RenderedEmail {
  const subject = `State data request: ${opts.stateName}, from ${opts.name}`;
  const rows = opts.lines
    .map(
      ([k, v]) =>
        `<tr><td valign="top" style="padding:7px 14px 7px 0;color:#555;white-space:nowrap;border-bottom:1px solid #eee;"><b>${esc(k)}</b></td><td style="padding:7px 0;border-bottom:1px solid #eee;">${esc(v || "—")}</td></tr>`
    )
    .join("\n");
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HuntScout Pro</title></head>
<body style="margin:0;padding:0;background:#f4f2ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;font-family:Arial,Helvetica,sans-serif;color:#2b2f33;font-size:15px;line-height:1.55;">
<tr><td style="background:${DARK};padding:20px 28px;">
<img src="${SITE}/apple-icon.png" width="24" height="24" alt="" style="vertical-align:middle;border:0;margin-right:6px;border-radius:5px;"><span style="color:#ffffff;font-size:20px;font-weight:bold;vertical-align:middle;">HuntScout</span>
<span style="background:${GOLD};color:${DARK};font-size:11px;font-weight:bold;padding:2px 7px;margin-left:6px;vertical-align:middle;">PRO</span>
<div style="color:${GOLD};font-size:12px;letter-spacing:1.5px;margin-top:6px;">NEW STATE DATA REQUEST</div>
</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e3e3e3;border-top:3px solid ${GOLD};padding:24px 28px;">
<p style="margin:0 0 6px 0;font-size:18px;"><b style="color:${DARK};">${esc(opts.stateName)}</b></p>
<p style="margin:0 0 16px 0;color:#555;">${esc(opts.name)} &lt;<a href="mailto:${esc(opts.email)}" style="color:${LINK};">${esc(opts.email)}</a>&gt; asked us to add hunting data for ${esc(opts.stateName)}. Reply to this email to answer them directly.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">${rows}</table>
</td></tr>
<tr><td style="padding:14px 28px;font-size:12px;color:#8a8a8a;text-align:center;">Sent by the "Request this state" form on <a href="${SITE}/states" style="color:#8a8a8a;">huntscoutpro.com/states</a></td></tr>
</table>
</td></tr></table>
</body></html>`;
  const text = `NEW STATE DATA REQUEST: ${opts.stateName}\n\n${opts.name} <${opts.email}> asked us to add hunting data for ${opts.stateName}. Reply to this email to answer them directly.\n\n${opts.lines.map(([k, v]) => `${k}: ${v || "-"}`).join("\n")}`;
  return { subject, html, text };
}
