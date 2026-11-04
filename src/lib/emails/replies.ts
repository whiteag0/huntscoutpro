// Emails for customer replies: the reply Adam sends (plain, personal, threaded) and the
// "Reply ready" approval email to Adam. Inline styles only for Gmail / Outlook / Apple Mail.

import { DARK, GOLD, LINK, SIGNATURE_TEXT, esc, signatureHtml, type RenderedEmail } from "@/lib/emails/onboarding";
import { baseSubject, replySubject } from "@/lib/inbound/message";
import type { Thread, ThreadMessage } from "@/lib/inbound/thread";
import { STATE_LIST } from "@/data/state-list";

const stateName = (slug: string) => STATE_LIST.find((s) => s.slug === slug)?.name ?? slug;

const FONT = "font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#2b2f33;";

/** Escaped text with blank-line paragraphs, line breaks and https links. */
export function textToHtml(text: string): string {
  // Find links in the raw text, then escape each piece, so "<https://...>" doesn't swallow "&gt;".
  const URL_RE = /\bhttps?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]']/g;
  const linkify = (raw: string) => {
    let out = "";
    let at = 0;
    for (const m of raw.matchAll(URL_RE)) {
      out += esc(raw.slice(at, m.index)) + `<a href="${esc(m[0])}" style="color:${LINK};">${esc(m[0])}</a>`;
      at = m.index + m[0].length;
    }
    return out + esc(raw.slice(at));
  };
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px 0;">${linkify(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function quoteHeader(m: ThreadMessage, t: Thread): string {
  const d = new Date(m.at);
  const when = d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Denver" });
  const who = t.customer.name ? `${t.customer.name} <${t.customer.email}>` : t.customer.email;
  return `On ${when}, ${who} wrote:`;
}

/** The reply to the customer: Adam's text, signature, then their message quoted. */
export function customerReplyEmail(t: Thread, body: string, quoted: ThreadMessage | null): RenderedEmail {
  const subject = replySubject(t.subject);
  const q = quoted ? quoted.text.slice(0, 4000) : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;"><div style="${FONT}max-width:640px;padding:8px 4px;">
${textToHtml(body)}
${signatureHtml()}
${
  quoted
    ? `<div style="margin-top:22px;color:#777;font-size:13px;">${esc(quoteHeader(quoted, t))}</div>
<blockquote style="margin:6px 0 0 0;padding-left:12px;border-left:2px solid #ddd;color:#666;font-size:14px;">${textToHtml(q)}</blockquote>`
    : ""
}
</div></body></html>`;
  const text = `${body}

--
${SIGNATURE_TEXT}${quoted ? `\n\n${quoteHeader(quoted, t)}\n${q.split("\n").map((l) => `> ${l}`).join("\n")}` : ""}`;
  return { subject, html, text };
}

function shell(preheader: string, inner: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HuntScout Pro</title></head>
<body style="margin:0;padding:0;background:#f4f2ee;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2ee;"><tr><td align="center" style="padding:20px 10px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;${FONT}">
<tr><td style="background:${DARK};padding:16px 22px;color:#fff;font-weight:bold;font-size:17px;">HuntScout <span style="background:${GOLD};color:${DARK};font-size:11px;padding:2px 6px;margin-left:4px;">PRO</span> <span style="color:${GOLD};font-weight:normal;font-size:13px;margin-left:8px;">Customer reply</span></td></tr>
<tr><td style="background:#fff;border:1px solid #e3e3e3;border-top:3px solid ${GOLD};padding:22px;">${inner}</td></tr>
</table></td></tr></table></body></html>`;
}

function box(title: string, html: string, tint = "#faf9f6"): string {
  return `<div style="margin:16px 0 0 0;"><div style="font-size:12px;font-weight:bold;letter-spacing:1px;color:#7a6a3a;text-transform:uppercase;margin-bottom:6px;">${esc(title)}</div>
<div style="background:${tint};border:1px solid #ebe6da;border-radius:6px;padding:14px 16px;">${html}</div></div>`;
}

function btn(href: string, label: string, primary: boolean): string {
  const style = primary
    ? `background:${GOLD};color:${DARK};border:1px solid ${GOLD};`
    : `background:#fff;color:${DARK};border:1px solid #cfc8b8;`;
  return `<td style="padding:0 10px 0 0;"><a href="${esc(href)}" style="display:inline-block;padding:12px 20px;border-radius:6px;font-weight:bold;text-decoration:none;font-size:15px;${style}">${esc(label)}</a></td>`;
}

export interface ApprovalEmailInput {
  thread: Thread;
  membership: string;
  approveUrl: string | null;
  editUrl: string;
  adminUrl: string;
}

/** "Reply ready: <subject>" to the owner, with the customer's message, the draft and one-tap links. */
export function approvalEmail(i: ApprovalEmailInput): RenderedEmail {
  const t = i.thread;
  const d = t.draft;
  const last = [...t.messages].reverse().find((m) => m.direction === "in") || null;
  const ready = !!d && d.status === "ready" && !!d.text && !!i.approveUrl;
  const subjectLine = baseSubject(t.subject) || "(no subject)";
  const subject = ready ? `Reply ready: ${subjectLine}` : `Needs a reply: ${subjectLine}`;
  const who = t.customer.name ? `${t.customer.name} <${t.customer.email}>` : t.customer.email;
  const earlier = t.messages.length - 1;

  const inner = `<p style="margin:0 0 4px 0;font-size:17px;font-weight:bold;color:${DARK};">${esc(who)}</p>
<p style="margin:0;color:#666;font-size:14px;">${esc(i.membership)}${earlier > 0 ? ` &middot; ${earlier} earlier message${earlier === 1 ? "" : "s"} in this thread` : ""}</p>
${box("Their message", last ? textToHtml(last.text) || "<i>(empty)</i>" : "<i>(none)</i>")}
${
  ready
    ? box("Draft reply (not sent)", textToHtml(d!.text), "#fffdf6")
    : box("No draft", `<p style="margin:0;">${esc(d?.error || "A draft couldn't be written for this one.")} Open the editor to write the reply yourself.</p>`, "#fff6f4")
}
${d?.note && ready ? box("Note for you", textToHtml(d.note), "#f6f8ff") : ""}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 6px 0;"><tr>
${ready ? btn(i.approveUrl!, "Approve & send", true) : ""}${btn(i.editUrl, ready ? "Edit" : "Write reply", !ready)}
</tr></table>
<p style="margin:14px 0 0 0;font-size:12px;color:#888;">Nothing is sent until you confirm.${
    ready ? " The approve button opens a confirmation page with a Send button; it works once, for this exact draft, for 3 days." : ""
  } The edit link works for 7 days. All replies: <a href="${esc(i.adminUrl)}" style="color:${LINK};">admin/replies</a>.${
    ready && d?.model ? ` Drafted by ${esc(d.model)}${d.context?.states.length ? ` using our ${esc(d.context.states.map(stateName).join(", "))} data` : ""}.` : ""
  }</p>`;

  const text = `${who}
${i.membership}

THEIR MESSAGE
${last?.text || "(none)"}

${ready ? `DRAFT REPLY (not sent)\n${d!.text}\n${d!.note ? `\nNOTE FOR YOU\n${d!.note}\n` : ""}\nApprove & send (opens a confirmation page): ${i.approveUrl}\nEdit: ${i.editUrl}` : `NO DRAFT: ${d?.error || "A draft couldn't be written."}\nWrite the reply: ${i.editUrl}`}

All replies: ${i.adminUrl}`;

  return { subject, html: shell(ready ? "A draft reply is waiting for your approval." : "A customer email needs a reply.", inner), text };
}
