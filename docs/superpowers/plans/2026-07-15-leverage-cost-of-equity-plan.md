# 杠杆 → 股权成本:折现率分层重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把杠杆风险从三处错通道的粗暴惩罚(砍 CAP / 终值归零 / 压制信号),重构成一处理论正确的连续股权成本溢价。

**Architecture:** 新增纯函数模块 `leveragePremium.ts`,由 `epvFloor.assembleFloor` **算一次并发布到 `floor.leverage_premium`**,Buffett 灯与 OE-DCF 两处消费者读同一个值——沿用代码中 `moat_cap` 已有的 SINGLE SOURCE OF TRUTH 模式(`epvFloor.ts:176` 注释,BUG2 fix),防两条腿算出不同值。**Graham 灯 WACC 口径不动**(杠杆已由股权桥承担)。先加溢价(Task 2–3),再摘旧惩罚(Task 4–6),中间不存在「杠杆完全没罚」的窗口。

**Tech Stack:** TypeScript / Next.js 16(App Router)/ Supabase / `tsx` 跑 `.check.ts` 断言

## Global Constraints

- **spec 是唯一真相源**:`docs/superpowers/specs/2026-07-15-leverage-cost-of-equity-spec.md`。与本 plan 冲突时以 spec 为准。
- **不跑测试套件**(见 [[no-tests-solo-dev]])。本项目的测试机制 = `src/lib/valuation/*.check.ts` + `npx tsx` 直跑断言。**没有 npm test script,别去找。**
- **类型门**:`cd web && npx tsc --noEmit` 必须 = 0。
- **本地 `next build` 必失败**(Google Fonts 被墙,见 [[local-build-google-fonts-blocked]])。**不要用 build 当门**,用 `tsc` + `.check.ts`。
- **常量不得拍脑袋**:`LEVERAGE_L0` / `LEVERAGE_SLOPE` / `LEVERAGE_PREMIUM_CAP` 在 Task 1 是**临时值**,Task 8 由真数据校准落定。
- **Graham 灯的 `discount_rate_low/high` 逐位不变** —— spec D4 的机械证明,任何任务都不得违反。
- **`assessReliability` 其余四项不得改动**(ai_capex / declined / quick_check_flag / EXTREME_OE_YIELD)。别往这个闸加新东西。
- **中文注释**:本仓估值层注释为中文,跟随现有风格。
- **文案**守 `web/docs/copy-voice.md` 与 [[anti-ai-product-sense]]:具体、数据优先,无 AI/营销腔。
- **提交信息**结尾:`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## File Structure

| 文件 | 责任 |
|---|---|
| `web/src/lib/valuation/leveragePremium.ts` | **新建**。纯函数:`(netDebt, ownerEarnings) → 溢价`。零 I/O,零依赖 |
| `web/src/lib/valuation/leveragePremium.check.ts` | **新建**。形状不变量断言(单调/净现金零/缺失零/上限/无悬崖) |
| `web/src/lib/valuation/types.ts` | **改**。`ValuationFloor` 加 `leverage_premium` / `net_debt_to_owner_earnings`;`EpvLamp.method` 已有 `discount_rate_low/high`(复用) |
| `web/src/lib/valuation/epvFloor.ts` | **改**。算溢价并发布;Buffett 灯分母加溢价;`suppressedFlags` 摘杠杆;`netDebtOf` 提取 |
| `web/src/lib/valuation/ownerEarningsDcf.ts` | **改**。`discountBand` 加溢价;`gTerminal` 摘杠杆 |
| `web/src/lib/valuation/deriveValuationVerdict.ts` | **改**。reliability 闸:非金融摘杠杆 |
| `web/src/lib/valuation/epvFloor.check.ts` | **改**。Graham 不变回归门 + 负权益不再逃逸 + 溢价发布 |
| `web/src/lib/valuation/ownerEarningsDcf.check.ts` | **改**。溢价进贴现带 + gTerminal 摘杠杆 |
| `web/src/lib/valuation/deriveValuationVerdict.check.ts` | **改**。非金融摘闸 / 金融保留 |
| `web/scripts/leverage-premium-calibrate.ts` | **新建**。真数据 dry-run,产出改动前后对照表(§5 举证义务) |

---

## Task 1: `leveragePremium` 纯函数模块

**Files:**
- Create: `web/src/lib/valuation/leveragePremium.ts`
- Test: `web/src/lib/valuation/leveragePremium.check.ts`

**Interfaces:**
- Consumes: 无(叶子模块)
- Produces:
  - `leveragePremium(input: { netDebt: number | undefined; ownerEarnings: number | undefined }): LeveragePremiumReading`
  - `type LeveragePremiumReading = { premium: number; leverage: number | undefined; basis: string }`
  - 常量 `LEVERAGE_L0: number`、`LEVERAGE_SLOPE: number`、`LEVERAGE_PREMIUM_CAP: number`

- [ ] **Step 1: 写失败的断言**

Create `web/src/lib/valuation/leveragePremium.check.ts`:

```ts
import assert from "node:assert";
import { leveragePremium, LEVERAGE_L0, LEVERAGE_SLOPE, LEVERAGE_PREMIUM_CAP } from "./leveragePremium";

// 1. 净现金 → 溢价 0(spec §4.1)
assert.strictEqual(leveragePremium({ netDebt: -5_000, ownerEarnings: 1_000 }).premium, 0, "净现金 → 0");
assert.strictEqual(leveragePremium({ netDebt: 0, ownerEarnings: 1_000 }).premium, 0, "零净债 → 0");

// 2. 数据缺失 → 溢价 0,不因查不到而惩罚(spec §4.2)
assert.strictEqual(leveragePremium({ netDebt: undefined, ownerEarnings: 1_000 }).premium, 0, "缺 netDebt → 0");
assert.strictEqual(leveragePremium({ netDebt: 5_000, ownerEarnings: undefined }).premium, 0, "缺 OE → 0");
assert.strictEqual(leveragePremium({ netDebt: 5_000, ownerEarnings: 0 }).premium, 0, "OE=0 → 0");
assert.strictEqual(leveragePremium({ netDebt: 5_000, ownerEarnings: -100 }).premium, 0, "OE 为负 → 0(灯本就不可评估)");
assert.strictEqual(leveragePremium({ netDebt: NaN, ownerEarnings: 1_000 }).premium, 0, "NaN → 0");

