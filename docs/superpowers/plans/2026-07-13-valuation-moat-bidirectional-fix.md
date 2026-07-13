# 护城河判定双向修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 双向修正 moat 判定——放行被 EPV/AV 误判的真护城河(GOOGL/META 上 strong),收紧被 7% cap 过度放行的假增长(无护城河/金融/周期股),两者同步上线,并与已完成的 Phase 3(含增长内在值)全链融合测试无 bug。

**Architecture:** ① `deriveMoatCap` 加双路径(经营资产 EPV/AV 剔超额现金 + ROIC 长期极高)判 strong;② `g_used` 的 cap 从二分(strong/其它)改四分档(strong 20% / 金融 SGR / moderate 7% / none 5%);③ 金融股识别 sector + SGR 数据可得性前置验证,不可得则退 5%。全部改动喂给 Phase 3 已建的 g_used→IV→deriveValuationVerdict 链,必须端到端一致。

**Tech Stack:** TypeScript 纯函数(`web/src/lib/valuation/`)、`.check.ts`(`npx tsx`)、`tsc --noEmit`;生产 Supabase 只读抽查(env 已软链)。

## Global Constraints

- **实施分支**:`plan/valuation-growth-inclusive`(worktree `.claude/worktrees/val-growth-inclusive`),**在 Phase 3 Task 1–5 之上继续**,与之同步交付、一起终审+PR。
- **★ 融合测试硬约束(用户明确)**:每个改动 moat/cap 的 Task 除单元测试外,必须有**端到端断言**证明「moat 修正 → cap 分档 → g_used → IV → deriveValuationVerdict bucket」整条链一致;Task 5 是专门的全链融合测试 + Phase 3 地基逐位不变回归 + 真数据前后对比。**不能只单元测试各函数就算完。**
- **Phase 3 地基逐位不变**:`deriveValuationVerdict`(判定改锚 IV/浮动 MOS/单灯兜底)、四闸(`assessReliability`/`isImplausibleBand`/`netNet`/`coverage`)、零增长 `F`、`sustainableGrowth`(Task 1)、g_used 的 `min(gRaw,gFund,cagrFallback)` 结构——**只改 cap 的取值** 与 **加 strong 第二路径**,判定链结构不动。
- **asset_floor 展示不变**:超额现金剔除**只用于 moat 判定的 epvAvRatioOperating**,不改 `asset_floor`/reproduction 的展示口径。
- **回复/文档正文中文**(代码/术语/路径除外)。
- **数据准确性**:真数据抽查标来源(SEC/生产 Supabase)+ 日期(2026-07-13);只用 FY 行 + 有效性过滤(复用 `ROIC_SANITY`/investedCapitalOf 负零权益→undefined)。
- **禁 `next build`**(google fonts 被墙);门 = `tsc --noEmit` + 全套 `.check.ts`。
- **禁裸 `git stash`**;`valuation:ingest` 写生产需授权(只读抽查可借 env)。
- 常量集中:`OPERATING_CASH_PCT=0.02`、`ROIC_MOAT_MIN_YEARS=8`、`ROIC_MOAT_STRONG=0.22`、`ROIC_MOAT_CV=0.35`、`GROWTH_CAP_MODERATE=0.07`、`GROWTH_CAP_NONE=0.05`(拟值,Task 1 真数据校准)。

---

### Task 1: 数据可得性前置验证 + 门槛校准(决定后续降级路径)

**Files:** Verify only(临时探针,验后删);产出结论写 report。

**Interfaces:** Produces — 结论文档:①金融股 sector 来源与识别法 ②SGR 留存率能否算 ③`ROIC_MOAT_STRONG`/`ROIC_MOAT_CV` 用真数据定值。后续 Task 据此实现或降级。

- [ ] **Step 1: 金融股 sector 可得性探针**

