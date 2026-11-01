import { getAllStateData, getCoverageStats, speciesWithData } from "@/lib/agency";
import { LIVE_STATE_SLUGS } from "@/lib/agency-format";
import { AGENCY_STATES, type Species } from "@/data/agency/schema";
import { stateBySlug } from "@/data/state-list";
import { HomeClient } from "@/components/home/HomeClient";
import type { HomeData, HomeSpeciesCard } from "@/components/home/types";
import { SITE } from "@/lib/emails/onboarding";
import { jsonLdString } from "@/components/growth/state-glance";

// Structured data for search engines: who publishes the site, and the site itself.
const SITE_JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE}/#organization`,
    name: "HuntScout Pro",
    url: SITE,
    logo: `${SITE}/apple-icon.png`,
    slogan: "Know Before You Draw",
    email: "support@huntscoutpro.com",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE}/#website`,
    name: "HuntScout Pro",
    url: SITE,
    description:
      "Draw results and harvest by unit for western draw states, taken straight from state wildlife agency reports, with every number cited to its source.",
    publisher: { "@id": `${SITE}/#organization` },
    inLanguage: "en-US",
  },
];

// Species cards on the marketing page. Counts come from getCoverageStats(), which is
// computed from the published agency files at build time. A card with no data is hidden.
const SPECIES_CARDS: { name: string; species: Species[]; image: string; href: string }[] = [
  { name: "Elk", species: ["elk"], image: "https://images.unsplash.com/photo-1633356984559-9877a6896ba8?w=1920&q=80", href: "/states" },
  {
    name: "Deer",
    species: ["mule-deer", "whitetail"],
    image: "https://images.unsplash.com/photo-1700244909533-b7ab4e4bd9ae?w=1920&q=80",
    href: "/states",
  },
  { name: "Turkey", species: ["turkey"], image: "https://images.unsplash.com/photo-1649532716965-c798cda4b153?w=1920&q=80", href: "/turkey" },
  { name: "Moose", species: ["moose"], image: "https://images.unsplash.com/photo-1707079139889-1b8f7648fd38?w=1920&q=80", href: "/states" },
  { name: "Bear", species: ["bear"], image: "https://images.unsplash.com/photo-1781088172575-479cf75858e5?w=1920&q=80", href: "/states" },
  { name: "Pronghorn", species: ["pronghorn"], image: "https://images.unsplash.com/photo-1702338520328-ea01c36f08e8?w=1920&q=80", href: "/states" },
  { name: "Bighorn Sheep", species: ["sheep"], image: "https://images.unsplash.com/photo-1562811931-fbf7e9a79245?w=1920&q=80", href: "/states" },
];

export default async function HomePage() {
  const [stats, allStates] = await Promise.all([getCoverageStats(), getAllStateData()]);
  const states = [...allStates].sort((a, b) => LIVE_STATE_SLUGS.indexOf(a.slug) - LIVE_STATE_SLUGS.indexOf(b.slug));
  const speciesByState = new Map(states.map((s) => [s.slug, new Set(speciesWithData(s).map((sp) => sp.species))]));

  const speciesCards: HomeSpeciesCard[] = SPECIES_CARDS.flatMap((card) => {
    const entries = card.species.map((sp) => stats.species[sp]).filter((e) => !!e);
    // States that publish any of the card's species (Deer = mule deer or whitetail), counted once.
    const stateCount = states.filter((s) => card.species.some((sp) => speciesByState.get(s.slug)?.has(sp))).length;
    const huntCodes = entries.reduce((n, e) => n + e.huntCodes, 0);
    const units = entries.reduce((n, e) => n + e.units, 0);
    if (!stateCount || (!huntCodes && !units)) return [];
    return [{ name: card.name, image: card.image, href: card.href, states: stateCount, huntCodes, units }];
  });

  const totalHuntCodes = Object.values(stats.species).reduce((n, e) => n + (e?.huntCodes || 0), 0);
  const speciesCount = Object.values(stats.species).filter((e) => e && e.states > 0).length;
  const liveSlugs = new Set(states.map((s) => s.slug));

  const data: HomeData = {
    stateCount: states.length,
    speciesCount,
    totalHuntCodes,
    drawYears: stats.drawYears,
    harvestYears: stats.harvestYears,
    liveStates: states.map((s) => ({
      slug: s.slug,
      name: s.name,
      abbrev: s.abbrev,
      agency: s.agency.shortName,
      speciesCount: speciesByState.get(s.slug)?.size || 0,
    })),
    // The western draw states we're building that aren't published yet.
    upcomingStates: AGENCY_STATES.filter((slug) => !liveSlugs.has(slug)).map((slug) => stateBySlug(slug)?.name || slug),
    speciesCards,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(SITE_JSON_LD) }} />
      <HomeClient data={data} />
    </>
  );
}
