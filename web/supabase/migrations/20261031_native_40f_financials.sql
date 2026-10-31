-- Native source coverage only. USD consumers intentionally do not read this table.
-- Apply before enabling this ingestion code; no FX/ADR conversion is authorized here.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
alter table public.sec_filings drop constraint if exists sec_filings_form_check;
alter table public.sec_filings add constraint sec_filings_form_check
  check (form in ('10-K', '10-Q', '20-F', '6-K', '40-F'));

create table public.sec_native_financial_periods (
  ticker text not null,
  cik text not null,
  form text not null check (form = '40-F'),
  fiscal_period text not null check (fiscal_period = 'FY'),
  period_start date not null,
  period_end date not null,
  filing_date date not null,
  accession_number text not null references public.sec_filings(accession_number),
  source_filing_url text not null,
  source_instance_url text not null,
  reporting_currency text not null check (reporting_currency = 'CAD'),
  accounting_standard text not null check (accounting_standard = 'IFRS'),
  share_basis text not null check (share_basis = 'issuer_ordinary'),
  valuation_eligible boolean not null default false check (valuation_eligible = false),
  valuation_blockers jsonb not null,
  is_comparative boolean not null,
  revenue numeric,
  profit_loss numeric,
  profit_loss_attributable_to_owners numeric,
  gross_profit numeric,
  operating_profit numeric,
  cash_and_equivalents numeric,
  total_assets numeric,
  total_liabilities numeric,
  equity numeric,
  equity_attributable_to_owners numeric,
  operating_cash_flow numeric,
  purchases_of_ppe numeric,
  basic_eps numeric,
  diluted_eps numeric,
  weighted_average_shares numeric,
  diluted_weighted_average_shares numeric,
  raw_facts jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (ticker, accession_number, period_end),
  check ((ticker = 'BMM' and cik = '0001732379') or (ticker = 'NICM' and cik = '0001526475')),
  check (period_start <= period_end and period_end <= filing_date)
);
alter table public.sec_native_financial_periods enable row level security;
comment on table public.sec_native_financial_periods is
  'Original IFRS/CAD consolidated annual source facts; not normalized USD fundamentals or ADR per-share valuations. Comparative rows retain their source filing version.';
commit;
