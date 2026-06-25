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

-- 共识物化快照(ticker-keyed): 替代请求时全表扫。每次摄取后整体重算。
create table if not exists consensus_holdings (
  ticker text primary key,
  issuer text,
  holder_count int not null default 0,
  total_value bigint not null default 0,
  computed_at timestamptz not null default now()
);
create index if not exists consensus_holdings_rank_idx
  on consensus_holdings (holder_count desc, total_value desc);

create table if not exists consensus_moves (
  ticker text not null,
  direction text not null,            -- 'bought' | 'sold'
  issuer text,
  manager_count int not null default 0,
  net_value bigint not null default 0,
  dominant_kind text,
  computed_at timestamptz not null default now(),
  primary key (ticker, direction)
);
create index if not exists consensus_moves_rank_idx
  on consensus_moves (direction, manager_count desc, net_value desc);
alter table consensus_moves add column if not exists dominant_kind text;

-- 个股页持有人快照(ticker-keyed,每经理一行): 替代个股页对 34 户逐个 getManagerDetail 的
-- ~100 次/页往返。当前持有人行带 value/shares/weight + 本季 kind; 清仓者发 kind='exited' 零值行
-- (不进持有人表,仅供"本季清仓 N 人"计数)。每次摄取后 npm run consensus 整体重算。
create table if not exists consensus_stock_holders (
  ticker text not null,
  cik text not null,
  slug text not null,
  person text not null,
  issuer text,
  value bigint not null default 0,
  shares numeric not null default 0,
  weight numeric not null default 0,
  prior_weight numeric,               -- 上季同 ticker 组合权重(QoQ 箭头); null=无上季持仓
  kind text,                          -- 'new'|'increased'|'decreased'|'exited'|null(持有未变)
  period date,
  filed_at date,
  computed_at timestamptz not null default now(),
  primary key (ticker, cik)
);
create index if not exists consensus_stock_holders_ticker_idx
  on consensus_stock_holders (ticker, value desc);
alter table consensus_stock_holders add column if not exists prior_weight numeric;

-- 个股页持有人数趋势快照: 每 (ticker, period) 一行 = 该季持有本票的 superinvestor 人数。
-- 供 8 季趋势图,取代逐户拉完整 filings 历史统计。每次摄取后 npm run consensus 整体重算。
create table if not exists consensus_stock_trend (
  ticker text not null,
  period date not null,
  holder_count int not null default 0,
  computed_at timestamptz not null default now(),
  primary key (ticker, period)
);
create index if not exists consensus_stock_trend_ticker_idx
  on consensus_stock_trend (ticker, period);

-- ── manager_index() ────────────────────────────────────────────────────────────
-- 经理人索引快路径:每位经理人返回其最新 filing 的概要 + 最大持仓 issuer,一次查询
-- 取代应用层对 34 户逐个查 filings+holdings 的扇出(getManagerIndex 的回退)。
-- 该函数在根 layout 对每个页面渲染都会被调用,故对全站取数/构建预渲染/ISR 重验都关键。
-- 列与 supabase.ts 的 IndexRow 一一对应(cik/slug/name/person/period/total_value/
-- holding_count/top_holding)。函数缺失时应用自动回退,故新增此函数是纯加速、无破坏。
-- 部署:在 Supabase SQL Editor 执行本段;若 PostgREST 仍报找不到函数,执行
--   notify pgrst, 'reload schema';
create or replace function manager_index()
returns table (
  cik text,
  slug text,
  name text,
  person text,
  period date,
  total_value bigint,
  holding_count int,
  top_holding text
)
language sql
stable
as $$
  select
    m.cik, m.slug, m.name, m.person,
    f.period, f.total_value, f.holding_count,
    (
      select h.issuer
      from holdings h
      where h.filing_id = f.id
      order by h.value desc
      limit 1
    ) as top_holding
  from managers m
  join lateral (
    select id, period, total_value, holding_count
    from filings
    where cik = m.cik
    order by period desc
    limit 1
  ) f on true;
$$;

