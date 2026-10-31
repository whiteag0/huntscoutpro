"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { CheckCircle2, Loader2, Send } from "lucide-react";
import { SPECIES_LABELS, type Species } from "@/data/types";
import { STATE_LIST } from "@/data/state-list";
import { COMING_SOON_STATES } from "@/lib/agency-format";
import { METHOD_OPTIONS } from "@/lib/preferences-schema";
import { STATE_REQUEST_LIMITS, type StateRequest } from "@/lib/state-request-schema";

const SPECIES_IDS = Object.keys(SPECIES_LABELS) as Species[];

type Errors = Partial<Record<keyof StateRequest, string>>;

const inputClass =
  "w-full px-3 py-2.5 border border-border rounded-lg bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold transition";

function Field({ label, error, hint, children, required, group }: { label: string; error?: string; hint?: string; children: React.ReactNode; required?: boolean; group?: boolean }) {
  const title = (
    <>
      {label}
      {required && <span className="text-accent"> *</span>}
    </>
  );
  const foot = (
    <>
      {hint && !error && <span className="block text-xs text-muted-foreground mt-1">{hint}</span>}
      {error && <span className="block text-xs text-danger mt-1" role="alert">{error}</span>}
    </>
  );
  // Chip groups are sets of buttons, so they get a fieldset/legend rather than a label.
  return group ? (
    <fieldset className="block">
      <legend className="block text-sm font-semibold text-foreground mb-1.5">{title}</legend>
      {children}
      {foot}
    </fieldset>
  ) : (
    <label className="block">
      <span className="block text-sm font-semibold text-foreground mb-1.5">{title}</span>
      {children}
      {foot}
    </label>
  );
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`px-3 py-1.5 rounded-full text-sm border transition cursor-pointer ${
        on ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:border-primary/50"
      }`}
    >
      {label}
    </button>
  );
}

export function StateRequestForm({ stateSlug }: { stateSlug?: string }) {
  const { data: session } = useSession();
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const [form, setForm] = useState<StateRequest>({
    state: stateSlug && COMING_SOON_STATES.some((s) => s.slug === stateSlug) ? stateSlug : "",
    name: "",
    email: "",
    phone: "",
    residency: "",
    homeState: "",
    species: [],
    methods: [],
    timeframe: "",
    notes: "",
    notify: true,
  });
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  // Prefill from the signed-in account once, without overwriting anything typed.
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  const user = session?.user;
  if (user?.email && prefilledFor !== user.email) {
    setPrefilledFor(user.email);
    setForm((f) => ({ ...f, name: f.name || user.name || "", email: f.email || user.email || "" }));
  }

  const set = <K extends keyof StateRequest>(k: K, v: StateRequest[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const toggle = (k: "species" | "methods", id: string) =>
    set(k, form[k].includes(id) ? form[k].filter((x) => x !== id) : [...form[k], id]);

  const stateName = STATE_LIST.find((s) => s.slug === form.state)?.name;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setMessage("");
    try {
      const res = await fetch("/api/state-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website, startedAt: startedAt.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(data.errors || {});
        setMessage(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setStatus("sent");
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div className="text-center py-8 px-4">
        <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" aria-hidden />
        <h3 className="text-xl font-bold text-foreground">Request received</h3>
        <p className="mt-2 text-muted-foreground max-w-md mx-auto">
          Thanks{form.name ? `, ${form.name.split(" ")[0]}` : ""}. Your request for {stateName} went straight to our team.
          {form.notify ? ` We'll email ${form.email} when ${stateName} data goes live.` : ""}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div aria-hidden className="absolute -left-[9999px] w-px h-px overflow-hidden">
        <label>
          Website
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      <Field label="State you want us to add" required error={errors.state}>
        <select className={inputClass} value={form.state} onChange={(e) => set("state", e.target.value)}>
          <option value="">Choose a state…</option>
          {COMING_SOON_STATES.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Your name" required error={errors.name}>
          <input className={inputClass} value={form.name} maxLength={STATE_REQUEST_LIMITS.name} autoComplete="name" onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Email" required error={errors.email}>
          <input className={inputClass} type="email" value={form.email} maxLength={STATE_REQUEST_LIMITS.email} autoComplete="email" onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Phone" hint="Optional" error={errors.phone}>
          <input className={inputClass} type="tel" value={form.phone} maxLength={STATE_REQUEST_LIMITS.phone} autoComplete="tel" onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Your home state" error={errors.homeState}>
          <select className={inputClass} value={form.homeState} onChange={(e) => set("homeState", e.target.value)}>
            <option value="">Choose…</option>
            {STATE_LIST.map((s) => (
              <option key={s.abbrev} value={s.abbrev}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field group label={`You'd hunt ${stateName || "this state"} as a`}>
        <div className="flex flex-wrap gap-2">
          {(["resident", "nonresident", "both"] as const).map((r) => (
            <Chip key={r} on={form.residency === r} label={r === "both" ? "Either / both" : r === "resident" ? "Resident" : "Nonresident"} onClick={() => set("residency", form.residency === r ? "" : r)} />
          ))}
        </div>
      </Field>

      <Field group label="Species" required error={errors.species}>
        <div className="flex flex-wrap gap-2">
          {SPECIES_IDS.map((s) => (
            <Chip key={s} on={form.species.includes(s)} label={SPECIES_LABELS[s]} onClick={() => toggle("species", s)} />
          ))}
        </div>
      </Field>

      <Field group label="Method of take">
        <div className="flex flex-wrap gap-2">
          {METHOD_OPTIONS.map((m) => (
            <Chip key={m.id} on={form.methods.includes(m.id)} label={m.label} onClick={() => toggle("methods", m.id)} />
          ))}
        </div>
      </Field>

      <Field label="When do you plan to hunt?" hint="For example: fall 2027, or applying in the 2027 draw">
        <input className={inputClass} value={form.timeframe} maxLength={STATE_REQUEST_LIMITS.timeframe} onChange={(e) => set("timeframe", e.target.value)} />
      </Field>

      <Field label="Anything else we should know?" hint="Units you're considering, points you hold, what data would help most">
        <textarea className={`${inputClass} min-h-[96px]`} value={form.notes} maxLength={STATE_REQUEST_LIMITS.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <label className="flex items-start gap-2.5 text-sm text-foreground cursor-pointer">
        <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--primary)]" checked={form.notify} onChange={(e) => set("notify", e.target.checked)} />
        <span>Email me when {stateName || "this state"} goes live on HuntScout Pro.</span>
      </label>

      {message && (
        <p className="text-sm text-danger" role="alert">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "sending"}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gold text-gold-foreground font-bold hover:brightness-95 disabled:opacity-60 transition cursor-pointer"
      >
        {status === "sending" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
        {status === "sending" ? "Sending…" : "Request hunting data"}
      </button>
      <p className="text-xs text-muted-foreground">
        Your details go only to the HuntScout Pro team so we can follow up about this request. See our{" "}
        <a href="/privacy" className="underline">
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}
