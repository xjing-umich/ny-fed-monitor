# 估值改造 Phase 3.7 · 结构性 vs 顺周期盈利基数(解锁成长股正常化低估)

**日期**:2026-07-13
**状态**:设计已定,待 writing-plans。分支 `plan/valuation-structural-cyclical-basis`(worktree `.claude/worktrees/val-structural-cyclical`,off `c827865` = origin/db-foundation 含 Phase 3+3.5)。
**触及层**:EPV/owner-earnings DCF 的**盈利基数**(`conservativeNormalized`,epvFloor.ts:37)+ **可靠性闸**(`assessReliability`,deriveValuationVerdict.ts:64)。这是三轮改造里最底层、也最容易踩红线的一块。忠于 [[valuation-philosophy-constraint]]。承接已存档 [[valuation-normalized-earnings-growth-basis]](Phase 3.6)与 [[valuation-reform-expectations-roadmap]]。

---

## 1. 问题(真数据 2026-07-13,生产 Supabase)

### 1.1 盈利基数被均值系统性拖低

`conservativeNormalized(series, latest)` 本质是 `min(多年均值, 最新年)`:

```
a = avg(series);  return latest < a ? {value: latest, capped:true} : {value: a, capped:false}
```

- 下行/周期股(latest < avg)→ 取 latest(保守,防峰值均值),`capped=true`。**这条正确,不动。**
- **上行成长股(latest > avg)→ 取 avg → 当前真实盈利被历史均值系统性拖低**,`capped=false`。这是"优质成长股永远判太贵"的最底层根因。

规模(最新净利 vs 引擎正常化基数,低估倍数):

| 类别 | 票 | 最新净利 | 5yr均值(取值) | 低估倍数 |
|---|---|---|---|---|
| 成长 | NVDA | ~$120B | ~$47B | **2.53×** |
| 成长 | AMZN | ~$78B | ~$40B | 1.96× |
| 成长 | GOOGL | ~$132B | ~$88B | 1.49× |
| 成长 | META | ~$60B | ~$45B | 1.35× |
| 成长 | MSFT | ~$102B | ~$79B | 1.28× |
| 成长 | AAPL | ~$112B | ~$99B | 1.13× |

### 1.2 可靠性闸独立把 GOOGL 摁死(本轮关键发现)

`assessReliability`(deriveValuationVerdict.ts:67)**只要 `ai_capex_distortion_warning=true` 就 `return false`**——纯 capex 量级闸,与 ROIC 是否下滑无关。

Phase 2.5 只解耦了**护城河 cap**(moat `suppressedFlags` = `aiCapex && roicDeclining`),**未动这一行**。所以 GOOGL 现状:护城河已是 strong(Phase 3.5 ROIC pathB),但 `reliable` 仍 = false。而 `reliable=false` 在 **screener / 首页榜 / 投资人徽章**上整个抑制其便宜信号(个股页也不进 strike-zone)。

**结论:光改盈利基数不够——基数抬了、IV 上来了,仍会被第 67 行在下游摁死。本轮必须两件事一起做。**

## 2. 主流裁决(承接 Phase 3.6 §2,权威可查)

现状 `min(avg,latest)` 对非周期成长股是"用错工具",修正方向是把方法做对、不是放水:

| 权威 | 裁决 |
|---|---|
| **Buffett(1986 信)** | owner earnings = 当期盈利 + D&A − **average** 维护 capex;"average" 只修饰 capex,不修饰盈利。均值化盈利 = 偏离原定义。 |
| **Damodaran** | 成长股用**当期 + 增长投影**;历史均值**明确限定周期/大宗商品股**(需覆盖完整周期)。 |
| **Greenwald EPV** | 正常化专治周期/一次性失真;EPV 核心假设即"当前盈利可持续"。用它压结构性上台阶 = 误用。 |
| **Mauboussin** | 区分结构性 vs 周期高点:多年一致性 + ROIC 持续性 + **跨越下行段验证**;警告"这次不一样"峰值合理化(NVDA 是最危险样本)。 |

## 3. 范围(用户已定)

**两件事一起做**,目标解锁 GOOGL/META/MSFT 类(结构性、已验证)+ NVDA 类(顺周期、给部分权重不资本化峰值):

1. **基数放松**:判别器结构性置信分 s → 连续加权 `conservativeNormalized`,抬 IV。
2. **可靠性闸解耦**:`assessReliability` 第 67 行 `ai_capex → false` 按 s 解耦。

同一个 s **一票两用**:s 高既说明"当前盈利可作基数",也说明"这笔 AI capex 没扭曲可靠性"。

