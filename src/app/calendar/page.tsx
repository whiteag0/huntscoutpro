import type { Metadata } from "next";
import { getAllStateData } from "@/lib/agency";
import { clipText, generalSeasons, seasonScope } from "@/lib/agency-format";
import Link from "next/link";
import { CalendarView, type CalendarItem, type CalendarSource } from "@/components/agency/CalendarView";
import { FreeRemindersSignup } from "@/components/growth/FreeRemindersSignup";
import { freeReminderOptions } from "@/lib/free-reminders-options";

// "Next date" and "open now" depend on today; rebuild hourly.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Application Calendar | HuntScout Pro",
  description: "Draw application windows, results dates and seasons for the western draw states, from official agency sources. Free email reminders before each deadline.",
  alternates: { canonical: "https://www.huntscoutpro.com/calendar" },
};

export default async function CalendarPage() {
  const states = await getAllStateData();
  const items: CalendarItem[] = [];
  // Each source is sent once; items point at it by index.
  const sources: CalendarSource[] = [];
  const sourceIndex = new Map<string, number>();
  const srcOf = (title: string, url: string) => {
    const key = `${title}\n${url}`;
    let i = sourceIndex.get(key);
    if (i === undefined) sourceIndex.set(key, (i = sources.push({ title, url }) - 1));
    return i;
  };
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
          note: clipText(d.note, 240),
          src: srcOf(source?.title || s.agency.name, source?.url || s.agency.url),
        });
      }
    }
    // Hunt-specific seasons are on each hunt (state pages, planner); the calendar lists general ones.
    for (const se of generalSeasons(s.seasons)) {
      const source = src.get(se.sourceId);
      const scope = seasonScope(se, s.unitTerm === "Unit" ? "Units" : `${s.unitTerm}s`);
      items.push({
        kind: "season",
        state: s.name,
        slug: s.slug,
        species: se.species,
        label: scope ? `${se.label} (${scope})` : se.label,
        start: se.start,
        end: se.end,
        cycle: se.year,
        tentative: false,
        note: clipText(se.note, 200),
        src: srcOf(source?.title || s.agency.name, source?.url || s.agency.url),
      });
    }
  }
  const options = await freeReminderOptions();
  return (
    <>
      <div className="max-w-6xl mx-auto px-4 pt-8 sm:pt-10 -mb-4 sm:-mb-6">
        <FreeRemindersSignup
          id="free-reminders"
          source="calendar"
          options={options}
          titleAs="p"
          proNote={
            <p className="text-sm rounded-xl border border-border bg-card px-4 py-3 text-muted-foreground">
              <span className="font-semibold text-foreground">Deadline reminders:</span> as a Pro member you get them for every
              state in your hunting preferences.{" "}
              <Link href="/account" className="text-primary font-semibold hover:underline">
                Manage them in My Account
              </Link>
            </p>
          }
        />
      </div>
      <CalendarView items={items} sources={sources} states={states.map((s) => ({ slug: s.slug, name: s.name }))} />
    </>
  );
}
