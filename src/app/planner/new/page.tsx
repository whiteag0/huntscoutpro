import type { Metadata } from "next";
import { getAllStateData, hasTable, speciesWithData } from "@/lib/agency";
import { DRAW_SYSTEM_LABELS, LIVE_STATE_SLUGS } from "@/lib/agency-format";
import { SPECIES_LABELS } from "@/data/types";
import { PlanFlow, type FlowInitial, type FlowState } from "@/components/planner/PlanFlow";

export const metadata: Metadata = {
  title: "Plan a hunt | HuntScout Pro",
  description: "Pick a state, species and hunt; HuntScout brings together the agency's application dates, season dates, fees and last draw results.",
  robots: { index: false },
};

type Search = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 120) : undefined);

/** Guided "Plan a hunt" flow. The options (live states and their species) come from the agency data; the hunt list loads per species. */
export default async function PlanNewPage({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const all = await getAllStateData();
  const states: FlowState[] = LIVE_STATE_SLUGS.map((slug) => all.find((s) => s.slug === slug))
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((st) => ({
      slug: st.slug,
      name: st.name,
      agency: st.agency.shortName || st.agency.name,
      unitTerm: st.unitTerm,
      species: speciesWithData(st).map((info) => ({
        species: info.species,
        label: info.displayName || SPECIES_LABELS[info.species],
        drawSystem: DRAW_SYSTEM_LABELS[info.drawSystem],
        hasDraw: hasTable(st.slug, "draw", info.species),
        otc: info.otcSummary || (info.drawSystem === "otc" ? info.drawSystemSummary : null) || null,
        pointsMatter: info.pointsMatter,
      })),
    }));
  const initial: FlowInitial = {
    state: one(q.state),
    species: one(q.species),
    residency: one(q.residency) === "nonresident" ? "nonresident" : one(q.residency) === "resident" ? "resident" : undefined,
    hunt: one(q.hunt),
    year: Number(one(q.year)) || undefined,
    kind: one(q.kind) === "otc" ? "otc" : one(q.kind) === "custom" ? "custom" : undefined,
    from: one(q.from) || "direct",
  };
  return <PlanFlow states={states} initial={initial} />;
}
