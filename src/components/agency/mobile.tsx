"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, ChevronDown } from "lucide-react";

/**
 * Small building blocks for the phone layouts of the agency views.
 * Kept here (not in src/lib) because they are UI-only.
 */

/** Toggle-button style shared by the agency views. 40px tall on phones (tap target), compact from sm up. */
export const pill = (on: boolean) =>
  `inline-flex items-center justify-center min-h-10 sm:min-h-0 px-3 py-1.5 rounded-lg text-sm font-medium border transition cursor-pointer ${
    on ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/50"
  }`;

const NARROW = "(max-width: 639.98px)";

function subscribeNarrow(cb: () => void) {
  const mq = window.matchMedia(NARROW);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * True below Tailwind's `sm` breakpoint. Server render (and the first client
 * render) report false, so markup always starts as the desktop layout; the
 * agency tables only render after their data loads on the client anyway.
 */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW).matches,
    () => false
  );
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Horizontal scroller with edge fades that appear only when there is more to
 * scroll in that direction. Bleeds to the screen edge on phones so pills don't
 * look cut off by the page gutter. The selected item is scrolled into view.
 */
export function HScroll({
  children,
  className = "",
  innerProps,
}: {
  children: React.ReactNode;
  className?: string;
  innerProps?: React.HTMLAttributes<HTMLDivElement> & { role?: string };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>('[aria-selected="true"], [aria-current="page"]');
    if (active) {
      const target = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      el.scrollLeft = Math.max(0, target);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  return (
    <div className={`relative -mx-4 sm:mx-0 ${className}`}>
      <div ref={ref} onScroll={measure} {...innerProps} className={`flex gap-2 overflow-x-auto no-scrollbar px-4 sm:px-0 pb-2 ${innerProps?.className || ""}`}>
        {children}
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-background to-transparent transition-opacity ${edges.left ? "opacity-100" : "opacity-0"}`}
      />
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-background to-transparent transition-opacity ${edges.right ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

/**
 * Collapses long content to `collapsed` px with a "Show more" toggle below a
 * breakpoint (where the content stacks full width on a phone). From the
 * breakpoint up the content is always shown in full and the toggle is hidden.
 * The toggle only appears when the content is actually taller than the cap.
 */
export function ShowMore({
  children,
  collapsed = 176,
  until = "lg",
  moreLabel = "Show more",
  lessLabel = "Show less",
  className = "",
  onBackground = false,
}: {
  children: React.ReactNode;
  onBackground?: boolean;
  collapsed?: number;
  until?: "sm" | "lg";
  moreLabel?: string;
  lessLabel?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollHeight > collapsed + 32);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [collapsed]);

  const clamp = overflows && !open;
  // Literal class strings so Tailwind generates them.
  const capClass = clamp ? (until === "sm" ? "max-h-(--sm-cap) overflow-hidden sm:max-h-none sm:overflow-visible" : "max-h-(--sm-cap) overflow-hidden lg:max-h-none lg:overflow-visible") : "";
  const hideAt = until === "sm" ? "sm:hidden" : "lg:hidden";

  return (
    <div className={className}>
      <div className="relative">
        <div ref={ref} className={capClass} style={{ "--sm-cap": `${collapsed}px` } as React.CSSProperties}>
          {children}
        </div>
        {clamp && <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t ${onBackground ? "from-background" : "from-card"} to-transparent ${hideAt}`} />}
      </div>
      {overflows && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={`mt-1 -mb-2 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary cursor-pointer ${hideAt}`}
        >
          {open ? lessLabel : moreLabel}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
      )}
    </div>
  );
}

/** Sort control for the phone card lists (the desktop tables sort from their headers). */
export function MobileSort<K extends string>({
  options,
  value,
  dir,
  onChange,
}: {
  options: { key: K; label: string; asc?: string; desc?: string }[];
  value: K;
  dir: 1 | -1;
  onChange: (key: K, dir: 1 | -1) => void;
}) {
  return (
    <div className="flex items-end gap-2 mb-3">
      <label className="flex-1 text-sm">
        <span className="block text-xs font-semibold text-muted-foreground mb-1">Sort by</span>
        <select
          className="w-full min-h-10 px-2 py-1.5 border border-border rounded-lg bg-card text-base"
          value={value}
          onChange={(e) => onChange(e.target.value as K, dir)}
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => onChange(value, (-dir) as 1 | -1)}
        className="inline-flex min-h-10 items-center gap-1 px-3 border border-border rounded-lg bg-card text-sm font-medium cursor-pointer"
        aria-label={`Sort direction: ${dir === 1 ? "ascending" : "descending"}. Tap to reverse.`}
      >
        {dir === 1 ? <ArrowUp className="w-4 h-4" aria-hidden /> : <ArrowDown className="w-4 h-4" aria-hidden />}
        {(() => {
          const o = options.find((x) => x.key === value);
          return dir === 1 ? o?.asc || "Low → high" : o?.desc || "High → low";
        })()}
      </button>
    </div>
  );
}

/** Progressive rendering for long phone card lists: render `step` at a time. */
export function useProgressive(total: number, step = 40) {
  const [limit, setLimit] = useState(step);
  const shown = Math.min(limit, total);
  const more = total - shown;
  const button =
    more > 0 ? (
      <button
        type="button"
        onClick={() => setLimit((l) => l + step)}
        className="w-full min-h-11 mt-3 rounded-xl border border-border bg-card text-sm font-semibold text-primary cursor-pointer"
      >
        Show {Math.min(step, more)} more <span className="font-normal text-muted-foreground">({more} not shown yet)</span>
      </button>
    ) : null;
  return { shown, button };
}
