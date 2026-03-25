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
  LogOut,
  User,
} from "lucide-react";

const navLinks = [
  { href: "/states", label: "States", icon: Map },
  { href: "/turkey", label: "Turkey", icon: Bird },
  { href: "/compare", label: "Compare", icon: GitCompareArrows },
  { href: "/trends", label: "Trends", icon: TrendingUp },
  { href: "/planner", label: "Planner", icon: ClipboardList },
  { href: "/calendar", label: "Calendar", icon: Calendar },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const isLanding = pathname === "/";

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
        <Link href="/" className="flex items-center gap-2 text-lg">
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
            {navLinks.slice(0, 3).map((link) => (
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
            {navLinks.slice(3).map((link) => (
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
          {status === "loading" ? (
            <div className="h-8 w-20 rounded-lg bg-muted animate-pulse" />
          ) : session ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <User className="h-4 w-4" />
                {session.user?.name?.split(" ")[0]}
              </span>
              <button
                onClick={() => signOut()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
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
                Subscribe — 50% Off
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          className="lg:hidden p-2 cursor-pointer"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
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
        ref={mobileMenuRef}
        className="lg:hidden overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
        style={{
          maxHeight: mobileOpen ? "500px" : "0px",
          opacity: mobileOpen ? 1 : 0,
        }}
      >
        <div className="border-t border-border bg-background px-4 pb-4">
          <nav className="flex flex-col gap-1 pt-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg transition-colors ${
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
            {session ? (
              <>
                <span className="text-sm text-muted-foreground px-3 flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  {session.user?.name || session.user?.email}
                </span>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
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
                  className="px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors text-center"
                >
                  Sign In
                </Link>
                <Link
                  href="/pricing"
                  onClick={() => setMobileOpen(false)}
                  className="px-3 py-2 text-sm font-bold rounded-lg gradient-gold text-gold-foreground text-center"
                >
                  Subscribe — 50% Off
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
