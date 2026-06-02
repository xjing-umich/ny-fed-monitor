import "server-only";
import { ingestSinglePdSeries } from "@/lib/ingestion/pdSeries";

export const primaryDealerPositionsSourceName = "Primary Dealer Positions";

export function ingestPrimaryDealerPositions() {
  return ingestSinglePdSeries({
    sourceName: primaryDealerPositionsSourceName,
    keyid: "PDPOSGST-TOT",
    seriesCode: "PD_POSITIONS_TOTAL",
    metadata: { asset_category: "Treasury and agency securities" },
  });
}
