# 估值引擎主流对齐 v3 · Phase A 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把估值引擎三处对齐主流正确算法——OE-DCF 终值改带上限 Gordon 带宽、Net-Net 拆⅔双层、SBC 补"回购≠回馈"披露——全为零新数据依赖的纯函数改动。

**Architecture:** 三条独立改动，各自 `.check.ts` 断言 + `tsc` 类型门。A1 在现有三档 tier 结构内把终值增长率参数化（悲观档保留零增长作安全边际底，中枢/乐观档用封顶 Gordon）；A2 把单一 net-net 触发拆成"资产底信号(全额 NCAV)"与"买入线(⅔ NCAV)"两个判定；A3 只加一个披露布尔，不动 owner-earnings 计算。

**Tech Stack:** TypeScript (Next.js 16 项目 web/), 纯函数引擎在 `web/src/lib/valuation/`, 自检为 `*.check.ts`（`node:assert` + `tsx` 直跑）。

## Global Constraints

- 分支：`feat/valuation-mainstream-alignment`（本 worktree，基于 db-foundation）。
- 验证：改引擎文件必同步改对应 `.check.ts`；运行 `cd web && npx tsx src/lib/valuation/<name>.check.ts`；类型门 `cd web && npx tsc --noEmit`（本机 Google Fonts 被屏蔽，禁 `next build`，见 memory）。
- 文案纪律：UI 每个 locale 纯本语言，禁中英混排；禁 advice/target-price 词元（`buy`/`sell`/`hold`/`target price`/`rating`/`recommend`）——OE-DCF 与 verdict 输出有 compliance 断言扫描，新增文案不得引入这些词元。注意 A2 的英文 net-net 文案含 "buy" 词——**只入 UI 组件（EarningsPowerFloorCard.tsx），不得进入引擎序列化输出**（引擎侧只出布尔/数字，词元扫描在引擎测试里）。
- 每股口径 USD；股数用摊薄（`shares_diluted`）。
- 每个 Task 末尾 commit。

---

### Task 1: A1 — OE-DCF 终值 Gordon 带宽

**Files:**
- Modify: `web/src/lib/valuation/types.ts`（`OeDcfAssessment` 加两字段）
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts`（常量 + `dcfTier`/`tierValues` 加 `gTerminal` 参 + `deriveOeDcf` 计算 gTerminal）
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx:87,119`（`oeDcfCompact` 文案）
- Test: `web/src/lib/valuation/ownerEarningsDcf.check.ts`

**Interfaces:**
- Consumes: `ValuationFloor.buffett_epv`（`normalized_earnings`, `per_share_low`, `equity_value_low`, `method.years_used`）、`ValuationFloor.high_leverage_warning`、`DiscountBandProvenance`（现有 `dgs10_value`, `midpoint`, `r_low`, `r_high`）。
- Produces: `OeDcfAssessment` 新增 `terminal_growth?: number`（中枢档实际 g）、`terminal_method?: "gordon_capped" | "zero_growth"`。`per_share_low` 仍 = 悲观档（零增长底，值不变）、`per_share_high` = 乐观档（Gordon 抬升）。

- [ ] **Step 1: 写失败测试**（追加到 `ownerEarningsDcf.check.ts`，紧接现有 §13 块之后、`function oeStub` 之前）

