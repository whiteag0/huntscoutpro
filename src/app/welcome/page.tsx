"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bell,
  Check,
  Crosshair,
  FileText,
  Loader2,
  MapPin,
  Search,
  Star,
  Target,
  Trophy,
  X,
} from "lucide-react";
import {
  EMPTY_PREFERENCES,
  GOAL_OPTIONS,
  LIMITS,
  METHOD_OPTIONS,
  joinStateUnits,
  residencyFor,
  splitStateUnits,
  withTopState,
  type HuntingPreferences,
  type StateOption,
} from "@/lib/preferences-schema";
import { pointsKey, parsePointValue, type PointsMap } from "@/lib/points-schema";
import { SPECIES_LABELS, type Species } from "@/data/types";
import { STATE_LIST, stateBySlug, type StateListItem } from "@/data/state-list";
import { COMING_SOON_STATES, LIVE_STATES, isLiveState } from "@/lib/agency-format";
import { markOnboardedLocally } from "@/components/OnboardingGate";
import { track } from "@/lib/analytics";

const STEPS = [
  { id: "where", title: "Where you hunt", short: "Where", icon: MapPin },
  { id: "what", title: "Species & method", short: "Species", icon: Crosshair },
  { id: "units", title: "Points & units", short: "Points", icon: Target },
  { id: "goals", title: "Your goals", short: "Goals", icon: Trophy },
  { id: "review", title: "Reminders & review", short: "Review", icon: Bell },
] as const;
const REVIEW_STEP = STEPS.length - 1;

const SPECIES_OPTIONS = (Object.keys(SPECIES_LABELS) as Species[]).map((id) => ({ id, label: SPECIES_LABELS[id] }));

const RESIDENCY_OPTIONS = [
  { id: "resident", label: "Resident", hint: "I hunt my home state" },
  { id: "nonresident", label: "Non-resident", hint: "I hunt out of state" },
  { id: "both", label: "Both", hint: "Home state and out of state" },
] as const;

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" | "skipping" }
  | { kind: "done"; to: string; label: string; report?: boolean; reminders?: number; reminderWarning?: boolean };

/** The deadline reminder switch: available=false when there's no purchase to store it on (admin / manual grants). */
type ReminderChoice = { available: boolean; enabled: boolean };

