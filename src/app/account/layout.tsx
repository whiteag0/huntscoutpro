import type { Metadata } from "next";
import { SITE } from "@/lib/emails/onboarding";

export const metadata: Metadata = {
  title: "My Account | HuntScout Pro",
  description: "Your HuntScout Pro membership, hunting profile and deadline reminders.",
  alternates: { canonical: `${SITE}/account` },
  robots: { index: false },
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
