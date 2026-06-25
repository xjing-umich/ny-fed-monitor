-- 宏观快照(单行,id=1)。
-- 目的: 把 buildAllSections() 实时抓取+分析得到的整段 DataPayload 物化为一行 JSONB,
--       让 /macro 与 /macro/[indicator] 改读快照,**构建期不再实时抓外部 API**
--       (NY Fed / FRED / Treasury)→ 杜绝静态导出 60s 超时导致的部署失败。
-- 写入: scripts/macro-ingest.ts(npm run macro:ingest / 定时 GitHub Action,整体重写)。
-- 读取: src/lib/macroSnapshot.ts readMacroSnapshot()。
-- 降级: 表缺失/未填充时,/macro 页优雅显示"刷新中"(非 404、非抛错、不实时抓),可随时部署。
-- 部署: 在 Supabase SQL Editor 执行本文件,然后 npm run macro:ingest 填充。

create table if not exists macro_snapshot (
  id int primary key default 1,
  payload jsonb not null,
  as_of text not null default '',
  computed_at timestamptz not null default now(),
  constraint macro_snapshot_singleton check (id = 1)
);
