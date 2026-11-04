import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stateBySlug } from "@/data/state-list";
import { SPECIES_LABELS } from "@/data/types";
import type { SpeciesInfo } from "@/data/agency/schema";
import { getStateData, speciesWithData, type StateData } from "@/lib/agency";
import { isLiveState, todayIso } from "@/lib/agency-format";
import { SITE } from "@/lib/emails/onboarding";
import { ComingSoonState } from "@/components/ComingSoonState";
import { UnitDetail } from "@/components/agency/UnitDetail";
import { TrackView } from "@/components/analytics/TrackView";
import { UnitAtAGlance } from "@/components/growth/UnitAtAGlance";
import { getUnitTeasers, teasersForUnit } from "@/components/growth/unit-glance";

type Params = { params: Promise<{ slug: string; unitId: string }>; searchParams?: Promise<{ species?: string }> };

/**
 * The species the page shows: the one asked for, else the first with published figures for
 * this unit, else the state's first. Also the unit's summaries for every species with figures.
 */
async function resolve(data: StateData, species: SpeciesInfo[], unit: string, requested: string | undefined) {
  const teasers = teasersForUnit(await getUnitTeasers(data, species), species, unit);
  const info = species.find((s) => s.species === requested) || species.find((s) => teasers.has(s.species)) || species[0];
  return { info, teasers };
}

export async function generateMetadata({ params, searchParams }: Params): Promise<Metadata> {
  const { slug, unitId } = await params;
  const requested = (await searchParams)?.species;
  const data = isLiveState(slug) ? await getStateData(slug) : null;
  const species = data ? speciesWithData(data) : [];
  // Coming-soon states have no unit data at all.
  if (!data || species.length === 0) return { robots: { index: false } };
  const unit = decodeURIComponent(unitId);
  const { info, teasers } = await resolve(data, species, unit, requested);
  const sp = info.species;
  const spLabel = ` ${SPECIES_LABELS[sp]}`;
  const title = `${data.name} ${data.unitTerm} ${unit}${spLabel}: Draw & Harvest History | HuntScout Pro`;
  const description = `Official ${data.agency.shortName}${spLabel.toLowerCase()} draw results and harvest history for ${data.name} ${data.unitTerm} ${unit}.`;
  // ?species= changes what the page shows (Wyoming's elk area 7 isn't its deer area 7), so it stays in the canonical URL.
  const url = `${SITE}/states/${slug}/units/${encodeURIComponent(unit)}?species=${sp}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "HuntScout Pro", type: "website" },
    // A unit (or species) the agency reports list no figures for is a thin page: keep it out of search.
    ...(teasers.has(sp) ? {} : { robots: { index: false } }),
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
  const { info, teasers } = await resolve(data, species, unit, requested);
  const summary = (
    <UnitAtAGlance
      state={data}
      info={info}
      unit={unit}
      teaser={teasers.get(info.species)}
      otherSpecies={species.map((s) => s.species).filter((sp) => sp !== info.species && teasers.has(sp))}
      today={todayIso()}
    />
  );
  return (
    <>
      <TrackView event="unit_view" state={slug} unit={unit} species={requested} />
      <UnitDetail key={`${slug}/${unit}/${info.species}`} state={data} unit={unit} species={species} requested={info.species} summary={summary} />
    </>
  );
}
