// 真实持仓谓词:排除 13F-NT 占位行(NONE / 全零 cusip / value+shares 全 0)。
export function isRealHolding(h: { cusip: string; issuer: string; value: number; shares: number }): boolean {
  if (!h.cusip || !h.issuer) return false;
  if (h.issuer.trim().toUpperCase() === "NONE") return false;
  if (/^0+$/.test(h.cusip)) return false;
  if ((h.value ?? 0) === 0 && (h.shares ?? 0) === 0) return false;
  return true;
}
