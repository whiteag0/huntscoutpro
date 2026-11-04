import { TrendingUp } from "lucide-react";
import { SPECIES_LABELS } from "@/data/types";
import type { SourceRef, SpeciesInfo } from "@/data/agency/schema";
import { fmtNum, fmtPct } from "@/lib/agency-format";
import type { TrendExample as Example } from "@/lib/unit-teaser";
import { Cite, SourceNotes, footnoteIndex } from "@/components/agency/SourceNotes";

// Server-rendered free example on /trends: one popular hunt's draw history, legible,
// with each year cited. The full trends table stays behind Pro below it.

const PREFIX = "trend-src";

export function TrendExample({
  stateName,
  agency,
  info,
  example,
  sources,
}: {
  stateName: string;
  agency: string;
  info: Pick<SpeciesInfo, "species" | "pointName">;
  example: Example;
  sources: SourceRef[];
}) {
  const label = SPECIES_LABELS[info.species].toLowerCase();
  const cited = footnoteIndex(example.points.map((p) => p.sourceId));
  const who = example.pool === "total" ? "all applicants" : example.residency === "resident" ? "residents" : "nonresidents";
  const apps = example.choice === "first" ? "first-choice applicants" : "applicants";
  const byPoints = example.metric === "points";
  const hasOdds = example.points.some((p) => p.oddsPct != null);
  // A plain point name only: some agencies' names list several kinds ("bonus point (…); preference point (…)").
  const pointName = info.pointName && !/[(;/]/.test(info.pointName) ? info.pointName : "point";
  return (
    <section aria-labelledby="trend-example" className="mt-8 bg-card border border-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center gap-2 text-primary mb-1">
        <TrendingUp className="w-4 h-4" aria-hidden />
        <span className="text-xs font-bold tracking-[0.2em]">FREE EXAMPLE</span>
      </div>
      <h2 id="trend-example" className="text-lg font-bold text-foreground">
        {byPoints ? "Point creep" : "Draw odds"}: <span className="font-mono break-all">{example.huntCode}</span>
      </h2>
      {example.description && example.description !== example.huntCode && <p className="text-sm text-muted-foreground">{example.description}</p>}
      <p className="text-sm text-muted-foreground mt-2 max-w-3xl">
        The {stateName} {label} hunt with the most {example.pool === "total" ? "" : `${example.residency} `}
        {apps} in {example.applicantsYear} ({fmtNum(example.applicants)}), among hunts with at least two years of results.{" "}
        {byPoints
          ? `The lowest ${pointName} level ${who} drew at${hasOdds ? `, and ${who}' overall odds` : ""}, as ${agency} published them.`
          : `Overall odds for ${who}, as ${agency} published them.`}
      </p>
      <table className="mt-3 w-full max-w-md text-sm tabular-nums">
        <thead className="text-muted-foreground text-xs">
          <tr>
            <th className="text-left py-1.5 pr-3">Draw year</th>
            {byPoints && <th className="text-right py-1.5 pr-3">Lowest points drawn</th>}
            {hasOdds && <th className="text-right py-1.5">Odds</th>}
          </tr>
        </thead>
        <tbody>
          {[...example.points].reverse().map((p) => (
            <tr key={p.year} className="border-t border-border">
              <td className="py-1.5 pr-3 font-semibold">
                {p.year}
                <Cite n={cited.get(p.sourceId)} prefix={PREFIX} />
              </td>
              {byPoints && <td className="py-1.5 pr-3 text-right">{p.minPoints ?? "—"}</td>}
              {hasOdds && <td className="py-1.5 text-right">{fmtPct(p.oddsPct)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-3">Past results, not a prediction. Pro shows this for every hunt, for residents and nonresidents, plus harvest success by unit.</p>
      <SourceNotes sources={sources} index={cited} title="Sources for this example" prefix={PREFIX} />
    </section>
  );
}
