import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { SourceFooter } from './SourceFooter';
import { snapshotLabel } from '@/lib/datasetTime';
for (const lang of ['en','zh'] as const) {
 for (const periods of [['2026-09-30'], ['2026-06-30','2026-09-30'], ['2026-06-30',null]]) {
  const label = snapshotLabel(lang, periods);
  const html = renderToStaticMarkup(<SourceFooter lang={lang} sources={[{ name: 'SEC 13F', asOf: '', periodLabel: label, href: '#filing-sources' }]} />);
  assert.ok(html.includes(label));
  assert.ok(html.includes('href="#filing-sources"') && !html.includes('target="_blank"'));
  if (periods.length === 1) assert.ok(!html.includes('Q2'));
 }
}
console.log('SourceFooter.check OK (single, mixed, unknown; same-page provenance)');
