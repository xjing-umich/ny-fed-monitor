import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";

export const SITE_URL = "https://thecompounder.fyi";
export const SITE_NAME = "Compounder";

// OpenGraph locale tags per UI language.
export const OG_LOCALE: Record<Lang, string> = { zh: "zh_CN", en: "en_US" };

/**
 * Build OpenGraph + Twitter metadata for a page.
 * `path` is the locale-prefixed path, e.g. "/zh/stocks/AAPL".
 * Omitting an image lets Next fall back to the route's / global opengraph-image.
 */
export function ogFor(opts: {
  lang: Lang;
  title: string;
  description: string;
  path: string;
  type?: "website" | "article" | "profile";
}): Pick<Metadata, "openGraph" | "twitter"> {
  const { lang, title, description, path, type = "website" } = opts;
  return {
    openGraph: {
      type,
      url: `${SITE_URL}${path}`,
      siteName: SITE_NAME,
      title,
      description,
      locale: OG_LOCALE[lang],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/** Dataset JSON-LD for a stock's holders table — GEO-friendly factual structure. */
export function datasetLd(opts: {
  lang: Lang;
  name: string;
  description: string;
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: opts.name,
    description: opts.description,
    url: opts.url,
    inLanguage: opts.lang === "zh" ? "zh-CN" : "en",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    isBasedOn: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany",
  };
}