## 4. 设计 A · 判别器 s ∈ [0,1]

**加分项(决定 rawScore),两个信号:**

| 信号 | 判什么 | 数据来源 |
|---|---|---|
| **收入驱动度** | 盈利上行来自营收扩张(真需求)还是毛利率跳升(可能是周期定价峰值);把盈利增长分解成营收贡献 vs 利润率贡献 | 营收 + 营业利润率序列 |
| **ROIC 久期** | 复用 Phase 3.5 `roicLongTermStrong`(≥6yr 均值≥22% 且 CV<0.35)——持续赚超额回报=结构性护城河 | ROIC 序列(raw operating_income) |

**唯一硬顶(veto,取 min):未验证峰值顶。** 见 §5.2。

`s = min(rawScore, untestedPeakCap)`

**★ 循环依赖纪律(与 Phase 3.6 §3 同):** s 的每个信号都从**原始** revenue / operating_income / ROIC / net_income 序列直接算,**不碰**正常化盈利、不碰 moat grade、不碰 EPV(那些反过来消费正常化)。所以 s 不依赖任何"用了正常化的量",循环天然破掉。`assessReliability` 消费 s(挂在 floor 上)、s 不消费 reliable,单向、无环。

## 5. 设计 B · 连续加权基数公式

改 `conservativeNormalized`(epvFloor.ts:37),**只动上行分支,下行保护逐字不变**:

```
a = avg(series)
if (latest < a) return { value: latest, capped: true }        // 下行保护,原样不动

// 上行成长股(latest ≥ a):
target = max(a, min(latest, trendFit))    // 见 §5.1
s      = structuralConfidence(...)         // ∈[0,1],§4
value  = a + s * (target - a)              // s=0→均值(今天行为);s=1→近当期
return { value, capped: false, basisLift: s }
```

### 5.1 target 定义(修正:单调性 + 防单年尖峰)

`target = max(a, min(latest, trendFit))`,其中 `trendFit` = 对盈利序列做 log 回归后拟合的最新年点。

- `min(latest, trendFit)`:取 latest 与趋势拟合的**较保守者**——latest 高于趋势(单年尖峰)时用趋势,防单年异常被资本化。
- `max(a, ·)`:floor 在 a,保证 `target ≥ a`,故 `value ≥ a` 恒成立——**永不降低任何股票今天的估值,只在有证据(s>0)时抬**(单调、只上不下)。
- **正盈利守卫**:log 回归要求序列全正。若盈利序列含 ≤0 年 → `trendFit` 不可算 → 回退 `target = max(a, latest)`(仍带 floor,不破单调性)。

### 5.2 未验证峰值顶(untestedPeakCap)

**只在"陡跳 且 未验证"双条件下咬,避免误伤平滑复利股:**

定义:
- **下行年** = 盈利 YoY 跌 ≥ `DOWNTURN_DROP`(建议 ~20%,精确值 plan 数据验证任务标定)。
- **已验证水平** = 窗口内扛过一次下行年的最高盈利水平(= 见过周期另一面的水平)。

判定:
1. 当前拟合水平**已验证**(≤ 已验证水平 × (1+容差))→ `untestedPeakCap = 1`(不封)。**GOOGL:2022 广告衰退扛过、当前结构性高于衰退前 → 不封。**
2. 抬升幅度**温和**(`target ≤ MODEST_LIFT_RATIO × a`,建议 ~1.3)→ `untestedPeakCap = 1`。blend 对缓升股本就自限(target−a 小),无峰值风险。**AAPL/MSFT:缓升 → 不封。**
3. 仅当**陡跳(target ≫ a)且 未验证**→ `untestedPeakCap = UNTESTED_S_CAP`(建议 ~0.5)。**NVDA:当前 ~$120B 是已验证水平(~FY2022 $9.8B,FY2023 崩 55% 坐实)的 ~12×、且当前 regime 从没见下行 → 封 0.5。**

**同一把尺子**:任何"2 年跳一大截、从没见下行"的股(哪怕软件股)都同样封;**不预设行业标签**(砍掉了原设计的行业 SIC 先验)。

**顶是证据闸、会释放**:某股哪天真扛过一次下行、盈利没塌,已验证水平抬上来 → 顶自动松开,非永久惩罚。

## 6. 设计 C · 可靠性闸解耦(s 一票两用)

s 挂到 `ValuationFloor`(新字段 `structural_confidence?: number`),`assessReliability` 第 67 行改:

