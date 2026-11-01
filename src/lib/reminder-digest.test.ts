// Run with: npm test. Renders the digest email; nothing is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { ReminderState } from "@/lib/reminders";

process.env.AUTH_SECRET = "test-secret-for-unit-tests";
const { buildDigest, parseIsoDay, reminderIdempotencyKey } = await import("@/lib/reminder-digest");
const { unsubscribeToken, verifyUnsubscribeToken } = await import("@/lib/reminder-unsubscribe");

const STATE: ReminderState = {
  slug: "utah",
  name: "Utah",
  abbrev: "UT",
  agency: { name: "Utah Division of Wildlife Resources", shortName: "UDWR", url: "https://wildlife.utah.gov" },
  sources: [{ id: "d1", title: "Guidebook <2027>", publisher: "UDWR", url: "https://wildlife.utah.gov/a.pdf?x=1&y=2", retrieved: "2026-10-01" }],
  species: (["elk", "mule-deer"] as const).map((species) => ({
    species,
    drawSystem: "bonus" as const,
    drawSystemSummary: "",
    pointsMatter: true,
    sourceIds: ["d1"],
    keyDates: [
      { label: "Sportsman <permit> application period", start: "2026-10-20", end: "2026-11-10", cycle: 2027, status: "tentative" as const, note: "Apply online & pay fees.", sourceId: "d1" },
    ],
  })),
};

const member = { email: "Hunter@Example.com", name: "Pat <Hunter>", states: ["utah"], species: [], residency: "" as const, homeState: "" };

test("nothing due -> no digest", () => {
  assert.equal(buildDigest(member, [STATE], "2026-11-01"), null);
});

test("digest groups species, escapes agency text and carries unsubscribe headers", () => {
  const d = buildDigest(member, [STATE], "2026-11-07")!;
  assert.equal(d.items.length, 2);
  assert.equal(d.groups.length, 1);
  assert.deepEqual(d.groups[0].entries[0].species, ["elk", "mule-deer"]);
  assert.equal(d.email.subject, "Application reminder: Utah (3 days left)");

  const { html, text } = d.email;
  assert.ok(html.includes("Sportsman &lt;permit&gt; application period"));
  assert.ok(!html.includes("<permit>"));
  assert.ok(html.includes("Hi Pat,"));
  assert.ok(html.includes("Closes Nov 10, 2026, 3 days from today."));
  assert.ok(html.includes("Window: Oct 20 – Nov 10, 2026"));
  assert.ok(html.includes("Tentative: the agency hasn&apos;t confirmed this date yet."));
  assert.ok(html.includes("Apply online &amp; pay fees."));
  assert.ok(html.includes('href="https://www.huntscoutpro.com/states/utah?species=elk"'));
  assert.ok(html.includes('href="https://www.huntscoutpro.com/states/utah?species=mule-deer"'));
  assert.ok(html.includes('href="https://wildlife.utah.gov/a.pdf?x=1&amp;y=2"'));
  assert.ok(html.includes('href="https://www.huntscoutpro.com/account"'));
  assert.ok(html.includes(d.unsubscribeUrl.replace(/&/g, "&amp;")));
  assert.ok(text.includes("Unsubscribe from deadline reminders: " + d.unsubscribeUrl));
  assert.ok(text.includes("Mule Deer on HuntScout: https://www.huntscoutpro.com/states/utah?species=mule-deer"));

  assert.deepEqual(d.headers, {
    "List-Unsubscribe": `<${d.unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  });
  const url = new URL(d.unsubscribeUrl);
  assert.equal(url.origin + url.pathname, "https://www.huntscoutpro.com/api/reminders/unsubscribe");
  assert.equal(url.searchParams.get("e"), "Hunter@Example.com");
  assert.ok(verifyUnsubscribeToken(url.searchParams.get("e"), url.searchParams.get("t")));
});

test("opens-today wording", () => {
  const d = buildDigest(member, [STATE], "2026-10-20")!;
  assert.equal(d.items[0].kind, "opens");
  assert.ok(d.email.text.includes("Opens today. Closes Nov 10, 2026, 21 days from today."));
  assert.equal(d.email.subject, "Application reminder: Utah (opens today)");
  assert.ok(!d.email.text.includes("Window:"));
  const early = buildDigest(member, [{ ...STATE, species: [{ ...STATE.species[0], keyDates: [{ ...STATE.species[0].keyDates[0], start: "2026-11-01" }] }] }], "2026-10-27")!;
  assert.ok(early.email.text.includes("Opens Nov 1, 2026. Closes Nov 10, 2026, 14 days from today."));
  assert.ok(!early.email.text.includes("Window:"));
});

test("idempotency key is sha256 of normalized email|today", () => {
  const want = "hs-remind-" + createHash("sha256").update("hunter@example.com|2026-11-07").digest("hex");
  assert.equal(reminderIdempotencyKey(" Hunter@Example.COM ", "2026-11-07"), want);
  assert.notEqual(reminderIdempotencyKey("hunter@example.com", "2026-11-08"), want);
});

test("unsubscribe token: HMAC over the normalized email, rejects tampering", () => {
  assert.equal(unsubscribeToken("Hunter@Example.com"), unsubscribeToken("hunter@example.com"));
  const t = unsubscribeToken("hunter@example.com");
  assert.ok(verifyUnsubscribeToken("HUNTER@example.com", t));
  assert.ok(!verifyUnsubscribeToken("other@example.com", t));
  assert.ok(!verifyUnsubscribeToken("hunter@example.com", t.slice(0, -1) + (t.endsWith("A") ? "B" : "A")));
  assert.ok(!verifyUnsubscribeToken("hunter@example.com", null));
  assert.ok(!verifyUnsubscribeToken(null, t));
});

test("parseIsoDay accepts only real calendar dates", () => {
  assert.equal(parseIsoDay("2027-01-15"), "2027-01-15");
  assert.equal(parseIsoDay("2027-02-30"), null);
  assert.equal(parseIsoDay("2027-1-5"), null);
  assert.equal(parseIsoDay(20270115), null);
});
