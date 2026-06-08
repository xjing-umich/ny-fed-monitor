# 投资人页 · 季度对比（QoQ）与首屏层级整合 设计

> 状态：设计已与用户分段确认（2026-06-07），待用户审阅后转 writing-plans。
> 所属规划 thread：Compounder 产品长期规划。
> 相关记忆：[[prd-roadmap]]、[[product-direction]]、[[promotion-and-compliance]]、[[seo-english-first]]。

## 1. 背景与目标

属"把超级投资者做透"主线的下一块（见 [[prd-roadmap]]）。投资人详情页 `/investors/[slug]` 数据已含两期（`latest` + `prior` + `changes`），但当前没有"同一只票上季 vs 本季的真实数字并排"，也没有组合级 QoQ 概览——而 Dataroma 正缺此项（要逐行点 history）。

**核心命题不是"加 QoQ"，而是整合首屏层级。** 现状该页有**三种"本季变动"表述抢同一块首屏空间**：① AI 叙述的 moves 清单 ② 环比变动 ChangesSection（新建/清仓/加仓/减仓四列）③ 拟加的 QoQ。再叠加只会把核心持仓挤到折叠线以下。用户明确反馈：AI 叙述太占空间、把持仓挤下去。

**目标**：用一次整合，让带 QoQ 的持仓表回到首屏，同时消除三块变动表述的重复。

**非目标（YAGNI）**：多季历史趋势图（需回填，另立项）、个股 sparkline、AI 叙述文风改造（单列 backlog，见 §6）、估值。

## 2. 首屏层级（整合后竖向堆叠）

选定方向 = **A：QoQ 融进持仓表 + AI 收成一行**。自上而下：

1. **Masthead**：标题 + 副标 + verdict chip（不变）
2. **keyFacts（增强 QoQ）**：组合市值 +环比% / 持仓数 +变化 / 最新报告期 / 第一大持仓
3. **staleNotice**（陈旧时才出现，不变）
4. **AI 解读（收起）**：`judgment_line` 一行 + 免责一行（均可见）+ `<details>` 折叠 moves 清单
5. **持仓明细表（带 QoQ）** ← 首屏主角
6. **本季清仓 (n)** 行（紧凑，表下）
7. ~~ChangesSection 四列~~ → **删除**
8. sources / related（不变）

## 3. 持仓表 QoQ 与清仓行

**数据 join**（均现成）：`latest.holdings` / `prior.holdings`（同形含 `weight`）/ `changes`（`kind` + `deltaPct`）。

**权重列改为 QoQ 形态**（每行，Top25 按市值）：
- 建 `priorWeightByCusip`（来自 `prior.holdings`）。
- 行 `h`：
  - 不在 prior → **新建**：`新建 · {本季权重}%`（绿）
  - 在 prior → `{上季}% → {本季}% {▲/▼}`
- **数字取权重**（直观看仓位，1 位小数省宽）；**箭头与颜色取自 `changes.kind`**（加仓绿▲ / 减仓红▼ / 持有灰无箭头）——动作信号基于持股数（真实买卖），不被股价漂移误导。某行不在 `changes`（持有未显著变动）→ 灰、无箭头。
- 其余列：保留 `市值`；`持股数`列桌面端保留、移动端折叠（次要）。

**表下「本季清仓 (n)」行**：
- `changes.filter(c => c.kind === "exited")`，紧凑单行：`本季清仓 (3)：Issuer A、Issuer B、Issuer C`，每个链到 `stockPath`（红字）；超过 12 个显 `… 等 N 只`。
- 清仓为 0 → 不渲染该行。

## 4. keyFacts 的组合级 QoQ

| 项 | 现状 | 增强 |
|---|---|---|
| 组合市值 | `formatUSD(latest.totalValue)` | + `（环比 +X%）` vs `prior.totalValue`，绿/红 |
| 持仓数 | `latest.holdings.length` | + `（±N）` vs `prior.holdings.length` |
| 最新报告期 | `latest.period` | 不变 |
| 第一大持仓 | top issuer | 不变 |

环比为 0 → 不显示；无 `prior` → 两项退回纯当前值。

## 5. AI 叙述收起（`InvestorNarrative.tsx`）

原生 `<details>`，内容仍在 DOM（静态/SEO 友好、无 JS）：
- `judgment_line` 始终可见（一行）
- **免责标签始终可见**（小字，紧跟判断句）——满足合规（[[promotion-and-compliance]]）：AI 文本出现处即有免责。**本 PRD 只改文风之外的版式折叠，不动免责存在性。**
- `<details><summary>本季动作 (n) ▾</summary>` 包 moves 清单 `</details>`（moves 为空则不渲染 details）

## 6. 内容风格硬规则（跨页面，单列 backlog，非本 PRD 范围）

用户要求"文章去 AI 味、要过 AI 检测"。这是**跨页面内容风格规则**，主要约束 AI 叙述 prose（走"路透电讯稿"人声，去除 AI 腔）。**与本 PRD 解耦**：QoQ/清仓/keyFacts 均为确定性事实文本，天然无 AI 腔。单列 backlog「AI 叙述文风去AI味 + 过检测」记入 [[prd-roadmap]]。注意张力：去 AI 味改的是**文风**，合规免责**标签保留**（除非单独评估合规风险）。

## 7. 修改文件（聚焦单页，范围小）

- `web/src/app/[lang]/investors/[slug]/page.tsx`：
  - `HoldingsTable`：权重列改 QoQ；表下加清仓行；接收 `prior`/`changes`。
  - `keyFacts`：组合市值/持仓数加环比。
  - 移除 `ChangesSection`（及 `ChangeGroup`/`CHANGE_COPY`/`KIND_COLOR` 等其专用代码）。
- `web/src/components/entity/InvestorNarrative.tsx`：moves 改 `<details>` 折叠。
- 不动：`staleNotice`、Person/Breadcrumb JSON-LD、metadata（仍用 `judgment_line`）、`revalidate=3600`、无新路由/sitemap 变化。

## 8. 验收标准

1. 投资人页首屏：keyFacts(含环比) → AI 一行+免责 → 带 QoQ 的持仓表，持仓基本回到首屏；moves 折叠在 `<details>`。
2. 持仓表每行权重列显示 `上季% → 本季% ▲/▼`（箭头色取自 `changes.kind`），新建显 `新建·X%`，持有灰无箭头。
3. 表下「本季清仓 (n)」行正确列出 exited 票并链接；无清仓不渲染。
4. keyFacts 组合市值/持仓数显示环比；环比 0 或无 prior 不显示。
5. 旧四列 ChangesSection 已移除，无残留死代码。
6. 无 `prior`（首次申报）→ 全页优雅退回纯当前值，不报错。
7. AI 免责标签始终可见；`<details>` 内容在 DOM（构建静态、SEO 不丢）。
8. zh/en 双语；`npm run build` 通过、`/zh/investors/[slug]` 人工核对。

## 9. 风险与备注

- 权重含价格漂移；本设计已用 `changes.kind` 决定箭头方向规避"价格涨=误判加仓"。若某行在 prior 有、但不在 `changes`（被判为持有），即使权重数字微变也显灰无箭头——可接受。
- `deltaPct` 含义（持股数变动%）以 `HoldingChange` 类型为准；实现时确认其为持股数口径。
- 删 ChangesSection 后注意清理其全部专用常量/组件，避免死代码（验收 §5）。
- 实现在 worktree `.claude/worktrees/investor-qoq`（分支 `feat/investor-qoq-comparison`，基于 db-foundation 最新）。
