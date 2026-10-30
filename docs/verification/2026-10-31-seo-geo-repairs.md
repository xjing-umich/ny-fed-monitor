# SEO / GEO repairs verification

Scope: the actionable presentation, crawlability and editorial findings from the 2026-10-30 audit across landing, stocks, stock, investors, investor and Learn, in English and Chinese. Base: `b6aebf2` on `db-foundation`.

## Changes and evidence

| Findings | Result | Verification |
| --- | --- | --- |
| F01 | Historical records keep their labels; only securities with a current detail page receive links. | Shared eligibility checks, investor render fixtures, all 52 previously affected source pages. |
| F03 | Default list rows and numeric values render inside main HTML. A leaf URL reader preserves search, sort, filters and pagination. | Four raw-HTML checks, production browser interaction and back/forward/direct-query checks. |
| F04/F13 | Readable filing sources and metadata/FAQ/footer periods follow actual holder snapshots, including single-Q3 and mixed-quarter cases. | Route fixtures for snapshot/fallback, missing periods and exits; 56 previously incorrect language URLs. |
| F06/F08/F10/F11 | Ranking metadata uses actual results; long titles shortened; screener schemas added; English landing topic made explicit. | SEO checks, production metadata/schema checks, both languages. |
| F07/F12 | Seven articles have readable sources, stable section anchors and distinct publication/modification dates. | All 14 language pages, Article citations, Learn checks. Original snapshot dates retained. |
| F09 | Chinese stock names fit a 375px viewport. | Browser document width 375px, previously 414px. |
| F14/F15/F16 | Filing deadline is distinguished from snapshot age; model assumptions and 13F scope are described accurately. | Copy checks, route disclaimer regression and production inspection. |

Source URLs were verified on 2026-10-30; dated historical financial examples remain historical examples. Current stock-page source dates were checked against read-only database records. An old local Next fetch cache was moved aside before the final live-data validation; no production cache or ingestion was changed.

## Validation

- Full `npm run build`: all prebuild gates, TypeScript and 851 static outputs.
- Facts gate: 16 checks, including route/Dataset, link eligibility, source footer, SEO and Learn fixtures.
- `npm run test:list-query`: URL parsing, search, sorting, pagination and defaults.
- `LIST_SSR_ORIGIN=http://localhost:3110 npx tsx scripts/tests/list-ssr.ts`: four language/list routes.
- Production acceptance: 147 distinct affected/core URLs, including 52 old dead-link source pages, 56 quarter-copy URLs and all 14 Learn language pages. Old invalid target links retained by a source were re-fetched and required to resolve.
- Browser: six templates in both languages, stock-only-Q3 and mixed-quarter sources, Learn references, sorting/search/pagination/history, investor filter, mobile width; no console errors in the inspected pages.
- Changed-code lint and whitespace checks. Repository-wide lint was not used as a clean gate: the investor index already contains a `Date.now()` purity warning on the base branch.

Independent branch review identified one P2 footer-quarter issue; it was corrected with a failing-then-passing actual-route regression and single/mixed/unknown footer fixtures. Final acceptance also caught an outer Suspense streaming segment; removing that obsolete boundary put numeric rows inside main HTML. A remaining stock disclaimer claiming a maximum 45-day lag was corrected with another failing-then-passing route check.

Local audit/acceptance evidence is retained outside Git under `TheCompounder/reports/seo-geo-repairs-2026-10-30/` (`acceptance.py`, `acceptance.json`, compressed HTML); the original full-site audit is in the neighboring `seo-geo-audit-2026-10-30/` folder.

## Remaining dependency and limits

F17 remains a data-layer dependency: `effectiveFilingDeadline` handles weekends but not federal holidays. The known 2026Q4 case should be 2027-02-16. This branch does not change quarter-switching logic. F02 Dataset coverage and F05 sitemap dates from the already merged fix are preserved.

These checks establish page correctness and readability. Search Console indexing, live crawler access logs, AI citation rates and reliable Core Web Vitals measurements remain unmeasured. No merge or production deployment is part of this verification.
