-- Source-backed native-currency income comparables, kept separate from USD fundamentals.
create table if not exists public.company_interim_disclosures (
  ticker text not null,
  cik text not null,
  accession_number text not null,
  source_url text not null check (source_url like 'https://www.sec.gov/Archives/edgar/data/%'),
  source_filed_at date not null,
  source_accepted_at timestamptz,
  parser_version text not null,
  status text not null check (status in ('supported','no_evidence','unsupported','error')),
  financial_document boolean not null default false,
  report_period_end date,
  payload jsonb,
  error text,
  checked_at timestamptz not null default now(),
  primary key(ticker,accession_number,source_url),
  check(status <> 'supported' or (payload is not null and report_period_end is not null))
);
alter table public.company_interim_disclosures add column if not exists source_accepted_at timestamptz;
create index if not exists company_interim_disclosures_ticker_period_idx
  on public.company_interim_disclosures(ticker,report_period_end desc,source_filed_at desc);
alter table public.company_interim_disclosures enable row level security;
revoke all on public.company_interim_disclosures from public,anon,authenticated;
grant select,insert,update,delete on public.company_interim_disclosures to service_role;
drop policy if exists company_interim_disclosures_service on public.company_interim_disclosures;
create policy company_interim_disclosures_service on public.company_interim_disclosures
 for all to service_role using(true) with check(true);
