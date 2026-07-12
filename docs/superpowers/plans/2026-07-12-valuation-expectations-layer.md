# 反向 DCF 预期合理性层 Implementation Plan（估值改造 Phase 1）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保守价值地基之上并联一层「反向 DCF 预期合理性」——把现价反解成市场隐含增长率，对照公司自己历史 CAGR，输出温和/公允/苛刻三态，让优质股得到可用结论、激活 13F×估值融合。

**Architecture:** 纯函数 `impliedExpectations.ts` 复用现有 `ownerEarningsDcf` 的投影/终值/贴现（导出 `dcfTier` 供反解，二分求隐含增长）。地基层（`deriveValuationVerdict` 的 bucket）一行不动。结果写进 `valuation_snapshot.payload`（jsonb，无需改表），个股页 masthead 加预期微徽章 + 估值小节加「价格在赌什么」块。

**Tech Stack:** TypeScript 纯函数 + `.check.ts`（sACN 无常驻测试，走 tsx 断言）、Next.js App Router RSC、Supabase（读快照）、`--tt-*` token。

## Global Constraints

- 分支：`plan/valuation-expectations-layer`，off `db-foundation` @ 3cc6fa8。
- **地基层禁改**：`deriveValuationVerdict` 的 bucket/rangeLo/rangeHi/reliable 全部不动；预期层是**并联新增**。
- **只用 SEC 历史 + 已持久化 DGS10 锚**，禁引入分析师预估/同业 base-rate（后者留 Phase 3）。
- **禁**买卖/目标价/评级措辞；隐含数字**永远与历史对照并排**，禁单独展示。守 [[valuation-philosophy-constraint]]。
- 复用现有抑制闸：`assessReliability`（`declined`/`high_leverage_warning`/`ai_capex_distortion_warning`/极端 OE 收益率）、`isImplausibleBand`、`oe0 ≤ 0`。任一触发 → 预期层 `assessable=false`，页面空缺（非报错）。
- 终值封顶 `GDP_NOMINAL_CAP`（0.03）；贴现用 `discountBand` midpoint（DGS10 锚，last-good 持久化）。
- 无常驻测试套件（solo dev）：验证 = `npx tsc --noEmit`（`web/` 下）+ 运行 `.check.ts`（tsx）+ 部署后真数据抽查。**禁** `next build`（本机 google fonts 被墙）。
- 每 locale 纯本语言；用户文案遵 `web/docs/copy-voice.md`（具体、有观点、数据优先，禁 AI 腔）。
- **禁**碰无关在途文件（如 `web/src/components/home/PhilosophyQuote.tsx`）；**用独立 worktree**（`superpowers:using-git-worktrees`），别在共用主目录直接改。

## File Structure

- 新建 `web/src/lib/valuation/impliedExpectations.ts` — 纯函数：二分反解隐含增长 + 隐含 CAP + 三态 + 抑制闸。
- 新建 `web/src/lib/valuation/impliedExpectations.check.ts` — 纯函数断言测试。
- 改 `web/src/lib/valuation/ownerEarningsDcf.ts` — `export` 现私有的 `dcfTier`（供反解复用同款投影，保证与正向引擎一致）。
- 改 `web/src/lib/valuation/types.ts` — 新增 `ExpectationsAssessment` 类型。
- 改 `web/scripts/valuation-ingest.ts` — 附算预期层，写入 `valuation_snapshot.payload.expectations`。
- 改 `web/src/lib/valuation/valuationSnapshot.ts` — 读回 `payload.expectations`（强类型透传）。
- 改 `web/src/app/[lang]/stocks/[ticker]/page.tsx` — masthead 预期微徽章 + 估值小节「价格在赌什么」块（或抽小组件）。

---

### Task 1: `impliedExpectations` 纯函数引擎（TDD）

