"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (sessionId) { setStatus("success"); } else { setStatus("error"); }
  }, [sessionId]);

  if (status === "loading") {
    return (<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" /></div>);
  }
  if (status === "error") {
    return (<div className="min-h-screen flex items-center justify-center px-4"><div className="text-center max-w-md"><h1 className="text-2xl font-bold mb-4">Something went wrong</h1><p className="text-muted-foreground mb-6">We couldn&apos;t verify your payment. If you believe this is an error, please contact support.</p><Link href="/pricing" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold gradient-gold text-gold-foreground">Back to Pricing</Link></div></div>);
  }
  return (<div className="min-h-screen flex items-center justify-center px-4"><div className="text-center max-w-lg"><div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-6"><Check className="w-8 h-8 text-green-500" /></div><h1 className="text-3xl font-bold mb-3">Welcome to HuntScout Pro!</h1><p className="text-muted-foreground mb-8 text-lg">Your membership is now active. You have full access to draw odds, harvest data, point analysis, hunt planner, and everything else across all 50 states.</p><div className="flex flex-col sm:flex-row gap-3 justify-center"><Link href="/states" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold gradient-gold text-gold-foreground hover:brightness-110 transition-all">Explore States <ArrowRight className="w-4 h-4" /></Link><Link href="/planner" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold border border-border hover:bg-muted transition-all">Open Hunt Planner</Link></div></div></div>);
}

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" /></div>}>
      <SuccessContent />
    </Suspense>
  );
}