写 `web/scripts/probe-moat-data.ts`(参照现有 probe 模式,`scripts/tsconfig.json`,env 已软链)。对一批已知金融股(JPM/BAC/WFC/HBAN/MTB 银行 + ALL/CB/ACGL 保险)+ 非金融(AAPL/GOOGL/CVX)调 `getSecCompanyData(ticker)`,打印 `sec.company` 里是否有 `sic`/`sic_description`/`sector`/`industry` 字段及其值。判定:能否用 SIC code(银行 6020-6099 / 保险 6300-6399)或 sector 字段稳定识别金融股。

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-data.ts`
Expected: 打印各票 sector/SIC 字段。**记录**:金融股识别法(SIC 区间 or sector 字符串);**若无任何 sector 数据 → 记录"金融股无法识别,退回 GROWTH_CAP_NONE(5%)"**。

- [ ] **Step 2: SGR 留存率可得性探针**

同脚本,对银行股打印 `ValuationFloorYear` 的 `net_income`/`shareholders_equity`(算 ROE)+ 有无任何派息数据(`sec.annual` 里 dividends_paid/`share_repurchases`)。判定:留存率 = 1−payout 能否算。**记录**:能算 → SGR 口径;不能 → "金融股退回 5%"。

- [ ] **Step 3: ROIC 长期门槛校准探针**

同脚本,对 GOOGL/META/AAPL/MSFT + 一批周期/普通股(CVX/XOM/F/T/银行),用 epvFloor 的 `nopatOf`/`investedCapitalOf` 口径算近 8 FY 年 ROIC 均值 + 变异系数。**记录真值表**,校准 `ROIC_MOAT_STRONG`(让 GOOGL/META 过、周期/普通股不过)与 `ROIC_MOAT_CV`。

- [ ] **Step 4: 写结论 + 删探针**

结论写 `.superpowers/sdd/task-1-data-report.md`(sector 识别法 + SGR 可得性 + 三个门槛定值 + 各降级决定)。删除 `probe-moat-data.ts`。`cd web && npx tsc --noEmit` 零错。

- [ ] **Step 5: Commit**(仅结论文档无代码,可跳过 commit,结论进 report 供后续 Task)

---

### Task 2: 经营资产 EPV/AV(超额现金剔除)→ `epvAvRatioOperating`

**Files:**
- Modify: `web/src/lib/valuation/moatCap.ts`(`deriveMoatCap` 增 `epvAvRatioOperating` 入参 + 用它判 pathA;常量 `OPERATING_CASH_PCT`)
- Modify: `web/src/lib/valuation/epvFloor.ts`(算 `excessCash`/`epvAvRatioOperating` 传入)
- Modify: `web/src/lib/valuation/types.ts`(如需披露)
- Test: `web/src/lib/valuation/moatCap.check.ts`

**Interfaces:**
- Consumes: `moatReading.epv_per_share_compared`/`asset_per_share_compared`(epvFloor 现有);`latest.cash`、latest year `revenue`、`shares`。
- Produces: `deriveMoatCap` 新入参 `epvAvRatioOperating?: number`;pathA 用它(而非旧 `epvAvRatio`)判 `>= MOAT_STRONG_RATIO`。旧 `epvAvRatio` 保留供披露/对照。

- [ ] **Step 1: 写失败测试**

`moatCap.check.ts` 加:
```ts
// K) GOOGL-like:epvAvRatio(全资产)=1.42<2 但 epvAvRatioOperating(剔现金)=2.3≥2 → pathA 过
{ const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 1.42, epvAvRatioOperating: 2.3,
    declined:false, suppressedFlags:false, roicStable:true, roicLongTermStrong:false });
  assert(r.grade==="strong", "经营资产 EPV/AV≥2 → pathA 放行 strong"); }
// L) 两个比值都<2 且 ROIC 路径不过 → moderate
{ const r = deriveMoatCap({ moat: strongMoat, epvAvRatio: 1.42, epvAvRatioOperating: 1.6,
    declined:false, suppressedFlags:false, roicStable:true, roicLongTermStrong:false });
  assert(r.grade==="moderate", "两比值<2 且无 ROIC 路径 → moderate"); }
