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
  },
  async redirects() {
    // The old /unit page showed generated data; unit pages now live under each state.
    return [{ source: "/unit", destination: "/states", permanent: false }];
  },
};

export default nextConfig;
