# 件⑤：控股集团两栏法（分部 SOTP）

日期：2026-08-10 · 分支：`plan/valuation-holdco-sotp`（off `origin/db-foundation` @5381c6a，已含件①②③④）

## 0. 目标与前情

件④让伯克希尔不再挂「价值毁灭 / 贵 124%」的假结论，但代价是**整条抑制**——BRK.A/BRK.B/WTM 现在只有一句说明加一行资产底，没有估值。件⑤给这类主体一个**真正的、可拆开看的估值**：巴菲特自己的两栏法。

**为什么合并层面的单一镜头对它们无效**（件④已论证，此处只列结论）：资产里几千亿是按市值计价的证券，其回报是价格增值而非现金收益；件③又已（正确地）把这部分增值从盈利里剔除。于是「盈利资本化」与「资产重置成本」两个数不同源，取大取小都不对——**正确做法是相加**。

## 1. 取数 spike 结论（已跑通，真数据）

数据源：BRK **FY2025 10-K**（`reportDate 2025-12-31`，filed **2026-03-02**，instance `brka-20251231_htm.xml`），复用件① 建成的 XBRL 维度解析能力。全量转储 2,837 条 USD 事实、剔除 286 条非 USD 事实。

### 1.1 第一栏：投资（时点 @2025-12-31，逐行对上 10-K「保险与其他」资产负债表列）

| 项 | tag | 维度 | 金额 |
|---|---|---|---|
| 现金及等价物 | `CashAndCashEquivalentsAtCarryingValue` | `ProductOrService=InsuranceAndOther` | 47.72B |
| **短期国债** | **`USTreasuryBills`** | `ProductOrService=InsuranceAndOther` | **321.43B** |
| 权益证券 | `EquitySecuritiesFvNi` | 无维度 | 297.78B |
| 权益法投资 | `EquityMethodInvestments` | 无维度 | 19.98B |
| 固定到期证券 | `AvailableForSaleSecuritiesDebtSecurities` | 无维度 | 17.82B |
| **合计** | | | **704.73B** |

**口径校验（两条都过）**：
- **归属正确**：合并现金 `CashCashEquivalentsRestrictedCash...` 52.57B = 保险与其他 47.72 + 铁路能源 4.16 + 受限 0.69。第一栏**只取保险与其他那一列**，铁路能源的经营现金 4.16B 属于第二栏那些业务，不重复计入。
- **总额闭合**：`Assets` 1,222.18B = 保险与其他 976.00B + 铁路能源 246.18B，两个 `ProductOrService` member 正好加总，说明没有第三个未被发现的资产池。

> ⚠️ **本设计第一版把第一栏算成 388.2B，错在漏了 `USTreasuryBills` 321.43B**——占第一栏 46%。根因：该事实带 `ProductOrService` 维度，被 companyfacts API 在接口层剥掉，且我们库里 `short_term_investments` 的 tag 清单（`ShortTermInvestments` / `AvailableForSaleSecuritiesCurrent` / `MarketableSecuritiesCurrent`）不含伯克希尔实际使用的 `USTreasuryBills` → 库里该字段为 NULL。这与件①（分股类股数）、件⑤（分部）是**同一个病根**。

### 1.2 第二、三栏：分部利润（duration，三年）

`IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest` × `ConsolidationItems=OperatingSegmentsMember`，配对同维度的 `IncomeTaxExpenseBenefit`：

| （十亿美元） | FY2023 | FY2024 | FY2025 |
|---|---|---|---|
| 全部经营分部 税前 | 43.64 | 53.94 | 51.71 |
| − 保险集团 税前 | 18.49 | 28.15 | 24.72 |
| **= 非保险经营 税前** | **25.15** | **25.79** | **26.99** |
| 非保险经营 实际税 | 3.41 | 3.41 | 3.62 |
| **= 非保险经营 税后** | **21.74** | **22.38** | **23.37** |
| 保险 **承保** 税前 | 6.91 | 11.40 | 9.46 |
| 保险 **投资** 税前（第一栏的收益，**必须排除**） | 11.58 | 16.75 | 15.26 |

