"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { isPrivatePath } from "@/lib/analytics";

// Vercel page views and Web Vitals, minus the owner-only /admin pages: their URLs carry signed
// approve/edit tokens (?t=...) for customer replies, and those must not be sent to analytics.
const dropPrivate = <E extends { url: string }>(event: E): E | null => {
  try {
    return isPrivatePath(new URL(event.url, "https://www.huntscoutpro.com").pathname) ? null : event;
  } catch {
    return event;
  }
};

export function VercelMetrics() {
  return (
    <>
      <Analytics beforeSend={dropPrivate} />
      <SpeedInsights beforeSend={dropPrivate} />
    </>
  );
}
