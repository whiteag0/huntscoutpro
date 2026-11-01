// Run with: npm test. Free deadline reminders: storage (local disk fallback),
// signed links, the signup lifecycle and the daily job's subscriber selection.
// Nothing is sent and no network is used.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ReminderState } from "@/lib/reminders";
import type { FreeSubscriber } from "@/lib/free-reminders-store";

const dir = mkdtempSync(path.join(os.tmpdir(), "hs-free-test-"));
process.env.BLOB_LOCAL_DIR = dir;
delete process.env.BLOB_STORE_ID;
process.env.AUTH_SECRET = "test-secret-for-unit-tests";
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));

const store = await import("@/lib/blob-store");
const tokens = await import("@/lib/free-reminders-token");
const subs = await import("@/lib/free-reminders-store");
const digest = await import("@/lib/free-reminders-digest");
const schema = await import("@/lib/free-reminders-schema");
const proDigest = await import("@/lib/reminder-digest");

// ------------------------------------------------------------------ storage

test("storeMode: Blob when BLOB_STORE_ID is set, disk only outside production", () => {
  assert.equal(store.storeMode({ BLOB_STORE_ID: "store_x", NODE_ENV: "production" }), "blob");
  assert.equal(store.storeMode({ NODE_ENV: "development" }), "local");
  assert.equal(store.storeMode({}), "local");
  assert.throws(() => store.storeMode({ NODE_ENV: "production" }), /BLOB_STORE_ID/);
  // Local `next start` QA can opt in, but never on Vercel.
  assert.equal(store.storeMode({ NODE_ENV: "production", BLOB_LOCAL_DIR: "/tmp/x" }), "local");
  assert.throws(() => store.storeMode({ NODE_ENV: "production", BLOB_LOCAL_DIR: "/tmp/x", VERCEL: "1" }), /BLOB_STORE_ID/);
  assert.equal(store.isStoreConfigured({ NODE_ENV: "production" }), false);
});

test("local store: put/get/list/delete and conditional writes", async () => {
  assert.equal(await store.getJson("t/a.json"), null);
  const e1 = await store.putJson("t/a.json", { n: 1 }, { ifNew: true });
  await assert.rejects(store.putJson("t/a.json", { n: 9 }, { ifNew: true }), store.StoreConflictError);
  const got = await store.getJson<{ n: number }>("t/a.json");
  assert.deepEqual(got?.data, { n: 1 });
  assert.equal(got?.etag, e1);
  const e2 = await store.putJson("t/a.json", { n: 2 }, { ifMatch: e1 });
  assert.notEqual(e2, e1);
  await assert.rejects(store.putJson("t/a.json", { n: 3 }, { ifMatch: e1 }), store.StoreConflictError);
  await store.putJson("t/b.json", { n: 1 });
  await store.putJson("other/c.json", { n: 1 });
  assert.deepEqual(await store.listPaths("t/"), ["t/a.json", "t/b.json"]);
  await store.deletePath("t/a.json");
  assert.deepEqual(await store.listPaths("t/"), ["t/b.json"]);
  await assert.rejects(store.getJson("../escape.json"), /Invalid store path/);
});

// ------------------------------------------------------------------- tokens

test("subscriber id is sha256 of the normalized email", () => {
  const want = createHash("sha256").update("hunter@example.com").digest("hex");
  assert.equal(tokens.subscriberId(" Hunter@Example.COM "), want);
  assert.ok(tokens.isSubscriberId(want));
  assert.ok(!tokens.isSubscriberId("abc"));
});

test("confirm token: valid, tampered, wrong purpose, expired", () => {
  const id = tokens.subscriberId("hunter@example.com");
  const now = Date.parse("2026-11-01T12:00:00Z");
  const x = Math.floor(now / 1000) + 3600;
  const t = tokens.confirmToken(id, "nonce12345", x);
  const p = { id, n: "nonce12345", x: String(x), t };
  assert.equal(tokens.verifyConfirmToken(p, now), "ok");
  assert.equal(tokens.verifyConfirmToken({ ...p, n: "nonce12346" }, now), "invalid");
  assert.equal(tokens.verifyConfirmToken({ ...p, x: String(x + 86400) }, now), "invalid");
  assert.equal(tokens.verifyConfirmToken({ ...p, id: tokens.subscriberId("other@example.com") }, now), "invalid");
  assert.equal(tokens.verifyConfirmToken({ ...p, t: tokens.unsubscribeToken(id) }, now), "invalid");
  assert.equal(tokens.verifyConfirmToken({ ...p, t: null }, now), "invalid");
  assert.equal(tokens.verifyConfirmToken(p, (x + 1) * 1000), "expired");

  const url = new URL(tokens.confirmUrl(id, "nonce12345", x));
  assert.equal(url.origin + url.pathname, "https://www.huntscoutpro.com/api/free-reminders/confirm");
  assert.ok(!url.search.includes("example.com"), "the address never appears in links");
  assert.equal(tokens.verifyConfirmToken(Object.fromEntries(url.searchParams), now), "ok");
});

