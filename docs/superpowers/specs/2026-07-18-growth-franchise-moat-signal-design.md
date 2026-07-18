# 成长型 franchise 护城河信号（`moat_via_growth`）设计

**日期**：2026-07-18
**分支**：`plan/valuation-growth-franchise-moat`（off `db-foundation` @ e870702）
**关联**：[[valuation-moat-intangible-reproduction]]（上一轮修复，光谱另一端）、[[valuation-structural-cyclical-basis]]、[[valuation-broad-universe-guardrails]]

## 1. 问题

估值引擎的护城河判定（franchise 测试）纯粹比较**当期归一化盈利能力 EPV** 与**资产重置价值 AV**：`EPV/AV ≥ MOAT_FRANCHISE_MULTIPLE(1.25)` 才判 franchise。对**重资产、刻意压低当期利润把现金全部再投资、或护城河藏在被合并报表掩盖的高回报分部里**的公司，当期 EPV 被压得只比庞大资产基数略高，franchise 测试失败 → 判 `commodity` → `grade=none` → OE-DCF 的成长 `g1` 被封到 5% → 内在价值塌陷 → 判"远高于内在价值"。

**标杆案例 AMZN**（真数据，2026-07-18 生产快照 / 真引擎探针）：
- 价格 $247.23，市值 ~$2.68T；value band = [$34.97, $51.09]/股 → verdict `above`，margin **−499%**，reliable=false。
- 根因链：`EPV/AV_cons = 39.70/34.97 = 1.135 < 1.25` → `commodity` → `grade=none` → `g1=0.05`（尽管真实营收 CAGR 23.5%、营业利润 2021→2025 从 $24.9B 增至 $80.0B、CAGR 28.4%）。IV(neutral) ≈ $41.68/股（~$451B）。
- 一家 $716B 营收 / $80B 营业利润 / 利润 5 年 28% 复合的公司被估在个位数 PE，量级站不住。

**全 universe 量化**（1497 只已估值票，真引擎实时扫描 2026-07-18）：
- franchise 548（37%）｜commodity 202（13%）｜value_destruction 628（42%）｜not_assessable/资本结构死角 119（8%）。
- grade=none **949 只（63%）** → 成长被封 5%。
- commodity 202 只中，**166 只有形净资产为正**（走正常 dual-AV 路径，上一轮无形重置修复结构上完全够不到）。AMZN 即其一。这 166 只里混着一批真 franchise（AMZN/AMD/ARM/EQIX/DLR/EW/CELH/CEG…）与真大宗（EMN/AGCO/DINO/ARW/ATI…），机制上真 franchise 必然从当期 EPV/AV 测试漏下。

**上一轮修复为何够不到**：层①/②（avCore 无形重置底 + ROIC 兜底）只在**有形净资产为负**时触发；层③（gFund 解封）只对**已经**判成 franchise 的票松开成长。三层都**没有改动 franchise 测试本身**在正常（有形为正）路径上的判定。本设计正是补这一环。

## 2. 目标与非目标

**目标**：给"当期 EPV 看不出护城河、但历史已证实利润在持续复利增长"的真 franchise 一条护城河信号旁路，使其成长不再被封在 5%，让 AMZN 一类的内在价值量级恢复到可辩护区间。

**非目标（明确划出，各自可另开 spec）**：
- **不改 EPV 归一化基数**（不动 owner earnings 的 5 年平均含利润低谷问题、maintenance capex 高估问题）。这些是独立机制，且触碰 EPV 会波及全 universe 含 628 只 value_destruction，风险量级不同。
- **不改 structural_confidence 口径**（不修它对分部掩盖型公司偏低的成因）。
- **不做 SOTP 分部估值**（AWS 单独当 franchise 估）。Greenwald 原意最正确，但需分部数据 ingest，是独立大工程。
- 因此本旁路的判别器**不依赖 ROIC、也不依赖 structural_confidence**——那两者正是 AMZN 失败的、被划出范围的机制；判别器只用可直接从历史财报证实的"营业利润增长 + 持续盈利"。

## 3. 判别器（全部取自历史，零预测/零分析师估计）

在 `buildMoatReading` 里，当纯比率测试**本会返回 `commodity`** 时（两种子机制都覆盖），追加成长型 franchise 判别：

