# Copy Voice Rubric + De-AI Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish an in-repo copy voice rubric and sweep the whole site once against it, fixing the real AI-flavored lines while protecting the site's earned voice.

**Architecture:** A full rubric lives in `web/docs/copy-voice.md`; the rule layer (`web/AGENTS.md`) carries only a one-line pointer to it so future sessions apply it without per-turn context bloat. A one-time sweep produces a findings table the user approves line-by-line; approved rewrites are applied and gated on tsc/eslint. All work rides branch `fix/copy-voice-de-ai` (off latest `db-foundation`) in an isolated worktree.

> **Note (2026-07-11):** The earlier SEO fixes — A (homepage canonical/hreflang), B (ogFor default OG image), macro meta description de-AI — were already merged to `db-foundation` via PR #151. This plan's remaining scope is ONLY the rubric + the copy sweep (homepage H1 staccato, FoundationsGrid antithesis, macro on-page "drill into", plus whatever the sweep surfaces). None of those were in #151.

**Tech Stack:** Markdown (rubric + docs), Next.js 16 TSX metadata/components (copy strings), TypeScript (`tsc --noEmit`), ESLint.

## Global Constraints

- Reply/plan bodies and copy discussion in Chinese; code/paths/terms excepted.
- Bar is **scalpel**: kill only hollow/generic AI register; protect specific, opinionated ("earned") rhetoric. `learn` articles are the north star.
- Judge `en` and `zh` copy **independently** (not word-for-word translations).
- Do NOT touch data-templated factual strings (FAQ / Dataset / aggregate blurbs) that are already concrete.
- No copy rewrite is applied until the user approves it in the Task 3 findings table.
- All work in isolated worktree `.claude/worktrees/copy-voice` on branch `fix/copy-voice-de-ai`; never touch the shared working tree (peer on `feat/stock-page-hierarchy`).
- Verification per task uses what actually verifies it (doc formed / `tsc`=0 / `eslint`=0 / user approval) — no fabricated unit tests for prose.
- Commit/push only the branch; do NOT merge (user opens/merges the PR).

---

### Task 1: Rubric doc `web/docs/copy-voice.md`

**Files:**
- Create: `web/docs/copy-voice.md`

**Interfaces:**
- Produces: the canonical rubric that Task 2 (AGENTS pointer, memory) references and Task 3 (sweep) applies.

- [ ] **Step 1: Create the rubric doc with the full content below**

```markdown
# Copy Voice — thecompounder.fyi

站上所有面向用户的文案守一个声音:**具体、有主张、数据先行**;不掉进泛化的
AI / 营销腔。本文件是权威准则,新文案落地前对照它自检。中英各按各自语感判,
不逐字互译。

## 核心判据:挣来 vs 空洞

一个修辞手法**留还是杀**,只看一条:

- **挣来的(留)**:具体、带真主张,换别的产品说不出来。
  - ✅ "Treat a 13F as a lead, not an answer."
- **空洞的(杀)**:泛化、装饰,任何产品/发布会都能照搬。
  - ❌ "N investors. One quarter. Every position they just reported."

判不准时问一句:**这句话只有"我们"能对"我们的数据"说,还是谁都能说?**
只有我们能说 → 留;谁都能说 → 重写。

## 禁用清单(反例 → 正例)

1. **断句三连**(X. Y. Z. 短促碎句,广告旁白腔)
   - ❌ "N investors. One quarter. Every position they just reported."
   - ✅ "Every position N investors reported to the SEC last quarter."

2. **空洞对偶**("只 X 不 Y" / "not X, but Y",泛化时)
   - ❌ "We don't chase hype — we build conviction."
   - ✅ 有主张、具体时可留:"Read their holdings, not their tweets."

3. **三元装饰枚举**(为凑排比堆三项)
   - ❌ "clear, fast, and reliable Treasury signals"
   - ✅ 三项是真类别时直接点名:"funding, supply, and policy indicators"

4. **对冲词**(arguably / in many ways / helps to / can be seen as)
   - ❌ "arguably one of the most useful signals to watch"
   - ✅ "the most useful number on the page is position size."

5. **SaaS / 宣传腔动词形容词**(full-spectrum / drill into / unlock /
   seamless / powerful / empower / leverage / robust)
   - ❌ "A full-spectrum view — drill into funding and supply."
   - ✅ "Funding, supply, and policy indicators for the Treasury market."

6. **破折号抒情**(em-dash 用来煽情而非澄清)
   - ❌ "value investing — the long, patient art of waiting — rewards discipline"
   - ✅ em-dash 只用于插入/澄清:"a 13F can lag the real portfolio — up to 45 days —"

7. **装饰图标堆**(每个标题挂 emoji/图标凑"设计感")
   - ❌ 每个小节标题前一个 lucide 图标 + emoji
   - ✅ 让真数据、数字当主角,图标只在有功能意义时用

## 北极星(这就是我们的声音,取自站上真句)

- "Treat a 13F as a lead, not an answer."
- "A stock twenty funds own is not therefore cheap. It might be expensive precisely because it's popular."
- "UnitedHealth is the one worth slowing down on."
- "We pull it into one place and make it readable, so the thinking is left to you."

## 发布前 checklist(6 条 yes/no)

1. 这句话只有我们能对我们的数据说吗?(谁都能说 → 重写)
2. 里面有具体名词/数字,而不是只有形容词吗?
3. 它给出真主张,还是在对冲?
4. 念出声:像人说话,还是像发布会旁白?
5. em-dash 在澄清,而不是煽情?
6. 中、英是否各按本语感判过(不是逐字互译)?
```

