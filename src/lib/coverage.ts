// Client-safe summaries of which years the agency files cover, for copy that
// must not overstate coverage (e.g. "2020–2026" when most states start in 2022).

export type Span = [number, number];

export interface SpanSummary {
  /** The span the most states share (ties go to the wider, then later, span). */
  common: Span;
  /** States with exactly that span. */
  count: number;
  /** States with any years at all. */
  total: number;
  /** Earliest to latest year across every state. */
  overall: Span;
}

/** Most common per-state year span, from each state's [first, last] year. */
export function summarizeSpans(byState: Record<string, Span | null | undefined>): SpanSummary | null {
  const spans = Object.values(byState).filter((s): s is Span => !!s);
  if (!spans.length) return null;
  const counts = new Map<string, { span: Span; n: number }>();
  for (const s of spans) {
    const k = `${s[0]}-${s[1]}`;
    const cur = counts.get(k);
    if (cur) cur.n += 1;
    else counts.set(k, { span: s, n: 1 });
  }
  const best = [...counts.values()].sort((a, b) => b.n - a.n || b.span[1] - b.span[0] - (a.span[1] - a.span[0]) || b.span[1] - a.span[1])[0];
  return {
    common: best.span,
    count: best.n,
    total: spans.length,
    overall: [Math.min(...spans.map((s) => s[0])), Math.max(...spans.map((s) => s[1]))],
  };
}

export function spanText(s: Span): string {
  return s[0] === s[1] ? String(s[0]) : `${s[0]}–${s[1]}`;
}

/**
 * "10 of 14 states have draw results for 2022–2026 (2020–2026 across all states)", or
 * "every state has …" when they all match.
 */
export function coveragePhrase(kind: string, s: SpanSummary): string {
  if (s.count === s.total) return `${s.total === 1 ? "the state has" : "every state has"} ${kind} for ${spanText(s.common)}`;
  return `${s.count} of ${s.total} states have ${kind} for ${spanText(s.common)} (${spanText(s.overall)} across all states)`;
}
