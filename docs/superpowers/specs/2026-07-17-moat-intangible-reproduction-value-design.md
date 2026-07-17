# 护城河判定地基修复:重置价值纳入无形重建成本

**日期**:2026-07-17
**分支**:`plan/valuation-intangible-reproduction`(off `db-foundation` 081d2ec)
**性质**:估值引擎地基改造(reproductionValue + growthValue),动护城河判定链条

---

## 1. 问题

轻资产 / 无形密集的强 franchise 被引擎系统性判为"无护城河 + 无成长价值 + 远高于内在价值"。真数据(2026-07-17,13 票探针)证实这是**普遍**而非个例:

| 公司 | 有形净资产 | 现状 moat | 现状成长价值 | 现状判定 |
|---|---|---|---|---|
| NFLX 内容 | −6.2B | none | 归零 | 太贵 |
| V / MA 支付网络 | −9.6B / −7.4B | none | 归零 | 太贵 |
| MCO / SPGI 评级 | −4.2B / −21.6B | none | 归零 | 太贵 |
| MSCI 指数 | −6.4B | none | 归零 | 太贵 |
| ADBE 软件 | −1.7B | none | 归零 | 太贵 |
| ORLY 汽配 | −1.8B | none | 归零 | 太贵 |
| 对照 MSFT / AAPL | +201B / +60B | **strong** | — | — |

护城河判定几乎完全由"有形净资产正负"决定;而有形净资产为负恰恰是轻资产强护城河的标志。

### 1.1 三层根因(同一病根的三张脸)

病根:**用有形 / 会计口径衡量无形生意**,在三处各留一道伤。

- **层① 资产端**(`reproductionValue.ts`):重置价值 = `equity − 商誉 − 无形`,把无形**整个减光**,却不加回重建这些无形的成本。`tangible ≤ 0` 直接 `not_assessable`。→ 打击 NFLX / ADBE。
- **层② 权益端**(`reproductionValue.ts`):基数用**会计股东权益**,被巨额回购买成负(MSCI −2.7B、ORLY −0.8B),而"重建这门生意的成本"和回购了多少股无关。→ 打击 MSCI / ORLY / MCO(MCO 另因商誉 6.4B)。
- **层③ 再投资端**(`growthValue.ts`):成长再投资只认 `capex − 维持`,轻资产 franchise 的成长靠 R&D / 营销 / 内容(无形,不走 capex)→ 判"没部署成长资本" → GV `not_assessable` → 成长归零。→ 打击 MA / SPGI(即便被认成 franchise,GV=0 仍判太贵)。

### 1.2 为什么反复失败

历次估值改造(结构性盈利基数、ai_capex 闸、杠杆折现)都在护城河的**下游**调参数,默认"护城河已识别对"。但这批票在护城河这一关就 fail 成 `none`,下游改动被零乘归零。三层从未被统一审视,所以每次只修一层、换只股票复发。**这次三层一起修。**

---

## 2. 方法论依据(原文,不编)

### 2.1 Greenwald（*Value Investing: From Graham to Buffett and Beyond*；The Greenwald Method, investingbythebooks.com）

- 重置价值(reproduction value)= 竞争者重建同等生产能力的成本,**必须包含无形**:"Goodwill and other intangibles represent the largest challenge... the aim is to estimate what it would take to **rebuild the productive capacity**."
- **产品组合 = N 年 R&D**,N 按产品寿命:"how many years of R&D it would take to rebuild an equivalent product portfolio... auto companies... 6 years of R&D... aircraft 15 years... garments 6 months."
- **客户关系 / 品牌 = 达到满产能所需的若干月 SG&A(尤其 A&P 广告促销)**:"how many months of SG&A (and especially A&P) it will take before a new business is up to full sales capacity... 3 months for a clothing retailer... 4 years for a Home Depot."
- **净重置价值 = 资产重置 − 负债,÷ 股数**;明确**从资产端正推,不从会计权益倒推**。
- **口径铁律**:"EPV of equity per share... net of debt... **Don't make the mistake to compare an enterprise value to an equity value.**"
- **预警**:高杠杆 / 无形主导的资产负债表,AV 绝对精度有限,margin of safety 不确定 → 靠 EPV/AV **相对倍数**判护城河、靠 EPV 关口防误伤。

### 2.2 Damodaran（*Valuing Companies with Intangible Assets*, 2009）

