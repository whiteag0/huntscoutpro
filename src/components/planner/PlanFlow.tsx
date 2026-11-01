"use client";

// Guided "Plan a hunt": state -> species -> residency -> hunt -> review -> save.
// The review screen shows the entry exactly as the server assembled it from
// agency data (POST /api/planner/entries with preview: true); saving asks the
// server to build it again and store it in the member's account.

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Check, ChevronRight, Loader2, Search, TriangleAlert } from "lucide-react";
import { DemoGate } from "@/components/DemoGate";
import { SPECIES_LABELS, SEASON_LABELS, SPECIES_SEASONS, type Season, type Species } from "@/data/types";
import { todayIso } from "@/lib/agency-format";
import { track } from "@/lib/analytics";
import type { DrawingSeason, PlanKind, PlannedHunt, PlannerResidency } from "@/lib/planner-schema";
import { huntSteps } from "@/lib/planner-timeline";
import { US_STATES, generateId } from "@/components/planner/defaults";
import { usePlannerSync } from "@/components/planner/usePlannerSync";
import { CycleNotice, DateList, DrawFacts, FeeList, SeasonBlock, SourceLink, huntTitle } from "@/components/planner/PlannerParts";

export interface FlowSpecies {
  species: Species;
  label: string;
  drawSystem: string;
  hasDraw: boolean;
  /** The agency's note on general/over-the-counter licenses, when it has one. */
  otc: string | null;
  pointsMatter: boolean;
}
export interface FlowState {
  slug: string;
  name: string;
  agency: string;
  unitTerm: string;
  species: FlowSpecies[];
}
export interface FlowInitial {
  state?: string;
  species?: string;
  residency?: PlannerResidency;
  hunt?: string;
  year?: number;
  kind?: "otc" | "custom";
  from: string;
}

interface HuntOption {
  code: string;
  units: string[];
  description: string;
  method?: string;
  sex?: string;
  seasonDates?: string;
  applicants: number | null;
  drawn: number | null;
  odds: number | null;
  minPoints: number | null;
  pooled: boolean;
}
interface HuntList {
  year: number | null;
  unitTerm: string;
  pointsMatter: boolean;
  hunts: HuntOption[];
}

type Step = "state" | "species" | "residency" | "hunt" | "review";
const STEPS: Step[] = ["state", "species", "residency", "hunt", "review"];
const STEP_TITLES: Record<Step, string> = { state: "State", species: "Species", residency: "Residency", hunt: "Hunt", review: "Review" };
const OTHER_STATE = "__other";
const ALL_SPECIES = Object.keys(SPECIES_LABELS) as Species[];

const listCache = new Map<string, Promise<HuntList>>();
function loadHunts(slug: string, species: string, residency: PlannerResidency): Promise<HuntList> {
  const k = `${slug}|${species}|${residency}`;
  let p = listCache.get(k);
  if (!p) {
    p = fetch(`/api/planner/hunts?${new URLSearchParams({ state: slug, species, residency })}`, { cache: "no-store" }).then(async (r) => {
      if (!r.ok) throw new Error(r.status === 403 ? "Hunt lists are part of Pro." : "Couldn't load the hunt list.");
      return (await r.json()) as HuntList;
    });
    p.catch(() => listCache.delete(k));
    listCache.set(k, p);
  }
  return p;
}

const n = (v: number) => v.toLocaleString("en-US");
function drawSummary(h: HuntOption, year: number | null, pointsMatter: boolean): string {
  const parts: string[] = [];
  if (h.applicants != null && h.drawn != null) parts.push(`${n(h.drawn)} of ${n(h.applicants)} drawn${h.odds != null ? ` (${h.odds}%)` : ""}`);
  else if (h.applicants != null) parts.push(`${n(h.applicants)} applicants`);
  if (pointsMatter && h.minPoints != null) parts.push(`lowest pts ${h.minPoints}`);
  if (!parts.length) return year ? `${year} draw: no figures for this residency` : "";
  return `${year ? `${year}: ` : ""}${parts.join(" · ")}${h.pooled ? " (all applicants)" : ""}`;
}

