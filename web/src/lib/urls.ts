import type { Lang } from "@/lib/nav";
import { MACRO_GROUPS } from "@/lib/nav";

export const investorPath = (lang: Lang, slug: string) => `/${lang}/investors/${slug}`;
// 个股 URL 以 ticker 为锚(无 ticker 的标的回退用 cusip, 仍可访问)
export const stockPath = (lang: Lang, tickerOrCusip: string) => `/${lang}/stocks/${tickerOrCusip}`;
export const macroPath = (lang: Lang, indicator: string) => `/${lang}/macro/${indicator}`;

// 站点 canonical 源（与 layout.tsx metadataBase 一致）。分享/外链需绝对地址。
export const SITE_ORIGIN = "https://thecompounder.fyi";
export const absoluteUrl = (path: string) => `${SITE_ORIGIN}${path}`;

const SECTION_KEYS = new Set(MACRO_GROUPS.flatMap((g) => g.indicators as readonly string[]));

// 旧→新：/{lang}/managers → /{lang}/investors；/{lang}/{section} → /{lang}/macro/{section}
export function legacyRedirect(path: string): string | null {
  const m = path.match(/^\/(zh|en)(\/.*)?$/);
  if (!m) return null;
  const lang = m[1];
  const rest = m[2] ?? "";
  if (rest === "/managers") return `/${lang}/investors`;
  const seg = rest.replace(/^\//, "");
  if (SECTION_KEYS.has(seg)) return `/${lang}/macro/${seg}`;
  return null;
}
