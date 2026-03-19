"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Species,
  SPECIES_LABELS,
  Season,
  SEASON_LABELS,
  SPECIES_SEASONS,
} from "@/data/types";

// ============================================================
// Types
// ============================================================

type HuntStatus = "planning" | "applied" | "drawn" | "alternate" | "not-drawn";

interface PlannedHunt {
  id: string;
  state: string;
  species: Species;
  unit: string;
  season: Season;
  preferencePointsNeeded: number;
  preferencePointsOwned: number;
  applicationDeadline: string;
  seasonDates: string;
  status: HuntStatus;
  notes: string;
}

interface BudgetItem {
  id: string;
  huntId: string;
  category: string;
  description: string;
  amount: number;
}

interface ChecklistItem {
  id: string;
  category: string;
  label: string;
  checked: boolean;
  custom: boolean;
}

interface PlannerData {
  hunts: PlannedHunt[];
  budget: BudgetItem[];
  checklist: ChecklistItem[];
}

// ============================================================
// Constants
// ============================================================

const STATUS_OPTIONS: { value: HuntStatus; label: string; color: string }[] = [
  { value: "planning", label: "Planning", color: "bg-blue-100 text-blue-800 border-blue-300" },
  { value: "applied", label: "Applied", color: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "drawn", label: "Drawn", color: "bg-green-100 text-green-800 border-green-300" },
  { value: "alternate", label: "Alternate", color: "bg-purple-100 text-purple-800 border-purple-300" },
  { value: "not-drawn", label: "Not Drawn", color: "bg-red-100 text-red-800 border-red-300" },
];

const US_STATES = [
  "Alabama","Alaska","Arizona","Arkansas","California","Colorado","Connecticut","Delaware","Florida","Georgia",
  "Hawaii","Idaho","Illinois","Indiana","Iowa","Kansas","Kentucky","Louisiana","Maine","Maryland",
  "Massachusetts","Michigan","Minnesota","Mississippi","Missouri","Montana","Nebraska","Nevada","New Hampshire","New Jersey",
  "New Mexico","New York","North Carolina","North Dakota","Ohio","Oklahoma","Oregon","Pennsylvania","Rhode Island","South Carolina",
  "South Dakota","Tennessee","Texas","Utah","Vermont","Virginia","Washington","West Virginia","Wisconsin","Wyoming",
];

const ALL_SPECIES: Species[] = ["elk", "mule-deer", "whitetail", "pronghorn", "moose", "bear", "sheep", "goat", "lion", "turkey"];

const BUDGET_CATEGORIES = ["License", "Tag/Permit", "Travel", "Lodging", "Gear", "Processing", "Taxidermy", "Other"];

const DEFAULT_CHECKLIST: Omit<ChecklistItem, "id">[] = [
  // Weapons & Ammo
  { category: "Weapons & Ammo", label: "Primary weapon", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Ammunition / Arrows", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Cleaning kit", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Sling / Bow case", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Rangefinder", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Optics / Scope", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Binoculars", checked: false, custom: false },
  { category: "Weapons & Ammo", label: "Spotting scope + tripod", checked: false, custom: false },
  // Clothing
  { category: "Clothing", label: "Base layers", checked: false, custom: false },
  { category: "Clothing", label: "Insulation layer", checked: false, custom: false },
  { category: "Clothing", label: "Outer shell / rain gear", checked: false, custom: false },
  { category: "Clothing", label: "Camo / blaze orange", checked: false, custom: false },
  { category: "Clothing", label: "Hunting boots", checked: false, custom: false },
  { category: "Clothing", label: "Gloves", checked: false, custom: false },
  { category: "Clothing", label: "Hat / beanie", checked: false, custom: false },
  { category: "Clothing", label: "Extra socks", checked: false, custom: false },
  // Camping
  { category: "Camping", label: "Tent / shelter", checked: false, custom: false },
  { category: "Camping", label: "Sleeping bag", checked: false, custom: false },
  { category: "Camping", label: "Sleeping pad", checked: false, custom: false },
  { category: "Camping", label: "Camp stove + fuel", checked: false, custom: false },
  { category: "Camping", label: "Cooler / ice", checked: false, custom: false },
  { category: "Camping", label: "Food / water", checked: false, custom: false },
  { category: "Camping", label: "Headlamp + batteries", checked: false, custom: false },
  { category: "Camping", label: "Camp chair", checked: false, custom: false },
  // Safety
  { category: "Safety", label: "First aid kit", checked: false, custom: false },
  { category: "Safety", label: "Bear spray (if applicable)", checked: false, custom: false },
  { category: "Safety", label: "Emergency blanket", checked: false, custom: false },
  { category: "Safety", label: "Whistle / signal mirror", checked: false, custom: false },
  { category: "Safety", label: "Fire starter", checked: false, custom: false },
  // Navigation
  { category: "Navigation", label: "GPS unit / app", checked: false, custom: false },
  { category: "Navigation", label: "Paper maps (unit/topo)", checked: false, custom: false },
  { category: "Navigation", label: "Compass", checked: false, custom: false },
  { category: "Navigation", label: "Phone charger / battery", checked: false, custom: false },
  // Processing
  { category: "Processing", label: "Knives (skinning + boning)", checked: false, custom: false },
  { category: "Processing", label: "Game bags", checked: false, custom: false },
  { category: "Processing", label: "Rope / paracord", checked: false, custom: false },
  { category: "Processing", label: "Latex gloves", checked: false, custom: false },
  { category: "Processing", label: "Pack frame / game cart", checked: false, custom: false },
  { category: "Processing", label: "Cooler for meat transport", checked: false, custom: false },
];

