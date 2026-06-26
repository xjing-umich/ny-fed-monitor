# Landing Professional Redesign — "The Compounder Front Page"

**Date:** 2026-06-26
**Status:** Design approved (hero mockup signed off), pending spec review
**Target file:** `web/src/app/[lang]/page.tsx` (+ a few new section components)

## Goal

Raise the landing page (`web/src/app/[lang]/page.tsx`) from a dense editorial
table-stack to an **institution-grade product front page** that borrows the
*structure and craft* of top AI/tech sites (Linear, Vercel, Ramp, Mercury,
Anthropic) while **rejecting their visual clichés** (gradients, glow,
glassmorphism, AI-buzzword copy).

The page must do two jobs at once — the **hybrid** archetype the user chose:

1. **First-visit credibility** — a confident marketing hero that makes a
   first-time visitor immediately trust this is real, serious, institutional.
2. **Returning-user signal** — the real, living 13F data still on the page,
   below the fold, fresh every quarter.

Narrative spine (user-locked): **Who's buying → What they own → What it's worth.**
Macro is demoted to a single quiet link. The two emphasized pillars are
**investors (13F)** and **stocks + valuation**.

## Relationship to the 2026-06-07 homepage spec

The earlier spec (`2026-06-07-homepage-redesign-design.md`) deliberately
**removed the hero** so returning users "see data immediately," and it locked in
hard performance rules. This redesign does **not** revert that — it reconciles:

- The living-data modules (Notable Moves, Consensus, Investors) **stay** and stay
  data-first; they move *below* a new hero rather than being deleted.
- The new hero's "proof module" **is** the Notable Moves data — so even the hero
  is real data, not marketing fluff. We are not adding a dead splash screen.
- **All performance constraints from the 2026-06-07 spec carry forward
  unchanged** (see Performance & Constraints). The hero must add ~zero server
  cost and minimal client JS.

## Locked decisions (with user)

1. **Archetype: hybrid** — marketing hero on top, living-data sections below.
2. **Two pillars emphasized**: investors/13F and stocks/valuation. **Macro
   demoted** to one link (no macro fetch on this page — already true).
3. **Hero proof module = "Notable moves this quarter"** (real, dated 13F data).
4. **No single CTA** — exploration is the action. Three editorial text entry
   links (`Investors · Stocks · Valuation`), not buttons.
5. **Credibility wall** = the tracked investors themselves (the "trusted by"
   equivalent), using **monogram avatars** (not real portraits) — editorial,
   zero image-rights/style cost. *Revertible:* can swap to portraits later.
6. **Keep the financial-editorial soul** — warm paper, Fraunces display,
   money-green accent, hairline rules, tabular mono numbers. No new palette.
7. **Explicitly rejected**: aurora/gradient/glow heroes, glassmorphism, neon,
   3D blobs, AI-buzzword copy, mixed-language copy.

### Revertible defaults (chosen, low-stakes — flagged for easy change)

- Avatars: **monogram** (e.g. `WB`, `SK`). Portraits deferred.
- Entry affordance: **text links**, not buttons.
- Notable-moves panel: **right column on desktop, stacks below headline on
  mobile.**

## Page structure (top → bottom)

### ① Hero — "the masthead"

Asymmetric two-column on desktop (newspaper front-page feel); stacks on mobile.

- **Eyebrow / dateline** (mono, uppercase, green): a `FreshnessDot` +
  `SEC 13F · 45-day lag · as of <period>`. This promotes the existing dateline
  into a *credential* at the top.
- **Value proposition** (Fraunces, large — desktop ~`text-5xl`/`text-6xl`, ≤2
  lines): primary clause in ink, continuation clause in muted. Covers the two
  pillars, drops macro. Per-locale, single language:
  - zh: 「与最有耐心的投资者同行。」 + muted 「看他们持有什么 —— 以及值多少钱。」
  - en: "Walk with the most patient investors." + muted "See what they own —
    and what it's worth."
- **Sub-line** (one sentence): what the site is + source credibility
  ("…cross-referenced with first-principles valuation. Source: SEC EDGAR.").
- **Entry links** (Fraunces, green underline): `Investors · Stocks · Valuation`.
  These route to `/investors`, `/stocks`, and the valuation showcase / a flagship
  research page respectively.
