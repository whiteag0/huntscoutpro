"use client";

// What a Pro member told us, for the tools to start from: their /welcome answers
// (/api/preferences), the point balances they saved (/api/points) and, when asked
// for, the points on hunts in their planner (/api/planner). Nothing new is stored;
// these are the same records the account, shortlist and planner pages use.
// Requests are shared by the components on a page (reused for 3 s, so a change saved elsewhere shows on the next page).

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { sanitizePreferences, type HuntingPreferences } from "@/lib/preferences-schema";
import { parsePoints, serializePoints, type PointsMap } from "@/lib/points-schema";
import { plannerPoints, type PlannerPoints } from "@/lib/member-defaults";
import type { UpcomingDeadline } from "@/lib/reminders";
import type { PlannedHunt } from "@/lib/planner-schema";

export interface MemberProfile {
  preferences: HuntingPreferences | null;
  /** Saved point balances, "colorado.elk" -> 5. */
  points: PointsMap;
  /** Points entered on planner hunts (only loaded with `planner: true`). */
  planner: PlannerPoints[];
  /** The next agency deadlines for the member's states and species. */
  upcoming: UpcomingDeadline[];
  /** The personal scouting report's status, when the purchase record says. */
  report: { sentAt: string | null; pending: boolean } | null;
  /** The saved answers couldn't be loaded (the tools fall back to their usual defaults). */
  error: boolean;
}

/** none: not a Pro member (nothing to load). */
export type ProfileLoad = { status: "none" } | { status: "loading" } | { status: "ready"; profile: MemberProfile };

type Base = Omit<MemberProfile, "planner">;

const REUSE_MS = 3_000;
let baseCache: { email: string; at: number; p: Promise<Base> } | null = null;
let plannerCache: { email: string; at: number; p: Promise<PlannerPoints[]> } | null = null;

/** The tools wait for these answers before drawing their tables, so a slow lookup gives up and they use their usual defaults. */
const TIMEOUT_MS = 6_000;

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function loadBase(email: string): Promise<Base> {
  if (baseCache && baseCache.email === email && Date.now() - baseCache.at < REUSE_MS) return baseCache.p;
  const p = Promise.all([getJson("/api/preferences"), getJson("/api/points")]).then(([prefs, pts]) => ({
    preferences: sanitizePreferences(prefs?.preferences),
    // Re-parsed so a malformed answer can't put a bad value in a form field.
    points: parsePoints(serializePoints((pts?.points as PointsMap) || {})).points,
    upcoming: Array.isArray(prefs?.upcoming) ? (prefs.upcoming as UpcomingDeadline[]) : [],
    report: (prefs?.report as MemberProfile["report"]) ?? null,
    error: !prefs,
  }));
  baseCache = { email, at: Date.now(), p };
  return p;
}

function loadPlanner(email: string): Promise<PlannerPoints[]> {
  if (plannerCache && plannerCache.email === email && Date.now() - plannerCache.at < REUSE_MS) return plannerCache.p;
  const p = getJson("/api/planner").then((b) => {
    const hunts = (b?.doc as { data?: { hunts?: PlannedHunt[] } } | undefined)?.data?.hunts;
    return Array.isArray(hunts) ? plannerPoints(hunts) : [];
  });
  plannerCache = { email, at: Date.now(), p };
  return p;
}

/** The signed-in member's saved answers. `planner: true` also reads points from their planner hunts. */
export function useMemberProfile({ planner = false }: { planner?: boolean } = {}): ProfileLoad {
  const { data: session, status } = useSession();
  const email = session?.user?.isPro ? (session.user.email || "").trim().toLowerCase() || "member" : null;
  const key = email ? `${email}|${planner}` : null;
  const [result, setResult] = useState<{ key: string; profile: MemberProfile } | null>(null);

  useEffect(() => {
    if (!email || !key) return;
    let live = true;
    Promise.all([loadBase(email), planner ? loadPlanner(email) : Promise.resolve([])]).then(([base, plan]) => {
      if (live) setResult({ key, profile: { ...base, planner: plan } });
    });
    return () => {
      live = false;
    };
  }, [email, key, planner]);

  if (status === "loading" && !session) return { status: "loading" };
  if (!key) return { status: "none" };
  return result?.key === key ? { status: "ready", profile: result.profile } : { status: "loading" };
}

/** The member's answers once loaded; null while loading, for non-members, or when there are none. */
export function profileOf(load: ProfileLoad): MemberProfile | null {
  return load.status === "ready" ? load.profile : null;
}
