-- 共同持仓快照(ticker-keyed, 每 (ticker, co_ticker) 一行 = 同时持有两票的机构数)。
-- 目的: 个股页"持有 X 的这些人还共同重仓 Y"一行, 零运行期 fan-out。
-- 写入: scripts/lib/computeConsensus.ts(npm run consensus, 复用内存中的 holderScan)。
-- 读取: src/lib/managers/consensusRead.ts readCoOwnership(ticker)。
-- 回退: 表缺失/未填充 → 该节不渲染(优雅降级, 非破坏, 可随时部署)。
-- 部署: 在 Supabase SQL Editor 执行本文件, 然后跑 npm run consensus 填充。
create table if not exists consensus_coownership (
  ticker text not null,
  co_ticker text not null,
  co_issuer text,
  shared_holders int not null default 0,
  co_total_value bigint not null default 0,
  computed_at timestamptz not null default now(),
  primary key (ticker, co_ticker)
);

create index if not exists consensus_coownership_ticker_idx
  on consensus_coownership (ticker, shared_holders desc, co_total_value desc);
