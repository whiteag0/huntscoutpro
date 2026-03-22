"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Lock, Eye, ArrowRight } from "lucide-react";

interface DemoGateProps {
  children: React.ReactNode;
  /** Content shown to everyone (the "teaser" above the gate) */
  preview?: React.ReactNode;
  /** Feature name shown in the upgrade prompt */
  feature?: string;
}

/**
 * DemoGate — shows a preview of the content with a fade-to-blur paywall.
 * - Not signed in: shows preview + sign-in CTA
 * - Signed in but not pro: shows preview + upgrade CTA
 * - Pro user: shows full content
 */
export function DemoGate({ children, preview, feature = "this data" }: DemoGateProps) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
      </div>
    );
  }

  const isPro = (session?.user as Record<string, unknown>)?.isPro;

  // Pro users see everything
  if (session && isPro) {
    return <>{children}</>;
  }

  // Non-pro: show preview + gated content
  return (
    <div>
      {/* Always-visible preview section */}
      {preview && <div className="mb-0">{preview}</div>}

      {/* Gated full content with gradient fade + CTA */}
      <div className="relative">
        {/* Show blurred/faded content behind the gate */}
        <div className="pointer-events-none select-none" style={{ maxHeight: "400px", overflow: "hidden" }}>
          <div style={{
            filter: "blur(6px)",
            opacity: 0.4,
          }}>
            {children}
          </div>
        </div>

        {/* Gradient fade overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(to bottom, transparent 0%, hsl(var(--background)) 70%)",
          }}
        />

        {/* CTA overlay */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-8">
          <div className="relative z-10 text-center px-8 py-8 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-4">
              <Eye className="w-3.5 h-3.5" />
              Demo Preview
            </div>

            {!session ? (
              <>
                <h3 className="text-xl font-bold mb-2 text-foreground">
                  Sign in to unlock {feature}
                </h3>
                <p className="text-sm text-muted-foreground mb-5">
                  Create a free account to see sample data, or upgrade to Pro for full access to all 50 states.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-3 justify-center">
                  <Link
                    href="/signin"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
                  >
                    Sign In Free
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground border border-border hover:border-amber-500/30 transition-all"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    View Pro Plans
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold mb-2 text-foreground">
                  Unlock full access to {feature}
                </h3>
                <p className="text-sm text-muted-foreground mb-5">
                  You&apos;re seeing a preview. Upgrade to Pro for complete draw odds, harvest data, and point analysis across all 50 states.
                </p>
                <Link
                  href="/pricing"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
                >
                  <Lock className="w-4 h-4" />
                  Unlock Pro — $14.99
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