- R&D 是资本支出应资本化:research asset = Σ R&D(t) × 未摊销权重,线性摊销,按 amortizable life(软件短、制药 ~10 年)。加到 book value,**不是减**。
- 品牌 = 累积广告费资本化后的未摊销余额。负账面权益 ≠ 无价值。

---

## 3. 统一设计

三层统一成**一个数学修正**。会计 `equity = 总资产账面 − 负债`,其中无形资产账面被系统性低估(费用化 R&D、未入账品牌 / 客户)。Greenwald 净重置价值:

```
净重置价值(每股) = [ equity − 账面无形(商誉+intangibles) + 无形重建成本 ] ÷ diluted shares

其中 无形重建成本 = R&D research asset(Damodaran 法,已有 capitalizedRd)
                   + 品牌/客户重建(累积销售营销费资本化,Greenwald 法,新增)
```

**当前引擎只做了 `equity − 账面无形`,漏了 `+ 无形重建成本`——减了不加,这是 bug 的数学本质。**

- **口径天然一致**:全程 equity net-of-debt per share,和 EPV 口径可比(满足 Greenwald 铁律),层②**无需改口径**,只需正确加回无形重建。
- **负权益自愈**(层②):MSCI/ORLY 权益为负,但无形重建成本足够大(指数品牌、数据、客户关系)→ 净重置转正、被识别为 franchise。
- **防误伤天然成立**:烂账 / 靠收购堆商誉的公司,R&D 与销售营销的**实际累积投入小** → 无形重建小、账面无形(商誉)大 → 净重置 = `equity − 大商誉 + 小重建` 更低 → 仍 `none / value_destruction`。叠加 EPV 关口(EPV ≤ 0 → value_destruction),双重护栏。

层③(GV):成长再投资口径与上同源——`成长再投资 = max(0, capex − 维持) + ΔNWC + 无形成长投资`,其中无形成长投资 = R&D 与销售营销中超出"维持现有无形"的增量部分。

---

## 4. 具体改动

### 4.1 `reproductionValue.ts`(层①②)

- 新增 `intangibleRebuild = capitalizedRd + brandCustomerRebuild`。
  - `capitalizedRd`:已有(5 年线性,Damodaran)。保留。
  - `brandCustomerRebuild`:新增,累积销售营销费资本化(见 §5 参数)。
- 核心口径改为 `avCore = equity − (goodwill + intangibles) + intangibleRebuild`(= 有形净资产 + 无形重建)。
- 移除 `if (tangible <= 0) return not_assessable` 早返回;改为 `if (avCore <= 0) return not_assessable`(连无形重建都救不回才放弃)。
- `per_share = avCore / shares`(franchise test 的 avCons 分母)。退役或重新诠释 `acquiredResetProxy`(0.5 折算)——由真实无形重建取代;dual-AV 的 `reproduction_per_share` 语义在实现时对齐(见 §6 开放项)。

### 4.2 `growthValue.ts`(层③)

- `growthReinvest(idx)` 追加无形成长投资项:R&D 与销售营销费中超出"维持"基线的增量。
- `cumulativeReinvest ≤ 0` 的早返回:仅当有形与无形成长投资**都**不为正时才 `not_assessable`。
- ROIIC 分子(NOPAT 增量)与分母(含无形的成长再投资)口径一致——分子若用 operating income,需与"把无形投资视作资本化"的口径匹配(实现时钉死,见 §6)。

---

## 5. 参数与依据(逐个钉死,不编)

| 参数 | 取值 | 依据 / 校准 |
|---|---|---|
| R&D 摊销年限 | 5 年(线性) | Damodaran 软件类;已在用。是否按行业分档=YAGNI,本期统一 5 年。 |
| 品牌/客户资本化:营销费口径 | `selling_marketing` 优先,缺失退 `sga` 的保守比例 | Greenwald 强调 A&P;字段可用性 plan 阶段确认(见 §6)。 |
| 品牌/客户资本化:年限/月数 | **待校准**(Greenwald 3 月–4 年,跨度大) | 保守起步 + 全市场真数据分位校准(仿杠杆常量做法:记录 provenance、落在合理分位),**不取单一拍脑袋值**。 |
| avCore≤0 阈值 | 0 | 连无形重建都为负才放弃。 |
| GV 无形成长投资纳入比例 | **待校准** | 与品牌资本化同源;保守起步。 |