```ts
// ── A1. 终值 Gordon 带宽 ──────────────────────────────────────────────────────
// 14) 上升净利 + reliable → 中枢/乐观档用封顶 Gordon；悲观档保持零增长底不变。
{
  // net income 100→133.1 FY2021→2024 = 10% CAGR；DGS10 4.25% → gCap=min(0.03,0.0425)=0.03，g1=0.10 → gTerminal=0.03
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4.25, date: "2026-06-19" }, price(120));
  assert.ok(r.assessable, "assessable");
  assert.strictEqual(r.terminal_method, "gordon_capped", "reliable growth → gordon terminal");
  assert.ok(Math.abs(r.terminal_growth! - 0.03) < 1e-9, `terminal g capped at 3% GDP, got ${r.terminal_growth}`);
  // 悲观档仍是零增长底：per_share_low 应等于零增长口径(OE₀ 恒定 → 每股 = 悲观档 equity/shares)
  assert.ok(r.per_share_low! < r.tiers!.neutral.per_share, "floor(pess) < neutral");
  assert.ok(Number.isFinite(r.tiers!.neutral.per_share) && r.tiers!.neutral.per_share > 0, "neutral finite positive");
  assert.ok(r.tiers!.neutral.per_share < r.per_share_high!, "neutral < opt");
}
// 15) 净利下滑 → 全档退回零增长（不给恶化股终值增长）。
{
  const years = [yr(2024, 80), yr(2023, 90), yr(2022, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4.25, date: "d" }, null);
  assert.strictEqual(r.terminal_method, "zero_growth", "declined → zero growth terminal");
  assert.strictEqual(r.terminal_growth, 0, "declined → g 0");
}
// 16) 高杠杆 floor → 退回零增长（即便净利上升）。
{
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const levered = { kind: "floor", buffett_epv: lamp(1000, 100, [2022, 2023, 2024]), high_leverage_warning: true } as unknown as ValuationFloor;
  const r = deriveOeDcf(levered, years, { value: 4.25, date: "d" }, null);
  assert.strictEqual(r.terminal_method, "zero_growth", "high leverage → zero growth terminal");
}
// 17) g1=0（净利持平）→ gTerminal=0 → 零增长（行为与现状一致）。
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, null);
  assert.strictEqual(r.terminal_method, "zero_growth", "flat earnings → zero growth");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: FAIL（`terminal_method` / `terminal_growth` 为 undefined，断言不通过）

- [ ] **Step 3: types.ts 加字段**

在 `web/src/lib/valuation/types.ts` 的 `OeDcfAssessment` 里，`terminal_dependency_flag?: boolean;` 行之后加：

```ts
  terminal_growth?: number;   // 中枢/乐观档永续增长 g = min(dgs10, 3% GDP, g1)；悲观档恒 0
  terminal_method?: "gordon_capped" | "zero_growth"; // 中枢档终值口径
```

- [ ] **Step 4: ownerEarningsDcf.ts 实现**

4a. 在常量区（`PROJECTION_YEARS` 附近）加：

```ts
export const GDP_NOMINAL_CAP = 0.03; // 名义 GDP 长期上限 —— 永续增长 g 的封顶之一（Damodaran 铁律）
export const MIN_RG_SPREAD = 0.03;   // r − g 最小间距，防终值爆炸；触及则退回零增长
```

4b. `dcfTier` 加 `gTerminal` 参并改终值公式：

```ts
function dcfTier(oe0: number, g1: number, r: number, shares: number, gTerminal: number): {
  equity: number;
  perShare: number;
  pvTv: number;
} {
  const oe = projectOe(oe0, g1);
  let pvExplicit = 0;
  for (let t = 1; t <= PROJECTION_YEARS; t++) {
    pvExplicit += oe[t - 1] / Math.pow(1 + r, t);
  }
  const oe10 = oe[PROJECTION_YEARS - 1];
  // 带上限 Gordon：g 与贴现率同源、且 r−g 足够宽时用 Gordon；否则退回零增长（安全兜底）。
  const useGordon = gTerminal > 0 && r - gTerminal >= MIN_RG_SPREAD;
  const tv = useGordon ? (oe10 * (1 + gTerminal)) / (r - gTerminal) : oe10 / r;
  const pvTv = tv / Math.pow(1 + r, PROJECTION_YEARS);
  const equity = pvExplicit + pvTv;
  return { equity, perShare: equity / shares, pvTv };
}
```

4c. `tierValues` 透传 `gTerminal`：

```ts
function tierValues(oe0: number, g1: number, r: number, shares: number, gTerminal: number): {
  equity_value: number;
  per_share: number;
} {
  const run = dcfTier(oe0, g1, r, shares, gTerminal);
  return { equity_value: run.equity, per_share: run.perShare };
}
```

4d. 在 `deriveOeDcf` 内，`const discount = discountBand(dgs10);` 之后、构造三档之前，加 gTerminal 计算：

```ts
  // 终值增长（中枢/乐观档）：g = min(10Y国债, 3%名义GDP) 且不快于近期 g1；恶化/高杠杆股不给终值增长。
  const gCap = Math.min(discount.dgs10_value ?? 0.025, GDP_NOMINAL_CAP);
  const gTerminal = declined || floor.high_leverage_warning ? 0 : Math.min(gCap, g1);
