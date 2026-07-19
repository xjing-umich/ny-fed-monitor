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
import {
  deriveValuationVerdict as deriveValuationVerdictBase,
  assessReliability,
  isImplausibleBand,
  MOS_BASE,
  MOS_MAX,
  S_RELIABLE,
} from "./deriveValuationVerdict";
import { deriveValuationMethods } from "./deriveValuationMethods";

// 仅 deriveValuationVerdict 真正读取的字段被填实；其余用最小 stub 满足类型。
function floorStub(): ValuationFloor {
  return { kind: "floor", net_net: { assessable: false, reason: "stub" } } as unknown as ValuationFloor;
}
// net-net 可评估的 floor stub：per_share=95，供 assetFloor/buy 各档断言复用。
// （数值需落在 sz() 默认价值带内，否则会被 isImplausibleBand 健壮性闸整条抑制为 null。）
function floorStubWithNetNet(): ValuationFloor {
  return { kind: "floor", net_net: { assessable: true, per_share: 95, ncav: 9500 } } as unknown as ValuationFloor;
}
function sz(
  position: ValuePosition,
  opts?: { ceilings?: boolean; price?: number; date?: string; valueFloor?: number },
): StrikeZoneAssessment {
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
      valueFloor: opts?.valueFloor ?? 120,
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
// 含增长中枢 IV 的 oeDcf stub：tiers.neutral.per_share = 中枢 IV。其余字段与 oe() 一致(per_share_low/high
// 供 rangeHi 的两法端点计算)。opts 可覆盖 neutral 中枢与 declined 标志。
function oeWithIv(neutral: number, opts?: { declined?: boolean }): OeDcfAssessment {
  return {
    assessable: true,
    per_share_low: 90,
    per_share_high: 150,
    no_bridge_note: "",
    declined: opts?.declined,
    tiers: {
      pessimistic: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: neutral * 0.8 },
      neutral: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: neutral },
      optimistic: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: neutral * 1.2 },
    },
  } as OeDcfAssessment;
}
const recon = (c: MethodReconciliation["consistency"]): MethodReconciliation =>
  ({ comparable: true, consistency: c } as MethodReconciliation);
function deriveValuationVerdict(input: Omit<Parameters<typeof deriveValuationVerdictBase>[0], "methods">) {
  return deriveValuationVerdictBase({
    ...input,
    methods: deriveValuationMethods({
      floor: input.floor,
      strikeZone: input.strikeZone,
      oeDcf: input.oeDcf,
    }),
  });
}

