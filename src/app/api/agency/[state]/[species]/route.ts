import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hasAgencyData, readTable, readTableGzip, type TableKind } from "@/lib/agency";
import { SPECIES_LABELS, type Species } from "@/data/types";
import type { DrawRecord, HarvestRecord } from "@/data/agency/schema";
import { drawPreview, harvestPreview, type TablePreview } from "@/lib/agency-preview";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

const previewCache = new Map<string, TablePreview<unknown>>();

async function preview(state: string, kind: TableKind, species: Species): Promise<TablePreview<unknown>> {
  const key = `${state}/${kind}/${species}`;
  const hit = previewCache.get(key);
  if (hit) return hit;
  const p =
    kind === "draw"
      ? drawPreview(await readTable<DrawRecord>(state, kind, species))
      : harvestPreview(await readTable<HarvestRecord>(state, kind, species));
  previewCache.set(key, p);
  return p;
}

/**
 * One agency table (?kind=draw|harvest) for a state and species.
 * Pro members get the full JSON array, sent as the pre-built gzip so even the largest
 * tables stay small on the wire; everyone else gets a short, legible preview object (src/lib/agency-preview.ts).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ state: string; species: string }> }) {
  const { state, species } = await ctx.params;
  const kind = req.nextUrl.searchParams.get("kind");
  if (kind !== "draw" && kind !== "harvest") return NextResponse.json({ error: "kind must be draw or harvest." }, { status: 400 });
  if (!Object.hasOwn(SPECIES_LABELS, species)) return NextResponse.json({ error: "Unknown species." }, { status: 404 });
  if (!hasAgencyData(state)) return NextResponse.json({ error: "State not available yet." }, { status: 404 });

  const session = await auth();
  if (!session?.user?.isPro) {
    return NextResponse.json(await preview(state, kind, species as Species), { headers: NO_STORE });
  }

  const gz = await readTableGzip(state, kind, species as Species);
  if (!gz) return NextResponse.json([], { headers: NO_STORE });
  return new Response(new Uint8Array(gz), {
    headers: { ...NO_STORE, "Content-Type": "application/json; charset=utf-8", "Content-Encoding": "gzip", Vary: "Cookie" },
  });
}
