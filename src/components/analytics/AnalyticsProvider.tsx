"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  CLARITY_ID,
  GOOGLE_ADS_ID,
  META_PIXEL_ID,
  adsConfigured,
  describePath,
  identify,
  needsConsent,
  updateAdsConsent,
  setClarityConsent,
  setIsPro,
  setPageType,
  setSignedIn,
  setStateSlug,
  setStoredConsent,
  startAds,
  startClarity,
  type ConsentChoice,
} from "@/lib/analytics";
import { useConsentChoice, useCountry, useGpc } from "@/components/analytics/stores";

/**
 * Loads Microsoft Clarity for everyone, and the Google Ads tag / Meta Pixel
 * only when configured, GPC is off, and consent allows. Visitors in the EEA,
 * UK and Switzerland see a banner and get no ad tags or analytics cookies until
 * they accept. Renders nothing else.
 */
export function AnalyticsProvider() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const country = useCountry();
  const choice = useConsentChoice();
  const gpc = useGpc();

  const known = country !== undefined;
  const region = needsConsent(country);
  // Outside the consent region the default is on; anyone can opt out on the privacy page.
  const analytics: ConsentChoice = choice ?? (region ? "denied" : "granted");
  const ads: ConsentChoice = gpc ? "denied" : analytics;
  const adsOn = known && ads === "granted" && adsConfigured();

  // Clarity starts once we know which consent signal to send it.
  const clarityStarted = useRef(false);
  const lastConsent = useRef("");
  useEffect(() => {
    if (!known) return;
    const signal = { ads, analytics };
    const key = `${ads}/${analytics}`;
    // US visitors with no choice and no GPC: Clarity's defaults, no consent call needed.
    const needsSignal = region || choice !== null || gpc;
    if (!clarityStarted.current) {
      clarityStarted.current = true;
      startClarity(needsSignal ? signal : undefined);
    } else if (key !== lastConsent.current) {
      setClarityConsent(signal);
    }
    lastConsent.current = key;
  }, [known, region, choice, gpc, ads, analytics]);

  const adsStarted = useRef(false);
  const adsRevoked = useRef(false);
  useEffect(() => {
    if (adsOn && !adsStarted.current) {
      adsStarted.current = true;
      startAds();
    } else if (adsStarted.current && known && adsOn === adsRevoked.current) {
      // Choice changed on this page after the tags loaded (privacy page settings).
      adsRevoked.current = !adsOn;
      updateAdsConsent(adsOn);
    }
  }, [adsOn, known]);

  useEffect(() => {
    const { type, state } = describePath(pathname);
    setPageType(type);
    if (state) setStateSlug(state);
  }, [pathname]);

  const email = session?.user?.email ?? null;
  const isPro = !!session?.user?.isPro;
  useEffect(() => {
    if (status === "loading") return;
    setSignedIn(status === "authenticated");
    if (status === "authenticated") setIsPro(isPro);
  }, [status, isPro]);

  // Link the recording to the account by a hash of the email, and only with analytics consent.
  const identified = useRef<string | null>(null);
  useEffect(() => {
    if (!known || analytics !== "granted" || !email || identified.current === email) return;
    identified.current = email;
    void identify(email);
  }, [known, analytics, email]);

  return (
    <>
      {known && CLARITY_ID && (
        <Script id="ms-clarity" src={`https://www.clarity.ms/tag/${CLARITY_ID}`} strategy="afterInteractive" />
      )}
      {adsOn && GOOGLE_ADS_ID && (
        <Script id="google-ads-gtag" src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`} strategy="afterInteractive" />
      )}
      {adsOn && META_PIXEL_ID && (
        <Script id="meta-pixel" src="https://connect.facebook.net/en_US/fbevents.js" strategy="afterInteractive" />
      )}
      {known && region && choice === null && <ConsentBanner withAds={adsConfigured() && !gpc} />}
    </>
  );
}

function ConsentBanner({ withAds }: { withAds: boolean }) {
  return (
    <section
      aria-label="Cookie choices"
      className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg rounded-2xl border border-border bg-card p-4 shadow-lg sm:p-5"
    >
      <h2 className="text-sm font-bold text-foreground">Cookies on HuntScout Pro</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        With your OK, we use Microsoft Clarity cookies to see how pages are used (form fields are hidden)
        {withAds ? ", and Google and Meta advertising tags to measure our ads" : ""}. Vercel&apos;s cookie-free
        page-view counts run either way.{" "}
        <Link href="/privacy#analytics" className="font-medium text-foreground underline underline-offset-2">
          Privacy policy
        </Link>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setStoredConsent("denied")}
          className="min-h-11 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-muted cursor-pointer"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={() => setStoredConsent("granted")}
          className="min-h-11 rounded-xl gradient-gold px-4 text-sm font-semibold text-gold-foreground hover:brightness-110 cursor-pointer"
        >
          Accept
        </button>
      </div>
    </section>
  );
}
