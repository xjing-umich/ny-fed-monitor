import type { Lang } from "@/lib/nav";

// en → 无前缀；zh → /zh 前缀。全站唯一定义此规则的地方。
// path 是无语言前缀的应用内路径,如 "" / "/investors/AAPL"。
export const localePath = (lang: Lang, path: string): string =>
  lang === "en" ? (path || "/") : `/zh${path}`;

export const investorPath = (lang: Lang, slug: string) => localePath(lang, `/investors/${slug}`);
// 个股 URL 以 ticker 为锚(无 ticker 的标的回退用 cusip, 仍可访问)
export const stockPath = (lang: Lang, tickerOrCusip: string) => localePath(lang, `/stocks/${tickerOrCusip}`);

// 站点 canonical 源（与 layout.tsx metadataBase 一致）。分享/外链需绝对地址。
export const SITE_ORIGIN = "https://thecompounder.fyi";
export const absoluteUrl = (path: string) => `${SITE_ORIGIN}${path}`;
