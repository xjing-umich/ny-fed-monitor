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
        // Root → default locale. Previously handled by app/page.tsx (removed so
        // the [lang] segment can own <html lang>). English-first SEO, so the
        // default locale is /en. Temporary (307): "/" stays the canonical entry
        // point while we route to the en default.
        source: "/",
        destination: "/en",
        permanent: false,
      },
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
