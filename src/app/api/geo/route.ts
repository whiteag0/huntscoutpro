import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The visitor's country (ISO 3166-1 alpha-2) from Vercel's edge geolocation,
 * used only to decide whether to show the consent banner. Returns nothing else
 * and is never cached, since the answer differs per visitor.
 */
export function GET(req: NextRequest) {
  const raw = req.headers.get("x-vercel-ip-country")?.trim().toUpperCase() ?? "";
  const country = /^[A-Z]{2}$/.test(raw) ? raw : null;
  return NextResponse.json(
    { country },
    { headers: { "Cache-Control": "private, no-store, max-age=0", Vary: "x-vercel-ip-country" } }
  );
}
