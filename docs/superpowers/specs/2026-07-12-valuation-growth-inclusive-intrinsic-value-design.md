# 估值改造 Phase 3 · 含增长内在值:内在值锚从「零增长底」升到「含增长中枢」

**日期**:2026-07-12
**前置**:Phase 1(反向 DCF 预期层 / `historicalGrowthBaseRate`)、Phase 2(护城河→CAP)、Phase 2.5(ai_capex 闸解耦)均已建成;Phase 2.5 待合并 db-foundation。
**实施分支(writing-plans 定稿)**:优先 off 已合并的 `db-foundation`(含 Phase 1/2/2.5);若 2.5 未合并则 off `plan/valuation-aicapex-moat-decouple`。
**性质**:这是三轮改造里**第一个故意改变价值数字与判定档**的——不是「地基禁改」,而是**有意动地基**(`deriveValuationVerdict` 的锚)。因此护栏(防泡沫背书 / 假买点信号 / 品牌漂移)是设计核心。忠于 [[valuation-philosophy-constraint]]。

---

## 1. 问题

引擎的内在值下沿与买点闸**全部锚在「零增长 EPV」**(Greenwald 盈利能力价值):

- `deriveValuationVerdict.ts:143` `inStrikeZone = epv.position === "in_strike_zone"`(价 vs 零增长 EPV 击球区)
- `deriveValuationVerdict.ts:147` `marginPct = (valueFloor − price)/valueFloor`(锚零增长底)
- `deriveValuationVerdict.ts:137` `rangeLo = epv.valueFloor`(零增长底)

后果:优质成长股要触发买点,得等**现价跌破「它零增长也值多少」**——这是「优质股永远判太贵」的机械根因。快速增长(MSFT/NVDA/META)的历史业绩不进入内在值。用户诉求:**让含增长的内在值成为头条锚,让优质成长股的估值终于有信息量,而非永远判太贵**——但绝不为抬估值而抬。

## 2. 主流方法论复核裁决(2026-07-12 双轨查证)

对照 Damodaran / Mauboussin / McKinsey《Valuation》/ Greenwald / Graham,逐条复核「把增长纳入内在值」的五个决策:

| 决策 | 相对主流 | 裁决 |
|---|---|---|
| **fade + CAP 横轴** | 持平/偏保守 | ✅ 最佳实践。CAP 驱动 fade = Mauboussin & Johnson(1997)原命题;强20/中10 落其 5–15/可达30年区间。无需改 |
| **保留零增长 EPV 下行底** | 持平/最佳实践 | ✅ Greenwald 分层精髓(他本人承认 "We didn't get growth right",更凸显分层披露价值)。无需改 |
| **历史营收 log 回归增速** | 方向对但偏松 | ⚠️ log 回归是历史三算法里最稳的,但主流首选**基本面法 g=ROIC×再投资率**;历史外推缺再投资支撑=无根之木 → **加基本面上限闸(改 A)** |
| **20%/10% 量级封顶** | franchise 20%持平,非franchise 10%偏松 | ⚠️ 10% 远超名义 GDP(~4%);无护城河公司主流不认(Greenwald:无优势的增长不创造价值)→ **非franchise 收到 ~7%(改 B)** |
| **安全边际锚含增长中枢×(1−1/3)** | 唯一实质放水点 | ❌ 把 Graham「保守估值×折价」双保守压成单保守;固定 1/3 打在含乐观增长的中枢,增长溢价会吃掉安全边际 → **浮动折价(改 C)** |

**总裁决**:五分之四站得住甚至偏保守,不是系统性放水;真正要补的是决策 1/2 各缺一道基本面封顶、决策 4 的固定 1/3 锚中枢是纪律漏洞。三处调整(A/B/C)补齐后,整套设计完全落在价值投资主流的保守一侧。

