import { NextRequest } from "next/server";
import { setRemindersOff } from "@/lib/members";
import { verifyUnsubscribeToken } from "@/lib/reminder-unsubscribe";
import { DARK, GOLD, LINK, SITE, esc } from "@/lib/emails/onboarding";
import { stripe } from "@/lib/stripe";

// One-click unsubscribe from deadline reminder emails.
// GET  = the link in the email footer.
// POST = RFC 8058 List-Unsubscribe-Post from the mail client (body "List-Unsubscribe=One-Click").
// Both turn reminders off on every HuntScout purchase made with that email.

export const dynamic = "force-dynamic";

function page(status: number, title: string, bodyHtml: string): Response {
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} | HuntScout Pro</title></head>
<body style="margin:0;padding:0;background:#f4f2ee;font-family:Arial,Helvetica,sans-serif;color:#2b2f33;font-size:16px;line-height:1.6;">
<main style="max-width:560px;margin:0 auto;padding:32px 16px;">
<div style="background:${DARK};padding:20px 24px;">
<a href="${SITE}" style="color:#ffffff;font-size:22px;font-weight:bold;text-decoration:none;">HuntScout</a>
<span style="background:${GOLD};color:${DARK};font-size:11px;font-weight:bold;padding:2px 7px;margin-left:6px;vertical-align:middle;">PRO</span>
</div>
<div style="background:#ffffff;border:1px solid #e3e3e3;border-top:3px solid ${GOLD};padding:24px;">
<h1 style="font-size:22px;margin:0 0 12px 0;color:${DARK};">${esc(title)}</h1>
${bodyHtml}
</div>
</main>
</body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

const link = (href: string, label: string) => `<a href="${href}" style="color:${LINK};">${label}</a>`;

async function handle(req: NextRequest): Promise<Response> {
  const email = req.nextUrl.searchParams.get("e")?.trim() || "";
  const token = req.nextUrl.searchParams.get("t");
  if (!email || !verifyUnsubscribeToken(email, token)) {
    return page(
      400,
      "This link isn't valid",
      `<p>We couldn't read this unsubscribe link. It may have been cut off when it was copied.</p>
<p>You can turn deadline reminders off in ${link(`${SITE}/account`, "My Account")}, or email ${link("mailto:support@huntscoutpro.com", "support@huntscoutpro.com")} and we'll do it for you.</p>`
    );
  }
  if (!stripe) {
    return page(503, "Please try again shortly", `<p>We couldn't update your settings right now. Please try the link again in a few minutes.</p>`);
  }

  let updated = 0;
  try {
    updated = await setRemindersOff(email, true);
  } catch (err) {
    console.error("Reminder unsubscribe failed:", err);
    return page(503, "Please try again shortly", `<p>We couldn't update your settings right now. Please try the link again in a few minutes.</p>`);
  }
  if (updated === 0) {
    return page(
      404,
      "We couldn't find that membership",
      `<p>There's no HuntScout Pro purchase on file for <b>${esc(email)}</b>, so there's nothing to turn off.</p>
<p>If you're still getting reminder emails, forward one to ${link("mailto:support@huntscoutpro.com", "support@huntscoutpro.com")} and we'll stop them.</p>`
    );
  }
  console.log(`Deadline reminders turned off via unsubscribe link (${updated} purchase${updated === 1 ? "" : "s"})`);
  return page(
    200,
    "You're unsubscribed",
    `<p>We won't send deadline reminder emails to <b>${esc(email)}</b> any more. Your HuntScout Pro membership isn't affected.</p>
<p>Changed your mind? Turn reminders back on any time in ${link(`${SITE}/account`, "My Account")}.</p>`
  );
}

export const GET = handle;
export const POST = handle;
