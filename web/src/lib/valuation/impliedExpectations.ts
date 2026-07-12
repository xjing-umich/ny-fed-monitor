import { dcfTier } from "./ownerEarningsDcf";
import type { ExpectationsAssessment, ExpectationsTier } from "./types";
export { historicalGrowthBaseRate, MIN_BASE_RATE_YEARS } from "./growthBaseRate";

export const IMPLIED_G_MIN = -0.10;   // 反解搜索下限（隐含衰退）
export const IMPLIED_G_MAX = 0.30;    // 反解搜索上限；越界只标记不外插
export const DEMANDING_BUFFER = 0.25; // g* > h·(1+buffer) → 苛刻
const SOLVE_ITERS = 60;               // 二分迭代（2^-60 收敛，远超需要）
const CAP_MAX_YEARS = 40;             // 隐含 CAP 搜索上限

type SolveInput = {
  oe0: number;
  shares: number;
  r: number;
  gTerminal: number;
  price: number;
  /** moat-CAP（Phase 2）：显式投影年数。undefined → dcfTier 默认 PROJECTION_YEARS（向后兼容）。 */
  capYears?: number;
};

/** 反解隐含增长 g*：dcfTier(...).perShare 关于 g 单调递增 → 二分。越界返回边界+标记，不外插。 */
export function solveImpliedGrowth(input: SolveInput): { g: number; bounded: "below" | "above" | null } {
  const { oe0, shares, r, gTerminal, price, capYears } = input;
  const val = (g: number) => dcfTier(oe0, g, r, shares, gTerminal, capYears).perShare;
  if (price <= val(IMPLIED_G_MIN)) return { g: IMPLIED_G_MIN, bounded: "below" };
  if (price >= val(IMPLIED_G_MAX)) return { g: IMPLIED_G_MAX, bounded: "above" };
  let lo = IMPLIED_G_MIN, hi = IMPLIED_G_MAX;
  for (let i = 0; i < SOLVE_ITERS; i++) {
    const mid = (lo + hi) / 2;
    if (val(mid) < price) lo = mid; else hi = mid;
  }
  return { g: (lo + hi) / 2, bounded: null };
}

/** 次级量：固定 g=历史增长，反解「撑住现价所需显式超额回报年数」。粗粒度整数搜索。 */
function solveImpliedCap(input: SolveInput & { historicalGrowth: number }): number | undefined {
  const { oe0, shares, r, gTerminal, price, historicalGrowth } = input;
  if (!(historicalGrowth > 0)) return undefined;
  // dcfTier 的显式期固定 10 年；这里用同款投影但显式期可变的等价现值近似：
  // 逐年以 historicalGrowth 复利 OE，累加折现，达到/超过 price×shares 的年数即隐含 CAP。
  let pv = 0, oe = oe0;
  for (let t = 1; t <= CAP_MAX_YEARS; t++) {
    oe = oe * (1 + historicalGrowth);
    pv += oe / Math.pow(1 + r, t);
    // 加当年为终点的零增长永续尾巴，判断是否已够撑起现价
    const tail = (oe / r) / Math.pow(1 + r, t);
    if (pv + tail >= price * shares) return t;
  }
  return undefined; // >CAP_MAX_YEARS：不给假精度
}

function classify(gStar: number, h: number): ExpectationsTier {
  if (gStar <= h) return "modest";
  if (gStar <= h * (1 + DEMANDING_BUFFER)) return "fair";
  return "demanding";
}

export function deriveExpectations(input: SolveInput & {
  historicalGrowth: number | undefined;
  suppressed: boolean;
}): ExpectationsAssessment {
  const { oe0, price, historicalGrowth, suppressed } = input;
  if (suppressed) return { assessable: false, reason: "reliability_or_robustness_gate" };
  if (!(oe0 > 0)) return { assessable: false, reason: "non_positive_owner_earnings" };
  if (!(price > 0)) return { assessable: false, reason: "no_price" };
  if (historicalGrowth == null || !Number.isFinite(historicalGrowth)) {
    return { assessable: false, reason: "no_historical_base_rate" };
  }
  if (!(historicalGrowth > 0)) {
    return { assessable: false, reason: "non_positive_base_rate" };
  }
  const { g, bounded } = solveImpliedGrowth(input);
  const impliedCapYears = solveImpliedCap({ ...input, historicalGrowth });
  // 越界时 g 被 clamp 到搜索边界(真实隐含增长在界外)——不能拿 clamp 值 classify:
  // - above: 真实隐含 > IMPLIED_G_MAX(>30%/yr), 恒是「苛刻」(否则高历史增长股会被 classify(0.30,h) 误判 fair/modest, 与「高于30%」文字自相矛盾)。
  // - below: 真实隐含 < IMPLIED_G_MIN(≤-10%/yr), 恒是「温和」(现价已很便宜, 市场要求极低)。
  const tier: ExpectationsTier =
    bounded === "above" ? "demanding" : bounded === "below" ? "modest" : classify(g, historicalGrowth);
  return {
    assessable: true,
    impliedGrowth: g,
    ...(bounded ? { impliedGrowthBounded: bounded } : {}),
    historicalGrowth,
    ...(impliedCapYears != null ? { impliedCapYears } : {}),
    tier,
  };
}

