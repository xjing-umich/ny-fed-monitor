# Stock 详情页瘦身 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把个股详情页从"一堵墙"重排为两支柱（估值结论 + 持有人表）打头、其余内容折进渐进披露佐证区，SEO/GEO 无损、零功能损失。

**Architecture:** 纯呈现层重排 + 一个新的可复用 RSC 折叠组件（原生 `<details>`，零 hydration）。估值卡与持有人表保持展开作支柱；综述 prose / 持有人趋势 / Key Facts 各包进一个默认折叠的 `FoldedSection`（内容始终在服务端 HTML 中，可被 Google 与 LLM 爬虫读取）。不碰数据层、估值纯函数、ingest、`/research`、价格层、investor 页、structured data。

**Tech Stack:** Next.js（本仓有破坏性改动，见 `web/AGENTS.md`）、React Server Components、Tailwind（`--tt-*` 设计 token）、TypeScript。

## Global Constraints

- 全程 **RSC，禁止 `"use client"`，零 hydration**（完整 SSR HTML 利于 LCP + 爬虫）。
- 折叠是**视觉行为，不是 DOM 裁剪**：折叠的 prose / 全部持有人行**必须在服务端 HTML 中**（包进 `<details>`，不是点击后才 fetch/注入）。
- 文档大纲 `h1 → h2` **不跳级、单一 h1**；折叠块标题为 `<h2>`，summary 文案为可独立阅读的完整短语（非 "Details"）。
- 合规底线（[[valuation-philosophy-constraint]]）：估值输出=价格 vs 保守价值区间的**位置** + 安全边际；**无 BUY/SELL/HOLD/目标价/评级**；保留免责句。折叠**不改任何数字、口径、披露项**。
- 数据准确性规则：各板块 as-of 随内容保留（price as-of / filed date / DGS10 as-of）。
- 设计 token 一律用 `--tt-*`；eyebrow 用 font-display、`tabular-nums`。
- **本地验证门 = `cd web && npx tsc --noEmit`**（本机 google fonts 被屏蔽，**不跑 `next build`**，见 [[local-build-google-fonts-blocked]]）。本项目无测试套件（[[no-tests-solo-dev]]），验证靠 tsc + view-source + 人工看页面。
- 编码前读 `web/node_modules/next/dist/docs/` 相关指南（破坏性改动）。
- 基线分支：从 `origin/db-foundation` 切；本计划执行在独立 worktree。

---

### Task 1: `FoldedSection` 可复用折叠组件

**Files:**
- Create: `web/src/components/entity/FoldedSection.tsx`

**Interfaces:**
- Produces: `FoldedSection({ title: string; children: React.ReactNode; defaultOpen?: boolean }): React.ReactElement` — 纯 RSC，原生 `<details>`，`<summary>` 内含 `<h2>`。

- [ ] **Step 1: 创建组件文件**

写 `web/src/components/entity/FoldedSection.tsx`：

```tsx
import React from "react";

/**
 * 可复用渐进披露折叠块(纯 RSC, 零 hydration)。原生 <details>/<summary>:
 * 键盘/读屏可达、无 JS、内容始终在服务端 HTML 中(SEO/GEO 可爬)。
 * summary 为 <h2> 级语义标题(文档大纲不跳级); 视觉沿用 eyebrow + border-t 分隔。
 * title 必须是可独立阅读的完整短语(非 "Details")。
 */
export function FoldedSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}): React.ReactElement {
  return (
    <details open={defaultOpen} className="group border-t border-[var(--tt-border)] pt-4">
      <summary className="flex cursor-pointer list-none items-center gap-2 pb-3 [&::-webkit-details-marker]:hidden">
        <h2 className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {title}
        </h2>
        <span aria-hidden className="text-[var(--tt-faint)] transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="pb-1">{children}</div>
    </details>
  );
}
```

- [ ] **Step 2: 确认 Tailwind 支持 `group-open` 变体**

