import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stateBySlug } from "@/data/state-list";
import { getStateData, speciesWithData } from "@/lib/agency";
import { isLiveState } from "@/lib/agency-format";
import { ComingSoonState } from "@/components/ComingSoonState";
import { StateExplorer } from "@/components/agency/StateExplorer";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ species?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const st = stateBySlug(slug);
  if (!st) return {};
  return isLiveState(slug)
    ? {
        title: `${st.name} Draw Results & Harvest Data | HuntScout Pro`,
        description: `Official ${st.name} draw results, point levels and harvest by unit, from state wildlife agency reports.`,
      }
    : { title: `${st.name}: Coming Soon | HuntScout Pro`, description: `Request official ${st.name} hunting data on HuntScout Pro.` };
}

export default async function StatePage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { species: requested } = await searchParams;
  const st = stateBySlug(slug);
  if (!st) notFound();
  const data = isLiveState(slug) ? await getStateData(slug) : null;
  const species = data ? speciesWithData(data) : [];
  if (!data || species.length === 0) return <ComingSoonState state={st} />;
  return <StateExplorer key={slug} state={data} species={species} initialSpecies={requested} />;
}
