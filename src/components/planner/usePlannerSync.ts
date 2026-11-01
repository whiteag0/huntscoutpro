"use client";

// Planner state for the /planner page.
// - Members: the account copy (/api/planner) is the source of truth. A copy is
//   kept in this browser so the page opens instantly and edits made offline
//   survive; they're merged into the account copy when it can be reached.
//   Any planner saved in this browser before signing in is merged into the
//   account once (deduplicated).
// - Everyone else: this browser only (localStorage), as before.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  hasPlannerContent,
  mergePlanners,
  samePlanner,
  sanitizePlannerData,
  type PlannerData,
  type PlannerDoc,
} from "@/lib/planner-schema";
import { defaultChecklist } from "@/components/planner/defaults";

/** Browser-only planner (non-members) and the source for the one-time move into an account. */
const LEGACY_KEY = "huntscout-planner";
/** This browser's copy of a member's account planner. */
const CACHE_KEY = "huntscout-planner-account";
/** Emails whose browser-only planner has already been merged into their account. */
const MIGRATED_KEY = "huntscout-planner-migrated";
const SAVE_DELAY_MS = 1200;

export type SyncStatus =
  | { kind: "browser" }
  | { kind: "loading" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved"; at: string | null; justSaved: boolean }
  | { kind: "offline" }
  | { kind: "error"; message: string; canRetry: boolean };

interface Cache {
  email: string;
  baseVersion: number;
  dirty: boolean;
  data: PlannerData;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the account copy (members) or the in-memory state still works.
  }
}

function readLegacy(): PlannerData | null {
  return sanitizePlannerData(readJson(LEGACY_KEY));
}
function readCache(email: string): Cache | null {
  const raw = readJson(CACHE_KEY) as Partial<Cache> | null;
  if (!raw || raw.email !== email || typeof raw.baseVersion !== "number") return null;
  const data = sanitizePlannerData(raw.data);
  return data ? { email, baseVersion: raw.baseVersion, dirty: raw.dirty === true, data } : null;
}
function migrated(email: string): boolean {
  const list = readJson(MIGRATED_KEY);
  return Array.isArray(list) && list.includes(email);
}
function markMigrated(email: string) {
  const list = readJson(MIGRATED_KEY);
  const next = Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  if (!next.includes(email)) writeJson(MIGRATED_KEY, [...next, email].slice(-10));
}

function withDefaults(d: PlannerData): PlannerData {
  return d.checklist.length ? d : { ...d, checklist: defaultChecklist() };
}

