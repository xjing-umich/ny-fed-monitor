import { ingestPolicyExpectations, policyExpectationsSourceName } from "@/lib/ingestion/policyExpectations";
import { runIngestionRoute } from "@/lib/ingestion/routes";

export const dynamic = "force-dynamic";

export function POST(): Promise<Response> {
  return runIngestionRoute(policyExpectationsSourceName, ingestPolicyExpectations);
}
