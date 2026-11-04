import { createHmac, timingSafeEqual } from "node:crypto";

// Resend signs webhooks with Svix. Manual verification, per
// https://docs.svix.com/receiving/verifying-payloads/how-manual :
//   signed content = `${svix-id}.${svix-timestamp}.${raw body}`
//   key            = base64-decode(secret without the "whsec_" prefix)
//   signature      = base64(HMAC-SHA256(key, signed content))
//   svix-signature = space-separated "v1,<signature>" entries (any one may match)
// The timestamp must be within the tolerance, so a captured request can't be replayed later.

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null };

export type SvixCheck = "ok" | "missing" | "stale" | "bad-signature" | "bad-secret";

function keyOf(secret: string): Buffer | null {
  const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  if (!/^[A-Za-z0-9+/=]+$/.test(raw)) return null;
  const key = Buffer.from(raw, "base64");
  return key.length >= 16 ? key : null;
}

export function svixSign(secret: string, id: string, timestamp: string, body: string): string {
  const key = keyOf(secret);
  if (!key) throw new Error("Invalid webhook secret");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

export function verifySvix(
  secret: string,
  headers: SvixHeaders,
  body: string,
  opts: { nowSec?: number; toleranceSec?: number } = {}
): SvixCheck {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return "missing";
  if (!keyOf(secret)) return "bad-secret";
  if (!/^\d{1,12}$/.test(timestamp)) return "stale";
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const tolerance = opts.toleranceSec ?? 300;
  if (Math.abs(now - Number(timestamp)) > tolerance) return "stale";

  const want = Buffer.from(svixSign(secret, id, timestamp, body));
  for (const part of signature.split(" ")) {
    const [version, sig] = part.split(",", 2);
    if (version !== "v1" || !sig) continue;
    const got = Buffer.from(sig);
    if (got.length === want.length && timingSafeEqual(got, want)) return "ok";
  }
  return "bad-signature";
}
