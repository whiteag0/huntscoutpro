"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  Crosshair,
  Loader2,
  MapPin,
  Search,
  Target,
  Trophy,
  X,
} from "lucide-react";
import {
  EMPTY_PREFERENCES,
  GOAL_OPTIONS,
  LIMITS,
  METHOD_OPTIONS,
  type HuntingPreferences,
} from "@/lib/preferences-schema";
import { SPECIES_LABELS, type Species } from "@/data/types";
import {
  OTHER_STATES,
  STATE_LIST,
  WESTERN_DRAW_STATES,
  stateBySlug,
  type StateListItem,
} from "@/data/state-list";
import { markOnboardedLocally } from "@/components/OnboardingGate";

const STEPS = [
  { id: "where", title: "Where you hunt", short: "Where", icon: MapPin },
  { id: "what", title: "Species & method", short: "Species", icon: Crosshair },
  { id: "units", title: "Units & points", short: "Units", icon: Target },
  { id: "goals", title: "Your goals", short: "Goals", icon: Trophy },
] as const;

const SPECIES_OPTIONS = (Object.keys(SPECIES_LABELS) as Species[]).map((id) => ({ id, label: SPECIES_LABELS[id] }));

const RESIDENCY_OPTIONS = [
  { id: "resident", label: "Resident", hint: "I hunt my home state" },
  { id: "nonresident", label: "Non-resident", hint: "I hunt out of state" },
  { id: "both", label: "Both", hint: "Home state and out of state" },
] as const;

type SaveState = { kind: "idle" } | { kind: "saving" | "skipping" } | { kind: "done"; to: string; label: string };

function withDefaults(raw: Partial<HuntingPreferences> | null | undefined): HuntingPreferences {
  const p = { ...EMPTY_PREFERENCES, ...(raw ?? {}) };
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    states: arr(p.states),
    residency: (["resident", "nonresident", "both"] as const).find((r) => r === p.residency) ?? "",
    homeState: str(p.homeState),
    species: arr(p.species),
    units: str(p.units),
    methods: arr(p.methods),
    points: str(p.points),
    goals: arr(p.goals),
    notes: str(p.notes),
  };
}

function toggle(list: string[], id: string, max: number = LIMITS.listItems): string[] {
  if (list.includes(id)) return list.filter((x) => x !== id);
  return list.length >= max ? list : [...list, id];
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-6 sm:p-8 text-center">{children}</div>
    </div>
  );
}

function Spinner({ label }: { label: string }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center" role="status">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-4" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>
    </div>
  );
}

