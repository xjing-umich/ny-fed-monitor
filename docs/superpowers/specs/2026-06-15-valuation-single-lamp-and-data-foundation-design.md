# 估值地基层数据牢固化：金融股单灯回退 + 诚实不可评估标注 — 设计

**日期：** 2026-06-15
**状态：** 已设计，待实现（分支 `feat/valuation-single-lamp`）
**对应路线：** 估值腿（值不值）· [[prd-roadmap]] · 硬约束见 [[valuation-philosophy-constraint]]
**前序：** `2026-06-15-valuation-floor-on-stock-page-design.md`（地基层已落个股页，PR #65/#66 已合并）

## 1. 背景：为什么"很多股票没有估值数据"

地基层确定性引擎上线后，个股页 34 只入库票中**仅 21 只渲染估值卡**。用 SEC companyfacts 真账逐票核对（截至 2026-06-14 ingest），13 只缺失，分三类根因：

| 类 | 票 | 根因（已用 SEC 真账核实） |
|---|---|---|
| **B1 缺营业利润** | AXP BAC BNY COF JPM PGR SCHW WFC（银行/保险）+ JNJ | 银行/保险 XBRL **根本不报** `OperatingIncomeLoss`；JNJ 近年停报（末次 2014）。但它们**净利、税前利润、营收、摊薄股数全有**。营业利润率为空 → `selectYears` 把每年过滤 → <3 年 → 不渲染。 |
| **B2 多股权结构** | V、BRK.A、BRK.B | 股数/EPS 在 SEC **只按 A/B/C 股类分维度上报**；companyfacts 接口只返回无维度总量 → 取不到真实经济股数（dei 封面股数仅 Class A，偏约 20%，不可用）。 |
| **B3 外币计量** | ASML | 全部财报以 **EUR** 计；`getUnits` 只读 `USD`/`shares` 单位 → 所有金额字段落空（仅股数 unit=shares 能进）。把 EUR 当 USD 用违背数据准确硬规则。 |

**核心洞察：** B1 缺的不是数据是**口径**——银行无法拆分经营/融资，Greenwald/巴菲特正统做法本就是按归属净利/ROE（owner-earnings）估，**Graham 那盏"NOPAT/WACC·去杠杆+现金桥"灯对金融企业本就不成立**。B2/B3 是数据源表示层的结构性限制，需更大基建（分维度事实 / 币种贯穿），属独立后续。

## 2. 决策（已与用户拍板）

1. **金融股 + 同类（无营业利润但有净利+股数）→ Buffett owner-earnings 单灯**。纯按数据可得性触发，不靠 SIC 行业分类。
2. **V / BRK（多股权、无法取得真实股数）→ 诚实不渲染每股，卡片标注原因**，不造假数。
3. **ASML（外币）→ 本轮静默不渲染**（同薄数据票），不加专门标注；外币支持作独立后续。
4. **多股权股数提取、外币支持** 均移出本轮，各自独立 spec。

## 3. 范围（本轮交付）

### 判定顺序（消歧义，A/B 互斥）

`computeValuationFloor` 决策树，自上而下首个命中者胜：

1. 选出"有盈利信号"年份（`net_income != null`）。若 <3 年 → 返回 `undefined`（真薄数据，零空盒，现行不变）。
2. 否则若**无任何可用摊薄股数** → 返回 `{ kind: "per_share_unavailable", reason }`（B 项；命中 V/BRK——注意 V 虽有营业利润率，但无股数故仍走此支）。
3. 否则（有股数）：若 ≥3 年有营业利润率 → **两灯完整档**（现行逻辑）；否则 → **Buffett 单灯档**（A 项；命中 8 家金融 + JNJ）。

### A. 引擎：数据驱动的单灯回退

`computeValuationFloor`（`src/lib/valuation/epvFloor.ts`）：

- **年份筛选放宽。** 当前 `selectYears` 要求每年 `revenue && margin && net_income`。改为两档：
  - **完整档**（有营业利润率）：≥3 年 `revenue && marginOf && net_income` → 两灯齐出（现行逻辑不变）。
  - **单灯档**（营业利润率不可得）：完整档不足 3 年，但 ≥3 年有 `net_income` 且存在摊薄股数 → 进入单灯模式。
- **单灯模式输出：**
  - `graham_epv.assessable = false`，`not_assessable_reason = "Operating income is not reported separately (e.g. banks, insurers, and some diversified issuers), so the unlevered NOPAT lens does not apply. Earnings power is shown via owner earnings below."`（方法名标签，零禁词）。
  - `buffett_epv` 照常计算（avg net income / 8–10% 折现带 → 每股区间）。
  - `asset_floor`、`moat_reading` 在可算时照常输出；护城河读数原依赖 Graham EPV，单灯下改依赖 Buffett EPV（取其每股中值与资产地板比，三档逻辑不变）。
  - `provenance.earnings_basis_note` 标注本票为单灯口径及原因。
