"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
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
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "glass bg-primary/95 shadow-lg shadow-black/10"
          : "bg-primary"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <Crosshair className="w-7 h-7 text-gold transition-transform duration-300 group-hover:rotate-90" />
            <span className="text-xl font-bold tracking-tight text-white">
              HuntScout
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gold text-gold-foreground leading-none">
              Pro
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-2 rounded-md text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="hidden lg:flex items-center gap-4">
            <Link
              href="/sign-in"
              className="text-sm font-medium text-white/80 hover:text-white transition-colors duration-200"
            >
              Sign In
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-semibold gradient-gold text-gold-foreground shadow-md hover:shadow-lg hover:brightness-110 transition-all duration-200"
            >
              Subscribe — 50% Off
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-md text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      <div
        className={`lg:hidden transition-all duration-300 ease-in-out overflow-hidden ${
          mobileOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="px-4 pb-4 pt-2 space-y-1 border-t border-white/10">
          {navLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-all duration-200"
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </Link>
            );
          })}
          <div className="border-t border-white/10 pt-3 mt-3 space-y-2">
            <Link
              href="/sign-in"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-md text-sm font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/pricing"
              onClick={() => setMobileOpen(false)}
              className="block text-center px-4 py-2.5 rounded-lg text-sm font-semibold gradient-gold text-gold-foreground"
            >
              Subscribe — 50% Off
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