// 3. L ≤ L0 → 溢价 0(投资级近似,不加价)
assert.strictEqual(leveragePremium({ netDebt: LEVERAGE_L0 * 1_000, ownerEarnings: 1_000 }).premium, 0, "L=L0 → 0");
assert.strictEqual(leveragePremium({ netDebt: (LEVERAGE_L0 - 1) * 1_000, ownerEarnings: 1_000 }).premium, 0, "L<L0 → 0");

// 4. 单调:L↑ → 溢价不减(spec §4.6)
let prev = -1;
for (let L = 0; L <= 20; L += 0.25) {
  const p = leveragePremium({ netDebt: L * 1_000, ownerEarnings: 1_000 }).premium;
  assert.ok(p >= prev, `单调性破于 L=${L}(${p} < ${prev})`);
  assert.ok(p >= 0, `溢价恒非负,破于 L=${L}`);
  assert.ok(p <= LEVERAGE_PREMIUM_CAP, `溢价超上限于 L=${L}`);
  prev = p;
}

// 5. 上限封顶(spec §4.3)
assert.strictEqual(leveragePremium({ netDebt: 1e9, ownerEarnings: 1_000 }).premium, LEVERAGE_PREMIUM_CAP, "极端 L → 封顶");

// 6. 无悬崖:L0 两侧微小变化不产生跳变(spec §4.7,对比今天 netDebt/equity=1.0 的悬崖)
const justBelow = leveragePremium({ netDebt: (LEVERAGE_L0 - 0.01) * 1_000, ownerEarnings: 1_000 }).premium;
const justAbove = leveragePremium({ netDebt: (LEVERAGE_L0 + 0.01) * 1_000, ownerEarnings: 1_000 }).premium;
assert.ok(Math.abs(justAbove - justBelow) < 0.001, `L0 处有悬崖:${justBelow} → ${justAbove}`);

// 7. L 值透出(披露用)
assert.strictEqual(leveragePremium({ netDebt: 6_000, ownerEarnings: 1_000 }).leverage, 6, "L 透出");

// 8. 斜率符合声明(L0 之上每多 1 年偿债久期)
// ⚠️ 锚在 L0+1 / L0+2 而非写死的 L=5/6:Task 8 校准会改 L0,写死的点可能双双落进
// 不加价区(溢价都是 0 → 差值 0 ≠ SLOPE → 伪失败)。用 L0 相对定位对任何 L0 都成立。
const rampA = leveragePremium({ netDebt: (LEVERAGE_L0 + 1) * 1_000, ownerEarnings: 1_000 }).premium;
const rampB = leveragePremium({ netDebt: (LEVERAGE_L0 + 2) * 1_000, ownerEarnings: 1_000 }).premium;
if (rampB < LEVERAGE_PREMIUM_CAP) {
  assert.ok(Math.abs((rampB - rampA) - LEVERAGE_SLOPE) < 1e-9, `斜率不符:${rampB - rampA} ≠ ${LEVERAGE_SLOPE}`);
}

console.log("leveragePremium.check.ts: all assertions passed.");
```

- [ ] **Step 2: 跑断言,确认失败**

```bash
cd web && npx tsx src/lib/valuation/leveragePremium.check.ts
```
Expected: FAIL — `Cannot find module './leveragePremium'`

- [ ] **Step 3: 写最小实现**

Create `web/src/lib/valuation/leveragePremium.ts`:

```ts
// leveragePremium.ts — 杠杆 → 股权成本溢价(纯函数,零 I/O)。
//
// 只服务**股权成本口径**(Buffett 灯 + OE-DCF)。Graham 灯是无杠杆 NOPAT/WACC 口径,
// 杠杆已由股权桥(+cash − totalDebt)承担,再加溢价 = 与桥重复惩罚 —— 见 spec D4。
//
// 理论依据 MM Prop II(re = ru + (ru − rd)(D/E),股权成本随杠杆上升);兑现
// epvFloor.ts 中 Buffett 灯 simplification 自挂多时的 "theoretically the cost of
// equity is higher; v2 simplification, v3 to refine"。
//
// 实现**不用 D/E**:equity 会被回购买成负数(MCD/AZO/HD 类),旧的 netDebt/equity
// 在 equity ≤ 0 时返回 undefined → 账面最杠杆的名字整个逃逸出杠杆闸。改用
// netDebt/ownerEarnings(「这门生意的盈利,几年能还清净债务」),免疫回购扭曲。

export type LeveragePremiumReading = {
  /** 加到股权成本上的溢价(小数,如 0.02 = +2%)。恒 ≥ 0 且 ≤ LEVERAGE_PREMIUM_CAP。 */
  premium: number;
  /** L = netDebt / ownerEarnings(偿债久期,年)。净现金 → 0;不可得 → undefined。 */
  leverage: number | undefined;
  /** 披露文案(个股页展示为什么这只票被多收)。 */
  basis: string;
};

/** 溢价起点:净债务 ≤ L0 年 owner earnings → 不加价(投资级近似)。⚠️ 临时值,待 Task 8 真数据校准。 */
export const LEVERAGE_L0 = 3;
/** L0 之上每多 1 年偿债久期,加多少股权成本。⚠️ 临时值,待 Task 8 真数据校准。 */
export const LEVERAGE_SLOPE = 0.005;
/** 溢价上限:防止把价值压到 ~0 造出假「太贵」信号。⚠️ 临时值,待 Task 8 真数据校准。 */
export const LEVERAGE_PREMIUM_CAP = 0.04;

