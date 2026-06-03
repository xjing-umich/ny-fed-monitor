# NY Fed Treasury Monitor

Real-time dashboard for NY Fed market data, Treasury auctions, and institutional 13F holdings.

## Tech Stack

- **Next.js 16** (App Router, SSR + API Routes) / React 19 / TypeScript / Tailwind CSS v4
- **Supabase** (13F holdings storage)
- **Vercel** (hosting + cron jobs)
- **Node 20**

## Quick Start

```bash
cd web && nvm use && npm install && npm run dev
# → http://localhost:3000/zh
```

## Data Sources

- **Reference Rates** (SOFR/EFFR/OBFR/TGCR/BGCR), **SOMA Holdings**: NY Fed Markets API
- **Treasury Auctions**: US Treasury API
- **13F Institutional Holdings**: SEC EDGAR (via `npm run ingest` → Supabase)
- **Policy Expectations**: NY Fed SME survey (`data/manual/sme_latest.xlsx`)

## Deployment

Deployed on Vercel as `ny-fed-monitor`. Push to `db-foundation` triggers production deployment.

See [PROJECT_GUIDE.md](PROJECT_GUIDE.md) for full setup instructions.