test("unsubscribe token: HMAC over the id, rejects tampering", () => {
  const id = tokens.subscriberId("hunter@example.com");
  const url = new URL(tokens.freeUnsubscribeUrl(id, "http://localhost:3300"));
  assert.equal(url.origin + url.pathname, "http://localhost:3300/api/free-reminders/unsubscribe");
  const t = url.searchParams.get("t")!;
  assert.ok(tokens.verifyUnsubscribeToken(url.searchParams.get("id"), t));
  assert.ok(!tokens.verifyUnsubscribeToken(tokens.subscriberId("x@example.com"), t));
  assert.ok(!tokens.verifyUnsubscribeToken(id, t.slice(0, -1) + (t.endsWith("A") ? "B" : "A")));
  assert.ok(!tokens.verifyUnsubscribeToken(id, null));
  assert.ok(!tokens.verifyUnsubscribeToken("not-an-id", t));
});

// ------------------------------------------------------------------- schema

test("signup validation", () => {
  const speciesFor = (s: string) => (s === "utah" ? ["elk", "mule-deer"] : null);
  const ok = schema.parseFreeSignup({ email: " Pat@Example.com ", state: "Utah", species: ["elk", "elk", "moose", 3], residency: "nonresident" }, speciesFor);
  assert.deepEqual(ok, { ok: true, value: { email: "Pat@Example.com", state: "utah", species: ["elk"], residency: "nonresident" } });
  const bad = schema.parseFreeSignup({ email: "nope", state: "ohio", residency: "maybe" }, speciesFor);
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(!bad.ok ? bad.errors : {}).sort(), ["email", "residency", "state"]);
  // A live state with no reminder dates isn't offered.
  assert.equal(schema.parseFreeSignup({ email: "a@b.co", state: "colorado", residency: "both" }, speciesFor).ok, false);
});

// ---------------------------------------------------------------- lifecycle

test("double opt-in lifecycle: pending, confirm, change, unsubscribe", async () => {
  const t0 = Date.parse("2026-11-01T12:00:00Z");
  const signup = { email: "Life@Example.com", state: "utah", species: ["elk"], residency: "resident" as const };
  const first = await subs.requestSubscription(signup, { now: t0, source: "calendar" });
  assert.equal(first.kind, "send");
  if (first.kind !== "send") return;
  assert.equal(first.change, false);
  assert.equal(first.id, tokens.subscriberId("life@example.com"));
  let rec = await subs.getSubscriber(first.id);
  assert.equal(rec?.status, "pending");
  assert.equal(rec?.source, "calendar");

  // Same request again: same link (an earlier email still works).
  const again = await subs.requestSubscription(signup, { now: t0 + 60_000 });
  assert.equal(again.kind === "send" && again.nonce, first.nonce);

  assert.equal((await subs.confirmSubscription(first.id, "wrong-nonce", t0)).kind, "stale");
  const ok = await subs.confirmSubscription(first.id, first.nonce, t0 + 120_000);
  assert.equal(ok.kind, "confirmed");
  rec = await subs.getSubscriber(first.id);
  assert.equal(rec?.status, "active");
  assert.equal(rec?.pending, undefined);
  assert.equal((await subs.confirmSubscription(first.id, first.nonce, t0 + 180_000)).kind, "already");

  // Already active with the same choices: no email.
  assert.equal((await subs.requestSubscription(signup, { now: t0 + 200_000 })).kind, "unchanged");

  // A different state needs its own confirmation; current choices stay until then.
  const change = await subs.requestSubscription({ ...signup, state: "idaho", species: [] }, { now: t0 + 300_000 });
  assert.equal(change.kind, "send");
  assert.equal(change.kind === "send" && change.change, true);
  rec = await subs.getSubscriber(first.id);
  assert.equal(rec?.state, "utah");
  assert.equal(rec?.status, "active");
  // Third confirmation email in 24 h was the change; the fourth is refused.
  assert.equal((await subs.requestSubscription({ ...signup, state: "nevada" }, { now: t0 + 400_000 })).kind, "throttled");
  // A day later it's allowed again.
  const later = await subs.requestSubscription({ ...signup, state: "nevada" }, { now: t0 + 25 * 3600_000 });
  assert.equal(later.kind, "send");
  if (later.kind !== "send") return;
  // Only the newest link applies.
  assert.equal((await subs.confirmSubscription(first.id, change.kind === "send" ? change.nonce : "", t0 + 25 * 3600_000)).kind, "stale");
  assert.equal((await subs.confirmSubscription(first.id, later.nonce, t0 + 25 * 3600_000)).kind, "confirmed");
  assert.equal((await subs.getSubscriber(first.id))?.state, "nevada");

  const un = await subs.unsubscribeSubscriber(first.id, t0 + 26 * 3600_000);
  assert.equal(un.kind, "unsubscribed");
  assert.equal((await subs.getSubscriber(first.id))?.status, "unsubscribed");
  assert.equal((await subs.unsubscribeSubscriber(tokens.subscriberId("nobody@example.com"))).kind, "missing");

  const all = await subs.listSubscribers();
  assert.ok(all.some((s) => s.id === first.id));
});

