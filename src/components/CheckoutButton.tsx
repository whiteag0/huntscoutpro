"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { CHECKOUT_SIGN_IN_HREF, isCheckoutPath, withoutCheckoutParam } from "@/lib/checkout-path";

// One checkout at a time per page, however many buttons (or the auto-start) ask.
let inFlight = false;

/**
 * Starts Stripe Checkout for the signed-in visitor. Signed-out visitors go to
 * sign-in first and come back to /pricing?checkout=1, which carries on to checkout.
 */
function useCheckout(source: string) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    if (status === "loading" || inFlight) return;
    track("checkout_start", { signed_in: !!session, from: source });
    if (!session) {
      router.push(CHECKOUT_SIGN_IN_HREF);
      return;
    }
    inFlight = true;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (data.alreadyPro) { window.location.href = "/account"; return; }
      if (data.error) { setError(data.error); return; }
      if (data.url) { window.location.href = data.url; }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      inFlight = false;
      setLoading(false);
    }
  };

  return { start, loading, error, ready: status !== "loading" };
}

interface CheckoutButtonProps {
  className?: string;
  children?: React.ReactNode;
  /** Where the button is, for analytics. */
  source?: string;
}

export function CheckoutButton({ className, children = "Upgrade to Pro", source = "button" }: CheckoutButtonProps) {
  const { data: session } = useSession();
  const { start, loading, error, ready } = useCheckout(source);

  // Members never get sent to checkout again.
  if (session?.user?.isPro) {
    return (
      <Link href="/account" className={className}>
        You&apos;re a Pro member — view account
      </Link>
    );
  }

  return (
    <>
      <button type="button" onClick={start} disabled={loading || !ready} className={className}>
        {loading ? "Redirecting…" : children}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger text-center">
          {error}
        </p>
      )}
    </>
  );
}

/**
 * On /pricing?checkout=1 (where sign-in returns a buyer), starts checkout once the
 * session is known. The flag is dropped from the URL first, so a reload, Back from
 * Stripe or a failed attempt never starts it again.
 */
export function AutoCheckout() {
  const { data: session, status } = useSession();
  const { start, loading, error } = useCheckout("signin_return");
  const started = useRef(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (started.current || status !== "authenticated" || session?.user?.isPro) return;
    if (!isCheckoutPath(window.location.href)) return;
    started.current = true;
    window.history.replaceState(window.history.state, "", withoutCheckoutParam(window.location.href));
    void start();
  });

  // This hook instance only ever runs the auto-start, so its state is that attempt's.
  if ((!loading && !error) || dismissed) return null;
  return (
    <div role={error ? "alert" : "status"} className="fixed inset-x-0 top-20 z-40 flex justify-center px-4 pointer-events-none">
      <div className={`pointer-events-auto max-w-md rounded-xl border px-4 py-3 text-sm text-center bg-card shadow-lg ${error ? "border-danger/40 text-danger" : "border-border text-foreground"}`}>
        {error ? (
          <>
            We couldn&apos;t open checkout. {error}{" "}
            <button type="button" onClick={() => setDismissed(true)} className="ml-1 font-semibold underline cursor-pointer">
              Dismiss
            </button>
          </>
        ) : (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> Opening secure checkout…
          </span>
        )}
      </div>
    </div>
  );
}
