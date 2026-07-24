# 估值基点 TTM 化(增量法)设计

日期:2026-07-24 · 状态:已获用户批准(方案 A + 增量法 + 只换最新基点 + FY 兜底)

## 1. 问题

全站估值引擎只吃 `fiscal_period=FY` 的年报行(`fundamentalsToFloorInput` 过滤 + ingest 传 `sec.annual`),"最新一年"锚定最新 10-K:最好情况滞后约 1 个季度,最坏情况(临近下一份 10-K 前)滞后约 13 个月。价格实时、基本面陈旧,安全边际的"值"与"价"不同代。10-Q 已入库(`company_fundamentals_periods` 非 FY 行)但只用于展示。

用户决策:估值必须按 TTM 来。

## 2. 已锁定的口径决策(用户拍板)

1. **拼接法 = 增量法**:`TTM = 最新FY + Σ(FY后新季度) − Σ(去年同期匹配季度)`。锚仍是审计过的 10-K,只叠加增量;天然抵消季节性;有 1 个新 10-Q 即可更新。
2. **范围 = 只换最新基点**:历史多年正常化、增长回归、5 年连续盈利闸、roicLongTermStrong、growthFranchise 等全部继续吃**纯 FY 审计序列**;只有"最新一年"的消费点换 TTM。
3. **兜底 = 回退 FY 并标注**:TTM 拼不出(无季度数据 ~436 只、季度残缺、配对失败、卫生闸不过)→ 原样用最新 FY 口径,UI 如实显示年报期末。回退票 byte-for-byte 零漂移。
4. **架构 = 方案 A(合成 TTM 行)**:一处合成,替换引擎工作序列头部,下游消费点零改动。

## 3. 数据事实(2026-07-24 生产库侦察)

- 1271 票有近 18 个月季度行;436 票 FY-only(外股/ADR 为主)→ 兜底必须存在。
- 最新季度行资产负债表 1256/1271 齐、shares_diluted 1226/1271 齐。
- 近 4Q opInc 全齐仅 983 票 → 滚动 4Q 求和覆盖差,增量法不受此限(单项缺→整体回退,见 §4.4)。
- 派生 Q4 行 1720 条,历史上有 shares_diluted 损坏前科 → **增量法只用真实 10-Q 行,不碰任何 `is_derived` 行**(结构性绕开雷区)。
- 已知伴生 bug:年中结账公司(HRB/MSFT/ORCL)FY 行 `fiscal_year` 标签系统性 off-by-one → 季度配对**禁止按 fiscal_year/fiscal_period 标签**,一律按 `period_end` 日期窗配对(§4.2)。

## 4. TTM 合成规则(新模块 `web/src/lib/valuation/ttmBasis.ts`,纯函数)

### 4.1 输入/输出

```ts
buildTtmYear(input: {
  fyRows: FundamentalPeriod[];        // fiscal_period=FY, most-recent-first
  quarterRows: FundamentalPeriod[];   // 非FY行, most-recent-first
}): { year: ValuationFloorYear; period_end: string; quarters_used: string[] } | null
```

返回 null = 不可用,调用方回退 FY(现状路径,零漂移)。

### 4.2 选行与配对(全按 period_end,不看 fiscal_year/fiscal_period 标签)

- 锚 = 最新 FY 行(period_end 记为 `E0`)。
- **新季度** = 真实 10-Q 行(`form=10-Q` 且非 `is_derived`)中 `period_end > E0` 的,按期末升序取全部(≤3 个;≥4 个说明年报缺报,回退)。
- **去年同期配对**:对每个新季度(期末 `q`),在真实 10-Q 行里找 `period_end ∈ [q−1年−45天, q−1年+45天]` 的行;任一新季度找不到配对 → 整体返回 null。
- 数据源:`getSecCompanyData` 的 `quarterly` 上限从 8 提到 **12**(最坏 3 新 + 3 配对 + 缓冲,含跨年)。

### 4.3 字段合成

