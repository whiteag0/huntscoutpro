// Parsing and screening of one received email (Resend "Retrieve received email" response).
// Pure functions: `npm test`.

import { INBOUND_LIMITS, OWN_DOMAIN, isEmailAddress } from "@/lib/inbound/config";

/** The parts of GET /emails/receiving/{id} we use. */
export interface ReceivedEmail {
  id: string;
  from: string;
  to?: string[];
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, unknown> | null;
  message_id?: string | null;
  created_at?: string | null;
  authentication?: { spf?: string; dkim?: string; dmarc?: string } | null;
  attachments?: { filename?: string | null; content_type?: string | null; size?: number | null }[] | null;
}

export interface ParsedInbound {
  resendId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  receivedAt: string;
  /** What the customer wrote in this message, quoted history removed. */
  text: string;
  /** Whole message text (capped), for the admin view. */
  original: string;
  attachments: string[];
  auth: { spf: string; dkim: string; dmarc: string } | null;
}

/** Lower-cased header lookup; Resend returns a map, values may be strings or arrays. */
export function header(headers: Record<string, unknown> | null | undefined, name: string): string | null {
  if (!headers) return null;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() !== want) continue;
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join(", ") || null;
    return null;
  }
  return null;
}

/** "Jane Doe <jane@x.com>" -> { email, name }. */
export function parseAddress(raw: string | null | undefined): { email: string; name: string | null } | null {
  if (!raw) return null;
  const s = raw.trim();
  const angle = s.match(/^(.*)<([^<>\s]+@[^<>\s]+)>\s*$/);
  const email = (angle ? angle[2] : s).trim().toLowerCase();
  if (!isEmailAddress(email)) return null;
  let name = angle ? angle[1].trim().replace(/^"(.*)"$/, "$1").trim() : "";
  if (!name || name.includes("@") || name.length > 80) name = "";
  return { email, name: name || null };
}

/** Message-IDs from an In-Reply-To / References header, in order, deduped. */
export function messageIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const ids = raw.match(/<[^<>\s]{3,250}>/g) || [];
  return Array.from(new Set(ids));
}

export function normalizeMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^<[^<>\s]{3,250}>$/.test(s)) return s;
  if (/^[^<>\s]{3,250}$/.test(s) && s.includes("@")) return `<${s}>`;
  return null;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Rough HTML -> text for mail bodies that arrive without a text part. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(head|style|script|title)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+\d*);/gi, (m, e: string) => {
      if (ENTITIES[e.toLowerCase()]) return ENTITIES[e.toLowerCase()];
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
      }
      return m;
    })
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Where quoted history starts in a reply.
const QUOTE_STARTS = [
  /^On\b.{0,200}\bwrote:\s*$/im, // Gmail / Apple Mail (may wrap; handled below)
  /^-{2,}\s*Original Message\s*-{2,}/im,
  /^_{10,}\s*$/m, // Outlook separator
  /^From:\s.+\n(?:Sent|Date):\s/im, // Outlook header block
  /^-{2,}\s*Forwarded message\s*-{2,}/im,
];

