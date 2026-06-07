# Compliance Guardrails — Design

Date: 2026-06-07
Branch: `feat/compliance-guardrails`

## Context

Compounder (thecompounder.fyi) is an educational value-investing content site
(13F holdings × valuation × macro). To support traffic growth via English
channels (SEO, Reddit, HN, X), the site must keep a conspicuous "educational,
not investment advice" posture. The binding legal line is the U.S. Investment
Advisers Act (Chinese-platform promotion is deferred, so PRC securities-advisory
rules are out of scope for now).

Existing guardrails already in place (not touched):

- Footer disclaimer on every page: "Not investment advice" + SEC non-affiliation
  + data-source attribution, bilingual (`web/src/lib/footer.ts`).
- Three bilingual legal pages: Disclaimer / Terms / Privacy
  (`web/src/lib/legal.ts`, `web/src/app/[lang]/{disclaimer,terms,privacy}`).
- `SourceFooter` already renders "SEC EDGAR 13F · as of {filedAt}" on entity
  pages (`web/src/components/entity/SourceFooter.tsx`) — so data-freshness
  labeling (originally "A2") is already satisfied; the 45-day-lag note is folded
  into the A1 inline disclaimer instead of a separate change.

## Scope

Two incremental additions, both following the existing bilingual (`Lang`) and
editorial-styling patterns.

### A1 — Inline disclaimer on entity pages (reusable)

- Add an optional `disclaimer?: string` prop to `EntityPage`
  (`web/src/components/entity/EntityPage.tsx`), rendered as a muted small-text
  line directly under the subtitle in the masthead. Subtle editorial weight, not
  a loud banner — preserves the serious value-investing brand tone.
- The stock detail page (`web/src/app/[lang]/stocks/[ticker]/page.tsx`) passes
  bilingual copy that also carries the 13F lag note:
  - EN: "Educational data only — not investment advice. 13F positions are
    self-reported and can lag up to 45 days."
  - ZH: "仅供教育与信息参考，不构成投资建议。13F 持仓为机构自行申报，可能滞后最多 45 天。"
- Because it is a generic `EntityPage` prop, investor/macro pages can adopt it
  later with a single line.

### A3 — About page

- New content file `web/src/lib/about.ts` exporting bilingual content reusing the
  existing `LegalDoc` shape (title / intro / sections).
- New route `web/src/app/[lang]/about/page.tsx` — statically generated for
  en/zh with metadata, mirroring the legal page pattern.
- Rendering reuse: extract the presentational markup from `LegalArticle` into a
  thin shared component that takes a `LegalDoc` (+ optional "last updated"), so
  both the legal pages and About render identically. No visual change.
- Footer "Support" column gains an About link.
- About content outline (bilingual):
  1. What we do — surface 13F holdings, valuation frameworks, macro liquidity;
     an educational tool.
  2. What we don't do — no stock tips, no buy/sell calls, no personalized advice.
     (Doubles as a compliance asset reinforcing the "educational, not advice"
     characterization.)
  3. Our philosophy — compounding / Buffett · Graham value investing.
  4. Data & sources — SEC EDGAR / NY Fed / Treasury, with lag caveat.
  5. Contact — points to the contact form.

## Out of scope / unchanged

- The three legal pages, footer disclaimer text, and `SourceFooter` freshness
  labeling already meet the bar and are left as-is.
- Chinese-platform promotion and PRC securities-advisory compliance (deferred).
- Marketing copy templates for outbound channels (separate follow-up).

## Verification

Per solo-dev convention (no test suite): `tsc` clean + manual page review
(`/en/about`, `/zh/about`, a stock page showing the inline disclaimer).
