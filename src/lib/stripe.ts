import Stripe from "stripe";

// Shared server-side Stripe client. Null when STRIPE_SECRET_KEY isn't configured.
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
      // Fail fast: entitlement checks run inside the login session request.
      timeout: 8000,
      maxNetworkRetries: 1,
    })
  : null;

// Tag stamped on every HuntScout Checkout Session and PaymentIntent. The Stripe
// account is shared with other EPIC AI products, so this is how we tell ours apart.
export const PRODUCT_TAG = "huntscout_pro";

// Pro access granted per purchase. Launch buyers were promised "Year 2 FREE".
export const ENTITLEMENT_MONTHS = 24;
