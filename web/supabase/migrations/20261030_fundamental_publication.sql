-- Durable page-refresh intent. A successful HTTP refresh acknowledges only its generation.
create table if not exists public.fundamental_publications (
  ticker text primary key,
  fingerprint text not null,
  pending boolean not null default true,
  generation uuid not null,
  queued_at timestamptz not null default now()
);
alter table public.fundamental_publications enable row level security;
revoke all on public.fundamental_publications from anon, authenticated;
grant select, insert, update, delete on public.fundamental_publications to service_role;
drop policy if exists fundamental_publications_service on public.fundamental_publications;
create policy fundamental_publications_service on public.fundamental_publications
  for all to service_role using (true) with check (true);
