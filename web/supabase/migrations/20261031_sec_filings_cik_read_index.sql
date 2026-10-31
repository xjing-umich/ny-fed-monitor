-- Shared-CIK reads introduced by #262 filter on cik, then take the newest
-- filings across share classes. The old ticker index cannot serve this query;
-- production acceptance observed statement timeouts and cold-page HTTP 500s.
create index if not exists sec_filings_cik_filing_date_accession_idx
  on public.sec_filings (cik, filing_date desc, accession_number desc);
