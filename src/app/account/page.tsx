"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { ArrowRight, Check, LogOut, Mail, RefreshCw, User } from "lucide-react";

function formatDate(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default function AccountPage() {
  const { data: session, status, update } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const rechecked = useRef(false);

  // Re-check membership once when the account page opens. update() flips
  // status to "loading" and back, so guard against re-running.
  useEffect(() => {
    if (status === "authenticated" && !rechecked.current) {
      rechecked.current = true;
      update({ refresh: "entitlement" });
    }
  }, [status, update]);

  if (status === "loading" && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4">Sign in to view your account</h1>
          <button
            onClick={() => signIn("google", { callbackUrl: "/account" })}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold gradient-gold text-gold-foreground cursor-pointer"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  const { name, email, isPro, isSuperAdmin, proExpiresAt } = session.user;
  const until = formatDate(proExpiresAt);

  async function recheck() {
    setRefreshing(true);
    try {
      await update({ refresh: "entitlement" });
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="min-h-screen pt-24 pb-16 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-bold">My Account</h1>

        <section className="bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <User className="w-5 h-5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{name || "HuntScout member"}</p>
              <p className="text-sm text-muted-foreground truncate">{email}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            You sign in with Google. Your membership is linked to this email address.
          </p>
        </section>

        <section className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-3">Membership</h2>
          {isPro ? (
            <>
              <p className="flex items-center gap-2 text-foreground font-medium">
                <Check className="w-5 h-5 text-green-500" />
                {isSuperAdmin ? "Admin — full access" : "HuntScout Pro — active"}
              </p>
              {!isSuperAdmin && (
                <p className="text-sm text-muted-foreground mt-2">
                  {until ? `Access through ${until}. ` : ""}
                  One-time payment: nothing renews and you won&apos;t be charged again.
                </p>
              )}
              <div className="flex flex-col sm:flex-row gap-3 mt-5">
                <Link
                  href="/states"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
                >
                  Start researching <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/planner"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-all"
                >
                  Open Hunt Planner
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="text-foreground font-medium">Free account</p>
              <p className="text-sm text-muted-foreground mt-2">
                Already paid? Make sure you&apos;re signed in with the same Google account
                you used at checkout, then re-check below. If it still doesn&apos;t show,
                email us and we&apos;ll unlock it right away.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 mt-5">
                <button
                  onClick={recheck}
                  disabled={refreshing}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold border border-border hover:bg-muted transition-all cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
                  Re-check membership
                </button>
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all"
                >
                  Get Pro — $14.99
                </Link>
              </div>
            </>
          )}
        </section>

        <section className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-lg font-bold mb-3">Help, receipts &amp; refunds</h2>
          <p className="text-sm text-muted-foreground">
            Questions, a copy of your receipt, or a refund within 30 days of purchase: email{" "}
            <a href="mailto:support@huntscoutpro.com" className="text-gold hover:underline">
              support@huntscoutpro.com
            </a>
            . A real person reads every message.
          </p>
          <a
            href="mailto:support@huntscoutpro.com"
            className="inline-flex items-center gap-2 mt-4 text-sm font-medium text-gold hover:underline"
          >
            <Mail className="w-4 h-4" /> Contact support
          </a>
        </section>

        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}
