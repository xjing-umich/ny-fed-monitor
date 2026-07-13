# 估值改造 Phase 3.6 · 正常化盈利基数:成长股例外(存档,待启动)

**日期**:2026-07-13
**状态**:**设计存档,未实施**。前置两阶段(Phase 3 含增长内在值 + Phase 3.5 moat 双向修正)先交付;本块单列,随时可启动 plan→执行。
**触及层**:EPV/owner-earnings DCF 的**盈利基数**(`conservativeNormalized`)——比前面几轮更底层的地基。忠于 [[valuation-philosophy-constraint]]。

---

## 1. 问题(真数据 2026-07-13,生产 Supabase)

`epvFloor.buildBuffettLamp` 用 `conservativeNormalized(niSeries, latest)` 算 owner-earnings 基数,其逻辑本质是 **`min(多年均值, 最新年)`**:
```
a = avg(series);  return latest < a ? {value: latest, capped:true} : {value: a, capped:false}
```
- 下行/周期股(latest < avg)→ 取 latest(保守,防峰值均值),`capped=true`。
- **上行成长股(latest > avg)→ 取 avg → 当前真实盈利被历史均值系统性拖低**,`capped=false`。

**规模(最新净利 vs 引擎正常化基数,低估倍数)**:

| 类别 | 票 | 最新净利 | 5yr均值(取值) | 低估倍数 | capped |
|---|---|---|---|---|---|
| 成长 | NVDA | $120B | $47B | **2.53×** | false |
| 成长 | AMZN | $78B | $40B | **1.96×** | false |
| 成长 | GOOGL | $132B | $88B | 1.49× | false |
| 成长 | META | $60B | $45B | 1.35× | false |
| 成长 | MSFT | $102B | $79B | 1.28× | false |
| 成长 | AAPL | $112B | $99B | 1.13× | false |
| 周期 | CVX/NUE/FCX | — | — | **1.00×** | **true** |
| 稳定 | KO/PG/JNJ | — | — | 1.07–1.22× | false |

叠加增长率封顶(g_used 被 gFund 摁,GOOGL 15%→9%、NVDA 69%→14%),导致优质成长股内在值严重偏低——这是 [[valuation-reform-expectations-roadmap]] "优质股永远判太贵"的**最底层根因**。

## 2. 主流裁决(2026-07-13,权威可查)

**总裁决:现状 `min(avg,latest)` 对非周期成长股是"用错工具",修正方向是把方法做对、不是放水。**

| 权威 | 裁决 | 来源 |
|---|---|---|
| **Buffett(1986 信)** | owner earnings = 当期报告盈利 + D&A − **average** 维护性 capex;"average" **只修饰 capex,不修饰盈利**。现状把盈利也均值化 = 偏离原始定义 | [BRK 1986 Letter](https://www.berkshirehathaway.com/letters/1986.html) |
| **Damodaran** | 成长股用**当期(TTM)+ 增长投影**;历史均值**明确限定周期/大宗商品股**(覆盖完整周期) | [Normalizing Earnings](https://pages.stern.nyu.edu/adamodar/New_Home_Page/valquestions/normearn.htm) · [Cyclical/Commodity](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/commodity.pdf) |
| **Greenwald EPV** | 正常化专治**周期/一次性失真**;EPV 核心假设即"当前盈利可持续";用它压结构性上台阶 = 误用 | [EPV tutorial](https://stablebread.com/earnings-power-value/) |
| **Mauboussin** | 区分结构性 vs 周期高点:多年一致性 + ROIC 持续性 + 行业属性;警告"这次不一样"峰值合理化 | [Measuring the Moat](https://www.morganstanley.com/im/publication/insights/articles/article_measuringthemoat.pdf) |

## 3. 设计(保守版,用户已定边界)

**边界(用户裁决)**:只放松 `reliable=true`——守诚实、不赌 AI 脉冲可持续。

**改动点**:`buildBuffettLamp` 里,满足"成长股例外"门槛 → 基数用**趋势加权/当期**(而非 `min(avg,latest)`);否则保持现状。

**★ 门槛(全部独立于 normalized earnings 本身,破循环依赖——主流第5点③)**:
- `capped=false`(当前 > 历史均值)
- `!ai_capex_distortion && !high_leverage && !declined`(≈reliable 的 floor 层成分)
- `roicLongTermStrong`(ROIC 长期高,用 operating_income,独立)
- 盈利趋势上行(`historicalGrowthBaseRate > 0`,独立)

**循环依赖为什么破得掉**:门槛信号全部从 `operating_income`/`net_income`/`capex`/杠杆直接算,**不碰派生的 moat grade / EPV**(那些反过来消费 normalized)。所以 normalized 不依赖任何"用了 normalized 的量"。这是本设计成立的关键——`deriveMoatCap` 的 strong 判定用 EPV(含 normalized),**不能**用它当门槛。

**基数取值(趋势加权优于纯 latest)**:用最近 2 年均值或 log 回归拟合的最新点,防单年异常;不是裸取 latest。

## 4. 三防线(主流第5点,防放水)

1. **多年上行要跨越过一次行业下行考验**,不是纯上行段连续几年(现 5-6 年历史可能不够——plan 需评估)。
2. **ROIC 用相对同业的超额**而非绝对走高(行业整体上行时同业普遍抬升)——**数据可能不可得**(无 sector ROIC 中位数),plan 前置验证;不可得则用绝对 `roicLongTermStrong` 兜底并记录局限。
3. **防循环依赖**:门槛不用 moat grade(见 §3),已落实。

## 5. 影响面(保守版,诚实)

保守门槛下真正受益的**只有 AAPL(1.13×)+ 少数无 ai_capex 的稳定股(KO/PG/JNJ 1.1-1.2×)**。**GOOGL/NVDA/MSFT/META 全因 ai_capex `reliable=false` 被挡在门外**——这是用户选定的"守诚实"。所以本改造:方法论对(忠于 Buffett)、零放水,但**当下影响面小、动 EPV 地基**——ROI 有限,故单列、不与前两阶段混做。

## 6. 未来扩展(Phase 3.7,更大的题)

真正解锁 GOOGL/NVDA 那 **1.5-2.5× 大头**,卡在"AI 驱动的当前盈利是**结构性新常态**还是**顺周期脉冲峰值**"这个判断上:
- **GOOGL**:盈利来自搜索广告(结构性),reliable=false 是 AI capex **口径误伤**——盈利本身非脉冲。主流建议**优先**。
- **NVDA**:盈利直接来自 AI 芯片需求(顺周期),当前 $120B 可能是脉冲峰值。主流建议**单独更严门槛**(超额 ROIC vs 同业 / 跨越行业下行段验证)。

区分"盈利结构性 vs 顺周期"需要:盈利与自身 capex 的分离度、行业属性、更长历史——是独立的一轮 brainstorm+主流对照,**不在本 spec 范围**。

## 7. 非目标

- 不动周期股(capped=true)/commodity 的正常化(现状对它们正确)。
- 不放松 ai_capex 敞口股(GOOGL/NVDA/MSFT/META)——留 Phase 3.7。
- 不动 reliable 闸 / deriveValuationVerdict 判定链 / moat 判定 / 增长率封顶(前几轮已定)。
- 不用 moat grade 当放松门槛(循环依赖)。
