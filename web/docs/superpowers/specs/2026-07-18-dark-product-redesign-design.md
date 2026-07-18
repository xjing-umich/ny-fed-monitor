# Dark Product Redesign — Design Spec

Date: 2026-07-18
Status: Approved by user (brainstorming session)
Scope: 落地页、个股页、投资者页 + `ui/*` 基元 + 全局 token

## 1. Background

Current site is a light "financial editorial" theme (warm paper, money green, hairlines). User finds it monotonous and lacking texture — visually flat, no memorable moments. Decided direction: **dark, Linear/Raycast-grade product polish**, but grounded in the product's nature (13F institutional holdings + valuation data), not a generic tech skin.

## 2. Art Direction — "The Ledger in the Dark"（暗室里的账本）

Narrative: institutional holdings data lives in the dark; the product illuminates it. Dark = backstage/terminal; light = data.

- **Base**: near-black warm ink-green family (~`#0C1210` family), derived from the existing money-green brand gene — not a generic pure black.
- **Light is semantic**: the only "glow" in the site is data. Key numbers, valuation band, consensus signals carry a subtle green/amber luminescence. No decorative glow. Users learn: bright = important data.
- **Semantic colors**: buy/up = brand green (brightened for dark), sell/down = oxblood red, warning = amber. Carried over from existing palette, recalibrated for dark contrast.
- **Material**: terminal feel replaces paper feel. Dividers = translucent hairlines (`white/8`); cards = subtle tonal step + 1px top inner-light edge (Raycast panel quality). No blur glass walls.
- **Typography**: keep Geist Sans + Geist Mono + serif display. Add a true display-size scale (hero numerals up to 72–96px, tabular-nums).

Reference temperament: Bloomberg terminal ceremony × Raycast pixel precision × existing editorial typographic discipline.

## 3. Page-Level Redesign — one "accent moment" per page

Principle: **one protagonist per page**. Each page gets 1–2 designed accent moments; everything else recedes.

### Landing page — accent = the big number
- Hero: "72" (or current-quarter aggregate) rendered 96px+ display numeral with data-glow; copy recedes to support.
- DataStrip becomes a luminous data band.
- StepIndex uses oversized mono numerals (01 / 02 / 03) for rhythm.
- Section spacing moves to a proportional scale (8/16/32/64/96), replacing current magic margins (`mt-28/32/24/20`).

### Stock page — accent = the valuation band
- Valuation band (strike zone / value band) becomes the signature, screenshot-worthy component: current price as a glowing cursor on a precision-instrument scale with fine gradations and annotations.
- Price / market cap in display sizes; holder lists recede to quiet dense tables.

### Investor page — accent = the quarter's moves
- Top summary moment: 新建 X / 加仓 Y / 清仓 Z as three large numerals side by side (green / ink / red semantics).
- Holdings table: high-density dark table with tabular-nums — the direction's biggest free win.

### Macro legacy dashboard
- Inline-style sprawl cleaned up into the token system; visually the most "terminal-native" page.

### Untouched
Nav, article (learn) pages, legal pages stay quiet typography — polish comes from contrast; accents everywhere = accents nowhere.

## 4. System Layer

### Tokens (`src/app/globals.css`, single file)
- Keep `--tt-*` semantics, remap values to the ink family.
- New: `--glow-primary` (data green), `--glow-warn` (amber), `--ink-1/2/3` three-level text hierarchy (replaces the vague muted/faint usage).
- `--chart-1..5` recalibrated for dark.
- `radius` 7px → 6px (crisper on dark).
- Dark becomes default; light theme demoted to opt-in "usable, not polished".

### Component work (priority order)
1. `ui/card.tsx` / `badge.tsx` / `table.tsx` / `button.tsx` — strip shadcn default ring/shadow; replace with translucent hairline + 1px top inner-light edge + subtle tonal step.
2. New `Display` typography component — display numeral/heading scale (48/64/96), tabular-nums throughout.
3. Valuation band re-render (signature element).
4. New `Section` layout primitive — encapsulates the spacing scale; replaces magic margins in `[lang]/page.tsx`.
5. Macro panel inline-style cleanup into tokens.

### Motion (whitelist)
Only three permitted:
1. One-shot page-enter reveal (reuse `RevealStagger`, duration ≤ 0.4s).
2. Count-up on key numerals (hero and investor summary only, once each).
3. Valuation-band cursor hover/load transitions.
Forbidden: looping animation, scroll parallax, decorative particles.

### Copy / text hierarchy
- `--ink-1` body (high-contrast), `--ink-2` secondary, `--ink-3` timestamps/sourcing only.
- Rule added to copy-voice checklist: no fully-muted paragraphs.
- All three levels verified against WCAG AA.

## 5. Verification

- `npm run build` after each page + visual checklist (no gradient walls, no blur misuse, spacing from scale).
- Contrast spot-check script for AA on the three ink levels.
- managers / screener / learn inherit base primitives automatically; no bespoke design this round.

## 6. Out of scope (YAGNI)

- Grain/noise textures, 3D, kinetic typography, bento layouts.
- Polishing a parallel light theme (light = functional only).
- managers/screener/learn page-specific redesigns.
