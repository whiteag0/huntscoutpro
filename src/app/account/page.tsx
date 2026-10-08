"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { ArrowRight, Check, LogOut, Mail, Pencil, RefreshCw, User } from "lucide-react";
import { SPECIES_LABELS, type Species } from "@/data/types";
import {
  GOAL_OPTIONS,
  METHOD_OPTIONS,
  sanitizePreferences,
  type HuntingPreferences,
} from "@/lib/preferences-schema";
import { stateByAbbrev, stateBySlug } from "@/data/state-list";

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

type PrefsLoad =
  | { state: "loading" }
  | { state: "ready"; preferences: HuntingPreferences | null }
  | { state: "error" };

const RESIDENCY_LABELS: Record<string, string> = {
  resident: "Resident",
  nonresident: "Nonresident",
  both: "Resident and nonresident",
};

function stateName(slug: string) {
  return stateBySlug(slug)?.name ?? slug;
}

function labelFor(options: readonly { id: string; label: string }[], id: string) {
  return options.find((o) => o.id === id)?.label ?? id;
}

/** Plain-text rows for whatever the member has filled in. */
function preferenceRows(p: HuntingPreferences | null): { label: string; value: string }[] {
  if (!p) return [];
  const rows: { label: string; value: string }[] = [];
  if (p.states.length) rows.push({ label: "States", value: p.states.map(stateName).join(", ") });
  if (p.species.length)
    rows.push({ label: "Species", value: p.species.map((id) => SPECIES_LABELS[id as Species] ?? id).join(", ") });
  if (p.methods.length)
    rows.push({ label: "Methods", value: p.methods.map((id) => labelFor(METHOD_OPTIONS, id)).join(", ") });
  const applying = [RESIDENCY_LABELS[p.residency], p.homeState && `home state ${stateByAbbrev(p.homeState)?.name ?? p.homeState}`].filter(Boolean).join(", ");
  if (applying) rows.push({ label: "Applying as", value: applying });
  if (p.goals.length) rows.push({ label: "Goals", value: p.goals.map((id) => labelFor(GOAL_OPTIONS, id)).join(", ") });
  if (p.units) rows.push({ label: "Units", value: p.units });
  if (p.points) rows.push({ label: "Points", value: p.points });
  if (p.notes) rows.push({ label: "Notes", value: p.notes });
  return rows;
}

