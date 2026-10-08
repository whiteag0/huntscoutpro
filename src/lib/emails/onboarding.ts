// Branded onboarding emails sent to new HuntScout Pro members.
// Inline styles and tables only, so they render in Gmail, Outlook and Apple Mail.

const GOLD = "#C9A24A";
const DARK = "#1F2326";
const LINK = "#9a7a2c";
const SITE = "https://www.huntscoutpro.com";
const REPLY_TO = "adam@huntscoutpro.com";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(preheader: string, body: string): string {
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
${signature()}
</td></tr>
<tr><td style="padding:16px 28px;font-size:12px;color:#8a8a8a;text-align:center;">
You're receiving this because you purchased HuntScout Pro at huntscoutpro.com.<br>
HuntScout Pro &middot; <a href="${SITE}" style="color:#8a8a8a;">www.huntscoutpro.com</a>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function signature(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-top:2px solid ${GOLD};margin-top:24px;"><tr><td style="padding-top:10px;">
<div style="font-size:16px;font-weight:bold;color:${DARK};">Adam White</div>
<div style="color:#555;">CEO &amp; Founder</div>
<div style="font-weight:bold;color:${DARK};margin-top:2px;">HuntScout Pro <span style="color:${GOLD};">| Know Before You Draw</span></div>
<div style="margin-top:4px;"><a href="mailto:${REPLY_TO}" style="color:#555;text-decoration:none;">${REPLY_TO}</a> &nbsp;|&nbsp; <a href="${SITE}" style="color:${LINK};">www.huntscoutpro.com</a></div>
</td></tr></table>`;
}

const SIGNATURE_TEXT = `Adam White
CEO & Founder
HuntScout Pro | Know Before You Draw
${REPLY_TO} | www.huntscoutpro.com`;

function button(href: string, label: string): string {
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

/** Email 1: sent right after purchase. How to sign in and where to start. */
export function welcomeEmail(opts: { name?: string | null; email: string; accessUntil: Date | null }): RenderedEmail {
  const first = firstNameOf(opts.name);
  const until = opts.accessUntil ? formatDate(opts.accessUntil) : null;
  const subject = "Welcome to HuntScout Pro: how to sign in";
  const step = (n: number, html: string) =>
    `<tr><td valign="top" style="padding:0 12px 12px 0;"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:13px;background:${GOLD};color:${DARK};font-weight:bold;font-size:13px;">${n}</span></td><td style="padding:0 0 12px 0;">${html}</td></tr>`;

  const html = layout(
    "Your membership is active. Here's how to sign in.",
    `<p>Hi ${esc(first)},</p>
<p>Thank you for joining HuntScout Pro. Your payment went through and your membership is active${until ? ` through <b>${until}</b>` : ""}.</p>
<p style="margin-top:22px;"><b style="color:${DARK};font-size:16px;">How to sign in</b></p>
<table role="presentation" cellpadding="0" cellspacing="0">
${step(1, `Go to <a href="${SITE}/signin" style="color:${LINK};">huntscoutpro.com/signin</a>.`)}
${step(2, `Click <b>Continue with Google</b> using <b>${esc(opts.email)}</b>, the account you checked out with. There's no password to create.`)}
${step(3, `Click your name at the top right to open <b>My Account</b>. It shows your HuntScout Pro membership as active.`)}
</table>
${button(`${SITE}/signin?callbackUrl=%2Fstates`, "Sign in to HuntScout Pro")}
<p style="margin-top:22px;"><b style="color:${DARK};font-size:16px;">Where to start</b></p>
<ul style="padding-left:20px;margin:8px 0;">
<li style="margin:0 0 8px 0;"><a href="${SITE}/states" style="color:${LINK};">Explore states</a> and pick the ones you plan to apply in.</li>
<li style="margin:0 0 8px 0;">Set your preference points on any state page to see odds at your point level.</li>
<li style="margin:0 0 8px 0;"><a href="${SITE}/compare" style="color:${LINK};">Compare units</a> side by side, and plan your season in the <a href="${SITE}/planner" style="color:${LINK};">Hunt Planner</a>.</li>
</ul>
<p>It's a one-time payment, so nothing renews and you won't be charged again. If HuntScout Pro isn't what you expected, you can get a full refund within 30 days. Just reply to this email.</p>
<p style="background:#faf7ef;border-left:3px solid ${GOLD};padding:10px 14px;font-size:14px;">A tip as you research: harvest and success numbers come from state agency reports, and draw odds are our estimates. Please confirm odds and deadlines with the state agency before you apply.</p>
<p>Questions, or anything still locked? Reply here and I'll take care of it personally.</p>`
  );

  const text = `Hi ${first},

Thank you for joining HuntScout Pro. Your payment went through and your membership is active${until ? ` through ${until}` : ""}.

HOW TO SIGN IN
1. Go to ${SITE}/signin
2. Click "Continue with Google" using ${opts.email}, the account you checked out with. There's no password to create.
3. Click your name at the top right to open My Account. It shows your HuntScout Pro membership as active.

WHERE TO START
- Explore states: ${SITE}/states
- Set your preference points on any state page to see odds at your point level.
- Compare units: ${SITE}/compare  |  Hunt Planner: ${SITE}/planner

It's a one-time payment, so nothing renews and you won't be charged again. If HuntScout Pro isn't what you expected, you can get a full refund within 30 days. Just reply to this email.

A tip as you research: harvest and success numbers come from state agency reports, and draw odds are our estimates. Please confirm odds and deadlines with the state agency before you apply.

Questions, or anything still locked? Reply here and I'll take care of it personally.

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
<p style="margin-top:22px;"><b style="color:${DARK};font-size:16px;">Help us tailor HuntScout Pro to your hunts</b><br>Answer six quick questions on the site (about 2 minutes), or just reply to this email with whatever you know. Short answers are perfect.</p>
${button(`${SITE}/welcome`, "Tell us about your hunts")}
<ol style="padding-left:20px;margin:12px 0;">
${QUESTIONS.map(([q, d]) => `<li style="margin:0 0 8px 0;"><b>${q}</b> ${d}</li>`).join("\n")}
</ol>
<p>What you tell us shapes the work that follows. The HuntScout Pro team will <b>gather data specific to your pursuits</b>, and as our member base grows we'll add data to the website to fill gaps for the units and species you care about.</p>
<p>We also want your honest feedback, good or bad: what's helping, what's missing, and what you'd change. Your input directly shapes what we build next.</p>
<p>Thank you for trusting us with your hunt planning, ${esc(first)}. We look forward to helping you draw more tags and make the most of every season.</p>
<p style="margin:24px 0 4px 0;">Sincerely,</p>`
  );

  const text = `Dear ${first},

Thank you again for joining the HuntScout Pro community. As one of our early members, you get something we don't offer the general public: one-on-one attention from our team. Our goal is for HuntScout Pro to be a hands-on, genuinely powerful resource for your hunting, not just a website you log in to.

HELP US TAILOR HUNTSCOUT PRO TO YOUR HUNTS
Answer six quick questions at ${SITE}/welcome (about 2 minutes), or just reply to this email with whatever you know. Short answers are perfect.

${QUESTIONS.map(([q, d], i) => `${i + 1}. ${q} ${d}`).join("\n")}

What you tell us shapes the work that follows. The HuntScout Pro team will gather data specific to your pursuits, and as our member base grows we'll add data to the website to fill gaps for the units and species you care about.

We also want your honest feedback, good or bad: what's helping, what's missing, and what you'd change. Your input directly shapes what we build next.

Thank you for trusting us with your hunt planning, ${first}. We look forward to helping you draw more tags and make the most of every season.

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
