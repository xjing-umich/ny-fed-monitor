-- split_adjustments:13F 股数的拆股换算系数(派生数据,可整表重算)。
-- 上季股数 × factor = 本季口径。由 13F 入库后的共识步骤(scripts/lib/computeConsensus.ts)每次全量重算;
-- 只存派生结果,holdings 里的 SEC 原始股数不改。见 web/src/lib/managers/splitAdjust.ts。
create table if not exists split_adjustments (
  cusip text not null,
  from_period date not null,
  to_period date not null,
  ticker text,
  factor numeric not null check (factor > 0),
  source text not null check (source in ('table','inferred')),
  evidence jsonb not null,
  computed_at timestamptz not null,
  primary key (cusip, from_period, to_period)
);
create index if not exists split_adjustments_to_period_idx on split_adjustments (to_period);
alter table split_adjustments enable row level security;

-- manager_quarter_summary:每位经理最新季对上季的汇总(按金额判定、前 5 笔、计数、清仓名单)。
-- 列表页 /investors 读它(取代 RPC manager_qoq);详情页用同一个纯函数现算,口径一致。
create table if not exists manager_quarter_summary (
  cik text primary key references managers(cik) on delete cascade,
  period date not null,
  prior_period date not null,
  latest_value numeric not null,
  prior_value numeric not null,
  latest_count int not null,
  prior_count int not null,
  net_flow_usd numeric not null,
  verdict text not null check (verdict in ('buying','selling','mixed')),
  count_verdict text not null check (count_verdict in ('buying','selling','mixed')),
  counts jsonb not null,
  top_moves jsonb not null,
  exits jsonb not null,
  computed_at timestamptz not null
);
alter table manager_quarter_summary enable row level security;

notify pgrst, 'reload schema';
