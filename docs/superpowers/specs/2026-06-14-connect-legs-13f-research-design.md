# 两条腿连起来：13F → 研究面板 + 个股↔研究互链 — 设计

**日期：** 2026-06-14
**状态：** 设计已确认，待 writing-plans
**对应路线：** 把超级投资者做透 × 值不值（[[prd-roadmap]]）· [[prd-thread-product-first]]

## 1. 背景与问题

实地观察（2026-06-14）发现两条产品腿各自跑、互不相认：

- **谁在买（13F）**：`/stocks/[ticker]`、`/investors/*` 有完整机构持仓数据。
- **值不值（基本面）**：`/research/[ticker]` 有 SEC 基本面面板（companyfacts→normalize→风险信号→质量门）。

但 `/research` 面板自己标 **「Thirteen F Summary: Missing」**——尽管同一家公司的 13F 我们全有。根因：`buildResearchDataFromStore` 只读 SEC store，从不碰 13F；研究 schema 早已留好 `thirteen_f_summary` 插槽，下游（`generateRiskSignals` 的「13F Investor Signal Risk」、`dataQualityGate`、claim 边界、`fundamentalQualityCheck`）全在消费它，**只是没人填**。同时两页**完全不互链**（`/research` 不提 stocks，`/stocks` 不提 research）。

**目标**：纯内部 join，零外部数据——
- **A. 数据 join**：从现成 13F 派生 `ThirteenFSummary` 注入研究数据，点亮休眠下游 + 在面板加可见 13F 卡。
- **B. 互链**：`/stocks/[ticker]` ↔ `/research/[ticker]` 双向链接，各自仅在目标页有内容时显示。

**非目标（YAGNI）**：不合并两页/不动 URL/canonical（刚做完 canonical+hreflang #59，避冲突）；不引价格源（价格腿另议，已搁置）；不做 13F 多季趋势（那是 个股页做实 的范畴）。

## 2. 数据来源（均现成）

- 13F：`scanAllManagers()`（`lib/aggregations.ts`，已 `cache()`）或 `getManagerIndex/getManagerDetail`；`tickerToCusips(ticker)`（`lib/managers/securities.ts`）得 `targetCusips`。
- 新鲜度：`globalLatestPeriod` / `freshness13F`（`lib/freshness/derive.ts`，三档 current/stale/inactive）。
- 基本面存在性索引：`getSecLatestMap()`（`lib/sec/read.ts`，读 `company_fundamentals_latest`）——gate `/stocks→/research` 链接。
- 研究 schema 插槽：`ThirteenFSummary`（`lib/research/schemas/researchSchemas.ts`）：
  ```ts
  type ThirteenFSummary = {
    disclosed_holders?: number;
    overlapping_investors?: string[];
    position_changes?: { investor: string; action: "new"|"exited"|"increased"|"decreased"|"unchanged"; period: string }[];
    coverage_note?: string;
  };
  ```

**数据准确性标注**：13F 为 SEC 自报、季度级、可滞后最多 45 天；`coverage_note` 与卡片文案均显式标 lagged-disclosure 口径，不臆测动机。研究腿正文为英文，`coverage_note` 英文。

## 3. 架构

### 3.1 纯函数（`web/src/lib/stocks/deriveStock.ts`，与 个股页做实 共用此模块）

```ts
deriveThirteenFSummary(
  details: ManagerDetail[],
  targetCusips: Set<string>,
  globalLatest: string,
): ThirteenFSummary | undefined
```

一份扫描映射到 schema：
- `disclosed_holders` = 当前持有人数（latest 命中 targetCusip 且整户非 inactive）。
- `overlapping_investors` = 按合计市值降序 Top 8 持有人 `person` 名（控 payload 体积）。
- `position_changes` = **只列真变动**（new / increased / decreased / exited），每条 `{ investor, action, period: globalLatest }`；持平（held）映射为 schema 的 `unchanged` 但**不输出**（避免持平者刷成噪声）。动作口径：同投资人对该 ticker 跨多 cusip（正股/期权）归并取最强净方向（new>exited>increased>decreased），与 个股页做实 一致。
- `coverage_note` = 确定性英文："Per the latest SEC 13F filing (<globalLatest>), <N> superinvestor(s) disclosed holdings; positions are self-reported and lag up to 45 days."
- **`disclosed_holders===0` → 返回 `undefined`**（面板卡 + `/research→/stocks` 链接自然隐藏）。
- inactive 整户剔除（`freshness13F(latest.period, globalLatest)==='inactive'`）。

被否方案：把派生逻辑放 research 子系统本地——会与 个股页做实 重复一份"谁本季持有/进出 X"的扫描，否决。**单一来源放 `deriveStock.ts`**；个股页做实 执行时扩展同一文件并可共享内部扫描。

### 3.2 server 包装 + 注入点

`getThirteenFSummary(ticker): Promise<ThirteenFSummary | undefined>`（放 `lib/stocks/`）：
`scanAllManagers()` → `details`；`tickerToCusips(ticker)` → `targetCusips`（空则回退单 cusip）；`globalLatestPeriod(details.map latest.period)` → `globalLatest`；调 `deriveThirteenFSummary`。无库（managers 空）→ `undefined`。

