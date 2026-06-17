# 估值呈现层：价格 vs 地基 + strike zone（落个股页）— 设计

**日期：** 2026-06-15（2026-06-17 对齐地面真相后重写）
**状态：** 设计已确认，待 writing-plans
**对应路线：** 估值腿（值不值）· [[prd-roadmap]] · 硬约束见 [[valuation-philosophy-constraint]]
**基线：** `origin/db-foundation`（PR #67，已含 `web/src/lib/valuation/` 地基引擎 + 个股页卡）
**前序：** `2026-06-15-valuation-floor-on-stock-page-design.md`（地基层落 `/stocks`）、`2026-06-15-valuation-single-lamp-and-data-foundation-design.md`（数据牢固化）——**均已实现并入 origin/db-foundation**

## 0. 重写说明（对齐地面真相）

本 spec 初版假设估值挂 `/research`、读 research 子系统、改 `dataQualityGate` 禁词替换器。**这些假设已被并行 thread 推翻**：地基层引擎已实现并**落在 `/stocks/[ticker]`**（RSC，富数据源 `company_fundamentals_periods`），模块在 `web/src/lib/valuation/`，卡在 `web/src/components/valuation/EarningsPowerFloorCard.tsx`，价格读 `web/src/lib/managers/priceRead.ts` 的入库价（Yahoo/Eastmoney，非 Finnhub）。本层据此重写。**逻辑内核（保守参照 EPV、格雷厄姆 ⅓ 安全边际、三档击球区、资产地板第二盏灯、区间不出单点）全部保留，只换挂载/数据/合规机制。**

## 1. 背景与定位

地基层（已上线）在 `/stocks/[ticker]` 渲染两盏零增长盈利力灯（格雷厄姆 EPV、巴菲特 owner-earnings）+ 资产地板 + 护城河读数，但**全部 price-free**——卡片明示"deterministic and price-free, not price"。**没有"价格 vs 地基"对比，就回答不了"值不值"**。本层（估值流水线 sub-PRD 4）把入库价接上去，给出 margin of safety 与 strike zone。

**依赖已满足**：地基引擎已在 origin/db-foundation，本层可立即执行，无需等待。

## 2. 合规（比初版简单）

- **`/stocks` 估值卡不经过任何禁词 sanitizer**（`dataQualityGate` 属 `/research` 子系统，与个股页无关）。初版设计的"引擎来源允许集 / 豁免路径"**不再需要**——直接渲染即可。
- **合规靠卡片自身文案纪律 + 强制免责**：`margin of safety`、`strike zone` 作为确定性引擎自标输出可用，但必须挂强制免责（机械、零增长、保守估计；非投资建议；非买卖信号；是否挥棒由你判断）+ 方法链接。
- **零推荐底线不变**（[[valuation-philosophy-constraint]]）：不出 BUY/SELL/HOLD、不喊目标价、不做情绪/动量。"in strike zone" = 观察 + 用户自判。

## 3. strike-zone 判定逻辑

纯函数 `deriveStrikeZone(floor: ValuationFloor, price: LatestPrice | null): StrikeZoneAssessment | undefined`（建 `web/src/lib/valuation/strikeZone.ts` + `strikeZone.check.ts`）。

输入用已有契约（`web/src/lib/valuation/types.ts`）：
- `ValuationFloor.graham_epv` / `buffett_epv`：`EpvLamp { assessable, per_share_low?, per_share_high? }`
- `ValuationFloor.asset_floor`：`AssetFloor { assessable, per_share? }`
- `LatestPrice { close, date, currency, source? }`（`getLatestPrice(ticker)`，入库价）

### 3.1 参照地基（取最保守端）

`epvFloorConservative` = 两盏灯中**可评估（assessable）的 `per_share_low` 的全局最小值**。只有便宜到连最苛刻的每股 EPV 下端都打 ⅓ 折才算进击球区——与品牌保守姿态一致。两盏都不可评估 → 无 EPV 击球区（资产地板第二盏灯仍可独立判，见 §3.4）。

### 3.2 margin of safety（区间）

`MoS = (epvFloorConservative − price.close) / epvFloorConservative`。EPV 是区间 → 对最保守 `per_share_low` 与最高 `per_share_high` 各算一个 MoS，呈现为区间，不出单点。

### 3.3 strike zone 三档（确定性）

- `in_strike_zone`：price ≤ epvFloorConservative × (1 − ⅓)，即 MoS ≥ ⅓（格雷厄姆经典安全边际）。
- `approaching`：0 ≤ MoS < ⅓。
- `outside`：price > 地板（MoS < 0）。

⅓ 阈值具名常量 `GRAHAM_MOS = 1/3`，plan 里定。

### 3.4 资产地板第二盏灯

另判 `price.close ≤ asset_floor.per_share`（仅 `asset_floor.assessable` 时）→ 额外标"价格低于可复制资产基础"（更硬更罕见的信号），独立于 EPV 击球区。

## 4. 可视化（RSC、零 hydration、GEO 友好）

