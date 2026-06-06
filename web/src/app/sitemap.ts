import type { MetadataRoute } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld } from "@/lib/aggregations";
import { MACRO_GROUPS } from "@/lib/nav";

const BASE = "https://compounder.fyi";
const LANGS = ["zh", "en"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const idx = await getManagerIndex();
  const held = await mostHeld(50);
  const indicators = MACRO_GROUPS.flatMap((g) => g.indicators as readonly string[]);
  const urls: MetadataRoute.Sitemap = [];
  for (const lang of LANGS) {
    urls.push({ url: `${BASE}/${lang}`, changeFrequency: "daily", priority: 1 });
    urls.push({ url: `${BASE}/${lang}/investors`, changeFrequency: "weekly", priority: 0.8 });
    urls.push({ url: `${BASE}/${lang}/stocks`, changeFrequency: "weekly", priority: 0.8 });
    urls.push({ url: `${BASE}/${lang}/macro`, changeFrequency: "daily", priority: 0.7 });
    for (const m of idx.managers ?? []) urls.push({ url: `${BASE}/${lang}/investors/${m.slug}`, changeFrequency: "weekly", priority: 0.7 });
    for (const h of held) urls.push({ url: `${BASE}/${lang}/stocks/${h.cusip}`, changeFrequency: "weekly", priority: 0.6 });
    for (const ind of indicators) urls.push({ url: `${BASE}/${lang}/macro/${ind}`, changeFrequency: "daily", priority: 0.6 });
  }
  return urls;
}
