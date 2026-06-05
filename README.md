# NY Fed Treasury Monitor

Real-time dashboard for NY Fed market data, Treasury auctions, institutional 13F holdings, and AI-assisted market commentary.

## Tech Stack

- **Next.js 16** (App Router, SSR + API Routes) / React 19 / TypeScript / Tailwind CSS v4
- **Supabase** (13F holdings storage + AI commentary cache)
- **Vercel** (hosting + cron jobs)
- **Node 20**
- **DeepSeek** (optional AI interpretation layer)

## Quick Start

```bash
cd web
nvm use
npm install
npm run dev