/** "Colorado, Wyoming and Utah" */
function listText(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

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

/** The step to send the member back to, and why, when the answers so far can't be saved; else null. */
function stepProblem(p: HuntingPreferences, throughStep: number): { step: number; message: string } | null {
  // States are on step 1, species on step 2: either one is enough to save, so only check once both were asked.
  if (throughStep >= 1 && p.states.length === 0 && p.species.length === 0) {
    return { step: 1, message: "Pick at least one species here, or go back and pick a state, so we know where to start." };
  }
  return null;
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
  tag,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Small trailing label, e.g. "Coming soon". */
  tag?: string;
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
      {tag && (
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="sr-only">, </span>
          {tag}
        </span>
      )}
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
    <div className="space-y-2" data-clarity-mask="true">
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
  /** Units per state slug (the units question), and units not tied to a listed state. */
  const [unitsByState, setUnitsByState] = useState<Record<string, string>>({});
  const [unitsOther, setUnitsOther] = useState("");
  /** Point balances as typed, keyed "colorado.elk"; "" = not sure / none entered. */
  const [points, setPoints] = useState<Record<string, string>>({});
  const [savedPoints, setSavedPoints] = useState<PointsMap>({});
  const [reminders, setReminders] = useState<ReminderChoice>({ available: true, enabled: true });
  const [options, setOptions] = useState<StateOption[]>([]);

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
    const getJson = async <T,>(url: string): Promise<T | null> => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        return res.ok ? ((await res.json()) as T) : null;
      } catch {
        return null;
      }
    };
    (async () => {
      try {
        const prefsRes = fetch("/api/preferences", { cache: "no-store" });
        // Points, reminders and the per-state options are extras: the form works without them.
        const [pts, rem, opts] = await Promise.all([
          getJson<{ points: PointsMap }>("/api/points"),
          getJson<{ available: boolean; enabled: boolean }>("/api/reminders"),
          getJson<{ states: StateOption[] }>("/api/preferences/options"),
        ]);
        if (opts?.states) setOptions(opts.states);
        if (pts?.points) {
          setSavedPoints(pts.points);
          setPoints(Object.fromEntries(Object.entries(pts.points).map(([k, v]) => [k, String(v)])));
        }
        if (rem) setReminders({ available: rem.available, enabled: rem.available ? rem.enabled : false });
        const res = await prefsRes;
        if (res.ok) {
          const data = (await res.json()) as { preferences: HuntingPreferences | null; onboarded: boolean };
          if (data.preferences) {
            const saved = withDefaults(data.preferences);
            const split = splitStateUnits(saved.units, STATE_LIST);
            setPrefs(saved);
            setUnitsByState(split.byState);
            setUnitsOther(split.other);
          }
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
    const target = Math.max(0, Math.min(STEPS.length - 1, i));
    // Moving forward checks the steps being left; going back never does.
    const problem = target > step ? stepProblem(prefs, target - 1) : null;
    stepChanged.current = true;
    setStep(problem ? problem.step : target);
    // A message belongs to the step it was raised on: clear it when the step changes.
    setError(problem ? problem.message : null);
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

  const optionBySlug = useMemo(() => new Map(options.map((o) => [o.slug, o] as const)), [options]);
  /** The member's states that are live on HuntScout, in their order (top state first). */
  const liveStates = prefs.states.filter(isLiveState);
  const homeItem = STATE_LIST.find((s) => s.abbrev === prefs.homeState);
  /** Points rows: each live state x picked species whose draw uses points. */
  const pointRows = liveStates.flatMap((slug) => {
    const o = optionBySlug.get(slug);
    if (!o) return [];
    return o.species
      .filter((sp) => sp.pointsMatter && prefs.species.includes(sp.id))
      .map((sp) => ({ key: pointsKey(slug, sp.id), state: o.name, species: sp.label }));
  });
  const pointsEntered = pointRows.filter((r) => parsePointValue(points[r.key]) !== null).length;

  /** The answers as saved: top state first, residency from the home state, units joined per state. */
  function answers(): HuntingPreferences {
    const picked = prefs.states.map((slug) => stateBySlug(slug)).filter((s): s is StateListItem => !!s);
    const units = joinStateUnits(
      prefs.states
        .map((slug) => ({ slug, o: optionBySlug.get(slug), st: stateBySlug(slug) }))
        .filter((x) => x.st)
        .map((x) => ({ name: x.st!.name, unitTerm: x.o?.unitTerm || "Unit", text: unitsByState[x.slug] || "" })),
      unitsOther
    );
    return { ...prefs, residency: residencyFor(prefs.homeState, picked, prefs.residency), units };
  }

  /** The points question's changes: every row shown, a blank one removing a saved balance. */
  function pointsUpdate(): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const r of pointRows) {
      const n = parsePointValue(points[r.key]);
      if (n !== null) out[r.key] = n;
      else if (r.key in savedPoints) out[r.key] = null;
    }
    return out;
  }

  async function post(body: unknown): Promise<{ report?: string; remindersSaved?: boolean }> {
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
    const data = (await res.json().catch(() => ({}))) as { report?: string; remindersSaved?: boolean };
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
    return data;
  }

  async function submit() {
    if (busy) return;
    const problem = stepProblem(prefs, STEPS.length - 1);
    if (problem) {
      stepChanged.current = true;
      setStep(problem.step);
      setError(problem.message);
      return;
    }
    setError(null);
    setSave({ kind: "saving" });
    try {
      const saved = answers();
      const result = await post({
        preferences: saved,
        points: pointsUpdate(),
        ...(reminders.available ? { reminders: reminders.enabled } : {}),
      });
      track("welcome_submit", {
        action: editing ? "update" : "submit",
        states: saved.states.length,
        species_count: saved.species.length,
        points: pointsEntered,
        reminders: reminders.available && reminders.enabled,
      });
      // The top state with data on HuntScout; a "coming soon" pick isn't a useful first stop.
      const firstLive = saved.states.find(isLiveState);
      const first = firstLive ? stateBySlug(firstLive) : undefined;
      const to = first ? `/states/${first.slug}` : "/states";
      const report = result.report === "queued";
      setSave({
        kind: "done",
        to,
        label: first ? first.name : "your states",
        report,
        reminders: reminders.available && reminders.enabled ? saved.states.filter(isLiveState).length : 0,
        reminderWarning: result.remindersSaved === false,
      });
      // When a report is on its way (or the reminder choice didn't save), stay here so the member reads it.
      if (!report && result.remindersSaved !== false) router.push(to);
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
      track("welcome_submit", { action: "skip" });
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
          We couldn&apos;t find a membership on <span className="text-foreground font-medium" data-clarity-mask="true">{user.email}</span>. If
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
        <h1 className="text-2xl font-bold mb-2" role="status" data-clarity-mask="true">
          {firstName ? `You're all set, ${firstName}.` : "You're all set."}
        </h1>
        {(save.reminders || save.reminderWarning) && (
          <p className="text-sm text-muted-foreground mb-4 flex items-start justify-center gap-2">
            <Bell className="w-4 h-4 mt-0.5 shrink-0 text-gold" aria-hidden="true" />
            {save.reminderWarning ? (
              <span>
                Your answers are saved, but we couldn&apos;t update your reminder setting. You can turn reminders on or off on{" "}
                <Link href="/account" className="text-gold hover:underline">
                  My Account
                </Link>
                .
              </span>
            ) : (
              <span>
                Deadline reminders are on for {save.reminders} state{save.reminders === 1 ? "" : "s"}.
              </span>
            )}
          </p>
        )}
        {save.report ? (
          <>
            <div className="text-left rounded-xl border border-gold/40 bg-gold/10 px-4 py-4 mb-6">
              <p className="flex items-center gap-2 font-semibold text-foreground mb-1.5">
                <FileText className="w-4 h-4 text-gold shrink-0" aria-hidden="true" />
                Your personal scouting report is on its way
              </p>
              <p className="text-sm text-muted-foreground">
                We&apos;re building a PDF report from the agencies&apos; own draw, harvest, date and fee data for your answers, and emailing it to{" "}
                <span className="font-medium text-foreground break-all" data-clarity-mask="true">
                  {user.email}
                </span>{" "}
                from adam@huntscoutpro.com. It usually arrives within a few minutes.
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                Not in your inbox? Check your spam or Promotions folder, and add adam@huntscoutpro.com to your contacts so reminders land too.
              </p>
            </div>
            <Link
              href={save.to}
              className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-3 rounded-xl font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
            >
              Start scouting {save.label} <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          </>
        ) : (
          <>
            {!save.reminderWarning && <p className="text-muted-foreground mb-6">Taking you to {save.label}…</p>}
            <Link href={save.to} className="inline-flex items-center gap-1 text-sm font-medium text-gold hover:underline">
              Continue <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </Link>
          </>
        )}
      </CenteredCard>
    );
  }

  if (!loaded && userId) return <Spinner label="Loading your hunting profile…" />;

  // ---- Form --------------------------------------------------------------

  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];
  const CurrentIcon = current.icon;
  const stateLimitHit = prefs.states.length >= LIMITS.listItems;

  const renderStateChips = (list: readonly StateListItem[], tagComingSoon = true) => (
    <div className="flex flex-wrap gap-2">
      {list.map((s) => (
        <Chip
          key={s.slug}
          selected={prefs.states.includes(s.slug)}
          disabled={stateLimitHit}
          tag={tagComingSoon && !isLiveState(s.slug) ? "Coming soon" : undefined}
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
          <p className="text-muted-foreground text-base sm:text-lg" data-clarity-mask="true">
            {editing
              ? "Update your answers anytime. We use them to keep your states, species and units up front."
              : `${firstName ? `Welcome, ${firstName}. ` : ""}A few quick questions, about 2 minutes. Answer what you know and skip the rest. When you save, we'll email you a personal scouting report built from your answers.`}
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
          <ol className="grid grid-cols-5 gap-1.5 sm:gap-2">
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
                <div className="space-y-2">
                  <label htmlFor="home-state" className="block text-base font-semibold text-foreground">
                    Where do you live?
                  </label>
                  <p id="home-state-hint" className="text-sm text-muted-foreground -mt-1">
                    Your home state is where you apply as a resident. Everywhere else, we&apos;ll show non-resident fees, odds and deadlines.
                  </p>
                  <select
                    id="home-state"
                    value={prefs.homeState}
                    aria-describedby="home-state-hint"
                    onChange={(e) => set("homeState", e.target.value)}
                    className="w-full sm:w-72 rounded-xl border border-border bg-background px-3.5 py-2.5 text-base sm:text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold"
                  >
                    <option value="">Select your home state</option>
                    {STATE_LIST.map((s) => (
                      <option key={s.abbrev} value={s.abbrev}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <Question
                  title="Which states do you want to hunt or apply in?"
                  hint={`Pick as many as you like. You'll get deadline reminders for each one. Tap the star to mark your top state; it comes first in your report and across the site. ${LIVE_STATES.length} states have full agency data now. Others are marked "coming soon", and your picks help us decide what to add next.`}
                >
                  {prefs.states.length > 0 && (
                    <div className="rounded-xl bg-muted/60 p-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2">
                        Your states ({prefs.states.length}
                        {stateLimitHit ? `, max ${LIMITS.listItems}` : ""})
                      </p>
                      <ul className="flex flex-wrap gap-2">
                        {prefs.states.map((slug, i) => {
                          const s = stateBySlug(slug);
                          const name = s?.name ?? slug;
                          const top = i === 0;
                          return (
                            <li
                              key={slug}
                              className={`inline-flex items-center min-h-9 rounded-full text-xs font-semibold ${
                                top ? "gradient-gold text-gold-foreground" : "bg-background border border-gold/50 text-foreground"
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => set("states", withTopState(prefs.states, slug))}
                                aria-pressed={top}
                                aria-label={top ? `${name} is your top state` : `Make ${name} your top state`}
                                title={top ? "Your top state" : "Make this your top state"}
                                className="inline-flex items-center gap-1 min-h-9 pl-3 pr-1.5 rounded-l-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                              >
                                <Star className={`w-3.5 h-3.5 ${top ? "fill-current" : "opacity-60"}`} aria-hidden="true" />
                                {name}
                                {top && <span className="font-medium opacity-90">· top</span>}
                                {!isLiveState(slug) && <span className="font-medium opacity-80">(coming soon)</span>}
                              </button>
                              <button
                                type="button"
                                onClick={() => set("states", prefs.states.filter((x) => x !== slug))}
                                aria-label={`Remove ${name}`}
                                className="inline-flex items-center min-h-9 pl-1 pr-2.5 rounded-r-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
                              >
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {homeItem && !prefs.states.includes(homeItem.slug) && !stateLimitHit && (
                      <button
                        type="button"
                        onClick={() => set("states", [...prefs.states, homeItem.slug])}
                        className="text-sm font-medium text-gold hover:underline min-h-10 cursor-pointer"
                      >
                        + Add {homeItem.name} (home)
                      </button>
                    )}
                    {LIVE_STATES.some((s) => !prefs.states.includes(s.slug)) && (
                      <button
                        type="button"
                        onClick={() =>
                          set(
                            "states",
                            [...prefs.states, ...LIVE_STATES.map((s) => s.slug).filter((x) => !prefs.states.includes(x))].slice(0, LIMITS.listItems)
                          )
                        }
                        className="text-sm font-medium text-gold hover:underline min-h-10 cursor-pointer"
                      >
                        Select all {LIVE_STATES.length} live states
                      </button>
                    )}
                    {prefs.states.length > 0 && (
                      <button
                        type="button"
                        onClick={() => set("states", [])}
                        className="text-sm font-medium text-muted-foreground hover:text-foreground min-h-10 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>

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
                          Live on HuntScout ({LIVE_STATES.length} states)
                        </p>
                        {renderStateChips(LIVE_STATES, false)}
                      </div>
                      <details className="group">
                        <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground list-none inline-flex min-h-10 items-center gap-1">
                          <ArrowRight
                            className="w-3.5 h-3.5 transition-transform group-open:rotate-90"
                            aria-hidden="true"
                          />
                          Other states (coming soon)
                        </summary>
                        <div className="mt-3">{renderStateChips(COMING_SOON_STATES, false)}</div>
                      </details>
                    </div>
                  )}
                </Question>

                {/* Only asked when there's no home state to work it out from. */}
                {!prefs.homeState && (
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
                )}
              </>
            )}

            {step === 1 && (
              <>
                <Question title="What species are you after?" hint="Choose as many as you like. Reminders and your report cover these species.">
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
                  <div className="flex flex-wrap gap-x-4">
                    {prefs.species.length < SPECIES_OPTIONS.length && (
                      <button
                        type="button"
                        onClick={() => set("species", SPECIES_OPTIONS.map((o) => o.id))}
                        className="text-sm font-medium text-gold hover:underline min-h-10 cursor-pointer"
                      >
                        Select all species
                      </button>
                    )}
                    {prefs.species.length > 0 && (
                      <button
                        type="button"
                        onClick={() => set("species", [])}
                        className="text-sm font-medium text-muted-foreground hover:text-foreground min-h-10 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </Question>

                <Question
                  title="Method of take?"
                  hint="Pick every weapon you hunt with. We'll skip deadlines for weapon-only seasons you don't hunt (archery-only, firearm-only). Leave it blank to hear about all of them."
                >
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
                <Question
                  title="How many points do you have?"
                  hint="Enter your current preference or bonus points for each state and species. Leave a box blank if you're not sure. Your report shows your draw odds at these points."
                >
                  {pointRows.length ? (
                    <div className="rounded-xl border border-border divide-y divide-border" data-clarity-mask="true">
                      {pointRows.map((r) => {
                        const id = `pts-${r.key.replace(".", "-")}`;
                        const v = points[r.key] ?? "";
                        const bad = v !== "" && parsePointValue(v) === null;
                        return (
                          <div key={r.key} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                            <label htmlFor={id} className="text-sm text-foreground min-w-0">
                              <span className="font-semibold">{r.state}</span> {r.species.toLowerCase()}
                            </label>
                            <input
                              id={id}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={2}
                              value={v}
                              placeholder="–"
                              aria-invalid={bad || undefined}
                              aria-label={`${r.state} ${r.species} points`}
                              onChange={(e) => setPoints((p) => ({ ...p, [r.key]: e.target.value.replace(/\D/g, "").slice(0, 2) }))}
                              className={`w-16 shrink-0 rounded-lg border bg-background px-2.5 py-2 text-center text-base sm:text-sm tabular-nums text-foreground focus:outline-none focus:ring-2 focus:ring-gold ${
                                bad ? "border-red-500" : "border-border focus:border-gold"
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground rounded-xl bg-muted/60 px-3.5 py-3">
                      {liveStates.length === 0
                        ? "Pick a live state on step 1 to enter points for it."
                        : prefs.species.length === 0
                          ? "Pick your species on step 2 and we'll list the point balances to enter."
                          : options.length === 0
                            ? "We couldn't load the point questions just now. You can add points on your Shortlist later."
                            : "None of your states use points for your species, so there's nothing to enter."}
                    </p>
                  )}
                  {pointRows.some((r) => {
                    const v = points[r.key] ?? "";
                    return v !== "" && parsePointValue(v) === null;
                  }) && <p className="text-sm text-red-600">Points are whole numbers from 0 to 40.</p>}
                </Question>

                <Question
                  title="Any units you have in mind?"
                  hint={"Optional. List unit numbers for each state, separated by commas. \u201cNot sure yet\u201d is fine; leave it blank."}
                >
                  {prefs.states.length ? (
                    <div className="space-y-3" data-clarity-mask="true">
                      {prefs.states.map((slug) => {
                        const st = stateBySlug(slug);
                        if (!st) return null;
                        const term = optionBySlug.get(slug)?.unitTerm || "Unit";
                        const id = `units-${slug}`;
                        return (
                          <div key={slug} className="grid grid-cols-1 sm:grid-cols-[11rem_1fr] sm:items-center gap-1.5 sm:gap-3">
                            <label htmlFor={id} className="text-sm font-semibold text-foreground">
                              {st.name} <span className="font-normal text-muted-foreground">{term}s</span>
                            </label>
                            <input
                              id={id}
                              type="text"
                              maxLength={LIMITS.unitsPerState}
                              value={unitsByState[slug] ?? ""}
                              placeholder={slug === "colorado" ? "e.g. 61, 62" : slug === "wyoming" ? "e.g. 7, 9" : "e.g. 16A, 21"}
                              onChange={(e) => setUnitsByState((u) => ({ ...u, [slug]: e.target.value }))}
                              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Pick your states on step 1 first.</p>
                  )}
                </Question>

                {unitsOther && (
                  <TextQuestion
                    id="units-other"
                    label="Your earlier units answer"
                    hint="From before we asked by state. Edit or clear it; anything left here is kept."
                    value={unitsOther}
                    max={LIMITS.units}
                    rows={2}
                    onChange={setUnitsOther}
                  />
                )}

                <TextQuestion
                  id="points"
                  label="Hunts or seasons you plan to apply for"
                  hint="Optional. Hunt codes, seasons, or anything about your points we should know."
                  placeholder="e.g. CO 2nd rifle elk, WY general elk, building points in AZ"
                  value={prefs.points}
                  max={LIMITS.points}
                  rows={2}
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
            {step === REVIEW_STEP && (
              <>
                <section aria-labelledby="reminders-q" className="rounded-xl border border-gold/40 bg-gold/10 p-4 sm:p-5">
                  <h3 id="reminders-q" className="text-base font-semibold text-foreground flex items-center gap-2">
                    <Bell className="w-4 h-4 text-gold shrink-0" aria-hidden="true" /> Deadline reminder emails
                  </h3>
                  {reminders.available ? (
                    <>
                      <label className="mt-3 flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={reminders.enabled}
                          onChange={(e) => setReminders((r) => ({ ...r, enabled: e.target.checked }))}
                          className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--gold)] cursor-pointer"
                        />
                        <span className="text-sm text-foreground">
                          Email me before application deadlines
                          <span className="block text-muted-foreground mt-1">
                            {liveStates.length ? (
                              <>
                                For {listText(liveStates.map((x) => stateBySlug(x)?.name ?? x))}
                                {" · "}
                                {prefs.species.length ? listText(prefs.species.map((x) => SPECIES_LABELS[x as Species] ?? x).map((x) => x.toLowerCase())) : "every species"}
                                {" · "}
                                {prefs.methods.length
                                  ? listText(prefs.methods.map((x) => METHOD_OPTIONS.find((o) => o.id === x)?.label.toLowerCase() ?? x))
                                  : "every weapon"}
                                . We email 14 days and 3 days before each deadline and on the day an application window opens, using the agencies&apos; own dates. One email a day at most, and only when something is due.
                              </>
                            ) : (
                              "Pick a live state on step 1 and we'll email you before its application deadlines."
                            )}
                          </span>
                        </span>
                      </label>
                      {prefs.states.some((x) => !isLiveState(x)) && (
                        <p className="text-xs text-muted-foreground mt-3">
                          Coming-soon states get reminders as soon as we add their agency data.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">
                      Reminders are tied to a HuntScout Pro purchase, and there isn&apos;t one on this account.
                    </p>
                  )}
                </section>

                <section aria-labelledby="review-q">
                  <h3 id="review-q" className="text-base font-semibold text-foreground mb-3">
                    Check your answers
                  </h3>
                  <dl className="rounded-xl border border-border divide-y divide-border text-sm" data-clarity-mask="true">
                    {(
                      [
                        ["Home state", homeItem?.name || (prefs.residency ? `Not given (${RESIDENCY_OPTIONS.find((r) => r.id === prefs.residency)?.label.toLowerCase()})` : "Not given"), 0],
                        [
                          "States",
                          prefs.states.length
                            ? prefs.states.map((x, i) => `${stateBySlug(x)?.name ?? x}${i === 0 && prefs.states.length > 1 ? " (top)" : ""}`).join(", ")
                            : "None yet",
                          0,
                        ],
                        ["Species", prefs.species.length ? prefs.species.map((x) => SPECIES_LABELS[x as Species] ?? x).join(", ") : "None yet", 1],
                        ["Method of take", prefs.methods.length ? prefs.methods.map((x) => METHOD_OPTIONS.find((o) => o.id === x)?.label ?? x).join(", ") : "Any", 1],
                        [
                          "Points",
                          pointRows.length
                            ? pointRows
                                .filter((r) => parsePointValue(points[r.key]) !== null)
                                .map((r) => `${r.state} ${r.species.toLowerCase()} ${points[r.key]}`)
                                .join(", ") || "None entered"
                            : "Nothing to enter",
                          2,
                        ],
                        ["Units", answers().units || "None yet", 2],
                        ["Goals", prefs.goals.length ? prefs.goals.map((x) => GOAL_OPTIONS.find((o) => o.id === x)?.label ?? x).join(", ") : "Not given", 3],
                      ] as const
                    ).map(([label, value, at]) => (
                      <div key={label} className="flex items-start gap-3 px-3.5 py-2.5">
                        <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
                        <dd className="flex-1 min-w-0 text-foreground break-words">{value}</dd>
                        <button
                          type="button"
                          onClick={() => goTo(at)}
                          aria-label={`Edit ${label.toLowerCase()}`}
                          className="text-xs font-semibold text-gold hover:underline shrink-0 min-h-6 cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    ))}
                  </dl>
                </section>
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
                className="inline-flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground min-h-10 px-2 py-2 cursor-pointer disabled:opacity-50"
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
