# ai_capex 闸解耦(Phase 2.5)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development(推荐)或 superpowers:executing-plans 逐 task 执行。步骤用 checkbox(`- [ ]`)语法追踪。

**Goal:** 把护城河 CAP 从「资本开支两年翻倍」的纯量级闸解耦,改用回报型判据——capex 激增**且**成熟资本上的 ROIC 结构性下滑才降档;GV 归零与 reliable 不动。

**Architecture:** 新增纯函数 `roicTrend`(moatCap.ts,排除最新 2 年 surge 避免自我拆台),在 `computeValuationFloor`(epvFloor.ts)算 `roicDeclining` 并把 `deriveMoatCap` 的 `suppressedFlags` 从 `highLeverage || aiCapexDistortion` 改为 `highLeverage || (aiCapexDistortion && roicDeclining)`。其余一律不动。

**Tech Stack:** TypeScript(严格)、tsx 跑 `.check.ts`(无测试框架,`node:assert` / 自写 assert)、Next 16 RSC(卡片纯呈现)。

## Global Constraints

- **地基禁改(逐位不变)**:`reliable`、买点档 `bucket`、`valueFloor`/`rangeLo`、悲观档、`assessReliability` 及其输入 `floor.ai_capex_distortion_warning`(`epvFloor.ts:201`)。本次**只**改 moat CAP 的 `suppressedFlags` 组成。
- **GV 归零路径不动**:`growthValue.ts:70` 的 `aiCapexDistortion → gated_to_zero` 一字不改。
- **只吃 `fiscal_period=FY` 行**:`roicTrend` 只接调用方已过滤的 FY `years`(见 [[cusip-corruption-episode]] 纪律)。
- **有效性过滤单一来源**:`roicTrend` 复用与 `roicStability` 同款过滤——`investedCapitalOf` 对负/零权益返 undefined;`|ROIC| > ROIC_SANITY(3.0)` 剔除;非有限剔除。
- **常量单一来源**:新常量 `export` 于 moatCap.ts,不双写。
- **文案无买卖/目标价**;en/zh 各自纯本语言。
- **验证门**:`npx tsx <file>.check.ts` 全绿 + `npx tsc --noEmit` 零错。**禁 `next build`**(本机 google fonts 被墙,见 [[local-build-google-fonts-blocked]])。
- 分支 `plan/valuation-aicapex-moat-decouple`,worktree `.claude/worktrees/val-aicapex-decouple`,cwd 跑测试在 `web/`。

---

### Task 1: `roicTrend` 纯函数 + 常量(TDD)

**Files:**
- Modify: `web/src/lib/valuation/moatCap.ts`(新增常量 + `roicTrend`,末尾)
- Test: `web/src/lib/valuation/moatCap.check.ts`(追加断言)

**Interfaces:**
- Consumes: `ValuationFloorYear`(types.ts);`ROIC_SANITY`(moatCap.ts 已存)。
- Produces:
  - `export const ROIC_TREND_LAG = 2`
  - `export const ROIC_TREND_MIN_YEARS = 4`
  - `export const ROIC_TREND_DROP = 0.15`
  - `export function roicTrend(input: { fyYears: ValuationFloorYear[]; investedCapitalOf: (y: ValuationFloorYear) => number | undefined; nopatOf: (y: ValuationFloorYear) => number | undefined; }): "declining" | "stable" | undefined`

- [ ] **Step 1: 追加失败测试到 `moatCap.check.ts`**

在文件末尾 `console.log(process.exitCode ...)` 那行**之前**插入。先在顶部 import 补上 `roicTrend, ROIC_TREND_MIN_YEARS`(与现有 import 同一行合并):

