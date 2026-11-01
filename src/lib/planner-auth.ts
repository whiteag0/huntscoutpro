import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlement";

/** Same gate as /api/preferences: signed in (401 otherwise) and Pro (403 otherwise). */
export async function plannerMember(): Promise<{ email: string } | { error: NextResponse }> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { error: NextResponse.json({ error: "Not signed in." }, { status: 401, headers: NO_STORE }) };
  const ent = await getEntitlement(email);
  if (!ent.isPro) return { error: NextResponse.json({ error: "Pro membership required." }, { status: 403, headers: NO_STORE }) };
  return { email };
}

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

/** Request body as JSON, refusing anything over `maxBytes`. */
export async function readJsonBody(req: Request, maxBytes: number): Promise<{ body: unknown } | { error: NextResponse }> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > maxBytes) return { error: NextResponse.json({ error: "Request too large." }, { status: 413, headers: NO_STORE }) };
  const text = await req.text().catch(() => null);
  if (text === null) return { error: NextResponse.json({ error: "Couldn't read the request." }, { status: 400, headers: NO_STORE }) };
  if (new TextEncoder().encode(text).length > maxBytes) return { error: NextResponse.json({ error: "Request too large." }, { status: 413, headers: NO_STORE }) };
  try {
    return { body: JSON.parse(text) };
  } catch {
    return { error: NextResponse.json({ error: "Body must be JSON." }, { status: 400, headers: NO_STORE }) };
  }
}
