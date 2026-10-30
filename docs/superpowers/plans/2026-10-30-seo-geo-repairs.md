# SEO / GEO audit repairs implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Repair the actionable SEO/GEO findings in the 2026-10-30 full-site audit without changing valuation or ingestion semantics.
**Architecture:** Reuse current holder data to guard links and describe snapshot periods. Keep list pages statically cacheable while rendering default numeric rows, then enhance URL state in the browser. Add readable provenance and explicit editorial metadata.
**Tech Stack:** Next.js 16.2.6, React 19, TypeScript, existing tsx check scripts.
**Spec:** `/Users/junlinzhu/Desktop/TheCompounder/reports/seo-geo-audit-2026-10-30/README.md`, user authorized execution after reviewing results.

## Global constraints
- Preserve comparison-quarter behavior, Dataset fix #257, honest sitemap lastmod omission, existing list interaction and full link directories.
- No production DDL, ingestion, publishing, or merge. Automatically create PR after review passes per user authorization.
- Copy follows web/docs/copy-voice.md. Sources must directly support claims and be checked today.
- F17 (holiday deadline) stays a documented data dependency; do not duplicate data-session work.

## Review focus
- Historical/option-only/no-current-holder securities retain plain text without broken links.
- Single Q3, equal/mixed quarters, missing dates never claim a false majority or invent a period.
- URL search/sort/page/back navigation still works after static default rows hydrate.
- Provenance links match the actual filing/holder, funds do not get a company 10-K link.
- Publication date and snapshot writing date survive later content corrections.

### Task 1: Correct detail links, time descriptions and provenance (F01/F13/F04)
- [x] Add and run failing behavioral checks for link eligibility and actual-period description.
- [x] Guard all investor stock links with shared current-holder eligibility, including prose, moves and table.
- [x] Use actual snapshot periods in metadata/FAQ; retain comparison baseline only for moves.
- [x] Extend SourceFooter with optional href and provide actual investor filings / stock holder filing lists.
- [x] Run detail checks, tsc and commit.

### Task 2: Render default list numbers and constrain mobile width (F03/F09)
- [x] Verify useSearchParams static behavior against bundled Next documentation.
- [x] Preserve default static render and progressively read actual URL state without a whole-list Suspense bailout.
- [x] Check search, filters, pagination and history; confirm numeric rows in raw production HTML.
- [x] Constrain mobile primary link content to available width; verify 375px zh BRK names.
- [x] Run list tests, render/interaction checks and commit.

### Task 3: Editorial evidence, dates and accurate scope (F07/F12/F14/F15/F16)
- [x] Verify primary sources for all seven articles; add readable references and stable section IDs.
- [x] Separate published/updated/written dates; derive original dates from git history and record actual corrections.
- [x] Correct 13F scope and disclosure deadline wording, model assumptions copy and llms summaries.
- [x] Run meaningful article metadata/reference checks, inspect en/zh and commit.

### Task 4: Metadata and final acceptance (F06/F08/F10/F11)
- [x] Derive ranking metadata from actual shared quarter/results and shorten specific long titles.
- [x] Add truthful screener collection/breadcrumb schemas, including empty views and canonical aliases.
- [x] Run required gates and production build; inspect six templates in both languages and no-JS/list interaction.
- [x] Fresh independent whole-branch review and address important findings. Push branch and open PR after final acceptance (standing user authorization).

## Execution ledger
- Setup: reused existing isolated seo worktree; clean branch from b6aebf2. Full audit is approved scope; implement inline without another design approval round.

- Task 1: stockLinks and snapshotLabel tests observed RED, then GREEN; InvestorBlocks render checks and tsc passed. Source links now expose actual holdings provenance. Eligibility uses current non-exited snapshot rows and known current long holdings only when no snapshot row exists.

- Task 2: public raw-HTML acceptance failed as expected before changes; URL parser suite, tsc and changed-list lint passed after isolating QueryReader. Production SSR and browser history acceptance remain final gate.
- Task 3: Learn publication/reference test observed RED→GREEN; immutable published/written dates added, current citations and copy corrections dated 2026-10-30. Financial example source accessions cross-checked against current read-only records and verified SEC directories. Sources distinguish original publications, a translated speech, and reader-collected Q&A.
- Task 4: ranking metadata regression observed RED→GREEN. Required prebuild gates, route/Dataset fixtures, Learn, SEO and stock-link checks pass. Full production build and browser acceptance running.

- Final review: one Important/P2 source-footer period finding. Actual-route single-Q3 footer test observed RED, then GREEN after actual snapshot labels replaced baseline/date aggregation; mixed and unknown footer tests pass. No other blocking finding.
- Final acceptance found default rows were streamed into a hidden outer Suspense segment, rather than main HTML. Removed the obsolete whole-list boundary; URL reader retains its own boundary. Existing browser checks passed sort, pagination, search, direct query, history, investor filter; zh/stocks width is 375px at 375px viewport. Rebuilding to verify no-JS main content.

- Final verification (2026-10-31 HK): full build passed with all prebuild gates, TypeScript and 851 static outputs; four raw-main-HTML list checks passed. Fresh fetch-cache validation reads AAPL price source 2026-10-29. Stock disclaimer deadline regression observed RED→GREEN; list-query suite and final changed-file lint passed. Browser acceptance covers all six templates in both languages, with no inspected console errors. Full evidence and remaining F17 data dependency are recorded in docs/verification/2026-10-31-seo-geo-repairs.md.

- PR #261 created automatically. Base advanced to 169d9a6 via stock first-screen PR #259; integrated the base, preserving both first-screen and source-footer assertions. Facts gate passes 19 checks; full integration build (851 outputs), four raw-HTML checks and 147-URL acceptance all passed. Post-integration browser checks confirm AAPL mixed and MAVF single-Q3 footer sources, 375px document width and no console errors.

- User-requested final review (2026-10-31): four P2 runtime gaps found and fixed in one batch (delegated filing provenance, lookup error distinction, move/home exit links, investor 13F scope). Tests observed RED→GREEN. Fix review confirmed runtime fixes; one time-dependent regression gate was corrected and verified under a future clock. Integrated base 6a57b6f. Full build, 22 facts checks, 13 data-pipeline checks and expanded 149-URL acceptance pass. Final remote check remains attached to the pushed PR commit.
