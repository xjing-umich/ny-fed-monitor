-- watchdog 成本护栏:只读库体积,security definer 供 service_role 调用。
create or replace function public.db_size_bytes()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select pg_database_size(current_database());
$$;

-- security-definer 函数默认给 PUBLIC 授予 EXECUTE(create 不会重置),不 revoke 则经 PostgREST
-- 可被 anon/authenticated 匿名调用。先收回 PUBLIC,再仅授 service_role(watchdog 用 service key 调)。
revoke execute on function public.db_size_bytes() from public;
grant execute on function public.db_size_bytes() to service_role;
