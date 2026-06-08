import type { MetadataRoute } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { consensusHeld } from "@/lib/aggregations";
import { MACRO_GROUPS } from "@/lib/nav";
import { ARTICLE_SLUGS } from "@/lib/learn";

const BASE = "https://thecompounder.fyi";

// Only submit the substantial stock pages — those held by ≥2 funds (consensus).
// On a new, low-authority domain, listing the full ~1000-page universe (mostly
// thin single-holder pages with no internal links) buries crawl budget and
// drags quality signals; those pages stay crawlable but out of the sitemap until
// they have more content. consensusHeld() is the shared source with /stocks.

type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

// One entry per page with English as the primary (English-first) URL and the
// zh version expressed via hreflang alternates (+ x-default → en). This matches
// the on-page <link rel="alternate"> tags and is the correct way to pair
// localized URLs in a sitemap — better than emitting duplicate en/zh entries.
function entry(
  path: string,
  changeFrequency: ChangeFreq,
  priority: number
): MetadataRoute.Sitemap[number] {
  return {
    url: `${BASE}/en${path}`,
    changeFrequency,
    priority,
    alternates: {
      languages: {
        en: `${BASE}/en${path}`,
        "zh-CN": `${BASE}/zh${path}`,
        "x-default": `${BASE}/en${path}`,
      },
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [idx, held] = await Promise.all([getManagerIndex(), consensusHeld()]);
  const indicators = MACRO_GROUPS.flatMap((g) => g.indicators as readonly string[]);

  const urls: MetadataRoute.Sitemap = [
    entry("", "daily", 1),
    entry("/investors", "weekly", 0.8),
    entry("/investors/consensus", "weekly", 0.8),
    entry("/investors/buys", "weekly", 0.8),
    entry("/investors/sells", "weekly", 0.8),
    entry("/stocks", "weekly", 0.8),
    entry("/macro", "daily", 0.7),
    entry("/about", "monthly", 0.4),
    entry("/learn", "weekly", 0.6),
  ];

  for (const slug of ARTICLE_SLUGS) {
    urls.push(entry(`/learn/${slug}`, "monthly", 0.6));
  }

  for (const m of idx.managers ?? []) {
    urls.push(entry(`/investors/${m.slug}`, "weekly", 0.7));
  }

  // mostHeld returns rows whose `cusip` field already holds the canonical ticker
  // (via the consensus table / tickerize fallback), so these are the canonical
  // /stocks/[ticker] URLs — no 301 hop. Dedupe in case dual-class CUSIPs map to
  // the same ticker.
  const seenStocks = new Set<string>();
  for (const h of held) {
    if (!h.cusip || seenStocks.has(h.cusip)) continue;
    seenStocks.add(h.cusip);
    urls.push(entry(`/stocks/${h.cusip}`, "weekly", 0.6));
  }

  for (const ind of indicators) {
    urls.push(entry(`/macro/${ind}`, "daily", 0.6));
  }

  return urls;
}
