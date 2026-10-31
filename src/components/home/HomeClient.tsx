"use client";

import { useSession } from "next-auth/react";
import { MarketingHome } from "@/components/home/MarketingHome";
import { MemberHome } from "@/components/home/MemberHome";
import type { HomeData } from "@/components/home/types";

/** Pro members get their member home; everyone else gets the marketing page. */
export function HomeClient({ data }: { data: HomeData }) {
  const { data: session, status } = useSession();

  // Until we know who's here (first load only; a refetch via update() keeps
  // `session` populated), the marketing page is rendered but invisible.
  // That keeps it in the server HTML for crawlers and the hero image preload
  // for visitors, while a Pro member never sees it flash. The wrapper stays
  // the same element when the session resolves, so nothing remounts.
  const pending = status === "loading" && !session;

  if (session?.user?.isPro) {
    return (
      <MemberHome
        firstName={session.user.name?.trim().split(/\s+/)[0] || null}
        isSuperAdmin={Boolean(session.user.isSuperAdmin)}
        proExpiresAt={session.user.proExpiresAt ?? null}
      />
    );
  }

  return (
    <div className={pending ? "invisible" : undefined} aria-busy={pending || undefined}>
      <MarketingHome data={data} />
    </div>
  );
}
