# Native 40-F financial coverage

User-approved scope (2026-10-31): remove SPY, DIA, MDY and SWZ from corporate financial queues, then begin BMM/NICM structured financial restoration and create a PR after review.

Source audit on 2026-10-31: SEC submissions are available; companyfacts returns 404 for both issuers. BMM's latest 40-F (0001554855-26-000717, filed 2026-04-24) and NICM's (0001104659-26-049487, filed 2026-04-27) contain IFRS 2025/2024 financials in CAD. The extracted instances include financial exhibits which the primary cover documents omit. NICM is an ADR; the product has no verified ADS conversion ratio. BMM has no standard IFRS Revenue fact; absence is unknown, not zero.

Implement an audited issuer fallback that saves native annual values with provenance in a separate table. Keep existing USD financial consumers and valuations isolated until historical FX and security-unit conversion have their own validated contract. Ingest success must explicitly disclose native currency and valuation blockers; this phase does not claim recent interim coverage or valuation readiness. Preserve holdings and price universes when filtering the corporate queue.