```ts
// ── roicTrend(Phase 2.5:回报型久期闸,排除最新2年 surge) ──────────────────────
// 用固定 IC=100 的合成序列;nopat 映射直接给 ROIC(nopat/100)。fyYears(n) 造 2020..2020+n-1。
function roicYears(nopatByFyDesc: number[]): { years: ValuationFloorYear[]; np: Map<number, number> } {
  // nopatByFyDesc 为 most-recent-first;构造升序 fiscal_year 的 years,np 按 fiscal_year 映射。
  const n = nopatByFyDesc.length;
  const years = Array.from({ length: n }, (_, i) => ({ fiscal_year: 2020 + i })) as ValuationFloorYear[];
  const np = new Map<number, number>();
  years.forEach((y, i) => { np.set(y.fiscal_year, nopatByFyDesc[n - 1 - i]); }); // 升序索引 ↔ most-recent-first 值
  return { years, np };
}
const ic100 = () => 100;

// A) 稳定但最新2年 surge(分母压低)→ 排除后成熟段全稳 → "stable"
{ const { years, np } = roicYears([5, 5, 20, 20, 20, 20]); // most-recent-first:2025,2024 surge;2023..2020 稳
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic100, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === "stable", "roicTrend: 最新2年 surge 被排除,成熟段稳 → stable(不自我拆台)"); }

// B) 成熟段真下滑 → "declining"
{ const { years, np } = roicYears([5, 5, 10, 11, 20, 22]); // 成熟 most-recent-first:0.10,0.11,0.20,0.22
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic100, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === "declining", "roicTrend: 成熟段较新均值 << 较旧均值 → declining"); }

// C) 成熟段 <4 年(总5年,去2 → 3)→ undefined
{ const { years, np } = roicYears([5, 5, 20, 20, 20]);
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic100, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === undefined, "roicTrend: 成熟段<ROIC_TREND_MIN_YEARS → undefined(不可评估→不压)"); }

// D) 成熟段小幅波动(未过阈值)→ "stable"
{ const { years, np } = roicYears([5, 5, 18, 20, 19, 21]); // 成熟 newer 0.19 vs older 0.20,跌幅<15%
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic100, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === "stable", "roicTrend: 成熟段小幅波动未破 ROIC_TREND_DROP → stable"); }

// E) 较旧段均值 ≤ 0(历史即不盈利)→ "stable"(不做负值比值,交给 roicStable/signal 兜)
{ const { years, np } = roicYears([5, 5, -3, -4, -5, -6]);
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic100, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === "stable", "roicTrend: 较旧段 ROIC≤0 → stable(负基不判下滑)"); }

// F) 有效性过滤:一年 IC≤0(投入资本无效)被跳过,不破坏趋势判定
{ const { years, np } = roicYears([5, 5, 20, 20, 20, 20]);
  const ic = (y: ValuationFloorYear) => (y.fiscal_year === 2022 ? undefined : 100); // 跳过一年
  const r = roicTrend({ fyYears: years, investedCapitalOf: ic, nopatOf: (y) => np.get(y.fiscal_year) });
  assert(r === undefined || r === "stable", "roicTrend: 无效年跳过后仍不误报 declining"); }
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/moatCap.check.ts`
Expected: FAIL —— `roicTrend is not a function` / import 报错。

- [ ] **Step 3: 实现 `roicTrend` + 常量(moatCap.ts 末尾)**

```ts
// ── ROIC 趋势闸(Phase 2.5:回报型久期判据) ────────────────────────────────────
export const ROIC_TREND_LAG = 2;        // 排除最新 N 年未成熟投资(与 growthValue.ROIIC_ENDPOINT_LAG 同哲学)
export const ROIC_TREND_MIN_YEARS = 4;  // 成熟序列(去 lag 后)至少 N 年才评估趋势;否则 undefined
export const ROIC_TREND_DROP = 0.15;    // 较新半段均值 < 较旧半段均值 ×(1−此值)判 "declining"

/**
 * 成熟资本上的 ROIC 趋势(Phase 2.5)。capex 激增会立刻抬「投入资本」分母、但回报滞后进 NOPAT
 * 分子 → surge 当年 ROIC 机械性下滑(哪怕投资很好)。故本函数**排除最新 ROIC_TREND_LAG 年**,只看
 * 成熟资本的 ROIC 是否早已在跌,避免把健康烧钱股误判 declining(自我拆台)。有效性过滤同 roicStability。
 */
export function roicTrend(input: {
  fyYears: ValuationFloorYear[];
  investedCapitalOf: (y: ValuationFloorYear) => number | undefined;
  nopatOf: (y: ValuationFloorYear) => number | undefined;
}): "declining" | "stable" | undefined {
  const { fyYears, investedCapitalOf, nopatOf } = input;
  const series: { fy: number; roic: number }[] = [];
  for (const y of fyYears) {
    const ic = investedCapitalOf(y), np = nopatOf(y);
    if (ic == null || np == null || !(ic > 0)) continue;
    const roic = np / ic;
    if (!Number.isFinite(roic) || Math.abs(roic) > ROIC_SANITY) continue;
    series.push({ fy: y.fiscal_year, roic });
  }
  series.sort((a, b) => b.fy - a.fy); // most-recent-first
  const matured = series.slice(ROIC_TREND_LAG); // 丢弃最新 LAG 年未成熟投资
  if (matured.length < ROIC_TREND_MIN_YEARS) return undefined;
  const half = Math.floor(matured.length / 2);
  const newer = matured.slice(0, half);                 // 较新的成熟年
  const older = matured.slice(matured.length - half);   // 较旧的成熟年
  const mean = (xs: { roic: number }[]) => xs.reduce((s, x) => s + x.roic, 0) / xs.length;
  const olderMean = mean(older);
  if (!(olderMean > 0)) return "stable"; // 负/零基不做比值判定(非 franchise,交 roicStable/signal 兜)
  return mean(newer) < olderMean * (1 - ROIC_TREND_DROP) ? "declining" : "stable";
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/moatCap.check.ts`
Expected: PASS —— 末行 `ALL PASS`,含新增 A–F 全 `ok:`。

