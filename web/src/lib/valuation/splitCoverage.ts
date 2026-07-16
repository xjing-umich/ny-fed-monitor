// splitCoverage.ts — 拆股口径陈旧判定(纯函数,单一真相)。
// 基本面 as-of(最新 FY period_end)早于最近拆股日期 → SEC 侧 shares 仍是拆股前口径,
// 而价格已是拆股后 → 每股价值带被放大 ~拆股比例倍。触发时估值判定不可信,整条抑制。
// 拆股后财报一 ingest(period_end ≥ split_date),谓词自动转 false,估值恢复。
export function isSplitCoverageStale(input: {
  fundamentalsAsOf: string | null; // 最新 FY period_end(ISO date)
  latestSplitDate: string | null;  // stock_splits 中该 ticker 最近拆股日期(ISO date)
}): boolean {
  const { fundamentalsAsOf, latestSplitDate } = input;
  if (!latestSplitDate || !fundamentalsAsOf) return false;
  return latestSplitDate > fundamentalsAsOf; // ISO date 字符串字典序比较对 YYYY-MM-DD 安全
}
