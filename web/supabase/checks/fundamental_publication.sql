-- Run only in the isolated test cluster, after the queue migration.
begin;
set local role service_role;
insert into public.fundamental_publications(ticker,fingerprint,generation)
values('MSFT','old','00000000-0000-0000-0000-000000000001');
update public.fundamental_publications set fingerprint='new', generation='00000000-0000-0000-0000-000000000002' where ticker='MSFT';
update public.fundamental_publications set pending=false where ticker='MSFT' and generation='00000000-0000-0000-0000-000000000001';
do $$ begin
  if not (select pending from public.fundamental_publications where ticker='MSFT') then
    raise exception 'An old refresh acknowledged a newer generation';
  end if;
end $$;
reset role;
do $$ begin
  if has_table_privilege('anon','public.fundamental_publications','SELECT')
    or has_table_privilege('authenticated','public.fundamental_publications','UPDATE') then
    raise exception 'Publication queue leaked to public roles';
  end if;
end $$;
rollback;
