import type { NormalizedResearchData } from "../schemas/researchSchemas";
import { calculateValuation } from "./calculateValuation";
import { fetchStorePrice, mockPrice } from "./priceProvider";
import type { PriceData, ValuationResult } from "./types";

export async function buildValuationForResearchData(
  normalizedData: NormalizedResearchData,
  options: { mock?: boolean; price?: PriceData | null } = {},
): Promise<ValuationResult> {
  const price = options.mock
    ? (options.price ?? mockPrice(normalizedData.ticker))
    : (options.price ?? (await fetchStorePrice(normalizedData.ticker)));
  return calculateValuation({ ...normalizedData, price });
}
