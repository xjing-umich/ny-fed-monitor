# 详情页先结论后证据（首期 UX 第 4 步）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal：** 个股页首屏给出结论（价格在价值带的哪里 + 谁在持有），证据按“持有人 → 估值与方法 → 生意质量”排在后面并可一点跳到；导航直达击球区；绿色只表达估值，13F 动作改用字形。

**Architecture：** 估值卡加 `part` 参数拆成“摘要 / 明细”两半，摘要进新的结论带组件；页面展示决策（左栏状态、锚点列表、持有人文字）抽成纯函数测试；颜色改走已有的 `--val-*` 令牌，动作字形集中在 `quarterMovesText.ts`。两个 PR：PR 1 个股页（任务 1–5），PR 2 导航 / 颜色字形 / 投资人页（任务 6–10）。

**Tech Stack：** Next.js 16 App Router（RSC、零 hydration）、TypeScript、Tailwind v4 任意值类（如 `border-[var(--val-below)]/50`）、`*.check.ts(x)` 自检（`npx tsx <file>`；渲染检查用 `react-dom/server` 的 `renderToStaticMarkup`，仓库已有先例 `src/components/home/StrikeLeadersCard.check.tsx`）。

**Spec：** `docs/superpowers/specs/2026-10-25-detail-conclusion-first-design.md`

## 开工前

- **PR 1** 分支：本计划所在分支 `plan/detail-conclusion-first`（基于 `db-foundation @ c64a25a`，已含 spec 与本计划），改名推送为 `fix/stock-conclusion-band` 即可，或直接在其上开发。
- **PR 2** 分支：PR 1 合并后从最新 `db-foundation` 开 `fix/nav-colors-moves`。
- 命令都在 `web/` 下运行：`export PATH=/private/tmp/claude-501/-Users-junlinzhu-Desktop-TheCompounder/a7c1da3e-a981-4649-8f27-6ea4dc306a59/scratchpad/gitshim:/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH`。推送：`git push https://github.com/xjing-umich/ny-fed-monitor.git <branch>`。
- 行号以 `c64a25a` 为准，开工时按代码片段定位。
- 已知 3 个 `.check.ts` 在 base 上就失败，与本计划无关：`scripts/aggregations.check.ts`、`scripts/resolve.check.ts`（缺 `server-only`）、`src/lib/valuation/ownerEarningsDcf.check.ts`。
- `web/AGENTS.md`：本仓库的 Next.js 与训练数据不同；本计划只改 RSC 组件与 TS，不引入新框架 API。

## Global Constraints

- 不新增 Supabase 查询；不改估值引擎（`deriveValuationVerdict.ts`、`strikeZone.ts`）和任何计算出的数字。
- URL、SEO 结构、SSR、结构化数据（JSON-LD）不变；埋点事件名不变。
- 零 hydration：不新增客户端组件（锚点导航纯 CSS sticky；`TopNav` / `MobileDrawer` 本来就是客户端组件，只改其数据与判断函数）。
- 中英文对等，各自核对 `docs/copy-voice.md`；合规只说位置和计数。
- 每个事实一页只可见一次：持有人数、本季动作、标尺从原位置**移到**结论带，不复制。
- 颜色：`--val-below`（击球区 / 低于内在价值）、`--val-within`（价值带内）、`--val-above`（高于价值带）只给估值；13F 动作用 ● 新建 ▲ 增持 ▼ 减持 ○ 清仓，正文色。
- 顶栏高度：<1024px 为 56px（`h-14`），≥1024px（lg）为 60px。锚点导航只在 ≥768px（md）吸顶，`md:sticky md:top-14 lg:top-[60px]`；<768px 不吸顶。区块 `scroll-margin-top` 用 `scroll-mt-32`（128px）。
- 结论带不写“最大持有人”一句（持有人表第一行和文字摘要已有）。

## 关于 spec 的一处细化

spec §三.1 写结论带左栏“第一行：现价”。读代码后确认，估值卡摘要（`ValueSpine`）里的标尺游标已经用大号数字显示现价，摘要末尾还有“价格截至 日期 · 来源 · 可能过期”一行。为不重复同一事实，**有标尺时左栏不再单列现价**；只在没有标尺的状态（未评估、拆股暂停、控股公司不可评估、护城河失真、财报存疑）单列现价（沿用 `fmtPriceFact` / `priceFactNote` / 过期置灰）。安全边际仍按 `marginShown` 条件显示在左栏顶部。

## Review Focus

1. **没有估值的股票**（无地板，如部分 ADR / 新股）：结论带左栏写“未评估”和原因，锚点导航里没有“估值与方法”。任务 2 测试。
2. **控股公司**（BRK.B，`holdcoNotAssessable && holdcoSotp`）：左栏是 SOTP 中枢 + 标尺，下方估值区块只剩 SOTP 细表，不再画第二个标尺。任务 2 测试状态，任务 4 接线。
3. **锚点跳转后标题被顶栏挡住**：区块要有 `scroll-mt-32`。任务 3 渲染检查断言 class；任务 5 预览实测。
4. **导航高亮**：在 `/stocks/screener`（含 `?view=…`、含 `/zh` 前缀）时高亮“击球区”、不高亮“个股”；在 `/stocks/AAPL` 高亮“个股”。任务 6 测试。
5. **1024px 宽的顶栏**加了第五项后不横向溢出。任务 10 预览实测 `scrollWidth`。

---

# PR 1：个股页结论带（任务 1–5）

### Task 1：估值卡拆成摘要 / 明细两半

**Files:**
- Modify: `src/components/valuation/EarningsPowerFloorCard.tsx`（导出的 `EarningsPowerFloorCard`，约 767–830 行）
- Test: `src/components/valuation/EarningsPowerFloorCard.check.tsx`（新建）

**Interfaces:**
- Produces: `EarningsPowerFloorCard` 新增可选 prop `part?: "all" | "summary" | "details"`，默认 `"all"`。
  - `"summary"`：只渲染摘要（`ValueSpine` / `CompactFloor`；`per_share_unavailable` 时只渲染 reason 段落）。
  - `"details"`：只渲染方法与数字（`MethodDetails`；`per_share_unavailable` 时只渲染那个 `<details>`）。

- [ ] **Step 1: 写失败的渲染检查**

