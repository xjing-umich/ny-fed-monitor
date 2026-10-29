-- Supabase pg_safeupdate 要求 DELETE 带 WHERE;主键非空覆盖完整旧批次。
begin;
create or replace function public.publish_manager_derived(p_splits jsonb,p_summaries jsonb,p_computed_at timestamptz)
returns boolean language plpgsql set search_path=pg_catalog,public as $$
declare
  old_splits jsonb; old_summaries jsonb; new_splits jsonb; new_summaries jsonb;
  latest_stamp timestamptz;
begin
  if p_computed_at is null or jsonb_typeof(p_splits) is distinct from 'array'
    or jsonb_typeof(p_summaries) is distinct from 'array' then
    raise exception 'Derived publication requires arrays and a timestamp' using errcode='23514';
  end if;
  -- 同一发布入口串行;同时阻止中途普通写入混入本次比较/替换。
  perform pg_advisory_xact_lock(748520260);
  lock table public.split_adjustments,public.manager_quarter_summary in share row exclusive mode;
  if exists (
    select 1 from jsonb_populate_recordset(null::public.manager_quarter_summary,p_summaries) s
    full join public.manager_filing_pairs p on s.cik=p.cik
    where s.cik is null or p.cik is null
      or s.latest_filing_id is distinct from p.latest_filing_id or s.prior_filing_id is distinct from p.prior_filing_id
      or s.period is distinct from p.period or s.prior_period is distinct from p.prior_period
      or s.latest_count is distinct from p.latest_count or s.prior_count is distinct from p.prior_count
      or s.latest_count is distinct from p.latest_stored_count or s.prior_count is distinct from p.prior_stored_count
  ) then
    raise exception 'Derived summaries do not match the complete latest filing pairs' using errcode='23514';
  end if;
  -- 先转为表内类型再比较,数字字符串/JSON 键顺序/行顺序不制造假变化。
  select coalesce(jsonb_agg(to_jsonb(r)-'computed_at' order by cusip,from_period,to_period),'[]') into new_splits
    from jsonb_populate_recordset(null::public.split_adjustments,p_splits) r;
  select coalesce(jsonb_agg(to_jsonb(r)-'computed_at' order by cik),'[]') into new_summaries
    from jsonb_populate_recordset(null::public.manager_quarter_summary,p_summaries) r;
  select coalesce(jsonb_agg(to_jsonb(r)-'computed_at' order by cusip,from_period,to_period),'[]') into old_splits
    from public.split_adjustments r;
  select coalesce(jsonb_agg(to_jsonb(r)-'computed_at' order by cik),'[]') into old_summaries
    from public.manager_quarter_summary r;
  if new_splits=old_splits and new_summaries=old_summaries then return false; end if;
  select max(computed_at) into latest_stamp from (
    select computed_at from public.split_adjustments union all select computed_at from public.manager_quarter_summary
  ) stamps;
  if p_computed_at<latest_stamp then
    raise exception 'Older derived computation cannot replace a newer publication' using errcode='23514';
  end if;
  -- 统一由 RPC 写入时间戳,调用方行内时间不参与内容比较或发布身份。
  delete from public.split_adjustments where cusip is not null;
  insert into public.split_adjustments (cusip,from_period,to_period,ticker,factor,source,evidence,computed_at)
    select r.cusip,r.from_period,r.to_period,r.ticker,r.factor,r.source,r.evidence,p_computed_at
    from jsonb_populate_recordset(null::public.split_adjustments,p_splits) r;
  delete from public.manager_quarter_summary where cik is not null;
  insert into public.manager_quarter_summary (cik,period,prior_period,latest_value,prior_value,latest_count,prior_count,net_flow_usd,verdict,count_verdict,counts,top_moves,exits,computed_at,latest_filing_id,prior_filing_id)
    select r.cik,r.period,r.prior_period,r.latest_value,r.prior_value,r.latest_count,r.prior_count,
      r.net_flow_usd,r.verdict,r.count_verdict,r.counts,r.top_moves,r.exits,p_computed_at,r.latest_filing_id,r.prior_filing_id
    from jsonb_populate_recordset(null::public.manager_quarter_summary,p_summaries) r;
  return true;
end;
$$;
revoke all on function public.publish_manager_derived(jsonb,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.publish_manager_derived(jsonb,jsonb,timestamptz) to service_role;
notify pgrst,'reload schema';
commit;