```

4e. 改三档构造（悲观档 gTerminal 传 0；中枢/乐观传 gTerminal）：

```ts
  const pessimistic: OeDcfTier = {
    growth_stage1: g1 / 2,
    discount_rate: discount.r_high,
    ...tierValues(oe0, g1 / 2, discount.r_high, shares, 0), // 悲观档保留零增长底
  };
  const neutralRun = dcfTier(oe0, g1, discount.midpoint, shares, gTerminal);
  const neutral: OeDcfTier = {
    growth_stage1: g1,
    discount_rate: discount.midpoint,
    equity_value: neutralRun.equity,
    per_share: neutralRun.perShare,
  };
  const optimistic: OeDcfTier = {
    growth_stage1: g1,
    discount_rate: discount.r_low,
    ...tierValues(oe0, g1, discount.r_low, shares, gTerminal),
  };
```

4f. 在 `deriveOeDcf` 的 return 对象里（`terminal_dependency_flag` 行附近）加两字段：

```ts
    terminal_growth: gTerminal,
    terminal_method: gTerminal > 0 ? "gordon_capped" : "zero_growth",
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: PASS（末行打印 `ownerEarningsDcf.check.ts: deriveOeDcf + reconcileMethods OK`）

- [ ] **Step 6: 更新卡片文案**（`EarningsPowerFloorCard.tsx`）

en（line 87）：
```ts
    oeDcfCompact: (r: string) => `Owner-earnings DCF (Buffett): ${r} / sh. Floor keeps a zero-growth terminal; the upper end caps perpetual growth at min(10-year treasury, 3% nominal GDP).`,
```
zh（line 119）：
```ts
    oeDcfCompact: (r: string) => `所有者盈利 DCF（巴菲特）：${r} / 股。下限保留零增长终值；上限的永续增长封顶在 min(10 年期国债, 3% 名义 GDP)。`,
```

- [ ] **Step 7: 类型门 + commit**

Run: `cd web && npx tsc --noEmit`
Expected: 无 valuation 相关报错。