- 非保险经营**三年单调上行**、有效税率稳定在 13.2–13.6%（低于 21% 是 BHE 可再生能源税收抵免所致，FY2025 该分部税额为 **−1.78B**；真实且可持续数年，但须在页面披露）。
- 承保在 6.91–11.40 之间摆动 ±30% —— 这正是承保该给更低倍数的实证依据。
- 保险集团内部自洽：FY2025 承保 9.46 + 投资 15.26 = 24.72 ✓。
- **单份 10-K 带 3 个 FY**，两份覆盖 5–6 年窗口。
- **分部税前利润已扣各自利息费用**（BNSF、BHE 的利息在分部内）→ 把分部税后利润资本化得到的**直接是这些业务的股权价值**，无需再单独减它们的债务。这是本设计能简洁成立的关键。

### 1.3 其他已核实事实

- 递延税基数：`EquitySecuritiesAccumulatedUnrealizedGainLoss` = **212.39B**（无维度直取，比 `EquitySecuritiesFvNi 297.78 − EquitySecuritiesFvNiCost 85.39` 相减更可靠，且两者一致）。
- 股数：封面 `dei:EntityCommonStockSharesOutstanding` A 类 **511,820** 股、B 类 **1,389,605,139** 股 → B 股等价 511,820×1500 + 1,389,605,139 = **2,157,335,139**（与库内 2,157.5M 一致）。
- 账面权益 `StockholdersEquity` = 717.42B → 每股账面 **$332.55**。
- 浮存金主体已找到：`LiabilityForClaimsAndClaimsAdjustmentExpense` 120.71B（+ 未到期保费、保单持有人资金约 40B）。本设计**不扣浮存金**，理由见 §2.2。

### 1.4 取数硬约束（务必写进实现，均为本次踩出来的）

1. **只接受 `unitRef` 指向 `iso4217:USD` 的事实。** 该 instance 14 个单位里**只有 1 个是 USD**，另有 JPY / EUR / GBP。`DebtInstrumentFaceAmount` 出现 `2343.0`，那是**日元债（约 2,343 亿日元）**，不判币种就会造出万亿级假债务。
2. **第一栏必须穷举投资类资产，且以「保险与其他」列为界。** 不能只取库内既有字段——库内 tag 清单对控股集团系统性漏项（§1.1 的 321B 教训）。实现须显式包含 `USTreasuryBills` 及同族短期国债 tag，并以 §1.1 的两条校验（归属正确 + 总额闭合）作为闸。
3. **companyfacts 不可作为控股集团的取数源**，一律走 filing 的提取版 instance。

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

### 2.1b 数据层：第一栏走独立表，不加列到 `company_fundamentals_periods`

**companyfacts 可得性实测**（BRK CIK 0001067983，FY2025）：

| tag | companyfacts | 结论 |
|---|---|---|
| `USTreasuryBills` 321.43B | ❌ 完全不存在 | **必须走 instance** |
| `EquitySecuritiesAccumulatedUnrealizedGainLoss` 212.39B | ❌ 完全不存在 | **必须走 instance** |
| 保险与其他现金 47.72B | tag 在，但 FY2025 无「无维度」时点值 | **必须走 instance** |
| `EquityMethodInvestments` 19.98B | ✅ | 可 companyfacts，仍统一走 instance 保持同源 |
| `AvailableForSaleSecuritiesDebtSecurities` 17.82B | ✅ | 同上 |
| `EquitySecuritiesFvNi` 297.78B / `EquitySecuritiesFvNiCost` 85.39B | ✅ | 件④已有；两者相减 = 212.39B，与上面那个 instance tag **分毫不差** → 递延税基数有两条独立来源可互证 |

> 库内 `cash_and_equivalents` 对 BRK 取到的是第二顺位 `CashCashEquivalentsRestrictedCash...` = **52.57B**（含铁路能源 4.16 + 受限 0.69），**不能**直接用作第一栏——这是第二个口径陷阱。

