import type { Manager, FilingData, Holding, HoldingChange, ManagerDetail } from "./types";
import { NO_SPLITS, rescaleToLatestBasis, SNAP_TOL, type SplitFactorLookup } from "./splitAdjust";

/**
 * cusip → 归并身份(通常是 ticker)。返回 null/undefined → 退回 cusip 本身。
 * 用途:发行人换 CUSIP(XOM 2026-07 控股重组 30231G102→30233Q108、HON/DD 分拆后新 CUSIP)时,
 * 两季的新旧 CUSIP 映射到同一 ticker,按 ticker 比对才不会记成"清仓旧 + 新建新"的假动作。
 */
export type CanonicalKey = (cusip: string) => string | null | undefined;

// 同 isLikelyTicker(externalLinks.ts):脊梁偶有脏 ticker(OpenFIGI 回传数字),不能拿来归并不相干的 CUSIP。
const TICKER_SHAPE = /^[A-Za-z]{1,6}(\.[A-Za-z])?$/;

/** 由 cusip→ticker 查找构造归并键:只认 ticker 形态的值,其余退回 cusip。 */
export function tickerCanon(tickerOf: (cusip: string) => string | null | undefined): CanonicalKey {
  return (cusip) => {
    const t = tickerOf(cusip);
    return t && TICKER_SHAPE.test(t) ? t.toUpperCase() : null;
  };
}

// 13F 同一证券可多行(子账户),按 cusip + put/call 归并后再比对;传 canon 时按归并身份(ticker)+ put/call。
// 同口径的归并键也供 UI 层复用(正股与 put/call 同 CUSIP,不可仅按 cusip 归并)。
export function holdingKey(h: { cusip: string; putCall?: string }, canon?: CanonicalKey): string {
  return `${canon?.(h.cusip) ?? h.cusip}|${h.putCall ?? ""}`;
}

// 同一归并键下的多行求和(股数/市值/权重);代表 cusip/issuer 取市值最大的一行(确定性)。
function mergeByKey(hs: Holding[], canon?: CanonicalKey): Map<string, Holding> {
  const out = new Map<string, Holding>();
  for (const h of hs) {
    const k = holdingKey(h, canon);
    const e = out.get(k);
    if (!e) {
      out.set(k, { ...h });
      continue;
    }
    const top = h.value > e.value ? h : e;
    out.set(k, {
      ...top,
      shares: e.shares + h.shares,
      value: e.value + h.value,
      weight: e.weight == null && h.weight == null ? undefined : (e.weight ?? 0) + (h.weight ?? 0),
    });
  }
  return out;
}

/** 最新一期 vs 上一期的持仓变化（new/increased/decreased/exited）。canon 见 CanonicalKey。 */
export function computeChanges(latest: Holding[], prior: Holding[], canon?: CanonicalKey): HoldingChange[] {
  const lm = mergeByKey(latest, canon);
  const pm = mergeByKey(prior, canon);
  const out: HoldingChange[] = [];
  for (const [k, lh] of lm) {
    const ph = pm.get(k);
    if (!ph) {
      out.push({ cusip: lh.cusip, putCall: lh.putCall, issuer: lh.issuer, kind: "new", prevShares: 0, shares: lh.shares, value: lh.value, deltaPct: null });
    } else {
      const delta = lh.shares - ph.shares;
      // 换算过的上季行(拆股/换 CUSIP 换股)与本季差 0.5% 以内 = 零碎股折现,视为未变(同 rescaleToLatestBasis 的贴齐)。
      // 换 CUSIP 时旧码下季已不存在,rescale 的按 cusip 贴齐够不着,只能在按 ticker 归并之后补这一步。
      const snapped = ph.splitFactor != null && ph.splitFactor !== 1 && ph.shares > 0 && Math.abs(delta) <= SNAP_TOL * ph.shares;
      if (delta !== 0 && !snapped) {
        out.push({ cusip: lh.cusip, putCall: lh.putCall, issuer: lh.issuer, kind: delta > 0 ? "increased" : "decreased", prevShares: ph.shares, shares: lh.shares, value: lh.value, deltaPct: ph.shares !== 0 ? delta / ph.shares : null, splitFactor: ph.splitFactor });
      }
    }
  }
  for (const [k, ph] of pm) {
    if (!lm.has(k)) out.push({ cusip: ph.cusip, putCall: ph.putCall, issuer: ph.issuer, kind: "exited", prevShares: ph.shares, shares: 0, value: ph.value, deltaPct: -1 });
  }
  return out;
}

/**
 * 从一份 filings[] 装配完整 ManagerDetail（唯一构造入口）。
 * - 按 period 降序排序，较早各季股数换算到最新季口径
 * - latest = [0], prior = [1]
 * - changes = computeChanges(latest, prior)（无 prior → []；最新一期申报持仓为零 → []）
 * 调用方须保证 filings 非空（空则不应构造 detail，返回 null）。
 */
export function assembleManagerDetail(
  manager: Manager,
  filings: FilingData[],
  splits: SplitFactorLookup = NO_SPLITS,
  canon?: CanonicalKey,
): ManagerDetail {
  // 拆股:较早各季股数先换算到最新季口径,本季变动与 8 季信号(conviction)同用一份(见 splitAdjust.ts)。
  const sorted = rescaleToLatestBasis(filings, splits);
  const latest = sorted[0];
  const prior = sorted[1];
  // 零持仓申报(如 Olstein 2026Q2)只说明"本季无 13F 持仓",没说原因(清盘/委托转出/跌破门槛)。
  // 不把上季全部仓位记成"清仓"动作,否则一份空表会变成几十条卖出信号;页面另行说明零持仓。
  const changes = prior && latest.holdings.length > 0 ? computeChanges(latest.holdings, prior.holdings, canon) : [];
  return { manager, filings: sorted, latest, prior, changes };
}
