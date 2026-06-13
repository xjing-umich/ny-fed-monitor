-- Expand the fundamentals data layer for valuation, and switch the period
-- identity from the unreliable XBRL (fiscal_year, fiscal_period, form) key to a
-- (period_end, fiscal_period) key derived from real reporting durations + the
-- company's fiscal calendar. See normalize-facts.ts for the rationale.
--
-- The existing rows were produced by the old (buggy) normalizer and are fully
-- reproducible from SEC, with no user-facing consumers yet, so we clear both
-- tables and re-ingest under the corrected logic.

truncate table public.company_fundamentals_periods;
truncate table public.company_fundamentals_latest;

-- New valuation fields on the per-period table (additive; existing columns kept).
alter table public.company_fundamentals_periods
  add column if not exists d_and_a numeric,
  add column if not exists stock_based_comp numeric,
  add column if not exists rd_expense numeric,
  add column if not exists sga_expense numeric,
  add column if not exists interest_expense numeric,
  add column if not exists pretax_income numeric,
  add column if not exists income_tax_expense numeric,
  add column if not exists dividends_paid numeric,
  add column if not exists share_repurchases numeric,
  add column if not exists short_term_investments numeric,
  add column if not exists current_assets numeric,
  add column if not exists current_liabilities numeric,
  add column if not exists ppe_net numeric,
  add column if not exists goodwill numeric,
  add column if not exists intangibles numeric,
  add column if not exists minority_interest numeric,
  add column if not exists preferred_equity numeric,
  add column if not exists shares_outstanding numeric,
  add column if not exists ebitda numeric,
  add column if not exists working_capital numeric,
  add column if not exists effective_tax_rate numeric,
  add column if not exists is_derived boolean default false;

-- Replace the period uniqueness key. Drop whatever unique constraints exist
-- (the old auto-named one), then add the new (ticker, period_end, fiscal_period)
-- key that upsertPeriods now conflicts on.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.company_fundamentals_periods'::regclass and contype = 'u'
  loop
    execute format('alter table public.company_fundamentals_periods drop constraint %I', c);
  end loop;
end $$;

alter table public.company_fundamentals_periods
  add constraint company_fundamentals_periods_period_key
  unique (ticker, period_end, fiscal_period);
