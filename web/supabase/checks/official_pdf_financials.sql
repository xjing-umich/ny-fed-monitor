set DateStyle='SQL, DMY';
update official_financial_periods set source_pdf_extractor=source_pdf_extractor where ticker='OZK';
set DateStyle='ISO, MDY';
do $$
begin
 if (select count(*) from official_financial_periods where ticker in ('OZK','TRMLF'))<>4 then raise exception 'PDF annual rows not admitted';end if;
 if (select count(*) from official_financial_periods where ticker not in ('OZK','TRMLF'))<>6
  or exists((select to_jsonb(t)-'source_pdf_page_count'-'source_pdf_extractor' from official_financial_periods t where ticker not in ('OZK','TRMLF')) except (select data from pdf_fixture_legacy_before)) then raise exception 'Legacy official source rows changed';end if;
 if not(select relrowsecurity from pg_class where oid='official_financial_periods'::regclass) or exists(select from pg_policy where polrelid='official_financial_periods'::regclass) then raise exception 'PDF source table is not private';end if;
 begin update official_financial_periods set reporting_currency='CAD' where ticker='OZK';raise exception 'currency mismatch admitted';exception when check_violation then null;end;
 begin update official_financial_periods set source_url='https://evil.invalid/annual.pdf' where ticker='TRMLF';raise exception 'untrusted source admitted';exception when check_violation then null;end;
 begin update official_financial_periods set source_accession='fake-sec-accession' where ticker='OZK';raise exception 'FDIC masquerades as SEC';exception when check_violation then null;end;
 begin update official_financial_periods set metrics=metrics||'{"profit_loss_attributable_to_owners":1}'::jsonb where ticker in('OZK','TRMLF');raise exception 'invented owner profit admitted';exception when check_violation then null;end;
 begin update official_financial_periods set metrics=metrics||'{"revenue":1}'::jsonb where ticker='OZK';raise exception 'generic bank revenue admitted';exception when check_violation then null;end;
 begin update official_financial_periods set metrics=metrics||'{"total_liabilities":1}'::jsonb where ticker='TRMLF';raise exception 'unreported liabilities admitted';exception when check_violation then null;end;
 begin update official_financial_periods set metrics=metrics-'operating_cash_flow' where ticker='OZK';raise exception 'missing CFO admitted';exception when check_violation then null;end;
 begin update official_financial_periods set valuation_eligible=true where ticker='OZK';raise exception 'PDF valuation enabled';exception when check_violation then null;end;
 begin update official_financial_periods set source_pdf_page_count=null where ticker='OZK';raise exception 'missing metadata admitted';exception when check_violation then null;end;
 begin update official_financial_periods set source_pdf_page_count=201 where ticker='TRMLF';raise exception 'page budget bypass';exception when check_violation then null;end;
 begin update official_financial_periods set source_pdf_extractor='unknown' where ticker='OZK';raise exception 'unknown extraction provenance admitted';exception when check_violation then null;end;
 begin update official_financial_periods set source_published_at=null where ticker='TRMLF';raise exception 'publication absent';exception when check_violation then null;end;
 begin update official_financial_periods set raw_facts=raw_facts-'total_assets' where ticker='OZK';raise exception 'missing field evidence admitted';exception when check_violation then null;end;
 begin update official_financial_periods set raw_facts=jsonb_set(raw_facts,'{total_assets,value}','1') where ticker='TRMLF';raise exception 'evidence/value mismatch admitted';exception when check_violation then null;end;
 begin update official_financial_periods set raw_facts=jsonb_set(raw_facts,'{basic_eps,scale}','1000') where ticker='OZK';raise exception 'EPS scale mismatch admitted';exception when check_violation then null;end;
 begin update official_financial_periods set raw_facts=jsonb_set(raw_facts,'{total_assets,unit}','"USD"') where ticker='TRMLF';raise exception 'evidence currency mismatch admitted';exception when check_violation then null;end;
 begin update official_financial_periods set raw_facts=jsonb_set(raw_facts,'{total_assets,unit}','null') where ticker='TRMLF';raise exception 'null evidence currency admitted';exception when check_violation then null;end;
 begin update official_financial_periods set raw_facts=jsonb_set(raw_facts,'{total_assets,source_locator}','"pdf-page:199/line:1/period:2025-12-31"') where ticker='TRMLF';raise exception 'nonexistent PDF page admitted';exception when check_violation then null;end;
 if exists(select from company_fundamentals_periods) or exists(select from company_fundamentals_latest) or exists(select from sec_native_financial_periods) then raise exception 'Other financial tables mutated';end if;
end $$;
grant select on official_financial_periods to pdf_fixture_anon;
set role pdf_fixture_anon;
do $$ begin if exists(select from official_financial_periods) then raise exception 'Anonymous role can read source rows';end if;end $$;
reset role;

do $$ begin
 if has_function_privilege('anon','public.official_pdf_evidence_matches(jsonb,jsonb,integer,text,text,date)','EXECUTE')
 or has_function_privilege('authenticated','public.official_pdf_evidence_matches(jsonb,jsonb,integer,text,text,date)','EXECUTE')
 or not has_function_privilege('service_role','public.official_pdf_evidence_matches(jsonb,jsonb,integer,text,text,date)','EXECUTE') then
  raise exception 'PDF validator execution must be restricted to owner/service_role despite default grants';
 end if;
end $$;
