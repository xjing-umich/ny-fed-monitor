-- Supabase default privileges can grant these roles EXECUTE directly when a
-- function is created. Revoking PUBLIC alone does not remove those grants.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
revoke all on function public.official_pdf_evidence_matches(jsonb,jsonb,integer,text,text,date)
  from public, anon, authenticated;
grant execute on function public.official_pdf_evidence_matches(jsonb,jsonb,integer,text,text,date)
  to service_role;
commit;