扩 `EarningsPowerFloorCard` 加"价格 vs 地基"段（沿用 `--tt-*` token、个股页排版 idiom，**保持 RSC 无 `"use client"`**）：
- 一条数轴 band：资产地板点 + 两盏 EPV 区间带 + **阴影"击球区"段**（≤ epvFloorConservative × ⅔）+ 当前价标记。
- 一句大白话 + MoS 区间 + 三档标签 + **强制免责** + 价格 as-of/source 脚注。
- 卡片顶部原文案 "deterministic and price-free" 在价格段出现时相应调整（价格段是唯一引入价格的部分；两盏 EPV 仍 price-free）。

## 5. 价格源与新鲜度（撞全局「数据准确性」硬规则）

- 走现成 `getLatestPrice(ticker)`（入库 `prices`，Yahoo/Eastmoney）。**标价格 as-of `date` + `source`**。
- **过期价格**（`date` 距今 > 阈值，如 5 个交易日，plan 定）→ "as of <date>，可能过期"降级标，区间照出。
- **币种错配**：SEC companyfacts 财报为 USD，故每股 EPV 为 USD。若 `price.currency !== "USD"` → MoS 比较无意义，**strike-zone 块整体退化隐藏 + 标原因**，地基卡其余照常。

## 6. 架构与集成

- 纯函数 `web/src/lib/valuation/strikeZone.ts` → `deriveStrikeZone(floor, price)` + `strikeZone.check.ts`（`npx tsx`）。
- `web/src/lib/valuation/types.ts`：新增 `StrikeZoneAssessment` 类型（zone 三档 + MoS 区间 + 参照值 + asset-floor 灯 + 价格 as-of/source + 降级标）。
- `web/src/components/valuation/EarningsPowerFloorCard.tsx`：加 `strikeZone?: StrikeZoneAssessment` 入参 + 价格 vs 地基段 + band 图 + 免责。
- `web/src/app/[lang]/stocks/[ticker]/page.tsx`：在算完 `valuationFloor`（line ~234）后加
  ```ts
  const price = await getLatestPrice(ticker);
  const strikeZone = valuationFloor?.kind === "floor" ? deriveStrikeZone(valuationFloor, price) : undefined;
  ```
  传入 `<EarningsPowerFloorCard floor={valuationFloor} strikeZone={strikeZone} />`。
- **不碰 `/research`、不碰 `dataQualityGate`、不复活 Finnhub。**

## 7. 边界情况

- **无价格**（`getLatestPrice` 返回 null / 无 env）→ strike-zone 段不渲染，地基卡其余照常。
- **`PerShareUnavailable` 地基**（多股权结构）→ 无每股 → strike-zone 段不渲染（卡片本就走诚实标注分支）。
- **两盏 EPV 灯都 not assessable** → 无 EPV 击球区；asset-floor 第二盏灯若 assessable 仍可出。
- **过期价格** → 降级标注，不隐藏。
- **币种错配** → strike-zone 段退化隐藏 + 标原因。
- **负 MoS（价格高于地板）** → `outside`，常见态，照常呈现。

## 8. 测试（[[no-tests-solo-dev]]，不引测试框架）

- `strikeZone.check.ts`（`npx tsx`）：三档分类边界（MoS=⅓ 临界）、MoS 区间、参照=可评估灯 per_share_low 全局最小、两盏都不可评估→无 EPV 击球区、asset-floor 第二盏灯、无价格→undefined、`PerShareUnavailable`→undefined、过期标触发、币种错配退化、负 MoS=outside。
- `npx tsc --noEmit` + `npm run build`（worktree 需 `npm ci` 真包，见 [[worktree-build-needs-real-node-modules]]）。
- 人工：`/en/stocks/AAPL`（band 合理、击球区段对、MoS 区间、免责、价格 as-of 在位）、一只无价格票（段隐藏地基仍在）、一只 `PerShareUnavailable` 票（如 BRK/GOOG 多股权）、一只外币票（币种错配退化）。

## 9. 交付边界

本 thread 仅产出 spec + plan，执行在独立 worktree/分支，**从 `origin/db-foundation` 切**（地基引擎、价格读、个股页卡均已在）。依赖已满足，可立即执行。

**新增/改动文件：**
- 新增 `web/src/lib/valuation/strikeZone.ts` + `strikeZone.check.ts`。
- 改 `web/src/lib/valuation/types.ts`：新增 `StrikeZoneAssessment`。
- 改 `web/src/components/valuation/EarningsPowerFloorCard.tsx`：价格段 + band + 免责。
- 改 `web/src/app/[lang]/stocks/[ticker]/page.tsx`：取价 + 注入 `strikeZone`。

**与后续 sub-PRD：** sub-PRD 2（巴菲特 owner-earnings DCF 增长层）给第三盏增长灯，届时击球区参照可纳入增长后保守内在值；sub-PRD 3 把价格 as-of/provenance 落 `valuation_runs` 缓存。