**Files:**
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts`（`dcfTier` 加 `export`）
- Modify: `web/src/lib/valuation/types.ts`（新增类型）
- Create: `web/src/lib/valuation/impliedExpectations.ts`
- Test: `web/src/lib/valuation/impliedExpectations.check.ts`

**Interfaces:**
- Consumes: `dcfTier(oe0, g1, r, shares, gTerminal) → { equity; perShare; pvTv }`（`ownerEarningsDcf`，本任务导出）；`GDP_NOMINAL_CAP`、`PROJECTION_YEARS`（已导出）。
- Produces:
  ```ts
  // types.ts
  export type ExpectationsTier = "modest" | "fair" | "demanding";
  export type ExpectationsAssessment = {
    assessable: boolean;
    impliedGrowth?: number;          // g*（小数）
    impliedGrowthBounded?: "below" | "above"; // 越界标记（不外插）
    historicalGrowth?: number;       // 公司自身 CAGR
    impliedCapYears?: number;        // 次级：历史增长下撑住现价所需超额回报年数
    tier?: ExpectationsTier;
    reason?: string;                 // 不可评估时的原因（供注脚）
  };
  ```
  ```ts
  // impliedExpectations.ts
  export function deriveExpectations(input: {
    oe0: number; shares: number; r: number; gTerminal: number; price: number;
    historicalGrowth: number | undefined;
    suppressed: boolean;             // 由调用方汇总抑制闸（assessReliability 取反 / isImplausibleBand / oe0<=0）
  }): ExpectationsAssessment;
  ```

- [ ] **Step 1: 加类型 + 导出 dcfTier**

在 `types.ts` 末尾加 `ExpectationsTier` / `ExpectationsAssessment`（见上）。
在 `ownerEarningsDcf.ts` 把 `function dcfTier(` 改为 `export function dcfTier(`（仅加 `export`，函数体不动）。

- [ ] **Step 2: 写失败测试**

`web/src/lib/valuation/impliedExpectations.check.ts`：

```ts
import { deriveExpectations, solveImpliedGrowth, IMPLIED_G_MIN, IMPLIED_G_MAX, DEMANDING_BUFFER } from "./impliedExpectations";
import { dcfTier } from "./ownerEarningsDcf";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; }
  else console.log("ok:", msg);
}

const base = { oe0: 100, shares: 10, r: 0.09, gTerminal: 0.03 };

// 1) 一致性/反解正确：解出的 g 使 perShare ≈ price
{
  const priceAtG = dcfTier(base.oe0, 0.06, base.r, base.shares, base.gTerminal).perShare;
  const { g } = solveImpliedGrowth({ ...base, price: priceAtG });
  const recovered = dcfTier(base.oe0, g, base.r, base.shares, base.gTerminal).perShare;
  assert(Math.abs(recovered - priceAtG) / priceAtG < 1e-3, "二分反解回到原价 (<0.1%)");
  assert(Math.abs(g - 0.06) < 1e-3, "解出的 g 接近真值 0.06");
}

// 2) 单调：price 越高 → 隐含 g 越高
{
  const lo = solveImpliedGrowth({ ...base, price: dcfTier(base.oe0, 0.04, base.r, base.shares, base.gTerminal).perShare }).g;
  const hi = solveImpliedGrowth({ ...base, price: dcfTier(base.oe0, 0.12, base.r, base.shares, base.gTerminal).perShare }).g;
  assert(hi > lo, "price↑ → 隐含 g↑");
}

// 3) 越界不外插
{
  const rHi = solveImpliedGrowth({ ...base, price: 1e9 });
  assert(rHi.bounded === "above" && rHi.g === IMPLIED_G_MAX, "超高价 → bounded above, g=上限");
  const rLo = solveImpliedGrowth({ ...base, price: 0.01 });
  assert(rLo.bounded === "below" && rLo.g === IMPLIED_G_MIN, "超低价 → bounded below, g=下限");
}

// 4) 三态阈值（历史 h=0.08）
{
  const h = 0.08;
  const mk = (g: number) => deriveExpectations({ ...base, price: dcfTier(base.oe0, g, base.r, base.shares, base.gTerminal).perShare, historicalGrowth: h, suppressed: false });
  assert(mk(0.06).tier === "modest", "g*<h → modest");
  assert(mk(0.09).tier === "fair", "h<g*≤h·1.25 → fair");
  assert(mk(0.15).tier === "demanding", "g*>h·1.25 → demanding");
}

// 5) 抑制闸 / 缺历史
{
  assert(deriveExpectations({ ...base, price: 300, historicalGrowth: 0.08, suppressed: true }).assessable === false, "suppressed → 不可评估");
  assert(deriveExpectations({ ...base, oe0: -5, price: 300, historicalGrowth: 0.08, suppressed: false }).assessable === false, "oe0<=0 → 不可评估");
  assert(deriveExpectations({ ...base, price: 300, historicalGrowth: undefined, suppressed: false }).assessable === false, "缺历史 CAGR → 不可评估（无对照不出结论）");
}

