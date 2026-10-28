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

export type HistoryHolding = { cusip: string; putCall?: string | null; shares: number; value: number };
export type ManagerHistory = { slug: string; filings: { period: string; holdings: HistoryHolding[] }[] };
export type SplitFactorLookup = (cusip: string, fromPeriod: string, toPeriod: string) => number;
export const NO_SPLITS: SplitFactorLookup = () => 1;

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 正股按 CUSIP 汇总(13F 同券可多行/子账户);期权行不计入股数与单价证据。 */
function longByCusip(holdings: HistoryHolding[]): Map<string, { shares: number; value: number }> {
  const out = new Map<string, { shares: number; value: number }>();
  for (const h of holdings) {
    if (h.putCall) continue;
    const e = out.get(h.cusip) ?? { shares: 0, value: 0 };
    e.shares += h.shares;
    e.value += h.value;
    out.set(h.cusip, e);
  }
  return out;
}

/**
 * 全部经理、全部相邻季度对的拆股系数。季度对按每位经理实际申报的相邻两季(漏报一季时是 (Q1,Q3)),
 * 同一季度对的经理合在一起做交叉验证。季末单价取同一季全部持有人的中位数(同券同日同价,中位数抗个别脏行)。
 */
export function deriveSplitFactors(histories: ManagerHistory[], tickerOf: (cusip: string) => string | null, events: SplitEvent[]): SplitFactor[] {
  const prices = new Map<string, number[]>(); // `${cusip}|${period}` → 各持有人季末单价
  const pairs = new Map<string, { fromPeriod: string; toPeriod: string; holders: Map<string, PairHolder[]> }>();
  for (const m of histories) {
    const asc = [...m.filings].sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
    const agg = asc.map((f) => longByCusip(f.holdings));
    asc.forEach((f, i) => {
      for (const [cusip, e] of agg[i]) {
        if (e.shares <= 0 || e.value <= 0) continue;
        const k = `${cusip}|${f.period}`;
        const a = prices.get(k) ?? [];
        a.push(e.value / e.shares);
        prices.set(k, a);
      }
    });
    for (let i = 0; i + 1 < asc.length; i++) {
      const prev = agg[i];
      const cur = agg[i + 1];
      if (!prev.size || !cur.size) continue;
      const pk = `${asc[i].period}|${asc[i + 1].period}`;
      const p = pairs.get(pk) ?? { fromPeriod: asc[i].period, toPeriod: asc[i + 1].period, holders: new Map<string, PairHolder[]>() };
      for (const [cusip, c] of cur) {
        const pv = prev.get(cusip);
        if (!pv) continue;
        const a = p.holders.get(cusip) ?? [];
        a.push({ prevShares: pv.shares, shares: c.shares });
        p.holders.set(cusip, a);
      }
      pairs.set(pk, p);
    }
  }

  const byTicker = new Map<string, SplitEvent[]>();
  for (const e of events) {
    const a = byTicker.get(e.ticker) ?? [];
    a.push(e);
    byTicker.set(e.ticker, a);
  }

  const out: SplitFactor[] = [];
  for (const p of pairs.values()) {
    for (const [cusip, both] of p.holders) {
      const ticker = tickerOf(cusip);
      const q = median(prices.get(`${cusip}|${p.toPeriod}`) ?? []) / median(prices.get(`${cusip}|${p.fromPeriod}`) ?? []);
      const f = deriveSplitFactor({ cusip, ticker, fromPeriod: p.fromPeriod, toPeriod: p.toPeriod, priceRatio: q, both, events: ticker ? byTicker.get(ticker) ?? [] : [] });
      if (f) out.push(f);
    }
  }
  // 排序键含 toPeriod 作末位 tiebreak:同券同起点季的两个季度对,输出顺序不依赖经理输入顺序。
  return out.sort((a, b) => a.cusip.localeCompare(b.cusip) || a.fromPeriod.localeCompare(b.fromPeriod) || a.toPeriod.localeCompare(b.toPeriod));
}

export function factorLookup(rows: { cusip: string; fromPeriod: string; toPeriod: string; factor: number }[]): SplitFactorLookup {
  const m = new Map(rows.map((r) => [`${r.cusip}|${r.fromPeriod}|${r.toPeriod}`, r.factor]));
  return (cusip, fromPeriod, toPeriod) => m.get(`${cusip}|${fromPeriod}|${toPeriod}`) ?? 1;
}