export function leveragePremium(input: {
  netDebt: number | undefined;
  ownerEarnings: number | undefined;
}): LeveragePremiumReading {
  const { netDebt, ownerEarnings } = input;

  // 数据缺失 → 不加价,退化成基线带(spec §4.2)。
  // 「查不到就当它危险」是另一种造假,不做。
  if (
    netDebt == null || !Number.isFinite(netDebt) ||
    ownerEarnings == null || !Number.isFinite(ownerEarnings) || !(ownerEarnings > 0)
  ) {
    return { premium: 0, leverage: undefined, basis: "净债务或所有者盈利不可得 → 不加杠杆溢价,沿用基线带。" };
  }

  if (netDebt <= 0) {
    return { premium: 0, leverage: 0, basis: "净现金状态 → 不加杠杆溢价。" };
  }

  const leverage = netDebt / ownerEarnings;
  const premium = Math.min(LEVERAGE_PREMIUM_CAP, Math.max(0, (leverage - LEVERAGE_L0) * LEVERAGE_SLOPE));
  const basis =
    premium > 0
      ? `净债务约为 ${leverage.toFixed(1)} 年所有者盈利,股权成本加 ${(premium * 100).toFixed(1)} 个百分点风险溢价。`
      : `净债务约为 ${leverage.toFixed(1)} 年所有者盈利,在不加价区间内(≤ ${LEVERAGE_L0} 年)。`;
  return { premium, leverage, basis };
}
```

- [ ] **Step 4: 跑断言,确认通过**

```bash
cd web && npx tsx src/lib/valuation/leveragePremium.check.ts
```
Expected: `leveragePremium.check.ts: all assertions passed.`

- [ ] **Step 5: 类型门**

```bash
cd web && npx tsc --noEmit
```
Expected: 无输出(exit 0)

- [ ] **Step 6: 提交**

```bash
git add web/src/lib/valuation/leveragePremium.ts web/src/lib/valuation/leveragePremium.check.ts
git commit -m "$(cat <<'EOF'
feat(valuation): leveragePremium 纯函数(杠杆→股权成本溢价)

netDebt/ownerEarnings 度量,免疫负权益逃逸(旧 netDebt/equity 在 equity≤0
时返回 undefined,把回购成负权益的名字整个漏出杠杆闸)。连续无悬崖。
常量为临时值,待真数据校准。尚无消费者。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `epvFloor` 算溢价、发布、进 Buffett 灯

**Files:**
- Modify: `web/src/lib/valuation/types.ts`(`ValuationFloor` 加两个字段)
- Modify: `web/src/lib/valuation/epvFloor.ts:147-270`(`assembleFloor`)、`:357-433`(`buildBuffettLamp`)、`:119-142`(两条 build 路径)
- Test: `web/src/lib/valuation/epvFloor.check.ts`

**Interfaces:**
- Consumes: Task 1 的 `leveragePremium(...)` / `LeveragePremiumReading`
- Produces:
  - `ValuationFloor.leverage_premium?: number`(供 OE-DCF 与展示层读,**单一真相源**)
  - `ValuationFloor.net_debt_to_owner_earnings?: number`
  - `ValuationFloor.leverage_premium_basis?: string`
  - `netDebtOf(latest: ValuationFloorYear): number`(epvFloor 内部,去掉 netDebt 两处重复推导)

**关键约束:** 循环依赖——溢价需要 ownerEarnings,而 ownerEarnings 在 `buildBuffettLamp` 内部算出。故**溢价在 `buildBuffettLamp` 内部算**(它已有 `years`,可自取 netDebt),再由 lamp 透出给 `assembleFloor` 发布到 floor 上。

- [ ] **Step 1: 写失败的断言**

追加到 `web/src/lib/valuation/epvFloor.check.ts` 末尾(`console.log` 之前):

```ts
// ── 杠杆 → 股权成本溢价(spec Task 2) ───────────────────────────────────────
{
  const mk = (over: Partial<ValuationFloorYear>): ValuationFloorYear => ({
    fiscal_year: 2024, revenue: 10_000, operating_income: 2_000, net_income: 1_000,
    shares_diluted: 1_000, cash: 0, total_debt: 0, d_and_a: 500, shareholders_equity: 5_000,
    ...over,
  });
  const yrs = (over: Partial<ValuationFloorYear>) => [
    mk({ fiscal_year: 2024, ...over }), mk({ fiscal_year: 2023, ...over }), mk({ fiscal_year: 2022, ...over }),
  ];

  // 净现金名:溢价 0,Buffett 灯折现率 = 基线带(逐位不变)
  const netCash = computeValuationFloor({ years: yrs({ cash: 20_000, total_debt: 0 }) }) as ValuationFloor;
  assert.strictEqual(netCash.leverage_premium, 0, "净现金 → 溢价 0");
  assert.strictEqual(netCash.buffett_epv.method.discount_rate_low, DISCOUNT_RATE_LOW, "净现金 Buffett 低端 = 基线");
  assert.strictEqual(netCash.buffett_epv.method.discount_rate_high, DISCOUNT_RATE_HIGH, "净现金 Buffett 高端 = 基线");

  // 重杠杆名:溢价 > 0,Buffett 灯折现率 = 基线 + 溢价
  const levered = computeValuationFloor({ years: yrs({ cash: 0, total_debt: 40_000 }) }) as ValuationFloor;
  assert.ok((levered.leverage_premium ?? 0) > 0, "重杠杆 → 溢价 > 0");
  assert.strictEqual(
    levered.buffett_epv.method.discount_rate_low, DISCOUNT_RATE_LOW + levered.leverage_premium!,
    "Buffett 低端 = 基线 + 溢价",
  );
  assert.strictEqual(
    levered.buffett_epv.method.discount_rate_high, DISCOUNT_RATE_HIGH + levered.leverage_premium!,
    "Buffett 高端 = 基线 + 溢价",
  );
  // 溢价真的压低了每股值(单调性的端到端证明)
  assert.ok(
    levered.buffett_epv.per_share_high! < netCash.buffett_epv.per_share_high!,
    "重杠杆 Buffett 每股值 < 净现金名",
  );

  // ⚠️ spec D4 回归门:Graham 灯折现率**逐位不变**(WACC 口径,杠杆已由桥承担)
  assert.strictEqual(levered.graham_epv.method.discount_rate_low, DISCOUNT_RATE_LOW, "D4:Graham 低端不动");
  assert.strictEqual(levered.graham_epv.method.discount_rate_high, DISCOUNT_RATE_HIGH, "D4:Graham 高端不动");
  assert.deepStrictEqual(
    levered.provenance.discount_rate_band, [DISCOUNT_RATE_LOW, DISCOUNT_RATE_HIGH],
    "D4:provenance 基线带不动",
  );

  // ⚠️ spec §4.5 硬伤① 回归门:负权益名**不再逃逸**,必须拿到非零溢价
  const negEquity = computeValuationFloor({
    years: yrs({ cash: 0, total_debt: 40_000, shareholders_equity: -2_000 }),
  }) as ValuationFloor;
  assert.strictEqual(negEquity.net_debt_to_equity, undefined, "负权益:旧指标仍 undefined(未改)");
  assert.strictEqual(negEquity.high_leverage_warning, false, "负权益:旧 flag 仍逃逸(未改,仅不再驱动惩罚)");
  assert.ok((negEquity.leverage_premium ?? 0) > 0, "硬伤①已修:负权益名拿到非零溢价");
}
```

