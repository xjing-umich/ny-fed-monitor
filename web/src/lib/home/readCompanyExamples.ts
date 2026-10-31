import "server-only";
import { cache } from "react";
import type { Lang } from "@/lib/nav";
import { readStockHolders } from "@/lib/managers/consensusRead";
import { getLatestPrice } from "@/lib/managers/priceRead";
import { readValuationVerdicts } from "@/lib/valuation/valuationSnapshot";
import { optionalValuation } from "@/lib/valuation/publicationAvailability";
import { projectHome } from "@/lib/valuation/publicationProjection";
import { readExampleSplits } from "./readExampleSplits";
export const HOME_TICKERS = ["AAPL", "MSFT", "BRK.B"];
/** Bounded supplementary evidence, shared by renderer and automatic publication producer. */
export const readHomeEvidence = cache(async () => {
  const [splits, rows] = await Promise.all([
    readExampleSplits(HOME_TICKERS).catch(() => null),
    Promise.all(HOME_TICKERS.map(async ticker => {
      const [holders, quote] = await Promise.allSettled([readStockHolders(ticker), getLatestPrice(ticker)]);
      return {ticker, holders:holders.status === "fulfilled" ? holders.value : null,
        quote:quote.status === "fulfilled" ? quote.value : null};
    })),
  ]);
  return rows.map(row => ({...row, latestSplitDate:splits?.get(row.ticker) ?? null, splitsAvailable:splits !== null}));
});
export const readCompanyExampleState = cache(async (lang: Lang) => {
  const [availability,evidence] = await Promise.all([optionalValuation(readValuationVerdicts(HOME_TICKERS)),readHomeEvidence()]);
  return {...projectHome([...(availability.value?.values() ?? [])],evidence,lang),unavailable:availability.unavailable};
});
export const readCompanyExamples = cache(async (lang:Lang) => (await readCompanyExampleState(lang)).examples);
