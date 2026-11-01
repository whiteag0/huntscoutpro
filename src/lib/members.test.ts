// Run with: npm test. Uses a fake Stripe client; nothing touches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { listMembersWithPreferences, setRemindersOff, type MemberStripe } from "@/lib/members";

const NOW = new Date("2026-10-31T15:00:00Z");
const DAY = 86_400;
const nowSec = Math.floor(NOW.getTime() / 1000);

let n = 0;
function session(o: {
  email: string;
  daysAgo: number;
  md?: Record<string, string>;
  product?: string;
  paid?: boolean;
  refunded?: boolean;
  name?: string;
}): Stripe.Checkout.Session {
  n++;
  return {
    id: `cs_test_${n}`,
    object: "checkout.session",
    created: nowSec - o.daysAgo * DAY,
    status: "complete",
    payment_status: o.paid === false ? "unpaid" : "paid",
    success_url: "https://example.org/done",
    customer_details: { email: o.email, name: o.name ?? "Test Member" },
    customer_email: o.email,
    metadata: { product: o.product ?? "huntscout_pro", userEmail: o.email, userName: o.name ?? "" },
    payment_intent: {
      id: `pi_test_${n}`,
      object: "payment_intent",
      metadata: o.md ?? {},
      latest_charge: { id: `ch_${n}`, object: "charge", refunded: !!o.refunded, disputed: false },
    },
  } as unknown as Stripe.Checkout.Session;
}

function fakeStripe(sessions: Stripe.Checkout.Session[]) {
  const calls: { list: unknown[]; update: [string, unknown][] } = { list: [], update: [] };
  const client = {
    checkout: {
      sessions: {
        list(params: { customer_details?: { email: string } }) {
          calls.list.push(params);
          const rows = params.customer_details
            ? sessions.filter((s) => s.customer_details?.email === params.customer_details!.email)
            : sessions;
          return {
            async *[Symbol.asyncIterator]() {
              yield* rows;
            },
          };
        },
      },
    },
    paymentIntents: {
      async update(id: string, params: unknown) {
        calls.update.push([id, params]);
        return {};
      },
    },
  } as unknown as MemberStripe;
  return { client, calls };
}

const prefs = (states: string, extra: Record<string, string> = {}) => ({
  hs_pref_states: states,
  hs_pref_species: "elk,mule-deer",
  hs_pref_residency: "nonresident",
  hs_pref_home: "co",
  ...extra,
});

test("lists active members with states, newest purchase per email, from PaymentIntent metadata", async () => {
  const { client, calls } = fakeStripe([
    session({ email: "craig@example.com", daysAgo: 300, md: prefs("idaho") }),
    session({ email: "Craig@Example.com ", daysAgo: 20, md: prefs("colorado,wyoming"), name: "Craig Hunter" }),
    session({ email: "refunded@example.com", daysAgo: 10, md: prefs("utah"), refunded: true }),
    session({ email: "other@example.com", daysAgo: 10, md: prefs("utah"), product: "something_else" }),
    session({ email: "expired@example.com", daysAgo: 740, md: prefs("utah") }),
    session({ email: "optout@example.com", daysAgo: 5, md: prefs("utah", { hs_reminders_off: "1" }) }),
    session({ email: "nostates@example.com", daysAgo: 5, md: { hs_onboarded_at: "2026-10-20T00:00:00Z" } }),
    session({ email: "unpaid@example.com", daysAgo: 5, md: prefs("utah"), paid: false }),
  ]);

  const { members, stats } = await listMembersWithPreferences(client, NOW);

  assert.equal(members.length, 1);
  const [m] = members;
  assert.equal(m.email, "Craig@Example.com");
  assert.deepEqual(m.states, ["colorado", "wyoming"]);
  assert.deepEqual(m.species, ["elk", "mule-deer"]);
  assert.equal(m.residency, "nonresident");
  assert.equal(m.homeState, "CO");
  assert.equal(m.paymentIntentId, "pi_test_2");
  assert.equal(m.name, "Craig Hunter");
  assert.deepEqual(stats, { sessions: 8, active: 4, unique: 3, optedOut: 1, noStates: 1, members: 1 });

  const params = calls.list[0] as { status: string; created: { gte: number }; expand: string[] };
  assert.equal(params.status, "complete");
  assert.deepEqual(params.expand, ["data.payment_intent.latest_charge"]);
  // 25 months back from 2026-10-31
  assert.equal(new Date(params.created.gte * 1000).toISOString().slice(0, 10), "2024-10-01");
});

test("setRemindersOff stamps every HuntScout purchase for that email, and clears it again", async () => {
  const a = session({ email: "pat@example.com", daysAgo: 30, md: prefs("utah") });
  const b = session({ email: "pat@example.com", daysAgo: 400, md: prefs("utah") });
  const other = session({ email: "pat@example.com", daysAgo: 30, product: "something_else" });
  const { client, calls } = fakeStripe([a, b, other]);

  assert.equal(await setRemindersOff("Pat@Example.com", true, client), 2);
  assert.deepEqual(calls.update, [
    [(a.payment_intent as Stripe.PaymentIntent).id, { metadata: { hs_reminders_off: "1" } }],
    [(b.payment_intent as Stripe.PaymentIntent).id, { metadata: { hs_reminders_off: "1" } }],
  ]);

  const off = session({ email: "sam@example.com", daysAgo: 30, md: prefs("utah", { hs_reminders_off: "1" }) });
  const second = fakeStripe([off]);
  assert.equal(await setRemindersOff("sam@example.com", false, second.client), 1);
  assert.deepEqual(second.calls.update, [[(off.payment_intent as Stripe.PaymentIntent).id, { metadata: { hs_reminders_off: "" } }]]);

  // Already in the requested state: no write.
  const third = fakeStripe([off]);
  await setRemindersOff("sam@example.com", true, third.client);
  assert.deepEqual(third.calls.update, []);

  assert.equal(await setRemindersOff("nobody@example.com", true, fakeStripe([]).client), 0);
});
