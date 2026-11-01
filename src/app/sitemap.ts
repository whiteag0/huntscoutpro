import type { MetadataRoute } from "next";
import type { HarvestRecord } from "@/data/agency/schema";
import { agencySlugs, getAllStateData, readTable, speciesWithData, type StateData } from "@/lib/agency";
import { COMING_SOON_STATES, LIVE_STATE_SLUGS } from "@/lib/agency-format";
import { canonicalUnit, isRealUnit } from "@/lib/agency-view";
import { SITE } from "@/lib/emails/onboarding";

// Built once at build time from the agency files. lastModified is the date each
// state's facts were last checked against the agency (draw-meta lastReviewed).

/** Google's limit is 50,000 per file; stay well under it and keep unit pages from swamping the rest. */
const MAX_URLS = 5000;

const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
  { path: "", priority: 1, changeFrequency: "weekly" },
  { path: "/states", priority: 0.9, changeFrequency: "weekly" },
  { path: "/calendar", priority: 0.8, changeFrequency: "weekly" },
  { path: "/turkey", priority: 0.7, changeFrequency: "monthly" },
  { path: "/shortlist", priority: 0.7, changeFrequency: "monthly" },
  { path: "/pricing", priority: 0.6, changeFrequency: "monthly" },
  { path: "/about", priority: 0.4, changeFrequency: "yearly" },
  { path: "/request-state", priority: 0.4, changeFrequency: "yearly" },
];

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

/**
 * Harvest units for a state, one per unit: ids written differently across reports are
 * merged (newest spelling wins) and each unit is linked under the first species that reports it.
 */
async function unitPages(state: StateData): Promise<{ unit: string; species: string }[]> {
  const found = new Map<string, { unit: string; year: number; species: string }>();
  for (const sp of speciesWithData(state)) {
    let rows: HarvestRecord[] = [];
    try {
      rows = await readTable<HarvestRecord>(state.slug, "harvest", sp.species);
    } catch {
      continue;
    }
    for (const r of rows) {
      if (!isRealUnit(r.unit) || r.unit.length > 60 || /[()]/.test(r.unit)) continue;
      const key = canonicalUnit(r.unit);
      const cur = found.get(key);
      if (!cur) found.set(key, { unit: r.unit, year: r.year, species: sp.species });
      else if (cur.species === sp.species && r.year > cur.year) found.set(key, { ...cur, unit: r.unit, year: r.year });
    }
  }
  return [...found.values()]
    .map(({ unit, species }) => ({ unit, species }))
    .sort((a, b) => a.unit.localeCompare(b.unit, "en", { numeric: true }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const states = (await getAllStateData())
    .filter((s) => speciesWithData(s).length > 0)
    .sort((a, b) => LIVE_STATE_SLUGS.indexOf(a.slug) - LIVE_STATE_SLUGS.indexOf(b.slug));
  const newestReview = states.map((s) => s.lastReviewed).sort().at(-1);
  const siteModified = newestReview ? day(newestReview) : undefined;

  const out: MetadataRoute.Sitemap = PUBLIC_PAGES.map((p) => ({
    url: `${SITE}${p.path}`,
    ...(siteModified ? { lastModified: siteModified } : {}),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  for (const s of states) {
    out.push({ url: `${SITE}/states/${s.slug}`, lastModified: day(s.lastReviewed), changeFrequency: "weekly", priority: 0.9 });
  }

  const live = new Set(agencySlugs());
  for (const s of COMING_SOON_STATES) {
    if (live.has(s.slug)) continue;
    out.push({ url: `${SITE}/states/${s.slug}`, changeFrequency: "monthly", priority: 0.2 });
  }

  // Unit pages, round-robin across states so a cap trims every state evenly.
  const perState = await Promise.all(states.map(async (s) => ({ s, units: await unitPages(s) })));
  const room = Math.max(0, MAX_URLS - out.length);
  const longest = Math.max(0, ...perState.map((p) => p.units.length));
  const units: MetadataRoute.Sitemap = [];
  for (let i = 0; i < longest && units.length < room; i++) {
    for (const { s, units: list } of perState) {
      if (i >= list.length || units.length >= room) continue;
      units.push({
        // Same URL the unit page declares canonical.
        url: `${SITE}/states/${s.slug}/units/${encodeURIComponent(list[i].unit)}?species=${list[i].species}`,
        lastModified: day(s.lastReviewed),
        changeFrequency: "monthly",
        priority: 0.5,
      });
    }
  }
  // Keep each state's units together in the file.
  units.sort((a, b) => a.url.localeCompare(b.url, "en", { numeric: true }));
  return [...out, ...units];
}
