# Investors + Stocks list: search, sort, pagination (Phase A)

**Date:** 2026-07-19  
**Status:** Approved for planning  
**Scope:** `/investors` and `/stocks` list pages only  
**Related:** `2026-07-11-stocks-investors-ux-density-design.md` (density polish — keep; this spec adds interaction)  
**Out of scope (later phases):** investor/stock detail holdings search; buys/sells/consensus; screener unification; mobile global `SearchBox`; Ant Design or other third-party UI kits

## Problem

Both list pages lack adequate find-and-order affordances:

- **Investors** has client search + verdict chips + separate sort buttons, but state is not URL-synced, search misses `INVESTOR_ALIASES`, and controls stack into multiple rows that push the table down.
- **Stocks** has no in-page search or sort. The list is a fixed top-50 rich table plus a `<details>` long-tail dump — hard to find a ticker and inconsistent with investors.
- Neither page has real pagination; progressive disclosure is ad hoc (`details` / hard caps). An unused `Paginated` helper exists but is not wired to these pages.

Users need to search, sort, page through results, share the view via URL, and keep the brand’s dense editorial UI — not a generic component-library dashboard.

## Goals

1. Unified list interaction on `/investors` and `/stocks`: search, column-header sort, hybrid pagination.
2. Full URL sync for list state (`q`, `sort`, `dir`, `page`, and investors `vf`).
3. Tighter vertical chrome: single toolbar band; sort lives in table headers; remove stocks `<details>` long-tail.
4. Independent brand components under `web/src/components/list/` using existing `--tt-*` tokens. **No Ant Design / no new UI kit.**

## Non-goals

- Detail-page holdings/holders findability (Phase B).
- Aggregate pages (buys/sells/consensus) and screener control unification (Phase C).
- Server-side full-text search API.
- Redesigning PageHeader, SubNav, or visual identity beyond list controls.
- Alphabetical sort on investor person name or stock ticker (defer unless needed later).

## Approach

**Shared client ListShell + lean in-memory filter/sort/paginate** (chosen over RSC-only Link-driven paging and over a minimal patch that leaves `details` in place).

```
Page (RSC)
  └─ *ListClient
       ├─ ListToolbar       // search | optional filters | match count
       ├─ DataTable         // sortable headers; current page rows only
       └─ ListPagination    // desktop page numbers; mobile load-more
            └─ useListState // ↔ URL
```

## Architecture

### New modules (`web/src/components/list/`)

| Module | Responsibility |
|--------|----------------|
| `useListState` | Parse/write URL params; debounce `q`; reset `page` when `q`/`sort`/`dir`/`vf` change |
| `ListToolbar` | Single-band layout; no data logic |
| `ListPagination` | Desktop: prev/next + page numbers. Mobile: load more. Brand styling only |
| (optional) `listQuery.ts` | Shared parse/serialize + defaults for the query keys below |

### Existing modules to extend

| Module | Change |
|--------|--------|
| `DataTable` | Optional `sortKey` / `sortDir` / `onSort(columnKey)`; header affordance (accent + simple direction mark). Do not break pages that omit sort. |
| `InvestorListClient` | Wire ListShell; drop standalone sort button row; alias-aware search; URL state |
| `StocksTable` (or successor client) | Become a list client: lean rows, no `TOP_N` + `<details>`; same shell |

### Brand / UI constraints

- Reuse hairline controls, mono micro-labels, `--tt-*` colors already used on investors.
- Touch targets ≥44px under `max-sm` only (same density pass as 2026-07-11).
- No cards-in-toolbar, no pill clusters, no multi-layer shadows.

## URL contract

| Key | Meaning | Default (omit from URL when default) |
|-----|---------|--------------------------------------|
| `q` | Search string | empty |
| `sort` | Sort field | investors: `value`; stocks: `holders` |
| `dir` | `asc` \| `desc` | numeric fields default `desc` |
| `page` | 1-based page index | `1` |
| `vf` | Investors only: `all` \| `buying` \| `selling` \| `mixed` | `all` |

**Rules**

