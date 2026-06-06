-- Smart Money Monitor — 13F schema (Phase A)
create table if not exists managers (
  cik text primary key,
  slug text unique not null,
  name text not null,
  person text not null,
  created_at timestamptz default now()
);

create table if not exists filings (
  id bigint generated always as identity primary key,
  cik text not null references managers(cik) on delete cascade,
  period date not null,
  filed_at date,
  accession text unique not null,
  total_value bigint not null default 0,
  holding_count int not null default 0
);
create index if not exists filings_cik_period_idx on filings (cik, period desc);

create table if not exists holdings (
  id bigint generated always as identity primary key,
  filing_id bigint not null references filings(id) on delete cascade,
  cusip text not null,
  issuer text not null,
  title_of_class text,
  value bigint not null default 0,
  shares numeric not null default 0,
  put_call text,
  weight numeric not null default 0
);
create index if not exists holdings_filing_idx on holdings (filing_id);
create index if not exists holdings_cusip_idx on holdings (cusip);

-- 证券主表(脊梁): ticker 为锚, 三支柱挂其上
create table if not exists securities (
  ticker text primary key,
  name text,
  exchange text,
  sector text,
  figi text,
  primary_cusip text,
  source text,
  as_of date,
  updated_at timestamptz not null default now()
);

-- CUSIP → ticker 映射(13F holdings 用 cusip, 经此表落到脊梁)
-- cusip 存 holdings 中的原始形态(可能缺前导零), 补零仅用于调 OpenFIGI
create table if not exists security_cusips (
  cusip text primary key,
  ticker text references securities(ticker) on delete set null,
  issuer text,
  resolved boolean not null default false,
  source text,
  updated_at timestamptz not null default now()
);
create index if not exists security_cusips_ticker_idx on security_cusips (ticker);

