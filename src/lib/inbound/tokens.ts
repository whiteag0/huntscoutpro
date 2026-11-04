import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { TOKEN_TTL_SEC } from "@/lib/inbound/config";
import { isThreadId } from "@/lib/inbound/thread";

// Signed links in the owner's "Reply ready" email.
//   token = base64url(JSON {p, th, r, x, n}) + "." + base64url(HMAC-SHA256(AUTH_SECRET, "hs-inbound-reply|" + body))
// p  purpose: "approve" (send this exact draft revision) or "edit" (open the editor for this thread)
// th thread id, r draft revision (approve only), x expiry (unix s), n nonce (single use, recorded on the thread)
// The purpose prefix + purpose field keep a token for one action from working for another, and the
// "hs-inbound-reply" prefix keeps it from colliding with other AUTH_SECRET-signed links on the site.

export type TokenPurpose = "approve" | "edit";

export interface ActionToken {
  p: TokenPurpose;
  th: string;
  r: number;
  x: number;
  n: string;
}

type Env = Record<string, string | undefined>;

function secret(env: Env): string | null {
  return env.AUTH_SECRET || env.NEXTAUTH_SECRET || null;
}

export function canSignActionLinks(env: Env = process.env): boolean {
  return !!secret(env);
}

function sig(key: string, body: string): string {
  return createHmac("sha256", key).update(`hs-inbound-reply|${body}`).digest("base64url");
}

export function signActionToken(
  input: {
    purpose: TokenPurpose;
    threadId: string;
    rev: number;
    nowMs?: number;
    nonce?: string;
    /** Expire no later than this (unix s), e.g. an edit link derived from an approve link. */
    notAfterSec?: number;
  },
  env: Env = process.env
): string {
  const key = secret(env);
  if (!key) throw new Error("AUTH_SECRET is not set; cannot sign reply links");
  const now = input.nowMs ?? Date.now();
  const payload: ActionToken = {
    p: input.purpose,
    th: input.threadId,
    r: input.purpose === "approve" ? input.rev : 0,
    x: Math.min(Math.floor(now / 1000) + TOKEN_TTL_SEC[input.purpose], input.notAfterSec ?? Number.MAX_SAFE_INTEGER),
    n: input.nonce ?? randomBytes(12).toString("base64url"),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sig(key, body)}`;
}

export type TokenCheck = { ok: true; token: ActionToken } | { ok: false; error: "invalid" | "expired" | "wrong-purpose" };

export function verifyActionToken(raw: unknown, purpose: TokenPurpose, opts: { nowMs?: number; env?: Env } = {}): TokenCheck {
  const key = secret(opts.env ?? process.env);
  if (!key || typeof raw !== "string" || raw.length > 600) return { ok: false, error: "invalid" };
  const [body, mac, extra] = raw.split(".");
  if (!body || !mac || extra !== undefined) return { ok: false, error: "invalid" };
  const want = Buffer.from(sig(key, body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, error: "invalid" };
  let t: ActionToken;
  try {
    t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ActionToken;
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (!t || (t.p !== "approve" && t.p !== "edit") || !isThreadId(t.th) || !Number.isInteger(t.r) || !Number.isInteger(t.x)) {
    return { ok: false, error: "invalid" };
  }
  if (typeof t.n !== "string" || !/^[A-Za-z0-9_-]{8,40}$/.test(t.n)) return { ok: false, error: "invalid" };
  if (t.p !== purpose) return { ok: false, error: "wrong-purpose" };
  if (t.x * 1000 < (opts.nowMs ?? Date.now())) return { ok: false, error: "expired" };
  return { ok: true, token: t };
}
