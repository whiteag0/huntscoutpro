// Plain, current pricing. HuntScout Pro is a ONE-TIME Stripe Checkout payment
// (mode "payment"); nothing auto-renews. Each purchase grants
// ACCESS_MONTHS of Pro access — keep in sync with ENTITLEMENT_MONTHS in
// src/lib/stripe.ts (server-only, so it isn't imported here).
// There is no current discount, deadline, or launch promo.
export const PRICE = {
  amount: 14.99,
  accessMonths: 24,
  summary: "One-time $14.99 — 2 years of Pro access, no auto-renewal",
  tagline: "$14.99 one-time · 2 years of Pro access · No auto-renewal",
  ctaText: "Get Pro — $14.99 one-time",
};
