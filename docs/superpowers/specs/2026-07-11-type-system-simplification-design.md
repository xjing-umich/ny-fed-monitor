# Type system simplification (Option B)

**Date:** 2026-07-11  
**Status:** Approved for planning  
**Scope:** Full `web/` UI — stocks, investors, macro, learn, home, shell  
**Out of scope:** Theme colors, layout density (except as forced by font class swaps), removing Fraunces from the bundle

## Problem

Compounder loads three families (Fraunces display, Geist Sans, Geist Mono). That is a valid editorial stack, but **display was over-applied**: section H2s, list row names, search hits, 10px uppercase labels, and card titles all used `font-display`. On stock/investor detail pages the screen reads as three competing typefaces rather than one hierarchy. Users correctly report “font-family inconsistency.”

## Decision

**Option B — simplify, keep brand at page title:**

| Role | Face | Allowed surfaces |
|------|------|------------------|
| Page title | Fraunces (`font-display`) | Logo / wordmark; page-level **H1** only (`PageHeader`, `EntityPage` title, legal/macro/learn/error H1s, home hero **main** headline) |
| UI / section | Geist Sans (default) | Section H2/H3, table entity names, body copy, CTAs, card titles, search result names |
| Data / chrome | Geist Mono | Eyebrows, column headers, numbers, tickers, badges, tiny uppercase labels |

**Not chosen:** A (Fraunces only on logo + home hero) — too little brand on interior pages.  
**Not chosen:** C (drop Fraunces entirely) — unnecessary for a first simplification pass.

## Approach

**Shared-primitive first (Approach 1):** Change `SectionHeading` / `FoldedSection` and related H2 primitives from `font-display` → sans, then audit remaining `font-display` call sites. Do not introduce new semantic tokens (`font-page-title` etc.) in this pass — YAGNI until the audit stabilizes.

## Keep Fraunces

- `Logo`, TopNav / MobileDrawer / AppShell brand mark
- `PageHeader` H1, `EntityPage` H1, `ProseDoc` H1
- Page H1s: macro hero / methodology / refreshing, learn (if any page H1), error, not-found
- Home hero **primary** H1 only

## Change to Sans

**High leverage**

- `SectionHeading` (fixes stocks + investors section titles in one place)
- `FoldedSection`, `NewsletterCTA`
- Investor detail “About this investor” `<summary>`, `InvestorProfileProse` subhead
- Hand-written H2s: macro methodology sections, macro page section titles, learn index card titles, `ContactModal` title

**List / card “fake titles”**

- `SearchBox` result names
- `StrikeLeadersCard` / `StepIndex` row names and table cells
- `MacroViewModules` indicator names
- Home panel small titles (`HeroMasthead` panel title, etc.)

**Home (brand page, tightened)**

- Hero subhead, hero CTA, `ClosingCTA`, `LearnTeaser` titles → Sans
- `PhilosophyQuote`: body/quote text → Sans; large decorative quote mark may remain display (sole atmosphere exception)
- `StepIndex` block titles → Sans (treated as section titles, not page H1)

## Hard bans

- `font-display` combined with `text-[10px]` (or similar) uppercase chrome → must be `font-mono` (e.g. valuation card caution line)
- `font-display` on table primary links / entity names (already corrected in `DataTable`; do not regress)

## Explicit non-goals

- Do not remove Fraunces from `next/font` loading
- Do not redesign mono usage for numbers/eyebrows
- Do not restyle borders, spacing, or valuation chrome except where a class swap is required
- Do not invent a fourth font

## Acceptance

1. On a stock detail page (e.g. AAPL), Fraunces appears **once** in the main column: the issuer H1. Section titles (“Business quality”, valuation title, “Superinvestors Holding This Security”) are Sans.
2. On an investor detail page (e.g. Buffett), same rule: person name H1 = Fraunces; “Holdings” / posture / lonely = Sans.
3. `rg 'font-display' web/src` after the change lists only: brand marks, page H1s, home hero H1, and the documented PhilosophyQuote decoration exception (if kept).
4. No new `font-display` on list rows, search hits, or 10px labels.

## Implementation notes (for plan)

- Prefer editing shared components before page-local class strings.
- After class swaps, run `rg font-display` as the checklist gate.
- Visual spot-check: `/en/stocks/AAPL`, `/en/investors/<buffett-slug>`, `/en` home, `/en/macro`.

## Risks

- Home may feel slightly less “magazine” after section titles go Sans — accepted under Option B.
- Macro/learn pages with many hand-written H2s need an explicit file pass so they do not lag behind stocks/investors.
