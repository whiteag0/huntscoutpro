import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "@/lib/entitlement";
import { SITE } from "@/lib/emails/onboarding";

// Signed links for free deadline reminders. Links carry the subscriber id
// (sha256 of the normalized email), never the address itself.
//
// confirm:     /api/free-reminders/confirm?id=<id>&n=<nonce>&x=<expires, unix s>&t=<HMAC>
// unsubscribe: /api/free-reminders/unsubscribe?id=<id>&t=<HMAC>   (never expires)
//
// HMAC-SHA256 keyed with AUTH_SECRET (or NEXTAUTH_SECRET), with a purpose
// prefix so a token for one link can't be replayed as another.

/** How long a confirmation link works. */
export const CONFIRM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function secret(): string | null {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

export function canSignFreeReminderLinks(): boolean {
  return !!secret();
}

/** Storage key and link id for an address: sha256 of the normalized email, hex. */
export function subscriberId(email: string): string {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

export const isSubscriberId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

function sign(purpose: string, ...parts: string[]): string {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET is not set; cannot sign reminder links");
  return createHmac("sha256", key).update(["hs-free-reminders", purpose, ...parts].join("|")).digest("base64url");
}

function same(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function confirmToken(id: string, nonce: string, expiresSec: number): string {
  return sign("confirm", id, nonce, String(expiresSec));
}

export type ConfirmCheck = "ok" | "invalid" | "expired";

export function verifyConfirmToken(
  p: { id?: string | null; n?: string | null; x?: string | null; t?: string | null },
  now: number = Date.now()
): ConfirmCheck {
  if (!secret() || !isSubscriberId(p.id) || !p.n || !/^[A-Za-z0-9_-]{8,64}$/.test(p.n) || !p.t || !p.x || !/^\d{1,12}$/.test(p.x)) return "invalid";
  if (!same(confirmToken(p.id, p.n, Number(p.x)), p.t)) return "invalid";
  return Number(p.x) * 1000 < now ? "expired" : "ok";
}

export function unsubscribeToken(id: string): string {
  return sign("unsubscribe", id);
}

export function verifyUnsubscribeToken(id: string | null | undefined, token: string | null | undefined): boolean {
  if (!secret() || !isSubscriberId(id) || !token) return false;
  return same(unsubscribeToken(id), token);
}

export function confirmUrl(id: string, nonce: string, expiresSec: number, base: string = SITE): string {
  return `${base}/api/free-reminders/confirm?id=${id}&n=${encodeURIComponent(nonce)}&x=${expiresSec}&t=${confirmToken(id, nonce, expiresSec)}`;
}

export function freeUnsubscribeUrl(id: string, base: string = SITE): string {
  return `${base}/api/free-reminders/unsubscribe?id=${id}&t=${unsubscribeToken(id)}`;
}
