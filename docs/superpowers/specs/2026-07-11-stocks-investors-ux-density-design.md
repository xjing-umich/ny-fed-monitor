# Stocks + Investors UX polish (density P0 + P1)

**Date:** 2026-07-11  
**Status:** Approved for planning  
**Scope:** Stocks list/screener, Investors list, stock detail, investor detail — density, utility copy, nav parity, and listed P1 cleanups  
**Out of scope:** Type system (already shipped), theme colors, Related-managers ranking, ROE i18n (P2), motion system, density CSS token framework

## Problem

List pages push the primary workspace (the table) too far down the first viewport. Stacked chrome — SubNav margin, PageHeader padding, list `space-y-8`, boxed 44px filters, and Stocks’ nested `py-8` inside AppShell — burns ~300px+ before row 1. Investors also use marketing-style intro copy and leave an unused eyebrow; investor detail lacks the back link stock detail already has. Remaining P1 issues: duplicated “All” labels, EDGAR ALL-CAPS firm names on the list, Stocks Links column noise, repeated 13F source copy, and loose EntityPage section gaps.

## Principles (applied)

- **App UI = Linear restraint** (frontend-skill): dense but readable, minimal chrome, primary workspace first.
- **Utility copy:** orientation / status / scope — not homepage marketing on product surfaces.
- **Viewport budget:** sticky TopNav counts; table should enter the first screen early.
- **One job per credential line:** do not repeat 13F / lag in badge + footer.
- **Approach B:** tighten shared primitives first, then page-local P1 (same pattern as type-system Option B).

## Decision

Ship **P0 + P1** in one polish pass via shared primitives, then page edits.

### P0 — Density primitives

| Surface | Change |
|---------|--------|
| `SubNav` | `mb-8` → `mb-4` |
| `PageHeader` | `pb-6` → `pb-4` |
| Stocks index + screener | Remove nested `max-w-5xl py-8 sm:py-10` wrapper; rely on AppShell gutter only. PageHeader wrapper `mb-8` → `mb-4` |
| `InvestorListClient` | Root `space-y-8` → `space-y-4` |
| Investor filters / sort | Desktop: hairline text controls (no boxed border wall). Keep `min-h-[44px]` under `max-sm:` only |
| `EntityPage` children | `space-y-8 sm:space-y-10` → `space-y-6 sm:space-y-7` |
| Section content offset | Investor/stock section `mt-5` after `SectionHeading` → `mt-3` where it is local padding after the heading |

**Do not change:** DataTable row `py-2.5` (two-line cells stay readable).

### P0 — Utility copy + header parity

- Investors list: pass existing COPY `eyebrow` into `PageHeader`.
- Replace marketing subtitle with one scope line (EN/ZH), e.g. count + “latest SEC 13F quarter” / 中文等价。Do not invent a second long paragraph.
- No new dateline badge on Investors in this pass (eyebrow + scope line only; avoids inventing a second credential widget).

### P0 — Nav parity

- Investor detail: `EntityPage` `topAction` → `← Superinvestors` / `← 超级投资者` linking to `localePath(lang, "/investors")`, matching stock `← Stocks` / `← 个股`.

### P1 — Dual “All”

- Keep SubNav route tabs and activity filters as separate jobs.
- Rename activity filter label `All` → `Any move` / `全部动向` so “All” is not duplicated with SubNav.
- Desktop filter chrome follows P0 hairline treatment.

### P1 — EDGAR caps

- Investor list firm line: `displayFundName(m.name)` (same helper as detail).

### P1 — Stocks Links column

- Remove the Links column from `StocksTable`.
- External finance links remain on stock detail only (already sunk).

### P1 — Source dedupe

- Stocks list: keep `DataAsOfBadge` dateline; remove the footer paragraph that repeats 13F / 45-day lag.
- Intro may keep a short source clause if needed — never badge + footer saying the same thing.

### P1 — About chevron (include if small)

- Investor “About this investor” summary: toggle ▸ / ▾ on open like `FoldedSection`. Skip only if it requires a larger refactor.

## Non-goals

- New `--space-*` design tokens across the app (Approach C deferred).
- Changing SubNav information architecture (Buys/Sells/Consensus routes stay).
- Reordering detail pillars or valuation logic.
- P2: hardcoded `ROE` string i18n.

## Success criteria

1. On Investors list at common desktop height, table header / first rows appear clearly in the first viewport (not mid-screen).
2. Stocks list no longer double-pads; Links column gone; one source credential path.
3. Investor detail has a visible back link to the list.
4. Investor list shows eyebrow + utility intro; firm names are title-cased via `displayFundName`.
5. Activity filter no longer shares the bare label “All” with SubNav.
6. Type Option B unchanged (Fraunces still H1 / brand only).

## Verification

- Visual: Investors + Stocks list first viewport; Buffett + one stock detail masthead/back link.
- `rg` / quick scan: no nested `py-8 sm:py-10` on stocks index/screener; Links column removed from `StocksTable`.
- `npx tsc --noEmit` in `web/`.