Run: `cd web && grep -rn "group-open\|\"open\":" node_modules/tailwindcss/src/corePlugins.js 2>/dev/null | head -3 || npx tailwindcss --help >/dev/null`
Expected: Tailwind v3.1+ 内置 `open`/`group-open` 变体（对 `<details open>` 生效）。若 grep 无果但版本 ≥3.1，仍可用。**若版本 <3.1**：把 `group-open:rotate-90` 改为 arbitrary 变体 `[details[open]_&]:rotate-90`（仍纯 CSS、无 JS）。

- [ ] **Step 3: tsc 通过**

Run: `cd web && npx tsc --noEmit`
Expected: 无错误（新文件类型干净）。

- [ ] **Step 4: 提交**

```bash
git add web/src/components/entity/FoldedSection.tsx
git commit -m "feat(entity): FoldedSection — reusable zero-JS progressive-disclosure block"
```

---

### Task 2: `StockProse` / `HolderTrend` 增加 `bare` 模式（body-only）

放进 `FoldedSection` 时，标题由 `FoldedSection` 的 `<summary>` 承担；这两个组件需能只渲染正文、不渲染自带的 eyebrow `<section>`，避免双标题。

**Files:**
- Modify: `web/src/components/entity/StockProse.tsx`
- Modify: `web/src/components/entity/HolderTrend.tsx`

**Interfaces:**
- Produces: `StockProse({ paragraphs, lang, bare? }): React.ReactElement | null` — `bare===true` 时只返回正文 `<div>`（无 section/eyebrow）。
- Produces: `HolderTrend({ series, lang, bare? }): React.ReactElement | null` — `bare===true` 时只返回正文（无 section/eyebrow），`<2` 季仍返回 `null`。

- [ ] **Step 1: `StockProse` 加 `bare` 分支**

把 `web/src/components/entity/StockProse.tsx` 的函数体改为先组装正文、再按 `bare` 决定是否包 section：

```tsx
export function StockProse({
  paragraphs,
  lang,
  bare = false,
}: {
  paragraphs: ProseParagraph[];
  lang: Lang;
  bare?: boolean;
}): React.ReactElement | null {
  if (paragraphs.length === 0) return null;
  const body = (
    <div className="max-w-3xl space-y-3">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-[15px] leading-relaxed text-[var(--tt-muted)]">
          {p.map((seg, j) =>
            typeof seg === "string" ? (
              <React.Fragment key={j}>{seg}</React.Fragment>
            ) : (
              <Link
                key={j}
                href={seg.href}
                className="text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]"
              >
                {seg.label}
              </Link>
            ),
          )}
        </p>
      ))}
    </div>
  );
  if (bare) return body;
  const heading = lang === "zh" ? "持有概览" : "Ownership overview";
  return (
    <section>
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {heading}
        </span>
      </div>
      {body}
    </section>
  );
}
```

- [ ] **Step 2: `HolderTrend` 加 `bare` 分支**

把 `web/src/components/entity/HolderTrend.tsx` 改为先组装正文、再按 `bare` 包 section（保留 `<2` 季 → `null`）：

```tsx
export function HolderTrend({
  series,
  lang,
  bare = false,
}: {
  series: readonly number[];
  lang: Lang;
  bare?: boolean;
}): React.ReactElement | null {
  if (series.length < 2) return null;
  const t = COPY[lang];
  const first = series[0];
  const last = series[series.length - 1];
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-sm leading-relaxed text-[var(--tt-muted)]">
          {t.sentence(series.length, first, last)}
        </p>
        <Sparkline series={series} color="var(--tt-muted)" />
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--tt-faint)]">{t.backfill}</p>
    </>
  );
  if (bare) return body;
  return (
    <section>
      <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.eyebrow}
        </span>
      </div>
      {body}
    </section>
  );
}
```

- [ ] **Step 3: tsc 通过**

Run: `cd web && npx tsc --noEmit`
Expected: 无错误（`bare` 可选、默认 false，旧调用点不受影响）。

- [ ] **Step 4: 提交**

```bash
git add web/src/components/entity/StockProse.tsx web/src/components/entity/HolderTrend.tsx
git commit -m "feat(entity): StockProse/HolderTrend bare mode (body-only for FoldedSection)"
```

---

