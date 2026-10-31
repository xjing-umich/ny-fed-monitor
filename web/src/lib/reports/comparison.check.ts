/** Regression: comparison availability is independent of whether a filing contains moves. */
import assert from 'node:assert/strict';
import { buildQuarterlyReport } from './build';
import type { ReportHolding, ReportInput } from './types';

const holding = (shares: number): ReportHolding => ({ cusip: 'A', issuer: 'APPLE INC', shares, value: shares * 10, weight: 1, putCall: null });
const base: ReportInput = {
  period: '2026-09-30',
  managers: [
    { slug: 'unchanged', person: 'Unchanged', personZh: null, current: [holding(10)], prior: [holding(10)], priorPeriod: '2026-06-30' },
    { slug: 'missing', person: 'Missing', personZh: null, current: [holding(10)], prior: null },
    { slug: 'skipped', person: 'Skipped', personZh: null, current: [holding(20)], prior: [holding(10)], priorPeriod: '2026-03-31' },
  ],
  cusipMap: new Map([['A', { ticker: 'AAPL', name: 'Apple' }]]), bargains: new Map(),
  featuredSlugs: ['unchanged', 'missing', 'skipped'], valuationAvailable: false, excludedCount: 0,
};
const result = buildQuarterlyReport(base);
const [unchanged, missing, skipped] = result.featured;
assert.equal(unchanged.moves.length, 0);
assert.equal(missing.moves.length, 0);
assert.equal(unchanged.comparison?.state, 'unchanged', 'unchanged shares must not be called a missing filing');
assert.equal(missing.comparison?.state, 'missing_prior', 'absent earlier filing must remain explicit');
assert.equal(skipped.comparison?.priorPeriod, '2026-03-31', 'preserve the actual comparison period when a quarter is skipped');
assert.equal(skipped.comparison?.state, 'changed');
assert.equal(skipped.moves[0]?.kind, 'increased', 'retain the existing cross-quarter comparison algorithm');
assert.equal(result.bought.items[0]?.managerCount, 1, 'only the comparable investor with changed shares contributes');
console.log('comparison.check OK');
