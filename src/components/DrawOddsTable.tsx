"use client";

import { YearData, Residency } from "@/data/types";

interface DrawOddsTableProps {
  latestYear: YearData;
  residency: Residency;
  userPoints: number;
}

export function DrawOddsTable({ latestYear, residency, userPoints }: DrawOddsTableProps) {
  const odds = latestYear.drawOddsByPoint;
  const pointLevels = Object.keys(odds)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((p) => {
      const val = residency === "resident" ? odds[p].resident : odds[p].nonresident;
      // Show points around the action zone plus always show 0 and user's points
      return p === 0 || p === userPoints || val > 0 || p <= 15;
    });

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <h3 className="font-bold text-foreground mb-4">
        Draw Odds by Point Level ({residency === "resident" ? "Resident" : "Non-Resident"}) — {latestYear.year}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Points</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Draw %</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase">Visual</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pointLevels.map((p) => {
              const val = residency === "resident" ? odds[p].resident : odds[p].nonresident;
              const isUser = p === userPoints;
              const barColor = val >= 80 ? "bg-success" : val >= 20 ? "bg-warning" : val > 0 ? "bg-danger" : "bg-muted";
              return (
                <tr
                  key={p}
                  className={`${isUser ? "bg-accent/10 font-bold" : ""}`}
                >
                  <td className="px-3 py-2">
                    {p} pts{isUser && " ← You"}
                  </td>
                  <td className="px-3 py-2">
                    {val > 0 ? `${val}%` : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <div className="w-full bg-muted/50 rounded-full h-4 overflow-hidden">
                      <div
                        className={`h-4 rounded-full ${barColor} transition-all`}
                        style={{ width: `${Math.max(val > 0 ? 2 : 0, val)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        Tags available: {latestYear.totalTags} &middot; Total applicants: {latestYear.totalApplicants}
      </div>
    </div>
  );
}