### Task 3: `HoldersTable` 默认 Top 10 + 折叠溢出 + 标题升级 `h2`

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`（内联 `HoldersTable`，118–203；`TABLE_COPY` 93–116）

**Interfaces:**
- Consumes: `DataTable`、`Column`、`investorPath`、`WeightQoQ`、`formatUSD`（已 import）。
- Produces: `HoldersTable` 默认渲染前 `HOLDERS_VISIBLE=10` 行，第 11+ 行进 `<details>`；全行留 DOM。

- [ ] **Step 1: 给 `TABLE_COPY` 加"展开全部"文案 + 定义可见上限**

在 `TABLE_COPY.zh` 与 `.en` 各加一条 `showAll`，并在 `EXIT_CAP` 旁加 `HOLDERS_VISIBLE`：

`TABLE_COPY.zh` 内（`more` 行后）加：
```tsx
    showAll: (n: number) => `展开全部 ${n} 位持有人`,
```
`TABLE_COPY.en` 内（`more` 行后）加：
```tsx
    showAll: (n: number) => `Show all ${n} holders`,
```
在 `const EXIT_CAP = 12;`（118 行）下一行加：
```tsx
const HOLDERS_VISIBLE = 10;
```

- [ ] **Step 2: `HoldersTable` 拆 head/tail + 折叠 + 标题改 `h2`**

把 `HoldersTable`（120–203）的 `return` 之前与 `return` 块改为：

```tsx
  const t = TABLE_COPY[lang];
  const sorted = [...holders].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, HOLDERS_VISIBLE);
  const tail = sorted.slice(HOLDERS_VISIBLE);

  const columns: Column<HolderRow>[] = [
    { key: "investor", header: t.cols.investor, role: "primary", cell: (r) => r.person },
    { key: "value", header: t.cols.value, align: "right", width: "w-32", cell: (r) => formatUSD(r.value) },
    { key: "shares", header: t.cols.shares, align: "right", width: "w-32", hideOnMobile: true, cell: (r) => r.shares.toLocaleString() },
    { key: "weight", header: t.cols.weight, align: "right", width: "w-40", cell: (r) => <WeightQoQ cur={r.weight} prior={r.priorWeight} kind={r.kind} lang={lang} /> },
  ];

  return (
    <section>
      {/* 支柱②标题:语义 h2(文档大纲),视觉沿用 eyebrow */}
      <h2 className="border-t border-[var(--tt-border)] pt-4 pb-3 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
        {t.title}
      </h2>
      <DataTable
        columns={columns}
        rows={head}
        getKey={(r) => r.slug}
        rowHref={(r) => investorPath(lang, r.slug)}
        breakpoint="lg"
      />

      {/* 溢出行:全部留 DOM,默认折叠(原生 <details>,零 JS) */}
      {tail.length > 0 && (
        <details className="group mt-2">
          <summary className="cursor-pointer list-none py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)] hover:text-[var(--tt-accent)] [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">{t.showAll(sorted.length)} ▸</span>
            <span className="hidden group-open:inline">{t.title} ▾</span>
          </summary>
          <DataTable
            columns={columns}
            rows={tail}
            getKey={(r) => r.slug}
            rowHref={(r) => investorPath(lang, r.slug)}
            breakpoint="lg"
          />
        </details>
      )}

      {/* 本季清仓:表底 chip 列表;空 → 不渲染 */}
      {exited.length > 0 && (
        <div className="mt-4 border-t border-[var(--tt-border)] pt-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--tt-negative)]">
            {t.exitedTitle(exited.length)}
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {exited.slice(0, EXIT_CAP).map((e) => (
              <Link
                key={e.slug}
                href={investorPath(lang, e.slug)}
                className="inline-flex items-center rounded-full border border-[var(--tt-border)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-muted)] no-underline transition-colors hover:border-[var(--tt-accent)] hover:text-[var(--tt-accent)]"
              >
                {e.person}
              </Link>
            ))}
            {exited.length > EXIT_CAP && (
              <span className="self-center text-[var(--tt-faint)] text-xs">{t.more(exited.length - EXIT_CAP)}</span>
            )}
          </div>
        </div>
      )}
    </section>
  );
