import "server-only";
import { cache } from "react";
import type { Lang } from "@/lib/nav";
import { readStockHolders } from "@/lib/managers/consensusRead";
import { getLatestPrice, getLatestSplit } from "@/lib/managers/priceRead";
import { getSecurityMeta } from "@/lib/managers/securities";
import { getSecCompanyData } from "@/lib/sec/read";
import { getLatestDgs10 } from "@/lib/managers/treasuryRead";
import {
  fundamentalsToFloorInput,
  resolveAds,
  isFundamentalsStale,
  isSplitCoverageStale,
  fundamentalsIntegrityViolated,
  readHoldcoSotp,
  runValuation,
} from "@/lib/valuation";
import { deriveCompanyExample } from "./companyExample";

// Same engine and evidence guards as the stock detail route. Three bounded examples;
// no external market API, database write, or duplicated valuation formula.
export const readCompanyExamples = cache(async (lang: Lang) => {
  const now = new Date();
  const dgs10Promise = getLatestDgs10();
  return Promise.all(
    ["AAPL", "MSFT", "BRK.B"].map(async (ticker) => {
      try {
        const [holders, sec, meta, quote, latestSplitDate, dgs10] =
          await Promise.all([
            readStockHolders(ticker),
            getSecCompanyData(ticker),
            getSecurityMeta(ticker),
            getLatestPrice(ticker),
            getLatestSplit(ticker),
            dgs10Promise,
          ]);
        const ads = resolveAds(meta.securityType, meta.adsRatio);
        const sic =
          sec.company?.sic == null ? undefined : Number(sec.company.sic);
        const input = fundamentalsToFloorInput(
          ticker,
          holders?.[0]?.issuer || ticker,
          sec.annual,
          ads.ratio,
          Number.isFinite(sic) ? sic : undefined,
          sec.quarterly,
          sec.filings,
        );
        const sotp = await readHoldcoSotp({
          ticker,
          annual: sec.annual,
          floorInput: input,
        });
        if (sotp) input.holdcoSotp = sotp;
        const fundamentalsDate =
          input.ttm?.period_end ?? sec.annual[0]?.period_end ?? null;
        const splitAsOf =
          input.ttm && !input.ttm.shares_from_fy
            ? input.ttm.period_end
            : (sec.annual[0]?.period_end ?? null);
        const splitCoverageStale = isSplitCoverageStale({
          fundamentalsAsOf: splitAsOf,
          latestSplitDate,
        });
        const fundamentalsCorrupt = fundamentalsIntegrityViolated(input.years);
        const run = runValuation({
          floorInput: input,
          price: quote?.stale ? null : quote,
          dgs10,
          guards: {
            adsSuppressed: ads.suppressed,
            fundamentalsStale: isFundamentalsStale(
              fundamentalsDate,
              now.toISOString(),
            ),
            priceStale: quote?.stale === true,
            splitCoverageStale,
            fundamentalsCorrupt,
          },
          asOf: now.toISOString(),
        });
        return deriveCompanyExample(
          {
            ticker,
            holders,
            quote,
            run,
            fundamentalsDate,
            now,
            splitCoverageStale,
            fundamentalsCorrupt,
          },
          lang,
        );
      } catch (error) {
        console.error(
          `Homepage example ${ticker} unavailable:`,
          error instanceof Error ? error.message : "read failed",
        );
        return deriveCompanyExample(
          {
            ticker,
            holders: null,
            quote: null,
            run: null,
            fundamentalsDate: null,
            now,
          },
          lang,
        );
      }
    }),
  );
});