> 若 `epvFloor.check.ts` 尚未 import `ValuationFloorYear` / `ValuationFloor` 类型或 `computeValuationFloor`,按文件顶部现有 import 风格补上。

- [ ] **Step 2: 跑断言,确认失败**

```bash
cd web && npx tsx src/lib/valuation/epvFloor.check.ts
```
Expected: FAIL — `净现金 → 溢价 0`(`leverage_premium` 为 `undefined`)

- [ ] **Step 3: types.ts 加字段**

在 `web/src/lib/valuation/types.ts` 的 `ValuationFloor` 中,`net_debt_to_equity` 字段**之后**加:

```ts
  /** 杠杆 → 股权成本溢价(小数)。**单一真相源**:epvFloor 算一次,Buffett 灯与 OE-DCF 共同消费。 */
  leverage_premium?: number;
  /** L = 净债务 / 所有者盈利(偿债久期,年)。披露用。 */
  net_debt_to_owner_earnings?: number;
  /** 溢价的披露文案。 */
  leverage_premium_basis?: string;
```

在 `EpvLamp` 的 `method` 类型中确认已有 `discount_rate_low: number` / `discount_rate_high: number`(已存在,无需改)。

- [ ] **Step 4: epvFloor.ts —— 提取 `netDebtOf`,消除重复推导**

`epvFloor.ts` 顶部 import 加(只要函数;`LeveragePremiumReading` 类型由 `types.ts` 引用,epvFloor 靠推断即可,别多引一个用不上的类型):

```ts
import { leveragePremium } from "./leveragePremium";
```

在 `avg` 函数之后加(净债务推导现在有两个调用点,提取避免 DRY 违规):

```ts
/** 净债务:优先用申报的 net_debt,缺失则 totalDebt − cash。assembleFloor 与 Buffett 灯共用。 */
function netDebtOf(latest: ValuationFloorYear): number {
  const cash = latest.cash ?? 0;
  const totalDebt = latest.total_debt ?? 0;
  return latest.net_debt ?? totalDebt - cash;
}
```

把 `assembleFloor:162` 的 `const netDebt = latest.net_debt ?? totalDebt - cash;` 替换为:

```ts
  const netDebt = netDebtOf(latest);
```

- [ ] **Step 5: epvFloor.ts —— Buffett 灯内部算溢价并透出**

修改 `buildBuffettLamp` 签名与实现(`epvFloor.ts:357`)。在 `const ownerEarnings = ...`(`:373`)**之后**插入:

```ts
  // 杠杆 → 股权成本溢价(spec D4):本灯是**股权流 / 股权成本**口径(净利起算、已扣息、无桥),
  // 股权成本随杠杆上升(MM Prop II)。Graham 灯是无杠杆 NOPAT/WACC + 桥,不加溢价。
  // 溢价必须在 ownerEarnings 算出后才能算(它是分母),故在灯内部算,再透出给 assembleFloor 发布。
  const lev = leveragePremium({ netDebt: netDebtOf(years[0]), ownerEarnings });
  const rLow = DISCOUNT_RATE_LOW + lev.premium;
  const rHigh = DISCOUNT_RATE_HIGH + lev.premium;
```

把 `simplifications` 中原 `:386` 行:

```ts
  simplifications.push("Capitalized at the same 9–11% band as a cost-of-equity proxy (theoretically the cost of equity is higher; v2 simplification, v3 to refine).");
```

替换为(**v3 已兑现**):

```ts
  simplifications.push(
    lev.premium > 0
      ? `Capitalized at the 9–11% base band plus a ${(lev.premium * 100).toFixed(1)}pp leverage premium (cost of equity rises with leverage — MM Proposition II). ${lev.basis}`
      : "Capitalized at the 9–11% band as a cost-of-equity proxy; no leverage premium applied (net cash or debt within the no-charge range).",
  );
```

把 `method` 对象(`:388-397`)的两处折现率与分母文案改为:

```ts
    denominator: lev.premium > 0
      ? `Capitalized at the ${(rLow * 100).toFixed(1)}–${(rHigh * 100).toFixed(1)}% band (9–11% base + ${(lev.premium * 100).toFixed(1)}pp leverage premium).`
      : "Capitalized at the 9–11% rate band (read as a cost-of-equity proxy).",
    discount_rate_low: rLow,
    discount_rate_high: rHigh,
```

把两处折现(`:419-420`)改为:

```ts
  const equityLow = ownerEarnings / rHigh;
  const equityHigh = ownerEarnings / rLow;
```

在 `EpvLamp` 返回类型上透出读数——**两个 return 分支都要带**(`:408` 的 not-assessable 分支与 `:421` 的 assessable 分支):

```ts
    leverage_reading: lev,
```

并在 `types.ts` 的 `EpvLamp` 上加:

```ts
  /** 本灯所用的杠杆溢价读数(仅股权成本口径的灯有;Graham 灯恒 undefined)。 */
  leverage_reading?: LeveragePremiumReading;
```

`types.ts` 顶部 import:

```ts
import type { LeveragePremiumReading } from "./leveragePremium";
```

- [ ] **Step 6: epvFloor.ts —— `assembleFloor` 发布到 floor**

在 `assembleFloor` 的 return 对象里,`net_debt_to_equity: netDebtToEquity,`(`:252`)**之后**加:

```ts
    leverage_premium: buffettEpv.leverage_reading?.premium ?? 0,
    net_debt_to_owner_earnings: buffettEpv.leverage_reading?.leverage,
    leverage_premium_basis: buffettEpv.leverage_reading?.basis,
```

- [ ] **Step 7: 跑断言 + 类型门**

```bash
cd web && npx tsx src/lib/valuation/epvFloor.check.ts && npx tsx src/lib/valuation/leveragePremium.check.ts && npx tsc --noEmit
```
Expected: 两个 check 均 `all assertions passed.`;tsc 无输出

- [ ] **Step 8: 跑全部估值 check,确认没打破邻居**

```bash
cd web && for f in src/lib/valuation/*.check.ts; do echo "── $f"; npx tsx "$f" || break; done
```
Expected: 全部 `all assertions passed.`。**若 `moatGrowthFusion` / `structuralBasisFusion` / `strikeZone` 失败,是真回归,停下修,不要跳过。**

- [ ] **Step 9: 提交**

