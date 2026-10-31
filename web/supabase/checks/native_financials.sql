-- Run only against a disposable local database (see scripts/tests/native-financials-pg.sh).
do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.sec_native_financial_periods'::regclass) then
    raise exception 'Native financials must have RLS enabled';
  end if;
  insert into sec_filings(cik,ticker,accession_number,form) values
    ('0001526475','NICM','native-fixture','40-F'), ('0000000001','OTHER','existing-10k','10-K');
  insert into sec_native_financial_periods(ticker,cik,form,fiscal_period,period_start,period_end,filing_date,
    accession_number,source_filing_url,source_instance_url,reporting_currency,accounting_standard,share_basis,
    valuation_eligible,valuation_blockers,is_comparative,revenue,raw_facts)
  values ('NICM','0001526475','40-F','FY','2025-01-01','2025-12-31','2026-04-27',
    'native-fixture','https://www.sec.gov/filing','https://www.sec.gov/instance', 'CAD','IFRS','issuer_ordinary',
    false,'["fx_conversion_required","adr_conversion_required"]',false,1535138,'{}');
  -- Versioned source observations can coexist with the same financial period.
  update sec_native_financial_periods set revenue = 1535138 where ticker = 'NICM';
  begin
    update sec_native_financial_periods set reporting_currency = 'USD';
    raise exception 'USD must not enter native CAD coverage';
  exception when check_violation then null; end;
  begin
    update sec_native_financial_periods set valuation_eligible = true;
    raise exception 'Native financials must remain valuation-ineligible';
  exception when check_violation then null; end;
  begin
    update sec_native_financial_periods set cik = '0001732379';
    raise exception 'Ticker/CIK identity mismatch must fail';
  exception when check_violation then null; end;
  begin
    update sec_native_financial_periods set accession_number = 'missing-filing';
    raise exception 'Source filing provenance must exist';
  exception when foreign_key_violation then null; end;
  if exists (select 1 from company_fundamentals_periods) or exists (select 1 from company_fundamentals_latest) then
    raise exception 'Native source must not populate legacy USD tables';
  end if;
end $$;