```

- [ ] **Step 3: tsc 通过**

Run: `cd web && npx tsc --noEmit`
Expected: 无错误（`showAll` 在两语言对象皆有，`HOLDERS_VISIBLE` 已定义）。

- [ ] **Step 4: 提交**

```bash
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(stocks): holders table — top 10 + folded overflow (all rows stay in DOM), h2 heading"
```

---

### Task 4: 估值卡注入实体名+日期的 GEO 句子（默认视图=结论，已天然满足）

`EarningsPowerFloorCard` 现状已符合"默认=结论"：`ValueSpine` 是主视图，`MethodDetails` 已是默认折叠 `<details>`（"Method & numbers"）——**无需把方法块再折叠**。本任务只让主句**自包含、含实体名与价格 as-of**，供 LLM 逐字引用（GEO）。合规：区间 + 位置 + 日期，无目标价/买卖。

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`（`ValueSpine` 90–209；导出组件 313–378）

**Interfaces:**
- Produces: `EarningsPowerFloorCard({ floor, strikeZone?, oeDcf?, reconciliation?, issuer?, ticker? })` — 新增可选 `issuer`/`ticker`，透传给 `ValueSpine` 拼自包含主句。

- [ ] **Step 1: `ValueSpine` 加 `issuer`/`ticker` 形参并改写主句**

`ValueSpine` 的 props（90–100）加两个可选项：

```tsx
function ValueSpine({
  floor,
  sz,
  oeDcf,
  reconciliation,
  issuer,
  ticker,
}: {
  floor: ValuationFloor;
  sz: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
  issuer?: string;
  ticker?: string;
}) {
```

把 `const sentence = ...`（131–133）替换为自包含、带实体名+区间+as-of 的版本：

```tsx
  const who = issuer ? `${issuer}${ticker ? ` (${ticker})` : ""}: ` : "";
  const valueRange = `${usd0(rangeLo)}–${usd0(rangeHi)} / sh`;
  const asOf = sz.price?.date ? ` (price ${usd0(price)} as of ${sz.price.date})` : "";
  const sentence = bothMethods
    ? `${who}Two methods value the business — a conservative owner-earnings DCF and a growth-credited Greenwald estimate, ${valueRange}. Today’s price sits ${sits}${asOf}.`
    : `${who}A conservative earnings-power estimate, ${valueRange}; today’s price sits ${bucket === "below" ? "below" : bucket === "within" ? "inside" : "above"} it${asOf}.`;
```

- [ ] **Step 2: 导出组件加 `issuer`/`ticker` 形参并透传**

把 `EarningsPowerFloorCard` 的解构（313–323）与 `ValueSpine` 调用（364–365）改为：

签名加两项：
```tsx
export function EarningsPowerFloorCard({
  floor,
  strikeZone,
  oeDcf,
  reconciliation,
  issuer,
  ticker,
}: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
  issuer?: string;
  ticker?: string;
}) {
```
`ValueSpine` 调用透传：
```tsx
        {hasSpine ? (
          <ValueSpine floor={floor} sz={strikeZone!} oeDcf={oeDcf} reconciliation={reconciliation} issuer={issuer} ticker={ticker} />
        ) : (
```

- [ ] **Step 3: tsc 通过**

Run: `cd web && npx tsc --noEmit`
Expected: 无错误（`issuer`/`ticker` 可选，未传时主句退回无前缀但仍含区间+as-of）。

- [ ] **Step 4: 提交**

```bash
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): self-contained GEO headline — entity name + value range + price as-of (compliant: position, no target)"
```

---

