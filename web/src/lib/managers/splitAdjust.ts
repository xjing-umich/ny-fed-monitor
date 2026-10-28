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
