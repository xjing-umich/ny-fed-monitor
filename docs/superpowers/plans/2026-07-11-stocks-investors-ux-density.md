# Stocks + Investors UX Density Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull Stocks/Investors primary tables into the first viewport and finish P0+P1 polish (utility copy, nav parity, EDGAR title-case, Links removal, source dedupe).

**Architecture:** Shared-primitive first — tighten `SubNav` / `PageHeader` / `EntityPage` spacing and investor filter chrome, then page-local P1 edits. No new density CSS tokens. Gate = visual first-viewport check + targeted `rg` + `npx tsc --noEmit`.

**Tech Stack:** Next.js App Router, Tailwind utilities, existing `PageHeader` / `EntityPage` / `DataTable` / `displayFundName`.

**Spec:** `docs/superpowers/specs/2026-07-11-stocks-investors-ux-density-design.md`

---

## File map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `web/src/components/shell/SubNav.tsx` | `mb-8` → `mb-4` |
| Modify | `web/src/components/common/PageHeader.tsx` | `pb-6` → `pb-4` |
| Modify | `web/src/components/entity/EntityPage.tsx` | children `space-y-6 sm:space-y-7` |
| Modify | `web/src/app/[lang]/stocks/page.tsx` | Drop nested max-w/py; `mb-8`→`mb-4`; remove footer source dup |
| Modify | `web/src/app/[lang]/stocks/screener/page.tsx` | Drop nested max-w/py; `mb-8`→`mb-4` |
| Modify | `web/src/app/[lang]/stocks/StocksTable.tsx` | Remove Links column + unused imports |
| Modify | `web/src/app/[lang]/investors/InvestorListClient.tsx` | Density, eyebrow, utility subtitle, filter labels/chrome, `displayFundName` |
| Modify | `web/src/app/[lang]/investors/[slug]/page.tsx` | `topAction` back link; `mt-5`→`mt-3` after headings; About ▸/▾ |
| Modify | `web/src/app/[lang]/stocks/[ticker]/page.tsx` | `mt-5`→`mt-3` after `SectionHeading` / holders meta only |
| Optional glossary | `web/src/lib/stocks/stockCopy.ts` | Only if Links header key becomes unused and should be dropped (YAGNI: leave glossary key if unused is fine) |

**Do not touch:** `DataTable` row `py-2.5`; macro/learn nested `py-8` wrappers; type system / Fraunces allowlist; theme tokens.

**Test note:** No unit suite for spacing/copy. Verify with `rg`, visual spot-check, and one `tsc` at the end.

---

### Task 1: Shared density primitives

**Files:**
- Modify: `web/src/components/shell/SubNav.tsx`
- Modify: `web/src/components/common/PageHeader.tsx`
- Modify: `web/src/components/entity/EntityPage.tsx`

- [ ] **Step 1: SubNav margin**

In `SubNav.tsx`, change the `<nav>` className from `... mb-8 overflow-x-auto` to `... mb-4 overflow-x-auto`.

- [ ] **Step 2: PageHeader padding**

In `PageHeader.tsx`, change `<header className="pb-6">` to `<header className="pb-4">`.

- [ ] **Step 3: EntityPage children stack**

In `EntityPage.tsx`, change:

```tsx
<div className="space-y-8 sm:space-y-10">{children}</div>
```

to:

```tsx
<div className="space-y-6 sm:space-y-7">{children}</div>
```

- [ ] **Step 4: Verify**

```bash
rg -n 'mb-8|pb-6|space-y-8 sm:space-y-10' web/src/components/shell/SubNav.tsx web/src/components/common/PageHeader.tsx web/src/components/entity/EntityPage.tsx
```

Expected: no matches on those old values in these three files.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/shell/SubNav.tsx web/src/components/common/PageHeader.tsx web/src/components/entity/EntityPage.tsx
git commit -m "$(cat <<'EOF'
fix(ui): tighten SubNav, PageHeader, and EntityPage spacing

Pull list/detail primary content higher in the first viewport.
EOF
)"
```

---

### Task 2: Stocks list + screener shell + source dedupe + Links column

**Files:**
- Modify: `web/src/app/[lang]/stocks/page.tsx`
- Modify: `web/src/app/[lang]/stocks/screener/page.tsx`
- Modify: `web/src/app/[lang]/stocks/StocksTable.tsx`

- [ ] **Step 1: Stocks index — drop nested wrapper**

In `stocks/page.tsx`, replace the outer:

```tsx
<div className="mx-auto max-w-5xl py-8 sm:py-10">
```

with a fragment or plain wrapper without nested max-width/py (AppShell already provides both), e.g.:

```tsx
<>
  <SubNav ... />
  <div className="mb-4">
    <PageHeader ... />
  </div>
  <StocksTable ... />
