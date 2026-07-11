# Landing page audit polish (clickability + first-viewport tighten)

**Date:** 2026-07-11  
**Status:** Implemented  
**Branch:** `db-foundation` (implementation branch TBD at plan time)  
**Scope:** Homepage (`/[lang]`) only — audit High/Med fixes plus first-viewport tighten  
**Out of scope:** Full landing redesign; moving Notable moves below the fold; MSFT buy+sell dual-list algorithm; investor/stock detail holdings tables; theme/token overhaul; FAQ/SearchAction schema (defer)

## Problem

A landing audit of `/zh` found:

1. **Step 02 consensus rows are not links** — issuer names look like a holdings ranking but cannot open the stock page (confirmed user pain).
2. **Copy contradictions** — panel label 「实时」vs 45-day filing lag; H1 「N 位投资者」vs sub 「数百家机构」.
3. **Brand weak in main** — Compounder only in nav; brand test fails if nav is ignored.
4. **Hero moves use panel chrome** — reads as a dashboard widget in the first viewport.
5. **DataStrip dead ends** — consensus count and 10Y are proof points with no exit.
6. **ClosingCTA overclaims** — 「每个数字都能点回 SEC」while strip/consensus were not linked.
7. **SEO/GEO gaps** — `/zh` OG/Twitter title+description stay English (layout default); no root `llms.txt` (path is swallowed by `[lang]`).

Approach chosen in brainstorming: **B (audit patch + first-viewport tighten)** via **component-level surgical edits** (not a page redesign, not a site-wide clickability sweep).

## Principles

- Prefer bare lists over hero cards; keep real-data proof in the first viewport.
- One number story on the hero (tracked investor count).
- Every ranked entity on the homepage that implies navigation must be a link.
- Social metadata language matches the page locale.
- AI crawlers already allowed in `robots.ts`; add a stable `llms.txt` at site root.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Overall scope | B — audit fixes + first-viewport tighten |
| Notable moves chrome | Demote to bare list (keep position); replace 「实时」 |
| Brand in main | Eyebrow above freshness: `Compounder · 复利` / `Compounder` |
| DataStrip | Whole tile clickable → consensus + macro |
| Hero sub copy | Align to tracked N (same as H1) |
| Implementation style | Component-level surgical edits only |

## Changes by surface

### `HeroMasthead`

- Add brand eyebrow (zh: `Compounder · 复利`; en: `Compounder`) on its own line above the freshness/as-of row, without overpowering the H1.
- Replace `live` / 「实时」 with `This quarter` / 「本季」.
- Demote moves `aside`: remove `rounded-md`, panel background, and strong card border treatment. Keep title, section labels, row dividers, existing stock links, MoveTag, and RevealStagger.
- Rewrite `sub` to tracked-investor framing using `investorCount` (same N as H1). Do not say 「数百家」/「hundreds」.

**Draft sub copy**

- zh: `聚合本站追踪的 ${N} 位超级投资者的 SEC 13F 季度持仓，按 CUSIP 逐票归并。数据来源 SEC EDGAR。`
- en: `SEC 13F holdings from the ${N} superinvestors we track, aggregated by CUSIP. Source: SEC EDGAR.`

### `StepIndex` Step 02

- Wrap each consensus issuer in `Link` → `stockPath(lang, row.cusip)`.
- `HeldRow.cusip` is already tickerized on the DB/fallback path (same contract as Hero moves).
- Hover/affordance match Step 01 investor rows and Hero move links (`hover:text-[var(--tt-accent)]`, no default underline).

### `DataStrip`

- Make each of the two tiles a full-tile `Link`:
  - Consensus → `localePath(lang, "/investors/consensus")`
  - 10Y → `localePath(lang, "/macro")`
- Preserve label / value / as-of layout; use accent hover transition, not button chrome.

### `ClosingCTA`

- Keep primary line and primary CTA to investors list.
- Replace the overclaiming secondary line.

**Draft secondary**

- zh: `从投资者名单或个股估值开始。`
- en: `Start from the investor list or a single-stock valuation.`

### Homepage `generateMetadata` (`page.tsx`)

- Keep locale title/description and `altFor(l, "")`.
- Add `ogFor({ lang: l, title, description, path: localePath(l, "") })` so `/zh` Open Graph and Twitter cards are Chinese (path must be locale-aware for `og:url` / image).

### `llms.txt`

- Serve at site root (`web/public/llms.txt` preferred) so the path is not captured by `app/[lang]`.
- Contents: one-line product description, primary URLs (`/`, `/zh`, `/investors`, `/stocks`), SEC EDGAR as source, no-recommendation stance.

## Non-goals (explicit)

- Relocating Notable moves out of the first viewport.
- Changing notable-moves aggregation (MSFT in both buy and sell lists stays).
- Redesigning Step 01/03, Philosophy, Learn, or Foundations layout beyond incidental copy if touched.
- Adding FAQPage / WebSite SearchAction schema in this pass.
- Fixing clickability on non-homepage tables.

## Success criteria

1. Step 02 each row navigates to the matching stock page; affordance matches other ticker links.
2. Hero moves have no panel fill / rounded card chrome; no 「实时」/「live」.
3. Brand eyebrow visible in main content without relying on nav.
4. DataStrip tiles open consensus and macro respectively.
5. `/zh` and `/` `og:title` / `og:description` match page language.
6. `/llms.txt` returns 200 locally and in production shape (not a `[lang]` 404).
7. EN and ZH copy updated together; no algorithm changes to moves.

## Testing

- Manual: `/zh` and `/` — click consensus rows, DataStrip tiles, move rows, brand still readable with nav ignored.
- Curl/browser: metadata on `/zh` for Chinese OG; `GET /llms.txt` → 200.
- Visual: first viewport at desktop + mobile width — moves column still readable as bare list; no horizontal overflow.

## File touch list (expected)

- `web/src/components/home/HeroMasthead.tsx`
- `web/src/components/home/StepIndex.tsx`
- `web/src/components/common/DataStrip.tsx`
- `web/src/components/home/ClosingCTA.tsx`
- `web/src/app/[lang]/page.tsx`
- `web/public/llms.txt` (new)