export function usePlannerSync({ ready, email, isPro }: { ready: boolean; email: string | null; isPro: boolean }) {
  const account = ready && isPro && !!email;
  const [data, setDataState] = useState<PlannerData | null>(null);
  const [status, setStatus] = useState<SyncStatus>({ kind: "loading" });
  const [notice, setNotice] = useState<string | null>(null);

  const r = useRef({
    data: null as PlannerData | null,
    baseVersion: 0,
    dirty: false,
    rev: 0,
    saving: false,
    again: false,
    timer: null as ReturnType<typeof setTimeout> | null,
    migrating: false,
    lastPull: 0,
  });

  const show = useCallback((d: PlannerData) => {
    r.current.data = d;
    setDataState(d);
  }, []);

  const persistCache = useCallback(() => {
    if (!email || !r.current.data) return;
    writeJson(CACHE_KEY, { email, baseVersion: r.current.baseVersion, dirty: r.current.dirty, data: r.current.data } satisfies Cache);
  }, [email]);

  const save = useCallback(async () => {
    const s = r.current;
    if (!account || !s.data) return;
    if (s.timer) {
      clearTimeout(s.timer);
      s.timer = null;
    }
    if (s.saving) {
      s.again = true;
      return;
    }
    s.saving = true;
    setStatus({ kind: "saving" });
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const rev = s.rev;
        const sent = s.data!;
        let res: Response;
        try {
          res = await fetch("/api/planner", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ version: s.baseVersion, data: sent }),
          });
        } catch {
          setStatus({ kind: "offline" });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { version?: number; updatedAt?: string; error?: string; current?: PlannerDoc };
        if (res.ok && typeof body.version === "number") {
          s.baseVersion = body.version;
          if (s.rev === rev) s.dirty = false;
          persistCache();
          if (s.migrating && email) {
            markMigrated(email);
            s.migrating = false;
          }
          setStatus(s.dirty ? { kind: "pending" } : { kind: "saved", at: body.updatedAt ?? null, justSaved: true });
          if (!s.dirty) return;
          continue;
        }
        if (res.status === 409 && body.current) {
          // Changed elsewhere (another tab, device, or an "Add to my planner"): keep both, this copy wins ties.
          const current = sanitizePlannerData(body.current.data) || { hunts: [], budget: [], checklist: [], deleted: [] };
          s.baseVersion = body.current.version;
          show(mergePlanners(current, s.data!, "b"));
          s.rev++;
          persistCache();
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          setStatus({ kind: "error", message: "Your session ended. Sign in again to sync; your changes are kept on this device.", canRetry: false });
        } else if (res.status === 413 || res.status === 400) {
          setStatus({ kind: "error", message: body.error || "This planner couldn't be saved.", canRetry: false });
        } else {
          setStatus({ kind: "error", message: `${body.error || "Couldn't save to your account."} Your changes are kept on this device.`, canRetry: true });
        }
        return;
      }
      setStatus({ kind: "error", message: "Your planner kept changing elsewhere while saving. Try again.", canRetry: true });
    } finally {
      s.saving = false;
      if (s.again) {
        s.again = false;
        if (s.dirty) void save();
      }
    }
  }, [account, email, persistCache, show]);

  /** Load the account copy and merge in anything only this browser has. */
  const pull = useCallback(async () => {
    const s = r.current;
    if (!account || !email || s.saving) return;
    s.lastPull = Date.now();
    let res: Response;
    try {
      res = await fetch("/api/planner", { cache: "no-store" });
    } catch {
      if (!s.data) show(withDefaults(readLegacy() || { hunts: [], budget: [], checklist: [], deleted: [] }));
      setStatus({ kind: "offline" });
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { doc?: PlannerDoc; error?: string };
    if (!res.ok || !body.doc) {
      if (!s.data) show(withDefaults(readLegacy() || { hunts: [], budget: [], checklist: [], deleted: [] }));
      setStatus({
        kind: "error",
        message:
          res.status === 401 || res.status === 403
            ? "Sign in again to sync your planner. Changes are kept on this device."
            : `${body.error || "Couldn't load your planner from your account."} Changes are kept on this device.`,
        canRetry: res.status !== 401 && res.status !== 403,
      });
      return;
    }
    if (s.saving) return;
    const remote = sanitizePlannerData(body.doc.data) || { hunts: [], budget: [], checklist: [], deleted: [] };
    let next = remote;
    let mustSave = false;
    if (s.dirty && s.data) {
      next = mergePlanners(remote, s.data, "b");
      mustSave = true;
    }
    const legacy = readLegacy();
    if (legacy && hasPlannerContent(legacy) && !migrated(email)) {
      const before = next.hunts.length;
      next = mergePlanners(next, legacy, "a");
      const moved = next.hunts.length - before;
      s.migrating = true;
      mustSave = true;
      setNotice(
        moved > 0
          ? `Moved ${moved} hunt${moved === 1 ? "" : "s"} you'd saved in this browser into your account. They'll now show up wherever you sign in.`
          : "Merged the planner saved in this browser into your account."
      );
    }
    if (body.doc.version === 0 && next.checklist.length === 0) next = { ...next, checklist: defaultChecklist() };
    s.baseVersion = body.doc.version;
    if (!s.data || !samePlanner(s.data, next)) show(next);
    s.rev++;
    if (mustSave && !samePlanner(next, remote)) {
      s.dirty = true;
      persistCache();
      void save();
    } else {
      s.dirty = false;
      if (s.migrating) {
        markMigrated(email);
        s.migrating = false;
      }
      persistCache();
      setStatus({ kind: "saved", at: body.doc.updatedAt, justSaved: false });
    }
  }, [account, email, persistCache, save, show]);

  // Start up once the session is known.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // Deferred so the first client render matches the server render (no storage there).
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (!account || !email) {
        show(withDefaults(readLegacy() || { hunts: [], budget: [], checklist: [], deleted: [] }));
        setStatus({ kind: "browser" });
        return;
      }
      const cache = readCache(email);
      if (cache) {
        r.current.baseVersion = cache.baseVersion;
        r.current.dirty = cache.dirty;
        show(cache.data);
      }
      setStatus({ kind: "loading" });
      void pull();
    });
    return () => {
      cancelled = true;
    };
  }, [ready, account, email, pull, show]);

  // Sync when the connection comes back, and pick up changes from other tabs on return.
  useEffect(() => {
    if (!account) return;
    const onOnline = () => (r.current.dirty ? void save() : void pull());
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (r.current.dirty) void save();
      else if (Date.now() - r.current.lastPull > 5000) void pull();
    };
    const onHide = () => {
      const s = r.current;
      if (!s.dirty || !s.data || s.saving) return;
      const payload = JSON.stringify({ version: s.baseVersion, data: s.data });
      // keepalive bodies are capped at 64 KB; bigger planners sync on the next visit.
      if (payload.length < 60_000) {
        try {
          void fetch("/api/planner", { method: "PUT", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
        } catch {
          // ignore
        }
      }
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
    };
  }, [account, pull, save]);

  useEffect(() => {
    const s = r.current;
    return () => {
      if (s.timer) clearTimeout(s.timer);
    };
  }, []);

  /** Change the planner; members' changes autosave after a short pause. */
  const update = useCallback(
    (updater: (prev: PlannerData) => PlannerData) => {
      const s = r.current;
      if (!s.data) return;
      const next = updater(s.data);
      if (next === s.data) return;
      show(next);
      s.rev++;
      if (!account) {
        writeJson(LEGACY_KEY, next);
        return;
      }
      s.dirty = true;
      persistCache();
      setStatus((st) => (st.kind === "saving" ? st : { kind: "pending" }));
      if (s.timer) clearTimeout(s.timer);
      s.timer = setTimeout(() => void save(), SAVE_DELAY_MS);
    },
    [account, persistCache, save, show]
  );

  const retry = useCallback(() => {
    if (r.current.dirty) void save();
    else void pull();
  }, [pull, save]);

  return { data, status, update, retry, notice, dismissNotice: () => setNotice(null), account };
}
