# Lean Index Coverage — Design

Date: 2026-06-08
Branch: `feat/lean-index`

## Context

thecompounder.fyi is a brand-new, zero-authority domain (GSC: ~2 clicks, ~18
URLs known, indexing report still processing). An audit of crawlability found
the core SEO bottleneck:

- The sitemap submitted **~1000 stock pages** (the full held-stock universe).
- Internal links only reached **~300–500** of them (the `/stocks` list capped at
  40, the home consensus ~20, and each investor page's top-25 holdings).
- So **~500–700 stock pages were orphaned**: in the sitemap, but with no internal
  link path. Most were also thin (single holder + "valuation coming soon").

On a new domain this is counterproductive: asking Google to index ~1000 mostly
thin, orphaned pages buries crawl budget and drags site-quality signals, which
slows the trust the whole site needs to start ranking.

Chosen strategy (Option A — lean / quality-first): submit and internally link
only the **substantial** pages, and let the thin long tail stay crawlable but
out of the sitemap until it has more content. Expand coverage later as authority
grows and valuation data fills the thin pages.

## Definition of "substantial"

A stock held by **≥ 2 superinvestors** (`CONSENSUS_MIN_HOLDERS = 2`). These have
real cross-fund consensus, more on-page content, and are the pages that can
actually rank. Measured result: **319 stocks** qualify (down from ~1000).

## Changes

1. **Shared source of truth** — `web/src/lib/aggregations.ts`:
   - `CONSENSUS_MIN_HOLDERS = 2`
   - `consensusHeld()` → `mostHeld(5000)` filtered to `holderCount >= 2`.
   Both the sitemap and the `/stocks` hub call this, so they never drift.

2. **Sitemap** — `web/src/app/sitemap.ts`:
   - Stock entries now come from `consensusHeld()` instead of `mostHeld(5000)`.
   - Result: ~1000 → **319** stock URLs (total sitemap 1055 → 374).

3. **`/stocks` hub** — `web/src/app/[lang]/stocks/page.tsx`:
   - Renders the full `consensusHeld()` set (was `mostHeld(40)`).
   - Every stock in the sitemap now has an internal link from this hub → zero
     orphans in the submitted set. Verified: 319 sitemap stocks, 320 links on
     `/stocks`.

## Out of scope / unchanged

- Single-holder stock pages stay live (on-demand ISR), reachable directly and via
  investor-page links — just not promoted in the sitemap, and **not** `noindex`
  (so they can be re-added with a one-line threshold change once they have
  valuation content).
- Investor pages, `/learn`, `/about`, macro, home, structured data, canonicals,
  hreflang — all untouched.
- Investor-page `MAX_HOLDINGS` cap left as-is; `/stocks` is now the full hub, so
  raising it is unnecessary.

## Verification (solo-dev: tsc + manual)

- `tsc --noEmit` clean.
- New sitemap lists 319 stock URLs (was ~1000); total 374.
- `/stocks` renders the full consensus set, each row linking to its detail page.
- No console errors.

## Follow-ups (not in this change)

- As authority grows / valuation data lands, lower the bar or add single-holder
  top-holdings back to the sitemap (one-line threshold change).
- Next growth steps: read the GSC index report once it populates; first backlinks
  (Reddit/HN) to build domain trust.
