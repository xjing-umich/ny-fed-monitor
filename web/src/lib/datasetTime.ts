import type { Lang } from './nav';

/** These are observation dates, never publication or site modification dates. */
function calendarDate(value: string | null | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

function quarterEnd(value: string | null | undefined): string | undefined {
  return value && /-(03-31|06-30|09-30|12-31)$/.test(value) ? calendarDate(value) : undefined;
}

/** Describe the actual table rows. The interval bounds discrete observations;
 * the note lists every observed date, so gaps are never claimed as observations.
 * An unknown row makes the overall extent unknown, even if other dates exist. */
export function snapshotTime(lang: Lang, periods: readonly (string | null | undefined)[], comparisonPeriod?: string | null) {
  const valid = periods.map(quarterEnd);
  const dates = [...new Set(valid.filter((d): d is string => !!d))].sort();
  const unknown = valid.filter((d) => !d).length;
  const temporalCoverage = dates.length && !unknown
    ? dates.length === 1 ? dates[0] : `${dates[0]}/${dates.at(-1)}`
    : undefined;
  const comparison = quarterEnd(comparisonPeriod);
  const note = lang === 'zh'
    ? [
        dates.length ? `离散季末快照：${dates.join('、')}；日期之间不代表连续观测。` : '没有可确认的季末快照日期。',
        unknown ? `${unknown} 行的报告期未知，整体时间范围未标注。` : '',
        comparison ? `季度变动的比较基准：${comparison}。` : '',
      ].filter(Boolean).join('')
    : [
        dates.length ? `Discrete quarter-end snapshots: ${dates.join(', ')}; dates between snapshots are not observations.` : 'No confirmed quarter-end snapshot dates.',
        unknown ? `${unknown} row(s) have unknown report periods; overall temporal coverage is omitted.` : '',
        comparison ? `Quarterly-change comparison baseline: ${comparison}.` : '',
      ].filter(Boolean).join(' ');
  return { temporalCoverage, note };
}

export type FilingSource = {
  url: string;
  name: string;
  period?: string | null;
  filedAt?: string | null;
};

/** datePublished belongs to the source filing, not the derived Dataset.
 * A manager's EDGAR filing list may be used when the snapshot lacks accession. */
export function filingSourceLd(source: FilingSource) {
  const period = quarterEnd(source.period);
  const filedAt = calendarDate(source.filedAt);
  return {
    '@type': 'CreativeWork',
    name: source.name,
    url: source.url,
    ...(period ? { temporalCoverage: period } : {}),
    ...(filedAt ? { datePublished: filedAt } : {}),
  };
}