const inputCls =
  "w-full min-h-11 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50";
const choiceCls =
  "flex min-h-12 w-full cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring";
const primaryBtn =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer";
const secondaryBtn = "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted cursor-pointer";

export function PlanFlow({ states, initial }: { states: FlowState[]; initial: FlowInitial }) {
  return (
    <div className="min-h-screen bg-background">
      <section className="bg-gradient-to-br from-[#1a3a1a] via-[#0f2a0f] to-[#1c1917] text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
          <Link href="/planner" className="inline-flex min-h-10 items-center gap-1 text-sm text-white/70 hover:text-white">
            <ArrowLeft className="w-4 h-4" aria-hidden /> Hunt Planner
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Plan a hunt</h1>
          <p className="text-white/70 text-sm mt-1 max-w-xl">
            Pick the hunt; we bring together the agency&apos;s application dates, season dates, fees and last draw results, each with its source.
          </p>
        </div>
      </section>
      <DemoGate feature="the Hunt Planner">
        <FlowBody states={states} initial={initial} />
      </DemoGate>
    </div>
  );
}

function FlowBody({ states, initial }: { states: FlowState[]; initial: FlowInitial }) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const sync = usePlannerSync({ ready: sessionStatus !== "loading", email: session?.user?.email?.trim().toLowerCase() || null, isPro: !!session?.user?.isPro });

  const initState = states.find((s) => s.slug === initial.state);
  const initSpecies = initState?.species.find((s) => s.species === initial.species);
  const startStep: Step = !initState ? "state" : !initSpecies ? "species" : !initial.residency ? "residency" : initial.hunt || initial.kind ? "review" : "hunt";

  const [step, setStep] = useState<Step>(startStep);
  const [slug, setSlug] = useState(initState?.slug || "");
  const [species, setSpecies] = useState<Species | "">(initSpecies?.species || "");
  const [residency, setResidency] = useState<PlannerResidency | "">(initial.residency || "");
  const [kind, setKind] = useState<PlanKind>(initial.kind || "draw");
  const [huntCode, setHuntCode] = useState(initial.hunt || "");
  const [drawYear, setDrawYear] = useState<number | undefined>(initial.year);
  const [drawing, setDrawing] = useState<DrawingSeason | null>(null);
  const [customDesc, setCustomDesc] = useState("");
  const [customUnit, setCustomUnit] = useState("");

  const st = states.find((s) => s.slug === slug);
  const sp = st?.species.find((s) => s.species === species);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    track("plan_start", { from: initial.from, state: initial.state, species: initial.species });
  }, [initial.from, initial.state, initial.species]);

  const go = (s: Step) => setStep(s);
  const idx = STEPS.indexOf(step);

  const summary: { step: Step; label: string }[] = [];
  if (slug === OTHER_STATE) summary.push({ step: "state", label: "Another state" });
  else if (st) summary.push({ step: "state", label: st.name });
  if (sp) summary.push({ step: "species", label: sp.label });
  if (residency) summary.push({ step: "residency", label: residency === "resident" ? "Resident" : "Nonresident" });
  if (step === "review") summary.push({ step: "hunt", label: kind === "draw" ? huntCode : kind === "otc" ? "General / OTC" : "Your own hunt" });

  if (slug === OTHER_STATE) {
    return (
      <Shell step={step} idx={0} total={1} headingRef={headingRef} title="A state we don't cover yet" summary={[]} onEdit={go}>
        <ManualHunt
          covered={states.map((s) => s.name)}
          onBack={() => setSlug("")}
          onSave={(h) => {
            sync.update((prev) => ({ ...prev, hunts: [...prev.hunts, h] }));
            track("plan_save", { state: h.state, species: h.species, kind: "custom", storage: sync.account ? "account" : "browser" });
            router.push(`/planner/hunt/${h.id}?saved=1`);
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell step={step} idx={idx} total={STEPS.length} headingRef={headingRef} title={stepTitle(step, st, sp)} summary={summary} onEdit={go}>
      {step === "state" && (
        <StatePick
          states={states}
          value={slug}
          onPick={(s) => {
            if (s !== slug) {
              setSpecies("");
              setHuntCode("");
            }
            setSlug(s);
            if (s !== OTHER_STATE) go("species");
          }}
        />
      )}
      {step === "species" && st && (
        <SpeciesPick
          st={st}
          value={species}
          onBack={() => go("state")}
          onPick={(s) => {
            if (s !== species) setHuntCode("");
            setSpecies(s);
            go("residency");
          }}
        />
      )}
      {step === "residency" && st && sp && (
        <ResidencyPick
          st={st}
          value={residency}
          onBack={() => go("species")}
          onPick={(r) => {
            setResidency(r);
            go("hunt");
          }}
        />
      )}
      {step === "hunt" && st && sp && residency && (
        <HuntPick
          st={st}
          sp={sp}
          residency={residency}
          kind={kind}
          huntCode={huntCode}
          customDesc={customDesc}
          customUnit={customUnit}
          onBack={() => go("residency")}
          onCustom={(d, u) => {
            setCustomDesc(d);
            setCustomUnit(u);
          }}
          onPick={(k, code, year) => {
            setKind(k);
            if (k === "draw") {
              setHuntCode(code || "");
              setDrawYear(year);
            }
            setDrawing(null);
            go("review");
          }}
        />
      )}
      {step === "review" && st && sp && residency && (
        <Review
          st={st}
          sp={sp}
          residency={residency}
          kind={kind}
          huntCode={huntCode}
          drawYear={drawYear}
          drawing={drawing}
          customDesc={customDesc}
          customUnit={customUnit}
          onDrawing={setDrawing}
          onBack={() => go("hunt")}
          onSaved={(id, dup) => router.push(`/planner/hunt/${id}${dup ? "?duplicate=1" : "?saved=1"}`)}
        />
      )}
    </Shell>
  );
}

function stepTitle(step: Step, st?: FlowState, sp?: FlowSpecies): string {
  switch (step) {
    case "state":
      return "Which state?";
    case "species":
      return `What are you hunting in ${st?.name}?`;
    case "residency":
      return `Are you applying in ${st?.name} as a resident?`;
    case "hunt":
      return `Which ${sp?.label.toLowerCase()} hunt?`;
    case "review":
      return "Review your hunt";
  }
}

function Shell({
  step,
  idx,
  total,
  title,
  summary,
  onEdit,
  headingRef,
  children,
}: {
  step: Step;
  idx: number;
  total: number;
  title: string;
  summary: { step: Step; label: string }[];
  onEdit: (s: Step) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {total > 1 && (
        <nav aria-label="Plan a hunt progress" className="mb-4">
          <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-1">
                <span
                  aria-current={s === step ? "step" : undefined}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${
                    s === step ? "bg-primary text-primary-foreground" : i < idx ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < idx && <Check className="w-3 h-3" aria-hidden />}
                  {STEP_TITLES[s]}
                </span>
                {i < STEPS.length - 1 && <ChevronRight className="w-3 h-3 text-muted-foreground" aria-hidden />}
              </li>
            ))}
          </ol>
          <p className="sr-only">
            Step {idx + 1} of {total}
          </p>
        </nav>
      )}
      {summary.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {summary.map((s) => (
            <button
              key={s.step}
              type="button"
              onClick={() => onEdit(s.step)}
              className="inline-flex min-h-9 max-w-full items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground hover:border-primary/40 cursor-pointer"
              aria-label={`Change ${STEP_TITLES[s.step].toLowerCase()}: ${s.label}`}
            >
              <span className="text-muted-foreground">{STEP_TITLES[s.step]}:</span> <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}
      <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-foreground mb-4 outline-none">
        {title}
      </h2>
      {children}
    </div>
  );
}

function StatePick({ states, value, onPick }: { states: FlowState[]; value: string; onPick: (slug: string) => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">State</legend>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {states.map((s) => (
          <label key={s.slug} className={choiceCls}>
            <input type="radio" name={name} value={s.slug} checked={value === s.slug} onChange={() => onPick(s.slug)} className="mt-1 accent-[var(--primary)]" />
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">{s.name}</span>
              <span className="block text-xs text-muted-foreground">{s.agency}</span>
            </span>
          </label>
        ))}
      </div>
      <button type="button" onClick={() => onPick(OTHER_STATE)} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-primary hover:underline cursor-pointer">
        Hunting a state we don&apos;t cover yet? Add it yourself
      </button>
    </fieldset>
  );
}

