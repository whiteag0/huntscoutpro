import type { Metadata } from "next";
import { Info } from "lucide-react";
import { auth } from "@/lib/auth";
import { getEntitlement } from "@/lib/entitlement";
import { readPreferences } from "@/lib/preferences";
import { pointsFromMetadata } from "@/lib/points";
import { pointsKey, type PointsMap } from "@/lib/points-schema";
import { buildShortlist, shortlistSpeciesOptions, type ShortlistResult } from "@/lib/shortlist";
import { stateByAbbrev } from "@/data/state-list";
import { SPECIES_LABELS, type Species } from "@/data/types";
import { DemoGate } from "@/components/DemoGate";
import { ShortlistClient, type ShortlistInitial } from "@/components/shortlist/ShortlistClient";
import { ShortlistResults } from "@/components/shortlist/ShortlistResults";

export const metadata: Metadata = {
  title: "Where Can I Draw? | HuntScout Pro",
  description:
    "A cross-state shortlist of hunts that drew at your point level last year, from official state wildlife agency draw results.",
};

type Search = { searchParams: Promise<{ species?: string; home?: string; stretch?: string }> };

// Non-members see a few real rows for a fixed example, the same way the state
// tables show a short preview.
const SAMPLE_SPECIES: Species = "elk";
const SAMPLE_HOME = "TX";
const SAMPLE_POINTS = 3;
const SAMPLE_STATES = 2;
const SAMPLE_HUNTS = 3;

function Intro() {
  return (
    <header className="mb-6">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gold/15 text-xs font-semibold uppercase tracking-wide text-foreground">
        <span className="w-1.5 h-1.5 rounded-full bg-gold" aria-hidden="true" />
        Shortlist
      </span>
      <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">Where can I draw?</h1>
      <p className="text-muted-foreground mt-2 max-w-3xl">
        Pick a species, your home state and the points you hold. We go through last year&apos;s official draw results in every
        state we cover and list the hunts that drew at your point level, with quota, applicants, odds and the unit&apos;s harvest
        success, each linked to the agency report it came from.
      </p>
    </header>
  );
}

function Disclaimer() {
  return (
    <p className="mt-10 flex items-start gap-2 text-xs text-muted-foreground max-w-3xl">
      <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
      These are last year&apos;s results as each agency published them, not a forecast. Quotas, rules and the number of
      applicants change every year, and a hunt that drew at your points last year may not this year. Odds are the
      agency&apos;s published rate, or drawn ÷ applicants where it publishes only counts. Confirm everything with the agency
      before you apply.
    </p>
  );
}

async function sampleResult(): Promise<ShortlistResult | null> {
  try {
    const options = await shortlistSpeciesOptions();
    const opt = options.find((o) => o.species === SAMPLE_SPECIES);
    const points: PointsMap = {};
    for (const st of opt?.states || []) if (st.pointsMatter) points[pointsKey(st.slug, SAMPLE_SPECIES)] = SAMPLE_POINTS;
    const full = await buildShortlist({ species: SAMPLE_SPECIES, home: SAMPLE_HOME, points, includeStretch: false });
    const states = full.states
      .filter((s) => s.hunts.some((h) => h.status === "drew-at-points"))
      .slice(0, SAMPLE_STATES)
      .map((s) => ({ ...s, hunts: s.hunts.slice(0, SAMPLE_HUNTS) }));
    return { ...full, states, notCovered: [] };
  } catch (err) {
    console.error("Shortlist sample failed:", err);
    return null;
  }
}

export default async function ShortlistPage({ searchParams }: Search) {
  const session = await auth();
  const isPro = session?.user?.isPro === true;
  const sp = await searchParams;

  if (!isPro) {
    const sample = await sampleResult();
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <Intro />
        <DemoGate
          feature="your draw shortlist"
          preview={
            <p className="text-sm text-muted-foreground mb-4">
              Example below: {SPECIES_LABELS[SAMPLE_SPECIES].toLowerCase()}, applying from {stateByAbbrev(SAMPLE_HOME)?.name} with{" "}
              {SAMPLE_POINTS} points in each state, trimmed to a few hunts.
            </p>
          }
        >
          {sample ? (
            <ShortlistResults result={sample} huntsPerState={SAMPLE_HUNTS} maxStates={SAMPLE_STATES} />
          ) : (
            <div className="bg-card border border-border rounded-2xl p-8 text-center text-muted-foreground">Sample unavailable.</div>
          )}
        </DemoGate>
        <Disclaimer />
      </div>
    );
  }

  const options = await shortlistSpeciesOptions();
  const valid = (s: string | undefined): s is Species => !!s && options.some((o) => o.species === s);

  // Prefill from what the member saved on their purchase (one Stripe read).
  let homeState = "";
  let points: PointsMap = {};
  let pointsNote = "";
  let favorite: string | undefined;
  let canSave = false;
  let prefsError = false;
  const ent = await getEntitlement(session.user?.email);
  if (ent.paymentIntentId) {
    canSave = true;
    try {
      const { preferences, metadata } = await readPreferences(ent.paymentIntentId);
      homeState = preferences?.homeState || "";
      pointsNote = preferences?.points || "";
      favorite = preferences?.species.find(valid);
      points = pointsFromMetadata(metadata);
    } catch (err) {
      console.error("Shortlist prefill failed:", err);
      prefsError = true;
    }
  }

  const queryHome = (sp.home || "").toUpperCase();
  const initial: ShortlistInitial = {
    species: valid(sp.species) ? sp.species : favorite && valid(favorite) ? favorite : valid("elk") ? "elk" : options[0].species,
    home: stateByAbbrev(queryHome) ? queryHome : stateByAbbrev(homeState) ? homeState.toUpperCase() : "",
    points,
    stretch: sp.stretch === "1",
    pointsNote,
    canSave,
    prefsError,
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      <Intro />
      <ShortlistClient options={options} initial={initial} />
      <Disclaimer />
    </div>
  );
}