- [ ] **Step 2: Verify the doc is well-formed Markdown**

Run: `cd web && npx --yes markdownlint-cli docs/copy-voice.md 2>/dev/null || echo "no markdownlint — visual check only"`
Expected: no hard errors (or the fallback line; markdownlint is optional — a clean visual scan of headings/lists is sufficient).

- [ ] **Step 3: Commit**

```bash
git add web/docs/copy-voice.md
git commit -m "docs(copy): 新增 copy-voice rubric — 去 AI 味文案准则(单一真相源)"
```

---

### Task 2: Rule-layer wiring — AGENTS pointer + memory update

**Files:**
- Modify: `web/AGENTS.md` (append a copy-voice pointer)
- Modify: `~/.claude/projects/-Users-junlinzhu-Desktop-yangyang-code-ny-fed-monitor/memory/anti-ai-product-sense.md` (point at the rubric)

**Interfaces:**
- Consumes: `web/docs/copy-voice.md` from Task 1.

- [ ] **Step 1: Append the pointer to `web/AGENTS.md`**

Append these lines to the end of `web/AGENTS.md` (keep it to a short pointer — the full rubric stays in the doc to avoid per-session context bloat):

```markdown

# User-facing copy

All user-facing copy (page titles/descriptions, hero and section copy, OG cards,
share text) follows `docs/copy-voice.md`: concrete, opinionated, data-first — no
generic AI/marketing register (staccato triads, hollow antithesis, SaaS filler).
Judge en and zh independently.
```

- [ ] **Step 2: Update the `anti-ai-product-sense` memory to point at the rubric**

In the memory file, add a line noting the canonical rubric now lives in-repo at `web/docs/copy-voice.md` (single source of truth); the memory stays as the "why + pointer." Exact edit: append to the memory body:

```markdown

**权威 rubric 已入仓**:去 AI 味文案准则现落在 `web/docs/copy-voice.md`(单一真相源,
含核心判据「挣来 vs 空洞」+ 7 条禁用清单 + 北极星 + checklist);`web/AGENTS.md` 有一行
指针。本记忆退为"为什么"层。刀法=手术刀,护住 learn/about 好声音。
```

- [ ] **Step 3: Verify AGENTS.md still parses (it is `@`-included by web/CLAUDE.md)**

Run: `tail -8 web/AGENTS.md`
Expected: the new "# User-facing copy" section is present and well-formed.

- [ ] **Step 4: Commit (repo file only; memory is outside the repo)**

```bash
git add web/AGENTS.md
git commit -m "docs(copy): AGENTS 指向 copy-voice rubric(规则层薄指针)"
```

---

### Task 3: Full-site sweep → findings table (no code change)

**Files:**
- Read-only sweep across: meta (`src/app/[lang]/**/page.tsx` generateMetadata), homepage components (`src/components/home/*`), `src/lib/aggregate/blurb.ts`, `src/lib/learn.ts`, `src/lib/about.ts`, macro `src/app/[lang]/macro/page.tsx` + `macro/methodology/page.tsx`, FAQ/Dataset in `src/app/[lang]/stocks/[ticker]/page.tsx`, share text `src/lib/share/*`, valuation/screener copy.

**Interfaces:**
- Consumes: rubric from Task 1.
- Produces: an approved findings list (surface, file:line, original, verdict, rewrite) that Task 4 applies.

- [ ] **Step 1: Grep every user-facing string surface and judge each against the rubric**

Sweep each surface; for every candidate line assign a verdict: `kill` (clear AI tell), `borderline` (defensible but flag), or silent `keep`. Data-templated factual strings (FAQ/Dataset/blurb) are keep-by-default per Global Constraints.

- [ ] **Step 2: Present the findings table to the user**

Format: `surface | file:line | 原文 | 判定 | 建议改写`. List only `kill`/`borderline`. Seed with the three known findings (confirm/expand during the sweep):