### Task 5: 个股页重排 — 两支柱打头 + 折叠佐证区 + 取消 Key Facts band

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`（数据派生区 350–367、`return` 块 419–459）

**Interfaces:**
- Consumes: Task 1 `FoldedSection`、Task 2 `StockProse(bare)`/`HolderTrend(bare)`、Task 4 `EarningsPowerFloorCard(issuer,ticker)`。

- [ ] **Step 1: import `FoldedSection`**

在 page.tsx 顶部 import 区（33 行 `HolderTrend` import 旁）加：
```tsx
import { FoldedSection } from "@/components/entity/FoldedSection";
```

- [ ] **Step 2: 把 `keyFacts` 数组改成折叠区用的内联节点**

删除 `const keyFacts = [ ... ];`（352–367），替换为构造 Key Facts 折叠内容的 `keyFactsNode`（保留 `exchange`、`cusipsForTicker`）：

```tsx
  const factLabels =
    lang === "zh"
      ? { ticker: "代码", total: "合计市值", largest: "最大持有人", ext: "外部数据" }
      : { ticker: "Ticker", total: "Total value held", largest: "Largest holder", ext: "External" };
  const keyFactsNode = (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-[var(--tt-faint)]">{factLabels.ticker}</dt>
        <dd className="font-mono tabular-nums text-[var(--tt-text)]">{ticker}</dd>
      </div>
      <div>
        <dt className="text-[var(--tt-faint)]">{factLabels.total}</dt>
        <dd className="font-mono tabular-nums text-[var(--tt-text)]">{formatUSD(totalValue)}</dd>
      </div>
      <div>
        <dt className="text-[var(--tt-faint)]">{factLabels.largest}</dt>
        <dd className="text-[var(--tt-text)]">{topHolder.person}</dd>
      </div>
      {cusipsForTicker.length > 0 && (
        <div className="col-span-full">
          <dt className="text-[var(--tt-faint)]">{factLabels.ext}</dt>
          <dd className="mt-1">
            <ExternalFinanceLinks ticker={ticker} exchange={exchange} variant="detail" lang={lang} />
          </dd>
        </div>
      )}
    </dl>
  );
```

> 注：holder count 不入折叠区——已常驻于 masthead `subtitle`（"Held by N superinvestors"），零信息损失。

- [ ] **Step 3: 改 `EntityPage` 传 `keyFacts={[]}` 并重排 children**

把 `return` 块（419–459）的 `keyFacts={keyFacts}` 改为 `keyFacts={[]}`（取消醒目 band），并把 children 重排为「估值(h2) → 持有人表 → 三个折叠佐证区」：

```tsx
      <EntityPage
        lang={lang}
        title={issuer}
        subtitle={subtitle}
        disclaimer={disclaimer}
        notice={<QuarterMovesPill moves={moves} lang={lang} />}
        keyFacts={[]}
        sources={[{ name: "SEC EDGAR 13F", asOf: latestFiledAt, status: filingFreshness(latestPeriod || null, new Date()) }]}
        related={related}
        footerCta={<NewsletterCTA lang={lang} />}
      >
        <>
          {/* 支柱① 估值结论(头条) — 默认只显结论, 方法在卡内折叠 */}
          {valuationFloor && (
            <section>
              <h2 className="border-t border-[var(--tt-border)] pt-4 pb-3 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                {lang === "zh" ? "估值 · 地基层" : "Valuation"}
              </h2>
              <EarningsPowerFloorCard
                floor={valuationFloor}
                strikeZone={strikeZone}
                oeDcf={oeDcf}
                reconciliation={reconciliation}
                issuer={issuer}
                ticker={ticker}
              />
            </section>
          )}

          {/* 支柱② 谁在买 — Top 10 + 折叠溢出 */}
          <HoldersTable holders={holders} exited={exitedHolders} lang={lang} />

          {/* 佐证区(默认折叠, 内容留 DOM 供 SEO/GEO) */}
          <FoldedSection title={lang === "zh" ? "持有概览" : "Ownership overview"}>
            <StockProse paragraphs={stockProse} lang={lang} bare />
          </FoldedSection>

          {trendSeries.length >= 2 && (
            <FoldedSection title={lang === "zh" ? "持有人趋势" : "Holders over time"}>
              <HolderTrend series={trendSeries} lang={lang} bare />
            </FoldedSection>
          )}

          <FoldedSection title={lang === "zh" ? "关键事实与外部链接" : "Key facts & links"}>
            {keyFactsNode}
          </FoldedSection>
        </>
      </EntityPage>
