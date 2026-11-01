"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, CalendarArrowDown, Check, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { DemoGate } from "@/components/DemoGate";
import { SPECIES_LABELS } from "@/data/types";
import { todayIso } from "@/lib/agency-format";
import { linkOf, type AgencyFee, type HuntStatus, type PlannedHunt } from "@/lib/planner-schema";
import { cycleInfo, huntSteps, nextForHunt, countdown } from "@/lib/planner-timeline";
import { BUDGET_CATEGORIES, generateId } from "@/components/planner/defaults";
import { usePlannerSync } from "@/components/planner/usePlannerSync";
import { downloadCalendar, usePlannerRefresh } from "@/components/planner/actions";
import {
  CycleBadge,
  CycleNotice,
  DateList,
  DrawFacts,
  FeeList,
  STATUS_LABELS,
  SeasonBlock,
  SourceLink,
  SyncBadge,
  TONE_CLASS,
  dateRange,
  feeBudgetDescription,
  feeCategory,
  huntTitle,
} from "@/components/planner/PlannerParts";

const inputCls =
  "w-full min-h-11 px-3 py-2 border border-border rounded-lg bg-background text-foreground text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50";
const btn = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The status pipeline, in order. Drawn, alternate and not drawn are the three outcomes of one stage. */
const PIPELINE: HuntStatus[][] = [["planning"], ["applied"], ["drawn", "alternate", "not-drawn"], ["tag-purchased"], ["hunted"]];

export function HuntDetail({ id, flash }: { id: string; flash?: "saved" | "duplicate" }) {
  return (
    <div className="min-h-screen bg-background">
      <DemoGate feature="the Hunt Planner">
        <DetailBody id={id} flash={flash} />
      </DemoGate>
    </div>
  );
}

