/**
 * ADR/ADS 归一化决策(纯函数)。
 * SEC 20-F 的 shares 是标的普通股数;市场价是每 ADS。多数 ADR 满足 1 ADS = N 股普通股。
 * ratio = 每 1 ADS 折合几股普通股。engine 用 shares_diluted / ratio 得 ADS 张数,使每股口径=每 ADS。
 *
 * 抑制:security_type='ADR' 但没有可信 ratio(NULL/<=0/非有限)→ 该 ADR 不出估值,
 * 宁可留白也不拿未归一化的带去比每 ADS 价(与 BABA/TSM 的 no-floor 同待遇)。
 * 非 ADR(Common Stock / NY Reg Shrs 等外国普通股上市)天然 1:1,永不抑制、永用 1。
 */
export function resolveAds(
  securityType: string | null | undefined,
  adsRatio: number | null | undefined,
): { suppressed: boolean; ratio: number } {
  const isAdr = securityType === "ADR";
  const valid = typeof adsRatio === "number" && Number.isFinite(adsRatio) && adsRatio > 0;
  if (!isAdr) return { suppressed: false, ratio: 1 };
  if (!valid) return { suppressed: true, ratio: 1 };
  return { suppressed: false, ratio: adsRatio as number };
}
