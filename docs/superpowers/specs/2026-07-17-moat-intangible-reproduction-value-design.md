# 护城河判定地基修复:重置价值纳入无形重建成本 + ROIC 兜底 + 死角诚实标注

**日期**:2026-07-17（复核后重写)
**分支**:`plan/valuation-intangible-reproduction`(off `db-foundation` 081d2ec)
**性质**:估值引擎地基改造(reproductionValue + moatReading/moatCap + growthValue + verdict),动护城河判定链条

> **本 spec 已经过一轮真数据复核**。复核逼出了初版设计的两个实质缺陷(核心公式对收购型无形反而退步、ROIC 兜底对深度负权益失效),并用 13 票真数据界定了能干净修复的范围与无解死角。下方设计是复核后的最终版。

---

## 1. 问题

轻资产 / 无形密集的强 franchise 被引擎系统性判为"无护城河 + 无成长价值 + 远高于内在价值"。真数据(2026-07-17,13 票探针)证实这是**普遍**而非个例:护城河判定几乎完全由"有形净资产正负"决定(MSFT/AAPL 有形正 → strong;NFLX/V/MA/MCO/SPGI/MSCI/ADBE/ORLY 有形负 → none),而有形净资产为负恰是轻资产强护城河的标志。

### 1.1 三层根因(同一病根的三张脸)

病根:**用有形 / 会计口径衡量无形生意**,在三处各留一道伤。

- **层① 资产端**(`reproductionValue.ts`):重置价值 = `equity − 商誉 − 无形`,把无形减光却不加回重建成本;`tangible ≤ 0` 直接 `not_assessable`。
- **层② 权益端**(`reproductionValue.ts`):基数用会计股东权益,被巨额回购买成负。
- **层③ 再投资端**(`growthValue.ts`):成长再投资只认 `capex − 维持`,轻资产 franchise 的成长靠无形投资(R&D/营销/内容),不走 capex → GV 归零。

### 1.2 为什么反复失败

历次改造都在护城河**下游**调参数,默认"护城河已识别对"。但这批票在护城河这一关 fail 成 `none`,下游被零乘归零。三层从未统一审视,每次只修一层、换只股票复发。

---

## 2. 方法论依据(原文,不编)

### 2.1 Greenwald（*Value Investing*；The Greenwald Method, investingbythebooks.com)

- 重置价值 = 竞争者重建同等生产能力的成本,**必须含无形**:"the aim is to estimate what it would take to **rebuild the productive capacity**." 无形账面数字"may reflect an expensive acquisition but **also represent the economic value of the non-physical assets**"(→ 已收购无形应作重置代理保留,非减光)。
- 产品组合 = N 年 R&D(N 按产品寿命:汽车 6 年、飞机 15 年、服装 0.5 年);客户/品牌 = 达满产能所需若干月 SG&A / A&P。
- 净重置 = 资产重置 − 负债 ÷ 股数;**从资产端正推,不从会计权益倒推**。
- **口径铁律**:"EPV of equity per share... net of debt... Don't compare an enterprise value to an equity value."
- **护城河终极判据**(§1.1.1):"The two best clues are **sustained and high ROIC**... and **stable market shares** over time." → AV 只是 backstop;AV 因无形主导 / 负权益不可靠时,回退 ROIC 质量判 franchise 有原文依据。
- 预警:高杠杆 / 无形主导的资产负债表,AV 不可靠,"value investors shy away" → 深度负权益公司诚实标注不可评估是正当的。

### 2.2 Damodaran（*Valuing Companies with Intangible Assets*, 2009)

R&D 是资本支出应资本化:research asset = Σ R&D(t) × 未摊销权重,线性摊销,加到 book value(不是减)。已在引擎 `capitalizedRd`(5 年线性)。

---

## 3. 统一设计:双路径 + 死角诚实标注

### 3.1 核心公式(层①②主路径)——复核修正

初版写成 `equity − 账面无形 + 有机重建`,真数据证明对**收购型无形**(MA/SPGI/MCO 商誉大)反而退步(减掉大商誉、有机 R&D/营销补不回 → 净重置深负)。**修正为保留已收购无形的重置代理**(即最初实验验证有效的方案 C 口径):

```
净重置(每股) = [ 有形净资产 + 已收购无形重置代理 + R&D research asset ] ÷ diluted shares
             = [ (equity − 商誉 − 无形) + (商誉 + 无形) × 折算率 + capitalizedRd ] ÷ shares
```

