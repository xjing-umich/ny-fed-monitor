-- watchdog 成本护栏:只读库体积,security definer 供 service_role 调用。
create or replace function public.db_size_bytes()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select pg_database_size(current_database());
$$;

grant execute on function public.db_size_bytes() to service_role;