| surface | file | 原文 | 判定 | 建议改写 |
|---|---|---|---|---|
| Home H1 (en) | `src/components/home/HeroMasthead.tsx:27` | "${n} investors. One quarter. Every position they just reported." | kill | "Every position ${n} investors reported to the SEC last quarter." |
| FoundationsGrid (en+zh) | `src/components/home/FoundationsGrid.tsx:21,10` | "paying only for earnings power and assets already proven, never for a story or a forecast" | borderline | 软化二选一由用户定,或保留 |
| Macro intro (en+zh) | `src/app/[lang]/macro/page.tsx:196,195` | "…then drill into funding, supply, policy, and macro pricing." | minor | 去 "drill into":"…then open funding, supply, policy, and macro pricing." |

- [ ] **Step 3: Get line-by-line approval**

User approves / edits / rejects each row. Record the final approved rewrite text per row. No code changes happen in this task.

---

### Task 4: Apply approved rewrites

**Files:**
- Modify: only the files whose rows the user approved in Task 3 (e.g. `src/components/home/HeroMasthead.tsx`, `src/components/home/FoundationsGrid.tsx`, `src/app/[lang]/macro/page.tsx`).

**Interfaces:**
- Consumes: approved rewrite text from Task 3.

- [ ] **Step 1: Apply each approved rewrite as an exact-string Edit**

For the home H1 (if approved), replace the en headline string in `HeroMasthead.tsx` COPY.en.headline. Example (adjust to the user's final wording):

```tsx
// before
headline: (n: number) => `${n} investors. One quarter. Every position they just reported.`,
// after
headline: (n: number) => `Every position ${n} investors reported to the SEC last quarter.`,
```

Apply the other approved rows the same way (exact old→new string per file:line). Skip any row the user rejected.

- [ ] **Step 2: tsc**

Run: `cd web && ./node_modules/.bin/tsc --noEmit; echo "TSC=$?"`
Expected: `TSC=0`

- [ ] **Step 3: eslint on touched files**

Run: `cd web && ./node_modules/.bin/eslint <each modified file>; echo "ESLINT=$?"`
Expected: `ESLINT=0`

- [ ] **Step 4: Commit**

```bash
git add web/src/...   # only the files actually edited
git commit -m "chore(copy): 全站去 AI 味扫描 — 应用批准的改写(手术刀)"
```

---

### Task 5: Push + report

**Files:** none (git + reporting).

- [ ] **Step 1: Push the branch**

Run: `git push -u origin fix/copy-voice-de-ai`
Expected: new branch pushed (carries spec + plan + rubric + AGENTS pointer + approved copy rewrites).

- [ ] **Step 2: Remove the worktree, verify peer tree intact**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
rm -f .claude/worktrees/copy-voice/web/node_modules
git worktree remove .claude/worktrees/copy-voice --force
git branch --show-current   # expect: feat/stock-page-hierarchy (peer), untouched
```

- [ ] **Step 3: Report to user with PR compare URL**

Report: A/B/macro already merged (PR #151). Branch `fix/copy-voice-de-ai` carries the copy-voice rubric + AGENTS pointer + approved copy rewrites (+ spec/plan docs). PR compare URL: `https://github.com/xjing-umich/ny-fed-monitor/compare/db-foundation...fix/copy-voice-de-ai?expand=1`. Note runtime copy verification happens on the Vercel preview after merge.

---

## Self-Review

**Spec coverage:**
- Rubric doc (spec §Deliverables.1) → Task 1 ✓
- Rule-layer wiring: AGENTS pointer + memory (spec §Deliverables.2) → Task 2 ✓
- Full-site sweep + findings table + approval flow (spec §Deliverables.3) → Task 3 + 4 ✓
- Lands on `fix/home-canonical-hreflang`, isolated worktree, peer untouched (spec §Where it lands) → Task 5 + Global Constraints ✓
- Verification tsc/eslint=0, preview for runtime (spec §Verification) → Task 4 steps 2–3, Task 5 step 3 ✓
- Non-goals (don't touch data-templated strings; scalpel) → Global Constraints ✓

**Placeholder scan:** Task 4 rewrite text is intentionally gated on Task 3 approval — the three known rewrites are concrete; additional rows are applied by the same exact-string-Edit pattern. This is a genuine approval dependency, not a placeholder. No TBD/TODO elsewhere.

**Type consistency:** No new types/functions introduced. Copy edits are string-literal replacements inside existing `COPY` objects and metadata literals; signatures unchanged (`headline: (n: number) => string` preserved).

---

## Execution Addendum (2026-07-11, post-run)

Task 1's embedded rubric draft (above) shows the pre-ruling verdict on the
homepage H1 — banning "N investors. One quarter. Every position they just
reported." as a staccato KILL. That verdict was **overturned by user ruling**
during Task 3: the H1 is KEPT (data-first = good editorial voice, not an AI
tell). The shipped rubric (`web/docs/copy-voice.md`) was recalibrated: the
banned tell is **hollow** staccato (every fragment generic), not staccato per
se; the H1 now appears as the ✅ example. Final sweep touched only one body
string (macro "drill into" → "move to"); FoundationsGrid antithesis kept as
brand voice. Final whole-branch review: Ready to merge.