- **判定函数 `hasOperatingMargin(years)`** 抽出，完整/单灯两档共用，便于测试。

### B. 诚实"不可评估"标注（无股数）

- 新增轻量返回态：当 ≥3 年有盈利数据、但**无任何可用摊薄股数**时，`computeValuationFloor` 不再返回 `undefined`，而返回 `{ kind: "per_share_unavailable", reason }` 形态（与完整 `ValuationFloor` 用判别字段 `kind` 区分；完整态隐含 `kind: "floor"`）。
  - `reason = "This issuer has a multi-share-class structure; a blended per-share count is not available from the current data source, so a per-share floor is not computed here."`
- 卡片 `EarningsPowerFloorCard` 接受联合类型：`per_share_unavailable` → 渲染分区标签下一行说明（沿用 `--tt-muted`），不出数字。命中 V / BRK.A / BRK.B。
- 真薄数据（<3 年盈利）仍返回 `undefined` → 整卡不渲染（现行零空盒不变）。个股页 `page.tsx` 的 `{valuationFloor && (...)}` 守卫需适配联合类型（`per_share_unavailable` 也要进 section 渲染标注）。

### C. 股数 tag 兜底（稳健化）

`src/lib/sec/fundamental-tags.ts`：`shares_diluted` 回退链扩为
```
["WeightedAverageNumberOfDilutedSharesOutstanding",
 "WeightedAverageNumberOfShareOutstandingBasicAndDiluted",
 "WeightedAverageNumberOfSharesOutstandingBasic"]
```
首个命中者胜（现行 `collectFlow` 逻辑）。利好未来仅报 basic 的单一股权结构发行人；对 V/BRK 无效（分维度上报，本轮不解决）。**需重跑 ingest 才回填**，但不影响本轮主目标（A 项金融股为读时逻辑、即时生效）。

## 4. 数据流与影响面

- **A（单灯）**：纯读时逻辑，读现有 `company_fundamentals_periods` 行（金融股的净利/股数已在库）→ **合并即生效，无需重跑 ingest**。恢复 9 票。
- **B（标注）**：纯引擎/卡片返回态，无 IO。命中 V/BRK.A/BRK.B。
- **C（tag 兜底）**：改 ingest 提取层，**须重跑 `ingestAllCompanies` 回填**方见效；非本轮硬目标。

## 5. 类型变更（`src/lib/valuation/types.ts`）

- `EpvLamp` 增 `not_assessable_reason?: string`（若尚无）。
- `ValuationFloorProvenance` 增 `earnings_basis_note?: string`。
- `computeValuationFloor` 返回类型由 `ValuationFloor | undefined` 改为 `ValuationFloor | PerShareUnavailable | undefined`，其中 `PerShareUnavailable = { kind: "per_share_unavailable"; reason: string }`；`ValuationFloor` 加 `kind: "floor"` 判别字段。

## 6. 合规（[[valuation-philosophy-constraint]]）

- 只用方法名标签（earnings-power value / owner earnings / asset floor / intrinsic value range），零禁词（undervalued/cheap/fair value/target price/margin of safety…）。
- 单灯回退的文案描述"为什么这盏灯不适用"，不暗示买卖、不碰价格。
- 不触碰 `dataQualityGate`（已随 research 展示层暂存，与本层无关）。

## 7. 验证（[[no-tests-solo-dev]]）

- `src/lib/valuation/epvFloor.check.ts` 扩断言：
  - **单灯回退**：金融 fixture（有净利+股数、无营业利润率）→ `graham_epv.assessable === false` 且带 reason、`buffett_epv` 出每股区间、`asset_floor`/`moat_reading` 仍出、`provenance.earnings_basis_note` 存在。
  - **多股权无股数**：有盈利、无股数 → 返回 `{ kind: "per_share_unavailable" }` 带 reason。
  - **回归**：既有两灯/双桥不加桥/真有效税/有形账面/高杠杆/N<3 退化/负盈利负账面断言**全部不变**。
- `fundamentalsToFloorInput.check.ts` 不变（映射未改）。
- `npx tsc --noEmit` + 既有 check 全绿。
- 真账抽验（用 service key 读生产库 + 跑引擎）：确认 8 家银行/保险 + JNJ 进单灯档出 Buffett 每股；V/BRK 返回 per_share_unavailable；其余 21 票输出与现状一致（无回归）。

## 8. 交付边界

本轮新增 spec + plan，执行在 `feat/valuation-single-lamp`（off 最新 `db-foundation`）。

**后续独立 sub-spec：**
- 多股权分维度股数提取（V/BRK 真实经济股数）。
- 外币支持（ASML 等：reporting currency 字段贯穿 `FundamentalPeriod` → 引擎 → 卡片币种标注）。
- 维护 capex 精算（v2，沿用既有 deferral）。
- 价格对比/strike-zone（sub-PRD 4，接入库价格，消解禁词冲突）。
