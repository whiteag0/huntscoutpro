import type { Metadata } from "next";
import { SITE } from "@/lib/emails/onboarding";

export const metadata: Metadata = {
  title: "Sign In | HuntScout Pro",
  description: "Sign in to HuntScout Pro with your Google account.",
  alternates: { canonical: `${SITE}/signin` },
  robots: { index: false },
};

export default function SignInLayout({ children }: { children: React.ReactNode }) {
  return children;
}
