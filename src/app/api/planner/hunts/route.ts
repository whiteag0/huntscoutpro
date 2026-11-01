import { NextRequest, NextResponse } from "next/server";
import type { DrawRecord } from "@/data/agency/schema";
import { getStateData, readTable } from "@/lib/agency";
import { drawStats, minPointsDrawn, oddsOf } from "@/lib/agency-view";
import { NO_STORE, plannerMember } from "@/lib/planner-auth";

export const dynamic = "force-dynamic";

/** One hunt in the guided planner's search list (the agency's latest draw year). */
export interface HuntOption {
  code: string;
  units: string[];
  description: string;
  method?: string;
  sex?: string;
  seasonDates?: string;
  applicants: number | null;
  drawn: number | null;
  odds: number | null;
  minPoints: number | null;
  /** Figures are the agency's single combined pool (no residency split). */
  pooled: boolean;
}

/**
 * The hunts a member can plan for a state + species: every hunt code in the
 * agency's latest draw year, with the last draw's figures for the residency.
 * GET ?state=&species=&residency= -> { year, unitTerm, hunts: HuntOption[] }. Pro only (it is draw data).
 */
export async function GET(req: NextRequest) {
  const m = await plannerMember();
  if ("error" in m) return m.error;
  const q = req.nextUrl.searchParams;
  const slug = q.get("state") || "";
  const residency = q.get("residency") === "nonresident" ? "nonresident" : "resident";
  const st = /^[a-z-]{2,40}$/.test(slug) ? await getStateData(slug) : null;
  const info = st?.species.find((s) => s.species === q.get("species"));
  if (!st || !info) return NextResponse.json({ error: "Unknown state or species." }, { status: 404, headers: NO_STORE });
  const rows = await readTable<DrawRecord>(st.slug, "draw", info.species);
  const year = rows.reduce((y, r) => Math.max(y, r.year), 0);
  const hunts: HuntOption[] = rows
    .filter((r) => r.year === year)
    .map((r) => {
      const { stats, pool } = drawStats(r, residency);
      return {
        code: r.huntCode,
        units: r.units.slice(0, 40),
        description: r.description.slice(0, 300),
        ...(r.methodLabel || r.method ? { method: r.methodLabel || r.method } : {}),
        ...(r.sex ? { sex: r.sex } : {}),
        ...(r.seasonDates ? { seasonDates: r.seasonDates.slice(0, 160) } : {}),
        applicants: stats?.applicants ?? null,
        drawn: stats?.drawn ?? null,
        odds: (() => {
          const o = oddsOf(stats);
          return o === null ? null : Math.round(o * 10) / 10;
        })(),
        minPoints: info.pointsMatter ? minPointsDrawn(r, residency) : null,
        pooled: pool === "total",
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
  return NextResponse.json({ year: year || null, unitTerm: st.unitTerm, pointsMatter: info.pointsMatter, hunts }, { headers: { ...NO_STORE } });
}
