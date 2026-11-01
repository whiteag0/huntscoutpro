"use client";

import { useEffect } from "react";
import { setSpecies, setStateSlug, track, type AnalyticsEvent } from "@/lib/analytics";

/** Sends one analytics event when a server-rendered page is viewed. Renders nothing. */
export function TrackView({ event, state, species, unit }: { event: AnalyticsEvent; state?: string; species?: string; unit?: string }) {
  useEffect(() => {
    setStateSlug(state);
    setSpecies(species);
    track(event, { state, species, unit });
  }, [event, state, species, unit]);
  return null;
}