```

Run: `cd web && npx tsx src/lib/valuation/moatCap.check.ts` → FAIL

- [ ] **Step 2: 实现 deriveMoatCap pathA + 常量**

`moatCap.ts` `deriveMoatCap` 签名增 `epvAvRatioOperating?: number` 与 `roicLongTermStrong?: boolean`(Task 3 填真值,本 Task 先接参数默认 false)。pathA 改用 `epvAvRatioOperating`(缺失则回退 `epvAvRatio` 兼容):
```ts
const ratioForMoat = epvAvRatioOperating ?? epvAvRatio;
const strongRatio = ratioForMoat != null && ratioForMoat >= MOAT_STRONG_RATIO && moat.dual_test_passed === true;
const franchiseCore = moat.signal === "franchise" && !declined && !suppressedFlags && roicStable === true;
const durablePassed = franchiseCore && (strongRatio || roicLongTermStrong === true);
```
(注:`moat.signal==="franchise"` 已由函数开头 early-return 保证,此处 franchiseCore 显式化以承载双路径。)

- [ ] **Step 3: epvFloor 算 excessCash + epvAvRatioOperating**

`epvFloor.ts` 在 `epvAvRatio` 计算处加:
```ts
const latestRevenue = years.find(y => y.fiscal_year === Math.max(...years.map(y=>y.fiscal_year)))?.revenue;
const excessCashPerShare = (latest.cash != null && latestRevenue != null && shares > 0)
  ? Math.max(0, latest.cash - OPERATING_CASH_PCT * latestRevenue) / shares : 0;
const assetOperating = moatReading.asset_per_share_compared != null
  ? moatReading.asset_per_share_compared - excessCashPerShare : undefined;
const epvAvRatioOperating = (epvMid != null && assetOperating != null && assetOperating > 0)
  ? epvMid / assetOperating : undefined;
```
传入 `deriveMoatCap({ ..., epvAvRatioOperating })`。import `OPERATING_CASH_PCT` from moatCap。

- [ ] **Step 4: 测试通过 + tsc**

Run: `cd web && npx tsc --noEmit && npx tsx src/lib/valuation/moatCap.check.ts && npx tsx src/lib/valuation/epvFloor.check.ts` → 全绿

- [ ] **Step 5: Commit**
```bash
git add web/src/lib/valuation/moatCap.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/moatCap.check.ts
git commit -m "feat(valuation): 经营资产 EPV/AV(剔超额现金)作 strong pathA — 解 GOOGL/META 被现金撑大分母误判

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: ROIC 长期路径 `roicLongTermStrong`(strong pathB)

**Files:**
- Modify: `web/src/lib/valuation/moatCap.ts`(`roicLongTermStrong` + 常量)
- Modify: `web/src/lib/valuation/epvFloor.ts`(调用并传入 deriveMoatCap)
- Test: `web/src/lib/valuation/moatCap.check.ts`

**Interfaces:**
- Consumes: `nopatOf`/`investedCapitalOf`(epvFloor 现有闭包)。
- Produces: `export function roicLongTermStrong(input): boolean` + 常量 `ROIC_MOAT_MIN_YEARS`/`ROIC_MOAT_STRONG`/`ROIC_MOAT_CV`。deriveMoatCap 的 `roicLongTermStrong` 入参接真值。

- [ ] **Step 1: 写失败测试**
```ts
// M) 近8年 ROIC 均值 25% 波动小 → true(GOOGL/META 路径)
{ const years = fyYears(8); const np = new Map(years.map(y=>[y.fiscal_year,25]));
  const r = roicLongTermStrong({ fyYears: years, nopatOf:(y)=>np.get(y.fiscal_year), investedCapitalOf:()=>100 });
  assert(r===true, "ROIC 均值25%>22% 且稳 → strong pathB"); }
// N) ROIC 均值 15%<22% → false
{ const years = fyYears(8); const np = new Map(years.map(y=>[y.fiscal_year,15]));
  const r = roicLongTermStrong({ fyYears: years, nopatOf:(y)=>np.get(y.fiscal_year), investedCapitalOf:()=>100 });
  assert(r===false, "ROIC 均值15%<门槛 → 不过"); }
// O) 均值高但剧烈波动(CV 超阈)→ false(周期股)
{ const years=fyYears(8); const vals=[50,5,45,8,40,6,48,4]; const np=new Map(years.map((y,i)=>[y.fiscal_year,vals[i]]));
  const r = roicLongTermStrong({ fyYears: years, nopatOf:(y)=>np.get(y.fiscal_year), investedCapitalOf:()=>100 });
  assert(r===false, "均值高但 CV 超阈(周期股)→ 不过"); }
// P) 有效年 <ROIC_MOAT_MIN_YEARS → false
{ const years=fyYears(5); const np=new Map(years.map(y=>[y.fiscal_year,25]));
  const r = roicLongTermStrong({ fyYears: years, nopatOf:(y)=>np.get(y.fiscal_year), investedCapitalOf:()=>100 });
  assert(r===false, "<8 有效年 → false(不可评估不放行)"); }
```

