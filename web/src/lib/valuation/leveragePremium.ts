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
  /**
   * 引擎层英文披露文案(拼进 epvFloor.ts 的英文 simplifications)。⚠️ 不是 UI 的本地化来源——
   * 这个站是中英双语,单语言字符串不可能同时服务两个 locale。UI 若要本地化披露,
   * 必须从 `premium`/`leverage`(结构化数字)各自拼各语言的句子,不得直接渲染这个字段。
   */
  basis: string;
};

/**
 * 溢价起点:净债务 ≤ L0 年 owner earnings → 不加价(投资级近似)。
 * 真数据校准(Task 8,非金融 L>0 全市场 n=687):L0=3 落在 p25(2.34)与 p50(4.65)之间——
 * 卡在这条线以下的名字,净债务真的 ≤3 年 owner earnings 就能还清,是投资级口径。
 * 34.2% 的名字(235/687)落在这个免费区间。
 * ⚠️ 这里的 L 是 netDebt/ownerEarnings(税后、扣维护 capex),数值比 netDebt/EBITDA
 * 大得多,不要拿 EBITDA 杠杆档位的直觉来"修正"这组常量。
 */
export const LEVERAGE_L0 = 3;
/**
 * L0 之上每多 1 年偿债久期,加多少股权成本。
 * 真数据校准:该斜率把 p50(L≈4.65)映到 ≈+0.8pp(约投资级利差),
 * p75(L≈10.85)映到 ≈+3.9pp(约 BB/B 级利差);41.0%(282/687)的名字落在斜率真正起作用的区间。
 */
export const LEVERAGE_SLOPE = 0.005;
/**
 * 溢价上限:防止把价值压到 ~0 造出假「太贵」信号。
 * 真数据校准:≈ BB→B 级利差上限,L≥11(≈p76)开始封顶,24.7%(170/687)的名字被夹在这里。
 * 主要作用不是"斜率算错了要兜底",是吸收长尾:owner earnings 趋近 0 时 L 会在近零分母上爆炸
 * (如 PCG L≈30M),不封顶会把这类名字直接惩罚成假「太贵」。
 */
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
    return { premium: 0, leverage: undefined, basis: "Net debt or owner earnings is unavailable, so no adjustment is made." };
  }

  if (netDebt <= 0) {
    return { premium: 0, leverage: 0, basis: "Net cash position; no leverage premium applied." };
  }

  const leverage = netDebt / ownerEarnings;
  const premium = Math.min(LEVERAGE_PREMIUM_CAP, Math.max(0, (leverage - LEVERAGE_L0) * LEVERAGE_SLOPE));
  const basis =
    premium > 0
      ? `Net debt is about ${leverage.toFixed(1)} years of owner earnings, adding ${(premium * 100).toFixed(1)}pp of cost-of-equity risk premium.`
      : `Net debt is about ${leverage.toFixed(1)} years of owner earnings, within the no-charge range (≤ ${LEVERAGE_L0} years).`;
  return { premium, leverage, basis };
}
