# Per-Ticker External Finance Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal, unified-gray icon row (Yahoo / Google / SEC EDGAR) to every stock — on each row of the stocks list table and in the detail page's Key Facts area — so users can jump to deep external data the site can't host on free infra.

**Architecture:** A pure URL builder (`buildExternalFinanceLinks(ticker)`) derives all three links from the ticker alone (no `exchange` data — verified `securities.exchange` is `"US"` for all rows, so Google uses a search URL instead of a Finance quote URL). A single Server Component `ExternalFinanceLinks` renders the icon row in two `variant`s. Yahoo/Google logos are inlined Simple Icons SVGs (zero new deps, CC0); SEC uses lucide `FileText`. Hover reveals each brand color; the table variant stays near-invisible until the row is hovered/focused (pure CSS group-hover), always visible on mobile.

**Tech Stack:** Next.js 16.2.6 (App Router, React Server Components), Tailwind CSS, lucide-react (already installed). All new components are Server Components — no `"use client"` (hover is pure CSS).

**No tests in this project (per user standing instruction):** do NOT write `*.test.*` files or add a test runner. Verify everything with `npx tsc --noEmit` and manual checks in the dev server.

**Repo note (IMPORTANT):** `web/AGENTS.md` warns this Next.js version has breaking changes — consult `node_modules/next/dist/docs/` before writing any Next-specific code. This feature is plain React + Tailwind + plain `<a>` external links, so no Next-specific APIs are introduced, but heed this if anything unexpected arises.

**Working directory:** All paths are relative to `web/`. Run all commands from `web/`.

---

### Task 1: Pure URL builder + ticker guard (`externalLinks.ts`)

**Files:**
- Create: `web/src/lib/externalLinks.ts`

(No test file — this project does not use tests. Correctness is verified by the inline sanity check in Step 2 and by clicking links in Task 7.)

- [ ] **Step 1: Write the implementation**

Create `web/src/lib/externalLinks.ts`:

```ts
// 个股外部数据出口 URL 构造。纯函数, 仅依赖 ticker(已核实 securities.exchange 全为 "US",
// 无法构造 Google Finance quote 页, 故 Google 走搜索 URL)。无网络、无 DB, 可单测。

export type ExternalFinanceUrls = { yahoo: string; google: string; sec: string };

/**
 * 像 ticker 而非 CUSIP 吗？CUSIP 为 9 位含数字, ticker 为 1–6 个字母(可带一位类别后缀)。
 * 用于在 cusip-fallback 行/页上跳过外链(避免把 cusip 当 ticker 拼出无效链接)。
 */
export function isLikelyTicker(s: string): boolean {
  return /^[A-Za-z]{1,6}(\.[A-Za-z])?$/.test(s);
}

/** ticker → Yahoo / Google / SEC EDGAR 三个 URL。 */
export function buildExternalFinanceLinks(ticker: string): ExternalFinanceUrls {
  const t = ticker.trim().toUpperCase();
  const yahooSym = encodeURIComponent(t.replace(/\./g, "-")); // BRK.B → BRK-B
  const enc = encodeURIComponent(t); // encodeURIComponent 保留 "." 不变
  return {
    yahoo: `https://finance.yahoo.com/quote/${yahooSym}`,
    google: `https://www.google.com/search?q=${enc}+stock`,
    sec: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker=${enc}&type=10-K&count=40`,
  };
}
```

- [ ] **Step 2: Sanity-check the output (no test file — one-off inline eval)**

Run from `web/`:

```bash
npx tsx -e "import {buildExternalFinanceLinks as b, isLikelyTicker as t} from './src/lib/externalLinks.ts'; console.log(b('AAPL')); console.log(b('brk.b')); console.log(t('AAPL'), t('BRK.B'), t('037833100'));"
```

Expected output:
- `AAPL`: yahoo `.../quote/AAPL`, google `...search?q=AAPL+stock`, sec `...ticker=AAPL&type=10-K&count=40`
- `brk.b`: yahoo `.../quote/BRK-B`, google `...q=BRK.B+stock`, sec `...ticker=BRK.B`
- guard line: `true true false`