console.log(process.exitCode ? "SOME TESTS FAILED" : "ALL PASS");
```

- [ ] **Step 3: 运行测试确认失败**

Run（`web/` 下）：`npx tsx src/lib/valuation/impliedExpectations.check.ts`
Expected: 失败（模块未实现 / 导出缺失）。

- [ ] **Step 4: 写实现**

`web/src/lib/valuation/impliedExpectations.ts`：

```ts
import { dcfTier, GDP_NOMINAL_CAP, PROJECTION_YEARS } from "./ownerEarningsDcf";
import type { ExpectationsAssessment, ExpectationsTier } from "./types";

export const IMPLIED_G_MIN = -0.10;   // 反解搜索下限（隐含衰退）
export const IMPLIED_G_MAX = 0.30;    // 反解搜索上限；越界只标记不外插
export const DEMANDING_BUFFER = 0.25; // g* > h·(1+buffer) → 苛刻
const SOLVE_ITERS = 60;               // 二分迭代（2^-60 收敛，远超需要）
const CAP_MAX_YEARS = 40;             // 隐含 CAP 搜索上限

type SolveInput = { oe0: number; shares: number; r: number; gTerminal: number; price: number };

/** 反解隐含增长 g*：dcfTier(...).perShare 关于 g 单调递增 → 二分。越界返回边界+标记，不外插。 */
export function solveImpliedGrowth(input: SolveInput): { g: number; bounded: "below" | "above" | null } {
  const { oe0, shares, r, gTerminal, price } = input;
  const val = (g: number) => dcfTier(oe0, g, r, shares, gTerminal).perShare;
  if (price <= val(IMPLIED_G_MIN)) return { g: IMPLIED_G_MIN, bounded: "below" };
  if (price >= val(IMPLIED_G_MAX)) return { g: IMPLIED_G_MAX, bounded: "above" };
  let lo = IMPLIED_G_MIN, hi = IMPLIED_G_MAX;
  for (let i = 0; i < SOLVE_ITERS; i++) {
    const mid = (lo + hi) / 2;
    if (val(mid) < price) lo = mid; else hi = mid;
  }
  return { g: (lo + hi) / 2, bounded: null };
}

/** 次级量：固定 g=历史增长，反解「撑住现价所需显式超额回报年数」。粗粒度整数搜索。 */
function solveImpliedCap(input: SolveInput & { historicalGrowth: number }): number | undefined {
  const { oe0, shares, r, gTerminal, price, historicalGrowth } = input;
  if (!(historicalGrowth > 0)) return undefined;
  // dcfTier 的显式期固定 10 年；这里用同款投影但显式期可变的等价现值近似：
  // 逐年以 historicalGrowth 复利 OE，累加折现，达到/超过 price×shares 的年数即隐含 CAP。
  let pv = 0, oe = oe0;
  for (let t = 1; t <= CAP_MAX_YEARS; t++) {
    oe = oe * (1 + historicalGrowth);
    pv += oe / Math.pow(1 + r, t);
    // 加当年为终点的零增长永续尾巴，判断是否已够撑起现价
    const tail = (oe / r) / Math.pow(1 + r, t);
    if (pv + tail >= price * shares) return t;
  }
  return undefined; // >CAP_MAX_YEARS：不给假精度
}

function classify(gStar: number, h: number): ExpectationsTier {
  if (gStar <= h) return "modest";
  if (gStar <= h * (1 + DEMANDING_BUFFER)) return "fair";
  return "demanding";
}

