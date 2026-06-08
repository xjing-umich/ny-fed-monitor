# Phase 1E — Provenance / Freshness（脊梁侧派生层）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户在个股页、投资人页、首页一眼看到每个数字的「新鲜 / 过期」状态（绿/琥珀/灰灯），通过一个零新表、零新查询、零 macro 耦合的纯函数派生层实现。

**Architecture:** 新增一个纯逻辑模块 `lib/freshness/derive.ts`（无 DB、无 server-only，可独立运行验证），从各页面**已经加载的数据**（价格的 `date`、13F 的 `period`）派生新鲜度；新增一个极小的 `FreshnessDot` 组件渲染状态灯；`SourceFooter` 的 `Source` 类型加一个可选 `status` 字段；三处页面把已有数据喂给纯函数并传 `status`。

**Tech Stack:** TypeScript、Next.js 16 App Router（heavily modified — 改任何渲染/路由前先读 `web/node_modules/next/dist/docs/`）、React Server Components、tsx（项目所有脚本的 runner，用于纯逻辑自检）。

**关键约束（来自 spec 与项目记忆）：**
- 本项目**无常驻测试套件**（solo dev），`vitest` 未安装。纯逻辑用 `node:assert` + `tsx` 自检脚本验证（零新依赖），**不引入 vitest**。
- 日常门禁 = `tsc --noEmit` + `npm run build` + 人工看页面。
- 本机 nvm 默认是古董 node v10；**务必用 node 20** 跑 tsc/build/tsx（worktree 内已确认 `node -v` = v20.20.0；若不是，先 `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`）。
- **不做** `prices.as_of` 写入（prices 表 DDL 不在 repo、无法确认列存在，且本期范围未选它）。
- **不动** macro 模块（`lib/db/freshness.ts`、`market_*` 表、macro 页面）。
- 所有命令在 worktree 根 `/.claude/worktrees/phase1e-provenance-freshness/` 下执行；Next 应用根是其下的 `web/`。

**新增/修改文件清单：**
- Create: `web/src/lib/freshness/derive.ts` — 纯函数新鲜度判定（唯一新增逻辑）
- Create: `web/src/lib/freshness/derive.check.ts` — tsx 自检（node:assert，非常驻测试）
- Create: `web/src/components/entity/FreshnessDot.tsx` — 状态灯小组件
- Modify: `web/src/components/entity/SourceFooter.tsx` — `Source` 加可选 `status`，渲染灯
- Modify: `web/src/components/entity/EntityPage.tsx:28` — `sources` 类型改用 `Source[]`
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx` — 追踪 `latestPeriod`，价格+13F 各带 `status`
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx:392` — 13F source 带 `status`
- Modify: `web/src/app/[lang]/page.tsx` — 首页 dateline 灯改为 13F 新鲜度灯

---

## Task 1: 纯函数新鲜度模块 `derive.ts`

**Files:**
- Create: `web/src/lib/freshness/derive.ts`
- Check: `web/src/lib/freshness/derive.check.ts`

判定规则（来自 spec §3）：
- `priceFreshness(latestDate, today)`：`latestDate` 空 → `empty`；`tradingDaysBetween(latestDate, today) > 3` → `stale`；否则 `fresh`。
- `filingFreshness(latestPeriod, today)`：`latestPeriod` 空 → `empty`；`latestPeriod` 早于 `mostRecentDueQuarter(today)` → `stale`（晚报）；否则 `fresh`。
- `tradingDaysBetween` 只排除周末，不排除联邦假日（节假日附近偏向标 stale，符合"宁可提示旧、不可谎称新"）。
- 所有日期按 UTC 解析，`today` 注入（不在内部 `new Date()`）→ 纯、可测。

- [ ] **Step 1: 写自检（先失败）`derive.check.ts`**