**来源(2026-07-12 查证,均为可查真实文献)**:
- [Damodaran — Fundamental Determinants of Growth](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/growth.htm)(增长内生化 g=再投资率×ROIC)
- [Damodaran — The Stable Growth Rate](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/stablegrowthrate.htm)(终值 ≤ 无风险利率/GDP)
- [Mauboussin & Johnson — Competitive Advantage Period "CAP"(1997)](https://pages.stern.nyu.edu/~adamodar/pdfiles/eqnotes/cap.pdf)
- [Greenwald — Earnings Power Value 讲义](http://csinvesting.org/wp-content/uploads/2013/06/Greenwald-Earnings-Power-Value-EPV-lecture-slides.pdf)
- [Graham — Margin of Safety(1/3 折价,随可靠性/质量浮动)](https://mindbetter.org/p/margin-of-safety-benjamin-grahams-enduring-principle/)

## 3. 设计决策(brainstorm 已定,用户认可)

- **改 A · 基本面上限闸**:`g_used = min(历史 log 回归增速, ROIC × 再投资率)`,再受量级封顶。用可持续增长率给历史外推封顶(Damodaran 内生化)→ 中枢不虚高。
- **改 B · 非 franchise 档收顶**:量级封顶 `cap = (franchise && roicStable) ? 0.20 : 0.07`(原 10% → 7%,贴近 GDP+小幅)。
- **改 C · 浮动安全边际**:买点仍锚含增长中枢 IV(满足诉求),但固定 1/3 折价改为随增长激进度浮动:`MOS = 1/3 + (0.45 − 1/3) × growthReliance`,`growthReliance = (IV − F)/IV`。纯价值股 MOS=1/3(Graham 经典),重增长股 MOS→45%(越乐观越难买)。
- **保留决策 3、5**:fade + CAP 横轴、零增长 EPV 下行底,原样不动。

**三道对冲共同补回 Graham 纪律冗余**:①基本面上限(改A)使中枢不虚高 ②零增长 EPV 下行底(决策5)始终可见 ③浮动折价(改C)使增长依赖越高、安全边际要求越大。

## 4. 核心逻辑改动

### 4.1 增长率 `g_used` 推导(`ownerEarningsDcf.ts`)

现状(`ownerEarningsDcf.ts:277-279`):
```
const { cagr } = netIncomeCagr(...);          // 端点净利 CAGR
const g1 = cagr == null ? 0 : clamp(cagr, 0, GROWTH_CAP);   // GROWTH_CAP=0.10 硬顶
```

改为(证据驱动 + 基本面封顶 + franchise 分档):
```
g_raw         = historicalGrowthBaseRate(fyYears)   // 营收 log 回归(Phase 1 已有,impliedExpectations.ts)
g_fundamental = sustainableGrowth(fyYears)          // ROIC × 再投资率(§5 新增纯函数)
declined      = 盈利下滑(沿用现有 netIncomeCagr<0 判据)
cap           = (franchise && roicStable) ? GROWTH_CAP_FRANCHISE(0.20) : GROWTH_CAP_BASE(0.07)
g_used = declined ? 0 : clamp( min(finiteOf(g_raw, g_fundamental)), 0, cap )
```
- `min(...)` 只对**有限且非负**的候选取小;若 `g_raw`、`g_fundamental` 之一缺失 → 取存在者;两者皆缺 → 退回今天行为(`netIncomeCagr` clamp,但量级封顶用新的 `cap`)。
- `franchise`、`roicStable` 来自 moat CAP 层已有判定(`deriveMoatCap` 的 signal/roicStable),需传入 OE-DCF 投影入口。
- **投影/fade/横轴复用现成**:前 `HIGH_GROWTH_YEARS`(5)年 g_used → 线性 fade 到 GDP 终值(`projectOe` 已有);横轴 `capYears = moat CAP`(`neutralCap`)。终值 `gTerminal` 严格 ≤ GDP(现有 `gCap`,满足 Damodaran 铁律)。

### 4.2 含增长中枢 `IV`(暴露 OE-DCF 中性档 per-share)

OE-DCF 现有三档:pessimistic(g/2, r_high, capYears=0)/ neutral(g_used, midpoint, neutralCap)/ optimistic(g_used, r_low, neutralCap)。中性档 per-share 已在算,但 `OeDcfAssessment` 目前只暴露 `per_share_low`/`per_share_high`。

- **新增 `per_share_mid`**(= neutral 档 per-share)到 `OeDcfAssessment`,作为含增长中枢 IV 的来源。
- `IV` 定义:`oeDcf.per_share_mid`(可评估时);不可评估 → 见 §4.3 单灯兜底。

### 4.3 判定层重构(`deriveValuationVerdict.ts`)

**锚从零增长底换到含增长中枢**:
```
F  = epv.valueFloor                         // 零增长下行(保留,展示带下沿)
IV = oeDcf.per_share_mid                     // 含增长中枢(新头条锚)
H  = Math.max(...ends)                        // 乐观上沿(现有 rangeHi 口径不变)

growthReliance = (IV > 0 && IV > F) ? (IV − F)/IV : 0
MOS            = 1/3 + (0.45 − 1/3) × clamp(growthReliance, 0, 1)

bucket:
  below   若 price < IV
  within  若 IV ≤ price ≤ H
  above   若 price > H
inStrikeZone = price ≤ IV × (1 − MOS)
marginPct    = IV > 0 ? (IV − price)/IV : null      // 相对含增长中枢
rangeHi = H;  rangeLo = F                             // 展示带:F 下行 → H 乐观,IV 为中枢标记
```

**四道闸全保留(防泡沫背书)**:
1. `assessReliability`(`deriveValuationVerdict.ts:64`)**一字不改** → reliable=false(declined/高杠杆/ai_capex+ROIC下滑/模型不稳/per-share疑错)仍**不标 inStrikeZone、不出便宜信号**。
2. 基本面上限闸(改 A,§4.1)→ 中枢本身不虚高。
3. `isImplausibleBand` / `SANE_MARGIN_MAX`(`deriveValuationVerdict.ts:80,87`)**不改** → 坏数据(缺股数/拆股不一致)整条抑制。⚠️ 注意:`marginPct` 锚从 `valueFloor` 换到 `IV` 后,`isImplausibleBand` 的 `marginPct>0.8` 判据参照也随之变;plan 需验证换锚后该闸对真数据仍正确(IV≥F,同价位下 marginPct 变小,不会误抑制)。
4. fade + CAP 封顶(决策 3)→ 不给永续高增长估值。

**单灯兜底**:`oeDcf` 不可评估 / `per_share_mid` 非有限(金融单灯、缺一法)→ **退回今天的 EPV 锚行为**(bucket/inStrikeZone/marginPct 用 `epv.position`/`valueFloor`,保守,不硬造增长)。即换锚是「有中枢才用中枢,没有就退回保守底」。

**地基逐位不碰**:`assessReliability` 及其输入、`isImplausibleBand`、`netNet`、`coverage`、零增长 `F` 的计算——全不动。只换 bucket/inStrikeZone/marginPct/rangeLo 语义的锚。

### 4.4 呈现(单一价值带,`EarningsPowerFloorCard.tsx`)

**用户硬约束:页面只能一个估值展示位,且沿用现有价值带(ValueSpine)形式,不新增第二条范围。**

现有那条价值带**继续用**,只改三处、**不加任何新范围**:
1. **头条数字**:零增长底 → **含增长中枢 IV**(徽章与安全边际同锚 IV)。
2. **带下沿**:仍是现有零增长下行 `F`(不新增)。
3. **判定/安全边际锚**:跟着换到 IV。

呈现(一条带 + 一个头条数 + 一行假设):
```
含增长内在值 $IV        [below/within/above 徽章 · 安全边际 X%]
下行 $F ●━━━━━●IV━━━━━● 乐观 $H      ▲现价 $P
假设:营收增 X%(6年log回归·基本面封顶) · 护城河 Y年 · 折现 W% · 零增长下行 $F
reliable=false → 整带照显,标「当年数字低信心,不触发击球区」
```
- **一个组件,一次**:masthead 估值结论、投资人页叠加、screener 徽章全**引用 `deriveValuationVerdict` 同一结论**,不另算不另展示(纯函数保证不漂移)。
- **假设明示行**兼交付 Phase 3 透明度:增长率来源、封的什么顶、剥离增长还剩 $F,全摊开。

## 5. `sustainableGrowth` 纯函数(新增,可持续增长率闸)

**签名(拟)**:
```ts
export function sustainableGrowth(input: {
  fyYears: ValuationFloorYear[];
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
}): number | undefined   // ROIC × 再投资率,年化;不可评估 → undefined
```
- **ROIC**:复用 moat CAP 层同款有效性过滤(负/零权益 investedCapital → undefined;`|ROIC|>ROIC_SANITY(3.0)` 剔除;非有限剔除)。取成熟段稳健 ROIC(近数年均值,与 `roicStability` 同数据源)。
- **再投资率**:`g = ROIC × 再投资率`。再投资率取数据可得且更保守者:
  - 优先 `(capex − D&A + ΔNWC)/NOPAT`(公司口径净再投资率);
  - 若 ΔNWC/D&A 字段不全,退用 `1 − payoutRatio`(留存率,payout=dividends/net_income);
  - 两者皆不可得 → 返 undefined(§4.1 该候选缺失,由另一候选/退回路径处理)。
- **★ plan 必先验证 SEC 字段可得性**:`capex`/`depreciation_amortization`/`dividends_paid`/working-capital 组件在现有 `ValuationFloorYear`/fundamentals 是否齐;不齐则该口径降级为留存率法,并在 plan 用真数据(AAPL/MSFT)核对 `sustainableGrowth` 量级合理(不为 0、不爆表)。
- **保守取向**:`sustainableGrowth` 是**上限**用途(`min` 的一端),偏低不偏高;不确定时宁可返 undefined 或更小值,不虚高。

## 6. 常量(集中定义,plan 用真数据校准)

| 常量 | 拟值 | 依据 |
|---|---|---|
| `GROWTH_CAP_FRANCHISE` | 0.20 | Mauboussin 强 franchise 上沿;主流可接受(须 ROIC×再投资支撑) |
| `GROWTH_CAP_BASE` | 0.07 | 非 franchise,贴近名义 GDP(~4%)+小幅;主流不认无护城河的长期高增长 |
| `MOS_BASE` | 1/3 | Graham 经典折价(纯价值股) |
| `MOS_MAX` | 0.45 | 重增长/长 CAP 依赖时的折价上限(Graham「随激进度浮动」) |

- 现有 `GROWTH_CAP=0.10`(`ownerEarningsDcf.ts:13`)**移除或替换**为上面两档;plan 全量搜引用点,确保无遗留。

## 7. 地基护栏(端到端可证,禁破)

- `assessReliability` 及其全部输入(含 `floor.ai_capex_distortion_warning`)**一字不动**。
- `isImplausibleBand` / `SANE_MARGIN_MAX` 判据不改(仅 `marginPct` 的锚变,plan 须证换锚后行为正确)。
- `netNet` / `coverage` 不动。
- 零增长 `F`(`epv.valueFloor`)的计算不动——它仍是披露的下行锚。
- Phase 2/2.5 的 moat CAP 逻辑不动(本次**消费** franchise/roicStable/capYears,不修改其判定)。

## 8. QA / 验证

### ★ 必查的经验未知
1. **`sustainableGrowth` 数据可得性**:capex/D&A/dividends/NWC 字段是否齐(§5)。**plan 第一个 Task 就要用真数据验证**,决定再投资率用净再投资口径还是留存率口径。
2. **换锚后各闸行为**:`marginPct` 从 valueFloor 换到 IV 后,`isImplausibleBand` 的 0.8 阈值、strike 排序、below 名单是否仍正确(IV≥F,marginPct 变小,预期不误抑制、不制造假 below)。
3. **真数据全景抽查**:用真引擎在 **AAPL / MSFT / NVDA / META / GOOGL + 一个无护城河高价股 + 一个 reliable=false 股** 上跑,打印每步(g_raw / g_fundamental / cap / g_used / F / IV / H / growthReliance / MOS / bucket / inStrikeZone / reliable),确认:
   - 优质成长股(MSFT/NVDA)IV 显著高于 F、bucket 从 above 迁入 within/below 且**理由正当**(增长有基本面支撑);
   - 无护城河高价股 cap=7% 压住、不虚高;
   - reliable=false 股即便 IV 高也**不触发击球区**;
   - 如实记录哪几只因本次改动迁档、哪几只仍 above(正当)。
   此步需生产 env(借一次只读或本地跑)。

### 验证门
- `npx tsx` 全套 `.check.ts` PASS + `npx tsc --noEmit` 零错。
- **禁** `next build`(本机 google fonts 被墙,见 [[local-build-google-fonts-blocked]])。
- **地基回归**:构造/复用断言证明 `assessReliability` / `isImplausibleBand` / `netNet` / `coverage` / 零增长 `F` 在本次 diff 下逐位不变。
- **CAGR 硬门**([[valuation-reform-expectations-roadmap]]):`g_raw` 只吃 FY 行、营收 log 回归(非复用 netIncomeCagr)、SEC 对账;`sustainableGrowth` 同守 FY 行 + 有效性过滤。

### 部署待办
合并后跑一次 `npm run valuation:ingest`(GitHub Actions「Valuation Snapshot」workflow_dispatch,**需授权**)才把新 IV/bucket 落进快照面(screener/首页/徽章);个股页实时算,合并即生效。⚠️ 全站 bucket 口径变、必须重跑 ingest,否则快照面与个股页不一致。

## 9. 非目标(YAGNI)

- 不引「反向 DCF 隐含增长做上限护栏」(原 brainstorm 备选;基本面上限 `ROIC×再投资率` 已是更硬的内生封顶,反向 DCF 隐含增长留给预期层展示,不入买点闸)。
- 不动 GV 归零、不动 reliable 闸、不动杠杆闸、不动 Phase 2/2.5 moat CAP 判定。
- 不新增第二条价值带 / 第二个估值展示位。
- 不做三阶段以上 DCF(现有两段式 + fade 已够,主流背书)。
- 不让「高增长年数」随 CAP 动态延长(现固定 5 年高增长偏保守,主流复核认定为「偏紧非放水」,留待后续)。