function DetailBody({ id, flash }: { id: string; flash?: "saved" | "duplicate" }) {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const sync = usePlannerSync({ ready: sessionStatus !== "loading", email: session?.user?.email?.trim().toLowerCase() || null, isPro: !!session?.user?.isPro });
  const { data, update, status, retry, account, flush, reload } = sync;
  const refresh = usePlannerRefresh({ enabled: account, hunts: data?.hunts ?? null, flush, reload });
  const [shownFlash, setShownFlash] = useState(flash);
  const today = todayIso();
  const hunt = data?.hunts.find((h) => h.id === id);

  // The copy in this browser can be older than the account (a hunt just saved from "Plan a hunt" is
  // only on the server until the first load finishes): wait for it before saying the hunt is gone.
  if (!data || (!hunt && status.kind === "loading")) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center text-muted-foreground" role="status">
        <Loader2 className="w-5 h-5 animate-spin mr-2" aria-hidden /> Loading your hunt…
      </div>
    );
  }
  if (!hunt) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-foreground">This hunt isn&apos;t in your planner</h1>
        <p className="text-muted-foreground mt-2">It may have been removed on another device.</p>
        <Link href="/planner" className={`${btn} mt-6 bg-primary text-primary-foreground`}>
          Back to the planner
        </Link>
      </div>
    );
  }

  const stamp = () => new Date().toISOString();
  const patch = (p: Partial<PlannedHunt> | ((h: PlannedHunt) => Partial<PlannedHunt>)) =>
    update((prev) => ({ ...prev, hunts: prev.hunts.map((h) => (h.id === id ? { ...h, ...(typeof p === "function" ? p(h) : p), updatedAt: stamp() } : h)) }));

  function remove() {
    if (!window.confirm(`Remove ${huntTitle(hunt!)} and its budget lines from your planner?`)) return;
    update((prev) => {
      const gone = prev.budget.filter((b) => b.huntId === id).map((b) => b.id);
      return { ...prev, hunts: prev.hunts.filter((h) => h.id !== id), budget: prev.budget.filter((b) => b.huntId !== id), deleted: [...prev.deleted, id, ...gone].slice(-600) };
    });
    router.push("/planner");
  }

  const a = hunt.agency;
  const next = nextForHunt(hunt, today);
  const myUpdate = refresh.result?.updates.find((u) => u.id === id);

  return (
    <>
      <section className="bg-gradient-to-br from-[#1a3a1a] via-[#0f2a0f] to-[#1c1917] text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <Link href="/planner" className="inline-flex min-h-10 items-center gap-1 text-sm text-white/70 hover:text-white">
            <ArrowLeft className="w-4 h-4" aria-hidden /> Hunt Planner
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 break-words">{huntTitle(hunt)}</h1>
          <p className="text-white/70 text-sm mt-1 break-words">
            {a ? `${a.residency === "resident" ? "Resident" : "Nonresident"} · ${a.agencyName}` : "Added by you"}
            {hunt.unit ? ` · ${hunt.unit}` : ""}
            {a?.method ? ` · ${a.method}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SyncBadge status={status} onRetry={retry} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => downloadCalendar([hunt], "hunt", huntTitle(hunt))}
              className={`${btn} border border-white/25 text-white hover:bg-white/10`}
            >
              <CalendarArrowDown className="w-4 h-4" aria-hidden /> Add to calendar (.ics)
            </button>
            {a && account && (
              <button type="button" onClick={() => void refresh.run([id])} disabled={refresh.busy} className={`${btn} border border-white/25 text-white hover:bg-white/10`}>
                {refresh.busy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />} Check for updated dates
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {shownFlash && (
          <Banner onClose={() => setShownFlash(undefined)}>
            {shownFlash === "duplicate" ? "This hunt was already in your planner, so nothing new was added." : "Saved to your planner."}
            {shownFlash === "saved" && a && !cycleInfo(a).published && ` We'll bring in ${cycleInfo(a).planCycle} dates when ${a.agencyShortName || a.agencyName} publishes them.`}
          </Banner>
        )}
        {(refresh.result || refresh.error) && (
          <Banner onClose={refresh.clear} tone={refresh.error ? "error" : "ok"}>
            {refresh.error ? (
              refresh.error
            ) : myUpdate ? (
              <>
                <strong>Updated dates from {a?.agencyShortName || a?.agencyName}:</strong>
                <ul className="mt-1 list-disc pl-5">
                  {myUpdate.changes.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <span className="block mt-1 text-xs text-muted-foreground">Your status, notes, points, checklist and own dates weren&apos;t changed.</span>
              </>
            ) : refresh.result?.unmatched.includes(id) ? (
              `${a?.huntCode || "This hunt"} isn't in ${a?.agencyShortName || "the agency"}'s latest draw data (it may have been dropped or renumbered), so it was kept as saved.`
            ) : (
              `No changes: ${a?.agencyShortName || "the agency"}'s data for this hunt is the same as when you saved it.`
            )}
          </Banner>
        )}

        <Card title="Status">
          <StatusPipeline value={hunt.status} onChange={(s) => patch({ status: s })} />
          {next && (
            <p className="mt-3 text-sm text-foreground">
              Next: <span className="font-semibold">{next.label}</span> · {dateRange(next.start, next.end)} ·{" "}
              <span className={TONE_CLASS[countdown(next, today).tone]}>{countdown(next, today).text}</span>
              {next.tentative ? " · tentative" : ""}
              {next.otherCycle ? ` · ${next.cycle} cycle` : ""}
            </p>
          )}
        </Card>

        <Card title="Dates" aside={<CycleBadge hunt={hunt} />}>
          <CycleNotice hunt={hunt} />
          <div className="mt-3">
            <DateList hunt={hunt} today={today} include="dates" onRemoveCustom={(cid) => patch((h) => ({ customDates: (h.customDates || []).filter((c) => c.id !== cid) }))} />
          </div>
          {!a && !hunt.applicationDeadline && !(hunt.customDates || []).length && <p className="text-sm text-muted-foreground">No dates yet. Add your own below.</p>}
          {a && !a.deadline && (
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-foreground">Your application date, if you know it:</span>
              <input
                type="date"
                value={hunt.applicationDeadline}
                onChange={(e) => patch({ applicationDeadline: e.target.value })}
                className="min-h-11 px-2 border border-border rounded-lg bg-background text-base"
              />
            </label>
          )}
          <AddCustomDate onAdd={(c) => patch((h) => ({ customDates: [...(h.customDates || []), c].slice(0, 20) }))} />
        </Card>

        <Card title="Season">
          <SeasonBlock hunt={hunt} today={today} />
        </Card>

        <Card title="Points">
          <PointsBlock hunt={hunt} onChange={patch} />
        </Card>

        <Card title="Checklist">
          <Checklist hunt={hunt} onChange={patch} />
        </Card>

        <Card title="Budget">
          <BudgetBlock hunt={hunt} sync={sync} />
        </Card>

        <Card title="Notes">
          <NotesBlock hunt={hunt} onChange={(notes) => patch({ notes })} />
        </Card>

        {a && (
          <Card title="Draw system and agency notes">
            <DrawFacts hunt={hunt} pointsOwned={hunt.preferencePointsOwned} />
            {(a.requirements || []).length > 0 && (
              <div className="mt-3 text-sm">
                <div className="font-semibold text-foreground">Requirements {a.agencyShortName || "the agency"} notes</div>
                <ul className="list-disc pl-5 text-muted-foreground">
                  {a.requirements!.map((r) => (
                    <li key={r} className="break-words">
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        )}

        {a && (
          <Card title="Links">
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link href={`/states/${a.stateSlug}`} className="text-primary hover:underline">
                  {hunt.state} draw and harvest tables
                </Link>
              </li>
              {a.units.slice(0, 8).map((u) => (
                <li key={u}>
                  <Link href={`/states/${a.stateSlug}/units/${encodeURIComponent(u)}?species=${hunt.species}`} className="text-primary hover:underline">
                    {a.unitTerm} {u}: {SPECIES_LABELS[hunt.species].toLowerCase()} history
                  </Link>
                </li>
              ))}
              {Array.from(new Set([a.sourceUrl, ...(a.links || []), a.deadline?.sourceUrl].filter((x): x is string => !!x))).map((u) => (
                <li key={u} className="break-all">
                  <SourceLink href={u}>{u === a.sourceUrl && a.sourceTitle ? a.sourceTitle : u.replace(/^https?:\/\/(www\.)?/, "").slice(0, 80)}</SourceLink>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Planned {new Date(a.addedAt).toLocaleDateString("en-US")}
              {a.refreshedAt ? ` · agency data last updated ${new Date(a.refreshedAt).toLocaleDateString("en-US")}` : ""}.
            </p>
          </Card>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={remove} className={`${btn} text-danger hover:bg-danger/10`}>
            <Trash2 className="w-4 h-4" aria-hidden /> Remove this hunt
          </button>
        </div>
      </div>
    </>
  );
}

function Card({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  const hid = useId();
  return (
    <section aria-labelledby={hid} className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={hid} className="text-base font-bold text-foreground">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Banner({ children, onClose, tone = "ok" }: { children: React.ReactNode; onClose: () => void; tone?: "ok" | "error" }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm text-foreground ${tone === "error" ? "border-danger/40 bg-danger/5" : "border-success/40 bg-success/10"}`}
    >
      <div className="flex-1 min-w-0">{children}</div>
      <button type="button" onClick={onClose} className="-m-1.5 p-2 rounded-md text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Dismiss">
        <X className="w-4 h-4" aria-hidden />
      </button>
    </div>
  );
}

function StatusPipeline({ value, onChange }: { value: HuntStatus; onChange: (s: HuntStatus) => void }) {
  const name = useId();
  const stageOf = (s: HuntStatus) => PIPELINE.findIndex((g) => g.includes(s));
  const current = stageOf(value);
  return (
    <fieldset>
      <legend className="sr-only">Hunt status</legend>
      <ol className="flex flex-wrap items-center gap-1.5">
        {PIPELINE.map((group, i) => (
          <li key={i} className="flex flex-wrap items-center gap-1.5">
            {group.map((s) => (
              <label
                key={s}
                className={`inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${
                  value === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : i < current
                      ? "border-success/30 bg-success/10 text-success"
                      : "border-border bg-background text-foreground hover:border-primary/40"
                }`}
              >
                <input type="radio" name={name} value={s} checked={value === s} onChange={() => onChange(s)} className="sr-only" />
                {i < current && <Check className="w-3.5 h-3.5" aria-hidden />}
                {STATUS_LABELS[s]}
              </label>
            ))}
            {i < PIPELINE.length - 1 && (
              <span className="text-muted-foreground" aria-hidden>
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </fieldset>
  );
}

function AddCustomDate({ onAdd }: { onAdd: (c: { id: string; label: string; date: string; end?: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [end, setEnd] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-primary hover:underline cursor-pointer">
        <Plus className="w-4 h-4" aria-hidden /> Add your own date
      </button>
    );
  }
  return (
    <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
      <label>
        <span className="block text-xs font-semibold text-muted-foreground mb-1">What</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Book flights, scouting trip" maxLength={160} className={inputCls} />
      </label>
      <label>
        <span className="block text-xs font-semibold text-muted-foreground mb-1">Date</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </label>
      <label>
        <span className="block text-xs font-semibold text-muted-foreground mb-1">Until (optional)</span>
        <input type="date" value={end} min={date || undefined} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!label.trim() || !date}
          onClick={() => {
            onAdd({ id: generateId(), label: label.trim(), date, ...(end && end > date ? { end } : {}) });
            setLabel("");
            setDate("");
            setEnd("");
            setOpen(false);
          }}
          className={`${btn} bg-primary text-primary-foreground hover:bg-primary-light`}
        >
          Add
        </button>
        <button type="button" onClick={() => setOpen(false)} className={`${btn} border border-border`}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function PointsBlock({ hunt, onChange }: { hunt: PlannedHunt; onChange: (p: Partial<PlannedHunt>) => void }) {
  const a = hunt.agency;
  const pointName = a?.pointName || "point";
  const min = a?.minPoints;
  const clamp = (v: string) => Math.max(0, Math.min(99, parseInt(v) || 0));
  if (a && a.pointsMatter === false) {
    return <p className="text-sm text-muted-foreground">{a.agencyShortName || "The agency"}&apos;s draw for this species doesn&apos;t use points.</p>;
  }
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3 text-sm">
      <label>
        <span className="block text-xs font-semibold text-muted-foreground mb-1">Your {pointName}s</span>
        <input type="number" min={0} max={99} inputMode="numeric" value={hunt.preferencePointsOwned} onChange={(e) => onChange({ preferencePointsOwned: clamp(e.target.value) })} className="w-24 min-h-11 px-2 border border-border rounded-lg bg-background text-base" />
      </label>
      {a ? (
        <div>
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Lowest drawn ({a.drawYear || "last draw"})</span>
          <span className="text-lg font-bold text-foreground tabular-nums">{min ?? "—"}</span>
          {min !== null && min !== undefined && (
            <span className={`ml-2 ${hunt.preferencePointsOwned >= min ? "text-success" : "text-muted-foreground"}`}>
              {hunt.preferencePointsOwned >= min ? "you're at or above it" : `${min - hunt.preferencePointsOwned} below it`}
            </span>
          )}
        </div>
      ) : (
        <label>
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Points you think you need</span>
          <input type="number" min={0} max={99} inputMode="numeric" value={hunt.preferencePointsNeeded} onChange={(e) => onChange({ preferencePointsNeeded: clamp(e.target.value) })} className="w-24 min-h-11 px-2 border border-border rounded-lg bg-background text-base" />
        </label>
      )}
      {a && <p className="basis-full text-xs text-muted-foreground">Past results only; the next draw can need more or fewer points.</p>}
    </div>
  );
}

function Checklist({ hunt, onChange }: { hunt: PlannedHunt; onChange: (p: (h: PlannedHunt) => Partial<PlannedHunt>) => void }) {
  const steps = useMemo(() => huntSteps(hunt), [hunt]);
  const [label, setLabel] = useState("");
  const done = new Set(hunt.stepsDone || []);
  const tasks = hunt.tasks || [];
  const total = steps.length + tasks.length;
  const count = steps.filter((s) => done.has(s.key)).length + tasks.filter((t) => t.done).length;
  const toggleStep = (key: string) =>
    onChange((h) => {
      const set = new Set(h.stepsDone || []);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      return { stepsDone: Array.from(set).slice(0, 30) };
    });
  const add = () => {
    const l = label.trim();
    if (!l) return;
    onChange((h) => ({ tasks: [...(h.tasks || []), { id: generateId(), label: l.slice(0, 160), done: false }].slice(0, 30) }));
    setLabel("");
  };
  return (
    <div>
      {total > 0 && (
        <p className="text-xs text-muted-foreground mb-2">
          {count} of {total} done
        </p>
      )}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {steps.map((s) => (
          <li key={s.key} className="px-3 py-1">
            <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
              <input type="checkbox" checked={done.has(s.key)} onChange={() => toggleStep(s.key)} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]" />
              <span className="min-w-0 text-sm">
                <span className={done.has(s.key) ? "line-through text-muted-foreground" : "text-foreground"}>{s.label}</span>
                {s.detail && <span className="block text-xs text-muted-foreground break-words">{s.detail}</span>}
              </span>
            </label>
          </li>
        ))}
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2 px-3 py-1">
            <label className="flex flex-1 min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={t.done}
                onChange={() => onChange((h) => ({ tasks: (h.tasks || []).map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }))}
                className="h-5 w-5 shrink-0 accent-[var(--primary)]"
              />
              <span className={`text-sm break-words ${t.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{t.label}</span>
            </label>
            <button
              type="button"
              onClick={() => onChange((h) => ({ tasks: (h.tasks || []).filter((x) => x.id !== t.id) }))}
              className="p-2.5 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 cursor-pointer"
              aria-label={`Remove ${t.label}`}
            >
              <X className="w-4 h-4" aria-hidden />
            </button>
          </li>
        ))}
        {total === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No steps yet. Add your own below.</li>}
      </ul>
      <div className="mt-3 flex gap-2">
        <label className="flex-1">
          <span className="sr-only">New checklist item</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Add an item, e.g. Scouting trip in August" maxLength={160} className={inputCls} />
        </label>
        <button type="button" onClick={add} disabled={!label.trim()} className={`${btn} bg-primary text-primary-foreground hover:bg-primary-light`}>
          Add
        </button>
      </div>
    </div>
  );
}

function BudgetBlock({ hunt, sync }: { hunt: PlannedHunt; sync: ReturnType<typeof usePlannerSync> }) {
  const lines = (sync.data?.budget || []).filter((b) => b.huntId === hunt.id);
  const total = lines.reduce((s, b) => s + b.amount, 0);
  const [category, setCategory] = useState(BUDGET_CATEGORIES[4]);
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const a = hunt.agency;
  function addFee(f: AgencyFee) {
    const description = feeBudgetDescription(f);
    const sourceUrl = a ? linkOf(a, f) : f.sourceUrl;
    sync.update((prev) =>
      prev.budget.some((b) => b.huntId === hunt.id && b.description === description)
        ? prev
        : {
            ...prev,
            budget: [...prev.budget, { id: generateId(), huntId: hunt.id, category: feeCategory(f), description, amount: f.amountUsd, licenseYear: f.licenseYear, ...(sourceUrl ? { sourceUrl } : {}) }],
          }
    );
  }
  function addLine() {
    const amt = parseFloat(amount);
    if (!desc.trim() || !Number.isFinite(amt)) return;
    sync.update((prev) => ({ ...prev, budget: [...prev.budget, { id: generateId(), huntId: hunt.id, category, description: desc.trim(), amount: amt }] }));
    setDesc("");
    setAmount("");
  }
  return (
    <div className="space-y-4">
      {lines.length > 0 ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {lines.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <div className="flex-1 min-w-0">
                <div className="text-foreground break-words">{b.description}</div>
                <div className="text-[11px] text-muted-foreground">
                  {b.category}
                  {b.sourceUrl && (
                    <>
                      {" · "}
                      <SourceLink href={b.sourceUrl}>agency fee table</SourceLink>
                    </>
                  )}
                </div>
              </div>
              <div className="font-semibold tabular-nums">{money(b.amount)}</div>
              <button
                type="button"
                onClick={() => sync.update((prev) => ({ ...prev, budget: prev.budget.filter((x) => x.id !== b.id), deleted: [...prev.deleted, b.id].slice(-600) }))}
                className="p-2.5 -m-1 rounded-lg text-muted-foreground hover:text-danger hover:bg-danger/10 cursor-pointer"
                aria-label={`Remove ${b.description}`}
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            </li>
          ))}
          <li className="flex justify-between px-3 py-2 text-sm font-bold">
            <span>Total</span>
            <span className="tabular-nums">{money(total)}</span>
          </li>
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No costs yet. Add agency fees below with one tap, or your own (travel, lodging, gear…).</p>
      )}
      {a && <FeeList hunt={hunt} budget={sync.data?.budget} onAddFee={addFee} />}
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_8rem_auto] gap-2 items-end">
        <label>
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
            {BUDGET_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Description</span>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Gas, two tanks" maxLength={300} className={inputCls} />
        </label>
        <label>
          <span className="block text-xs font-semibold text-muted-foreground mb-1">Amount ($)</span>
          <input type="number" min={0} step={0.01} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} />
        </label>
        <button type="button" onClick={addLine} disabled={!desc.trim() || !amount} className={`${btn} bg-primary text-primary-foreground hover:bg-primary-light`}>
          Add cost
        </button>
      </div>
    </div>
  );
}

function NotesBlock({ hunt, onChange }: { hunt: PlannedHunt; onChange: (notes: string) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <span className="sr-only">Notes for {huntTitle(hunt)}</span>
      <textarea
        id={id}
        value={hunt.notes}
        onChange={(e) => onChange(e.target.value.slice(0, 2000))}
        rows={4}
        placeholder="Access notes, camp spots, who's going, research links…"
        className={`${inputCls} resize-y`}
        data-clarity-mask="true"
      />
      <span className="mt-1 block text-xs text-muted-foreground">Only you see your notes. They&apos;re hidden from session recordings.</span>
    </label>
  );
}
