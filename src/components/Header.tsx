"use client";

import Link from "next/link";
import { useState } from "react";
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
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Crosshair className="h-5 w-5 text-amber-500" />
          <span>HuntScout Pro</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Auth buttons (desktop) */}
        <div className="hidden md:flex items-center gap-2">
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
                className="px-3 py-1.5 text-sm font-semibold rounded-lg gradient-gold text-gold-foreground"
              >
                Get Pro
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          className="md:hidden p-2 cursor-pointer"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 pb-4">
          <nav className="flex flex-col gap-1 pt-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors"
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
                  className="px-3 py-2 text-sm font-semibold rounded-lg gradient-gold text-gold-foreground text-center"
                >
                  Get Pro
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
