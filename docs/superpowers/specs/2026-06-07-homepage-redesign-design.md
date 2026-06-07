# Homepage Redesign — Compact Signal Stream + Performance Overhaul

**Date:** 2026-06-07
**Status:** Design approved, pending spec review
**Branch:** feat/seo-geo-baseline

## Goal

Redesign the Compounder homepage (`web/src/app/[lang]/page.tsx`) so its
information display beats ValueSider and Dataroma on **signal quality** (not raw
density), while making the page **extremely fast**. Current homepage feels
low-value above the fold (giant quote + search hero) and is slow because it
fetches external macro APIs on every request.

Guiding principle from the user: **少而精** (few but excellent). Fewer modules,
each deeper. Search lives only in the header. Macro is de-emphasized to a single
link. Mobile (H5) usability is a hard requirement — layout stays vertically
stacked, never side-by-side columns for the two lower modules.

## Competitive Context (why these decisions)

- **Dataroma**: very high density, cross-signals (13F × insider × 52-wk-low),
  but dated UX, no context, buys-only, no sell data on home.
- **ValueSider**: screeners + export + broader asset classes, more modern but
  generic.
- **Compounder's edge**: macro/liquidity data (unique), valuation overlay
  (roadmap), modern bilingual editorial design. We do NOT try to out-density
  Dataroma; we win on clarity + change-type labeling + the macro/valuation moat.

## Decisions (locked with user)

1. Direction: **signal quality**, not density. Keep editorial table-driven style.
2. **Remove the Hero block entirely** — Buffett quote, large hero `SearchBox`,
   and "Browse all superinvestors" link all deleted. User opens the page and
   immediately sees data.
3. **Strengthen header search** — it becomes the single search entry point.
4. **Notable Moves gets change-type tags**: `NEW` / `ADD` / `EXIT` / `TRIM`
   (four states). This is the priority depth upgrade.
5. **Macro de-emphasized** to a one-line link into `/macro`. The homepage no
   longer calls `buildAllSections()` at all.
6. **Investors module is compact on the homepage**; the detail/list pages stay
   rich. (Investor detail page is out of scope for this change.)
7. **Consensus Holdings + Investors stay vertically stacked** (not side-by-side)
   to guarantee mobile usability.
8. **Performance is a first-class requirement** — see Performance section.

## Performance Overhaul (root-cause fixes)

Current `page.tsx` problems found during exploration:

| # | Problem | Fix |
|---|---------|-----|
| 1 | `buildAllSections()` fetches NY Fed / Treasury external APIs on every load (the dominant latency source) | **Remove entirely** from the homepage. Macro is now just a link. |
| 2 | `export const dynamic = "force-dynamic"` — zero caching, no CDN, full re-render per request | Replace with **ISR**: `export const revalidate = 3600`. 13F data updates quarterly; hourly revalidate is more than fresh enough. Page becomes statically cached → served from CDN. |
| 3 | Four sequential `await`s (`getManagerIndex` → `notableMoves` → `mostHeld` → `buildAllSections`) | After removing macro, parallelize the remaining reads with `Promise.all`. Both are cheap (Supabase or bundled JSON). |
| 4 | Hero `SearchBox variant="hero"` + `heroItems` computation ships a large client component and extra work | Hero removed → homepage becomes a near-pure RSC. Header already owns search. |

Expected outcome: homepage shifts from "dynamic page that blocks on external
APIs" to "quarterly-fresh static CDN page" — an order-of-magnitude TTFB
improvement, plus a smaller client JS bundle.

**Constraint:** `revalidate = 3600` must not break the Supabase fallback path.
If `hasSupabaseEnv()` is false, data comes from bundled JSON (fully static-safe).
If Supabase is on, ISR caches the rendered output for an hour — acceptable.

## Page Structure (final)

Top → bottom, single column, `max-w-5xl` (keep current; do not widen since we
chose stacked layout):

1. **Dateline** (one line, mono, small): `As of {period} · {N} investors · SEC 13F · 45-day lag`. Replaces the entire hero.
2. **Notable Moves** — two sub-columns (Most Bought | Most Sold) inside the
   section; on mobile they stack. Each row gets a change-type tag chip.
3. **Consensus Holdings** — table, `VIEW ALL →` to `/stocks`. 8 rows.
4. **Investors** — compact table, `VIEW ALL →` to `/investors`. 6–8 rows:
   person · AUM · holding count (+ top holding as faint subtext, as today).