注入：`web/src/app/api/research/[ticker]/route.ts`，在
```ts
const result = (await buildResearchDataFromStore(ticker)) ?? (await buildSecResearchDataForTicker(ticker));
```
之后、`buildValuationForResearchData`/`generateRiskSignals`/`runResearchWorkflow` 之前加：
```ts
result.thirteen_f_summary = await getThirteenFSummary(ticker);
```
下游消费者无需改动（已 schema-aware）。

## 4. UI

### 4.1 研究面板 13F 卡（`components/research/ResearchPanel.tsx`，client）

- 新增「Institutional Ownership (13F)」卡，置于主体证据区（Fundamental Quality 之前/附近），与其它 evidence 卡同构（同 `--tt-*` token、同卡样式）。
- 内容：`disclosed_holders` 数字 + Top 投资人 chips（`overlapping_investors`）+ 本季 `position_changes` 紧凑列表（investor + action 徽章：new/increased 正色、decreased/exited 警示色）+ 底部链接「See all holders →」跳 `/{lang}/stocks/{ticker}`。
- **仅当 `data.thirteen_f_summary?.disclosed_holders > 0` 渲染**，否则整卡不出（退化态零空盒，与现有 Missing 行为一致）。
- 合规：仅陈述"已披露持仓 / 滞后变动"，沿用研究腿既有 lagged-disclosure 话术，不臆测动机。

### 4.2 互链（双向，各自仅目标页有内容时显示）

- `/stocks/[ticker]` → `/research/[ticker]`：gate `getSecLatestMap().has(ticker)`。位置：个股页 keyFacts 的 External 区附近加「Fundamentals & research →」链接（沿用 `ExternalFinanceLinks` 邻位或 keyFacts node）。
- `/research` → `/stocks/[ticker]`：即 4.1 卡底部「See all holders →」，gate = `disclosed_holders>0`。**A 的产物直接驱动此方向显隐**，无额外查询。

## 5. 边界情况

- **有持仓无基本面**：`/research` 仍渲染（force-dynamic），13F 卡 Available、基本面 Missing——join 依然有价值（先告诉用户谁在买）。
- **有基本面无持仓**：`thirteen_f_summary=undefined` → 卡不出、`/research→/stocks` 链接不出（该票 `/stocks` 本就 404）；`/stocks→/research` 链接照常（有基本面）。
- **inactive 持有人**：§3.1 剔除。
- **无库 / 本地**：managers 空 → `getThirteenFSummary` 返回 undefined → 面板与现状一致；`getSecLatestMap` 空 → `/stocks→/research` 链接不出。
- **同 ticker 多 cusip（正股/期权/份额类）**：§3.1 归并取最强净方向，一人一条 change。

## 6. 测试（[[no-tests-solo-dev]]，不引测试框架）

- `web/src/lib/stocks/deriveStock.check.ts`（`npx tsx`）：构造多季多基金 fixture，断言 `disclosed_holders` 计数、`overlapping_investors` 按市值 Top 8、`position_changes` 只列真变动且 held 不列、putCall 跨 cusip 归并、inactive 剔除、`disclosed_holders===0`→undefined。
- `npx tsc --noEmit` + `npm run build`。
- 人工：`/en/research/AAPL`（13F 卡出现 + coverage 翻 Available + 13F 风险信号出现 + See all holders 链接）、个股页 `/en/stocks/AAPL`（Fundamentals & research 链接）、一只有持仓无基本面的票、一只有基本面无持仓的票（卡/链接显隐正确）。

## 7. 交付边界

本 thread 仅产出 spec + plan，执行在独立 thread/worktree，从 `db-foundation` 切分支（freshness 三档、research 子系统、`ThirteenFSummary` schema 均已在）。

**新增/改动文件：**
- 新增 `web/src/lib/stocks/deriveStock.ts`（`deriveThirteenFSummary`）+ `deriveStock.check.ts`（与 个股页做实 共用，首建此模块）。
- 新增 server 包装 `getThirteenFSummary`（`lib/stocks/` 内或同文件 server 段）。
- 改 `web/src/app/api/research/[ticker]/route.ts`：注入 `result.thirteen_f_summary`。
- 改 `web/src/components/research/ResearchPanel.tsx`：13F 卡 + See all holders 链接。
- 改 `web/src/app/[lang]/stocks/[ticker]/page.tsx`：Fundamentals & research 链接（gate `getSecLatestMap`）。

**与 个股页做实 的关系**：两 PRD 共用 `deriveStock.ts`。本 PRD 先建 `deriveThirteenFSummary`；个股页做实（spec `2026-06-13-stock-page-depth-design.md`，未执行）后续在同模块加 `deriveStockHolders`/`deriveHolderTrend`，共享内部"谁本季持有/进出 X"扫描。先执行哪个都行，后执行者复用前者的扫描而非重写。
