-- 季度共识报告快照：每季一行。payload 只存数据，文案在渲染时由模板生成。
-- 定稿冻结由写入方保证：report.ts 只在 status='live' 时更新（见 upsert_live_report）。
create table if not exists quarterly_reports (
  period                  date primary key,
  status                  text not null check (status in ('live','final')),
  payload                 jsonb not null,
  payload_hash            text not null,
  coverage_filed          int  not null,
  coverage_total          int  not null,
  valuation_as_of         date,
  first_live_at           timestamptz not null default now(),
  generated_at            timestamptz not null default now(),
  preview_payload         jsonb,
  preview_valuation_as_of date,
  preview_sent_at         timestamptz,
  finalized_at            timestamptz,
  sends                   jsonb not null default '{}'::jsonb
);

-- live 行的写入口：新行插入；已存在且仍为 live 才更新；final 行原样不动。
-- 返回 'inserted' | 'updated' | 'unchanged' | 'frozen'。
create or replace function upsert_live_report(
  p_period date, p_payload jsonb, p_hash text,
  p_filed int, p_total int, p_valuation_as_of date
) returns text language plpgsql as $$
declare cur record;
begin
  select status, payload_hash into cur from quarterly_reports where period = p_period for update;
  if not found then
    insert into quarterly_reports(period, status, payload, payload_hash, coverage_filed, coverage_total, valuation_as_of)
    values (p_period, 'live', p_payload, p_hash, p_filed, p_total, p_valuation_as_of);
    return 'inserted';
  end if;
  if cur.status = 'final' then return 'frozen'; end if;
  if cur.payload_hash = p_hash then return 'unchanged'; end if;
  update quarterly_reports
     set payload = p_payload, payload_hash = p_hash, coverage_filed = p_filed,
         coverage_total = p_total, valuation_as_of = p_valuation_as_of, generated_at = now()
   where period = p_period and status = 'live';
  return 'updated';
end $$;

-- 定稿：只把已预览的 live 行冻结为预览那一份。返回是否成功冻结。
create or replace function finalize_report(p_period date) returns boolean language plpgsql as $$
begin
  update quarterly_reports
     set status = 'final', payload = preview_payload, valuation_as_of = preview_valuation_as_of,
         finalized_at = now()
   where period = p_period and status = 'live' and preview_payload is not null;
  return found;
end $$;
