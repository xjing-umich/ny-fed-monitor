-- 个股页持有人快照(ticker-keyed,每经理一行)。
-- 目的: 替代个股页对 34 户逐个 getManagerDetail 的 ~100 次/页 Supabase 往返
--       (该扇出是构建期预渲染压力 → 假 404 的成因之一)。
-- 写入: scripts/lib/computeConsensus.ts(npm run consensus,每次摄取后整体重算)。
-- 读取: src/lib/managers/consensusRead.ts readStockHolders(ticker)。
-- 回退: 表缺失/未填充时,个股页自动退回逐户扫描(非破坏,可随时部署)。
-- 部署: 在 Supabase SQL Editor 执行本文件,然后跑 npm run consensus 填充。

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

-- 个股页持有人数趋势快照(每 ticker×period 一行 = 该季持有本票的人数),供 8 季趋势图。
create table if not exists consensus_stock_trend (
  ticker text not null,
  period date not null,
  holder_count int not null default 0,
  computed_at timestamptz not null default now(),
  primary key (ticker, period)
);

create index if not exists consensus_stock_trend_ticker_idx
  on consensus_stock_trend (ticker, period);
