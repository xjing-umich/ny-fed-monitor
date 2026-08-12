-- 20260812_manager_index_add_filed_at.sql
-- manager_index() RPC 增列 filed_at(最新 filing 的 SEC 提交日),供投资人列表页
-- 标注"刚申报"信号。生产 RPC 路径优先于应用层 TS 回退,故只改 supabase.ts 不 apply
-- 本迁移则列表页 filedAt 恒为 null(过渡态,非 bug)。
-- 部署:在 Supabase SQL Editor 执行本段;若 PostgREST 仍报找不到函数或旧签名,执行
--   notify pgrst, 'reload schema';
create or replace function manager_index()
returns table (
  cik text,
  slug text,
  name text,
  person text,
  period date,
  filed_at date,
  total_value bigint,
  holding_count int,
  top_holding text
)
language sql
stable
as $$
  select
    m.cik, m.slug, m.name, m.person,
    f.period, f.filed_at, f.total_value, f.holding_count,
    (
      select h.issuer
      from holdings h
      where h.filing_id = f.id
        and h.put_call is null
      order by h.value desc
      limit 1
    ) as top_holding
  from managers m
  join lateral (
    select
      f.id,
      f.period,
      f.filed_at,
      sum(h.value)::bigint as total_value,
      count(*)::int as holding_count
    from filings f
    join holdings h on h.filing_id = f.id and h.put_call is null
    where f.cik = m.cik
    group by f.id, f.period, f.filed_at
    order by f.period desc
    limit 1
  ) f on true;
$$;
