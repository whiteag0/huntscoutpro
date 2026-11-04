import type { Metadata } from "next";
import type { Species } from "@/data/types";
import { getAllStateData, getStateData, speciesWithData } from "@/lib/agency";
import { LIVE_STATE_SLUGS } from "@/lib/agency-format";
import { auth } from "@/lib/auth";
import { TrendsView } from "@/components/agency/TrendsView";
import { TrendExample } from "@/components/growth/TrendExample";
import { getTrendExample } from "@/components/growth/unit-glance";

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
  const [data, session] = await Promise.all([getStateData(opt.slug), auth()]);
  // Non-members get one real, cited hunt history above the gated table.
  const info = data?.species.find((s) => s.species === sp.species);
  const example = !session?.user?.isPro && data && info ? await getTrendExample(opt.slug, info) : null;
  const teaser = example && data && info ? <TrendExample stateName={data.name} agency={data.agency.shortName} info={info} example={example} sources={data.sources} /> : null;
  return (
    <TrendsView
      key={`${opt.slug}-${sp.species}`}
      options={options}
      slug={opt.slug}
      species={sp.species}
      pointsMatter={sp.pointsMatter}
      sources={data?.sources || []}
      teaser={teaser}
    />
  );
}
