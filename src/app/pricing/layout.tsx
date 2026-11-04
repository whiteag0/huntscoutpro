import type { Metadata } from "next";
import { LIVE_STATES } from "@/lib/agency-format";
import { SITE } from "@/lib/emails/onboarding";
import { PRICE } from "@/lib/promo";

// The pricing page is a client component, so its metadata lives here.
const title = `Pricing: $${PRICE.amount} One-Time for ${PRICE.accessMonths / 12} Years of Pro | HuntScout Pro`;
const description = `HuntScout Pro is $${PRICE.amount} once for ${PRICE.accessMonths / 12} years of Pro: every agency draw and harvest table for ${LIVE_STATES.length} western states, each figure cited to its report. No subscription, no auto-renewal, 30-day refund.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE}/pricing` },
  openGraph: { title, description, url: `${SITE}/pricing`, siteName: "HuntScout Pro", type: "website" },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
