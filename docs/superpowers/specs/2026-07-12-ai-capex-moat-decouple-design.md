# Phase 2.5 · ai_capex 闸解耦:护城河 CAP 改用回报型判据

**日期**:2026-07-12
**分支**:`plan/valuation-aicapex-moat-decouple`(off db-foundation,含 Phase 1+2)
**前置**:估值改造 Phase 1(反向 DCF 预期层)、Phase 2(护城河→CAP)均已合并 + 已 ingest 落生产。

---

## 1. 问题

Phase 2 上线后真数据实测(2026-07-12,thecompounder.fyi 实时页,DGS10 4.54%):改造想解锁的「13F×估值融合」靶心=超投重仓的大型科技,但 Phase 2 红利**几乎只有 AAPL 吃到**。

| 票 | 现价 | 护城河/CAP | 预期层 | bucket |
|---|---|---|---|---|
| AAPL | $315 | wide / ≈20 年(strong) | DEMANDING 显示 | ABOVE ($61–$115) |
| MSFT | $385 | narrow / ≈10 年 | 抑制 | ABOVE ($87–$228) |
| GOOGL | $357 | narrow / ≈10 年 | 抑制 | ABOVE ($43–$112) |
| META | $669 | narrow / ≈10 年 | 抑制 | ABOVE ($137–$359) |

MSFT/GOOGL/META **全部**触发同一个 `ai_capex_distortion_warning`(资本开支两年翻倍,AI 数据中心军备)→ 被摁成 narrow moat / 10 年。

**根因**:一个 flag(`maintenanceCapex.ts:100`,`capex_t / capex_{t-2} ≥ 2`)级联三处抑制:
1. `epvFloor.ts:169` `suppressedFlags`(=`highLeverage || aiCapexDistortion`)→ `deriveMoatCap` → 强档降中档,**CAP 20→10**。
2. `growthValue.ts:70` → 增长价值 gated_to_zero。
3. `deriveValuationVerdict.ts:67` → `assessReliability` 返 false → **reliable=false**(地基买点闸输入)→ 连带 ingest `suppressed:!v.reliable` → 预期层抑制。

## 2. 主流方法论裁决(2026-07-12 研究,四家一致)

「**资本开支激增 ≠ 缩短护城河久期**」——决定 CAP 的是「增量资本回报 ROIIC 能否持续 > 资本成本」+ 护城河来源 + 行业变化速度,**不是 capex 量级/增速**。

- **Mauboussin**(CAP 概念提出者):CAP 由 ROIC 持续性 + 进入壁垒 + 行业变化决定;高再投资于高 ROIIC 上是**延长**价值创造;"reinvestment moat"(能把大量资本以高回报再投出去者)最该给长久期。实证超额回报年均留存 ~79%,市场反而低估真护城河寿命。
- **Damodaran**:高 capex 是支撑增长的输入,非缩短高增长期的理由;只看 ROIC 是否仍 > 资本成本。区分 pricing(市场反推)≠ valuation(基本面判久期)——我们做的是后者,更不该用市场/信号型触发器定久期。
- **Morningstar**:moat 评级(none/narrow/wide ≈ 0/10/20 年)只看五个护城河来源,**capex 非评级输入**;只经 ROIC 中介间接影响——「花的钱赚不回资本成本」才降级,非「花得多」。
- **Greenwald**:区分维护 vs 增长 capex **只为估当前盈利能力(EPV)**,不为判护城河久期。

**对「不为抬估值而抬」的正面回答**:闸的 #3(标 low confidence)与 Buffett 对 maintenance-capex 不确定性处理一致 = **对,保留**;#1(降护城河)、#2(GV 归零)把「数字不确定」错误外溢成「久期变短」= 主流不这么做。

**边界条件(防放水)**:唯一该让久期打折 = capex 激增 **且** ROIIC/ROIC 恶化。正确做法是把触发器从「纯量级」换成「量级 + 回报恶化」的复合闸,非一摘了之。

## 3. 设计决策(brainstorm 已定)

