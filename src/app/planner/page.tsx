"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { CalendarArrowDown, ChevronRight, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { DemoGate } from "@/components/DemoGate";
import { formatDate, todayIso } from "@/lib/agency-format";
import { sanitizePlannerData, type BudgetItem, type ChecklistItem, type HuntStatus, type PlannedHunt, type PlannerData } from "@/lib/planner-schema";
import { countdown, cycleInfo, huntSteps, huntTimeline, nextForHunt, upcomingDeadlines, type TimelineItem } from "@/lib/planner-timeline";
import { usePlannerSync } from "@/components/planner/usePlannerSync";
import { downloadCalendar, usePlannerRefresh } from "@/components/planner/actions";
import { BUDGET_CATEGORIES, CHECKLIST_CATEGORIES, generateId } from "@/components/planner/defaults";
import { CycleBadge, STATUS_LABELS, STATUS_PILL, SourceLink, SyncBadge, TONE_CLASS, UpcomingStrip, dateRange, huntTitle } from "@/components/planner/PlannerParts";

const inputCls =
  "w-full min-h-10 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-base sm:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40";
const headerBtn = "inline-flex min-h-11 items-center gap-1.5 px-4 py-2 rounded-lg border border-white/20 text-white/90 text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-60";

/** Planner home sections, in pipeline order. */
const GROUPS: { key: string; label: string; statuses: HuntStatus[] }[] = [
  { key: "planning", label: "Planning", statuses: ["planning"] },
  { key: "applied", label: "Applied", statuses: ["applied"] },
  { key: "drawn", label: "Drawn or alternate", statuses: ["drawn", "alternate"] },
  { key: "tag", label: "Tag purchased", statuses: ["tag-purchased"] },
  { key: "not-drawn", label: "Not drawn", statuses: ["not-drawn"] },
  { key: "hunted", label: "Hunted", statuses: ["hunted"] },
];
const STATUS_ORDER: HuntStatus[] = ["planning", "applied", "drawn", "alternate", "not-drawn", "tag-purchased", "hunted"];

