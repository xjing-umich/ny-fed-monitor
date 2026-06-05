This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Production DeepSeek AI Commentary

The Chinese monitor page can show optional DeepSeek commentary from a Supabase-backed cache. DeepSeek runs only in server-side API routes and only analyzes existing deterministic dashboard data plus bundled derived metric rules. It does not fetch raw NY Fed or Treasury data and must not provide direct buy/sell recommendations.

Add these Vercel environment variables:

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

Do not use `NEXT_PUBLIC_DEEPSEEK_API_KEY`; the DeepSeek key must never be exposed to the browser.

Create the Supabase cache table by applying `web/supabase/schema.sql`, or run this SQL:

```sql
create extension if not exists pgcrypto;

create table if not exists ai_analysis_cache (
  id uuid primary key default gen_random_uuid(),
  page_key text not null,
  analysis_json jsonb not null,
  model text,
  source_data_timestamp text,
  created_at timestamptz not null default now()
);

create index if not exists ai_analysis_cache_page_created_idx
  on ai_analysis_cache (page_key, created_at desc);
```

Deploy, open:

```text
https://ny-fed-monitor.vercel.app/zh
```

Then click `Refresh AI Analysis`. The page reads cached commentary from:

- `GET /api/ai-analysis`

The refresh button calls:

- `POST /api/refresh-ai-analysis`

Production checks:

- `/zh` loads normally.
- `GET /api/ai-analysis` returns cached commentary or an unavailable message.
- `POST /api/refresh-ai-analysis` works when `DEEPSEEK_API_KEY` is set.
- DeepSeek API keys do not appear in browser source, frontend bundles, or network responses.
