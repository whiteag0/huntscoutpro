"use client";

import { adsConfigured, needsConsent, setStoredConsent } from "@/lib/analytics";
import { useConsentChoice, useCountry, useGpc, useMounted } from "@/components/analytics/stores";

/** Lets any visitor change their cookie choice for this browser (privacy page). */
export function ConsentSettings() {
  const mounted = useMounted();
  const choice = useConsentChoice();
  const country = useCountry();
  const gpc = useGpc();
  if (!mounted) return null;

  const region = needsConsent(country);
  const effective = choice ?? (region ? "denied" : "granted");
  const ads = adsConfigured();
  const current =
    effective === "granted"
      ? `Allowed${choice ? "" : " (the default where you are)"}.`
      : `Declined${choice ? "" : " until you choose"}.`;

  return (
    <div className="not-prose mt-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-foreground" role="status" aria-live="polite">
        <span className="font-semibold">Analytics cookies{ads ? " and ad tags" : ""} in this browser:</span> {current}
      </p>
      {gpc && ads && (
        <p className="mt-1 text-xs text-muted-foreground">
          Your browser sends Global Privacy Control, so advertising tags stay off whatever you choose here.
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStoredConsent("granted")}
          aria-pressed={effective === "granted"}
          className="min-h-11 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted cursor-pointer aria-pressed:border-gold aria-pressed:bg-gold/15"
        >
          Allow
        </button>
        <button
          type="button"
          onClick={() => setStoredConsent("denied")}
          aria-pressed={effective === "denied"}
          className="min-h-11 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted cursor-pointer aria-pressed:border-gold aria-pressed:bg-gold/15"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
