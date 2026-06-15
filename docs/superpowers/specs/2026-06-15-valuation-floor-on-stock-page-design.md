# 估值地基层落个股页 + 富数据源升级 + research 展示层暂存 — 设计

**日期：** 2026-06-15
**状态：** 已实现（分支 `feat/valuation-floor-stock`）
**⚠️ 范围收窄（2026-06-15）：** 本次只交付 **§1–§5**（估值模块 + 富数据升级 + 落 `/stocks/[ticker]`）。**§6「research 展示层暂存/删除」移出本 PR**——research 是无害孤岛，删除作为独立后续 PR 处理，本分支不动它。
**取代：** `2026-06-15-valuation-floor-epv-design.md` 的挂载/数据源假设（原假设挂 research 子系统、贫数据、保留 research，均已被推翻）
**对应路线：** 估值腿（值不值）· [[prd-roadmap]] · 硬约束见 [[valuation-philosophy-constraint]]

## 1. 背景：为什么推翻原挂载

地基层确定性引擎（两盏零增长 EPV + 资产地板 + 护城河读数 + provenance）已实现并验证（分支 `feat/valuation-floor-epv`，11 commit）。但落地点错了：

1. **挂在孤岛页**。原 spec 把卡注入 `/research/[ticker]`（ResearchPanel）。实测确认 `/research` 是**完全孤岛**：不在导航、个股页不链接、全站无任何 href 指向、`/api/research` 只被 ResearchPanel 自己 fetch。用户根本到不了 → 等于没做。
2. **数据源选错且更糟**。原实现吃 research 子系统的 `NormalizedResearchData.annual_history`（贫字段），又走**实时抓 SEC**（`lib/research/sec`，对 ISR 预渲染 top 200 不可行），价格还连着**已退役的 Finnhub**（`/research` 那张 "Valuation Metrics" 卡因此全 `Unavailable`）。
3. **发现富数据源**。个股页真正该读的入库表 `company_fundamentals_periods`（类型 `FundamentalPeriod`，`src/lib/sec/normalize-facts.ts`，由 SEC companyfacts 经 sec-fundamentals 入库）**逐年**就带着 `operating_income`/`operating_margin`、`net_income`、`d_and_a`、`capex`、`goodwill`、`intangibles`、`income_tax_expense`/`pretax_income`/`effective_tax_rate`、`shares_diluted`、`shareholders_equity` 等。原 spec 因"缺数据"做的一堆 v1 退化（硬编码 21% 税、总账面冒充有形账面、maint capex=D&A 抵消）在这张表面前大半不必要。

**用户决策（2026-06-15）：** ①估值搬进个股主页 `/stocks/[ticker]`；②本层只放零价格地板卡（价格对比仍推迟）；③`/research` 整套展示层没用，代码暂存到 archive 分支、从主线删除；④v1 升级真有效税率 + 真有形账面，维护 capex 精算仍留 v2。

## 2. 架构决策（已拍板）

- **挂载点：** `/stocks/[ticker]`（RSC，已 `revalidate = 3600` ISR、预渲染 top 200）。服务端直接渲染地板卡，替换"估值即将上线"占位。零 hydration、利 GEO，与现有 `stockProse`/`conviction` 同构。
- **数据源：** 入库富表 `company_fundamentals_periods`，经现成 `getSecCompanyData(ticker)`（`src/lib/sec/read.ts`）。**不实时抓 SEC、不碰价格**。ISR 安全（纯读库）。
- **纯函数解耦：** `computeValuationFloor` 改吃自有契约 `ValuationFloorInput`，脱离要废弃的 research schema；重定位到 `src/lib/valuation/`。
- **research 展示层暂存：** research 子系统已确认是纯孤岛（无外部依赖），整体移到 archive 分支 + 主线删除。保留入库 SEC 层（`src/lib/sec/*`）与重定位后的估值模块。

## 3. 数据契约 `ValuationFloorInput`

地基层自有的、与 research schema 无关的输入（新建 `src/lib/valuation/types.ts`）：