- Invalid values fall back to defaults.
- Changing `q` / `sort` / `dir` / `vf` resets `page` to `1`.
- Search input debounces ~200ms before writing URL; Enter applies immediately.
- Cap `q` length (e.g. 64 chars).
- If `page` exceeds page count after filter, clamp to last page (or `1` if empty).

**Sort fields (Phase A)**

- Investors: `value` \| `count`
- Stocks: `holders` \| `value`

Clicking a sortable header selects that field; clicking the active field toggles `dir`. Switching field resets `dir` to that field’s default (`desc` for all Phase A numeric fields).

## Toolbar & density

**Desktop — one band**

```
[ search ────────────── ]  [ vf chips (investors) ]     match M / N
```

**Mobile — at most two rows**

```
[ search ──────────────────────── ]
[ chips… ]                 match M / N
```

- Remove the second-row sort toggle buttons on investors.
- Stocks: no `vf`; count only on the right.
- PageHeader stays; controls below it collapse to the band above + footer pagination.

## Pagination (hybrid)

| Viewport | Behavior |
|----------|----------|
| Desktop (`md+`) | Classic pagination; **page size = 25** |
| Mobile | Initial 25 rows; **Load more** adds +25 each time |

URL `page` meaning:

- Desktop: current page index.
- Mobile: number of pages revealed (`visibleCount = page * 25`), so a shared URL restores browse depth.

Empty state: keep toolbar; show `DataTable` empty copy; user can clear `q` / reset `vf`.

## Search fields

| Page | Matches |
|------|---------|
| Investors | `person`, fund `name`, `slug`, plus `INVESTOR_ALIASES` (parity with global `SearchBox`) |
| Stocks | `ticker`, cleaned `issuer` |

Matching: case-insensitive substring on the client.

## Data flow

1. RSC loads the full list payload and passes lean serializable rows into the list client.
2. Client: filter → sort → paginate → pass **visible rows only** into `DataTable`.
3. Investors payload stays as today (summary + QoQ), with alias lookup on the client.
4. Stocks payload is a **lean** `StockRow[]` (ticker, issuer, holderCount, totalValue, barWidth, bargain). No dual rich head + compact tail UI.

### SEO / crawl decision (explicit)

Do **not** SSR thousands of compact long-tail `<a>` nodes on `/stocks` (previous volume/hydration failure mode).

- SSR/hydrate the interactive list shell; default view’s first page is real linked rows.
- Long-tail discovery relies on existing stock detail routes and sitemap / index coverage — not an in-page `<details>` dump.
- Investors (~76 rows) may still ship the full dataset to the client; pagination is for UX consistency, not payload relief.

## Acceptance criteria

1. `/investors` and `/stocks` support search, header sort, desktop page numbers, and mobile load-more.
2. Refreshing or sharing a URL with `q`/`sort`/`dir`/`page`/(investors `vf`) restores the same view.
3. No standalone sort button row; no stocks `<details>` long-tail list.
4. No Ant Design or new UI kit; new pieces live under `components/list/` and match existing brand tokens.
5. Stocks list does not regress into dual rich desktop+mobile rendering of the full universe.
6. Investor search finds alias queries that already work in the desktop global `SearchBox` (e.g. common CN aliases).

## Implementation notes (for planning)

- Prefer `router.replace` for param updates to avoid history spam while typing.
- Extend `DataTable` sort API in a backward-compatible way so other tables stay static headers.
- Reuse or replace `Paginated`: either wrap its behavior inside `ListPagination` or retire the unused export once mobile load-more lands — avoid two parallel APIs.
- i18n: extend existing page `COPY` / `stockUi` dictionaries for pagination and sort `aria-label`s; follow `docs/copy-voice.md`.
- Tests: unit-test query parse/serialize + filter/sort helpers; light component tests for “change sort resets page” and alias match.

## Phase roadmap (context only)

| Phase | Surface |
|-------|---------|
| **A (this spec)** | `/investors`, `/stocks` |
| B | Detail holdings / holders find + paginate |
| C | Buys / sells / consensus / screener control consistency |
|