</>
```

Also change PageHeader wrapper `mb-8` → `mb-4`.

- [ ] **Step 2: Remove footer source duplicate**

Delete the trailing `<p className="mt-8 text-xs ...">` that repeats SEC 13F / 45-day lag. Keep `DataAsOfBadge` on `PageHeader`. Leave intro’s short source clause as-is.

- [ ] **Step 3: Screener — same shell trim**

In `screener/page.tsx`, remove nested `mx-auto max-w-5xl py-8 sm:py-10` the same way; change header wrapper `mb-8` → `mb-4`. Do not change screener filter chip behavior in this task beyond the wrapper (those chips are route toggles, not the investor activity filters).

- [ ] **Step 4: Remove Links column from StocksTable**

In `StocksTable.tsx`:
1. Delete the `links` column object from `columns`.
2. Remove unused imports: `ExternalFinanceLinks` (and `stockGlossary` `links` usage only — keep other glossary keys).
3. If `exchange` / `isTicker` are only used by Links, stop passing them from `stocks/page.tsx` and drop those fields from `StockRow` **only if** nothing else needs them. Prefer minimal: keep fields on the type if still populated, but unused fields should be removed from the row mapper to avoid dead props.

Minimal safe path: remove column + `ExternalFinanceLinks` import; leave `exchange`/`isTicker` on the row type for now if removing them touches too many lines — or clean them in the same commit if the mapper is local to `page.tsx` + `StocksTable.tsx` only (preferred).

- [ ] **Step 5: Verify**

```bash
rg -n 'py-8 sm:py-10|ExternalFinanceLinks|key: \"links\"' web/src/app/\[lang\]/stocks
```

Expected: no `py-8 sm:py-10` on index/screener; no Links column / table-variant ExternalFinanceLinks in `StocksTable.tsx`. Detail page may still import `ExternalFinanceLinks`.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/[lang]/stocks/page.tsx web/src/app/[lang]/stocks/screener/page.tsx web/src/app/[lang]/stocks/StocksTable.tsx
git commit -m "$(cat <<'EOF'
fix(ui): densify stocks list shell and drop Links column

Remove double padding/source footer noise; external exits stay on detail.
EOF
)"
```

---

### Task 3: Investors list — density, utility copy, filters, EDGAR names

**Files:**
- Modify: `web/src/app/[lang]/investors/InvestorListClient.tsx`

- [ ] **Step 1: Import `displayFundName`**

```tsx
import { displayFundName } from "@/lib/managers/profileProse";
```

- [ ] **Step 2: Update COPY**

Change:

```tsx
filterAll: "全部",  // zh
filterAll: "All",   // en
subtitle: "追踪顶级基金经理的..." // zh marketing
subtitle: "Track top fund managers'..." // en marketing
```

to utility scope lines and new filter labels, e.g.:

```tsx
// zh
eyebrow: "SEC 13F · 季度披露",
subtitle: "按组合市值排列 · 最新 13F 季",
filterAll: "全部动向",
// en
eyebrow: "SEC 13F · quarterly filings",
subtitle: "Ranked by portfolio value · latest 13F quarter",
filterAll: "Any move",
```

Keep `count(...)` helper; do not bake a live count into subtitle unless already trivial (static scope line is enough per spec).

- [ ] **Step 3: PageHeader + root spacing**

```tsx
<div className="space-y-4">
  <PageHeader eyebrow={t.eyebrow} title={t.heading} intro={t.subtitle} />
  ...
```

- [ ] **Step 4: Hairline filters (desktop) / 44px (mobile)**

Replace bordered filter/sort button classes so desktop is text/hairline and mobile keeps touch target, e.g.:

```tsx
className={[
  "max-sm:min-h-[44px] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors",
  "max-sm:border sm:border-0 sm:border-b",
  vf === k
    ? "text-[var(--tt-accent)] max-sm:border-[var(--tt-accent)] max-sm:bg-[var(--tt-accent)]/10 sm:border-[var(--tt-accent)]"
    : "text-[var(--tt-muted)] max-sm:border-[var(--tt-border)] hover:text-[var(--tt-text)] sm:border-transparent hover:sm:border-[var(--tt-border)]",
].join(" ")}
```

Apply the same pattern to sort buttons (active = accent underline / text; no filled box wall on `sm+`).

- [ ] **Step 5: Firm name title-case**

In the investor primary cell, change `{m.name}` to `{displayFundName(m.name)}`.

- [ ] **Step 6: Verify**

```bash
rg -n 'space-y-8|filterAll: \"All\"|Track top fund managers|BERKSHIRE|min-h-\[44px\] px-3.*border transition' web/src/app/\[lang\]/investors/InvestorListClient.tsx
```

