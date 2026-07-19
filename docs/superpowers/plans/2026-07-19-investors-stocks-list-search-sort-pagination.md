# Investors + Stocks List Search/Sort/Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/investors` and `/stocks` shared search, header sort, hybrid pagination, and URL-synced state with brand-native list components (no Ant Design).

**Architecture:** Pure helpers (`listQuery`, `listRows`) own parse/filter/sort/slice. Client pages wire `useListState` → `ListToolbar` + sortable `DataTable` + `ListPagination`. Rows are sliced **before** render (never DOM-hide the full universe). Desktop `page` = page index; mobile `page` = revealed page count (`visible = page * 25`).

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind `--tt-*` tokens, existing `DataTable`, `tsx` script tests (same pattern as `npm run test:price-providers`).

**Spec:** `docs/superpowers/specs/2026-07-19-investors-stocks-list-search-sort-pagination-design.md`

---

## File map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `web/src/components/list/listQuery.ts` | Parse/serialize URL params; defaults; clamp page; `PAGE_SIZE=25`; `Q_MAX=64` |
| Create | `web/src/components/list/listRows.ts` | Filter + sort + `visibleSlice` (desktop page vs mobile prefix) |
| Create | `web/src/components/list/useListState.ts` | Client hook: URL ↔ state, debounce `q`, `router.replace` |
| Create | `web/src/components/list/useMediaQueryMd.ts` | `matchMedia('(min-width: 768px)')` for desktop vs mobile slice |
| Create | `web/src/components/list/ListToolbar.tsx` | Single-band search / chips / count; Enter → immediate `onQSubmit` |
| Create | `web/src/components/list/ListPagination.tsx` | Desktop page controls + mobile load-more; slice-before-render |
| Create | `web/scripts/tests/list-query.ts` | Pure tests for query + row helpers |
| Modify | `web/package.json` | Add `"test:list-query": "tsx scripts/tests/list-query.ts"` |
| Modify | `web/src/components/common/DataTable.tsx` | Column `sortKey`; table sort props; `rankStart`; remove `visibleCount` |
| Modify | `web/src/app/[lang]/investors/InvestorListClient.tsx` | Wire list shell; alias search; drop sort buttons |
| Modify | `web/src/app/[lang]/investors/page.tsx` | `Suspense` around list client (for `useSearchParams`) |
| Modify | `web/src/app/[lang]/stocks/StocksTable.tsx` | `"use client"` list client; remove `TOP_N`/`details` |
| Modify | `web/src/app/[lang]/stocks/page.tsx` | `Suspense` around table; keep lean row SSR payload |
| Modify | `web/src/lib/stocks/stockCopy.ts` | Add pagination / search / empty keys; keep `showMore` / `collapse` (screener + detail) |
| Delete | `web/src/components/common/Paginated.tsx` | Retire CSS-hide full-universe helper (unused) |

**Do not touch:** screener, detail pages, buys/sells/consensus, global `SearchBox`, Ant Design, theme tokens, PageHeader/SubNav structure (beyond Suspense wrappers).

**Constants (lock in code):**

```ts
export const LIST_PAGE_SIZE = 25;
export const LIST_Q_MAX = 64;
export const LIST_Q_DEBOUNCE_MS = 200;
```

---

### Task 1: `listQuery` + `listRows` pure helpers (TDD)

**Files:**
- Create: `web/src/components/list/listQuery.ts`
- Create: `web/src/components/list/listRows.ts`
- Create: `web/scripts/tests/list-query.ts`
- Modify: `web/package.json`

- [ ] **Step 1: Write the failing test script**

Create `web/scripts/tests/list-query.ts` using the same `eq`/`failed` pattern as `web/scripts/tests/price-providers.ts`:

