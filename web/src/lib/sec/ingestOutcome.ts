import type { IngestCompanyResult } from './ingest';

/** Known pending adapters are distinct from outages, and neither is HTTP success. */
export function financialIngestHttpStatus(outcome: Pick<IngestCompanyResult,'status'> | {failed:number;source_pending:number}): number {
  if ('failed' in outcome) return outcome.failed>0 ? 500 : outcome.source_pending>0 ? 409 : 200;
  return outcome.status==='failed' ? 500 : outcome.status==='source_pending' ? 409 : 200;
}
