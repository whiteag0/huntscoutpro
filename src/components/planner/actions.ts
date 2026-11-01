"use client";

// Browser-side planner actions shared by the planner pages: calendar download
// and "check for updated dates".

import { useCallback, useEffect, useRef, useState } from "react";
import { todayIso } from "@/lib/agency-format";
import { track } from "@/lib/analytics";
import { huntEvents, plannerCalendar } from "@/lib/ics";
import type { PlannedHunt } from "@/lib/planner-schema";

function saveFile(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download an .ics of the given hunts' upcoming published dates. Returns how many events it held. */
export function downloadCalendar(hunts: readonly PlannedHunt[], scope: "planner" | "hunt", fileStem: string): number {
  const today = todayIso();
  const base = `${window.location.origin}/planner`;
  const events = hunts.reduce((n, h) => n + huntEvents(h, today, base).length, 0);
  const text = plannerCalendar(hunts, today, new Date(), base, scope === "hunt" ? `HuntScout: ${fileStem}` : "HuntScout hunt planner");
  saveFile(`${fileStem.replace(/[^A-Za-z0-9-]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "huntscout"}.ics`, text, "text/calendar;charset=utf-8");
  track("ics_download", { scope, events });
  return events;
}

export interface RefreshResult {
  updates: { id: string; changes: string[] }[];
  checked: number;
  unmatched: string[];
}

const AUTO_KEY = "huntscout-planner-auto-refresh";
const AUTO_EVERY_MS = 12 * 60 * 60 * 1000;

/**
 * "Check for updated dates": sends any waiting edit first, asks the server to
 * rebuild the agency blocks from current data, then re-reads the account copy.
 * With `auto`, runs once on load when the last automatic check was 12+ hours ago.
 */
export function usePlannerRefresh(opts: {
  enabled: boolean;
  hunts: readonly PlannedHunt[] | null;
  flush: () => Promise<void>;
  reload: () => Promise<void>;
  auto?: boolean;
}) {
  const { enabled, hunts, flush, reload, auto } = opts;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  const run = useCallback(
    async (ids?: string[], isAuto = false): Promise<RefreshResult | null> => {
      if (!enabled) return null;
      setBusy(true);
      setError(null);
      try {
        await flush();
        const res = await fetch("/api/planner/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { ids } : {}) });
        const body = (await res.json().catch(() => ({}))) as Partial<RefreshResult> & { error?: string };
        if (!res.ok) {
          if (!isAuto) setError(body.error || "Couldn't check for updated dates. Try again.");
          return null;
        }
        const r: RefreshResult = { updates: body.updates || [], checked: body.checked || 0, unmatched: body.unmatched || [] };
        if (r.updates.length) await reload();
        track("planner_refresh", { auto: isAuto, hunts: r.checked, updated: r.updates.length });
        if (!isAuto || r.updates.length) setResult(r);
        return r;
      } catch {
        if (!isAuto) setError("You're offline or the site couldn't be reached.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [enabled, flush, reload]
  );

  useEffect(() => {
    if (!auto || !enabled || ran.current || !hunts || !hunts.some((h) => h.agency)) return;
    ran.current = true;
    let last = 0;
    try {
      last = Number(localStorage.getItem(AUTO_KEY) || 0);
    } catch {
      // storage blocked: check this once anyway
    }
    if (Date.now() - last < AUTO_EVERY_MS) return;
    try {
      localStorage.setItem(AUTO_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    void run(undefined, true);
  }, [auto, enabled, hunts, run]);

  return { run, busy, result, error, clear: () => (setResult(null), setError(null)) };
}
