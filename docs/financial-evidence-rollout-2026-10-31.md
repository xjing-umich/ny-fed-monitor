# Financial evidence repair rollout

This branch repairs source ingestion and annual-period selection. It does not relax the 180-day freshness rule, accept unknown ADS ratios, turn partial income statements into full TTM fundamentals, or assign growth when reinvestment inputs are missing.

## Evidence and scope

Read-only production capture: 2026-10-31 02:14–02:18 UTC. The complete ledger includes 2,467 SEC-company/held-ticker union members and is saved outside the repository at `../reports/financial-coverage-2026-10-31/`. Source verification uses official SEC filings checked on 2026-10-31. Baseline JSON is frozen separately from repaired-engine replay output.

The baseline has 860 primary growth-evidence exclusions: 125 direct period/comparison/filing coverage exclusions and 735 reinvestment exclusions. These are diagnostic categories, not a claim of 860 ingestion bugs. Pre-revenue companies, short successor periods, accounting transitions, nonpositive historical NOPAT and missing actual CapEx must remain distinguishable.

Verified defects include foreign 6-K HTML/native-currency comparable-income omission, missing 40-F/20-F annual backfill coverage, strict inverse Q1 derivation gaps, issuer-specific consolidated revenue concepts (AMH/APA/SWX), annual reinvestment calculations contaminated by a TTM head, and an ACM 52/53-week presentation-date mismatch.

SWX current regulated revenue is preserved but cannot be compared to original Centuri-inclusive history. MTH dimensioned segment components and RLI unrealized-only investment changes are not promoted into unproved consolidated totals. No native-currency amount is written into USD fundamentals.

## Deployment order

1. Apply `web/supabase/migrations/20261031_verified_interim_disclosures.sql` to the intended database. Verify the table, service-role policy and denied client grants. The migration is additive. The local PostgreSQL check applies it alongside existing publication migrations.
2. Deploy this branch. The calculation version is `2026-10-31-coverage-v2`; the existing model-release push trigger reruns valuation, and readers reject prior calculations until current snapshots are published. Missing source-table schema is tolerated by readers, with explicit diagnostics; foreign ingestion fails before financial mutations until the migration exists.
3. Run the regular `Daily Fundamentals (full holdings)` workflow on the deployed revision, with **empty `resume_since`**. A prior batch's completed tickers must not be skipped after ingestion code changes. The held universe is read live. The 47 unheld direct-coverage candidates (including QFIN) are outside that workflow universe; reingest the tickers in the dated `company-audit-direct-coverage.csv` with `held_in_consensus_snapshot=false` through the same `npm run sec:ingest -- TICKER` entry point before claiming that full dated cohort has been refreshed. Classify remaining real omissions from those refreshed results rather than assuming every stale unheld row is a parser bug. Existing single-company CLI can also perform a small PDD/AMH/APA/SWX canary first using the normal source store/publication queue.
4. Let fundamental publication drain its durable queue and the workflow rerun valuation. A valuation release/recompute alone does not populate new SEC source evidence. Run the valuation workflow again after fundamentals if a release-triggered run completed first. Both use existing shared publication concurrency.
5. Verify supported evidence has actual financial period and SEC accession/source URL; check `incomplete` and operational errors, source-only fingerprint changes, queue acknowledgements, current-model snapshots and bilingual PDD/detail/screener/strike-zone pages. Compare annual/full-TTM dates separately from verified partial-income report dates.

Do not claim every source repair restores a valuation: annual anchor, comparable accounting basis, ADS, capital structure and reinvestment gates remain independent. Unknown HTML/PDF/image layouts remain explicit unsupported evidence and must not refresh financial dates. Preserve sources for future adapter work.

## Local verification

- `npm --prefix web run prebuild` runs the financial behavior checks, including parser/discovery/canonical-ingestion/retry and annual-basis regressions.
- `npm --prefix web run check:derived:pg` with local PostgreSQL binaries tests additive migration constraints and role permissions without production credentials.
- App and scripts TypeScript checks and Next compile-mode build validate server/client integration; this is not a live production publication test.

Production migration, deployment and data recomputation are not performed by creating this PR.

## Repaired-engine counterchecks

Using unchanged captured financial rows, ten previously assessable names correctly fail the annual reinvestment window after removing the TTM head: AVTR, CSGP, IART, ROG, RYZ, UCTT and VREX have negative annual NOPAT; QUAD has nonpositive equity; OSK has a 457-day annual interval and VTOL a 1,461-day interval in the selected window. These are verified conservative corrections, not source-repair regressions. Selecting a shorter successful window would be a separate eligibility policy and is not implemented here.

## Approved zero-growth reference policy

The user explicitly chose to retain a pending zero-growth reference when recent comparable financial periods are complete but historical reinvestment evidence remains insufficient. This applies only to `missing_reinvestment`. Other coverage gaps and hard data guards remain suppressed. The reference uses the pure zero-growth earnings-power range, with no asset/growth premium, `reliable=false`, `inStrikeZone=false`, and no margin-of-safety claim or expectations assessment. Snapshot payloads retain `referenceOnly=missing_reinvestment`; detail pages and every snapshot label show the pending status. Confirmed strike-zone and bargain queries retain their reliability filters.

A shared `$` statement presentation unit can support same-report ratios without claiming a known ISO currency: those records retain `currency=null`, `presentationUnit=$`, `sharedUnitVerified=true`. They are never USD fundamental inputs. MGA's same-report prior reported quarters are additive income flows with explicit derivation proof; GLBE's consolidated net income comes from the matching consolidated cash-flow statement's opening income row, not attributable earnings or operating cash flow.