- **Q1 · 前瞻性缺口**:加 **ROIC 趋势闸**——capex 激增 **且** 成熟资本上的 ROIC 结构性下滑,才降到中档。(否决「只信历史 roicStable」的最简版与「引 ROIIC<WACC 前瞻闸」的最复杂版。)
- **Q2 · GV 归零**:**留着不动**。本轮范围只碰 moat CAP,不碰 `growthValue.ts:70`。GV 归零是压低估值的保守方向,零放水风险;护城河错标已由 Q1 纠正,不依赖动 GV。
- **#3 reliable/预期层**:**保留抑制**(研究背书 low-confidence)。本轮不碰 `assessReliability` 及其输入 `floor.ai_capex_distortion_warning`。

## 4. 核心逻辑改动

**唯一逻辑改动点** = `epvFloor.ts` 的 suppressedFlags 组成:

```
现在:  suppressedFlags = highLeverage || aiCapexDistortion
改成:  suppressedFlags = highLeverage || (aiCapexDistortion && roicDeclining)
```

- `highLeverage` 原样留(杠杆是独立的正当红旗,不在本次范围)。
- capex 激增**单独**不再压护城河;只有**激增 + ROIC 结构性下滑**才降中档。
- `roicDeclining` 来自新增纯函数 `roicTrend`(见 §5)。

### 净效果
- MSFT/GOOGL(历史 ROIC 高且稳,只是近年狂投)→ `roicDeclining=false` → 若同时过 `epvAvRatio≥2 + dual_test + !declined + roicStable`,则拿回 **strong/20**,中性/乐观 rangeHi 抬高。
- 真正 ROIC 结构性下滑还硬投的股 → `roicDeclining=true` → 仍降 moderate/10。
- reliable 仍 false → 不进击球区、不出买入信号。呈现为「宽护城河 20 年,但当年数字低信心」——诚实表达。

## 5. `roicTrend` 纯函数(moatCap.ts 新增)

**签名(拟)**:
```ts
export function roicTrend(input: {
  fyYears: ValuationFloorYear[];                      // 已确认 FY 行(调用方过滤)
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
}): "declining" | "stable" | undefined
```

### 关键方法论:排除最新 ~2 年 surge(防自我拆台)
新投的 capex 立刻进「投入资本」分母,但回报滞后进 NOPAT 分子——**capex 激增那 1-2 年 ROIC 会机械性下滑,哪怕投资很好**。若 `roicDeclining` 天真比「最新 vs 早年」,会在每次 surge 都触发 → 把想救的健康烧钱股又原地摁死。

**解法**:与 `growthValue` 的 `ROIIC_ENDPOINT_LAG=2` 同哲学——`roicTrend` 评估趋势时**排除最新 `ROIC_TREND_LAG`(=2)年的未成熟投资**,看的是「**成熟资本上的 ROIC 是否早已在跌**」,而非「surge 当年被分母压低」。

### 实现要点(spec 层定义,plan 用测试用例钉死具体数)
- 逐年 FY ROIC = `nopatOf(y) / investedCapitalOf(y)`,复用 `roicStability` 同款有效性过滤(`investedCapitalOf` 对负/零权益返 undefined;`|ROIC| > ROIC_SANITY(3.0)` 剔除;非有限剔除)。
- most-recent-first 排序后,**丢弃最新 `ROIC_TREND_LAG=2` 年**,在余下**成熟序列**上判趋势。
- 趋势判据(拟,plan 定稿):把成熟序列切**较新半段 vs 较旧半段**比均值;较新半段均值 < 较旧半段均值 × (1 − `ROIC_TREND_DROP`),则 `"declining"`;否则 `"stable"`。`ROIC_TREND_DROP` 取一个「非噪声」阈值(如 0.15~0.20,plan 用真数据校准),避免把小幅波动当下滑。
- 成熟序列**有效年 < `ROIC_TREND_MIN_YEARS`**(如 4)→ 返 `undefined`(趋势不可评估)。
- **`undefined` 的处理**:在 `epvFloor` 里,`roicDeclining = roicTrend(...) === "declining"`。即 `undefined`(不可评估)→ **不判下滑 → 不压护城河**。理由:reliable=false 已在估值侧标了不确定;moat grade 是结构性读数,不可评估时不因「不确定」误伤久期(与研究「别把数字不确定外溢成久期变短」一致)。