```ts
/** 列表 URL/筛选/分页纯函数测试。用法: npm run test:list-query */
import {
  LIST_PAGE_SIZE,
  parseListParams,
  serializeListParams,
  clampPage,
  nextSortState,
} from "../../src/components/list/listQuery";
import {
  filterInvestors,
  filterStocks,
  sortByKey,
  visibleSlice,
} from "../../src/components/list/listRows";

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) {
    failed++;
    console.error(`FAIL ${label}: got ${a}, want ${e}`);
  } else console.log(`ok   ${label}`);
}

// defaults omit from URL
eq(
  serializeListParams(
    { q: "", sort: "value", dir: "desc", page: 1, vf: "all" },
    { defaultSort: "value", hasVf: true }
  ),
  "",
  "serialize omits defaults"
);

eq(
  parseListParams(new URLSearchParams("q=buff&sort=count&dir=asc&page=2&vf=buying"), {
    defaultSort: "value",
    allowedSorts: ["value", "count"],
    hasVf: true,
  }),
  { q: "buff", sort: "count", dir: "asc", page: 2, vf: "buying" },
  "parse happy path"
);

eq(
  parseListParams(new URLSearchParams("q=" + "x".repeat(80) + "&sort=nope&dir=up&page=0&vf=zzz"), {
    defaultSort: "holders",
    allowedSorts: ["holders", "value"],
    hasVf: false,
  }),
  { q: "x".repeat(64), sort: "holders", dir: "desc", page: 1, vf: "all" },
  "parse clamps q + invalid fallbacks"
);

eq(clampPage(9, 3), 3, "clamp page high");
eq(clampPage(2, 0), 1, "clamp empty → 1");

eq(nextSortState("value", "desc", "value"), { sort: "value", dir: "asc" }, "toggle same field");
eq(nextSortState("value", "asc", "count"), { sort: "count", dir: "desc" }, "new field → desc");

// Spec: changing sort resets page — callers always pass page: 1 with nextSortState result.
eq(
  serializeListParams(
    { q: "x", sort: "count", dir: "desc", page: 1, vf: "all" },
    { defaultSort: "value", hasVf: true }
  ),
  "q=x&sort=count",
  "sort change URL drops page=1"
);

const managers = [
  { slug: "berkshire-hathaway", person: "Warren Buffett", name: "Berkshire", totalValue: 100, holdingCount: 2 },
  { slug: "daily-journal", person: "Charlie Munger", name: "Daily Journal", totalValue: 50, holdingCount: 5 },
];
eq(filterInvestors(managers, "巴菲特").map((m) => m.slug), ["berkshire-hathaway"], "alias match");
eq(filterInvestors(managers, "munger").map((m) => m.slug), ["daily-journal"], "person substring");

const stocks = [
  { ticker: "AAPL", issuer: "Apple Inc", holderCount: 10, totalValue: 1 },
  { ticker: "MSFT", issuer: "Microsoft", holderCount: 8, totalValue: 9 },
];
eq(filterStocks(stocks, "msft").map((s) => s.ticker), ["MSFT"], "ticker search");
eq(
  sortByKey(stocks, "value", "desc", { value: (s) => s.totalValue, holders: (s) => s.holderCount }).map(
    (s) => s.ticker
  ),
  ["MSFT", "AAPL"],
  "sort value desc"
);

const nums = Array.from({ length: 60 }, (_, i) => i + 1);
eq(visibleSlice(nums, 2, "desktop"), nums.slice(25, 50), "desktop page 2");
eq(visibleSlice(nums, 2, "mobile"), nums.slice(0, 50), "mobile prefix page 2");
eq(LIST_PAGE_SIZE, 25, "page size lock");

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall ok");
```

Add to `web/package.json` scripts:

```json
"test:list-query": "tsx scripts/tests/list-query.ts"
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd web && npm run test:list-query
```

Expected: module not found / cannot import.

- [ ] **Step 3: Implement `listQuery.ts`**

