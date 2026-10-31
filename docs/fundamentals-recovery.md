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

## Remaining alternate-source issuers (audited 2026-10-31)

Five operating issuers have stable alternate official channels. They remain in the corporate holdings universe; no holdings, prices, security type or ADS ratio is changed.

| Ticker | Actual source | This adapter's outcome |
|---|---|---|
| IBN | Latest SEC20-F HTML, primary consolidated Indian-GAAP tables | Two native INR annual periods, FY2026/FY2025; bank total income is kept separate from ordinary revenue. |
| HMRZF | Latest official annual ESEF ZIP, source LEI and fiscal year validated | Two native IFRS/SEK annual periods, FY2025/FY2024 ending November30. |
| HKHHF | Latest annual inline viewer linked by Heineken Holding's official index | Two native IFRS/EUR annual periods, FY2025/FY2024. Classified official viewer copy, not formal ESEF; Holding parent-owner profit and share basis retained. |
| OZK | [FDIC corporate filings, certificate110](https://securitiesfilings.fdicconnect.fdic.gov/api/instflng/cert/110) | Two native US-GAAP/USD annual periods FY2025/FY2024 from the latest corporate10-K. Interest/NCI/preferred/common profit rows remain distinct; no generic revenue or owner-profit inference. FDIC Call Reports are not a substitute. |
| TRMLF | [Official Tourmaline reports](https://www.tourmalineoil.com/investors/financial-reports) | Two native IFRS/CAD annual periods FY2025/FY2024 from the latest English audited full annual. Customer-contract revenue comes from Note13. Ordinary CUSIP89156V106 must not become TRMOY ADR units. |

Apply `web/supabase/migrations/20261031_official_financial_periods.sql` before enabling the three new structured-source writers. The private `official_financial_periods` table preserves source versions by `(ticker,source_document_id,period_end)`, original accounting basis/currency, consolidated scope and ordinary-share basis, document SHA/URL, actual verified publication date (nullable when unverified), retrieval timestamp and raw per-field evidence. It is separate from both legacy USD tables and the audited BMM/NICM `sec_native_financial_periods` table. `valuation_eligible=false` is enforced in the database.

From `web/` with SEC_USER_AGENT configured, `npm run sec:ingest -- IBN --dry-run` (and HMRZF/HKHHF) fetches original sources without DB writes. With the migration deployed and normal service credentials, omit `--dry-run` to persist. This PR does not apply production DDL or backfill production data.

Known alternate routes use their actual channels rather than probing missing companyfacts on every run. IBN selects the latest20-F independently of6-K volume and rejects a newer unsupported amendment. European discovery selects the latest annual year from official source links; a newer annual PDF without a supported original causes failure, not a stale fallback. ESEF downloads/extraction are bounded (24MB archive /48MB report); only one report XHTML is accepted. Issuer/LEI, namespace, currency, numeric transformation/scale, dimensions, dates and duplicate facts/IDs are checked before writing.

OZK/TRMLF were pending in #273; the official PDF adapter upgrade restores their annual-source attachment. Newly supported PDF routes fail normally on source/format/schema/write/publication errors and return500/nonzero, rather than claiming success or retaining an adapter-pending label. Generic future `source_pending` outcomes remain non-success409/nonzero and are never skipped by resume as completed. Both issuers remain operating companies.

All five supported sources report `quality_status=native_currency`, two `saved.native_annual_periods`, zero USD annual/quarterly rows and explicit valuation blockers. Latest interim/TTM, historical FX, IBN ADS conversion and security/owner normalization remain unintegrated. Original publication dates are not inferred from archive URLs or CMS metadata. Retrieval timestamps do not change financial fingerprints or enqueue duplicate page refreshes.

Source provenance and deterministic examples: `web/src/lib/sec/official-financials/fixtures/README.md`. Latest source observations can be inspected without relabeling currency:

```sql
select distinct on (ticker,period_end)
       ticker,period_start,period_end,reporting_currency,accounting_basis,
       metrics,source_kind,source_url,source_published_at,valuation_eligible
from public.official_financial_periods
order by ticker,period_end desc,source_report_period_end desc,
         source_published_at desc nulls last,source_retrieved_at desc;
```


## Official annual PDF upgrade (OZK / TRMLF)

Apply `web/supabase/migrations/20261031_official_pdf_financials.sql` after the existing official-period migration and before PDF ingestion. It adds `source_pdf_page_count` and `source_pdf_extractor` atomically with issuer-specific core, identity and PDF-evidence constraints. The writer checks these columns before company/financial mutation; an existing #273 table without the upgrade fails the capability gate. Existing three official sources keep their original constraints/rows and null PDF metadata. RLS remains enabled without public policies; the immutable PDF evidence validator has no table access and EXECUTE is restricted to the owner/service_role. No production DDL/backfill or merge is performed by this PR.

Then apply `web/supabase/migrations/20261031_official_pdf_function_privileges.sql`. Supabase may grant `anon` and `authenticated` EXECUTE directly through default privileges; revoking PUBLIC alone does not remove these grants. This follow-up explicitly removes both role grants, preserves service_role execution and changes no financial rows or table policies. Verify effective access with `has_function_privilege` after migration.

Run from `web/` with SEC_USER_AGENT configured:

```sh
npm run sec:ingest -- OZK --dry-run
npm run sec:ingest -- TRMLF --dry-run
```

Dry-run downloads the current official catalogue and original PDF, validates every required statement/note row and prints both annual periods without DB writes. After migration and deployment, omit `--dry-run` for actual source persistence. PDF routes do not fetch missing companyfacts or depositary submissions, and do not insert FDIC/issuer reports as SEC filings. OZK remains domestic; TRMLF remains foreign and uses the canonical issuer name.

OZK uses FDIC certificate110 corporate10-K, with source fiscal end verified from its cover (catalogue instFyEndDte is null). Latest filing11868 has event/filing date2026-02-25, separate from attachment creation2026-02-26T01:53:51Z. Dates remain day-level disclosure dates, not invented UTC submission timestamps. Latest full annual and amendments are selected by exact form prefix, not ARS substring or index order. Only a unique original public attachment is accepted; confidential files and newer unsupported amendments never fall back to an old annual.

TRMLF uses the current official embedded Financial Reports feed. Latest English audited annual FY2025 was first published2026-03-04T22:03:37+0000 and authorized2026-03-04. The CMS date2025-12-30 is a sort value; French records also have lang=en-us. Title, media name/URL, actual English PDF headings, issuer, IFRS/CAD declaration and authorization are validated. A newer unsupported annual fails rather than silently using FY2025.

The pinned serverless PDF.js decoder uses sequential positioned text extraction with16MB/200page/item/text limits and preserves original bytes for SHA after PDF.js buffer transfer. Original PDF page, line(s), period, raw numeric input, monetary/share/EPS multiplier and reported label remain in per-field evidence. Original139-page OZK and90-page TRMLF PDFs are hashed, never test excerpts or text output. No OCR, canvas, local Poppler executable or LLM is needed by production.

OZK money is USD thousands, EPS scale1; weighted EPS denominators are rounded thousand shares converted to share units without inventing precision. Net income, signed NCI adjustment, preferred dividends and common-available profit stay separate. Generic revenue and explicit parent-profit are absent. TRMLF money is CAD thousands, shares/EPS scale1; revenue is the exact customer-contract note, cash flow is the primary GAAP statement, common shares issued and weighted denominators differ. Explicit cash/debt dashes are zero; missing total liabilities/owner-profit remain absent. Cash PP&E outflows retain signs and remain separate from acquisitions.

All records remain valuation-ineligible. OZK has a bank-basis normalization blocker without a false FX blocker; TRMLF requires FX. Latest complete interim reports are not attached by these annual adapters (OZK Q3 earnings8-K lacks CFO; TRMLF Q2 is latest full interim as of2026-10-31). No TTM, FX/security conversion or USD consumer activation is inferred. See committed PDF fixture provenance for URLs, dates, exact source pages, independent goldens and adversarial cases.
