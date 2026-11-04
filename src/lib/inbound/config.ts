// Settings for inbound customer email -> AI reply draft -> owner approval -> send.
// Everything is off until RESEND_INBOUND_WEBHOOK_SECRET and EMAIL_INBOUND_ADDRESS are set
// (see INBOUND_EMAIL.md). Pure: no I/O, safe to import in tests.

type Env = Record<string, string | undefined>;

/** Latest Claude Sonnet on Vercel AI Gateway (checked against ai-gateway.vercel.sh/v1/models, Nov 2026). */
export const DEFAULT_REPLY_MODEL = "anthropic/claude-sonnet-5.5";
export const DEFAULT_ADMIN_EMAIL = "adam@huntscoutpro.com";
/** Our sending domain: mail from it (or its subdomains) is never answered. */
export const OWN_DOMAIN = "huntscoutpro.com";

const EMAIL_RE = /^[^\s@<>()",;:]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

export function isEmailAddress(v: unknown): v is string {
  return typeof v === "string" && v.length <= 254 && EMAIL_RE.test(v.trim());
}

/** Address customers reply to (Reply-To on our emails), or null when inbound isn't set up. */
export function inboundAddress(env: Env = process.env): string | null {
  const v = (env.EMAIL_INBOUND_ADDRESS || "").trim();
  return isEmailAddress(v) ? v.toLowerCase() : null;
}

export function webhookSecret(env: Env = process.env): string | null {
  const v = (env.RESEND_INBOUND_WEBHOOK_SECRET || "").trim();
  return v.startsWith("whsec_") && v.length > 12 ? v : null;
}

/** Inbound replies are live only when both the receiving address and the webhook secret are set. */
export function isInboundConfigured(env: Env = process.env): boolean {
  return !!inboundAddress(env) && !!webhookSecret(env);
}

/** Who approves replies. */
export function adminEmail(env: Env = process.env): string {
  const v = (env.ADMIN_EMAIL || "").trim();
  return isEmailAddress(v) ? v : DEFAULT_ADMIN_EMAIL;
}

export function replyModel(env: Env = process.env): string {
  const v = (env.REPLY_MODEL || "").trim();
  // provider/model, e.g. anthropic/claude-sonnet-5.5
  return /^[a-z0-9-]+\/[a-z0-9._-]+$/i.test(v) ? v : DEFAULT_REPLY_MODEL;
}

/** Limits that keep a mail loop, a flood or a runaway model bill from doing damage. */
export const INBOUND_LIMITS = {
  /** Raw webhook body (metadata only; Resend never puts the email body in the webhook). */
  webhookBytes: 64 * 1024,
  /** Signature timestamps older/newer than this are refused (replay protection). */
  signatureToleranceSec: 5 * 60,
  /** New text kept per message (quoted history removed). */
  messageChars: 8000,
  /** Full original text kept per message, for the admin view. */
  originalChars: 20000,
  subjectChars: 200,
  messagesPerThread: 40,
  threadBytes: 200 * 1024,
  /** Messages from one sender per UTC day that get a draft + approval email. */
  perSenderPerDay: 8,
  /** Drafts per UTC day across everyone (model cost cap). */
  draftsPerDay: 100,
  /** Approval emails to the owner per UTC day. */
  noticesPerDay: 60,
  /** Ignored (auto-reply / bulk / spam) messages recorded per UTC day. */
  ignoredPerDay: 200,
  /** Draft length the owner can send. */
  draftChars: 8000,
  /** Model output cap. */
  maxOutputTokens: 1200,
  /** Model call timeout. */
  modelTimeoutMs: 60_000,
  /** Agency facts given to the model. */
  factsChars: 14000,
  /** Threads shown on the admin page. */
  listThreads: 150,
} as const;

/** Approve links expire sooner than edit links. */
export const TOKEN_TTL_SEC = { approve: 3 * 24 * 3600, edit: 7 * 24 * 3600 } as const;

/** Resend API origin. RESEND_API_BASE exists only so local QA can point at a mock server. */
export function resendApiBase(env: Env = process.env): string {
  const v = (env.RESEND_API_BASE || "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+(\/[^\s]*)?$/.test(v) && !env.VERCEL ? v : "https://api.resend.com";
}

/** Origin for links in the approval email (the deployment where admin sign-in works). */
export function linkBase(env: Env = process.env): string {
  for (const v of [env.AUTH_URL, env.NEXTAUTH_URL]) {
    try {
      if (v) return new URL(v).origin;
    } catch {}
  }
  return "https://www.huntscoutpro.com";
}
