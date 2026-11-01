"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CalendarCheck, CalendarPlus, CheckCircle2, Info, Loader2, TriangleAlert, X } from "lucide-react";
import type { DrawRecord, SpeciesInfo } from "@/data/agency/schema";
import type { PlannerResidency } from "@/lib/planner-schema";
import { addToPlanner, dismissToast, plannedCycle, plannerState, usePlannerIndex, useToast } from "@/components/planner/plannerIndex";

/**
 * "Add to my planner" for one agency draw row. Members only (the agency tables
 * are behind the Pro gate); the server fills in the agency's application date
 * and fees. `variant="card"` is the 40px-tall phone version.
 */
export function AddToPlannerButton({
  slug,
  stateName,
  info,
  row,
  residency,
  variant = "inline",
}: {
  slug: string;
  stateName: string;
  info: SpeciesInfo;
  row: DrawRecord;
  residency: PlannerResidency;
  variant?: "inline" | "card";
}) {
  const { data: session } = useSession();
  const isPro = !!session?.user?.isPro;
  usePlannerIndex(isPro);
  const state = plannerState(slug, row.huntCode, plannedCycle(info, residency, row));

  const base =
    variant === "card"
      ? "inline-flex min-h-10 items-center gap-1.5 px-3 rounded-lg border text-sm font-semibold"
      : "inline-flex min-h-8 items-center gap-1 -ml-1.5 px-1.5 rounded-md text-xs font-semibold";

  if (state === "in") {
    return (
      <Link
        href="/planner"
        className={`${base} ${variant === "card" ? "border-success/40 bg-success/10" : ""} text-success hover:underline`}
        aria-label={`${row.huntCode} is in your planner. Open planner`}
      >
        <CalendarCheck className="w-4 h-4 shrink-0" aria-hidden />
        In your planner
      </Link>
    );
  }
  const busy = state === "adding";
  return (
    <button
      type="button"
      disabled={busy || !isPro}
      onClick={() => addToPlanner({ slug, stateName, info, row, residency })}
      aria-label={`Add ${row.huntCode} (${residency}) to my planner`}
      className={`${base} ${variant === "card" ? "border-primary/40 bg-card" : ""} text-primary hover:bg-primary/10 cursor-pointer disabled:cursor-default disabled:opacity-60`}
    >
      {busy ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden /> : <CalendarPlus className="w-4 h-4 shrink-0" aria-hidden />}
      {busy ? "Adding…" : "Add to my planner"}
    </button>
  );
}

// Only the first mounted toaster renders, so a page can include several safely.
const toasters: string[] = [];
const toasterListeners = new Set<() => void>();
function useFirstToaster(id: string) {
  useEffect(() => {
    toasters.push(id);
    toasterListeners.forEach((l) => l());
    return () => {
      toasters.splice(toasters.indexOf(id), 1);
      toasterListeners.forEach((l) => l());
    };
  }, [id]);
  return useSyncExternalStore(
    (l) => {
      toasterListeners.add(l);
      return () => toasterListeners.delete(l);
    },
    () => toasters[0] === id,
    () => false
  );
}

/** Live region + toast for planner adds. Mount once near the buttons. */
export function PlannerToaster() {
  const id = useId();
  const first = useFirstToaster(id);
  const toast = useToast();
  // The live region stays in the DOM before the first message so screen readers announce it.
  if (!first) return null;
  const Icon = toast?.kind === "error" ? TriangleAlert : toast?.kind === "info" ? Info : CheckCircle2;
  return (
    <div className="fixed inset-x-0 bottom-20 sm:bottom-4 z-50 flex justify-center px-4 pointer-events-none" role="status" aria-live="polite">
      {toast && (
        <div
          key={toast.id}
          className={`pointer-events-auto w-full max-w-md flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg bg-card text-sm animate-fade-in-up ${
            toast.kind === "error" ? "border-danger/40" : "border-border"
          }`}
        >
          <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${toast.kind === "error" ? "text-danger" : toast.kind === "info" ? "text-primary" : "text-success"}`} aria-hidden />
          <div className="flex-1 min-w-0">
            <p className="text-foreground">{toast.message}</p>
            {toast.link && (
              <Link href="/planner" className="inline-flex min-h-8 items-center font-semibold text-primary hover:underline">
                Open planner
              </Link>
            )}
          </div>
          <button type="button" onClick={dismissToast} className="-m-1.5 p-2 rounded-md text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Dismiss">
            <X className="w-4 h-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
