import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { SPECIES_LABELS, type Species } from "@/data/types";
import { stateByAbbrev } from "@/data/state-list";
import { parsePoints } from "@/lib/points-schema";
import { buildShortlist } from "@/lib/shortlist";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/**
 * GET /api/shortlist?species=elk&home=CO&pts=colorado.elk=5;wyoming.elk=3&stretch=1
 * Pro only. Per live state: last year's draw results for the species, classified
 * against the member's residency (from home) and points.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.isPro) {
    return NextResponse.json({ error: "Pro membership required." }, { status: 403, headers: NO_STORE });
  }

  const sp = req.nextUrl.searchParams;
  const species = sp.get("species") || "";
  if (!Object.hasOwn(SPECIES_LABELS, species)) {
    return NextResponse.json({ error: "Choose a species." }, { status: 400, headers: NO_STORE });
  }
  const home = (sp.get("home") || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(home) || !stateByAbbrev(home)) {
    return NextResponse.json({ error: "Choose your home state (two-letter abbreviation)." }, { status: 400, headers: NO_STORE });
  }
  const { points, invalid } = parsePoints(sp.get("pts"));
  if (invalid.length) {
    return NextResponse.json(
      { error: `Points must look like colorado.elk=5, with whole numbers from 0 to 40. Not understood: ${invalid.join(", ")}` },
      { status: 400, headers: NO_STORE }
    );
  }
  const stretch = sp.get("stretch");
  const includeStretch = stretch === "1" || stretch === "true";

  try {
    const result = await buildShortlist({ species: species as Species, home, points, includeStretch });
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    console.error("Shortlist failed:", err);
    return NextResponse.json({ error: "Couldn't build the shortlist right now." }, { status: 500, headers: NO_STORE });
  }
}
