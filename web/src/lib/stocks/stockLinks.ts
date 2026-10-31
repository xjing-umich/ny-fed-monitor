import type { Lang } from '@/lib/nav';
import { stockPath } from '@/lib/urls';
import { countsAsCurrentHolder } from '@/lib/freshness/derive';

export type LinkHolder = { ticker: string; kind: string | null; period: string | null };

/** Same eligibility as the detail route: an actual, non-exited current holder. */
export function currentStockKeys(rows: readonly LinkHolder[], now: Date): Set<string> {
  return new Set(rows.filter((r) => r.ticker && r.kind !== 'exited' && countsAsCurrentHolder(r.period, now)).map((r) => r.ticker));
}

export function availableStockHref(lang: Lang, key: string, available: ReadonlySet<string>): string {
  return available.has(key) ? stockPath(lang, key) : '';
}
