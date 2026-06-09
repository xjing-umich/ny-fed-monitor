create extension if not exists pgcrypto;

create table if not exists public.sec_companies (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  normalized_ticker text not null unique,
  cik text not null,
  company_name text,
  exchange text,
  sic text,
  sic_description text,
  fiscal_year_end text,
  is_foreign_issuer boolean default false,
  source text default 'sec',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sec_filings (
  id uuid primary key default gen_random_uuid(),
  cik text not null,
  ticker text not null,
  accession_number text not null unique,
  form text not null check (form in ('10-K', '10-Q', '20-F', '6-K')),
  filing_date date,
  report_date date,
  fiscal_year int,
  fiscal_period text,
  primary_document text,
  filing_url text,
  sec_index_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.company_fundamentals_periods (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  cik text not null,
  form text not null,
  fiscal_year int,
  fiscal_period text,
  period_end date not null,
  filing_date date,
  accession_number text,
  revenue numeric,
  gross_profit numeric,
  operating_income numeric,
  net_income numeric,
  eps_diluted numeric,
  shares_diluted numeric,
  operating_cash_flow numeric,
  capex numeric,
  free_cash_flow numeric,
  cash_and_equivalents numeric,
  total_assets numeric,
  total_liabilities numeric,
  total_debt numeric,
  shareholders_equity numeric,
  revenue_yoy numeric,
  net_income_yoy numeric,
  fcf_yoy numeric,
  gross_margin numeric,
  operating_margin numeric,
  net_margin numeric,
  fcf_margin numeric,
  roe numeric,
  debt_to_equity numeric,
  net_debt numeric,
  data_quality text default 'unknown',
  missing_fields jsonb default '{}'::jsonb,
  raw_facts jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(ticker, fiscal_year, fiscal_period, form)
);

create table if not exists public.company_fundamentals_latest (
  ticker text primary key,
  cik text not null,
  company_name text,
  latest_10k_period_end date,
  latest_10q_period_end date,
  latest_filing_date date,
  latest_revenue numeric,
  latest_net_income numeric,
  latest_fcf numeric,
  latest_cash numeric,
  latest_debt numeric,
  latest_equity numeric,
  latest_revenue_yoy numeric,
  latest_net_margin numeric,
  latest_roe numeric,
  latest_fcf_margin numeric,
  quality_status text,
  updated_at timestamptz default now()
);

create table if not exists public.sec_ingest_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  ticker text,
  status text not null,
  started_at timestamptz default now(),
  finished_at timestamptz,
  error_message text,
  summary jsonb default '{}'::jsonb
);

create index if not exists sec_filings_ticker_filing_date_idx on public.sec_filings(ticker, filing_date desc);
create index if not exists company_fundamentals_periods_ticker_period_end_idx on public.company_fundamentals_periods(ticker, period_end desc);
