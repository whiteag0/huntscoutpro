"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface CheckoutButtonProps {
  className?: string;
  children: React.ReactNode;
}

export function CheckoutButton({ className, children }: CheckoutButtonProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    if (!session) { router.push("/signin"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", { method: "POST" });
      const data = await res.json();
      if (data.error) { alert(data.error); return; }
      if (data.url) { window.location.href = data.url; }
    } catch { alert("Something went wrong. Please try again."); } finally { setLoading(false); }
  };

  return (
    <button onClick={handleCheckout} disabled={loading} className={className}>
      {loading ? "Redirecting\u2026" : children}
    </button>
  );
}
