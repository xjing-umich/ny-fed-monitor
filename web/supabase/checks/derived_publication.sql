-- 仅在临时测试库执行:先加载原表迁移及 20261029_atomic_derived_publication.sql。
-- psql "$COMPOUNDER_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f web/supabase/checks/derived_publication.sql
begin;
select 1 / ((not has_function_privilege('anon','publish_manager_derived(jsonb,jsonb,timestamptz)','EXECUTE'))::int);
insert into managers(cik) values ('TEST1');
insert into filings(id,cik,period,filed_at,holding_count) values
  (900001,'TEST1','2026-03-31','2026-05-01',1),
  (900002,'TEST1','2026-06-30','2026-08-01',1);
insert into holdings(filing_id) values (900001),(900002);
do $$
declare
  splits jsonb := '[{"cusip":"TEST","ticker":"TEST","from_period":"2026-03-31","to_period":"2026-06-30","factor":5,"source":"table","evidence":{}}]';
  summaries jsonb := '[{"cik":"TEST1","period":"2026-06-30","prior_period":"2026-03-31","latest_filing_id":900002,"prior_filing_id":900001,"latest_value":500,"prior_value":500,"latest_count":1,"prior_count":1,"net_flow_usd":0,"verdict":"mixed","count_verdict":"mixed","counts":{},"top_moves":[],"exits":[]}]';
  changed boolean;
  rejected boolean;
  first_stamp timestamptz;
begin
  changed := public.publish_manager_derived(splits,summaries,'2026-10-29T00:00:00Z');
  assert changed, '首次完整发布必须标记变化';
  select computed_at into first_stamp from split_adjustments where cusip='TEST';
  assert (select count(*) from current_manager_quarter_summaries())=1, '来源匹配时可读取';

  changed := public.publish_manager_derived(splits,summaries,'2026-10-29T01:00:00Z');
  assert not changed, '只有计算时间改变时不刷新';
  assert (select computed_at from split_adjustments where cusip='TEST')=first_stamp, '无变化不改时间戳';
  assert (select computed_at from manager_quarter_summary where cik='TEST1')=first_stamp, '两表仍是同一发布批次';

  rejected := false;
  begin
    -- 第一表改为 10,第二表违反 verdict check;整次函数调用必须回滚。
    perform public.publish_manager_derived(jsonb_set(splits,'{0,factor}','10'),jsonb_set(summaries,'{0,verdict}','"invalid"'),'2026-10-29T02:00:00Z');
  exception when check_violation then rejected:=true;
  end;
  assert rejected, '第二表约束失败确实发生';
  assert (select factor from split_adjustments where cusip='TEST')=5, '第二表失败不能留下第一表的新系数';
  assert (select computed_at from manager_quarter_summary where cik='TEST1')=first_stamp, '旧汇总保留';

  rejected := false;
  begin perform public.publish_manager_derived(splits,'[]','2026-10-29T02:00:00Z');
  exception when check_violation then rejected:=true;
  end;
  assert rejected, '缺一个应有汇总就拒绝发布';

  changed := public.publish_manager_derived(jsonb_set(splits,'{0,factor}','10'),summaries,'2026-10-29T03:00:00Z');
  assert changed, '没有新 filing,拆股内容改变也标记变化';
  assert (select factor from split_adjustments where cusip='TEST')=10, '新规则结果发布成功';
  assert (select computed_at from split_adjustments where cusip='TEST')=(select computed_at from manager_quarter_summary where cik='TEST1'), '变化后仍同步发布';

  rejected:=false;
  begin perform public.publish_manager_derived(splits,summaries,'2026-10-29T02:00:00Z');
  exception when check_violation then rejected:=true;
  end;
  assert rejected, '较早计算不能覆盖新批次';

  delete from holdings where filing_id=900002;
  assert (select count(*) from current_manager_quarter_summaries())=0, '同一 filing 写入中途失败也不能显示旧汇总';
  rejected:=false;
  begin perform public.publish_manager_derived(splits,summaries,'2026-10-29T04:00:00Z');
  exception when check_violation then rejected:=true;
  end;
  assert rejected, 'holdings 不完整时拒绝派生发布';
  insert into holdings(filing_id) values (900002);
  insert into filings values (900003,'TEST1','2026-09-30','2026-10-29',1);
  assert (select count(*) from current_manager_quarter_summaries())=0, '新申报到达后旧来源汇总不再冒充当前值';
  rejected:=false;
  begin perform public.publish_manager_derived(splits,summaries,'2026-10-29T04:00:00Z');
  exception when check_violation then rejected:=true;
  end;
  assert rejected, '过期 filing 输入拒绝发布';
end;
$$;
rollback;
