# F17 — SEC filing deadlines and federal holidays

Scope: correct the shared 13F deadline calculation and its consumers. The nominal quarter-end + 45 days remains available as `filingDeadline`; `effectiveFilingDeadline`, due-quarter detection and moves gating now extend through weekends and observed federal holidays to the next SEC filing business day. Price/trading-day freshness is separate and unchanged.

## Root cause and examples

The previous private `rollWeekend` stopped on Monday even when that Monday was a federal holiday. Existing fixtures explicitly expected the incorrect result, so the gap also affected current-holder eligibility, quarterly-change baselines, report readiness and health alerts.

| Report period | Previous effective deadline | Correct effective deadline |
| --- | --- | --- |
| 2025-12-31 | 2026-02-16 | 2026-02-17 |
| 2026-12-31 | 2027-02-15 | 2027-02-16 |
| 2026-09-30 | 2026-11-16 | 2026-11-16 (unchanged) |

## Sources verified 2026-10-31

- [SEC Form 13F FAQ, Question 25](https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f), question updated March 6, 2026: the complete 2026–2028 quarter schedule and the Q4 2025 weekend/holiday example.
- [SEC EDGAR calendar](https://www.sec.gov/submit-filings/filer-support-resources/edgar-calendar), page updated October 20, 2026: EDGAR's 11 federal closures for 2026.
- [OPM federal holidays](https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/): statutory holiday rules and Friday/Monday observed dates, including cross-year New Year's Day observance.

The runtime uses deterministic UTC date arithmetic and cached recurring federal holiday sets, without network requests or a new dependency. It deliberately uses EDGAR closures rather than a stock-exchange calendar; Good Friday is not excluded. Juneteenth is only applied from its federal introduction in 2021. Exceptional SEC closures are not inferred from exchange schedules.

## Verification

- Observed RED: `derive.check.ts` returned 2027-02-15 where the SEC schedule requires 2027-02-16; report-readiness fixture became ready before the extended Q4 2025 deadline closed.
- GREEN: all 13 published/example deadline cases (Q4 2025 and every quarter of 2026–2028).
- Boundary fixtures: the holiday and actual deadline days retain the previous quarter's holder eligibility and moves baseline; the next day applies the new quarter, still subject to coverage. Report readiness and watchdog grace/late alerts use the extended date.
- Calendar fixtures: all 11 SEC 2026 federal closures, Saturday/Sunday observance, cross-year New Year, Juneteenth introduction, Good Friday, unchanged ordinary deadline, input immutability and invalid/overflow-date handling.
- UTC fixtures also pass under `America/New_York` and `Pacific/Kiritimati`.
- These behavior checks are part of `check:facts`, so the previous ad-hoc deadline checks now run during every build.

Full `npm run build` passed with 27 facts checks, 42 data-pipeline behavior checks, TypeScript and 851 generated pages. Changed-code ESLint and whitespace checks passed. Independent review passed with no outstanding findings after an additional failing-then-passing maximum-Date overflow regression. Remote preview status is reported with the PR. This patch does not publish a quarterly report, send messages, ingest data or change production records. It is not merged or deployed merely by creating the PR.
