// strikeZone.ts — deterministic price-vs-floor comparison. The price-free EPV
// engine stays untouched; this is the ONLY module where price enters the card.
// No recommendations, no target prices — just margin-of-safety arithmetic and a
// three-tier Graham classification the reader judges for themselves.
import type { LatestPrice } from "@/lib/managers/priceRead";
import type { StrikeZone, StrikeZoneAssessment, ValuationFloor } from "./types";

/** Graham's classic one-third margin of safety. */
export const GRAHAM_MOS = 1 / 3;

/** Price older than this many calendar days is flagged stale (7 calendar days ≈ one trading week plus a weekend). */
export const STALE_PRICE_DAYS = 7;

function finitePositive(n: number | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

function calendarDaysSince(dateISO: string, now: Date): number {
  const then = new Date(`${dateISO.slice(0, 10)}T00:00:00Z`).getTime();
  // Unparseable date → treat as maximally old so it flags stale, never masquerades as fresh.
  if (!Number.isFinite(then)) return Number.MAX_SAFE_INTEGER;
  return Math.floor((now.getTime() - then) / 86_400_000);
}

/**
 * Compare the latest in-store price against the deterministic valuation floor.
 * Returns `undefined` when there is nothing meaningful to compare (no price, or
 * neither an assessable EPV lamp nor an assessable asset floor).
 */
export function deriveStrikeZone(
  floor: ValuationFloor,
  price: LatestPrice | null,
  now: Date = new Date(),
): StrikeZoneAssessment | undefined {
  if (!price || !finitePositive(price.close)) return undefined;

  // Conservative reference = global-min assessable per_share_low; ceiling = global-max per_share_high.
  const lows: number[] = [];
  const highs: number[] = [];
  for (const lamp of [floor.graham_epv, floor.buffett_epv]) {
    if (!lamp.assessable) continue;
    if (finitePositive(lamp.per_share_low)) lows.push(lamp.per_share_low);
    if (finitePositive(lamp.per_share_high)) highs.push(lamp.per_share_high);
  }
  const hasEpv = lows.length > 0 && highs.length > 0;
  const hasAsset = floor.asset_floor.assessable && finitePositive(floor.asset_floor.per_share);

  // Nothing to compare the price against → no assessment.
  if (!hasEpv && !hasAsset) return undefined;

  const base = {
    price: { close: price.close, date: price.date, currency: price.currency, source: price.source },
    stale: calendarDaysSince(price.date, now) > STALE_PRICE_DAYS,
  };

  // Per-share floors are USD (SEC companyfacts). A non-USD price makes the
  // comparison meaningless → suppress the whole block, state the reason.
  if (price.currency !== "USD") {
    return {
      ...base,
      currencyMismatch: true,
      suppressedReason: `Latest price is in ${price.currency}; the per-share floors are USD, so a margin-of-safety comparison would be meaningless.`,
    };
  }

  let epv: StrikeZoneAssessment["epv"];
  if (hasEpv) {
    // Each lamp's per_share_high >= per_share_low, so ceiling (global max high)
    // >= floorConservative (global min low); mosHigh >= mosLow holds.
    const floorConservative = Math.min(...lows);
    const ceiling = Math.max(...highs);
    const mosLow = (floorConservative - price.close) / floorConservative;
    const mosHigh = (ceiling - price.close) / ceiling;
    const zone: StrikeZone = mosLow >= GRAHAM_MOS ? "in_strike_zone" : mosLow >= 0 ? "approaching" : "outside";
    epv = { zone, floorConservative, ceiling, mosLow, mosHigh };
  }

  const assetFloor = hasAsset
    ? { perShare: floor.asset_floor.per_share as number, priceBelow: price.close <= (floor.asset_floor.per_share as number) }
    : undefined;

  return { ...base, currencyMismatch: false, epv, assetFloor };
}
