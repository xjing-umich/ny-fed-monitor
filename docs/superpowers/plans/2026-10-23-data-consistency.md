# 数据一致性（首期 UX 第 2 步）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：** 全站“多少位投资人”、估值位置的说法、本季动作，在每个页面上都是同一个值、同一种说法。

**Architecture：** 每类口径收进一个纯函数（`derive.ts` 的应申报判定、`valuationLabel`、`quarterMovesText`、`filingSeasonNote`），页面只调用它们，不再各写一套判断。分两个 PR 交付：PR A 是口径与文案（任务 1–5），PR B 是估值说法和持有人表（任务 6–13）。

**Tech Stack：** Next.js 16 App Router（RSC，零 hydration）、TypeScript、Supabase（只读，不新增查询）、`*.check.ts` 自检脚本（`npx tsx <file>`，用 `node:assert` 或文件内的 `assert/check` 小工具）。

**Spec：** `docs/superpowers/specs/2026-10-23-data-consistency-design.md`

## 开工前

- **PR A** 在 PR #218（`fix/filing-deadline-weekend-and-held-pagination`）合并之后，从最新的 `db-foundation` 开分支 `fix/data-consistency-counts`。#218 改过 `derive.ts`、`HeroMasthead.tsx`、`llms.ts`，任务 1、2 都建立在它之上。
- **PR B** 在 PR A 合并之后，从最新的 `db-foundation` 开分支 `fix/data-consistency-labels`。任务 13 要用任务 1 的 `coverage`。
- 命令都在 `web/` 下运行。本机 git 要用 shim：`export PATH=/private/tmp/claude-501/-Users-junlinzhu-Desktop-TheCompounder/a7c1da3e-a981-4649-8f27-6ea4dc306a59/scratchpad/gitshim:/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH`。推送走 HTTPS：`git push https://github.com/xjing-umich/ny-fed-monitor.git <branch>`。
- 下面的行号以 `db-foundation @ fbdc5e7`（已含 #217、#219、#220）为准；开工时以实际文件为准，按代码片段定位。
- 已知 3 个 `.check.ts` 在 base 上本来就失败，和本计划无关：`scripts/aggregations.check.ts`、`scripts/resolve.check.ts`（缺 `server-only`），`src/lib/valuation/ownerEarningsDcf.check.ts`（`anchored` 断言）。

## Global Constraints

- 不新增 Supabase 查询：M、N、“少的是谁”从已加载的投资人索引算；`valuationLabel` 只用已加载的估值结果。唯一例外是任务 9 给 `readStrikeZoneLeaders` 的映射补上 `price` 字段：这一列本来就在 select 里，不是新查询。
- 不改估值引擎和判定规则（`deriveValuationVerdict.ts`、`strikeZone.ts`）。
- URL、SEO 结构、SSR、埋点事件名不变。
- 中英文对等，各自核对 `docs/copy-voice.md`；合规只说位置和计数，不出现买入、卖出、持有建议，也不出现目标价或评级。
- 默认零 hydration：本计划不新增客户端组件。
- `PUBLISH_MIN_COVERAGE = 0.25`、`READY_COVERAGE = 0.9` 两个比例不变，只换分母。
- 已定稿的 Q2 报告行（`quarterly_reports` 里 `period = 2026-06-30`）不重算、不改。

## 关于 spec 的一处措辞修正

spec 第 2 节把便宜档写作“低于价值带”。读代码后确认，`bucket === "below"` 的实际含义是“价格低于内在价值中枢”（`deriveValuationVerdict.ts`：`bucket = price < IV ? "below" : …`），并不是“低于价值带下沿”。所以档名统一改成“低于内在价值”，这和 spec 第 2 节“不再说低于保守价值带”的方向一致。五档的最终说法：

| tier | 中文 | English |
|---|---|---|
| strike | 击球区 | Strike zone |
| below | 低于内在价值 | Below intrinsic value |
| within | 价值带内 | Within band |
| above | 高于价值带 | Above band |
| unassessed | 未评估 | Not assessed |

待确认的修饰：中文“待确认”，英文“pending”。

## Review Focus

1. **截止日当天和次日。** Q3 在 2026-11-16（顺延后的截止日）当天，进度行仍显示“申报进行中”，11/17 才切季。任务 1 的测试要钉住这三天。
2. **名单里有人没有任何申报（`period` 为 null）。** 这样的人应计入“少的人”，不能让 `excluded` 变成负数或 NaN。任务 1 加测试。
3. **只有待确认、没有已确认的便宜持仓。** 投资人页的估值小节和页底引导句仍要出现，并写“没有已确认的击球区持仓，另有 k 只待确认”。任务 8 加测试。
4. **清仓人数超过 3 位，或者为 0。** 动作行折叠成“另 k 位”；清仓为 0 时不出现括号。任务 10 加测试。
5. **`marginPct` 接近或大于 1，或者为 null。** 内在价值列显示“—”，不出现无穷大或负数。任务 9 加测试。

---

# PR A：口径与文案（分支 `fix/data-consistency-counts`）

### Task 1：应申报名单 M 与切季覆盖率

**Files:**
- Modify: `src/lib/freshness/derive.ts`（`EffectiveMovesPeriod` 类型、`effectiveMovesPeriod`，新增 `isExpectedFiler`）
- Test: `src/lib/freshness/derive.check.ts`

**Interfaces:**
- Produces:
  - `export function isExpectedFiler(latestPeriod: string | null | undefined, period: string): boolean`：最新申报期 ≥ `priorQuarterEnd(period)` 才算应申报。
  - `EffectiveMovesPeriod.coverage` 改为 `{ filed: number; total: number; excluded: number }`。`total` = M，`excluded` = 名单人数 − M。

- [ ] **Step 1: 写失败测试**

在 `derive.check.ts` 顶部 import 里加 `isExpectedFiler`，然后在 `// --- isScopeChange` 之前插入：

```ts
// --- 应申报名单 M:最新申报期 ≥ 该季上一季;停在更早季度或从未申报的人不计入分母 ---
assert.equal(isExpectedFiler("2026-06-30", "2026-09-30"), true, "交了 Q2 → Q3 应申报");
assert.equal(isExpectedFiler("2026-09-30", "2026-09-30"), true, "已交 Q3 → 应申报");
assert.equal(isExpectedFiler("2026-03-31", "2026-09-30"), false, "停在 Q1(Bancroft)→ Q3 不计入分母");
assert.equal(isExpectedFiler("2025-09-30", "2026-09-30"), false, "停报一年(Burry)→ 不计入");
assert.equal(isExpectedFiler(null, "2026-09-30"), false, "从未申报 → 不计入");
assert.equal(isExpectedFiler("2026-03-31", "2026-06-30"), true, "Q2 报告:交了 Q1 → 应申报");
{
  // 2026-10-23 线上形态:2 位已交 Q3、92 位停在 Q2、Bancroft 停在 Q1、Bares/Burry 停在 2025Q3
  const periods = [
    ...Array(2).fill("2026-09-30"),
    ...Array(92).fill("2026-06-30"),
    "2026-03-31",
    "2025-09-30",
    "2025-09-30",
  ];
  const r = effectiveMovesPeriod(periods, d("2026-10-23"));
  assert.equal(r.coverage.filed, 2, "已交 Q3 = 2");
  assert.equal(r.coverage.total, 94, "分母 M = 94(不是 97)");
  assert.equal(r.coverage.excluded, 3, "上季未申报 3 位");
}
{
  // 名单里有人没有任何申报:计入 excluded,不出现负数
  const r = effectiveMovesPeriod(["2026-09-30", "2026-06-30", null, undefined], d("2026-10-23"));
  assert.equal(r.coverage.total, 2);
  assert.equal(r.coverage.excluded, 2, "null/undefined 期也算上季未申报");
}
{
  // 切季门槛按 M 算:50 位应申报中 26 位已交 → ≥50%,即使名单 97 人
  const periods = [
    ...Array(26).fill("2026-09-30"),
    ...Array(24).fill("2026-06-30"),
    ...Array(47).fill("2025-12-31"),
  ];
  const r = effectiveMovesPeriod(periods, d("2026-11-17"));
  assert.equal(r.coverage.total, 50);
  assert.equal(r.reason, "due_and_covered", "26/50 ≥ 50% → 切到 Q3");
}
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/freshness/derive.check.ts`
Expected: 失败，报 `isExpectedFiler is not a function`（或 import 报错）。

- [ ] **Step 3: 实现**

在 `derive.ts` 中，`priorQuarterEnd` 之后加：

```ts
/**
 * 进行中季度 period 的「应申报」判定:最新申报期 ≥ period 的上一季,即进入申报季前的「计入」口径。
 * 申报进度 n/M、切季覆盖率、季度报告的覆盖率与门槛都用这个分母(spec 2026-10-23 §三.1)。
 * 停在更早季度或从未申报的人不在分母里,页面旁边写明人数与原因。
 */
export function isExpectedFiler(latestPeriod: string | null | undefined, period: string): boolean {
  const prior = priorQuarterEnd(period);
  if (!prior || !latestPeriod || !parseUTC(latestPeriod)) return false;
  return latestPeriod >= prior;
}
```

把 `EffectiveMovesPeriod` 的 `coverage` 改成：

```ts
  /** total = 应申报 M(isExpectedFiler);excluded = 名单人数 − M(上季未申报或从未申报)。 */
  coverage: { filed: number; total: number; excluded: number };
```

`effectiveMovesPeriod` 函数体中，空数据分支和覆盖率计算改为：

```ts
  const valid = periods.filter((p): p is string => !!p && !!parseUTC(p));
  const maxPeriod = globalLatestPeriod(valid);
  if (!maxPeriod || valid.length === 0) {
    return { period: null, reason: "empty", maxPeriod: null, coverage: { filed: 0, total: 0, excluded: periods.length } };
  }
  const expected = valid.filter((p) => isExpectedFiler(p, maxPeriod));
  const total = expected.length;
  const filed = expected.filter((p) => p === maxPeriod).length;
  const coverage = { filed, total, excluded: periods.length - total };
```

函数后半段已有的 `filed / total < MOVES_COVERAGE_MIN` 不用改（`total` 现在就是 M）。同时把函数上方注释里的 “coverage of maxPeriod among tracked periods” 改成 “coverage of maxPeriod among expected filers (isExpectedFiler)”。

- [ ] **Step 4: 运行，确认通过，并检查其他调用方的类型**

Run: `npx tsx src/lib/freshness/derive.check.ts && npx tsc --noEmit -p .`
Expected: `derive.check.ts: all assertions passed ✓`；tsc 无输出。如果 tsc 报某处手写的 `coverage: { filed, total }` 字面量缺少 `excluded`，就在那里补上 `excluded: 0`，或改用函数返回值。

- [ ] **Step 5: Commit**

```bash
git add src/lib/freshness/derive.ts src/lib/freshness/derive.check.ts
git commit -m "feat(freshness): 申报进度与切季覆盖率改用应申报名单 M(交了上一季的人),并给出上季未申报人数"
```

