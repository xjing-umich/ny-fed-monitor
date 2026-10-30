import assert from 'node:assert/strict';
import { currentStockKeys, availableStockHref } from './stockLinks';
const now = new Date('2026-10-30T00:00:00Z');
const keys = currentStockKeys([
 { ticker: 'AAPL', kind: null, period: '2026-06-30' },
 { ticker: 'BB', kind: 'exited', period: '2026-06-30' },
 { ticker: 'OLD', kind: null, period: '2025-09-30' },
 { ticker: 'MAVF', kind: 'new', period: '2026-09-30' },
 { ticker: '008073AA6', kind: null, period: '2026-06-30' },
 { ticker: 'UNKNOWN', kind: null, period: null },
], now);
assert.deepEqual([...keys], ['AAPL', 'MAVF', '008073AA6']);
assert.equal(availableStockHref('en', 'BB', keys), '');
assert.equal(availableStockHref('zh', 'AAPL', keys), '/zh/stocks/AAPL');
assert.equal(availableStockHref('en', '008073AA6', keys), '/stocks/008073AA6');
assert.equal(availableStockHref('en', 'OLD', keys), '');
console.log('stockLinks.check OK');
