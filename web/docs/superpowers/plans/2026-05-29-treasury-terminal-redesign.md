# Treasury Terminal Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the NY Fed Treasury Dashboard frontend from a generic cluttered layout into a distinctive institutional "Treasury Terminal" design with a fixed left sidebar, top bar, and section-based routing.

**Architecture:** Replace the single-page `?s=` query-param routing with real Next.js routes (`/[lang]` for overview, `/[lang]/[section]` for each of the 9 sections). The `[lang]/layout.tsx` provides the full shell (sidebar + topbar), while `[lang]/page.tsx` is the overview and `[lang]/[section]/page.tsx` is each section detail. All data fetching uses the existing `buildAllSections()` which is cached upstream. Design tokens live in `globals.css`.

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind v4, shadcn/ui, next-themes, Geist Sans + Geist Mono (next/font/google), lucide-react, recharts.

---

## File Structure

### Files to CREATE
- `src/app/[lang]/[section]/page.tsx` — Section detail page (new route)

### Files to REWRITE (complete replacement)
- `src/app/globals.css` — Treasury Terminal design tokens (dark/light CSS vars)
- `src/app/layout.tsx` — Root layout: ThemeProvider defaultTheme="dark"
- `src/app/[lang]/layout.tsx` — App shell: sidebar + topbar + main area
- `src/app/[lang]/page.tsx` — Overview page: signal grid + watch list
- `src/components/dashboard/Sidebar.tsx` — Fixed sidebar with grouped nav, freshness dots, active state
- `src/components/dashboard/Header.tsx` — Top bar: AS OF, freshness pill, lang toggle, theme toggle, refresh
- `src/components/dashboard/DashboardCards.tsx` — Signal grid cards (dot severity, no color bars)
- `src/components/dashboard/MetricGrid.tsx` — KPI strip for section pages
- `src/components/dashboard/DataTable.tsx` — Dense table with collapsible overflow
- `src/components/dashboard/SectionChart.tsx` — Restyled recharts line chart (client)
- `src/components/dashboard/SectionChartClient.tsx` — Client boundary wrapper (minor update)

### Files to DELETE (old layout no longer needed)
- `src/components/dashboard/ExecSummary.tsx` — Replaced inline in overview page
- `src/components/dashboard/SectionPanel.tsx` — Replaced by section page

### Files to KEEP AS-IS (no changes needed)
- `src/app/page.tsx` — Already redirects to /zh
- `src/app/actions.ts` — refreshData server action, already correct
- `src/app/api/data/route.ts` — API route, no change
- `src/lib/*` — All lib files untouched
- `src/components/theme-provider.tsx` — No change
- `src/components/ui/*` — All shadcn primitives untouched
- `next.config.ts` — Already has turbopack root fix (`root: path.join(__dirname)`)

---

### Task 1: Update globals.css with Treasury Terminal tokens

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace globals.css entirely**

Replace the file content with the Treasury Terminal design tokens. The key changes:
- Map custom `--tt-*` variables for our specific palette (bg, panel, border, text, accent, positive, negative, warn)
- Wire shadcn variables to these tokens for both dark (`:root`) and light (`.light`) modes
- Default dark theme: bg `#0B0E14`, panel `#11151F`, etc.
- Add `.tnum` utility
- Add Geist Mono CSS var usage

Write the file as specified in the implementation details below.

- [ ] **Step 2: Verify CSS has no syntax errors**

Run: `cd /Users/junlinzhu/Desktop/yangyang-code/nyfed_treasury_web_agent_副本/web && export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && npx tsc --noEmit 2>&1 | head -20`

