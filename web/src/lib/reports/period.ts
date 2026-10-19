// 报告季度与 slug。slug 沿用 Q1 手写报告的形态:q{N}-{YYYY}-superinvestor-consensus。

const QUARTER_ENDS: Array<[number, number]> = [
  [3, 31],
  [6, 30],
  [9, 30],
  [12, 31],
];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** 最近一个季末 ≤ today(UTC)的季度。 */
export function reportPeriodFor(today: Date): string {
  const t = iso(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
  for (const y of [today.getUTCFullYear(), today.getUTCFullYear() - 1]) {
    for (const [m, d] of [...QUARTER_ENDS].reverse()) {
      const qe = iso(y, m, d);
      if (qe <= t) return qe;
    }
  }
  return iso(today.getUTCFullYear() - 1, 12, 31);
}

export function priorQuarter(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const idx = QUARTER_ENDS.findIndex(([qm]) => qm === m);
  if (idx <= 0) return iso(y - 1, 12, 31);
  const [pm, pd] = QUARTER_ENDS[idx - 1];
  return iso(y, pm, pd);
}

export function reportSlug(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const q = Math.floor((m - 1) / 3) + 1;
  return `q${q}-${y}-superinvestor-consensus`;
}

const SLUG_RE = /^q([1-4])-(\d{4})-superinvestor-consensus$/;

export function parseReportSlug(slug: string): string | null {
  const m = SLUG_RE.exec(slug);
  if (!m) return null;
  const [qm, qd] = QUARTER_ENDS[Number(m[1]) - 1];
  return iso(Number(m[2]), qm, qd);
}
