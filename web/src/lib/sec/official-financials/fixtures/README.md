# Source-derived annual fixtures

Originals checked **2026-10-31 UTC**. These are small factual excerpts, not complete filings: exact primary statement tables or selected inline facts plus all referenced contexts/units. Wrapper markup is simplified; reported values, concept names, identifiers, periods, units, signs and scale are unchanged. Literal expected values were hand-checked against the originals, independently of the application parsers.

| Issuer | Original source / available date | Reporting periods | Source contract |
|---|---|---|---|
| IBN | [SEC20-F](https://www.sec.gov/Archives/edgar/data/1103838/000095010326010820/dp249803_20f.htm), filed2026-07-20 | FY2026-03-31 and FY2025-03-31 | Primary Indian-GAAP INR thousands except EPS; gross total income, before-NCI profit, parent profit and retained profit are distinct. No USD/US-GAAP reconciliation or ADS conversion. |
| HMRZF | [Official Swedish ESEF ZIP](https://hmgroup.com/wp-content/uploads/2026/03/hm-2025-11-30-0-sv.zip), published2026-03-26 | FY2025-11-30 and FY2024-11-30 | IFRS/SEK, LEI529900O5RR7R39FRDM42. Money scale6, shares scale3, localized numeric transforms. ClassB listing is not a separate issuer. |
| HKHHF | [Official linked viewer copy](https://staticcontents.investis.com/html/h/heineken-holding/ar-2025/ixbrl-viewer.htm), annual report published2026-02-11 | FY2025-12-31 and FY2024-12-31 | IFRS/EUR, Holding LEI724500M1WJLFM9TYBS04. Viewer is not formal ESEF. Standard Revenue includes excise duties; parent-owner profit952m differs from consolidated profit2138m and from HeinekenN.V. profit. |

Landing fixtures contain only original annual-source links from the [H&M index](https://hmgroup.com/investors/reports/) and [Holding index](https://www.heinekenholding.com/investors/results-reports-webcasts-presentations). Current Holding ESEF ZIP contains taxonomy/linkbases without a report instance; it is deliberately not the selected source. Numeric `scale` in stored field evidence is a multiplier; `reported_scale` preserves an inline XBRL exponent when present.

Latest interim coverage is **not** restored by these annual adapters. H&M has a nine-month report published2026-09-24 (period2026-08-31); Holding has H1 published2026-08-05, followed by a Q3 trading update2026-10-28 without complete quarterly balance/CFO. IBN's annual report does not establish current interim/TTM coverage. All new records remain valuation-ineligible.
