# Homepage Value-Prop Tagline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single restrained value-prop tagline (as the page `<h1>`) to the top of the homepage so first-time visitors immediately grasp what the site is.

**Architecture:** One new `<h1>` element inserted at the top of the homepage server component, above the existing dateline `<p>`. Bilingual via the existing inline `isZh ? … : …` ternary. No new component, no new dependency, no data read. The dateline gets a small top margin so it sits naturally under the tagline.

**Tech Stack:** Next.js 16 App Router (RSC), Tailwind CSS with project `--tt-*` design tokens.

**Spec:** `docs/superpowers/specs/2026-06-07-homepage-tagline-design.md`

**Project rule:** This project has **no test suite**. Verification is `tsc` + manual browser check only — do NOT add test files.

---

## Important context for the implementer

- **Shared working directory:** A concurrent session is actively working in this same checkout on branch `feat/seo-geo-round2`. Do NOT `git checkout` a branch in the main working tree — that yanks the tree out from under the other session. Use an **isolated git worktree** off `db-foundation` (Task 1).
- **Node version gotcha:** The default shell `node` is v10.18.0 and breaks tsc/Next. Every `tsc`/`next`/`npm` command must run with v20 first on PATH: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`.
- **Dev server gotcha:** The Claude Preview tool's spawned dev server crashes (it resolves v10 for Turbopack's PostCSS worker). Run the dev server directly under v20 instead (Task 3 shows the exact command).
- **Concurrent edits to this file:** `web/src/app/[lang]/page.tsx` was recently edited by the other session (added `@graph` JSON-LD, the padding fix). Work off the latest `db-foundation` and insert relative to the current dateline block, not by hard line number.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `web/src/app/[lang]/page.tsx` | Homepage server component | Insert `<h1>` tagline above the dateline `<p>`; add top margin to the dateline `<p>` |

Single file, one insertion + one className tweak. No decomposition needed.

---

### Task 1: Create an isolated worktree off db-foundation

**Files:** none (git setup only)

- [ ] **Step 1: Make sure local db-foundation is current**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git fetch origin
git branch -f db-foundation origin/db-foundation   # safe: we are NOT on db-foundation
```
Expected: local `db-foundation` now points at `origin/db-foundation` (the SEO work merged via PR #13/#14).

- [ ] **Step 2: Create a worktree + feature branch off db-foundation**

```bash
git worktree add -b feat/homepage-tagline .claude/worktrees/homepage-tagline db-foundation
```
Expected: `Preparing worktree (new branch 'feat/homepage-tagline')` and a checkout at `.claude/worktrees/homepage-tagline`. The main working tree (feat/seo-geo-round2) is untouched.

- [ ] **Step 3: Confirm the worktree has the latest file**

```bash
grep -n 'pb-10 pt-1' .claude/worktrees/homepage-tagline/web/src/app/\[lang\]/page.tsx
```
Expected: a match on the container div (`mx-auto max-w-5xl px-2 pb-10 pt-1 sm:pb-12 sm:pt-2`), confirming the merged padding fix is present. All remaining tasks edit files under `.claude/worktrees/homepage-tagline/`.

---

### Task 2: Insert the tagline `<h1>` and adjust dateline spacing

**Files:**
- Modify: `.claude/worktrees/homepage-tagline/web/src/app/[lang]/page.tsx` (the `return (...)` block, right after the `<script ... ld+json ...>` line and before the dateline `<p>`)

- [ ] **Step 1: Insert the `<h1>` tagline before the dateline**

Find this block:
```tsx
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      {/* Dateline (replaces hero) — subtle, low-profile */}
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-[0.04em] text-[var(--tt-faint)]">
```

Replace it with (adds the `<h1>` and prepends `mt-2.5 … sm:mt-3` to the dateline `<p>`):
```tsx
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />

      {/* Value-prop tagline — site positioning; doubles as the page h1 */}
      <h1 className="font-display text-lg font-medium leading-snug tracking-tight text-[var(--tt-text)] sm:text-xl">
        {isZh ? "与最有耐心的投资者同行" : "Walk with the most patient investors"}
        <span className="text-[var(--tt-muted)]">
          {isZh ? " — 追踪 13F 持仓，理解复利。" : " — track 13F holdings, understand compounding."}
        </span>
      </h1>

      {/* Dateline (replaces hero) — subtle, low-profile */}
      <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] tracking-[0.04em] text-[var(--tt-faint)] sm:mt-3">
```

Note: the Chinese comma in the tagline is the full-width `，` (matches the rest of the file's Chinese copy).

- [ ] **Step 2: Type-check**

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd .claude/worktrees/homepage-tagline/web
npx tsc -p tsconfig.json --noEmit
```
Expected: exit code 0, no output. (If you see `Unexpected token ?`/`.`, the shell is using node v10 — re-run the `export PATH` line.)

---

### Task 3: Manual visual verification

**Files:** none (verification only)

- [ ] **Step 1: Start a v20 dev server against the worktree**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/homepage-tagline/web
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
node node_modules/next/dist/bin/next dev -p 3001 > /tmp/tagline-dev.log 2>&1 &
sleep 10
curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 12 http://localhost:3001/zh
```
Expected: `HTTP 200`. Port 3001 avoids colliding with the concurrent session's servers. (Worktree has its own `node_modules`? If not, run `npm install` first with v20 on PATH — but a fresh worktree shares the repo's tracked files only, so run `npm --prefix . install` if `node_modules` is missing.)

- [ ] **Step 2: Eyeball both languages in the connected Chrome**

Navigate the Chrome tab to `http://localhost:3001/zh` then `http://localhost:3001/en`, screenshot each. Confirm:
- Tagline is the first line of the page content, medium weight (display serif, larger than body, smaller than the「本季显著动向」/「Notable moves」h2).
- First clause in primary text color, the em-dash clause in muted.
- Dateline sits just under it with natural spacing; the「本季显著动向」section is not visually crowded.
- No wrap/overflow glitch at mobile width (resize narrow), and both dark/light themes look right.

- [ ] **Step 3: Confirm exactly one `<h1>`**

In the Chrome tab console (or via eval): `document.querySelectorAll('h1').length`
Expected: `1`. Also confirm its text is the tagline.

- [ ] **Step 4: Stop the dev server**

```bash
pkill -f "next dev -p 3001" || true
```

---

### Task 4: Commit and hand off PR

**Files:** none (git only)

- [ ] **Step 1: Commit the change**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/homepage-tagline
git add web/src/app/\[lang\]/page.tsx docs/superpowers/specs/2026-06-07-homepage-tagline-design.md docs/superpowers/plans/2026-06-07-homepage-tagline.md
git commit -m "$(cat <<'EOF'
feat(home): add value-prop tagline as page h1

Adds a single restrained compounding-philosophy tagline at the top of the
homepage, doubling as the previously-missing <h1>. Bilingual, no new deps.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```
Expected: one commit on `feat/homepage-tagline`.

- [ ] **Step 2: Push and surface the PR link**

```bash
git push -u origin feat/homepage-tagline
```
Expected: push succeeds; GitHub prints a "Create a pull request" URL (base `db-foundation`). Per the user's standing preference, **do not open the PR** — surface the compare/PR link for the user to open (different GitHub account).

- [ ] **Step 3: Clean up the worktree (after the user confirms the PR is up)**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git worktree remove .claude/worktrees/homepage-tagline
```
Expected: worktree removed; the branch remains on origin for the PR.

---

## Self-Review

**1. Spec coverage:**
- Tagline as first line, `<h1>`, medium display weight → Task 2 Step 1. ✓
- Copy 1 zh/en with muted second clause → Task 2 Step 1. ✓
- Dateline top margin, other blocks unchanged → Task 2 Step 1. ✓
- Single file change → File Structure + Task 2. ✓
- Coordination with concurrent session (worktree off latest db-foundation) → Task 1. ✓
- Verification: tsc, /zh + /en, dark/light, mobile, single h1 → Tasks 2–3. ✓
- No tests added → honored (verification is tsc + manual). ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/vague steps. Every code step shows exact code. One conditional note (run `npm install` if `node_modules` missing in the worktree) is explicit, not a placeholder.

**3. Type consistency:** Only JSX/string literals and Tailwind classNames change; no new types, signatures, or identifiers introduced. `isZh` already exists in scope.
