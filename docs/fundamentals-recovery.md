# Recovering an interrupted fundamentals batch

The full holdings universe reached about 2,000 SEC-resolvable tickers on
2026-10-30. Actions run `41081817577` reached the old 90-minute job timeout
before finishing its final tickers; cancellation also skipped publication.
The job now allows 120 minutes. Scheduled runs still ingest the full universe.

For manual recovery, dispatch **Daily Fundamentals (full holdings)** with the
optional `resume_since` input set to the interrupted batch's UTC job start,
for example `2026-10-30T17:04:06Z`. Use a batch from within the past 24 hours
and the **same ingestion code and normalization rules** as the recovery run.
Leave the input empty after any ingestion change: old successes cannot prove
that new normalization or publication rules have been applied.

The CLI equivalent is `SEC_RESUME_SINCE=<UTC timestamp> npm run sec:ingest:holdings`.
With a numeric limit, the limit applies to the original ranked universe before
completed targets are removed. `--dry` prints the remaining targets without
ingesting or publishing anything.

Recovery reads all company-ingestion attempts since the boundary, then skips
only tickers whose latest attempt succeeded. Failed, interrupted (`running`),
and unattempted tickers are retried. Journal pagination or read failures abort
recovery before SEC writes. Existing queue-based page publication and valuation
recomputation still run after ingestion finishes, including on reported source
failures; a job cancellation cannot run that downstream work.

Use the `sec-fundamentals` concurrency group to serialize recovery with another
full batch. Inspect the ingestion summary and publication steps, rather than
treating a green job as proof of complete data coverage. Unavailable SEC
companyfacts remain explicit failures, not fabricated financial data.

## Native 40-F source recovery (BMM / NICM)

Audited 2026-10-31: BMM and NICM have original IFRS/CAD 40-F financials while SEC companyfacts returns 404. The corporate holdings queue now uses `securities.security_type` and the existing operating-security rule: SPY/DIA/MDY (ETP), SWZ (Closed-End Fund), and other known fund/non-operating types are excluded before limits and resume. Unknown types, REITs, common stock and ADRs remain eligible. Prices and institutional holdings are untouched; a classification lookup failure aborts the queue instead of ingesting partial classifications.

Apply `web/supabase/migrations/20261031_native_40f_financials.sql` **before** running the new ingest code. The migration admits 40-F filings and creates private, RLS-enabled `sec_native_financial_periods`. This PR does not execute production DDL or backfill production data.

SEC-only validation (no database writes), from `web/` with SEC_USER_AGENT configured:

```sh
npm run sec:ingest -- BMM --dry-run
npm run sec:ingest -- NICM --dry-run
```

After migration and deployment, use `npm run sec:ingest -- BMM` and `npm run sec:ingest -- NICM` for the source backfill, or run the ordinary holdings workflow. Native restoration is restricted to the audited ticker+CIK pairs and an actual **companyfacts HTTP 404**. HTTP 403/429/500, missing/ambiguous instances, wrong-issuer data and missing core CAD facts remain failures.

The native table stores FY2025 and FY2024 comparative values from the latest 40-F, with CAD currency, IFRS taxonomy, ordinary-share basis, accession/date/URL and per-field context/unit evidence. A comparative retains the 2025 filing's source version; it is not represented as an originally filed 2024 observation. Native ingest success is `quality_status=native_currency`, `saved.native_annual_periods=2`; legacy USD annual/quarterly counts stay zero. Table writes must succeed before the resume journal is marked successful or publication queued.

Native values do not enter `company_fundamentals_periods`, `company_fundamentals_latest`, or USD valuation math. `valuation_eligible=false` is enforced by the schema. No quarterly periods, zero revenue for missing tags, FX conversions or ADR ratios are inferred. BMM requires validated historical currency conversion; NICM additionally requires ordinary-share-to-ADR conversion. Existing USD-facing company pages do not yet display these native financials. More recent interim reports are a separate next step.

Source provenance and deterministic regression fixtures: `web/src/lib/sec/fixtures/README.md`. Inspect stored coverage without relabeling currency:

```sql
select ticker, period_end, reporting_currency, revenue, profit_loss,
       total_assets, is_comparative, accession_number, valuation_eligible
from public.sec_native_financial_periods
order by ticker, period_end desc, filing_date desc;
```
