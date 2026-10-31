-- Separate native source observations. No USD normalization, interim inference or valuation eligibility.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
create table public.official_financial_periods (
 ticker text not null,
 cik text not null,
 issuer_identifier text not null,
 identifier_scheme text not null,
 reporting_currency text not null,
 accounting_basis text not null,
 source_kind text not null,
 source_document_id text not null,
 source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
 source_url text not null check (source_url like 'https://%'),
 source_landing_url text not null check (source_landing_url like 'https://%'),
 source_accession text,
 source_published_at date,
 source_report_period_end date not null,
 source_retrieved_at timestamptz not null,
 period_start date not null,
 period_end date not null,
 fiscal_period text not null check (fiscal_period='FY'),
 is_comparative boolean not null,
 consolidation_scope text not null check (consolidation_scope='consolidated'),
 share_basis text not null check (share_basis='issuer_ordinary'),
 valuation_eligible boolean not null default false check (valuation_eligible=false),
 valuation_blockers jsonb not null check (jsonb_typeof(valuation_blockers)='array'),
 metrics jsonb not null check (jsonb_typeof(metrics)='object'),
 raw_facts jsonb not null check (jsonb_typeof(raw_facts)='object'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(ticker,source_document_id,period_end),
 check(source_document_id=source_sha256),
 check(metrics ?& array['total_assets','profit_loss','profit_loss_attributable_to_owners','operating_cash_flow']
   and jsonb_typeof(metrics->'total_assets')='number'
   and jsonb_typeof(metrics->'profit_loss')='number'
   and jsonb_typeof(metrics->'profit_loss_attributable_to_owners')='number'
   and jsonb_typeof(metrics->'operating_cash_flow')='number'
   and ((ticker='IBN' and metrics ? 'total_income' and not(metrics ? 'revenue')
         and jsonb_typeof(metrics->'total_income')='number')
     or (ticker<>'IBN' and metrics ? 'revenue' and jsonb_typeof(metrics->'revenue')='number'))),
 check(period_end-period_start between 350 and 380),
 check(period_end<=source_report_period_end and source_report_period_end-period_end<=380),
 check(source_published_at is null or source_published_at>=source_report_period_end),
 check(is_comparative=(period_end<>source_report_period_end)),
 check(
  (ticker='IBN' and cik='0001103838' and issuer_identifier='0001103838' and identifier_scheme='CIK'
   and reporting_currency='INR' and accounting_basis='Indian-GAAP' and source_kind='sec_20f_html'
   and source_accession is not null and source_url like 'https://www.sec.gov/Archives/edgar/data/1103838/%')
  or (ticker='HMRZF' and cik='0001396282' and issuer_identifier='529900O5RR7R39FRDM42' and identifier_scheme='LEI'
   and reporting_currency='SEK' and accounting_basis='IFRS' and source_kind='official_esef' and source_accession is null
   and (source_url like 'https://hmgroup.com/%' or source_url like 'https://www.hmgroup.com/%'))
  or (ticker='HKHHF' and cik='0001142231' and issuer_identifier='724500M1WJLFM9TYBS04' and identifier_scheme='LEI'
   and reporting_currency='EUR' and accounting_basis='IFRS' and source_kind='official_inline_viewer_copy' and source_accession is null
   and source_url like 'https://staticcontents.investis.com/html/h/heineken-holding/%')
 )
);
alter table public.official_financial_periods enable row level security;
comment on table public.official_financial_periods is
 'Versioned original-currency annual source observations. Primary Indian-GAAP bank income and IFRS consolidated/parent profit remain distinct. Private; never consumed by USD valuation readers.';
commit;
