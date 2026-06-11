# 信念精选 / Conviction Picks 设计（多季趋势 2b）

> 状态：设计已与用户分段确认（2026-06-11），待用户审阅 spec 后转 writing-plans。
> 所属规划 thread：Compounder 产品长期规划。
> 分支：`feat/conviction-picks`（worktree `.claude/worktrees/conviction-picks`，基于 origin/db-foundation 最新 PR #46）。
> 前置：多季回填 2a 已合并（PR #42），`ManagerDetail.filings[]`（最多 8 季，按 period 降序）已就位。本 PRD 是 2a 数据的 UI 兑现（roadmap 中的「趋势图 2b」）。
> 相关记忆：[[prd-roadmap]]、[[product-direction]]、[[valuation-philosophy-constraint]]、[[ui-component-system]]、[[seo-english-first]]；增长闭环 `docs/growth/measurement-loop.md`。

## 1. 背景与目标

多季回填（2a）已让每个投资人的 `filings[]` 带最多 8 个季度的完整持仓，但投资人详情页 `web/src/app/[lang]/investors/[slug]/page.tsx` **只用了 `latest/prior/changes`**，`filings[]` 闲置。竞品（Dataroma 等）只展示当前持仓的静态快照；「这位投资者在哪些标的上反复加仓、长年不动」这种**跨季的信念信号**是我们的差异化——对真人有黏性，对 AI/搜索引用最值钱（"据 Compounder，巴菲特已连续 5 季增持 OXY"）。

**目标**：在投资人详情页新增一个**「高信念持仓」精选区块**——把该投资者最具信念特征的（最多）3 个持仓挑出来，每个配一个最强信念标签 + 8 季持股数迷你趋势线 + 一句确定性人话理由，整卡可点进个股页并打点。**编辑视角，而非全量参考表。**

**非目标（明确不做 v1）**：
- 跨投资人的「全场最高信念」聚合页（后续独立 PRD）。
- 持仓明细表里逐行加 sparkline / 全量个股趋势（被否的 C 方案，密度高、藏在表里、放弃编辑优势）。
- 组合级演进图（总市值/持仓数/集中度随时间——被否的"宏观视角"）。
- 引入任何图表库（recharts / chart.js）。
- AI 生成理由文案（用确定性模板，见 §4.3）。
- 拆股复权（见 §7 已知边界）。

## 2. 范围与落点

- **唯一落点**：投资人详情页 `/[lang]/investors/[slug]`。
- **页面位置**：夹在 keyFacts / AI 叙述区块 与 持仓明细表（`HoldingsTable`）之间，作为一个独立带标题的区块（标题：zh「高信念持仓」/ en「High-conviction」）。
- **纯加法**：不动数据层、不动 `getManagerDetail`、不动 `EntityPage` 壳层其他槽、不动 `HoldingsTable`。仅在 `page.tsx` 内调推导函数并插入新组件（约 5 行改动）。

## 3. 信念推导（核心逻辑）

口径统一为**持股数 shares**（最纯的"加仓/减仓"信号，不受股价涨跌裹挟）。

### 3.1 纯函数 `web/src/lib/managers/conviction.ts`

```ts
export type ConvictionSignal = "accumulating" | "fresh_conviction" | "long_core" | "never_trimmed";

export type ConvictionPick = {
  cusip: string;
  issuer: string;
  signal: ConvictionSignal;        // 最强适用的那一档（见 §3.3）
  quartersHeld: number;            // 连续持有季数（到最新季为止）
  series: number[];                // 按 filings 时间升序的每季持股数；未持有=0
  latestWeight: number | null;     // 最新季权重（排序用，缺失=null）
  addStreak: number;               // 连续加仓季数（accumulating 用）
};

/** 从 filings[]（降序，[0]=最新）推导信念精选，已排序、已截断至 limit（默认 3）。命中 0 → []。 */
export function deriveConviction(filings: FilingData[], limit = 3): ConvictionPick[];
```

