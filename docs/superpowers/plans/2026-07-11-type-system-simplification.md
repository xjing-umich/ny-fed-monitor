# Type System Simplification (Option B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restrict Fraunces (`font-display`) to brand marks + page-level H1s; move section titles, list/card names, and chrome labels to Geist Sans (or Mono for tiny uppercase).

**Architecture:** Shared-primitive first — fix `SectionHeading` / `FoldedSection` / related H2 wrappers, then audit remaining `font-display` call sites file-by-file. No new semantic tokens. Gate = `rg 'font-display' web/src` allowlist + visual spot-check.

**Tech Stack:** Next.js App Router, Tailwind utility classes, Fraunces via `next/font` (`--font-display`), Geist Sans (default), Geist Mono (`font-mono`).

**Spec:** `docs/superpowers/specs/2026-07-11-type-system-simplification-design.md`

---

## File map

| Action | File | Responsibility |
|--------|------|----------------|
| Keep | `Logo.tsx`, `TopNav.tsx`, `MobileDrawer.tsx`, `AppShell.tsx`, `Footer.tsx` | Brand / wordmark |
| Keep H1 | `PageHeader.tsx`, `EntityPage.tsx`, `ProseDoc.tsx` (H1 only), `error.tsx`, `not-found.tsx`, `MacroViewHero.tsx`, `MacroRefreshing.tsx`, `macro/page.tsx` (H1), `methodology/page.tsx` (H1), `HeroMasthead.tsx` (H1), `ResearchPanel.tsx` (loading + main H1s) | Page titles |
| Keep exception | `PhilosophyQuote.tsx` decorative `"` mark only | Atmosphere |
| Keep infra | `layout.tsx` (`variable: "--font-display"`), `globals.css` (`.font-display` definition) | Font loading — do not remove |
| Change → Sans | `SectionHeading.tsx`, `FoldedSection.tsx`, `NewsletterCTA.tsx`, `InvestorProfileProse.tsx`, `investors/[slug]/page.tsx` summary, `SearchBox.tsx`, `StrikeLeadersCard.tsx`, `StepIndex.tsx`, `MacroViewModules.tsx`, `ClosingCTA.tsx`, `LearnTeaser.tsx`, `HeroMasthead.tsx` (non-H1), `ContactModal.tsx`, `ProseDoc.tsx` H2, `learn/page.tsx`, `methodology/page.tsx` H2s/links, `macro/page.tsx` non-H1 | Section / list / card titles |
| Change token | `globals.css` `--font-heading` | Point at sans so `CardTitle` / `font-heading` cannot reintroduce Fraunces outside the `rg font-display` gate |
| Change → Mono | `EarningsPowerFloorCard.tsx` caution line | Hard ban: display + 10px uppercase |

**Verification gate (final allowlist):** after all tasks, every `font-display` hit in `web/src` must be one of:

1. Brand: `Logo`, `TopNav`, `MobileDrawer`, `AppShell`, `Footer`
2. Page H1: `PageHeader`, `EntityPage`, `ProseDoc` H1, `error`, `not-found`, `MacroViewHero`, `MacroRefreshing`, macro page H1, methodology H1, `HeroMasthead` H1, `ResearchPanel` H1s
3. Exception: `PhilosophyQuote` large decorative quote mark only
4. Infra: `layout.tsx` variable, `globals.css` token / `.font-display` rule

Anything else = fail.

**Test note:** This repo has no unit suite for CSS class swaps. Each task verifies with `rg` on the touched files; final task runs full allowlist + visual spot-check. Run `npx tsc --noEmit` in `web/` once at the end (class-only edits should be type-clean).

---

### Task 1: Shared section primitives → Sans

**Files:**
- Modify: `web/src/components/common/SectionHeading.tsx`
- Modify: `web/src/components/entity/FoldedSection.tsx`
- Modify: `web/src/components/entity/NewsletterCTA.tsx`
- Modify: `web/src/components/entity/InvestorProfileProse.tsx`
- Modify: `web/src/app/globals.css` (`--font-heading` only)

- [ ] **Step 1: SectionHeading — drop `font-display`**

In `SectionHeading.tsx`, change the title `Tag` className from:

```tsx
<Tag className="font-display text-xl font-medium leading-tight tracking-tight text-[var(--tt-text)]">
```

to:

```tsx
<Tag className="text-xl font-medium leading-tight tracking-tight text-[var(--tt-text)]">
```

- [ ] **Step 2: FoldedSection — drop `font-display`**

In `FoldedSection.tsx`, change the `<h2>` className from `font-display text-lg ...` to `text-lg ...` (remove only `font-display`).

- [ ] **Step 3: NewsletterCTA — drop `font-display`**

In `NewsletterCTA.tsx`, change the `<h2>` className from `font-display text-xl ...` to `text-xl ...`.

- [ ] **Step 4: InvestorProfileProse — drop `font-display`**

In `InvestorProfileProse.tsx`, change the subhead `<span>` from `font-display text-lg ...` to `text-lg ...`.

- [ ] **Step 5: Point `--font-heading` at sans**

