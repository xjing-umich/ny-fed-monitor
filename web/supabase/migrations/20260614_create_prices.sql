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
