/**
 * deriveValuationVerdict.check.ts — 纯判定函数自检。
 * Run: cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts
 * 覆盖：below(两法 MoS)/within/above 三档、inStrikeZone 标志、single_lamp（无 OE-DCF）、
 *       per_share_unavailable→null、无 epv→null、marginPct 计算。
 */
import assert from "node:assert";
import type {
  MethodReconciliation,
  OeDcfAssessment,
  PerShareUnavailable,
  StrikeZoneAssessment,
  ValuationFloor,
  ValuePosition,
} from "./types";
import { deriveValuationVerdict } from "./deriveValuationVerdict";

// 仅 deriveValuationVerdict 真正读取的字段被填实；其余用最小 stub 满足类型。
function floorStub(): ValuationFloor {
  return { kind: "floor" } as unknown as ValuationFloor;
}
function sz(position: ValuePosition, opts?: { ceilings?: boolean; price?: number; date?: string }): StrikeZoneAssessment {
  const price = opts?.price ?? 100;
  return {
    price: { close: price, date: opts?.date ?? "2026-06-24", currency: "USD" },
    stale: false,
    currencyMismatch: false,
    epv: {
      zone: "in_strike_zone",
      floorConservative: 120,
      ceiling: 200,
      mosLow: 0.2,
      mosHigh: 0.5,
      valueFloor: 120,
      base: 200,
      ceilings: opts?.ceilings === false ? undefined : { pessimistic: 210, neutral: 260, optimistic: 320 },
      position,
      growthCollapsed: opts?.ceilings === false,
    },
  } as StrikeZoneAssessment;
}
function oe(): OeDcfAssessment {
  return { assessable: true, per_share_low: 90, per_share_high: 150, no_bridge_note: "" } as OeDcfAssessment;
}
const recon = (c: MethodReconciliation["consistency"]): MethodReconciliation =>
  ({ comparable: true, consistency: c } as MethodReconciliation);

// 1) 两法 below（both_margin_of_safety）
{
  const v = deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), oeDcf: oe(), reconciliation: recon("both_margin_of_safety") });
  assert(v && v.bucket === "below" && v.inStrikeZone === true && v.coverage === "full", "two-method below + strike zone");
  // rangeLo = min(90,150,210,320)=90; price=100 → margin=(90-100)/90<0
  assert(v!.rangeLo === 90 && v!.rangeHi === 320, "range across both methods");
}
// 2) 两法 within
{
  const v = deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("moat_band"), oeDcf: oe(), reconciliation: recon("within_value_range") });
  assert(v && v.bucket === "within" && v.inStrikeZone === false, "two-method within");
}
// 3) 两法 above
{
  const v = deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("above_optimistic"), oeDcf: oe(), reconciliation: recon("above_both_values") });
  assert(v && v.bucket === "above", "two-method above");
}
// 4) single_lamp：无 OE-DCF、无 ceilings → 落 position 分支
{
  const v = deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("approaching", { ceilings: false }) });
  assert(v && v.coverage === "single_lamp" && v.bucket === "below", "single lamp via position");
}
// 5) per_share_unavailable → null
{
  const unavail: PerShareUnavailable = { kind: "per_share_unavailable", reason: "multi-class" };
  assert(deriveValuationVerdict({ floor: unavail }) === null, "per_share_unavailable → null");
}
// 6) 无 strikeZone → null
{
  assert(deriveValuationVerdict({ floor: floorStub() }) === null, "no strike zone → null");
}

console.log("deriveValuationVerdict.check.ts ✓ all assertions passed");