const CHECKLIST_CATEGORIES = [...new Set(DEFAULT_CHECKLIST.map((i) => i.category))];

// ============================================================
// Helpers
// ============================================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function getStatusColor(status: HuntStatus) {
  return STATUS_OPTIONS.find((s) => s.value === status)?.color || "";
}

function getDeadlineUrgency(deadline: string): "urgent" | "soon" | "normal" {
  if (!deadline) return "normal";
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return "normal";
  const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return "normal";
  if (days <= 14) return "urgent";
  if (days <= 45) return "soon";
  return "normal";
}

const DEADLINE_STYLES: Record<string, string> = {
  urgent: "text-danger font-bold",
  soon: "text-warning font-semibold",
  normal: "text-muted-foreground",
};

// ============================================================
// Storage
// ============================================================

const STORAGE_KEY = "huntscout-planner";

function loadData(): PlannerData {
  if (typeof window === "undefined") return { hunts: [], budget: [], checklist: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as PlannerData;
  } catch {
    // ignore
  }
  // Initialize default checklist
  return {
    hunts: [],
    budget: [],
    checklist: DEFAULT_CHECKLIST.map((item) => ({ ...item, id: generateId() })),
  };
}

function saveData(data: PlannerData) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// ============================================================
// Page Component
// ============================================================

