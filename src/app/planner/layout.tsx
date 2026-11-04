import type { Metadata } from "next";
import { SITE } from "@/lib/emails/onboarding";

// The planner home is a client component, so its metadata lives here. /planner/new and
// /planner/hunt/[id] set their own (noindex) metadata and drop this canonical.
const title = "Hunt Planner: Applications, Deadlines & Budget | HuntScout Pro";
const description =
  "Plan each season's draw applications in one place: agency application dates, season dates, fees and last draw results for the hunts you pick, plus a checklist and budget.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: `${SITE}/planner` },
  openGraph: { title, description, url: `${SITE}/planner`, siteName: "HuntScout Pro", type: "website" },
};

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
