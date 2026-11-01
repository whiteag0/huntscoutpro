"use client";

// Browser-side index of which agency hunts are already in the member's planner,
// shared by every "Add to my planner" button on a page, plus the one toast
// those buttons report to.

import { useEffect, useSyncExternalStore } from "react";
import type { DrawRecord, SpeciesInfo } from "@/data/agency/schema";
import { todayIso } from "@/lib/agency-format";
import { nextApplicationDeadline } from "@/lib/planner-agency";
import type { PlannedHunt, PlannerResidency } from "@/lib/planner-schema";

interface Entry {
  slug: string;
  code: string;
  cycle: number | null;
}

interface IndexState {
  status: "idle" | "loading" | "ready" | "error";
  entries: Entry[];
  /** "slug|CODE" currently being added. */
  adding: string[];
}

export interface Toast {
  id: number;
  kind: "success" | "info" | "error";
  message: string;
  /** Show the "Open planner" link. */
  link: boolean;
}

let index: IndexState = { status: "idle", entries: [], adding: [] };
let toast: Toast | null = null;
let loadedAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function setIndex(next: Partial<IndexState>) {
  index = { ...index, ...next };
  emit();
}

const codeKey = (slug: string, code: string) => `${slug}|${code.trim().toUpperCase()}`;
const toEntry = (h: PlannedHunt): Entry | null =>
  h.agency ? { slug: h.agency.stateSlug, code: h.agency.huntCode.trim().toUpperCase(), cycle: h.agency.deadline?.cycle ?? null } : null;

let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function showToast(kind: Toast["kind"], message: string, link = false) {
  toast = { id: Date.now(), kind, message, link };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = null;
    emit();
  }, kind === "error" ? 9000 : 6000);
  emit();
}
export function dismissToast() {
  toast = null;
  emit();
}

/** The planner was saved elsewhere on this page's session: reload the index the next time a button mounts. */
export function invalidatePlannerIndex() {
  loadedAt = 0;
}

/** (Re)load the index from the account. Cheap no-op when loaded in the last 30 s. */
export function refreshPlannerIndex(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && index.status === "ready" && Date.now() - loadedAt < 30_000) return Promise.resolve();
  if (index.status !== "ready") setIndex({ status: "loading" });
  inflight = fetch("/api/planner", { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { doc?: { data?: { hunts?: PlannedHunt[] } } };
      const entries = (body.doc?.data?.hunts || []).map(toEntry).filter((e): e is Entry => !!e);
      loadedAt = Date.now();
      setIndex({ status: "ready", entries });
    })
    .catch(() => setIndex({ status: index.status === "ready" ? "ready" : "error" }))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** The planning cycle an add would get: the agency's next application date for this species/residency. */
export function plannedCycle(info: Pick<SpeciesInfo, "keyDates">, residency: PlannerResidency, row: Pick<DrawRecord, "description" | "seasonDates">): number | null {
  return nextApplicationDeadline(info, residency, todayIso(), row.description, row.seasonDates)?.cycle ?? null;
}

/** Same rule as sameAgencyHunt(): same state + hunt code, and the same cycle when both are known. */
function hasEntry(slug: string, code: string, cycle: number | null): boolean {
  const c = code.trim().toUpperCase();
  return index.entries.some((e) => e.slug === slug && e.code === c && (e.cycle === null || cycle === null || e.cycle === cycle));
}

export function usePlannerIndex(enabled: boolean) {
  useEffect(() => {
    if (enabled) void refreshPlannerIndex();
  }, [enabled]);
  return useSyncExternalStore(subscribe, () => index, () => index);
}

export function useToast() {
  return useSyncExternalStore(subscribe, () => toast, () => null);
}

export function plannerState(slug: string, code: string, cycle: number | null): "in" | "adding" | "out" {
  if (index.adding.includes(codeKey(slug, code))) return "adding";
  return hasEntry(slug, code, cycle) ? "in" : "out";
}

/** Add a hunt from a draw row. Reports the outcome in the toast. */
export async function addToPlanner(opts: { slug: string; stateName: string; info: SpeciesInfo; row: DrawRecord; residency: PlannerResidency }) {
  const { slug, stateName, info, row, residency } = opts;
  const k = codeKey(slug, row.huntCode);
  if (index.adding.includes(k)) return;
  setIndex({ adding: [...index.adding, k] });
  try {
    const res = await fetch("/api/planner/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: slug, species: info.species, residency, row }),
    });
    const body = (await res.json().catch(() => ({}))) as { status?: string; hunt?: PlannedHunt; error?: string };
    if (!res.ok) {
      const msg =
        res.status === 401
          ? "Sign in to add hunts to your planner."
          : res.status === 403
            ? "Saving hunts to your planner is part of Pro."
            : body.error || "Couldn't add to your planner. Try again.";
      showToast("error", msg);
      return;
    }
    const entry = body.hunt ? toEntry(body.hunt) : null;
    if (entry && !hasEntry(entry.slug, entry.code, entry.cycle)) setIndex({ entries: [...index.entries, entry] });
    const d = body.hunt?.agency?.deadline;
    if (body.status === "duplicate") {
      showToast("info", `${row.huntCode} is already in your planner.`, true);
    } else {
      showToast(
        "success",
        `Added ${stateName} ${row.huntCode} to your planner${d ? `, with the ${body.hunt?.agency?.agencyShortName || "agency"} ${d.cycle} application date.` : ". No upcoming agency application date in our data matches it yet."}`,
        true
      );
    }
  } catch {
    showToast("error", "You're offline or the site couldn't be reached. Nothing was added.");
  } finally {
    setIndex({ adding: index.adding.filter((x) => x !== k) });
  }
}
