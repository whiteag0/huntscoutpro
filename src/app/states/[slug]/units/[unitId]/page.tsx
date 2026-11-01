import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stateBySlug } from "@/data/state-list";
import { SPECIES_LABELS } from "@/data/types";
import { getStateData, speciesWithData } from "@/lib/agency";
import { isLiveState } from "@/lib/agency-format";
import { SITE } from "@/lib/emails/onboarding";
import { ComingSoonState } from "@/components/ComingSoonState";
import { UnitDetail } from "@/components/agency/UnitDetail";

type Params = { params: Promise<{ slug: string; unitId: string }>; searchParams?: Promise<{ species?: string }> };

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug, unitId } = await params;
  const requested = (await searchParams)?.species;
  const data = isLiveState(slug) ? await getStateData(slug) : null;
  if (!data) return {};
  const unit = decodeURIComponent(unitId);
  // ?species= changes what the page shows (Wyoming's elk area 7 isn't its deer area 7), so it stays in the canonical URL.
  const sp = speciesWithData(data).find((s) => s.species === requested)?.species;
  const spLabel = sp ? ` ${SPECIES_LABELS[sp]}` : "";
  const title = `${data.name} ${data.unitTerm} ${unit}${spLabel}: Draw & Harvest History | HuntScout Pro`;
  const description = `Official ${data.agency.shortName}${spLabel.toLowerCase()} draw results and harvest history for ${data.name} ${data.unitTerm} ${unit}.`;
  const url = `${SITE}/states/${slug}/units/${encodeURIComponent(unit)}${sp ? `?species=${sp}` : ""}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "HuntScout Pro", type: "website" },
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
