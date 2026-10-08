// Plain, current pricing. HuntScout Pro is a ONE-TIME Stripe Checkout payment
// (mode "payment"); nothing auto-renews. Each purchase grants
// ACCESS_MONTHS of Pro access — keep in sync with ENTITLEMENT_MONTHS in
// src/lib/stripe.ts (server-only, so it isn't imported here).
export const PRICE = {
  amount: 14.99,
  accessMonths: 24,
  summary: "One-time $14.99 — 2 years of Pro access, no auto-renewal",
};

// Legacy shape still read by src/app/page.tsx. The $29.99 -> $14.99 launch
// promo ended 2026-04-30 and there is no current discount, deadline, or
// subscriber count, so these values are deliberately plain.
// TODO(homepage owner): stop rendering originalPrice / percentOff /
// expiresLabel / socialProofCount and the countdown, then delete them here.
export const PROMO = {
  active: false,
  originalPrice: PRICE.amount,
  salePrice: PRICE.amount,
  percentOff: 0,
  expiresDate: null as string | null,
  expiresLabel: "24 months after purchase",
  secondYearFree: false,
  tagline: "$14.99 one-time · No auto-renewal · Pro access",
  ctaText: "Get Pro — $14.99 one-time",
  socialProofCount: "fellow",
};
