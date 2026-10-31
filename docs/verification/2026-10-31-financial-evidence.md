# Financial evidence coverage verification — 2026-10-31

## Dated scope

Read-only production capture completed 2026-10-31 02:18:35 UTC: 2,467 SEC-company/held-ticker union records, including 2,296 entries in consensus holdings. This does not describe the user's personal portfolio. Original financial rows, source inventories and the frozen replay are retained in the task's `reports/financial-coverage-2026-10-31` artifact directory outside this checkout.

The frozen primary classifications contain 860 growth-evidence exclusions: 125 direct coverage/comparison/filing gaps (78 held, 47 unheld), and 735 reinvestment exclusions. These are not 860 confirmed ingestion defects. Current official SEC submissions for all 47 unheld candidates were checked; 40 have a newer financial period and are outside the held-only refresh workflow. Twenty-six domestic revenue candidates were checked against current official primary financial statements; missing source lines were not coerced to zero.

## Confirmed repairs

- Native comparable-income evidence from 6-K HTML is stored separately from USD annual/full-TTM fundamentals. Full current source proofs support 38 of 39 verified foreign candidates; DRTS reports no revenue line and remains explicitly ineligible.
- Supported candidate tickers: AER, AQN, ARCO, ATAT, BEKE, BRSL, BULL, CAMT, CGEN, CHKP, DOX, DSGX, FINV, FSV, GENI, GLBE, HTHT, INMD, ITRN, JD, JOYY, MGA, MNDY, MRT, NBIS, NICE, NOAH, NTES, NVMI, PDD, QFIN, SBLK, SIMO, STM, TCOM, TSEM, WB, WIX. The source fixtures retain SEC URLs/accessions and financial periods.
- BRSL uses a later complete interim report; MGA supports both direct nine-month statements and a later same-day financial history. SEC acceptance timestamps resolve source ordering; unknown timestamps remain conservative. Comparable prior quarters are additive reported flows with explicit source derivation, not invented quarterly data.
- CHKP/WIX/GLBE use a proven common statement `$` unit with an unknown ISO code. These values support ratios only. GLBE consolidated net income comes from the matching consolidated cash-flow opening-income row, with provenance; attributable earnings are never substituted.
- Annual 20-F/40-F backfill and issuer-specific consolidated revenue policies restore otherwise omitted inputs. AMH/ILPT use verified lease-income totals; APA uses its verified custom total; SWX preserves continuing regulated revenue while rejecting comparisons to old Centuri-inclusive totals. DNTH requires the sole primary-statement license-revenue row, with USD/context/value checks; note-only consideration amounts cannot become revenue totals.
- Missing Q1 additive flows can be recovered only from co-reported H1 and actual Q2 in the same accession. Current official ALNY/CBZ/CCC/GHC sources retain their proven recoveries; later recast comparisons cannot manufacture Q1.
- Annual reinvestment uses annual flow/balance endpoints, preserving economic and alignment failures. The ACM 52/53-week presentation difference uses the existing seven-day date tolerance.

## Approved reference policy and limits

The user explicitly chose a pending zero-growth reference when recent comparable periods are covered but historical reinvestment evidence does not support a growth estimate. Only `missing_reinvestment` qualifies. It uses pure zero-growth EPV endpoints; no AV/GV/growth-DCF premium, margin claim, expectations or strike flag. `reliable=false` and `referenceOnly=missing_reinvestment` persist through every snapshot projection. Detail/holding/screener labels remain pending in English and Chinese. Confirmed cheap/strike queries retain their reliability filters. Other evidence gaps and hard guards remain suppressed.

Local replay with captured financial rows plus verified foreign comparable-income evidence produces 714 normal verdicts and 396 pending zero-growth references. This excludes the subsequent domestic source backfills from that replay and is not a production restoration count. PDD becomes assessable using 2026-H1 native comparables (revenue +9.4813%, consolidated net income -12.6758%); its full annual earnings basis remains separately dated.

## Checks

The release gate includes 31 data-pipeline behavior checks, app/scripts TypeScript, all valuation checks, bilingual SSR reference/badge checks, local PostgreSQL migration/permission/constraint checks, and a Next compile-mode build. Source parser review covers complete original SEC bodies as well as fixtures, including currency conflict, changed column order, non-GAAP heading, duplicate subtotal/income and publication-time regressions.

Production migration/deployment/reingestion have not been performed by this branch. Follow `docs/financial-evidence-rollout-2026-10-31.md`; reingestion must precede a claim that repaired source evidence is live. Prior snapshot calculations are invalidated by `2026-10-31-coverage-v2` and the existing model-release workflow recomputes them.