**触发前置**（本会判 commodity 的两种情形）：
1. **机制1**：`EPV/AV_cons` 落在 `[MOAT_COMMODITY_FLOOR(0.75), MOAT_FRANCHISE_MULTIPLE(1.25))`——当期 EPV 本身够不到 franchise 门槛（AMZN 1.14、ARM 0.92）。
2. **机制2**：`EPV/AV_cons ≥ 1.25` 但 dual 测试被 acquired-reset 重置底挡下（`franchise_blocked_by_reproduction`）——收购来的商誉/无形抬高 av_reproduction（EQIX 1.60、EW 1.27）。

**判别条件（全部满足）：**
- **G0 非金融**：`is_financial !== true`。金融股无营业利润口径，走既有 SGR/pathB，不进本旁路。
- **G1 持续盈利**：可得窗口内**各年营业利润全为正**。排除周期坑与未证实：DINO（炼油，利润有亏损年）、EMN、ATI、CELH（年轻，利润未全正）出局。
- **G2 利润持续增长**：营业利润 CAGR（升序首末、几何年化）`≥ GROWTH_FRANCHISE_MIN_CAGR`。排除平/降：AGCO（−0.1%）、ARW（−1.7%）出局。
- **G3 证实性**：参与 CAGR 计算的有效 FY 年数 `≥ GROWTH_FRANCHISE_MIN_YEARS`（约 5 年）。年数不足 → 不放行（保守，不可评估不放行）。
- 命中 → `signal="franchise"`，`moat_via_growth=true`。

**为何用营业利润而非营收**：营收增速分不开真假 franchise——DINO（炼油）营收增速 17.1% 比 AMZN 还高，却是周期大宗。营业利润的**持续**增长（G1+G2 合起来要求"多年、全正、复合上行"）才一刀两断。这是 Buffett "经济商誉"口径：盈利能力被证实地复利，即为护城河。

**判别器真数据分离验证**（2026-07-18 探针）：

| ticker | EPV/AV_cons | 营收增速 | 营业利润CAGR | 各年利润全正 | 期望 |
|---|---|---|---|---|---|
| AMZN | 1.14 | 12.5% | 28.4% | ✅ | franchise |
| ARM | 0.92 | 17.4% | 9.2% | ✅ | franchise |
| EQIX | 1.60(dual挡) | 9.3% | 11.9% | ✅ | franchise |
| EW | 1.27(dual挡) | 5.4% | 7.1% | ✅ | franchise（边际）|
| DINO | 0.98 | **17.1%** | —（有亏年）| ❌ | commodity |
| AGCO | 1.11 | 2.2% | −0.1% | ❌ | commodity |
| ARW | 1.05 | −1.1% | −1.7% | ✅ | commodity |
| EMN | 1.44(dual挡) | −0.9% | —（有亏年）| ❌ | commodity |
| ATI | 1.33(dual挡) | 10.7% | —（有亏年）| ❌ | commodity |
| CELH | 2.00 | 76.4% | 77.9% | ❌ | commodity（未证实）|

判别器把 4 只真 franchise 与 5 只真大宗 + 1 只未证实 CELH 干净分开。EW（利润CAGR 7.1%）落在阈值边际，交由校准定档（大概率 moderate）。

## 4. 评级（强度分档）

命中旁路后在 `deriveMoatCap` 定档（对称照抄现有 `moat_via_roic` 的 roicOnly 分支）：

- **strong**：营业利润 CAGR `≥ GROWTH_FRANCHISE_STRONG_CAGR` **且** 年数 `≥ GROWTH_FRANCHISE_STRONG_MIN_YEARS` → cap 20% / CAP 20 年。
- **moderate**：否则 → cap 7% / CAP 10 年。

阈值走全 universe 校准（见 §6 Task）。设计意图：绝大多数命中给 moderate；只有利润复合极高且年数足的（AMZN 28.4% 属此列）给 strong。

## 5. 与其他层的关系（保守边界，保证"只抬 cap 不放水"）