export default function PlannerPage() {
  const [data, setData] = useState<PlannerData>({ hunts: [], budget: [], checklist: [] });
  const [loaded, setLoaded] = useState(false);
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

  // Load from localStorage
  useEffect(() => {
    setData(loadData());
    setLoaded(true);
  }, []);

  // Persist on change
  const updateData = useCallback((updater: (prev: PlannerData) => PlannerData) => {
    setData((prev) => {
      const next = updater(prev);
      saveData(next);
      return next;
    });
  }, []);

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
    };
    updateData((prev) => ({ ...prev, hunts: [...prev.hunts, hunt] }));
    setFormState("");
    setFormUnit("");
    setFormPoints(0);
    setFormDeadline("");
    setFormSeasonDates("");
    setFormNotes("");
    setShowAddHunt(false);
  }

  function removeHunt(id: string) {
    updateData((prev) => ({
      ...prev,
      hunts: prev.hunts.filter((h) => h.id !== id),
      budget: prev.budget.filter((b) => b.huntId !== id),
    }));
  }

  function updateHuntStatus(id: string, status: HuntStatus) {
    updateData((prev) => ({
      ...prev,
      hunts: prev.hunts.map((h) => (h.id === id ? { ...h, status } : h)),
    }));
  }

  function updateHuntNotes(id: string, notes: string) {
    updateData((prev) => ({
      ...prev,
      hunts: prev.hunts.map((h) => (h.id === id ? { ...h, notes } : h)),
    }));
  }

  // --- Budget CRUD ---

  function addBudgetItem() {
    if (!budgetDesc || !budgetAmount) return;
    const item: BudgetItem = {
      id: generateId(),
      huntId: budgetHunt,
      category: budgetCategory,
      description: budgetDesc,
      amount: parseFloat(budgetAmount) || 0,
    };
    updateData((prev) => ({ ...prev, budget: [...prev.budget, item] }));
    setBudgetDesc("");
    setBudgetAmount("");
  }

  function removeBudgetItem(id: string) {
    updateData((prev) => ({
      ...prev,
      budget: prev.budget.filter((b) => b.id !== id),
    }));
  }

  // --- Checklist ---

  function toggleChecklist(id: string) {
    updateData((prev) => ({
      ...prev,
      checklist: prev.checklist.map((c) =>
        c.id === id ? { ...c, checked: !c.checked } : c
      ),
    }));
  }

  function addCustomChecklistItem() {
    if (!customLabel.trim()) return;
    const item: ChecklistItem = {
      id: generateId(),
      category: customCategory,
      label: customLabel.trim(),
      checked: false,
      custom: true,
    };
    updateData((prev) => ({ ...prev, checklist: [...prev.checklist, item] }));
    setCustomLabel("");
  }

  function removeChecklistItem(id: string) {
    updateData((prev) => ({
      ...prev,
      checklist: prev.checklist.filter((c) => c.id !== id),
    }));
  }

  // --- Export/Import ---

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `huntscout-planner-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result as string) as PlannerData;
          if (imported.hunts && imported.budget && imported.checklist) {
            setData(imported);
            saveData(imported);
          }
        } catch {
          alert("Invalid file format");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  // --- Computed ---

  const budgetTotal = useMemo(() => data.budget.reduce((sum, b) => sum + b.amount, 0), [data.budget]);

  const budgetByHunt = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of data.budget) {
      const key = b.huntId || "general";
      map[key] = (map[key] || 0) + b.amount;
    }
    return map;
  }, [data.budget]);

  const checklistByCategory = useMemo(() => {
    const map: Record<string, ChecklistItem[]> = {};
    for (const item of data.checklist) {
      if (!map[item.category]) map[item.category] = [];
      map[item.category].push(item);
    }
    return map;
  }, [data.checklist]);

  // --- Timeline data ---
  const timelineMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const huntsWithDeadlines = useMemo(() => {
    return data.hunts
      .filter((h) => h.applicationDeadline)
      .map((h) => {
        const d = new Date(h.applicationDeadline);
        return { ...h, deadlineDate: d, month: d.getMonth() };
      })
      .sort((a, b) => a.deadlineDate.getTime() - b.deadlineDate.getTime());
  }, [data.hunts]);

  const SPECIES_COLORS: Partial<Record<Species, string>> = {
    elk: "bg-amber-600",
    "mule-deer": "bg-orange-700",
    whitetail: "bg-yellow-700",
    pronghorn: "bg-yellow-500",
    moose: "bg-stone-700",
    bear: "bg-stone-800",
    sheep: "bg-gray-500",
    goat: "bg-gray-400",
    lion: "bg-amber-800",
    turkey: "bg-green-700",
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse-soft">Loading planner...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="bg-gradient-to-br from-[#1a3a1a] via-[#0f2a0f] to-[#1c1917] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-2">
                Hunt Planner
              </h1>
              <p className="text-white/60 max-w-xl">
                Organize your applications and hunts across all 50 states.
                Everything saves automatically to your browser.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportData}
                className="px-4 py-2 rounded-lg border border-white/20 text-white/80 text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer"
              >
                Export JSON
              </button>
              <button
                onClick={importData}
                className="px-4 py-2 rounded-lg border border-white/20 text-white/80 text-sm font-medium hover:bg-white/10 transition-colors cursor-pointer"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto">
          {(
            [
              { key: "hunts", label: "My Hunts", count: data.hunts.length },
              { key: "timeline", label: "Timeline", count: huntsWithDeadlines.length },
              { key: "budget", label: "Budget", count: data.budget.length },
              { key: "gear", label: "Gear Checklist", count: data.checklist.filter((c) => c.checked).length },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs bg-muted">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Hunts Tab ── */}
        {activeTab === "hunts" && (
          <div className="space-y-6">
            {/* Add Hunt Button */}
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-foreground">
                Planned Hunts
              </h2>
              <button
                onClick={() => setShowAddHunt(!showAddHunt)}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-light transition-colors cursor-pointer"
              >
                {showAddHunt ? "Cancel" : "+ Add a Hunt"}
              </button>
            </div>

            {/* Add Hunt Form */}
            {showAddHunt && (
              <div className="bg-card border border-border rounded-xl p-6 animate-fade-in-up">
                <h3 className="font-bold text-foreground mb-4">New Hunt</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">State</label>
                    <select
                      value={formState}
                      onChange={(e) => setFormState(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      <option value="">Select state...</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Species</label>
                    <select
                      value={formSpecies}
                      onChange={(e) => {
                        const sp = e.target.value as Species;
                        setFormSpecies(sp);
                        const validSeasons = SPECIES_SEASONS[sp];
                        if (!validSeasons.includes(formSeason)) {
                          setFormSeason(validSeasons[0]);
                        }
                      }}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      {ALL_SPECIES.map((s) => (
                        <option key={s} value={s}>{SPECIES_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Unit / GMU</label>
                    <input
                      type="text"
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value)}
                      placeholder="e.g. GMU 61"
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Season</label>
                    <select
                      value={formSeason}
                      onChange={(e) => setFormSeason(e.target.value as Season)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      {SPECIES_SEASONS[formSpecies].map((s) => (
                        <option key={s} value={s}>{SEASON_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Your Preference Points</label>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      value={formPoints}
                      onChange={(e) => setFormPoints(parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Application Deadline</label>
                    <input
                      type="date"
                      value={formDeadline}
                      onChange={(e) => setFormDeadline(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Season Dates</label>
                    <input
                      type="text"
                      value={formSeasonDates}
                      onChange={(e) => setFormSeasonDates(e.target.value)}
                      placeholder="e.g. Oct 12 - Nov 3"
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                    />
                  </div>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Notes</label>
                    <textarea
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      rows={2}
                      placeholder="Access notes, camp spots, research links..."
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y"
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={addHunt}
                    disabled={!formState || !formUnit}
                    className="px-6 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Save Hunt
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {data.hunts.length === 0 && !showAddHunt && (
              <div className="text-center py-16 bg-card border border-border rounded-xl">
                <div className="text-5xl mb-4">{"\ud83c\udf32"}</div>
                <h3 className="text-lg font-bold text-foreground mb-2">No hunts planned yet</h3>
                <p className="text-muted-foreground mb-6">Browse states to start planning your next adventure.</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    onClick={() => setShowAddHunt(true)}
                    className="px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary-light transition-colors cursor-pointer"
                  >
                    Add Your First Hunt
                  </button>
                  <Link
                    href="/states"
                    className="px-5 py-2.5 rounded-lg border-2 border-primary text-primary font-semibold hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    Browse States
                  </Link>
                </div>
              </div>
            )}

            {/* Hunt Cards */}
            <div className="space-y-4">
              {data.hunts.map((hunt) => {
                const urgency = getDeadlineUrgency(hunt.applicationDeadline);
                return (
                  <div
                    key={hunt.id}
                    className="bg-card border border-border rounded-xl p-5 hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="font-bold text-foreground text-lg">
                          {hunt.state}
                        </h3>
                        <span className="text-sm font-medium text-muted-foreground">
                          {SPECIES_LABELS[hunt.species]}
                        </span>
                        <span className="text-xs font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
                          {hunt.unit}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {SEASON_LABELS[hunt.season]}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={hunt.status}
                          onChange={(e) => updateHuntStatus(hunt.id, e.target.value as HuntStatus)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${getStatusColor(hunt.status)}`}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => removeHunt(hunt.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                          title="Remove hunt"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      {hunt.seasonDates && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Season</span>
                          <span className="font-medium text-foreground">{hunt.seasonDates}</span>
                        </div>
                      )}
                      {hunt.applicationDeadline && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Deadline</span>
                          <span className={DEADLINE_STYLES[urgency]}>
                            {new Date(hunt.applicationDeadline).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                            {urgency === "urgent" && " (!)"}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-muted-foreground block">Your Points</span>
                        <span className="font-medium text-foreground">{hunt.preferencePointsOwned}</span>
                      </div>
                      {budgetByHunt[hunt.id] !== undefined && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Budget</span>
                          <span className="font-medium text-foreground">
                            ${budgetByHunt[hunt.id].toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    {(hunt.notes || expandedNotes === hunt.id) && (
                      <div className="mt-3 pt-3 border-t border-border">
                        {expandedNotes === hunt.id ? (
                          <textarea
                            value={hunt.notes}
                            onChange={(e) => updateHuntNotes(hunt.id, e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 resize-y"
                            placeholder="Add notes..."
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">{hunt.notes}</p>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => setExpandedNotes(expandedNotes === hunt.id ? null : hunt.id)}
                      className="mt-2 text-xs text-primary hover:underline cursor-pointer"
                    >
                      {expandedNotes === hunt.id ? "Close notes" : hunt.notes ? "Edit notes" : "Add notes"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Timeline Tab ── */}
        {activeTab === "timeline" && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-foreground">Application Timeline</h2>
            {huntsWithDeadlines.length === 0 ? (
              <div className="text-center py-12 bg-card border border-border rounded-xl">
                <p className="text-muted-foreground">
                  Add hunts with application deadlines to see your timeline.
                </p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                {/* Month headers */}
                <div className="hidden md:grid grid-cols-12 border-b border-border">
                  {timelineMonths.map((m, i) => {
                    const isCurrentMonth = new Date().getMonth() === i;
                    return (
                      <div
                        key={m}
                        className={`text-center text-xs font-semibold py-2 border-r border-border last:border-r-0 ${
                          isCurrentMonth ? "bg-primary/10 text-primary" : "text-muted-foreground"
                        }`}
                      >
                        {m}
                      </div>
                    );
                  })}
                </div>

                {/* Timeline rows */}
                <div className="divide-y divide-border">
                  {huntsWithDeadlines.map((hunt) => {
                    const monthIdx = hunt.month;
                    return (
                      <div key={hunt.id} className="relative">
                        {/* Mobile view */}
                        <div className="md:hidden p-4">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-3 h-3 rounded-full ${SPECIES_COLORS[hunt.species] || "bg-gray-500"}`} />
                            <span className="font-bold text-foreground text-sm">{hunt.state}</span>
                            <span className="text-xs text-muted-foreground">{SPECIES_LABELS[hunt.species]}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Deadline:{" "}
                            {hunt.deadlineDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                        </div>
                        {/* Desktop view */}
                        <div className="hidden md:grid grid-cols-12 min-h-[3rem] items-center">
                          {timelineMonths.map((_, i) => {
                            const isCurrentMonth = new Date().getMonth() === i;
                            const hasDeadline = monthIdx === i;
                            return (
                              <div
                                key={i}
                                className={`h-full flex items-center justify-center border-r border-border last:border-r-0 relative ${
                                  isCurrentMonth ? "bg-primary/5" : ""
                                }`}
                              >
                                {hasDeadline && (
                                  <div className="flex items-center gap-1.5 px-1">
                                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${SPECIES_COLORS[hunt.species] || "bg-gray-500"}`} />
                                    <span className="text-xs font-medium text-foreground truncate">
                                      {hunt.state} {SPECIES_LABELS[hunt.species]}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Current date indicator legend */}
                <div className="p-3 border-t border-border bg-muted/30 flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-primary/20 border border-primary/40 rounded" />
                    Current month
                  </span>
                  {ALL_SPECIES.slice(0, 5).map((sp) => (
                    <span key={sp} className="flex items-center gap-1">
                      <span className={`w-2.5 h-2.5 rounded-full ${SPECIES_COLORS[sp]}`} />
                      {SPECIES_LABELS[sp]}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Budget Tab ── */}
        {activeTab === "budget" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-foreground">Budget Calculator</h2>
              <div className="text-right">
                <div className="text-xs text-muted-foreground uppercase tracking-wider">Total Budget</div>
                <div className="text-2xl font-bold text-foreground">${budgetTotal.toLocaleString()}</div>
              </div>
            </div>

            {/* Add budget item */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-bold text-foreground mb-3 text-sm">Add Expense</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <select
                  value={budgetHunt}
                  onChange={(e) => setBudgetHunt(e.target.value)}
                  className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  <option value="">General</option>
                  {data.hunts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.state} - {SPECIES_LABELS[h.species]}
                    </option>
                  ))}
                </select>
                <select
                  value={budgetCategory}
                  onChange={(e) => setBudgetCategory(e.target.value)}
                  className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {BUDGET_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={budgetDesc}
                  onChange={(e) => setBudgetDesc(e.target.value)}
                  placeholder="Description"
                  className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <input
                  type="number"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  placeholder="$0.00"
                  min={0}
                  step={0.01}
                  className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <button
                  onClick={addBudgetItem}
                  disabled={!budgetDesc || !budgetAmount}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Add
                </button>
              </div>
            </div>

            {/* Budget table */}
            {data.budget.length > 0 ? (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="hidden sm:grid grid-cols-12 gap-4 px-5 py-3 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <div className="col-span-3">Hunt</div>
                  <div className="col-span-2">Category</div>
                  <div className="col-span-4">Description</div>
                  <div className="col-span-2 text-right">Amount</div>
                  <div className="col-span-1" />
                </div>
                <div className="divide-y divide-border">
                  {data.budget.map((item) => {
                    const hunt = data.hunts.find((h) => h.id === item.huntId);
                    return (
                      <div key={item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 px-5 py-3 items-center hover:bg-muted/20 transition-colors">
                        <div className="sm:col-span-3 text-sm text-foreground">
                          {hunt ? `${hunt.state} - ${SPECIES_LABELS[hunt.species]}` : "General"}
                        </div>
                        <div className="sm:col-span-2 text-xs text-muted-foreground">{item.category}</div>
                        <div className="sm:col-span-4 text-sm text-foreground">{item.description}</div>
                        <div className="sm:col-span-2 text-sm font-semibold text-foreground text-right">
                          ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="sm:col-span-1 flex justify-end">
                          <button
                            onClick={() => removeBudgetItem(item.id)}
                            className="p-1 rounded text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Totals */}
                <div className="px-5 py-3 bg-muted/30 border-t border-border flex justify-between items-center">
                  <span className="text-sm font-semibold text-muted-foreground">Total</span>
                  <span className="text-lg font-bold text-foreground">
                    ${budgetTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 bg-card border border-border rounded-xl">
                <p className="text-muted-foreground">No expenses added yet. Start tracking your hunt budget above.</p>
              </div>
            )}

            {/* Per-hunt summary */}
            {Object.keys(budgetByHunt).length > 1 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-bold text-foreground mb-3 text-sm">Per-Hunt Breakdown</h3>
                <div className="space-y-2">
                  {Object.entries(budgetByHunt).map(([huntId, total]) => {
                    const hunt = data.hunts.find((h) => h.id === huntId);
                    return (
                      <div key={huntId} className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">
                          {hunt ? `${hunt.state} - ${SPECIES_LABELS[hunt.species]}` : "General"}
                        </span>
                        <span className="font-semibold text-foreground">
                          ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
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
            <h2 className="text-xl font-bold text-foreground">Gear Checklist</h2>

            {/* Add custom item */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-bold text-foreground mb-3 text-sm">Add Custom Item</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  {CHECKLIST_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addCustomChecklistItem()}
                  placeholder="Item name..."
                  className="flex-1 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
                <button
                  onClick={addCustomChecklistItem}
                  disabled={!customLabel.trim()}
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  Add Item
                </button>
              </div>
            </div>

            {/* Categories */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {CHECKLIST_CATEGORIES.map((category) => {
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
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            progress === 100 ? "bg-success" : "bg-primary"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/20 transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() => toggleChecklist(item.id)}
                            className="w-4 h-4 rounded accent-primary cursor-pointer flex-shrink-0"
                          />
                          <span
                            className={`text-sm flex-1 ${
                              item.checked
                                ? "line-through text-muted-foreground"
                                : "text-foreground"
                            }`}
                          >
                            {item.label}
                          </span>
                          {item.custom && (
                            <button
                              onClick={() => removeChecklistItem(item.id)}
                              className="p-1 rounded text-muted-foreground hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                              </svg>
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
    </div>
  );
}