// 1) 两法 below（both_margin_of_safety）
{
  const floor = floorStub();
  const strikeZone = sz("in_strike_zone", { ceilings: false });
  const oeDcf = oe();
  const methods = deriveValuationMethods({ floor, strikeZone, oeDcf });
  const v = deriveValuationVerdictBase({ floor, strikeZone, oeDcf, reconciliation: recon("both_margin_of_safety"), methods });
  assert(v && v.bucket === "below" && v.inStrikeZone === true && v.coverage === "full", "two-method below + strike zone");
  assert.deepStrictEqual(v!.methods, methods, "verdict preserves the supplied method flags");
  // rangeLo 现 = epv.valueFloor（sz 默认 120，与 margin/strike 同底）；rangeHi = max 两法端点 = 320。
  assert(v!.rangeLo === 120 && v!.rangeHi === 200, "rangeLo=valueFloor, rangeHi=zero-growth top");
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
// 7) 坏数据:价值带远高于现价(>80% 假安全边际)→ null(健壮性闸)
{
  // single_lamp 路径:base=200 → rangeLo=rangeHi=200;price=10 → margin=(200-10)/200=0.95 > 0.8
  const v = deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone", { ceilings: false, price: 10 }) });
  assert(v === null, "implausible band (margin>0.8) → null");
}
// 8) 边界:margin 阈下(single_lamp, valueFloor=120, price=50 → margin=(120-50)/120≈0.5833)→ 仍出判定
{
  const v = deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone", { ceilings: false, price: 50 }) });
  assert(v && v.bucket === "below" && Math.abs(v.marginPct! - (120 - 50) / 120) < 1e-9, "margin ≤ cap (vs valueFloor) → kept");
}
// 8a) 价值带下沿 rangeLo 现锚 epv.valueFloor（与 margin/strike 同底），不再是两法端点最小值。
//     valueFloor=15 ≪ 两法带最小端 90;rangeLo 必须 = 15，与 margin=(15-100)/15 同底（消除展示矛盾）。
{
  const v = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: 15 }),
    oeDcf: oe(),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(v && v.bucket === "below", "below bucket with divergent valueFloor still resolves");
  assert(v!.rangeLo === 15, "rangeLo now anchored to valueFloor (band coherent with margin)");
  assert(v!.rangeHi === 320, "rangeHi unchanged (optimistic top)");
  assert(Math.abs(v!.marginPct! - (15 - 100) / 15) < 1e-9, "marginPct and rangeLo share the valueFloor anchor");
}
// 8b) valueFloor ≤ 0（现实不会发生，仅退化保护）→ rangeLo=0 触发 isImplausibleBand 退化分支 → 整条 null。
{
  const v = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: 0 }),
    oeDcf: oe(),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(v === null, "valueFloor<=0 → 退化带抑制为 null");
}
// 9) 默认无红旗 → reliable = true(且仍出判定)
{
  const v = deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), oeDcf: oe(), reconciliation: recon("both_margin_of_safety") });
  assert(v && v.reliable === true, "no red flags → reliable");
}
// 10) 盈利下滑(declined)→ reliable = false(判定仍在,只是便宜信号不可信)
{
  const oeDeclined = { ...oe(), declined: true } as OeDcfAssessment;
  const v = deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), oeDcf: oeDeclined, reconciliation: recon("both_margin_of_safety") });
  assert(v && v.bucket === "below" && v.reliable === false, "declined → unreliable but still emitted");
}
// 11) 高杠杆 floor + 金融股 → reliable = false（D7:结构性杠杆未被溢价覆盖，保留闸）
{
  const levFloor = {
    kind: "floor",
    high_leverage_warning: true,
    is_financial: true,
    net_net: { assessable: false, reason: "stub" },
  } as unknown as ValuationFloor;
  const v = deriveValuationVerdict({ floor: levFloor, strikeZone: sz("in_strike_zone"), oeDcf: oe(), reconciliation: recon("both_margin_of_safety") });
  assert(v && v.reliable === false, "financial + high leverage → unreliable");
}
// 11b) 高杠杆 floor + 非金融股 → reliable = true（非金融杠杆已由 floor.leverage_premium 计入股权成本，
//      不再一票否决；这是本轮改动里后果最大的一条路径——首次允许高杠杆非金融股被标"便宜"）。
{
  const levFloorNonFin = {
    kind: "floor",
    high_leverage_warning: true,
    is_financial: false,
    net_net: { assessable: false, reason: "stub" },
  } as unknown as ValuationFloor;
  const v = deriveValuationVerdict({ floor: levFloorNonFin, strikeZone: sz("in_strike_zone"), oeDcf: oe(), reconciliation: recon("both_margin_of_safety") });
  assert(v && v.reliable === true, "non-financial + high leverage → reliable (priced via cost-of-equity premium)");
}
// 12) 极端 OE 收益率(>33%, 疑似 per-share/ADR 算错)→ reliable = false
{
  const oeBadYield = { ...oe(), diagnostics: { oe_yield: 0.4 } } as OeDcfAssessment;
  const v = deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), oeDcf: oeBadYield, reconciliation: recon("both_margin_of_safety") });
  assert(v && v.reliable === false, "extreme OE yield → unreliable");
}
// 13) assessReliability 直测:quick_check_flag → false
{
  const oeQuick = { assessable: true, per_share_low: 90, per_share_high: 150, diagnostics: { quick_check_flag: true } } as OeDcfAssessment;
  assert(assessReliability({ floor: floorStub(), oeDcf: oeQuick }) === false, "quick_check_flag → unreliable");
  assert(assessReliability({ floor: floorStub(), oeDcf: oe() }) === true, "clean → reliable");
}
// 13b) AI-hog scheme C: floor.ai_capex_distortion_warning → unreliable (boolean, not note-scraping)
{
  const aiFloor = {
    kind: "floor",
    ai_capex_distortion_warning: true,
    net_net: { assessable: false, reason: "stub" },
  } as unknown as ValuationFloor;
  assert(assessReliability({ floor: aiFloor, oeDcf: oe() }) === false, "ai_capex_distortion_warning → unreliable");
  assert(assessReliability({ floor: floorStub(), oeDcf: oe() }) === true, "no AI warning → reliable");
}