- 已收购无形重置代理 = `(goodwill + intangibles) × ACQUIRED_RESET_DISCOUNT`(现有常量 0.5,捕捉重建收购来的品牌/网络/牌照的成本)。
- R&D research asset = `capitalizedRd`(有机技术无形,通常不在账面 intangibles,**不与代理重复计算**)。
- **品牌/客户 SGA 资本化**:因(a) 无 `selling_marketing_expense` 字段、只有含行政噪音的 `sga_expense`,(b) 与"已收购无形代理"存在双算风险 —— **本期不单独加**,降级 Phase 2。
- 移除 `if (tangible ≤ 0) return not_assessable`;改为 `if (avCore ≤ 0)` 才 not_assessable。

**主路径真数据覆盖**(方案 C 实验已证):NFLX、MA、SPGI、ADBE → franchise。

### 3.2 ROIC 兜底路径(层②)——救主路径救不回但回报质量过硬的

当净重置 `avCore ≤ 0`(AV 不可评估)时,若 **EPV 强(assessable 且 > 0)且 `roicLongTermStrong` = true**(近 6 个有效 FY 年 ROIC 均值 ≥ 22% 且 CV < 0.35)→ 直接判 `franchise`,不依赖 AV。现有 `roicLongTermStrong`(pathB)被"signal 必须先是 franchise"挡住,要让它在 AV 不可评估时独立成立。

**兜底真数据覆盖**:MCO(6/6 有效年,ROIC 26%,CV 0.21 → TRUE)。

### 3.3 死角诚实标注(层②)——资本结构被回购摧毁的

当 `avCore ≤ 0` **且** `roicLongTermStrong` 因**多年负权益**(investedCapitalOf 对负权益返回 undefined,有效年 < 6)也不可评估时 → **诚实标注"资本结构被回购扭曲,护城河/成长价值不可评估"**,verdict **不判 `above`/太贵**(避免假太贵信号),类似拆股护栏的抑制语义。

**死角真数据**:MSCI(0/6 有效年,6 年全负权益)、ORLY(1/6 有效年)。用非资本基数机制(毛利率稳定 + 份额 + EPV 强度)救它们 = Phase 2。

### 3.4 层③ GV 成长再投资纳入无形投资

`成长再投资 = max(0, capex − 维持) + ΔNWC + 无形成长投资`,无形成长投资 = R&D 与销售营销中超"维持现有无形"的增量;`cumulativeReinvest ≤ 0` 仅当有形与无形都不为正时才 not_assessable。ROIIC 分子分母口径一致(见 §6)。

> **验证状态**:层③ 目前仍是设计推理,**MA/SPGI 的 GV 能否真的 >0 尚未经真数据验证**(它们主路径已 franchise,但 GV=0 需层③ 修)。plan 阶段第一步必须真数据验证层③,若无形成长投资仍不足以让 GV>0,层③ 需回到设计。**不假设层③一定成立。**

---

## 4. 具体改动

| 文件 | 改动 | 服务 |
|---|---|---|
| `reproductionValue.ts` | 核心口径 = 有形净资产 + 已收购无形代理 + capitalizedRd;移除 tangible≤0 早返回,改 avCore≤0 | 层①② 主路径 |
| `epvFloor.ts`(buildMoatReading) | AV 不可评估但 EPV 强 + roicLongTermStrong → signal=franchise(兜底);AV 与 ROIC 都不可评估 → signal=not_assessable 并透出"资本结构扭曲"标记 | 层② 兜底 + 死角 |
| `deriveValuationVerdict.ts` | 死角标记 → 不判 above/太贵,返回"不可评估"(仿 splitCoverageStale 抑制) | 层② 死角 |
| 个股页 `EarningsPowerFloorCard`/verdict 展示 | 死角 → en/zh 说明"资本结构扭曲,护城河不可评估" | 层② 死角 |
| `growthValue.ts` | 成长再投资 += 无形成长投资;早返回条件放宽 | 层③ |

---

## 5. 参数与依据

| 参数 | 取值 | 依据 / 校准 |
|---|---|---|
| R&D 摊销年限 | 5 年线性 | Damodaran;已在用。 |
| `ACQUIRED_RESET_DISCOUNT` | 0.5(现有) | 已收购无形重置折算。⚠️ 无原文出处 → plan 阶段用全市场真数据校准分位(仿杠杆常量),或核实 Greenwald 依据。方案 C 实验下 0.5 已救回 NFLX/MA/SPGI/ADBE,可作起点。 |
| ROIC 兜底门槛 | 6 年 / 22% / CV<0.35(现有 `ROIC_MOAT_*`) | 已真数据校准(GOOGL/META 过,F/T 拦)。兜底复用,不新增常量。 |
| 品牌 SGA 资本化 | **本期不做** | 无 selling_marketing 字段 + 双算风险,Phase 2。 |
| GV 无形成长投资纳入比例 | **待校准** | plan 阶段真数据定分位 + provenance;若验证层③不成立则重设计。 |

**硬约束**:任何"待校准"参数,plan 阶段用全市场真数据定分位、记 provenance,禁无出处常量。校准脚本只读不写库(仿 `leverage-premium-calibrate.ts`)。