```
ValuationFloorYear = {
  fiscal_year: number;
  revenue?: number;
  operating_income?: number;     // 优先用它；缺则 operating_margin × revenue
  operating_margin?: number;
  net_income?: number;
  pretax_income?: number;        // 算有效税率
  income_tax_expense?: number;   // 算有效税率
  effective_tax_rate?: number;   // 入库直接给，优先
  shareholders_equity?: number;
  goodwill?: number;
  intangibles?: number;
  cash?: number;
  total_debt?: number;
  net_debt?: number;
  shares_diluted?: number;
}
ValuationFloorInput = {
  ticker: string;
  company_name?: string;
  years: ValuationFloorYear[];   // 最近 N 年（目标5最少3），降序
}
```

映射 `fundamentalsToFloorInput(rows: FundamentalPeriod[]): ValuationFloorInput`（新建 `src/lib/valuation/fundamentalsToFloorInput.ts`）：取 `fiscal_period === "FY"` 行，按 `period_end` 降序，取最近 `TARGET_YEARS` 年，逐字段映射。供个股页 RSC 调用。

## 4. 纯函数升级（核心逻辑全复用，两处用真数据）

`computeValuationFloor(input: ValuationFloorInput): ValuationFloor | undefined`。两盏灯 / lens-specific 桥（NOPAT +现金−债、owner-earnings 不加桥）/ 护城河三档 / 高杠杆警示 / N<3 退化 / 负盈利·负账面分支 / provenance —— **全部沿用已验证逻辑**。两处升级：

- **真有效税率（替代硬编码 21%）：** 每年税率优先取 `effective_tax_rate`，缺则 `income_tax_expense / pretax_income`；对可得年份求均值，`clamp 到 [0, 0.21]`（封顶法定 21%、地板 0）；**全部年份都缺才回退 0.21**。方法注与 provenance 标注实际口径。
- **真有形账面（替代总账面退化）：** 资产地板 = `shareholders_equity − goodwill − intangibles`（用最新年）。**仅当**商誉与无形**都缺**时才退化为总账面并标注"intangibles not separated"（fallback 保留）。负有形账面 → 无地板（同原分支）。

NOPAT = `avg(operating_margin 或 operating_income/revenue) × latest revenue × (1 − avgEffTax)`。owner-earnings = `avg(net_income)`（维护 capex 调整 v2，仍 = 净利）。折现带 8–10% 不变。

**provenance 升级：** `normalized_tax_rate` 改为实际多年均有效税率（或回退值）+ 标注口径；`asset_floor.basis` 反映"剔商誉/无形"或"总账面退化"。`maintenance_capex_rule` 文案保留（仍 v2）。

## 5. UI 卡（RSC 化）

把 `EarningsPowerFloorCard` 从 ResearchPanel 抽成**独立、不带 `"use client"`** 的纯展示组件（`src/components/valuation/EarningsPowerFloorCard.tsx`），个股页 RSC 直接渲染。内容不变：两盏 EPV 每股区间 + 每盏方法注（口径/杠杆/分母/桥/年份）+ v1 简化清单（现在更短：税率/有形账面已升级，只剩 SBC 不加回、owner-earnings 缺ΔWC、维护capex=D&A 留v2）+ 资产地板一行 + 护城河方向性读数 + 高杠杆警示行 + provenance 脚注。沿用站内 `Card`/`--tt-*` token 与个股页排版 idiom。

个股页集成（`src/app/[lang]/stocks/[ticker]/page.tsx`）：
```
const sec = await getSecCompanyData(ticker);
const floor = computeValuationFloor(fundamentalsToFloorInput(sec.annual));
// floor 存在 → 渲染 <EarningsPowerFloorCard floor={floor} />，删除"估值即将上线"占位
// floor undefined（<3年或缺关键字段）→ 零空盒（不渲染，占位也删）
```

## 6. research 展示层暂存（精确范围 — 已确认孤岛）

**操作：** 建 archive 分支（如 `archive/research-presentation-leg`）记录删除前状态，主线删除。git 历史天然可恢复，archive 分支仅作显式书签。