### Task 2：首页进度行、共识页“未计入”说明、llms.txt

**Files:**
- Create: `src/components/aggregate/NotCountedNote.tsx`
- Modify: `src/components/home/HeroMasthead.tsx`（`COPY.*.filingProgress`，调用处约 118–128 行）
- Modify: `src/app/[lang]/investors/consensus/page.tsx`（约 98–106 行的“未计入”段）
- Modify: `src/lib/llms.ts`（`filedOf`）
- Test: `src/components/home/filingProgressText.check.ts`（新建，测纯文案函数）

**Interfaces:**
- Consumes: `EffectiveMovesPeriod.coverage.{filed,total,excluded}`（Task 1）
- Produces:
  - `export function filingProgressText(lang: Lang, q: string, c: { filed: number; total: number; excluded: number }, deadline: string): string`（新建 `src/components/home/filingProgressText.ts`）
  - `NotCountedNote({ lang, managers }: { lang: Lang; managers: { person: string; period: string | null }[] })`

- [ ] **Step 1: 写失败测试**

新建 `src/components/home/filingProgressText.check.ts`：

```ts
// 运行: npx tsx src/components/home/filingProgressText.check.ts
import assert from "node:assert/strict";
import { filingProgressText } from "./filingProgressText";

const c = { filed: 2, total: 94, excluded: 3 };
assert.equal(
  filingProgressText("zh", "Q3 2026", c, "11 月 16 日"),
  "Q3 2026 申报进行中 · 94 位中 2 位已交（另有 3 位上季未申报，不计入）· 11 月 16 日截止后切换",
);
assert.equal(
  filingProgressText("en", "Q3 2026", c, "Nov 16"),
  "Q3 2026 filings arriving · 2 of 94 in (3 more missed last quarter and aren't counted) · switches after Nov 16",
);
assert.equal(
  filingProgressText("en", "Q3 2026", { filed: 1, total: 94, excluded: 1 }, "Nov 16"),
  "Q3 2026 filings arriving · 1 of 94 in (1 more missed last quarter and isn't counted) · switches after Nov 16",
  "单数",
);
assert.equal(
  filingProgressText("zh", "Q3 2026", { filed: 2, total: 97, excluded: 0 }, "11 月 16 日"),
  "Q3 2026 申报进行中 · 97 位中 2 位已交 · 11 月 16 日截止后切换",
  "excluded=0 不出括号",
);
console.log("filingProgressText.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/components/home/filingProgressText.check.ts`
Expected: 失败，报 Cannot find module `./filingProgressText`。

- [ ] **Step 3: 实现文案函数，并接进首页**

新建 `src/components/home/filingProgressText.ts`：

```ts
import type { Lang } from "@/lib/nav";

/** 首页申报进度行。分母 = 应申报 M(isExpectedFiler);上季未申报的人数写在括号里。 */
export function filingProgressText(
  lang: Lang,
  q: string,
  c: { filed: number; total: number; excluded: number },
  deadline: string,
): string {
  if (lang === "zh") {
    const ex = c.excluded > 0 ? `（另有 ${c.excluded} 位上季未申报，不计入）` : "";
    return `${q} 申报进行中 · ${c.total} 位中 ${c.filed} 位已交${ex} · ${deadline}截止后切换`;
  }
  const ex =
    c.excluded > 0
      ? ` (${c.excluded} more missed last quarter and ${c.excluded === 1 ? "isn't" : "aren't"} counted)`
      : "";
  return `${q} filings arriving · ${c.filed} of ${c.total} in${ex} · switches after ${deadline}`;
}
```

`HeroMasthead.tsx` 中，删掉两个 `COPY.*.filingProgress`，改为 import `filingProgressText`。调用处改成：

```tsx
  const filingProgressText_ =
    showFilingProgress && filing
      ? filingProgressText(
          lang,
          quarterLabel(filing.maxPeriod),
          filing.coverage,
          // 周末截止顺延到周一(Q3 2026:周六 11/14 → 11/16),与切季、当前持有人判断同一天。
          fmtDeadline(effectiveFilingDeadline(filing.maxPeriod), lang),
        )
      : null;
```

变量名要和下文 JSX 里原来的 `filingProgressText` 引用一起改（例如都改为 `progressLine`），避免和 import 的函数重名。

- [ ] **Step 4: 抽出 `NotCountedNote`，共识页改用它**

新建 `src/components/aggregate/NotCountedNote.tsx`：

```tsx
import type { Lang } from "@/lib/nav";
import { quarterLabel } from "@/lib/freshness/derive";

/** 「计入 N 位」少于名单时,写明少的是谁、为什么(spec 2026-10-23 §三.1)。空名单 → 不渲染。 */
export function NotCountedNote({
  lang,
  managers,
}: {
  lang: Lang;
  managers: { person: string; period: string | null }[];
}): React.ReactElement | null {
  if (managers.length === 0) return null;
  return (
    <p className="mt-3 text-xs text-[var(--tt-muted)]">
      {lang === "zh"
        ? `未计入：${managers.map((m) => `${m.person}（最新 13F 停在 ${quarterLabel(m.period) || "无"}）`).join("、")}。申报截止日已过仍未交新一季，旧仓位不算当前持有。`
        : `Not counted: ${managers.map((m) => `${m.person} (latest 13F: ${quarterLabel(m.period) || "none"})`).join(", ")}. They missed the latest filing deadline, so their old positions don't count as current holdings.`}
    </p>
  );
}
```

`consensus/page.tsx` 中，把 `{overdueManagers.length > 0 && (<p …>…</p>)}` 整段换成：

```tsx
          <NotCountedNote lang={lang} managers={overdueManagers} />
```

并加上 `import { NotCountedNote } from "@/components/aggregate/NotCountedNote";`。

- [ ] **Step 5: llms.txt 的分母文字**

`src/lib/llms.ts` 的 `filedOf` 改为：

```ts
/** "1 of 94 managers expected to file has" —— 分母 = 应申报 M,与首页进度行同一口径。 */
function filedOf(c: { filed: number; total: number }): string {
  return `${c.filed} of ${c.total} managers expected to file ${c.filed === 1 ? "has" : "have"}`;
}
```

`baselineSentence` 末尾 `All ${coverage.total} tracked managers have filed for it.` 改成 `All ${coverage.total} managers expected to file have filed for it.`

- [ ] **Step 6: 运行**

Run: `npx tsx src/components/home/filingProgressText.check.ts && npx tsc --noEmit -p . && npx eslint src/components/home src/components/aggregate/NotCountedNote.tsx "src/app/[lang]/investors/consensus/page.tsx" src/lib/llms.ts`
Expected: `filingProgressText.check OK`；tsc、eslint 无报错。

- [ ] **Step 7: Commit**

```bash
git add src/components/home src/components/aggregate/NotCountedNote.tsx "src/app/[lang]/investors/consensus/page.tsx" src/lib/llms.ts
git commit -m "feat(home,consensus): 申报进度写 n/M 并注明上季未申报人数;“未计入”说明抽成共用组件;llms.txt 同口径"
```

### Task 3：季度报告分母改用 M

**Files:**
- Modify: `scripts/lib/loadReportInput.ts`（`activeOnly` → `expectedOnly`；`loadReportInput` 约 95 行；`ReportInput` 增加 `excludedCount`）
- Modify: `scripts/report-consistency.ts:36`
- Modify: `src/lib/reports/types.ts`（`ReportPayload.coverage`、`ReportInput`）
- Modify: `src/lib/reports/build.ts:27`
- Modify: `src/lib/reports/copy.ts`（`statusLine`）
- Modify: `src/components/reports/ReportArticle.tsx:65`
- Test: `scripts/lib/loadReportInput.check.ts`、`src/lib/reports/copy.check.ts`、`src/lib/reports/build.check.ts`

**Interfaces:**
- Consumes: `isExpectedFiler`（Task 1）
- Produces:
  - `export function expectedOnly<T extends { latestPeriod: string | null }>(all: T[], period: string): T[]`
  - `ReportInput.excludedCount: number`
  - `ReportPayload.coverage: { filed: number; total: number; excluded?: number }`（可选字段：已定稿的 Q2 payload 没有它）
  - `statusLine(row, lang, excluded = 0)`

- [ ] **Step 1: 写失败测试**

`scripts/lib/loadReportInput.check.ts`：import 里加 `expectedOnly`，并追加：

```ts
// 报告分母 = 应申报 M:最新申报期 ≥ 报告季的上一季
{
  const all = [
    { slug: "a", latestPeriod: "2026-09-30" },
    { slug: "b", latestPeriod: "2026-06-30" },
    { slug: "bancroft", latestPeriod: "2026-03-31" },
    { slug: "burry", latestPeriod: "2025-09-30" },
    { slug: "none", latestPeriod: null },
  ];
  const q3 = expectedOnly(all, "2026-09-30").map((r) => r.slug);
  assert.deepEqual(q3, ["a", "b"], "Q3 报告:停在 Q1 / 2025Q3 / 无申报的人不在分母");
  const q2 = expectedOnly(all, "2026-06-30").map((r) => r.slug);
  assert.deepEqual(q2, ["a", "b", "bancroft"], "Q2 报告:交了 Q1 的 Bancroft 在分母");
}
```

（如果该文件用的是自写的 `check()` 而不是 `node:assert`，按文件里现有的写法改写同样的断言。）

`src/lib/reports/copy.check.ts` 追加：

```ts
assert(
  statusLine({ status: "live", coverageFiled: 2, coverageTotal: 94, finalizedAt: null }, "zh", 3).includes("94 位中已有 2 位申报（另有 3 位上季未申报，不计入）"),
  "zh live 状态条写明未计入人数",
);
assert(
  statusLine({ status: "live", coverageFiled: 2, coverageTotal: 94, finalizedAt: null }, "en", 1).includes("2 of 94 have filed (1 more missed last quarter and isn't counted)"),
  "en live 状态条单数",
);
assert(
  !statusLine({ status: "final", coverageFiled: 94, coverageTotal: 94, finalizedAt: "2026-11-18T03:00:00Z" }, "zh").includes("另有"),
  "excluded 缺省 = 0 → 不出括号",
);
```

`src/lib/reports/build.check.ts`：找到构造 `ReportInput` 的工厂（搜 `featuredSlugs:`），给它补 `excludedCount: 3`，然后追加：

```ts
assert.equal(payload.coverage.excluded, 3, "payload 带上上季未申报人数");
```

这里的 `payload` 指文件里已有的 `buildQuarterlyReport(...)` 返回值变量，按实际变量名改写。

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx scripts/lib/loadReportInput.check.ts; npx tsx src/lib/reports/copy.check.ts; npx tsx src/lib/reports/build.check.ts`
Expected: 三个都失败：`expectedOnly` 不存在、状态条没有括号文字、`excluded` 为 undefined。

