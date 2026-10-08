"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

// Pages a Pro member can always reach before finishing /welcome.
const EXEMPT_PREFIXES = ["/welcome", "/account", "/success", "/signin", "/terms", "/privacy", "/api"];

function isExempt(pathname: string | null): boolean {
  if (!pathname) return true;
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// Set by /welcome once the server has saved (or recorded a skip). Guards against
// a bounce back to /welcome if the session cookie refresh (useSession().update)
// failed or lagged: the server already knows they're done, so never re-gate them
// in this tab. Module scope survives client-side navigation; sessionStorage
// covers a reload in the same tab.
const LOCAL_KEY = "hs_onboarded_for";
let locallyOnboardedFor: string | null = null;

export function markOnboardedLocally(email: string | null | undefined) {
  if (!email) return;
  locallyOnboardedFor = email;
  try {
    window.sessionStorage.setItem(LOCAL_KEY, email);
  } catch {}
}

function isLocallyOnboarded(email: string | null | undefined): boolean {
  if (!email) return false;
  if (locallyOnboardedFor === email) return true;
  try {
    return window.sessionStorage.getItem(LOCAL_KEY) === email;
  } catch {
    return false;
  }
}

/**
 * Sends a Pro member who hasn't answered (or skipped) the hunting-preferences
 * form to /welcome on their first visit to any other page. Renders nothing
 * except a blank cover while that redirect is in flight, so the page they
 * landed on doesn't stay visible before /welcome appears.
 */
export function OnboardingGate() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const user = session?.user;
  // Only evaluated once authenticated (never during SSR / first hydration
  // render, where status is "loading"), so reading sessionStorage is safe.
  const shouldRedirect =
    status === "authenticated" &&
    !!user?.isPro &&
    !user.onboarded &&
    !user.isSuperAdmin &&
    !isExempt(pathname) &&
    !isLocallyOnboarded(user.email);

  useEffect(() => {
    if (shouldRedirect) router.replace("/welcome");
  }, [shouldRedirect, router]);

  if (!shouldRedirect) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" aria-hidden="true" />
      <span className="sr-only">Opening your member setup…</span>
    </div>
  );
}