**因此第一栏落 `company_holdco_investments` 新表，而不是给 `company_fundamentals_periods` 加列**：

```
ticker, period_end, fiscal_period,
cash, treasuries, equity_securities, equity_method, afs_debt, total,
unrealized_gain, gate_attribution_ok, gate_closure_ok, raw_facts
primary key (ticker, period_end, fiscal_period)
```

理由：件③④两次都被「加列 → 周六 GH Actions 全量 fundamentals upsert 遇未知列整批 throw 断更」这个运维顺序问题咬过。独立表只由 §2.1 那道窄闸写入，**通用 ingest 路径完全不碰**，该风险在结构上消失，不必再依赖「migration 必须早于合并」这条人工纪律。

### 2.2 引擎层：`holdcoSotp.ts`（新模块，单一职责）

**采用当下主流 SOTP 做法**（用户 2026-08-10 拍板；本仓库既有的 9–11% 股权成本资本化留作对照，不作主口径）：分部按可比市场倍数估值 + **三档敏感性**。

```
SOTP(档) = 投资按市值
         + 非保险经营业务税后盈利 × 倍数(档)
         + 保险承保税后利润 × 承保倍数(档)
         − 递延税
```

- **第一栏 投资按市值** = 现金及等价物 + **短期国债（`USTreasuryBills` 及同族）** + 权益证券 + 权益法投资 + AFS 固定到期证券，**均只取保险与其他列**（§1.1）。**不扣浮存金**：浮存金成本为负，是免费杠杆；若扣则与第三栏的承保利润重复惩罚。这也是主流卖方对 BRK 的既定做法，须在页面显式披露此假设。
- **第二栏 非保险经营业务** = Σ(`kind==="operating"` 分部税前 − 该分部实际税)，取**三年均值**后 × **{12, 15, 18}**。三档而非单一倍数，是主流 SOTP 的既定纪律（见 `sotp-valuation` skill）。**采用统一混合倍数而非逐分部倍数**：分部行业无法从申报数据可靠机器判定（member 名是公司自定义的），按关键词猜行业再配倍数是无法校准的臆断；混合倍数把这份不确定性显式放进三档区间里，比假装精确诚实。用**实际分部税**而非 21% 统一税率——BHE 的可再生能源抵免是真实且重复发生的（§1.2），但须在页面披露该低税率的来源。
- **第三栏 保险承保** = 承保分部税前 × (1−21%) 的**三年均值** × **{8, 10, 12}**（承保结果波动 ±30%，远大于经营业务，故给更低倍数）。**投资分部（BRK FY2025 15.26B）必须排除**——它是第一栏那些证券产生的收益，计入即与第一栏重复。承保按统一 21% 而非保险集团混合实际税率（后者被投资分部的股息扣除拉低，用在承保上会低估税负）。
- **减 递延税** = `EquitySecuritiesAccumulatedUnrealizedGainLoss` × 21%，按面值全额扣（保守；无息递延的折现优惠留作后续）。

**价值带** = [悲观档, 乐观档]，基础档作为中枢披露。

**四闸 fail-closed**（任一不过 → 退回件④的抑制，不给 SOTP）：
1. `kind==="operating"` 的分部至少 **3 个年份**可得；
2. 分部税前合计与合并报表口径对账偏差 **≤10%**；
3. **第一栏归属闸**：第一栏所取的现金 + 其余分列现金 + 受限现金 ≈ 合并现金总额（容差 2%）——这条直接拦住「漏取某一列」；
4. **第一栏闭合闸**：各 `ProductOrService` 顶层 `Assets` 之和 ≈ `Assets` 合并数（容差 2%）——这条拦住「存在未被发现的第三个资产池」。

闸 3/4 是 §1.1 那个 321B 漏项的直接产物：**光靠「字段非空」判齐备是不够的，必须用会计恒等式把漏项逼出来。**

### 2.3 展示层