- **Proof module (right column)**: the **Notable Moves** data rendered as a
  bordered card — "Most bought / Most sold" with `MoveTag` (`NEW/ADD/EXIT/TRIM`)
  + holder count + value, marked with a small `live` label. This reuses the
  existing `notableMoves()` aggregation and `MoveTag` component.

Hero must be a **server component** (no client JS beyond what already exists).

### ② Credibility wall — "Tracked investors"

A horizontal band (single row that wraps / a tidy grid) of the great investors
tracked: **monogram avatar + name**, each linking to the investor page. Ends with
a `+ N more →` link to `/investors`. Pulls from `getManagerIndex()` (already
loaded). This is the strongest social-proof asset and is currently unused.

### ③ Pillar one — "Who's buying" (Investors / 13F)

The existing Investors table, **elevated**: larger Fraunces section heading
(`text-2xl`/`text-3xl`), a one-line section thesis above it, more whitespace
(section spacing bumped from `mt-12` toward `mt-20`). `View all →` to
`/investors`. Stays compact on the homepage; detail pages stay rich.

### ④ Pillar two — "What they own" (Consensus holdings → Stocks)

The existing Consensus Holdings table, elevated the same way. Each row links to
the stock page (which carries valuation), bridging into the stocks pillar.

### ⑤ Pillar three — "What it's worth" (Valuation showcase) ⭐

**New, and the key differentiator** — valuation is currently invisible on the
homepage. A section that surfaces the valuation layer. Two candidate treatments
(pick during implementation, lower-risk first):

- **(a) Explainer + flagship** — a short statement of the method ("Every stock,
  valued three ways: Buffett OE-DCF · Greenwald EPV · asset value") plus a single
  flagship strike-zone / value-band visual for one marquee name, linking to its
  research page. *Recommended first cut* — reuses the existing strike-zone /
  value-band components from the valuation work.
- **(b) Mini grid** — 2–3 marquee names each with a compact value-band row.

Must respect the valuation philosophy constraint (no buy/sell calls, no
speculation; conservative framing).

### ⑥ Trust strip + demoted macro

A closing strip: `Source: SEC EDGAR · 45-day lag · No recommendations, no
speculation` (compliance + credibility in one line), a single demoted **macro**
link, and the existing newsletter form as a *soft secondary* (not a hero CTA).

## Visual craft (the "production value" upgrade, no clichés)

1. **Type-scale jump** — hero ~`text-6xl` Fraunces; section headings
   `text-2xl/3xl`; strong contrast against 13px body. Drama from *scale*, not
   color.
2. **Generous vertical rhythm** — section spacing toward `mt-20`/`mt-24`.
3. **Green as a single signature** — confined to: eyebrow dot, `MoveTag`, link
   underlines, one hairline rule under the masthead. Nowhere else.
4. **Tabular mono for every figure** — already in place; keep rigorous.
5. **Dark-mode parity** — the existing ink-paper dark theme must look equally
   composed in the hero (verify both modes).

## Motion

- **One** restrained on-scroll reveal: sections fade + translate-up ~8–12px on
  enter (IntersectionObserver), ~300ms, staggered subtly.
- **Must respect `prefers-reduced-motion`** (no transform/opacity animation when
  reduced).
- **No** parallax, gradient animation, or continuous motion.
- Implemented as a tiny client wrapper component used only for section reveals so
  the page stays RSC-first; if it adds meaningful bundle weight or risk, ship the
  static layout first and add motion as a follow-up. Motion is a polish layer,
  never a blocker.

## Performance & constraints (carried forward, non-negotiable)

- Keep `export const revalidate = 3600` (ISR, CDN-cached). **No** `force-dynamic`.
- **No live external API fetch** on this page (no macro/FRED/NYFed at build or
  request time) — see the `build-no-live-external-fetch` incident pattern.
- Reads stay the existing cheap parallel `Promise.all` set
  (`getManagerIndex`, `notableMoves`, `mostHeld`) — the credibility wall and hero
  reuse data already fetched; **do not add new per-request reads** if avoidable.
- **RSC-first** — hero and sections are server components; only the optional
  motion wrapper is client.
- **Mobile is a hard requirement** — hero collapses to single column (headline →
  proof module → links); lower tables stay vertically stacked, never
  side-by-side.

## Compliance

- Per-locale single language (no mixed zh/en in one string) — see
  `no-mixed-language-copy`.
- No buy/sell/recommendation language anywhere; the trust strip states "no
  recommendations, no speculation." Valuation showcase stays conservative.

## Component inventory

**Reuse:** `notableMoves()`, `mostHeld()`, `getManagerIndex()`, `MoveTag`,
`EntityName`, `FreshnessDot`, `filingFreshness`, `formatUSD`, `cleanIssuer`,
existing strike-zone / value-band valuation components, `NewsletterForm`.

**New (small, focused):**

- `HeroMasthead` (server) — eyebrow + value prop + sub-line + entry links +
  Notable Moves proof panel.
- `TrackedInvestorsWall` (server) — monogram avatars + names from the manager
  index.
- `ValuationShowcase` (server) — pillar ⑤ treatment (a).
- `SectionReveal` (client, optional) — IntersectionObserver motion wrapper,
  reduced-motion aware.

`page.tsx` becomes a thin composition of these sections; each section is
independently understandable and testable.

## Out of scope

- Macro page changes; investor/stock/research detail pages.
- Auth / accounts (none exist).
- New data sources or aggregations.
- Portrait imagery for investors (deferred; monograms ship first).

## Open questions / deferred

- Valuation showcase treatment (a) vs (b) — decide in implementation; (a) first.
- Whether the credibility wall is a static wrap-row or a slow marquee — default
  static; marquee only if it reads as tasteful, not gimmicky.
- Portraits vs monograms — revisit after launch.

## v2 — Rich scroll expansion (2026-06-26, after first build shipped)

User feedback after the first build: the page reads too sparse — Linear-style
sites carry many sections. The deep diagnosis: the real problem isn't "too few
sections," it's that **the product's genuine depth is hidden** (QoQ deltas,
cross-fund consensus math, three valuation methods, strike-zone, freshness,
bilingual, Learn, primary-source provenance). Linear's actual lesson is *one
confident section per real capability, each with a visual* — not length for its
own sake. So v2 surfaces hidden depth as dedicated sections; it does NOT add
filler.

