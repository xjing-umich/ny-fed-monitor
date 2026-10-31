do $$
begin
 if not(select relrowsecurity from pg_class where oid='public.official_financial_periods'::regclass) then raise exception 'Official source table must be private';end if;
 insert into official_financial_periods(ticker,cik,issuer_identifier,identifier_scheme,reporting_currency,accounting_basis,
  source_kind,source_document_id,source_sha256,source_url,source_landing_url,source_accession,source_published_at,
  source_report_period_end,source_retrieved_at,period_start,period_end,fiscal_period,is_comparative,consolidation_scope,
  share_basis,valuation_eligible,valuation_blockers,metrics,raw_facts)
 values('IBN','0001103838','0001103838','CIK','INR','Indian-GAAP','sec_20f_html',repeat('a',64),repeat('a',64),
  'https://www.sec.gov/Archives/edgar/data/1103838/fixture.htm','https://data.sec.gov/submissions/CIK0001103838.json',
  '0000950103-26-010820','2026-07-20','2026-03-31',now(),'2025-04-01','2026-03-31','FY',false,'consolidated',
  'issuer_ordinary',false,'["fx_conversion_required","adr_conversion_required"]','{"total_income":3121183593000,"total_assets":29144979720000,"profit_loss":579362507000,"profit_loss_attributable_to_owners":542077028000,"operating_cash_flow":673254189000}','{}');
 begin update official_financial_periods set metrics=metrics-'operating_cash_flow';raise exception 'incomplete annual coverage accepted';exception when check_violation then null;end;
 begin update official_financial_periods set metrics=metrics||'{"revenue":3121183593000}'::jsonb;raise exception 'bank gross income relabeled revenue';exception when check_violation then null;end;
 begin update official_financial_periods set reporting_currency='USD';raise exception 'currency mismatch accepted';exception when check_violation then null;end;
 begin update official_financial_periods set valuation_eligible=true;raise exception 'native valuation accepted';exception when check_violation then null;end;
 begin update official_financial_periods set accounting_basis='US-GAAP';raise exception 'basis mismatch accepted';exception when check_violation then null;end;
 begin update official_financial_periods set ticker='OZK';raise exception 'pending PDF issuer accepted';exception when check_violation then null;end;
 begin update official_financial_periods set source_sha256=repeat('b',64);raise exception 'source version mismatch accepted';exception when check_violation then null;end;
 begin update official_financial_periods set is_comparative=true;raise exception 'comparison identity mismatch accepted';exception when check_violation then null;end;
 begin update official_financial_periods set period_start='2026-01-01';raise exception 'nonannual period accepted';exception when check_violation then null;end;
 if exists(select 1 from company_fundamentals_periods) or exists(select 1 from company_fundamentals_latest) or exists(select 1 from sec_native_financial_periods) then raise exception 'Other financial tables mutated';end if;
end $$;
