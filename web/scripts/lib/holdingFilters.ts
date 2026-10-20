// 真实持仓谓词:排除 13F-NT 占位行(NONE / 全零 cusip / value+shares 全 0)。
export function isRealHolding(h: { cusip: string; issuer: string; value: number; shares: number }): boolean {
  if (!h.cusip || !h.issuer) return false;
  if (h.issuer.trim().toUpperCase() === "NONE") return false;
  if (/^0+$/.test(h.cusip)) return false;
  if ((h.value ?? 0) === 0 && (h.shares ?? 0) === 0) return false;
  return true;
}

export function isLongHolding(h: { putCall?: string | null }): boolean {
  return !h.putCall;
}

export function hasLongHoldings<T extends { putCall?: string | null }>(holdings: T[]): boolean {
  return holdings.some(isLongHolding);
}

/**
 * 零持仓 13F-HR:infotable 至少一行、且每行都是全 0 占位(value 与 shares 均为 0)。
 * EDGAR 不允许空表,无持仓的申报人只能填一行 cusip 000000000 / value 0(Olstein 2026Q2 写 "0",
 * Makaira 2026Q1 写 "NONE")。这是"本季报告持仓为零",不是解析失败。
 */
export function isZeroHoldingsReport(rows: Array<{ value: number; shares: number }>): boolean {
  return rows.length > 0 && rows.every((r) => (r.value ?? 0) === 0 && (r.shares ?? 0) === 0);
}
