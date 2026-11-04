import "server-only";
import { auth } from "@/lib/auth";
import { verifyActionToken, type ActionToken, type TokenPurpose } from "@/lib/inbound/tokens";
import type { Thread } from "@/lib/inbound/thread";

// Who may act on a reply thread: the super admin (Google sign-in, same check as the other admin
// tools: session.user.isSuperAdmin), or the holder of a signed link from the owner's approval email.

export type Access = { ok: true; via: "session"; token: null } | { ok: true; via: "token"; token: ActionToken } | { ok: false; reason: string };

export async function isAdminSession(): Promise<boolean> {
  const session = await auth();
  return !!session?.user?.email && session.user.isSuperAdmin === true;
}

const REASONS: Record<string, string> = {
  invalid: "This link isn't valid.",
  expired: "This link has expired. Open the reply from the admin page instead.",
  "wrong-purpose": "This link isn't valid.",
};

/** Session first; otherwise a token of `purpose` for this exact thread that hasn't been used. */
export async function accessFor(thread: Pick<Thread, "id" | "usedNonces"> | null, threadId: string, rawToken: unknown, purpose: TokenPurpose): Promise<Access> {
  if (await isAdminSession()) return { ok: true, via: "session", token: null };
  if (!rawToken) return { ok: false, reason: "Sign in as the site admin to see this page." };
  const check = verifyActionToken(rawToken, purpose);
  if (!check.ok) return { ok: false, reason: REASONS[check.error] };
  if (check.token.th !== threadId) return { ok: false, reason: REASONS.invalid };
  if (thread && thread.usedNonces.includes(check.token.n)) return { ok: false, reason: "This link was already used." };
  return { ok: true, via: "token", token: check.token };
}
