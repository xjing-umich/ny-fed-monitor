# Remaining financial sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore native annual source coverage for IBN, HMRZF and HKHHF, and replace ambiguous SEC404 failures for OZK/TRMLF with explicit pending official-PDF adapters.

**Architecture:** An audited ticker+CIK registry routes five issuers to their actual disclosure channels. Three scoped parsers restore original annual facts into a separate private official financial-period table; legacy USD/40-F tables remain untouched. Unsupported PDF adapters remain visible non-success outcomes and never disappear from operating-company queues.

**Tech Stack:** TypeScript, fast-xml-parser, bounded fflate ZIP extraction, Supabase/Postgres, tsx behavior checks.

**Spec:** `../../official-financial-sources.md` and user request2026-10-31.

## Global Constraints

- Sources checked2026-10-31; dates, original currencies, accounting basis, issuer identity and source version/provenance must remain explicit.
- IBN: SEC20-F, Indian-GAAP, INR thousands except EPS; fiscalYE03/31; bank total income is not normalized revenue; ordinary-share facts are not per ADS.
- HMRZF: official ESEF, IFRS/SEK, fiscalYE11/30; money scale6 and weighted shares scale3.
- HKHHF: Holding LEI724500M1WJLFM9TYBS04, official inline viewer copy (not formal ESEF); IFRS/EUR; consolidated and parent-owner profits remain separate.
- OZK/TRMLF: official PDF adapter pending, non-success status, retained operating eligibility; no false companyfacts retries or invented financials.
- Native records remain valuation-ineligible. No FX/ADR conversion, interim/TTM inference, production migration/backfill or merge in this task.

## Review Focus

- Changed issuer identity, QName namespace, unit, scale, dimensions, missing/contradictory financial facts must fail closed.
- IBN gross total income, income before NCI, income after NCI and retained profits are not interchangeable; USD/US-GAAP reconciliation columns must not leak into primary INR statements.
- Latest annual discovery must bypass noisy6-Ks and fail on newer unsupported sources instead of silently using old financials.
- Localized numeric transforms and source archives must be bounded and deterministic; malformed/ambiguous ZIP and untrusted links must fail.
- Pending sources, migration absence, DB/source failures and publication errors must never create successful resumable coverage or USD writes.

### Task1: Audited routing and source contracts

**Files:** `web/src/lib/sec/official-financials/{types,registry}.ts`, routing checks, `ingest.ts`, batch CLIs.
**Interfaces:** `OfficialFinancialPeriod` carries native metrics and raw field evidence plus original-document identity/currency/basis/provenance; `OfficialSourcePendingError` describes pending PDF adapters.

- [ ] Write and run RED tests for known routing/CIK mismatch and pending status/non-success/resume behavior.
- [ ] Implement registry and typed period/evidence contract; pending remains a non-success journal result and is reported separately by batch/CLI.
- [ ] Verify and commit.

### Task2: Native annual parsers and latest source discovery

**Files:** `official-financials/{ibn,inline,source}.ts`, focused checks/fixtures and dependency lockfile.
**Interfaces:** pure parsers return native annual period data; source discovery validates official URLs and selects latest audited-format reports; full provider attaches document SHA/date/URL identity.

- [ ] Save small source-derived fixtures and literal expected values; run RED for IBN primary-table semantics and European identity/context/number-format behavior.
- [ ] Implement scoped IBN HTML tables, namespace-aware inline IFRS parser and bounded ESEF extraction; malformed/shifted/duplicate inputs fail.
- [ ] Test latest-year discovery/6-K truncation, file limits, HTTP errors, malicious links and unsupported formats with controlled external boundaries.
- [ ] Run real SEC/official-source dry-runs for all five routing outcomes; record latest annual vs unintegrated interim dates without overstating coverage.
- [ ] Verify and commit.

### Task3: Persistence, full review and PR

**Files:** native official-period SQL migration and disposablePG check; `ingest.ts`, CLI dry-run, pipeline check registry, recovery documentation.

- [ ] Run RED integration checks for schema/write/publication failure, idempotent fingerprint and native isolation.
- [ ] Persist native records only after schema gate, upsert source versions, journal truthful outcomes and queue publication only after successful writes; preserve #270/#268 paths.
- [ ] Run full prebuild/data-pipeline, typecheck, focused lint, disposablePG and live source-only validations.
- [ ] Obtain independent read-only whole-branch review; fix material findings with reproductions.
- [ ] Push and create/attach PR targeting db-foundation; report supported/pending sources and checks, no merge.
