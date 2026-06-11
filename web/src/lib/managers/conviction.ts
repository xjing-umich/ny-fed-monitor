import type { FilingData } from "./types";

export type ConvictionSignal =
  | "accumulating"
  | "fresh_conviction"
  | "long_core"
  | "never_trimmed";

export type ConvictionPick = {
  cusip: string;
  issuer: string;
  signal: ConvictionSignal; // 最强适用的那一档（优先级见下）
  quartersHeld: number;     // 末尾连续持有季数（到最新季为止）
  series: readonly number[]; // 按时间升序的每季持股数；未持有季=0
  latestWeight: number | null; // 最新季权重（排序/文案用，缺失=null）
  addStreak: number;        // 末尾连续加仓季数（accumulating 文案用）
};

// 阈值具名常量，便于日后调（spec §3.2）
const MIN_ADD_STREAK = 3;        // accumulating: 末尾连续严格递增 ≥3 季
const FRESH_MIN_WEIGHT = 0.03;   // fresh_conviction: 最新季权重 ≥3%
const LONG_CORE_MIN_QUARTERS = 6; // long_core: 连续持有 ≥6 季
const LONG_CORE_TOP_N = 5;       // long_core: 最新季权重排组合前 5
const NEVER_TRIM_MIN_QUARTERS = 4; // never_trimmed: 连续持有 ≥4 季

// 信号优先级（1 最强）。排序与"取最强档"都用它。
const PRIORITY: Record<ConvictionSignal, number> = {
  accumulating: 1,
  fresh_conviction: 2,
  long_core: 3,
  never_trimmed: 4,
};

/**
 * 从 filings[]（按 period 降序，[0]=最新）推导信念精选。
 * 已排序（信号优先级 → latestWeight 降序，null 垫底）、已截断至 limit。命中 0 → []。
 * 确定性纯函数：无 IO / 无 Date.now / 无随机，ISR 静态渲染下输出稳定。
 */
export function deriveConviction(filings: FilingData[], limit = 3): ConvictionPick[] {
  if (filings.length === 0) return [];

  // 时间升序（filings 是降序）；防御性按 period 排一次，不依赖入参顺序
  const asc = [...filings].sort((a, b) => (a.period > b.period ? 1 : -1));
  const latest = asc[asc.length - 1];

  // 每证券（按 cusip 归并；13F 同券可多行/子账户/put-call，shares 求和）的升序持股序列。
  // 有意不按 putCall 分键（与 assemble.ts 不同）：卡片与内链均以 cusip 为口径（spec §3）。
  const byCusip = new Map<string, { issuer: string; series: number[] }>();
  asc.forEach((f, qi) => {
    for (const h of f.holdings) {
      let e = byCusip.get(h.cusip);
      if (!e) {
        e = { issuer: h.issuer, series: new Array(asc.length).fill(0) };
        byCusip.set(h.cusip, e);
      }
      e.issuer = h.issuer; // 以较新季的 issuer 名为准
      e.series[qi] += h.shares;
    }
  });

  // 最新季每证券权重（多行求和）与权重排名（long_core 用）
  const weightByCusip = new Map<string, number>();
  for (const h of latest.holdings) {
    if (h.weight != null) weightByCusip.set(h.cusip, (weightByCusip.get(h.cusip) ?? 0) + h.weight);
  }
  const topNCusips = new Set(
    [...weightByCusip.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, LONG_CORE_TOP_N)
      .map(([cusip]) => cusip),
  );

  const picks: ConvictionPick[] = [];
  for (const [cusip, { issuer, series }] of byCusip) {
    const last = series.length - 1;
    if (series[last] <= 0) continue; // 必须当前持有

    // quartersHeld: 末尾连续非零段长度
    let quartersHeld = 0;
    for (let i = last; i >= 0 && series[i] > 0; i--) quartersHeld++;

    // addStreak: 末尾连续严格递增步数（含从 0 新建后持续加）
    let addStreak = 0;
    for (let i = last; i >= 1 && series[i] > series[i - 1]; i--) addStreak++;

    // never_trimmed: 持有窗口内（末尾非零段，含从 0 起跳那步之后）无任何一季减少
    const heldStart = last - quartersHeld + 1;
    let trimmed = false;
    for (let i = heldStart + 1; i <= last; i++) {
      if (series[i] < series[i - 1]) { trimmed = true; break; }
    }

    const latestWeight = weightByCusip.get(cusip) ?? null;

    // 取最强适用档（spec §3.3：不堆标签）
    let signal: ConvictionSignal | null = null;
    if (addStreak >= MIN_ADD_STREAK) {
      signal = "accumulating";
    } else if (last > 0 && series[last] > series[last - 1] && latestWeight != null && latestWeight >= FRESH_MIN_WEIGHT) { // last>0: 短历史（单季）容忍——单条 filing 无法区分新买/加仓
      signal = "fresh_conviction";
    } else if (quartersHeld >= LONG_CORE_MIN_QUARTERS && topNCusips.has(cusip)) {
      signal = "long_core";
    } else if (quartersHeld >= NEVER_TRIM_MIN_QUARTERS && !trimmed) {
      signal = "never_trimmed";
    }
    if (!signal) continue;

    picks.push({ cusip, issuer, signal, quartersHeld, series, latestWeight, addStreak });
  }

  // 排序：信号优先级（1→4），同档按 latestWeight 降序（null 垫底）；截断
  picks.sort((a, b) => {
    const p = PRIORITY[a.signal] - PRIORITY[b.signal];
    if (p !== 0) return p;
    return (b.latestWeight ?? -1) - (a.latestWeight ?? -1);
  });
  return picks.slice(0, limit);
}
