/**
 * Client-side analytics helpers: Microsoft Clarity always, plus the Google Ads
 * tag and Meta Pixel only when their IDs are configured, the visitor's browser
 * doesn't send Global Privacy Control, and (in the EEA, UK and Switzerland) the
 * visitor accepted the consent banner. See ANALYTICS.md.
 *
 * Every function here is a safe no-op on the server and before the scripts
 * load. Calls made before a destination is ready are held briefly in memory and
 * sent once it is (or dropped if it never becomes ready, e.g. ads declined).
 * Raw email addresses are never sent anywhere: Clarity gets a SHA-256 hash.
 */

export type AnalyticsEvent =
  | "state_view"
  | "species_select"
  | "data_tab"
  | "compare_open"
  | "trends_view"
  | "unit_view"
  | "shortlist_run"
  | "checkout_start"
  | "purchase"
  | "sign_in_click"
  | "request_state_submit"
  | "welcome_submit"
  | "reminders_toggle"
  | "calendar_filter"
  | "free_reminders_signup"
  | "planner_add";

export type EventProps = Record<string, string | number | boolean | null | undefined>;

export type ConsentChoice = "granted" | "denied";

type Fn = (...args: unknown[]) => void;
type ClarityFn = Fn & { q?: unknown[] };
type FbqFn = Fn & { callMethod?: Fn; queue: unknown[]; push: FbqFn; loaded: boolean; version: string };

declare global {
  interface Window {
    clarity?: ClarityFn;
    gtag?: Fn;
    dataLayer?: unknown[];
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
  interface Navigator {
    globalPrivacyControl?: boolean;
  }
}

// ---------------------------------------------------------------------------
// Configuration (NEXT_PUBLIC_* values are inlined at build time)
// ---------------------------------------------------------------------------

function clean(v: string | undefined, pattern: RegExp): string | null {
  const s = (v ?? "").trim();
  return pattern.test(s) ? s : null;
}

/** Clarity project id. Defaults to the HuntScout project; set the env var to "off" to disable. */
export const CLARITY_ID = clean(process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? "z6liofa1yc", /^[a-z0-9]{6,20}$/i);
/** Google Ads tag id, e.g. AW-123456789. */
export const GOOGLE_ADS_ID = clean(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID, /^AW-\d{4,20}$/);
/** Conversion label for the $14.99 purchase (the part after the slash in send_to). */
export const GOOGLE_ADS_PURCHASE_LABEL = clean(process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL, /^[A-Za-z0-9_-]{4,64}$/);
/** Meta (Facebook) Pixel id: digits only. */
export const META_PIXEL_ID = clean(process.env.NEXT_PUBLIC_META_PIXEL_ID, /^\d{6,20}$/);

export const PRO_PRICE_USD = 14.99;

// EU member states, the rest of the EEA (Iceland, Liechtenstein, Norway), the UK and Switzerland.
export const CONSENT_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB", "UK", "CH",
]);

/** True when visitors from this ISO country code must opt in before ad pixels or analytics cookies. */
export function needsConsent(country: string | null | undefined): boolean {
  return !!country && CONSENT_COUNTRIES.has(country.toUpperCase());
}

// ---------------------------------------------------------------------------
// Delivery queues
// ---------------------------------------------------------------------------

const MAX_PENDING = 50;

function makeQueue() {
  let ready = false;
  let pending: (() => void)[] = [];
  return {
    run(fn: () => void) {
      if (typeof window === "undefined") return;
      if (ready) {
        try {
          fn();
        } catch {}
      } else if (pending.length < MAX_PENDING) {
        pending.push(fn);
      }
    },
    open() {
      ready = true;
      const list = pending;
      pending = [];
      for (const fn of list) {
        try {
          fn();
        } catch {}
      }
    },
    isReady: () => ready,
    /** Test hook. */
    reset() {
      ready = false;
      pending = [];
    },
  };
}

const clarityQueue = makeQueue();
const adsQueue = makeQueue();
// Set when the visitor withdraws consent after the ad tags loaded on this page:
// from then on nothing more is sent to Google or Meta.
let adsWithdrawn = false;

function ads(fn: () => void) {
  if (adsWithdrawn) return;
  adsQueue.run(fn);
}

function clarity(...args: unknown[]) {
  if (!CLARITY_ID) return;
  clarityQueue.run(() => window.clarity?.(...args));
}