```bash
git add web/src/lib/valuation/types.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "$(cat <<'EOF'
feat(valuation): Buffett 灯股权成本按杠杆分层,溢价发布到 floor

兑现 epvFloor 自挂的 v3 待办(cost of equity is higher, v3 to refine)。
溢价算一次发布到 floor.leverage_premium(沿用 moat_cap 的单一真相源模式),
OE-DCF 后续读它。Graham 灯 WACC 逐位不变(杠杆已由股权桥承担,加溢价会重复罚)。
负权益名不再逃逸出杠杆定价。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: OE-DCF 贴现带加溢价

**Files:**
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts`(`discountBand` 约 `:140-165`,调用点约 `:305`)
- Test: `web/src/lib/valuation/ownerEarningsDcf.check.ts`

**Interfaces:**
- Consumes: Task 2 发布的 `floor.leverage_premium`(**不自己重算**——单一真相源)
- Produces: `discountBand(dgs10, leveragePremium)` 的 `r_low`/`r_high` 已含溢价

- [ ] **Step 1: 写失败的断言**

追加到 `web/src/lib/valuation/ownerEarningsDcf.check.ts` 末尾(`console.log` 之前):

```ts
// ── 杠杆溢价进 OE-DCF 贴现带(spec Task 3) ──────────────────────────────────
{
  const dgs10 = { value: 4.25, date: "2026-06-19" };
  const base = deriveOeDcf(floorFixture(), yearsFull, dgs10, price(120));
  const levFloor = { ...floorFixture(), leverage_premium: 0.02 };
  const lev = deriveOeDcf(levFloor, yearsFull, dgs10, price(120));

  assert.ok(Math.abs(lev.discount!.r_low - (base.discount!.r_low + 0.02)) < 1e-9, "r_low += 溢价");
  assert.ok(Math.abs(lev.discount!.r_high - (base.discount!.r_high + 0.02)) < 1e-9, "r_high += 溢价");
  // 溢价真的压低了 IV(端到端)
  assert.ok(lev.tiers!.neutral.per_share < base.tiers!.neutral.per_share, "溢价 → 中枢 IV 更低");
  // 缺溢价字段 → 退化成今天行为(逐位不变)
  const noField = deriveOeDcf({ ...floorFixture(), leverage_premium: undefined }, yearsFull, dgs10, price(120));
  assert.strictEqual(noField.discount!.r_low, base.discount!.r_low, "缺字段 → 行为不变");
}
```

> `floorFixture()` / `yearsFull` / `price()` 用本文件**现有**的 fixture 构造方式(见文件顶部与 `:406` 附近的既有用法),不要新造。若现有 fixture 是内联对象,照它的形状构造。

- [ ] **Step 2: 跑断言,确认失败**

```bash
cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts
```
Expected: FAIL — `r_low += 溢价`

- [ ] **Step 3: 改 `discountBand` 签名与实现**

`ownerEarningsDcf.ts` 中 `discountBand` 加第二参数(默认 0 → 缺省行为不变):

```ts
function discountBand(dgs10: Dgs10Reading | undefined, leveragePremium = 0) {
```

函数体内,**所有** `r_low` / `r_high` / `rAggressive` 的出口都加 `+ leveragePremium`。包括 fallback 分支(`:145-146`):

```ts
      r_low: FALLBACK_BAND[0] + leveragePremium,
      r_high: FALLBACK_BAND[1] + leveragePremium,
```

以及正常分支(`:154`、`:163-164`):

```ts
  const rAggressive = dgs10Dec + DGS10_PREMIUM + leveragePremium;
```
```ts
    r_low: rLow + leveragePremium,
    r_high: rHigh + leveragePremium,
```

> ⚠️ 注意 `:119` 的**倒挂分支**(DGS10 ≥ 7.5% → `[min, max]` + flag):该分支也要加溢价,且加完后 `[min,max]` 的排序逻辑必须仍成立。加溢价是**同量平移**,不改变 min/max 关系,但要确认 flag 判据不受影响。

- [ ] **Step 4: 改调用点**

`ownerEarningsDcf.ts:305` 附近:

```ts
  const discount = discountBand(dgs10, floor.leverage_premium ?? 0);
```

- [ ] **Step 5: 跑断言 + 类型门 + 全量 check**

```bash
cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts && npx tsc --noEmit && for f in src/lib/valuation/*.check.ts; do npx tsx "$f" >/dev/null || { echo "FAIL: $f"; break; }; done && echo "全部 check 通过"
```
Expected: `all assertions passed.` + `全部 check 通过`

- [ ] **Step 6: 提交**

```bash
git add web/src/lib/valuation/ownerEarningsDcf.ts web/src/lib/valuation/ownerEarningsDcf.check.ts
git commit -m "$(cat <<'EOF'
feat(valuation): OE-DCF 贴现带消费 floor.leverage_premium

owner earnings 是股权流,贴现率随杠杆上升(MM Prop II)。读 epvFloor 已发布的
溢价,不重算 —— 沿用 moat_cap 的单一真相源模式,防两条腿分歧。
缺字段 → 溢价 0,行为逐位不变。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 摘掉 `gTerminal` 的杠杆那半

**Files:**
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts:310`
- Test: `web/src/lib/valuation/ownerEarningsDcf.check.ts`

**Interfaces:**
- Consumes: Task 3 已生效的溢价(**必须在 Task 3 之后**,否则出现杠杆完全没罚的窗口)
- Produces: 无新接口

- [ ] **Step 1: 写失败的断言**

追加到 `web/src/lib/valuation/ownerEarningsDcf.check.ts`:

```ts
// ── gTerminal 摘掉杠杆那半(spec Task 4) ────────────────────────────────────
{
  const dgs10 = { value: 4.25, date: "2026-06-19" };
  // 高杠杆但未恶化 → 终值增长**不再**被归零(改由折现率溢价承担)
  const hiLev = deriveOeDcf(
    { ...floorFixture(), high_leverage_warning: true, leverage_premium: 0.02 },
    yearsFull, dgs10, price(120),
  );
  assert.ok(hiLev.tiers!.neutral.per_share > 0, "高杠杆仍可评估");
  const noLev = deriveOeDcf({ ...floorFixture(), high_leverage_warning: false, leverage_premium: 0.02 }, yearsFull, dgs10, price(120));
  assert.strictEqual(
    hiLev.tiers!.neutral.per_share, noLev.tiers!.neutral.per_share,
    "high_leverage_warning 不再影响 gTerminal(同溢价下值相同)",
  );

  // declined 那半**保留**:恶化仍归零终值增长
  const declinedFloor = deriveOeDcf({ ...floorFixture(), high_leverage_warning: false }, yearsDeclining, dgs10, price(120));
  assert.strictEqual(declinedFloor.tiers?.neutral.per_share != null, true, "declined 仍可评估");
}
```