-- ── manager_qoq() ───────────────────────────────────────────────────────────
-- 投资人列表页季度变化信号:每户返回 市值环比% / 持仓数Δ / 整体买卖向 / 本季最大动作。
-- 仅 /investors 列表页调用一次(非根布局热路径),库内一次算完 holdings diff,故对全站
-- 取数零影响。函数缺失时应用层 getManagerQoQ 返回空 → 列表优雅退回无 QoQ。
-- 口径与详情页 getManagerDetail 的 changes/verdict 一致:
--   buy=new+increased, sell=exited+decreased(按持股数 shares 判定真实买卖,不受股价漂移影响)。
-- 部署:Supabase SQL Editor 执行;若 PostgREST 报找不到函数 → notify pgrst, 'reload schema';
create or replace function manager_qoq()
returns table (
  cik text,
  value_delta_pct double precision,   -- null: 无 prior 或 prior.total_value=0
  count_delta int,                     -- null: 无 prior
  verdict text,                        -- 'buying' | 'selling' | 'mixed' | null(无prior)
  top_move_issuer text,                -- null: 无 prior 或无变动
  top_move_kind text                   -- 'new'|'exited'|'increased'|'decreased' | null
)
language sql
stable
as $$
  with latest as (
    select distinct on (f.cik)
      f.cik, f.id as filing_id, f.period, f.total_value, f.holding_count
    from filings f
    order by f.cik, f.period desc
  ),
  prior as (
    select distinct on (f.cik)
      f.cik, f.id as filing_id, f.total_value, f.holding_count
    from filings f
    join latest l on l.cik = f.cik and f.period < l.period
    order by f.cik, f.period desc
  ),
  hl as (
    select l.cik, h.cusip, h.issuer, h.value, h.shares
    from latest l join holdings h on h.filing_id = l.filing_id
  ),
  hp as (
    select p.cik, h.cusip, h.issuer, h.value, h.shares
    from prior p join holdings h on h.filing_id = p.filing_id
  ),
  diff as (
    select
      coalesce(hl.cik, hp.cik) as cik,
      coalesce(hl.issuer, hp.issuer) as issuer,
      case
        when hp.cusip is null then 'new'
        when hl.cusip is null then 'exited'
        when hl.shares > hp.shares then 'increased'
        when hl.shares < hp.shares then 'decreased'
        else 'unchanged'
      end as kind,
      case
        when hp.cusip is null then coalesce(hl.value, 0)
        when hl.cusip is null then coalesce(hp.value, 0)
        else abs(coalesce(hl.value, 0) - coalesce(hp.value, 0))
      end as impact,
      coalesce(hl.value, 0) as latest_value
    from hl
    full outer join hp on hp.cik = hl.cik and hp.cusip = hl.cusip
  ),
  verdicts as (
    select cik,
      count(*) filter (where kind in ('new','increased'))  as buys,
      count(*) filter (where kind in ('exited','decreased')) as sells
    from diff
    where kind <> 'unchanged'
    group by cik
  ),
  topmove as (
    select distinct on (cik) cik, issuer as top_move_issuer, kind as top_move_kind
    from diff
    where kind <> 'unchanged'
    order by cik, impact desc, latest_value desc
  )
  select
    l.cik,
    case when p.cik is not null and p.total_value > 0
         then (l.total_value - p.total_value)::double precision / p.total_value
         else null end as value_delta_pct,
    case when p.cik is not null
         then l.holding_count - p.holding_count
         else null end as count_delta,
    case when p.cik is null then null
         when coalesce(v.buys,0) > coalesce(v.sells,0) then 'buying'
         when coalesce(v.sells,0) > coalesce(v.buys,0) then 'selling'
         else 'mixed' end as verdict,
    tm.top_move_issuer,
    tm.top_move_kind
  from latest l
  left join prior   p  on p.cik  = l.cik
  left join verdicts v on v.cik = l.cik
  left join topmove tm on tm.cik = l.cik;
$$;

-- ---------------------------------------------------------------------------
-- 价格层（Phase 1C）：每日收盘价多源入库 + 摄取运行记录
-- 见 migrations/20260614_create_prices.sql
-- ---------------------------------------------------------------------------

-- 每日收盘价（多源：'yahoo' | 'stooq' | 'twelvedata'）。store-first：页面只读此表。
create table if not exists prices (
  ticker text not null references securities(ticker),
  date date not null,
  close numeric not null,
  currency text not null default 'USD',
  source text not null,
  as_of timestamptz not null default now(),
  primary key (ticker, date)
);
create index if not exists prices_ticker_date_idx on prices(ticker, date desc);

-- 价格摄取运行记录（镜像 sec_ingest_runs），供运维 + health-watchdog。
create table if not exists price_ingest_runs (
  id bigint generated always as identity primary key,
  run_type text not null,                 -- 'backfill' | 'daily'
  status text not null,                   -- 'running' | 'success' | 'error'
  rows_written int,
  tickers_total int,
  tickers_filled_by_fallback int,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- 宏观快照(单行,id=1): 把 buildAllSections() 实时抓取+分析的整段 DataPayload 物化为一行 JSONB,
-- 让 /macro 页改读快照、构建期不再实时抓外部 API(NY Fed/FRED/Treasury)→ 杜绝静态导出超时。
-- 由 scripts/macro-ingest.ts(定时 Action / npm run macro:ingest)整体重写。
create table if not exists macro_snapshot (
  id int primary key default 1,
  payload jsonb not null,
  as_of text not null default '',
  computed_at timestamptz not null default now(),
  constraint macro_snapshot_singleton check (id = 1)
);
