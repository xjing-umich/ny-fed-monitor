# 杠杆 → 股权成本:折现率分层重构

**日期**:2026-07-15
**状态**:spec 已定,待 plan
**基线分支**:`db-foundation`

---

## 一、问题

### 1.1 折现率对所有生意一刀切

`epvFloor.ts:11-12` 写死 `DISCOUNT_RATE_LOW = 0.09` / `DISCOUNT_RATE_HIGH = 0.11`,对每一门生意都用同一个带。无债复利机器和重杠杆生意拿同一个折现率。

### 1.2 杠杆被"一票四用",且全走错通道

`high_leverage_warning`(`epvFloor.ts:174`,判据 `netDebt/equity > 1.0`)现在被施加在四处:

| # | 位置 | 作用 | 评价 |
|---|---|---|---|
| 1 | `epvFloor.ts:220` → `moatCap.ts:35` | `suppressedFlags` → `franchiseCore = … && !suppressedFlags` → 高杠杆永远拿不到 `strong` → **CAP 20年砍到10年** | ❌ 错通道 |
| 2 | `ownerEarningsDcf.ts:310` | `gTerminal = declined \|\| high_leverage ? 0 : …` → **终值增长归零** | ❌ 错通道 |
| 3 | `deriveValuationVerdict.ts:69` | `→ reliable = false` → **cheap/strike 信号压制** | ❌ 错通道 |
| 4 | `epvFloor.ts:324-325` | 股权桥 `+ cash − totalDebt` | ✅ **正确,保留** |

#1 是链式的:CAP 砍半 → OE-DCF `neutralCap` 缩短 → IV 降;同时 `moatGrade` 喂 `computeGrowthValue` → GV 也降。**一个 flag 派生下游至少四处降值。**

三个惩罚全部挂在 `netDebt/equity > 1.0` 的**二元悬崖**上:0.99 与 1.01 两只票,估值天差地别。

### 1.3 reliability 闸的理由已蒸发

`deriveValuationVerdict.ts:60` 原文:

> `high_leverage_warning`:净负债/权益>1,**9–11% 单率股权桥失真**。

它把杠杆塞进可靠性闸的**理由,就是"我们对所有票用同一个 9–11%"**——正是本 spec 要修的缺陷。缺陷修好后,这个闸自己的理由不复存在。它不是独立的置信判断,**是这个建模缺陷的挡箭牌**。

### 1.4 杠杆指标 `netDebt/equity` 本身是坏的

```ts
// epvFloor.ts:173-174
netDebtToEquity = equity != null && equity > 0 ? netDebt / equity : undefined;
highLeverage    = netDebtToEquity != null && netDebtToEquity > LEVERAGE_WARN_RATIO;
```

- **硬伤①:负权益直接逃逸。** `equity > 0` 才算 → 负权益 → `undefined` → `highLeverage = false`。大量回购把权益买成负数的公司(MCD / AZO / HD / SBUX 类)**整个绕开杠杆闸**——账面最"杠杆"的反而一点没罚。
- **硬伤②:回购扭曲。** 权益被回购缩小 → 比值虚高 → 现金流健康的好生意被误判高杠杆。

同时漏掉真杠杆、误伤好生意。

### 1.5 代码自己挂着这个待办

`epvFloor.ts:386`(Buffett 灯 simplifications):

> `"Capitalized at the same 9–11% band as a cost-of-equity proxy (theoretically the cost of equity is higher; v2 simplification, v3 to refine)"`

本 spec = **兑现这个 v3 待办**。

---

## 二、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 风险来源 = **基本面风险**,**不用 CAPM beta** | 巴菲特/格雷厄姆明确拒绝把波动当风险;beta 噪声大、向后看。守 [[valuation-philosophy-constraint]] |
| D2 | 方向 = **重构**(正确通道替换过度惩罚),**非**"只加一层罚" | 杠杆已被重罚(1.2 三处),再加是叠罚。真缺陷是通道错+二元悬崖 |
| D3 | **放弃"零上升"红线**,换**真数据举证义务** | D2 的必然代价:摘掉过度惩罚 → 被误伤的杠杆名估值会回升。用逐只举证代替机械保证 |
| D4 | 杠杆溢价**只加股权成本口径**(Buffett 灯 + OE-DCF),**Graham 灯 WACC 不动** | 见 §3.1。加到 Graham 灯 = 与股权桥重复惩罚 |
| D5 | 杠杆指标改 **`netDebt / ownerEarnings`** | 修 1.4 两个硬伤;免疫负权益/回购扭曲 |
| D6 | 溢价锚**真实信用利差**,连续分级 | 不是拍脑袋的斜率;市场对这种资产负债表实际收多少钱 |
| D7 | **金融股保持现状**(保留原闸,不放开) | 银行结构性高杠杆;既摘闸又豁免罚 = 从"被压制"变成"完全没定价裸奔"。本就是弱适配类 |
| D8 | 脆弱性罚(负净利年)降级为 **Phase 2** | Phase 1 脊梁是杠杆→股权成本(理论锚硬)。脆弱性是新增罚、无现成锚,混入会搅浑一个干净的重构 |

