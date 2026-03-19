"use client";

export function DrawOddsLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <span className="font-semibold text-muted-foreground">Draw Odds:</span>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full bg-success" />
        <span className="text-muted-foreground">Drawable (80%+)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full bg-warning" />
        <span className="text-muted-foreground">Competitive (20-80%)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full bg-danger" />
        <span className="text-muted-foreground">Unlikely (&lt;20%)</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-full bg-muted" />
        <span className="text-muted-foreground">No chance (0%)</span>
      </div>
    </div>
  );
}