```

> `StockProse` 在 `paragraphs` 空时返回 `null`——此时折叠块只剩标题，可接受（极少见）；如需更干净可在外层加 `{stockProse.length > 0 && ...}`，但非必需。

- [ ] **Step 4: tsc 通过**

Run: `cd web && npx tsc --noEmit`
Expected: 无错误。若报 `keyFacts`/`cusipsForTicker`/`exchange` 未用或缺失，按 Step 2 确认变量仍在作用域（`exchange` 在 350 行、`cusipsForTicker` 在派生区已定义）。

- [ ] **Step 5: SEO/GEO 服务端 HTML 验收（关键，不看浏览器渲染态）**

启动 dev 后取服务端 HTML 验证折叠内容在位（用 preview_* 工具或 `curl`）。以一只富数据票（如 `AAPL`）：
- 折叠的 prose 全文出现在 HTML 源里（搜综述句关键词）。
- **全部持有人行**（含第 11+ 位、折叠在 `<details>` 内）出现在 HTML 源里。
- 标题大纲：`<h1>` 唯一；`<h2>` 含 估值/持有人/持有概览/持有人趋势/关键事实，顺序不跳级。
- 三类 JSON-LD（breadcrumb/FAQ/Organization）仍输出。
- 估值主句自包含：含 `issuer (ticker)`、`$低–$高 / sh`、`price ... as of <date>`，无 buy/sell/target 字样。

Expected: 以上全部命中（折叠是视觉行为、内容未被裁剪）。

- [ ] **Step 6: 真数据人工 QA（拷 `web/.env.local`）**

逐票看页面：
- `AAPL`/`GOOG`（富估值）→ 估值结论头条紧凑、方法默认折叠；持有人 Top 10 + "展开全部"；佐证三块折叠收起。
- 一只 `per_share_unavailable`（多股权）票 → 估值卡诚实档仍作头条。
- 一只金融票（无营业利润）→ 单灯档正常。
- `ASML`（估值 `undefined`）→ 估值 section 不渲染，**持有人表自动顶上当头条**，页面不空。
- `N ≤ 10` 的票 → 持有人无"展开全部"；`<2` 季 → 趋势折叠块不渲染。

Expected: 全部符合；无控制台报错（preview_console_logs）。

- [ ] **Step 7: 提交**

```bash
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(stocks): two-pillar layout — valuation + holders lead, prose/trend/keyfacts fold (SEO/GEO-safe), drop key-facts band"
```

---

## Self-Review

**Spec coverage（逐节核对 `2026-06-25-stock-detail-simplify-design.md`）：**
- §1 骨架（估值在上→持有人→折叠佐证区→footer）→ Task 5 Step 3 ✓
- §2.1 估值默认=结论、方法折叠 → Task 4（现状已满足，GEO 句子注入）✓
- §2.2 持有人 Top 10 + 折叠溢出、全行留 DOM → Task 3 ✓
- §3 `FoldedSection` + prose/trend/keyfacts 各一折叠块 → Task 1 + Task 2 + Task 5 ✓
- §4.1 折叠内容留服务端 HTML、保可见摘要句 → Task 1（`<details>` 不裁剪）+ Task 5 Step 5 验收 ✓
- §4.2 `h1→h2` 大纲、语义标题 → Task 3（持有人 h2）+ Task 5（估值 h2）+ Task 1（折叠 summary h2）✓
- §4.3 GEO 自包含事实句（带日期+实体名）→ Task 4 ✓
- §4.4 RSC 零 hydration / a11y / token / 数据准确性 → 全任务遵 Global Constraints ✓
- §5 文件清单 → Task 1–5 文件一致 ✓
- §6 测试（tsc + view-source + 真数据 QA）→ Task 5 Step 5/6 ✓
- §7 合规（位置非判决、不改数字、保留免责/as-of）→ Task 4 句子仅区间+位置+日期 ✓

**Placeholder scan:** 无 TBD/TODO；每个代码步给出完整可粘贴代码。✓

**Type consistency:** `FoldedSection({title,children,defaultOpen})`、`StockProse(...,bare?)`、`HolderTrend(...,bare?)`、`EarningsPowerFloorCard(...,issuer?,ticker?)`、`HOLDERS_VISIBLE`、`TABLE_COPY.*.showAll` 在定义任务与消费任务（Task 5）签名一致。✓

**潜在依赖提醒（执行者注意）：** Task 5 依赖 Task 1/2/4 的新 props 已落地——按 Task 顺序 1→2→3→4→5 执行；乱序会 tsc 失败。