export function deriveExpectations(input: SolveInput & {
  historicalGrowth: number | undefined;
  suppressed: boolean;
}): ExpectationsAssessment {
  const { oe0, price, historicalGrowth, suppressed } = input;
  if (suppressed) return { assessable: false, reason: "reliability_or_robustness_gate" };
  if (!(oe0 > 0)) return { assessable: false, reason: "non_positive_owner_earnings" };
  if (!(price > 0)) return { assessable: false, reason: "no_price" };
  if (historicalGrowth == null || !Number.isFinite(historicalGrowth)) {
    return { assessable: false, reason: "no_historical_base_rate" };
  }
  const { g, bounded } = solveImpliedGrowth(input);
  const impliedCapYears = solveImpliedCap({ ...input, historicalGrowth });
  return {
    assessable: true,
    impliedGrowth: g,
    ...(bounded ? { impliedGrowthBounded: bounded } : {}),
    historicalGrowth,
    ...(impliedCapYears != null ? { impliedCapYears } : {}),
    tier: classify(g, historicalGrowth),
  };
}
```

- [ ] **Step 5: 运行测试确认通过**

Run（`web/` 下）：`npx tsx src/lib/valuation/impliedExpectations.check.ts`
Expected: `ALL PASS`（exitCode 0）。

- [ ] **Step 6: 类型门**

Run（`web/` 下）：`npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/valuation/impliedExpectations.ts web/src/lib/valuation/impliedExpectations.check.ts web/src/lib/valuation/types.ts web/src/lib/valuation/ownerEarningsDcf.ts
git commit -m "feat(valuation): 反向DCF隐含预期纯函数引擎(二分解g*/三态/抑制闸)"
```

---

### Task 2: 接入 ingest + 写入快照 payload

**Files:**
- Modify: `web/scripts/valuation-ingest.ts`（附算预期层，写 `payload.expectations`）
- Modify: `web/src/lib/valuation/valuationSnapshot.ts`（读回强类型）

**Interfaces:**
- Consumes: `deriveExpectations`（Task 1）。
- 输入来源：ingest 每 ticker 已计算 OE-DCF；需把 `oe0 / shares / r(midpoint) / gTerminal` 从 OE-DCF 计算处透出。**先读 `valuation-ingest.ts` 与 `ownerEarningsDcf.ts` 的 `buildOeDcf` 上下文**，把这四个量取到（`gTerminal = min(dgs10, GDP_NOMINAL_CAP)`、`r = discountBand(dgs10).midpoint`、`oe0`/`shares` 来自 owner-earnings lamp）。若 `buildOeDcf` 未对外暴露这些，加一个轻量返回字段透出（不改其算法）。
- `suppressed` 汇总：`!verdict.reliable || isImplausibleBand({...}) || oe0<=0`（复用 `deriveValuationVerdict` 已算出的 `reliable`）。

- [ ] **Step 1: 透出 OE-DCF 内部输入**

读 `web/src/lib/valuation/ownerEarningsDcf.ts` 的 `buildOeDcf`（或等价入口），在其返回对象上追加 `expectations_inputs?: { oe0: number; shares: number; r: number; gTerminal: number }`（仅透传已算出的中间量，算法不变）。若已有等价字段则复用，不重复。

- [ ] **Step 2: ingest 附算并写入 payload**

在 `web/scripts/valuation-ingest.ts` 每 ticker 组装 `payload` 处，加：

```ts
import { deriveExpectations } from "@/lib/valuation/impliedExpectations";
// ...
const ei = oeDcf?.expectations_inputs;
const expectations = ei
  ? deriveExpectations({
      oe0: ei.oe0, shares: ei.shares, r: ei.r, gTerminal: ei.gTerminal,
      price: strikeZone.price.close,
      historicalGrowth: /* 公司自身 CAGR：取 netIncomeCagr 的 cagr，见下 */ historicalCagr,
      suppressed: !verdict.reliable,
    })
  : { assessable: false as const, reason: "no_oe_dcf" };
// payload.expectations = expectations;
```
`historicalCagr` 取自现有 OE-DCF 计算里已得的 `netIncomeCagr(windowYears).cagr`——若未透出，一并在 Step 1 的 `expectations_inputs` 里带上 `historicalGrowth`。**只写 `assessable=true` 或带 `reason` 的对象**，保持 payload 自解释。

- [ ] **Step 3: 读回强类型**

在 `web/src/lib/valuation/valuationSnapshot.ts` 的 payload 解析处，把 `expectations?: ExpectationsAssessment` 纳入返回类型，透传给页面（缺字段 → undefined，页面据此不渲染）。

- [ ] **Step 4: 类型门**

Run（`web/` 下）：`npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 5: Commit**

```bash
git add web/scripts/valuation-ingest.ts web/src/lib/valuation/valuationSnapshot.ts web/src/lib/valuation/ownerEarningsDcf.ts
git commit -m "feat(valuation): 预期层接入ingest→写valuation_snapshot.payload.expectations"
```

---

