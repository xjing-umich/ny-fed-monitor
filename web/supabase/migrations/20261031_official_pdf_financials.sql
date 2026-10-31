-- Extend the applied #273 private source table. No legacy USD writes or valuation activation.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

-- Locate only the two constraints from the reviewed original migration. Refuse
-- an unexpected schema instead of dropping constraints by generated ordinal names.
do $$
declare core_names text[]; issuer_names text[];
begin
 select array_agg(conname) into core_names from pg_constraint
 where conrelid='public.official_financial_periods'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%profit_loss_attributable_to_owners%'
 and pg_get_constraintdef(oid) like '%total_income%' and pg_get_constraintdef(oid) like '%metrics%';
 select array_agg(conname) into issuer_names from pg_constraint
 where conrelid='public.official_financial_periods'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%HKHHF%' and pg_get_constraintdef(oid) like '%source_kind%'
 and pg_get_constraintdef(oid) like '%issuer_identifier%';
 if coalesce(cardinality(core_names),0)<>1 or coalesce(cardinality(issuer_names),0)<>1 then
  raise exception 'Unexpected official annual source constraint schema';
 end if;
 execute format('alter table public.official_financial_periods drop constraint %I, drop constraint %I',core_names[1],issuer_names[1]);
end $$;

alter table public.official_financial_periods
 add column source_pdf_page_count integer,
 add column source_pdf_extractor text;

-- Pure validation of private PDF evidence; no table access or elevated rights.
create function public.official_pdf_evidence_matches(p_metrics jsonb,p_facts jsonb,p_pages integer,p_currency text,p_ticker text,p_end date)
returns boolean language plpgsql immutable strict as $$
declare field text; value jsonb; evidence jsonb; locator text; page_number integer; expected_unit text; expected_scale integer;
begin
 if jsonb_typeof(p_metrics)<>'object' or jsonb_typeof(p_facts)<>'object' then return false;end if;
 for field,value in select * from jsonb_each(p_metrics) loop
  evidence:=p_facts->field;
  if coalesce(jsonb_typeof(evidence),'')<>'object' or jsonb_typeof(value)<>'number' then return false;end if;
  if not(evidence ?& array['value','unit','scale','raw_value','source_label','source_locator'])
   or evidence->'value'<>value or jsonb_typeof(evidence->'scale')<>'number' or jsonb_typeof(evidence->'unit')<>'string'
   or jsonb_typeof(evidence->'raw_value')<>'string' or char_length(evidence->>'raw_value') not between 1 and 256
   or jsonb_typeof(evidence->'source_label')<>'string' or char_length(evidence->>'source_label') not between 1 and 2048 then return false;end if;
  if field in ('basic_eps','diluted_eps') then expected_unit:=p_currency||'/shares';expected_scale:=1;
  elsif field in ('weighted_average_shares','diluted_weighted_average_shares','common_shares_issued','common_shares_issued_and_outstanding') then
   expected_unit:='shares';expected_scale:=case when p_ticker='OZK' and field in ('weighted_average_shares','diluted_weighted_average_shares') then 1000 else 1 end;
  else expected_unit:=p_currency;expected_scale:=1000;end if;
  if evidence->>'unit'<>expected_unit or (evidence->>'scale')::numeric<>expected_scale then return false;end if;
  locator:=evidence->>'source_locator';
  if coalesce(locator,'') !~ ('^pdf-page:[1-9][0-9]{0,2}/lines?:[1-9][0-9]*(-[1-9][0-9]*)?/period:'||to_char(p_end,'YYYY-MM-DD')||'$') then return false;end if;
  page_number:=substring(locator from '^pdf-page:([1-9][0-9]{0,2})/')::integer;
  if page_number not between 1 and p_pages then return false;end if;
 end loop;
 if exists(select from jsonb_object_keys(p_facts) as k where not(p_metrics ? k)) then return false;end if;
 return true;
end $$;
revoke all on function public.official_pdf_evidence_matches(jsonb,jsonb,integer,text,text,date) from public;
grant execute on function public.official_pdf_evidence_matches(jsonb,jsonb,integer,text,text,date) to service_role;