```tsx
// 运行: npx tsx src/components/valuation/EarningsPowerFloorCard.check.tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EarningsPowerFloorCard } from "./EarningsPowerFloorCard";
import type { PerShareUnavailable } from "@/lib/valuation/types";

const floor: PerShareUnavailable = { kind: "per_share_unavailable", reason: "每股口径暂不可用(测试)" };
const text = (part?: "all" | "summary" | "details") =>
  renderToStaticMarkup(<EarningsPowerFloorCard floor={floor} lang="zh" part={part} />).replace(/<[^>]+>/g, " ");

const all = text();
assert.ok(all.includes("每股口径暂不可用(测试)") && all.includes("方法与数字"), "默认 all:两半都在");
const summary = text("summary");
assert.ok(summary.includes("每股口径暂不可用(测试)"), "summary 含原因");
assert.ok(!summary.includes("方法与数字"), "summary 不含方法折叠");
const details = text("details");
assert.ok(details.includes("方法与数字"), "details 含方法折叠");
assert.ok(!details.includes("每股口径暂不可用(测试)"), "details 不含摘要");
console.log("EarningsPowerFloorCard.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/components/valuation/EarningsPowerFloorCard.check.tsx`
Expected: 失败于 “summary 不含方法折叠”（当前忽略 `part`，总是两半都渲染）。

- [ ] **Step 3: 实现**

在 props 类型里加：

```ts
  /** 个股页结论带只要摘要(标尺 + 结论句),估值区块只要明细(方法与数字);默认两半都渲染。 */
  part?: "all" | "summary" | "details";
```

解构加 `part = "all"`。`per_share_unavailable` 分支改为：

```tsx
  if (floor.kind === "per_share_unavailable") {
    return (
      <div className="space-y-3">
        {part !== "details" && <p className="text-sm text-[var(--tt-muted)]">{floor.reason}</p>}
        {part !== "summary" && (
          <details className="text-xs text-[var(--tt-muted)]">
            <summary className="cursor-pointer text-[var(--tt-faint)] max-sm:min-h-[44px] max-sm:py-1">
              {t.methodSummary}
            </summary>
            <p className="mt-2">{t.methodDisclaimer}</p>
          </details>
        )}
      </div>
    );
  }
```

主返回体改为：

```tsx
  return (
    <div className="space-y-3">
      {part !== "details" &&
        (showSpine ? (
          <ValueSpine floor={floor} sz={strikeZone!} oeDcf={oeDcf} reconciliation={reconciliation} issuer={issuer} ticker={ticker} lang={lang} showStatus={showStatus} verdict={verdict} />
        ) : showCompactFloor ? (
          <CompactFloor
            suppressedReason={strikeZone?.currencyMismatch ? strikeZone.suppressedReason : undefined}
            lang={lang}
          />
        ) : null)}
      {part !== "summary" && (
        <MethodDetails floor={floor} sz={strikeZone} oeDcf={oeDcf} reconciliation={reconciliation} lang={lang} ttmPeriodEnd={ttmPeriodEnd} />
      )}
    </div>
  );
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx tsx src/components/valuation/EarningsPowerFloorCard.check.tsx && npx tsc --noEmit -p .`
Expected: `EarningsPowerFloorCard.check OK`，tsc 无输出。

- [ ] **Step 5: Commit**

```bash
git add src/components/valuation/EarningsPowerFloorCard.tsx src/components/valuation/EarningsPowerFloorCard.check.tsx
git commit -m "feat(valuation): 估值卡支持 part=summary|details,个股页可把标尺与明细分开放"
```

### Task 2：结论带与锚点的展示决策（纯函数）

**Files:**
- Create: `src/lib/stocks/stockConclusion.ts`
- Test: `src/lib/stocks/stockConclusion.check.ts`

**Interfaces:**
- Produces:

```ts
export type ConclusionLeftState =
  | "card" | "holdcoSotp" | "unassessed" | "splitPaused"
  | "holdcoNotAssessable" | "moatDistorted" | "fundamentalsSuspect";
export function conclusionLeftState(input: {
  hasFloor: boolean; splitCoverageStale: boolean; holdcoNotAssessable: boolean;
  hasHoldcoSotp: boolean; capitalStructureDistorted: boolean; fundamentalsCorrupt: boolean;
}): ConclusionLeftState;
export type StockAnchor = { id: "holders" | "valuation" | "quality" | "co-owned" | "sources"; label: string };
export function stockAnchors(has: { valuation: boolean; quality: boolean; coOwned: boolean }, lang: Lang): StockAnchor[];
export function holdersLine(n: number, total: string, lang: Lang): string;
export const BAND_COPY: Record<Lang, { left: string; right: string; anchorsAria: string }>;
```

- [ ] **Step 1: 写失败测试**

```ts
// 运行: npx tsx src/lib/stocks/stockConclusion.check.ts
import assert from "node:assert/strict";
import { conclusionLeftState, stockAnchors, holdersLine } from "./stockConclusion";

const base = { hasFloor: true, splitCoverageStale: false, holdcoNotAssessable: false, hasHoldcoSotp: false, capitalStructureDistorted: false, fundamentalsCorrupt: false };
assert.equal(conclusionLeftState(base), "card");
assert.equal(conclusionLeftState({ ...base, hasFloor: false }), "unassessed", "无地板 → 未评估");
assert.equal(conclusionLeftState({ ...base, splitCoverageStale: true }), "splitPaused");
assert.equal(conclusionLeftState({ ...base, holdcoNotAssessable: true, hasHoldcoSotp: true }), "holdcoSotp", "BRK.B");
assert.equal(conclusionLeftState({ ...base, holdcoNotAssessable: true }), "holdcoNotAssessable");
assert.equal(conclusionLeftState({ ...base, capitalStructureDistorted: true }), "moatDistorted");
assert.equal(conclusionLeftState({ ...base, fundamentalsCorrupt: true }), "fundamentalsSuspect");
// 优先级与原估值区块分支一致:拆股暂停先于控股公司
assert.equal(conclusionLeftState({ ...base, splitCoverageStale: true, holdcoNotAssessable: true, hasHoldcoSotp: true }), "splitPaused");

assert.deepEqual(
  stockAnchors({ valuation: true, quality: true, coOwned: true }, "zh").map((a) => `${a.id}:${a.label}`),
  ["holders:持有人", "valuation:估值与方法", "quality:生意质量", "co-owned:共同持有", "sources:来源"],
);
assert.deepEqual(
  stockAnchors({ valuation: false, quality: false, coOwned: false }, "en").map((a) => a.id),
  ["holders", "sources"],
  "没有数据的区块不进导航",
);
assert.equal(stockAnchors({ valuation: true, quality: false, coOwned: false }, "en")[1].label, "Valuation");

assert.equal(holdersLine(27, "$76.77B", "zh"), "27 位持有 · 合计 $76.77B");
assert.equal(holdersLine(1, "$5.0M", "en"), "1 holder · $5.0M combined");
assert.equal(holdersLine(27, "$76.77B", "en"), "27 holders · $76.77B combined");

console.log("stockConclusion.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/stocks/stockConclusion.check.ts`
Expected: Cannot find module `./stockConclusion`。

- [ ] **Step 3: 实现**