### Task 3: 个股页呈现（masthead 微徽章 + 「价格在赌什么」块）

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`
- 可能 Create: `web/src/components/valuation/PriceBetBlock.tsx`（承载估值小节新块，若 page.tsx 过密则抽出）

**Interfaces:**
- Consumes: 快照读回的 `expectations: ExpectationsAssessment | undefined`（Task 2）。
- 文案遵 `web/docs/copy-voice.md`，双 locale 纯本语言，仅 `--tt-*` token，纯 RSC。

- [ ] **Step 1: masthead 预期微徽章**

在个股页 masthead 现有地基结论徽章（如 `ABOVE VALUE`）**旁边并列**（不替换）渲染预期微徽章。仅当 `expectations?.assessable` 为真时渲染：
- `tier==="modest"` → 「预期 · 温和」/ en「Expectations · modest」
- `"fair"` → 「预期 · 公允」/「Expectations · fair」
- `"demanding"` → 「预期 · 苛刻」/「Expectations · demanding」
色彩克制（沿用现有徽章 token，不新造强色）。

- [ ] **Step 2: 估值小节「价格在赌什么」块**

在估值小节（`EarningsPowerFloorCard` 之后、`LearnLink` 之前）插入，仅当 `expectations?.assessable`：
- 主句（隐含增长率领衔，叉口①）：
  - zh：「现价隐含未来约 10 年 owner-earnings 年增 **{impliedGrowth%}**；公司过去做到 **{historicalGrowth%}**。」+ tier 尾注（温和/公允/苛刻的一句解释）。
  - en：同构。
  - `impliedGrowthBounded` 存在时，数字显示为「> {IMPLIED_G_MAX%}」/「< {IMPLIED_G_MIN%}」并标「罕见/超出常规区间」。
- 次句（隐含 CAP，仅当 `impliedCapYears` 存在）：zh「或等价地：撑住现价需其超额回报再延续约 **{impliedCapYears} 年**。」
- **合规**：无买卖/目标价；隐含数字与历史并排（本块结构已保证）。
- 可展开逐年拆解**本 Phase 可选**：若时间紧，先出主句/次句，逐年表留作后续（不阻塞）。

- [ ] **Step 3: 降级自检**

确认 `expectations` 为 undefined 或 `assessable:false` 时，masthead 微徽章与本块**均不渲染**，页面无空壳、无报错。

- [ ] **Step 4: 类型门**

Run（`web/` 下）：`npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 5: Commit**

```bash
git add web/src/app/\[lang\]/stocks/\[ticker\]/page.tsx web/src/components/valuation/PriceBetBlock.tsx
git commit -m "feat(valuation): 个股页预期微徽章+「价格在赌什么」块(双徽章共存)"
```

---

## 验收（部署后）

1. 三个 Task 的 `.check.ts` 全 PASS、`npx tsc --noEmit` 零错。
2. 跑 `npm run valuation:ingest`（授权后）→ `valuation_snapshot.payload.expectations` 落字段。
3. 真数据抽查：
   - AAPL/GOOGL 等优质股：masthead 出现「预期 · 温和/公允/苛刻」微徽章、估值小节出现「价格在赌什么」块（不再是空缺）。
   - 巴菲特页：估值列语义仍由地基 bucket 决定（本 Phase 不改投资人页），但个股详情页优质股不再无估值话可说。
   - 周期/高杠杆/缺 oe0 名：预期块优雅空缺、无报错。
4. 合规核对：无买卖/目标价措辞；隐含数字均带历史对照。
5. 双 locale 纯本语言、`--tt-*` token、dark/light 各扫一眼。

## Self-Review

- **Spec 覆盖**：§三方法（反解隐含增长/二分/越界/CAP 次级）→ Task 1；§四呈现（隐含增长领衔+双徽章）→ Task 3；§六护栏（GDP 封顶/DGS10 锚/抑制闸复用/隐含配对照）→ Task 1 `deriveExpectations` + Global Constraints；§七留存（payload 无改表）→ Task 2；§八测试 → 各 Task `.check.ts`/tsc + 验收段。无遗漏。
- **占位扫描**：无 TBD/TODO；纯函数有完整实现代码，集成任务给出明确 seam（透出 `expectations_inputs`）与真实函数名（`dcfTier`/`netIncomeCagr`/`discountBand`/`GDP_NOMINAL_CAP`）。「逐年表可选」已显式标注为非阻塞，非占位。
- **类型一致**：`ExpectationsAssessment`（Task 1 定义）→ Task 2 payload / Task 3 消费全用同名字段（`assessable`/`impliedGrowth`/`impliedGrowthBounded`/`historicalGrowth`/`impliedCapYears`/`tier`/`reason`）；`deriveExpectations`/`solveImpliedGrowth`/`dcfTier` 签名跨任务一致。
- **顺序正确**：Task 1（纯引擎+导出）→ Task 2（接入写入）→ Task 3（读回呈现），每步可独立编译/测试，任一提交点不破坏构建。
