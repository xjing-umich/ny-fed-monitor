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

// <html lang>、JSON-LD inLanguage、语言切换链接的 hrefLang 共用这一个值。
export const HTML_LANG: Record<Lang, string> = { en: "en", zh: "zh-CN" };

// 每个页面的 hreflang 组。zh-CN 之外再给通用的 zh:浏览器语言是 zh-SG / zh-HK / zh-TW 的读者
// 对不上 zh-CN,没有 zh 就会落到 x-default(英文页)。
export const hreflangs = (path: string): Record<string, string> => ({
  en: localePath("en", path),
  "zh-CN": localePath("zh", path),
  zh: localePath("zh", path),
  "x-default": localePath("en", path),
});