```bash
git add web/src/lib/valuation/types.ts web/src/lib/valuation/ownerEarningsDcf.ts web/src/lib/valuation/ownerEarningsDcf.check.ts web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): OE-DCF 终值改带上限 Gordon 带宽 (Phase A #2)

悲观档保留零增长安全边际底；中枢/乐观档永续增长封顶 min(10Y国债,3%GDP)且≤近期g1，
恶化/高杠杆股退回零增长。对齐 Damodaran/simplywall.st，修正零增长对优质股的系统性低估。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: A2 — Net-Net ⅔ 双层

**Files:**
- Modify: `web/src/lib/valuation/netNet.ts`（加常量 + `isNetNetAssetFloor`/`isNetNetBuy`，删 `isNetNetTriggered`）
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts:12,44,155-157`（import + netNet 字段类型 + 构造）
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx:4,91-92,123-124,358,372`（import + 文案 + 渲染）
- Test: `web/src/lib/valuation/netNet.check.ts`、`web/src/lib/valuation/deriveValuationVerdict.check.ts:164,174`

**Interfaces:**
- Consumes: `NetNetLamp`（现有）、现价 `number`。
- Produces: `isNetNetAssetFloor(lamp, price): boolean`（`P < 全额NCAV` 且折让≤80% → 资产底信号）、`isNetNetBuy(lamp, price): boolean`（`P ≤ ⅔×NCAV` 且折让≤80% → 买入线）。常量 `GRAHAM_NCAV_BUY_FRACTION = 2/3`。verdict 的 `netNet` 字段改为 `{ perShare: number; assetFloor: boolean; buy: boolean }`。

- [ ] **Step 1: 改 netNet.check.ts（写失败测试）**

替换 `netNet.check.ts` 第 5–47 行（import 与 §5–8 的 `isNetNetTriggered` 块）为：

```ts
import { computeNetNet, isNetNetAssetFloor, isNetNetBuy, GRAHAM_NCAV_BUY_FRACTION, type NetNetLamp } from "./netNet";
```
（保留第 8–23 行的 `approx` 与 computeNetNet 的 §1–4 断言不变，仅替换 §5–8）：

```ts
// 5) assetFloor:~50% 折让(per_share=10, price=5) → true；buy 也 true(5 ≤ ⅔×10=6.67)。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 10, ncav: 1000 };
  assert.strictEqual(isNetNetAssetFloor(lamp, 5), true, "50% discount → asset floor");
  assert.strictEqual(isNetNetBuy(lamp, 5), true, "5 ≤ ⅔×10 → buy line");
}
// 6) 折让区间在 (⅔, 1) 之间：per_share=10, price=8 → assetFloor true(8<10) 但 buy false(8 > 6.67)。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 10, ncav: 1000 };
  assert.strictEqual(isNetNetAssetFloor(lamp, 8), true, "8 < 10 → asset floor");
  assert.strictEqual(isNetNetBuy(lamp, 8), false, "8 > ⅔×10 → not buy");
}
// 7) 85% 折让(per_share=100, price=15) → 两者 false(超 80% 上限,数据存疑)。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 100, ncav: 10000 };
  assert.strictEqual(isNetNetAssetFloor(lamp, 15), false, "85% discount → no asset floor (>80% cap)");
  assert.strictEqual(isNetNetBuy(lamp, 15), false, "85% discount → no buy (>80% cap)");
}
// 8) 现价 ≥ 每股(per_share=10, price=12) → 两者 false。
{
  const lamp: NetNetLamp = { assessable: true, per_share: 10, ncav: 1000 };
  assert.strictEqual(isNetNetAssetFloor(lamp, 12), false, "price ≥ per_share → no asset floor");
  assert.strictEqual(isNetNetBuy(lamp, 12), false, "price ≥ per_share → no buy");
}
// 9) lamp 不可评估 → 两者 false。
{
  const lamp: NetNetLamp = { assessable: false, reason: "stub" };
  assert.strictEqual(isNetNetAssetFloor(lamp, 5), false, "not assessable → no asset floor");
  assert.strictEqual(isNetNetBuy(lamp, 5), false, "not assessable → no buy");
}
// 10) 常量:⅔。
assert.ok(Math.abs(GRAHAM_NCAV_BUY_FRACTION - 2 / 3) < 1e-9, "buy fraction = 2/3");
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/netNet.check.ts`
Expected: FAIL（`isNetNetAssetFloor`/`isNetNetBuy` 未导出）

- [ ] **Step 3: netNet.ts 实现**

替换 `netNet.ts` 第 9–24 行（`NETNET_MAX_DISCOUNT` 常量与 `isNetNetTriggered` 函数）为：

```ts
// 折让上限:折让>80%(现价 < 每股 NCAV × 0.2)落在数据存疑区,抑制"好到不真实"的净net。
export const NETNET_MAX_DISCOUNT = 0.8;
// Graham 经典买入线:现价 ≤ ⅔ 每股 NCAV(《The Intelligent Investor》"two-thirds working-capital";Oppenheimer 1986 学术标准)。
export const GRAHAM_NCAV_BUY_FRACTION = 2 / 3;

function withinSaneBand(lamp: NetNetLamp, price: number | null | undefined): lamp is NetNetLamp & { assessable: true } {
  return (
    lamp.assessable &&
    Number.isFinite(lamp.per_share) &&
    lamp.per_share > 0 &&
    price != null &&
    price > 0 &&
    price >= lamp.per_share * (1 - NETNET_MAX_DISCOUNT) // 折让不超 80%（数据存疑闸）
  );
}

/** 资产底信号:现价 < 每股 NCAV 且折让≤80%。识别"这是一只 net-net"，非买入线。 */
export function isNetNetAssetFloor(lamp: NetNetLamp, price: number | null | undefined): boolean {
  return withinSaneBand(lamp, price) && price! < lamp.per_share;
}

