// Render the actual stock/investor routes. Only data readers are replaced;
// outbound traffic is forbidden. Run with: npx tsx --tsconfig scripts/tsconfig.json src/app/dataset-pages.check.tsx
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ManagerDetail } from '../lib/managers/types';
import type { StockHolderApp } from '../lib/managers/consensusRead';
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
function detail(slug: string): ManagerDetail {
  const r = rows.find((r) => r.slug === slug)!;
  const holding = { cusip: 'FIXTURE', issuer: r.issuer, value: r.value, shares: r.shares, weight: r.weight };
  const latest = { period: r.period!, filedAt: r.filedAt ?? '', accession: '0000000001-26-000001', totalValue: r.value, holdings: r.kind === 'exited' ? [] : [holding] };
  return { manager: { ...r, name: `Fund ${slug}` }, latest, filings: [latest], changes: r.kind ? [{ ...holding, kind: r.kind, prevShares: 100, deltaPct: 0 }] : [] };
}
stub('../lib/managers/source', {
  getManagerIndex: async () => ({ managers: rows.map((r) => ({ ...r, name: `Fund ${r.slug}`, totalValue: r.value, holdingCount: 1, topHolding: r.issuer })) }),
  getManagerDetail: async (slug: string) => detail(slug),
});
stub('../lib/managers/consensusRead', {
  readStockHolders: async () => fallback ? null : rows,
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
const StockPage = require('./[lang]/stocks/[ticker]/page').default;
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
        const [ds] = datasets(html);
        assert.equal(ds.temporalCoverage, `${q2}/${q3}`, 'actual mixed holder rows drive coverage on both read paths');
        assert.ok(!('dateModified' in ds));
        assert.ok(Array.isArray(ds.isBasedOn));
        assert.equal(ds.isBasedOn.length, 2, 'exited-only source is outside the holder Dataset');
        assert.ok(ds.isBasedOn.some((s: JsonObject) => s.temporalCoverage === q3 && s.datePublished === '2026-10-20'));
        assert.ok(typeof ds.description === 'string');
        assert.ok(ds.description.includes(q2) && ds.description.includes(q3));
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
      rows = [row('first')];
      const [investor] = datasets(renderToStaticMarkup(await InvestorPage({ params: Promise.resolve({ lang, slug: 'first' }) })));
      assert.equal(investor.temporalCoverage, q2);
      assert.equal((investor.isBasedOn as JsonObject).datePublished, '2026-08-14');
      assert.ok(!('dateModified' in investor));
    }
  } finally { globalThis.fetch = savedFetch; globalThis.Date = RealDate; }
  console.log('dataset-pages.check OK (en/zh, snapshot/fallback, single/mixed, exits, missing dates, investor)');
}
main().catch((error) => { console.error(error); process.exit(1); });