- [ ] **Step 5: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 零错。

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/valuation/moatCap.ts web/src/lib/valuation/moatCap.check.ts
git commit -m "feat(valuation): roicTrend 回报型久期判据(排除最新2年surge,成熟段判ROIC下滑)"
```

---

### Task 2: 接线到 epvFloor + 地基回归(TDD)

**Files:**
- Modify: `web/src/lib/valuation/epvFloor.ts:158-171`(算 `roicDeclining`,改 `suppressedFlags` 组成)
- Test: `web/src/lib/valuation/epvFloor.check.ts`(追加解耦断言)

**Interfaces:**
- Consumes: `roicTrend`(Task 1);已有的 `nopatOf`/`investedCapitalOf`(epvFloor.ts:151-157);`aiCapexDistortion`/`highLeverage`(epvFloor.ts:137/142)。
- Produces: 行为变化——`floor.moat_cap.grade` 不再被单独的 capex 激增压低。**不新增导出**。

- [ ] **Step 1: 追加失败测试到 `epvFloor.check.ts`**

在 `console.log("epvFloor.check.ts: all assertions passed.");` **之前**插入。fixture 基于已证 franchise 的高毛利 R&D 结构(仿 GROW/AIHOG),6 年,`cash=0` 使 `net_debt=0`→`IC=equity`,ROIC 稳定;`stableSurge` 仅把最新 2 年 capex 抬高触发 ai_capex(不改 equity/op_income → ROIC 与 base 逐位相同)。

```ts
// ── Phase 2.5:capex 激增与护城河 CAP 解耦(回报型判据) ──────────────────────────
{
  // base:6 年高毛利 R&D franchise,capex 平(不翻倍),cash=0 → IC=equity,ROIC 稳定高。
  const mk = (fy: number, oi: number, eq: number, capex: number): ValuationFloorYear => ({
    fiscal_year: fy, revenue: oi / 0.4, operating_margin: 0.4, operating_income: oi, net_income: oi * 0.75,
    effective_tax_rate: 0.15, shareholders_equity: eq, goodwill: 200, intangibles: 100, cash: 0, total_debt: 0,
    net_debt: 0, shares_diluted: 1_000, rd_expense: oi * 0.25, d_and_a: 800, capex, ppe_net: 5_000, working_capital: 1_000,
  });
  // ROIC = 0.85*oi/eq;设成稳定 ~0.30。capex 平(1500 上下,无翻倍)。
  const baseYears: ValuationFloorYear[] = [
    mk(2025, 3_600, 10_200, 1_500), mk(2024, 3_200, 9_100, 1_450), mk(2023, 2_850, 8_100, 1_400),
    mk(2022, 2_550, 7_200, 1_350), mk(2021, 2_250, 6_400, 1_300), mk(2020, 2_000, 5_700, 1_250),
  ];
  const fBase = floorOf(computeValuationFloor({ ticker: "DEC_BASE", years: baseYears }));
  assert.strictEqual(fBase.moat_reading.signal, "franchise", "解耦-base:读 franchise");
  assert.notStrictEqual(fBase.ai_capex_distortion_warning, true, "解耦-base:capex 平,未触发 ai_capex");
  // base 必须 strong-eligible,解耦测试才有意义。若这里读 moderate(epvAvRatio<2),上调 operating_margin
  // 或下调 goodwill+intangibles 直到 franchise+strong(与现有 epvFloor 夹具同款人工校准)。
  assert.strictEqual(fBase.moat_cap.grade, "strong", "解耦-base:稳定高 ROIC franchise → strong/20");

  // surge:仅最新 2 年 capex ×3(4500/1400≈3.2 ≥2)触发 ai_capex;equity/op_income 不变 → ROIC 与 base 逐位同。
  const surgeYears = baseYears.map((y) =>
    y.fiscal_year >= 2024 ? { ...y, capex: 4_500 } : y);
  const fSurge = floorOf(computeValuationFloor({ ticker: "DEC_SURGE", years: surgeYears }));
  assert.strictEqual(fSurge.ai_capex_distortion_warning, true, "解耦-surge:capex 翻倍 → ai_capex 触发(reliable 输入不变)");
  assert.strictEqual(fSurge.moat_cap.grade, "strong", "★解耦:ROIC 稳定时 capex 激增不再降护城河(仍 strong,非 moderate)");
  assert.strictEqual(fSurge.growth_value.gated_to_zero, true, "解耦-surge:GV 归零路径未动(仍 gated)");

  // 地基不变:surge 只该抬中性/乐观上沿,valueFloor(悲观资产底)与 base 逐位相同。
  assert.strictEqual(fSurge.asset_floor.per_share, fBase.asset_floor.per_share, "地基:surge 不改 valueFloor(asset floor per share 不变)");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: FAIL —— `★解耦` 断言报错:现状 `fSurge.moat_cap.grade` 仍是 `"moderate"`(capex 激增被 `suppressedFlags` 压低)。
> 若 `解耦-base ... → strong` 先失败(base 读 moderate),按注释调 fixture 的 margin/goodwill 直到 base 为 strong,再看 `★解耦` 失败——这是本 task 要修的目标。

- [ ] **Step 3: 改 epvFloor 接线**

在 `epvFloor.ts` 顶部 import 补 `roicTrend`(与现有 `deriveMoatCap, roicStability, durabilityDeclined, ...` 同一 import 语句合并)。

`roicStable`(line 158)之后、`deriveMoatCap`(line 165)之前插入:

```ts
  const roicDeclining = roicTrend({ fyYears: years, investedCapitalOf, nopatOf }) === "declining";
```

把 `deriveMoatCap` 调用里的 `suppressedFlags`(line 169)改为:

```ts
    suppressedFlags: highLeverage === true || (aiCapexDistortion === true && roicDeclining),
```

> `highLeverage` 保持独立压制;`aiCapexDistortion` 现只在**同时** ROIC 结构性下滑时才压制。其余入参不动。`floor.ai_capex_distortion_warning`(line 201)不动 → reliable/预期层/买点档不变。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: PASS —— 含新增解耦断言 + **所有既有断言**(尤其第 381-408 行 AI-hog:`growth_value.gated_to_zero===true` 仍绿=GV 未动;BUG1/BUG2 仍绿)。

- [ ] **Step 5: 全套 check + tsc(地基回归)**

Run:
```bash
cd web && for f in src/lib/valuation/*.check.ts; do echo "== $f =="; npx tsx "$f" || echo "FAILED: $f"; done
npx tsc --noEmit
```
Expected: 每个 `.check.ts` 末行自报全绿(`ALL PASS` / `all assertions passed`),无 `FAILED:`;tsc 零错。重点确认 `deriveValuationVerdict.check.ts`、`growthValue.check.ts`、`impliedExpectations.check.ts` 全绿 = reliable/悲观档/预期层未受影响。

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): 护城河CAP解耦capex量级闸,改回报型(aiCapex&&roicDeclining)+地基回归"
```

---

### Task 3: 真引擎抽查(需 env,控制器执行,非 subagent)

**Files:**
- Create: `web/scripts/tmp-aicapex-probe.ts`(一次性探针,验证后删除,不提交)

**Interfaces:**
- Consumes: `getSecCompanyData`、`fundamentalsToFloorInput`、`computeValuationFloor`(同 valuation-ingest.ts 编排);生产 env(`SUPABASE_URL`/`SUPABASE_SERVICE_KEY`)。

> 本 task 需读生产 SEC 基本面,须借一次 env 或本地跑;controller 在 subagent 全绿后执行,**不派 subagent**。目的:确认 §8 那个经验未知——MSFT/GOOGL/META 被降级到底是不是 `aiCapexDistortion` 在起决定作用,并核 `roicTrend` 在真数据上不误报。

- [ ] **Step 1: 写探针脚本**

```ts
// web/scripts/tmp-aicapex-probe.ts —— 一次性,验证后删。
// 跑法:cd web && npx tsx --env-file=<abs path to .env.local> scripts/tmp-aicapex-probe.ts
import { getSecCompanyData } from "@/lib/sec/read";
import { fundamentalsToFloorInput, computeValuationFloor } from "@/lib/valuation";
import { roicTrend, roicStability, durabilityDeclined, ROIC_HURDLE } from "@/lib/valuation/moatCap";