In `web/src/app/globals.css` `@theme inline`, change:

```css
--font-heading:        var(--font-display), Georgia, serif;
```

to:

```css
--font-heading:        var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
```

Do **not** remove `--font-display` or the `.font-display` utility. This closes the `CardTitle` / `font-heading` bypass that `rg font-display` would miss.

- [ ] **Step 6: Verify primitives**

```bash
rg 'font-display' web/src/components/common/SectionHeading.tsx web/src/components/entity/FoldedSection.tsx web/src/components/entity/NewsletterCTA.tsx web/src/components/entity/InvestorProfileProse.tsx
rg '--font-heading' web/src/app/globals.css
```

Expected: no `font-display` in the four components; `--font-heading` line references `var(--font-geist-sans)` (not `var(--font-display)`).

- [ ] **Step 7: Commit**

```bash
git add web/src/components/common/SectionHeading.tsx web/src/components/entity/FoldedSection.tsx web/src/components/entity/NewsletterCTA.tsx web/src/components/entity/InvestorProfileProse.tsx web/src/app/globals.css
git commit -m "$(cat <<'EOF'
refactor(ui): use sans for shared section headings

Fraunces stays on page H1 / brand; section primitives and font-heading default to Geist Sans.
EOF
)"
```

---

### Task 2: Investor detail + search + contact → Sans

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx` (~line 583 summary)
- Modify: `web/src/components/shell/SearchBox.tsx` (~line 197)
- Modify: `web/src/components/shell/ContactModal.tsx` (~line 128)

- [ ] **Step 1: Investor “About” summary → Sans**

Find the `<summary>` with `font-display text-lg` and remove `font-display` only.

- [ ] **Step 2: SearchBox result names → Sans**

In the result button/link className string that includes `font-display`, remove `font-display` only. Keep truncate / color / transition classes.

- [ ] **Step 3: ContactModal title → Sans**

Change the modal `<h2>` from `font-display text-lg ...` to `text-lg ...`.

- [ ] **Step 4: Verify**

```bash
rg 'font-display' 'web/src/app/[lang]/investors/[slug]/page.tsx' web/src/components/shell/SearchBox.tsx web/src/components/shell/ContactModal.tsx
```

Expected: no matches (investor page H1 comes from `EntityPage`, not this file).

- [ ] **Step 5: Commit**

```bash
git add 'web/src/app/[lang]/investors/[slug]/page.tsx' web/src/components/shell/SearchBox.tsx web/src/components/shell/ContactModal.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): sans for investor about, search hits, contact title

List/search names and modal H2s are UI chrome, not page titles.
EOF
)"
```

---

### Task 3: Home surfaces → Sans (keep hero H1 + quote mark)

**Files:**
- Modify: `web/src/components/home/HeroMasthead.tsx`
- Modify: `web/src/components/home/ClosingCTA.tsx`
- Modify: `web/src/components/home/LearnTeaser.tsx`
- Modify: `web/src/components/home/StepIndex.tsx`
- Modify: `web/src/components/home/StrikeLeadersCard.tsx`
- Modify: `web/src/components/home/PhilosophyQuote.tsx`

- [ ] **Step 1: HeroMasthead — keep only the main `<h1>` as display**

Remove `font-display` from:
- hero subhead `<p>`
- hero CTA `<Link>` / `<a>`
- panel title `<span>`
- panel row name links (truncate name)

**Keep** `font-display` on the primary `<h1>` (the large hero headline).

- [ ] **Step 2: ClosingCTA — both lines → Sans**

Remove `font-display` from the large `<p>` and the CTA link. (Closing CTA is not a page H1.)

- [ ] **Step 3: LearnTeaser — section + card titles → Sans**

Remove `font-display` from the section `<h2>` and each article `<h3>`.

- [ ] **Step 4: StepIndex — block title + row names → Sans**

Remove `font-display` from:
- block `<h2>`
- row name `<span>`
- table cell name `<td>`

- [ ] **Step 5: StrikeLeadersCard → Sans**

Remove `font-display` from the card title `<span>` and each leader name `<Link>`.

- [ ] **Step 6: PhilosophyQuote — body → Sans; keep decorative mark**

Remove `font-display` from:
- the quote body `<p className="font-display text-3xl ...">`
- the `<blockquote>`

**Keep** `font-display` on the absolute decorative `"` / `text-[110px]` mark only (spec exception).

- [ ] **Step 7: Verify home allowlist**

```bash
rg -n 'font-display' web/src/components/home/
```

Expected matches only:
- `HeroMasthead.tsx` — the `<h1>` line
- `PhilosophyQuote.tsx` — the decorative large quote mark line

- [ ] **Step 8: Commit**

```bash
git add web/src/components/home/
git commit -m "$(cat <<'EOF'
refactor(home): reserve Fraunces for hero H1 and quote mark

Home section titles, CTAs, and list names move to sans under Option B.
EOF
)"
```

---

### Task 4: Macro + learn + legal prose H2s → Sans

