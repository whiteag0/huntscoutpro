"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BellRing, CheckCircle2, Loader2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { FREE_RESIDENCY_OPTIONS, type FreeReminderStateOption, type FreeResidency, type FreeSignup } from "@/lib/free-reminders-schema";

type Errors = Partial<Record<keyof FreeSignup, string>>;

/** Slightly longer than the server's time trap (subscribe route MIN_FILL_MS = 2500). */
const MIN_FILL_MS = 2700;

interface Props {
  /** States and species to offer. Loaded from /api/free-reminders/options when omitted. */
  options?: FreeReminderStateOption[];
  /** Fix the state (state pages): no state picker. */
  lockedState?: string;
  /** Where the signup happened, kept with the record. */
  source: "calendar" | "home" | "state";
  /** Line shown to Pro members instead of the form (null = show nothing). */
  proNote?: React.ReactNode;
  className?: string;
  id?: string;
  /** Use "p" where the card sits above the page's h1 (keeps the heading order). */
  titleAs?: "h2" | "p";
}

const inputClass =
  "w-full min-h-11 px-3 py-2 rounded-lg bg-white text-[#1c1917] border border-white/20 placeholder:text-stone-500 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-gold";

/**
 * Free one-state deadline reminders signup (double opt-in by email). Hidden for
 * Pro members, whose reminders cover every state in their preferences.
 */
