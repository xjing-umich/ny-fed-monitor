import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { SITE_ORIGIN, absoluteUrl } from "@/lib/urls";

export const SITE_NAME = "Compounder";

// OpenGraph locale tags per UI language.
const OG_LOCALE: Record<Lang, string> = { zh: "zh_CN", en: "en_US" };

/**
 * Per-page OpenGraph + Twitter metadata.
 *
 * openGraph is shallow-merged at the top-level key: once a page sets it, it
 * REPLACES the layout's site-wide openGraph entirely — so this helper supplies
 * every field. The route's `opengraph-image.tsx` still attaches its image
 * (file-based metadata has higher priority), so images are intentionally omitted.
 *
 * `path` is the locale-prefixed path, e.g. "/en/stocks/AAPL".
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
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      title,
      description,
      locale: OG_LOCALE[lang],
      alternateLocale: lang === "en" ? ["zh_CN"] : ["en_US"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/** Dataset JSON-LD for a factual table (e.g. a stock's 13F holders) — GEO-friendly. */
export function datasetLd(opts: {
  lang: Lang;
  name: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    inLanguage: opts.lang === "zh" ? "zh-CN" : "en",
    isAccessibleForFree: true,
    creator: { "@type": "Organization", name: SITE_NAME, url: SITE_ORIGIN },
    isBasedOn: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany",
  };
}