```ts
// 纯逻辑自检——用 node:assert，零新依赖。运行: npx tsx src/lib/freshness/derive.check.ts
// 本项目无常驻测试套件(solo dev)，此文件为 ad-hoc 自检，不接入 CI。
import assert from "node:assert/strict";
import {
  priceFreshness,
  filingFreshness,
  tradingDaysBetween,
  mostRecentDueQuarter,
} from "./derive";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

// --- tradingDaysBetween: 只数周一~周五 ---
assert.equal(tradingDaysBetween(d("2026-06-08"), d("2026-06-08")), 0, "同日=0");
assert.equal(tradingDaysBetween(d("2026-06-08"), d("2026-06-09")), 1, "周一→周二=1");
// 周五(06-05) → 下周一(06-08): 跨周末, 只数周一 = 1
assert.equal(tradingDaysBetween(d("2026-06-05"), d("2026-06-08")), 1, "跨周末只数1个工作日");
// 周五(06-05) → 周五(06-12): 6/8,9,10,11,12 = 5 个工作日
assert.equal(tradingDaysBetween(d("2026-06-05"), d("2026-06-12")), 5, "整周=5");

// --- priceFreshness ---
assert.equal(priceFreshness(null, d("2026-06-08")), "empty", "无价=empty");
assert.equal(priceFreshness("2026-06-08", d("2026-06-08")), "fresh", "当天=fresh");
// 周五的价格, 到下周一(隔周末) → 1 个工作日 ≤ 3 → fresh
assert.equal(priceFreshness("2026-06-05", d("2026-06-08")), "fresh", "隔周末仍fresh");
// 落后 4 个工作日 → stale
assert.equal(priceFreshness("2026-06-05", d("2026-06-12")), "stale", ">3工作日=stale");

// --- mostRecentDueQuarter: 最近一个已过 45 天截止的季度末 ---
// 2026-06-08: Q1(03-31)+45=05-15 已过, Q2(06-30) 未到 → 03-31
assert.equal(
  mostRecentDueQuarter(d("2026-06-08")).toISOString().slice(0, 10),
  "2026-03-31",
  "6月初最近到期季=Q1",
);
// 2026-05-14: 还差一天到 Q1 截止(05-15) → 退回 Q4 2025(12-31)
assert.equal(
  mostRecentDueQuarter(d("2026-05-14")).toISOString().slice(0, 10),
  "2025-12-31",
  "Q1截止前一天=上年Q4",
);
// 跨年: 2026-02-20, Q4 2025(12-31)+45=2026-02-14 已过 → 2025-12-31
assert.equal(
  mostRecentDueQuarter(d("2026-02-20")).toISOString().slice(0, 10),
  "2025-12-31",
  "2月下旬=上年Q4",
);

// --- filingFreshness ---
assert.equal(filingFreshness(null, d("2026-06-08")), "empty", "无filing=empty");
// 当季已报: 最近到期季是 03-31, 申报期=03-31 → fresh
assert.equal(filingFreshness("2026-03-31", d("2026-06-08")), "fresh", "当季已报=fresh");
// 晚一季: 最新只报到 2025-12-31 < 2026-03-31 → stale
assert.equal(filingFreshness("2025-12-31", d("2026-06-08")), "stale", "晚一季=stale");
// 晚三季(Scion 场景): 报到 2025-06-30 → stale
assert.equal(filingFreshness("2025-06-30", d("2026-06-08")), "stale", "晚三季=stale");

console.log("derive.check.ts: all assertions passed ✓");
```

- [ ] **Step 2: 运行自检确认失败（模块还不存在）**

Run（在 worktree 根）:
```bash
cd web && npx tsx src/lib/freshness/derive.check.ts
```
Expected: FAIL —— 报 `Cannot find module './derive'`（derive.ts 尚未创建）。

- [ ] **Step 3: 写最小实现 `derive.ts`**