```ts
import type { Lang } from "@/lib/nav";

// 个股页“先结论后证据”的展示决策(spec 2026-10-25 §三.1–三.2)。纯函数,页面只按结果渲染。

export type ConclusionLeftState =
  | "card" | "holdcoSotp" | "unassessed" | "splitPaused"
  | "holdcoNotAssessable" | "moatDistorted" | "fundamentalsSuspect";

/** 结论带左栏显示什么。优先级与原估值区块的分支顺序一致。 */
export function conclusionLeftState(input: {
  hasFloor: boolean;
  splitCoverageStale: boolean;
  holdcoNotAssessable: boolean;
  hasHoldcoSotp: boolean;
  capitalStructureDistorted: boolean;
  fundamentalsCorrupt: boolean;
}): ConclusionLeftState {
  if (!input.hasFloor) return "unassessed";
  if (input.splitCoverageStale) return "splitPaused";
  if (input.holdcoNotAssessable) return input.hasHoldcoSotp ? "holdcoSotp" : "holdcoNotAssessable";
  if (input.capitalStructureDistorted) return "moatDistorted";
  if (input.fundamentalsCorrupt) return "fundamentalsSuspect";
  return "card";
}

export type StockAnchor = { id: "holders" | "valuation" | "quality" | "co-owned" | "sources"; label: string };

const ANCHOR_LABEL: Record<Lang, Record<StockAnchor["id"], string>> = {
  zh: { holders: "持有人", valuation: "估值与方法", quality: "生意质量", "co-owned": "共同持有", sources: "来源" },
  en: { holders: "Holders", valuation: "Valuation", quality: "Business quality", "co-owned": "Co-owned", sources: "Sources" },
};

/** 页内锚点:持有人与来源总在;估值 / 生意质量 / 共同持有有数据才出现。 */
export function stockAnchors(has: { valuation: boolean; quality: boolean; coOwned: boolean }, lang: Lang): StockAnchor[] {
  const ids: StockAnchor["id"][] = ["holders"];
  if (has.valuation) ids.push("valuation");
  if (has.quality) ids.push("quality");
  if (has.coOwned) ids.push("co-owned");
  ids.push("sources");
  return ids.map((id) => ({ id, label: ANCHOR_LABEL[lang][id] }));
}

export function holdersLine(n: number, total: string, lang: Lang): string {
  return lang === "zh" ? `${n} 位持有 · 合计 ${total}` : `${n} holder${n === 1 ? "" : "s"} · ${total} combined`;
}

export const BAND_COPY: Record<Lang, { left: string; right: string; anchorsAria: string }> = {
  zh: { left: "价格相对价值带", right: "谁在持有", anchorsAria: "本页目录" },
  en: { left: "Price vs. value band", right: "Who holds it", anchorsAria: "On this page" },
};
```

- [ ] **Step 4: 运行，确认通过**

Run: `npx tsx src/lib/stocks/stockConclusion.check.ts && npx tsc --noEmit -p .`
Expected: `stockConclusion.check OK`。

- [ ] **Step 5: Commit**

```bash
git add src/lib/stocks/stockConclusion.ts src/lib/stocks/stockConclusion.check.ts
git commit -m "feat(stocks): 结论带左栏状态、页内锚点与持有人文字的展示决策(纯函数)"
```

### Task 3：结论带与锚点导航组件

**Files:**
- Create: `src/components/stocks/StockConclusionBand.tsx`
- Create: `src/components/stocks/StockAnchorNav.tsx`
- Test: `src/components/stocks/StockConclusionBand.check.tsx`

**Interfaces:**
- Consumes: `BAND_COPY`、`StockAnchor`（Task 2）；`QuarterMovesLine`（`src/components/entity/QuarterMovesLine.tsx`，props `{ q, moves, exited, unit, lang }`）；`HolderTrend`（`src/components/entity/HolderTrend.tsx`，props `{ series, lang, variant }`）；`MovesCount`（`src/lib/entity/quarterMovesText.ts`）。
- Produces:

```tsx
export function StockConclusionBand(props: {
  lang: Lang;
  /** 左栏内容:页面按 conclusionLeftState 组装(估值卡摘要 / SOTP 标尺 / 一段说明)。 */
  left: React.ReactNode;
  /** 已确认便宜时的“安全边际 77%”;否则 null。 */
  marginText: string | null;
  holders: {
    line: string;               // holdersLine(...)
    quarter: string;            // "Q2 2026"
    moves: MovesCount;
    exited: { name: string; href: string }[];
    trend: number[];
  };
}): React.ReactElement;
export function StockAnchorNav(props: { lang: Lang; anchors: StockAnchor[] }): React.ReactElement;
```

- [ ] **Step 1: 写失败的渲染检查**

```tsx
// 运行: npx tsx src/components/stocks/StockConclusionBand.check.tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { StockConclusionBand } from "./StockConclusionBand";
import { StockAnchorNav } from "./StockAnchorNav";
import { stockAnchors } from "@/lib/stocks/stockConclusion";

const html = renderToStaticMarkup(
  <StockConclusionBand
    lang="zh"
    left={<p>LEFT-SLOT</p>}
    marginText="安全边际 77%"
    holders={{
      line: "27 位持有 · 合计 $76.77B",
      quarter: "Q2 2026",
      moves: { opened: 0, added: 4, trimmed: 12, exited: 1 },
      exited: [{ name: "Andreas Halvorsen", href: "/zh/investors/viking" }],
      trend: [26, 27, 27],
    }}
  />,
);
const plain = html.replace(/<[^>]+>/g, " ");
for (const s of ["价格相对价值带", "谁在持有", "LEFT-SLOT", "安全边际 77%", "27 位持有 · 合计 $76.77B", "Andreas Halvorsen"]) {
  assert.ok(plain.includes(s), `结论带含 ${s}`);
}
const noMargin = renderToStaticMarkup(
  <StockConclusionBand lang="en" left={null} marginText={null}
    holders={{ line: "1 holder · $5.0M combined", quarter: "Q2 2026", moves: { opened: 1, added: 0, trimmed: 0, exited: 0 }, exited: [], trend: [1] }} />,
).replace(/<[^>]+>/g, " ");
assert.ok(!noMargin.includes("Margin"), "无安全边际时不渲染");

const nav = renderToStaticMarkup(<StockAnchorNav lang="zh" anchors={stockAnchors({ valuation: true, quality: false, coOwned: false }, "zh")} />);
assert.ok(nav.includes('href="#holders"') && nav.includes('href="#valuation"') && nav.includes('href="#sources"'), "锚点链接");
assert.ok(!nav.includes('href="#quality"'), "没有的区块不出现");
assert.ok(nav.includes("md:sticky") && nav.includes("md:top-14") && nav.includes("lg:top-[60px]"), "≥768px 吸顶并避开顶栏");
assert.ok(!/class="[^"]*(?<![:\w-])sticky/.test(nav), "<768px 不吸顶(没有无前缀的 sticky)");
console.log("StockConclusionBand.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/components/stocks/StockConclusionBand.check.tsx`
Expected: Cannot find module `./StockConclusionBand`。

- [ ] **Step 3: 实现**

`src/components/stocks/StockConclusionBand.tsx`：

