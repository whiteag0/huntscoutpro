import type { Metadata } from "next";
import { SITE } from "@/lib/emails/onboarding";

// The about page is a client component, so its metadata lives here.
const title = "About HuntScout Pro: Where the Data Comes From";
const description =
  "HuntScout Pro collects state wildlife agency draw results, harvest reports and application dates for the western draw states, and cites every number to the agency report it came from.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE}/about` },
  openGraph: { title, description, url: `${SITE}/about`, siteName: "HuntScout Pro", type: "website" },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
