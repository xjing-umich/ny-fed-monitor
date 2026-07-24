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

## 验收记录(2026-07-24)

探针:`web/scripts/probe-ttm-basis.ts`(只读,不写表)。
运行:`cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-ttm-basis.ts` / `--sample 80`。

### §9.1 GOOGL 对账 —— PASS(复审修复:配对改人工钉死,不复刻引擎算法)

首版对账函数在 REST 侧文本复刻了 `ttmBasis.ts` 的 `findYearAgoMatch`(target−365天/±45窗/取最近)——
复审指出这是同一配对算法自证,不构成独立验证。修复:配对表改为**人工按财历钉死的常量**
(`GOOGL_CANDIDATE_PAIRS`,探针源码内注释"预期配对由人工按财历钉死,独立于引擎配对算法"),
REST 按显式 `period_end` 精确 `eq` 取行,不做任何距离/最近邻推导;候选表按财历顺序线性截断
(命中几项算几项),为未来 Q2'26/Q3'26 入库后自动前滚预留位。断言同时覆盖两件事:
①算术正确 ②引擎选取的配对季度与人工认定的一致(`as_of === 候选表命中末项`)。

```
独立复算(人工钉死配对): FY(2025-12-31)=402,836,000,000
  + Σ新季度[2026-03-31=109,896,000,000]
  − Σ钉死去年同期[2025-03-31=90,234,000,000]
  = 422,498,000,000
引擎 TTM: as_of=2026-03-31  revenue=422,498,000,000
as_of === 人工钉死候选表末项 "2026-03-31" ✅(实际 2026-03-31)
相对误差 = 0.0000%(<0.1% 达标)✅
钉死候选表命中 1/3 项(Q2'26/Q3'26 尚未入库;命中数会随入库自动增加,断言逻辑无需改代码)
```

### §9.3 FY-only ADR 零漂移(ASML/SAP/NVO)—— PASS

三票 A(FY)/B(TTM)两路 `floorInput.years` JSON 全等、`verdict` JSON 全等(均为 `null`,SAP/NVO 为 `ads_suppressed`,ASML 为 `thin_or_unvaluable_floor`,与 TTM 改动无关的既有抑制原因),且 `floorInput.ttm === undefined`。三票季度数据源本就是 20-F/6-K 而非 10-Q,`buildTtm` 天然拿不到 quarterRows,零漂移由结构保证。

### §9.2 HRB 独立对账 —— PASS(15% 季节性偏差门槛已废弃 + 配对改人工钉死)

两轮裁定叠加:①首次验收用"|TTM_NI−FY_NI|/FY_NI < 15%"作为季节性抵消的启发式断言,被真数据证伪
(实际偏差 22.1%),经手工独立复核确认增量法计算本身逐字段正确,证伪的是"偏差应为小个位数%"这条
设计期猜测,不是代码——改用独立对账断言,不再对偏差幅度设门槛。②复审指出该独立对账函数与 GOOGL
同款问题(REST 侧文本复刻了引擎的 `findYearAgoMatch` 配对算法,自证不算独立验证)——同样改为
`HRB_CANDIDATE_PAIRS` 人工钉死常量(按 HRB 财历 FY=4/30 结账,当前库内 3 个新季度各自钉死去年同期
同月末配对),REST 按显式 `period_end` 精确 `eq` 取行,不做距离推导:

```
独立复算(人工钉死配对): FY(2025-06-30)=605,773,000
  + Σ新季度[2025-09-30=−165,819,000, 2025-12-31=−242,166,000, 2026-03-31=847,901,000]
  − Σ钉死去年同期[2024-09-30=−172,576,000, 2024-12-31=−243,420,000, 2025-03-31=722,330,000]
  = 739,355,000
引擎 TTM: as_of=2026-03-31  net_income=739,355,000
as_of === 人工钉死候选表末项 "2026-03-31" ✅(实际 2026-03-31)
相对误差 = 0.0000%(<0.1% 达标)✅
钉死候选表命中 3/3 项
```

观测值(打印,不设门槛):`|TTM_NI−FY_NI|/FY_NI = 22.1%`。根因:HRB 报税季主力季度(Q3 FY,自然年 1-3 月)
真实同比大涨 —— Q3 FY2026(2026-03-31)净利 $847.9M vs 去年同期 Q3 FY2025(2025-03-31)净利 $722.3M,
同比 **+17.4%**(历史正常年度 FY 同比增速仅 ~1-2%,如 FY2023→FY2024 仅 +1.75%)。该季度贡献了 HRB 全年
绝大部分利润,单季 17.4% 的真实增长被增量法如实滚入 TTM——**这是 TTM 设计意图本身的体现(捕捉比年报
更新的真实盈利),不是季节性配对出错**。

HRB `verdict` 仍如预期被 `capital_structure_distorted` 死角闸抑制(A/B 两路皆 `null`),与本 spec 无关,系独立已立案问题。

### §9.5 全 universe 三分账抽样(N=80,按 holder_count 降序,确定性)—— PASS

```
ttm命中=62  fy回退=17  错误/跳过=1
引擎抑制: A(FY)=22  B(TTM)=21
断言: 抑制数不得高于现状 → B(21) ≤ A(22) ✅(TTM 未新增抑制,反而解除 1 例)
```

### §9.4 对照集方向性(MSFT/NFLX/AMZN/EMN)—— 记录,未设硬断言

| ticker | basis | as_of | bucket(B/TTM) | 备注 |
|---|---|---|---|---|
| MSFT | ttm | 2026-03-31 | within | TTM 营收/净利均前滚上行,方向合理 |
| NFLX | ttm | 2026-06-30 | within | — |
| AMZN | ttm | 2026-03-31 | above | — |
| EMN | ttm | 2026-03-31 | above | 周期股,TTM 利润低于 FY(下滑期前滚),方向合理 |

### SPGI / BKNG split_coverage_stale 方向(spec §6 副作用,非硬断言)

- **SPGI**:A(FY)与 B(TTM)均为 `split_coverage_stale` 抑制 —— 拆股覆盖抑制未因 TTM as-of 前滚而解除(现有 10-Q 尚未覆盖拆股后股数)。
- **BKNG**:A/B 均非 split_coverage_stale 抑制(该票本身未触发此闸);实际抑制原因是 `capital_structure_distorted`,与拆股无关。

### 结论

三条硬断言(§9.1 GOOGL、§9.2 HRB 独立对账、§9.3 ADR 零漂移)+ 抽样断言(§9.5)全过,`probe-ttm-basis.ts` exit 0。§9.2 原 15% 季节性偏差门槛已废弃并改为逐字段独立对账(见上),真实 22.1% 偏差保留为观测记录,已确认是 HRB 报税季主力季度真实同比增长(非增量法/配对缺陷)。
