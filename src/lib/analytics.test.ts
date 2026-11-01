// Run with: npm test
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  __resetForTests,
  describePath,
  hashEmail,
  needsConsent,
  sanitizeProps,
  startClarity,
  track,
  trackPurchase,
} from "@/lib/analytics";

type G = { window?: unknown };
const g = globalThis as unknown as G;

function fakeWindow() {
  const calls: unknown[][] = [];
  const store = new Map<string, string>();
  const win = {
    clarity: (...args: unknown[]) => calls.push(args),
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
  g.window = win;
  return { calls, win };
}

beforeEach(() => __resetForTests());
afterEach(() => {
  delete g.window;
});

test("consent region covers the EEA, UK and Switzerland only", () => {
  for (const c of ["DE", "fr", "IE", "NO", "IS", "LI", "GB", "CH"]) assert.equal(needsConsent(c), true, c);
  for (const c of ["US", "CA", "MX", "AU", "", null, undefined]) assert.equal(needsConsent(c), false, String(c));
});

test("describePath maps routes to page types and state slugs", () => {
  assert.deepEqual(describePath("/"), { type: "home", state: null });
  assert.deepEqual(describePath("/states"), { type: "states", state: null });
  assert.deepEqual(describePath("/states/utah"), { type: "state", state: "utah" });
  assert.deepEqual(describePath("/states/new-mexico/units/16A"), { type: "unit", state: "new-mexico" });
  assert.deepEqual(describePath("/request-state"), { type: "request_state", state: null });
  assert.deepEqual(describePath("/nope"), { type: "other", state: null });
});

test("sanitizeProps drops empty values and anything that looks like personal data", () => {
  assert.deepEqual(
    sanitizeProps({ state: "utah", email: "a@b.co", userName: "Al", phone: "555", notes: "x", who: "me@x.com", n: 3, ok: false, nan: NaN, empty: "", none: null }),
    { state: "utah", n: 3, ok: false }
  );
  assert.equal((sanitizeProps({ long: "x".repeat(500) }).long as string).length, 100);
});

test("hashEmail normalizes then hashes with SHA-256", async () => {
  const want = "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b";
  assert.equal(await hashEmail("test@example.com"), want);
  assert.equal(await hashEmail("  Test@Example.COM "), want);
});

test("track is a no-op on the server", () => {
  assert.doesNotThrow(() => track("state_view", { state: "utah" }));
  assert.equal(trackPurchase("cs_test_1"), false);
});

test("Clarity calls wait for the consent signal, then flush in order", () => {
  const { calls } = fakeWindow();
  track("data_tab", { tab: "harvest" });
  assert.equal(calls.length, 0, "nothing reaches Clarity before startClarity");
  startClarity({ ads: "denied", analytics: "denied" });
  assert.deepEqual(calls, [
    ["consentv2", { ad_Storage: "denied", analytics_Storage: "denied" }],
    ["set", "tab", "harvest"],
    ["event", "data_tab"],
  ]);
  track("checkout_start");
  assert.deepEqual(calls.at(-1), ["event", "checkout_start"]);
});

test("purchase is sent once per checkout session", () => {
  const { calls } = fakeWindow();
  startClarity();
  assert.equal(trackPurchase("cs_test_abc"), true);
  assert.equal(trackPurchase("cs_test_abc"), false);
  assert.equal(calls.filter((c) => c[0] === "event" && c[1] === "purchase").length, 1);
  assert.equal(trackPurchase("cs_test_other"), true);
});
