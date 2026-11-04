// Run with: npm test. Onboarding and lifecycle email templates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SITE, preferencesEmail, welcomeEmail } from "@/lib/emails/onboarding";
import { formatAmount, mountainTime, onboardingCheckEmail, profileNudgeEmail, purchaseNotification } from "@/lib/emails/lifecycle";

const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
// Links in the body, without the shared header, signature and footer.
const bodyHrefs = (html: string) => hrefs(html.slice(html.indexOf("<p>Hi"), html.indexOf("border-top:2px solid")));

test("welcome email: signed-in buyers get one call to action, to /welcome", () => {
  const e = welcomeEmail({ name: "Jordan Smith", email: "jordan@example.test", accessUntil: new Date("2028-11-04T00:00:00Z") });
  assert.equal(e.subject, "You're in — 2 minutes to get your personal scouting report");
  assert.deepEqual(bodyHrefs(e.html), [`${SITE}/welcome`]);
  assert.doesNotMatch(e.html, /signin/);
  assert.match(e.html, /Hi Jordan,/);
  assert.match(e.html, /November 4, 2028/);
  assert.match(e.html, /scouting report/);
  assert.match(e.html, /&ldquo;got it&rdquo;/);
  assert.match(e.html, /Adam White/);
  // Plain text carries the same message.
  assert.match(e.text, /Get my scouting report: https:\/\/www\.huntscoutpro\.com\/welcome/);
  assert.match(e.text, /reply "got it"/);
  assert.match(e.text, /Adam White/);
  assert.doesNotMatch(e.text, /<|&[a-z]+;/);
});

test("welcome email escapes the buyer's name and email", () => {
  const e = welcomeEmail({ name: "<b>Pat</b>", email: "pat\"<x>@example.test", accessUntil: null });
  assert.doesNotMatch(e.html, /<b>Pat<\/b>|"<x>/);
  assert.match(e.html, /&lt;b&gt;Pat&lt;\/b&gt;/);
  assert.match(e.html, /pat&quot;&lt;x&gt;@example\.test/);
  assert.doesNotMatch(e.html, /active through/);
});

test("intake email no longer promises six questions on a four-step form", () => {
  const e = preferencesEmail({ name: "Jo" });
  assert.doesNotMatch(e.html + e.text, /six quick questions/i);
  assert.match(e.text, /four short steps/);
});

test("purchase alert: buyer, amount, time and states; no signature; escaped", () => {
  const e = purchaseNotification({
    name: "Jo <script>",
    email: "jo@example.test",
    amountCents: 1499,
    currency: "usd",
    paidAtMs: Date.parse("2026-11-04T18:05:00Z"),
    accessUntil: new Date("2028-11-04T18:05:00Z"),
    states: ["colorado", "wyoming"],
    paymentIntentId: "pi_123",
  });
  assert.equal(e.subject, "New HuntScout Pro purchase: jo@example.test ($14.99)");
  assert.match(e.html, /Jo &lt;script&gt;/);
  assert.doesNotMatch(e.html, /<script>/);
  assert.match(e.text, /Paid: Nov 4, 2026, 11:05\sAM MT/);
  assert.match(e.text, /States: Colorado, Wyoming/);
  assert.match(e.text, /Access until: 2028-11-04/);
  assert.doesNotMatch(e.html, /CEO &amp; Founder/);
  const none = purchaseNotification({ email: "a@example.test", amountCents: null, currency: null, paidAtMs: 0, paymentIntentId: "pi_1" });
  assert.match(none.text, /States: Not answered yet/);
  assert.match(none.text, /Amount: unknown amount/);
});

test("amount and time helpers", () => {
  assert.equal(formatAmount(1499, "usd"), "$14.99");
  assert.equal(formatAmount(1000, "eur"), "10.00 EUR");
  assert.equal(formatAmount(undefined, "usd"), "unknown amount");
  assert.match(mountainTime(Date.parse("2026-07-01T18:00:00Z")), /^Jul 1, 2026, 12:00\sPM MT$/);
});

test("onboarding check email lists each purchase and its problems", () => {
  const e = onboardingCheckEmail({
    windowHours: 48,
    rows: [
      { email: "a@example.test", paidAtMs: Date.parse("2026-11-04T18:00:00Z"), paymentIntentId: "pi_a", problems: ["Welcome emails not sent."] },
      { email: "b@example.test", name: "B & C", paidAtMs: Date.parse("2026-11-03T18:00:00Z"), paymentIntentId: "pi_b", problems: ["No report.", "Notify <failed>"] },
    ],
  });
  assert.equal(e.subject, "HuntScout onboarding check: 2 purchases need attention");
  assert.match(e.html, /B &amp; C/);
  assert.match(e.html, /Notify &lt;failed&gt;/);
  assert.match(e.text, /pi_b\n- No report\.\n- Notify <failed>/);
  assert.equal(onboardingCheckEmail({ windowHours: 48, rows: [{ email: "a@example.test", paidAtMs: 0, paymentIntentId: "pi_a", problems: ["x"] }] }).subject, "HuntScout onboarding check: 1 purchase needs attention");
});

test("profile nudges: one CTA to /welcome, unsubscribe link, species-aware copy", () => {
  const unsub = "https://www.huntscoutpro.com/api/reminders/unsubscribe?e=a%40b.test&t=tok";
  const one = profileNudgeEmail({ name: "Al", species: [], step: 1, unsubscribeUrl: unsub });
  assert.equal(one.subject, "Which states are you applying in?");
  assert.deepEqual(bodyHrefs(one.html).filter((h) => !h.endsWith("/account")), [`${SITE}/welcome`]);
  assert.match(one.html, /e=a%40b\.test&amp;t=tok/);
  assert.match(one.text, /Unsubscribe from reminder emails: https:\/\/www\.huntscoutpro\.com\/api\/reminders\/unsubscribe/);
  assert.match(one.text, /You haven't told us where you hunt yet/);
  assert.match(one.text, /- Your personal scouting report/);

  const two = profileNudgeEmail({ name: "Al", species: ["elk", "mule-deer"], step: 2, unsubscribeUrl: unsub });
  assert.equal(two.subject, "No deadline reminders yet: add a state to your profile");
  assert.match(two.text, /lists Elk, Mule Deer as your species but has no states yet/);
  assert.match(two.text, /last time we'll ask/);
  assert.match(two.text, /An updated personal scouting report/);
  assert.match(two.html, /Adam White/);
});
