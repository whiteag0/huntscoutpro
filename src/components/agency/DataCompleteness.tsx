import type { CompletenessItem } from "@/lib/data-completeness";

/** "What the agency publishes" lines for a state: counts of published rows, never estimates. */
export function DataCompleteness({ items, agency, className = "" }: { items: CompletenessItem[]; agency: string; className?: string }) {
  if (!items.length) return null;
  return (
    <div className={`text-xs ${className}`}>
      <div className="font-semibold text-foreground">What {agency} publishes</div>
      <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
        {items.map((i) => (
          <div key={i.label} className="contents">
            <dt className="text-muted-foreground">{i.label}</dt>
            <dd className="text-foreground min-w-0">{i.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
