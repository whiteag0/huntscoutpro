// Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { CHECKOUT_SIGN_IN_HREF, isCheckoutPath, safeCallbackUrl, signInHref, withoutCheckoutParam } from "@/lib/checkout-path";

test("callback URLs stay on this site", () => {
  assert.equal(safeCallbackUrl("/states/colorado?species=elk"), "/states/colorado?species=elk");
  assert.equal(safeCallbackUrl(null), "/states");
  assert.equal(safeCallbackUrl(""), "/states");
  assert.equal(safeCallbackUrl("https://evil.example/"), "/states");
  assert.equal(safeCallbackUrl("//evil.example/"), "/states");
  assert.equal(safeCallbackUrl("/\\evil.example/"), "/states");
  assert.equal(safeCallbackUrl("javascript:alert(1)"), "/states");
  // Browsers strip tabs and newlines from URLs, which would turn these into //evil.example.
  assert.equal(safeCallbackUrl("/\t/evil.example/"), "/states");
  assert.equal(safeCallbackUrl("/\n/evil.example/"), "/states");
  assert.equal(safeCallbackUrl("/pricing?checkout=1#top"), "/pricing?checkout=1#top");
  assert.equal(safeCallbackUrl("nope", "/pricing"), "/pricing");
});

test("sign-in links return to the page they came from", () => {
  assert.equal(signInHref("/states/colorado?species=elk"), "/signin?callbackUrl=%2Fstates%2Fcolorado%3Fspecies%3Delk");
  assert.equal(signInHref("https://evil.example/"), "/signin?callbackUrl=%2F");
  assert.equal(CHECKOUT_SIGN_IN_HREF, "/signin?callbackUrl=%2Fpricing%3Fcheckout%3D1");
  // What /signin reads back out of its query string.
  const back = new URL(CHECKOUT_SIGN_IN_HREF, "https://x.test").searchParams.get("callbackUrl");
  assert.equal(safeCallbackUrl(back), "/pricing?checkout=1");
  assert.ok(isCheckoutPath(back!));
});

test("only /pricing with checkout=1 starts checkout", () => {
  assert.ok(isCheckoutPath("/pricing?checkout=1"));
  assert.ok(isCheckoutPath("https://www.huntscoutpro.com/pricing?utm_source=x&checkout=1"));
  assert.ok(!isCheckoutPath("/pricing"));
  assert.ok(!isCheckoutPath("/pricing?checkout=0"));
  assert.ok(!isCheckoutPath("/states?checkout=1"));
  assert.ok(!isCheckoutPath("/pricing/other?checkout=1"));
});

test("the flag is removed and everything else kept", () => {
  assert.equal(withoutCheckoutParam("/pricing?checkout=1"), "/pricing");
  assert.equal(withoutCheckoutParam("/pricing?utm_source=x&checkout=1#faq"), "/pricing?utm_source=x#faq");
  assert.equal(withoutCheckoutParam("http://localhost:3000/pricing?checkout=1"), "http://localhost:3000/pricing");
  assert.ok(!isCheckoutPath(withoutCheckoutParam("/pricing?checkout=1")));
});