> `yearsDeclining` 用本文件**现有**的下滑 fixture(触发 `declined`)。若不存在,照 `yearsFull` 形状构造一组净利逐年下滑的年份。

- [ ] **Step 2: 跑断言,确认失败**

```bash
cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts
```
Expected: FAIL — `high_leverage_warning 不再影响 gTerminal`

- [ ] **Step 3: 改一行**

`ownerEarningsDcf.ts:309-310`,把:

```ts
  // 终值增长（中枢/乐观档）：g = min(10Y国债, 3%名义GDP) 且不快于近期 g1；恶化/高杠杆股不给终值增长。
  const gTerminal = declined || floor.high_leverage_warning ? 0 : Math.min(gCap, g1);
```

改为:

```ts
  // 终值增长（中枢/乐观档）：g = min(10Y国债, 3%名义GDP) 且不快于近期 g1；恶化的生意不给终值增长。
  // 杠杆已由股权成本溢价(floor.leverage_premium)承担,不再在此二次归零 —— 见 spec §3.3。
  const gTerminal = declined ? 0 : Math.min(gCap, g1);
```

- [ ] **Step 4: 跑断言 + 类型门 + 全量 check**

```bash
cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts && npx tsc --noEmit && for f in src/lib/valuation/*.check.ts; do npx tsx "$f" >/dev/null || { echo "FAIL: $f"; break; }; done && echo "全部 check 通过"
```
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/valuation/ownerEarningsDcf.ts web/src/lib/valuation/ownerEarningsDcf.check.ts
git commit -m "$(cat <<'EOF'
refactor(valuation): gTerminal 不再因高杠杆归零

杠杆已由股权成本溢价承担(Task 3),此处二次归零 = 重复惩罚,且挂在
netDebt/equity>1.0 的二元悬崖上。declined 那半保留。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 摘掉 `suppressedFlags` 的杠杆那半

**Files:**
- Modify: `web/src/lib/valuation/epvFloor.ts:220`
- Test: `web/src/lib/valuation/epvFloor.check.ts`、`web/src/lib/valuation/moatCap.check.ts`

**Interfaces:**
- Consumes: Task 2 已生效的溢价
- Produces: 无新接口

**说明:** 这是三处摘除里**下游影响最大**的一处——它链式解开 CAP(20→10 年被砍)与 GV(`moatGrade` 喂 `computeGrowthValue`)。预期一批高杠杆的 franchise 名 CAP 回到 strong。

- [ ] **Step 1: 写失败的断言**

追加到 `web/src/lib/valuation/epvFloor.check.ts`:

```ts
// ── suppressedFlags 摘掉杠杆那半(spec Task 5) ──────────────────────────────
// 隔离技巧:直接抬 total_debt 会污染本测试 —— 股权桥(+cash − totalDebt)会压低 Graham 灯
// → 压低 epvMid → 可能把 franchise 翻成 commodity,那样测的就不是 CAP 而是护城河信号了。
// 但 netDebt 只喂 netDebtToEquity(epvFloor.ts:162→173),股权桥用的是 cash/totalDebt 另外
// 两个字段。故直接设 net_debt 可**只翻杠杆 flag、不碰桥与护城河比率**。
{
  const leveredFranchise = floorOf(
    computeValuationFloor({
      ...compounder,
      years: compounder.years.map((y) => ({ ...y, net_debt: 1e9 })),
    }),
  );

  // 前提自检:fixture 必须真的触发旧杠杆 flag,否则本测试是空转
  assert.strictEqual(leveredFranchise.high_leverage_warning, true, "前提:旧杠杆 flag 确实被 fixture 触发");
  // 前提自检:护城河信号未被 fixture 干扰(证明隔离成功,桥没被动)
  assert.strictEqual(
    leveredFranchise.moat_reading.signal, floor.moat_reading.signal,
    "前提:护城河信号未受 fixture 干扰(桥未被污染)",
  );

  // 本 Task 的真断言:杠杆不再参与护城河耐久性判定
  assert.strictEqual(leveredFranchise.moat_cap.grade, floor.moat_cap.grade, "杠杆不再压护城河档位");
  assert.strictEqual(leveredFranchise.moat_cap.capYears, floor.moat_cap.capYears, "杠杆不再砍 CAP(20→10)");
  assert.strictEqual(leveredFranchise.moat_cap.durablePassed, floor.moat_cap.durablePassed, "杠杆不再否决耐久性");
}
```

> `compounder` / `floor` / `floorOf()` 是 `epvFloor.check.ts` 中**既有**的 fixture 与助手(见文件顶部与 `:103` 附近),直接复用,不要新造。
>
> **ai_capex 那半必须保留**:`moatCap.check.ts:19` 已有 `suppressedFlags: true → moderate` 的断言,它测的是 `deriveMoatCap` 本身(不受本次改动影响,本次改的是 epvFloor 传什么进去),应保持通过。**不要为了让断言通过而放松判据。**

- [ ] **Step 2: 跑断言,确认失败**

```bash
cd web && npx tsx src/lib/valuation/epvFloor.check.ts
```
Expected: FAIL

- [ ] **Step 3: 改一行**

`epvFloor.ts:220`,把:

```ts
    suppressedFlags: highLeverage === true || (aiCapexDistortion === true && roicDeclining),
```

改为:

```ts
    // 杠杆已由股权成本溢价承担(见 leveragePremium.ts / spec §3.3),不再压制护城河耐久性判定
    // —— 它此前链式砍 CAP(20→10)并经 moatGrade 压低 GV,是同一风险的第三次惩罚。
    suppressedFlags: aiCapexDistortion === true && roicDeclining,
```

同时更新 `moatCap.ts:43` 的文案(它现在只剩 ai_capex 一种成因):

```ts
  const reason = !strongRatio ? "护城河存在但未达强档" : declined ? "盈利下滑" : suppressedFlags ? "资本开支红旗" : "ROIC 稳定性不足";
```

