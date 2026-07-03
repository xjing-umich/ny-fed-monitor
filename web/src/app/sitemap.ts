import type { MetadataRoute } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { consensusHeld } from "@/lib/aggregations";
import { ARTICLE_SLUGS } from "@/lib/learn";
import { isLikelyTicker } from "@/lib/externalLinks";
import { localePath } from "@/lib/urls";

const BASE = "https://thecompounder.fyi";

// sitemap 读 consensusHeld(最多 5000 行)+ getManagerIndex;爬虫频繁抓取。
// 季度级数据 → 日级缓存,避免每次抓 sitemap 都重跑这两笔大读(egress)。
export const revalidate = 86400;

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
// lastModified: 取真实的 13F 报告期(YYYY-MM-DD) —— 新一季数据进库时该日期自动前移,
// 是诚实的"内容版本"信号(避免凭空造日期)。无真实日期的纯编辑页(about/learn/macro)不带 lastmod。
function entry(
  path: string,
  changeFrequency: ChangeFreq,
  priority: number,
  lastModified?: string
): MetadataRoute.Sitemap[number] {
  return {
    url: `${BASE}${localePath("en", path)}`,
    changeFrequency,
    priority,
    ...(lastModified ? { lastModified } : {}),
    alternates: {
      languages: {
        en: `${BASE}${localePath("en", path)}`,
        "zh-CN": `${BASE}${localePath("zh", path)}`,
        "x-default": `${BASE}${localePath("en", path)}`,
      },
    },
  };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [idx, held] = await Promise.all([getManagerIndex(), consensusHeld()]);

  // 全局最新报告期(各投资人 period 的最大值)。13F 数据按季整体刷新,故聚合页/榜单/个股页
  // 都以此为 lastmod;period 为 YYYY-MM-DD 字符串,按字典序取最大即最新。无数据则留空。
  const periods = (idx.managers ?? []).map((m) => m.period).filter(Boolean);
  const globalLatest = periods.length ? periods.reduce((a, b) => (b > a ? b : a)) : undefined;

  const urls: MetadataRoute.Sitemap = [
    entry("", "daily", 1, globalLatest),
    entry("/investors", "weekly", 0.8, globalLatest),
    entry("/investors/consensus", "weekly", 0.8, globalLatest),
    entry("/investors/buys", "weekly", 0.8, globalLatest),
    entry("/investors/sells", "weekly", 0.8, globalLatest),
    entry("/stocks", "weekly", 0.8, globalLatest),
    entry("/stocks/screener", "weekly", 0.7, globalLatest),
    // 编辑/外部数据页:无诚实的 13F 变更日期 → 不带 lastmod。
    entry("/macro", "daily", 0.7),
    entry("/macro/methodology", "weekly", 0.5),
    entry("/about", "monthly", 0.4),
    entry("/learn", "weekly", 0.6),
  ];

  for (const slug of ARTICLE_SLUGS) {
    urls.push(entry(`/learn/${slug}`, "monthly", 0.6));
  }

  for (const m of idx.managers ?? []) {
    // 每位投资人用其自身最新报告期 —— 停报者 period 更旧 → lastmod 更旧,正确告诉 Google
    // 该页不必频繁重抓。
    urls.push(entry(`/investors/${m.slug}`, "weekly", 0.7, m.period || undefined));
  }

  // mostHeld returns rows whose `cusip` field already holds the canonical ticker
  // (via the consensus table / tickerize fallback), so these are the canonical
  // /stocks/[ticker] URLs — no 301 hop. Dedupe in case dual-class CUSIPs map to
  // the same ticker.
  // Only emit clean ticker URLs. consensusHeld()'s `cusip` field is the tickerized
  // identifier, but spine enrichment occasionally leaves a raw CUSIP/CINS (e.g.
  // 81211K100, G0378L100) or a corrupt numeric value (e.g. "9.2343e+106"). The
  // corrupt ones 404, and the raw CUSIPs render non-semantic URLs with unresolved
  // titles ("81211K100 (81211K100) Stock") — feeding Google 404s/low-value pages
  // from our own sitemap drags crawl quality. isLikelyTicker is the same predicate
  // the on-page internal links use, so the sitemap stays ⊆ the linked ticker pages.
  // Excluded securities remain crawlable (robots allows all); they re-enter the
  // sitemap once enrichment resolves them to a real ticker.
  const seenStocks = new Set<string>();
  for (const h of held) {
    if (!h.cusip || !isLikelyTicker(h.cusip) || seenStocks.has(h.cusip)) continue;
    seenStocks.add(h.cusip);
    // 个股共识快照随整库按季刷新 → 用全局最新报告期作 lastmod。
    urls.push(entry(`/stocks/${h.cusip}`, "weekly", 0.6, globalLatest));
  }

  return urls;
}
