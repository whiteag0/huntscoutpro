import "server-only";
import { SPECIES_LABELS } from "@/data/types";
import { getAllStateData, speciesWithData, type StateData } from "@/lib/agency";
import { LIVE_STATE_SLUGS } from "@/lib/agency-format";
import type { FreeReminderStateOption } from "@/lib/free-reminders-schema";

/** One state's signup option: the species with data that have agency key dates. Null when there's nothing to remind about. */
export function stateOption(s: StateData): FreeReminderStateOption | null {
  const species = speciesWithData(s)
    .filter((sp) => sp.keyDates.length > 0)
    .map((sp) => ({ id: sp.species, label: SPECIES_LABELS[sp.species] ?? sp.species }));
  return species.length ? { slug: s.slug, name: s.name, species } : null;
}

/** Every live state people can sign up for, in display order. */
export async function freeReminderOptions(): Promise<FreeReminderStateOption[]> {
  const states = await getAllStateData();
  return states
    .sort((a, b) => LIVE_STATE_SLUGS.indexOf(a.slug) - LIVE_STATE_SLUGS.indexOf(b.slug))
    .map(stateOption)
    .filter((o): o is FreeReminderStateOption => !!o);
}
