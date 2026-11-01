import type { MetadataRoute } from "next";
import { SITE } from "@/lib/emails/onboarding";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/account", "/welcome", "/success"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
