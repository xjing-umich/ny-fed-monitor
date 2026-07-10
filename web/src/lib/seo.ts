import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { SITE_ORIGIN, absoluteUrl, localePath } from "@/lib/urls";

export const SITE_NAME = "Compounder";

// OpenGraph locale tags per UI language.
const OG_LOCALE: Record<Lang, string> = { zh: "zh_CN", en: "en_US" };

/**
 * Per-page OpenGraph + Twitter metadata.
 *
 * openGraph is shallow-merged at the top-level key: once a page sets it, it
 * REPLACES the layout's site-wide openGraph entirely — so this helper supplies
 * every field, including a default image. Routes with their own
 * `opengraph-image.tsx` (stock/investor leaves, consensus, etc.) override this
 * default via same-segment file-based priority; routes without one (investors
 * hub, stocks hub, macro) fall back to the site brand card instead of shipping
 * a blank `summary_large_image` card.
 *
 * `path` is the locale-aware path from `localePath()`/`stockPath()` etc.,
 * e.g. "/stocks/AAPL" (en, bare) or "/zh/stocks/AAPL" (zh, prefixed).
 */
export function ogFor(opts: {
  lang: Lang;
  title: string;
  description: string;
  path: string;
  type?: "website" | "article" | "profile";
}): Pick<Metadata, "openGraph" | "twitter"> {
  const { lang, title, description, path, type = "website" } = opts;
  // 站点品牌卡(根 opengraph-image 路由)。en 裸前缀 → /opengraph-image,zh → /zh/opengraph-image。
  const brandCard = absoluteUrl(localePath(lang, "/opengraph-image"));
  return {
    openGraph: {
      type,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      title,
      description,
      locale: OG_LOCALE[lang],
      alternateLocale: lang === "en" ? ["zh_CN"] : ["en_US"],
      images: [{ url: brandCard, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [brandCard],
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

/**
 * 每页 alternates（canonical + hreflang）统一构造器。
 * path 是无语言前缀的应用内路径,如 "/investors/AAPL"、"" (首页)。
 * en/x-default → 裸；zh-CN → /zh 前缀。杜绝各页散拼 /en 硬编码。
 */
export function altFor(lang: Lang, path: string) {
  return {
    canonical: localePath(lang, path),
    languages: {
      en: localePath("en", path),
      "zh-CN": localePath("zh", path),
      "x-default": localePath("en", path),
    },
  };
}