function Chip({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled && !selected}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 min-h-10 px-3.5 py-2 rounded-full border text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-40 disabled:cursor-not-allowed ${
        selected
          ? "border-gold bg-gold/15 text-foreground"
          : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-gold/60"
      }`}
    >
      {selected && <Check className="w-3.5 h-3.5 text-gold shrink-0" aria-hidden="true" />}
      {children}
    </button>
  );
}

function Question({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  const hintId = useId();
  return (
    <fieldset className="space-y-3 min-w-0" aria-describedby={hint ? hintId : undefined}>
      <legend className="text-base font-semibold text-foreground">{title}</legend>
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground -mt-1">
          {hint}
        </p>
      )}
      {children}
    </fieldset>
  );
}

function TextQuestion({
  id,
  label,
  hint,
  placeholder,
  value,
  max,
  rows = 3,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  placeholder?: string;
  value: string;
  max: number;
  rows?: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-base font-semibold text-foreground">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground -mt-1">
          {hint}
        </p>
      )}
      <textarea
        id={id}
        rows={rows}
        maxLength={max}
        value={value}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint ${id}-count` : `${id}-count`}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold resize-y"
      />
      <p id={`${id}-count`} className="text-xs text-muted-foreground text-right tabular-nums">
        {value.length}/{max}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function WelcomePage() {
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const user = session?.user;
  const hasAccess = !!user && (user.isPro || user.isSuperAdmin);

  const [prefs, setPrefs] = useState<HuntingPreferences>(EMPTY_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [loadWarning, setLoadWarning] = useState(false);
  const [alreadyOnboarded, setAlreadyOnboarded] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [query, setQuery] = useState("");

  const fetchedFor = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepChanged = useRef(false);

  // Prefill from saved answers once per signed-in user. update() flips status
  // to "loading" and back, so key the fetch on the user id, not on status.
  // `||`, not `??`: the session callback fills a missing id with "".
  const userId = user?.id || user?.email || null;
  useEffect(() => {
    if (status !== "authenticated" || !hasAccess || !userId) return;
    if (fetchedFor.current === userId) return;
    fetchedFor.current = userId;
    (async () => {
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { preferences: HuntingPreferences | null; onboarded: boolean };
          if (data.preferences) setPrefs(withDefaults(data.preferences));
          setAlreadyOnboarded(!!data.onboarded);
        } else if (res.status !== 404) {
          setLoadWarning(true);
        }
      } catch {
        setLoadWarning(true);
      } finally {
        setLoaded(true);
      }
    })();
  }, [status, hasAccess, userId]);

  // Move focus to the step heading when the step changes (not on first render).
  useEffect(() => {
    if (!stepChanged.current) return;
    headingRef.current?.focus();
  }, [step]);

  const set = <K extends keyof HuntingPreferences>(key: K, value: HuntingPreferences[K]) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    if (error) setError(null);
  };

  const goTo = (i: number) => {
    stepChanged.current = true;
    setStep(Math.max(0, Math.min(STEPS.length - 1, i)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filteredStates = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    // Rank so Enter adds the obvious state: "wa" -> Washington (not Delaware),
    // "or" -> Oregon (not California), "id" -> Idaho (not Florida).
    const rank = (s: StateListItem) => {
      const name = s.name.toLowerCase();
      if (s.abbrev.toLowerCase() === q) return 0;
      if (name.startsWith(q)) return 1;
      if (name.split(" ").some((w) => w.startsWith(q))) return 2;
      return name.includes(q) ? 3 : -1;
    };
    return STATE_LIST.map((s) => ({ s, r: rank(s) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r)
      .map((x) => x.s);
  }, [query]);

  const busy = save.kind === "saving" || save.kind === "skipping";
  const editing = alreadyOnboarded || !!user?.onboarded;
  const firstName = user?.name?.split(" ")[0] ?? null;

  async function post(body: unknown) {
    const res = await fetch("/api/preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let msg = "";
      try {
        msg = ((await res.json()) as { error?: string }).error ?? "";
      } catch {}
      throw new Error(msg || `Request failed (${res.status})`);
    }
    // The server has saved it, so this tab must never bounce back here, even if
    // the session refresh below fails (update() resolves null on a network error
    // and undefined if another session fetch is already in flight).
    markOnboardedLocally(user?.email);
    // Flip the session flag before navigating so the onboarding gate lets them
    // through on other tabs and after reloads too. One retry; non-fatal.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const next = await update({ onboarded: true });
        if (next?.user?.onboarded) break;
      } catch {}
      if (attempt === 0) await new Promise((r) => setTimeout(r, 600));
    }
  }

  async function submit() {
    if (busy) return;
    if (prefs.states.length === 0 && prefs.species.length === 0) {
      setError("Pick at least one state or one species so we know where to start.");
      if (step !== 0 && step !== 1) goTo(0);
      return;
    }
    setError(null);
    setSave({ kind: "saving" });
    try {
      await post({ preferences: prefs });
      const first = prefs.states[0] ? stateBySlug(prefs.states[0]) : undefined;
      const to = first ? `/states/${first.slug}` : "/states";
      setSave({ kind: "done", to, label: first ? first.name : "your states" });
      router.push(to);
    } catch (e) {
      setSave({ kind: "idle" });
      setError(
        `We couldn't save your answers${e instanceof Error && e.message ? ` (${e.message})` : ""}. Please try again, or email support@huntscoutpro.com.`
      );
    }
  }

  async function skip() {
    if (busy) return;
    setError(null);
    setSave({ kind: "skipping" });
    try {
      await post({ skip: true });
      setSave({ kind: "done", to: "/states", label: "the states" });
      router.push("/states");
    } catch (e) {
      setSave({ kind: "idle" });
      setError(
        `Something went wrong${e instanceof Error && e.message ? ` (${e.message})` : ""}. Please try again in a moment.`
      );
    }
  }

  // ---- Gate states -------------------------------------------------------

  if (status === "loading" && !session) return <Spinner label="Loading your account…" />;

  if (!user) {
    return (
      <CenteredCard>
        <div className="mx-auto w-12 h-12 rounded-full bg-gold/15 flex items-center justify-center mb-4">
          <Crosshair className="w-6 h-6 text-gold" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Sign in to set up your hunting profile</h1>
        <p className="text-muted-foreground mb-6">
          Use the same Google account you checked out with and we&apos;ll pick up right where you left off.
        </p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/welcome" })}
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all cursor-pointer"
        >
          Sign in with Google
        </button>
      </CenteredCard>
    );
  }

  if (!hasAccess) {
    return (
      <CenteredCard>
        <h1 className="text-2xl font-bold mb-2">This page is for Pro members</h1>
        <p className="text-muted-foreground mb-6">
          We couldn&apos;t find a membership on <span className="text-foreground font-medium">{user.email}</span>. If
          you&apos;ve already purchased, check that you&apos;re signed in with the Google account you used at checkout.
          Your account page can re-check it for you.
        </p>
        <Link
          href="/account"
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl font-semibold border border-border hover:bg-muted transition-all"
        >
          Go to My Account <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </CenteredCard>
    );
  }

  if (save.kind === "done") {
    return (
      <CenteredCard>
        <div className="mx-auto w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mb-5">
          <Check className="w-7 h-7 text-green-500" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-bold mb-2" role="status">
          {firstName ? `You're all set, ${firstName}.` : "You're all set."}
        </h1>
        <p className="text-muted-foreground mb-6">Taking you to {save.label}…</p>
        <Link href={save.to} className="inline-flex items-center gap-1 text-sm font-medium text-gold hover:underline">
          Continue <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </CenteredCard>
    );
  }

  if (!loaded && userId) return <Spinner label="Loading your hunting profile…" />;

  // ---- Form --------------------------------------------------------------

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const CurrentIcon = current.icon;
  const stateLimitHit = prefs.states.length >= LIMITS.listItems;

  const renderStateChips = (list: readonly StateListItem[]) => (
    <div className="flex flex-wrap gap-2">
      {list.map((s) => (
        <Chip
          key={s.slug}
          selected={prefs.states.includes(s.slug)}
          disabled={stateLimitHit}
          onClick={() => set("states", toggle(prefs.states, s.slug))}
        >
          {s.name}
        </Chip>
      ))}
    </div>
  );

  return (
    <div className="px-4 py-10 sm:py-14">
      <div className="max-w-2xl mx-auto">
        {/* Intro */}
        <div className="mb-8">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide px-2 py-1 rounded-md gradient-gold text-gold-foreground leading-none">
            <Check className="w-3 h-3" aria-hidden="true" /> Pro member
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-4 mb-2">
            {editing ? "Your hunting profile" : "Let’s tailor HuntScout Pro to your hunts"}
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            {editing
              ? "Update your answers anytime. We use them to keep your states, species and units up front."
              : `${firstName ? `Welcome, ${firstName}. ` : ""}A few quick questions, about 2 minutes. Answer what you know and skip the rest.`}
          </p>
          {loadWarning && (
            <p className="mt-3 text-sm text-muted-foreground flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
              We couldn&apos;t load your saved answers just now. Anything you save here will replace them.
            </p>
          )}
        </div>

        {/* Progress */}
        <nav aria-label="Onboarding steps" className="mb-6">
          <div
            className="h-1.5 rounded-full bg-muted overflow-hidden mb-4"
            role="progressbar"
            aria-label="Progress"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step + 1}
            aria-valuetext={`Step ${step + 1} of ${STEPS.length}: ${current.title}`}
          >
            <div
              className="h-full gradient-gold transition-all duration-300"
              style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <ol className="grid grid-cols-4 gap-2">
            {STEPS.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <li key={s.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={active ? "step" : undefined}
                    className={`w-full flex items-center justify-center sm:justify-start gap-2 rounded-lg px-2 py-2 text-xs sm:text-sm transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                      active ? "bg-muted text-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        active || done ? "gradient-gold text-gold-foreground" : "border border-border"
                      }`}
                      aria-hidden="true"
                    >
                      {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </span>
                    <span className="hidden sm:inline truncate">{s.short}</span>
                    <span className="sr-only sm:hidden">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (isLast) submit();
            else goTo(step + 1);
          }}
          className="bg-card border border-border rounded-2xl p-5 sm:p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center shrink-0">
              <CurrentIcon className="w-5 h-5 text-gold" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Step {step + 1} of {STEPS.length}
              </p>
              <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold text-foreground focus:outline-none">
                {current.title}
              </h2>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-foreground"
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-8">
            {step === 0 && (
              <>
                <Question
                  title="Where will you hunt?"
                  hint="Pick every state you hunt or plan to apply in. Western draw states are listed first."
                >
                  {prefs.states.length > 0 && (
                    <div className="rounded-xl bg-muted/60 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Your states ({prefs.states.length}
                        {stateLimitHit ? `, max ${LIMITS.listItems}` : ""})
                      </p>
                      <ul className="flex flex-wrap gap-2">
                        {prefs.states.map((slug) => {
                          const s = stateBySlug(slug);
                          return (
                            <li key={slug}>
                              <button
                                type="button"
                                onClick={() => set("states", prefs.states.filter((x) => x !== slug))}
                                className="inline-flex items-center gap-1 min-h-8 pl-3 pr-2 py-1 rounded-full gradient-gold text-gold-foreground text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                                aria-label={`Remove ${s?.name ?? slug}`}
                              >
                                {s?.name ?? slug}
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="relative">
                    <label htmlFor="state-search" className="sr-only">
                      Search states
                    </label>
                    <Search
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="state-search"
                      type="search"
                      value={query}
                      autoComplete="off"
                      placeholder="Search states, e.g. Wyoming or WY"
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const hit = filteredStates?.[0];
                        if (hit && !prefs.states.includes(hit.slug) && !stateLimitHit) {
                          set("states", [...prefs.states, hit.slug]);
                          setQuery("");
                        }
                      }}
                      className="w-full rounded-xl border border-border bg-background pl-10 pr-3.5 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold"
                    />
                  </div>

                  {filteredStates ? (
                    filteredStates.length ? (
                      renderStateChips(filteredStates)
                    ) : (
                      <p className="text-sm text-muted-foreground">No state matches &ldquo;{query}&rdquo;.</p>
                    )
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                          Western draw states
                        </p>
                        {renderStateChips(WESTERN_DRAW_STATES)}
                      </div>
                      <details className="group">
                        <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground list-none inline-flex items-center gap-1">
                          <ArrowRight
                            className="w-3.5 h-3.5 transition-transform group-open:rotate-90"
                            aria-hidden="true"
                          />
                          All other states
                        </summary>
                        <div className="mt-3">{renderStateChips(OTHER_STATES)}</div>
                      </details>
                    </div>
                  )}
                </Question>

                <Question title="Are you hunting as a resident, non-resident, or both?">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {RESIDENCY_OPTIONS.map((r) => (
                      <label key={r.id} className="relative cursor-pointer">
                        <input
                          type="radio"
                          name="residency"
                          value={r.id}
                          checked={prefs.residency === r.id}
                          onChange={() => set("residency", r.id)}
                          className="peer sr-only"
                        />
                        <span className="flex flex-col rounded-xl border border-border bg-background px-4 py-3 transition-colors hover:border-gold/60 peer-checked:border-gold peer-checked:bg-gold/15 peer-focus-visible:ring-2 peer-focus-visible:ring-gold peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card">
                          <span className="text-sm font-semibold text-foreground">{r.label}</span>
                          <span className="text-xs text-muted-foreground">{r.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </Question>

                <div className="space-y-2">
                  <label htmlFor="home-state" className="block text-base font-semibold text-foreground">
                    What&apos;s your home state?
                  </label>
                  <select
                    id="home-state"
                    value={prefs.homeState}
                    onChange={(e) => set("homeState", e.target.value)}
                    className="w-full sm:w-72 rounded-xl border border-border bg-background px-3.5 py-2.5 text-base sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold"
                  >
                    <option value="">Select a state</option>
                    {STATE_LIST.map((s) => (
                      <option key={s.abbrev} value={s.abbrev}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <Question title="What species are you after?" hint="Choose as many as you like.">
                  <div className="flex flex-wrap gap-2">
                    {SPECIES_OPTIONS.map((s) => (
                      <Chip
                        key={s.id}
                        selected={prefs.species.includes(s.id)}
                        onClick={() => set("species", toggle(prefs.species, s.id))}
                      >
                        {s.label}
                      </Chip>
                    ))}
                  </div>
                </Question>

                <Question title="Method of take?" hint="Which weapons and seasons do you hunt?">
                  <div className="flex flex-wrap gap-2">
                    {METHOD_OPTIONS.map((m) => (
                      <Chip
                        key={m.id}
                        selected={prefs.methods.includes(m.id)}
                        onClick={() => set("methods", toggle(prefs.methods, m.id))}
                      >
                        {m.label}
                      </Chip>
                    ))}
                  </div>
                </Question>
              </>
            )}

            {step === 2 && (
              <>
                <TextQuestion
                  id="units"
                  label="Which hunt areas, units or GMUs are you considering?"
                  hint={"List any you have in mind. \u201cNot sure yet\u201d is a fine answer."}
                  placeholder="e.g. CO GMU 61 and 62, WY elk area 7, NM unit 16"
                  value={prefs.units}
                  max={LIMITS.units}
                  onChange={(v) => set("units", v)}
                />
                <TextQuestion
                  id="points"
                  label="Where do you stand on points?"
                  hint="Points you hold for each species and state, and the seasons you want to apply for."
                  placeholder="e.g. CO elk 3 preference points, want 2nd rifle; WY antelope 1 point"
                  value={prefs.points}
                  max={LIMITS.points}
                  onChange={(v) => set("points", v)}
                />
              </>
            )}

            {step === 3 && (
              <>
                <Question title="What does success look like for you?" hint="Pick all that apply.">
                  <div className="flex flex-wrap gap-2">
                    {GOAL_OPTIONS.map((g) => (
                      <Chip
                        key={g.id}
                        selected={prefs.goals.includes(g.id)}
                        onClick={() => set("goals", toggle(prefs.goals, g.id))}
                      >
                        {g.label}
                      </Chip>
                    ))}
                  </div>
                </Question>
                <TextQuestion
                  id="notes"
                  label="Anything else we should know, or feedback?"
                  hint="Optional. A real person reads every answer."
                  value={prefs.notes}
                  max={LIMITS.notes}
                  rows={4}
                  onChange={(v) => set("notes", v)}
                />
              </>
            )}
          </div>

          {/* Footer controls */}
          <div className="mt-10 pt-6 border-t border-border flex flex-col-reverse sm:flex-row sm:items-center gap-3">
            {editing ? (
              <Link
                href="/account"
                className="text-center sm:text-left text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-2"
              >
                Back to My Account
              </Link>
            ) : (
              <button
                type="button"
                onClick={skip}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground px-2 py-2 cursor-pointer disabled:opacity-50"
              >
                {save.kind === "skipping" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Skip for now
              </button>
            )}

            <div className="sm:ml-auto flex flex-col-reverse sm:flex-row gap-3">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => goTo(step - 1)}
                  disabled={busy}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-all cursor-pointer disabled:opacity-50"
                >
                  <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
                </button>
              )}
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all cursor-pointer disabled:opacity-60"
              >
                {save.kind === "saving" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Saving…
                  </>
                ) : isLast ? (
                  <>
                    {editing ? "Save changes" : "Save & start scouting"} <Check className="w-4 h-4" aria-hidden="true" />
                  </>
                ) : (
                  <>
                    Next <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>

        {!editing && (
          <p className="text-xs text-muted-foreground text-center mt-6">
            You can change these answers anytime from{" "}
            <Link href="/account" className="text-gold hover:underline">
              My Account
            </Link>
            .
          </p>
        )}
      </div>
    </div>
  );
}