export default function PlannerPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { data, status, update, retry, flush, reload, notice, dismissNotice, account } = usePlannerSync({
    ready: sessionStatus !== "loading",
    email: session?.user?.email?.trim().toLowerCase() || null,
    isPro: !!session?.user?.isPro,
  });
  const today = todayIso();
  const refresh = usePlannerRefresh({ enabled: account && status.kind !== "loading", hunts: data?.hunts ?? null, flush, reload, auto: true });

  const [activeTab, setActiveTab] = useState<"hunts" | "dates" | "budget" | "gear">("hunts");

  // Budget form
  const [budgetHunt, setBudgetHunt] = useState("");
  const [budgetCategory, setBudgetCategory] = useState(BUDGET_CATEGORIES[0]);
  const [budgetDesc, setBudgetDesc] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");

  // Checklist custom item
  const [customCategory, setCustomCategory] = useState(CHECKLIST_CATEGORIES[0]);
  const [customLabel, setCustomLabel] = useState("");

  const hunts = useMemo(() => data?.hunts ?? [], [data]);
  const budget = useMemo(() => data?.budget ?? [], [data]);
  const checklist = useMemo(() => data?.checklist ?? [], [data]);

  const upcoming = useMemo(() => upcomingDeadlines(hunts, today), [hunts, today]);
  const budgetTotal = useMemo(() => budget.reduce((sum, b) => sum + b.amount, 0), [budget]);
  const budgetByHunt = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of budget) {
      const key = b.huntId || "general";
      map[key] = (map[key] || 0) + b.amount;
    }
    return map;
  }, [budget]);
  const checklistByCategory = useMemo(() => {
    const map: Record<string, ChecklistItem[]> = {};
    for (const item of checklist) (map[item.category] ||= []).push(item);
    return map;
  }, [checklist]);
  const allDates = useMemo(() => {
    const items = hunts.flatMap((h) => huntTimeline(h, today)).filter((t) => t.end >= today && t.published && (t.kind !== "season" || t.scope !== "statewide"));
    return items.sort((x, y) => (x.start || x.end).localeCompare(y.start || y.end) || x.huntId.localeCompare(y.huntId));
  }, [hunts, today]);

  const stamp = () => new Date().toISOString();
  const tombstone = (d: PlannerData, ids: string[]) => [...d.deleted, ...ids].slice(-600);
  const patchHunt = (id: string, patch: Partial<PlannedHunt>) =>
    update((prev) => ({ ...prev, hunts: prev.hunts.map((h) => (h.id === id ? { ...h, ...patch, updatedAt: stamp() } : h)) }));

  // --- Budget ---

  function addBudgetItem() {
    if (!budgetDesc || !budgetAmount) return;
    const item: BudgetItem = {
      id: generateId(),
      huntId: budgetHunt,
      category: budgetCategory,
      description: budgetDesc,
      amount: parseFloat(budgetAmount) || 0,
    };
    update((prev) => ({ ...prev, budget: [...prev.budget, item] }));
    setBudgetDesc("");
    setBudgetAmount("");
  }

  function removeBudgetItem(id: string) {
    update((prev) => ({ ...prev, budget: prev.budget.filter((b) => b.id !== id), deleted: tombstone(prev, [id]) }));
  }

  // --- Checklist ---

  function toggleChecklist(id: string) {
    update((prev) => ({ ...prev, checklist: prev.checklist.map((c) => (c.id === id ? { ...c, checked: !c.checked } : c)) }));
  }

  function addCustomChecklistItem() {
    if (!customLabel.trim()) return;
    const item: ChecklistItem = { id: generateId(), category: customCategory, label: customLabel.trim(), checked: false, custom: true };
    update((prev) => ({ ...prev, checklist: [...prev.checklist, item] }));
    setCustomLabel("");
  }

  function removeChecklistItem(id: string) {
    update((prev) => ({ ...prev, checklist: prev.checklist.filter((c) => c.id !== id), deleted: tombstone(prev, [id]) }));
  }

  // --- Export/Import ---

  function exportData() {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `huntscout-planner-${today}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        let imported: PlannerData | null = null;
        try {
          imported = sanitizePlannerData(JSON.parse(reader.result as string));
        } catch {
          imported = null;
        }
        if (!imported) {
          alert("That file isn't a HuntScout planner export.");
          return;
        }
        const next = imported;
        // The import replaces the planner; anything not in the file counts as removed.
        update((prev) => {
          const keep = new Set([...next.hunts, ...next.budget, ...next.checklist].map((x) => x.id));
          const removed = [...prev.hunts, ...prev.budget, ...prev.checklist].map((x) => x.id).filter((x) => !keep.has(x));
          return { ...next, deleted: [...prev.deleted, ...next.deleted, ...removed].filter((x) => !keep.has(x)).slice(-600) };
        });
      };
      reader.readAsText(file);
    };
    input.click();
  }

  const plannerPreview = (
    <div className="bg-background">
      <section className="bg-gradient-to-br from-[#1a3a1a] via-[#0f2a0f] to-[#1c1917] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Hunt Planner</h1>
          <p className="text-white/60 max-w-xl">
            Plan a hunt in a few taps: pick the state, species and hunt, and the planner brings together the agency&apos;s application dates, season dates, fees and
            last draw results, sorts every deadline, exports them to your calendar and saves to your account.
          </p>
        </div>
      </section>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Example plan (sample entries, not real deadlines)</p>
        <div className="space-y-3">
          {[
            { state: "Colorado", species: "Elk", unit: "61", status: "Applied", color: "bg-amber-100 text-amber-800 border-amber-300" },
            { state: "Montana", species: "Mule Deer", unit: "270", status: "Planning", color: "bg-blue-100 text-blue-800 border-blue-300" },
            { state: "Wyoming", species: "Pronghorn", unit: "66", status: "Drawn", color: "bg-green-100 text-green-800 border-green-300" },
          ].map((hunt) => (
            <div key={hunt.unit} className="border border-border rounded-xl p-4 bg-card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-foreground">
                  {hunt.state} - Unit {hunt.unit}
                </div>
                <div className="text-sm text-muted-foreground">{hunt.species}</div>
              </div>
              <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${hunt.color}`}>{hunt.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse-soft">Loading planner...</div>
      </div>
    );
  }

  const byId = new Map(hunts.map((h) => [h.id, h] as const));

  return (
    <div className="min-h-screen bg-background">
      <DemoGate feature="the Hunt Planner" preview={plannerPreview}>
        {/* Header */}
        <section className="bg-gradient-to-br from-[#1a3a1a] via-[#0f2a0f] to-[#1c1917] text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
            <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between gap-5">
              <div className="min-w-0">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">Hunt Planner</h1>
                <p className="text-white/60 max-w-xl">
                  {account
                    ? "Saved to your HuntScout account, so it's on every device you sign in on. A copy stays on this device for when you're offline."
                    : "Organize your applications and hunts in one place. Everything saves automatically to your browser."}
                </p>
                <div className="mt-3">
                  <SyncBadge status={status} onRetry={retry} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/planner/new?from=planner"
                  className="inline-flex min-h-11 items-center gap-1.5 px-5 py-2 rounded-lg bg-gold text-gold-foreground text-sm font-bold hover:brightness-105 transition"
                >
                  <Plus className="w-4 h-4" aria-hidden /> Plan a hunt
                </Link>
                {account && hunts.some((h) => h.agency) && (
                  <button type="button" onClick={() => void refresh.run()} disabled={refresh.busy} className={headerBtn}>
                    {refresh.busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
                    {refresh.busy ? "Checking…" : "Check for updated dates"}
                  </button>
                )}
                {hunts.length > 0 && (
                  <button type="button" onClick={() => downloadCalendar(hunts, "planner", "huntscout-planner")} className={headerBtn}>
                    <CalendarArrowDown className="w-4 h-4" aria-hidden /> Calendar (.ics)
                  </button>
                )}
                <button onClick={exportData} className={headerBtn}>
                  Export
                </button>
                <button onClick={importData} className={headerBtn}>
                  Import
                </button>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {notice && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-foreground" role="status">
              <p className="flex-1">{notice}</p>
              <button type="button" onClick={dismissNotice} className="-m-1.5 p-2 rounded-md text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Dismiss">
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>
          )}
          {(refresh.result || refresh.error) && (
            <div
              className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm text-foreground ${refresh.error ? "border-danger/40 bg-danger/5" : "border-success/40 bg-success/10"}`}
              role="status"
            >
              <div className="flex-1 min-w-0">
                {refresh.error ? (
                  refresh.error
                ) : refresh.result!.updates.length ? (
                  <>
                    <p className="font-semibold">
                      Updated dates for {refresh.result!.updates.length} hunt{refresh.result!.updates.length === 1 ? "" : "s"}. Your status, notes, points and own dates weren&apos;t changed.
                    </p>
                    <ul className="mt-2 space-y-2">
                      {refresh.result!.updates.map((u) => {
                        const h = byId.get(u.id);
                        if (!h) return null;
                        return (
                          <li key={u.id}>
                            <Link href={`/planner/hunt/${u.id}`} className="font-semibold text-primary hover:underline">
                              {huntTitle(h)}
                            </Link>
                            <span className="text-muted-foreground"> · updated dates from {h.agency?.agencyShortName || h.agency?.agencyName}</span>
                            <ul className="list-disc pl-5 text-foreground">
                              {u.changes.slice(0, 6).map((c) => (
                                <li key={c} className="break-words">
                                  {c}
                                </li>
                              ))}
                              {u.changes.length > 6 && <li>and {u.changes.length - 6} more</li>}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  `Checked ${refresh.result!.checked} hunt${refresh.result!.checked === 1 ? "" : "s"} against current agency data: nothing has changed.`
                )}
                {!refresh.error && refresh.result!.unmatched.length > 0 && (
                  <p className="mt-2 text-muted-foreground">
                    Not in the agency&apos;s latest draw data, so kept as saved (the hunt may have been dropped or renumbered):{" "}
                    {refresh.result!.unmatched
                      .map((id) => byId.get(id))
                      .filter((h): h is PlannedHunt => !!h)
                      .map((h) => huntTitle(h))
                      .join(", ")}
                    .
                  </p>
                )}
              </div>
              <button type="button" onClick={refresh.clear} className="-m-1.5 p-2 rounded-md text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Dismiss">
                <X className="w-4 h-4" aria-hidden />
              </button>
            </div>
          )}

          <UpcomingStrip items={upcoming} hunts={hunts} today={today} />

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto no-scrollbar" role="tablist" aria-label="Planner sections">
            {(
              [
                { key: "hunts", label: "My Hunts", count: hunts.length },
                { key: "dates", label: "All dates", count: allDates.length },
                { key: "budget", label: "Budget", count: budget.length },
                { key: "gear", label: "Gear", count: checklist.filter((c) => c.checked).length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                role="tab"
                id={`tab-${tab.key}`}
                aria-selected={activeTab === tab.key}
                aria-controls={`panel-${tab.key}`}
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-11 px-3 sm:px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {tab.label}
                {tab.count > 0 && <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs bg-muted">{tab.count}</span>}
              </button>
            ))}
          </div>

          {/* ── Hunts Tab ── */}
          {activeTab === "hunts" && (
            <div id="panel-hunts" role="tabpanel" aria-labelledby="tab-hunts" className="space-y-8">
              {hunts.length === 0 ? (
                <div className="text-center py-14 px-4 bg-card border border-border rounded-xl">
                  <h2 className="text-lg font-bold text-foreground mb-2">No hunts planned yet</h2>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Pick a state, species and hunt. We&apos;ll bring in the agency&apos;s application dates, season dates, fees and last draw results.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link
                      href="/planner/new?from=empty"
                      className="inline-flex min-h-11 items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-light transition-colors"
                    >
                      <Plus className="w-4 h-4" aria-hidden /> Plan your first hunt
                    </Link>
                    <Link href="/states" className="inline-flex min-h-11 items-center px-5 py-2.5 rounded-lg border-2 border-primary text-primary font-semibold hover:bg-primary hover:text-primary-foreground transition-colors">
                      Browse draw tables
                    </Link>
                  </div>
                </div>
              ) : (
                GROUPS.map((g) => {
                  const list = hunts
                    .filter((h) => g.statuses.includes(h.status))
                    .map((h) => ({ h, next: nextForHunt(h, today) }))
                    .sort((x, y) => (x.next?.end || "9999").localeCompare(y.next?.end || "9999") || huntTitle(x.h).localeCompare(huntTitle(y.h)));
                  if (!list.length) return null;
                  return (
                    <section key={g.key} aria-labelledby={`group-${g.key}`}>
                      <h2 id={`group-${g.key}`} className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
                        {g.label} <span className="font-normal">({list.length})</span>
                      </h2>
                      <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {list.map(({ h, next }) => (
                          <li key={h.id}>
                            <HuntCard hunt={h} next={next} today={today} budget={budgetByHunt[h.id]} onStatus={(s) => patchHunt(h.id, { status: s })} />
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })
              )}
            </div>
          )}

          {/* ── All dates Tab ── */}
          {activeTab === "dates" && (
            <div id="panel-dates" role="tabpanel" aria-labelledby="tab-dates" className="space-y-4">
              <h2 className="text-xl font-bold text-foreground">Every upcoming date</h2>
              <p className="text-sm text-muted-foreground -mt-2">Published agency dates for the cycle you&apos;re planning, hunt-specific season dates, and your own dates.</p>
              <AllDates items={allDates} byId={byId} today={today} />
            </div>
          )}

          {/* ── Budget Tab ── */}
          {activeTab === "budget" && (
            <div id="panel-budget" role="tabpanel" aria-labelledby="tab-budget" className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-foreground">Budget</h2>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
                  <div className="text-2xl font-bold text-foreground tabular-nums">${budgetTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
                </div>
              </div>
              {hunts.some((h) => h.agency?.fees.length) && (
                <p className="text-sm text-muted-foreground -mt-3">Agency fees for each hunt are on its page (open it from My Hunts); add the ones that apply to you with one tap.</p>
              )}

              <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
                <h3 className="font-bold text-foreground mb-3 text-sm">Add expense</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <select value={budgetHunt} onChange={(e) => setBudgetHunt(e.target.value)} aria-label="Hunt" className={inputCls}>
                    <option value="">General</option>
                    {hunts.map((h) => (
                      <option key={h.id} value={h.id}>
                        {huntTitle(h)}
                      </option>
                    ))}
                  </select>
                  <select value={budgetCategory} onChange={(e) => setBudgetCategory(e.target.value)} aria-label="Category" className={inputCls}>
                    {BUDGET_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input type="text" value={budgetDesc} onChange={(e) => setBudgetDesc(e.target.value)} placeholder="Description" aria-label="Description" className={inputCls} />
                  <input
                    type="number"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="$0.00"
                    aria-label="Amount in dollars"
                    min={0}
                    step={0.01}
                    className={inputCls}
                  />
                  <button
                    onClick={addBudgetItem}
                    disabled={!budgetDesc || !budgetAmount}
                    className="min-h-10 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>

              {budget.length > 0 ? (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <div className="col-span-3">Hunt</div>
                    <div className="col-span-2">Category</div>
                    <div className="col-span-4">Description</div>
                    <div className="col-span-2 text-right">Amount</div>
                    <div className="col-span-1" />
                  </div>
                  <div className="divide-y divide-border">
                    {budget.map((item) => {
                      const hunt = hunts.find((h) => h.id === item.huntId);
                      return (
                        <div key={item.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-12 gap-x-3 gap-y-1 sm:gap-4 px-4 sm:px-5 py-3 items-center hover:bg-muted/20 transition-colors">
                          <div className="sm:col-span-3 text-sm text-foreground break-words">{hunt ? huntTitle(hunt) : "General"}</div>
                          <div className="sm:col-span-2 text-xs text-muted-foreground order-3 sm:order-none">{item.category}</div>
                          <div className="sm:col-span-4 text-sm text-foreground break-words order-4 sm:order-none col-span-2 sm:col-span-4">
                            {item.description}
                            {item.sourceUrl && (
                              <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-1 text-xs text-primary hover:underline">
                                agency fee table<span className="sr-only"> (opens in a new tab)</span>
                              </a>
                            )}
                          </div>
                          <div className="sm:col-span-2 text-sm font-semibold text-foreground text-right tabular-nums order-2 sm:order-none">
                            ${item.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className="sm:col-span-1 flex justify-end order-5 sm:order-none">
                            <button
                              onClick={() => removeBudgetItem(item.id)}
                              className="p-2.5 -m-1.5 rounded text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                              aria-label={`Remove ${item.description}`}
                            >
                              <X className="w-4 h-4" aria-hidden />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-5 py-3 bg-muted/30 border-t border-border flex justify-between items-center">
                    <span className="text-sm font-semibold text-muted-foreground">Total</span>
                    <span className="text-lg font-bold text-foreground tabular-nums">
                      ${budgetTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 px-4 bg-card border border-border rounded-xl">
                  <p className="text-muted-foreground">No expenses yet. Add agency fees from a hunt&apos;s page, or your own costs above.</p>
                </div>
              )}

              {Object.keys(budgetByHunt).length > 1 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="font-bold text-foreground mb-3 text-sm">Per-hunt breakdown</h3>
                  <div className="space-y-2">
                    {Object.entries(budgetByHunt).map(([huntId, total]) => {
                      const hunt = hunts.find((h) => h.id === huntId);
                      return (
                        <div key={huntId} className="flex justify-between items-center gap-3 text-sm">
                          <span className="text-muted-foreground break-words min-w-0">{hunt ? huntTitle(hunt) : "General"}</span>
                          <span className="font-semibold text-foreground tabular-nums">${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Gear Checklist Tab ── */}
          {activeTab === "gear" && (
            <div id="panel-gear" role="tabpanel" aria-labelledby="tab-gear" className="space-y-6">
              <h2 className="text-xl font-bold text-foreground">Gear checklist</h2>
              <div className="bg-card border border-border rounded-xl p-4 sm:p-5">
                <h3 className="font-bold text-foreground mb-3 text-sm">Add custom item</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                  <select value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} aria-label="Category" className={`${inputCls} sm:w-auto`}>
                    {CHECKLIST_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomChecklistItem()}
                    placeholder="Item name..."
                    aria-label="Item name"
                    className={`${inputCls} flex-1`}
                  />
                  <button
                    onClick={addCustomChecklistItem}
                    disabled={!customLabel.trim()}
                    className="min-h-10 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Add item
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[...CHECKLIST_CATEGORIES, ...Object.keys(checklistByCategory).filter((c) => !CHECKLIST_CATEGORIES.includes(c))].map((category) => {
                  const items = checklistByCategory[category] || [];
                  if (items.length === 0) return null;
                  const checkedCount = items.filter((i) => i.checked).length;
                  const progress = Math.round((checkedCount / items.length) * 100);
                  return (
                    <div key={category} className="bg-card border border-border rounded-xl overflow-hidden">
                      <div className="px-5 py-3 bg-muted/50 border-b border-border">
                        <div className="flex items-center justify-between mb-1.5">
                          <h3 className="font-bold text-foreground text-sm">{category}</h3>
                          <span className="text-xs text-muted-foreground">
                            {checkedCount}/{items.length}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden" aria-hidden>
                          <div className={`h-full rounded-full transition-all duration-300 ${progress === 100 ? "bg-success" : "bg-primary"}`} style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                      <div className="divide-y divide-border">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 px-5 py-1 hover:bg-muted/20 transition-colors">
                            <label className="flex flex-1 min-h-10 items-center gap-3 cursor-pointer">
                              <input type="checkbox" checked={item.checked} onChange={() => toggleChecklist(item.id)} className="w-4 h-4 rounded accent-primary cursor-pointer flex-shrink-0" />
                              <span className={`text-sm flex-1 ${item.checked ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.label}</span>
                            </label>
                            {item.custom && (
                              <button
                                onClick={() => removeChecklistItem(item.id)}
                                className="p-2 rounded text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                                aria-label={`Remove ${item.label}`}
                              >
                                <X className="w-3.5 h-3.5" aria-hidden />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DemoGate>
    </div>
  );
}

function HuntCard({ hunt, next, today, budget, onStatus }: { hunt: PlannedHunt; next: TimelineItem | null; today: string; budget?: number; onStatus: (s: HuntStatus) => void }) {
  const a = hunt.agency;
  const steps = huntSteps(hunt);
  const done = steps.filter((s) => (hunt.stepsDone || []).includes(s.key)).length + (hunt.tasks || []).filter((t) => t.done).length;
  const total = steps.length + (hunt.tasks || []).length;
  const cd = next ? countdown(next, today) : null;
  const title = huntTitle(hunt);
  const c = a ? cycleInfo(a) : null;
  return (
    <article className="h-full rounded-xl border border-border bg-card p-4 hover:shadow-md transition-shadow min-w-0" aria-label={title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-foreground break-words">
            <Link href={`/planner/hunt/${hunt.id}`} className="hover:underline focus-visible:underline">
              {title}
            </Link>
          </h3>
          <p className="text-xs text-muted-foreground break-words">
            {a ? (a.residency === "resident" ? "Resident" : "Nonresident") : "Added by you"}
            {hunt.unit && a?.kind !== "otc" ? ` · ${hunt.unit}` : ""}
            {a?.method ? ` · ${a.method}` : ""}
          </p>
        </div>
        <select
          value={hunt.status}
          onChange={(e) => onStatus(e.target.value as HuntStatus)}
          aria-label={`Status for ${title}`}
          className={`shrink-0 min-h-10 px-2 rounded-lg text-xs font-semibold border cursor-pointer ${STATUS_PILL[hunt.status]}`}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <CycleBadge hunt={hunt} />
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            Checklist {done}/{total}
          </span>
        )}
        {a?.pointsMatter && (
          <span className="text-xs text-muted-foreground">
            Points {hunt.preferencePointsOwned}
            {a.minPoints != null ? ` · lowest drawn ${a.minPoints}` : ""}
          </span>
        )}
        {budget !== undefined && <span className="text-xs text-muted-foreground">Budget ${budget.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>}
      </div>
      <div className="mt-3 text-sm">
        {next ? (
          <p className="break-words">
            <span className="text-muted-foreground">Next:</span> <span className="font-medium text-foreground">{next.label}</span>
            <span className="block text-xs">
              {dateRange(next.start, next.end)} · <span className={TONE_CLASS[cd!.tone]}>{cd!.text}</span>
              {next.tentative ? " · tentative" : ""}
              {next.otherCycle ? ` · ${next.cycle} cycle` : ""}
            </span>
          </p>
        ) : c && !c.published ? (
          <p className="text-xs text-muted-foreground">{c.label}. Updates when published.</p>
        ) : (
          <p className="text-xs text-muted-foreground">No upcoming dates.</p>
        )}
      </div>
      <Link href={`/planner/hunt/${hunt.id}`} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary hover:underline" aria-label={`Open ${title}`}>
        Open hunt <ChevronRight className="w-4 h-4" aria-hidden />
      </Link>
    </article>
  );
}

function AllDates({ items, byId, today }: { items: TimelineItem[]; byId: Map<string, PlannedHunt>; today: string }) {
  const waiting = Array.from(byId.values()).filter((h) => h.agency && !cycleInfo(h.agency).published);
  const groups = new Map<string, TimelineItem[]>();
  for (const t of items) {
    const k = (t.start || t.end).slice(0, 7);
    groups.set(k, [...(groups.get(k) || []), t]);
  }
  return (
    <div className="space-y-4">
      {items.length === 0 && <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">No upcoming published dates yet.</p>}
      {Array.from(groups.entries()).map(([ym, list]) => (
        <section key={ym} className="bg-card border border-border rounded-xl overflow-hidden" aria-label={formatDate(`${ym}-01`).replace(/ 1,/, "")}>
          <h3 className="px-4 py-2 bg-muted/50 border-b border-border text-sm font-bold text-foreground">{formatDate(`${ym}-01`).replace(/ 1,/, "")}</h3>
          <ul className="divide-y divide-border">
            {list.map((t) => {
              const h = byId.get(t.huntId)!;
              const cd = countdown(t, today);
              return (
                <li key={`${t.huntId}-${t.key}`} className="flex gap-3 px-4 py-3">
                  <div className="w-12 shrink-0 text-center" aria-hidden>
                    <div className="text-xl font-bold tabular-nums text-foreground">{Number((t.start || t.end).slice(8, 10))}</div>
                  </div>
                  <div className="min-w-0 flex-1 text-sm">
                    <Link href={`/planner/hunt/${h.id}`} className="font-semibold text-foreground hover:underline break-words">
                      {huntTitle(h)}
                    </Link>
                    <div className="text-xs text-muted-foreground break-words">
                      {t.kind === "season" ? `Season${t.label ? `: ${t.label}` : ""}` : t.label} · {dateRange(t.start, t.end)} · <span className={TONE_CLASS[cd.tone]}>{cd.text}</span>
                      {t.tentative ? " · tentative" : ""}
                      {t.otherCycle ? ` · ${t.cycle} cycle` : ""}
                      {t.sourceUrl && !t.mine && (
                        <>
                          {" · "}
                          <SourceLink href={t.sourceUrl}>{h.agency?.agencyShortName || "Agency"}</SourceLink>
                        </>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {waiting.length > 0 && (
        <section className="rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
          <h3 className="font-semibold text-foreground">Waiting on the agency</h3>
          <ul className="mt-1 space-y-1 text-muted-foreground">
            {waiting.map((h) => (
              <li key={h.id} className="break-words">
                <Link href={`/planner/hunt/${h.id}`} className="text-primary hover:underline">
                  {huntTitle(h)}
                </Link>
                : {cycleInfo(h.agency!).label}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
