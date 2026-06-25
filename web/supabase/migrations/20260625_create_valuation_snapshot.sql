-- 估值快照(每 ticker 一行)。
-- 目的: 把"现价相对保守价值带的位置档判定"物化, 让投资人页持仓表按 ticker 廉价读取(~2ms/行),
--       构建期不再逐持仓算估值/抓 SEC → 避免重蹈 macro/FRED 的静态导出超时。
-- 写入: web/scripts/valuation-ingest.ts(npm run valuation:ingest / nightly GitHub Action)。
-- 读取: web/src/lib/valuation/valuationSnapshot.ts readValuationVerdicts()。
-- 约定: 无法估值的 ticker **不入表**(读取侧缺行即"—无数据")。
-- 降级: 表缺失/未填充时, 投资人页优雅退化为无估值叠加(非 404、非抛错), 可随时部署。
-- 部署: 在 Supabase SQL Editor 执行本文件, 然后 npm run valuation:ingest 首次填充。

create table if not exists valuation_snapshot (
  ticker         text primary key,
  verdict_bucket text not null,          -- 'below' | 'within' | 'above'
  in_strike_zone boolean not null default false,
  range_lo       numeric not null,
  range_hi       numeric not null,
  price          numeric not null,
  price_date     date,                   -- 价格 as-of(CLAUDE.md 硬规)
  margin_pct     numeric,                -- 安全边际 vs range_lo
  coverage       text not null,          -- 'full' | 'single_lamp'
  computed_at    timestamptz not null,   -- 该行 ingest 时刻
  payload        jsonb,                  -- 完整 verdict + 留将来复用
  updated_at     timestamptz not null default now()
);