alter table public.official_financial_periods
 add constraint official_annual_core_metrics_check check (
  metrics ?& array['total_assets','profit_loss','operating_cash_flow']
  and jsonb_typeof(metrics->'total_assets')='number' and jsonb_typeof(metrics->'profit_loss')='number'
  and jsonb_typeof(metrics->'operating_cash_flow')='number'
  and case ticker
   when 'IBN' then metrics ?& array['total_income','profit_loss_attributable_to_owners'] and not(metrics ? 'revenue')
    and jsonb_typeof(metrics->'total_income')='number' and jsonb_typeof(metrics->'profit_loss_attributable_to_owners')='number'
   when 'OZK' then metrics ?& array['net_interest_income','noninterest_income','net_income_available_to_common']
    and not(metrics ? 'revenue') and not(metrics ? 'profit_loss_attributable_to_owners')
   when 'TRMLF' then metrics ? 'revenue' and jsonb_typeof(metrics->'revenue')='number'
    and not(metrics ? 'profit_loss_attributable_to_owners') and not(metrics ? 'total_liabilities')
   else metrics ?& array['revenue','profit_loss_attributable_to_owners']
    and jsonb_typeof(metrics->'revenue')='number' and jsonb_typeof(metrics->'profit_loss_attributable_to_owners')='number'
  end
 ),
 add constraint official_annual_issuer_source_check check (
  (ticker='IBN' and cik='0001103838' and issuer_identifier='0001103838' and identifier_scheme='CIK'
   and reporting_currency='INR' and accounting_basis='Indian-GAAP' and source_kind='sec_20f_html'
   and source_accession is not null and source_url like 'https://www.sec.gov/Archives/edgar/data/1103838/%')
  or (ticker='HMRZF' and cik='0001396282' and issuer_identifier='529900O5RR7R39FRDM42' and identifier_scheme='LEI'
   and reporting_currency='SEK' and accounting_basis='IFRS' and source_kind='official_esef' and source_accession is null
   and (source_url like 'https://hmgroup.com/%' or source_url like 'https://www.hmgroup.com/%'))
  or (ticker='HKHHF' and cik='0001142231' and issuer_identifier='724500M1WJLFM9TYBS04' and identifier_scheme='LEI'
   and reporting_currency='EUR' and accounting_basis='IFRS' and source_kind='official_inline_viewer_copy' and source_accession is null
   and source_url like 'https://staticcontents.investis.com/html/h/heineken-holding/%')
  or (ticker='OZK' and cik='0001569650' and issuer_identifier='110' and identifier_scheme='FDIC_CERT'
   and reporting_currency='USD' and accounting_basis='US-GAAP' and source_kind='official_fdic_annual_pdf' and source_accession is null
   and source_url ~ '^https://securitiesfilings[.]fdicconnect[.]fdic[.]gov/api/instflng/[1-9][0-9]*/attachment/[1-9][0-9]*$'
   and source_landing_url='https://securitiesfilings.fdicconnect.fdic.gov/api/instflng/cert/110')
  or (ticker='TRMLF' and cik='0002071881' and issuer_identifier='89156V106' and identifier_scheme='CUSIP'
   and reporting_currency='CAD' and accounting_basis='IFRS' and source_kind='official_issuer_annual_pdf' and source_accession is null
   and source_url ~ '^https://tourmaline[.]cdn[.]prismic[.]io/tourmaline/[^/?#]+[.]pdf$'
   and source_landing_url='https://www.tourmalineoil.com/investors/financial-reports')
 ),
 add constraint official_pdf_provenance_check check (
  (source_kind in ('official_fdic_annual_pdf','official_issuer_annual_pdf') and source_pdf_page_count is not null
   and source_pdf_page_count between 1 and 200 and source_pdf_extractor is not null
   and source_pdf_extractor ~ '^unpdf-[0-9]+[.][0-9]+[.][0-9]+/positioned-lines-v[0-9]+$'
   and source_published_at is not null
   and public.official_pdf_evidence_matches(metrics,raw_facts,source_pdf_page_count,reporting_currency,ticker,period_end))
  or (source_kind not in ('official_fdic_annual_pdf','official_issuer_annual_pdf')
   and source_pdf_page_count is null and source_pdf_extractor is null)
 );
comment on column public.official_financial_periods.source_pdf_page_count is 'Actual full original PDF page count, never fixture/excerpt page count. Atomic capability gate for PDF source writers.';
comment on column public.official_financial_periods.source_pdf_extractor is 'Pinned decoder and positioned-line schema version; financial SHA hashes original PDF bytes before extraction.';
commit;