/**
 * Define Clarity's command queue so calls made before its script arrives are
 * kept (this is what Microsoft's install snippet does), then deliver anything
 * we held. Called by AnalyticsProvider once the consent signal has been set.
 */
export function startClarity(consent?: { ads: ConsentChoice; analytics: ConsentChoice }) {
  if (typeof window === "undefined" || !CLARITY_ID) return;
  if (!window.clarity) {
    const stub: ClarityFn = function (...args: unknown[]) {
      (stub.q = stub.q || []).push(args);
    };
    window.clarity = stub;
  }
  // The consent signal goes first so Clarity never starts without it.
  if (consent) setClarityConsent(consent);
  clarityQueue.open();
}

export function setClarityConsent(consent: { ads: ConsentChoice; analytics: ConsentChoice }) {
  if (typeof window === "undefined" || !CLARITY_ID || !window.clarity) return;
  try {
    window.clarity("consentv2", { ad_Storage: consent.ads, analytics_Storage: consent.analytics });
  } catch {}
}

/** Define gtag / fbq command queues and send their init calls. Script tags are rendered by AnalyticsProvider. */
export function startAds() {
  if (typeof window === "undefined" || adsQueue.isReady()) return;
  if (GOOGLE_ADS_ID && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    // gtag.js expects the arguments object itself, exactly as Google's snippet pushes it.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("consent", "default", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
    });
    window.gtag("config", GOOGLE_ADS_ID);
  }
  if (META_PIXEL_ID && !window.fbq) {
    const n = function (...args: unknown[]) {
      if (n.callMethod) n.callMethod(...args);
      else n.queue.push(args);
    } as FbqFn;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    window.fbq = n;
    if (!window._fbq) window._fbq = n;
    // No automatic button/page-content scraping ("automatic events"); we send our own events.
    window.fbq("set", "autoConfig", false, META_PIXEL_ID);
    // Meta's pixel records later client-side route changes as PageViews on its own.
    window.fbq("init", META_PIXEL_ID);
    window.fbq("track", "PageView");
  }
  adsQueue.open();
}

/** Visitor withdrew (granted = false) or restored consent after the ad tags had loaded on this page. */
export function updateAdsConsent(granted: boolean) {
  if (typeof window === "undefined") return;
  adsWithdrawn = !granted;
  const v = granted ? "granted" : "denied";
  try {
    window.gtag?.("consent", "update", { ad_storage: v, ad_user_data: v, ad_personalization: v, analytics_storage: v });
    window.fbq?.("consent", granted ? "grant" : "revoke");
  } catch {}
}

export function adsConfigured(): boolean {
  return !!(GOOGLE_ADS_ID || META_PIXEL_ID);
}

/** Global Privacy Control (Sec-GPC) is on in this browser. */
export function gpcEnabled(): boolean {
  return typeof navigator !== "undefined" && navigator.globalPrivacyControl === true;
}

// ---------------------------------------------------------------------------
// Events and tags
// ---------------------------------------------------------------------------

const BLOCKED_KEY = /mail|name|phone|password|token|note/i;

/** Drops empty values and anything that looks like personal data; trims long strings. */
export function sanitizeProps(props: EventProps | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!props) return out;
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === "" || BLOCKED_KEY.test(k)) continue;
    if (typeof v === "string") {
      if (v.includes("@")) continue;
      out[k] = v.slice(0, 100);
    } else if (typeof v === "number") {
      if (Number.isFinite(v)) out[k] = v;
    } else {
      out[k] = v;
    }
  }
  return out;
}

const META_STANDARD: Partial<Record<AnalyticsEvent, string>> = {
  checkout_start: "InitiateCheckout",
};

/** Record a funnel event. Props become Clarity custom tags (filterable in the dashboard). */
export function track(event: AnalyticsEvent, props?: EventProps) {
  if (typeof window === "undefined") return;
  const p = sanitizeProps(props);
  for (const [k, v] of Object.entries(p)) clarity("set", k, String(v));
  clarity("event", event);
  if (GOOGLE_ADS_ID) ads(() => window.gtag?.("event", event, p));
  if (META_PIXEL_ID) {
    const standard = META_STANDARD[event];
    ads(() => (standard ? window.fbq?.("track", standard, p) : window.fbq?.("trackCustom", event, p)));
  }
}

