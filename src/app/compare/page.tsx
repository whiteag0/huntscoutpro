import type { Metadata } from "next";
import Link from "next/link";
import type { Species } from "@/data/types";
import { getStateData, speciesWithData } from "@/lib/agency";
import { LIVE_STATES, isLiveState } from "@/lib/agency-format";
import { CompareView } from "@/components/agency/CompareView";

export const metadata: Metadata = {
  title: "Compare Hunts | HuntScout Pro",
  description: "Compare official draw results and harvest for up to four hunts side by side.",
};

type Search = { searchParams: Promise<{ state?: string; species?: string; codes?: string }> };

export default async function ComparePage({ searchParams }: Search) {
  const { state, species, codes } = await searchParams;
  const data = state && isLiveState(state) ? await getStateData(state) : null;
  const info = data ? speciesWithData(data).find((s) => s.species === species) : undefined;

  if (!data || !info) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-bold text-foreground">Compare hunts</h1>
        <p className="text-muted-foreground mt-3">
          Open a state, tick up to four hunts in the draw results table, then choose <b>Compare</b>.
        </p>
        <div className="flex flex-wrap justify-center gap-2 mt-6">
          {LIVE_STATES.map((s) => (
            <Link key={s.slug} href={`/states/${s.slug}`} className="px-3 py-1.5 rounded-full bg-card border border-border text-sm hover:border-gold">
              {s.name}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <CompareView
      slug={data.slug}
      stateName={data.name}
      unitTerm={data.unitTerm}
      species={info.species as Species}
      pointsMatter={info.pointsMatter}
      codes={(codes || "").split(",").map((c) => decodeURIComponent(c).trim()).filter(Boolean).slice(0, 4)}
      sources={data.sources}
    />
  );
}
