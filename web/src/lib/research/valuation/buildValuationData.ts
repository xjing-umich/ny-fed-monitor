import type { NormalizedResearchData } from "../schemas/researchSchemas";
import { calculateValuation } from "./calculateValuation";
import { fetchStorePrice, mockPrice } from "./priceProvider";
import type { PriceData, ValuationResult } from "./types";
import { getSecurityMeta } from "@/lib/managers/securities";
import { resolveAds } from "@/lib/valuation";

export async function buildValuationForResearchData(
  normalizedData: NormalizedResearchData,
  options: { mock?: boolean; price?: PriceData | null } = {},
): Promise<ValuationResult> {
  const price = options.mock
    ? (options.price ?? mockPrice(normalizedData.ticker))
    : (options.price ?? (await fetchStorePrice(normalizedData.ticker)));
  // ADR/ADS 归一化(市值口径):mock 路径不查库,保持 1。
  let adsRatio = 1;
  if (!options.mock) {
    const { securityType, adsRatio: r } = await getSecurityMeta(normalizedData.ticker);
    const ads = resolveAds(securityType, r);
    // 未策展 ADR:比例未知 → 传 -1 让 sharesOutstanding 判定为抑制信号,市值不计算(降级留白)。
    adsRatio = ads.suppressed ? -1 : ads.ratio;
  }
  return calculateValuation({ ...normalizedData, price, ads_ratio: adsRatio });
}
