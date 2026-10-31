import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
function stub(path: string, exports: unknown) {
 const id = require.resolve(path);
 require.cache[id] = { id, filename: id, loaded: true, exports } as NodeJS.Module;
}
const period = '2026-06-30';
stub('../lib/managers/source', { getManagerIndex: async () => ({ managers: [{ slug: 'fixture', person: 'Manager', period }] }) });
stub('../lib/aggregations', { notableMoves: async () => ({
 mostBought: [{ cusip: 'LIVE', issuer: 'Current security', count: 1, value: 100, dominantKind: 'new' }],
 mostSold: [{ cusip: 'GONE', issuer: 'Exited security', count: 1, value: 100, dominantKind: 'exited' }],
}) });
stub('../lib/managers/consensusRead', { readStockLinkHolders: async () => [
 { ticker: 'LIVE', kind: 'new', period }, { ticker: 'GONE', kind: 'exited', period },
] });
const { MovesPage } = require('./[lang]/investors/_movesPage');
async function main() {
 const RealDate = globalThis.Date;
 class FixtureDate extends RealDate {
  constructor(value?: string | number) { super(value ?? '2026-10-30T00:00:00Z'); }
  static now() { return new RealDate('2026-10-30T00:00:00Z').getTime(); }
 }
 globalThis.Date = FixtureDate as typeof Date;
 try {
 for (const lang of ['en','zh'] as const) {
  const sell = renderToStaticMarkup(await MovesPage({ lang, side: 'sell' }));
  assert.match(sell, /Exited [Ss]ecurity/);
  assert.ok(!sell.includes('/stocks/GONE'), 'neither ranking nor ItemList can advertise the last-holder exit destination');
  const buy = renderToStaticMarkup(await MovesPage({ lang, side: 'buy' }));
  assert.ok(buy.includes(`href="${lang === 'zh' ? '/zh' : ''}/stocks/LIVE"`), 'valid links survive');
 }
 } finally { globalThis.Date = RealDate; }
 console.log('move-links.check OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
