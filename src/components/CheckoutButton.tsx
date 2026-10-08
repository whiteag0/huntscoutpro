"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface CheckoutButtonProps {
  className?: string;
  children?: React.ReactNode;
}

export function CheckoutButton({ className, children = "Upgrade to Pro" }: CheckoutButtonProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Members never get sent to checkout again.
  if (session?.user?.isPro) {
    return (
      <Link href="/account" className={className}>
        You&apos;re a Pro member — view account
      </Link>
    );
  }

  const handleCheckout = async () => {
    if (status === "loading") return;
    if (!session) { router.push("/signin?callbackUrl=/pricing"); return; }
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
      setLoading(false);
    }
  };

  return (
    <>
      <button onClick={handleCheckout} disabled={loading || status === "loading"} className={className}>
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
