# Production SEO/GEO acceptance — 2026-10-31

Verdict: PR #261 deployed successfully and its core repairs are visible in production. Full-site acceptance remains blocked by one screener link-eligibility gap, reproduced for TYL in both languages. The follow-up patch removes unsupported destinations; it needs its own PR merge and production deployment before the site can receive a clean link verdict.

## Deployment provenance

- Production project: `xjing-umichs-projects/ny-fed-monitor`, public origin `https://thecompounder.fyi`.
- PR #261 merge: `a6843f42841acf31f343335fab6fa81cc70ca0b9`, merged 2026-10-31 02:21:42 UTC.
- That merge's production deployment `dpl_BhYFaMQQEWdiy4oxh1MMu4hUoRAS` is Ready.
- Public-domain deployment at the final check: `dpl_CUK4SSVK1JQYSTn42imxYTmW5Pk2`, Ready, production commit `4ac34ab237e4d2b3c17c584003c32a7b50266e88`, created 11:59 HKT. Git ancestry confirms it includes #261.
- Other changes were deploying during the crawl. Checks were made against the real public domain; this is a time-bounded production observation, not an immutable-deployment snapshot.

## Full public-page crawl

Read-only crawl: 2026-10-31 03:53:58–04:15:03 UTC (11:53:58–12:15:03 HKT). Started with every sitemap URL, added query/filter variants, then followed internal links to closure. No application, database or ingestion writes.

| Check | Observed result |
| --- | --- |
| Sitemap inventory | 2,636 URLs, all HTTP 200 and reachable from the homepage graph |
| Complete discovered URL graph | 4,286 URLs: 4,284 HTTP 200, 2 HTTP 404 |
| Valid-page technical checks | No missing/duplicate H1, canonical/hreflang mismatch, missing metadata, JSON-LD parse errors, or missing OG image metadata reported |
| Duplicate metadata | No duplicate titles/descriptions across distinct canonical pages in either language |
| Six page families | Landing, stocks index, stock detail, investors index, investor detail and Learn checked in English and Chinese |
| Actual holder periods | Dataset coverage agrees with source periods; single-Q3 and mixed-Q2/Q3 FAQ/footer language agrees |
| Learn | All 7 articles × 2 languages have citations, readable references, publication/modification dates and section anchors |
| Unavailable stock destinations | **Failed:** `/stocks/TYL` and `/zh/stocks/TYL`, 6 incoming screener source/target pairs |

The six failing sources are `/stocks/screener`, `/stocks/screener?sort=holders`, `/stocks/screener/all-holders`, and their `/zh` counterparts. TYL has a valuation row without current-holder evidence for an available detail page. Keep that valuation row readable, but do not advertise a nonexistent detail URL. Error-page H1/canonical/English OG warnings in the raw report are consequences of these same two 404 responses.

Two nonblocking semantic-detector observations concern `/stocks/343928115` and its Chinese counterpart. They are intentionally `noindex,follow` raw-CUSIP pages with truthful generic metadata that makes no quarter claim. Their Dataset, FAQ and readable sources agree on Q2 2026. Missing-quarter metadata enrichment is recorded as a fallback, not a wrong-quarter regression.

## Browser and crawl-access checks

- 27 desktop page visits across the six families and edge cases; one H1 and no console errors in inspected pages.
- 8 mobile checks at 375px: document width remained 375px, including Chinese stock/detail pages.
- Stock sorting, pagination, search, back navigation and investor buying filter worked; numeric default list rows are present inside raw main HTML.
- AAPL mixed-period example: `2026-06-30/2026-09-30`; MAVF single-period example: `2026-09-30`; SPY: `InvestmentFund`, Q2 2026.
- Pershing source visibly uses the actual accession search URL, including delegated filings. Fairfax/Patient historical labels remain readable without the previously broken destinations.
- 23 representative/Article OG images returned HTTP 200, PNG, 1200 × 630, with no redirects.
- `robots.txt`, `llms.txt` and `llms-full.txt` returned 200. Five user-agent smoke checks (OAI-SearchBot, ChatGPT-User, PerplexityBot, Googlebot, Bingbot) were robots-allowed and received numeric list HTML. These are agent-string tests, not verified requests from crawler IP ranges.

## Follow-up implementation

The screener reuses `readStockLinkHolders` and `currentStockKeys`, the same non-exited/current-period policy as stock detail pages and the earlier investor/ranking repairs. One batched, paged lookup supplies an availability set to desktop/mobile rows, the expandable tail and CollectionPage/ItemList URLs. Lookup failures suppress unverified links while retaining all valuation rows, values, labels, counts and order. URL-less ItemList entries retain their names and positions.

Regression: the real ScreenerPage initially failed on the TYL destination; after the fix it passed in both languages, all four views, both sorts, head/tail rows, exited/stale/missing holders and failed lookups. The 23-check facts gate passes. Independent review found no actionable blockers. Full `npm run build` passed: all prebuild gates (23 facts checks and 35 data-pipeline behavior checks), TypeScript and all 851 generated pages. Standalone TypeScript, changed-code ESLint and whitespace checks also passed. The 14 generated screener language/variant HTML outputs retain available stock links and contain no TYL destination in DOM or JSON-LD; the all-valued variants retain the TYL label. Remote preview status is reported with the follow-up PR.

## Evidence and limits

Full evidence is local under `TheCompounder/reports/seo-geo-production-2026-10-31/`: `summary.json`, `all-pages.csv`, `broken-links.json`, `semantic-checks.json`, `deployments.json`, `browser-checks.json`, `og-images.json`, `bot-smoke.json`, compressed HTML and the read-only crawl script. The previous audit remains in the adjacent `seo-geo-audit-2026-10-30/` folder.

This verifies deployed page content and technical access. Search Console indexing, actual search/AI citation rates, crawler access logs and reliable Core Web Vitals were not measured. F17 (federal-holiday filing deadlines) remains the previously recorded separate data-layer dependency. No manual production deployment, promotion, database write or new-PR merge was performed.