function SpeciesPick({ st, value, onPick, onBack }: { st: FlowState; value: string; onPick: (s: Species) => void; onBack: () => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">Species in {st.name}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {st.species.map((s) => (
          <label key={s.species} className={choiceCls}>
            <input type="radio" name={name} value={s.species} checked={value === s.species} onChange={() => onPick(s.species)} className="mt-1 accent-[var(--primary)]" />
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">{s.label}</span>
              <span className="block text-xs text-muted-foreground">
                {s.drawSystem}
                {s.otc ? " · general/OTC licenses too" : ""}
                {!s.hasDraw ? " · no draw table" : ""}
              </span>
            </span>
          </label>
        ))}
      </div>
      <BackRow onBack={onBack} />
    </fieldset>
  );
}

function ResidencyPick({ st, value, onPick, onBack }: { st: FlowState; value: string; onPick: (r: PlannerResidency) => void; onBack: () => void }) {
  const name = useId();
  return (
    <fieldset>
      <legend className="sr-only">Residency</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {(["resident", "nonresident"] as const).map((r) => (
          <label key={r} className={choiceCls}>
            <input type="radio" name={name} value={r} checked={value === r} onChange={() => onPick(r)} className="mt-1 accent-[var(--primary)]" />
            <span>
              <span className="block font-semibold text-foreground">{r === "resident" ? `${st.name} resident` : "Nonresident"}</span>
              <span className="block text-xs text-muted-foreground">Dates, fees and draw odds are shown for {r}s.</span>
            </span>
          </label>
        ))}
      </div>
      <BackRow onBack={onBack} />
    </fieldset>
  );
}