```tsx
import React from "react";
import type { Lang } from "@/lib/nav";
import type { MovesCount } from "@/lib/entity/quarterMovesText";
import { QuarterMovesLine } from "@/components/entity/QuarterMovesLine";
import { HolderTrend } from "@/components/entity/HolderTrend";
import { BAND_COPY } from "@/lib/stocks/stockConclusion";

// 个股页首屏结论带(spec 2026-10-25 §三.1):左 = 价格相对价值带,右 = 谁在持有。RSC,只渲染页面已算好的值。
export function StockConclusionBand({
  lang,
  left,
  marginText,
  holders,
}: {
  lang: Lang;
  left: React.ReactNode;
  marginText: string | null;
  holders: {
    line: string;
    quarter: string;
    moves: MovesCount;
    exited: { name: string; href: string }[];
    trend: number[];
  };
}): React.ReactElement {
  const c = BAND_COPY[lang];
  return (
    <section
      aria-label={`${c.left} · ${c.right}`}
      className="grid gap-6 border-y border-[var(--tt-border)] py-5 md:grid-cols-[3fr_2fr] md:gap-8"
    >
      <div className="min-w-0 space-y-3">
        <p className="text-xs text-[var(--tt-muted)]">{c.left}</p>
        {marginText && <p className="font-data text-sm font-medium text-[var(--val-below)]">{marginText}</p>}
        {left}
      </div>
      <div className="min-w-0 space-y-2 md:border-l md:border-[var(--tt-border)] md:pl-8">
        <p className="text-xs text-[var(--tt-muted)]">{c.right}</p>
        <p className="font-display text-xl font-medium text-[var(--tt-text)]">{holders.line}</p>
        <QuarterMovesLine q={holders.quarter} moves={holders.moves} exited={holders.exited} unit="investor" lang={lang} />
        {holders.trend.length >= 2 && <HolderTrend series={holders.trend} lang={lang} variant="inline" />}
      </div>
    </section>
  );
}
```

`src/components/stocks/StockAnchorNav.tsx`：

