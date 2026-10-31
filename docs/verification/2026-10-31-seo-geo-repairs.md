# SEO / GEO repairs verification

Scope: the actionable presentation, crawlability and editorial findings from the 2026-10-30 audit across landing, stocks, stock, investors, investor and Learn, in English and Chinese. Original base: `b6aebf2` on `db-foundation`; integrated the subsequently merged stock first-screen PR #259 at `169d9a6`, then the latest data/publication base through #262 at `6a57b6f`.

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
- Facts gate: 19 checks after integrating #259 (16 before integration), including route/Dataset, link eligibility, source footer, SEO and Learn fixtures.
- `npm run test:list-query`: URL parsing, search, sorting, pagination and defaults.
- `LIST_SSR_ORIGIN=http://localhost:3110 npx tsx scripts/tests/list-ssr.ts`: four language/list routes.
- Production acceptance: 147 distinct affected/core URLs, including 52 old dead-link source pages, 56 quarter-copy URLs and all 14 Learn language pages. Old invalid target links retained by a source were re-fetched and required to resolve.
- Browser: six templates in both languages, stock-only-Q3 and mixed-quarter sources, Learn references, sorting/search/pagination/history, investor filter, mobile width; no console errors in the inspected pages.
- Changed-code lint and whitespace checks. Repository-wide lint was not used as a clean gate: the investor index already contains a `Date.now()` purity warning on the base branch.

Independent branch review identified one P2 footer-quarter issue; it was corrected with a failing-then-passing actual-route regression and single/mixed/unknown footer fixtures. Final acceptance also caught an outer Suspense streaming segment; removing that obsolete boundary put numeric rows inside main HTML. A remaining stock disclaimer claiming a maximum 45-day lag was corrected with another failing-then-passing route check.

Local audit/acceptance evidence is retained outside Git under `TheCompounder/reports/seo-geo-repairs-2026-10-30/` (`acceptance.py`, `acceptance.json`, compressed HTML); the original full-site audit is in the neighboring `seo-geo-audit-2026-10-30/` folder.

## Remaining dependency and limits

F17 remains a data-layer dependency: `effectiveFilingDeadline` handles weekends but not federal holidays. The known 2026Q4 case should be 2027-02-16. This branch does not change quarter-switching logic. F02 Dataset coverage and F05 sitemap dates from the already merged fix are preserved.

These checks establish page correctness and readability. Search Console indexing, live crawler access logs, AI citation rates and reliable Core Web Vitals measurements remain unmeasured. No PR merge or production promotion was performed.

Integration note: the only conflict with #259 was the Dataset route test for snapshot notes moved from the holdings table to the first screen. Retained the new first-screen assertions and this branch’s footer-period assertions together. The stock route auto-merge was inspected against both parents; the new summary UI and the SEO source/metadata fixes are both retained.

## Final code review cleanup (2026-10-31)

A fresh full-diff independent review identified four additional P2 gaps. All were corrected together:

1. Delegated filings: manager CIK and accession prefix are not used to guess the reporting filer. Valid accessions link to SEC's accession search. Verified in the SEC UI that `0001172661-26-003790` returns the Pershing Square Inc. report, reporting CIK `2026053`, filed 2026-08-14 for 2026-06-30. Stock provenance obtains accessions from a paged batch of filing metadata, matched to the actual holder period and submission date. Ambiguous/missing identities use the manager's 13F list including notices. No SEC network fetch was added to page rendering.
2. Lookup failures: eligibility returns `null` on failure and `[]` only for proven absence. Actual-route fixtures cover a current long holding against an exited-only snapshot: a failed lookup cannot enable the 404 link; a known-empty snapshot still permits a proven fallback destination.
3. Last-holder exits: homepage move cards and buy/sell rankings use the shared availability guard. Labels/counts stay visible; unavailable ItemList URLs are omitted. Actual component/route fixtures cover both languages and valid destinations.
4. Investor prose: the remaining equities-only claim was replaced with SEC Section 13(f) scope, site option filtering and the usual quarter-end filing deadline.

Fix review confirmed the four runtime issues resolved and the stock route merge compatible with the new identity safeguards. It identified one additional time-dependent test gate; the move fixture now freezes/restores its clock. The actual gate passes when launched under 2026-11-17, after the next filing deadline.

Final local verification: 22 facts checks, 13 data-pipeline behavior checks, remaining prebuild gates, TypeScript and the full 851-output production build passed. Changed-code lint, list-query checks, four raw-main-HTML checks and expanded 149-URL production acceptance passed (zero reported issues). Browser checks verified the corrected Pershing source and prose, the matching source on UBER, and no console errors. The SEC lookup source is [the original reporting filer index](https://www.sec.gov/Archives/edgar/data/2026053/000117266126003790/0001172661-26-003790-index.htm), verified 2026-10-31.

No unresolved blocking code-review finding remains in the reviewed SEO/GEO scope. F17 and the operational measurement limits above remain explicitly outside that verdict. Remote checks are reported separately for the final pushed commit.