// 13c) Task 7: assessReliability 按 s 解耦 ai_capex 否决
{
  const baseFloor = { kind: "floor", high_leverage_warning: false } as any;
  // ai_capex + s≥0.8(GOOGL 型)→ 否决被推翻 → reliable=true
  assert.strictEqual(
    assessReliability({ floor: { ...baseFloor, ai_capex_distortion_warning: true, structural_confidence: 0.9 } }),
    true, "ai_capex + high s → reliable",
  );
  // ai_capex + s<0.8(NVDA 型 0.5)→ 仍 false
  assert.strictEqual(
    assessReliability({ floor: { ...baseFloor, ai_capex_distortion_warning: true, structural_confidence: 0.5 } }),
    false, "ai_capex + mid s → still unreliable",
  );
  // ai_capex + 无 s → 逐字旧行为 false
  assert.strictEqual(
    assessReliability({ floor: { ...baseFloor, ai_capex_distortion_warning: true } }),
    false, "ai_capex + no s → unreliable (legacy)",
  );
  // 金融股 high_leverage 仍一票否决(即便 s 高)——Task 6 后杠杆闸仅对金融股保留(D7)。
  assert.strictEqual(
    assessReliability({ floor: { ...baseFloor, high_leverage_warning: true, is_financial: true, structural_confidence: 0.95 } }),
    false, "financial high leverage still vetoes regardless of s",
  );
  console.log("Task7 assessReliability s-decouple: OK");
}

