# 件⑤：控股集团两栏法（分部 SOTP）

日期：2026-08-10 · 分支：`plan/valuation-holdco-sotp`（off `origin/db-foundation` @5381c6a，已含件①②③④）

## 0. 目标与前情

件④让伯克希尔不再挂「价值毁灭 / 贵 124%」的假结论，但代价是**整条抑制**——BRK.A/BRK.B/WTM 现在只有一句说明加一行资产底，没有估值。件⑤给这类主体一个**真正的、可拆开看的估值**：巴菲特自己的两栏法。

**为什么合并层面的单一镜头对它们无效**（件④已论证，此处只列结论）：资产里几千亿是按市值计价的证券，其回报是价格增值而非现金收益；件③又已（正确地）把这部分增值从盈利里剔除。于是「盈利资本化」与「资产重置成本」两个数不同源，取大取小都不对——**正确做法是相加**。

## 1. 取数 spike 结论（已跑通，真数据）

对 BRK FY2025 10-K 提取版 instance 解析（复用件① 建成的 XBRL 维度解析能力）：

**分部税前利润**（`IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest`，`ConsolidationItems=OperatingSegmentsMember` × `StatementBusinessSegments` 轴）：

| 分部 | FY2025 | FY2024 | FY2023 |
|---|---|---|---|
| 保险集团（含承保 9.46 + **投资 15.26**） | 24.72B | — | — |
| BNSF / BHE / 制造 / 服务零售 / McLane / Pilot | 26.99B 合计 | — | — |
| **全部经营分部合计** | **51.71B** | **53.94B** | **43.64B** |
| 其中投资分部 | 15.26B | 16.75B | 11.58B |

- **单份 10-K 带 3 个 FY**，两份覆盖 5-6 年窗口（引擎正常化需要）。
- 各分部的 `IncomeTaxExpenseBenefit`、`DepreciationDepletionAndAmortization`、`InterestExpense` 同样带维度可得。
- **分部税前利润已扣各自利息费用**（BNSF 1.10B、BHE 2.64B 等在分部内）→ 把分部税后利润资本化得到的**直接是这些业务的股权价值**，无需再单独减它们的债务。这是本设计能简洁成立的关键。
- 递延税可算：`EquitySecuritiesFvNi`(297.8B) − `EquitySecuritiesFvNiCost`(85.4B) = 未实现增值 212.4B。

**已知取数陷阱（务必写进实现）**：`DebtInstrumentFaceAmount` 出现 `2343.0` —— 那是伯克希尔的**日元债（约 2,343 亿日元）**，不是美元。任何取数不判 `unitRef` 币种就会造出万亿级假债务。本设计不取债务本金（见上一条），但解析器必须**只接受 USD 单位事实**。

## 2. 设计

### 2.1 数据层：新表 `company_segment_periods`

migration `20260810_create_company_segment_periods.sql`：

```
ticker, period_end, fiscal_period, segment_member, segment_label,
pretax_income, revenue, income_tax, d_and_a, kind, raw_facts
primary key (ticker, period_end, fiscal_period, segment_member)
```

`kind ∈ {"insurance","operating","corporate"}`，由 member/label 关键词判定（含 `Insurance` / `Underwriting` → insurance；`CorporateReconciling`/`Eliminations` → corporate；其余 operating）。**分类结果落库**，供页面展示与人工审计，不是只在内存里算完就丢。

取数走 `ingestCompany` 的窄闸：仅当该票**满足件④的 `holdco_not_assessable` 触发条件**（marks 生效 + 无 operating_income）时才拉 instance 解析分部——作用域被件④的触发集天然框住，其余票零新增取数。

### 2.2 引擎层：`holdcoSotp.ts`（新模块，单一职责）

**采用当下主流 SOTP 做法**（用户 2026-08-10 拍板；本仓库既有的 9–11% 股权成本资本化留作对照，不作主口径）：分部按可比市场倍数估值 + **三档敏感性**。

```
SOTP(档) = 投资按市值
         + 非保险经营业务税后盈利 × 倍数(档)
         + 保险承保税后利润 × 承保倍数(档)
         − 递延税
```