export default function AccountPage() {
  const { data: session, status, update } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [testStatus, setTestStatus] = useState("");
  const rechecked = useRef(false);
  const [prefs, setPrefs] = useState<PrefsLoad>({ state: "loading" });
  const isProMember = Boolean(session?.user?.isPro);

  // Load the member's saved hunting preferences (Pro only; the API 403s otherwise).
  useEffect(() => {
    if (!isProMember) return;
    let cancelled = false;
    fetch("/api/preferences", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setPrefs({ state: "ready", preferences: sanitizePreferences(data?.preferences) });
      })
      .catch(() => {
        if (!cancelled) setPrefs({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [isProMember]);

  // Re-check membership once when the account page opens. update() flips
  // status to "loading" and back, so guard against re-running.
  useEffect(() => {
    if (status === "authenticated" && !rechecked.current) {
      rechecked.current = true;
      update({ refresh: "entitlement" });
    }
  }, [status, update]);

  if (status === "loading" && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Sign in to view your account</h1>
          <button
            onClick={() => signIn("google", { callbackUrl: "/account" })}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold gradient-gold text-gold-foreground cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const { name, email, isPro, isSuperAdmin, proExpiresAt } = session.user;
  const until = formatDate(proExpiresAt);
  const prefRows = prefs.state === "ready" ? preferenceRows(prefs.preferences) : [];

  async function recheck() {
    setRefreshing(true);
    try {
      await update({ refresh: "entitlement" });
    } finally {
      setRefreshing(false);
    }
  }

  async function sendTestEmails() {
    setTestStatus("Sending\u2026");
    try {
      const res = await fetch("/api/admin/onboarding-test", { method: "POST" });
      const data = await res.json();
      setTestStatus(res.ok ? `Sent both onboarding emails to ${data.to}.` : data.error || "Failed.");
    } catch {
      setTestStatus("Failed.");
    }
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">My Account</h1>

        <section className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{name || "HuntScout member"}</p>
              <p className="text-sm text-muted-foreground truncate">{email}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            You sign in with Google. Your membership is linked to this email address.
          </p>
        </section>

        <section className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-3">Membership</h2>
          {isPro ? (
            <>
              <p className="flex items-center gap-2 text-foreground font-medium">
                <Check className="w-5 h-5 text-green-500" />
                {isSuperAdmin ? "Admin — full access" : "HuntScout Pro — active"}
              </p>
              {!isSuperAdmin && (
                <p className="text-sm text-muted-foreground mt-2">
                  {until ? `Access through ${until}. ` : ""}
                  Nothing renews automatically.
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-3 mt-5">
                <Link
                  href="/states"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
                >
                  Start researching <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/planner"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-all"
                >
                  Open Hunt Planner
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-foreground font-medium">Free account</p>
              <p className="text-sm text-muted-foreground mt-2">
                Already paid? Make sure you&apos;re signed in with the same Google account
                you used at checkout, then re-check below. If it still doesn&apos;t show,
                email us and we&apos;ll unlock it right away.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mt-5">
                <button
                  onClick={recheck}
                  disabled={refreshing}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                  Re-check membership
                </button>
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
                >
                  Get Pro — $14.99
                </Link>
              </div>
            </>
          )}
        </section>

        {isPro && (
          <section aria-labelledby="prefs-heading" className="bg-card border border-border rounded-2xl p-6">
            <h2 id="prefs-heading" className="text-lg font-bold mb-3">
              Your hunting preferences
            </h2>
            {prefs.state === "loading" ? (
              <div className="space-y-2.5" aria-busy="true" aria-label="Loading your hunting preferences">
                <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
              </div>
            ) : prefs.state === "error" ? (
              <p className="text-sm text-muted-foreground">
                We couldn&apos;t load your preferences right now. Try again in a moment.
              </p>
            ) : prefRows.length > 0 ? (
              <dl className="text-sm">
                {prefRows.map((row) => (
                  <div
                    key={row.label}
                    className="grid grid-cols-1 sm:grid-cols-[7.5rem_1fr] gap-0.5 sm:gap-3 py-2 border-t border-border first:border-t-0 first:pt-0"
                  >
                    <dt className="text-muted-foreground">{row.label}</dt>
                    <dd className="text-foreground break-words min-w-0">{row.value}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                You haven&apos;t told us what you&apos;re hunting yet. Answer a few quick
                questions so we can tailor HuntScout to your states, species, and weapons.
              </p>
            )}
            <Link
              href="/welcome"
              className="inline-flex items-center justify-center gap-2 mt-5 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-all"
            >
              <Pencil className="w-4 h-4" aria-hidden="true" />
              {prefs.state === "ready" && prefRows.length === 0
                ? "Set up my hunts"
                : "Edit preferences"}
            </Link>
          </section>
        )}

        <section className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-3">Help, receipts &amp; refunds</h2>
          <p className="text-sm text-muted-foreground">
            Questions, a copy of your receipt, or a refund within 30 days of purchase: email{" "}
            <a href="mailto:support@huntscoutpro.com" className="text-gold hover:underline">
              support@huntscoutpro.com
            </a>
            . A real person reads every message.
          </p>
          <a
            href="mailto:support@huntscoutpro.com"
            className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-gold hover:underline"
          >
            <Mail className="w-4 h-4" /> Contact support
          </a>
        </section>

        {isSuperAdmin && (
          <section className="bg-card border border-border rounded-2xl p-6">
            <h2 className="text-lg font-bold mb-2">Admin: onboarding emails</h2>
            <p className="text-sm text-muted-foreground">
              New buyers automatically get the sign-in email right away and the hunting-preferences
              email 24 hours later. Send yourself both now to check how they look.
            </p>
            <button
              onClick={sendTestEmails}
              className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-all cursor-pointer"
            >
              <Mail className="w-4 h-4" /> Send me test emails
            </button>
            {testStatus && <p className="text-sm text-muted-foreground mt-3">{testStatus}</p>}
          </section>
        )}

        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