**Honesty red line (what we do NOT borrow from Linear):** no fabricated customer
logos, no invented testimonials, no made-up metrics. Those would destroy
institutional credibility (the whole point). Honest substitutes:
- Logo wall → the **tracked-investors wall** (already built; it's real).
- Customer testimonials → an **attributed investing-philosophy pull-quote**
  (Buffett/Graham public quote, used as philosophy, not endorsement).

**v2 section order (hero/wall/trust strip from v1 are kept as the base):**

1. Hero masthead (v1)
2. Tracked-investors wall (v1)
3. **Feature row ① — Investors / 13F** (alternating text + visual)
4. **Feature row ② — Consensus** (reversed)
5. **Feature row ③ — Valuation** (reversed; static value-band as the visual)
6. **Foundations grid** — 9 small capability cards (lucide-react icons)
7. **Philosophy pull-quote** — large attributed Fraunces quote
8. **Learn teaser** — 3 real primers from `listArticles(lang)`
9. **Closing CTA band** — "Start with any investor, any stock" + entry links
10. Trust strip (v1) + global footer

**v2 decisions (locked):**
- The three v1 pillar tables / ValuationShowcase are **folded into the feature
  rows as their visuals** (no duplicate plain tables). `ValuationShowcase` is
  superseded by a small `ValueBandCard` used as feature row ③'s visual.
- Feature rows alternate sides (`reverse` flag) via a reusable `FeatureRow`
  primitive.
- Valuation visual stays **static schematic** (no new data read) — user choice.
- All new sections are **server components** wrapped in `SectionReveal`.
- `LearnTeaser` may call `listArticles(lang)` — a cheap bundled read (no DB, no
  external API), which is within the "no new *heavy* per-request reads" rule.
- Foundations grid uses `lucide-react` (already a dependency) for icons.
- All copy per-locale single-language; no buy/sell/forecast wording; the
  "no recommendations" guardrail itself appears as a foundations card.

## Verification (per `no-tests-solo-dev`)

No test suite. Verify via `tsc` for types and by viewing the page in the browser
preview in **both light and dark mode** and at mobile width, confirming: layout,
both-mode legibility, reduced-motion behavior, and that no external API is hit on
load.
