-- 拆除 DeepSeek AI 层: drop ai_analysis_cache(DeepSeek 评论缓存表,按 page_key 缓存 /zh 等页面的 AI 评论)。
-- AI 层(src/lib/ai/、/api/ai-analysis、refresh-ai-analysis 路由及前端组件)已于 2026-07-18 拆除,此表随之废弃。
-- 注意: 本迁移仅在被应用时生效(supabase db push 或 SQL 编辑器手动执行),不会自动执行;未应用前旧表数据保留不动。
drop table if exists public.ai_analysis_cache;
notify pgrst, 'reload schema';
