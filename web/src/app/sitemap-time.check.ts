// Exercise the route with the same managers but different source filing dates.
// No network or production writes: only the route's readers are replaced.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let filedAt = '2026-08-14';
function stub(path: string, exports: unknown) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeJS.Module;
}
stub('../lib/managers/source', { getManagerIndex: async () => ({ managers: [{ slug: 'test', period: '2026-06-30', filedAt }] }) });
stub('../lib/aggregations', { consensusHeld: async () => [{ cusip: 'TEST' }] });
stub('../lib/reports/read', { listReportPeriods: async () => [{ period: '2026-06-30', generatedAt: '2026-10-20T12:00:00Z', finalizedAt: null }] });
const { default: sitemap } = require('./sitemap');
async function main() {
  const first = await sitemap();
  for (const path of ['', '/investors', '/stocks', '/investors/test', '/stocks/TEST']) {
    const row = first.find((r: { url: string }) => r.url === `https://thecompounder.fyi${path || "/"}`);
    assert.ok(row, path);
    assert.ok(!('lastModified' in row), `${path} cannot use SEC submission or report date as site modification time`);
  }
  assert.ok(first.some((r: { url: string; lastModified?: string }) => r.url.includes('/learn/') && r.lastModified), 'retain recorded editorial/report timestamps');
  filedAt = '2026-10-29';
  assert.deepEqual(await sitemap(), first, 'a filing correction alone cannot assign a page modification timestamp');
  console.log('sitemap-time.check OK');
}
main().catch((e) => { console.error(e); process.exit(1); });
