# 估值改造 Phase 3.5 · 护城河判定双向修正:放行真护城河 + 收紧假增长

**日期**:2026-07-13
**前置**:与「含增长内在值」(Phase 3,同分支 `plan/valuation-growth-inclusive`,Task 1–5 已完成)**同步交付**。本修正改的是 moat grade 判定与 cap 分档,直接影响 Phase 3 的 g_used/IV。
**性质**:双向修正——既放行被误判的真护城河,又收紧被过度放行的假增长。**必须同步上线**(研究铁律):只放行不收紧会造成「科技股更贵、金融股更便宜」单向漂移。忠于 [[valuation-philosophy-constraint]]。

---

## 1. 问题(真数据 2026-07-13,生产 Supabase)

护城河 grade 用「EPV/资产重置价值比 ≥ 2」作为 strong 门槛;资产重置价值 = 有形净资产(股东权益 − 商誉 − 无形 + 资本化研发),**含现金/有价证券/PP&E**。grade 决定增长封顶:strong=20%、非strong=7%。全市场 sweep(1097 只出判定)暴露**双向失准**:

**偏紧(真护城河被低估)**:
| 票 | EPV/AV | 双测试 | ROIC稳定 | grade | 现实 |
|---|---|---|---|---|---|
| GOOGL | **1.42** | ✅ | ✅ | moderate | 搜索垄断,顶级护城河 |
| META | **1.79** | ✅ | ✅ | moderate | 社交网络效应,顶级护城河 |
| AAPL | 6.78 | ✅ | ✅ | strong | — |
| MSFT | 3.52 | ✅ | ✅ | strong | — |

GOOGL/META 卡在 `EPV/AV<2`——账上数千亿现金+自建数据中心撑大分母(GOOGL asset/sh $43 vs AAPL $10),压低比值。AAPL 巨额回购权益小、比值虚高。**epvAvRatio 被资本结构(囤现金 vs 回购)严重扭曲,不纯是护城河强度。**

**偏松(假增长被放行)**:全市场 101 只迁入更便宜档,仅 7 只优质成长,**81 只需警惕**——大量 moat=none/moderate 的**区域银行/保险/周期股**(ASB/FIBK/FNB/EWBC/ACGL/ALL/CB/AXS/CNA...),`capBound=true`(历史增长>7% 被压到 7%)、reliable=true,被 7% cap 抬高 IV 迁便宜。**7% 对无护城河金融/周期股偏高。**

## 2. 主流复核裁决(2026-07-13,权威可查)

| 修正 | 主流依据 | 裁决 |
|---|---|---|
| 剔除超额现金 | **Greenwald EPV 框架已有**:超额现金应加回不留分母稀释;Damodaran:经营现金≈营收 2%(成熟)/5%(高增长),超出单独处理 | 现在全额计入分母 = **漏了主流修正项**,不是保守是错 |
| ROIC 替代路径 | **Morningstar 官方定义护城河=ROIC 持续>WACC**(宽=≥20年);Mauboussin CAP 同,资产比非决定因素 | 把 EPV/AV 当唯一门槛是**方法论缺口** |
| 无护城河 7%→5% | **Damodaran 硬规则:稳态增长≤名义GDP/无风险利率**(~4–5%) | **7% 本身偏高**,收紧是纠错 |
| 金融股 SGR | 银行核心资产=存款特许权(表外,EPV 测不出,NY Fed);增长用 **SGR=ROE×留存率**(常<7%,CFA) | 一刀切 7%+同套 EPV/AV = 双重放水,**最危险最该优先** |

