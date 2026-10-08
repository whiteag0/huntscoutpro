"use client";

import { useState } from "react";
import { Info, FileText, BarChart3, ChevronDown, ChevronUp } from "lucide-react";

interface DataDisclaimerProps {
  state?: string;
  species?: string;
  variant?: "banner" | "inline";
}

interface HarvestSource {
  agency: string;
  /** Years of per-unit harvest totals in src/data/states/* that the data layer actually uses */
  years: string;
  /**
   * true  = agency harvest figures confirmed against the agency's published report.
   * false = compiled from agency reports but not yet re-checked by us.
   */
  confirmed: boolean;
  /**
   * false = the source rows have harvest counts only (totalHunters 0), so
   * success rates and hunter counts on those units are modeled, not reported.
   */
  huntersReported: boolean;
  /** What the source covers, when it is narrower than "all units, all seasons". */
  scope?: string;
}

// Harvest / success figures that come from state agency harvest reports.
// Only per-unit harvest totals are agency numbers; how they are split across
// seasons and hunt codes, and every year not listed here, is modeled.
// Draw odds, minimum points, tag and applicant counts are ALWAYS modeled
// (seeded model in src/data/hunt-data.ts) — never list them here.
//
// Deliberately excluded because the data files are derived, not reported:
//   Colorado bear (harvest = quota x 0.17), sheep, goat and lion (constant
//   success rates), pronghorn 2024 ("estimated from draw results"), and
//   moose (2017 data, outside the years the site displays).
const AGENCY_HARVEST: Record<string, Record<string, HarvestSource>> = {
  colorado: {
    elk: { agency: "Colorado Parks and Wildlife", years: "2023–2024", confirmed: true, huntersReported: true },
    "mule-deer": { agency: "Colorado Parks and Wildlife", years: "2023–2024", confirmed: true, huntersReported: true },
    pronghorn: { agency: "Colorado Parks and Wildlife", years: "2023", confirmed: true, huntersReported: true },
    turkey: { agency: "Colorado Parks and Wildlife", years: "2024", confirmed: true, huntersReported: true },
  },
  wyoming: {
    elk: { agency: "Wyoming Game and Fish Department", years: "2024", confirmed: true, huntersReported: true },
  },
  idaho: {
    elk: { agency: "Idaho Department of Fish and Game", years: "2024", confirmed: false, huntersReported: true, scope: "general seasons only" },
  },
  montana: {
    elk: { agency: "Montana Fish, Wildlife & Parks", years: "2020–2024", confirmed: false, huntersReported: false, scope: "Region 1 hunting districts only" },
  },
  wisconsin: {
    whitetail: { agency: "Wisconsin DNR", years: "2024", confirmed: false, huntersReported: false, scope: "9-day gun season, by county" },
    turkey: { agency: "Wisconsin DNR", years: "2024", confirmed: false, huntersReported: true, scope: "spring season, by zone" },
    bear: { agency: "Wisconsin DNR", years: "2024", confirmed: false, huntersReported: false, scope: "by zone" },
  },
};

export function getHarvestSource(stateSlug: string, species?: string): HarvestSource | undefined {
  const bySpecies = AGENCY_HARVEST[stateSlug];
  if (!bySpecies || !species) return undefined;
  return Object.hasOwn(bySpecies, species) ? bySpecies[species] : undefined;
}

/** True when some harvest/success figures for this state (and species, if given) come from agency reports. */
export function hasAgencyHarvestData(stateSlug: string, species?: string): boolean {
  const bySpecies = AGENCY_HARVEST[stateSlug];
  if (!bySpecies) return false;
  if (!species) return true;
  return Object.hasOwn(bySpecies, species);
}

function harvestLabel(src: HarvestSource): string {
  const base = src.confirmed
    ? `Agency data: ${src.agency}, ${src.years}`
    : `Compiled from ${src.agency} reports, ${src.years}`;
  return src.scope ? `${base} (${src.scope})` : base;
}

export function DataDisclaimer({ state, species, variant = "banner" }: DataDisclaimerProps) {
  const [expanded, setExpanded] = useState(false);
  const source = state ? getHarvestSource(state, species) : undefined;
  const stateHasSomeAgencyData = state ? hasAgencyHarvestData(state) : false;

  if (variant === "inline") {
    return (
      <div className="inline-flex flex-wrap items-center gap-1.5">
        {source && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <FileText className="w-3 h-3" />
            {source.huntersReported ? "Harvest" : "Harvest totals"}: {source.confirmed ? "agency data" : "compiled agency reports"}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <BarChart3 className="w-3 h-3" />
          {source ? "Odds: estimate" : "Estimated data"}
        </span>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-card/80 transition-colors"
      >
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <span className="text-sm text-muted-foreground flex-1 space-y-1">
          <span className="block">
            <span className="text-amber-400 font-medium">Estimate</span>
            {" — draw odds, minimum points, and tag & applicant counts are modeled, not official draw results; confirm with the state agency before applying."}
          </span>
          <span className="block">
            {source ? (
              <>
                <span className="text-emerald-400 font-medium">
                  {source.huntersReported ? "Harvest & success:" : "Harvest totals:"}
                </span>
                {` ${harvestLabel(source)}, for the units that report covers.`}
                {source.huntersReported
                  ? " Other units, season and hunt-code splits, and other years are estimated."
                  : " Success rates and hunter counts, other units, season and hunt-code splits, and other years are estimated."}
              </>
            ) : (
              <>
                <span className="text-amber-400 font-medium">Harvest &amp; success:</span>
                {" estimated — modeled and, where available, calibrated to statewide agency harvest totals."}
              </>
            )}
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-3 text-xs text-muted-foreground border-t border-border/30 pt-3 space-y-2">
          <p>
            <span className="font-medium text-foreground">How these numbers are made.</span>{" "}
            Draw odds by point level, minimum points to draw, tags issued, and applicant counts on HuntScout Pro come from a statistical model. They are not published draw results from any state and can differ substantially from what an agency reports. Use them to compare and shortlist units, not as the basis for an application.
          </p>
          <p>
            Harvest and success figures use unit-level totals from state agency harvest reports where we have them (currently select species and units in Colorado, Wyoming, Idaho, Montana, and Wisconsin). Where a report gives harvest counts but not hunter numbers, success rates and hunter counts are estimated. Everything else, including how a unit&apos;s harvest is split across seasons and hunt codes, is estimated.
          </p>
          {source && !source.confirmed && (
            <p className="text-amber-400/80">
              The {source.agency} figures for this species were compiled from agency reports but have not yet been re-checked against the latest published versions.
            </p>
          )}
          {!source && species && stateHasSomeAgencyData && (
            <p>
              Agency harvest totals are available for other species in this state; this species is fully estimated.
            </p>
          )}
          <p>
            Always confirm draw results, quotas, season dates, and deadlines with {source ? source.agency : "the state wildlife agency"} before applying.
          </p>
        </div>
      )}
    </div>
  );
}
