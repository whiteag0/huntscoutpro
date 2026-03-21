"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Lock } from "lucide-react";

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
      </div>
    );
  }

  const isPro = (session?.user as Record<string, unknown>)?.isPro;

  if (!session) {
    return (
      <div className="relative">
        <div className="pointer-events-none select-none blur-sm opacity-50">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-2xl">
          <div className="text-center px-6 py-8">
            <Lock className="w-8 h-8 mx-auto mb-3 text-amber-500" />
            <h3 className="text-lg font-bold mb-2">Sign In Required</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Sign in and subscribe to HuntScout Pro to access this data.
            </p>
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isPro) {
    return (
      <div className="relative">
        <div className="pointer-events-none select-none blur-sm opacity-50">
          {children}
        </div>
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-sm rounded-2xl">
          <div className="text-center px-6 py-8">
            <Lock className="w-8 h-8 mx-auto mb-3 text-amber-500" />
            <h3 className="text-lg font-bold mb-2">Pro Members Only</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-xs">
              Unlock full access to draw odds, harvest data, point analysis &amp;
              more for all 50 states.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
            >
              Unlock Pro \u2014 $14.99
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
