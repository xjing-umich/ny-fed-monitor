# Compounder SEC 10-K / 10-Q Data Layer

This project implements a persistent SEC -> Normalize -> Supabase -> API -> Frontend data pipeline.

## Environment Variables

Required locally and on Vercel:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SEC_USER_AGENT="Compounder Research y0276406@gmail.com"
```

`SUPABASE_SERVICE_ROLE_KEY` is only used by server-side ingestion/API code. Never expose it with a `NEXT_PUBLIC_` prefix.

## Supabase Migration

Migration file:

```text
supabase/migrations/20260608_create_sec_company_fundamentals.sql
```

Apply it with one of:

```bash
supabase db push
```

or paste the SQL into the Supabase SQL editor for the production project.

The migration creates:

- `sec_companies`
- `sec_filings`
- `company_fundamentals_periods`
- `company_fundamentals_latest`
- `sec_ingest_runs`

## Local Ingest

```bash
npm run sec:ingest -- AAPL
npm run sec:ingest -- MSFT
npm run sec:ingest -- BRK.B
npm run sec:ingest:all
```

The scripts use the same SEC normalization logic as the API routes and write directly to Supabase.

## API

- `POST /api/sec/ingest/company` with `{ "ticker": "AAPL" }`
- `POST /api/sec/ingest/all` with optional `{ "limit": 40, "force": false }`
- `GET /api/sec/company/[ticker]`
- `GET /api/sec/fundamentals/latest`

GET routes read from Supabase only. They do not request SEC in real time.

## Frontend

- `/zh/stocks` shows latest SEC summary metrics for the ticker universe.
- `/zh/stocks/[ticker]` shows company overview, recent filings, annual/quarterly fundamentals, quality checks, and AI-readable normalized fundamentals JSON.

If Supabase has no data, pages show:

```text
SEC 数据尚未同步，请先运行 /api/sec/ingest/company 或 /api/sec/ingest/all。
```

## Verification SQL

```sql
select * from sec_companies limit 20;

select
  ticker,
  form,
  filing_date,
  report_date,
  accession_number
from sec_filings
order by filing_date desc
limit 50;

select
  ticker,
  fiscal_year,
  fiscal_period,
  revenue,
  net_income,
  free_cash_flow,
  cash_and_equivalents,
  total_debt,
  shareholders_equity,
  data_quality
from company_fundamentals_periods
order by ticker, period_end desc
limit 100;

select * from company_fundamentals_latest order by ticker;

select * from sec_ingest_runs order by started_at desc limit 20;
```

## AI Safety Boundary

The AI-readable JSON contains normalized fundamentals and quality metadata only. Raw SEC JSON is not passed to the frontend AI payload.

Allowed AI analysis:

- financial trend summaries
- growth quality summaries
- profitability summaries
- cash flow quality summaries
- leverage risk summaries
- data missingness warnings

Disallowed:

- buy/sell recommendations
- target prices
- undervalued/overvalued claims without a future valuation model