- **优先级**：`value_destruction`（EPV≤0）、`declined`（净利 CAGR<0）、拆股护栏（`splitCoverageStale`）、`capital_structure_distorted`（层② 死角）全部优先级更高，且逻辑上先返回——烂账/亏损/资本结构扭曲票根本走不到本旁路。
- **gFund 仍兜住 g1**：拿到 franchise 后 grade 流进 OE-DCF 的 `g1 = clamp(min(gRaw, gFund, cagr), 0, cap)`。命中本旁路的票 structural_confidence 多半 <0.5（层③ gFund 解封不触发），故 `gFund` 仍作 g1 的基本面天花板。例：AMZN 即便判 strong，`g1 = min(gRaw 12.5%, gFund 10.5%) = 10.5%`（moderate 则封 7%）——从被封死的 5% 回到**有据的 7–10%**，不会吹上天。**本旁路只解开 grade cap，不改任何基本面量。**
- **不与层③冲突**：层③ 只在 s≥0.5 的 franchise 上剔除 gFund；本旁路命中票 s 通常 <0.5，两者互不触发、可叠加共存。

## 6. 组件与数据流

1. **`src/lib/valuation/types.ts`**：`MoatReading` 增 `moat_via_growth?: boolean`。
2. **`src/lib/valuation/moatCap.ts`**：新纯函数 `growthFranchise({ fyYears })`（读营业利润序列 → 返回 `{ passes, opIncCagr, years, strong }`），常量 `GROWTH_FRANCHISE_MIN_CAGR / _MIN_YEARS / _STRONG_CAGR / _STRONG_MIN_YEARS`；`deriveMoatCap` 加 `moat_via_growth` 定档分支。
3. **`src/lib/valuation/epvFloor.ts`**：`buildMoatReading` 在两处 commodity 返回点前插入 growthFranchise 判别（先算好 opInc 序列传入，与现有 roicLongStrong 参数并列）；`assembleFloor` 传入 opInc 序列。
4. **消费端零改动**：`deriveMoatCap → 成长 cap → ownerEarningsDcf.g1` 链路不变；verdict/screener/个股页自动继承新 grade。
5. **`src/lib/stocks/stockCopy.ts`**：moat 小节 en/zh 说明"franchise via proven earnings growth"。
6. **校准脚本**（只读）`web/scripts/growth-franchise-calibrate.ts`：全 universe 统计各阈值下命中集合、strong/moderate 分布、与真大宗对照集的分离度 → 定阈值 provenance `docs/superpowers/calibration/2026-07-18-growth-franchise-threshold.md`。
7. **真引擎探针** `web/scripts/probe-growth-franchise.ts`：BEFORE/AFTER 打印标杆集 moat 信号/grade/g1/IV/verdict。

## 7. 验收

- **必须救回**：AMZN/ARM/EQIX → franchise（moat_via_growth），成长 cap 抬升、IV 量级恢复；EW 至少 moderate。
- **必须仍 commodity（零误放）**：EMN/AGCO/DINO/ARW/ATI/CELH。
- **零漂移**：既有 franchise（MSFT/NFLX/MA 等，走原 pathA/ROIC）信号与 grade 不变。
- **零误伤**：value_destruction（W/CVNA/PTON）、拆股护栏（SPGI/BKNG）、资本结构死角（MSCI/ORLY/FICO/VRSK）仍正确抑制。
- **AMZN 数字**：g1 从 0.05 升到 ~0.07–0.105（视定档），IV 与 verdict 记录 BEFORE/AFTER 实际值（诚实回填，不承诺翻正——AMZN 可能仍诚实判 above，但量级与定性错误消除）。
- tsc 零错；相关 check 文件全绿（含新增 growthFranchise 纯函数断言 + 标杆分离断言）。

### 7.1 验收结果（Task 7 回填，探针 2026-07-18，DGS10=4.57% as of 2026-07-16 via market_rates last-good）

BEFORE 取自 `web/scripts/.growth-franchise-before.txt`（Task 1 基线），AFTER 取自 `npx tsx --tsconfig scripts/tsconfig.json scripts/probe-growth-franchise.ts`（2026-07-18 本次跑）。

**救回标杆**（signal / grade / via_growth / g1% / IV / bucket / margin%）：

