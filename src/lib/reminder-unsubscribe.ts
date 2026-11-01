import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "@/lib/entitlement";
import { SITE } from "@/lib/emails/onboarding";

// One-click unsubscribe links for deadline reminder emails:
// /api/reminders/unsubscribe?e=<email>&t=<HMAC-SHA256(AUTH_SECRET, normalized email)>.
// The token never expires, so a link in an old email keeps working.

function secret(): string | null {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || null;
}

export function canSignUnsubscribe(): boolean {
  return !!secret();
}

export function unsubscribeToken(email: string): string {
  const key = secret();
  if (!key) throw new Error("AUTH_SECRET is not set; cannot sign unsubscribe links");
  return createHmac("sha256", key).update(normalizeEmail(email)).digest("base64url");
}

export function verifyUnsubscribeToken(email: string | null, token: string | null): boolean {
  if (!email || !token || !secret()) return false;
  const want = Buffer.from(unsubscribeToken(email));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}

export function unsubscribeUrl(email: string, base: string = SITE): string {
  return `${base}/api/reminders/unsubscribe?e=${encodeURIComponent(email.trim())}&t=${unsubscribeToken(email)}`;
}