**来源**:[Greenwald EPV(超额现金加回)](https://stablebread.com/earnings-power-value/) · [Damodaran — Valuing Cash & Non-Operating Assets](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/cashvaluation.pdf) · [Morningstar Equity Research Methodology(护城河=ROIC>WACC 久期)](https://www.morningstar.com/content/dam/marketing/shared/research/methodology/705988Morningstar_Equity_Research_Methodology.pdf) · [Mauboussin — Measuring the Moat](https://www.morganstanley.com/im/publication/insights/articles/article_measuringthemoat.pdf) · [Damodaran — The Stable Growth Rate(≤无风险利率)](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/stablegrowthrate.htm) · [CFA/WSP — Sustainable Growth Rate=ROE×留存](https://www.wallstreetprep.com/knowledge/sustainable-growth-rate/) · [NY Fed — Franchise Value of Banks](https://www.newyorkfed.org/medialibrary/media/research/epr/96v02n2/9610dems.pdf)

**总裁决**:双向修正在方向上是「按主流把方法做对」,两条分别对应 Greenwald/Damodaran 的既有调整项(超额现金)和 Morningstar/Mauboussin 的既有主判据(ROIC 替代),不是自创宽松规则。**①②必须同步,否则单向漂移。**

## 3. 设计决策(brainstorm 已定,用户认可)

- **① 放行:双路径取优**(用户选「ROIC 路径 + 经营资产 EPV/AV 双管」)。
- **② 收紧:base cap 分档**。金融股用户选「只做 SGR 增长封顶」,护城河深度特殊化(存款特许权判据)留后续 spec。
- **③ 数据前置 + 同步上线**。

## 4. 核心逻辑改动

### 4.1 ① 放行真护城河(`moatCap.ts` `deriveMoatCap` 双路径)

现状(`moatCap.ts:21-22`):
```
strongRatio = epvAvRatio >= MOAT_STRONG_RATIO && dual_test_passed
durablePassed = strongRatio && !declined && !suppressedFlags && roicStable === true
```
改为**共同前提 + 两条路径任一**:
```
franchiseCore = moat.signal==="franchise" && !declined && !suppressedFlags && roicStable===true
pathA = epvAvRatioOperating >= MOAT_STRONG_RATIO && dual_test_passed   // 经营资产 EPV/AV(剔超额现金)
pathB = roicLongTermStrong                                            // ROIC 长期极高且稳
durablePassed = franchiseCore && (pathA || pathB)
```
- **路径 A · 经营资产 EPV/AV**:`epvAvRatioOperating = epvMid / (assetPerShare − excessCashPerShare)`。`excessCash = max(0, cash − OPERATING_CASH_PCT × revenue)`(`OPERATING_CASH_PCT=0.02`,Damodaran)。**只用于 moat 判定,不改 asset_floor 展示**(资产底含现金保守合理)。剔现金后 GOOGL/META 分母缩、比值升过 2。
- **路径 B · ROIC 长期路径**:新函数 `roicLongTermStrong`(§5)。近 `ROIC_MOAT_MIN_YEARS`(8) FY 年 ROIC 均值 ≥ `ROIC_MOAT_STRONG`(绝对门槛,拟 0.22,plan 校准)且波动小(变异系数 < `ROIC_MOAT_CV`,拟 0.35)。用绝对门槛而非 WACC,使护城河判定不随利率波动(结构性读数,更稳)。

### 4.2 ② 收紧假增长(`ownerEarningsDcf.ts` g_used 的 cap 分档)

现状(Phase 3 Task 2):`cap = floor.moat_cap?.grade === "strong" ? GROWTH_CAP_FRANCHISE : GROWTH_CAP_BASE(0.07)`。
改为分档:
```
cap = grade==="strong"   ? GROWTH_CAP_FRANCHISE(0.20)
    : isFinancial        ? sgrCap                       // 金融股 SGR
    : grade==="moderate" ? GROWTH_CAP_MODERATE(0.07)    // 保留 7%(有 franchise,上限非给足)
    :                      GROWTH_CAP_NONE(0.05)         // 无护城河非金融 → 5%(锚 GDP)
```
- `GROWTH_CAP_BASE(0.07)` 拆成 `GROWTH_CAP_MODERATE(0.07)` + `GROWTH_CAP_NONE(0.05)`。
- **金融股 cap = SGR = ROE × 留存率**(`floor.sustainable_growth` 对金融不适用——银行无 capex 口径;SGR 用 ROE×留存,§5)。SGR 与既有 g_used 的 `min(gRaw, gFund, ...)` 再取 min。

### 4.3 ③ 数据可得性前置(plan 第一步验证)

- **金融股识别 `isFinancial`**:需 sector/SIC。验证 `securities` 表或 `getSecCompanyData` 有无 sector/SIC code。**识别不了 → 金融股退回 `GROWTH_CAP_NONE(0.05)`**(仍比 7% 好,银行 5% 接近合理)。
- **SGR 留存率**:`ValuationFloorYear` 无 `dividends` 字段。验证能否算 payout(如从 `share_repurchases` + 留存权益变动近似,或 SEC 有 dividends_paid)。**不能 → 金融股用 `GROWTH_CAP_NONE(0.05)` 保守封顶**(不硬造 SGR)。
- **ROIC 长期数据**:`roicStability` 已逐年算 ROIC,`roicLongTermStrong` 复用同口径(nopatOf/investedCapitalOf)。

## 5. 新函数(`moatCap.ts`)

```ts
export const ROIC_MOAT_MIN_YEARS = 8;
export const ROIC_MOAT_STRONG = 0.22;   // 绝对门槛,plan 用真数据校准(保 GOOGL/META 过、垃圾股不过)
export const ROIC_MOAT_CV = 0.35;       // 变异系数上限(波动小),plan 校准
/** ROIC 长期极高且稳 → 独立 strong 路径(Morningstar/Mauboussin 主判据)。 */
export function roicLongTermStrong(input: {
  fyYears: ValuationFloorYear[];
  nopatOf: (y) => number | undefined;
  investedCapitalOf: (y) => number | undefined;
}): boolean;   // 近 ROIC_MOAT_MIN_YEARS 有效年 ROIC 均值 ≥ ROIC_MOAT_STRONG 且 CV < ROIC_MOAT_CV

export const SGR_MAX_YEARS = 5;
/** 金融股可持续增长 SGR = ROE × 留存率(CFA 标准)。留存率不可得 → undefined(调用方退回 5%)。 */
export function sustainableGrowthRateFinancial(input: {
  fyYears: ValuationFloorYear[];
  // ROE = net_income / shareholders_equity;留存率 = 1 − payout(payout 数据前置验证)
}): number | undefined;
```
- 复用 `ROIC_SANITY` / 有效性过滤 / FY 行硬门。
- 超额现金剔除逻辑放 `epvFloor.buildMoatReading` 附近(那里有 cash/revenue/reproduction),算 `epvAvRatioOperating` 传入 `deriveMoatCap`(或 deriveMoatCap 新增 `epvAvRatioOperating` 入参,与现有 `epvAvRatio` 并存供对照/披露)。

## 6. 常量

| 常量 | 拟值 | 依据 |
|---|---|---|
| `OPERATING_CASH_PCT` | 0.02 | Damodaran 成熟企业经营现金≈营收 2% |
| `ROIC_MOAT_MIN_YEARS` | 8 | 长期 ROIC 窗口 |
| `ROIC_MOAT_STRONG` | 0.22 | ROIC 绝对门槛(plan 校准) |
| `ROIC_MOAT_CV` | 0.35 | 变异系数上限(plan 校准) |
| `GROWTH_CAP_MODERATE` | 0.07 | 原 BASE,moderate 保留 |
| `GROWTH_CAP_NONE` | 0.05 | 无护城河,锚名义 GDP/无风险利率 |

## 7. 地基护栏(禁破)

- `assessReliability` 及输入、`isImplausibleBand`、`netNet`、`coverage`、零增长 `F`、Phase 3 的判定改锚(deriveValuationVerdict)/浮动 MOS——**全不动**。
- `asset_floor` 展示不变(超额现金剔除**只用于 moat 判定的 epvAvRatioOperating**,不改资产底展示)。
- Phase 3 Task 1–5 的 sustainableGrowth/g_used min 结构/IV 锚——不动,只**改 cap 分档的取值**与**加 strong 第二路径**。
- CAGR 硬门 / FY 行 / 有效性过滤延续。

## 8. QA / 验证

### ★ 数据可得性(plan 第一步,需 env 只读)
1. **金融股 sector 来源**:securities/SEC 能否识别银行/保险。
2. **SGR 留存率**:能否算 payout;不能则金融股走 5%。
3. **ROIC 长期门槛校准**:用真数据确认 `ROIC_MOAT_STRONG`(0.22) 让 GOOGL/META 过、垃圾/周期股不过。

### ★ 真数据前后对比(同步验证铁律)
用真引擎对**放行侧**(GOOGL/META/其它现金牛)+**收紧侧**(区域银行 FIBK/FNB/EWBC/保险 ACGL/ALL/CB/炼油 PSX/PARR)跑改造前后:
- 放行:GOOGL/META 是否升 strong(经营资产 EPV/AV 或 ROIC 路径,记录哪条触发)、IV/cap 是否合理抬升;
- 收紧:银行/保险/周期股 g_used 是否从 7% 降到 5%/SGR、是否退出「便宜」误档;
- 全市场重跑 sweep:迁档「需警惕」数应显著下降,「正当」占比上升;有无新的误判。
- 数据来源标 SEC/生产 Supabase + 日期。**探针验后删**。

### 验证门
- `npx tsc --noEmit` 零错 + 全套 `.check.ts` PASS(含 Phase 3 地基逐位不变断言)。
- **禁 `next build`**([[local-build-google-fonts-blocked]])。

### 部署
合并后跑 `valuation:ingest`(授权)重刷快照面。

## 9. 非目标(YAGNI)

- **金融股护城河深度判据**(存款特许权/承保纪律)留后续 spec;本次金融股只做**增长封顶**(SGR/5%),护城河仍走通用判定(大多数银行本就 none/moderate,增长收紧已解决「被抬便宜」)。
- 不引 WACC 进 moat 层(ROIC 路径用绝对门槛,更稳)。
- 不改 asset_floor/EPV 展示口径(超额现金剔除只服务 moat 判定)。
- 不动 Phase 3 判定改锚/浮动 MOS/四闸。