(If `tsx` is unavailable, skip this step and rely on `tsc` + the link clicks in Task 7.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/externalLinks.ts
git commit -m "feat(stocks): pure external-finance URL builder (Yahoo/Google/SEC)"
```

---

### Task 2: Brand icon components (Yahoo, Google)

**Files:**
- Create: `web/src/components/icons/GoogleIcon.tsx`
- Create: `web/src/components/icons/YahooIcon.tsx`

SVG path data is the official Simple Icons (CC0) monochrome glyph, rendered with `fill="currentColor"` so color is controlled by the parent's text color (gray default, brand on hover). No test (pure presentational SVG; verified by tsc in a later task).

- [ ] **Step 1: Create GoogleIcon**

Create `web/src/components/icons/GoogleIcon.tsx`:

```tsx
import React from "react";

export function GoogleIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
    </svg>
  );
}
```

- [ ] **Step 2: Create YahooIcon**

Create `web/src/components/icons/YahooIcon.tsx`:

```tsx
import React from "react";

export function YahooIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}): React.ReactElement {
  return (
    <svg
      role="img"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.86 1.56L14.27 11.87H19.4L24 1.56H18.86M0 6.71L5.15 18.27L3.3 22.44H7.83L14.69 6.71H10.19L7.39 13.44L4.62 6.71H0M15.62 12.87C13.95 12.87 12.71 14.12 12.71 15.58C12.71 17 13.91 18.19 15.5 18.19C17.18 18.19 18.43 16.96 18.43 15.5C18.43 14.03 17.23 12.87 15.62 12.87Z" />
    </svg>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/icons/GoogleIcon.tsx src/components/icons/YahooIcon.tsx
git commit -m "feat(icons): inline Yahoo/Google brand SVGs (Simple Icons, CC0)"
```

---

### Task 3: ExternalFinanceLinks component

**Files:**
- Create: `web/src/components/entity/ExternalFinanceLinks.tsx`

Single Server Component, two variants. `table`: compact (15px), near-invisible until the row is hovered/focused on desktop, always visible on mobile. `detail`: standard (18px), always visible. Each link is a plain `<a target="_blank" rel="noopener noreferrer">` with `title` + `aria-label`; hover reveals the brand color via `currentColor`.

- [ ] **Step 1: Create the component**

Create `web/src/components/entity/ExternalFinanceLinks.tsx`:

```tsx
import React from "react";
import { FileText } from "lucide-react";
import { GoogleIcon } from "@/components/icons/GoogleIcon";
import { YahooIcon } from "@/components/icons/YahooIcon";
import { buildExternalFinanceLinks } from "@/lib/externalLinks";
import type { Lang } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Variant = "table" | "detail";

const LABELS = {
  zh: { yahoo: "在 Yahoo Finance 查看", google: "在 Google 查看", sec: "在 SEC EDGAR 查看" },
  en: { yahoo: "View on Yahoo Finance", google: "Search on Google", sec: "View on SEC EDGAR" },
} as const;

export function ExternalFinanceLinks({
  ticker,
  variant,
  lang,
}: {
  ticker: string;
  variant: Variant;
  lang: Lang;
}): React.ReactElement {
  const links = buildExternalFinanceLinks(ticker);
  const t = LABELS[lang];
  const iconSize = variant === "detail" ? 18 : 15;

  // table 变体: 默认极淡, 桌面端 hover/focus 行才提亮(行需带 `group` 类); 移动常驻。
  const wrapper = cn(
    "inline-flex items-center gap-3 transition-opacity",
    variant === "table" &&
      "opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
  );

  const linkBase = "inline-flex items-center text-[var(--tt-faint)] transition-colors";

  return (
    <span className={wrapper}>
      <a
        href={links.yahoo}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t.yahoo} (${ticker})`}
        aria-label={`${t.yahoo} (${ticker})`}
        className={cn(linkBase, "hover:text-[#6001D2]")}
      >
        <YahooIcon size={iconSize} />
      </a>
      <a
        href={links.google}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t.google} (${ticker})`}
        aria-label={`${t.google} (${ticker})`}
        className={cn(linkBase, "hover:text-[#4285F4]")}
      >
        <GoogleIcon size={iconSize} />
      </a>
      <a
        href={links.sec}
        target="_blank"
        rel="noopener noreferrer"
        title={`${t.sec} (${ticker})`}
        aria-label={`${t.sec} (${ticker})`}
        className={cn(linkBase, "hover:text-[var(--tt-text)]")}
      >
        <FileText size={iconSize} strokeWidth={1.75} />
      </a>
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). If `cn` or `Lang` import paths error, confirm against `src/lib/utils.ts` (exports `cn`) and `src/lib/nav.ts` (exports `Lang`) — both already used across the codebase.

- [ ] **Step 3: Commit**

```bash
git add src/components/entity/ExternalFinanceLinks.tsx
git commit -m "feat(stocks): ExternalFinanceLinks component (table + detail variants)"
```

---

### Task 4: Extend KeyFacts to accept a node (for detail-page placement)

**Files:**
- Modify: `web/src/components/entity/KeyFacts.tsx`

The detail-page external links live as the last cell in the Key Facts row. KeyFacts currently only renders a string `value`. Add an optional `node` that, when present, renders in place of the value span — keeping the same cell chrome (label, left hairline, padding).

- [ ] **Step 1: Add `node` to the KeyFact type**

In `web/src/components/entity/KeyFacts.tsx`, replace the type and add the React import. Change:

```tsx
import { cn } from "@/lib/utils";
import type { Tone } from "./types";

export type KeyFact = {
  label: string;
  value: string;
  tone?: Tone;
};
```

to:

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Tone } from "./types";