- **流量项**(revenue, gross_profit, operating_income, net_income, pretax_income, income_tax_expense, d_and_a, capex, rd_expense, sga_expense, stock_based_comp, operating_cash_flow, share_repurchases, dividends_paid):`FY + Σ新 − Σ配对`。**三方(FY/新/配对)任一为 null 的字段 → 该字段整体回退取 FY 原值**,并计入 `degraded_fields`;若 revenue 或 net_income 落入 degraded → 整体返回 null(核心流量必须真 TTM,否则口径混搭)。
- **存量项**(shareholders_equity, goodwill, intangibles, cash, total_debt, net_debt, working_capital, ppe_net, current_assets, current_liabilities, total_liabilities, preferred_equity):直接取**最新真实 10-Q**;该行某存量为 null → 回退 FY 值(存量单项回退可接受,资产负债表不做加减拼接)。
- **shares_diluted**:最新真实 10-Q 报告值;null → FY 值。沿用 adsRatio 归一化。
- **派生比率**(operating_margin, effective_tax_rate):由 TTM 分子分母重算,算不出置 undefined(引擎自会退化)。
- **fiscal_year 标签**:`最新FY.fiscal_year + 1`(代表 FY 之后延伸的滚动窗;工作序列已剔除 FY0,无同标签冲突)。已知副作用:R&D 资本化 aging 以该标签为 currentYear,FY0 被 TTM 顶替后 age=1 档空缺,FY-1 直接落 age=2,资本化 R&D 略偏低——方向保守,接受(见 §10)。

### 4.4 卫生闸(任一触发 → 返回 null,整体回退 FY)

1. 新季度数 0 个(没有比年报新的 10-Q → TTM 无意义,直接用 FY)。
2. 任一新季度缺去年同期配对(§4.2)。
3. TTM revenue ≤ 0,或 TTM net_income 非有限数。
4. revenue / net_income 落入 degraded_fields(§4.3)。
5. 合成行违反 `fundamentalsIntegrityViolated` 不变量(opInc>revenue / gross>revenue)。

设计立场:**宁可整体回退到审计年报,不输出混搭口径的"半 TTM"。**

## 5. 注入 seam(引擎侧,唯一侵入点)

- `ValuationFloorInput` 增可选字段:
  ```ts
  ttm?: { year: ValuationFloorYear; period_end: string; quarters_used: string[] };
  ```
- `fundamentalsToFloorInput` 增第 6 参 `quarterRows?: FundamentalPeriod[]`:传入且 `buildTtmYear` 成功 → 填 `ttm`;否则不填(现状)。
- `computeValuationFloor`(epvFloor.ts:103)开头:
  ```ts
  const fyYears = input.years;                       // 纯FY,喂 allYears
  const workYears = input.ttm ? [input.ttm.year, ...fyYears.slice(1)] : fyYears;
  ```
  - `earningsYears/marginYears/shares` 选取全部改跑 `workYears`(TTM 顶替 FY0,窗口与 FY-1 不重叠,不双计)。
  - `allYears = fyYears` **保持纯 FY**(roicLongTermStrong、structuralConfidence 趋势、growthFranchise、strong 盈利闸的既有语义逐字不动)。
- 下游(EPV 最新营收×正常化利润率、净债/权益/超额现金、重置价值、net-net 流动资产、structuralConfidence 的 `years[0].net_income` target、oeDcf、maintenanceCapex、moatCap declined)**零代码改动**,经 `years[0]` 自动吃到 TTM。

## 6. as-of 两道闸重新锚定(ingest + 个股页同改)

`isFundamentalsStale` 与 `isSplitCoverageStale` 的 `fundamentalsAsOf` 从 `sec.annual[0].period_end` 改为 `ttm?.period_end ?? sec.annual[0].period_end`。