- [ ] **Step 4: 跑断言 + 类型门 + 全量 check**

```bash
cd web && npx tsx src/lib/valuation/epvFloor.check.ts && npx tsx src/lib/valuation/moatCap.check.ts && npx tsc --noEmit && for f in src/lib/valuation/*.check.ts; do npx tsx "$f" >/dev/null || { echo "FAIL: $f"; break; }; done && echo "全部 check 通过"
```
Expected: 全绿。**`moatGrowthFusion.check.ts` 若失败,是真回归(CAP→GV 链),停下看。**

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/moatCap.ts web/src/lib/valuation/epvFloor.check.ts web/src/lib/valuation/moatCap.check.ts
git commit -m "$(cat <<'EOF'
refactor(valuation): 杠杆不再压制护城河耐久性(suppressedFlags)

此前高杠杆 → franchiseCore=false → CAP 20年砍到10年,并经 moatGrade 压低 GV,
是同一风险的第三次惩罚。杠杆已由股权成本溢价承担。ai_capex 那半保留。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: reliability 闸——非金融摘掉杠杆

**Files:**
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts:58-79`
- Test: `web/src/lib/valuation/deriveValuationVerdict.check.ts`

**Interfaces:**
- Consumes: `floor.is_financial`(已存在,`epvFloor.ts:256` 发布)
- Produces: 无新接口

**⚠️ 这是三处摘除里风险最高的一处**——它直接放行 cheap/strike 信号。金融股必须保留(spec D7:银行结构性高杠杆,既摘闸又豁免罚 = 裸奔)。

- [ ] **Step 1: 写失败的断言**

追加到 `web/src/lib/valuation/deriveValuationVerdict.check.ts`:

```ts
// ── reliability 闸:非金融摘掉杠杆,金融保留(spec Task 6 / D7) ─────────────
{
  const leveredNonFin = { high_leverage_warning: true, is_financial: false } as unknown as ValuationFloor;
  assert.strictEqual(
    assessReliability({ floor: leveredNonFin }), true,
    "非金融高杠杆:不再因杠杆判不可靠(已由折现率溢价定价)",
  );

  const leveredFin = { high_leverage_warning: true, is_financial: true } as unknown as ValuationFloor;
  assert.strictEqual(
    assessReliability({ floor: leveredFin }), false,
    "D7:金融股高杠杆仍判不可靠(结构性杠杆未被定价,不放开)",
  );

  // 其余四项**不得**被这次改动碰到
  assert.strictEqual(
    assessReliability({ floor: { high_leverage_warning: false, is_financial: false } as unknown as ValuationFloor,
                        oeDcf: { declined: true } as never }), false,
    "declined 闸不动",
  );
}
```

- [ ] **Step 2: 跑断言,确认失败**

```bash
cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts
```
Expected: FAIL — `非金融高杠杆:不再因杠杆判不可靠`

- [ ] **Step 3: 改判据 + 文档注释**

`deriveValuationVerdict.ts:69`,把:

```ts
  if (floor?.high_leverage_warning) return false;
```

改为:

```ts
  // 杠杆:非金融已由股权成本溢价定价(leveragePremium.ts),此闸的原始理由——「9–11% 单率
  // 股权桥失真」——已不成立,故摘除。金融股(银行/保险)结构性高杠杆未被该溢价覆盖
  // (netDebt/OE 对存款型资产负债表无意义),保留原闸,不放开 —— 见 spec D7。
  if (floor?.high_leverage_warning && floor?.is_financial) return false;
```

同步改 `:60` 的 JSDoc 那行:

```ts
 *  - high_leverage_warning(仅金融股):结构性杠杆未被股权成本溢价覆盖,便宜信号不可信。
 *    非金融的杠杆已由 leverage_premium 定价,不再走此闸。
