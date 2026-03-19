"use client";

import { useState } from "react";
import Link from "next/link";
import { HuntUnit, YearData, Residency, SEASON_LABELS, SEX_LABELS } from "@/data/types";

interface ResultRow extends HuntUnit {
  drawOdds: number;
  latestYear: YearData;
}

interface ResultsTableProps {
  units: ResultRow[];
  residency: Residency;
  points: number;
  compareList: string[];
  onToggleCompare: (huntCode: string) => void;
  stateSlug?: string;
  unitSystemName?: string;
}

type SortKey = "gmu" | "drawOdds" | "successRate" | "totalTags" | "minPoints" | "totalHarvest";

function getDrawClass(odds: number): string {
  if (odds >= 80) return "text-success font-bold";
  if (odds >= 20) return "text-warning font-bold";
  if (odds > 0) return "text-danger";
  return "text-muted-foreground";
}

function getDrawBg(odds: number): string {
  if (odds >= 80) return "bg-success/10";
  if (odds >= 20) return "bg-warning/10";
  if (odds > 0) return "bg-danger/10";
  return "";
}

export function ResultsTable({
  units,
  residency,
  points,
  compareList,
  onToggleCompare,
  stateSlug,
  unitSystemName,
}: ResultsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("drawOdds");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const gmuLabel = unitSystemName || "GMU";

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "gmu" ? "asc" : "desc");
    }
  };

  const sorted = [...units].sort((a, b) => {
    let av: number, bv: number;
    switch (sortKey) {
      case "gmu":
        av = parseInt(a.gmu.replace(/\D/g, "")) || 0;
        bv = parseInt(b.gmu.replace(/\D/g, "")) || 0;
        break;
      case "drawOdds":
        av = a.drawOdds;
        bv = b.drawOdds;
        break;
      case "successRate":
        av = a.latestYear.successRate;
        bv = b.latestYear.successRate;
        break;
      case "totalTags":
        av = a.latestYear.totalTags;
        bv = b.latestYear.totalTags;
        break;
      case "minPoints":
        av = residency === "resident" ? a.latestYear.minPointsResident : a.latestYear.minPointsNonresident;
        bv = residency === "resident" ? b.latestYear.minPointsResident : b.latestYear.minPointsNonresident;
        break;
      case "totalHarvest":
        av = a.latestYear.totalHarvest;
        bv = b.latestYear.totalHarvest;
        break;
      default:
        av = 0;
        bv = 0;
    }
    return sortDir === "asc" ? av - bv : bv - av;
  });

  const SortHeader = ({ label, sKey }: { label: string; sKey: SortKey }) => (
    <th
      className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide cursor-pointer hover:text-foreground transition select-none"
      onClick={() => handleSort(sKey)}
    >
      {label}
      {sortKey === sKey && (
        <span className="ml-1">{sortDir === "asc" ? "\u25b2" : "\u25bc"}</span>
      )}
    </th>
  );

  // Build the unit detail link
  function getUnitLink(unit: ResultRow): string {
    if (stateSlug) {
      return `/states/${stateSlug}/units/${encodeURIComponent(unit.gmu)}?species=${unit.species}`;
    }
    return `/unit?species=${unit.species}&gmu=${unit.gmu}`;
  }

  if (units.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-8 text-center text-muted-foreground">
        No units match your current filters. Try adjusting your search criteria.
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase w-10">
                <span title="Select for comparison">CMP</span>
              </th>
              <SortHeader label={gmuLabel} sKey="gmu" />
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Region
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Season
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Sex
              </th>
              <SortHeader label="Tags" sKey="totalTags" />
              <SortHeader label={`Min Pts (${residency === "resident" ? "R" : "NR"})`} sKey="minPoints" />
              <SortHeader label={`Draw % @ ${points}pts`} sKey="drawOdds" />
              <SortHeader label="Success %" sKey="successRate" />
              <SortHeader label="Harvest" sKey="totalHarvest" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((u) => {
              const minPts = residency === "resident" ? u.latestYear.minPointsResident : u.latestYear.minPointsNonresident;
              return (
                <tr
                  key={u.huntCode}
                  className={`hover:bg-muted/30 transition ${getDrawBg(u.drawOdds)}`}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={compareList.includes(u.huntCode)}
                      onChange={() => onToggleCompare(u.huntCode)}
                      className="rounded accent-primary"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-bold">
                    <Link
                      href={getUnitLink(u)}
                      className="text-primary hover:underline"
                    >
                      {u.gmu}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{u.region}</td>
                  <td className="px-3 py-2.5">{SEASON_LABELS[u.season]}</td>
                  <td className="px-3 py-2.5">{SEX_LABELS[u.sex]}</td>
                  <td className="px-3 py-2.5 font-medium">{u.latestYear.totalTags}</td>
                  <td className="px-3 py-2.5 font-medium">{minPts}</td>
                  <td className={`px-3 py-2.5 ${getDrawClass(u.drawOdds)}`}>
                    {u.drawOdds > 0 ? `${u.drawOdds}%` : "\u2014"}
                  </td>
                  <td className="px-3 py-2.5 font-medium">{u.latestYear.successRate}%</td>
                  <td className="px-3 py-2.5">{u.latestYear.totalHarvest}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="p-3 bg-muted/30 border-t border-border text-sm text-muted-foreground">
        {sorted.length} results &middot; Data based on 2020-2025 draw/harvest statistics
      </div>
    </div>
  );
}
