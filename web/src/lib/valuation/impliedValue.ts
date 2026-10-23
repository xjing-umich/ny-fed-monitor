/**
 * 由安全边际反推参照价值:marginPct = (ref − price) / ref ⇒ ref = price / (1 − marginPct)。
 * 有含增长中枢 IV 时 ref 即内在价值;单法口径时为零增长价值(deriveValuationVerdict 两个分支同一公式)。
 * 边际缺失、≥ 1 或价格非正 → null(页面显示 —)。
 */
export function impliedValue(price: number, marginPct: number | null): number | null {
  if (marginPct == null || !Number.isFinite(marginPct) || marginPct >= 1) return null;
  if (!(price > 0)) return null;
  return price / (1 - marginPct);
}