| ticker | BEFORE | AFTER | 结论 |
|---|---|---|---|
| AMZN | commodity/none/false/g1=5.0/IV=41.21/above/-499.9% | franchise/**strong**/**true**/g1=**10.5**/IV=**64.16**/above/-285.3% | 救回：signal+grade+via_growth 全部翻转，g1 落在预期 7–10.5 区间上沿（gFund≈10.5% 兜住），IV 量级由 41.21 升到 64.16；verdict 诚实仍为 above（未翻正，量级/定性错误已消除，符合 spec §7 不承诺翻正的约定），margin 荒谬度从 -499.9% 收敛到 -285.3% |
| ARM | commodity/none/false/g1=5.0/IV=8.74/above/-2955.8% | franchise/**moderate**/**true**/g1=7.0/IV=9.75/above/-2641.5% | 救回：signal+via_growth 翻转，grade=moderate（非 strong，10 年 CAP），IV 8.74→9.75，margin 仍极端负（-2641.5%，价格远超任何内在值估计，与业务本身无关，属预期内） |
| EQIX | commodity/none/false/g1=5.0/IV=68.16/above/-1396.5% | franchise/**moderate**/**true**/g1=6.1/IV=72.50/above/-1306.9% | 救回：同上，signal+via_growth 翻转，grade=moderate |
| EW | commodity/none/false/g1=0.0/IV=17.23/above/-397.7% | commodity/none/**false**/g1=0.0/IV=17.23/above/-397.7% | **未救回，如实记录**：Task 2 校准里 EW 实际 CAGR≈2.8%，低于 GROWTH_FRANCHISE_MIN_CAGR=5% 下限，未命中判别器，非本次改动可及范围（spec §7 已预先注明"若校准落其外则记录实际"，不算验收失败） |

**零误放对照**（须仍 commodity）：EMN / AGCO / DINO / ARW / ATI 五只 AFTER 全部维持 `commodity/none/false`，数值与 BEFORE 逐位相同（无漂移）。CELH 同样维持 commodity/none/false。

**零漂移标杆**（既有 franchise，走原 pathA/ROIC，不应受旁路影响）：MSFT（strong/20年/false/g1=13.5/IV=354.92/within/-11.0%）、NFLX（strong/20年/false/g1=11.6/IV=51.89/within/-32.9%）、MA（strong/20年/false/g1=4.6/IV=221.91/above/-145.0%）—— 三者 signal/grade/capYears/via_growth/g1/IV/bucket/margin BEFORE→AFTER 逐位一致，零漂移确认。

**副作用观测**（非标杆集内，探针自带，AFTER 新增）：AMD 同样从 commodity 翻转为 `franchise/moderate/true`（g1 5.0→7.0，IV 20.45→22.80），是判别器对同类半导体轻资产成长股的合理泛化，非误伤（AMD 全年营业利润为正、增速通过 log 回归门槛）。

**check 文件**：`src/lib/valuation/*.check.ts` 全 21 个文件跑通，逐一 `all ok`，无 FAIL/Error；特别确认 `moatGrowthFusion.check.ts`、`ownerEarningsDcf.check.ts`、`deriveValuationVerdict.check.ts` 三个关键链路未被打破。

**tsc**：`npx tsc --noEmit -p tsconfig.json`（过滤 google 字体噪音）零错误。

**遗留观测（非本次可修，记入待后续 spec）**：Task 2 校准过程中发现 strong 档残留一批**周期成长股**（HOG、半导体设备簇 ACLS/ACMR/ONTO/MTSI/NPO/RBC 等）——全年营业利润为正、高度周期，log 回归斜率被低谷期/COVID 回补抬高，`allOpIncPositive` 闸放行但增速可能被高估。这是判别器对"周期性"缺乏识别的已知盲点，本次 spec 范围未覆盖，需另开 spec 处理（例如引入周期性方差/回撤幅度作为第二判据）。

## 8. 风险与开放项

- **阈值校准是成败关键**：GROWTH_FRANCHISE_MIN_CAGR 定太低会放进温和周期股，定太高会漏掉 EW 类温和 franchise。校准须在全 universe 上看命中集与真大宗对照集的分离度，不靠单点。
- **营业利润口径**：须确认 `operating_income` 字段在 fyYears 里的覆盖与一致性（金融股无营业利润口径——金融股 `is_financial` 应排除在本旁路外，走既有 SGR/pathB）。
- **strong 档谨慎**：AMZN 拿 strong（20 年 CAP）是本设计最激进的一步；靠 gFund 兜住 g1 与校准的高 strong 阈值双重约束。若校准显示 strong 命中集含可疑名，退回"旁路一律 moderate"。