- **第一栏 投资按市值** = `equity_securities_fv` + AFS 债券 + 权益法投资 + `cash_and_equivalents`，**不扣浮存金**（浮存金成本为负，是免费杠杆——若扣则与承保利润重复惩罚）。
- **第二栏 非保险经营业务** = Σ(`kind==="operating"` 分部税前 − 该分部实际税)，多年正常化后 × **{12, 15, 18}**。三档而非单一倍数，是主流 SOTP 的既定纪律（见 `sotp-valuation` skill）。**采用统一混合倍数而非逐分部倍数**：分部行业无法从申报数据可靠机器判定（member 名是公司自定义的），按关键词猜行业再配倍数是无法校准的臆断；混合倍数把这份不确定性显式放进三档区间里，比假装精确诚实。
- **第三栏 保险承保** = 承保分部税前 × (1−21%) × **{8, 10, 12}**（承保结果波动远大于经营业务，故给更低倍数）。**投资分部（BRK FY2025 15.26B）必须排除**——它是第一栏那些证券产生的收益，计入即与第一栏重复。
- **减 递延税** = (`equity_securities_fv` − `equity_securities_fv_cost`) × 21%，按面值全额扣（保守；无息递延的折现优惠留作后续）。

**价值带** = [悲观档, 乐观档]，基础档作为中枢披露。

**三闸 fail-closed**（任一不过 → 退回件④的抑制，不给 SOTP）：① `kind==="operating"` 的分部至少 3 个年份可得；② 分部税前合计与合并报表口径对账偏差 ≤10%；③ 第一栏各组成部分齐备。

### 2.3 展示层

个股页把件④那句抑制说明换成**三段式拆解**：投资 $X/股 + 经营业务 $Y–Z/股 − 递延税 $W/股 = 价值带，并列出各经营分部的税后盈利。文案 en/zh 各自独立成句。

### 2.4 明确不做

逐分部行业倍数（无法从申报数据可靠判定，见 §2.2）；浮存金显性估值；递延税折现；把 SOTP 推广到未被件④抑制的票；引擎既有 9–11% 口径的对照档（留作件⑥）。

## 3. 预期结果（真数据试算，**须在验收时逐位复核**）

BRK.B（FY2025，股数 2,157M）：

| 项 | 悲观 | 基础 | 乐观 |
|---|---|---|---|
| 第一栏 投资按市值（388.2B） | $180.0 | $180.0 | $180.0 |
| 第二栏 非保险经营（税后 23.36B × 12/15/18） | $130.0 | $162.4 | $195.0 |
| 第三栏 保险承保（税后 7.47B × 8/10/12） | $27.7 | $34.6 | $41.6 |
| 减 递延税（44.6B） | −$20.7 | −$20.7 | −$20.7 |
| **每股合计** | **$317** | **$356** | **$396** |

现价 $511.54 → 仍判 `above`，**高于乐观档约 29%**（此前件④抑制前的口径是 −124%）。基础档 $356 ÷ 账面 $332.53 = **1.07 倍账面**，与伯克希尔历史 1.2–1.6 倍账面的交易区间量级相符，说明这套主流口径没有系统性失真。

**须先说清楚**：件⑤**不会**把伯克希尔翻成便宜。它把「一句抑制说明」换成一个**可拆开看的三段式真数字**，并让 BRK 带着诚实判定回到聚合面。

## 4. 验收标准

1. 纯 fixture check：三闸各自 fail-closed；保险分部被排除；日元单位事实被拒绝。
2. 真数据探针（只读）：BRK.B/BRK.A 分部解析出 ≥3 年、与合并口径对账偏差 ≤10%、SOTP 三档落在 [$300,$410] 且基础档 ∈ [$340,$375]；WTM 走三闸（分部不足则退回抑制，打印实测供裁决）；**未被件④抑制的票零漂移**（硬断言）。
3. 全部既有 `*.check.ts` + `npx tsc --noEmit` 绿（注：`ownerEarningsDcf.check.ts` 在主干即失败，与本件无关）。

## 5. 上线运维（须授权）

1. **先 apply migration**（早于合并部署——件③④的既定教训）；
2. 合并 PR；
3. `npm run sec:ingest -- BRK.A BRK.B WTM`（填分部表）；
4. `npm run valuation:ingest`；
5. 看页 `/stocks/BRK.B`（三段式拆解 + 价值带）、`/stocks/WTM`；
6. 抽查未触发票零漂移。