**Files:**
- Modify: `web/src/app/[lang]/macro/page.tsx`
- Modify: `web/src/app/[lang]/macro/MacroViewModules.tsx`
- Modify: `web/src/app/[lang]/macro/methodology/page.tsx`
- Modify: `web/src/app/[lang]/learn/page.tsx`
- Modify: `web/src/components/legal/ProseDoc.tsx`

**Do not touch** `MacroViewHero.tsx` or `MacroRefreshing.tsx` (page H1s stay display).

- [ ] **Step 1: macro/page.tsx — keep H1 only**

Remove `font-display` from:
- indicator / card name `div`s / spans (the `text-sm font-medium` ones)
- section `<h2>` elements

**Keep** `font-display` on the page `<h1>`.

Also update the hover CSS if present:

```css
.indicator-card:hover span.font-display { color: var(--tt-accent); }
```

After removing `font-display` from those spans, retarget the selector to whatever class remains on the name span (e.g. a dedicated class, or `.indicator-card:hover .indicator-name`). Minimal approach: add `indicator-name` to the name span and change the style to:

```css
.indicator-card:hover .indicator-name { color: var(--tt-accent); }
```

- [ ] **Step 2: MacroViewModules.tsx — all three name spans → Sans**

Remove `font-display` from every `text-sm font-medium` indicator name span.

- [ ] **Step 3: methodology/page.tsx — keep H1 only**

Remove `font-display` from all `<h2>`s and from methodology index `<Link>` titles. Keep on `<h1>`.

- [ ] **Step 4: learn/page.tsx — card titles → Sans**

Remove `font-display` from the learn index card `<h2>`s.

- [ ] **Step 5: ProseDoc — H2 → Sans; keep H1**

Remove `font-display` from the section `<h2>` only. Keep on `<h1>`.

- [ ] **Step 6: Verify**

```bash
rg -n 'font-display' 'web/src/app/[lang]/macro/' 'web/src/app/[lang]/learn/' web/src/components/legal/ProseDoc.tsx
```

Expected keep-only:
- `MacroViewHero.tsx` H1
- `MacroRefreshing.tsx` H1
- `macro/page.tsx` H1
- `methodology/page.tsx` H1
- `ProseDoc.tsx` H1

No matches in `MacroViewModules.tsx` or `learn/page.tsx`.

- [ ] **Step 7: Commit**

```bash
git add 'web/src/app/[lang]/macro/' 'web/src/app/[lang]/learn/page.tsx' web/src/components/legal/ProseDoc.tsx
git commit -m "$(cat <<'EOF'
refactor(macro/learn): sans for section and card titles

Page H1s keep Fraunces; methodology/learn/macro modules use sans.
EOF
)"
```

---

### Task 5: Hard ban — valuation caution line → Mono

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx` (~line 393)

- [ ] **Step 1: Swap display → mono**

Change:

```tsx
<p className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-warn)]">
```

to:

```tsx
<p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-warn)]">
```

- [ ] **Step 2: Verify no display+10px left**

```bash
rg 'font-display.*text-\[10px\]|text-\[10px\].*font-display' web/src
```

Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "$(cat <<'EOF'
fix(ui): mono for valuation caution chrome

Tiny uppercase labels must not use Fraunces.
EOF
)"
```

---

### Task 6: Full allowlist gate + visual spot-check

**Files:** none (verification only); update spec status if desired.

- [ ] **Step 1: Full inventory**

```bash
rg -n 'font-display' web/src
```

Manually confirm every hit is on the allowlist in the File map above (including `ResearchPanel.tsx` H1s — keep, do not strip). If any stray remains (e.g. a page-local H2 missed), fix it in a follow-up micro-commit before proceeding.

Optional no-regress check (spec hard ban):

```bash
rg 'font-display' web/src/components/common/DataTable.tsx web/src/components/entity/EntityName.tsx
```

Expected: no matches.

- [ ] **Step 2: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Visual spot-check** (dev server already or `npm run dev` in `web/`)

| URL | Expect |
|-----|--------|
| `/en/stocks/AAPL` | Fraunces once in main column = issuer H1; section titles Sans |
| `/en/investors/<buffett-slug>` | Person H1 = Fraunces; Holdings / about = Sans |
| `/en` | Hero H1 = Fraunces; panel titles / StepIndex / ClosingCTA = Sans |
| `/en/macro` | Page H1 = Fraunces; indicator names / section H2s = Sans |

- [ ] **Step 4: Mark spec implemented**

In `docs/superpowers/specs/2026-07-11-type-system-simplification-design.md`, change Status from `Approved for planning` to `Implemented`.

- [ ] **Step 5: Final commit (spec status only, if changed)**

```bash
git add docs/superpowers/specs/2026-07-11-type-system-simplification-design.md
git commit -m "$(cat <<'EOF'
docs: mark type-system simplification spec implemented
EOF
)"
```

---

## Out of scope (do not do in this plan)

- Removing Fraunces from `next/font` / `globals.css`
- Redesigning mono number/eyebrow usage
- Border / spacing / valuation chrome restyles beyond the caution class swap
- New tokens like `font-page-title`
