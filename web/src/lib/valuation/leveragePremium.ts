// leveragePremium.ts — 杠杆 → 股权成本溢价(纯函数,零 I/O)。
//
// 只服务**股权成本口径**(Buffett 灯 + OE-DCF)。Graham 灯是无杠杆 NOPAT/WACC 口径,
// 杠杆已由股权桥(+cash − totalDebt)承担,再加溢价 = 与桥重复惩罚 —— 见 spec D4。
//
// 理论依据 MM Prop II(re = ru + (ru − rd)(D/E),股权成本随杠杆上升);兑现
// epvFloor.ts 中 Buffett 灯 simplification 自挂多时的 "theoretically the cost of
// equity is higher; v2 simplification, v3 to refine"。
//
// 实现**不用 D/E**:equity 会被回购买成负数(MCD/AZO/HD 类),旧的 netDebt/equity
// 在 equity ≤ 0 时返回 undefined → 账面最杠杆的名字整个逃逸出杠杆闸。改用
// netDebt/ownerEarnings(「这门生意的盈利,几年能还清净债务」),免疫回购扭曲。

export type LeveragePremiumReading = {
  /** 加到股权成本上的溢价(小数,如 0.02 = +2%)。恒 ≥ 0 且 ≤ LEVERAGE_PREMIUM_CAP。 */
  premium: number;
  /** L = netDebt / ownerEarnings(偿债久期,年)。净现金 → 0;不可得 → undefined。 */
  leverage: number | undefined;
  /** 披露文案(个股页展示为什么这只票被多收)。 */
  basis: string;
};

/** 溢价起点:净债务 ≤ L0 年 owner earnings → 不加价(投资级近似)。⚠️ 临时值,待 Task 8 真数据校准。 */
export const LEVERAGE_L0 = 3;
/** L0 之上每多 1 年偿债久期,加多少股权成本。⚠️ 临时值,待 Task 8 真数据校准。 */
export const LEVERAGE_SLOPE = 0.005;
/** 溢价上限:防止把价值压到 ~0 造出假「太贵」信号。⚠️ 临时值,待 Task 8 真数据校准。 */
export const LEVERAGE_PREMIUM_CAP = 0.04;

export function leveragePremium(input: {
  netDebt: number | undefined;
  ownerEarnings: number | undefined;
}): LeveragePremiumReading {
  const { netDebt, ownerEarnings } = input;

  // 数据缺失 → 不加价,退化成基线带(spec §4.2)。
  // 「查不到就当它危险」是另一种造假,不做。
  if (
    netDebt == null || !Number.isFinite(netDebt) ||
    ownerEarnings == null || !Number.isFinite(ownerEarnings) || !(ownerEarnings > 0)
  ) {
    return { premium: 0, leverage: undefined, basis: "净债务或所有者盈利不可得 → 不加杠杆溢价,沿用基线带。" };
  }

  if (netDebt <= 0) {
    return { premium: 0, leverage: 0, basis: "净现金状态 → 不加杠杆溢价。" };
  }

  const leverage = netDebt / ownerEarnings;
  const premium = Math.min(LEVERAGE_PREMIUM_CAP, Math.max(0, (leverage - LEVERAGE_L0) * LEVERAGE_SLOPE));
  const basis =
    premium > 0
      ? `净债务约为 ${leverage.toFixed(1)} 年所有者盈利,股权成本加 ${(premium * 100).toFixed(1)} 个百分点风险溢价。`
      : `净债务约为 ${leverage.toFixed(1)} 年所有者盈利,在不加价区间内(≤ ${LEVERAGE_L0} 年)。`;
  return { premium, leverage, basis };
}