---

## 三、设计

### 3.1 溢价只属股权成本口径(核心)

两盏灯的折现率语义**根本不同**,代码自己写明:

**Graham 灯**(`epvFloor.ts:298-302`)
- `leverage_treatment: "Unlevered (pre-interest, attributable to all capital)"`
- 分母 = `"9–11% (read as a **WACC** proxy)"`
- 桥 = `"+ cash − total debt"`

**Buffett 灯**(`epvFloor.ts:388-393`)
- `leverage_treatment: "Levered (starts from net income, already after interest — an **equity-holder** stream)"`
- 分母 = `"9–11% (read as a **cost-of-equity** proxy)"`
- 桥 = **无**

因此:

- **Graham 灯 = 无杠杆 NOPAT / WACC,杠杆已由桥承担。** MM 定理:WACC 对杠杆大致不变(税盾略降、破产成本极端处略升)。加杠杆溢价 = **与桥重复惩罚**。→ **不加**。
- **Buffett 灯 = 股权流 / 股权成本。股权成本随杠杆上升**(MM Prop II:`re = ru + (ru − rd)(D/E)`)。→ **该加**,正是 `:386` 挂的 v3 待办。
- **OE-DCF**(`ownerEarningsDcf.ts`,owner earnings ÷ `DGS10 + DGS10_PREMIUM`)同样是股权流。→ **该加**。

> **注**:MM Prop II 本身需要 `D/E`,而 `D/E` 有 1.4 的负权益问题。故 MM 只作为**"溢价为何属于股权灯"的理论依据**,实现走 §3.2 的 `netDebt/ownerEarnings` 分级(免疫负权益)。

### 3.2 杠杆度量与溢价曲线

```
L = netDebt / ownerEarnings        // 「这门生意的盈利,几年能还清净债务」
leveragePremium = f(L)             // 连续,单调不减,f(L≤L0) = 0
```

- 净现金(`netDebt ≤ 0`)或 `L ≤ L0` → **溢价 = 0**,拿今天的 9–11%(基线不动)。
- `L > L0` → 连续上升,**无悬崖**。
- 上限 `PREMIUM_CAP`,防止把价值压到 ~0 造出假"太贵"信号。

**锚定方法**:分级映射到真实信用利差(投资级 ≈ +1% / BB ≈ +2–3% / B 及以下更高)。
**注意口径**:`ownerEarnings` 是**税后、扣维持性 capex 后**的口径,数值显著低于 EBITDA,故 `netDebt/OE` 比常见的 `netDebt/EBITDA` **大**。两者的换算倍数**必须由校准确定**,不得照搬 EBITDA 分级阈值。

`L0` / 斜率 / `PREMIUM_CAP` 的具体常量**由 §5 校准落定,本 spec 不预设数字**。

### 3.3 施加点与摘除点

| 位置 | 改法 |
|---|---|
| `buildBuffettLamp`(`epvFloor.ts:357`) | 分母 `DISCOUNT_RATE_{LOW,HIGH}` → `+ leveragePremium`。更新 `method.discount_rate_*` 与 `:386` 的 simplification 文案(v3 已兑现) |
| `ownerEarningsDcf.discountBand`(`:145-165`) | `r_low`/`r_high` `+ leveragePremium` |
| `buildGrahamLamp`(`epvFloor.ts:272`) | **不动**(WACC 口径,桥已承担) |
| `ownerEarningsDcf.ts:310` | `gTerminal = declined \|\| high_leverage ? 0` → **摘掉杠杆那半**,只留 `declined ? 0` |
| `epvFloor.ts:220` | `suppressedFlags: highLeverage \|\| (aiCapexDistortion && roicDeclining)` → **摘掉 `highLeverage` 那半**,只留 ai_capex 那半 |
| `deriveValuationVerdict.ts:69` | `if (floor?.high_leverage_warning) return false;` → **非金融摘掉**;金融股(`floor.is_financial`)保留(D7) |
| 股权桥(`epvFloor.ts:324-325`) | **不动**(正确) |
| `assessReliability` 其余四项 | **不动**(ai_capex / declined / quick_check_flag / EXTREME_OE_YIELD)。守记忆:别往这个闸里加新东西 |

`high_leverage_warning` / `net_debt_to_equity` 字段本身**保留**(展示/披露用),只是不再驱动上述三处惩罚。

### 3.4 披露(产品面)