const PURCHASE_KEY = "hs_purchase_tracked:";

/**
 * Purchase conversion, sent at most once per Stripe Checkout Session id (per
 * browser tab session). Call only after the server confirmed the session was paid.
 * Returns false when it had already been sent.
 */
export function trackPurchase(sessionId: string): boolean {
  if (typeof window === "undefined" || !sessionId) return false;
  const key = PURCHASE_KEY + sessionId;
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
  } catch {}
  clarity("set", "purchased", "true");
  clarity("event", "purchase");
  if (GOOGLE_ADS_ID && GOOGLE_ADS_PURCHASE_LABEL) {
    const sendTo = `${GOOGLE_ADS_ID}/${GOOGLE_ADS_PURCHASE_LABEL}`;
    ads(() =>
      window.gtag?.("event", "conversion", { send_to: sendTo, value: PRO_PRICE_USD, currency: "USD", transaction_id: sessionId })
    );
  }
  if (META_PIXEL_ID) {
    ads(() => window.fbq?.("track", "Purchase", { value: PRO_PRICE_USD, currency: "USD" }, { eventID: sessionId }));
  }
  return true;
}

/** Clarity session tag. */
export function setTag(key: string, value: string | number | boolean | null | undefined) {
  if (typeof window === "undefined" || value === null || value === undefined || value === "") return;
  clarity("set", key, String(value));
}

export type PageType =
  | "home" | "states" | "state" | "unit" | "compare" | "trends" | "calendar" | "planner" | "shortlist" | "turkey"
  | "pricing" | "success" | "welcome" | "account" | "signin" | "request_state" | "about" | "privacy" | "terms" | "other";

const PAGE_TYPES: Record<string, PageType> = {
  compare: "compare", trends: "trends", calendar: "calendar", planner: "planner", shortlist: "shortlist",
  turkey: "turkey", pricing: "pricing", success: "success", welcome: "welcome", account: "account",
  signin: "signin", "request-state": "request_state", about: "about", privacy: "privacy", terms: "terms",
};

/** Page type and state slug for a pathname, e.g. /states/utah/units/10 -> { type: "unit", state: "utah" }. */
export function describePath(pathname: string | null | undefined): { type: PageType; state: string | null } {
  const parts = (pathname || "/").split("/").filter(Boolean);
  if (parts.length === 0) return { type: "home", state: null };
  if (parts[0] === "states") {
    if (parts.length === 1) return { type: "states", state: null };
    const state = /^[a-z-]{2,30}$/.test(parts[1]) ? parts[1] : null;
    return { type: parts[2] === "units" ? "unit" : "state", state };
  }
  return { type: PAGE_TYPES[parts[0]] ?? "other", state: null };
}

export const setPageType = (t: PageType) => setTag("page_type", t);
export const setStateSlug = (slug: string | null | undefined) => setTag("state", slug);
export const setSpecies = (species: string | null | undefined) => setTag("species", species);
export const setIsPro = (isPro: boolean) => setTag("is_pro", isPro);
export const setSignedIn = (signedIn: boolean) => setTag("signed_in", signedIn);

/** Lower-case hex SHA-256 of the trimmed, lower-cased email; null where Web Crypto is unavailable. */
export async function hashEmail(email: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const bytes = await subtle.digest("SHA-256", new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Link this Clarity session to a signed-in user by hashed email (never the raw address). */
export async function identify(email: string | null | undefined) {
  if (typeof window === "undefined" || !email || !CLARITY_ID) return;
  try {
    const id = await hashEmail(email);
    if (id) clarity("identify", id);
  } catch {}
}

// ---------------------------------------------------------------------------
// Stored consent choice
// ---------------------------------------------------------------------------

const CONSENT_KEY = "hs_consent";
export const CONSENT_EVENT = "hs:consent";

export function getStoredConsent(): ConsentChoice | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    const v = raw ? (JSON.parse(raw) as { choice?: unknown }).choice : null;
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

/** Save the visitor's choice and tell AnalyticsProvider (used by the banner and the privacy page). */
export function setStoredConsent(choice: ConsentChoice) {
  try {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ v: 1, choice, at: new Date().toISOString() }));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
  } catch {}
}

/** Test hook: forget queued calls and readiness. */
export function __resetForTests() {
  clarityQueue.reset();
  adsQueue.reset();
  adsWithdrawn = false;
}