-- Market monitor database foundation (Phase 1)
do $$
begin
  create type market_ingestion_status as enum ('success', 'partial', 'failed', 'empty', 'stale');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type market_freshness_status_value as enum (
    'fresh',
    'stale',
    'empty',
    'partial',
    'failed',
    'manual_required',
    'unknown'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists market_data_sources (
  id bigint generated always as identity primary key,
  name text unique not null,
  provider text not null,
  official_url text not null,
  api_endpoint text,
  update_frequency text not null,
  expected_lag_days int not null default 0,
  is_manual boolean not null default false,
  limitation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists market_data_sources_provider_idx on market_data_sources (provider);

create table if not exists market_ingestion_runs (
  id bigint generated always as identity primary key,
  source_id bigint not null references market_data_sources(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status market_ingestion_status not null,
  rows_fetched int not null default 0,
  latest_observation_date date,
  error_message text,
  raw_response_hash text,
  created_at timestamptz not null default now()
);
create index if not exists market_ingestion_runs_source_started_idx
  on market_ingestion_runs (source_id, started_at desc);

create table if not exists market_time_series_observations (
  id bigint generated always as identity primary key,
  source_id bigint not null references market_data_sources(id) on delete cascade,
  series_code text not null,
  observation_date date not null,
  value numeric,
  unit text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_id, series_code, observation_date)
);
create index if not exists market_time_series_source_series_date_idx
  on market_time_series_observations (source_id, series_code, observation_date desc);

create table if not exists market_freshness_status (
  id bigint generated always as identity primary key,
  source_id bigint not null references market_data_sources(id) on delete cascade,
  latest_observation_date date,
  last_successful_fetch timestamptz,
  freshness_status market_freshness_status_value not null default 'unknown',
  days_since_latest int,
  expected_frequency text,
  checked_at timestamptz not null default now(),
  warning text,
  unique (source_id)
);
create index if not exists market_freshness_status_status_idx
  on market_freshness_status (freshness_status);

create table if not exists market_ai_analysis_runs (
  id bigint generated always as identity primary key,
  analysis_type text not null,
  model_name text not null,
  input_snapshot jsonb not null default '{}'::jsonb,
  freshness_snapshot jsonb not null default '{}'::jsonb,
  output_text text,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists market_ai_analysis_runs_type_created_idx
  on market_ai_analysis_runs (analysis_type, created_at desc);

insert into market_data_sources (
  name,
  provider,
  official_url,
  api_endpoint,
  update_frequency,
  expected_lag_days,
  is_manual,
  limitation_note
) values
  (
    'Reference Rates',
    'NY Fed',
    'https://www.newyorkfed.org/markets/reference-rates',
    'https://markets.newyorkfed.org/api/rates',
    'business_daily',
    1,
    false,
    'Reference rates measure overnight funding conditions. SOFR/TGCR/BGCR are secured repo-based rates, while EFFR/OBFR are unsecured bank funding rates. These should not be interpreted as a single market signal without context.'
  ),
  (
    'ON RRP / SRP Facility Usage',
    'Federal Reserve Bank of New York',
    'https://www.newyorkfed.org/markets/desk-operations/reverse-repo',
    'https://markets.newyorkfed.org/api/rp/all/all/results/lastTwoWeeks.json',
    'business_daily',
    1,
    false,
    'Recent operation results can be affected by small-value exercises and NY Fed API availability.'
  ),
  (
    'Primary Dealer Positions',
    'Federal Reserve Bank of New York',
    'https://www.newyorkfed.org/markets/primarydealers',
    'https://markets.newyorkfed.org/api/pd/get/PDPOSGST-TOT.json',
    'weekly',
    7,
    false,
    'Primary dealer series are weekly and may lag the observation week.'
  ),
  (
    'Primary Dealer Transactions',
    'Federal Reserve Bank of New York',
    'https://www.newyorkfed.org/markets/primarydealers',
    'https://markets.newyorkfed.org/api/pd/get/PDGSWOEXTTOT.json',
    'weekly',
    7,
    false,
    'Transaction series are weekly aggregates and should not be interpreted as real-time flow.'
  ),
  (
    'Repo Financing',
    'Federal Reserve Bank of New York',
    'https://www.newyorkfed.org/markets/primarydealers',
    'https://markets.newyorkfed.org/api/pd/get/PDSORA-UTSETTOT.json',
    'weekly',
    7,
    false,
    'Repo financing data is a primary dealer survey series with weekly reporting cadence.'
  ),
  (
    'Settlement Fails',
    'Federal Reserve Bank of New York',
    'https://www.newyorkfed.org/markets/primarydealers',
    'https://markets.newyorkfed.org/api/pd/get/PDFTD-USTET.json',
    'weekly',
    7,
    false,
    'Fails to deliver and receive require multiple NY Fed series for a complete view.'
  ),
  (
    'SOMA Holdings',
    'Federal Reserve Bank of New York',
    'https://www.newyorkfed.org/markets/soma-holdings',
    'https://markets.newyorkfed.org/api/soma/summary.json',
    'weekly',
    7,
    false,
    'SOMA summary is a weekly holdings snapshot and may not capture intraweek activity.'
  ),
  (
    'Auction Calendar and Results',
    'U.S. Department of the Treasury',
    'https://treasurydirect.gov/auctions/upcoming/',
    'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query',
    'business_daily',
    1,
    false,
    'Auction calendar and result fields can update on different schedules around announcement and auction dates.'
  ),
  (
    'Market Share',
    'Federal Reserve Bank of New York',
    'https://www.newyorkfed.org/markets/primarydealers',
    'https://markets.newyorkfed.org/api/marketshare',
    'quarterly',
    45,
    false,
    'Market share is lower-frequency and can have nested API payload shapes by channel and period.'
  ),
  (
    'SME / Policy Expectations',
    'Federal Reserve Bank of New York',
    'https://www.newyorkfed.org/microeconomics/survey-market-expectations',
    null,
    'periodic',
    30,
    true,
    'Survey of Market Expectations currently requires a manually downloaded Excel or CSV file.'
  ),
  (
    'SEC 13F Holdings',
    'U.S. Securities and Exchange Commission',
    'https://www.sec.gov/edgar/search/',
    'https://data.sec.gov/submissions/',
    'quarterly',
    45,
    false,
    '13F filings are delayed regulatory disclosures and do not represent current holdings.'
  )
on conflict (name) do update set
  provider = excluded.provider,
  official_url = excluded.official_url,
  api_endpoint = excluded.api_endpoint,
  update_frequency = excluded.update_frequency,
  expected_lag_days = excluded.expected_lag_days,
  is_manual = excluded.is_manual,
  limitation_note = excluded.limitation_note,
  updated_at = now();
-- AI commentary cache for production-safe DeepSeek analysis
create extension if not exists pgcrypto;

create table if not exists ai_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  analysis_json jsonb not null,
  model text,
  source_data_timestamp text,
  created_at timestamptz not null default now()
);
create index if not exists ai_analysis_cache_page_created_idx
  on ai_analysis_cache (page_key, created_at desc);
