// Render the actual stock/investor routes. Only data readers are replaced;
// outbound traffic is forbidden. Run with: npx tsx --tsconfig scripts/tsconfig.json src/app/dataset-pages.check.tsx
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ManagerDetail } from '../lib/managers/types';
import type { StockHolderApp } from '../lib/managers/consensusRead';
import type { LinkHolder } from '../lib/stocks/stockLinks';
const require = createRequire(import.meta.url);
function stub(path: string, exports: unknown) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeJS.Module;
}
const q2 = '2026-06-30', q3 = '2026-09-30';
const row = (slug: string, period = q2, kind: StockHolderApp['kind'] = null): StockHolderApp => ({
  cik: slug === 'first' ? '1' : slug === 'early' ? '2' : '3', slug, person: `Manager ${slug}`, issuer: 'Fixture Issuer',
  value: 100000, shares: 100, weight: 0.1, priorWeight: 0.1, kind, period, filedAt: period === q2 ? '2026-08-14' : '2026-10-20',
});
let rows = [row('first'), row('early', q3)];
let fallback = false;
let linkRows: LinkHolder[] | null | undefined;
let stockRows: StockHolderApp[] | undefined;
function detail(slug: string): ManagerDetail {
  const r = rows.find((r) => r.slug === slug)!;
  const holding = { cusip: 'FIXTURE', issuer: r.issuer, value: r.value, shares: r.shares, weight: r.weight };
  const latest = { period: r.period!, filedAt: r.filedAt ?? '', accession: '0001172661-26-003790', totalValue: r.value, holdings: r.kind === 'exited' ? [] : [holding] };
  return { manager: { ...r, name: `Fund ${slug}` }, latest, filings: [latest], changes: r.kind ? [{ ...holding, kind: r.kind, prevShares: 100, deltaPct: 0 }] : [] };
}
stub('../lib/managers/source', {
  getManagerIndex: async () => ({ managers: rows.map((r) => ({ ...r, name: `Fund ${r.slug}`, totalValue: r.value, holdingCount: 1, topHolding: r.issuer })) }),
  getManagerDetail: async (slug: string) => detail(slug),
});
stub('../lib/managers/consensusRead', {
  readStockHolders: async () => fallback ? null : stockRows ?? rows,
  readStockLinkHolders: async () => linkRows === undefined ? rows.map((r) => ({ ticker: "TEST", kind: r.kind, period: r.period })) : linkRows,
  read13fSourceFilings: async () => rows.map((r) => ({ cik: r.cik, period: r.period, filed_at: r.filedAt, accession: '0001172661-26-003790' })),
  readStockTrend: async () => [], readCoOwnership: async () => [], readHolderCounts: async () => new Map(),
});
stub('../lib/managers/securities', {
  getCusipMap: async () => new Map([['FIXTURE', { ticker: 'TEST', issuer: 'Fixture Issuer' }]]), tickerToCusips: async () => ['FIXTURE'],
  getTickerExchangeMap: async () => new Map(), getSecurityMeta: async () => ({ securityType: 'Common Stock', adsRatio: null }),
});
stub('../lib/aliases/resolve', { resolveEntity: async () => null, getEntityAliases: async () => [] });
stub('../lib/sec/read', { getSecCompanyData: async () => ({ company: null, annual: [], quarterly: [] }) });
stub('../lib/managers/treasuryRead', { getLatestDgs10: async () => null });
const prices = require('../lib/managers/priceRead');
stub('../lib/managers/priceRead', { ...prices, getLatestPrice: async () => null, getLatestSplit: async () => null });
stub('../lib/valuation/valuationSnapshot', { readValuationVerdicts: async () => new Map() });
const publishedRead = require('../lib/valuation/publishedRead');
stub('../lib/valuation/publishedRead', {...publishedRead,readPublicValuations:async()=>new Map()});
const stockRoute = require('./[lang]/stocks/[ticker]/page');
const StockPage = stockRoute.default;
const InvestorPage = require('./[lang]/investors/[slug]/page').default;
type JsonObject = Record<string, unknown>;
function datasets(html: string): JsonObject[] {
  const found: JsonObject[] = [];
  function walk(value: unknown) {
    if (!value || typeof value !== 'object') return;
    if ('@type' in value && value['@type'] === 'Dataset') found.push(value as JsonObject);
    for (const v of Object.values(value)) walk(v);
  }
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) walk(JSON.parse(m[1]));
  return found;
}
async function main() {
  const savedFetch = globalThis.fetch, RealDate = globalThis.Date;
  globalThis.fetch = async () => { throw new Error('Page regression must not access external services'); };
  class FixtureDate extends RealDate {
    constructor(value?: string | number) { super(value ?? '2026-10-30T00:00:00Z'); }
    static now() { return new RealDate('2026-10-30T00:00:00Z').getTime(); }
  }
  globalThis.Date = FixtureDate as typeof Date;
  try {
    for (const lang of ['en', 'zh'] as const) {
      for (fallback of [false, true]) {
        rows = [row('first'), row('early', q3), row('exit', q3, 'exited')];
        const html = renderToStaticMarkup(await StockPage({ params: Promise.resolve({ lang, ticker: 'TEST' }) }));
        assert.ok(!/can lag up to 45 days|可能滞后最多 45 天/.test(html), 'disclaimer must distinguish filing deadline from snapshot age');
        const [ds] = datasets(html);
        assert.equal(ds.temporalCoverage, `${q2}/${q3}`, 'actual mixed holder rows drive coverage on both read paths');
        assert.ok(!('dateModified' in ds));
        assert.ok(Array.isArray(ds.isBasedOn));
        assert.equal(ds.isBasedOn.length, 2, 'exited-only source is outside the holder Dataset');
        assert.ok(ds.isBasedOn.some((s: JsonObject) => s.temporalCoverage === q3 && s.datePublished === '2026-10-20'));
        assert.ok(typeof ds.description === 'string');
        assert.ok(ds.description.includes(q2) && ds.description.includes(q3));
        const mixedFooter = html.slice(html.indexOf('id="sources"')).split('</div></div>')[0];
        assert.ok(mixedFooter.includes(lang === 'en' ? 'Q2 2026 / Q3 2026' : '2026Q2 / 2026Q3'), 'source footer preserves mixed periods');
        const firstScreen = html.slice(0, html.indexOf('id="holders"')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
        assert.ok(firstScreen.includes(q2) && firstScreen.includes(q3), 'visible first-screen snapshot note matches Dataset');
        assert.ok(firstScreen.includes('Manager first') && firstScreen.includes('Manager early'), 'actual major holders accompany snapshot dates');
        assert.ok(!firstScreen.includes('Manager exit'), 'exited investor is outside current holder identities');
        assert.ok(!firstScreen.includes('data-value-axis="linear"'), 'missing quote cannot produce a comparison plot');
        assert.match(ds.description, lang === 'en' ? /comparison baseline: 2026-06-30/ : /比较基准：2026-06-30/);
        rows = [row('first'), row('exit', q3, 'exited')];
        const [single] = datasets(renderToStaticMarkup(await StockPage({ params: Promise.resolve({ lang, ticker: 'TEST' }) })));
        assert.equal(single.temporalCoverage, q2, 'new-quarter exit cannot expand holders coverage');
        rows[0].filedAt = null;
        const [missing] = datasets(renderToStaticMarkup(await StockPage({ params: Promise.resolve({ lang, ticker: 'TEST' }) })));
        assert.ok(Array.isArray(missing.isBasedOn));
        assert.ok(!('datePublished' in missing.isBasedOn[0]), 'missing source date stays missing');
      }
      rows = [row('early', q3)];
      fallback = false;
      const meta = await stockRoute.generateMetadata({ params: Promise.resolve({ lang, ticker: 'TEST' }) });
      assert.ok(meta.description.includes(lang === 'en' ? 'Q3 2026' : '2026Q3'));
      assert.ok(!meta.description.includes('Q2') && !/most|多数/.test(meta.description));
      const earlyHtml = renderToStaticMarkup(await StockPage({ params: Promise.resolve({ lang, ticker: 'TEST' }) }));
      const faqJson = [...earlyHtml.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1])).find((o) => o['@type'] === 'FAQPage');
      assert.ok(faqJson.mainEntity[0].acceptedAnswer.text.includes(lang === 'en' ? 'Q3 2026' : '2026Q3'));
      assert.ok(!/most|多数/.test(faqJson.mainEntity[0].acceptedAnswer.text));
      const sourceFooter = earlyHtml.slice(earlyHtml.indexOf('id="sources"')).split('</div></div>')[0];
      assert.ok(sourceFooter.includes(lang === 'en' ? 'Q3 2026' : '2026Q3'), 'source footer describes actual single-Q3 holdings');
      assert.ok(!sourceFooter.includes('Jun 30') && !sourceFooter.includes('2026年6月30'), 'source footer cannot inherit comparison quarter');
      rows = [row('first')];
      const [investor] = datasets(renderToStaticMarkup(await InvestorPage({ params: Promise.resolve({ lang, slug: 'first' }) })));
      assert.equal(investor.temporalCoverage, q2);
      assert.equal((investor.isBasedOn as JsonObject).datePublished, '2026-08-14');
      assert.ok(!('dateModified' in investor));
      const accessionUrl = 'https://www.sec.gov/edgar/search/#/q=0001172661-26-003790&amp;dateRange=all';
      const investorHtml = renderToStaticMarkup(await InvestorPage({ params: Promise.resolve({ lang, slug: 'first' }) }));
      assert.ok(investorHtml.includes(accessionUrl), 'reporter CIK cannot be inferred from manager CIK or filing-agent accession prefix');
      const [sourcedStock] = datasets(renderToStaticMarkup(await StockPage({ params: Promise.resolve({ lang, ticker: 'TEST' }) })));
      assert.ok((sourcedStock.isBasedOn as {url: string}[])[0].url.includes('#/q=0001172661-26-003790'), 'holder provenance resolves the actual accession rather than a subsidiary HR-only list');
      linkRows = null;
      stockRows = [row('first', q2, 'exited')];
      const unavailable = renderToStaticMarkup(await InvestorPage({ params: Promise.resolve({ lang, slug: 'first' }) }));
      assert.ok(!unavailable.includes(`href="${lang === 'zh' ? '/zh' : ''}/stocks/TEST"`), 'lookup failure cannot re-enable an unverified detail');
      await assert.rejects(() => StockPage({ params: Promise.resolve({ lang, ticker: 'TEST' }) }), /404/);
      linkRows = [];
      stockRows = [];
      const confirmedFallback = renderToStaticMarkup(await InvestorPage({ params: Promise.resolve({ lang, slug: 'first' }) }));
      assert.ok(confirmedFallback.includes(`href="${lang === 'zh' ? '/zh' : ''}/stocks/TEST"`), 'known-empty snapshot preserves proven current long links');
      assert.ok(renderToStaticMarkup(await StockPage({ params: Promise.resolve({ lang, ticker: 'TEST' }) })).includes('Fixture Issuer'), 'the proven fallback destination renders');
      linkRows = undefined;
      stockRows = undefined;
    }
  } finally { globalThis.fetch = savedFetch; globalThis.Date = RealDate; }
  console.log('dataset-pages.check OK (en/zh, snapshot/fallback, single/mixed, exits, missing dates, investor)');
}
main().catch((error) => { console.error(error); process.exit(1); });