export type KeyFact = {
  label: string;
  value: string;
  tone?: Tone;
  /** 若提供, 渲染此 node 取代 value 文本(用于嵌入图标行等)。 */
  node?: ReactNode;
};
```

- [ ] **Step 2: Render node when present**

In the same file, replace the value span:

```tsx
          <span
            className={cn(
              "tnum font-mono text-xl font-medium leading-none",
              fact.tone ? VALUE_TONE_CLASS[fact.tone] : "text-card-foreground"
            )}
          >
            {fact.value}
          </span>
```

with:

```tsx
          {fact.node != null ? (
            <span className="flex items-center leading-none">{fact.node}</span>
          ) : (
            <span
              className={cn(
                "tnum font-mono text-xl font-medium leading-none",
                fact.tone ? VALUE_TONE_CLASS[fact.tone] : "text-card-foreground"
              )}
            >
              {fact.value}
            </span>
          )}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. Existing callers pass only `label`/`value`/`tone`, which still satisfies the type (`node` is optional).

- [ ] **Step 4: Commit**

```bash
git add src/components/entity/KeyFacts.tsx
git commit -m "feat(entity): KeyFacts supports optional node in place of value"
```

---

### Task 5: Wire external links into the ticker detail page

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

Add a final Key Facts entry "外部数据 / External" whose `node` is the detail-variant icon row. Only render when the page is keyed by a real ticker (not the CUSIP fallback) — guard with `cusipsForTicker.length > 0` so cusip-only pages don't emit bad links.

- [ ] **Step 1: Add the import**

In `web/src/app/[lang]/stocks/[ticker]/page.tsx`, after the existing `EntityPage` import (line 10), add:

```tsx
import { ExternalFinanceLinks } from "@/components/entity/ExternalFinanceLinks";
```

- [ ] **Step 2: Append the external-links Key Fact**

Replace the `keyFacts` array (currently lines 204–210):

```tsx
  const keyFacts = [
    { label: lang === "zh" ? "现价" : "Price", value: fmtPriceFact(price) },
    { label: lang === "zh" ? "代码" : "Ticker", value: ticker },
    { label: lang === "zh" ? "持有人数" : "Holder count", value: String(n) },
    { label: lang === "zh" ? "合计市值" : "Total value held", value: formatUSD(totalValue) },
    { label: lang === "zh" ? "最大持有人" : "Largest holder", value: topHolder.person },
  ];
```

with:

```tsx
  const keyFacts = [
    { label: lang === "zh" ? "现价" : "Price", value: fmtPriceFact(price) },
    { label: lang === "zh" ? "代码" : "Ticker", value: ticker },
    { label: lang === "zh" ? "持有人数" : "Holder count", value: String(n) },
    { label: lang === "zh" ? "合计市值" : "Total value held", value: formatUSD(totalValue) },
    { label: lang === "zh" ? "最大持有人" : "Largest holder", value: topHolder.person },
    // 外部数据出口(仅在以真实 ticker 命中时, 即该 ticker 已解析到 cusip 时显示)
    ...(cusipsForTicker.length > 0
      ? [{
          label: lang === "zh" ? "外部数据" : "External",
          value: "",
          node: (
            <ExternalFinanceLinks ticker={ticker} variant="detail" lang={lang} />
          ),
        }]
      : []),
  ];
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(stocks): external data links in ticker detail Key Facts"
```

