# Recovering an interrupted fundamentals batch

The full holdings universe reached about 2,000 SEC-resolvable tickers on
2026-10-30. Actions run `41081817577` reached the old 90-minute job timeout
before finishing its final tickers; cancellation also skipped publication.
The job now allows 120 minutes. Scheduled runs still ingest the full universe.

For manual recovery, dispatch **Daily Fundamentals (full holdings)** with the
optional `resume_since` input set to the interrupted batch's UTC job start,
for example `2026-10-30T17:04:06Z`. Use a batch from within the past 24 hours
and the **same ingestion code and normalization rules** as the recovery run.
Leave the input empty after any ingestion change: old successes cannot prove
that new normalization or publication rules have been applied.

The CLI equivalent is `SEC_RESUME_SINCE=<UTC timestamp> npm run sec:ingest:holdings`.
With a numeric limit, the limit applies to the original ranked universe before
completed targets are removed. `--dry` prints the remaining targets without
ingesting or publishing anything.

Recovery reads all company-ingestion attempts since the boundary, then skips
only tickers whose latest attempt succeeded. Failed, interrupted (`running`),
and unattempted tickers are retried. Journal pagination or read failures abort
recovery before SEC writes. Existing queue-based page publication and valuation
recomputation still run after ingestion finishes, including on reported source
failures; a job cancellation cannot run that downstream work.

Use the `sec-fundamentals` concurrency group to serialize recovery with another
full batch. Inspect the ingestion summary and publication steps, rather than
treating a green job as proof of complete data coverage. Unavailable SEC
companyfacts remain explicit failures, not fabricated financial data.
