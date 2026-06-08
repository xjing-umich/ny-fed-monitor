# 投资人页季度对比(QoQ)与首屏整合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让投资人页 `/investors/[slug]` 的持仓表带 QoQ 回到首屏：权重列「上季→本季」、表下清仓行、keyFacts 组合级环比、AI 叙述收 `<details>` 一行、删除四列 ChangesSection。

**Architecture:** 纯前端单页改造，数据已现成(`latest`/`prior`/`changes`)。QoQ 数字取权重、箭头颜色取 `changes.kind`(持股口径,不被股价漂移误导)。AI 叙述用原生 `<details>` 折叠(内容留 DOM,静态/SEO 不丢)。

**Tech Stack:** Next.js(定制版,写码前看 `node_modules/next/dist/docs/`) · TypeScript · Tailwind(`--tt-*`/`--color-*` 主题变量)。

**项目约定：**
- **不写单测**([No Tests/Solo Dev])。每任务验证 = `cd web && nvm use 20 && npm run build`(类型+ISR 必过) + `npm start` 人工看页面。**构建必须 Node 20**。
- 工作基线：worktree `.claude/worktrees/investor-qoq`，分支 `feat/investor-qoq-comparison`(基于 db-foundation 最新)。
- 频繁提交，每任务末尾一次 commit。

**Spec:** `docs/superpowers/specs/2026-06-07-investor-qoq-comparison-design.md`

**关键类型(已确认 `web/src/lib/managers/types.ts`)：**
- `Holding = { cusip, issuer, value, shares, weight? }`
- `FilingData = { period, filedAt, accession, holdings: Holding[], totalValue }`
- `HoldingChange = { cusip, issuer, kind: "new"|"exited"|"increased"|"decreased", prevShares, shares, value, deltaPct }`
- `ManagerDetail = { manager, latest: FilingData, prior?: FilingData, changes: HoldingChange[] }`
- `KeyFact = { label, value: string, tone?, node?: ReactNode }`（`node` 可上色）

---

## File Structure

**修改**
- `web/src/components/entity/InvestorNarrative.tsx` — moves 清单收进 `<details>`，免责上移常显
- `web/src/app/[lang]/investors/[slug]/page.tsx` — `HoldingsTable`(加 QoQ 列+清仓行)、`keyFacts`(组合环比)、移除 `ChangesSection`

不动：`EntityPage`、`KeyFacts`、`staleNotice`、JSON-LD、metadata、`revalidate`。

---

## Task 1: AI 叙述收 `<details>`（独立、最简，先做）

**Files:**
- Modify: `web/src/components/entity/InvestorNarrative.tsx`（整体替换组件）

目标：`judgment_line` + 免责常显；moves 清单进 `<details>`。免责从末尾上移到判断句之后。

- [ ] **Step 1: 替换组件**

替换 `web/src/components/entity/InvestorNarrative.tsx` 全文：

```tsx
import React from "react";
import type { InvestorNarrativeData } from "@/lib/ai/investorNarrative";

type Lang = "zh" | "en";

const COPY = {
  zh: {
    heading: "本季动作 · AI 解读",
    disclosure: "本段由 AI 依据 SEC 13F 申报自动生成，可能存在错误，不构成投资建议。",
    toggle: (n: number) => `展开本季动作（${n}）`,
  },
  en: {
    heading: "This Quarter · AI Read",
    disclosure:
      "This section is AI-generated from the SEC 13F filing, may contain errors, and is not investment advice.",
    toggle: (n: number) => `Show this quarter's moves (${n})`,
  },
} as const;