- 无 React、无 IO、无 `Date.now`、无随机 → 确定性纯函数，ISR 静态渲染下输出稳定、缓存正确。可单独读懂与推理。

### 3.2 信号判定（基于 shares 的每季序列，默认阈值，可调）

设某证券按时间升序的持股序列 `s = series`（未持有的季为 0），`held` = 末尾连续非零段长度（= `quartersHeld`）。

| 信号 | 判定 | 优先级 |
|---|---|---|
| `accumulating`（连续加仓） | 末尾连续 **≥3 季**严格递增（`s[i] > s[i-1]`，含从 0 新建后持续加） | 1（最强） |
| `fresh_conviction`（重磅新建/加仓） | 最新季为新建或加仓（`s[last] > s[last-1]`）**且** `latestWeight ≥ 0.03` | 2 |
| `long_core`（长期重仓） | `quartersHeld ≥ 6` **且** 最新季权重排该组合**前 5** | 3 |
| `never_trimmed`（从不减仓） | `quartersHeld ≥ 4` **且** 持有期间无任何一季 `s[i] < s[i-1]`（只增或持平） | 4 |

- 阈值集中为函数内具名常量（`MIN_ADD_STREAK=3`、`FRESH_MIN_WEIGHT=0.03`、`LONG_CORE_MIN_QUARTERS=6`、`LONG_CORE_TOP_N=5`、`NEVER_TRIM_MIN_QUARTERS=4`），便于日后调。

### 3.3 去重与选取

- 一个持仓可能命中多档 → **只取优先级最高的那一档**（不堆标签）。
- 候选 = 所有命中任一信号的持仓。**排序**：先按信号优先级（1→4），同档再按 `latestWeight` 降序（null 垫底）。
- **截断**：取前 `limit`（默认 3）。
- **降级**：候选 <3 → 显示实际张数；候选 0 → 返回 `[]`，区块整体不渲染（见 §5）。
- **短历史容忍**：`filings.length < N` 时需要 ≥N 季的信号自然不触发；序列只用已有季。全量回填完成前多数基金仅 2 季 → 区块大面积不显，属预期，非 bug。

## 4. 前端组件与渲染

### 4.1 RSC / client 边界（关键，性能与 SEO 考量）

- **`web/src/components/entity/ConvictionPicks.tsx` = 服务端组件**。sparkline 是静态 SVG、标签与理由是静态文案 → 整个区块渲进 HTML：**零 client JS、零 hydration**，且趋势/信念数据进静态 HTML，对 SEO/GEO 引用最有利（爬虫/AI 可直接读到"连续 5 季加仓"）。
- 仅"点击打点"需要客户端 → 新增**通用 client 原语 `web/src/components/common/TrackedLink.tsx`**：收 `href` + `event` + `payload`，`onClick` 仿 `ShareButton` 的 `fire()` 容错（try/catch 包 `track()`，被 adblock 拦截绝不阻断跳转）后正常导航。几行 JS。做成通用件（持仓行等日后可复用），不写成一次性。
  - 注意 RSC 组合：client 组件接收服务端渲染的 `children`（卡片主体），children 仍在服务端渲染，client 仅是可点壳层。

### 4.2 组件签名（哑组件，无业务知识）

```tsx
// ConvictionPicks.tsx（server）
export function ConvictionPicks(props: {
  picks: ConvictionPick[];
  lang: Lang;
  cusipToTicker: Map<string, string>;  // 页面已算好，传入复用，不重算
}): React.ReactElement | null;          // picks 空 → 返回 null
```

每张卡：标的（`EntityName` + `cleanIssuer` 复用）→ 信念标签 chip（最强档）→ 8 季迷你 sparkline → 一句理由。整卡用 `TrackedLink` 包裹，点进个股页。

### 4.3 卡片内容细节