个股页把件④那句抑制说明换成**三段式拆解**：投资 $X/股 + 经营业务 $Y–Z/股 − 递延税 $W/股 = 价值带，并列出各经营分部的税后盈利。文案 en/zh 各自独立成句。

### 2.4 明确不做

逐分部行业倍数（无法从申报数据可靠判定，见 §2.2）；浮存金显性估值；递延税折现；把 SOTP 推广到未被件④抑制的票；引擎既有 9–11% 口径的对照档（留作件⑥）。

## 3. 预期结果（真数据试算，**须在验收时逐位复核**）

BRK.B（FY2025，B 股等价 2,157.3M 股）：

| 项 | 悲观 | 基础 | 乐观 |
|---|---|---|---|
| 第一栏 投资按市值（704.73B） | $326.7 | $326.7 | $326.7 |
| 第二栏 非保险经营（税后三年均 22.50B × 12/15/18） | $125.2 | $156.4 | $187.7 |
| 第三栏 保险承保（税后三年均 7.31B × 8/10/12） | $27.1 | $33.9 | $40.7 |
| 减 递延税（212.39B × 21% = 44.60B） | −$20.7 | −$20.7 | −$20.7 |
| **每股合计** | **$458** | **$496** | **$534** |

**现价 $511.54 落在价值带内**，位于基础档与乐观档之间（较基础档高 3.1%）→ verdict = `within`。

**四条独立的合理性交叉验证**：
1. **对账面**：基础档 $496.3 ÷ 每股账面 $332.55 = **1.49 倍账面**；市场当前 1.54 倍；伯克希尔历史交易区间 1.2–1.6 倍。三者同一量级。
2. **对市值**：基础档总值 1,085B vs 市值 1,103B，差 1.7%。
3. **对正常化选择不敏感**：若第二/三栏改用**最新 FY** 而非三年均值，带变为 $464–$543、基础 $503 —— 现价**在两种口径下都落在带内**。结论不依赖正常化方式，这是本设计最强的一条。
4. **第一栏占比**：$326.7 / $496.3 = 66%，与「伯克希尔约三分之二价值在投资组合」的市场共识一致。

**须先说清楚**：件⑤**不会**把伯克希尔判成便宜——它落在带内，就是「大致合理定价」。它把件④那「一句抑制说明」换成一个**可拆开看的三段式真数字**，并让 BRK 带着诚实判定回到聚合面。

## 4. 验收标准

1. 纯 fixture check：**四闸**各自 fail-closed；保险**投资分部**被排除；**日元/欧元/英镑单位事实被拒绝**；**第一栏缺 `USTreasuryBills` 时闸 3/4 必须拦下**（用本次的真实漏项当回归用例）。
2. 真数据探针（只读）：
   - BRK.B 第一栏 = **704.73B ± 1%**，且逐项等于 §1.1 表；
   - 分部解析出 **≥3 年**、与合并口径对账偏差 ≤10%、非保险经营税后三年为 **21.74 / 22.38 / 23.37B ± 1%**；
   - SOTP 三档 ∈ **[$450, $545]** 且基础档 ∈ **[$485, $510]**，**现价必须落在带内**；
   - BRK.A = BRK.B × 1500 自洽；
   - WTM 走四闸（分部不足则退回件④抑制，打印实测供裁决）；
   - **未被件④抑制的票零漂移**（硬断言，逐字段）。
3. 全部既有 `*.check.ts` + `npx tsc --noEmit` 绿（注：`ownerEarningsDcf.check.ts` 在主干即失败，与本件无关）。

## 5. 上线运维（须授权）

1. **先 apply migration**（早于合并部署——件③④的既定教训）；
2. 合并 PR；
3. `npm run sec:ingest -- BRK.A BRK.B WTM`（填分部表）；
4. `npm run valuation:ingest`；
5. 看页 `/stocks/BRK.B`（三段式拆解 + 价值带）、`/stocks/WTM`；
6. 抽查未触发票零漂移。
