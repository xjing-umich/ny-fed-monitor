# Official PDF financial sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore two audited original-currency annual periods for OZK/TRMLF through their official PDFs and create a PR after review.
**Architecture:** Bounded serverless PDF.js text extraction supplies positioned original-page lines to two strict issuer-specific annual parsers. Official discovery attaches original PDF SHA/date/identity evidence; the existing private annual-source ingest path persists with an atomic schema capability gate.
**Tech Stack:** TypeScript, compatible pinned unpdf/PDF.js serverless build, existing Supabase/Postgres, tsx behavior checks.
**Spec:** `../specs/2026-10-31-official-pdf-financials.md` and existing `../../official-financial-sources.md`.

## Global Constraints

- Annual+comparative only; no production migration/backfill, merge, UI, FX/ADR, interim/TTM or valuation activation.
- Source audit2026-10-31; original PDF, source publication/filing date, issuer, currency/basis, scale, row/column/page and SHA must be explicit.
- OZK FDIC110 corporate US-GAAP/USD; domestic issuer. No generic bank revenue or invented parent-attributable profit. NCI/preferred/common earnings remain distinct.
- TRMLF ordinary CUSIP89156V106 IFRS/CAD. Revenue only exact customer-contract note; no invented total liabilities/owner-profit; explicit zero differs from absence.
- Latest official discovery rejects stale fallback/amendments/ambiguity/confidential files. Original metadata cannot come from a guessed URL/CMS sorting date.
- Private versioned records remain valuation-ineligible; old3official/native40F/USD paths and securities/holdings/prices remain isolated.

## Review Focus

- Positioned PDF extraction must not merge/misorder columns, drop negative signs, infer values from missing text or manufacture OCR results.
- Annual full statements must not be confused with MD&A, non-GAAP/segment/pro-forma tables, French files, quarterly earnings or bank-only Call Reports.
- Original currency/basis/issuer and annual/current-vs-comparative column identity must fail closed on changes, not rely solely on filenames.
- Known source routes avoid SEC financial/submission probes; failed refresh/missing migration/write/publication never becomes successful resumable coverage.
- Migration must roll forward from applied #273, preserve its existing rows/constraints/private RLS, and gate PDF writers before mutations.

### Task 1: PDF extraction and strict issuer annual parsers

**Files:** create `web/src/lib/sec/official-financials/pdf/{document,rows,ozk,trmlf}.ts`, checks/fixtures; dependency lockfile.
**Interfaces:** `PdfPage={number:number,lines:string[]}` and extracted `PdfDocument={pages:PdfPage[],page_count:number,extractor:string}`; pure issuer parsers consume pages and verified annual report end, produce existing AnnualSourcePeriod[].

- [x] Verify compatible extractor/runtime and commit source-derived original-page fixtures with independent goldens and source provenance.
- [x] Write/run RED extraction checks for original PDF pages, positioned columns, invalid/encrypted/scanned/size/page boundaries; implement minimal bounded sequential extractor; GREEN real originals.
- [x] Write/run RED parser goldens and wrong entity/currency/year/units/columns, missing/duplicate rows, NCI/preferred/ordinary and revenue/CFO traps; implement exact primary-page/row parsers; GREEN.
- [x] Verify and commit.

### Task 2: Latest official discovery and canonical source routing

**Files:** create `official-financials/pdf/discovery.ts`/checks, modify registry/types/source/ingest and focused integration/outcome checks.
**Interfaces:** discovery returns official annual URL/publication date (and title fiscal end for TRMLF; FDIC report end is verified from the actual PDF cover); PDF provider attaches SHA/source kinds/PDF metadata. SourceRoute carries issuer name and domestic/foreign identity. PDF prepare returns no SEC submission/filings and uses source-verified metadata.

- [x] Write/run RED latest FDIC form/amendment/public attachment and English issuer feed discovery checks, future-year stale-fallback refusal and URL/HTTP boundaries; implement and verify.
- [x] Write/run RED supported-route integration, domestic/foreign metadata, schema capability gate, failures and identical-source fingerprint checks; implement without SEC facts/submissions probes.
- [x] Update existing pending/HTTP/CLI checks so newly supported PDF errors are failed500/nonzero, generic pending mapping remains non-success; run fresh source-only dry-runs both issuers.
- [x] Verify and commit.

### Task 3: Schema roll-forward, whole-branch review and PR

**Files:** create `web/supabase/migrations/20261031_official_pdf_financials.sql`, SQL checks/disposable test; modify pipeline registry and recovery/source docs.
**Interfaces:** atomic PDF metadata columns act as the pre-write capability gate; issuer-specific numeric core/identity/source constraints admit only validated annual PDF rows while preserving existing official issuers.

- [x] Write/run RED disposable PostgreSQL admission/identity/core/units/valuation/metadata constraints, upgrade existing #273 rows, and PDF migration-absent gate checks; implement migration and GREEN.
- [x] Register checks; run full prebuild/data-pipeline, typecheck, targeted lint, disposable PG and actual-original/source-only validations; update runbook/provenance.
- [x] Commit; independent read-only whole-branch review; reproduce/fix material findings RED→GREEN and rerun suite.
- [ ] Push and create/attach PR targeting db-foundation; report checks and annual-only boundaries, no merge or production writes.
