/**
 * Shared calendar-day threshold for "too old to feed valuation as spot price".
 * Used by priceRead (LatestPrice.stale), strikeZone (assessment.stale), and
 * valuation-ingest (skip). Keep ONE number — 8–10 day disagreement caused
 * stock-page MoS vs screener/investor suppress fights.
 */
export const PRICE_MAX_AGE_DAYS = 10;

/** 纯判定: date 相对 today 是否超过 maxDays 天(陈旧)。 */
export function isPriceStale(date: string, today: Date, maxDays = PRICE_MAX_AGE_DAYS): boolean {
  const d = new Date(date + "T00:00:00Z").getTime();
  // Unparseable → treat as stale (never masquerade as fresh).
  if (!Number.isFinite(d)) return true;
  return (today.getTime() - d) / 86_400_000 > maxDays;
}
