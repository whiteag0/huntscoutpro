import { ExternalLink } from "lucide-react";
import type { SourceRef } from "@/data/agency/schema";
import { formatDate, sourceLabel } from "@/lib/agency-format";

/** Stable footnote numbers for the sources a view actually cites. */
export function footnoteIndex(ids: Iterable<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const id of ids) if (!m.has(id)) m.set(id, m.size + 1);
  return m;
}

export function Cite({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <a href={`#src-${n}`} className="ml-0.5 align-super text-[10px] font-semibold text-gold hover:underline" aria-label={`Source ${n}`}>
      [{n}]
    </a>
  );
}

export function SourceNotes({ sources, index, title = "Sources" }: { sources: SourceRef[]; index: Map<string, number>; title?: string }) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const list = Array.from(index.entries())
    .map(([id, n]) => ({ n, s: byId.get(id) }))
    .filter((x): x is { n: number; s: SourceRef } => !!x.s)
    .sort((a, b) => a.n - b.n);
  if (!list.length) return null;
  return (
    <section className="mt-6 text-xs text-muted-foreground" aria-label={title}>
      <h3 className="font-semibold text-foreground text-sm mb-2">{title}</h3>
      <ol className="space-y-1.5">
        {list.map(({ n, s }) => (
          <li key={s.id} id={`src-${n}`} className="flex gap-2 scroll-mt-24">
            <span className="font-semibold text-gold shrink-0">[{n}]</span>
            <span>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline inline-flex items-center gap-1">
                {sourceLabel(s)}
                <ExternalLink className="w-3 h-3" aria-hidden />
              </a>
              {" · "}
              {s.publisher}
              {s.notes ? ` · ${s.notes}` : ""}
              {` · retrieved ${formatDate(s.retrieved)}`}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
