import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // Agency species tables are read from disk at request time (src/lib/agency.ts).
  outputFileTracingIncludes: {
    "/api/agency/[state]/[species]": ["./.agency-gz/**/*"],
    "/api/shortlist": ["./.agency-gz/**/*"],
    "/shortlist": ["./.agency-gz/**/*"],
    // The planner builds each entry's agency block from the server's own tables.
    "/api/planner/entries": ["./.agency-gz/**/*"],
    "/api/planner/refresh": ["./.agency-gz/**/*"],
    "/api/planner/hunts": ["./.agency-gz/**/*"],
    // The personal scouting report reads the tables and embeds its fonts from disk.
    "/api/preferences": ["./.agency-gz/**/*", "./src/assets/report-fonts/**/*"],
    "/api/admin/report": ["./.agency-gz/**/*", "./src/assets/report-fonts/**/*"],
    // Reply drafts quote draw results for units a customer mentions.
    "/api/inbound/email": ["./.agency-gz/**/*"],
    "/admin/replies/[id]": ["./.agency-gz/**/*"],
    // Sending from the confirm page drafts any follow-up that arrived meanwhile.
    "/admin/replies/[id]/approve": ["./.agency-gz/**/*"],
  },
  async redirects() {
    // The old /unit page showed generated data; unit pages now live under each state.
    return [{ source: "/unit", destination: "/states", permanent: false }];
  },
};

export default nextConfig;
