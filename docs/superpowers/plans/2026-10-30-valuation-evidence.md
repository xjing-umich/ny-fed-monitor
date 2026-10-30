# Valuation Evidence Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline; one fresh whole-branch review at finish.

**Goal:** 修复全站估值的增长证据、再投资口径、期限和数据缺口误导，并全量回放验证。
**Architecture:** 同源纯函数 GrowthEvidence 经 fundamentalsToFloorInput/runValuation 进入增长及可靠性；所有页面和快照使用同一个引擎；原报表缺字段从结构化来源补，无法可靠覆盖则降级。
**Tech Stack:** TypeScript, Next16, existing assert-based .check.ts, SEC XBRL, Supabase read-only probes.
**Spec:** docs/superpowers/specs/2026-10-30-valuation-evidence-design.md

## Global Constraints
- 不写ticker特例；源日期和报告期分开；测试用显式asOf。
- 不覆盖.env.local、不写生产库、不合并PR；review后创建PR到db-foundation。
- 全量分页，不截前200；所有失败/缺数归入分母。
- 文案中英文分别遵守docs/copy-voice.md及既有词表，结构不变。

## Review Focus
- 再投资字段缺失不能经undefined候选过滤反而抬高增长；金融股与轻资产路径保留。
- 同期季度须完整配对、时间窗无重复；投资损益不能混未调整净利。
- 新鲜FY不要求尚未应报季度，旧FY无中期不得被刷新时间伪装成新鲜。
- 20年期限不得藏在另一个估值腿/反解/快照中；旧模型快照不可继续作可靠推荐。
- 原始XML回填不得用收购/金融投资当CapEx，不覆盖已有同口径更可信数。

### Task 1: Growth evidence and negative candidate rule
**Files:** create growthEvidence.ts/.check.ts; modify types.ts,fundamentalsToFloorInput.ts,ownerEarningsDcf.ts,runValuation.ts and covering checks.
**Interfaces:** GrowthEvidence carries period dates, comparable revenue/earnings growth and coverage; buildGrowthEvidence(rows,quarterRows,marksEnabled) is pure; assessGrowthCoverage(evidence,asOf) returns reason/null. runValuation receives optional asOf (default current ISO); deriveOeDcf receives optional evidence/coverage via final options argument so existing direct callers remain valid.
- [ ] Add failing real-shape checks for negative historical revenue, recent FY decline, quarter recovery, missing pairs, marks mismatch, fresh FY and old FY no-interim.
- [ ] Run new checks and observe expected failures.
- [ ] Implement shared evidence and growth caps, preserving valid negative values until clamp and exposing source/constraint metadata.
- [ ] Run affected valuation checks, ledger results and commit.

### Task 2: Operating reinvestment and bounded CAP
**Files:** types.ts,fundamentalsToFloorInput.ts,moatCap.ts,growthValue.ts,epvFloor.ts,ownerEarningsDcf.ts plus checks.
**Interfaces:** ValuationFloorYear.operating_working_capital?:number (book WC unchanged). sustainableGrowth and growthValue consume operating WC with strict completeness; missing reinvestment evidence cannot become unchecked positive growth outside structural exception. CAP_STRONG=10, shared with all legs.
- [ ] Failing checks: cash/short investment accumulation generates no operating reinvestment; actual CapEx growth works; missing cash/CapEx/DA not treated as zero; banks/structural exceptions keep intended behavior; no automatic20year valuation.
- [ ] Observe RED, implement, then run moat/growth/DCF/fusion/TTM suites and commit.

### Task 3: Structured source coverage and scheduling
**Files:** sec/filing-backfill.ts and checks; fundamental-tags.ts if required; fundamentals workflow; mapper call sites.
**Interfaces:** new exact-name semantic CapEx fallback under validated XML USD contexts, FY 20-F only when missing field; retain raw source tag through normalized facts; no arbitrary namespace or guessed money conversion. Coverage accepts known latest domestic financial filing report date from sec.filings. Unstructured6K uses coverage fallback, never fabricated numbers.
- [ ] Failing extraction fixtures: exact CapEx extension, wrong units/dimensions, unrelated financial investments, missing quarterly6K; known newer10Q invalidates growth evidence.
- [ ] Implement narrowly bounded reusable structured fallback and all production call sites.
- [ ] Workday + Saturday refresh with concurrency protection; verify workflow shape and read-only dry-run known raw SEC fixtures.
- [ ] Run SEC/mapper/integration checks and commit.

### Task 4: Honest display and versioned snapshots
**Files:** epvFloor.ts method copy, EarningsPowerFloorCard.tsx, valuationSnapshot.ts, valuation-ingest.ts, related types and checks.
**Interfaces:** export VALUATION_MODEL_VERSION from pure module; payload.model_version plus growth_evidence; snapshot readers reject legacy model rows for valuation rather than presenting stale judgments. Headline/cautions reflect coverage.
- [ ] Failing checks for actual weighted normalisation explanation, initial5/fade/terminal path and discount differences, growth-gap reliability false, legacy snapshot filtering.
- [ ] Implement bilingual copy using current structural APIs; no layout changes.
- [ ] Run rendering/lexicon/facts/valuation/snapshot checks and commit.

### Task 5: Full-universe regression and review
**Files:** scripts/valuation-evidence-audit.ts (read-only CLI) and audit report under docs/superpowers/calibration/.
**Interfaces:** audit accepts captured read-only JSON or reads paginated DB with GETs only; writes local JSON/CSV. Covers every identifier and reports suppression/error counts and CIK dedup.
- [ ] Run baseline and amended engines against same complete capture, deterministic asOf, include SOTP and all guard data. Explain material changes and negative/upward outliers.
- [ ] Run all valuation + SEC checks, typecheck, lint changed files, build; report pre-existing failures explicitly and fix introduced failures.
- [ ] Fresh reviewer inspects full branch and evidence; resolve important findings and rerun covering tests.
- [ ] Push branch with xjing-umich, create/attach PR to db-foundation, report checks; do not merge.
