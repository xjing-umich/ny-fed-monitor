# macro 贴现率桥（双向）设计

- 日期：2026-06-30
- 分支：`plan/macro-discount-bridge`（off `db-foundation`）
- 纲领对齐：[[north-star-strategy]] §6 macro 拍板保留 + 往主线并入；Phase 1 柱①形式合力。
- 范围：给 macro 孤岛接**双向**语义桥——用"10 年期美债贴现率"这条真实关系，把估值卡与 macro 利率视图互链，让 macro 脱离孤岛。

## 问题

产品路径审计确认：macro 是孤岛——核心页进不去 macro、macro 出不来核心。但存在一条**诚实的语义桥**：估值引擎的 Owner-Earnings DCF 用 DGS10（10 年期美债）作贴现率锚（`getLatestDgs10` → `market_rates` last-good，见 [[dgs10-anchoring-fix]]），而 macro 正是追踪这些利率的地方。"为什么利率决定 AAPL 贵不贵"是真的、非牵强、且很巴菲特/格雷厄姆。用这条关系接双向链接，即可脱岛。

§6 已拍板 macro 保留并往主线并入——本 PRD 是"并入"的第一步。

## 目标 / 非目标

**目标**：两向轻量链接——
1. 估值卡（个股页）→ macro 利率视图：把已显示的 DGS10 贴现锚变成通往 macro 的入口。
2. macro overview 页 → screener：把 macro 读者引回"值不值"发现面。

**非目标（YAGNI）**：
- 不做数据集成（不把利率图搬进估值卡、不把估值搬进 macro）。
- 不改估值/DCF 计算逻辑。
- 不碰 macro 数据管线。
- 不加埋点（CTA 埋点是另一 PRD；如需可后续给这两个链接补 track）。

## 约束（硬）

- **估值哲学红线**：文案只陈述事实/教育（利率是贴现率地基），无 buy/sell/目标价。
- **文案禁中英混排**：每 locale 纯单语言。
- **设计语言**：仅 `--tt-*`；mono eyebrow/链接 + `→`；`rounded-md` 面板；纯 RSC 零 hydration。
- **诚实**：估值卡侧仅当有真锚（`dgs10_value` 非空）才链接；用兜底 9–11% 带时不渲染（无锚可指）。
- **优雅降级**：任一读取缺失不影响页面渲染。

## 既有事实（设计输入，已读代码）

- 估值卡 `EarningsPowerFloorCard`（`src/components/valuation/EarningsPowerFloorCard.tsx`，RSC，props 含 `lang: Lang`）已在 provenance 区显示 DGS10：`oeDcf.discount.dgs10_value` + `oeDcf.discount.dgs10_date`（类型 `DiscountBandProvenance`，`types.ts:233-234`，`dgs10_value?: number` **fallback 时 undefined**）。有 `pct1` 等格式化工具在文件内。
- 个股页把 `oeDcf` 传入卡片；`dgs10` 来自 `getLatestDgs10()`（`treasuryRead.ts`）。
- **URL 走 `localePath` 单一真相源**（i18n hide-default-locale 迁移已合并，PR #132/#133）：`localePath(lang, path)`（`urls.ts:5`）= **en 裸前缀 / zh 加 `/zh`**，支持带 query。硬编码 `/{lang}/...` 已作废（英文会 301）。既有 `discoveryHandoff.ts` 已用此写法。
- macro 利率视图目标 = `localePath(lang, "/macro?view=macro-pricing")`（`MacroSubNav` 现有视图，稳定存在）。
- macro overview 页 `src/app/[lang]/macro/page.tsx`（`MacroOverviewPage`，RSC，有 `lang`）渲染 `MacroViewHero` + `MacroViewModules` + 若干 `<section>`。
- screener 目标 = `localePath(lang, "/stocks/screener")`（含自身合规免责）。

## 设计

### 方向 1 — 估值卡 → macro（改 `EarningsPowerFloorCard.tsx`）

在贴现率 provenance 区加一条紧凑 mono 源链接，**仅当 `oeDcf?.discount?.dgs10_value != null` 时渲染**：
- zh：`贴现锚 · 10Y 美债 {pct1(dgs10_value)} @ {dgs10_date} — 看利率走势 →`
- en：`Discount anchor · 10Y Treasury {pct1(dgs10_value)} @ {dgs10_date} — see rate trend →`
- href：`localePath(lang, "/macro?view=macro-pricing")`
- 无真锚（`dgs10_value` undefined，用 9–11% 兜底）→ 不渲染（诚实）。
- 用 `next/link`（RSC 内静态链接）+ 现有 `pct1`。样式：mono、`--tt-muted`、hover `--tt-accent`、带 `→`。

### 方向 2 — macro → 核心（新建 `components/macro/ValuationBridgeCta.tsx` + 挂载）

新建小 RSC 组件 `ValuationBridgeCta({ lang })`，紧凑 `rounded-md` 面板，讲清利率↔估值关系并链到 screener：
- zh：eyebrow `利率 × 估值`；正文 `10 年期美债利率是我们给每只股票估值时用的贴现率地基。`；CTA `看看现在哪些股票相对保守价值带便宜 →`
- en：eyebrow `Rates × valuation`；正文 `The 10-year Treasury yield is the discount-rate floor we use to value every stock.`；CTA `See which stocks are cheap against a conservative value band →`
- href：`localePath(lang, "/stocks/screener")`
- 挂载：`macro/page.tsx` 的 `MacroViewHero` 之后（利率语境自然接"这利率怎么用于估值"）。

## 组件边界

- 方向 1：几行内联进 `EarningsPowerFloorCard` 的 provenance 段（就近于已有 DGS10 展示，属同一职责）。
- 方向 2：独立小组件 `ValuationBridgeCta.tsx`（保持 macro 页干净、可复用）。

## 错误处理 / 降级

- 方向 1：`oeDcf?.discount?.dgs10_value` 为空 → 整条链接不渲染（估值卡其余照常）。
- 方向 2：纯静态文案+链接，无外部读取，不会失败。
- 两向均纯 RSC，无客户端逻辑。

## 测试 / 验证

- 无纯函数（纯展示 + 静态链接），无 `.check.ts`。
- `cd web && npx tsc --noEmit` → exit 0。
- curl view-source：某个股页（有真 DGS10 锚）出 `/macro?view=macro-pricing` 链接；某兜底带票不出该链接；`/macro` 出 `/stocks/screener` 链接。
- 人工 QA：dark/light + 390/768/1280；文案纯单语言、无买卖措辞。

## 分解为执行块（建议）

1. **块 A — 方向 1**：估值卡加贴现锚源链接（含 `dgs10_value` 空守卫）。
2. **块 B — 方向 2**：`ValuationBridgeCta.tsx` + macro 页挂载。

A、B 互不依赖，可并行。
