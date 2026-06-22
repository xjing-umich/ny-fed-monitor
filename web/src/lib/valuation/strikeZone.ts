// strikeZone.ts — deterministic price-vs-floor comparison. The price-free EPV
// engine stays untouched; this is the ONLY module where price enters the card.
// No recommendations, no target prices — just margin-of-safety arithmetic and a
// three-tier Graham classification the reader judges for themselves.
import type { LatestPrice } from "@/lib/managers/priceRead";
import type { StrikeZone, StrikeZoneAssessment, ValuationFloor, ValuePosition } from "./types";

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
  // Require BOTH ends positive for a lamp to contribute: a lamp whose low straddles
  // zero (e.g. a high-leverage Graham equity bridge → negative low, positive high) is
  // degenerate for margin-of-safety AND the card won't draw its band, so it must not
  // supply the ceiling either — otherwise the number (ceiling) and the visual (no band)
  // would contradict each other.
  const lows: number[] = [];
  const highs: number[] = [];
  for (const lamp of [floor.graham_epv, floor.buffett_epv]) {
    if (!lamp.assessable) continue;
    if (finitePositive(lamp.per_share_low) && finitePositive(lamp.per_share_high)) {
      lows.push(lamp.per_share_low);
      highs.push(lamp.per_share_high);
    }
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
    // v1 fields (UNCHANGED): each lamp's high >= low, so ceiling (max high) >= floorConservative (min low).
    const floorConservative = Math.min(...lows); // EPV_low
    const ceiling = Math.max(...highs);          // EPV_high (zero-growth top)
    const mosLow = (floorConservative - price.close) / floorConservative;
    const mosHigh = (ceiling - price.close) / ceiling;
    const zone: StrikeZone = mosLow >= GRAHAM_MOS ? "in_strike_zone" : mosLow >= 0 ? "approaching" : "outside";

    // v2 value band (spec §1): fold reproduction value (AV) into floor/base, layer GV ceilings.
    const avPs = hasAsset ? (floor.asset_floor.per_share as number) : undefined;
    const valueFloor = avPs != null ? Math.max(avPs, floorConservative) : floorConservative;
    const base = avPs != null ? Math.max(avPs, ceiling) : ceiling;

    const gv = floor.growth_value;
    const ps = gv.per_share;
    const gvUsable =
      gv.assessable &&
      !gv.gated_to_zero &&
      [ps.pessimistic, ps.neutral, ps.optimistic].every((n) => Number.isFinite(n) && n >= 0);
    const growthCollapsed = !gvUsable;
    const ceilings = gvUsable
      ? { pessimistic: base + ps.pessimistic, neutral: base + ps.neutral, optimistic: base + ps.optimistic }
      : undefined;

    // 5/6-tier position. strikeMax = valueFloor × (1 − 1/3); GRAHAM_MOS reused.
    const strikeMax = valueFloor * (1 - GRAHAM_MOS);
    let position: ValuePosition;
    if (price.close <= strikeMax) position = "in_strike_zone";
    else if (price.close <= valueFloor) position = "approaching";
    else if (price.close <= base) position = "zero_growth_zone";
    else if (!ceilings) position = "above_zero_growth";
    else if (price.close <= ceilings.neutral) position = "moat_band";
    else if (price.close <= ceilings.optimistic) position = "upper_band";
    else position = "above_optimistic";

    epv = { zone, floorConservative, ceiling, mosLow, mosHigh, valueFloor, base, ceilings, position, growthCollapsed };
  }

  const assetFloor = hasAsset
    ? { perShare: floor.asset_floor.per_share as number, priceBelow: price.close <= (floor.asset_floor.per_share as number) }
    : undefined;

  return { ...base, currencyMismatch: false, epv, assetFloor };
}
