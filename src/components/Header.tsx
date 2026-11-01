"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Crosshair,
  Menu,
  X,
  Map,
  Bird,
  GitCompareArrows,
  TrendingUp,
  ClipboardList,
  Calendar,
  ListChecks,
  LogOut,
  User,
} from "lucide-react";

const navLinks = [
  { href: "/states", label: "States", icon: Map },
  { href: "/shortlist", label: "Shortlist", icon: ListChecks },
  { href: "/turkey", label: "Turkey", icon: Bird },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/trends", label: "Trends", icon: TrendingUp },
  { href: "/planner", label: "Planner", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: Calendar },
];
// Desktop nav shows the first PRIMARY_LINKS as one group, the rest after a divider.
const PRIMARY_LINKS = 4;

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isPro = Boolean(session?.user?.isPro);
  // Pro members get a member home at "/" (no full-bleed hero), so keep the
  // header solid there for them.
  const isLanding = pathname === "/" && !isPro;

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change (adjusting state during render rather
  // than in an effect avoids an extra render pass).
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMobileOpen(false);
  }

  // Escape closes the phone menu.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const showSolid = !isLanding || scrolled || mobileOpen;

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        showSolid
          ? "bg-background/95 backdrop-blur-md border-b border-border shadow-sm"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex h-11 items-center gap-2 text-lg">
          <Crosshair className="h-5 w-5 text-amber-500" />
          <span className="font-bold tracking-tight">HuntScout</span>
          <span className="text-xs font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md gradient-gold text-gold-foreground leading-none">
            Pro
          </span>
        </Link>

        {/* Desktop nav — text only, no icons */}
        <nav className="hidden lg:flex items-center">
          {/* Primary nav group */}
          <div className="flex items-center gap-0.5">
            {navLinks.slice(0, PRIMARY_LINKS).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  pathname.startsWith(link.href)
                    ? "text-foreground font-medium bg-muted"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Subtle divider */}
          <div className="w-px h-5 bg-border mx-2" />

          {/* Secondary nav group */}
          <div className="flex items-center gap-0.5">
            {navLinks.slice(PRIMARY_LINKS).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                  pathname.startsWith(link.href)
                    ? "text-foreground font-medium bg-muted"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>

        {/* Auth buttons (desktop) */}
        <div className="hidden lg:flex items-center gap-2">
          {status === "loading" && !session ? (
            <div className="h-8 w-20 rounded-lg bg-muted animate-pulse" />
          ) : session ? (
            <div className="flex items-center gap-2">
              <Link
                href="/account"
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <User className="h-4 w-4" />
                {/* Name hidden visually below xl so the 7-link nav fits at 1024px; still read by screen readers. */}
                <span className="sr-only xl:not-sr-only" data-clarity-mask="true">{session.user?.name?.split(" ")[0] || "Account"}</span>
                {isPro && (
                  <span
                    className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 leading-none"
                    title="Pro member"
                  >
                    Pro<span className="sr-only"> member</span>
                  </span>
                )}
              </Link>
              {!isPro && (
                <Link
                  href="/pricing"
                  className="px-3 py-1.5 text-xs font-bold rounded-lg gradient-gold text-gold-foreground shadow-sm hover:shadow-md transition-shadow"
                >
                  Upgrade
                </Link>
              )}
              <button
                onClick={() => signOut()}
                className="flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </button>
            </div>
          ) : (
            <>
              <Link
                href="/signin"
                className="px-3 py-1.5 text-sm rounded-lg hover:bg-muted transition-colors"
              >
                Sign In
              </Link>
              <Link
                href="/pricing"
                className="relative px-4 py-2 text-sm font-bold rounded-lg gradient-gold text-gold-foreground shadow-sm hover:shadow-md transition-shadow"
              >
                Get Pro — $14.99
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          className="lg:hidden -mr-2 inline-flex h-11 w-11 items-center justify-center rounded-lg cursor-pointer"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
          aria-controls="mobile-menu"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Mobile menu — max-height transition for smooth animation */}
      <div
        id="mobile-menu"
        ref={mobileMenuRef}
        // Closed: out of the tab order and the accessibility tree.
        inert={!mobileOpen}
        className={`lg:hidden overscroll-contain transition-[max-height,opacity] duration-300 ease-in-out motion-reduce:transition-none ${
          mobileOpen ? "overflow-y-auto" : "overflow-hidden"
        }`}
        style={{
          maxHeight: mobileOpen ? "calc(100dvh - 4rem)" : "0px",
          opacity: mobileOpen ? 1 : 0,
        }}
      >
        <div className="border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <nav className="flex flex-col gap-1 pt-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex min-h-11 items-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors ${
                  pathname.startsWith(link.href)
                    ? "text-foreground font-medium bg-muted"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="mt-3 pt-3 border-t border-border flex flex-col gap-2">
            {status === "loading" && !session ? (
              // Don't show sign-up CTAs to a member while the session loads.
              <div className="h-9 rounded-lg bg-muted animate-pulse" aria-hidden="true" />
            ) : session ? (
              <>
                <Link
                  href="/account"
                  onClick={() => setMobileOpen(false)}
                  className="text-sm text-muted-foreground min-h-11 px-3 py-2 rounded-lg hover:bg-muted flex items-center gap-1.5"
                >
                  <User className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 truncate" data-clarity-mask="true">{session.user?.name || session.user?.email}</span>
                  {isPro && (
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 leading-none">
                      Pro member
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs">My account</span>
                </Link>
                {!isPro && (
                  <Link
                    href="/pricing"
                    onClick={() => setMobileOpen(false)}
                    className="flex min-h-11 items-center justify-center px-3 py-2 text-sm font-bold rounded-lg gradient-gold text-gold-foreground text-center"
                  >
                    Upgrade to Pro
                  </Link>
                )}
                <button
                  onClick={() => signOut()}
                  className="flex min-h-11 items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/signin"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-11 items-center justify-center px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors text-center"
                >
                  Sign In
                </Link>
                <Link
                  href="/pricing"
                  onClick={() => setMobileOpen(false)}
                  className="flex min-h-11 items-center justify-center px-3 py-2 text-sm font-bold rounded-lg gradient-gold text-gold-foreground text-center"
                >
                  Get Pro — $14.99
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