function BackRow({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <button type="button" onClick={onBack} className={secondaryBtn}>
        <ArrowLeft className="w-4 h-4" aria-hidden /> Back
      </button>
      {children}
    </div>
  );
}

function HuntPick({
  st,
  sp,
  residency,
  kind,
  huntCode,
  customDesc,
  customUnit,
  onPick,
  onCustom,
  onBack,
}: {
  st: FlowState;
  sp: FlowSpecies;
  residency: PlannerResidency;
  kind: PlanKind;
  huntCode: string;
  customDesc: string;
  customUnit: string;
  onPick: (k: PlanKind, code?: string, year?: number) => void;
  onCustom: (desc: string, unit: string) => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<PlanKind>(sp.hasDraw ? kind : sp.otc ? "otc" : "custom");
  const [list, setList] = useState<HuntList | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("");
  const [picked, setPicked] = useState(huntCode);
  const searchId = useId();
  const radioName = useId();

  useEffect(() => {
    if (!sp.hasDraw) return;
    let live = true;
    loadHunts(st.slug, sp.species, residency)
      .then((l) => live && (setList(l), setErr(null)))
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [st.slug, sp.species, sp.hasDraw, residency]);

  const methods = useMemo(() => Array.from(new Set((list?.hunts || []).map((h) => h.method).filter((m): m is string => !!m))).sort(), [list]);
  const matches = useMemo(() => {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    return (list?.hunts || []).filter((h) => {
      if (method && h.method !== method) return false;
      const hay = `${h.code} ${h.units.join(" ")} ${h.description} ${h.seasonDates || ""}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
  }, [list, q, method]);
  const shown = matches.slice(0, 40);
  const pickedHunt = list?.hunts.find((h) => h.code === picked);

  const modeName = useId();
  const modes: { k: PlanKind; title: string; detail: string }[] = [
    ...(sp.hasDraw ? [{ k: "draw" as const, title: "A draw hunt", detail: `Search ${st.agency}'s ${list?.year ?? "latest"} hunt list by code, ${st.unitTerm.toLowerCase()} or description.` }] : []),
    ...(sp.otc ? [{ k: "otc" as const, title: "General / over-the-counter license", detail: sp.otc }] : []),
    { k: "custom" as const, title: "Describe your own", detail: "Landowner tag, raffle, private land, or a hunt not in the list. The agency's dates and fees for this species still come in." },
  ];

  return (
    <div>
      <fieldset>
        <legend className="text-sm font-semibold text-foreground mb-2">How will you get the tag?</legend>
        <div className="grid grid-cols-1 gap-2">
          {modes.map((m) => (
            <label key={m.k} className={choiceCls}>
              <input type="radio" name={modeName} value={m.k} checked={mode === m.k} onChange={() => setMode(m.k)} className="mt-1 accent-[var(--primary)]" />
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{m.title}</span>
                <span className="block text-xs text-muted-foreground break-words line-clamp-3">{m.detail}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {mode === "draw" && (
        <div className="mt-5">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
            <label htmlFor={searchId} className="relative block">
              <span className="sr-only">Search hunts by code, {st.unitTerm.toLowerCase()} or description</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                id={searchId}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Code, ${st.unitTerm.toLowerCase()} or description`}
                className={`${inputCls} pl-9`}
                autoComplete="off"
              />
            </label>
            {methods.length > 1 && (
              <label>
                <span className="sr-only">Weapon</span>
                <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
                  <option value="">Any weapon</option>
                  {methods.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            {err
              ? err
              : !list
                ? "Loading the hunt list…"
                : `${matches.length.toLocaleString("en-US")} of ${list.hunts.length.toLocaleString("en-US")} ${list.year ?? ""} hunts${matches.length > shown.length ? `, showing the first ${shown.length}; refine the search` : ""}. Last draw figures are for ${residency}s.`}
          </p>
          {list && (
            <fieldset className="mt-2">
              <legend className="sr-only">Hunts</legend>
              <ul className="space-y-2">
                {shown.map((h) => (
                  <li key={h.code}>
                    <label className={choiceCls}>
                      <input type="radio" name={radioName} value={h.code} checked={picked === h.code} onChange={() => setPicked(h.code)} className="mt-1 accent-[var(--primary)]" />
                      <span className="min-w-0 text-sm">
                        <span className="block font-mono font-semibold text-foreground break-all">{h.code}</span>
                        <span className="block text-foreground break-words">{h.description}</span>
                        <span className="block text-xs text-muted-foreground break-words">
                          {[h.method, h.sex && h.sex !== "all" ? h.sex : "", h.seasonDates ? `Season ${h.seasonDates}` : ""].filter(Boolean).join(" · ")}
                        </span>
                        <span className="block text-xs text-muted-foreground">{drawSummary(h, list.year, list.pointsMatter)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
        </div>
      )}

      {mode === "custom" && (
        <div className="mt-5 grid grid-cols-1 gap-3">
          <label>
            <span className="block text-sm font-semibold text-foreground mb-1">What&apos;s the hunt?</span>
            <input value={customDesc} onChange={(e) => onCustom(e.target.value, customUnit)} placeholder="e.g. Landowner voucher, archery bull" maxLength={300} className={inputCls} />
          </label>
          <label>
            <span className="block text-sm font-semibold text-foreground mb-1">
              {st.unitTerm} or area <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <input value={customUnit} onChange={(e) => onCustom(customDesc, e.target.value)} placeholder={`e.g. ${st.unitTerm} 61`} maxLength={200} className={inputCls} />
          </label>
        </div>
      )}

      <BackRow onBack={onBack}>
        <button
          type="button"
          className={primaryBtn}
          disabled={(mode === "draw" && !pickedHunt) || (mode === "custom" && !customDesc.trim() && !customUnit.trim())}
          onClick={() => onPick(mode, pickedHunt?.code, list?.year ?? undefined)}
        >
          Review {mode === "draw" && pickedHunt ? pickedHunt.code : "hunt"} <ChevronRight className="w-4 h-4" aria-hidden />
        </button>
      </BackRow>
    </div>
  );
}

function Review({
  st,
  sp,
  residency,
  kind,
  huntCode,
  drawYear,
  drawing,
  customDesc,
  customUnit,
  onDrawing,
  onBack,
  onSaved,
}: {
  st: FlowState;
  sp: FlowSpecies;
  residency: PlannerResidency;
  kind: PlanKind;
  huntCode: string;
  drawYear?: number;
  drawing: DrawingSeason | null;
  customDesc: string;
  customUnit: string;
  onDrawing: (d: DrawingSeason) => void;
  onBack: () => void;
  onSaved: (id: string, duplicate: boolean) => void;
}) {
  const [preview, setPreview] = useState<{ hunt: PlannedHunt; needsDrawing: boolean; duplicateOf?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  /** The spring/fall question stays on screen once asked, so the answer can be changed. */
  const [askDrawing, setAskDrawing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [points, setPoints] = useState<number | null>(null);
  const [pointsFromProfile, setPointsFromProfile] = useState(false);
  const [notes, setNotes] = useState("");
  const today = todayIso();
  const drawingName = useId();
  const notesId = useId();

  const body = useCallback(
    (extra: Record<string, unknown>) =>
      JSON.stringify({
        state: st.slug,
        species: sp.species,
        residency,
        kind,
        ...(kind === "draw" ? { huntCode, drawYear } : {}),
        ...(kind === "custom" ? { description: customDesc, unit: customUnit } : {}),
        ...(drawing ? { drawing } : {}),
        ...extra,
      }),
    [st.slug, sp.species, residency, kind, huntCode, drawYear, customDesc, customUnit, drawing]
  );

  useEffect(() => {
    let live = true;
    setLoading(true);
    setErr(null);
    fetch("/api/planner/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: body({ preview: true }) })
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as { hunt?: PlannedHunt; needsDrawing?: boolean; duplicateOf?: string; error?: string };
        if (!live) return;
        if (!r.ok || !b.hunt) {
          setPreview(null);
          setErr(r.status === 401 ? "Sign in to plan hunts." : r.status === 403 ? "Planning hunts is part of Pro." : b.error || "Couldn't assemble this hunt.");
        } else {
          setPreview({ hunt: b.hunt, needsDrawing: !!b.needsDrawing, duplicateOf: b.duplicateOf });
          if (b.needsDrawing) setAskDrawing(true);
        }
      })
      .catch(() => live && setErr("You're offline or the site couldn't be reached."))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [body]);

  // The member's saved points for this state + species (Pro profile), as the starting value.
  useEffect(() => {
    let live = true;
    fetch("/api/points", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { points?: Record<string, number> } | null) => {
        if (!live) return;
        const v = b?.points?.[`${st.slug}.${sp.species}`];
        setPoints((p) => (p === null ? (typeof v === "number" ? v : 0) : p));
        if (typeof v === "number") setPointsFromProfile(true);
      })
      .catch(() => live && setPoints((p) => (p === null ? 0 : p)));
    return () => {
      live = false;
    };
  }, [st.slug, sp.species]);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/planner/entries", { method: "POST", headers: { "Content-Type": "application/json" }, body: body({ pointsOwned: points ?? 0, notes }) });
      const b = (await r.json().catch(() => ({}))) as { status?: string; hunt?: PlannedHunt; error?: string };
      if (!r.ok || !b.hunt) {
        setErr(b.error || "Couldn't save this hunt. Try again.");
        return;
      }
      track("plan_save", {
        state: st.slug,
        species: sp.species,
        kind,
        residency,
        published: b.hunt.agency?.cyclePublished === true,
        storage: "account",
      });
      onSaved(b.hunt.id, b.status === "duplicate");
    } catch {
      setErr("You're offline or the site couldn't be reached. Nothing was saved.");
    } finally {
      setSaving(false);
    }
  }

  const h = preview?.hunt;
  const a = h?.agency;
  return (
    <div className="space-y-5">
      <p className="flex items-center gap-2 text-sm text-muted-foreground empty:hidden" role="status">
        {loading && (
          <>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Bringing together {st.agency}&apos;s dates, seasons and fees…
          </>
        )}
      </p>
      {err && (
        <p className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-sm text-foreground" role="alert">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-danger" aria-hidden /> {err}
        </p>
      )}
      {(askDrawing || preview?.needsDrawing) && (
        <fieldset className="rounded-xl border border-warning/40 bg-warning/10 p-3">
          <legend className="px-1 text-sm font-semibold text-foreground">Spring or fall?</legend>
          <p className="text-sm text-foreground mb-2">
            {st.agency} runs separate spring and fall drawings for {sp.label.toLowerCase()}, and its data doesn&apos;t say which this hunt is in. Pick one so we show the
            right dates; we won&apos;t guess.
          </p>
          <div className="flex flex-wrap gap-2">
            {(["spring", "fall"] as const).map((d) => (
              <label key={d} className={`${choiceCls} w-auto`}>
                <input type="radio" name={drawingName} value={d} checked={drawing === d} onChange={() => onDrawing(d)} className="mt-1 accent-[var(--primary)]" />
                <span className="font-semibold capitalize">{d} drawing</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {h && a && (
        <>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-lg font-bold text-foreground break-words">{huntTitle(h)}</div>
            <div className="text-sm text-muted-foreground break-words">
              {residency === "resident" ? "Resident" : "Nonresident"}
              {h.unit ? ` · ${h.unit}` : ""}
              {a.method ? ` · ${a.method}` : ""}
            </div>
            {a.description && <p className="mt-1 text-sm text-foreground break-words line-clamp-4">{a.description}</p>}
            {preview.duplicateOf && (
              <p className="mt-2 text-sm text-foreground">
                <Check className="inline w-4 h-4 text-success" aria-hidden /> Already in your planner.{" "}
                <Link href={`/planner/hunt/${preview.duplicateOf}`} className="font-semibold text-primary hover:underline">
                  Open it
                </Link>
              </p>
            )}
          </div>
          <ReviewSection title="Agency dates">
            <CycleNotice hunt={h} />
            <div className="mt-2">
              {(a.keyDates || []).length ? (
                <DateList hunt={h} today={today} include="dates" />
              ) : (
                <p className="text-sm text-muted-foreground">
                  No {residency} dates for this hunt in our data. <SourceLink href={a.sourceUrl}>Check {st.agency}</SourceLink>
                </p>
              )}
            </div>
          </ReviewSection>
          <ReviewSection title="Season">
            <SeasonBlock hunt={h} today={today} />
          </ReviewSection>
          <ReviewSection title="Fees">
            <FeeList hunt={h} />
          </ReviewSection>
          <ReviewSection title={kind === "draw" ? "Last draw and your points" : "How licenses are issued"}>
            {kind === "draw" && a.pointsMatter && (
              <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-foreground">Your {a.pointName || "points"}s</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  inputMode="numeric"
                  value={points ?? ""}
                  onChange={(e) => setPoints(Math.max(0, Math.min(99, parseInt(e.target.value) || 0)))}
                  className="w-20 min-h-11 px-2 border border-border rounded-lg bg-background text-base"
                />
                <span className="text-xs text-muted-foreground">{pointsFromProfile ? "From your saved points" : "Not in your saved points; enter yours"}</span>
              </label>
            )}
            <DrawFacts hunt={h} pointsOwned={points ?? 0} />
          </ReviewSection>
          {(huntSteps(h).length > 0 || (a.requirements || []).length > 0) && (
            <ReviewSection title="Your checklist will start with">
              <ul className="list-disc pl-5 text-sm text-foreground space-y-1">
                {huntSteps(h).map((s) => (
                  <li key={s.key} className="break-words">
                    {s.label}
                    {s.detail && <span className="block text-xs text-muted-foreground">{s.detail}</span>}
                  </li>
                ))}
              </ul>
            </ReviewSection>
          )}
          <label htmlFor={notesId} className="block">
            <span className="block text-sm font-semibold text-foreground mb-1">
              Notes <span className="font-normal text-muted-foreground">(optional, only you see these)</span>
            </span>
            <textarea id={notesId} value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} className={`${inputCls} resize-y`} data-clarity-mask="true" />
          </label>
        </>
      )}
      <BackRow onBack={onBack}>
        <button type="button" onClick={save} disabled={!h || saving || loading || (preview?.needsDrawing && !drawing)} className={primaryBtn}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />}
          {preview?.duplicateOf ? "Open the saved hunt" : "Save to my planner"}
        </button>
      </BackRow>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** A hunt in a state without agency data: the member's own entry, saved like any other planner edit. */
function ManualHunt({ covered: coveredNames, onSave, onBack }: { covered: string[]; onSave: (h: PlannedHunt) => void; onBack: () => void }) {
  const [state, setState] = useState("");
  const [species, setSpecies] = useState<Species>("elk");
  const [unit, setUnit] = useState("");
  const [season, setSeason] = useState<Season>("rifle");
  const [deadline, setDeadline] = useState("");
  const [seasonDates, setSeasonDates] = useState("");
  const [notes, setNotes] = useState("");
  const covered = new Set(coveredNames);
  const lbl = "block text-sm font-semibold text-foreground mb-1";
  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">We don&apos;t have agency data for this state yet, so the dates are yours to enter. It&apos;s saved like any other hunt.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label>
          <span className={lbl}>State</span>
          <select value={state} onChange={(e) => setState(e.target.value)} className={inputCls}>
            <option value="">Select a state…</option>
            {US_STATES.filter((s) => !covered.has(s)).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={lbl}>Species</span>
          <select
            value={species}
            onChange={(e) => {
              const v = e.target.value as Species;
              setSpecies(v);
              if (!SPECIES_SEASONS[v].includes(season)) setSeason(SPECIES_SEASONS[v][0]);
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
          <span className={lbl}>Unit / area</span>
          <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. Unit 12" className={inputCls} />
        </label>
        <label>
          <span className={lbl}>Season</span>
          <select value={season} onChange={(e) => setSeason(e.target.value as Season)} className={inputCls}>
            {SPECIES_SEASONS[species].map((s) => (
              <option key={s} value={s}>
                {SEASON_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={lbl}>Application deadline</span>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={inputCls} />
        </label>
        <label>
          <span className={lbl}>Season dates</span>
          <input value={seasonDates} onChange={(e) => setSeasonDates(e.target.value)} placeholder="e.g. Oct 12 – Nov 3" className={inputCls} />
        </label>
        <label className="sm:col-span-2">
          <span className={lbl}>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-y`} data-clarity-mask="true" />
        </label>
      </div>
      <BackRow onBack={onBack}>
        <button
          type="button"
          className={primaryBtn}
          disabled={!state || !unit.trim()}
          onClick={() =>
            onSave({
              id: generateId(),
              state,
              species,
              unit: unit.trim(),
              season,
              preferencePointsNeeded: 0,
              preferencePointsOwned: 0,
              applicationDeadline: deadline,
              seasonDates,
              status: "planning",
              notes,
              updatedAt: new Date().toISOString(),
              stepsDone: [],
              tasks: [],
              customDates: [],
            })
          }
        >
          <Check className="w-4 h-4" aria-hidden /> Save to my planner
        </button>
      </BackRow>
    </div>
  );
}