- 预期副作用(正收益):SPGI/BKNG 类"拆股晚于年报"抑制票,新 10-Q 覆盖拆股后股数即自动复活——验收时显式核对方向,**但拆股期夹在"配对季度与新季度之间"时股数口径依旧错配,须确认 isSplitCoverageStale 语义在 TTM as-of 下仍保守**(拆股日 > TTM 期末仍抑制;拆股日 ≤ TTM 期末即视为已覆盖,依据是存量/股数取自最新 10-Q)。
- 注意:流量增量法用的是"新减旧"差额,不含每股口径,拆股不污染流量项。

## 7. 快照与 UI

- **snapshot payload** 增 `fundamental_basis: { kind: "ttm" | "fy", as_of: string, quarters_used?: string[] }`(入 payload,不加列,无迁移)。
- **个股页**:Business quality 卡与估值卡 as-of 显示 TTM 期末;眉标 `SEC 10-K` → `SEC 10-K + 10-Q · TTM`(TTM 生效时);加一行双语披露"trailing twelve months; includes unaudited 10-Q data / 滚动十二个月,含未审计 10-Q 数据"。FY 回退票展示原样。文案双语各自成文,过 copy-voice(去 AI 腔)验收。
- Business quality 四指标本身读 `company_fundamentals_latest`(年度视图)——本期**只改 as-of 标注与眉标口径说明,不改四指标算法**;四指标 TTM 化另开小 spec(展示层,与引擎解耦)。

## 8. 非目标

- 不做全序列滚动 TTM 化(历史仍纯 FY,用户已拍)。
- 不改 SEC ingest 抓取范围(季度行已在采)。
- 不修年中结账公司 fiscal_year 标签 off-by-one(§3 已绕开;独立数据卫生 spec)。
- 不动 capital_structure_distorted 死角闸(HRB/HD/MCD 大面积抑制是另一个已立案问题,独立 spec)。
- 不做 Business quality 四指标 TTM 重算(§7)。

## 9. 验收(真数据,BEFORE/AFTER 探针,沿用 probe 模式)

1. **GOOGL**:basis=ttm,as_of 2025-12-31 → 2026-03-31(Q2'26 10-Q 入库后自动前滚);TTM 营收 ≈ 402.84B + Q1'26(109.90B) − Q1'25(90.23B) ≈ 422.5B,逐字段对账。
2. **季节性标杆 HRB**(利润集中报税季):TTM NI 与 FY NI 偏差应为小个位数%——增量法抵消季节性的直接证据(HRB verdict 仍被死角闸抑制,只验 floor 层数字)。
3. **FY-only 票**(ADR 抽 3 只):floorInput 与 verdict byte-for-byte 零漂移。
4. **对照集**:MSFT/NFLX/AMZN/EMN 带位与 bucket 移动方向可解释(基本面前滚导致,幅度记录在案)。回归型判据(growthFranchise / roicLongTermStrong / structuralConfidence 趋势 / strong 盈利闸)零漂移(allYears 纯 FY);EPV/AV franchise 比率会随 TTM 移动——属设计内,记录移动票并核对方向合理(盈利前滚 → 比率同向)。
5. **全 universe fillrate**:TTM 命中数、回退数、抑制数三分账;抑制数不得高于现状;`valuation-fillrate.ts` 扩展输出 basis 分布。
6. **卫生闸逐条负例**:构造缺配对/负收入/不变量违反的合成输入,`buildTtmYear` 必须返回 null(check 脚本断言)。
7. tsc 全绿;所有 `.check.ts` 通过。

## 10. 风险与守法

- **10-Q 未审计/可能重述**:增量法把未审计暴露面限制在 ≤3 个季度的差额,地基仍是 10-K;UI 明示披露。
- **季度 XBRL tag 覆盖差**:单字段 degraded 回退 FY 值,核心字段(revenue/NI)degraded 则整体回退——绝不混搭出"半 TTM"。
- **多年平均含 TTM 头**(权重 ≤1/5):这是主流 TTM screener 语义,且 declined 检查/均值口径自洽;审计纯度由 allYears 层保住。
