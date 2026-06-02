import "server-only";
import { ingestSinglePdSeries } from "@/lib/ingestion/pdSeries";

export const repoFinancingSourceName = "Repo Financing";

export function ingestRepoFinancing() {
  return ingestSinglePdSeries({
    sourceName: repoFinancingSourceName,
    keyid: "PDSORA-UTSETTOT",
    seriesCode: "PD_REPO_FINANCING_TOTAL",
    metadata: { financing_type: "Securities out by reverse repo" },
  });
}