```tsx
import type { Lang } from "@/lib/nav";
import { BAND_COPY, type StockAnchor } from "@/lib/stocks/stockConclusion";

// 页内锚点:≥768px 纯 CSS sticky,避开顶栏(768–1023px 56px / ≥1024px 60px);手机不吸顶,免得两条常驻栏挤占阅读空间。零 JS,不做当前区块高亮。
export function StockAnchorNav({ lang, anchors }: { lang: Lang; anchors: StockAnchor[] }) {
  return (
    <nav
      aria-label={BAND_COPY[lang].anchorsAria}
      className="md:sticky md:top-14 lg:top-[60px] z-20 border-b border-[var(--tt-border)] bg-[var(--tt-bg)]"
    >
      <ul className="flex list-none gap-1 overflow-x-auto p-0">
        {anchors.map((a) => (
          <li key={a.id}>
            <a
              href={`#${a.id}`}
              className="inline-flex min-h-[44px] items-center whitespace-nowrap px-2 text-sm text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-text)]"
            >
              {a.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

如果 `HolderTrend` 的 props 名与上面不同，按其实际签名改写（`grep -n "export function HolderTrend" -A8 src/components/entity/HolderTrend.tsx`）。

- [ ] **Step 4: 运行，确认通过**

Run: `npx tsx src/components/stocks/StockConclusionBand.check.tsx && npx tsc --noEmit -p .`
Expected: `StockConclusionBand.check OK`。

- [ ] **Step 5: Commit**

```bash
git add src/components/stocks
git commit -m "feat(stocks): 结论带与吸顶页内锚点组件"
```

### Task 4：个股页接线与区块重排

**Files:**
- Modify: `src/app/[lang]/stocks/[ticker]/page.tsx`（`TABLE_COPY`、`HoldersTable` 约 140–290 行；`EntityPage` 调用与 children 约 610–925 行）
- Modify: `src/components/entity/EntityPage.tsx`（给来源区包一层 `id="sources"`）

**Interfaces:**
- Consumes: `part`（Task 1）；`conclusionLeftState`、`stockAnchors`、`holdersLine`（Task 2）；`StockConclusionBand`、`StockAnchorNav`（Task 3）。

- [ ] **Step 1: `EntityPage` 来源区加锚点**

把 `<SourceFooter lang={lang} sources={sources} />` 包成：

```tsx
      <div id="sources" className="scroll-mt-32">
        <SourceFooter lang={lang} sources={sources} />
      </div>
```

- [ ] **Step 2: 精简 `HoldersTable`**

- 删掉 props `exited`、`totalValue`、`moves`、`quarter`、`trend` 及其类型；删掉 `TABLE_COPY.*.meta`。
- 删掉表上方的 meta `<p>`、`<QuarterMovesLine … />`、`{trend.length >= 2 && …HolderTrend…}` 三块；**保留**申报季说明（`seasonNote(...)` 那段）。
- 外层 `<section>` 改为 `<section id="holders" className="scroll-mt-32">`。
- 删掉不再使用的 import（`QuarterMovesLine`、`HolderTrend`、`MovesCount`，如仍被别处使用则保留）。

- [ ] **Step 3: 计算结论带输入**

在 `const valuationTitle = …` 之后加：

```ts
  // 结论带(spec 2026-10-25 §三.1):左栏状态与原估值区块同一优先级。
  const leftState = conclusionLeftState({
    hasFloor: !!valuationFloor,
    splitCoverageStale,
    holdcoNotAssessable,
    hasHoldcoSotp: !!holdcoSotp,
    capitalStructureDistorted,
    fundamentalsCorrupt,
  });
  const assetFloorShown =
    holdcoNotAssessable &&
    valuationFloor?.kind === "floor" &&
    valuationFloor.asset_floor.assessable &&
    valuationFloor.asset_floor.per_share != null &&
    Number.isFinite(valuationFloor.asset_floor.per_share) &&
    valuationFloor.asset_floor.per_share > 0;
  const hasValuationDetails = leftState === "card" || leftState === "holdcoSotp" || (leftState === "holdcoNotAssessable" && assetFloorShown);
  const anchors = stockAnchors({ valuation: hasValuationDetails, quality: !!bq, coOwned: coOwned.length > 0 }, lang);
```

（`splitCoverageStale`、`fundamentalsCorrupt` 是页面里已有的变量，按实际名字引用。）

- [ ] **Step 4: 组装左栏并替换关键数字行**

在 `return (` 之前加：

```tsx
  const priceLine = (
    <p className={latestPrice?.stale ? "font-data text-sm text-[var(--tt-faint)]" : "font-data text-sm text-[var(--tt-text)]"}>
      {page.price} {fmtPriceFact(latestPrice)}
      {priceFactNote(lang, latestPrice) ? <span className="ml-2 text-xs text-[var(--tt-muted)]">{priceFactNote(lang, latestPrice)}</span> : null}
    </p>
  );
  const messageLeft = (text: string) => (
    <>
      {priceLine}
      <p className="text-sm text-[var(--tt-muted)]">{text}</p>
    </>
  );
  const bandLeft =
    leftState === "card" ? (
      <EarningsPowerFloorCard
        floor={valuationFloor}
        strikeZone={strikeZone}
        oeDcf={oeDcf}
        reconciliation={reconciliation}
        issuer={issuer}
        ticker={ticker}
        lang={lang}
        showStatus={false}
        verdict={run.verdict}
        ttmPeriodEnd={floorInput.ttm?.period_end}
        part="summary"
      />
    ) : leftState === "holdcoSotp" && holdcoSotp ? (
      <>
        <div className="flex items-baseline gap-2">
          <span className="font-data text-2xl font-semibold tracking-tight text-[var(--tt-text)]">{fmtPerShare(holdcoSotp.per_share.base)}</span>
          <span className="text-xs text-[var(--tt-muted)]">{page.valuation.holdcoSotpCentral}</span>
        </div>
        {handoffVerdict && Number.isFinite(handoffVerdict.rangeLo) && Number.isFinite(handoffVerdict.rangeHi) && Number.isFinite(handoffVerdict.price) && (
          <ValueBandGauge bucket={handoffVerdict.bucket} rangeLo={handoffVerdict.rangeLo} rangeHi={handoffVerdict.rangeHi} price={handoffVerdict.price} lang={lang} />
        )}
      </>
    ) : leftState === "splitPaused" ? messageLeft(page.valuation.splitPaused)
    : leftState === "holdcoNotAssessable" ? messageLeft(page.valuation.holdcoNotAssessable)
    : leftState === "moatDistorted" ? messageLeft(page.valuation.moatDistorted)
    : leftState === "fundamentalsSuspect" ? messageLeft(page.valuation.fundamentalsSuspect)
    : messageLeft(`${valuationLabel(null, lang).label}：${valuationLabel(null, lang).title ?? ""}`);
```

（`valuationLabel` 从 `@/lib/valuation/valuationLabel` 导入；英文里冒号用 `": "`——写成 `lang === "zh" ? "：" : ": "`。）

`EntityPage` 的 `keyFacts={[ … ]}` 改为 `keyFacts={[]}`（现价、安全边际、持有人数、合计市值都移进结论带）。

- [ ] **Step 5: 重排 children**

`EntityPage` 的 children 改为下面的顺序（各块内部沿用现有 JSX，只调位置与包裹）：

```tsx
        <>
          <StockConclusionBand
            lang={lang}
            left={bandLeft}
            marginText={marginShown ? `${page.marginOfSafety} ${fmtMarginPct(handoffVerdict!.marginPct!)}` : null}
            holders={{
              line: holdersLine(n, formatUSD(totalValue), lang),
              quarter: quarterLabel(displayPeriod) || "",
              moves,
              exited: exitedHolders.map((e) => ({ name: e.person, href: investorPath(lang, e.slug) })),
              trend: trendSeries,
            }}
          />
          <StockAnchorNav lang={lang} anchors={anchors} />

          {/* 持有人 */}
          <div>
            <HoldersTable holders={holders} lang={lang} asOfPeriod={asOfPeriod} seasonNote={(has) => filingSeasonNote(movesEff, has, lang)} />
            {/* 原有 FoldedSection + LearnLink 保持不变 */}
          </div>

          {/* 估值与方法:只放明细 */}
          {hasValuationDetails && (
            <section id="valuation" className="scroll-mt-32">
              <SectionHeading eyebrow={page.valuation.eyebrow} title={valuationTitle} />
              {leftState === "card" ? (
                <>
                  <div className="mt-3">
                    <EarningsPowerFloorCard
                      floor={valuationFloor}
                      strikeZone={strikeZone}
                      oeDcf={oeDcf}
                      reconciliation={reconciliation}
                      issuer={issuer}
                      ticker={ticker}
                      lang={lang}
                      showStatus={false}
                      verdict={run.verdict}
                      ttmPeriodEnd={floorInput.ttm?.period_end}
                      part="details"
                    />
                  </div>
                  {/* 原有 TTM 口径段、PriceBetBlock、LearnLink 原样搬来 */}
                </>
              ) : leftState === "holdcoSotp" ? (
                <div className="mt-3">
                  {/* 原 holdcoSotp 分支里 holdcoSotpIntro 段落、SOTP 表格、holdcoSotpNote 段落原样搬来;删掉其中的大号读数和 ValueBandGauge(已在结论带) */}
                </div>
              ) : (
                /* holdcoNotAssessable 且有资产底:原资产底那一行原样搬来 */
                valuationFloor?.kind === "floor" && valuationFloor.asset_floor.per_share != null ? (
                  <p className="mt-3 text-sm text-[var(--tt-muted)]">
                    {page.valuation.assetFloorLabel}: {fmtPerShare(valuationFloor.asset_floor.per_share)}
                  </p>
                ) : null
              )}
            </section>
          )}

          {/* 生意质量:原 bq 区块,外层 <section> 加 id="quality" className="scroll-mt-32" */}
          {/* 共同持有:原 coOwned 区块,外层 <section> 加 id="co-owned" className="scroll-mt-32" */}
          {/* DiscoveryHandoff、外链:原样保持在最后 */}
        </>
```

说明：
- 上面注释里写“原样搬来”的部分，就是把现有 JSX 剪切到新位置，不改其内容。
- 原估值区块里 `splitPaused / moatDistorted / fundamentalsSuspect / holdcoNotAssessable` 的提示句已经进了结论带，估值区块不再重复。
- 现在估值区块外层条件 `{valuationFloor && (` 被 `hasValuationDetails` 取代。

导入：`StockConclusionBand`、`StockAnchorNav`、`conclusionLeftState`、`stockAnchors`、`holdersLine`、`valuationLabel`。

- [ ] **Step 6: 检查与 lint**

Run: `npx tsc --noEmit -p . && npx eslint "src/app/[lang]/stocks/[ticker]/page.tsx" src/components/entity/EntityPage.tsx src/components/stocks src/lib/stocks && for f in src/components/valuation/EarningsPowerFloorCard.check.tsx src/lib/stocks/stockConclusion.check.ts src/components/stocks/StockConclusionBand.check.tsx src/lib/stocks/filingSeasonNote.check.ts src/lib/entity/quarterMovesText.check.ts src/lib/stocks/valuationVerdictChip.check.ts; do npx tsx $f || exit 1; done`
Expected: 全部通过；`grep -n "keyFacts={\[\]}" "src/app/[lang]/stocks/[ticker]/page.tsx"` 有一处；`grep -c 'scroll-mt-32' "src/app/[lang]/stocks/[ticker]/page.tsx"` ≥ 4（holders、valuation、quality、co-owned 四个区块都有，防止锚点跳转后标题被顶栏挡住）。

- [ ] **Step 7: Commit**

```bash
git add "src/app/[lang]/stocks/[ticker]/page.tsx" src/components/entity/EntityPage.tsx
git commit -m "feat(stocks): 个股页首屏结论带 + 持有人→估值→生意质量重排 + 吸顶锚点"
```

### Task 5：PR 1 验证与开 PR

**Files:** 无代码改动。

- [ ] **Step 1: 全量自检**

```bash
fails=0; for f in $(find src scripts \( -name "*.check.ts" -o -name "*.check.tsx" \) -not -path "*/node_modules/*"); do npx tsx "$f" >/dev/null 2>&1 </dev/null || { echo "FAIL $f"; fails=$((fails+1)); }; done; echo "failures: $fails"; npm run -s check:tokens && npm run -s check:type && npx tsc --noEmit -p .
```

Expected: 只列出 3 个已知失败。

- [ ] **Step 2: 推送并开 PR**，标题 `feat(stocks): 个股页先结论后证据(结论带 + 重排 + 吸顶锚点)`，base `db-foundation`。

- [ ] **Step 3: Vercel 预览核对**（375 / 768 / 1440 × 中英文 × 深浅色）：AAPL、PDD、M、BRK.B、任一无估值股票。确认：
  - 首屏结论带两栏（窄屏堆叠），左栏有标尺和结论句、右栏有持有人和本季动作；
  - 持有人表上方不再出现持有人数、本季动作、趋势（已移到结论带），申报季说明仍在表上方；
  - 估值区块只有方法与数字、价格在押注什么，没有第二个标尺；BRK.B 只有 SOTP 细表；
  - 点击每个锚点，目标区块标题不被顶栏或锚点导航挡住；1440px 下锚点导航吸顶，375px 下锚点只是一行普通链接、不吸顶；
  - 375px 下 `document.documentElement.scrollWidth === clientWidth`。

---

# PR 2：导航、颜色与字形、投资人页（任务 6–10）

### Task 6：顶部导航加“击球区”

**Files:**
- Modify: `src/lib/nav.ts`（`TOP_NAV`；新增 `isNavActive`）
- Modify: `src/components/shell/TopNav.tsx`、`src/components/shell/MobileDrawer.tsx`（改用 `isNavActive`）
- Test: `src/lib/nav.check.ts`（新建）

**Interfaces:**
- Produces: `TOP_NAV` 新增 `{ key: "strike", zh: "击球区", en: "Strike zone", href: "/stocks/screener?view=strike_zone" }`（在 stocks 与 learn 之间）；`export function isNavActive(key: string, href: string, barePath: string): boolean`。

- [ ] **Step 1: 写失败测试**

```ts
// 运行: npx tsx src/lib/nav.check.ts
import assert from "node:assert/strict";
import { TOP_NAV, isNavActive } from "./nav";

assert.deepEqual(TOP_NAV.map((e) => e.key), ["home", "investors", "stocks", "strike", "learn"]);
const strike = TOP_NAV.find((e) => e.key === "strike")!;
assert.equal(strike.href, "/stocks/screener?view=strike_zone");
const act = (key: string, path: string) => isNavActive(key, TOP_NAV.find((e) => e.key === key)!.href, path);
assert.equal(act("strike", "/stocks/screener"), true, "筛选器页高亮击球区");
assert.equal(act("stocks", "/stocks/screener"), false, "筛选器页不高亮个股");
assert.equal(act("stocks", "/stocks/AAPL"), true);
assert.equal(act("stocks", "/stocks"), true);
assert.equal(act("strike", "/stocks/AAPL"), false);
assert.equal(act("home", ""), true);
assert.equal(act("home", "/"), true);
assert.equal(act("investors", "/investors/berkshire-hathaway"), true);
console.log("nav.check OK");
```

（`barePath` 由调用方去掉语言前缀后传入，见 `TopNav.tsx` 现有逻辑。）

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/nav.check.ts`
Expected: 失败于 TOP_NAV keys（缺 strike），或 `isNavActive is not a function`。

- [ ] **Step 3: 实现**

`TOP_NAV` 在 stocks 后插入 strike 项。新增：

```ts
/** 顶部导航当前项:barePath 已去语言前缀。筛选器归“击球区”,不归“个股”。 */
export function isNavActive(key: string, href: string, barePath: string): boolean {
  if (key === "home") return barePath === "" || barePath === "/";
  const path = href.split("?")[0];
  if (key === "stocks") return barePath.startsWith("/stocks") && !barePath.startsWith("/stocks/screener");
  return barePath.startsWith(path);
}
```

`TopNav.tsx`、`MobileDrawer.tsx` 里本地的 `isActive(entry)` 改为 `isNavActive(entry.key, entry.href, barePath)`（删除本地实现）。`Footer.tsx` 用 `TOP_NAV` 渲染链接，检查其 href 拼接对带 `?` 的路径是否正确（`localePath(lang, "/stocks/screener?view=strike_zone")`）。

- [ ] **Step 4: 运行，确认通过**

Run: `npx tsx src/lib/nav.check.ts && npx tsc --noEmit -p . && npx eslint src/lib/nav.ts src/components/shell`
Expected: `nav.check OK`。

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/lib/nav.check.ts src/components/shell
git commit -m "feat(nav): 顶部导航加“击球区”直达击球区筛选,筛选器页不再高亮“个股”"
```

### Task 7：估值色阶只给估值

**Files:**
- Modify: `src/components/entity/types.ts`（`Tone`）、`src/components/entity/VerdictChip.tsx`、`src/components/entity/KeyFacts.tsx`（`VALUE_TONE_CLASS` 补新档）
- Modify: `src/lib/valuation/valuationLabel.ts`（`tone`）、`src/components/valuation/ValuationBadge.tsx`（pill 颜色）、`src/components/valuation/EarningsPowerFloorCard.tsx`（`ValueBandGauge` 击球区段颜色）
- Modify: `src/app/[lang]/investors/[slug]/page.tsx`（标题徽章“整体加仓 / 减仓”）
- Test: `src/lib/valuation/valuationLabel.check.ts`、`src/lib/stocks/valuationVerdictChip.check.ts`

**Interfaces:**
- Produces: `Tone = "positive" | "warn" | "negative" | "neutral" | "val-below" | "val-within" | "val-above"`；`ValuationLabel.tone: "val-below" | "val-within" | "val-above" | "neutral"`。

- [ ] **Step 1: 改测试为新 tone**

`valuationLabel.check.ts` 中：确认便宜档 `tone` 期望从 `"positive"` 改为 `"val-below"`；`above` 从 `"warn"` 改为 `"val-above"`；`within` 从 `"neutral"` 改为 `"val-within"`；待确认、未评估仍为 `"neutral"`。`valuationVerdictChip.check.ts` 同样替换（positive→val-below、warn→val-above、within 的 neutral→val-within，pending 仍 neutral）。

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/valuation/valuationLabel.check.ts; npx tsx src/lib/stocks/valuationVerdictChip.check.ts`
Expected: 两个都失败于 tone 断言。

- [ ] **Step 3: 实现**

- `types.ts`：`export type Tone = "positive" | "warn" | "negative" | "neutral" | "val-below" | "val-within" | "val-above";`
- `VerdictChip.tsx`：`DOT_CLASS` 加 `"val-below": "bg-[var(--val-below)]", "val-within": "bg-[var(--val-within)]", "val-above": "bg-[var(--val-above)]"`；`TEXT_CLASS` 加对应 `text-[var(--val-…)]`。
- `KeyFacts.tsx`：`VALUE_TONE_CLASS` 加同样三档的 `text-[var(--val-…)]`。
- `valuationLabel.ts`：类型 `tone: "val-below" | "val-within" | "val-above" | "neutral"`；确认便宜 → `"val-below"`，待确认 / 未评估 → `"neutral"`，within → `"val-within"`，above → `"val-above"`。
- `ValuationBadge.tsx` 的 pill `cls`：

```ts
  const cls = l.pending
    ? "border-[var(--tt-border)] text-[var(--tt-muted)]"
    : l.tier === "strike"
      ? "border-[var(--val-below)] text-[var(--val-below)] bg-[var(--val-below-soft)]"
      : l.tier === "below"
        ? "border-[var(--val-below)]/50 text-[var(--val-below)]"
        : l.tier === "within"
          ? "border-[var(--val-within)]/50 text-[var(--val-within)]"
          : "border-[var(--val-above)]/50 text-[var(--val-above)]";
```

- `ValueBandGauge`：击球区段 `var(--tt-positive)` 两处换成 `var(--val-below)`（背景 15% 与边缘 50% 的 `color-mix` 比例不变）。
- 投资人页 `verdict = { label: "整体加仓"/"Net buying", tone: "positive" }` 改为 `{ label: lang === "zh" ? "▲ 整体加仓" : "▲ Net buying", tone: "neutral" }`；减仓同理 `"▼ 整体减仓" / "▼ Net selling"`，`tone: "neutral"`。
- Task 4 里结论带安全边际已用 `text-[var(--val-below)]`，无需再改。

- [ ] **Step 4: 运行**

Run: `npx tsx src/lib/valuation/valuationLabel.check.ts && npx tsx src/lib/stocks/valuationVerdictChip.check.ts && npx tsc --noEmit -p . && npx eslint src/components/entity src/components/valuation src/lib/valuation "src/app/[lang]/investors/[slug]/page.tsx"`
Expected: 全部通过。`grep -rn "tt-positive" src/components/valuation src/lib/valuation` 应无结果。

- [ ] **Step 5: Commit**

```bash
git add src/components/entity src/components/valuation src/lib/valuation src/lib/stocks/valuationVerdictChip.check.ts "src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(colors): 估值胶囊与刻度盘改用 --val-* 色阶,绿色只表达估值;整体加减仓徽章改中性"
```

### Task 8：13F 动作改用字形

**Files:**
- Modify: `src/lib/entity/quarterMovesText.ts`（新增 `MOVE_GLYPH`，`quarterMovesCounts` 带字形）
- Modify: `src/components/common/qoqDirection.tsx`（`MoveMark` 带字形）
- Modify: `src/app/[lang]/investors/[slug]/page.tsx`（四格去颜色、加字形、加仓 / 减仓 → 增持 / 减持、去 glow）
- Test: `src/lib/entity/quarterMovesText.check.ts`、`src/components/common/qoqDirection.check.ts`

**Interfaces:**
- Produces: `export const MOVE_GLYPH = { new: "●", increased: "▲", decreased: "▼", exited: "○" } as const;`

- [ ] **Step 1: 改测试**

`quarterMovesText.check.ts` 中把期望改为：

```ts
assert.equal(quarterMovesCounts("Q2 2026", m, "zh"), "Q2 2026：● 新建 0 · ▲ 增持 4 · ▼ 减持 12 · ○ 清仓 1");
assert.equal(quarterMovesCounts("Q2 2026", m, "en"), "Q2 2026: ● 0 opened · ▲ 4 added · ▼ 12 trimmed · ○ 1 exited");
assert.equal(
  quarterMovesCounts("Q2 2026", { opened: 1, added: 7, trimmed: 6, exited: 1 }, "zh"),
  "Q2 2026：● 新建 1 · ▲ 增持 7 · ▼ 减持 6 · ○ 清仓 1",
);
```

`qoqDirection.check.ts` 中：`moveMarkText("new","zh")` → `"● 新建"`，`("increased","en")` → `"▲ Added"`，`("decreased","zh")` → `"▼ 减持"`；undefined、exited 仍为 null。

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/entity/quarterMovesText.check.ts; npx tsx src/components/common/qoqDirection.check.ts`
Expected: 两个都失败于字符串断言。

- [ ] **Step 3: 实现**

`quarterMovesText.ts`：

```ts
/** 13F 动作字形(spec 2026-10-25 §三.6):形状表达动作,颜色只留给估值。 */
export const MOVE_GLYPH = { new: "●", increased: "▲", decreased: "▼", exited: "○" } as const;

export function quarterMovesCounts(q: string, m: MovesCount, lang: Lang): string {
  const g = MOVE_GLYPH;
  return lang === "zh"
    ? `${q}：${g.new} 新建 ${m.opened} · ${g.increased} 增持 ${m.added} · ${g.decreased} 减持 ${m.trimmed} · ${g.exited} 清仓 ${m.exited}`
    : `${q}: ${g.new} ${m.opened} opened · ${g.increased} ${m.added} added · ${g.decreased} ${m.trimmed} trimmed · ${g.exited} ${m.exited} exited`;
}
```

`qoqDirection.tsx` 的 `moveMarkText`：返回 `${MOVE_GLYPH[kind]} ${MOVE_LABEL[lang][kind]}`（从 `@/lib/entity/quarterMovesText` 导入 `MOVE_GLYPH`）；更新其注释“颜色与字形语义留给第 3 步”为“字形表达动作,正文色”。

投资人页四格数组改为：

```tsx
              {[
                { label: lang === "zh" ? "● 新建" : "● New", value: moves.opened },
                { label: lang === "zh" ? "▲ 增持" : "▲ Added", value: moves.added },
                { label: lang === "zh" ? "▼ 减持" : "▼ Trimmed", value: moves.trimmed },
                { label: lang === "zh" ? "○ 清仓" : "○ Exited", value: moves.exited },
              ].map((s) => (
                <div key={s.label}>
                  <p className="tt-label">{s.label}</p>
                  <Display size="2xl" className="mt-2">
                    <span className="text-[var(--tt-text)]">{s.value}</span>
                  </Display>
                </div>
              ))}
```

（去掉 `color` 字段、`glow={i === 0}` 与 `i` 参数。）

- [ ] **Step 4: 运行**

Run: `npx tsx src/lib/entity/quarterMovesText.check.ts && npx tsx src/components/common/qoqDirection.check.ts && npx tsx src/components/stocks/StockConclusionBand.check.tsx && npx tsc --noEmit -p . && npx eslint src/lib/entity src/components/common "src/app/[lang]/investors/[slug]/page.tsx"`
Expected: 全部通过（`StockConclusionBand.check` 用 `includes`，字形不影响）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/entity src/components/common "src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(moves): 13F 动作改用 ●▲▼○ 字形、正文色;投资人页四格去色并统一为增持/减持"
```

### Task 9：投资人页本季动作列出新建与清仓的名字（最后做，时间紧可砍）

> 这一项与主线关系最弱（spec §三.5）。PR 2 的其他任务不依赖它；若 11/10 前时间不够，跳过本任务直接做 Task 10，并在 PR 描述里注明。

**Files:**
- Create: `src/lib/managers/movesNames.ts`、`src/lib/managers/movesNames.check.ts`
- Modify: `src/app/[lang]/investors/[slug]/page.tsx`（`QuarterMovesExited` 换成两行名字）

**Interfaces:**
- Consumes: `splitNames`、`MOVE_GLYPH`（`src/lib/entity/quarterMovesText.ts`）；`valuationLabel`（`src/lib/valuation/valuationLabel.ts`）。
- Produces:

```ts
export type NamedMove = { name: string; href: string; valuation: string | null };
export function movesNameLine(kind: "new" | "exited", items: NamedMove[], lang: Lang):
  { prefix: string; shown: NamedMove[]; restText: string } | null;
```

- [ ] **Step 1: 写失败测试**

```ts
// 运行: npx tsx src/lib/managers/movesNames.check.ts
import assert from "node:assert/strict";
import { movesNameLine } from "./movesNames";

const a = { name: "D R Horton", href: "/stocks/DHI", valuation: "低于内在价值" };
let l = movesNameLine("new", [a], "zh")!;
assert.equal(l.prefix, "● 新建 1：");
assert.equal(l.shown.length, 1);
assert.equal(l.restText, "");
l = movesNameLine("exited", [a, a, a, a, a], "en")!;
assert.equal(l.prefix, "○ Exited 5: ");
assert.equal(l.shown.length, 3, "最多 3 个");
assert.equal(l.restText, " +2 more");
assert.equal(movesNameLine("exited", [a, a, a, a], "zh")!.restText, " 另 1 只");
assert.equal(movesNameLine("new", [], "zh"), null, "没有就不出这一行");
console.log("movesNames.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `npx tsx src/lib/managers/movesNames.check.ts`
Expected: Cannot find module。

- [ ] **Step 3: 实现**

```ts
import type { Lang } from "@/lib/nav";
import { MOVE_GLYPH, splitNames } from "@/lib/entity/quarterMovesText";

// 投资人页本季动作名字行(spec 2026-10-25 §三.5):只列新建与清仓,各最多 3 个;加仓减仓只给个数。
export type NamedMove = { name: string; href: string; valuation: string | null };

const LABEL: Record<Lang, Record<"new" | "exited", string>> = {
  zh: { new: "新建", exited: "清仓" },
  en: { new: "New", exited: "Exited" },
};

export function movesNameLine(kind: "new" | "exited", items: NamedMove[], lang: Lang) {
  if (items.length === 0) return null;
  const { shown, rest } = splitNames(items);
  const prefix = lang === "zh"
    ? `${MOVE_GLYPH[kind]} ${LABEL.zh[kind]} ${items.length}：`
    : `${MOVE_GLYPH[kind]} ${LABEL.en[kind]} ${items.length}: `;
  const restText = rest > 0 ? (lang === "zh" ? ` 另 ${rest} 只` : ` +${rest} more`) : "";
  return { prefix, shown, restText };
}
```

页面里把 `QuarterMovesExited` 函数和它的调用换成一个本地组件 `QuarterMovesNames`，渲染新建、清仓两行（每行用 `movesNameLine` 的结果；名字为 `Link`，有 `valuation` 时在名字后跟 `<span className="text-xs text-[var(--tt-muted)]"> · {valuation}</span>`，多个名字用“、”/“, ”分隔）。数据：

```ts
const named = (kind: "new" | "exited"): NamedMove[] =>
  longChanges
    .filter((c) => c.kind === kind)
    .map((c) => {
      const tk = cusipToTicker.get(c.cusip);
      const vd = tk ? verdicts.get(tk.toUpperCase()) : undefined;
      return {
        name: cleanIssuer(c.issuer),
        href: stockPath(lang, tk ?? c.cusip),
        // 清仓后已不持有,不写估值;新建写 valuationLabel 档名(未评估不写)
        valuation: kind === "new" && vd ? valuationLabel(vd, lang).label : null,
      };
    });
```

渲染条件与原来一致：`prior && longChanges.length > 0`，且对应行非 null。

- [ ] **Step 4: 运行**

Run: `npx tsx src/lib/managers/movesNames.check.ts && npx tsc --noEmit -p . && npx eslint src/lib/managers "src/app/[lang]/investors/[slug]/page.tsx"`
Expected: 全部通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/managers/movesNames.ts src/lib/managers/movesNames.check.ts "src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(investors): 本季动作列出新建与清仓的名字,新建带估值说法"
```

### Task 10：PR 2 验证与开 PR

**Files:** 无代码改动。

- [ ] **Step 1: 全量自检**

```bash
fails=0; for f in $(find src scripts \( -name "*.check.ts" -o -name "*.check.tsx" \) -not -path "*/node_modules/*"); do npx tsx "$f" >/dev/null 2>&1 </dev/null || { echo "FAIL $f"; fails=$((fails+1)); }; done; echo "failures: $fails"; npm run -s check:tokens && npm run -s check:type && npx tsc --noEmit -p .
```

Expected: 只列出 3 个已知失败。

- [ ] **Step 2: 推送并开 PR**，标题 `feat: 导航直达击球区、估值色阶只给估值、13F 动作字形、投资人页动作名字`，base `db-foundation`。

- [ ] **Step 3: Vercel 预览核对**：
  - 顶栏五项，在 1024px 与 1280px 下 `scrollWidth === clientWidth`；手机抽屉也有“击球区”；在 `/stocks/screener?view=strike_zone` 与 `/zh/…` 时“击球区”高亮、“个股”不高亮；
  - 筛选器、共识榜、巴菲特持仓表、AAPL 标题徽章：击球区 / 低于内在价值为 `--val-below`，价值带内为灰蓝，高于价值带为琥珀，深浅色都可读；
  - AAPL 持有人表名字旁是 “▼ 减持” 这类字形，结论带本季动作带字形；
  - 巴菲特页四格无绿 / 红数字、标签带字形，下面有“● 新建 1：… · 估值”与“○ 清仓 1：…”两行，标题徽章为中性色“▲ 整体加仓”。
