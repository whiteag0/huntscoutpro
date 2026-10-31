"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { SPECIES_LABELS, type Species } from "@/data/types";
import { STATE_LIST } from "@/data/state-list";
import { DRAW_SYSTEM_LABELS } from "@/lib/agency-format";
import { parsePointValue, pointsKey, serializePoints, type PointsMap } from "@/lib/points-schema";
import type { ShortlistResult, ShortlistSpeciesOption } from "@/lib/shortlist";
import { ShortlistResults, shortPointName } from "@/components/shortlist/ShortlistResults";

export interface ShortlistInitial {
  species: Species;
  home: string;
  points: PointsMap;
  stretch: boolean;
  /** What the member typed about points in the onboarding form, as a reminder. */
  pointsNote: string;
  /** False when the account has no purchase record to save points on. */
  canSave: boolean;
  prefsError: boolean;
}

type Load = { state: "idle" } | { state: "loading" } | { state: "ready"; result: ShortlistResult } | { state: "error"; message: string };
type Save = { state: "idle" } | { state: "saving" } | { state: "saved"; stored: boolean } | { state: "error"; message: string };

async function fetchShortlist(species: Species, home: string, pts: string, stretch: boolean, signal?: AbortSignal): Promise<ShortlistResult> {
  const qs = new URLSearchParams({ species, home });
  if (pts) qs.set("pts", pts);
  if (stretch) qs.set("stretch", "1");
  const res = await fetch(`/api/shortlist?${qs}`, { cache: "no-store", signal });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as ShortlistResult;
}

const toInputs = (points: PointsMap) => Object.fromEntries(Object.entries(points).map(([k, v]) => [k, String(v)]));

