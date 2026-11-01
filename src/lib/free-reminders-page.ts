import "server-only";
import { DARK, GOLD, LINK, SITE, esc } from "@/lib/emails/onboarding";

// Small branded HTML pages for the confirm / unsubscribe links (same look as
// /api/reminders/unsubscribe). Never cached, never indexed.

export function freePage(status: number, title: string, bodyHtml: string): Response {
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
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex", "Referrer-Policy": "no-referrer" },
  });
}

export const freeLink = (href: string, label: string) => `<a href="${esc(href)}" style="color:${LINK};">${esc(label)}</a>`;

export const tryAgainPage = () =>
  freePage(503, "Please try again shortly", `<p>We couldn't update your reminders right now. Please try the link again in a few minutes.</p>`);
