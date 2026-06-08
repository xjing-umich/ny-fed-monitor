import type { NormalizedResearchData } from "../schemas/researchSchemas";
import { calculateValuation } from "./calculateValuation";
import { fetchFinnhubPrice, mockPrice } from "./priceProvider";
import type { PriceData, ValuationResult } from "./types";

export async function buildValuationForResearchData(
  normalizedData: NormalizedResearchData,
  options: { mock?: boolean; price?: PriceData | null; fetchImpl?: typeof fetch } = {},
): Promise<ValuationResult> {
  const price = options.mock
    ? (options.price ?? mockPrice(normalizedData.ticker))
    : (options.price ?? (await fetchFinnhubPrice(normalizedData.ticker, options.fetchImpl ?? fetch)));
  return calculateValuation({ ...normalizedData, price });
}