Run → FAIL

- [ ] **Step 2: 实现 roicLongTermStrong**

`moatCap.ts`:
```ts
export const ROIC_MOAT_MIN_YEARS = 8;
export const ROIC_MOAT_STRONG = 0.22;   // Task 1 真数据校准
export const ROIC_MOAT_CV = 0.35;
export function roicLongTermStrong(input: {
  fyYears: ValuationFloorYear[];
  nopatOf: (y: ValuationFloorYear) => number | undefined;
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
}): boolean {
  const rs: number[] = [];
  for (const y of input.fyYears) {
    const nopat = input.nopatOf(y); const ic = input.investedCapitalOf(y);
    if (nopat == null || ic == null || !(ic > 0)) continue;
    const roic = nopat / ic;
    if (!Number.isFinite(roic) || Math.abs(roic) > ROIC_SANITY) continue;
    rs.push(roic);
  }
  if (rs.length < ROIC_MOAT_MIN_YEARS) return false;
  const mean = rs.reduce((s,v)=>s+v,0)/rs.length;
  if (!(mean >= ROIC_MOAT_STRONG)) return false;
  const sd = Math.sqrt(rs.reduce((s,v)=>s+(v-mean)**2,0)/rs.length);
  const cv = mean !== 0 ? sd/Math.abs(mean) : Infinity;
  return cv < ROIC_MOAT_CV;
}
```

- [ ] **Step 3: epvFloor 调用 + 传入**
`epvFloor.ts`:`const roicLongStrong = roicLongTermStrong({ fyYears: years, nopatOf, investedCapitalOf });` 传入 `deriveMoatCap({ ..., roicLongTermStrong: roicLongStrong })`。

- [ ] **Step 4: 测试 + tsc**
Run: `cd web && npx tsc --noEmit && npx tsx src/lib/valuation/moatCap.check.ts && npx tsx src/lib/valuation/epvFloor.check.ts` → 全绿

- [ ] **Step 5: Commit**
```bash
git commit -am "feat(valuation): roicLongTermStrong — ROIC长期极高且稳作 strong pathB(Morningstar/Mauboussin主判据)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: 收紧假增长 — cap 四分档 + 金融股识别 + SGR

**Files:**
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts`(cap 四分档 + 常量)
- Modify: `web/src/lib/valuation/moatCap.ts`(`sustainableGrowthRateFinancial`)
- Modify: `web/src/lib/valuation/epvFloor.ts`(`is_financial`/`financial_sgr` 存 floor)
- Modify: `web/src/lib/valuation/fundamentalsToFloorInput.ts`(透传 sector/SIC)
- Modify: `web/src/lib/valuation/types.ts`(`ValuationFloor.is_financial?`/`financial_sgr?`;`ValuationFloorInput.sector?`)
- Test: `web/src/lib/valuation/ownerEarningsDcf.check.ts` + `moatCap.check.ts`

**Interfaces:**
- Consumes: Task 1 结论(sector 识别法 + SGR 可得性)、`floor.moat_cap.grade`、`floor.is_financial`、`floor.financial_sgr`。
- Produces: `g1` 的 `cap` 四分档;`sustainableGrowthRateFinancial`(SGR)或降级常量。

- [ ] **Step 1: 写失败测试(cap 分档)**
```ts
// Q) none 非金融 → cap 5%
// R) moderate → cap 7%
// S) strong → cap 20%
// T) 金融股(is_financial) SGR=4% → cap 4%;SGR 缺失 → 退 5%
```
(按 `deriveOeDcf` 真实签名构造合成 floor,断言 `oeDcf.growth_g1` 在各档下的封顶。)

Run → FAIL

- [ ] **Step 2: sustainableGrowthRateFinancial + 常量**
按 Task 1 结论实现:SGR = ROE(近数年均值 net_income/equity) × 留存率;留存率不可得 → 返 undefined。`moatCap.ts` 加。`GROWTH_CAP_MODERATE=0.07`(原 BASE) + `GROWTH_CAP_NONE=0.05` 到 `ownerEarningsDcf.ts`。