```ts
export const LIST_PAGE_SIZE = 25;
export const LIST_Q_MAX = 64;
export const LIST_Q_DEBOUNCE_MS = 200;

export type ListDir = "asc" | "desc";
export type VerdictFilter = "all" | "buying" | "selling" | "mixed";

export type ListParams = {
  q: string;
  sort: string;
  dir: ListDir;
  page: number;
  vf: VerdictFilter;
};

export type ParseOpts = {
  defaultSort: string;
  allowedSorts: string[];
  hasVf: boolean;
};

export function parseListParams(sp: URLSearchParams, opts: ParseOpts): ListParams {
  const rawQ = sp.get("q") ?? "";
  const q = rawQ.slice(0, LIST_Q_MAX);
  const sort = opts.allowedSorts.includes(sp.get("sort") ?? "")
    ? (sp.get("sort") as string)
    : opts.defaultSort;
  const dirRaw = sp.get("dir");
  const dir: ListDir = dirRaw === "asc" || dirRaw === "desc" ? dirRaw : "desc";
  const pageNum = Number(sp.get("page"));
  const page = Number.isFinite(pageNum) && pageNum >= 1 ? Math.floor(pageNum) : 1;
  const vfRaw = sp.get("vf");
  const vf: VerdictFilter =
    opts.hasVf && (vfRaw === "buying" || vfRaw === "selling" || vfRaw === "mixed" || vfRaw === "all")
      ? vfRaw
      : "all";
  return { q, sort, dir, page, vf };
}

export function serializeListParams(
  p: ListParams,
  opts: { defaultSort: string; hasVf: boolean }
): string {
  const sp = new URLSearchParams();
  if (p.q) sp.set("q", p.q.slice(0, LIST_Q_MAX));
  if (p.sort !== opts.defaultSort) sp.set("sort", p.sort);
  if (p.dir !== "desc") sp.set("dir", p.dir);
  if (p.page !== 1) sp.set("page", String(p.page));
  if (opts.hasVf && p.vf !== "all") sp.set("vf", p.vf);
  return sp.toString();
}

export function clampPage(page: number, pageCount: number): number {
  if (pageCount <= 0) return 1;
  return Math.min(Math.max(1, page), pageCount);
}

/** Header click: same field toggles dir; new field → desc. */
export function nextSortState(
  currentSort: string,
  currentDir: ListDir,
  clickedSort: string
): { sort: string; dir: ListDir } {
  if (clickedSort === currentSort) {
    return { sort: currentSort, dir: currentDir === "desc" ? "asc" : "desc" };
  }
  return { sort: clickedSort, dir: "desc" };
}
```

- [ ] **Step 4: Implement `listRows.ts`**

```ts
import { INVESTOR_ALIASES } from "@/lib/investorAliases";
import { cleanIssuer } from "@/lib/format";
import { LIST_PAGE_SIZE } from "./listQuery";
import type { ListDir } from "./listQuery";

export type InvestorSearchRow = {
  slug: string;
  person: string;
  name: string;
};

export function filterInvestors<T extends InvestorSearchRow>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((m) => {
    const alias = (INVESTOR_ALIASES[m.slug] ?? "").toLowerCase();
    return (
      m.person.toLowerCase().includes(needle) ||
      m.name.toLowerCase().includes(needle) ||
      m.slug.toLowerCase().includes(needle) ||
      alias.includes(needle)
    );
  });
}

export type StockSearchRow = {
  ticker: string;
  issuer: string;
};

export function filterStocks<T extends StockSearchRow>(rows: T[], q: string): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(
    (r) =>
      r.ticker.toLowerCase().includes(needle) ||
      cleanIssuer(r.issuer).toLowerCase().includes(needle) ||
      r.issuer.toLowerCase().includes(needle)
  );
}

export function sortByKey<T>(
  rows: T[],
  sort: string,
  dir: ListDir,
  getters: Record<string, (row: T) => number>
): T[] {
  const get = getters[sort];
  if (!get) return [...rows];
  const mul = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const d = get(a) - get(b);
    if (d !== 0) return d * mul;
    return 0;
  });
}

export type SliceMode = "desktop" | "mobile";

export function visibleSlice<T>(rows: T[], page: number, mode: SliceMode): T[] {
  const p = Math.max(1, page);
  if (mode === "mobile") return rows.slice(0, p * LIST_PAGE_SIZE);
  const start = (p - 1) * LIST_PAGE_SIZE;
  return rows.slice(start, start + LIST_PAGE_SIZE);
}

export function pageCount(total: number): number {
  if (total <= 0) return 0;
  return Math.ceil(total / LIST_PAGE_SIZE);
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd web && npm run test:list-query
```

Expected: `all ok`

- [ ] **Step 6: Commit**

```bash
git add web/src/components/list/listQuery.ts web/src/components/list/listRows.ts web/scripts/tests/list-query.ts web/package.json
git commit -m "$(cat <<'EOF'
feat(list): add URL parse and row filter/sort/slice helpers

EOF
)"
```

---

### Task 2: `useListState` hook

**Files:**
- Create: `web/src/components/list/useListState.ts`

- [ ] **Step 1: Implement hook**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LIST_Q_DEBOUNCE_MS,
  LIST_Q_MAX,
  nextSortState,
  parseListParams,
  serializeListParams,
  type ListParams,
  type ParseOpts,
  type VerdictFilter,
} from "./listQuery";