/** Graham 买入线:现价 ≤ ⅔ 每股 NCAV 且折让≤80%。安全边际达标的"便宜可买"判定。 */
export function isNetNetBuy(lamp: NetNetLamp, price: number | null | undefined): boolean {
  return withinSaneBand(lamp, price) && price! <= lamp.per_share * GRAHAM_NCAV_BUY_FRACTION;
}
```

在 `computeNetNet` 的 `const ncav = ...` 上方加注释：
```ts
  // 注:精确 Graham 口径应再减优先股(NCAV = 流动资产 − 总负债 − 优先股);数据层暂无优先股字段,Phase B 补。
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/netNet.check.ts`
Expected: PASS（末行 `netNet.check.ts OK`）

- [ ] **Step 5: 改 verdict 消费方**（`deriveValuationVerdict.ts`）

5a. line 12 import：
```ts
import { isNetNetAssetFloor, isNetNetBuy } from "./netNet";
```
5b. line 44 字段类型：
```ts
  netNet?: { perShare: number; assetFloor: boolean; buy: boolean };
```
5c. line 155-157 构造：
```ts
  const netNet =
    nn.assessable && Number.isFinite(nn.per_share) && nn.per_share > 0
      ? { perShare: nn.per_share, assetFloor: isNetNetAssetFloor(nn, price), buy: isNetNetBuy(nn, price) }
      : undefined;
```

- [ ] **Step 6: 改 verdict 测试**（`deriveValuationVerdict.check.ts`）

line 164（price 80 < 95 且 80 > ⅔×95=63.3 → assetFloor true, buy false）：
```ts
  assert(v && v.netNet && v.netNet.perShare === 95 && v.netNet.assetFloor === true && v.netNet.buy === false, "price 80 in (⅔NCAV, NCAV) → asset floor, not buy");
```
line 174（price 110 > 95 → 两者 false）：
```ts
  assert(v && v.netNet && v.netNet.perShare === 95 && v.netNet.assetFloor === false && v.netNet.buy === false, "price > per_share → neither");
```

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: PASS。

- [ ] **Step 7: 改卡片消费方**（`EarningsPowerFloorCard.tsx`）

7a. line 4 import：
```ts
import { isNetNetAssetFloor, isNetNetBuy } from "@/lib/valuation/netNet";
```
7b. 文案:en 块（line 91-92）保留 `netNet` 作资产底信号，新增 `netNetBuy`：
```ts
    netNet: (ps: string) =>
      `⚑ Price is below net current asset value (${ps}/share) — a Graham "net-net". Historically rare and usually a sign of business distress; beware the value trap.`,
    netNetBuy: (ps: string) =>
      `⚑ Price is at or below two-thirds of net current asset value (${ps}/share) — Graham's classic net-net threshold with a full margin of safety. Historically rare and usually a sign of business distress; beware the value trap.`,
```
zh 块（line 123-124）同理新增 `netNetBuy`：
```ts
    netNet: (ps: string) =>
      `⚑ 现价低于每股净流动资产（${ps}）。格雷厄姆式"净 net"深度价值,历史极罕见——常伴随经营困境,须警惕价值陷阱。`,
    netNetBuy: (ps: string) =>
      `⚑ 现价已跌至每股净流动资产的三分之二以下（${ps}）— 格雷厄姆经典"净 net"买入线,安全边际充分。历史极罕见,常伴随经营困境,须警惕价值陷阱。`,
```
7c. line 358 判定拆两态：
```ts
  const netNetAssetFloor = sz?.price ? isNetNetAssetFloor(floor.net_net, sz.price.close) : false;
  const netNetBuy = sz?.price ? isNetNetBuy(floor.net_net, sz.price.close) : false;
```
7d. line 372 渲染（买入线优先，否则资产底信号）：
```ts
        {floor.net_net.assessable && netNetBuy ? (
          <p>{t.netNetBuy(perShare(floor.net_net.per_share))}</p>
        ) : floor.net_net.assessable && netNetAssetFloor ? (
          <p>{t.netNet(perShare(floor.net_net.per_share))}</p>
        ) : null}