```ts
// 脊梁侧新鲜度的唯一新增逻辑：纯函数、无 DB、无 server-only → 可独立验证。
// 取值是 macro `MarketFreshnessStatusValue` 的子集(fresh/stale/empty)，将来并轨零摩擦，
// 当前不 import 任何 macro 模块。

export type FreshnessStatus = "fresh" | "stale" | "empty";

export const PRICE_STALE_AFTER_TRADING_DAYS = 3; // 价格落后超过 3 个工作日 → stale
export const FILING_DEADLINE_DAYS = 45; // 13F：季度末 + 45 天为 SEC 截止日

// YYYY-MM-DD → UTC Date（避免本地时区漂移）。非法/空 → null。
function parseUTC(s: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

// 归一到 UTC 当日 0 点。
function utcDay(dt: Date): Date {
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

function addDays(dt: Date, n: number): Date {
  return new Date(dt.getTime() + n * 86400000);
}

function isWeekday(dt: Date): boolean {
  const day = dt.getUTCDay(); // 0=Sun, 6=Sat
  return day !== 0 && day !== 6;
}

// (from, to] 区间内的工作日(周一~周五)计数。to ≤ from → 0。不排除联邦假日。
export function tradingDaysBetween(from: Date, to: Date): number {
  const a = utcDay(from);
  const b = utcDay(to);
  if (b <= a) return 0;
  let count = 0;
  for (let cur = addDays(a, 1); cur <= b; cur = addDays(cur, 1)) {
    if (isWeekday(cur)) count++;
  }
  return count;
}

// 最近一个「已过 45 天 SEC 截止日」的季度末(Mar31/Jun30/Sep30/Dec31)。
export function mostRecentDueQuarter(today: Date): Date {
  const t = utcDay(today);
  const quarterEnds = [
    [2, 31], // Mar 31  (month index 2)
    [5, 30], // Jun 30
    [8, 30], // Sep 30
    [11, 31], // Dec 31
  ] as const;
  // 从今年和去年的所有季度末里，挑出「截止日(QE+45)已过」且最晚的那个。
  const year = t.getUTCFullYear();
  const candidates: Date[] = [];
  for (const y of [year, year - 1]) {
    for (const [mo, day] of quarterEnds) {
      candidates.push(new Date(Date.UTC(y, mo, day)));
    }
  }
  const due = candidates
    .filter((qe) => addDays(qe, FILING_DEADLINE_DAYS) <= t)
    .sort((x, y) => y.getTime() - x.getTime());
  // 理论上 due 必非空(去年同季一定已过)；兜底返回最早候选避免崩。
  return due[0] ?? candidates.sort((x, y) => x.getTime() - y.getTime())[0];
}

// 价格新鲜度：latestDate = 最新价格交易日 (YYYY-MM-DD)。
export function priceFreshness(latestDate: string | null, today: Date): FreshnessStatus {
  const d = parseUTC(latestDate);
  if (!d) return "empty";
  return tradingDaysBetween(d, today) > PRICE_STALE_AFTER_TRADING_DAYS ? "stale" : "fresh";
}

// 13F 新鲜度：latestPeriod = 某户最新 filing 期 (YYYY-MM-DD, 季度末)。
export function filingFreshness(latestPeriod: string | null, today: Date): FreshnessStatus {
  const p = parseUTC(latestPeriod);
  if (!p) return "empty";
  return p < mostRecentDueQuarter(today) ? "stale" : "fresh";
}
```

- [ ] **Step 4: 运行自检确认通过**

Run:
```bash
cd web && npx tsx src/lib/freshness/derive.check.ts
```
Expected: PASS —— 输出 `derive.check.ts: all assertions passed ✓`，退出码 0。

- [ ] **Step 5: tsc 确认类型干净**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错（baseline 已干净；若出现 `??`/`?.` 语法报错说明误用了 node v10 跑 tsc——切回 node 20）。

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/phase1e-provenance-freshness
git add web/src/lib/freshness/derive.ts web/src/lib/freshness/derive.check.ts
git commit -m "feat(freshness): pure derive module for spine price/13F freshness"
```

---

## Task 2: 状态灯组件 `FreshnessDot`

**Files:**
- Create: `web/src/components/entity/FreshnessDot.tsx`

极小展示组件：按 `fresh/stale/empty` 渲染绿/琥珀/灰圆点，带双语 `aria-label`/`title`（无障碍 + hover 说明）。无 state、无 effect，纯展示。

- [ ] **Step 1: 写组件**

```tsx
import type { FreshnessStatus } from "@/lib/freshness/derive";

