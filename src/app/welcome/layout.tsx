import type { Metadata } from "next";
import { SITE } from "@/lib/emails/onboarding";

export const metadata: Metadata = {
  title: "Your Hunting Profile | HuntScout Pro",
  description: "Tell HuntScout Pro which states, species and hunts you're planning for.",
  alternates: { canonical: `${SITE}/welcome` },
  robots: { index: false },
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
