"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";

const STORAGE_KEY = "huntscout-free-preview";

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setDismissed(stored === "true");
  }, []);

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, "true");
    setDismissed(true);
  }

  if (dismissed) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Blurred content preview */}
      <div className="blur-sm pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center bg-foreground/40 backdrop-blur-sm rounded-xl">
        <div className="bg-card rounded-2xl shadow-2xl p-8 sm:p-10 max-w-md mx-4 text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-gold/10 flex items-center justify-center mb-5">
            <Lock className="w-7 h-7 text-gold" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">
            Unlock Full Access
          </h3>
          <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
            Get draw odds, harvest data, and point analysis for every hunt unit
            across all 50 states with a HuntScout Pro subscription.
          </p>
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center w-full px-6 py-3 rounded-lg text-sm font-semibold gradient-gold text-gold-foreground shadow-md hover:shadow-lg hover:brightness-110 transition-all duration-200 mb-3"
          >
            Subscribe — 50% Off
          </Link>
          <button
            onClick={handleDismiss}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Continue with Free Preview
          </button>
        </div>
      </div>
    </div>
  );
}
