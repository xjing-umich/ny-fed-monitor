import assert from 'node:assert/strict';
import { snapshotTime, filingSourceLd, snapshotLabel } from './datasetTime';
import { datasetLd } from './seo';
import { effectiveMovesPeriod } from './freshness/derive';

const q2 = '2026-06-30', q3 = '2026-09-30';
for (const lang of ['en', 'zh'] as const) {
  const single = snapshotTime(lang, [q2, q2], q2);
  assert.equal(single.temporalCoverage, q2, '13F is a quarter-end observation, not a whole quarter of observations');
  const mixed = snapshotTime(lang, [q3, q2, q2], q2);
  assert.equal(mixed.temporalCoverage, `${q2}/${q3}`);
  assert.ok(mixed.note.includes(q2) && mixed.note.includes(q3));
  assert.match(mixed.note, lang === 'en' ? /discrete|Discrete/ : /离散/);
  assert.match(mixed.note, lang === 'en' ? /comparison.*2026-06-30/i : /比较.*2026-06-30/);
  assert.equal(snapshotTime(lang, [q2, q3], q3).temporalCoverage, mixed.temporalCoverage, 'comparison rollover cannot relabel source snapshots');
  const gaps = snapshotTime(lang, ['2025-12-31', q3], q2);
  assert.equal(gaps.temporalCoverage, `2025-12-31/${q3}`);
  assert.ok(!gaps.note.includes(q2 + ', '), 'do not invent intermediate observations');
  for (const bad of [null, undefined, '', '2026-02-30', '2026-06-29', '2026Q3']) {
    const partial = snapshotTime(lang, [q2, bad], q2);
    assert.equal(partial.temporalCoverage, undefined, 'unknown row means overall extent is unknown');
    assert.ok(partial.note.includes(q2));
    assert.match(partial.note, lang === 'en' ? /1.*unknown/i : /1.*未知/);
  }
  assert.equal(snapshotTime(lang, [], null).temporalCoverage, undefined);
  assert.equal(snapshotTime(lang, [null], null).temporalCoverage, undefined);
}
const actualPeriods = [q2, q3, q3];
const before = effectiveMovesPeriod(actualPeriods, new Date('2026-10-30T00:00:00Z')).period;
const after = effectiveMovesPeriod(actualPeriods, new Date('2026-11-17T00:00:00Z')).period;
assert.equal(before, q2);
assert.equal(after, q3);
assert.equal(snapshotTime('en', actualPeriods, before).temporalCoverage, snapshotTime('en', actualPeriods, after).temporalCoverage);
assert.ok(snapshotTime('en', actualPeriods, after).note.endsWith(`${q3}.`));
const source = { url: 'https://www.sec.gov/Archives/edgar/data/1/a/', name: 'Manager 13F', period: q2, filedAt: '2026-08-14' };
assert.equal(filingSourceLd(source).datePublished, source.filedAt);
assert.equal(filingSourceLd(source).temporalCoverage, q2);
assert.ok(!('dateModified' in filingSourceLd(source)));
assert.ok(!('datePublished' in filingSourceLd({ ...source, filedAt: null })));
assert.ok(!('datePublished' in filingSourceLd({ ...source, filedAt: '2026-02-30' })));
const build = (filedAt: string) => datasetLd({ lang: 'en', name: 'Holders', description: 'Actual holders table.', path: '/stocks/TEST', variableMeasured: ['Shares'], snapshotPeriods: [q2, q3], comparisonPeriod: q2, sources: [{ ...source, filedAt }] });
const original = build(source.filedAt);
const amended = build('2026-10-29');
assert.equal(amended.temporalCoverage, original.temporalCoverage, 'old-quarter correction does not move the snapshot period');
assert.ok(!('dateModified' in original) && !('dateModified' in amended), 'filing date is not site modification date');
assert.notDeepEqual(amended.isBasedOn, original.isBasedOn, 'amendment submission date stays in provenance');
assert.deepEqual(build(source.filedAt), original, 'unchanged rerun produces unchanged metadata');
assert.ok(original.description.includes(q2) && original.description.includes(q3));
console.log('datasetTime.check OK');

// Search answers must describe actual observations, including equal mixtures.
for (const lang of ['en', 'zh'] as const) {
 const label = snapshotLabel(lang, [q3]);
 assert.ok(label.includes(lang === 'en' ? 'Q3 2026' : '2026Q3'));
 assert.ok(!label.includes('Q2') && !label.includes('多数') && !label.includes('most'));
 for (const periods of [[q2,q3], [q2,q3,q3], [q2,q2,q3]]) {
  const mixed = snapshotLabel(lang, periods);
  assert.ok(mixed.includes(lang === 'en' ? 'Q2 2026' : '2026Q2'));
  assert.ok(mixed.includes(lang === 'en' ? 'Q3 2026' : '2026Q3'));
  assert.ok(!/most|多数/.test(mixed));
 }
 assert.match(snapshotLabel(lang, [q2, null]), lang === 'en' ? /unknown/ : /未知/);
 assert.match(snapshotLabel(lang, []), lang === 'en' ? /unknown/ : /未知/);
}