**删除（移入 archive）：**
- 页面/路由：`src/app/[lang]/research/[ticker]/`、`src/app/api/research/[ticker]/`
- 组件：`src/components/research/ResearchPanel.tsx`
- 实时抓 SEC 层：`src/lib/research/sec/`（companyFacts/buildSecResearchData/normalizeCompanyFacts/derivedMetrics/factTags/tickerCik/secConfig/types/index）
- 评估 skills + 工作流 + 门：`src/lib/research/skills/`、`workflow/`、`gates/dataQualityGate`（确认仅 research 内部引用）
- research valuation 旧件：`buildValuationData`、`calculateValuation`、Finnhub `priceProvider`、`risk/generateRiskSignals`、`mock/`
- `src/lib/research/index.ts`、`schemas/researchSchemas.ts`（其中 `ValuationFloor` 等类型先抽走，见下）

**保留 + 重定位：**
- `computeValuationFloor` + check → `src/lib/valuation/epvFloor.ts` / `epvFloor.check.ts`
- `ValuationFloor` 类型族（EpvLamp/AssetFloor/MoatReading/Provenance）→ `src/lib/valuation/types.ts`（从 researchSchemas 抽出，新增 `ValuationFloorInput`）
- 入库 SEC 层 `src/lib/sec/*` 原样保留

**删除安全性（已 grep 确认）：** 无外部代码 import `lib/research`；无外部链接/导航/sitemap 指向 `/research`；`/api/research` 仅 ResearchPanel 用；`dataQualityGate` 仅 research 内部用。删除后 `tsc`/`build` 不会因外部引用而断。

## 7. 退化 & 合规

- 逐年 FY 行 < 3 / 缺关键字段（无 revenue 或 operating margin 或 net income）→ 整卡不渲染（零空盒，占位删除）。
- 负有形账面 → 无资产地板（标注）。负归一化盈利 → 该灯"不可评估"，资产地板/护城河仍出。
- **合规不变：** 只用方法名标签（earnings-power value / asset floor / intrinsic value range），零禁词（undervalued/cheap/fair value/target price/margin of safety…），不碰价格、不做 X% under/over。`dataQualityGate` 随 research 展示层一并暂存（已确认无别处依赖），地板卡本就不经它。

## 8. 数据准确性（全局硬规则）

入库表 `company_fundamentals_periods` 来源 = SEC companyfacts（无 key），由 sec-fundamentals 入库流程维护。provenance 承载：用了哪几个 `fiscal_year`、`as_of_fiscal_year`（最新 FY）、折现带 [8%,10%]、实际归一化税率口径、维护 capex 规则、摊薄股口径。卡片脚注显式展示窗口年份与口径，满足"标来源 + as-of + 哪期财报"。

## 9. 验证（[[no-tests-solo-dev]]）

- `src/lib/valuation/epvFloor.check.ts`（`npx tsx`）：沿用全部既有断言（双灯加桥/不加桥分流、LEVR 验巴菲特不重扣债、护城河三档、高杠杆、N<3 退化、负盈利/负账面），**新增**：真有效税率多年均+封顶21%+地板0+全缺回退、真有形账面剔商誉/无形、商誉无形都缺才退化总账面、映射 `fundamentalsToFloorInput` 取 FY 行/降序/截断。
- `fundamentalsToFloorInput` 的小型 fixture 自检（FY/非FY 过滤、缺字段容错）。
- `npx tsc --noEmit` + `npm run build`（worktree 需 `npm ci` 真包）。
- 人工：`/en/stocks/AAPL`、`/en/stocks/MSFT`（卡渲染、两区间合理、护城河对、方法注清晰、provenance 年份对）；一只薄数据票（整卡退化零空盒）；确认读库无实时抓 SEC、无 Finnhub 调用；确认 `/research` 已移除（404 或不存在）且全站 build 绿。

## 10. 交付边界

本 thread 产出新 spec + plan，执行在工作分支（建议新分支 off `plan/valuation-floor-epv` 或 `db-foundation`，复用已实现的 epvFloor 核心）。

**与后续 sub-PRD：** 本层在个股页产出 `ValuationFloor`；sub-PRD 2（DCF 增长层）叠两阶段折现；sub-PRD 3 落 `valuation_runs` 缓存 + provenance；sub-PRD 4 加价格对比/strike-zone/安全边际并消解禁词冲突（届时接 `getLatestPrice` 入库价格 Yahoo/Eastmoney，不复活 Finnhub）。