折现率不再是全站同一个数,**必须说清为什么这只票被多收了**。`provenance.discount_rate_band` 与 Buffett 灯 `method` 需带上:基线带、杠杆溢价、`L` 的实际值。个股页披露口径:「基线 9–11%,因净债务约 N 年盈利可清偿,加 X% 风险溢价 → 实际 A–B%」。文案守 `docs/copy-voice.md` 与 [[anti-ai-product-sense]]。

---

## 四、护栏 / 不变量(写进 `.check.ts` 当硬门)

1. **`leveragePremium ≥ 0` 恒成立**,且 `netDebt ≤ 0`(净现金)→ **恒 = 0**。
2. **数据缺失 → 溢价 = 0**,退化成今天的行为。**不得因数据缺失而惩罚**("查不到就当它危险"是另一种造假)。
3. **溢价 ≤ `PREMIUM_CAP`**,任何票的股权折现率不被推到造出假"太贵"的量级。
4. **Graham 灯的 `discount_rate_*` 逐位不变**(回归门:证明 D4 没被违反)。
5. **负权益的票必须能拿到非零溢价**(证明 1.4 硬伤① 真的修好,不再逃逸)。
6. **单调性**:`L` 增大 → 溢价不减 → 每股价值不增。
7. **无悬崖**:`L` 在 `L0` 附近的微小变化,不产生估值跳变(对比今天 `1.0` 处的悬崖)。
8. **金融股**:`is_financial` → 走 D7 现状路径,行为逐位不变。

---

## 五、校准与举证义务(真数据,非可选)

D3 放弃了"零上升"的机械保证,**必须由真数据举证补上**:

1. **全宇宙跑** `valuation:ingest` 前的引擎级 dry-run,产出改动前后对照表。
2. **回归锚**:无债/净现金名(GOOGL / META 类)→ 溢价 = 0、**估值逐位不变**。这轮不该碰到它们。
3. **逐只举证**:每一只**估值上升**或**新拿到 cheap/strike 信号**的票,人工核——是真资产负债表撑得起,还是数据假象(负权益、`total_debt` tag 缺失、口径错)。**举证不过 → 常量收紧或回退。**
4. **负权益名**(MCD / AZO / HD / SBUX 类)→ 确认现在**拿到了**非零溢价(此前逃逸)。
5. **常量落定**:`L0` / 斜率 / `PREMIUM_CAP` 依据 2–4 的真数据分布确定,写明依据,**不得拍脑袋**。
6. 守 [[sec-valuation-ingest-ops]]:`SEC_USER_AGENT` 前置、两脚本读不同 `.env.local`、`cd web/` 单进程。
7. 守 [[graham-net-net-floor]] 铁律:核验查 `fiscal_period = FY` 行,**不用 `form = 10-K`**(派生 Q4 行 `shares_diluted` 损坏会造假警报);交验走真引擎,不手写 SQL。

---

## 六、范围外(入档,不在本轮)

1. **`roicLongTermStrong` 一票三用抬升**(复核时发现,真问题):
   ```
   epvFloor.ts:126  roicLongStrong = roicLongTermStrong(allYears)
   epvFloor.ts:127  sc = structuralConfidence({ …, roicLongTermStrong: roicLongStrong })  // s = 0.6收入驱动 + 0.4×它
   ```
   同一信号同时:① 直接进 `deriveMoatCap` pathB → **strong CAP(20年)**;② 经 `s` 进 `buildBuffettLamp` lift → **抬盈利基数**;③ 经 `s ≥ 0.8` 进 `deriveValuationVerdict:72` → **解 ai_capex 可靠性否决**。
   ②③ 那对"一票两用"已知情接受(见 [[valuation-structural-cyclical-basis]]),但**叠上 ① 是三用,且三处互相放大(基数↑ × CAP↑ = IV 复利式抬升)**。须独立开 spec。
2. **脆弱性罚(负净利年 → 股权成本)** — 本 spec Phase 2(D8)。
3. **金融股杠杆定价** — D7 明确不做;金融弱适配已在 [[valuation-data-coverage]] 入档。
4. **EPV 基线是否改锚 DGS10** — 本轮 Graham/Buffett 基线带 9–11% 不动,只加溢价。两条腿基不同源的问题留档。

---

## 七、验收

- [ ] §4 全部不变量进 `epvFloor.check.ts` / `ownerEarningsDcf.check.ts`,`npx tsx` 全绿
- [ ] `tsc` = 0(守 [[no-tests-solo-dev]]:tsc + 人工看页面,不跑测试套件)
- [ ] §5 校准表产出,回归锚(无债名逐位不变)通过
- [ ] §5.3 逐只举证清单完成,每一只回升名有书面理由
- [ ] §5.4 负权益名确认拿到非零溢价
- [ ] 个股页披露(§3.4)真机看过,文案守 `docs/copy-voice.md`
- [ ] `roicLongTermStrong` 三用问题已入档(§6.1)
