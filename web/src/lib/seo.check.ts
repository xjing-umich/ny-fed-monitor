import { ogFor, fitSnippet, snippetWidth, SNIPPET_MAX, datasetLd, securitySchemaType, listMetadata } from "./seo";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

// en 页自带 opengraph-image 时给裸地址(文件路由会生成 /en/… 而被 301);zh 交给文件路由;品牌卡不变。
const ogImg = (o: ReturnType<typeof ogFor>) => (o.openGraph?.images as { url: string }[] | undefined)?.[0]?.url;
assert(ogImg(ogFor({ lang: "en", title: "t", description: "d", path: "/stocks/AAPL", brandImage: false })) === "https://thecompounder.fyi/stocks/AAPL/opengraph-image/default", "en 自带卡 → 裸地址");
assert(ogImg(ogFor({ lang: "zh", title: "t", description: "d", path: "/zh/stocks/AAPL", brandImage: false })) === undefined, "zh 自带卡 → 交给文件路由");
assert(ogImg(ogFor({ lang: "en", title: "t", description: "d", path: "/investors" })) === "https://thecompounder.fyi/opengraph-image/default", "en 品牌卡");
assert(ogImg(ogFor({ lang: "zh", title: "t", description: "d", path: "/zh/investors" })) === "https://thecompounder.fyi/zh/opengraph-image/default", "zh 品牌卡");

// 摘要宽度:汉字按 2 计。
assert(snippetWidth("Apple") === 5 && snippetWidth("苹果，") === 6, "snippetWidth");
const long = "x".repeat(SNIPPET_MAX + 1);
assert(fitSnippet(long, "short", "s") === "short", "取第一个放得下的");
assert(fitSnippet(long, long + "y") === long + "y", "都放不下取最后一个");

// A dataset must cite its actual sources, never a generic EDGAR search.
const dataset = datasetLd({ lang: "en", name: "Holders", description: "13F holders", path: "/stocks/AAPL", variableMeasured: ["Shares"], sources: [{ name: "13F", url: "https://www.sec.gov/Archives/edgar/data/1/filing/" }, { name: "13F", url: "https://www.sec.gov/Archives/edgar/data/1/filing/" }] });
assert(JSON.stringify(dataset.isBasedOn) === JSON.stringify([{ "@type": "CreativeWork", name: "13F", url: "https://www.sec.gov/Archives/edgar/data/1/filing/" }]), "Dataset must preserve and deduplicate actual source URLs");
const noSources = datasetLd({ lang: "en", name: "Holders", description: "13F holders", path: "/stocks/AAPL", variableMeasured: ["Shares"] });
assert(!("isBasedOn" in noSources), "missing provenance must not invent a source");
for (const [type, name, ticker, expected] of [
  ["ETP", "SPDR S&P 500 ETF Trust", "SPY", "InvestmentFund"],
  [null, "Vanguard Total Stock Market ETF", "VTI", "InvestmentFund"],
  ["Mutual Fund", "A Fund", "FUND", "InvestmentFund"],
  ["Closed-End Fund", "Income Trust", "CEF", "InvestmentFund"],
  ["Common Stock", "Apple Inc", "AAPL", "Corporation"],
  ["Common Stock", "ETF Services Inc", "ETS", "Corporation"],
  ["REIT", "American Tower Corp", "AMT", "Corporation"],
  ["Equity WRT", "A warrant", "ABC.W", "FinancialProduct"],
  [null, "Convertible note", "008073AA6", "FinancialProduct"],
  [null, "Company", "ABC", "Corporation"],
] as const) assert(securitySchemaType(type, name, ticker) === expected, `schema type: ${ticker}`);
for (const lang of ["en", "zh"] as const) for (const kind of ["stocks", "investors"] as const) {
  const meta = listMetadata(lang, kind, 1234, "Q2 2026");
  assert(meta.description.includes("1234") && meta.description.includes("Q2 2026"), "list snippets must use supplied count and quarter");
  assert(snippetWidth(meta.description) <= 160, `snippet too wide: ${lang}/${kind}`);
  assert(!listMetadata(lang, kind, 0, null).title.includes("Q2"), "empty data must not invent a quarter");
}
console.log("seo.check OK");

// Ranking snippets use real quarter/leader data, and do not invent leaders on empty views.
for (const lang of ['en','zh'] as const) {
 const { rankingMetadata } = require('./seo');
 for (const kind of ['buys','sells','consensus'] as const) {
  const meta = rankingMetadata(lang, kind, '2026-06-30', { ticker: 'MSFT', count: 20 });
  assert(meta.description.includes('MSFT') && meta.description.includes('20'), 'actual leader in snippet');
  assert(meta.title.includes(lang === 'en' ? 'Q2 2026' : '2026Q2'), 'actual comparison quarter in title');
  assert(snippetWidth(meta.description) <= 160, 'bounded ranking snippet');
  assert(!rankingMetadata(lang, kind, null, null).description.includes('MSFT'), 'no invented leader');
 }
}