type Lang = "zh" | "en";

const COLOR: Record<FreshnessStatus, string> = {
  fresh: "bg-emerald-500",
  stale: "bg-amber-500",
  empty: "bg-zinc-400",
};

const LABEL: Record<FreshnessStatus, { zh: string; en: string }> = {
  fresh: { zh: "数据新鲜", en: "Up to date" },
  stale: { zh: "数据可能过期", en: "May be stale" },
  empty: { zh: "暂无数据", en: "No data" },
};

export function FreshnessDot({ status, lang }: { status: FreshnessStatus; lang: Lang }) {
  const label = LABEL[status][lang];
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full align-middle ${COLOR[status]}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
```

- [ ] **Step 2: tsc 确认类型干净**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错（组件未被引用也应通过类型检查）。

- [ ] **Step 3: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/phase1e-provenance-freshness
git add web/src/components/entity/FreshnessDot.tsx
git commit -m "feat(freshness): FreshnessDot status indicator component"
```

---

## Task 3: `SourceFooter` 加 status 字段 + `EntityPage` 类型对齐

**Files:**
- Modify: `web/src/components/entity/SourceFooter.tsx`
- Modify: `web/src/components/entity/EntityPage.tsx:28`

`Source` 加可选 `status?: FreshnessStatus`；有 status 时在来源名前渲染一盏 `FreshnessDot`。`EntityPage` 当前把 `sources` 写成内联字面量类型 `{ name: string; asOf: string }[]`（line 28），改用 `Source[]` 才能携带 `status`。

- [ ] **Step 1: 改 `SourceFooter.tsx`——类型加字段、渲染灯**

把现有文件整体替换为：

```tsx
import { FreshnessDot } from "./FreshnessDot";
import type { FreshnessStatus } from "@/lib/freshness/derive";

type Lang = "zh" | "en";

export type Source = { name: string; asOf: string; status?: FreshnessStatus };

export type SourceFooterProps = {
  lang: Lang;
  sources: Source[];
};

export function SourceFooter({ lang, sources }: SourceFooterProps) {
  if (!sources.length) return null;

  const heading = lang === "zh" ? "数据来源" : "Sources";
  const asOfLabel = lang === "zh" ? "截至" : "as of";

  return (
    <div className="border-t border-border pt-3">
      <p className="text-xs italic text-muted-foreground">
        <span className="not-italic font-medium uppercase tracking-[0.08em] text-[11px] text-[var(--tt-faint)]">
          {heading}
        </span>
        <span className="mx-1.5 text-[var(--tt-faint)]">·</span>
        {sources.map((src, i) => (
          <span key={src.name}>
            {i > 0 && <span className="mx-1.5 text-[var(--tt-faint)]">·</span>}
            {src.status && (
              <>
                <FreshnessDot status={src.status} lang={lang} />{" "}
              </>
            )}
            <span className="not-italic font-medium text-card-foreground">
              {src.name}
            </span>{" "}
            {asOfLabel} {src.asOf}
          </span>
        ))}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: 改 `EntityPage.tsx` 第 28 行——sources 类型用 `Source[]`**

当前 line 28：
```ts
  sources: { name: string; asOf: string }[];
```
改为：
```ts
  sources: Source[];
```
并确认文件顶部已能访问 `Source` 类型。当前文件第 11 行是 **re-export**（`export type { Source } from "./SourceFooter";`），它不会把 `Source` 引入本地作用域。在文件已有的 import 区加一行本地 import：
```ts
import type { Source } from "./SourceFooter";
```
（放在第 5 行 `import { SourceFooter } from "./SourceFooter";` 之后即可。）

- [ ] **Step 3: tsc 确认类型干净**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错。`EntityPage` 的 `sources` 现在接受可选 `status`，既有三处调用（个股/投资人/macro）传不带 status 的对象仍合法（可选字段）。

- [ ] **Step 4: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/phase1e-provenance-freshness
git add web/src/components/entity/SourceFooter.tsx web/src/components/entity/EntityPage.tsx
git commit -m "feat(freshness): SourceFooter renders status dot; EntityPage uses Source type"
```

---

## Task 4: 个股页接入（价格 + 13F 各带 status）

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

个股页已加载：`price`（含 `date`）、各 manager 的 `d.latest`（含 `period` 与 `filedAt`）。当前只追踪 `latestFiledAt`（用于 as-of 显示）。需**额外追踪 `latestPeriod`**（用于 13F 新鲜度判定，因 `filingFreshness` 按季度末 `period` 判定，而非申报日 `filedAt`）。as-of 展示文本保持用 `latestFiledAt` 不变。

- [ ] **Step 1: 加 import**

在文件顶部 import 区加：
```ts
import { priceFreshness, filingFreshness } from "@/lib/freshness/derive";
```
（`getLatestPrice` / `fmtPriceFact` 已 import，无需改。）

- [ ] **Step 2: 追踪 `latestPeriod`**

当前 line 184：
```ts
  let latestFiledAt = "";
```
改为：
```ts
  let latestFiledAt = "";
  let latestPeriod = "";
```

当前 line 197（循环内）：
```ts
    if (!latestFiledAt || d.latest.filedAt > latestFiledAt) latestFiledAt = d.latest.filedAt;
```
改为（紧随其后追加一行）：
```ts
    if (!latestFiledAt || d.latest.filedAt > latestFiledAt) latestFiledAt = d.latest.filedAt;
    if (!latestPeriod || d.latest.period > latestPeriod) latestPeriod = d.latest.period;
```

- [ ] **Step 3: sources 传 status**

当前 line 286-288：
```tsx
        sources={price
          ? [{ name: "SEC EDGAR 13F", asOf: latestFiledAt }, { name: "Finnhub", asOf: price.date }]
          : [{ name: "SEC EDGAR 13F", asOf: latestFiledAt }]}
```
改为：
```tsx
        sources={price
          ? [
              { name: "SEC EDGAR 13F", asOf: latestFiledAt, status: filingFreshness(latestPeriod || null, new Date()) },
              { name: "Finnhub", asOf: price.date, status: priceFreshness(price.date, new Date()) },
            ]
          : [{ name: "SEC EDGAR 13F", asOf: latestFiledAt, status: filingFreshness(latestPeriod || null, new Date()) }]}
```

- [ ] **Step 4: tsc 确认类型干净**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错。

- [ ] **Step 5: 人工冒烟（可选但推荐）**

若本地 `web/.env.local` 已配 Supabase 只读 key：
```bash
cd web && npm run dev
```
访问 `http://localhost:3000/en/stocks/AAPL`，确认 Sources 脚注里 SEC EDGAR 13F 与 Finnhub 各带一盏灯（价格 cron 当前停用 → Finnhub 大概率显示琥珀/stale，这是真实状态，非 bug）。无 key 的本地回退应显示灰灯（empty）且不崩。看完 `Ctrl-C` 停 dev。

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/phase1e-provenance-freshness
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(freshness): stock page shows price + 13F freshness status"
```

---

## Task 5: 投资人页接入（13F status）

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`

该页已有 `latest`（FilingData，含 `.period` 与 `.filedAt`）。sources 当前用 `latest.filedAt` 作 as-of，新增 `status` 用 `filingFreshness(latest.period, ...)`。

- [ ] **Step 1: 加 import**

在文件顶部 import 区加：
```ts
import { filingFreshness } from "@/lib/freshness/derive";
```

- [ ] **Step 2: sources 传 status**

当前 line 392：
```tsx
        sources={[{ name: "SEC EDGAR 13F", asOf: latest.filedAt }]}
```
改为：
```tsx
        sources={[{ name: "SEC EDGAR 13F", asOf: latest.filedAt, status: filingFreshness(latest.period || null, new Date()) }]}
```

- [ ] **Step 3: tsc 确认类型干净**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/phase1e-provenance-freshness
git add "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(freshness): investor page shows 13F freshness status"
```

---

## Task 6: 首页 dateline 接入（整体 13F 新鲜度灯）

**Files:**
- Modify: `web/src/app/[lang]/page.tsx`

首页 dateline 现有一盏**静态** accent 圆点（line ~103，`bg-[var(--tt-accent)]`）和一行 "As of {period} · …"。把静态圆点替换为由 `filingFreshness(period, ...)` 驱动的 `FreshnessDot`（首页无价格，故只反映 13F）。

- [ ] **Step 1: 加 import**

在文件顶部 import 区加：
```ts
import { FreshnessDot } from "@/components/entity/FreshnessDot";
import { filingFreshness } from "@/lib/freshness/derive";
```

- [ ] **Step 2: 替换静态圆点**

当前（dateline 内）：
```tsx
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--tt-accent)]" aria-hidden />
```
改为：
```tsx
        <FreshnessDot status={filingFreshness(period || null, new Date())} lang={lang} />
