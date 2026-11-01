"use client";

import { useSyncExternalStore } from "react";
import { CONSENT_EVENT, getStoredConsent, gpcEnabled, type ConsentChoice } from "@/lib/analytics";

// ---- Visitor country (from /api/geo, cached for the tab session) ----------

const GEO_KEY = "hs_geo";
// undefined = not known yet; null = unknown country (no header, e.g. local dev).
let geoValue: string | null | undefined;
let geoStarted = false;
const geoListeners = new Set<() => void>();

function setGeo(v: string | null) {
  geoValue = v;
  for (const l of geoListeners) l();
}

function loadGeo() {
  if (geoStarted) return;
  geoStarted = true;
  try {
    const cached = window.sessionStorage.getItem(GEO_KEY);
    if (cached !== null) {
      queueMicrotask(() => setGeo(cached || null));
      return;
    }
  } catch {}
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  fetch("/api/geo", { cache: "no-store", signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((d: { country?: unknown } | null) => {
      const c = typeof d?.country === "string" && /^[A-Z]{2}$/.test(d.country) ? d.country : null;
      try {
        window.sessionStorage.setItem(GEO_KEY, c ?? "");
      } catch {}
      setGeo(c);
    })
    // Couldn't tell: no banner, and the country is asked again on the next page load.
    .catch(() => setGeo(null))
    .finally(() => clearTimeout(timer));
}

function subscribeGeo(cb: () => void) {
  geoListeners.add(cb);
  loadGeo();
  return () => {
    geoListeners.delete(cb);
  };
}

/** Visitor's country code: undefined while loading, null when unknown. */
export function useCountry(): string | null | undefined {
  return useSyncExternalStore(subscribeGeo, () => geoValue, () => undefined);
}

// ---- Stored consent choice -------------------------------------------------

function subscribeConsent(cb: () => void) {
  window.addEventListener(CONSENT_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(CONSENT_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The choice saved in this browser, or null if none. Always null during server render and hydration. */
export function useConsentChoice(): ConsentChoice | null {
  return useSyncExternalStore(subscribeConsent, getStoredConsent, () => null);
}

// ---- Global Privacy Control ------------------------------------------------

const noSubscribe = () => () => {};

export function useGpc(): boolean {
  return useSyncExternalStore(noSubscribe, gpcEnabled, () => false);
}

// ---- Mounted (client) flag ------------------------------------------------

export function useMounted(): boolean {
  return useSyncExternalStore(noSubscribe, () => true, () => false);
}
