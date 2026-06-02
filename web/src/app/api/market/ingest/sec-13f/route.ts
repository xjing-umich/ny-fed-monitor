import { ingestSec13f, sec13fSourceName } from "@/lib/ingestion/sec13f";
import { runIngestionRoute } from "@/lib/ingestion/routes";

export const dynamic = "force-dynamic";

export function POST(): Promise<Response> {
  return runIngestionRoute(sec13fSourceName, ingestSec13f);
}
