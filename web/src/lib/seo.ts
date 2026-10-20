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
  /** false → 不带品牌卡图,交给路由自己的 opengraph-image 文件(metadata 里的 images 会盖掉它)。 */
  brandImage?: boolean;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const { lang, title, description, path, type = "website", brandImage = true } = opts;
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
      ...(brandImage ? { images: [{ url: brandCard, width: 1200, height: 630, alt: SITE_NAME }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(brandImage ? { images: [brandCard] } : {}),
    },
  };
}

/** 13F 原始申报属美国政府公开记录;与投资人页 Dataset 同一许可声明。 */
export const SEC_DATA_LICENSE = "https://creativecommons.org/publicdomain/mark/1.0/";

/** EDGAR 公司申报列表页(按 CIK,只看 13F-HR)。 */
export function edgarFilingsUrl(cik: string): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik.padStart(10, "0")}&type=13F-HR&dateb=&owner=include&count=40`;
}

/** 季末日期(YYYY-MM-DD) → 该季 ISO 8601 区间,如 "2026-04-01/2026-06-30";非季末格式 → 原样返回。 */
export function quarterInterval(periodEnd: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(periodEnd);
  if (!m) return periodEnd;
  const startMonth = Math.floor((parseInt(m[2], 10) - 1) / 3) * 3 + 1;
  return `${m[1]}-${String(startMonth).padStart(2, "0")}-01/${periodEnd}`;
}

/** Dataset JSON-LD for a factual table (e.g. a stock's 13F holders) — GEO-friendly. */
export function datasetLd(opts: {
  lang: Lang;
  name: string;
  description: string;
  path: string;
  /** 数据所属报告期(季末 YYYY-MM-DD) → temporalCoverage。 */
  period?: string | null;
  /** 该季最晚一份来源 13F 的提交日(YYYY-MM-DD) → dateModified。 */
  dateModified?: string | null;
  /** 表中各列度量的名称。 */
  variableMeasured: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    inLanguage: opts.lang === "zh" ? "zh-CN" : "en",
    isAccessibleForFree: true,
    license: SEC_DATA_LICENSE,
    ...(opts.period ? { temporalCoverage: quarterInterval(opts.period) } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    variableMeasured: opts.variableMeasured,
    creator: { "@type": "Organization", name: SITE_NAME, url: SITE_ORIGIN },
    sourceOrganization: { "@type": "Organization", name: "U.S. Securities and Exchange Commission", url: "https://www.sec.gov" },
    isBasedOn: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany",
  };
}

/** BreadcrumbList JSON-LD,自动以站点首页为根节点。crumbs 的 path 为 localePath() 结果。 */
export function breadcrumbLd(lang: Lang, crumbs: { name: string; path: string }[]) {
  const items = [{ name: lang === "zh" ? "首页" : "Home", path: localePath(lang, "") }, ...crumbs];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
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
