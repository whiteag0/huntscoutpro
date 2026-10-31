import type { Metadata } from "next";
import { ComingSoonState } from "@/components/ComingSoonState";
import { stateBySlug } from "@/data/state-list";
import { isLiveState } from "@/lib/agency-format";

export const metadata: Metadata = {
  title: "Request a State | HuntScout Pro",
  description: "Ask HuntScout Pro to add official draw and harvest data for your state.",
};

export default async function RequestStatePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state } = await searchParams;
  const st = state ? stateBySlug(state) : undefined;
  return <ComingSoonState state={st && !isLiveState(st.slug) ? st : undefined} />;
}
