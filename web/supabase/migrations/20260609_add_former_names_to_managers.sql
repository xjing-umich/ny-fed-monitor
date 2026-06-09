-- web/supabase/migrations/20260609_add_former_names_to_managers.sql
-- 实体别名解析层:EDGAR 基金曾用名(formerNames)。可空、默认 null,纯增列,不影响现有读取
-- (manager_index RPC / mapIndexRows 仍只选既有列)。应用层别名解析读静态 former-names.json,
-- 本列为双写一致性/将来 DB 侧消费预留(spec §4.2)。
alter table managers add column if not exists former_names text[] default null;