/** The new part of a reply: quoted history and trailing ">" lines removed. */
export function stripQuoted(text: string): string {
  let t = text.replace(/\r\n?/g, "\n");
  // Gmail sometimes wraps "On <date> <name> <\nemail> wrote:" over two lines.
  t = t.replace(/^(On\b[^\n]{0,200})\n([^\n]{0,120}wrote:)\s*$/gm, "$1 $2");
  let cut = t.length;
  for (const re of QUOTE_STARTS) {
    const m = re.exec(t);
    if (m && m.index < cut && m.index > 0) cut = m.index;
  }
  t = t.slice(0, cut);
  t = t
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max).trimEnd()}\n[...trimmed]` : s;
}

/** Subject without any number of Re:/Fwd: prefixes. */
export function baseSubject(subject: string | null | undefined): string {
  let s = (subject || "").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 10; i++) {
    const next = s.replace(/^(re|fw|fwd|aw|sv|antw)(\[\d+\])?\s*:\s*/i, "");
    if (next === s) break;
    s = next;
  }
  return s.slice(0, INBOUND_LIMITS.subjectChars);
}

export function replySubject(subject: string | null | undefined): string {
  const base = baseSubject(subject);
  return base ? `Re: ${base}` : "Re: your email";
}

export function parseReceived(e: ReceivedEmail): ParsedInbound | null {
  const addr = parseAddress(header(e.headers, "from")) || parseAddress(e.from);
  if (!addr || !e.id) return null;
  const raw = e.text && e.text.trim() ? e.text : e.html ? htmlToText(e.html) : "";
  const normalized = raw.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();
  const fresh = stripQuoted(normalized);
  const auth = e.authentication
    ? { spf: String(e.authentication.spf || "unknown"), dkim: String(e.authentication.dkim || "unknown"), dmarc: String(e.authentication.dmarc || "unknown") }
    : null;
  return {
    resendId: e.id,
    fromEmail: addr.email,
    fromName: addr.name,
    subject: (e.subject || header(e.headers, "subject") || "").replace(/\s+/g, " ").trim().slice(0, INBOUND_LIMITS.subjectChars),
    messageId: normalizeMessageId(e.message_id || header(e.headers, "message-id")),
    inReplyTo: messageIds(header(e.headers, "in-reply-to"))[0] || null,
    references: messageIds(header(e.headers, "references")).slice(-30),
    receivedAt: e.created_at && !Number.isNaN(Date.parse(e.created_at)) ? new Date(e.created_at).toISOString() : new Date().toISOString(),
    text: clip(fresh || normalized, INBOUND_LIMITS.messageChars),
    original: clip(normalized, INBOUND_LIMITS.originalChars),
    attachments: (e.attachments || [])
      .map((a) => (a?.filename || "").slice(0, 120))
      .filter(Boolean)
      .slice(0, 20),
    auth,
  };
}

export type ScreenResult = { accept: true } | { accept: false; reason: IgnoreReason };
export type IgnoreReason = "invalid" | "own-mail" | "noreply-sender" | "auto-reply" | "bounce" | "bulk" | "mailing-list" | "spam";

const NOREPLY_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|auto-?reply|autoresponder|daemon|notifications?|alerts?|news(letter)?|marketing|billing-noreply)([+._-].*)?$/i;
const AUTO_SUBJECT =
  /^\s*(auto(matic)?[\s:-]*(reply|response|antwort)|out of (the )?office|ooo\b|away from (the )?office|undeliverable|undelivered mail|delivery (status notification|failure|has failed)|mail delivery (failed|subsystem)|returned mail|failure notice|read:)/i;

/**
 * Should this message get a drafted reply? Rejects our own mail, no-reply senders,
 * auto-replies, bounces, mailing lists and messages that failed sender authentication.
 */
export function screenInbound(
  e: ReceivedEmail,
  parsed: ParsedInbound | null,
  opts: { ownAddresses?: string[] } = {}
): ScreenResult {
  if (!parsed) return { accept: false, reason: "invalid" };
  const h = e.headers;
  const [local, domain] = parsed.fromEmail.split("@");
  const own = new Set((opts.ownAddresses || []).map((a) => a.toLowerCase()));
  if (own.has(parsed.fromEmail) || domain === OWN_DOMAIN || domain.endsWith(`.${OWN_DOMAIN}`)) {
    return { accept: false, reason: "own-mail" };
  }
  if (NOREPLY_LOCAL.test(local) || /no-?reply/i.test(local)) return { accept: false, reason: "noreply-sender" };

  const returnPath = header(h, "return-path");
  const contentType = header(h, "content-type") || "";
  if (returnPath !== null && /^\s*<\s*>\s*$/.test(returnPath)) return { accept: false, reason: "bounce" };
  if (/multipart\/report/i.test(contentType) || /report-type\s*=\s*"?delivery-status/i.test(contentType)) {
    return { accept: false, reason: "bounce" };
  }

  const autoSubmitted = header(h, "auto-submitted");
  if (autoSubmitted && !/^\s*no\s*$/i.test(autoSubmitted)) return { accept: false, reason: "auto-reply" };
  if (header(h, "x-autoreply") || header(h, "x-autorespond") || header(h, "x-autoresponder")) return { accept: false, reason: "auto-reply" };
  if (AUTO_SUBJECT.test(parsed.subject)) return { accept: false, reason: "auto-reply" };

  const precedence = header(h, "precedence");
  if (precedence && /\b(bulk|junk|list|auto_reply)\b/i.test(precedence)) return { accept: false, reason: "bulk" };
  if (header(h, "list-id") || header(h, "list-unsubscribe") || header(h, "list-post")) return { accept: false, reason: "mailing-list" };

  if (/^\s*yes/i.test(header(h, "x-spam-flag") || "")) return { accept: false, reason: "spam" };
  const a = parsed.auth;
  if (a && (a.dmarc === "fail" || (a.spf === "fail" && a.dkim === "fail"))) return { accept: false, reason: "spam" };

  if (!parsed.text.trim() && !parsed.subject) return { accept: false, reason: "invalid" };
  return { accept: true };
}

/**
 * In-Reply-To / References for our reply to `last` (the customer's latest message),
 * so it lands in the same thread in Gmail, Outlook and Apple Mail (RFC 5322 §3.6.4).
 */
export function threadingHeaders(last: { messageId: string | null; references: string[]; inReplyTo?: string | null }): Record<string, string> {
  if (!last.messageId) return {};
  const chain = [...last.references];
  if (last.inReplyTo && !chain.includes(last.inReplyTo)) chain.push(last.inReplyTo);
  chain.push(last.messageId);
  const ids = Array.from(new Set(chain));
  // Keep the first (thread root) and the most recent ids; long References headers get folded or dropped.
  const keep = ids.length > 12 ? [ids[0], ...ids.slice(-11)] : ids;
  return { "In-Reply-To": last.messageId, References: keep.join(" ") };
}