## 6. 改动面(4 文件,均小)

| 文件 | 改动 |
|---|---|
| `web/src/lib/valuation/moatCap.ts` | 新增 `roicTrend` + 常量(`ROIC_TREND_LAG`/`ROIC_TREND_DROP`/`ROIC_TREND_MIN_YEARS`);`deriveMoatCap` 的 moderate basis 文案细分(capex+ROIC 下滑 vs 其他);更新/新增 `.check.ts` 断言 |
| `web/src/lib/valuation/epvFloor.ts` | `roicDeclining = roicTrend(...) === "declining"`(复用已有 `nopatOf`/`investedCapitalOf`);suppressedFlags 改为 `highLeverage || (aiCapexDistortion && roicDeclining)` |
| `web/src/lib/valuation/types.ts` | 如 basis 细分需要,`MoatCapAssessment` 可选加字段(如 `roicDeclining?: boolean`)供披露;否则不动 |
| `web/src/components/valuation/EarningsPowerFloorCard.tsx` | 披露文案跟 basis 走(仅文案,无买卖) |

## 7. 地基护栏(端到端可证,禁破)

- **`floor.ai_capex_distortion_warning` 一字不动**(`epvFloor.ts:201`)→ `assessReliability` 仍返 false → **reliable / 预期层抑制 / 买点档 / valueFloor / 悲观档全不变**。本次只改 moat CAP 的 suppressedFlags 组成,不碰 `assessReliability` 及其任何输入。
- **GV 归零路径**(`growthValue.ts:70`)不动。
- **悲观档 / valueFloor** 不受 grade 影响(Phase 2 已冻结),本次不碰。
- moat grade 只影响中性/乐观 duration → 只抬 rangeHi 上沿。

## 8. QA / 验证

### ★ 必查的经验未知
**尚不知 MSFT/GOOGL/META 被降级是否 `aiCapexDistortion` 在起决定作用**——它们也可能本就卡在 `epvAvRatio<2` / `dual_test` / `roicStable`。若是后者,解耦后仍 moderate(因别的正当原因),对这几只**无可见效果**——但那也**正确**(不该硬给)。

**plan 必含**:用真引擎在 **AAPL / MSFT / GOOGL / META + 一个 ROIC 真结构性下滑的对照股**上跑,打印每一步闸(epvAvRatio / dual_test / declined / roicStable / aiCapexDistortion / roicTrend)的通过情况,确认 `roicTrend` 行为符合预期、并如实记录哪几只真的因本次改动升档、哪几只因别的原因仍 moderate。此步需生产 env(借一次或本地跑)。

### 验证门
- `npx tsx` 全套 `.check.ts` PASS + `npx tsc --noEmit` 零错。
- **禁** `next build`(本机 google fonts 被墙,见 [[local-build-google-fonts-blocked]])。
- 地基回归:构造/复用断言证明 reliable / 悲观档 / valueFloor / 买点档在本次 diff 下逐位不变。

### 部署待办
合并后跑一次 `npm run valuation:ingest`(GitHub Actions「Valuation Snapshot」workflow_dispatch,授权触发)才把新 grade 落进快照面(screener/首页/徽章);个股页实时算,合并即生效。

## 9. 非目标(YAGNI)

- 不动 GV 归零、不动 reliable、不动预期层抑制、不动杠杆闸。
- 不引 ROIIC<WACC 前瞻闸(Q1 已否)。
- 不重排 `computeGrowthValue` 与 `deriveMoatCap` 的顺序(roicTrend 只用 moat CAP 点已有的 ROIC 数据,无需 ROIIC)。
- 不碰 Phase 3(透明度表)。
