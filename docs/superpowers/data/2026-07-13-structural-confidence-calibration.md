# 结构性置信分 s 真数据校准报告(Task 8)

数据来源:Supabase `company_fundamentals`(经 `getSecCompanyData`,只读,`web/.env.local` 凭据),
探针脚本 `web/scripts/probe-structural-confidence.ts`,跑于 2026-07-13。10 票参照集里 2 票
(SIVR/FMS 类边界票未纳入本轮,brief 定的 8 票已覆盖三类 + 边界)全部拉到真 SEC 年报数据,无缺票。

## 跑法

```
cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-structural-confidence.ts
```

编排:`getSecCompanyData(ticker)` → `fundamentalsToFloorInput` → `computeValuationFloor`,
诊断字段(`target`/`revenueDrivenRatio`/`validatedLevel`/`roicLongTermStrong`)用与引擎内部
同源的导出纯函数(`structuralConfidence`/`revenueDrivenRatio`/`validatedEarningsLevel`/
`roicLongTermStrong`)在探针里独立重算一遍,仅供人工核对——`structural_confidence` 与
`reliable` 两栏是引擎真实产出(`floor.structural_confidence` / `assessReliability({floor})`),
非重算值。

## 真值表

| ticker | structural_confidence (s) | buffett normalized_earnings | ai_capex_distortion_warning | reliable | validatedLevel | target | target/avg | revenueDrivenRatio | roicLongTermStrong |
|---|---|---|---|---|---|---|---|---|---|
| GOOGL | 0.8105 | 81.21B | true | **true** | 76.03B | 117.57B | 1.330 | 0.684 | true |
| META | 0.8582 | 52.02B | true | **true** | 39.37B | 60.46B | 1.347 | 0.764 | true |
| MSFT | 1.0000 | 91.39B | true | **true** | undefined(无下行年) | 99.37B | 1.254 | 1.000 | true |
| NVDA | 0.4396 | 78.27B | true | **false** | 9.75B | 120.07B | 2.535 | 0.733 | false |
| AAPL | 0.9474 | 106.09B | false | true | undefined(无下行年) | 104.81B | 1.054 | 0.912 | true |
| CVX | 0 | 7.87B | false | true | 35.47B | 20.48B | — | 1.000 | false |
| NUE | 0 | 1.18B | false | true | 7.61B | 4.55B | — | 0.000 | false |
| FCX | 0 | 0.24B | false | true | 3.47B | 2.74B | — | 1.000 | false |

CVX/NUE/FCX 的 `target/avg` 标"—":s=0 分支下 `target ≤ avg`(下行 capped,见
`structuralConfidence()`:`if (target == null || target <= a) return { s: 0, target }`),
比值本身无意义(已在下行分支被拦,不进入 rawScore/cap 计算)。

## 三类判据核验

**放开预期(GOOGL/META/MSFT,结构性、已验证):** 判据 = `s≥0.8` 且 `reliable=true`。
三票全部达标(0.8105 / 0.8582 / 1.0000,均 `reliable=true`)。GOOGL/META 都触发了
`ai_capex_distortion_warning=true`,但因 `s≥S_RELIABLE(0.8)`,Phase 2.5 的 s 解耦逻辑
(`deriveValuationVerdict.assessReliability`)推翻了单灯 ai_capex 否决,`reliable` 仍判
true——这正是本 Phase 3.7 要交付的行为(结构性高置信盈利不该被顺周期 capex 闸误伤)。
**GREEN,达标。**

**半放预期(NVDA,爆炸未验证):** 判据 = `s≈0.5` 且 `reliable=false`。实测 `s=0.4396`,
`reliable=false`。`reliable=false` 精确达标(`ai_capex_distortion_warning=true` 且
`s<0.8`,否决未被推翻)。`s` 的绝对值 0.44 略低于"≈0.5"的参照点,但机制上是**设计内**结果:
NVDA 的 `target/validatedLevel≈12.3×`(120.07B/9.75B),远超 `UNVALIDATED_JUMP_RATIO=3.0`,
理应触发 `UNTESTED_S_CAP=0.5` 封顶——但 `rawScore=0.6×0.733+0.4×0=0.4396` 本身已经低于
0.5(`roicLongTermStrong=false` 拿不到 ROIC 久期那 0.4 分),cap 未binding
(`min(rawScore, cap)=min(0.4396, 0.5)=0.4396`)。即"raw score 天生低于 cap"与"raw
score 被 cap 拦住"两条路径都能把 NVDA 压到 GOOGL/META(0.81–1.0)之下、明显分层,
只是这次是前者生效。0.44 与 0.5 只差 0.06,分层意图(远低于结构性组、reliable 仍 false、
个股页 IV 半抬而非全抬)完全达成。**判定 GREEN,不需为凑一个更贴近 0.5 的数字去调
`W_ROIC_DURABILITY`/`UNTESTED_S_CAP`——那样做反而是在拟合单票而非校准通用常量。**

**平滑预期(AAPL):** 判据 = `target/avg ≤~1.3`(温和抬幅)。实测 `1.054`,远低于阈值。
**GREEN,达标。**

**周期对照(CVX/NUE/FCX):** 判据 = `structural_confidence=0`(下行 capped 分支)。
三票均为 `0`。**GREEN,达标。**

## 常量最终取值

真数据全部一次性达标(**8 票、三类判据全绿,无需调常量**)。`structuralConfidence.ts` /
`deriveValuationVerdict.ts` 顶部常量维持 spec §9 建议初值,未改动:

| 常量 | 取值 | 文件 |
|---|---|---|
| `MIN_STRUCT_YEARS` | 3 | structuralConfidence.ts |
| `DOWNTURN_DROP` | 0.20 | structuralConfidence.ts |
| `UNVALIDATED_JUMP_RATIO` | 3.0 | structuralConfidence.ts |
| `UNTESTED_S_CAP` | 0.5 | structuralConfidence.ts |
| `W_REVENUE_DRIVEN` | 0.6 | structuralConfidence.ts |
| `W_ROIC_DURABILITY` | 0.4 | structuralConfidence.ts |
| `S_RELIABLE` | 0.8 | deriveValuationVerdict.ts |

## 抬幅总结

- GOOGL/META/MSFT(放开预期):normalized_earnings 相对 5 年平均净利润(`avg`)分别抬升
  33.0% / 34.7% / 25.4%(`target/avg` 列),三票均触发 `S_RELIABLE` 解耦、可靠性未被
  ai_capex 单灯拦截。
- NVDA(半放预期):抬幅意图被压制——rawScore 天生低于 cap,`s=0.44` 远低于放开组,
  `reliable` 仍被 ai_capex 拦截(个股页 IV 半抬,聚合可靠性面不因结构性分抬升而解锁)。
- CVX/NUE/FCX(周期对照):`s=0`,零影响——完全走既有下行 capped 分支,structural
  confidence 层对周期股不介入。

## 回归验证(Step 4)

未改动任何常量,`.check.ts` 断言不受影响,回归确认全绿:

```
$ npx tsx src/lib/valuation/structuralConfidence.check.ts
Task1 structuralConfidence trend-fit: OK
Task2 revenueDrivenRatio: OK
Task3 untestedPeakCap: OK
Task4 structuralConfidence: OK
Task7 assessReliability s-decouple: OK

$ npx tsx src/lib/valuation/deriveValuationVerdict.check.ts
deriveValuationVerdict.check.ts ✓ all assertions passed

$ npx tsc --noEmit
(exit 0, 无输出)
```
