import type { Metadata } from "next";
import type { Lang } from "@/lib/nav";
import { SITE_ORIGIN, absoluteUrl, localePath, HTML_LANG, hreflangs } from "@/lib/urls";
import { isOperatingSecurity } from "@/lib/securities/openfigi";

export const SITE_NAME = "Compounder";

/** 标题尾的品牌名:中文页带"复利",与首页、投资人页、个股页一致。 */
export const titleBrand = (lang: Lang): string => (lang === "zh" ? "Compounder · 复利" : SITE_NAME);

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
  // 路由自带的 opengraph-image 文件,Next 按真实段 app/[lang] 生成地址:en 页会是 /en/…/opengraph-image,
  // 而 /en/* 一律 301 到裸路径,爬虫和分享卡每次都要多跳一次。en 页显式给出裸地址(页面里写了 images,
  // 文件就不再生效);zh 的 /zh 前缀本来就对,继续交给文件路由。
  const ownCard = !brandImage && lang === "en" ? absoluteUrl(`${path === "/" ? "" : path}/opengraph-image`) : null;
  const image = brandImage
    ? { url: brandCard, width: 1200, height: 630, alt: SITE_NAME }
    : ownCard
      ? { url: ownCard, width: 1200, height: 630, alt: title, type: "image/png" }
      : null;
  return {
    openGraph: {
      type,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      title,
      description,
      locale: OG_LOCALE[lang],
      alternateLocale: lang === "en" ? ["zh_CN"] : ["en_US"],
      ...(image ? { images: [image] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [{ url: image.url, alt: image.alt }] } : {}),
    },
  };
}

// 汉字与全角标点。
const CJK_CHAR = /[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/;

/** 搜索结果摘要的显示宽度:汉字和全角标点按 2 计,约等于英文字符数。 */
export function snippetWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += CJK_CHAR.test(ch) ? 2 : 1;
  return w;
}

/** 摘要超过约 160 宽度会被搜索结果截断。按从详到简给出几个写法,取第一个放得下的;都放不下取最后一个(最简)。 */
export const SNIPPET_MAX = 160;
export function fitSnippet(...candidates: string[]): string {
  return candidates.find((c) => snippetWidth(c) <= SNIPPET_MAX) ?? candidates[candidates.length - 1];
}

/** Counts and comparison quarter come from the same data as the visible directory. */
export function listMetadata(lang: Lang, kind: "stocks" | "investors", count: number, quarter: string | null) {
  const q = quarter ? ` · ${quarter}` : "";
  if (kind === "investors") {
    return lang === "zh"
      ? {
          title: `超级投资者 13F 持仓${q} — ${titleBrand(lang)}`,
          description: `查看 ${count} 位超级投资者的 SEC 13F 持仓、仓位大小与季度增减${quarter ? `，以 ${quarter} 为比较季度` : ""}。按组合市值浏览，追溯原始申报。`,
        }
      : {
          title: `Superinvestor 13F Portfolios${q} — ${titleBrand(lang)}`,
          description: `Explore ${count} superinvestor portfolios from SEC 13F filings. Holdings, position sizes and quarterly changes${quarter ? `; ${quarter} comparison quarter` : ""}.`,
        };
  }
  return lang === "zh"
    ? {
        title: `超级投资者最多人持有的股票${q} — ${titleBrand(lang)}`,
        description: `查看 ${count} 只被至少两位投资人持有的股票，比较持有人数与申报市值。来源：SEC 13F${quarter ? `，以 ${quarter} 为比较季度` : ""}。`,
      }
    : {
        title: `Most-Held Stocks${q} — ${titleBrand(lang)}`,
        description: `Compare ${count} stocks held by at least two tracked superinvestors. SEC 13F holder counts and position values${quarter ? `; ${quarter} comparison quarter` : ""}.`,
      };
}

/** 13F 原始申报属美国政府公开记录;与投资人页 Dataset 同一许可声明。 */
export const SEC_DATA_LICENSE = "https://creativecommons.org/publicdomain/mark/1.0/";

/** EDGAR 公司申报列表页(按 CIK,只看 13F-HR)。 */
export function edgarFilingsUrl(cik: string): string {
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik.padStart(10, "0")}&type=13F-HR&dateb=&owner=include&count=40`;
}

/** Classify the security itself; a fund share is not its management company. */
export function securitySchemaType(securityType: string | null, issuer: string, ticker: string): "InvestmentFund" | "FinancialProduct" | "Corporation" {
  if (["ETP", "ETF", "Mutual Fund", "Closed-End Fund"].includes(securityType ?? "") || (!securityType && /\bETF\b|exchange.traded fund/i.test(issuer))) {
    return "InvestmentFund";
  }
  return !isOperatingSecurity(securityType) || /^[0-9A-Z]{8}[0-9]$/i.test(ticker)
    ? "FinancialProduct"
    : "Corporation";
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
  /** Actual filings, or identified managers' 13F filing lists when accession is unavailable. */
  sourceUrls?: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: opts.name,
    description: opts.description,
    url: absoluteUrl(opts.path),
    inLanguage: HTML_LANG[opts.lang],
    isAccessibleForFree: true,
    license: SEC_DATA_LICENSE,
    ...(opts.period ? { temporalCoverage: quarterInterval(opts.period) } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    variableMeasured: opts.variableMeasured,
    creator: { "@type": "Organization", name: SITE_NAME, url: SITE_ORIGIN },
    sourceOrganization: { "@type": "Organization", name: "U.S. Securities and Exchange Commission", url: "https://www.sec.gov" },
    ...(opts.sourceUrls?.length ? { isBasedOn: [...new Set(opts.sourceUrls)] } : {}),
  };
}

/**
 * 列表页(投资人目录、个股榜、Learn 首页)的 CollectionPage JSON-LD。条目按页面顺序给出名称和实体页链接,
 * 搜索引擎和 AI 能把列表项对到具体的投资人/个股/文章。numberOfItems 是页面上的总数,条目可只列前 limit 个。
 */
export function collectionLd(opts: {
  lang: Lang;
  name: string;
  description: string;
  path: string;
  items: { name: string; path: string }[];
  total?: number;
  limit?: number;
  /** 列表数据最后一次变化的日期(YYYY-MM-DD)。 */
  dateModified?: string | null;
}) {
  const { lang, name, description, path, items, total = items.length, limit = items.length } = opts;
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: absoluteUrl(path),
    inLanguage: HTML_LANG[lang],
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_ORIGIN },
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: total,
      itemListElement: items.slice(0, limit).map((it, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
        url: absoluteUrl(it.path),
      })),
    },
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
 * en/x-default → 裸；zh-CN / zh → /zh 前缀。杜绝各页散拼 /en 硬编码。
 */
export function altFor(lang: Lang, path: string) {
  return {
    canonical: localePath(lang, path),
    languages: hreflangs(path),
  };
}
