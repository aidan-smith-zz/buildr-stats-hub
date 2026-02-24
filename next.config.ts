import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
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
