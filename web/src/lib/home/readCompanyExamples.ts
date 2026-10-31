import "server-only";
import { cache } from "react";
import type { Lang } from "@/lib/nav";
import { readStockHolders } from "@/lib/managers/consensusRead";
import { getLatestPrice } from "@/lib/managers/priceRead";
import { readValuationVerdicts } from "@/lib/valuation/valuationSnapshot";
import { deriveCompanyExample } from "./companyExample";
import { readExampleSplits } from "./readExampleSplits";
const TICKERS = ["AAPL", "MSFT", "BRK.B"];
// 8 database reads: one version/validity-filtered snapshot batch,
// three holders + three latest quotes + one split batch. No SEC reads,
// valuation engine, source scanning, or writes. Raw evidence is shared by locales.
const readEvidence = cache(async () => {
  const [snapshots, splits, rows] = await Promise.all([
    readValuationVerdicts(TICKERS).catch(() => new Map()),
    readExampleSplits(TICKERS).catch(() => null),
    Promise.all(
      TICKERS.map(async (ticker) => {
        const [holders, quote] = await Promise.allSettled([
          readStockHolders(ticker),
          getLatestPrice(ticker),
        ]);
        return {
          ticker,
          holders: holders.status === "fulfilled" ? holders.value : null,
          quote: quote.status === "fulfilled" ? quote.value : null,
        };
      }),
    ),
  ]);
  return rows.map((row) => ({
    ...row,
    latestSplitDate: splits?.get(row.ticker) ?? null,
    snapshot: splits ? (snapshots.get(row.ticker) ?? null) : null,
  }));
});
export const readCompanyExamples = cache(async (lang: Lang) => {
  const now = new Date();
  return (await readEvidence()).map((row) =>
    deriveCompanyExample({ ...row, now }, lang),
  );
});
