// deriveValuationMethods.check.ts
import assert from "node:assert/strict";
import { deriveValuationMethods } from "./deriveValuationMethods";
import type { OeDcfAssessment, StrikeZoneAssessment, ValuationFloor } from "./types";

const epvBase = {
  zone: "outside" as const,
  floorConservative: 10,
  ceiling: 20,
  mosLow: -1,
  mosHigh: -0.5,
  valueFloor: 10,
  base: 20,
  position: "above_zero_growth" as const,
  growthCollapsed: true,
};

const sz = (over: Partial<StrikeZoneAssessment["epv"]> = {}): StrikeZoneAssessment => ({
  price: { close: 50, date: "2026-07-01", currency: "USD", source: "yahoo" },
  stale: false,
  currencyMismatch: false,
  epv: { ...epvBase, ...over },
});

const oe = (assessable: boolean, lo = 15, hi = 40): OeDcfAssessment =>
  assessable
    ? {
        assessable: true,
        per_share_low: lo,
        per_share_high: hi,
        tiers: {
          pessimistic: { growth_stage1: 0, discount_rate: 0.12, equity_value: 1, per_share: lo },
          neutral: { growth_stage1: 0.1, discount_rate: 0.1, equity_value: 2, per_share: (lo + hi) / 2 },
          optimistic: { growth_stage1: 0.1, discount_rate: 0.09, equity_value: 3, per_share: hi },
        },
        no_bridge_note: "",
      }
    : { assessable: false, no_bridge_note: "" };

const floor = { kind: "floor" } as ValuationFloor;

{
  const m = deriveValuationMethods({ floor, strikeZone: sz(), oeDcf: oe(true) });
  assert.equal(m.zeroGrowthEpv, true);
  assert.equal(m.oeDcf, true);
  assert.equal(m.greenwaldGrowthCeilings, false);
}
{
  const m = deriveValuationMethods({
    floor,
    strikeZone: sz({
      ceilings: { pessimistic: 25, neutral: 30, optimistic: 35 },
      growthCollapsed: false,
    }),
    oeDcf: oe(true),
  });
  assert.equal(m.greenwaldGrowthCeilings, true);
}
{
  // assessable 但 low 非正 → oeDcf false（与 verdict oeOk 同口径）
  const m = deriveValuationMethods({ floor, strikeZone: sz(), oeDcf: oe(true, 0, 40) });
  assert.equal(m.oeDcf, false);
}
{
  const m = deriveValuationMethods({ floor, strikeZone: undefined, oeDcf: oe(true) });
  assert.equal(m.zeroGrowthEpv, false);
  assert.equal(m.oeDcf, true);
}
console.log("deriveValuationMethods.check.ts OK");