- [ ] **Step 3: fundamentalsToFloorInput 透传 sector + epvFloor 存 is_financial/financial_sgr**
按 Task 1 结论,`fundamentalsToFloorInput` 从 `sec.company` 取 sector/SIC 存入 `ValuationFloorInput.sector`;`computeValuationFloor` 据此算 `is_financial`(SIC 区间/sector 字符串)+ `financial_sgr = sustainableGrowthRateFinancial(...)`,存 `ValuationFloor`。sector 不可得 → `is_financial=false`(退 none 5%)。

- [ ] **Step 4: cap 四分档**
`ownerEarningsDcf.ts:285` 改:
```ts
const grade = floor.moat_cap?.grade;
const cap = grade === "strong" ? GROWTH_CAP_FRANCHISE
  : floor.is_financial ? (floor.financial_sgr != null && floor.financial_sgr > 0 ? Math.min(floor.financial_sgr, GROWTH_CAP_MODERATE) : GROWTH_CAP_NONE)
  : grade === "moderate" ? GROWTH_CAP_MODERATE
  : GROWTH_CAP_NONE;
```

- [ ] **Step 5: 测试 + tsc**
Run: `cd web && npx tsc --noEmit && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts && npx tsx src/lib/valuation/moatCap.check.ts && npx tsx src/lib/valuation/epvFloor.check.ts` → 全绿