export function InvestorNarrative({
  data,
  lang,
}: {
  data: InvestorNarrativeData;
  lang: Lang;
}): React.ReactElement {
  const t = COPY[lang];
  return (
    <section className="rounded-sm border-l-2 border-[var(--tt-accent)] bg-[var(--tt-surface)] px-4 py-4">
      <div className="pb-2">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.heading}
        </span>
      </div>

      <p className="text-[15px] leading-relaxed text-[var(--tt-text)]">{data.judgment_line}</p>

      <p className="mt-2 text-[11px] leading-relaxed text-[var(--tt-faint)]">{t.disclosure}</p>

      {data.moves.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer list-none text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] hover:text-[var(--tt-text)]">
            {t.toggle(data.moves.length)}
          </summary>
          <ul className="mt-2 space-y-1.5">
            {data.moves.map((m, i) => (
              <li key={i} className="text-sm leading-relaxed text-[var(--tt-text)]">
                <span className="font-medium">{m.issuer}</span>
                <span className="ml-1 text-[var(--tt-muted)]">· {m.action}</span>
                {m.why && <span className="text-[var(--tt-muted)]"> — {m.why}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
```

- [ ] **Step 2: 构建验证**

Run: `cd web && nvm use 20 && npm run build`
Expected: PASS（`InvestorNarrativeData` 含 `judgment_line`/`moves`，已与现组件一致）。

- [ ] **Step 3: 人工看页面**

Run: `cd web && npm start`，开 `http://localhost:3000/zh/investors/<任一slug>`（slug 从 `/zh/investors` 列表点入）。
Expected: AI 解读块只显判断句 + 免责两行；moves 收在"展开本季动作 (n)"里，点开才出现。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/entity/InvestorNarrative.tsx
git commit -m "feat(investor): AI 叙述 moves 收进 details, 免责上移常显"
```

---

## Task 2: 持仓表 QoQ 权重列 + 表下清仓行

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`（替换 `HOLD_COPY` 与 `HoldingsTable`，并改其调用处签名）

`HoldingsTable` 改为接收 `prior?`/`changes`，权重列渲染 QoQ，并在表下渲染清仓行。

- [ ] **Step 1: 替换 `HOLD_COPY` 与 `HoldingsTable`**

在 `page.tsx` 中，用以下整体替换现有 `HOLD_COPY`(约 64-75 行) 与 `HoldingsTable`(约 77-147 行)。同时确保文件顶部已 `import type { Holding, HoldingChange } from "@/lib/managers/types";`（现有）与新增 `import type { FilingData } from "@/lib/managers/types";`。

```tsx
const HOLD_COPY = {
  zh: {
    title: "持仓明细",
    cols: { issuer: "标的", value: "市值", shares: "持股数", weight: "权重(上季→本季)" },
    truncated: (n: number, total: number) => `显示前 ${n} 条，共 ${total} 个持仓`,
    newPos: "新建",
    exitedTitle: (n: number) => `本季清仓 (${n})`,
    more: (n: number) => `… 等 ${n} 只`,
  },
  en: {
    title: "Holdings",
    cols: { issuer: "Security", value: "Value", shares: "Shares", weight: "Weight (prev→now)" },
    truncated: (n: number, total: number) => `Showing top ${n} of ${total} positions`,
    newPos: "New",
    exitedTitle: (n: number) => `Exited this quarter (${n})`,
    more: (n: number) => `… +${n} more`,
  },
} as const;

const fmtPct1 = (w: number | undefined): string =>
  w != null ? `${(w * 100).toFixed(1)}%` : "—";

/** QoQ 权重单元格: 数字取权重, 箭头/色取自 change.kind(持股口径)。 */
function WeightQoQ({
  cur,
  prior,
  kind,
  lang,
}: {
  cur?: number;
  prior?: number;
  kind?: HoldingChange["kind"];
  lang: Lang;
}): React.ReactElement {
  const t = HOLD_COPY[lang];
  // 新建: prior 不存在该持仓
  if (prior == null) {
    return (
      <span className="font-mono tabular-nums text-[var(--tt-positive)]">
        {t.newPos} · {fmtPct1(cur)}
      </span>
    );
  }
  const arrow = kind === "increased" ? "▲" : kind === "decreased" ? "▼" : "";
  const colorClass =
    kind === "increased"
      ? "text-[var(--tt-positive)]"
      : kind === "decreased"
      ? "text-[var(--tt-warn)]"
      : "text-[var(--tt-faint)]";
  return (
    <span className="font-mono tabular-nums text-[var(--tt-muted)]">
      {fmtPct1(prior)} <span className={colorClass}>→ {fmtPct1(cur)} {arrow}</span>
    </span>
  );
}

function HoldingsTable({
  holdings,
  prior,
  changes,
  lang,
}: {
  holdings: Holding[];
  prior?: FilingData;
  changes: HoldingChange[];
  lang: Lang;
}): React.ReactElement {
  const t = HOLD_COPY[lang];
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const capped = sorted.slice(0, MAX_HOLDINGS);
  const truncated = sorted.length > MAX_HOLDINGS;

  const priorByCusip = new Map((prior?.holdings ?? []).map((h) => [h.cusip, h]));
  const changeByCusip = new Map(changes.map((c) => [c.cusip, c]));
  const exits = changes.filter((c) => c.kind === "exited");
  const EXIT_CAP = 12;

  return (
    <section>
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.title}
        </span>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--tt-border)]">
              <th className="pb-2 text-left text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)]">{t.cols.issuer}</th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-32">{t.cols.value}</th>
              <th className="hidden sm:table-cell pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-32">{t.cols.shares}</th>
              <th className="pb-2 text-right text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-muted)] w-40">{t.cols.weight}</th>
            </tr>
          </thead>
          <tbody>
            {capped.map((h) => {
              const ph = priorByCusip.get(h.cusip);
              const ch = changeByCusip.get(h.cusip);
              return (
                <tr key={h.cusip} className="border-b border-[var(--tt-border)] transition-colors hover:bg-[var(--tt-surface)]">
                  <td className="py-3 pr-4">
                    <Link href={stockPath(lang, h.cusip)} className="font-display font-medium text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)] transition-colors">
                      {h.issuer}
                    </Link>
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-faint)]">{h.cusip}</span>
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums text-[var(--tt-text)]">{formatUSD(h.value)}</td>
                  <td className="hidden sm:table-cell py-3 text-right font-mono tabular-nums text-[var(--tt-muted)]">{h.shares.toLocaleString()}</td>
                  <td className="py-3 text-right text-[13px]">
                    <WeightQoQ cur={h.weight} prior={ph?.weight} kind={ch?.kind} lang={lang} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p className="mt-2 text-xs text-[var(--tt-faint)]">{t.truncated(MAX_HOLDINGS, sorted.length)}</p>
      )}

      {exits.length > 0 && (
        <div className="mt-4 border-t border-[var(--tt-border)] pt-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--tt-negative)]">
            {t.exitedTitle(exits.length)}
          </span>
          <span className="ml-2 text-sm text-[var(--tt-muted)]">
            {exits.slice(0, EXIT_CAP).map((c, i) => (
              <React.Fragment key={c.cusip}>
                {i > 0 && "、"}
                <Link href={stockPath(lang, c.cusip)} className="text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]">{c.issuer}</Link>
              </React.Fragment>
            ))}
            {exits.length > EXIT_CAP && <span className="text-[var(--tt-faint)]">{t.more(exits.length - EXIT_CAP)}</span>}
          </span>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: 改 `HoldingsTable` 调用处**

在页面 return 的 children 中，把
```tsx
<HoldingsTable holdings={latest.holdings} lang={lang} />
{hasChanges && <ChangesSection changes={changes} lang={lang} />}
```
改为（ChangesSection 删除留到 Task 4，本步先让 HoldingsTable 接新 props，ChangesSection 暂留不影响）：
```tsx
<HoldingsTable holdings={latest.holdings} prior={prior} changes={changes} lang={lang} />
{hasChanges && <ChangesSection changes={changes} lang={lang} />}
```

- [ ] **Step 3: 构建 + 人工验证**

Run: `cd web && nvm use 20 && npm run build && npm start`
Expected: `/zh/investors/<slug>` 持仓表权重列显示「4.1% → 5.3% ▲」(加仓绿/减仓红/持有灰)，新建显「新建 · X%」；表下出现「本季清仓 (n)：A、B…」并可点击。移动端持股数列隐藏。

- [ ] **Step 4: Commit**

```bash
git add web/src/app/[lang]/investors/[slug]/page.tsx
git commit -m "feat(investor): 持仓表权重 QoQ 列 + 表下清仓行"
```

---

## Task 3: keyFacts 组合级环比

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`（`keyFacts` 数组的"组合市值"与"持仓数"两项改用 `node` 上色）

- [ ] **Step 1: 替换 keyFacts 构造**

把现有 `keyFacts`(约 300-317 行) 替换为：

```tsx
  // 组合级 QoQ(无 prior 时不显环比)
  const valDeltaPct =
    prior && prior.totalValue > 0 ? (latest.totalValue - prior.totalValue) / prior.totalValue : null;
  const cntDelta = prior ? latest.holdings.length - prior.holdings.length : 0;
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
  const deltaClass = (n: number) =>
    n > 0 ? "text-[var(--tt-positive)]" : n < 0 ? "text-[var(--tt-warn)]" : "text-[var(--tt-faint)]";

  const valueNode = (
    <span className="tnum font-mono text-xl font-medium leading-none text-card-foreground">
      {formatUSD(latest.totalValue)}
      {valDeltaPct != null && valDeltaPct !== 0 && (
        <span className={`ml-1.5 text-xs ${deltaClass(valDeltaPct)}`}>
          （{lang === "zh" ? "环比 " : ""}{sign(valDeltaPct)}
          {Math.abs(valDeltaPct * 100).toFixed(0)}%）
        </span>
      )}
    </span>
  );
  const countNode = (
    <span className="tnum font-mono text-xl font-medium leading-none text-card-foreground">
      {latest.holdings.length}
      {cntDelta !== 0 && (
        <span className={`ml-1.5 text-xs ${deltaClass(cntDelta)}`}>
          （{sign(cntDelta)}{Math.abs(cntDelta)}）
        </span>
      )}
    </span>
  );

  const keyFacts = [
    { label: lang === "zh" ? "组合市值" : "Portfolio value", value: formatUSD(latest.totalValue), node: valueNode },
    { label: lang === "zh" ? "持仓数" : "Holdings", value: String(latest.holdings.length), node: countNode },
    { label: lang === "zh" ? "最新报告期" : "Latest period", value: latest.period },
    { label: lang === "zh" ? "第一大持仓" : "Top holding", value: topHolding },
  ];
```

> 注：`KeyFact.node` 存在时取代 `value` 文本渲染（已确认 `KeyFacts.tsx`）。`value` 仍填以满足类型。

- [ ] **Step 2: 构建 + 人工验证**

Run: `cd web && nvm use 20 && npm run build && npm start`
Expected: `/zh/investors/<slug>` keyFacts 的"组合市值"显示「$263.1B（环比 +4%）」、"持仓数"显示「29（−2）」，绿/红正确；无 prior 的投资者两项无环比。

- [ ] **Step 3: Commit**

```bash
git add web/src/app/[lang]/investors/[slug]/page.tsx
git commit -m "feat(investor): keyFacts 组合市值/持仓数加环比"
```

---

## Task 4: 移除四列 ChangesSection（清死代码）

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`（删 `CHANGE_COPY`/`KIND_COLOR`/`ChangeGroup`/`ChangesSection` 及其调用）

- [ ] **Step 1: 删组件代码**

删除以下整段（约 149-249 行）：`// ── Changes section ──` 注释、`CHANGE_COPY`、`KIND_COLOR`、`ChangeGroup`、`ChangesSection` 四个定义。

- [ ] **Step 2: 删调用 + 清理无用变量**

在 children 中删除 `{hasChanges && <ChangesSection changes={changes} lang={lang} />}` 这一行。
检查 `hasChanges` 是否还被其它地方使用：若仅此处用到，连 `const hasChanges = ...`(约 332 行) 一并删除，避免未使用变量。`changes` 仍被 verdict 与 HoldingsTable 使用，保留。

children 最终为：
```tsx
        <HoldingsTable holdings={latest.holdings} prior={prior} changes={changes} lang={lang} />
```

- [ ] **Step 3: 构建验证（含未使用变量检查）**

Run: `cd web && nvm use 20 && npm run build`
Expected: PASS，无 "unused" 报错，无 `ChangesSection`/`ChangeGroup`/`CHANGE_COPY`/`KIND_COLOR` 残留引用。

- [ ] **Step 4: 人工确认**

Run: `cd web && npm start`，`/zh/investors/<slug>`
Expected: 旧四列"环比变动"区已消失；变动信息现由持仓表 QoQ 列 + 表下清仓行承载。

- [ ] **Step 5: Commit**

```bash
git add web/src/app/[lang]/investors/[slug]/page.tsx
git commit -m "refactor(investor): 移除四列 ChangesSection(信息已并入持仓表 QoQ)"
```

---

## Task 5: 首屏整合回归 + 边界核对

- [ ] **Step 1: 完整构建**

Run: `cd web && nvm use 20 && npm run build`
Expected: 全站构建通过；投资人页静态预渲染无错。

- [ ] **Step 2: 首屏与边界人工核对**

Run: `cd web && npm start`
核对清单（`/zh/investors/<slug>` 与 `/en/...`）：
- 首屏顺序：keyFacts(含环比) → AI 一行+免责 → 带 QoQ 持仓表；moves 折叠。
- 找一个**无 prior** 的投资者（如新加入或仅一次申报者）：持仓表退回纯当前权重(无→无箭头按"新建"分支？注意：无 prior 时 `prior` 整体 undefined，`priorByCusip` 为空 → 每行走"新建"分支会全标"新建")。**确认此场景**：若 `hasChanges`/`prior` 为空属正常单期，全部显示"新建·X%"在语义上可接受（首次披露即新建）；若不希望，记为已知项。
- AI 免责始终可见；`<details>` 内容在 DOM（查看页面源码含 moves 文本）。
- 移动端宽度：持股数列隐藏，权重 QoQ 列不溢出。

- [ ] **Step 3: 如无问题，最终确认（无需额外 commit）**

本任务为回归核对；如发现 §Step2 的"无 prior 全标新建"不可接受，新增微调：在 `WeightQoQ` 中当 `prior` 整体缺失（传入标志）时显示纯 `fmtPct1(cur)` 而非"新建"。否则保持。

---

## 完成标准（对照 spec §8）

1. ✅ 首屏 keyFacts(含环比)→AI 一行+免责→带 QoQ 持仓表 — Task 1,2,3,4
2. ✅ 权重列「上季→本季 ▲/▼」(色取 changes.kind)、新建「新建·X%」、持有灰无箭头 — Task 2
3. ✅ 表下「本季清仓 (n)」链接、无清仓不渲染 — Task 2
4. ✅ keyFacts 组合市值/持仓数环比、0 或无 prior 不显 — Task 3
5. ✅ 删 ChangesSection 无死代码 — Task 4
6. ✅ 无 prior 优雅退回 — Task 5(已知"全标新建"语义,可接受)
7. ✅ 免责常显、details 内容在 DOM — Task 1
8. ✅ zh/en + build 通过 + 人工核对 — Task 5

## 风险/备注

- **无 prior 场景**：实现取 `priorByCusip.get(cusip)` 为空 → 走"新建"分支。首次披露语义上算新建，可接受；若不可接受按 Task 5 Step3 微调。
- 权重含价格漂移：箭头方向已用 `changes.kind`(持股口径)规避误判；持有未变动(不在 changes)显灰无箭头。
- `--tt-positive`/`--tt-warn`/`--tt-negative`/`--tt-faint` 等主题变量沿用现有(ChangesSection/staleNotice 已在用)。
- 实现全程在 worktree `.claude/worktrees/investor-qoq`(分支 `feat/investor-qoq-comparison`)。