---

### Task 6: Wire external links into the stocks list table

**Files:**
- Modify: `web/src/app/[lang]/stocks/page.tsx`

Add a new rightmost column. Each row gets `group` so the table-variant links reveal on row hover/focus (desktop) and stay visible on mobile. Render links only when the row resolves to a real ticker (`info?.ticker`), otherwise an empty cell — cusip-only rows would otherwise produce invalid links.

- [ ] **Step 1: Add imports**

In `web/src/app/[lang]/stocks/page.tsx`, after the `stockPath` import (line 8), add:

```tsx
import { ExternalFinanceLinks } from "@/components/entity/ExternalFinanceLinks";
import { isLikelyTicker } from "@/lib/externalLinks";
```

- [ ] **Step 2: Add the header cell**

In the `<thead>` row, after the "Total value" `<th>` (currently lines 83–85), add a trailing header cell:

```tsx
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-24">
                {isZh ? "链接" : "Links"}
              </th>
```

- [ ] **Step 3: Add `group` to the row and the links cell**

Replace the row opening tag (currently lines 93–96):

```tsx
              <tr
                key={row.cusip}
                className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
              >
```

with (adds `group`):

```tsx
              <tr
                key={row.cusip}
                className="group border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]"
              >
```

Then, immediately after the "Total value" `<td>` (currently lines 120–122, the one rendering `formatUSD(row.totalValue)`), add the links cell:

```tsx
                <td className="py-3 pl-3 text-right">
                  {info?.ticker && isLikelyTicker(info.ticker) ? (
                    <span className="inline-flex justify-end">
                      <ExternalFinanceLinks ticker={info.ticker} variant="table" lang={lang} />
                    </span>
                  ) : null}
                </td>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "src/app/[lang]/stocks/page.tsx"
git commit -m "feat(stocks): external data links column in most-held table"
```

---

### Task 7: Full verification (build + manual)

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: PASS, no errors.

- [ ] **Step 3: Lint (if configured)**

Run: `npm run lint`
Expected: PASS (or no new warnings on the touched files). If `lint` script is absent, skip.

- [ ] **Step 4: Manual visual check (dev server)**

Run: `npm run dev`, then in a browser:
- `/zh/stocks` and `/en/stocks`: rightmost column. On **desktop**, icons are near-invisible until you hover a row, then the three gray icons appear; hovering an icon turns it its brand color (Yahoo purple, Google blue, SEC text color). Narrow the window (< `md`, ~768px) to confirm icons are **always visible** on mobile width.
- `/zh/stocks/AAPL`: Key Facts row ends with an "外部数据" cell showing the three gray icons; hover turns each its brand color.
- Click each icon (new tab) and confirm the destination loads for: **AAPL**, **BAC**, **BRK.B** (verify Yahoo opens `BRK-B`, Google/SEC use `BRK.B`).

- [ ] **Step 5: Final commit (only if Step 4 required tweaks)**

```bash
git add -A
git commit -m "fix(stocks): external links visual adjustments from manual review"
```

---

## Self-Review Notes

- **Spec coverage:** §2 URLs → Task 1; §3 visual/variants → Tasks 3,5,6; §4 icons → Task 2 (Yahoo/Google) + lucide `FileText` in Task 3 (SEC); §5 no extra data → confirmed (builder is ticker-only); §6 file structure → Tasks 1–6 match the table; §7 YAGNI → no third-party sites, no config, no data fetch; §8 validation → Task 7.
- **Type consistency:** `buildExternalFinanceLinks(ticker)` / `isLikelyTicker(s)` defined in Task 1 and consumed identically in Tasks 3 & 6. `ExternalFinanceLinks` props `{ ticker, variant, lang }` defined in Task 3, called identically in Tasks 5 & 6. `KeyFact.node` added in Task 4, used in Task 5.
- **Edge cases handled:** cusip-fallback rows/pages skip links (`isLikelyTicker` + `cusipsForTicker.length`); dual-class ticker URL forms verified by the Task 1 inline sanity check and the Task 7 link clicks; keyboard a11y via `group-focus-within`.
- **No tests:** per project standing rule, no `*.test.*` files are created; verification is `tsc --noEmit` + manual dev-server checks.