export function ShortlistClient({ options, initial }: { options: ShortlistSpeciesOption[]; initial: ShortlistInitial }) {
  const [species, setSpecies] = useState<Species>(initial.species);
  const [home, setHome] = useState(initial.home);
  const [stretch, setStretch] = useState(initial.stretch);
  const [inputs, setInputs] = useState<Record<string, string>>(() => toInputs(initial.points));
  const [saved, setSaved] = useState<PointsMap>(initial.points);
  const [load, setLoad] = useState<Load>(initial.home ? { state: "loading" } : { state: "idle" });
  const [save, setSave] = useState<Save>({ state: "idle" });
  const [formError, setFormError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const option = options.find((o) => o.species === species) ?? options[0];
  const pointStates = useMemo(() => option?.states.filter((s) => s.pointsMatter) ?? [], [option]);
  const noPointStates = useMemo(() => option?.states.filter((s) => !s.pointsMatter) ?? [], [option]);

  // Members with a saved home state see their list straight away.
  useEffect(() => {
    if (!initial.home) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const pts = serializePoints(Object.fromEntries(Object.entries(initial.points).filter(([k]) => k.endsWith(`.${initial.species}`))));
    fetchShortlist(initial.species, initial.home, pts, initial.stretch, ctrl.signal)
      .then((result) => setLoad({ state: "ready", result }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setLoad({ state: "error", message: e.message });
      });
    return () => ctrl.abort();
  }, [initial]);

  /** The point entries for this species as typed: valid values, blanks to clear, and bad fields. */
  function readInputs() {
    const values: PointsMap = {};
    const bad: string[] = [];
    for (const st of pointStates) {
      const key = pointsKey(st.slug, species);
      const raw = (inputs[key] ?? "").trim();
      if (!raw) continue;
      const n = parsePointValue(raw);
      if (n === null) bad.push(st.name);
      else values[key] = n;
    }
    return { values, bad };
  }

  async function savePoints(values: PointsMap) {
    const changes: Record<string, number | null> = {};
    for (const st of pointStates) {
      const key = pointsKey(st.slug, species);
      const next = values[key];
      if (next !== saved[key]) changes[key] = next ?? null;
    }
    if (!Object.keys(changes).length) return;
    setSave({ state: "saving" });
    try {
      const res = await fetch("/api/points", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ points: changes }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Couldn't save your points.");
      const next = { ...saved };
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) delete next[k];
        else next[k] = v;
      }
      setSaved(body.stored ? (body.points as PointsMap) : next);
      setSave({ state: "saved", stored: body.stored === true });
    } catch (e) {
      setSave({ state: "error", message: (e as Error).message });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!home) {
      setFormError("Choose your home state so we know where you apply as a resident.");
      document.getElementById("sl-home")?.focus();
      return;
    }
    const { values, bad } = readInputs();
    if (bad.length) {
      setFormError(`Points must be whole numbers from 0 to 40. Check: ${bad.join(", ")}.`);
      const first = pointStates.find((s) => bad.includes(s.name));
      if (first) document.getElementById(`sl-pts-${first.slug}`)?.focus();
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("species", species);
    url.searchParams.set("home", home);
    if (stretch) url.searchParams.set("stretch", "1");
    else url.searchParams.delete("stretch");
    window.history.replaceState(window.history.state, "", url);

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoad({ state: "loading" });
    void savePoints(values);
    try {
      const result = await fetchShortlist(species, home, serializePoints(values), stretch, ctrl.signal);
      setLoad({ state: "ready", result });
      resultsRef.current?.focus();
    } catch (err) {
      if ((err as Error).name !== "AbortError") setLoad({ state: "error", message: (err as Error).message });
    }
  }

  const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div>
      <form onSubmit={onSubmit} className="bg-card border border-border rounded-2xl p-4 sm:p-6" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sl-species" className="block text-sm font-semibold text-foreground mb-1">
              Species
            </label>
            <select id="sl-species" value={species} onChange={(e) => setSpecies(e.target.value as Species)} className={field}>
              {options.map((o) => (
                <option key={o.species} value={o.species}>
                  {SPECIES_LABELS[o.species]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sl-home" className="block text-sm font-semibold text-foreground mb-1">
              Your home state
            </label>
            <select id="sl-home" value={home} onChange={(e) => setHome(e.target.value)} className={field} aria-describedby="sl-home-help">
              <option value="">Choose a state</option>
              {STATE_LIST.map((s) => (
                <option key={s.abbrev} value={s.abbrev}>
                  {s.name}
                </option>
              ))}
            </select>
            <p id="sl-home-help" className="text-xs text-muted-foreground mt-1">
              You&apos;re a resident there and a nonresident everywhere else.
            </p>
          </div>
        </div>

        {pointStates.length > 0 && (
          <fieldset className="mt-5">
            <legend className="text-sm font-semibold text-foreground">Your {SPECIES_LABELS[species].toLowerCase()} points</legend>
            <p id="sl-pts-help" className="text-xs text-muted-foreground mt-0.5">
              Points you hold going into the next draw, as each agency counts them. Leave a state blank if you don&apos;t know.
              {initial.canSave ? " We save these to your account." : ""}
            </p>
            {initial.pointsNote && (
              <p className="text-xs text-muted-foreground mt-1">
                You told us: <span className="italic text-foreground">&ldquo;{initial.pointsNote}&rdquo;</span>
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
              {pointStates.map((st) => {
                const key = pointsKey(st.slug, species);
                const id = `sl-pts-${st.slug}`;
                return (
                  <div key={key}>
                    <label htmlFor={id} className="block text-sm text-foreground">
                      {st.name}
                    </label>
                    <input
                      id={id}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={40}
                      step={1}
                      placeholder="—"
                      value={inputs[key] ?? ""}
                      onChange={(e) => setInputs((v) => ({ ...v, [key]: e.target.value }))}
                      aria-describedby={`${id}-kind sl-pts-help`}
                      className={`${field} mt-1 tabular-nums`}
                    />
                    <span id={`${id}-kind`} className="block text-[11px] text-muted-foreground mt-0.5">
                      {shortPointName(st.pointName)}s
                    </span>
                  </div>
                );
              })}
            </div>
          </fieldset>
        )}
        {noPointStates.length > 0 && (
          <p className="text-xs text-muted-foreground mt-4">
            No points needed in {noPointStates.map((s) => `${s.name} (${DRAW_SYSTEM_LABELS[s.drawSystem].toLowerCase()})`).join(", ")}: those hunts are ranked by last year&apos;s odds.
          </p>
        )}

        <div className="mt-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <label className="inline-flex items-start gap-2 text-sm text-foreground cursor-pointer">
            <input type="checkbox" checked={stretch} onChange={(e) => setStretch(e.target.checked)} className="mt-0.5 accent-[var(--primary)]" />
            <span>
              Include stretch hunts
              <span className="block text-xs text-muted-foreground">Not drawn at your points last year, but the lowest level drawn was within 2 points of yours.</span>
            </span>
          </label>
          <button
            type="submit"
            disabled={load.state === "loading"}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all disabled:opacity-60 cursor-pointer"
          >
            {load.state === "loading" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Search className="w-4 h-4" aria-hidden="true" />}
            Show last year&apos;s results
          </button>
        </div>

        <div aria-live="polite" className="text-sm mt-3 space-y-1">
          {formError && <p className="text-danger">{formError}</p>}
          {initial.prefsError && <p className="text-muted-foreground">We couldn&apos;t load your saved points and home state just now.</p>}
          {save.state === "saving" && <p className="text-muted-foreground">Saving your points…</p>}
          {save.state === "saved" &&
            (save.stored ? (
              <p className="text-success">Points saved to your account.</p>
            ) : (
              <p className="text-muted-foreground">These points apply to this search only: this account has no purchase record to save them to.</p>
            ))}
          {save.state === "error" && <p className="text-danger">{save.message}</p>}
        </div>
      </form>

      <div ref={resultsRef} tabIndex={-1} className="mt-6 sm:mt-8 focus:outline-none" aria-busy={load.state === "loading"}>
        {load.state === "loading" && (
          <div className="flex items-center gap-2 text-muted-foreground py-10 justify-center" role="status">
            <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            Going through last year&apos;s draw results…
          </div>
        )}
        {load.state === "error" && (
          <p className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-sm text-danger" role="alert">
            {load.message}
          </p>
        )}
        {load.state === "idle" && (
          <p className="text-sm text-muted-foreground text-center py-8">Choose your home state and enter your points to see where you drew last year.</p>
        )}
        {load.state === "ready" && <ShortlistResults result={load.result} />}
      </div>
    </div>
  );
}
