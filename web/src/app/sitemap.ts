import type { MetadataRoute } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld } from "@/lib/aggregations";
import { MACRO_GROUPS } from "@/lib/nav";

const BASE = "https://thecompounder.fyi";
// English-first: en is listed before zh and ranks higher. zh priorities are
// scaled down so English is the primary locale for crawlers.
const LANGS = ["en", "zh"] as const;
const ZH_PRIORITY_FACTOR = 0.7;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const idx = await getManagerIndex();
  const held = await mostHeld(50);
  const indicators = MACRO_GROUPS.flatMap((g) => g.indicators as readonly string[]);
  const urls: MetadataRoute.Sitemap = [];
  for (const lang of LANGS) {
    const p = (base: number) =>
      lang === "zh" ? Math.round(base * ZH_PRIORITY_FACTOR * 100) / 100 : base;
    urls.push({ url: `${BASE}/${lang}`, changeFrequency: "daily", priority: p(1) });
    urls.push({ url: `${BASE}/${lang}/investors`, changeFrequency: "weekly", priority: p(0.8) });
    urls.push({ url: `${BASE}/${lang}/stocks`, changeFrequency: "weekly", priority: p(0.8) });
    urls.push({ url: `${BASE}/${lang}/macro`, changeFrequency: "daily", priority: p(0.7) });
    for (const m of idx.managers ?? []) urls.push({ url: `${BASE}/${lang}/investors/${m.slug}`, changeFrequency: "weekly", priority: p(0.7) });
    for (const h of held) urls.push({ url: `${BASE}/${lang}/stocks/${h.cusip}`, changeFrequency: "weekly", priority: p(0.6) });
    for (const ind of indicators) urls.push({ url: `${BASE}/${lang}/macro/${ind}`, changeFrequency: "daily", priority: p(0.6) });
  }
  return urls;
}
