import type { MetadataRoute } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { consensusHeld } from "@/lib/aggregations";
import { ARTICLE_SLUGS, getArticle } from "@/lib/learn";
import { isLikelyTicker } from "@/lib/externalLinks";
import { localePath, hreflangs } from "@/lib/urls";
import { listReportPeriods } from "@/lib/reports/read";
import { reportLastModified, reportSlug } from "@/lib/reports/period";
import { displayedDataModified } from "@/lib/freshness/derive";

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

// 每个语言版本各占一条 <url>,两条带完全相同的 alternates 组(含自身 + x-default → en)。
// 这是 Google 多语言 sitemap 的写法;只给英文 <loc>、把中文放在 xhtml:link 里,
// 不读 xhtml:link 的 Bing / 百度就等于没收到中文页。
// lastModified: 取内容真正变化的日期 —— 数据页用 13F 的 SEC 提交日(数据就是那天进来的),
// 文章用其 updated。不用报告期(季末日):Q2 的数据 8 月中才报齐,写 06-30 等于说页面在数据出来前就定稿了。
// 无真实日期的纯编辑页(about/disclaimer)不带 lastmod,不凭空造日期。
function entry(
  path: string,
  changeFrequency: ChangeFreq,
  priority: number,
  lastModified?: string
): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(
    Object.entries(hreflangs(path)).map(([k, v]) => [k, `${BASE}${v}`]),
  );
  return (["en", "zh"] as const).map((lang) => ({
    url: `${BASE}${localePath(lang, path)}`,
    changeFrequency,
    priority,
    ...(lastModified ? { lastModified } : {}),
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [idx, held] = await Promise.all([getManagerIndex(), consensusHeld()]);

  // 聚合页/榜单/个股页的 lastmod:全站展示季度(effectiveMovesPeriod,与首页 masthead / buys·sells /
  // 个股页"截至"同一口径)里最晚一份 13F 的提交日。不跟最新季:申报季内一两家基金提前交了新季时,
  // 会把上千个 URL 的 lastmod 一起推前,而页面内容仍是上一季。
  const dataModified = displayedDataModified(idx.managers ?? [], new Date()) ?? undefined;

  const reports = (await listReportPeriods())
    .map((r) => ({ slug: reportSlug(r.period), lastModified: reportLastModified(r.generatedAt, r.finalizedAt).slice(0, 10) }))
    .filter((r) => !ARTICLE_SLUGS.includes(r.slug)); // 手写版优先(Q1)
  // 一个 URL 对应中英两版,取两版里较晚的 updated。
  const articleDates = ARTICLE_SLUGS.map((slug) => ({
    slug,
    lastModified: [getArticle(slug, "en")?.updated, getArticle(slug, "zh")?.updated].filter(Boolean).sort().at(-1),
  }));
  // Learn 首页列出全部文章与季报,随其中最新的一篇变化。
  const learnModified = [...articleDates, ...reports]
    .map((a) => a.lastModified)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);

  const urls: MetadataRoute.Sitemap = [
    ...entry("", "daily", 1, dataModified),
    ...entry("/investors", "weekly", 0.8, dataModified),
    ...entry("/investors/consensus", "weekly", 0.8, dataModified),
    ...entry("/investors/buys", "weekly", 0.8, dataModified),
    ...entry("/investors/sells", "weekly", 0.8, dataModified),
    ...entry("/stocks", "weekly", 0.8, dataModified),
    ...entry("/stocks/screener", "weekly", 0.7, dataModified),
    ...entry("/about", "monthly", 0.4),
    ...entry("/disclaimer", "yearly", 0.3),
    ...entry("/learn", "weekly", 0.6, learnModified),
  ];

  for (const a of articleDates) {
    urls.push(...entry(`/learn/${a.slug}`, "monthly", 0.6, a.lastModified));
  }

  for (const r of reports) {
    urls.push(...entry(`/learn/${r.slug}`, "weekly", 0.7, r.lastModified));
  }

  for (const m of idx.managers ?? []) {
    // 每位投资人用其最新一份 13F 的提交日 —— 停报者的日期停在一年多前,正确告诉 Google
    // 该页不必频繁重抓。
    urls.push(...entry(`/investors/${m.slug}`, "weekly", 0.7, m.filedAt?.slice(0, 10) || m.period || undefined));
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
    // 个股共识快照随整库按季刷新 → 与聚合页同一日期。
    urls.push(...entry(`/stocks/${h.cusip}`, "weekly", 0.6, dataModified));
  }

  return urls;
}
