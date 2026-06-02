import "server-only";
import { ingestSinglePdSeries } from "@/lib/ingestion/pdSeries";

export const primaryDealerTransactionsSourceName = "Primary Dealer Transactions";

export function ingestPrimaryDealerTransactions() {
  return ingestSinglePdSeries({
    sourceName: primaryDealerTransactionsSourceName,
    keyid: "PDGSWOEXTTOT",
    seriesCode: "PD_TRANSACTIONS_TOTAL",
    metadata: { category: "Treasury transactions" },
  });
}