```

- [ ] **Step 8: 类型门 + commit**

Run: `cd web && npx tsc --noEmit`
Expected: 无相关报错。

```bash
git add web/src/lib/valuation/netNet.ts web/src/lib/valuation/netNet.check.ts web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/deriveValuationVerdict.check.ts web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): Net-Net 拆⅔双层 — 资产底信号 + Graham 买入线 (Phase A #3)

isNetNetAssetFloor(P<全额NCAV)=识别信号；isNetNetBuy(P≤⅔NCAV)=安全边际买入线，
对齐 Graham 原文 + Oppenheimer 1986 学术标准。减优先股留 Phase B。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: A3 — SBC "回购≠回馈" 披露

**Files:**
- Modify: `web/src/lib/valuation/types.ts`（`EpvLamp` 加 `buyback_offsets_sbc?: boolean`）
- Modify: `web/src/lib/valuation/epvFloor.ts`（`buildBuffettLamp` 计算并输出该布尔）
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`（文案 + 渲染）
- Test: `web/src/lib/valuation/epvFloor.check.ts`

**Interfaces:**
- Consumes: `ValuationFloorYear.share_repurchases`（可能为负现金流出，取绝对值）、`ValuationFloorYear.stock_based_comp`。
- Produces: `EpvLamp.buyback_offsets_sbc?: boolean` —— 两字段均有数据且 `avg(|回购|) ≤ avg(SBC)` 时为 `true`，否则 `false`；任一字段全缺 → `undefined`。

- [ ] **Step 1: 写失败测试**（追加到 `epvFloor.check.ts` 末尾 `console.log` 之前；用其既有 fixture 构造方式——若无现成 buffett-lamp fixture，用下方自足断言）

```ts
// ── A3. SBC 回购抵消披露 ──────────────────────────────────────────────────────
import { computeValuationFloor as _cvfSbc } from "./epvFloor";
{
  // 回购 ≈ SBC（回购未超 SBC）→ buyback_offsets_sbc = true
  const yrs = [2024, 2023, 2022, 2021].map((fy, i) => ({
    fiscal_year: fy, revenue: 1000, operating_income: 200, operating_margin: 0.2,
    net_income: 150, shareholders_equity: 800, shares_diluted: 100,
    d_and_a: 40, capex: 40, stock_based_comp: 30, share_repurchases: -25, // 回购25 ≤ SBC30
    current_assets: 500, total_liabilities: 300,
  }));
  const f = _cvfSbc({ ticker: "T", years: yrs as never });
  assert.ok(f && (f as { kind?: string }).kind === "floor", "floor built");
  const lamp = (f as { buffett_epv: { buyback_offsets_sbc?: boolean } }).buffett_epv;
  assert.strictEqual(lamp.buyback_offsets_sbc, true, "buybacks ≤ SBC → offsets flag true");
}
{
  // 回购 ≫ SBC（净回馈）→ false
  const yrs = [2024, 2023, 2022, 2021].map((fy) => ({
    fiscal_year: fy, revenue: 1000, operating_income: 200, operating_margin: 0.2,
    net_income: 150, shareholders_equity: 800, shares_diluted: 100,
    d_and_a: 40, capex: 40, stock_based_comp: 10, share_repurchases: -200, // 回购200 ≫ SBC10
    current_assets: 500, total_liabilities: 300,
  }));
  const f = _cvfSbc({ ticker: "T", years: yrs as never });
  const lamp = (f as { buffett_epv: { buyback_offsets_sbc?: boolean } }).buffett_epv;
  assert.strictEqual(lamp.buyback_offsets_sbc, false, "buybacks ≫ SBC → offsets flag false");
}
```
> 注：若 `epvFloor.check.ts` 顶部已 import `computeValuationFloor`，删掉本块内重复的 `import { computeValuationFloor as _cvfSbc }` 并改用已有引用。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: FAIL（`buyback_offsets_sbc` 为 undefined）

- [ ] **Step 3: types.ts 加字段**

`EpvLamp` 里 `sbc_to_oe_pct?: number;` 之后加：
```ts
  /** Buffett lamp only: 多年回购(绝对值)均值 ≤ SBC 均值 → 回购主要抵消稀释、非净回馈(Mauboussin 洞见);数据缺则 undefined。 */
  buyback_offsets_sbc?: boolean;
```

- [ ] **Step 4: epvFloor.ts 实现**

在 `buildBuffettLamp` 内，`sbcToOe` 计算行（`const sbcToOe = ...`）之后加：
```ts
  // 回购是否仅抵消 SBC 稀释(Mauboussin:回购≠净回馈)。share_repurchases 存负现金流出,取绝对值对齐 SBC 正费用。
  const repurchVals = years.map((y) => y.share_repurchases).filter((v): v is number => v != null).map(Math.abs);
  const buybackOffsetsSbc =
    repurchVals.length && sbcVals.length ? avg(repurchVals) <= avg(sbcVals) : undefined;
```
在 `buildBuffettLamp` 的**两个** return（`ownerEarnings <= 0` 的不可评估分支、与末尾可评估分支）里各加一行 `buyback_offsets_sbc: buybackOffsetsSbc,`（紧挨 `sbc_to_oe_pct: sbcToOe,`）。

- [ ] **Step 5: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: PASS。

- [ ] **Step 6: 卡片文案 + 渲染**（`EarningsPowerFloorCard.tsx`）

en 文案区（`netNetBuy` 之后）加：
```ts
    buybackOffsetsSbc: "Buybacks over the years shown roughly only offset stock-based-compensation dilution — read them as maintaining the share count, not a net return of capital.",
```
zh 同位置加：
```ts
    buybackOffsetsSbc: "所示年度的回购大体只抵消了股权激励(SBC)造成的稀释 — 应视为维持股本、而非净额回馈股东。",
```
渲染:在 method-summary details 块内（Task 2 的 net-net 渲染行之后）加：
```ts
        {buffett_epv.buyback_offsets_sbc ? <p>{t.buybackOffsetsSbc}</p> : null}
```
> `buffett_epv` 在该组件作用域已解构可用（见文件顶部 floor 解构）；若未解构，用 `floor.buffett_epv.buyback_offsets_sbc`。

- [ ] **Step 7: 类型门 + commit**

Run: `cd web && npx tsc --noEmit`
Expected: 无相关报错。

```bash
git add web/src/lib/valuation/types.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): SBC 补'回购≠回馈'披露 (Phase A #5)

owner-earnings 计算不动(不加回SBC=Damodaran主流派已达标);仅当多年回购≤SBC时
标注'回购主要抵消稀释、非净回馈'(Mauboussin),接 quality 可信度定位。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 收尾验证

- [ ] **全量 check 跑一遍**

```bash
cd web
npx tsx src/lib/valuation/ownerEarningsDcf.check.ts
npx tsx src/lib/valuation/netNet.check.ts
npx tsx src/lib/valuation/deriveValuationVerdict.check.ts
npx tsx src/lib/valuation/epvFloor.check.ts
npx tsc --noEmit
```
Expected: 四个 check 各打印 OK；tsc 无 valuation 相关报错。

## Self-Review 记录

- **Spec 覆盖**：Phase A 三条（#2 终值 Task1 / #3 Net-Net Task2 / #5 SBC Task3）均有对应 Task。#1 重置价值、#4 行业β属 B/C，本计划不含（符合分期）。
- **占位扫描**：无 TBD/TODO；每步含真实代码与命令。
- **类型一致**：`isNetNetAssetFloor`/`isNetNetBuy` 名称跨 netNet.ts/verdict/card/check 一致；`terminal_growth`/`terminal_method` 跨 types/engine/check 一致；`buyback_offsets_sbc` 跨 types/engine/card/check 一致。
- **compliance 风险**：A2 英文含 "buy" 仅在 UI 组件文案，不进引擎序列化；引擎侧 OE-DCF/verdict 的词元扫描断言不受影响（terminal 新增字段为数字/`gordon_capped`/`zero_growth`，无违禁词）。
