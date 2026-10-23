-- 季度共识报告快照：每季一行。payload 只存数据，文案在渲染时由模板生成。
-- 定稿冻结的两层保证：
--   1) 写入方：upsert_live_report 只更新 status='live' 的行；finalize_report 只冻结预览行。
--   2) 数据库：触发器 quarterly_reports_freeze_guard 拒绝修改 status='final' 行的任何列（sends 除外）。
-- RLS 已启用且不加策略：service role 绕过 RLS，其他角色无访问。
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

alter table quarterly_reports enable row level security;

-- live 行的写入口：新行插入（on conflict 防并发插入竞争）；已存在且仍为 live 才更新；final 行原样不动。
-- 仅当 payload_hash 与 valuation_as_of 都未变时返回 'unchanged'。
-- 返回 'inserted' | 'updated' | 'unchanged' | 'frozen'。
create or replace function upsert_live_report(
  p_period date, p_payload jsonb, p_hash text,
  p_filed int, p_total int, p_valuation_as_of date
) returns text language plpgsql as $$
declare cur record;
begin
  insert into quarterly_reports(period, status, payload, payload_hash, coverage_filed, coverage_total, valuation_as_of)
  values (p_period, 'live', p_payload, p_hash, p_filed, p_total, p_valuation_as_of)
  on conflict (period) do nothing;
  if found then return 'inserted'; end if;

  select status, payload_hash, valuation_as_of into cur
    from quarterly_reports where period = p_period for update;
  if cur.status = 'final' then return 'frozen'; end if;
  if cur.payload_hash = p_hash and cur.valuation_as_of is not distinct from p_valuation_as_of then
    return 'unchanged';
  end if;
  update quarterly_reports
     set payload = p_payload, payload_hash = p_hash, coverage_filed = p_filed,
         coverage_total = p_total, valuation_as_of = p_valuation_as_of, generated_at = now()
   where period = p_period and status = 'live';
  return 'updated';
end $$;

-- 定稿：只把已预览的 live 行冻结为预览那一份（payload、哈希、覆盖率、估值日一并对齐预览）。返回是否成功冻结。
create or replace function finalize_report(p_period date) returns boolean language plpgsql as $$
begin
  update quarterly_reports
     set status = 'final',
         payload = preview_payload,
         payload_hash = md5(preview_payload::text),
         coverage_filed = (preview_payload->'coverage'->>'filed')::int,
         coverage_total = (preview_payload->'coverage'->>'total')::int,
         valuation_as_of = preview_valuation_as_of,
         finalized_at = now()
   where period = p_period and status = 'live' and preview_payload is not null;
  return found;
end $$;

-- 冻结守卫：final 行只允许修改 sends（投递记录）；其余列任一变化即报错。
create or replace function quarterly_reports_freeze_guard() returns trigger language plpgsql as $$
begin
  if old.status = 'final' and (
       new.status is distinct from old.status
    or new.payload is distinct from old.payload
    or new.payload_hash is distinct from old.payload_hash
    or new.coverage_filed is distinct from old.coverage_filed
    or new.coverage_total is distinct from old.coverage_total
    or new.valuation_as_of is distinct from old.valuation_as_of
    or new.first_live_at is distinct from old.first_live_at
    or new.generated_at is distinct from old.generated_at
    or new.preview_payload is distinct from old.preview_payload
    or new.preview_valuation_as_of is distinct from old.preview_valuation_as_of
    or new.preview_sent_at is distinct from old.preview_sent_at
    or new.finalized_at is distinct from old.finalized_at
  ) then
    raise exception 'quarterly_reports % 已定稿，不可修改', old.period;
  end if;
  return new;
end $$;

drop trigger if exists quarterly_reports_freeze_guard on quarterly_reports;
create trigger quarterly_reports_freeze_guard
  before update on quarterly_reports
  for each row execute function quarterly_reports_freeze_guard();