5. **Macro / Liquidity** — one-line link row into `/macro` with a short
   bilingual caption. No data fetch.
6. **Footer note** — sources + 45-day-lag disclaimer (keep existing).

### Change-type tag design

- `NEW` and `EXIT` = **strong signals** (full open / full close) → solid chip.
- `ADD` and `TRIM` = **weaker signals** (position adjust) → outline chip.
- Color: green family for NEW/ADD, red family for EXIT/TRIM, using existing
  `--tt-*` tokens (no new palette). Tags must remain legible in dark mode.
- Bilingual: keep tag text as short uppercase tokens (NEW/ADD/EXIT/TRIM) in both
  languages for compactness; optionally localize via title attribute.

## Data Layer Change

`MoveRow` (in `web/src/lib/aggregations.ts`) currently collapses
`new`+`increased` into "buys" and `exited`+`decreased` into "sells" without
preserving which kind dominates. To render tags we need a dominant kind.

- Add `dominantKind: "new" | "increased" | "exited" | "decreased"` to `MoveRow`.
- In `computeNotableMoves`, while aggregating per cusip, track a per-kind count
  and set `dominantKind` to the most frequent kind for that security (tie-break:
  prefer the stronger signal — `new` over `increased`, `exited` over
  `decreased`).
- Update the Supabase read path (`consensusRead.readConsensusMoves`) to also
  return `dominantKind`. If the DB schema lacks it, derive it post-read or fall
  back to a sensible default (`increased`/`decreased`) so the page never breaks.
- Map kind → tag label in the page: `new→NEW`, `increased→ADD`, `exited→EXIT`,
  `decreased→TRIM`.

This is additive and backward-compatible; no consumer breaks if the field is
present.

## Header Search Strengthening

In `web/src/components/shell/TopNav.tsx` / `SearchBox.tsx` (default variant):

- Widen the input from `w-36` to a more prominent width (e.g. `w-56`/`w-64` on
  desktop) so it reads as the primary search affordance now that the hero search
  is gone.
- Optional: add a `⌘K` / `Ctrl K` hint affordance and a global keydown handler
  to focus the header search. (Nice-to-have; can be a follow-up if it expands
  scope — flag during planning.)
- The mobile drawer already has its own search entry; verify it still works
  after hero removal (mobile users lost the hero search box).

## Components Affected

- `web/src/app/[lang]/page.tsx` — major rewrite (remove hero, remove macro
  fetch, ISR, Promise.all, add tag rendering, stacked layout).
- `web/src/lib/aggregations.ts` — add `dominantKind` to `MoveRow` +
  `computeNotableMoves`.
- `web/src/lib/managers/consensusRead.ts` — propagate `dominantKind` (or derive).
- `web/src/components/shell/SearchBox.tsx` / `TopNav.tsx` — widen + strengthen
  header search.
- Possibly a small `MoveTag` server-safe sub-component (CSS-only, no client JS).

## Out of Scope

- Investor detail page enrichment (separate effort; user said detail pages
  should be rich but that's not this change).
- Insider (Form 4) data, Big Bets, 52-week-low screens (deliberately not added —
  we chose 少而精 over Dataroma-style density).
- Valuation overlay tags on Consensus Holdings (roadmap, not now).
- Price-since-filing context (considered, deprioritized by user).

## Risks / Open Questions

- ISR + Supabase: confirm rendered ISR caching is acceptable vs. always-fresh.
  Mitigation: 1h revalidate is well inside the 45-day 13F lag, so staleness is a
  non-issue.
- `dominantKind` in Supabase: if `consensus_moves` table can't supply it,
  post-read derivation must be reliable. Plan must verify the read path.
- Mobile: Notable Moves' two sub-columns must collapse cleanly to one column on
  small screens (already the case via `grid-cols-1 md:grid-cols-2`).

## Success Criteria

- Above the fold on desktop shows Notable Moves (no hero, no big search).
- Notable Moves rows display correct NEW/ADD/EXIT/TRIM tags.
- Homepage no longer issues NY Fed / Treasury network requests.
- Homepage renders as ISR/static (no `force-dynamic`), measurably faster TTFB.
- Layout is single-column stacked; usable on mobile.
- Header search is visibly the primary search entry point.
