import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import ReportArticle from './ReportArticle';
import { buildQuarterlyReport } from '@/lib/reports/build';
import type { ReportInput, ReportRow } from '@/lib/reports/types';

const holding = { cusip: 'A', issuer: 'APPLE INC', shares: 10, value: 100, weight: 1, putCall: null };
const input: ReportInput = {
  period: '2026-09-30',
  managers: [{ slug: 'a', person: 'Investor A', personZh: null, current: [holding], prior: [holding], priorPeriod: '2026-03-31' }],
  cusipMap: new Map([['A', { ticker: 'AAPL', name: 'Apple' }]]), bargains: new Map(), featuredSlugs: ['a'], excludedCount: 0, valuationAvailable: false,
};
const row = { status: 'final', payload: buildQuarterlyReport(input), coverageFiled: 1, coverageTotal: 1, finalizedAt: '2026-11-18', valuationAsOf: null } as ReportRow;
const render = (row: ReportRow, lang: 'en' | 'zh') => renderToStaticMarkup(<ReportArticle row={row} lang={lang} />);
const unchanged = render(row, 'en');
assert.match(unchanged, /non-option holding quantities were unchanged/, 'unchanged holdings render a comparison result, not a missing-input diagnosis');
assert.doesNotMatch(unchanged, /last quarter|versus the prior quarter|also filed the prior one/, 'a skipped comparison quarter must not be presented as a calendar-quarter delta');
const missing = render({ ...row, payload: buildQuarterlyReport({ ...input, managers: [{ ...input.managers[0], prior: null }] }) }, 'en');
assert.match(missing, /No earlier filing is available/, 'a missing comparison input renders its own unavailable state');
assert.doesNotMatch(missing, /holding quantities were unchanged/);
const legacyPayload = JSON.parse(readFileSync(new URL('../../lib/reports/fixtures/v1-final.json', import.meta.url), 'utf8'));
legacyPayload.featured = [{ slug: 'a', person: 'Investor A', personZh: null, filed: true, moves: [] }];
assert.doesNotMatch(render({ ...row, payload: legacyPayload }, 'en'), /No earlier filing is available/, 'legacy payloads with no reason cannot invent one');
assert.match(render(row, 'zh'), /非期权持仓数量未变/);
console.log('ReportArticle.check OK');