```
（`period` 已在 line 59 定义：`const period = topManagers[0]?.period ?? "";`；`lang` 为页面参数，作用域内可用。`FreshnessDot` 自带 `aria-label`/`title`，替换后无障碍信息更丰富。）

- [ ] **Step 3: tsc 确认类型干净**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错。

- [ ] **Step 4: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/phase1e-provenance-freshness
git add "web/src/app/[lang]/page.tsx"
git commit -m "feat(freshness): homepage dateline reflects 13F freshness"
```

---

## Task 7: 全量门禁 + 收尾

**Files:** 无（仅验证）

- [ ] **Step 1: 纯逻辑自检再跑一次**

Run:
```bash
cd web && npx tsx src/lib/freshness/derive.check.ts
```
Expected: `derive.check.ts: all assertions passed ✓`。

- [ ] **Step 2: tsc 全量**

Run:
```bash
cd web && node_modules/typescript/bin/tsc --noEmit
```
Expected: 无报错。

- [ ] **Step 3: 生产构建（必过门禁）**

Run:
```bash
cd web && npm run build
```
Expected: 构建成功，无类型/编译错误。

- [ ] **Step 4: 人工三页核验（dev 已开则直接看；否则 `npm run dev`）**

- 个股页 `/en/stocks/AAPL`：Sources 有两盏灯（13F + Finnhub）。
- 投资人页（任一 slug，如 `/en/investors/<slug>`）：Sources 有一盏 13F 灯。
- 首页 `/en`：dateline 圆点为新鲜度灯（hover 有 title）。
- 无 Supabase key 的本地回退：灯显示灰（empty），页面不崩。

- [ ] **Step 5: 确认无遗留改动**

Run:
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/phase1e-provenance-freshness
git status --short
```
Expected: 工作区干净（全部已提交）。

---

## 验收标准（来自 spec §9，本期范围）

- 个股页价格与 13F 各显示来源 + as-of + 新鲜度灯；价格 cron 停用导致 Finnhub 标琥珀属真实状态。
- 投资人页带 13F 新鲜度灯；构造晚报户可见琥珀。
- 首页 dateline 有整体 13F 新鲜度灯。
- `derive.ts` 自检通过；`npm run build` 通过；JSON 回退（无密钥本地）显示灰灯且不崩。
- 未新建任何 DB 表；未改动 macro 模块与文件。
- **不含** `prices.as_of` 写入（本期范围外）。

## 自检：净增清单（简洁）

- 新增 1 纯模块 `lib/freshness/derive.ts`（+ tsx 自检）。
- 新增 1 小组件 `FreshnessDot.tsx`。
- 改 `SourceFooter.tsx` 加 1 可选字段 + 渲染灯；`EntityPage.tsx` 1 行类型对齐。
- 3 处页面接入（个股 / 投资人 / 首页）调用纯函数。

零新表、零新查询、零 macro 耦合、零新依赖（不引 vitest）。
