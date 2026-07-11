# Copy Voice Rubric + Full-Site De-AI Sweep — Design

Date: 2026-07-11
Branch: `fix/copy-voice-de-ai` (reassigned from `fix/home-canonical-hreflang`, whose SEO fixes A/B/macro-meta merged separately via PR #151)
Status: design approved, pending spec review → writing-plans

> **Addendum (post-execution):** This work ships on `fix/copy-voice-de-ai`, NOT the
> original `fix/home-canonical-hreflang` — the latter's A/B/macro-description changes
> were already merged to `db-foundation` (PR #151). The "Where it lands" section below
> reflects the pre-merge assumption; the plan doc carries the corrected scope. The
> homepage H1, seeded here as a KILL finding, was KEPT by user ruling; the rubric's
> staccato rule was recalibrated accordingly (hollow staccato is the tell, not staccato).

## Problem

The site's user-facing copy is mostly strong, human-voiced writing (the `learn`
long-form articles and `about` are genuinely good). But a few surfaces —
concentrated on the homepage "marketing" copy — carry generic AI / ad-brochure
register: staccato fragment triads, hollow antithesis, SaaS filler verbs. There
is an `anti-ai-product-sense` memory but no canonical, in-repo, reusable standard
that future copy is checked against. Without one, AI-flavored lines keep
re-entering the codebase and each session re-derives the judgment from scratch.

## Goals

1. A durable, in-repo copy voice rubric that any future session applies.
2. A one-time full-site sweep against that rubric, fixing the real offenders.
3. Protect the site's earned voice — the rubric is a scalpel, not a broad net.

## Non-Goals

- Rewriting copy that already reads human just to "freshen" it.
- Banning rhetorical devices outright (the good `learn` copy uses them well).
- Touching data-templated factual strings (FAQ / Dataset / blurbs) that are
  already concrete and GEO-friendly.
- A lint/hook enforcement mechanism (tone can't be reliably machine-judged; the
  rubric is enforced by Claude reading it, not by CI).

## Decisions (from brainstorming)

- **Scope:** establish a rubric AND sweep the whole site line-by-line.
- **Positioning:** durable standard, written into the repo rule layer.
- **Bar (knife):** scalpel — kill only hollow/generic AI register; explicitly
  protect specific, opinionated ("earned") rhetoric. `learn` articles are the
  north star for "our voice."
- **Form (Approach A):** thin pointer in the rule layer + full rubric in a doc,
  so the standard is durable without bloating every session's context.

## Deliverables

### 1. Rubric doc — `web/docs/copy-voice.md`

Sections:
- **Purpose** (one line): keep copy in the site's own voice — concrete,
  opinionated, data-first — out of generic AI/marketing register.
- **Core test — "earned vs hollow":** a device stays if it is specific and
  carries a real point of view; it goes if it is generic/decorative and any
  product could say it. Anchored with one real contrast pair:
  - KEEP: "Treat a 13F as a lead, not an answer." (specific, opinionated)
  - KILL: "N investors. One quarter. Every position." (hollow staccato)
- **Banned tells**, each with a 反例→正例 pair (drawn from real site copy where
  possible):
  1. Staccato fragment triads ("X. Y. Z.")
  2. Hollow antithesis ("only X, never Y" when generic)
  3. Decorative rule-of-three enumeration
  4. Hedging ("arguably", "in many ways", "helps to")
  5. SaaS/brochure verbs & adjectives (full-spectrum, drill into, unlock,
     seamless, powerful, empower, leverage)
  6. Em-dash lyricism (em-dash used for drama, not clarification)
  7. Decorative icon spam (copy-adjacent; from `anti-ai-product-sense`)
- **North-star examples:** 4–5 real lines lifted from the site's `learn`/`about`
  copy, labeled "this is our voice."
- **Checklist:** 5–6 yes/no gut-checks to run before shipping any copy.
- Bilingual note: judge en and zh independently.

### 2. Rule-layer wiring

- `web/AGENTS.md`: add ONE pointer line — user-facing copy follows
  `docs/copy-voice.md` (concrete, data-first, no generic AI/marketing register).
  Full rubric stays in the doc to avoid per-session context bloat.
- Memory `anti-ai-product-sense.md`: note the canonical rubric now lives at
  `web/docs/copy-voice.md` (single source of truth); memory becomes why+pointer.

### 3. Full-site sweep

- **Surfaces:** meta titles/descriptions; homepage components
  (hero / foundations / stepindex / cta / philosophy); aggregate blurbs; `learn`
  (5 articles — already read, clean); `about`; macro on-page intros/kickers;
  methodology; FAQ / Dataset descriptions; OG card copy; share text; valuation
  card / screener copy.
- **Output:** a ranked findings table — `surface | original | verdict
  (kill / borderline / keep-noted) | proposed rewrite`. Only kill/borderline are
  listed; "keep" is silent. Under the scalpel bar the list is expected short
  (~3–6 items).
- **Known findings so far** (to be confirmed/expanded during the sweep):
  - KILL: homepage H1 en — "N investors. One quarter. Every position they just
    reported." (staccato triad; zh version is fine — en-only).
  - BORDERLINE: FoundationsGrid — "paying only for earnings power and assets
    already proven, never for a story or a forecast" (defensible brand thesis).
  - MINOR: macro on-page intro — "…then drill into funding, supply, policy, and
    macro pricing." (double enumeration + "drill into").
- **Approval flow:** present findings → user approves/edits each line → apply
  approved rewrites → tsc + eslint.

## Where it lands

All artifacts ride the existing `fix/home-canonical-hreflang` branch, whose PR
then carries: A (homepage canonical/hreflang) + B (ogFor default OG image) +
macro description de-AI + this rubric doc + AGENTS pointer + approved copy
rewrites. Work is done in an isolated git worktree; the shared working tree
(peer session on `feat/stock-page-hierarchy`) is never touched.

## Verification

- tsc = 0, eslint = 0 after copy edits.
- Runtime copy render is not locally verifiable (Google Fonts blocks
  `next build` locally); final visual check happens on the Vercel preview after
  merge.
- Rubric doc + AGENTS pointer are prose — reviewed by the user, not by CI.

## Out of scope / follow-ups

- Sitemap thin-page tightening (separate, deferred, GSC-data-gated).
- Consensus report page merge + learn-article dedup (separate).