Expected: No CSS-related errors (TS won't catch CSS anyway, but this confirms the project at least compiles).

---

### Task 2: Update root layout (defaultTheme="dark")

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Update ThemeProvider defaultTheme**

Change `defaultTheme="system"` to `defaultTheme="dark"` and remove `enableSystem`. Keep Geist font variables.

```tsx
// src/app/layout.tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NY Fed Treasury Monitor",
  description: "NY Fed Treasury Market dashboard — live data from NY Fed and Treasury.gov.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--tt-bg)] text-[var(--tt-text)]">
        <ThemeProvider attribute="class" defaultTheme="dark" disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
```

---

### Task 3: Rewrite [lang]/layout.tsx — App Shell

**Files:**
- Modify: `src/app/[lang]/layout.tsx`

- [ ] **Step 1: Write the full app shell**

This layout renders: left fixed sidebar (240px) + right column (sticky topbar + main). It calls `buildAllSections()` to get section titles + freshness for the nav. The `Sidebar` and `TopBar` are client components that receive data as props.

Key Next 16 conventions:
- `params` is a `Promise<{lang:string}>` — must `await` it
- `generateStaticParams` returns `[{lang:"zh"},{lang:"en"}]`
- Do NOT render `<html>` or `<body>` here (root layout does that)
- `redirect` from `next/navigation` for invalid lang

The shell structure:
```
<div class="flex h-screen overflow-hidden">
  <Sidebar />  {/* fixed 240px, scrolls internally */}
  <div class="flex-1 flex flex-col overflow-hidden ml-[240px]">
    <TopBar />  {/* sticky 52px */}
    <main class="flex-1 overflow-y-auto">
      {children}
    </main>
  </div>
</div>
```

---

### Task 4: Rewrite Sidebar component

**Files:**
- Modify: `src/components/dashboard/Sidebar.tsx`

- [ ] **Step 1: Write new Sidebar**

The sidebar is a server component. Props: `lang`, `sections` (Record<string,Section>), `currentPath` (string).

Structure:
- Top: product mark — "NY FED" (faint mono uppercase 10px) + "TREASURY MONITOR" (text 14px 600)
- Separator
- "Overview" link to `/${lang}`
- Grouped nav (3 groups: Market Structure, Funding, Supply & Balance Sheet)
- Each nav item: `next/link` to `/${lang}/${key}`, freshness dot, single-lang title
- Active: 2px left accent bar + accent-tinted bg + accent text color
- Freshness dot colors: Fresh→positive, Stale→warn, others→faint

Group mapping (only the 9 live sections):
- Market Structure: dealer-inventory, transactions, market-share
- Funding: repo-financing, reference-rates, facility-usage, fails
- Supply & Balance Sheet: auction-risk, soma

---

### Task 5: Rewrite Header/TopBar component

**Files:**
- Modify: `src/components/dashboard/Header.tsx`

- [ ] **Step 1: Write new TopBar**

This is a CLIENT component (needs useTheme, useTransition).

Props: `lang`, `asOf` (string), `summary` (Summary), `refreshAction` (server action).

Layout (52px sticky):
- Left: breadcrumb area (just "Treasury Monitor" or current section — layout passes it)
- Right cluster: `AS OF HH:MM` (mono faint) | freshness pill | lang toggle (zh|en buttons) | theme toggle (sun/moon) | refresh icon

Freshness pill logic:
- If `summary.live_sections.length === summary.section_order.length` and no unavailables → "LIVE" (positive)
- Else → "PARTIAL" (warn)

Language toggle: two small buttons linking to `/${otherLang}` + same section suffix. Since layout doesn't know current section, pass `currentPath` and replace `/${lang}/` with `/${otherLang}/`.

---

### Task 6: Rewrite DashboardCards for Overview page

**Files:**
- Modify: `src/components/dashboard/DashboardCards.tsx`

- [ ] **Step 1: Write new SignalGrid**

Cards (6, 3-col desktop):
- 11px uppercase muted label
- Big mono value (the section's first metric value or freshness_status)
- Small severity DOT (not a left bar) colored via badgeTone
- One-line detail text (muted)

No full-height left color bar. No gradient.

---

### Task 7: Rewrite MetricGrid for KPI strip

**Files:**
- Modify: `src/components/dashboard/MetricGrid.tsx`

- [ ] **Step 1: Write new KPI strip**

Compact stat tiles:
- 11px uppercase muted label (via metricLabel)
- 24px mono .tnum value with trend glyph (▲/▼ colored positive/negative)
- No Card wrapper — just a grid of simple bordered divs

---

### Task 8: Restyle SectionChart

**Files:**
- Modify: `src/components/dashboard/SectionChart.tsx`

- [ ] **Step 1: Restyle the recharts chart**

Keep the recharts LineChart structure but update:
- Series palette: accent #6E8BFF + teal #3DB8A0 + amber #D9A642 + slate
- Grid: horizontal only, hairline (`#1C2230` dark)
- Axis text: mono small (11px), muted color
- Tooltip: panel bg `#11151F` + border `#1C2230` + mono values
- strokeWidth: 1.5px, no dots, no animation

---

### Task 9: Update DataTable

**Files:**
- Modify: `src/components/dashboard/DataTable.tsx`

- [ ] **Step 1: Update table styling**

Keep logic, update visual:
- Dense rows (py-1.5)
- Header: 11px uppercase faint letter-spacing
- Odd rows: slightly different bg for readability
- Mono `.tnum` for numeric columns
- Hairline borders `#1C2230`

---

### Task 10: Create [lang]/[section]/page.tsx

**Files:**
- Create: `src/app/[lang]/[section]/page.tsx`

- [ ] **Step 1: Write the section page**

```tsx
// src/app/[lang]/[section]/page.tsx
import { notFound } from "next/navigation";
import { buildAllSections } from "@/lib/build";
import MetricGrid from "@/components/dashboard/MetricGrid";
import DataTable from "@/components/dashboard/DataTable";
import SectionChartClient from "@/components/dashboard/SectionChartClient";
import { buildChartSpec } from "@/lib/charts";
import { trendDirection } from "@/lib/format";
import {
  keyMetricLimit,
  tablePreviewCount,
  sectionLabel,
  metricLabel,
  displayStatusValue,
  inferSectionMode,
  chartExpected,
} from "@/lib/dashboard";

export const dynamic = "force-dynamic";

const SECTION_KEYS = [
  "dealer-inventory","transactions","repo-financing","fails",
  "market-share","reference-rates","soma","facility-usage","auction-risk",
];

export function generateStaticParams() {
  return ["zh","en"].flatMap(lang =>
    SECTION_KEYS.map(section => ({ lang, section }))
  );
}

type Lang = "zh" | "en";

export default async function SectionPage({
  params,
}: {
  params: Promise<{ lang: string; section: string }>;
}) {
  const { lang: rawLang, section } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  const data = await buildAllSections();
  const s = data.sections[section];
  if (!s) notFound();

  // ... render section detail
}
```

Key sections to render:
1. Header: title + mode chip + freshness pill + `DATA <data_date>` (mono)
2. KPI strip: key_metrics (limited via keyMetricLimit) in compact tiles
3. Chart: buildChartSpec → SectionChartClient or "chart unavailable"
4. Interpretation block (single lang)
5. Why it matters block (single lang)
6. Tables (DataTable, collapsible)

---

### Task 11: Rewrite [lang]/page.tsx — Overview

**Files:**
- Modify: `src/app/[lang]/page.tsx`

- [ ] **Step 1: Write new overview page**

Remove: old SectionPanel, old Sidebar usage, old ExecSummary, searchParams, etc.

New structure:
```tsx
export const dynamic = "force-dynamic";

export default async function OverviewPage({ params }) {
  const { lang } = await params;
  const data = await buildAllSections();

  return (
    <div className="p-4 max-w-[1180px] mx-auto space-y-6">
      {/* Title row */}
      <div>
        <h1 className="text-[20px] font-semibold text-[var(--tt-text)]">Overview</h1>
        <p className="text-[11px] font-mono text-[var(--tt-faint)] uppercase tracking-widest mt-1">
          AS OF {data.as_of}
        </p>
      </div>

      {/* Signal grid */}
      <SignalGrid lang={lang} sections={data.sections} />

      {/* What to Watch */}
      <WatchPanel lang={lang} summary={data.summary} />
    </div>
  );
}
```

---

### Task 12: End-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript check**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/nyfed_treasury_web_agent_副本/web
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Run existing tests**
```bash
npm run test
```
Expected: All pass (lib tests don't touch UI components).

- [ ] **Step 3: Start dev server and curl**
```bash
npm run dev &
sleep 5
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/zh
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/zh/dealer-inventory
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/en/soma
```
Expected: 200 for all three.

- [ ] **Step 4: Verify no bilingual labels**
```bash
curl -s http://localhost:3000/zh | grep -o 'dealer-inventory\|交易商库存\|Dealer Inventory' | sort | uniq
```
Expected: Only Chinese labels appear in /zh HTML (or only the section key in href).

- [ ] **Step 5: Kill dev server**
```bash
kill %1
```
