"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eye } from "lucide-react";
import { CheckoutButton } from "@/components/CheckoutButton";
import { PRICE } from "@/lib/promo";
import { signInHref } from "@/lib/checkout-path";

interface DemoGateProps {
  children: React.ReactNode;
  /** Content shown to everyone (the "teaser" above the gate) */
  preview?: React.ReactNode;
  /**
   * Shown blurred under the preview instead of `children`, as a short strip. Use it when the
   * preview already holds the legible rows and the children would only repeat them.
   */
  tail?: React.ReactNode;
  /** Feature name shown in the upgrade prompt */
  feature?: string;
  /** What this gate hides and what Pro adds, in a sentence or two. */
  description?: React.ReactNode;
}

const DEFAULT_DESCRIPTION = "Pro unlocks the full agency draw and harvest tables, with every figure cited to its source.";

/**
 * DemoGate — shows a preview of the content with a fade-to-blur paywall.
 * - Not signed in: shows preview + Pro checkout (sign-in first) and a sign-in link for members
 * - Signed in but not pro: shows preview + Pro checkout
 * - Pro user: shows full content
 */
export function DemoGate({ children, preview, tail, feature = "this data", description = DEFAULT_DESCRIPTION }: DemoGateProps) {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  // Only block on the very first load. A refetch via update() also reports
  // "loading" but keeps the session, and must not unmount a member's content.
  if (status === "loading" && !session) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500" />
      </div>
    );
  }

  const isPro = session?.user?.isPro;

  // Pro users see everything
  if (session && isPro) {
    return <>{children}</>;
  }

  // Non-pro: show preview + gated content
  return (
    <div>
      {/* Always-visible preview section */}
      {preview && <div className="mb-0">{preview}</div>}

      {/* Gated content, blurred behind a gradient, with the CTA stacked in the same grid cell so it never overflows a short strip */}
      <div className="relative grid">
        {/* inert + aria-hidden: the blurred copy is decoration, not reachable by Tab or a screen reader. */}
        <div
          className="[grid-area:1/1] pointer-events-none select-none"
          style={{ maxHeight: tail ? "240px" : "400px", overflow: "hidden" }}
          inert
          aria-hidden="true"
        >
          <div style={{ filter: "blur(6px)", opacity: 0.4 }}>{tail ?? children}</div>
        </div>

        {/* Gradient fade overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(to bottom, transparent 0%, hsl(var(--background)) 70%)",
          }}
        />

        {/* CTA */}
        <div className="[grid-area:1/1] self-end relative z-10 flex justify-center pb-8 pt-16">
          <div className="text-center px-4 sm:px-8 pt-8 max-w-md">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs font-medium mb-4">
              <Eye className="w-3.5 h-3.5" aria-hidden />
              {tail ? "Free preview" : "Preview"}
            </div>

            <h3 className="text-xl font-bold mb-2 text-foreground">{session ? `Unlock full access to ${feature}` : `Unlock ${feature}`}</h3>
            <p className="text-sm text-muted-foreground mb-5">{description}</p>
            <CheckoutButton
              source="demo_gate"
              className="inline-flex min-h-11 items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all cursor-pointer disabled:opacity-60"
            >
              {PRICE.ctaText}
            </CheckoutButton>
            <p className="mt-3 text-xs text-muted-foreground">
              2 years of access, no auto-renewal.{" "}
              <Link href="/pricing" className="font-medium text-primary hover:underline">
                What&apos;s included
              </Link>
            </p>
            {!session && (
              <p className="mt-2 text-sm text-muted-foreground">
                Already Pro?{" "}
                {/* The href is refreshed on click so the query string (species, filters) comes back too. */}
                <a
                  href={signInHref(pathname)}
                  onClick={(e) => {
                    e.currentTarget.href = signInHref(window.location.pathname + window.location.search);
                  }}
                  className="inline-flex min-h-10 items-center font-semibold text-primary hover:underline"
                >
                  Sign in
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