- [ ] **Step 3: 实现**

`scripts/lib/loadReportInput.ts`：import 从 `freshness13F, globalLatestPeriod` 改为 `isExpectedFiler`，然后把 `activeOnly` 整个函数替换成：

```ts
/** 报告分母 = 应申报 M(与首页申报进度、切季覆盖率同一口径):最新申报期 ≥ 报告季的上一季。 */
export function expectedOnly<T extends { latestPeriod: string | null }>(all: T[], period: string): T[] {
  return all.filter((r) => isExpectedFiler(r.latestPeriod, period));
}
```

`loadReportInput` 中：

```ts
  const allFilings = await loadManagerFilings(db);
  const expected = expectedOnly(allFilings, period);
  const active = expected.map((r) => ({ ...r, ...pickFilingsForPeriod(r.rows, period) }));
```

在返回的 `input` 对象里加 `excludedCount: allFilings.length - expected.length,`。

`scripts/report-consistency.ts:36` 改为 `const cohort = expectedOnly(all, period).filter((r) => r.latestPeriod === period);`，并同步 import。

`src/lib/reports/types.ts`：

```ts
  /** total = 应申报 M;excluded = 上季未申报、不计入的人数(Q2 定稿 payload 无此字段)。 */
  coverage: { filed: number; total: number; excluded?: number };
```

`ReportInput` 的 `managers` 注释改为 `/** 应申报投资人(expectedOnly)。 */`，并加：

```ts
  /** 名单里上季未申报、不计入分母的人数。 */
  excludedCount: number;
```

`src/lib/reports/build.ts:27`：`const coverage = { filed: filers.length, total: managers.length, excluded: input.excludedCount };`（`input` 按函数实际参数名改写）。

`src/lib/reports/copy.ts` 的 `statusLine`：

```ts
export function statusLine(
  row: { status: ReportStatus; coverageFiled: number; coverageTotal: number; finalizedAt: string | null },
  lang: ReportLang,
  excluded = 0,
): string {
  const day = row.finalizedAt ? row.finalizedAt.slice(0, 10) : "";
  const exZh = excluded > 0 ? `（另有 ${excluded} 位上季未申报，不计入）` : "";
  const exEn = excluded > 0 ? ` (${excluded} more missed last quarter and ${excluded === 1 ? "isn't" : "aren't"} counted)` : "";
  if (row.status === "live") {
    return lang === "zh"
      ? `${row.coverageTotal} 位中已有 ${row.coverageFiled} 位申报${exZh} · 每次有新申报后更新`
      : `${row.coverageFiled} of ${row.coverageTotal} have filed${exEn} · updates after each new filing`;
  }
  return lang === "zh"
    ? `定稿于 ${day} · ${row.coverageTotal} 位中 ${row.coverageFiled} 位已申报${exZh}`
    : `Final as of ${day} · ${row.coverageFiled} of ${row.coverageTotal} filed${exEn}`;
}
```

`ReportArticle.tsx:65`：`{statusLine(row, lang, row.payload.coverage.excluded ?? 0)}`。

- [ ] **Step 4: 运行**

Run: `npx tsx scripts/lib/loadReportInput.check.ts && npx tsx src/lib/reports/copy.check.ts && npx tsx src/lib/reports/build.check.ts && npx tsx src/lib/reports/readiness.check.ts && npx tsx src/lib/reports/email.check.ts && npx tsc --noEmit -p .`
Expected: 全部 OK；tsc 无输出。`grep -rn "activeOnly" scripts src` 应无结果。

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/loadReportInput.ts scripts/lib/loadReportInput.check.ts scripts/report-consistency.ts src/lib/reports src/components/reports/ReportArticle.tsx
git commit -m "feat(reports): 覆盖率与公开/定稿门槛改用应申报名单 M,状态条写明上季未申报人数"
```

### Task 4：Q2 手写文章补快照说明，修正截止日

**Files:**
- Modify: `src/lib/learn.ts`（`Article` 类型约 29 行；`"q2-2026-superinvestor-consensus"` 的 en、zh 两个条目）
- Modify: `src/app/[lang]/learn/[slug]/page.tsx`（`SnapshotNotice`）
- Test: `src/lib/learn.check.ts`（新建）

**Interfaces:**
- Produces: `Article.snapshotNote?: string`

- [ ] **Step 1: 写失败测试**

新建 `src/lib/learn.check.ts`：

```ts
// 运行: npx tsx src/lib/learn.check.ts
import assert from "node:assert/strict";
import { getArticle } from "./learn";