- [ ] **Step 6: Commit**
```bash
git commit -am "feat(valuation): cap 四分档收紧假增长(金融SGR/none5%/moderate7%/strong20%)+ 金融股识别

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: ★ 端到端融合测试 + Phase 3 地基回归 + 真数据前后对比

**Files:**
- Create: `web/src/lib/valuation/moatGrowthFusion.check.ts`(新融合断言文件)
- Verify: 真数据全市场 sweep 重跑(临时探针,验后删)

**Interfaces:** Consumes 全链 `computeValuationFloor → deriveOeDcf → deriveValuationVerdict`。Produces 融合断言 + 前后对比报告。

- [ ] **Step 1: 端到端融合断言(合成场景)**

新建 `moatGrowthFusion.check.ts`,用真引擎(`computeValuationFloor`/`deriveOeDcf`/`deriveValuationVerdict`)+ 合成 `ValuationFloorInput` 断言**整条链**:
```ts
// 融合1:GOOGL-like 现金牛(经营资产EPV/AV≥2 或 ROIC路径)→ moat strong → cap 20% →
//        g_used 由 gFund 锁定(非硬顶) → IV=tiers.neutral.per_share 显著>F → verdict bucket 合理
// 融合2:银行-like(is_financial) → cap=SGR/5% → g_used ≤ 5% → IV 抬升受限 → 不进假 below
// 融合3:普通无护城河股 → cap 5%(非7%) → g_used ≤5%
// 每条断言链末端的 deriveValuationVerdict().bucket / inStrikeZone / marginPct 与预期一致
```
证明 moat 改动**正确传导**到 Phase 3 的 IV/bucket,无断链、无 NaN、无口径错配。

- [ ] **Step 2: Phase 3 地基逐位不变回归**

在同文件加断言:构造一个 moat grade **未被本次改动影响**的股(如已是 strong 的 AAPL-like、或已是 none 的普通股),证明其 `deriveValuationVerdict` 的 `bucket/inStrikeZone/marginPct/reliable` 与 Phase 3(本次改动前)**逐位一致**——即 moat 双向修正只影响该变的股,不扰动其余。四闸(`assessReliability`/`isImplausibleBand`)输出不变。

- [ ] **Step 3: 全套 .check.ts 回归**
Run: `cd web && npx tsc --noEmit && for f in src/lib/valuation/*.check.ts; do npx tsx "$f" || exit 1; done`
Expected: 全绿(Phase 3 全部 + 本次新增 moatGrowthFusion + moatCap/ownerEarningsDcf/epvFloor)。

- [ ] **Step 4: 真数据前后对比(需 env 只读)**

写临时 `web/scripts/probe-moat-fusion.ts`(参照现有 probe):
- **放行侧**:GOOGL/META/AAPL/MSFT + 其它现金牛 → 打印 `epvAvRatio / epvAvRatioOperating / roicLongTermStrong / grade / cap / g_used / F / IV / bucket`,确认 GOOGL/META 升 strong(记录哪条路径触发)、IV 合理抬升、无异常。
- **收紧侧**:区域银行(FIBK/FNB/EWBC/HBAN/MTB)+ 保险(ACGL/ALL/CB)+ 炼油(PSX/PARR) → 打印 `is_financial / financial_sgr / cap / g_used(前7% vs 后5%/SGR) / bucket 迁移`,确认退出「便宜」误档。
- **全市场重跑 sweep**(复用/参照之前 probe-market-sweep 逻辑):对比本次改动前后「需警惕」迁档数应显著下降、「正当」占比上升,并检查有无新误判(如某真护城河被误收紧、某垃圾股被误放行)。
- 数据来源标 SEC/生产 Supabase + 2026-07-13。**验后删所有探针**。**若 env 连不上**:如实记录,靠 Step 1–3 合成融合断言兜底,留部署后复验。

- [ ] **Step 5: Commit**
```bash
git add web/src/lib/valuation/moatGrowthFusion.check.ts
git commit -m "test(valuation): moat×增长端到端融合断言 + Phase3 地基逐位不变回归 + 真数据前后对比

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: 终审(moat 修正 + Phase 3 Task 1–5 一起)+ PR

- [ ] **Step 1: 全量门**
Run: `cd web && npx tsc --noEmit && for f in src/lib/valuation/*.check.ts; do echo "== $f"; npx tsx "$f" || exit 1; done` → 全绿

- [ ] **Step 2: 地基护栏终证(逐条对照 Global Constraints)**
人工核 diff:Phase 3 判定改锚/浮动 MOS/四闸/零增长 F/asset_floor 展示——逐位未改(只 moat 改动 + cap 分档);融合链一致。

- [ ] **Step 3: opus 终审(whole-branch review)**
控制器 dispatch 最强模型对**整条分支**(Phase 3 含增长内在值 + Phase 3.5 moat 双向修正)做 whole-branch review。重点:两阶段融合正确性、无放水(GOOGL/META 升 strong 有据、金融/周期收紧到位)、地基未破。Critical/Important 必修。

- [ ] **Step 4: PR(走网页)**
用户非 collaborator:准备 PR 标题/正文(中文,含两阶段=含增长内在值+moat双向修正 + 真数据前后对比证据),提示用户网页开 PR → db-foundation(base 视 Phase 2.5 是否已合)。**部署待办**:合并后跑 `valuation:ingest`(授权)重刷快照面。

---

## Self-Review(plan 对照 spec)

- **spec §4.1 ① 放行双路径** → Task 2(pathA 经营资产EPV/AV)+ Task 3(pathB ROIC长期)✅
- **spec §4.2 ② 收紧 cap 分档** → Task 4 ✅;**§4.3 ③ 数据前置** → Task 1 ✅
- **spec §5 新函数**(roicLongTermStrong/sustainableGrowthRateFinancial/超额现金)→ Task 2/3/4 ✅
- **spec §7 地基护栏 + 用户融合测试硬约束** → Task 5 端到端融合 + Phase3 逐位回归 ✅
- **spec §8 真数据前后对比(放行侧+收紧侧+sweep重跑)** → Task 5 Step 4 ✅
- **类型一致**:`deriveMoatCap` 新入参 `epvAvRatioOperating?`/`roicLongTermStrong?`(Task 2 定义、Task 3 填真值);`ValuationFloor.is_financial?`/`financial_sgr?`(Task 4)= epvFloor 存 = ownerEarningsDcf 消费;`ValuationFloorInput.sector?`(Task 4)= fundamentalsToFloorInput 透传。
- **降级路径闭合**:sector 不可得→is_financial=false→none 5%;SGR 不可得→金融股 5%;ROIC 数据<8年→pathB false(不放行)。均在 Task 1 结论定,Task 4 实现。
- **无占位符**:门槛值(0.22/0.35/5%)Task 1 真数据校准;合成测试数值在 .check.ts 钉。
