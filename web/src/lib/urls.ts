import type { Lang } from "@/lib/nav";
import { MACRO_GROUPS } from "@/lib/nav";

export const investorPath = (lang: Lang, slug: string) => `/${lang}/investors/${slug}`;
export const stockPath = (lang: Lang, id: string) => `/${lang}/stocks/${id}`;
export const macroPath = (lang: Lang, indicator: string) => `/${lang}/macro/${indicator}`;

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
