import type { NextConfig } from "next";
import path from "path";
import { INVESTOR_ALIASES } from "./src/lib/investor-seo-aliases";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  async redirects() {
    const investorAliasRedirects = Object.entries(INVESTOR_ALIASES).map(
      ([alias, slug]) => ({
        source: `/:lang(zh|en)/investors/${alias}`,
        destination: `/:lang/investors/${slug}`,
        permanent: true,
      })
    );

    return [
      ...investorAliasRedirects,
      {
        source: "/:lang(zh|en)/managers",
        destination: "/:lang/investors",
        permanent: true,
      },
      {
        source: "/:lang(zh|en)/research/:ticker",
        destination: "/:lang/stocks/:ticker",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
