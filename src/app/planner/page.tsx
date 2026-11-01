"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { X } from "lucide-react";
import { Species, SPECIES_LABELS, Season, SEASON_LABELS, SPECIES_SEASONS } from "@/data/types";
import { DemoGate } from "@/components/DemoGate";
import { todayIso } from "@/lib/agency-format";
import { deadlinesOf, sanitizePlannerData, type AgencyFee, type BudgetItem, type ChecklistItem, type HuntStatus, type PlannedHunt, type PlannerData } from "@/lib/planner-schema";
import { usePlannerSync } from "@/components/planner/usePlannerSync";
import { BUDGET_CATEGORIES, CHECKLIST_CATEGORIES, STATUS_OPTIONS, US_STATES, generateId } from "@/components/planner/defaults";
import {
  AgencyDetails,
  NextDeadlineSummary,
  SyncBadge,
  Timeline,
  dateRange,
  daysLeftText,
  feeBudgetDescription,
  feeCategory,
  fromLabel,
  huntTitle,
  urgencyClass,
} from "@/components/planner/PlannerParts";

const ALL_SPECIES: Species[] = ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "bear", "sheep", "goat", "lion", "turkey"];

function getStatusColor(status: HuntStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.color || "";
}

const inputCls =
  "w-full min-h-10 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-base sm:text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40";
const labelCls = "block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1";

