import type { Lang } from "@/lib/nav";

export const investorPath = (lang: Lang, slug: string) => `/${lang}/investors/${slug}`;
// 个股 URL 以 ticker 为锚(无 ticker 的标的回退用 cusip, 仍可访问)
export const stockPath = (lang: Lang, tickerOrCusip: string) => `/${lang}/stocks/${tickerOrCusip}`;

// 站点 canonical 源（与 layout.tsx metadataBase 一致）。分享/外链需绝对地址。
export const SITE_ORIGIN = "https://thecompounder.fyi";
export const absoluteUrl = (path: string) => `${SITE_ORIGIN}${path}`;