const TICKERS = ["AAPL", "MSFT", "GOOGL", "META", "NVDA", "INTC"]; // INTC/一个 ROIC 真下滑的对照
for (const t of TICKERS) {
  try {
    const sec = await getSecCompanyData(t);
    const input = fundamentalsToFloorInput(t, t, sec.annual, null);
    const floor = computeValuationFloor(input);
    if (!floor || floor.kind !== "floor") { console.log(`${t}: 不可估值`); continue; }
    console.log(`${t}: grade=${floor.moat_cap.grade} cap=${floor.moat_cap.capYears} ` +
      `ai_capex=${floor.ai_capex_distortion_warning ?? false} signal=${floor.moat_reading.signal} ` +
      `dual=${floor.moat_reading.dual_test_passed} roicStable=${floor.moat_cap.roicStable} ` +
      `declined=${durabilityDeclined(input.years)}`);
  } catch (e) { console.log(`${t}: ERR ${(e as Error).message}`); }
}
```

- [ ] **Step 2: 跑探针,人工核对**

Run: `cd web && npx tsx --env-file=<abs .env.local> scripts/tmp-aicapex-probe.ts`
Expected(人工判读,记录到 fix/probe 报告):
- AAPL:仍 `strong/20`(未触 ai_capex,不受本次影响)。
- MSFT/GOOGL/META:`ai_capex=true`。**若** `signal=franchise & dual=true & roicStable=true & declined=false` → 现应升 `strong/20`(解耦生效);**若** 因 `dual=false` 或 `roicStable=false` 或 `epvAvRatio<2` 仍 `moderate` → 如实记录「因别的正当原因仍 moderate,本次对其无可见效果」(也是正确结果)。
- 对照股(ROIC 真结构性下滑者):若 `ai_capex=true`,`roicTrend` 应判 declining → 仍 `moderate`(回报闸生效,证明未放水)。

- [ ] **Step 3: 删探针,不留痕**

```bash
rm web/scripts/tmp-aicapex-probe.ts
```
Expected: `git status` 干净(探针从未提交)。

- [ ] **Step 4: 写核验结论**

把 Step 2 的真数据判读写进 `.superpowers/sdd/probe-report.md`(哪几只真升档、哪几只因别的原因仍 moderate、对照股是否被回报闸正确拦下、`roicTrend` 有无误报),供终审引用。

---

## Self-Review

**Spec coverage:**
- §4 suppressedFlags 改动 → Task 2 Step 3 ✓
- §5 `roicTrend`(排除最新2年 + undefined 处理 + 有效性过滤)→ Task 1(A/C/F 用例)✓
- §6 改动面:moatCap.ts + epvFloor.ts → Task 1/2 ✓。types.ts / 卡片:**经复核无需改**——`MoatCapAssessment` 现有字段够用;卡片 `capDisclosure` strong 文案「ROIC stable over history」在解耦后仍准确(强档仍要求 roicStable),故不动(YAGNI,较 spec §6 收窄,已在本节说明)。
- §7 地基护栏 → Task 2 的 asset_floor 逐位 + 全套 check 回归 ✓
- §8 真引擎抽查 + 经验未知 → Task 3 ✓
- §9 非目标:GV/reliable/预期层/杠杆闸/顺序 均未触 → 各 task Interfaces 明列不动 ✓

**Placeholder scan:** 无 TBD;常量给定具体值;fixture 校准说明为「已知 TDD 迭代」非占位。

**Type consistency:** `roicTrend` 签名在 Task 1 Produces 与 Task 2 Consumes 一致;`"declining"|"stable"|undefined` 与 epvFloor `=== "declining"` 一致;`investedCapitalOf`/`nopatOf` 签名与 epvFloor.ts:151-157 现有一致。

**基础设施说明:** Task 2 fixture 的 `strong` 落地依赖 moat 机器(epvAvRatio≥2/dual_test),已在 Step 2 注明「若 base 读 moderate 则调 margin/goodwill 到 strong」——与现有 epvFloor 夹具同款人工校准,非占位。