export default function PlannerPage() {
  const { data: session, status: sessionStatus } = useSession();
  const { data, status, update, retry, notice, dismissNotice, account } = usePlannerSync({
    ready: sessionStatus !== "loading",
    email: session?.user?.email?.trim().toLowerCase() || null,
    isPro: !!session?.user?.isPro,
  });
  const today = todayIso();

  const [showAddHunt, setShowAddHunt] = useState(false);
  const [activeTab, setActiveTab] = useState<"hunts" | "timeline" | "budget" | "gear">("hunts");
  const [expandedNotes, setExpandedNotes] = useState<string | null>(null);

  // New hunt form
  const [formState, setFormState] = useState("");
  const [formSpecies, setFormSpecies] = useState<Species>("elk");
  const [formUnit, setFormUnit] = useState("");
  const [formSeason, setFormSeason] = useState<Season>("rifle");
  const [formPoints, setFormPoints] = useState(0);
  const [formDeadline, setFormDeadline] = useState("");
  const [formSeasonDates, setFormSeasonDates] = useState("");
  const [formNotes, setFormNotes] = useState("");

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

  // Hunts in deadline order: upcoming first, then no deadline, then passed.
  const sortedHunts = useMemo(() => {
    const ends = new Map(deadlinesOf(hunts).map((d) => [d.hunt.id, d.end] as const));
    const rank = (h: PlannedHunt) => {
      const e = ends.get(h.id);
      return e === undefined ? 1 : e >= today ? 0 : 2;
    };
    return hunts
      .map((h, i) => ({ h, i }))
      .sort((a, b) => rank(a.h) - rank(b.h) || (ends.get(a.h.id) || "").localeCompare(ends.get(b.h.id) || "") || a.i - b.i)
      .map((x) => x.h);
  }, [hunts, today]);

  const deadlineCount = useMemo(() => deadlinesOf(hunts).length, [hunts]);
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

  const stamp = () => new Date().toISOString();
  const tombstone = (d: PlannerData, ids: string[]) => [...d.deleted, ...ids].slice(-600);
  const patchHunt = (id: string, patch: Partial<PlannedHunt>) =>
    update((prev) => ({ ...prev, hunts: prev.hunts.map((h) => (h.id === id ? { ...h, ...patch, updatedAt: stamp() } : h)) }));

  // --- Hunt CRUD ---

  function addHunt() {
    if (!formState || !formUnit) return;
    const hunt: PlannedHunt = {
      id: generateId(),
      state: formState,
      species: formSpecies,
      unit: formUnit,
      season: formSeason,
      preferencePointsNeeded: 0,
      preferencePointsOwned: formPoints,
      applicationDeadline: formDeadline,
      seasonDates: formSeasonDates,
      status: "planning",
      notes: formNotes,
      updatedAt: stamp(),
    };
    update((prev) => ({ ...prev, hunts: [...prev.hunts, hunt] }));
    setFormState("");
    setFormUnit("");
    setFormPoints(0);
    setFormDeadline("");
    setFormSeasonDates("");
    setFormNotes("");
    setShowAddHunt(false);
  }

  function removeHunt(id: string) {
    update((prev) => {
      const gone = prev.budget.filter((b) => b.huntId === id).map((b) => b.id);
      return {
        ...prev,
        hunts: prev.hunts.filter((h) => h.id !== id),
        budget: prev.budget.filter((b) => b.huntId !== id),
        deleted: tombstone(prev, [id, ...gone]),
      };
    });
  }

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

  function addFeeToBudget(hunt: PlannedHunt, f: AgencyFee) {
    const description = feeBudgetDescription(f);
    update((prev) =>
      prev.budget.some((b) => b.huntId === hunt.id && b.description === description)
        ? prev
        : {
            ...prev,
            budget: [
              ...prev.budget,
              { id: generateId(), huntId: hunt.id, category: feeCategory(f), description, amount: f.amountUsd, licenseYear: f.licenseYear, ...(f.sourceUrl ? { sourceUrl: f.sourceUrl } : {}) },
            ],
          }
    );
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
            Add hunts straight from the agency draw tables. The planner fills in the agency&apos;s application deadline and fees, sorts everything by
            deadline, and saves to your account so it&apos;s on every device you sign in on.
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

  return (
    <div className="min-h-screen bg-background">
      <DemoGate feature="the Hunt Planner" preview={plannerPreview}>
        {/* Header */}
        <section className="bg-gradient-to-br from-[#1a3a1a] via-[#0f2a0f] to-[#1c1917] text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
              <div className="flex gap-2">
                <button
                  onClick={exportData}
                  className="min-h-10 px-4 py-2 rounded-lg border border-white/20 text-white/80 text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer"
                >
                  Export JSON
                </button>
                <button
                  onClick={importData}
                  className="min-h-10 px-4 py-2 rounded-lg border border-white/20 text-white/80 text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer"
                >
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

          <NextDeadlineSummary hunts={hunts} budgetTotal={budgetTotal} today={today} />

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto no-scrollbar" role="tablist" aria-label="Planner sections">
            {(
              [
                { key: "hunts", label: "My Hunts", count: hunts.length },
                { key: "timeline", label: "Timeline", count: deadlineCount },
                { key: "budget", label: "Budget", count: budget.length },
                { key: "gear", label: "Gear Checklist", count: checklist.filter((c) => c.checked).length },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-11 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
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
            <div className="space-y-6">
              <div className="flex flex-wrap justify-between items-center gap-3">
                <h2 className="text-xl font-bold text-foreground">Planned Hunts</h2>
                <button
                  onClick={() => setShowAddHunt(!showAddHunt)}
                  className="min-h-10 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-light transition-colors cursor-pointer"
                >
                  {showAddHunt ? "Cancel" : "+ Add a hunt yourself"}
                </button>
              </div>
              <p className="text-sm text-muted-foreground -mt-3">
                Fastest way: open a{" "}
                <Link href="/states" className="text-primary hover:underline">
                  state&apos;s draw table
                </Link>{" "}
                and tap <span className="font-semibold">Add to my planner</span> on a hunt. It brings in the agency&apos;s application deadline, fees and last
                year&apos;s draw figures.
              </p>

              {showAddHunt && (
                <div className="bg-card border border-border rounded-xl p-4 sm:p-6 animate-fade-in-up">
                  <h3 className="font-bold text-foreground mb-4">New hunt</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <label>
                      <span className={labelCls}>State</span>
                      <select value={formState} onChange={(e) => setFormState(e.target.value)} className={inputCls}>
                        <option value="">Select state...</option>
                        {US_STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelCls}>Species</span>
                      <select
                        value={formSpecies}
                        onChange={(e) => {
                          const sp = e.target.value as Species;
                          setFormSpecies(sp);
                          const validSeasons = SPECIES_SEASONS[sp];
                          if (!validSeasons.includes(formSeason)) setFormSeason(validSeasons[0]);
                        }}
                        className={inputCls}
                      >
                        {ALL_SPECIES.map((s) => (
                          <option key={s} value={s}>
                            {SPECIES_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelCls}>Unit / GMU</span>
                      <input type="text" value={formUnit} onChange={(e) => setFormUnit(e.target.value)} placeholder="e.g. GMU 61" className={inputCls} />
                    </label>
                    <label>
                      <span className={labelCls}>Season</span>
                      <select value={formSeason} onChange={(e) => setFormSeason(e.target.value as Season)} className={inputCls}>
                        {SPECIES_SEASONS[formSpecies].map((s) => (
                          <option key={s} value={s}>
                            {SEASON_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className={labelCls}>Your points</span>
                      <input type="number" min={0} max={25} value={formPoints} onChange={(e) => setFormPoints(parseInt(e.target.value) || 0)} className={inputCls} />
                    </label>
                    <label>
                      <span className={labelCls}>Application deadline</span>
                      <input type="date" value={formDeadline} onChange={(e) => setFormDeadline(e.target.value)} className={inputCls} />
                    </label>
                    <label className="sm:col-span-2">
                      <span className={labelCls}>Season dates</span>
                      <input type="text" value={formSeasonDates} onChange={(e) => setFormSeasonDates(e.target.value)} placeholder="e.g. Oct 12 - Nov 3" className={inputCls} />
                    </label>
                    <label className="sm:col-span-2 lg:col-span-3">
                      <span className={labelCls}>Notes</span>
                      <textarea
                        value={formNotes}
                        onChange={(e) => setFormNotes(e.target.value)}
                        rows={2}
                        placeholder="Access notes, camp spots, research links..."
                        className={`${inputCls} resize-y`}
                      />
                    </label>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button
                      onClick={addHunt}
                      disabled={!formState || !formUnit}
                      className="min-h-10 px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    >
                      Save hunt
                    </button>
                  </div>
                </div>
              )}

              {hunts.length === 0 && !showAddHunt && (
                <div className="text-center py-16 px-4 bg-card border border-border rounded-xl">
                  <div className="text-5xl mb-4" aria-hidden>
                    {"🌲"}
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">No hunts planned yet</h3>
                  <p className="text-muted-foreground mb-6">Pick hunts from a state&apos;s draw results, or add one yourself.</p>
                  <div className="flex flex-wrap justify-center gap-3">
                    <Link
                      href="/states"
                      className="inline-flex min-h-10 items-center px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-light transition-colors"
                    >
                      Browse states
                    </Link>
                    <button
                      onClick={() => setShowAddHunt(true)}
                      className="min-h-10 px-5 py-2.5 rounded-lg border-2 border-primary text-primary font-semibold hover:bg-primary hover:text-primary-foreground transition-colors cursor-pointer"
                    >
                      Add one yourself
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {sortedHunts.map((hunt) => {
                  const from = fromLabel(hunt);
                  const manualDeadline = !hunt.agency?.deadline && hunt.applicationDeadline ? hunt.applicationDeadline : "";
                  return (
                    <article key={hunt.id} className="bg-card border border-border rounded-xl p-4 sm:p-5 hover:shadow-md transition-shadow min-w-0" aria-label={huntTitle(hunt)}>
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                            <h3 className="font-bold text-foreground text-lg">{hunt.state}</h3>
                            <span className="text-sm font-medium text-muted-foreground">{SPECIES_LABELS[hunt.species]}</span>
                            {hunt.agency ? (
                              <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-foreground break-all">{hunt.agency.huntCode}</span>
                            ) : (
                              hunt.unit && <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground break-all">{hunt.unit}</span>
                            )}
                            {hunt.season && <span className="text-xs text-muted-foreground">{SEASON_LABELS[hunt.season]}</span>}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            {from ? (
                              <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 font-medium text-primary">{from}</span>
                            ) : (
                              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-muted-foreground">Added by you</span>
                            )}
                            {hunt.agency && (
                              <span className="text-muted-foreground">
                                {hunt.agency.residency === "resident" ? "Resident" : "Nonresident"}
                                {hunt.unit ? ` · ${hunt.unit}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <select
                            value={hunt.status}
                            onChange={(e) => patchHunt(hunt.id, { status: e.target.value as HuntStatus })}
                            aria-label={`Status for ${huntTitle(hunt)}`}
                            className={`min-h-10 sm:min-h-0 px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${getStatusColor(hunt.status)}`}
                          >
                            {STATUS_OPTIONS.map((s) => (
                              <option key={s.value} value={s.value}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeHunt(hunt.id)}
                            className="p-2.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                            aria-label={`Remove ${huntTitle(hunt)}`}
                            title="Remove hunt"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>

                      {hunt.agency && (
                        <AgencyDetails
                          hunt={hunt}
                          today={today}
                          budget={budget}
                          onAddFee={(f) => addFeeToBudget(hunt, f)}
                          onSetDeadline={(iso) => patchHunt(hunt.id, { applicationDeadline: iso })}
                        />
                      )}

                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        {hunt.seasonDates && (
                          <div className="min-w-0">
                            <span className="text-xs text-muted-foreground block">Season</span>
                            <span className="font-medium text-foreground break-words">{hunt.seasonDates}</span>
                          </div>
                        )}
                        {manualDeadline && !hunt.agency && (
                          <div>
                            <span className="text-xs text-muted-foreground block">Deadline (you entered)</span>
                            <span className={urgencyClass(today, manualDeadline)}>
                              {dateRange(undefined, manualDeadline)} · {daysLeftText(today, manualDeadline)}
                            </span>
                          </div>
                        )}
                        <label className="min-w-0">
                          <span className="text-xs text-muted-foreground block">Your points</span>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            value={hunt.preferencePointsOwned}
                            onChange={(e) => patchHunt(hunt.id, { preferencePointsOwned: Math.max(0, Math.min(99, parseInt(e.target.value) || 0)) })}
                            className="w-20 min-h-10 sm:min-h-0 px-2 py-1 border border-border rounded-lg bg-background text-base sm:text-sm font-medium text-foreground"
                          />
                        </label>
                        {budgetByHunt[hunt.id] !== undefined && (
                          <div>
                            <span className="text-xs text-muted-foreground block">Budget</span>
                            <span className="font-medium text-foreground">${budgetByHunt[hunt.id].toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                          </div>
                        )}
                      </div>

                      {(hunt.notes || expandedNotes === hunt.id) && (
                        <div className="mt-3 pt-3 border-t border-border">
                          {expandedNotes === hunt.id ? (
                            <textarea
                              value={hunt.notes}
                              onChange={(e) => patchHunt(hunt.id, { notes: e.target.value })}
                              rows={3}
                              aria-label={`Notes for ${huntTitle(hunt)}`}
                              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y"
                              placeholder="Add notes..."
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground whitespace-pre-line break-words" data-clarity-mask="true">{hunt.notes}</p>
                          )}
                        </div>
                      )}
                      <button
                        onClick={() => setExpandedNotes(expandedNotes === hunt.id ? null : hunt.id)}
                        className="mt-2 inline-flex min-h-10 sm:min-h-8 items-center text-xs text-primary hover:underline cursor-pointer"
                      >
                        {expandedNotes === hunt.id ? "Close notes" : hunt.notes ? "Edit notes" : "Add notes"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Timeline Tab ── */}
          {activeTab === "timeline" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-foreground">Application timeline</h2>
              <Timeline hunts={hunts} today={today} />
            </div>
          )}

          {/* ── Budget Tab ── */}
          {activeTab === "budget" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl font-bold text-foreground">Budget</h2>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Total</div>
                  <div className="text-2xl font-bold text-foreground tabular-nums">${budgetTotal.toLocaleString("en-US", { maximumFractionDigits: 2 })}</div>
                </div>
              </div>
              {hunts.some((h) => h.agency?.fees.length) && (
                <p className="text-sm text-muted-foreground -mt-3">Agency fees for each hunt are listed on its card under My Hunts; add the ones that apply to you.</p>
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
                  <p className="text-muted-foreground">No expenses yet. Add agency fees from a hunt&apos;s card, or your own costs above.</p>
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
            <div className="space-y-6">
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