// 14) net-net:price(80) 在 (⅔NCAV, NCAV) 之间 → assetFloor=true, buy=false。
{
  const v = deriveValuationVerdict({
    floor: floorStubWithNetNet(),
    strikeZone: sz("in_strike_zone", { price: 80 }),
    oeDcf: oe(),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(v && v.netNet && v.netNet.perShare === 95 && v.netNet.assetFloor === true && v.netNet.buy === false, "price 80 in (⅔NCAV, NCAV) → asset floor, not buy");
}
// 15) net-net:price(110) > 每股 NCAV(95) → 两者 false。
{
  const v = deriveValuationVerdict({
    floor: floorStubWithNetNet(),
    strikeZone: sz("above_optimistic", { price: 110 }),
    oeDcf: oe(),
    reconciliation: recon("above_both_values"),
  });
  assert(v && v.netNet && v.netNet.perShare === 95 && v.netNet.assetFloor === false && v.netNet.buy === false, "price > per_share → neither");
}

// ── 判定改锚:含增长中枢 IV + 浮动 MOS(Task 3) ──────────────────────────────

// Q) 纯价值股:IV≈F(growthReliance≈0)→ MOS=MOS_BASE(1/3);price ≤ IV×2/3 → inStrikeZone。
{
  const F = 120;
  const IV = 120; // IV=F → growthReliance=0
  const v = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: F, price: 79 }), // 79 < 120×2/3=80
    oeDcf: oeWithIv(IV),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(v, "pure-value IV≈F still resolves");
  const expectedMos = MOS_BASE; // growthReliance=0 → mos floors at MOS_BASE
  assert(Math.abs(IV * (1 - expectedMos) - 80) < 1e-9, "sanity: IV×(1-MOS_BASE)=80");
  assert(v!.inStrikeZone === true, "price 79 ≤ IV×2/3=80 → inStrikeZone at MOS_BASE");
  assert(v!.bucket === "below", "price < IV → below");
}
// R) 重增长股:IV=2×F(growthReliance=0.5)→ MOS=MOS_BASE+(MOS_MAX-MOS_BASE)×0.5;price 需更低才 inStrikeZone。
{
  const F = 120;
  const IV = 240; // growthReliance = (240-120)/240 = 0.5
  const expectedMos = MOS_BASE + (MOS_MAX - MOS_BASE) * 0.5; // ≈0.391667
  const threshold = IV * (1 - expectedMos); // ≈146.0
  assert(Math.abs(threshold - 146) < 0.01, "sanity: threshold ≈146 for IV=240,mos≈0.39167");
  // 老 MOS_BASE 口径下阈值会是 IV×2/3=160 —— price=150 在老口径下会被标 inStrikeZone,
  // 但浮动 MOS 下 150 > 146 阈值,不再标。证明重增长股需要更低价才达标。
  const vAbove = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: F, price: 150 }),
    oeDcf: oeWithIv(IV),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(vAbove && vAbove.inStrikeZone === false, "growth-heavy: price 150 > 浮动 MOS 阈值 146 → 不再 inStrikeZone");
  const vBelow = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: F, price: 145 }),
    oeDcf: oeWithIv(IV),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(vBelow && vBelow.inStrikeZone === true, "growth-heavy: price 145 ≤ 146 阈值 → inStrikeZone");
}
// S) bucket:price<IV→below;IV≤price≤rangeHi→within;price>rangeHi→above。IV=200,rangeHi=320(两法端点最大值)。
{
  const IV = 200;
  const vBelow = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: 120, price: 100 }),
    oeDcf: oeWithIv(IV),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(vBelow && vBelow.bucket === "below" && vBelow.rangeHi === 320, "price 100 < IV 200 → below");
  const vWithin = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("moat_band", { valueFloor: 120, price: 250 }),
    oeDcf: oeWithIv(IV),
    reconciliation: recon("within_value_range"),
  });
  assert(vWithin && vWithin.bucket === "within", "IV 200 ≤ price 250 ≤ rangeHi 320 → within");
  const vAbove = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("above_optimistic", { valueFloor: 120, price: 350 }),
    oeDcf: oeWithIv(IV),
    reconciliation: recon("above_both_values"),
  });
  assert(vAbove && vAbove.bucket === "above", "price 350 > rangeHi 320 → above");
}
// T) marginPct = (IV−price)/IV(锚 IV,非 valueFloor)。IV=200,F=120,price=100 → margin=(200-100)/200=0.5,
//    与旧口径(valueFloor-price)/valueFloor=(120-100)/120≈0.1667 明显不同,证明确实换锚。
{
  const v = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: 120, price: 100 }),
    oeDcf: oeWithIv(200),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(v, "marginPct case resolves");
  assert(Math.abs(v!.marginPct! - 0.5) < 1e-9, "marginPct anchored to IV: (200-100)/200=0.5");
  assert(Math.abs(v!.marginPct! - (120 - 100) / 120) > 0.1, "marginPct materially differs from old valueFloor anchor");
}
// U) 单灯兜底:oeDcf 不可评估 / tiers 缺 → 退回 epv.position 锚(今天行为逐位不变)。
{
  // U1) 完全无 oeDcf → 既有 test 4 已覆盖(single_lamp via position),这里补 assessable=true 但 tiers 缺的情形。
  const vNoTiers = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone"),
    oeDcf: oe(), // assessable=true 但无 tiers → hasIv=false
    reconciliation: recon("both_margin_of_safety"),
  });
  // 无 tiers 时应完全走两法 consistency 分支(与 test 1 一致):below + inStrikeZone(position="in_strike_zone")。
  assert(vNoTiers && vNoTiers.bucket === "below" && vNoTiers.inStrikeZone === true, "assessable but no tiers → single-lamp fallback (bucketFromConsistency)");
  // U2) oeDcf.assessable=false 但 tiers 字段意外存在 → 仍必须走单灯兜底(hasIv 判据先看 assessable)。
  const vNotAssessable = {
    assessable: false,
    per_share_low: 90,
    per_share_high: 150,
    no_bridge_note: "",
    tiers: {
      pessimistic: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: 160 },
      neutral: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: 200 },
      optimistic: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: 240 },
    },
  } as OeDcfAssessment;
  const v2 = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { ceilings: false, price: 50 }),
    oeDcf: vNotAssessable,
    reconciliation: recon("both_margin_of_safety"),
  });
  // 与 test 8(同参数,无 oeDcf)完全一致的结果 → 证明 assessable=false 时 tiers 被忽略,不误用为 IV。
  assert(v2 && v2.bucket === "below" && Math.abs(v2.marginPct! - (120 - 50) / 120) < 1e-9, "assessable=false ignores tiers → falls back to valueFloor anchor");
}
// V) reliable=false(如 declined)时,inStrikeZone/bucket 仍按 IV 锚正常计算(不被 reliable 污染或抑制)—— 四闸(assessReliability
//    等)与判定锚是两套独立机制,换锚前后都是下游(如 ValuationBadge)自行 `inStrikeZone && reliable` 组合,函数本身从不因
//    reliable=false 就静默改写 inStrikeZone。断言:declined 下 IV 锚正常给出 inStrikeZone=true,同时 reliable 如实报 false。
{
  const F = 120;
  const IV = 200; // growthReliance=(200-120)/200=0.4 → mos=1/3+(0.45-1/3)*0.4≈0.38
  const v = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: F, price: 100 }), // threshold=200*(1-0.38)=124 → 100 ≤ 124
    oeDcf: oeWithIv(IV, { declined: true }),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(v, "declined + IV anchor still resolves");
  assert(v!.inStrikeZone === true, "IV-anchored inStrikeZone computed independent of reliable");
  assert(v!.reliable === false, "declined → reliable=false preserved (four gates untouched)");
}
// W) 地基回归:isImplausibleBand / netNet / coverage 在换锚前后逐位不变(纯函数本身未改,构造对照证明)。
{
  // W1) isImplausibleBand 本身零改动:直接单元断言,行为与换锚前完全一致。
  assert(isImplausibleBand({ rangeLo: 120, rangeHi: 320, price: 100, marginPct: 0.5 }) === false, "isImplausibleBand: 正常带不抑制");
  assert(isImplausibleBand({ rangeLo: 0, rangeHi: 320, price: 100, marginPct: 0.5 }) === true, "isImplausibleBand: rangeLo<=0 退化带仍抑制");
  assert(isImplausibleBand({ rangeLo: 120, rangeHi: 100, price: 100, marginPct: 0.5 }) === true, "isImplausibleBand: rangeHi<rangeLo 退化带仍抑制");
  assert(isImplausibleBand({ rangeLo: 120, rangeHi: 320, price: 0, marginPct: 0.5 }) === true, "isImplausibleBand: price<=0 退化带仍抑制");
  assert(isImplausibleBand({ rangeLo: 120, rangeHi: 320, price: 100, marginPct: 0.85 }) === true, "isImplausibleBand: marginPct>0.8 仍抑制(健壮性闸未松)");

  // W2) coverage 只看 bothMethods(两法都可评估),与判定锚(IV vs valueFloor)无关 —— IV 路径下 conservative 缺失仍 single_lamp。
  const vFullWithIv = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: 120, price: 100 }),
    oeDcf: oeWithIv(200),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(vFullWithIv && vFullWithIv.coverage === "full", "IV 路径下 bothMethods 仍决定 coverage=full");
  const noConservative = { assessable: true, tiers: { pessimistic: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: 160 }, neutral: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: 200 }, optimistic: { growth_stage1: 0, discount_rate: 0.1, equity_value: 0, per_share: 240 } }, no_bridge_note: "" } as OeDcfAssessment; // 无 per_share_low/high → conservative=null
  const vSingleWithIv = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: 120, price: 100 }),
    oeDcf: noConservative,
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(vSingleWithIv && vSingleWithIv.coverage === "single_lamp" && vSingleWithIv.bucket === "below", "IV 路径下 conservative 缺失仍 single_lamp(coverage 与锚选择解耦)");

  // W3) netNet 完全独立于判定锚(price vs NCAV,与 IV/valueFloor 无关)——IV 路径下结果与既有单灯路径(test 14)一致。
  const vNetNetWithIv = deriveValuationVerdict({
    floor: floorStubWithNetNet(),
    strikeZone: sz("in_strike_zone", { price: 80 }),
    oeDcf: oeWithIv(200),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(
    vNetNetWithIv && vNetNetWithIv.netNet && vNetNetWithIv.netNet.perShare === 95 && vNetNetWithIv.netNet.assetFloor === true && vNetNetWithIv.netNet.buy === false,
    "IV 路径下 netNet 判定与换锚前(test 14)逐位一致",
  );
}

// ── reliability 闸:非金融摘掉杠杆,金融保留(spec Task 6 / D7) ─────────────
{
  const leveredNonFin = { high_leverage_warning: true, is_financial: false } as unknown as ValuationFloor;
  assert.strictEqual(
    assessReliability({ floor: leveredNonFin }), true,
    "非金融高杠杆:不再因杠杆判不可靠(已由折现率溢价定价)",
  );

  const leveredFin = { high_leverage_warning: true, is_financial: true } as unknown as ValuationFloor;
  assert.strictEqual(
    assessReliability({ floor: leveredFin }), false,
    "D7:金融股高杠杆仍判不可靠(结构性杠杆未被定价,不放开)",
  );

  // 其余四项**不得**被这次改动碰到
  assert.strictEqual(
    assessReliability({ floor: { high_leverage_warning: false, is_financial: false } as unknown as ValuationFloor,
                        oeDcf: { declined: true } as never }), false,
    "declined 闸不动",
  );
}

// 拆股口径陈旧 → 整条抑制为 null,即便 floor/strikeZone 完整、位置本可算出。
assert.strictEqual(
  deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), splitCoverageStale: true }),
  null,
  "splitCoverageStale=true → verdict 抑制为 null",
);
// 未传 / false → 行为不变(回归:仍算出非 null 判定)。
assert.ok(
  deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), splitCoverageStale: false }) != null,
  "splitCoverageStale=false → 判定照常算出",
);

// capital_structure_distorted → verdict 抑制为 null(仿 splitCoverageStale,Task 4)。
assert.strictEqual(
  deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), capitalStructureDistorted: true }),
  null,
  "capitalStructureDistorted=true → verdict 抑制为 null",
);
// 未传 / false → 行为不变(回归:仍算出非 null 判定)。
assert.ok(
  deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), capitalStructureDistorted: false }) != null,
  "capitalStructureDistorted=false → 判定照常算出",
);

// 件② 口径护栏:fundamentalsCorrupt=true → 整条抑制为 null。
assert.strictEqual(
  deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), fundamentalsCorrupt: true }),
  null,
  "fundamentalsCorrupt=true → verdict 抑制为 null",
);
// 未传 / false → 行为不变(回归:仍算出非 null 判定)。
assert.ok(
  deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), fundamentalsCorrupt: false }) != null,
  "fundamentalsCorrupt=false → 判定照常算出",
);

console.log("deriveValuationVerdict.check.ts ✓ all assertions passed");