---

## 6. 开放设计项(plan 阶段钉死)

1. **死角展示口径**:verdict 抑制 + 个股页说明的具体文案与 en/zh(仿 splitCoverageStale);screener/榜单/投资人页对死角票的降级一致性。
2. **兜底路径的 grade**:AV 不可评估经 ROIC 兜底判 franchise 后,`deriveMoatCap` 的 grade(strong/moderate)如何定(现有 grade 逻辑依赖 epvAvRatio,兜底时 AV 无值)。
3. **层③ ROIIC 口径一致性**:分子 NOPAT 是否需按 Damodaran 加回 R&D/营销、扣无形摊销,避免分子分母口径错配。
4. **对照回归守护**:MSFT/AAPL 等本就 assessable 的票,EPV/AV 比值不得因新增已收购无形代理 / R&D research asset 而显著漂移。
5. **双算防护**:确认 `capitalizedRd` 与 `(商誉+无形)×折算` 不重复计入同一无形(R&D 通常不在账面 intangibles,但需 plan 核实)。

---

## 7. 安全护栏(真数据已验证防误伤)

- **EPV 关口**(已有):EPV ≤ 0 → value_destruction,拿不到 franchise / 成长价值。
- **ROIC 质量关**(兜底路径):`roicLongTermStrong` 门槛(6 年 / 22% / CV<0.35)。**真数据验证:烂账反例 W(负权益 ROIC 不算)、CVNA(CV 0.82)、PTON(ROIC −14%)全部 false**,不误伤。
- **已收购无形代理自限**:烂账靠收购堆商誉的公司,×0.5 代理救回 AV 后仍要过 EPV/AV ≥ 2× 与 EPV 关口;EPV 弱则不判 franchise。
- **死角不造假信号**:资本结构扭曲 → 诚实"不可评估",而非假"太贵"。
- **数据缺失降级**:R&D 缺失 → 只用可得项,不放大/归零。

---

## 8. 验收(13 票真数据结论 + 逐层)

真数据探针(仿 `probe-klac-split.ts`),每层改动后跑,对齐下方复核已确认的分工:

| 组 | 票 | 期望 | 复核已验证 |
|---|---|---|---|
| 主路径救 | NFLX, MA, SPGI, ADBE | franchise + 判定合理 | ✅ 方案 C 实验:NFLX/ADBE→within,MA/SPGI→franchise |
| 兜底救 | MCO | franchise(经 ROIC) | ✅ roicLongTermStrong TRUE(6/6,26%,CV0.21) |
| 死角标注 | MSCI, ORLY | "不可评估"(非太贵) | ✅ AV 负 + ROIC 有效年 0/1(多年负权益) |
| 数据问题 | V | 单独查 per_share_unavailable 根因 | 独立,不阻塞本 spec |
| 对照不漂移 | MSFT, AAPL | 保持 strong,EPV/AV 不显著漂移 | 待 plan 验证 |
| 烂账反例 | W, CVNA, PTON | value_destruction / 不误判 | ✅ ROIC 全 false + EPV 关口 |

**全套 `*.check.ts` 绿 + `tsc --noEmit` 零错**([[no-tests-solo-dev]])。逐层验收:层①→层②(主+兜底+死角)→层③,每层不回退前层、不误伤反例。

---

## 9. 范围与 YAGNI

- **做**:已收购无形重置代理 + R&D research asset 纳入重置价值(主路径);AV 不可评估时 ROIC 兜底;深度负权益死角诚实标注;GV 成长再投资纳入无形投资。
- **不做(本期)**:品牌 SGA 资本化(无字段 + 双算,Phase 2);完整逐项资产重置(cash/AR/inventory/PP&E 各系数);R&D 行业分档年限;**MSCI/ORLY 类深度负权益的非资本护城河机制**(毛利率/份额,Phase 2);V 的 per_share_unavailable(单独排查)。

---

## 10. 风险与回滚

- **风险**:动 reproductionValue + moatReading + verdict + growthValue 四处地基。缓解:13 票验收集 + 对照回归守护 + 逐层验证 + 全 check 绿。层③ 未验证 → plan 第一步验证,不成立则重设计。
- **回滚**:纯代码 + 常量;生产效果需 `valuation:ingest` 落地。合并后问题 → revert PR + 重跑 ingest 复原(个股页实时算,revert 即恢复)。
- **上线**:合并后授权跑 `valuation:ingest`。

---

## 附:相关记忆

[[valuation-reform-expectations-roadmap]]、[[valuation-structural-cyclical-basis]]、[[valuation-leverage-cost-of-equity]](地基改造先例 + 常量校准法 + 口径纪律)、[[valuation-broad-universe-guardrails]]、[[no-tests-solo-dev]]、[[sec-valuation-ingest-ops]]。
