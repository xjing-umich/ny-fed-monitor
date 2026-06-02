import { ingestPrimaryDealerTransactions, primaryDealerTransactionsSourceName } from "@/lib/ingestion/primaryDealerTransactions";
import { runIngestionRoute } from "@/lib/ingestion/routes";

export const dynamic = "force-dynamic";

export function POST(): Promise<Response> {
  return runIngestionRoute(primaryDealerTransactionsSourceName, ingestPrimaryDealerTransactions);
}
