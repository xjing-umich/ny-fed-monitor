-- 通用单值利率的 last-good 存储。首个用途:DGS10(10年期国债),供估值贴现带在 live FRED
-- 超时/不可达时回退锚定(graph-CSV 端点慢, 6s 硬超时在生产 CI 也常失败 → 否则全表估值退化
-- 为未锚定 9–11% 回退带)。scripts/valuation-ingest.ts 抓取成功后 upsert; getLatestDgs10 读回退。
-- 将来其它单值利率(如 DGS2)可复用同表。
create table if not exists market_rates (
  series_id  text primary key,
  value      double precision not null,
  as_of      date not null,
  updated_at timestamptz not null default now()
);