**硬约束**:任何"待校准"参数,plan 阶段必须用全市场真数据定分位、记录 provenance 注释,禁止无出处常量。校准脚本只读、不写库(仿 `leverage-premium-calibrate.ts`)。

---

## 6. 开放设计项(plan 阶段钉死)

1. **字段可用性**:`selling_marketing` / `sga` / `rd_expense` 在 `ValuationFloorYear` 与 `company_fundamentals_periods` 的覆盖率;缺失时降级路径(只用 R&D research asset)。
2. **dual-AV 语义**:`av_conservative`(有形+RD)vs `av_reproduction`(+无形重建)两道 franchise gate 的关系——是否 av_conservative 也纳入无形重建,还是保留双层。默认:av_conservative = 有形+RD+无形重建(统一),av_reproduction 保留额外保守层或退役。实现时二选一并说明。
3. **ROIIC 口径一致性**:GV 分子 NOPAT 是否需相应"加回 R&D/营销、扣无形摊销"(Damodaran 调整),避免分子分母口径错配。
4. **口径回归守护**:MSFT/AAPL 等本就正资产的对照票,EPV/AV 比值不得因新增无形重建而显著漂移(否则说明对已 assessable 的票造成了副作用)。

---

## 7. 安全护栏

- **EPV 关口**(已有):EPV ≤ 0 → `value_destruction`,拿不到 franchise / 成长价值。无形重建放宽 AV 口径**不触碰**这道关。
- **无形重建自限**:烂账公司实际 R&D / 营销投入小 → 无形重建小 → 不误判(见 §3)。
- **数据缺失降级**:营销 / R&D 字段缺失 → 只用可得项(至少 R&D research asset),不因缺数据放大或归零。
- **地基锁**(参照杠杆重构 §0):悲观档 pessimistic scenario 若喂 `deriveValuationVerdict` 的 bucket,须保证对现有 assessable 票逐位不变或有意改动且验证。

---

## 8. 验收(13 票验收集 + 逐层)

真数据探针(仿 `probe-klac-split.ts` / 本次实验脚本),每层改动后跑:

- **8 标杆 franchise**(NFLX V MA MCO SPGI MSCI ADBE ORLY)→ 全部 `franchise`、成长价值计入、判定合理(NFLX/ADBE 已在层①实验验证 → franchise + within)。
- **对照**(MSFT AAPL)→ 保持 `strong`,EPV/AV 比值不漂移(§6.4)。
- **烂账反例**(W CVNA PTON)→ 仍 `value_destruction`,未被误判 franchise(层① 实验已验证 EPV 关口有效)。
- **全套 `*.check.ts` 绿 + `tsc --noEmit` 零错**(本项目测试机制,见 [[no-tests-solo-dev]])。

逐层验收:层① → 层② → 层③,每层单独确认不回退前层、不误伤反例。

---

## 9. 范围与 YAGNI

- **做**:无形重建(R&D research asset + 品牌/客户营销资本化)纳入重置价值;GV 成长再投资纳入无形投资。
- **不做**:完整 Greenwald 逐项资产重置(cash 100% / AR 85% / inventory 10-60% / PP&E 30-90% 各系数)——需大量字段、收益递减;本期用"equity 为有形净资产代理 + 无形重建增量"的简化,口径一致即可让 franchise test 正常工作。
- **不做**:R&D 按行业分摊年限(统一 5 年);品牌参数按行业分档(统一保守值 + 校准)。这些留 Phase 2。

---

## 10. 风险与回滚

- **风险**:动 reproductionValue + growthValue 两处地基,影响所有票的 moat / GV。缓解:13 票验收集 + 对照回归守护 + 逐层验证 + 全 check 绿。
- **回滚**:纯代码改动 + 常量;生产效果需跑 `valuation:ingest` 才落地。合并后若发现问题,revert PR + 重跑 ingest 即可复原(个股页实时算,revert 后即恢复)。
- **上线**:合并后授权跑 `valuation:ingest`(个股页实时生效,screener / 榜单 / 徽章需重跑)。

---

## 附:相关记忆

[[valuation-reform-expectations-roadmap]](估值改造总纲)、[[valuation-structural-cyclical-basis]]、[[valuation-leverage-cost-of-equity]](地基改造先例 + 常量校准法 + 口径纪律)、[[valuation-broad-universe-guardrails]]、[[no-tests-solo-dev]]、[[sec-valuation-ingest-ops]]。
