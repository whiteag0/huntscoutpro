import type { Metadata } from "next";
import { getAllStateData } from "@/lib/agency";
import { CalendarView, type CalendarItem } from "@/components/agency/CalendarView";

// "Next date" and "open now" depend on today; rebuild hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Application Calendar | HuntScout Pro",
  description: "Draw application windows, results dates and seasons for the western draw states, from official agency sources.",
};

export default async function CalendarPage() {
  const states = await getAllStateData();
  const items: CalendarItem[] = [];
  for (const s of states) {
    const src = new Map(s.sources.map((x) => [x.id, x]));
    for (const sp of s.species) {
      for (const d of sp.keyDates) {
        const source = src.get(d.sourceId);
        items.push({
          kind: "date",
          state: s.name,
          slug: s.slug,
          species: sp.species,
          label: d.label,
          start: d.start || d.date!,
          end: d.end || d.date!,
          cycle: d.cycle,
          tentative: d.status === "tentative",
          note: d.note,
          sourceTitle: source?.title || s.agency.name,
          sourceUrl: source?.url || s.agency.url,
        });
      }
    }
    for (const se of s.seasons) {
      const source = src.get(se.sourceId);
      items.push({
        kind: "season",
        state: s.name,
        slug: s.slug,
        species: se.species,
        label: se.label,
        start: se.start,
        end: se.end,
        cycle: se.year,
        tentative: false,
        note: se.note,
        sourceTitle: source?.title || s.agency.name,
        sourceUrl: source?.url || s.agency.url,
      });
    }
  }
  return <CalendarView items={items} states={states.map((s) => ({ slug: s.slug, name: s.name }))} />;
}
