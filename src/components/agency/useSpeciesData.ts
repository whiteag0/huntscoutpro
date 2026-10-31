"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import type { DrawRecord, HarvestRecord } from "@/data/agency/schema";

export interface SpeciesPayload {
  harvest: HarvestRecord[];
  draw: DrawRecord[];
  /** True when the visitor isn't a member and got only a short preview. */
  preview: boolean;
  totals: { harvestRows: number; drawRows: number };
}

type Table<T> = { rows: T[]; total: number; preview: boolean };

async function loadTable<T>(state: string, species: string, kind: "draw" | "harvest", signal: AbortSignal): Promise<Table<T>> {
  const res = await fetch(`/api/agency/${state}/${species}?kind=${kind}`, { signal });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Request failed (${res.status})`);
  const body = (await res.json()) as T[] | { preview: true; rows: T[]; total: number };
  return Array.isArray(body) ? { rows: body, total: body.length, preview: false } : { rows: body.rows, total: body.total, preview: true };
}

/** Loads one state's species tables. Members get everything; others get a small preview. */
export function useSpeciesData(state: string, species: string) {
  const { data: session, status } = useSession();
  const isPro = !!session?.user?.isPro;
  const key = `${state}/${species}/${isPro ? "pro" : "free"}`;
  const [result, setResult] = useState<{ key: string; data: SpeciesPayload | null; error: string | null } | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    const ctrl = new AbortController();
    Promise.all([loadTable<DrawRecord>(state, species, "draw", ctrl.signal), loadTable<HarvestRecord>(state, species, "harvest", ctrl.signal)])
      .then(([draw, harvest]) =>
        setResult({
          key,
          data: {
            draw: draw.rows,
            harvest: harvest.rows,
            preview: draw.preview || harvest.preview,
            totals: { drawRows: draw.total, harvestRows: harvest.total },
          },
          error: null,
        })
      )
      .catch((e: Error) => {
        if (e.name !== "AbortError") setResult({ key, data: null, error: e.message });
      });
    return () => ctrl.abort();
  }, [state, species, status, key]);

  const current = result?.key === key ? result : null;
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !current };
}
