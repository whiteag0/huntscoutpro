"use client";

import { useState } from "react";
import { Info, CheckCircle2, BarChart3, ChevronDown, ChevronUp } from "lucide-react";

interface DataDisclaimerProps {
  state?: string;
  species?: string;
  variant?: "banner" | "inline";
}

// States/species combos with real, verified data
const VERIFIED_DATA: Record<string, string[]> = {
  colorado: ["elk", "mule-deer", "pronghorn", "turkey", "moose", "bear", "sheep", "goat", "lion"],
  wyoming: ["elk", "mule-deer", "whitetail", "pronghorn", "moose"],
  idaho: ["elk"],
  montana: ["elk"],
  wisconsin: ["whitetail", "turkey", "bear"],
};

export function hasVerifiedData(stateSlug: string, species?: string): boolean {
  const verified = VERIFIED_DATA[stateSlug];
  if (!verified) return false;
  if (!species) return true; // state has some verified data
  return verified.includes(species);
}

export function DataDisclaimer({ state, species, variant = "banner" }: DataDisclaimerProps) {
  const [expanded, setExpanded] = useState(false);
  const isVerified = state ? hasVerifiedData(state, species) : false;

  if (variant === "inline") {
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
        isVerified
          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
      }`}>
        {isVerified ? (
          <>
            <CheckCircle2 className="w-3 h-3" />
            Verified Data
          </>
        ) : (
          <>
            <BarChart3 className="w-3 h-3" />
            Estimated Data
          </>
        )}
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-border/50 bg-card/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-card/80 transition-colors"
      >
        <Info className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-sm text-muted-foreground flex-1">
          {isVerified ? (
            <>
              <span className="text-emerald-400 font-medium">Verified data</span>
              {" \u2014 sourced from official state wildlife agency reports."}
            </>
          ) : (
            <>
              <span className="text-amber-400 font-medium">Estimated data</span>
              {" \u2014 modeled from historical patterns. Verify with your state wildlife agency before applying."}
            </>
          )}
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {expanded && (
        <div className="px-4 pb-3 text-xs text-muted-foreground border-t border-border/30 pt-3 space-y-2">
          <p>
            HuntScout Pro uses official harvest data where available (currently Colorado, Wyoming, Idaho, Montana, and Wisconsin for select species). For all other states and species, data is estimated using statistical models calibrated to statewide harvest reports.
          </p>
          <p>
            Estimated draw odds, success rates, and point requirements are approximations and should not be used as the sole basis for hunt application decisions. Always verify current data with your state wildlife agency.
          </p>
          {isVerified && state && (
            <p className="text-emerald-400/80">
              Sources for this data include official harvest reports from the state department of fish and wildlife/game.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