export function useListState(opts: ParseOpts) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parsed = useMemo(
    () => parseListParams(new URLSearchParams(searchParams.toString()), opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opts identity is stable per page
    [searchParams, opts.defaultSort, opts.hasVf, opts.allowedSorts.join("|")]
  );

  const [qInput, setQInput] = useState(parsed.q);
  useEffect(() => {
    setQInput(parsed.q);
  }, [parsed.q]);

  const replace = useCallback(
    (next: ListParams) => {
      const qs = serializeListParams(next, {
        defaultSort: opts.defaultSort,
        hasVf: opts.hasVf,
      });
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, opts.defaultSort, opts.hasVf]
  );

  // Debounced q → URL; resets page. Keep latest parsed in a ref if stale closes bite.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = qInput.slice(0, LIST_Q_MAX);
      if (q === parsed.q) return;
      replace({ ...parsed, q, page: 1 });
    }, LIST_Q_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [qInput]); // narrow deps; verify typing vs URL manually

  const setSortKey = (clicked: string) => {
    const { sort, dir } = nextSortState(parsed.sort, parsed.dir, clicked);
    replace({ ...parsed, sort, dir, page: 1 });
  };

  const setVf = (vf: VerdictFilter) => {
    replace({ ...parsed, vf, page: 1 });
  };

  /** Caller clamps with pageCount(filtered.length) before/inside setPage. */
  const setPage = (page: number) => {
    replace({ ...parsed, page: Math.max(1, page) });
  };

  const commitQNow = () => {
    const q = qInput.slice(0, LIST_Q_MAX);
    replace({ ...parsed, q, page: 1 });
  };

  return {
    ...parsed,
    qInput,
    setQInput,
    commitQNow,
    setSortKey,
    setVf,
    setPage,
  };
}
```

**Clamping lives in the page**, not the hook — avoids circular `totalFiltered` ↔ URL page:

```ts
const params = useListState({ defaultSort: "value", allowedSorts: ["value", "count"], hasVf: true });
const filteredSorted = useMemo(() => { /* filter + sort using params */ }, [...]);
const pages = pageCount(filteredSorted.length);
const page = clampPage(params.page, pages);
```

Import `LIST_Q_MAX` in the hook file (already exported from `listQuery`). Drop unused `pageCount` import from the hook.

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors related to new file (other pre-existing noise OK only if already present).

- [ ] **Step 3: Commit**

```bash
git add web/src/components/list/useListState.ts
git commit -m "$(cat <<'EOF'
feat(list): add useListState URL sync hook

EOF
)"
```

---

### Task 3: `ListToolbar` + `ListPagination`

**Files:**
- Create: `web/src/components/list/ListToolbar.tsx`
- Create: `web/src/components/list/ListPagination.tsx`

- [ ] **Step 1: Implement `ListToolbar`**

Brand hairline search (copy styles from current `InvestorListClient` input). Props:

```tsx
type Chip = { key: string; label: string };

type Props = {
  searchLabel: string;
  searchPlaceholder: string;
  q: string;
  onQChange: (v: string) => void;
  onQSubmit: () => void;
  countText: string;
  chips?: Chip[];
  activeChip?: string;
  onChip?: (key: string) => void;
};
```

Layout:
- Desktop: one flex row — search `flex-1` | chips | count
- Mobile: search full width; second row chips + count (`max-sm:min-h-[44px]` on chips)

**Enter commits immediately:** wrap the search input in `<form onSubmit={(e) => { e.preventDefault(); onQSubmit(); }}>` (or `onKeyDown` Enter). Spec requires Enter to apply `q` now; debounce alone is not enough.

No sort controls here.

- [ ] **Step 2: Implement `ListPagination`**

Props:

```tsx
type Props = {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
  /** mobile load-more label, e.g. "Load more" / "加载更多" */
  moreLabel: string;
  remaining: number; // rows not yet revealed on mobile
  prevLabel: string;
  nextLabel: string;
  pageLabel: (page: number, pageCount: number) => string;
};
```

Behavior:
- Desktop (`hidden md:flex`): Prev / `page of pageCount` / Next; disable at ends; `onPage(page±1)`
- Mobile (`flex md:hidden`): if `remaining > 0`, button calls `onPage(page + 1)` (reveals next 25 via URL)
- Render **nothing** when `pageCount <= 1` and `remaining <= 0`

Style: mono uppercase micro-labels, `--tt-border` / `--tt-accent` — same family as retired `Paginated` button, but no rounded-md card look if investors already use hairline; prefer hairline text buttons for desktop to match density pass.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/list/ListToolbar.tsx web/src/components/list/ListPagination.tsx
git commit -m "$(cat <<'EOF'
feat(list): add ListToolbar and ListPagination

EOF
)"
```

---

### Task 4: Extend `DataTable` (sort headers + rankStart; drop visibleCount)

