# Audited Data Pipeline Repair Plan

> Implement inline using systematic-debugging, TDD and verification-before-completion; independent whole-branch review before PR.

**Goal:** Close the six confirmed data defects in the 2026-10-30 audit, preserving historical 13F facts and explicit reporting periods.
**Architecture:** Shared, reviewed security-identity quarantine at read/write boundaries; fail-stop writes; SEC filings keyed by issuer CIK at read time; paginated public API; publication from changed fundamentals through valuation and targeted cache refresh. Keep FY and latest disclosures separately dated. No new valuation assumptions.
**Tech stack:** Existing Next 16/TypeScript, Supabase, GitHub Actions, tsx checks.
**Spec:** `/Users/junlinzhu/Desktop/TheCompounder/reports/pipeline-pages-audit-2026-10-30/report.md` (six confirmed findings, user approved proceeding).

## Constraints

- No automatic merge. Review passing authorizes push and PR. No production data mutations before reviewed code is merged.
- Use xjing-umich GitHub account; never print credentials or overwrite .env.local.
- Retain model-version guards and conservative coverage suppression. No invented data, ticker-based issuer substitution, or forced quarterly annualization.
- Preserve existing prices/13F records; quarantine stops serving or extending contaminated identity joins.
- Preserve ISR and avoid refreshing every stock every day on Hobby. New disclosures must refresh affected stock pages even when valuation bucket does not change.
- Native implementation; fresh independent review at the end. Keep verified changes in the audited repair branch.

## Review Focus

1. Quarantined ticker must not leak through alternate price/history/API/snapshot readers or mutate into a new issuer on ingestion; unaffected symbols retain behavior.
2. Any non-optional delete/upsert failure must reject before success publication/refresh; missing legacy optional tables retain the documented fallback only.
3. CIK-shared classes, absent company, transport failure and >1,000-row responses must not look like valid empty coverage.
4. Annual/quarter labels agree for June fiscal years and 52/53-week years crossing January; historical growth and revenue trail use a consistent dated span.
5. Partial fundamental failures still surface; changed disclosures refresh without daily full-site invalidation; valuation runs serialize with existing publication workflow.

## Tasks

### 1. Security identity quarantine
- [x] RED: transport-level price/SEC readers must withhold SATS and leave MSFT working; snapshot SQL excludes quarantined identities before counts/limit.
- [x] Add shared quarantine evidence (SEC/Yahoo retrieval date 2026-10-30), guard reads, provider resolution and SEC preparation before any issuer mutation. Preserve historical holders; expose clear en/zh withholding reason.
- [x] GREEN + existing provider/snapshot checks.

### 2. Fail-stop derived and price writes
- [x] RED: injected deletes/upserts for each derived table reject and never publish manager summaries; price storage failures cannot report success.
- [x] Propagate unexpected deletion/write errors, preserving explicit optional-table-not-installed behavior. This task closes false success; does not claim seven-table atomic publication.
- [x] GREEN + existing derived checks/isolated PG checks.

### 3. Issuer-level SEC reads and complete API
- [x] RED: GOOG receives filings stored under GOOGL sharing CIK; public latest endpoint returns all 1,205 synthetic rows; transport failure returns error, not fake missing data.
- [x] Read company before dependent CIK filings query; keep fields free of raw_facts; share the company reader with public endpoint; stable pagination for latest API.
- [x] GREEN + SEC/route checks.

### 4. Honest FY dates and consistent labels
- [x] RED: June-year-end FY/Q4 labels align with quarters; January 52/53-week FY stays correct. Existing capture MSFT growth span agrees with revenue trail.
- [x] Prefer the original annual filing’s reported FY focus; use one fiscal-start-to-label map for annual and all quarters, with an early-year retail fallback. Carry period_end to growth-span display to handle already-stored old labels. Show latest disclosure separately from FY metric date and label actual annual filing form.
- [x] GREEN + normalizer, growth, business-quality and bilingual copy checks.

### 5. Fundamental publication closure
- [x] RED: affected stocks refresh after disclosure changes without refreshing unrelated details; new financial basis forces snapshot refresh even if bucket unchanged; failed write cannot report green.
- [x] Hash normalized financial content and filing metadata into a durable service-only publication queue; output changed tickers on partial failure; targeted authenticated revalidation after ingestion; chain valuation on changed data/manual runs under existing valuation-publication concurrency.
- [x] Keep normal daily valuation and durable refresh acknowledgements. Freshness-aware snapshot publication and partial failure handling must be tested.
- [x] GREEN + revalidation and workflow-related behavior checks.

### 6. Review and PR
- [ ] Run prebuild, app/scripts type checks, lint changed files, relevant SEC/valuation checks and isolated PostgreSQL checks. Replay captured data to quantify intentional changes.
- [ ] Independent review against base b6aebf2; address important findings with failing regressions first.
- [ ] Push and create PR against db-foundation; attach PR; report CI/deployment and rollout steps. Operational new-model recomputation follows merge, not removal of the model-version guard.

## Verification notes (2026-10-31 HK)

- Full prebuild passes, including 11 pipeline behavior checks and 1,205-row rendered screener fixtures.
- 50 SEC/valuation check files pass; provider and revalidation-path checks pass. Existing ownerEarningsDcf check has a June clock-dependent fixture and is handled separately, without changing runtime financial freshness guards.
- Isolated PostgreSQL checks cover queue permissions and generation CAS alongside existing derived publication checks.
- Financial fingerprints detect same-period revisions and fiscal label repairs, exclude raw provenance, and are order-stable. Pending intent survives HTTP failures; older refreshes cannot acknowledge a newer generation.
- Production rollout requires queue migration before the holdings workflow, deployment, then full fundamentals and valuation publication. No production data mutation performed in this branch.