```

- [ ] **Step 4: 跑断言 + 类型门 + 全量 check**

```bash
cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts && npx tsc --noEmit && for f in src/lib/valuation/*.check.ts; do npx tsx "$f" >/dev/null || { echo "FAIL: $f"; break; }; done && echo "全部 check 通过"
```
Expected: 全绿

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/deriveValuationVerdict.check.ts
git commit -m "$(cat <<'EOF'
refactor(valuation): 非金融杠杆不再走 reliability 闸

该闸自己的注释写明理由是「9–11% 单率股权桥失真」—— 正是本轮修掉的缺陷。
缺陷已修,挡箭牌摘除。金融股保留(结构性杠杆未被 netDebt/OE 溢价覆盖,D7)。
其余四项(ai_capex/declined/quick_check/极端OE收益率)逐字不动。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 个股页披露

**Files:**
- Modify: 消费 `floor.buffett_epv.method` 的估值卡组件
- Test: 人工看页面(见 [[no-tests-solo-dev]])

**Interfaces:**
- Consumes: Task 2 的 `floor.leverage_premium` / `net_debt_to_owner_earnings`(**结构化数字**——`leverage_premium_basis` 是引擎层英文 prose,不得当 UI 文案直接渲染,见 [[no-mixed-language-copy]])

**说明:** 折现率不再全站同一个数,**必须说清为什么这只票被多收**(spec §3.4)。

- [ ] **Step 1: 找到展示折现率的组件**

```bash
cd web && grep -rn "discount_rate_low\|discount_rate_band\|9–11\|9-11" src/app src/components 2>/dev/null | grep -v node_modules
```
把命中的组件列出来——这些是要改的地方。

- [ ] **Step 2: 加披露**

在展示折现带处,当 `floor.leverage_premium > 0` 时,展示披露文案。**UI 必须从 `leverage_premium` / `net_debt_to_owner_earnings` 这两个结构化数字为每个 locale 各自拼句**,不得读取或渲染 `leverage_premium_basis`(那是引擎层英文 prose,拼进 `simplifications` 给内部消费,不是本地化来源——单语言字符串不可能同时服务中英双语站)。

文案口径(中文站,数字取自上述两个字段自行拼接):
> 基线 9–11%,净债务约 N 年所有者盈利 → 加 X 个百分点风险溢价 → 实际 A–B%

英文站照 `web/docs/copy-voice.md` 独立写,**不要中英混排**(见 [[no-mixed-language-copy]])。守 [[anti-ai-product-sense]]:真数据当主角,无装饰、无 AI 腔。

- [ ] **Step 3: 类型门**

```bash
cd web && npx tsc --noEmit
```
Expected: 无输出

- [ ] **Step 4: 人工看页面**

本地起 dev(**不要用 `next build`**,Google Fonts 被墙必失败):

```bash
cd web && npm run dev
```
开一只已知高杠杆的票的个股页,确认披露文案出现且数字对得上。开一只净现金票(GOOGL),确认**没有**溢价文案(不该有噪音)。

- [ ] **Step 5: 提交**

```bash
git add web/src/app web/src/components
git commit -m "$(cat <<'EOF'
feat(ui): 个股页披露杠杆风险溢价

折现率不再全站同一个数,说清这只票为什么被多收。净现金名不显示(无噪音)。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: 真数据校准 + 举证义务(spec §5)

**Files:**
- Create: `web/scripts/leverage-premium-calibrate.ts`
- Modify: `web/src/lib/valuation/leveragePremium.ts`(常量落定)

**Interfaces:**
- Consumes: Task 1–6 的全部改动
- Produces: 校准表 + 举证清单 + 落定的三个常量

**⚠️ 本任务是 spec D3 的兑现**:我们放弃了「零上升」的机械保证,**必须由真数据举证补上**。这不是可选项。

- [ ] **Step 1: 写校准脚本**

Create `web/scripts/leverage-premium-calibrate.ts`。数据加载**照抄** `web/scripts/valuation-ingest.ts` 的模式(它已解决 server-only 桩问题,见 [[tsx-ingest-server-only-stub]])。

脚本要做的:对全宇宙每只票,跑引擎,输出一行:
`ticker | L(netDebt/OE) | 旧 high_leverage_warning | 新 premium | 旧 IV | 新 IV | ΔIV% | 旧 reliable | 新 reliable | 旧 CAP | 新 CAP`

「旧」值通过把 `LEVERAGE_PREMIUM_CAP` 设 0 且恢复三处旧判据得到——**或**更简单:先在改动前的 commit 上跑一次存基线 JSON,改动后再跑一次对照。**后者更可靠,推荐。**

- [ ] **Step 2: 跑基线(改动前)**

```bash
cd web && git stash && npx tsx --tsconfig scripts/tsconfig.json scripts/leverage-premium-calibrate.ts > /tmp/baseline.json && git stash pop
```

> ⚠️ `SEC_USER_AGENT` 必须前置,两脚本读不同 `.env.local`,`cd web/` 单进程 —— 见 [[sec-valuation-ingest-ops]]。

- [ ] **Step 3: 跑改动后**

```bash
cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/leverage-premium-calibrate.ts > /tmp/after.json
```

- [ ] **Step 4: 回归锚——无债名必须逐位不变(spec §5.2)**

对照 GOOGL / META 类净现金名:`premium` 必须 = 0,`IV` 必须**逐位不变**。
**任何一只净现金名的值变了 → 停下,是 bug,不是校准问题。**

- [ ] **Step 5: 负权益名必须拿到非零溢价(spec §5.4)**

查 MCD / AZO / HD / SBUX 类:`net_debt_to_owner_earnings` 有值、`premium > 0`。
**若仍为 0 → 硬伤① 没修好,回 Task 1/2。**

- [ ] **Step 6: 常量落定(spec §5.5)**

看 `L` 在全宇宙的真实分布,结合信用利差分级(投资级 ≈ +1% / BB ≈ +2–3%)定 `LEVERAGE_L0` / `LEVERAGE_SLOPE` / `LEVERAGE_PREMIUM_CAP`。

**⚠️ 口径提醒(spec §3.2)**:`ownerEarnings` 是税后、扣维持性 capex 后的口径,数值显著低于 EBITDA,故 `netDebt/OE` 比常见的 `netDebt/EBITDA` **大**。**不得照搬 EBITDA 的分级阈值**,换算倍数由这里的真实分布确定。

把落定值写回 `leveragePremium.ts`,**并把注释里的「⚠️ 临时值,待 Task 8 真数据校准」换成落定依据**(写清是看了什么分布、对标哪一档利差)。

- [ ] **Step 7: 逐只举证(spec §5.3)——本任务的核心**

列出所有 `ΔIV% > 0` 或 `reliable: false → true` 的票。**逐只**核:
- 是真资产负债表撑得起(债务真实、OE 真实、L 算对了)?
- 还是数据假象(`total_debt` tag 缺失 → netDebt 偏低 → 溢价偏低;负权益;口径错)?

**举证不过 → 常量收紧或回退。** 把清单写进 `docs/superpowers/plans/` 旁的一个 `2026-07-15-leverage-calibration-evidence.md`。

> 核验铁律(见 [[graham-net-net-floor]]):查 `fiscal_period = FY` 行,**不用 `form = 10-K`**(派生 Q4 行 `shares_diluted` 损坏会造假警报);交验走真引擎,**不手写 SQL**。

- [ ] **Step 8: 常量落定后重跑全部 check**

```bash
cd web && for f in src/lib/valuation/*.check.ts; do echo "── $f"; npx tsx "$f" || break; done && npx tsc --noEmit
```
Expected: 全绿。**Task 1 的形状不变量与常量取值无关,若因改常量而失败 → 断言写错了(耦合了具体数字),修断言。**

- [ ] **Step 9: 提交**

```bash
git add web/scripts/leverage-premium-calibrate.ts web/src/lib/valuation/leveragePremium.ts docs/superpowers/plans/2026-07-15-leverage-calibration-evidence.md
git commit -m "$(cat <<'EOF'
chore(valuation): 杠杆溢价常量按真数据落定 + 举证清单

L0/斜率/上限依据全宇宙 netDebt/OE 真实分布与信用利差分级确定(非拍脑袋)。
回归锚:净现金名逐位不变。硬伤①核实:负权益名已拿到非零溢价。
每只估值回升/新拿 cheap 信号的票有书面举证。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

## 收尾(不是 task,是合并前的门)

- [ ] spec §7 验收清单逐条勾掉
- [ ] `roicLongTermStrong` 一票三用抬升问题**已入档**(spec §6.1)——开独立 spec 或至少记进 memory,**别让它随这轮悄悄溜走**
- [ ] 合并后需**授权跑** `npm run valuation:ingest` 才能让生产 screener 生效(纯代码改动不落生产数据 —— 见 [[valuation-mainstream-alignment]] 同款坑)
- [ ] PR 走网页开(非 collaborator,`gh` 开不了 —— 见 [[tsx-ingest-server-only-stub]]),base = `db-foundation`