```
// before: if (floor?.ai_capex_distortion_warning) return false;
// after:  if (floor?.ai_capex_distortion_warning
//             && !(floor?.structural_confidence != null
//                  && floor.structural_confidence >= S_RELIABLE)) return false;
```

`S_RELIABLE` 建议 ~0.8——**只有高置信结构性盈利才能推翻 ai_capex 否决**。其余 `assessReliability` 条件(high_leverage / declined / quick_check_flag / 极端 oe_yield)**一律不动**。

**分层效果(本设计的诚实分寸):**

| | s | 基数 | 个股页 IV | reliable | screener/首页/徽章 |
|---|---|---|---|---|---|
| **GOOGL/META/MSFT** | ≈1(≥0.8) | 近当期 | 大幅抬 | true(否决被推翻) | **进便宜信号** |
| **NVDA** | ≈0.5(<0.8) | 半权重 | 抬一半 | **仍 false** | **仍被抑制** |

NVDA 的近期爆发在**个股详情页**被认真对待(IV 抬一半),但**不被推上聚合面当筛出来的便宜货**——半权重 + 不进聚合,双重不资本化峰值。GOOGL/META/MSFT 彻底放开。

## 7. 护栏与必验项

### 7.1 四道下游闸全保留(安全网)
- `isImplausibleBand` / `SANE_MARGIN_MAX`(>80% 边际 → 判坏数据 null):抬基数会抬 marginPct,若某深折价股被抬过 80% → 自动 null,**安全网正常工作**。
- `assessReliability` 其余条件:见 §6,只改第 67 行。
- `net_net`:独立信号,不动。
- `coverage`(单灯兜底):不动。

### 7.2 抬基数 × 增长率复合放大(必验,不改逻辑)
抬了基数 → 喂 OE-DCF 当起点 owner-earnings → g_used 再往上 project。**结构上非双重计数**(基数=当前水平,g=未来增长,本就该乘),且 g_used 已被 gFund 基本面上限摁死(NVDA gRaw ~69% → gFund ~14%)、顶又把 NVDA 基数只抬一半——三重保守叠加。**但必须在融合测试断言:NVDA 最终 IV 不被 80% 边际闸判坏。**

### 7.3 循环依赖
见 §4 末。madge 无环为交付门(与 Phase 3 同)。

## 8. 接口点(plan 阶段落实)
- **s 计算落点**:在 `computeValuationFloor`(epvFloor.ts,持全部年数据)算一次 s,传入基数函数 + 挂 `floor.structural_confidence`。`conservativeNormalized` 现签名只有 `(series, latest)`,需扩参或上移计算。
- **正盈利守卫**:见 §5.1。
- **capped=false 消费者审计**:改的是 up 分支返回**值**(capped 仍 false),须审计无下游代码假设"up 分支必返回 avg 原值"。
- **trendFit 复用**:Phase 1 的营收 log 回归(`growthBaseRate.ts`)是对营收;本处对**盈利**序列做同类拟合,可复用回归工具但输入不同,勿混用 base rate。

## 9. 待标定常量(plan 数据验证任务,Phase 3.5 mTask1 模式)
真数据验证后定值,写死前须过 GOOGL/META/MSFT/NVDA + 若干平滑复利股 + 若干真周期股(CVX/NUE/FCX)对照:
- `DOWNTURN_DROP`(~20%)· `MODEST_LIFT_RATIO`(~1.3)· `UNTESTED_S_CAP`(~0.5)· `S_RELIABLE`(~0.8)· 收入驱动度与 rawScore 的合成权重。

## 10. 影响面(诚实)
- **放开**:GOOGL/META/MSFT(结构性、已验证)→ 基数近当期 + reliable 恢复 → 聚合面便宜信号显现。
- **半放**:NVDA(顺周期、未验证)→ 个股页 IV 抬一半,聚合面仍抑制。
- **温和抬**:AAPL 等平滑复利股(1.1–1.3×)→ 小幅(blend 自限)。
- **不动**:真周期股(latest<avg,capped=true 下行保护)/ commodity。

## 11. 非目标
- 不动下行分支(capped=true)/ commodity 正常化(现状对它们正确)。
- 不预设行业标签当顶(已砍行业 SIC 先验)。
- 不动 reliable 闸的其余条件 / deriveValuationVerdict 判定链 / moat 判定 / 增长率封顶(前几轮已定)。
- 不用 moat grade 当 s 的输入(循环依赖)。
- 不让 NVDA 类未验证峰值进聚合面便宜信号(S_RELIABLE 挡)。