const en = getArticle("q2-2026-superinvestor-consensus", "en")!;
const zh = getArticle("q2-2026-superinvestor-consensus", "zh")!;
assert.ok(en.snapshotNote?.includes("94"), "en 快照说明写明实时页现为 94 位");
assert.ok(zh.snapshotNote?.includes("94 位"), "zh 快照说明写明实时页现为 94 位");
assert.ok(!en.intro.includes("due November 14"), "en 不再写 Q3 11/14 截止");
assert.ok(en.intro.includes("November 16"), "en 写顺延后的 11/16");
assert.ok(!zh.intro.includes("11 月 14 日截止"), "zh 不再写 11/14 截止");
console.log("learn.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/learn.check.ts`
Expected: 失败于第一条（`snapshotNote` 为 undefined）。如果因为 `learn.ts` 引了 `server-only` 而无法运行，就改为用 `grep` 断言：在 Step 4 用 `grep -c "snapshotNote" src/lib/learn.ts` 应 ≥ 3，并删掉这个 check 文件。

- [ ] **Step 3: 实现**

`Article` 类型中，在 `snapshotPeriod?: string;` 下加：

```ts
  /** 快照文章写成后口径有变时的补充说明,显示在顶部快照提示里。 */
  snapshotNote?: string;
```

Q2 en 条目在 `snapshotPeriod: "2026-06-30",` 下加：

```ts
      snapshotNote:
        "Written 2026-10-19, when 92 investors counted. Two filings were read correctly only after a later fix (Ackman's 13F-NT notice and Olstein's zero-holdings report), so the live pages now count 94.",
```

zh 条目加：

```ts
      snapshotNote: "写于 2026-10-19，当时计入 92 位。之后修复了两位投资人的申报读取（Ackman 的 13F-NT 代报、Olstein 的零持仓申报），实时页现为 94 位。",
```

en `intro` 里的 `Q3 filings are due November 14, so this snapshot has a short shelf life.` 改成 `Q3 filings are due November 16 (the 45-day mark falls on a Saturday), so this snapshot has a short shelf life.`。在 zh 条目的 `intro` 中搜 `11 月 14`，把对应句子改成同义的“Q3 申报截止日是 11 月 16 日（第 45 天是周六，顺延到周一）”，其余文字不动。

`page.tsx` 的 `SnapshotNotice` 增加 `note?: string` 参数，在 `<p>` 的链接之后、句号之后渲染：

```tsx
      {note && <p className="mt-1">{note}</p>}
```

调用处传 `note={article.snapshotNote}`。

- [ ] **Step 4: 运行**

Run: `npx tsx src/lib/learn.check.ts && npx tsc --noEmit -p .`
Expected: `learn.check OK`；tsc 无输出。

- [ ] **Step 5: Commit，推送，开 PR A**

```bash
git add src/lib/learn.ts src/lib/learn.check.ts "src/app/[lang]/learn/[slug]/page.tsx"
git commit -m "content(learn): Q2 复盘补快照说明(92 → 94 的原因),Q3 截止日改为顺延后的 11/16"
git push https://github.com/xjing-umich/ny-fed-monitor.git fix/data-consistency-counts
```

PR A 标题：`fix: 投资人数统一口径(追踪 97 / 计入 N / 申报 n/M)+ Q2 文章快照说明`，base 为 `db-foundation`。描述里列出任务 1–4，以及“已知 3 个原有失败的 check”。

### Task 5：PR A 合并前验证

**Files:** 无代码改动。

- [ ] **Step 1: 全量自检**

Run（在 `web/`）：

```bash
fails=0; for f in $(find src scripts -name "*.check.ts" -not -path "*/node_modules/*"); do npx tsx "$f" >/dev/null 2>&1 </dev/null || { echo "FAIL $f"; fails=$((fails+1)); }; done; echo "failures: $fails"
```

Expected: 只列出 3 个已知失败（见“开工前”）。

- [ ] **Step 2: Vercel 预览页面核对**

在 PR A 的 Vercel 预览上打开 `/`、`/zh`、`/investors/consensus`、`/zh/investors/consensus`、`/llms.txt`、`/learn/q2-2026-superinvestor-consensus`、`/zh/learn/q2-2026-superinvestor-consensus`，逐项确认：

- 首页进度行写“2 of 94 in (3 more missed last quarter and aren't counted) · switches after Nov 16”（中文同义）。
- 共识页“未计入”列出 3 位，blurb 写“Among 94”。
- Q2 文章顶部出现补充说明，intro 写 11/16。

以 2026-10-23 线上数据为准；预览当天数字可能已变化，比如已交 Q3 的人多了，这属正常。

---

# PR B：估值说法与持有人表（分支 `fix/data-consistency-labels`）

### Task 6：`valuationLabel` 纯函数

**Files:**
- Create: `src/lib/valuation/valuationLabel.ts`
- Test: `src/lib/valuation/valuationLabel.check.ts`

**Interfaces:**
- Produces:

```ts
export type ValuationTier = "strike" | "below" | "within" | "above" | "unassessed";
export type ValuationLabel = {
  tier: ValuationTier;
  /** 档名,不含“待确认”后缀。 */
  label: string;
  /** 便宜档但 reliable=false → true。 */
  pending: boolean;
  /** 悬停说明(待确认原因 / 未评估原因 / 单法口径);无 → null。 */
  title: string | null;
  tone: "positive" | "neutral" | "warn";
};
export type VerdictLike = { bucket: "below" | "within" | "above"; inStrikeZone: boolean; reliable: boolean; coverage?: "full" | "single_lamp" } | null | undefined;
export function valuationLabel(v: VerdictLike, lang: Lang): ValuationLabel;
export const PENDING_WORD: Record<Lang, string>; // { zh: "待确认", en: "pending" }
```

（`bucket` 的类型以 `deriveValuationVerdict.ts` 的 `VerdictBucket` 为准，直接 import 它。）

- [ ] **Step 1: 写失败测试**

```ts
// 运行: npx tsx src/lib/valuation/valuationLabel.check.ts
import assert from "node:assert/strict";
import { valuationLabel } from "./valuationLabel";

const v = (p: Partial<{ bucket: "below" | "within" | "above"; inStrikeZone: boolean; reliable: boolean; coverage: "full" | "single_lamp" }>) =>
  ({ bucket: "within" as const, inStrikeZone: false, reliable: true, coverage: "full" as const, ...p });

let l = valuationLabel(v({ inStrikeZone: true, bucket: "below" }), "zh");
assert.deepEqual([l.tier, l.label, l.pending, l.tone], ["strike", "击球区", false, "positive"]);
l = valuationLabel(v({ inStrikeZone: true, bucket: "below", reliable: false }), "zh");
assert.deepEqual([l.tier, l.label, l.pending, l.tone], ["strike", "击球区", true, "neutral"], "红旗击球区 = 待确认");
assert.ok(l.title && l.title.length > 0, "待确认带原因");
l = valuationLabel(v({ bucket: "below" }), "en");
assert.deepEqual([l.tier, l.label], ["below", "Below intrinsic value"]);
l = valuationLabel(v({ bucket: "below", reliable: false }), "en");
assert.equal(l.pending, true);
l = valuationLabel(v({ bucket: "within" }), "zh");
assert.deepEqual([l.tier, l.label, l.pending, l.tone], ["within", "价值带内", false, "neutral"]);
l = valuationLabel(v({ bucket: "within", reliable: false }), "zh");
assert.equal(l.pending, false, "非便宜档不挂待确认");
l = valuationLabel(v({ bucket: "above" }), "en");
assert.deepEqual([l.tier, l.label, l.tone], ["above", "Above band", "warn"]);
l = valuationLabel(null, "zh");
assert.deepEqual([l.tier, l.label, l.pending], ["unassessed", "未评估", false]);
assert.ok(l.title?.includes("暂无可用估值"), "未评估带原因");
l = valuationLabel(undefined, "en");
assert.equal(l.label, "Not assessed");
l = valuationLabel(v({ bucket: "above", coverage: "single_lamp" }), "en");
assert.ok(l.title?.includes("Single-method"), "单法口径说明");
console.log("valuationLabel.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/valuation/valuationLabel.check.ts`
Expected: Cannot find module `./valuationLabel`。

- [ ] **Step 3: 实现**

```ts
import type { Lang } from "@/lib/nav";
import type { VerdictBucket } from "@/lib/valuation/deriveValuationVerdict";

// 估值位置的唯一说法源(spec 2026-10-23 §三.2):个股页标题徽章、投资人页持仓表、筛选器、首页卡片都经这里。
// bucket "below" = 价格低于内在价值中枢(deriveValuationVerdict:price < IV),故称“低于内在价值”,不称“低于价值带”。
// 便宜档(击球区/低于内在价值)reliable=false → pending(待确认):照实标位置,但不进任何击球区/低估计数。
export type ValuationTier = "strike" | "below" | "within" | "above" | "unassessed";
export type ValuationLabel = {
  tier: ValuationTier;
  label: string;
  pending: boolean;
  title: string | null;
  tone: "positive" | "neutral" | "warn";
};
export type VerdictLike =
  | { bucket: VerdictBucket; inStrikeZone: boolean; reliable: boolean; coverage?: "full" | "single_lamp" }
  | null
  | undefined;

export const PENDING_WORD: Record<Lang, string> = { zh: "待确认", en: "pending" };

const COPY = {
  zh: {
    strike: "击球区", below: "低于内在价值", within: "价值带内", above: "高于价值带", unassessed: "未评估",
    pendingWhy: "估值带红旗（盈利下滑 / 高杠杆 / 模型不稳 / 每股口径疑错），安全边际不可信，未计入击球区与低估计数。",
    unassessedWhy: "暂无可用估值：缺少可用财报，或这类公司不适用本估值方法。",
    singleLamp: "单法口径（无所有者盈利 DCF）",
  },
  en: {
    strike: "Strike zone", below: "Below intrinsic value", within: "Within band", above: "Above band", unassessed: "Not assessed",
    pendingWhy: "Valuation flagged (declining earnings / high leverage / model instability / per-share doubt); the margin isn't trustworthy and isn't counted as cheap.",
    unassessedWhy: "No valuation yet: usable filings are missing, or the method doesn't apply to this kind of company.",
    singleLamp: "Single-method basis (no owner-earnings DCF)",
  },
} as const;

export function valuationLabel(v: VerdictLike, lang: Lang): ValuationLabel {
  const t = COPY[lang];
  if (!v) return { tier: "unassessed", label: t.unassessed, pending: false, title: t.unassessedWhy, tone: "neutral" };
  const lampTitle = v.coverage === "single_lamp" ? t.singleLamp : null;
  const cheap = v.inStrikeZone || v.bucket === "below";
  if (cheap) {
    const tier: ValuationTier = v.inStrikeZone ? "strike" : "below";
    const pending = v.reliable === false;
    return {
      tier,
      label: tier === "strike" ? t.strike : t.below,
      pending,
      title: pending ? t.pendingWhy : lampTitle,
      tone: pending ? "neutral" : "positive",
    };
  }
  if (v.bucket === "within") return { tier: "within", label: t.within, pending: false, title: lampTitle, tone: "neutral" };
  return { tier: "above", label: t.above, pending: false, title: lampTitle, tone: "warn" };
}
```

- [ ] **Step 4: 运行**

Run: `npx tsx src/lib/valuation/valuationLabel.check.ts && npx tsc --noEmit -p .`
Expected: `valuationLabel.check OK`。

- [ ] **Step 5: Commit**

```bash
git add src/lib/valuation/valuationLabel.ts src/lib/valuation/valuationLabel.check.ts
git commit -m "feat(valuation): valuationLabel —— 估值位置五档说法与“待确认”的唯一来源"
```

### Task 7：徽章与标题芯片改用 `valuationLabel`，持仓表四档都显示

**Files:**
- Modify: `src/components/valuation/ValuationBadge.tsx`（整体重写渲染逻辑；`density` 改为 `"full" | "table"`）
- Modify: `src/lib/stocks/valuationVerdictChip.ts`
- Modify: `src/lib/stocks/valuationVerdictChip.check.ts`
- Modify: `src/app/[lang]/investors/[slug]/page.tsx:181`（`density="sparse"` → `density="table"`）

**Interfaces:**
- Consumes: `valuationLabel`、`PENDING_WORD`（Task 6）
- Produces: `ValuationBadge({ verdict, lang, density }: { verdict?: SnapshotVerdict; lang: Lang; density?: "full" | "table" })`

- [ ] **Step 1: 改测试**

把 `valuationVerdictChip.check.ts` 中的期望值改成新说法，并增加待确认的字样断言：

```ts
assert(valuationVerdictChip(v({ bucket: "below" }), "zh")?.label === "低于内在价值", "below zh label");
assert(valuationVerdictChip(v({ inStrikeZone: true, reliable: false }), "en")?.label === "Strike zone · pending", "红旗击球区带 pending 字样");
assert(valuationVerdictChip(v({ inStrikeZone: true, reliable: false }), "zh")?.label === "击球区 · 待确认", "zh 待确认");
const above = valuationVerdictChip(v({ bucket: "above" }), "zh");
assert(above?.label === "高于价值带" && above?.tone === "warn", `above warn, got ${JSON.stringify(above)}`);
assert(valuationVerdictChip(v({ bucket: "within" }), "en")?.label === "Within band", "within en label");
```

（把原来 `"低于价值带"`、`"高于价值"` 两条断言替换掉，其余保留。）

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/stocks/valuationVerdictChip.check.ts`
Expected: `FAIL: below zh label`。

- [ ] **Step 3: 实现 `valuationVerdictChip`**

```ts
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";
import type { Tone } from "@/components/entity/types";
import type { Lang } from "@/lib/nav";
import { valuationLabel, PENDING_WORD } from "@/lib/valuation/valuationLabel";

/** 估值 verdict → 个股页标题徽章 {label,tone}。说法与持仓表、筛选器同源(valuationLabel)。null → 无徽章。 */
export function valuationVerdictChip(v: ValuationVerdict | null, lang: Lang): { label: string; tone: Tone } | null {
  if (v == null) return null;
  const l = valuationLabel(v, lang);
  return { label: l.pending ? `${l.label} · ${PENDING_WORD[lang]}` : l.label, tone: l.tone };
}
```

- [ ] **Step 4: 重写 `ValuationBadge`**

保留文件顶部的 import 和 `expect` 文案（如果下文还在用），用下面的逻辑替换 `COPY` 中的档名部分和函数主体：

```tsx
import { valuationLabel, PENDING_WORD } from "@/lib/valuation/valuationLabel";

// density:
//   "full"  — 筛选器 / 共识榜:四档都出 pill
//   "table" — 持仓表:便宜档出 pill;带内 / 高于价值带用灰色小字;无估值写“未评估”(spec 2026-10-23 §三.2)
export function ValuationBadge({
  verdict,
  lang,
  density = "full",
}: {
  verdict?: SnapshotVerdict;
  lang: Lang;
  density?: "full" | "table";
}): React.ReactElement {
  const l = valuationLabel(verdict, lang);
  if (l.tier === "unassessed") {
    return <span className="text-xs text-[var(--tt-faint)]" title={l.title ?? undefined}>{l.label}</span>;
  }
  const isCheap = l.tier === "strike" || l.tier === "below";
  if (density === "table" && !isCheap) {
    return <span className="text-xs text-[var(--tt-muted)]" title={l.title ?? undefined}>{l.label}</span>;
  }
  const cls = l.pending
    ? "border-[var(--tt-border)] text-[var(--tt-muted)]"
    : l.tier === "strike"
      ? "border-[var(--tt-positive)] text-[var(--tt-positive)] bg-[var(--tt-positive)]/10"
      : l.tier === "below"
        ? "border-[var(--tt-positive)]/50 text-[var(--tt-positive)]"
        : l.tier === "within"
          ? "border-[var(--tt-border)] text-[var(--tt-muted)]"
          : "border-[var(--tt-warn)]/50 text-[var(--tt-warn)]";
  const marker = l.pending ? (
    <span className="ml-1 text-xs text-[var(--tt-faint)]">· {PENDING_WORD[lang]}</span>
  ) : verdict?.coverage === "single_lamp" ? (
    <span aria-hidden className="ml-0.5 opacity-60">*</span>
  ) : null;
  // 下面沿用原文件的 pill 外层结构(badge 元素 + 可选 expectations 尾标),只把 label/cls/marker/title 换成上面的值。
```

接着把原文件从 `const badge = (` 开始的 JSX 保留下来，变量 `label` 改用 `l.label`、`title` 改用 `l.title ?? undefined`。删除旧的 `isCheap / unconfirmedCheap / sparse` 分支和 `COPY` 里的 `strike/below/within/above/none/unconfirmed/lamp/flag` 字段；`expect` 字段如果仍被引用就保留。文件头注释里的“sparse”说明同步改成“table”。

- [ ] **Step 5: 改调用处并核对**

`investors/[slug]/page.tsx:181`：`density="sparse"` → `density="table"`。

Run: `grep -rn 'density="sparse"' src` → 无结果。
Run: `npx tsx src/lib/stocks/valuationVerdictChip.check.ts && npx tsx src/lib/valuation/valuationLabel.check.ts && npx tsc --noEmit -p .`
Expected: 两个 check 都 OK；tsc 无输出。

- [ ] **Step 6: Commit**

```bash
git add src/components/valuation/ValuationBadge.tsx src/lib/stocks/valuationVerdictChip.ts src/lib/stocks/valuationVerdictChip.check.ts "src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "fix(valuation): 徽章与标题芯片同源 valuationLabel;持仓表四档都显示,无估值写“未评估”,红旗便宜档处处标待确认"
```

### Task 8：投资人页估值姿态与页底引导写明“待确认”

**Files:**
- Modify: `src/lib/managers/valuationPosture.ts`（`ValuationPosture` 加 `pending`）
- Modify: `src/lib/managers/valuationPosture.check.ts`
- Modify: `src/lib/discovery/discoveryHandoff.ts`（`investorHandoffFor` 加参数）
- Modify: `src/lib/discovery/discoveryHandoff.check.ts`
- Modify: `src/app/[lang]/investors/[slug]/page.tsx`（KeyFacts“低于价值带”约 471–477 行；估值姿态段约 606–620 行；handoff 约 686 行）

**Interfaces:**
- Produces:
  - `ValuationPosture.pending: CheapHolding[]`（reliable=false 的便宜档，按 marginPct 降序）
  - `investorHandoffFor(strikeCount: number, person: string, lang: Lang, pendingNames: string[] = []): DiscoveryCta`

- [ ] **Step 1: 写失败测试**

`valuationPosture.check.ts` 末尾（`console.log` 之前）追加：

```ts
// C 是 below+击球区但 reliable=false → 不进 covered/cheap,但进 pending
const pr = deriveValuationPosture({ holdings, cusipToTicker, verdicts });
assert(pr.pending.length === 1 && pr.pending[0].ticker === "C", `pending 只含 C, got ${JSON.stringify(pr.pending)}`);
assert(!pr.cheap.some((c) => c.ticker === "C"), "C 不在 cheap");
```

（`holdings` 按文件里已有的变量名改写。）

`discoveryHandoff.check.ts` 追加：

```ts
c = investorHandoffFor(0, "Warren Buffett", "zh", ["Macy's"]);
assert(c.line === "Warren Buffett 目前没有已确认的击球区持仓，另有 1 只待确认（Macy's）。", `zh pending, got ${c.line}`);
c = investorHandoffFor(0, "X", "en", ["A", "B", "C", "D"]);
assert(c.line === "X has no confirmed strike-zone positions right now; 4 more are pending (A, B, C and 1 more).", `en pending 截断, got ${c.line}`);
c = investorHandoffFor(0, "X", "en");
assert(c.line === "X has no confirmed strike-zone positions right now.", `en 无待确认, got ${c.line}`);
```

（`assert` 用文件里已有的写法；如果原有断言写的是旧句子 “has no positions in the strike zone right now”，改成新句子。）

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/managers/valuationPosture.check.ts; npx tsx src/lib/discovery/discoveryHandoff.check.ts`
Expected: 两个都失败（`pending` 不存在；句子不符）。

- [ ] **Step 3: 实现姿态**

`valuationPosture.ts`：类型加 `pending: CheapHolding[]; // 便宜档但 reliable=false(待确认),不计入 covered/cheap`。循环中把

```ts
    if (vd == null || !vd.reliable) continue; // 信心闸
```

改为：

```ts
    if (vd == null) continue;
    if (!vd.reliable) {
      // 待确认:照实列出,但不进分母、不进便宜计数(spec 2026-10-23 §三.2)
      if (vd.inStrikeZone || vd.bucket === "below")
        pending.push({ issuer: h.issuer, ticker, marginPct: vd.marginPct, inStrikeZone: vd.inStrikeZone, bucket: vd.bucket });
      continue;
    }
```

在函数开头声明 `const pending: CheapHolding[] = [];`。排序部分抽成 `const byMargin = (a: CheapHolding, b: CheapHolding) => …`（原比较函数），`cheap.sort(byMargin); pending.sort(byMargin);`，返回值加上 `pending`。

- [ ] **Step 4: 实现引导句**

`discoveryHandoff.ts` 的 `investorHandoffFor`：

```ts
export function investorHandoffFor(strikeCount: number, person: string, lang: Lang, pendingNames: string[] = []): DiscoveryCta {
  const zh = lang === "zh";
  const eyebrow = EYEBROW[lang];
  if (strikeCount > 0) {
    return {
      eyebrow,
      href: screenerHref(lang, "strike_zone"),
      line: zh
        ? `${person} 有 ${strikeCount} 只持仓现价落在击球区。`
        : `${person} holds ${strikeCount} position${strikeCount === 1 ? "" : "s"} now in the strike zone.`,
      ctaLabel: zh ? "看全市场击球区清单" : "See the full strike-zone list",
    };
  }
  const n = pendingNames.length;
  const shown = pendingNames.slice(0, 3);
  const rest = n - shown.length;
  const tailZh = n > 0 ? `，另有 ${n} 只待确认（${shown.join("、")}${rest > 0 ? ` 等 ${n} 只` : ""}）` : "";
  const tailEn =
    n > 0
      ? `; ${n} more ${n === 1 ? "is" : "are"} pending (${rest > 0 ? `${shown.join(", ")} and ${rest} more` : shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0]})`
      : "";
  return {
    eyebrow,
    href: screenerHref(lang, "below"),
    line: zh ? `${person} 目前没有已确认的击球区持仓${tailZh}。` : `${person} has no confirmed strike-zone positions right now${tailEn}.`,
    ctaLabel: zh ? "按价值带浏览全市场" : "Browse the whole market by value band",
  };
}
```

注意：英文 4 个名字时，按测试期望写成 “A, B, C and 1 more”。所以 `rest > 0` 分支是 `${shown.join(", ")} and ${rest} more`，上面的代码就是这样写的，照抄即可。

- [ ] **Step 5: 页面接线**

`investors/[slug]/page.tsx`：

- KeyFacts 那一项改为：

```tsx
    {
      label: lang === "zh" ? "低于内在价值" : "Below intrinsic value",
      value: String(posture.cheap.length),
      note: valuationAsOfText(lang, valuationAsOf) ?? undefined,
    },
```

上方关于“击球区恒 ⊆ below”的注释改为：`// cheap = 击球区 ∪ 低于内在价值(reliable);待确认的不计入,写在估值姿态段落里。`

- 估值姿态段：条件 `posture.cheap.length > 0` 改为 `(posture.cheap.length > 0 || posture.pending.length > 0)`；引导句改为：

```tsx
                {lang === "zh"
                  ? `这只基金 ${posture.covered} 只可估值美股持仓中，有 ${posture.cheap.length} 只现价低于内在价值${posture.strikeCount > 0 ? `（其中 ${posture.strikeCount} 只落在击球区）` : ""}${posture.pending.length > 0 ? `；另有 ${posture.pending.length} 只待确认` : ""}${posture.asOf ? `（估值截至 ${posture.asOf}）` : ""}：`
                  : `Of ${posture.covered} valued US positions, ${posture.cheap.length} trade below intrinsic value${posture.strikeCount > 0 ? ` (${posture.strikeCount} in the strike zone)` : ""}${posture.pending.length > 0 ? `; ${posture.pending.length} more pending` : ""}${posture.asOf ? ` (as of ${posture.asOf})` : ""}:`}
```

如果段落下方的 chip 列表只遍历 `posture.cheap`，就在其后再遍历 `posture.pending`，用同样的 chip、文字后缀 `· 待确认` / `· pending`、中性色。

- handoff：`<DiscoveryHandoff {...investorHandoffFor(posture.strikeCount, manager.person, lang, posture.pending.map((p) => cleanIssuer(p.issuer)))} />`

- [ ] **Step 6: 运行**

Run: `npx tsx src/lib/managers/valuationPosture.check.ts && npx tsx src/lib/discovery/discoveryHandoff.check.ts && npx tsc --noEmit -p .`
Expected: 两个 check 都 OK；tsc 无输出。

- [ ] **Step 7: Commit**

```bash
git add src/lib/managers/valuationPosture.ts src/lib/managers/valuationPosture.check.ts src/lib/discovery "src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "fix(investors): 估值姿态与页底引导写明待确认的便宜持仓(Macy's),计数只算已确认"
```

### Task 9：击球区文案统一，筛选器与首页卡片加“内在价值”列

**Files:**
- Create: `src/lib/valuation/impliedValue.ts`、`src/lib/valuation/impliedValue.check.ts`
- Modify: `src/lib/valuation/valuationSnapshot.ts`（`StrikeLeader` 加 `price`；`readStrikeZoneLeaders` 的 map 补 `price`）
- Modify: `src/components/home/StrikeLeadersCard.tsx`
- Modify: `src/app/[lang]/stocks/screener/ScreenerTable.tsx`（在价值带列之后加一列）
- Modify: `src/app/[lang]/stocks/screener/_screenerPage.tsx:60,83-87`
- Modify: `src/lib/discovery/discoveryHandoff.ts:32,41,48`（`stockHandoffFor`）
- Modify: `src/app/[lang]/stocks/StocksTable.tsx:39`、`src/app/[lang]/stocks/page.tsx:118-119`
- Modify: `src/lib/reports/copy.ts:44,51,142,143,152,153`
- Test: `src/lib/discovery/discoveryHandoff.check.ts`、`src/lib/reports/copy.check.ts`（按新文案更新断言）

**Interfaces:**
- Produces: `export function impliedValue(price: number, marginPct: number | null): number | null` —— 由 `marginPct = (ref − price) / ref` 反推参照价值 `ref = price / (1 − marginPct)`。有 IV 时就是内在价值中枢；单法口径（`*`）时是零增长价值。

统一文案：

| 用途 | 中文 | English |
|---|---|---|
| 击球区定义（括号说明） | 价格低于买入线：内在价值扣除安全边际 | price below the buy line: intrinsic value minus a margin of safety |
| 列名 | 内在价值 | Intrinsic value |
| 单法脚注 | 带 * 的为单法口径，内在价值一列为零增长价值。 | Rows marked * use a single method; their intrinsic value is the zero-growth value. |

- [ ] **Step 1: 写失败测试**

`src/lib/valuation/impliedValue.check.ts`：

```ts
// 运行: npx tsx src/lib/valuation/impliedValue.check.ts
import assert from "node:assert/strict";
import { impliedValue } from "./impliedValue";

assert.equal(Math.round(impliedValue(79.17, 0.7692)!), 343, "PDD:$79 / (1−0.77) ≈ $343");
assert.equal(impliedValue(50, 0), 50, "边际 0 → 等于价格");
assert.equal(Math.round(impliedValue(150, -0.5)!), 100, "负边际(高于价值)也能反推");
assert.equal(impliedValue(10, null), null, "无边际 → null");
assert.equal(impliedValue(10, 1), null, "边际 = 1 → 无意义,null");
assert.equal(impliedValue(10, 1.2), null, "边际 > 1 → null");
assert.equal(impliedValue(0, 0.3), null, "价格非正 → null");
console.log("impliedValue.check OK");
```

`discoveryHandoff.check.ts` 中，原有关于 `stockHandoffFor` 的断言如果检查了句子原文，改为期望下面 Step 3 的新句子；再追加：

```ts
// 文件里已有工厂 v(over),默认 bucket "below"、reliable true
assert.equal(stockHandoffFor(v({ bucket: "below" }), "AAPL", "en").line, "AAPL's price is below its intrinsic value.");
assert.equal(stockHandoffFor(v({ inStrikeZone: true }), "PDD", "zh").line, "PDD 现价低于买入线（内在价值扣除安全边际）。");
assert.equal(stockHandoffFor(v({ bucket: "above" }), "AAPL", "zh").line, "AAPL 现价不低于内在价值。");
```

`copy.check.ts`：搜 `价值带以下`、`below the value band`、`Below value band`，把期望改为 `低于内在价值`、`below intrinsic value`、`Below intrinsic value`。

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/valuation/impliedValue.check.ts`
Expected: Cannot find module。

- [ ] **Step 3: 实现**

`impliedValue.ts`：

```ts
/**
 * 由安全边际反推参照价值:marginPct = (ref − price) / ref ⇒ ref = price / (1 − marginPct)。
 * 有含增长中枢 IV 时 ref 即内在价值;单法口径时为零增长价值(deriveValuationVerdict 两个分支同一公式)。
 * 边际缺失、≥ 1 或价格非正 → null(页面显示 —)。
 */
export function impliedValue(price: number, marginPct: number | null): number | null {
  if (marginPct == null || !Number.isFinite(marginPct) || marginPct >= 1) return null;
  if (!(price > 0)) return null;
  return price / (1 - marginPct);
}
```

`valuationSnapshot.ts`：`StrikeLeader` 加 `price: number;`，`readStrikeZoneLeaders` 的 `.map` 加 `price: Number(r.price),`（select 里已有 `price`）。

`StrikeLeadersCard.tsx`：

```ts
const COPY = {
  zh: {
    title: (n: number) => `${n} 只在击球区`,
    cols: { band: "价值带", iv: "内在价值", margin: "安全边际" },
    note: "价格低于买入线（内在价值扣除安全边际）的标的，按安全边际排序。仅为位置观察，非建议。",
  },
  en: {
    title: (n: number) => `${n} in the strike zone`,
    cols: { band: "Band", iv: "Intrinsic value", margin: "Margin" },
    note: "Priced below the buy line (intrinsic value minus a margin of safety), ranked by margin of safety. An observation, not advice.",
  },
} as const;
```

标题行右侧原本只有 `{c.margin}`，改为在表格上方加一行 `<thead>`：

```tsx
        <thead>
          <tr className="font-data text-xs text-[var(--tt-faint)]">
            <th className="py-1 pr-3 text-left font-normal" />
            <th className="py-1 pr-3 text-right font-normal">{c.cols.band}</th>
            <th className="py-1 pr-3 text-right font-normal">{c.cols.iv}</th>
            <th className="py-1 text-right font-normal">{c.cols.margin}</th>
          </tr>
        </thead>
```

并删掉标题行右侧的 `<span>{c.margin}</span>`。每行在价值带 `<td>` 之后加：

```tsx
              <td className="py-2 pr-3 text-right font-data text-xs tabular-nums text-[var(--tt-text)] whitespace-nowrap">
                {(() => { const iv = impliedValue(row.price, row.marginPct); return iv == null ? "—" : `$${Math.round(iv).toLocaleString()}`; })()}
              </td>
```

文件头注释改成“击球区 = 价格低于内在价值扣除安全边际后的买入线”。

`ScreenerTable.tsx`：在价值带那一列（`fmtValueBand` 所在的 column 对象）之后加：

```tsx
    {
      key: "iv",
      header: lang === "zh" ? "内在价值" : "Intrinsic value",
      align: "right",
      hideOnMobile: true,
      cell: (r) => {
        const iv = impliedValue(r.price, r.marginPct);
        return <span className="font-data tabular-nums text-[var(--tt-text)]">{iv == null ? "—" : `$${Math.round(iv).toLocaleString()}`}</span>;
      },
    },
```

（按该文件 `Column` 的实际字段写；有 `width` 习惯就给 `"w-28"`。）在表格下方（该组件 return 的末尾）加单法脚注 `<p className="mt-2 text-xs text-[var(--tt-faint)]">…</p>`，文案见上表。

`_screenerPage.tsx`：

- 第 60 行：`{ key: "below", zh: "有安全边际", en: "Below intrinsic value" },`
- 第 83–87 行的 `geo` 四句中，括号说明全部改为统一文案：
  - zh：`现在 ${strikeTotal} 只可估值股票落在击球区（价格低于买入线：内在价值扣除安全边际）…`；无击球区：`当前没有可估值股票落在击球区（价格低于买入线：内在价值扣除安全边际；保守引擎常态）。`
  - en：`${strikeTotal} valued stocks are in the strike zone (price below the buy line: intrinsic value minus a margin of safety)…`；无击球区：`No valued stocks are in the strike zone (price below the buy line: intrinsic value minus a margin of safety) right now.`

`discoveryHandoff.ts` 的 `stockHandoffFor`：
- 第 32 行 → zh `${T} 现价低于买入线（内在价值扣除安全边际）。`，en `${T}'s price is below the buy line (intrinsic value minus a margin of safety).`
- 第 41 行 → zh `${T} 现价低于内在价值。`，en `${T}'s price is below its intrinsic value.`
- 第 48 行 → zh `${T} 现价不低于内在价值。`，en `${T}'s price is not below its intrinsic value.`

`StocksTable.tsx:39`：`` isZh ? `低于内在价值，安全边际 ${pct}` : `Below intrinsic value, margin of safety ${pct}` ``；同文件第 28、32 行的注释同步改说法。

`stocks/page.tsx:118-119`：括号说明改成 zh `（价格低于买入线：内在价值扣除安全边际）`，en `— price below the buy line: intrinsic value minus a margin of safety —`。

`reports/copy.ts`：
- 44 行：`有 ${sz} 只处在击球区或低于内在价值`
- 51 行：`… sits in the strike zone or below intrinsic value` / `… sit in the strike zone or below intrinsic value`
- 142–143 行：`strikeZone` 小节标题里的“价值带以下” → “低于内在价值”，“below the value band” → “below intrinsic value”（按原句结构替换）
- 152–153 行：`"价值带以下"` → `"低于内在价值"`，`"Below value band"` → `"Below intrinsic value"`

- [ ] **Step 4: 运行并扫残留**

Run: `npx tsx src/lib/valuation/impliedValue.check.ts && npx tsx src/lib/discovery/discoveryHandoff.check.ts && npx tsx src/lib/reports/copy.check.ts && npx tsx src/lib/reports/email.check.ts && npx tsc --noEmit -p .`
Expected: 全部 OK。
Run: `grep -rn -E "价值带以下|低于保守价值带|低于价值带|below the (conservative )?value band|Below value band|落入价值带" src --include=*.ts --include=*.tsx | grep -v "check.ts" | grep -v "^\s*//"`
Expected: 只剩代码注释（可一并改掉），没有面向用户的字符串。

- [ ] **Step 5: Commit**

```bash
git add src/lib/valuation/impliedValue.ts src/lib/valuation/impliedValue.check.ts src/lib/valuation/valuationSnapshot.ts src/components/home/StrikeLeadersCard.tsx "src/app/[lang]/stocks" src/lib/discovery src/lib/reports/copy.ts src/lib/reports/copy.check.ts
git commit -m "fix(valuation-copy): 击球区统一说成“价格低于买入线(内在价值扣安全边际)”;筛选器与首页卡片加内在价值列"
```

### Task 10：本季动作只说一次（个股页）

**Files:**
- Create: `src/lib/entity/quarterMovesText.ts`、`src/lib/entity/quarterMovesText.check.ts`
- Create: `src/components/entity/QuarterMovesLine.tsx`
- Modify: `src/app/[lang]/stocks/[ticker]/page.tsx`（`TABLE_COPY.*.meta`、`exitedTitle`、`more`；`HoldersTable` 的 meta 行、`QuarterMovesPill`、清仓 chip 区块）
- Delete: `src/components/entity/QuarterMovesPill.tsx`（确认无其他引用后）；同时从 `scripts/codemods/type-v2.ts:150` 的列表里删掉这一项

**Interfaces:**
- Produces:

```ts
export type MovesCount = { opened: number; added: number; trimmed: number; exited: number };
/** "Q2：新建 0 · 增持 4 · 减持 12 · 清仓 1" —— 不含清仓名单。 */
export function quarterMovesCounts(q: string, m: MovesCount, lang: Lang): string;
/** 清仓名单:最多 3 个,其余返回 rest。 */
export function splitNames<T>(items: T[], cap?: number): { shown: T[]; rest: number };
```

- `QuarterMovesLine({ q, moves, exited, unit, lang }: { q: string; moves: MovesCount; exited: { name: string; href: string }[]; unit: "investor" | "stock"; lang: Lang })`

- [ ] **Step 1: 写失败测试**

```ts
// 运行: npx tsx src/lib/entity/quarterMovesText.check.ts
import assert from "node:assert/strict";
import { quarterMovesCounts, splitNames } from "./quarterMovesText";

const m = { opened: 0, added: 4, trimmed: 12, exited: 1 };
assert.equal(quarterMovesCounts("Q2 2026", m, "zh"), "Q2 2026：新建 0 · 增持 4 · 减持 12 · 清仓 1");
assert.equal(quarterMovesCounts("Q2 2026", m, "en"), "Q2 2026: 0 opened · 4 added · 12 trimmed · 1 exited");
assert.deepEqual(splitNames(["a", "b", "c", "d", "e"]), { shown: ["a", "b", "c"], rest: 2 }, "超过 3 个折叠");
assert.deepEqual(splitNames(["a"]), { shown: ["a"], rest: 0 });
assert.deepEqual(splitNames([]), { shown: [], rest: 0 }, "清仓 0 → 空");
console.log("quarterMovesText.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/entity/quarterMovesText.check.ts`
Expected: Cannot find module。

- [ ] **Step 3: 实现纯函数与组件**

`src/lib/entity/quarterMovesText.ts`：

```ts
import type { Lang } from "@/lib/nav";

// 本季动作的唯一说法(spec 2026-10-23 §三.3):个股页、投资人页都只在一处可见地说一次,四项齐全。
export type MovesCount = { opened: number; added: number; trimmed: number; exited: number };

export function quarterMovesCounts(q: string, m: MovesCount, lang: Lang): string {
  return lang === "zh"
    ? `${q}：新建 ${m.opened} · 增持 ${m.added} · 减持 ${m.trimmed} · 清仓 ${m.exited}`
    : `${q}: ${m.opened} opened · ${m.added} added · ${m.trimmed} trimmed · ${m.exited} exited`;
}

export function splitNames<T>(items: T[], cap = 3): { shown: T[]; rest: number } {
  return { shown: items.slice(0, cap), rest: Math.max(0, items.length - cap) };
}
```

`src/components/entity/QuarterMovesLine.tsx`：

```tsx
import Link from "next/link";
import React from "react";
import type { Lang } from "@/lib/nav";
import { quarterMovesCounts, splitNames, type MovesCount } from "@/lib/entity/quarterMovesText";

/** 本季动作一行:计数 + 清仓名单(带链接,最多 3 个,其余写“另 k 位/只”)。零 hydration。 */
export function QuarterMovesLine({
  q,
  moves,
  exited,
  unit,
  lang,
}: {
  q: string;
  moves: MovesCount;
  exited: { name: string; href: string }[];
  /** 清仓名单的量词:个股页列投资人(位),投资人页列股票(只)。 */
  unit: "investor" | "stock";
  lang: Lang;
}): React.ReactElement {
  const { shown, rest } = splitNames(exited);
  const restText =
    rest > 0 ? (lang === "zh" ? ` 另 ${rest} ${unit === "investor" ? "位" : "只"}` : ` +${rest} more`) : "";
  return (
    <p className="font-data text-xs text-[var(--tt-muted)]">
      {quarterMovesCounts(q, moves, lang)}
      {shown.length > 0 && (
        <>
          {lang === "zh" ? "（" : " ("}
          {shown.map((e, i) => (
            <React.Fragment key={e.href}>
              {i > 0 && (lang === "zh" ? "、" : ", ")}
              <Link href={e.href} className="text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">
                {e.name}
              </Link>
            </React.Fragment>
          ))}
          {restText}
          {lang === "zh" ? "）" : ")"}
        </>
      )}
    </p>
  );
}
```

- [ ] **Step 4: 接进个股页**

`stocks/[ticker]/page.tsx`：

- `TABLE_COPY.zh.meta` 改为 `(n: number, total: string) => \`${n} 位持有 · 合计 ${total}\``，en 改为 `(n: number, total: string) => \`${n} holder${n === 1 ? "" : "s"} · ${total} combined\``。删除两种语言里的 `exitedTitle`、`more`，以及常量 `EXIT_CAP`（如果没有其他引用）。
- `HoldersTable` 增加 prop `quarter: string`（展示季度标签，由页面传 `quarterLabel(displayPeriod)`）。meta 行那一块改为：

```tsx
      <div className="mb-3 mt-3 space-y-1">
        <p className="font-data text-xs text-[var(--tt-muted)]">{t.meta(sorted.length, formatUSD(totalValue))}</p>
        <QuarterMovesLine
          q={quarter}
          moves={moves}
          exited={exited.map((e) => ({ name: e.person, href: investorPath(lang, e.slug) }))}
          unit="investor"
          lang={lang}
        />
      </div>
```

- 删除 `{/* 本季清仓:表底 chip 列表… */}` 整块 JSX，以及 `QuarterMovesPill` 的 import，改为 import `QuarterMovesLine`。
- 在 `<HoldersTable` 调用处（约 878 行）加 `quarter={quarterLabel(displayPeriod) || ""}`。
- 运行 `grep -rn "QuarterMovesPill" src scripts`：只剩组件文件本身和 `scripts/codemods/type-v2.ts:150` 时，删除 `src/components/entity/QuarterMovesPill.tsx`，并从 codemod 列表删掉那一行。

- [ ] **Step 5: 运行**

Run: `npx tsx src/lib/entity/quarterMovesText.check.ts && npm run -s check:codemod && npx tsc --noEmit -p . && npx eslint "src/app/[lang]/stocks/[ticker]/page.tsx" src/components/entity src/lib/entity`
Expected: 全部通过。

- [ ] **Step 6: Commit**

```bash
git add src/lib/entity "src/components/entity" "src/app/[lang]/stocks/[ticker]/page.tsx" scripts/codemods/type-v2.ts
git commit -m "fix(stocks): 本季动作合成一行并直接列出清仓者,去掉重复的说明行、chip 与清仓列表"
```

### Task 11：本季动作只说一次（投资人页，补上减仓）

**Files:**
- Modify: `src/app/[lang]/investors/[slug]/page.tsx`（约 350–352 行的计数；约 563–575 行的三格动作；`HoldingsTable` 内约 145–146、259–272 行的清仓列表；`HOLD_COPY.*.exitedTitle/more`）
- Test: 复用 Task 10 的 `quarterMovesText.check.ts`，并加一条四格计数的纯函数断言

**Interfaces:**
- Consumes: `splitNames`、`MovesCount`、`quarterMovesCounts`（Task 10，`src/lib/entity/quarterMovesText.ts`）。页面需要 import `splitNames` 和 `countMoves`。

- [ ] **Step 1: 写失败测试**

在 `quarterMovesText.check.ts` 末尾追加，钉住“四项都在”：

```ts
// 投资人页 Q2:巴菲特 新建 1 · 加仓 7 · 减仓 6 · 清仓 1 —— 减仓不能漏
assert.equal(
  quarterMovesCounts("Q2 2026", { opened: 1, added: 7, trimmed: 6, exited: 1 }, "zh"),
  "Q2 2026：新建 1 · 增持 7 · 减持 6 · 清仓 1",
);
```

再新建 `src/app/[lang]/investors/[slug]/movesCount.check.ts`，测页面要用的计数函数：

```ts
// 运行: npx tsx "src/app/[lang]/investors/[slug]/movesCount.check.ts"
import assert from "node:assert/strict";
import { countMoves } from "./movesCount";

const changes = [
  { kind: "new" }, { kind: "increased" }, { kind: "increased" }, { kind: "decreased" }, { kind: "exited" },
] as Array<{ kind: "new" | "increased" | "decreased" | "exited" }>;
assert.deepEqual(countMoves(changes), { opened: 1, added: 2, trimmed: 1, exited: 1 });
assert.deepEqual(countMoves([]), { opened: 0, added: 0, trimmed: 0, exited: 0 });
console.log("movesCount.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx "src/app/[lang]/investors/[slug]/movesCount.check.ts"`
Expected: Cannot find module `./movesCount`。

- [ ] **Step 3: 实现**

新建 `src/app/[lang]/investors/[slug]/movesCount.ts`：

```ts
import type { MovesCount } from "@/lib/entity/quarterMovesText";

/** 投资人页本季四项动作计数(长仓 changes)。 */
export function countMoves(changes: Array<{ kind: "new" | "increased" | "decreased" | "exited" }>): MovesCount {
  return {
    opened: changes.filter((c) => c.kind === "new").length,
    added: changes.filter((c) => c.kind === "increased").length,
    trimmed: changes.filter((c) => c.kind === "decreased").length,
    exited: changes.filter((c) => c.kind === "exited").length,
  };
}
```

（`kind` 的类型以 `HoldingChange["kind"]` 为准；如果它还有别的取值，参数类型就用 `Pick<HoldingChange, "kind">[]`。）

页面中：
- 把 `const added = …; const increased = …; const exited = …;` 三行换成 `const moves = countMoves(longChanges);`，后面所有引用 `added`、`increased`、`exited` 的地方改成 `moves.opened`、`moves.added`、`moves.exited`。`verdict` 判断“整体加仓/减仓”如果用到这些变量，一并替换。
- 三格动作改为四格：`grid-cols-3` → `grid-cols-2 sm:grid-cols-4`，数组加一项 `{ label: lang === "zh" ? "减仓" : "Trimmed", value: moves.trimmed, color: "var(--ink-1)" }`，排在“加仓”之后、“清仓”之前。
- 在这个四格的 `</div>` 之后，紧跟一行清仓名单（这是“本季清仓”唯一一次出现）：

```tsx
              {moves.exited > 0 && (
                <QuarterMovesExited lang={lang} exits={longChanges.filter((c) => c.kind === "exited").map((c) => ({ name: cleanIssuer(c.issuer), href: stockPath(lang, cusipToTicker.get(c.cusip) ?? c.cusip) }))} />
              )}
```

为避免再造一个组件，`QuarterMovesExited` 用一个本地函数实现，`splitNames` 来自 Task 10：

```tsx
function QuarterMovesExited({ lang, exits }: { lang: Lang; exits: { name: string; href: string }[] }) {
  const { shown, rest } = splitNames(exits);
  return (
    <p className="mt-3 text-sm text-[var(--tt-muted)]">
      {lang === "zh" ? `清仓 ${exits.length}：` : `Exited ${exits.length}: `}
      {shown.map((e, i) => (
        <React.Fragment key={e.href}>
          {i > 0 && (lang === "zh" ? "、" : ", ")}
          <Link href={e.href} className="text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]">{e.name}</Link>
        </React.Fragment>
      ))}
      {rest > 0 && (lang === "zh" ? ` 另 ${rest} 只` : ` +${rest} more`)}
    </p>
  );
}
```

- 删除 `HoldingsTable` 内的 `const exits = …; const EXIT_CAP = 12;` 和 `{exits.length > 0 && (…)}` 整块，以及 `HOLD_COPY` 两种语言里的 `exitedTitle`、`more`。

- [ ] **Step 4: 运行**

Run: `npx tsx "src/app/[lang]/investors/[slug]/movesCount.check.ts" && npx tsx src/lib/entity/quarterMovesText.check.ts && npx tsc --noEmit -p . && npx eslint "src/app/[lang]/investors/[slug]"`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add "src/app/[lang]/investors/[slug]" src/lib/entity/quarterMovesText.check.ts
git commit -m "fix(investors): 本季动作补上减仓、四项只说一次,清仓名单并入动作区"
```

### Task 12：权重只写数字，动作按股数单独标

**Files:**
- Modify: `src/components/common/qoqDirection.tsx`（`WeightQoQ`；新增 `MoveMark`）
- Create: `src/components/common/qoqDirection.check.ts`（测纯文案函数 `moveMarkText`）
- Modify: `src/app/[lang]/stocks/[ticker]/page.tsx`（`HoldersTable` 的 investor 列与 weight 列）

**Interfaces:**
- Produces:
  - `export function moveMarkText(kind: HoldingChange["kind"] | undefined, lang: Lang): string | null`：new → 新建 / New，increased → 增持 / Added，decreased → 减持 / Trimmed，exited 或 undefined → null
  - `MoveMark({ kind, lang })`
  - `WeightQoQ({ cur, prior, lang })`：只渲染数字，不再接收 `kind`

- [ ] **Step 1: 写失败测试**

```ts
// 运行: npx tsx src/components/common/qoqDirection.check.ts
import assert from "node:assert/strict";
import { moveMarkText, fmtPct1 } from "./qoqDirection";

assert.equal(moveMarkText("new", "zh"), "新建");
assert.equal(moveMarkText("increased", "en"), "Added");
assert.equal(moveMarkText("decreased", "zh"), "减持");
assert.equal(moveMarkText(undefined, "zh"), null, "无动作(持平或不同期行)→ 不标");
assert.equal(moveMarkText("exited", "en"), null, "清仓不在持有人表里");
assert.equal(fmtPct1(0.2204), "22.0%");
console.log("qoqDirection.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/components/common/qoqDirection.check.ts`
Expected: `moveMarkText is not a function`。如果 `.tsx` 被 tsx 直接导入时报 JSX 错误，就把 `moveMarkText` 和 `fmtPct1` 移到新文件 `src/components/common/qoqText.ts`，check 改为从那里导入，`qoqDirection.tsx` 再从 `qoqText.ts` 导入。

- [ ] **Step 3: 实现**

`qoqDirection.tsx`：

```tsx
const MOVE_LABEL: Record<Lang, Record<"new" | "increased" | "decreased", string>> = {
  zh: { new: "新建", increased: "增持", decreased: "减持" },
  en: { new: "New", increased: "Added", decreased: "Trimmed" },
};

/** 本季动作(按申报股数判断,与报告页同口径);持平 / 不同期 / 清仓 → null。 */
export function moveMarkText(kind: HoldingChange["kind"] | undefined, lang: Lang): string | null {
  if (kind === "new" || kind === "increased" || kind === "decreased") return MOVE_LABEL[lang][kind];
  return null;
}

/** 名字旁的动作小标:中性色,不带方向箭头(颜色与字形语义留给第 3 步)。 */
export function MoveMark({ kind, lang }: { kind?: HoldingChange["kind"]; lang: Lang }): React.ReactElement | null {
  const text = moveMarkText(kind, lang);
  return text ? <span className="font-data text-xs text-[var(--tt-faint)]">{text}</span> : null;
}

/**
 * QoQ 权重单元格:只写数字(上季 → 本季)。不带箭头 —— 权重会随股价涨跌变,方向可能与股数相反;
 * 动作另由 MoveMark 按股数标出(spec 2026-10-23 §三.3)。上季无该持仓 → “— → X%”。
 */
export function WeightQoQ({ cur, prior }: { cur?: number; prior?: number; lang: Lang }): React.ReactElement {
  return (
    <span className="font-data tabular-nums text-[var(--tt-muted)]">
      {prior == null ? "—" : fmtPct1(prior)} → {fmtPct1(cur)}
    </span>
  );
}
```

删除旧 `WeightQoQ` 主体、`NEW_LABEL`，以及文件头关于“▲绿/▼琥珀”的注释（改成一句：“权重只写数字;动作由 MoveMark 按股数标出”）。

个股页 `HoldersTable`：
- investor 列的 `cell` 改为：

```tsx
      cell: (r) => (
        <span className="inline-flex items-baseline gap-1.5">
          {r.person}
          {offQuarter(r) ? (
            <span className="font-data text-xs text-[var(--tt-faint)]">{quarterLabel(r.period ?? null)}</span>
          ) : (
            <MoveMark kind={r.kind} lang={lang} />
          )}
        </span>
      ),
```

- weight 列：`<WeightQoQ cur={r.weight} prior={r.priorWeight} lang={lang} />`（去掉 `kind`）。
- 运行 `grep -rn "WeightQoQ" src`，其他调用处同样去掉 `kind` 参数。

- [ ] **Step 4: 运行**

Run: `npx tsx src/components/common/qoqDirection.check.ts && npx tsc --noEmit -p . && npx eslint src/components/common "src/app/[lang]/stocks/[ticker]/page.tsx"`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/components/common "src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "fix(stocks): 权重栏只写数字,增持/减持/新建按股数在名字旁单独标出"
```

### Task 13：申报季混季行的可见说明

**Files:**
- Create: `src/lib/stocks/filingSeasonNote.ts`、`src/lib/stocks/filingSeasonNote.check.ts`
- Modify: `src/app/[lang]/stocks/[ticker]/page.tsx`（约 338 行的 `displayPeriod`；`HoldersTable` props 与 JSX）

**Interfaces:**
- Consumes: `effectiveMovesPeriod(...)` 的 `{ period, reason, maxPeriod, coverage }`（Task 1）
- Produces: `export function filingSeasonNote(eff: EffectiveMovesPeriod, hasOffQuarterRows: boolean, lang: Lang): string | null`

- [ ] **Step 1: 写失败测试**

```ts
// 运行: npx tsx src/lib/stocks/filingSeasonNote.check.ts
import assert from "node:assert/strict";
import { filingSeasonNote } from "./filingSeasonNote";

const season = {
  period: "2026-06-30",
  reason: "before_deadline" as const,
  maxPeriod: "2026-09-30",
  coverage: { filed: 2, total: 94, excluded: 3 },
};
assert.equal(
  filingSeasonNote(season, true, "zh"),
  "Q3 2026 申报中 2/94。标 Q3 2026 的行是新申报，不计入上面的 Q2 2026 动作。",
);
assert.equal(
  filingSeasonNote(season, true, "en"),
  "Q3 2026 filings arriving: 2 of 94. Rows marked Q3 2026 are new filings and aren't counted in the Q2 2026 moves above.",
);
assert.equal(filingSeasonNote(season, false, "zh"), "Q3 2026 申报中 2/94。", "表里没有混季行 → 只写进度");
assert.equal(
  filingSeasonNote({ ...season, period: "2026-09-30", reason: "due_and_covered" }, true, "zh"),
  null,
  "已切季 → 不写",
);
assert.equal(filingSeasonNote({ ...season, reason: "empty", maxPeriod: null }, false, "en"), null);
console.log("filingSeasonNote.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/stocks/filingSeasonNote.check.ts`
Expected: Cannot find module。

- [ ] **Step 3: 实现**

```ts
import type { Lang } from "@/lib/nav";
import { quarterLabel, type EffectiveMovesPeriod } from "@/lib/freshness/derive";

/**
 * 持有人表上方的申报季说明(spec 2026-10-23 §三.3 G):新季未切换时写“Qn 申报中 n/M”;
 * 表里有早申报者的新季行时,再说明这些行不计入展示季度的动作。已切季 / 无数据 → null。
 */
export function filingSeasonNote(eff: EffectiveMovesPeriod, hasOffQuarterRows: boolean, lang: Lang): string | null {
  if (eff.reason !== "before_deadline" && eff.reason !== "low_coverage") return null;
  if (!eff.maxPeriod || !eff.period || eff.maxPeriod === eff.period) return null;
  const next = quarterLabel(eff.maxPeriod);
  const cur = quarterLabel(eff.period);
  const { filed, total } = eff.coverage;
  if (lang === "zh") {
    const head = `${next} 申报中 ${filed}/${total}。`;
    return hasOffQuarterRows ? `${head}标 ${next} 的行是新申报，不计入上面的 ${cur} 动作。` : head;
  }
  const head = `${next} filings arriving: ${filed} of ${total}.`;
  return hasOffQuarterRows ? `${head} Rows marked ${next} are new filings and aren't counted in the ${cur} moves above.` : head;
}
```

注意：中文“上面的”指动作行，它在表格上方；说明句放在动作行之后、表格之前，这样读起来是对的。

- [ ] **Step 4: 接进个股页**

- 约 338 行：`const displayPeriod = effectiveMovesPeriod(...).period ?? "";` 改为

```ts
  const movesEff = effectiveMovesPeriod(idx.managers.map((m) => m.period), new Date());
  const displayPeriod = movesEff.period ?? "";
```

- `HoldersTable` 加 prop `seasonNote: (hasOffQuarterRows: boolean) => string | null`，页面传 `seasonNote={(has) => filingSeasonNote(movesEff, has, lang)}`。
- 在 `HoldersTable` 里，`QuarterMovesLine` 之后加：

```tsx
        {(() => {
          const note = seasonNote(sorted.some(offQuarter));
          return note ? <p className="text-xs text-[var(--tt-muted)]">{note}</p> : null;
        })()}
```

- 趋势旁的标注：在 `{trend.length >= 2 && (<div className="mb-3"><HolderTrend … /></div>)}` 的 div 里、`HolderTrend` 之后加 `{seasonNote(false) && <span className="ml-2 font-data text-xs text-[var(--tt-faint)]">{seasonNote(false)}</span>}`，复用同一句进度文字。

- [ ] **Step 5: 运行**

Run: `npx tsx src/lib/stocks/filingSeasonNote.check.ts && npx tsc --noEmit -p . && npx eslint "src/app/[lang]/stocks/[ticker]/page.tsx" src/lib/stocks`
Expected: 全部通过。

- [ ] **Step 6: Commit，推送，开 PR B**

```bash
git add src/lib/stocks/filingSeasonNote.ts src/lib/stocks/filingSeasonNote.check.ts "src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "fix(stocks): 申报季在持有人表上方写明“Qn 申报中 n/M”,标出新季行不计入本季动作"
git push https://github.com/xjing-umich/ny-fed-monitor.git fix/data-consistency-labels
```

PR B 标题：`fix: 估值说法全站同源、本季动作只说一次、权重箭头与申报季说明`，base 为 `db-foundation`。

### Task 14：PR B 合并前验证

**Files:** 无代码改动。

- [ ] **Step 1: 全量自检**

Run（在 `web/`）：

```bash
fails=0; for f in $(find src scripts -name "*.check.ts" -not -path "*/node_modules/*"); do npx tsx "$f" >/dev/null 2>&1 </dev/null || { echo "FAIL $f"; fails=$((fails+1)); }; done; echo "failures: $fails"
```

Expected: 只列出 3 个已知失败（见“开工前”）。

- [ ] **Step 2: Vercel 预览逐条对照 spec 第二节**

在 PR B 预览上，以 375px 和 1440px、中文和英文、深色和浅色，打开下列页面并截图：

| 页面 | 要看到 |
|---|---|
| `/stocks/AAPL`、`/zh/stocks/AAPL` | 本季动作只有一行，清仓带名字（A 已修、C 已修）；权重栏没有箭头，名字旁标增持或减持（D）；申报季时表上方有“Q3 申报中 n/M”（G） |
| `/investors/berkshire-hathaway`、`/zh/…` | 估值列里 Apple 写“高于价值带”，不是“—”（A）；Macy's 写“击球区 · 待确认”，页底写“没有已确认的击球区持仓，另有 1 只待确认（Macy's）”（B）；四格动作含减仓 6（C） |
| `/stocks/M` | 标题徽章写“Strike zone · pending”（B） |
| `/`、`/zh` | 击球区卡片有“内在价值”列，PDD 约 $343（I）；说明句不再说“低于价值带” |
| `/stocks/screener`、`/zh/stocks/screener` | 有“内在价值”列和单法脚注；说明句是新文案（I） |

- [ ] **Step 3: 收尾**

在 PR B 描述里贴截图和对照结果。合并后，如果 Q3 报告行已存在，跑 `curl -X POST "https://thecompounder.fyi/api/revalidate?source=report" -H "Authorization: Bearer $INGEST_SECRET"` 刷新报告页缓存；这一步由站长执行。
