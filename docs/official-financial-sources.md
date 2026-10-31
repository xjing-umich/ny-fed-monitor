# Official financial source recovery

User request2026-10-31: handle the remaining five SEC source gaps, prioritize reliably attachable financial sources and create a PR after review.

The source audit confirms three machine-readable annual originals: IBN's latest SEC20-F HTML (Indian-GAAP/INR), HMRZF's official ESEF (IFRS/SEK) and HKHHF's official-site-linked inline XBRL viewer copy (IFRS/EUR). The Holding ESEF ZIP currently lacks a report instance; its viewer copy must not be mislabeled formal ESEF. HKHHF is Heineken Holding, not Heineken N.V.; parent-attributable profit and issuer shares differ. H&M fiscal year ends November30; its stock counts and monetary facts have different scales. IBN banking primary statements use rupee thousands except EPS and distinguish total income from net revenue, before/after noncontrolling interest and accumulated retained profit; US-GAAP reconciliations are separate.

This change restores source-proven native annual records in a separate private table, with original units, accounting basis, source version/date/URL/SHA and per-field evidence. Existing USD valuation consumers and #270's narrow40-F records remain isolated. FX normalization, ADS/ordinary-share conversion, latest interim statements and valuation activation are future work, not inferred outputs.

OZK reports consolidated corporate financials to FDIC (certificate110). Its official JSON index is available, but underlying statements are PDFs; the latest Q3 earnings8-K lacks CFO and cannot substitute for a full10-Q. TRMLF official Canadian financials are also PDF; source metadata/CMS dates are not necessarily reporting/approval dates, and TRMLF ordinary shares must not become TRMOY ADRs. Both remain operating companies with explicit pending-PDF-adapter outcomes, never successful financial coverage, excluded companies or generic unexplained SEC404 retries.

Primary audit evidence (checked2026-10-31) is retained in the task's reports/sec-remaining-five-2026-10-31 research folder; committed fixtures/runbook must carry original public URLs, dates and the essential reproducible conclusions.