Expected: `space-y-4`; `Any move` / `全部动向`; no marketing subtitle; `displayFundName` used; no desktop-only full boxed `min-h-[44px]` without `max-sm:`.

- [ ] **Step 7: Commit**

```bash
git add web/src/app/[lang]/investors/InvestorListClient.tsx
git commit -m "$(cat <<'EOF'
fix(ui): densify investors list with utility chrome

Eyebrow + scope intro, hairline filters, title-cased firm names.
EOF
)"
```

---

### Task 4: Detail pages — back link, section offsets, About chevron

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

- [ ] **Step 1: Investor topAction**

On `EntityPage`, add (mirror stock detail):

```tsx
topAction={
  <Link
    href={localePath(lang, "/investors")}
    className="inline-block text-xs text-[var(--tt-faint)] no-underline transition-colors hover:text-[var(--tt-text)]"
  >
    {lang === "zh" ? "← 超级投资者" : "← Superinvestors"}
  </Link>
}
```

Ensure `localePath` is already imported (it is via urls import — add if missing).

- [ ] **Step 2: Investor section `mt-5` → `mt-3`**

In `[slug]/page.tsx`, change local offsets after headings / lead paragraphs that are `mt-5` to `mt-3` (HoldingsTable wrapper, posture/lonely leads). Do not strip unrelated `mt-2` / `mt-6` on About details unless adjusting chevron in Step 4.

- [ ] **Step 3: Stock detail section `mt-5` → `mt-3`**

In `[ticker]/page.tsx`, same treatment for holders meta row, BQ grid, valuation card wrapper, coOwned lead — the `mt-5` that follows `SectionHeading`.

- [ ] **Step 4: About ▸/▾ toggle**

Replace the always-▸ summary with a FoldedSection-like open/closed pair, e.g.:

```tsx
<details className="group mt-6">
  <summary className="cursor-pointer list-none text-lg font-medium tracking-tight text-[var(--tt-text)] [&::-webkit-details-marker]:hidden">
    <span className="group-open:hidden">{lang === "zh" ? "关于这位投资者 ▸" : "About this investor ▸"}</span>
    <span className="hidden group-open:inline">{lang === "zh" ? "关于这位投资者 ▾" : "About this investor ▾"}</span>
  </summary>
  ...
</details>
```

- [ ] **Step 5: Verify**

```bash
rg -n 'topAction|← 超级投资者|← Superinvestors|mt-5|About this investor ▸' web/src/app/\[lang\]/investors/\[slug\]/page.tsx web/src/app/\[lang\]/stocks/\[ticker\]/page.tsx
```

Expected: investor `topAction` present; remaining `mt-5` only if intentionally kept (prefer none after headings); About has both ▸ and ▾ spans.

- [ ] **Step 6: Commit**

```bash
git add web/src/app/[lang]/investors/[slug]/page.tsx web/src/app/[lang]/stocks/[ticker]/page.tsx
git commit -m "$(cat <<'EOF'
fix(ui): investor back link and tighter detail section gaps

Align detail exits with stocks and reduce post-heading air.
EOF
)"
```

---

### Task 5: Final verification + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-07-11-stocks-investors-ux-density-design.md` (status → Implemented)

- [ ] **Step 1: Typecheck**

```bash
cd web && npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2: Regression rg**

```bash
rg -n 'py-8 sm:py-10' web/src/app/\[lang\]/stocks/page.tsx web/src/app/\[lang\]/stocks/screener/page.tsx
rg -n 'key: \"links\"|ExternalFinanceLinks' web/src/app/\[lang\]/stocks/StocksTable.tsx
rg -n 'filterAll: \"All\"|Track top fund managers|space-y-8' web/src/app/\[lang\]/investors/InvestorListClient.tsx
rg -n 'topAction' web/src/app/\[lang\]/investors/\[slug\]/page.tsx
```

Expected: stocks wrappers clean; no Links in table; investors utility copy + no root `space-y-8`; investor detail has `topAction`.

- [ ] **Step 3: Visual spot-check**

With `npm run dev`: `/en/investors`, `/en/stocks`, `/en/investors/warren-buffett`, one stock detail. Confirm table enters first viewport; back link works; no Links column; firm names not ALL-CAPS.

- [ ] **Step 4: Mark spec implemented**

Set spec status from `Approved for planning` to `Implemented`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-11-stocks-investors-ux-density-design.md
git commit -m "$(cat <<'EOF'
docs: mark stocks/investors UX density polish implemented
EOF
)"
```

---

## Execution handoff

After this plan is approved for execution:

1. **Subagent-Driven (recommended)** — fresh subagent per task + review between tasks  
2. **Inline Execution** — execute in this session with checkpoints  

Which approach?
