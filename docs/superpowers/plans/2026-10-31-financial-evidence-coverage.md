# Financial Evidence Coverage Repair Plan

> Execute inline with TDD, bounded parallel parser/diagnostic work, and fresh independent review before PR.

**Goal:** Enumerate every covered or held company whose current valuation is suppressed, distinguish ingestion defects from legitimate exclusions, and repair confirmed evidence gaps without inventing financial data.
**Architecture:** Paginated read-only production capture and full-engine replay; classified company ledger with dated source evidence. Foreign plain-text disclosures enter a separate native-currency comparable-income evidence contract. They never masquerade as USD fundamentals, complete cash-flow statements, or synthetic quarters. Existing verified annual valuation bases remain separately dated. Shared ingestion persists evidence and refresh intent. Unknown formats fail explicitly.
**Tech stack:** Existing TypeScript/Next/Supabase/tsx and SEC documents; parser dependencies only where justified.
**User scope:** All affected companies, root causes, and fixes; initial PDD reproduction showed `missing_interim` despite a published 2026-Q2 6-K release.

## Constraints

- Preserve current model, financial integrity, price, ADS, identity and comparison guards. Never restore the historical 20% PDD growth assumption or silently increase the global freshness threshold.
- Prove newer financial statements exist before labelling a company as an ingestion failure. Generic 6-K submission dates are not financial periods.
- Compare current/prior native-currency amounts from the same report; never mix convenience translations, GAAP/non-GAAP or quarter/YTD columns.
- Missing CapEx stays missing; investment cash flow and adjusted FCF are not substitutes. Partial income evidence cannot advance the complete TTM earnings basis.
- Canonical scheduled ingestion must retain restored evidence. Publication fingerprints must cover semantic evidence changes and preserve durable retries.
- Baseline source checkout is 7b01106; other recent repairs (safe resume, SEC CIK index) are retained. No auto-merge authorization for new PRs; push/create PR after passing review.

## Tasks

1. [x] Capture all SEC companies, financial periods, issuer filings, held tickers, security/ADS metadata, recent prices and snapshots with stable pagination and timestamps. Replay identical growth/valuation code over all companies; export complete CSV/JSON cohorts.
2. [x] Verify missing/older periods against current SEC filings for candidate cohorts. Separate native/IFRS/HTML/6-K/40-F and short-history/economic exclusions; list unsupported source formats explicitly.
3. [x] Add strict verified interim disclosure parsers with source fixtures and negative tests. Preserve native money, actual period, same-report comparative amounts, document/accession and parser version.
4. [x] Add canonical disclosure persistence/discovery with financial exhibit screening, bounded incremental scanning and explicit unsupported/error state. No 24-filing blind spot; ordinary announcements never refresh financial dates.
5. [x] Read verified comparable income evidence into growth coverage, preserve separately dated annual/full-TTM basis, disclose latest genuine financial report and diagnostics. Regression: native currency, missing comparisons, stale period, non-financial 6-K, repeat ingestion, unknown layouts, missing reinvestment remain conservative.
6. [x] Diagnose reinvestment failures by actual missing fields versus economic/short-history/unaligned-period causes. Only integrate mathematically equivalent or separately proven fixes; replay affected cohorts before claiming restored coverage.
7. [ ] Run relevant source/valuation/pipeline checks, type checks and migration tests. Fresh independent review, fix important findings, push and create PR against db-foundation. Record unresolved source limits instead of claiming universal support.

## Evidence

Read-only production capture and complete affected-company outputs: `/Users/junlinzhu/Desktop/TheCompounder/reports/financial-coverage-2026-10-31/`.

## User-approved scope addition

The user answered the pending question during execution: retain a zero-growth reference marked pending for `missing_reinvestment` only, no growth premium, excluded from confirmed strike-zone signals. Freshness/comparability and all independent hard guards remain. Engine, persisted snapshot labels and bilingual detail summaries are updated together and independently reviewed.
