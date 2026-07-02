import type { NextConfig } from "next";
import path from "path";

// All legacy bare section slugs that must 301 → /[lang]/macro/[slug]
const LEGACY_SECTION_SLUGS = [
  "repo-financing",
  "reference-rates",
  "facility-usage",
  "fails",
  "auction-risk",
  "soma",
  "dealer-inventory",
  "transactions",
  "market-share",
  "policy-expectations",
  "data-freshness",
] as const;

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async redirects() {
    const sectionRedirects = LEGACY_SECTION_SLUGS.map((slug) => ({
      source: `/:lang(zh|en)/${slug}`,
      destination: `/:lang/macro/${slug}`,
      permanent: true,
    }));

    return [
      {
        source: "/:lang(zh|en)/managers",
        destination: "/:lang/investors",
        permanent: true,
      },
      ...sectionRedirects,
    ];
  },
};

export default nextConfig;