**Files:**
- Modify: `web/src/components/common/DataTable.tsx`
- Delete: `web/src/components/common/Paginated.tsx` (only consumer of the old progressive-hide model; currently unused)

- [ ] **Step 1: Extend `Column` + props**

Add to `Column<T>`:

```ts
/** When set, header is a sort control; value is the URL sort key passed to onSort. */
sortKey?: string;
```

Add to `DataTableProps<T>`:

```ts
sortKey?: string;
sortDir?: "asc" | "desc";
onSort?: (sortKey: string) => void;
/** Rank display offset (filtered global index). Default 0 → ranks start at 1. */
rankStart?: number;
```

Remove `visibleCount` and all `isOverflow` / `hidden` row logic.

- [ ] **Step 2: Sortable `<th>`**

For columns with `sortKey` and when `onSort` is provided, render a `<button type="button">` inside `th`:
- Calls `onSort(c.sortKey)`
- Active column (`sortKey === c.sortKey`): `text-[var(--tt-accent)]` + `↑` or `↓` from `sortDir`
- Inactive sortable: muted; hover → text color
- `aria-sort` on `th`: `"ascending" | "descending" | "none"`

Non-sortable headers stay as today.

- [ ] **Step 3: Rank**

Replace `{i + 1}` with `{(rankStart ?? 0) + i + 1}` in desktop and mobile rank cells.

- [ ] **Step 4: Delete `Paginated.tsx`**

```bash
rg -n 'Paginated|visibleCount' web/src
```

Expected: no remaining imports of `Paginated`; no `visibleCount` on DataTable.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/common/DataTable.tsx
git rm web/src/components/common/Paginated.tsx
git commit -m "$(cat <<'EOF'
feat(ui): sortable DataTable headers; retire Paginated DOM-hide helper

EOF
)"
```

---

### Task 5: Wire `/investors`

**Files:**
- Modify: `web/src/app/[lang]/investors/InvestorListClient.tsx`
- Modify: `web/src/app/[lang]/investors/page.tsx`

- [ ] **Step 1: Refactor client**

Replace local `useState` for query/sort/vf with URL-driven params + pure helpers:

```ts
const params = useListState({
  defaultSort: "value",
  allowedSorts: ["value", "count"],
  hasVf: true,
});

const filteredSorted = useMemo(() => {
  let rows = filterInvestors(managers, params.q);
  if (params.vf !== "all") rows = rows.filter((m) => m.qoq?.verdict === params.vf);
  return sortByKey(rows, params.sort, params.dir, {
    value: (m) => m.totalValue,
    count: (m) => m.holdingCount,
  });
}, [managers, params.q, params.sort, params.dir, params.vf]);

const pages = pageCount(filteredSorted.length);
const page = clampPage(params.page, pages);
const desktopRows = visibleSlice(filteredSorted, page, "desktop");
const mobileRows = visibleSlice(filteredSorted, page, "mobile");
```

**Viewport row choice:** Use CSS dual tables **or** a small `useMediaQuery('(min-width: 768px)')` hook. Prefer media query so only one `DataTable` mounts:

```ts
const isDesktop = useMediaQueryMd();
const rows = isDesktop ? desktopRows : mobileRows;
const rankStart = isDesktop ? (page - 1) * LIST_PAGE_SIZE : 0;
```

SSR/hydration: default to desktop slice on first paint **or** mobile prefix — pick **mobile prefix** (`visibleSlice(..., "mobile")`) for first paint to avoid flash of fewer rows on phone; then effect upgrades. Simpler alternative accepted: always use mobile-prefix slice for both until `md`, and on desktop show classic page slice only when `matchMedia` says desktop (accept one-frame mismatch).

Add `useMediaQueryMd` in `web/src/components/list/useMediaQueryMd.ts` if needed (empty deps + `matchMedia('(min-width: 768px)')`).

- [ ] **Step 2: Toolbar + table + pagination**

- Remove sort button row entirely.
- `ListToolbar` with vf chips + count via existing `t.count`; wire `q={params.qInput}` `onQChange={params.setQInput}` `onQSubmit={params.commitQNow}`.
- Columns: set `sortKey: "value"` on portfolio, `sortKey: "count"` on holdings.
- `DataTable` gets `sortKey={params.sort}` `sortDir={params.dir}` `onSort={params.setSortKey}` `rankStart={...}` `rows={rows}` `showRank`.
- `ListPagination` with remaining = `filteredSorted.length - mobileRows.length`.

- [ ] **Step 3: Copy**

Add pagination strings to `COPY` (zh/en): `more`, `prev`, `next`, `pageOf`, search unchanged; keep verdict filters.

- [ ] **Step 4: Suspense in `investors/page.tsx`**

Wrap `<InvestorListClient ... />` in `<Suspense fallback={...}>` (simple skeleton: PageHeader + muted “…” or null table).

- [ ] **Step 5: Manual check**

```bash
cd web && npm run test:list-query && npx tsc --noEmit
```

Browser: `/investors?q=巴菲特` matches Buffett; `?sort=count`; page controls; no second-row sort buttons.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/[lang]/investors/InvestorListClient.tsx web/src/app/[lang]/investors/page.tsx web/src/components/list/useMediaQueryMd.ts
git commit -m "$(cat <<'EOF'
feat(investors): URL-synced search, header sort, and hybrid pagination

EOF
)"
```

