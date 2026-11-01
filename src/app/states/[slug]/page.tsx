import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { stateBySlug } from "@/data/state-list";
import { getStateData, speciesWithData } from "@/lib/agency";
import { generalSeasons, isLiveState, keyDateEnd, todayIso } from "@/lib/agency-format";
import { SITE } from "@/lib/emails/onboarding";
import { stateOption } from "@/lib/free-reminders-options";
import { ComingSoonState } from "@/components/ComingSoonState";
import { StateExplorer } from "@/components/agency/StateExplorer";
import { FreeRemindersSignup } from "@/components/growth/FreeRemindersSignup";
import { StateAtAGlance } from "@/components/growth/StateAtAGlance";
import { getStateGlance, jsonLdString, spanLabel, speciesPhrase, stateJsonLd, yearSpan } from "@/components/growth/state-glance";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<{ species?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const st = stateBySlug(slug);
  if (!st) return {};
  const url = `${SITE}/states/${slug}`;
  const data = isLiveState(slug) ? await getStateData(slug) : null;
  const species = data ? speciesWithData(data) : [];
  if (!data || species.length === 0) {
    const title = `${st.name}: Coming Soon | HuntScout Pro`;
    const description = `Request official ${st.name} hunting data on HuntScout Pro.`;
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: { title, description, url, siteName: "HuntScout Pro", type: "website" },
    };
  }

  // Every count and year here comes from the state's agency meta files.
  const draw = yearSpan(data.drawCoverage.flatMap((c) => c.years));
  const harvest = yearSpan(data.harvestCoverage.flatMap((c) => c.years));
  const all = yearSpan([...(draw || []), ...(harvest || [])]);
  // Only mention dates the agency has published that haven't passed yet.
  const today = todayIso();
  const upcoming = species.flatMap((s) => s.keyDates).filter((k) => keyDateEnd(k) >= today);
  const cycle = upcoming.length ? Math.max(...upcoming.map((k) => k.cycle)) : 0;
  // The free reminder signup only shows when the state has agency key dates to remind about.
  const remind = !!stateOption(data);
  const title = `${data.name} Draw Results & Harvest Data${all ? ` ${spanLabel(all)}` : ""} | HuntScout Pro`;
  const description =
    `Official ${data.agency.shortName} draw results${draw ? ` (${spanLabel(draw)})` : ""} and harvest by ${data.unitTerm}` +
    `${harvest ? ` (${spanLabel(harvest)})` : ""} for ${species.length} species: ${speciesPhrase(species)}.` +
    `${cycle ? ` ${cycle} application dates${remind ? " and free deadline reminders" : ""}.` : remind ? " Free deadline reminders." : ""}` +
    " Every number cited to the agency report.";
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "HuntScout Pro", type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function StatePage({ params, searchParams }: Params) {
  const { slug } = await params;
  const { species: requested } = await searchParams;
  const st = stateBySlug(slug);
  if (!st) notFound();
  const data = isLiveState(slug) ? await getStateData(slug) : null;
  const species = data ? speciesWithData(data) : [];
  if (!data || species.length === 0) return <ComingSoonState state={st} />;
  const glance = await getStateGlance(data, species);
  const option = stateOption(data);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(stateJsonLd(data, species, glance)) }} />
      {/* Hunt-specific seasons appear on each hunt row; the overview lists the general ones. */}
      <StateExplorer key={slug} state={{ ...data, seasons: generalSeasons(data.seasons) }} species={species} initialSpecies={requested} />
      <StateAtAGlance state={data} glance={glance} />
      {option && (
        <div className="max-w-7xl mx-auto px-4 pb-10">
          {/* Hidden for Pro members (client-side), whose reminders cover every state they follow. */}
          <FreeRemindersSignup id="free-reminders" source="state" lockedState={slug} options={[option]} />
        </div>
      )}
    </>
  );
}