- **标签 chip 文案 + 配色**（页面内 `COPY={zh,en}` 内联惯例，与现页一致）：
  - `accumulating` → zh「连续加仓·N季」en「Adding · Nq」，正色（`--tt-positive`）。
  - `fresh_conviction` → zh「重磅新建/加仓」en「Big new buy」，强调色。
  - `long_core` → zh「长期重仓·N季」en「Core · Nq」，信息色。
  - `never_trimmed` → zh「从不减仓·N季」en「Never trimmed · Nq」，中性色。
- **sparkline**：纯内联 `<svg><polyline>`，**不引图表库**。X = 季序（升序），Y = `series` 按该证券自己的 `[min,max]` 归一化；未持有季 = 0（诚实地从零爬升）。线色随信号（加仓正色/长期信息色/其余中性）。`aria-hidden`（理由文本已表达语义）。
- **理由**：**确定性双语模板，不走 AI**（理由：贴 share-text 先例、零 AI 检测风险、快且免费、构建期静态渲染利于 SEO/GEO）。模板按信号取数：
  - `accumulating`：zh「连续 {N} 个季度增持。」en「Added for {N} straight quarters.」
  - `fresh_conviction`：zh「最新季重仓{新建/加仓}，占组合 {weight}。」en「Big {new buy/add} last quarter — {weight} of the book.」
  - `long_core`：zh「连续持有 {N} 季的核心仓位。」en「A core position held {N} quarters running.」
  - `never_trimmed`：zh「持有 {N} 季，从未减持。」en「Held {N} quarters, never sold a share.」
  - 文案纯由 `ConvictionPick` 字段决定，无外部依赖、可静态渲染。

## 5. 页面接线（`page.tsx`）

```tsx
// 已有：const d = await getManagerDetail(slug); 已有 cusipToTicker
const picks = deriveConviction(d.filings);   // 复用已加载 filings，零新增 IO
// 在 <EntityPage> 内、<HoldingsTable> 之前插入：
{picks.length > 0 && (
  <ConvictionPicks picks={picks} lang={lang} cusipToTicker={cusipToTicker} />
)}
```

- `getManagerDetail` 已被 React `cache()` 去重，页面已调用一次，**不重复调用**。
- `picks` 为空时不渲染任何节点（无空状态占位）。

## 6. 打点（measurement-loop 喂养）

- 事件：`track('conviction_card_click', { investor: slug, ticker, signal, lang })`，由 `TrackedLink` 在卡片点击时 fire-and-forget 触发，容错（被拦截不阻断跳转）。
- **不做曝光打点**（避免噪声；v1 只看点击穿透）。
- `ticker` 取 `cusipToTicker.get(cusip) ?? cusip`，与持仓表内链口径一致。

## 7. 已知边界与风险

- **不做拆股复权**：数据层 13F 报原始持股数，遇拆股会突跳，sparkline 出假"加仓"信号。这几家大票拆股罕见，**v1 标注为已知边界，不过度工程**；真踩到再处理。
- **回填未完成的基金**：仅 2 季 → 强信号不触发、区块不显，预期行为。
- **脏 ticker**：沿用 `HoldingsTable` 既有口径——`cusipToTicker` 只收 `isLikelyTicker` 通过的值，否则内链回退原 cusip（个股页仍能按 cusip 解析）。

## 8. 性能净影响

- 新增 client JS：**仅 `TrackedLink` 几行**（sparkline 全静态 SVG，零运行时）。
- 新增网络 / DB 请求：**0**（复用 `d.filings`）。
- 构建/ISR 期每页多 O(持仓数 × 季数) ≈ 几千次纯运算，可忽略。对 LCP / bundle 体积基本无感。

## 9. 验证（无 TDD，本项目约定见 [[no-tests-solo-dev]]）

- `npx tsc --noEmit` 0 错。
- `npm run build` 通过（投资人页静态预渲染不报错）。
- 人工看页面：选一个 8 季齐全的基金（如 berkshire）→ 区块出现、标签/趋势线/理由正确、卡片点击进个股页；选一个仅 2 季的基金 → 区块不显；中英双语各看一次。
