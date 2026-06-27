-- 估值可靠性列。引擎诊断无红旗(无盈利下滑/高杠杆/DCF不稳/per-share疑错)→ true。
-- strike-zone/below 视图只展示 reliable=true 的"便宜"信号(周期峰值幻觉/高杠杆/ADR算错不据此标便宜)。
-- 既有行默认 true(未重算前不改变行为);scripts/valuation-ingest.ts 重跑后按 verdict.reliable 写入。
-- 部署: 执行本文件, 然后从带闸代码重跑 npm run valuation:ingest。
alter table valuation_snapshot
  add column if not exists reliable boolean not null default true;