export function FreeRemindersSignup({ options: given, lockedState, source, proNote = null, className = "", id, titleAs: Title = "h2" }: Props) {
  const { data: session, status } = useSession();
  const uid = useId();
  const startedAt = useRef(0);
  const [options, setOptions] = useState<FreeReminderStateOption[] | null>(given ?? null);
  const [email, setEmail] = useState("");
  const [state, setState] = useState(lockedState || "");
  const [species, setSpecies] = useState<string[]>([]);
  const [residency, setResidency] = useState<FreeResidency | "">("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    if (given) return;
    let live = true;
    fetch("/api/free-reminders/options")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { states: FreeReminderStateOption[] }) => live && setOptions(d.states))
      .catch(() => live && setOptions([]));
    return () => {
      live = false;
    };
  }, [given]);

  // Prefill a signed-in visitor's address once, without overwriting anything typed.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const userEmail = session?.user?.email;
  if (userEmail && prefilledFor !== userEmail) {
    setPrefilledFor(userEmail);
    setEmail((e) => e || userEmail);
  }

  const pending = status === "loading" && !session;
  if (session?.user?.isPro) return proNote ? <div className={className}>{proNote}</div> : null;

  const current = options?.find((o) => o.slug === state);
  const lockedName = lockedState ? options?.find((o) => o.slug === lockedState)?.name : null;

  const clearError = (k: keyof FreeSignup) => setErrors((e) => ({ ...e, [k]: undefined }));
  const toggleSpecies = (sp: string) => setSpecies((list) => (list.includes(sp) ? list.filter((x) => x !== sp) : [...list, sp]));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPhase("sending");
    setMessage("");
    try {
      // The server ignores forms sent within 2.5 s of rendering (bots). A quick person
      // (autofill + click) just waits out the rest here instead of being dropped.
      const wait = startedAt.current + MIN_FILL_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const res = await fetch("/api/free-reminders/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, state, species, residency, website, startedAt: startedAt.current, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(data.errors || {});
        setMessage(data.error || "Something went wrong. Please try again.");
        setPhase("error");
        return;
      }
      setMessage(data.message || `Check ${email} for a link to confirm.`);
      setPhase("sent");
      track("free_reminders_signup", { state, source, species: species.length });
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
      setPhase("error");
    }
  }

  const fieldError = (k: keyof FreeSignup) =>
    errors[k] ? (
      <span id={`${uid}-${k}-err`} className="block text-xs text-[#ffb4a8] mt-1">
        {errors[k]}
      </span>
    ) : null;
  const errProps = (k: keyof FreeSignup) =>
    errors[k] ? { "aria-invalid": true as const, "aria-describedby": `${uid}-${k}-err` } : {};

  const submitButton = (
    <button
      type="submit"
      disabled={phase === "sending"}
      className="w-full sm:w-auto min-h-11 inline-flex items-center justify-center gap-2 px-5 rounded-lg bg-gold text-gold-foreground font-bold hover:brightness-95 disabled:opacity-70 whitespace-nowrap"
    >
      {phase === "sending" && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
      Email me reminders
    </button>
  );

  const title = lockedState ? `Get ${lockedName || "this state's"} deadline reminders by email` : "Never miss an application deadline";

  return (
    <section
      id={id}
      aria-labelledby={`${uid}-title`}
      aria-busy={pending || undefined}
      className={`relative rounded-2xl bg-[#1F2326] text-white border-b-4 border-gold px-4 sm:px-6 py-5 sm:py-6 scroll-mt-24 ${pending ? "invisible" : ""} ${className}`}
    >
      <div className="flex items-center gap-2 text-gold mb-1.5">
        <BellRing className="w-4 h-4" aria-hidden />
        <span className="text-xs font-bold tracking-[0.2em]">FREE DEADLINE REMINDERS</span>
      </div>
      <Title id={`${uid}-title`} className="text-xl sm:text-2xl font-bold">
        {title}
      </Title>

      {phase === "sent" ? (
        <div className="mt-3 flex items-start gap-3" role="status">
          <CheckCircle2 className="w-6 h-6 text-gold shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-semibold">Almost done: confirm your email.</p>
            <p className="text-white/80 text-sm mt-1" data-clarity-mask="true">{message}</p>
          </div>
        </div>
      ) : (
        <>
          <p className="text-white/75 mt-1.5 text-sm sm:text-base max-w-3xl">
            {lockedState ? "" : "Pick one state. "}We email you 14 days and 3 days before each application deadline the agency publishes,
            and on the day a window opens. Free for one state; Pro members get reminders for every state they follow.
          </p>

          <form onSubmit={submit} noValidate className="mt-4">
            {/* Honeypot: hidden from people, irresistible to bots. */}
            <div aria-hidden className="absolute -left-[9999px] w-px h-px overflow-hidden">
              <label>
                Website
                <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </label>
            </div>

            <div className={`grid gap-3 grid-cols-1 ${lockedState ? "sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_auto]" : "sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_auto]"} items-start`}>
              <label className="block min-w-0">
                <span className="block text-xs font-semibold text-white/80 mb-1">Email</span>
                <input
                  className={inputClass}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  maxLength={200}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError("email");
                  }}
                  placeholder="you@example.com"
                  {...errProps("email")}
                />
                {fieldError("email")}
              </label>

              {!lockedState && (
                <label className="block min-w-0">
                  <span className="block text-xs font-semibold text-white/80 mb-1">State</span>
                  <select
                    className={inputClass}
                    required
                    value={state}
                    onChange={(e) => {
                      setState(e.target.value);
                      setSpecies([]);
                      clearError("state");
                    }}
                    disabled={!options}
                    {...errProps("state")}
                  >
                    <option value="">{options ? "Choose a state…" : "Loading states…"}</option>
                    {(options || []).map((o) => (
                      <option key={o.slug} value={o.slug}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                  {fieldError("state")}
                </label>
              )}

              <label className="block min-w-0">
                <span className="block text-xs font-semibold text-white/80 mb-1">I apply as</span>
                <select
                  className={inputClass}
                  required
                  value={residency}
                  onChange={(e) => {
                    setResidency(e.target.value as FreeResidency | "");
                    clearError("residency");
                  }}
                  {...errProps("residency")}
                >
                  <option value="">Choose…</option>
                  {FREE_RESIDENCY_OPTIONS.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {fieldError("residency")}
              </label>

              {/* Phones: the button comes after the species chips (below). */}
              <div className="hidden sm:block sm:pt-5">{submitButton}</div>

            </div>

            {current && current.species.length > 1 && (
              <fieldset className="mt-4">
                <legend className="text-xs font-semibold text-white/80 mb-1.5">
                  Species <span className="font-normal text-white/60">(optional; leave blank for all)</span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {current.species.map((sp) => {
                    const on = species.includes(sp.id);
                    return (
                      <button
                        key={sp.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleSpecies(sp.id)}
                        className={`min-h-9 px-3 py-1 rounded-full text-sm border transition ${
                          on ? "bg-gold text-gold-foreground border-gold font-semibold" : "bg-transparent text-white border-white/30 hover:border-gold"
                        }`}
                      >
                        {sp.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className="mt-4 sm:hidden">{submitButton}</div>

            <div aria-live="polite" className="mt-3 text-sm">
              {phase === "error" && message && <p className="text-[#ffb4a8]">{message}</p>}
            </div>
            <p className="mt-1 text-xs text-white/60">
              We send a confirmation link first. We only use your address for these reminders, and every email has a one-click
              unsubscribe. <Link href="/privacy" className="underline hover:text-white">Privacy</Link>
            </p>
          </form>
        </>
      )}
    </section>
  );
}
