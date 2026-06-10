import type { Manager, FilingData, Holding, HoldingChange, ManagerDetail } from "./types";

// 13F 同一证券可多行(子账户),按 cusip + put/call 归并后再比对。
function key(h: { cusip: string; putCall?: string }): string {
  return `${h.cusip}|${h.putCall ?? ""}`;
}

/** 最新一期 vs 上一期的持仓变化（new/increased/decreased/exited）。 */
export function computeChanges(latest: Holding[], prior: Holding[]): HoldingChange[] {
  const lm = new Map(latest.map((h) => [key(h), h]));
  const pm = new Map(prior.map((h) => [key(h), h]));
  const out: HoldingChange[] = [];
  for (const [k, lh] of lm) {
    const ph = pm.get(k);
    if (!ph) {
      out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "new", prevShares: 0, shares: lh.shares, value: lh.value, deltaPct: null });
    } else {
      const delta = lh.shares - ph.shares;
      if (delta !== 0) {
        out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: delta > 0 ? "increased" : "decreased", prevShares: ph.shares, shares: lh.shares, value: lh.value, deltaPct: ph.shares !== 0 ? delta / ph.shares : null });
      }
    }
  }
  for (const [k, ph] of pm) {
    if (!lm.has(k)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", prevShares: ph.shares, shares: 0, value: 0, deltaPct: -1 });
  }
  return out;
}

/**
 * 从一份 filings[] 装配完整 ManagerDetail（唯一构造入口）。
 * - 按 period 降序排序
 * - latest = [0], prior = [1]
 * - changes = computeChanges(latest, prior)（无 prior → []）
 * 调用方须保证 filings 非空（空则不应构造 detail，返回 null）。
 */
export function assembleManagerDetail(manager: Manager, filings: FilingData[]): ManagerDetail {
  const sorted = [...filings].sort((a, b) => (b.period > a.period ? 1 : -1));
  const latest = sorted[0];
  const prior = sorted[1];
  const changes = prior ? computeChanges(latest.holdings, prior.holdings) : [];
  return { manager, filings: sorted, latest, prior, changes };
}