test("stale pending signups are flagged for cleanup", () => {
  const base: Omit<FreeSubscriber, "status" | "updatedAt"> = { v: 1, id: "x", email: "a@b.co", state: "utah", species: [], residency: "both", createdAt: "2026-01-01T00:00:00Z", confirmSends: [] };
  const now = Date.parse("2026-11-01T00:00:00Z");
  assert.ok(subs.isStalePending({ ...base, status: "pending", updatedAt: "2026-09-01T00:00:00Z" }, now));
  assert.ok(!subs.isStalePending({ ...base, status: "pending", updatedAt: "2026-10-25T00:00:00Z" }, now));
  assert.ok(!subs.isStalePending({ ...base, status: "active", updatedAt: "2026-01-01T00:00:00Z" }, now));
});

// ---------------------------------------------------------- cron selection

const UTAH: ReminderState = {
  slug: "utah",
  name: "Utah",
  abbrev: "UT",
  agency: { name: "Utah Division of Wildlife Resources", shortName: "UDWR", url: "https://wildlife.utah.gov" },
  sources: [{ id: "d1", title: "Big game guidebook", publisher: "UDWR", url: "https://wildlife.utah.gov/g.pdf", retrieved: "2026-10-01" }],
  species: [
    {
      species: "elk",
      drawSystem: "bonus",
      drawSystemSummary: "",
      pointsMatter: true,
      sourceIds: ["d1"],
      keyDates: [
        { label: "Nonresident application deadline", date: "2026-11-10", cycle: 2027, status: "confirmed", sourceId: "d1" },
        { label: "Resident application deadline", date: "2026-11-10", cycle: 2027, status: "confirmed", sourceId: "d1" },
      ],
    },
    {
      species: "moose",
      drawSystem: "bonus",
      drawSystemSummary: "",
      pointsMatter: true,
      sourceIds: ["d1"],
      keyDates: [{ label: "Once-in-a-lifetime application deadline", date: "2026-11-10", cycle: 2027, status: "tentative", sourceId: "d1" }],
    },
  ],
};

const sub = (email: string, o: Partial<FreeSubscriber> = {}): FreeSubscriber => ({
  v: 1,
  id: tokens.subscriberId(email),
  email,
  status: "active",
  state: "utah",
  species: [],
  residency: "both",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  confirmSends: [],
  ...o,
});

test("cron selection: active only, Pro-covered skipped, same rules as Pro reminders", () => {
  const list = [
    sub("free@example.com"),
    sub("Pro@Example.com"),
    sub("pending@example.com", { status: "pending" }),
    sub("gone@example.com", { status: "unsubscribed" }),
    sub("retired@example.com", { state: "oldstate" }),
    sub("elk-res@example.com", { species: ["elk"], residency: "resident" }),
    sub("moose@example.com", { species: ["moose"] }),
  ];
  const { digests, stats } = digest.selectFreeDigests(list, {
    coveredByPro: new Set(["pro@example.com"]),
    states: [UTAH],
    today: "2026-11-07",
  });
  assert.deepEqual(
    digests.map((d) => d.subscriber.email),
    ["elk-res@example.com", "free@example.com", "moose@example.com"]
  );
  assert.deepEqual(stats, {
    freeRecords: 7,
    freeActive: 5,
    freePending: 1,
    freeUnsubscribed: 1,
    freeSkippedPro: 1,
    freeNoState: 1,
    freeWithDue: 3,
  });

  const byEmail = new Map(digests.map((d) => [d.subscriber.email, d]));
  // Resident elk-only: the nonresident deadline and moose are filtered out, as for Pro members.
  assert.deepEqual(byEmail.get("elk-res@example.com")!.items.map((i) => i.label), ["Resident application deadline"]);
  assert.equal(byEmail.get("free@example.com")!.items.length, 3);

  const d = byEmail.get("free@example.com")!;
  assert.equal(d.email.subject, "Application reminder: Utah (3 days left)");
  assert.ok(d.email.text.includes("Pro shows the full draw results and harvest for every state"));
  assert.ok(d.email.html.includes("Pro shows the full draw results and harvest for every state"));
  assert.ok(d.email.text.includes(`Unsubscribe: ${d.unsubscribeUrl}`));
  assert.ok(!d.email.text.includes("you're a HuntScout Pro member"));
  assert.deepEqual(d.headers, { "List-Unsubscribe": `<${d.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  const u = new URL(d.unsubscribeUrl);
  assert.ok(tokens.verifyUnsubscribeToken(u.searchParams.get("id"), u.searchParams.get("t")));
  // One free digest per address per day, never colliding with a Pro digest key.
  assert.equal(d.idempotencyKey, digest.freeReminderIdempotencyKey("FREE@example.com", "2026-11-07"));
  assert.notEqual(d.idempotencyKey, proDigest.reminderIdempotencyKey("free@example.com", "2026-11-07"));

  // Nothing due on other days.
  assert.equal(digest.selectFreeDigests(list, { coveredByPro: new Set(), states: [UTAH], today: "2026-11-08" }).digests.length, 0);
});
