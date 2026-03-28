import type { NextConfig } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://statsbuildr.com";
const canonicalOrigin = new URL(siteUrl).origin;
const canonicalHost = new URL(siteUrl).hostname;
const wwwHost = canonicalHost.startsWith("www.") ? canonicalHost : `www.${canonicalHost}`;

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Canonical: redirect www and alternate protocols to NEXT_PUBLIC_SITE_URL (e.g. https://statsbuildr.com)
      {
        source: "/:path*",
        has: [{ type: "host", value: wwwHost }],
        destination: `${canonicalOrigin}/:path*`,
        permanent: true,
      },
      {
        source: "/:date(\\d{4}-\\d{2}-\\d{2})/ai/insights",
        destination: "/fixtures/:date/ai-insights",
        permanent: true,
      },
      {
        source: "/:date(\\d{4}-\\d{2}-\\d{2})/form",
        destination: "/fixtures/:date/form",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
