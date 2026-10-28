// splitAdjust.ts — 13F 股数的拆股口径统一(纯函数,无 I/O)。
// 两季之间拆股,13F 原始股数会按比例跳变(10 拆 1 → 股数 ×10),直接相减会把"没动"记成"加仓 +900%",
// 甚至把真实减仓记成加仓(2026-10 生产库最新季 24 条,11 条方向相反)。这里只做派生:不改 holdings 原始数据。

/** 拆股事件。ratio 同 stock_splits.ratio:10 拆 1 → 10,1:10 并股 → 0.1。date = YYYY-MM-DD。 */
export type SplitEvent = { ticker: string; date: string; ratio: number };

// Yahoo 把分拆上市/股票股息也记成小数"拆股"(CMCSA 1.067、FDX 1.241、DD 2.39),那是价格复权,股数不变。
// 真拆股 = 比例是小分母有理数(3:2、2:1、4:3、1:10…)且偏离 1 足够大。
const PSEUDO_LOW = 0.8;
const PSEUDO_HIGH = 1.25;
const RATIONAL_TOL = 1e-3; // 库里 numeric 可能是 0.333333 这类截断值

export function isRealSplit(ratio: number): boolean {
  if (!Number.isFinite(ratio) || ratio <= 0) return false;
  if (ratio > PSEUDO_LOW && ratio < PSEUDO_HIGH) return false;
  const nearInt = (x: number) => Math.abs(x - Math.round(x)) < RATIONAL_TOL;
  return [1, 2, 3, 4].some((den) => nearInt(ratio * den) || nearInt(den / ratio));
}

const DEDUPE_DAYS = 30;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;

/** 同 ticker、同比例、30 天内的重复事件只留最早一条(Yahoo 偶有同一拆股记两天,如 WLFC 7/20 与 7/21)。 */
export function dedupeSplitEvents(events: SplitEvent[]): SplitEvent[] {
  const sorted = [...events].sort((a, b) => a.ticker.localeCompare(b.ticker) || a.date.localeCompare(b.date));
  const out: SplitEvent[] = [];
  for (const e of sorted) {
    const dup = out.some((k) => k.ticker === e.ticker && Math.abs(k.ratio - e.ratio) < 1e-9 && daysApart(k.date, e.date) <= DEDUPE_DAYS);
    if (!dup) out.push(e);
  }
  return out;
}

/** 两季都持有该 CUSIP 的一位经理(正股,按 CUSIP 汇总)。 */
export type PairHolder = { prevShares: number; shares: number };
export type SplitEvidence = { q: number; r: number; events: { date: string; ratio: number }[]; matching: number; bothHolders: number };
export type SplitFactor = {
  cusip: string;
  ticker: string | null;
  fromPeriod: string;
  toPeriod: string;
  /** 上季股数 × factor = 本季口径。 */
  factor: number;
  source: "table" | "inferred";
  evidence: SplitEvidence;
};

// 调整后季末单价比的合理区间:一个季度股价涨跌超出 0.6–1.67 倍时,不靠拆股解释。
export const PLAUSIBLE_MIN = 0.6;
export const PLAUSIBLE_MAX = 1.67;
// 表外推断:持有人股数比与 r 相差 ±1% 以内才算"按同一比例变化"。
export const MATCH_TOL = 0.01;
export const INFER_RATIOS = [1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 40, 50];

/**
 * 单个 CUSIP、单个季度对(上季 → 本季)的拆股系数;不需要调整 → null(= 系数 1)。
 * - 有表事件(真拆股、去重、日期在 (上季末, 本季末]):价格证据成立即采用,一位持有人也行。
 * - 否则表外推断:价格证据成立,且 ≥2 位、超过半数的两季持有者股数按同一比例变化。
 * 价格证据 = 调整后单价比 q·r 落在合理区间,且比不调整更平滑。股价腰斩不会让多数人股数同步翻倍;
 * 单个经理恰好加仓一倍不会让单价减半 —— 两条证据一起用,单靠任一条都会误判。
 */
export function deriveSplitFactor(input: {
  cusip: string;
  ticker: string | null;
  fromPeriod: string;
  toPeriod: string;
  priceRatio: number;
  both: PairHolder[];
  events: SplitEvent[];
}): SplitFactor | null {
  const { cusip, ticker, fromPeriod, toPeriod, priceRatio: q, both, events } = input;
  if (!Number.isFinite(q) || q <= 0) return null;
  const plausible = (r: number) => {
    const x = q * r;
    return x >= PLAUSIBLE_MIN && x <= PLAUSIBLE_MAX && Math.abs(Math.log(x)) < Math.abs(Math.log(q));
  };
  const ratios = both.filter((h) => h.prevShares > 0 && h.shares > 0).map((h) => h.shares / h.prevShares);
  const matching = (r: number) => ratios.filter((x) => Math.abs(x / r - 1) <= MATCH_TOL).length;
  const base = { cusip, ticker, fromPeriod, toPeriod };

  const inWindow = dedupeSplitEvents(events).filter((e) => isRealSplit(e.ratio) && e.date > fromPeriod && e.date <= toPeriod);
  if (inWindow.length) {
    const r = inWindow.reduce((acc, e) => acc * e.ratio, 1);
    if (plausible(r)) {
      return { ...base, factor: r, source: "table", evidence: { q, r, events: inWindow.map(({ date, ratio }) => ({ date, ratio })), matching: matching(r), bothHolders: ratios.length } };
    }
  }

  let best: { r: number; m: number } | null = null;
  for (const b of INFER_RATIOS) {
    for (const r of [b, 1 / b]) {
      const m = matching(r);
      if (m >= 2 && m > ratios.length / 2 && plausible(r) && (!best || m > best.m)) best = { r, m };
    }
  }
  if (!best) return null;
  return { ...base, factor: best.r, source: "inferred", evidence: { q, r: best.r, events: [], matching: best.m, bothHolders: ratios.length } };
}
