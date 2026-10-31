import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stateBySlug } from "@/data/state-list";
import { getStateData, speciesWithData } from "@/lib/agency";
import { isLiveState } from "@/lib/agency-format";
import { ComingSoonState } from "@/components/ComingSoonState";
import { UnitDetail } from "@/components/agency/UnitDetail";

type Params = { params: Promise<{ slug: string; unitId: string }>; searchParams?: Promise<{ species?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug, unitId } = await params;
  const data = isLiveState(slug) ? await getStateData(slug) : null;
  if (!data) return {};
  const unit = decodeURIComponent(unitId);
  return {
    title: `${data.name} ${data.unitTerm} ${unit}: Draw & Harvest History | HuntScout Pro`,
    description: `Official ${data.agency.shortName} draw results and harvest history for ${data.name} ${data.unitTerm} ${unit}.`,
  };
}

export default async function UnitPage({ params, searchParams }: Params) {
  const { slug, unitId } = await params;
  const requested = (await searchParams)?.species;
  const st = stateBySlug(slug);
  if (!st) notFound();
  const data = isLiveState(slug) ? await getStateData(slug) : null;
  const species = data ? speciesWithData(data) : [];
  if (!data || species.length === 0) return <ComingSoonState state={st} />;
  const unit = decodeURIComponent(unitId);
  return <UnitDetail key={`${slug}/${unit}/${requested}`} state={data} unit={unit} species={species} requested={requested} />;
}
