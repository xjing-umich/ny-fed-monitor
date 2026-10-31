-- Run against an isolated local PostgreSQL instance after applying the migration.
begin;
insert into public.company_interim_disclosures
(ticker,cik,accession_number,source_url,source_filed_at,source_accepted_at,parser_version,status,financial_document,report_period_end,payload)
values ('PDD','1737806','0000000000-26-000001','https://www.sec.gov/Archives/edgar/data/1737806/test.htm','2026-08-25','2026-08-25T19:00:00Z','test','supported',true,'2026-06-30','{"currency":"CNY"}');
set local role service_role;
do $$ begin
 if (select count(*) from public.company_interim_disclosures) <> 1 then raise exception 'service read failed'; end if;
 if (select source_accepted_at from public.company_interim_disclosures where ticker='PDD') is distinct from '2026-08-25T19:00:00Z'::timestamptz then raise exception 'acceptance chronology not retained'; end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('anon','public.company_interim_disclosures','select') or has_table_privilege('authenticated','public.company_interim_disclosures','select') then raise exception 'source evidence exposed to client roles'; end if;
 if not (select relrowsecurity from pg_class where oid='public.company_interim_disclosures'::regclass) then raise exception 'RLS absent'; end if;
 begin
  insert into public.company_interim_disclosures(ticker,cik,accession_number,source_url,source_filed_at,parser_version,status)
  values('BAD','1','bad','https://www.sec.gov/Archives/edgar/data/1/test.htm',current_date,'test','supported');
  raise exception 'supported source accepted without evidence';
 exception when check_violation then null; end;
end $$;
rollback;