---

### Task 6: Wire `/stocks`

**Files:**
- Modify: `web/src/app/[lang]/stocks/StocksTable.tsx` → client list
- Modify: `web/src/app/[lang]/stocks/page.tsx`
- Modify: `web/src/lib/stocks/stockCopy.ts`

- [ ] **Step 1: Convert `StocksTable` to client list**

Add `"use client"` at top. Remove `TOP_N`, `head`/`tail`, and the entire `<details>` block.

Wire same pattern as investors:

- `useListState({ defaultSort: "holders", allowedSorts: ["holders", "value"], hasVf: false })`
- `filterStocks` → `sortByKey` with getters `holders` / `value`
- Clamp `page` with `pageCount(filtered.length)` in the component (same as investors)
- `ListToolbar` without chips; search placeholder from new `stockUi` keys
- Columns: `holders` → `sortKey: "holders"`; `value` → `sortKey: "value"`
- Keep `BargainMark` / `EntityName` in cells
- `showRank` + `rankStart`
- `ListPagination`

- [ ] **Step 2: Copy in `stockCopy.ts`**

Add to `STOCK_UI` zh/en:

- `search`: "搜索代码或公司…" / "Search ticker or name…"
- `noResults`: "无匹配结果" / "No results"
- `count`: `(m, n) => ...` same shape as investors
- `more` / `prev` / `next` / `pageOf`

**Do not delete** `showMore` / `collapse` — still used by screener / stock detail (out of scope).

- [ ] **Step 3: Suspense on stocks page**

Wrap `<StocksTable ... />` in `<Suspense>`. Keep RSC row shaping as lean `StockRow[]` (already the case).

- [ ] **Step 4: Verify no details long-tail**

```bash
rg -n 'TOP_N|<details>|showMore' web/src/app/\[lang\]/stocks/StocksTable.tsx
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add web/src/app/[lang]/stocks/StocksTable.tsx web/src/app/[lang]/stocks/page.tsx web/src/lib/stocks/stockCopy.ts
git commit -m "$(cat <<'EOF'
feat(stocks): searchable sortable paginated list; drop details long-tail

EOF
)"
```

---

### Task 7: Acceptance gate

**Files:** none new

- [ ] **Step 1: Automated**

```bash
cd web && npm run test:list-query && npx tsc --noEmit
```

Expected: `all ok`; tsc clean for touched files.

- [ ] **Step 2: Spec checklist (manual)**

| # | Check |
|---|--------|
| 1 | `/investors` + `/stocks`: search, header sort, desktop pages, mobile load-more |
| 2 | URL restore for `q/sort/dir/page` + investors `vf` |
| 3 | No investor sort button row; no stocks `<details>` |
| 4 | No antd; components under `components/list/` |
| 5 | Stocks does not render full universe dual table/cards |
| 6 | Alias `巴菲特` works on `/investors` |

- [ ] **Step 3: Final commit only if fixups landed**

If Step 2 required small fixes, commit them; otherwise done.

---

## Desktop vs mobile `page` (implementer reminder)

| Mode | `visibleSlice` | Rank |
|------|----------------|------|
| Desktop | `rows[((page-1)*25) .. page*25)` | `rankStart = (page-1)*25` |
| Mobile | `rows[0 .. page*25)` | `rankStart = 0` |

Sharing `?page=3`: desktop shows rows 51–75; mobile shows 1–75. Intentional per spec.

---

## Execution note

After plan approval, implement with **subagent-driven-development** (one task per subagent + review) or **executing-plans** (inline batches). Do not start Phase B/C in this plan.
