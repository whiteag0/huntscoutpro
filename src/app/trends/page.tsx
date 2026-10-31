import type { Metadata } from "next";
import type { Species } from "@/data/types";
import { getAllStateData, getStateData, speciesWithData } from "@/lib/agency";
import { LIVE_STATE_SLUGS } from "@/lib/agency-format";
import { TrendsView } from "@/components/agency/TrendsView";

export const metadata: Metadata = {
  title: "Draw & Harvest Trends | HuntScout Pro",
  description: "Point creep, draw odds and harvest success over time, from official state agency reports.",
};

type Search = { searchParams: Promise<{ state?: string; species?: string }> };

export default async function TrendsPage({ searchParams }: Search) {
  const { state, species } = await searchParams;
  const all = (await getAllStateData()).sort((a, b) => LIVE_STATE_SLUGS.indexOf(a.slug) - LIVE_STATE_SLUGS.indexOf(b.slug));
  const options = all
    .map((s) => ({
      slug: s.slug,
      name: s.name,
      unitTerm: s.unitTerm,
      species: speciesWithData(s).map((sp) => ({ species: sp.species as Species, pointsMatter: sp.pointsMatter })),
    }))
    .filter((o) => o.species.length > 0);
  if (options.length === 0) return null;
  const opt = options.find((o) => o.slug === state) || options[0];
  const sp = opt.species.find((s) => s.species === species) || opt.species[0];
  const data = await getStateData(opt.slug);
  return (
    <TrendsView key={`${opt.slug}-${sp.species}`} options={options} slug={opt.slug} species={sp.species} pointsMatter={sp.pointsMatter} sources={data?.sources || []} />
  );
}
