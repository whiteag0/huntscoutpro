import type { Metadata } from "next";
import { HuntDetail } from "@/components/planner/HuntDetail";

export const metadata: Metadata = { title: "Planned hunt | HuntScout Pro", robots: { index: false } };

/** One planned hunt: timeline, status, points, checklist, budget, notes. The hunt itself lives in the member's planner (account or browser). */
export default async function PlannedHuntPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const q = await searchParams;
  const flash = q.saved ? "saved" : q.duplicate ? "duplicate" : undefined;
  return <HuntDetail id={decodeURIComponent(id).slice(0, 64)} flash={flash} />;
}
