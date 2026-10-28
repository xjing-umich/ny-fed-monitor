# PR A：13F 拆股修正（共享变动层）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让投资人页、个股页持有人、共识榜、季度报告、列表页的“增持 / 减持 / 新建 / 清仓”在拆股前后口径一致，不再出现拆股造成的假增持；同时产出按金额的季度汇总，供 PR B 使用。

**Architecture:**
- **算系数**：一组纯函数（`splitAdjust.ts`）做三件事：从 `stock_splits` 里只挑真拆股并去重；用 13F 自身（跨经理的季末单价、股数比）交叉验证；为每个 (CUSIP, 上季, 本季) 算出股数系数。
- **存表**：系数在 13F 入库后的共识物化步骤里统一计算，写进新表 `split_adjustments`。
- **用系数**：各读取方先用 `rescaleToLatestBasis` 把早期季度的股数换算到最新季口径，再用唯一的 `computeChanges` 比较。`diffHoldings` 改为它的薄封装。
- **季度汇总**：同一步骤用 `summarizeQuarter` 写 `manager_quarter_summary`，列表页改读这张表。

**Tech Stack:** TypeScript、Next.js 16 App Router（RSC、ISR）、Supabase（PostgREST）、`tsx` 跑的 `*.check.ts` 断言脚本（无测试框架）。

**Spec:** `docs/superpowers/specs/2026-10-28-investor-conclusion-first-design.md`（§一 证据、§三 PR A、§五、§六）

## Global Constraints

- 不改 `holdings` 里的 SEC 原始数据；新表只存派生结果，可随时整表重算。
- 两张新表的 DDL、首次回填、列表页切换数据源，上生产前都先经用户确认。DDL 由用户在 Supabase SQL Editor 执行。
- 已定稿报告不重算（`quarterly_reports` 中 status=final 的行由触发器冻结）。Q3 报告生成直接用新口径。
- URL、SSR、JSON-LD、埋点事件名不变；零 hydration。列表页筛选参数 `vf` 的取值仍是 `buying | selling | mixed`。
- 投资人页只新增一次查询（`split_adjustments`）；列表页由 RPC 换为读表，查询数不增加。
- 读取新表时，表缺失（`42P01` / `PGRST205`，即代码先于 DDL 部署）必须优雅降级：系数视为 1，列表页回退旧 RPC。其他查询错误照旧 THROW（详情页不能把错误吞成 404）。
- 真拆股：比例是分母 ≤ 4 的有理数，且不在 (0.8, 1.25) 之内。同 ticker、同比例、30 天内的事件只算一条。
- 校验区间：调整后季末单价比 `q·r ∈ [0.6, 1.67]`，并且 `|ln(q·r)| < |ln q|`。
- 表外推断：至少 2 位持有人的股数比在 r 的 ±1% 以内，并且超过“两季都持有者”的一半。
- 调整后差距在 0.5% 以内记为“未变”（见下方细化 3），只对 `splitFactor ≠ 1` 的行生效。
- 季度汇总：净额绝对值不到上季组合市值的 2% → 基本持平（`mixed`）；金额最大的 5 笔；只算正股；金额按季末价估算。
- 代码注释用中文，风格与周边文件一致；检查脚本用 `node:assert/strict`，相对路径导入，运行方式 `cd web && npx tsx <path>`。
- 所有 git 命令前先导出 `PATH=/private/tmp/claude-501/-Users-junlinzhu-Desktop-TheCompounder/a7c1da3e-a981-4649-8f27-6ea4dc306a59/scratchpad/gitshim:$PATH`（本机 `/usr/local/bin/git` 架构不对）。

**相对 spec 的两处细化（实现时以本计划为准）：**
1. **不单独写回填脚本。** 共识步骤每次都已读入全部经理的 8 季持仓，所以每次运行重算全部季度对、upsert 并删掉过期行。第一次运行即完成回填，之后申报季里证据变强也会自动更新。
2. **表外推断的常见比例加上 1.5**（3:2 拆股，例如 BN、APG、SNEX）：完整列表是 {1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 40, 50} 及其倒数。
3. **“未变”容差用 0.5%，不是 0.1%。** spec 自己举的例子 BN 3:2 拆股后股数 ×1.497，与 1.5 差 0.2%，0.1% 贴不齐。0.5% 与验收探针里“纯拆股”的判定一致。容差只作用于有拆股系数的行。
4. **`ingest-13f.ts` 里的 `assembleManagerDetail` 不传系数。** 那里装配的是刚从 EDGAR 解析、准备写库的数据，`changes` 没有被使用（已核对），传系数不改变任何输出；参数缺省即 `NO_SPLITS`。

## Review Focus

1. **断季**：经理漏报一季（例如有 Q1、Q3，没有 Q2），季度对是 (Q1, Q3)，系数必须按这个实际季度对查，不能按日历相邻季查。→ Task 3 加检查。
2. **同 CUSIP 多行**（子账户、正股 + 期权同 CUSIP）：换算要按“CUSIP + 期权类型”汇总后比较，不能逐行比较导致 0.5% 容差失效；期权行跟着乘系数，但不参与单价证据。→ Task 3（期权不进证据）、Task 4（多行汇总后贴齐、期权行换算）加检查。
3. **拆股日期落在季度边界之外**（表里日期偏移一两天，或除权日与季末同一天）：表事件不在窗口内时，必须还能走推断路径。→ Task 2 加检查。
4. **反向拆股（1:10、1:20）**：BRCC、LU、NFE 这类，系数 < 1 也要被正确识别和换算。→ Task 1、Task 2 加检查。
5. **新表还没建就部署**：详情页、列表页、共识步骤、报告都必须照常工作（系数 = 1，列表回退 RPC），不能 500、不能 404。→ Task 8 加检查。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `web/src/lib/managers/splitAdjust.ts`（新） | 真拆股判定、事件去重、单 CUSIP 系数、全量系数、系数查表、换算到最新季口径。纯函数 |
| `web/src/lib/managers/splitAdjust.check.ts`（新） | 上述函数及与 `assembleManagerDetail` / `deriveConviction` 联动的断言 |
| `web/src/lib/managers/quarterSummary.ts`（新） | `summarizeQuarter`：单笔金额、净额、判定、前 5 笔、计数、清仓排序。纯函数 |
| `web/src/lib/managers/quarterSummary.check.ts`（新） | 断言 |
| `web/src/lib/managers/types.ts` | `Holding.splitFactor?`、`HoldingChange.splitFactor?` |
| `web/src/lib/managers/assemble.ts` | `computeChanges` 透传 `splitFactor`；`assembleManagerDetail` 接收系数查表 |
| `web/src/lib/consensus/compute.ts` | `diffHoldings` 改为 `computeChanges` 的封装，新增 `toScanChanges` |
| `web/src/lib/consensus/compute.check.ts` | 加一致性回归 |
| `web/supabase/migrations/20261028_split_adjustments_and_quarter_summary.sql`（新） | 两张表的 DDL |
| `web/supabase/schema.sql` | 同步两张表定义 |
| `web/scripts/lib/computeConsensus.ts` | 一次读 8 季；算系数并写表；换算后再 diff；写季度汇总 |
| `web/scripts/lib/splitStore.ts`（新） | 新表的行映射、缺表判定、带过期删除的写入。纯映射可测 |
| `web/scripts/lib/splitStore.check.ts`（新） | 行映射与缺表判定断言 |
| `web/src/lib/managers/supabase.ts` | `getManagerDetail` 读系数；`getManagerQoQ` 读汇总表并回退 RPC；导出纯映射 |
| `web/src/lib/managers/priceRead.ts` | `getLatestSplit` 只认真拆股 |
| `web/src/lib/managers/supabaseMap.check.ts`（新） | 汇总行 → `ManagerQoQ` 映射、缺表判定断言 |
| `web/src/lib/reports/types.ts`、`build.ts`、`build.check.ts` | 报告比较前先换算上季股数 |
| `web/scripts/lib/loadReportInput.ts` | 读系数、带上 `priorPeriod` |
| `web/scripts/probe-split-fake-adds.ts` | 改写为验收探针：原始口径与调整后口径对比 |

---

### Task 1：真拆股判定与事件去重

**Files:**
- Create: `web/src/lib/managers/splitAdjust.ts`
- Test: `web/src/lib/managers/splitAdjust.check.ts`

**Interfaces:**
- Produces:
  - `type SplitEvent = { ticker: string; date: string; ratio: number }`（`date` 为 `YYYY-MM-DD`；`ratio` 的含义与 `stock_splits.ratio` 相同，10 拆 1 → 10，1:10 并股 → 0.1）
  - `isRealSplit(ratio: number): boolean`
  - `dedupeSplitEvents(events: SplitEvent[]): SplitEvent[]`

- [ ] **Step 1: 写失败的检查**

`web/src/lib/managers/splitAdjust.check.ts`：

```ts
// 运行: cd web && npx tsx src/lib/managers/splitAdjust.check.ts
import assert from "node:assert/strict";
import { isRealSplit, dedupeSplitEvents } from "./splitAdjust";

// ── 真拆股 vs 价格复权(Yahoo 把分拆上市/股票股息也记成小数"拆股",股数并不变) ──
for (const r of [2, 3, 4, 5, 10, 25, 1.5, 4 / 3, 0.5, 0.25, 0.1, 0.05, 1 / 12, 0.333333]) assert.ok(isRealSplit(r), `真拆股 ${r}`);
for (const r of [1.067, 1.241, 1.272, 1.01, 0.9535, 2.793, 6.665, 2.39, 1.472, 1.327, 0, -2, NaN, Infinity]) assert.ok(!isRealSplit(r), `非真拆股 ${r}`);

// ── 去重:同 ticker、同比例、30 天内只留最早一条;不同比例、不同 ticker、超过 30 天都保留 ──
const ev = dedupeSplitEvents([
  { ticker: "WLFC", date: "2026-07-21", ratio: 3 },
  { ticker: "WLFC", date: "2026-07-20", ratio: 3 },
  { ticker: "BRCC", date: "2026-08-21", ratio: 0.1 },
  { ticker: "BRCC", date: "2026-08-24", ratio: 0.1 },
  { ticker: "APH", date: "2026-05-01", ratio: 2 },
  { ticker: "APH", date: "2026-09-03", ratio: 2 },
  { ticker: "X", date: "2026-07-01", ratio: 2 },
  { ticker: "X", date: "2026-07-05", ratio: 3 },
]);
assert.deepEqual(
  ev.map((e) => `${e.ticker}@${e.date}x${e.ratio}`),
  ["APH@2026-05-01x2", "APH@2026-09-03x2", "BRCC@2026-08-21x0.1", "WLFC@2026-07-20x3", "X@2026-07-01x2", "X@2026-07-05x3"],
);
console.log("splitAdjust.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx src/lib/managers/splitAdjust.check.ts`
Expected: FAIL，找不到模块 `./splitAdjust`

- [ ] **Step 3: 最小实现**

`web/src/lib/managers/splitAdjust.ts`：

```ts
// splitAdjust.ts — 13F 股数的拆股口径统一(纯函数,无 I/O)。
// 两季之间拆股,13F 原始股数会按比例跳变(10 拆 1 → 股数 ×10),直接相减会把"没动"记成"加仓 +900%",
// 甚至把真实减仓记成加仓(2026-10 生产库最新季 24 条,11 条方向相反)。这里只做派生:不改 holdings 原始数据。

/** 拆股事件。ratio 同 stock_splits.ratio:10 拆 1 → 10,1:10 并股 → 0.1。date = YYYY-MM-DD。 */
export type SplitEvent = { ticker: string; date: string; ratio: number };

// Yahoo 把分拆上市/股票股息也记成小数"拆股"(CMCSA 1.067、FDX 1.241、DD 2.39),那是价格复权,股数不变。
// 真拆股 = 比例是小分母有理数(3:2、2:1、4:3、1:10…)且偏离 1 足够大。
const PSEUDO_LOW = 0.8;
const PSEUDO_HIGH = 1.25;
const RATIONAL_TOL = 1e-3; // 库里 numeric 可能是 0.333333 这类截断值

export function isRealSplit(ratio: number): boolean {
  if (!Number.isFinite(ratio) || ratio <= 0) return false;
  if (ratio > PSEUDO_LOW && ratio < PSEUDO_HIGH) return false;
  const nearInt = (x: number) => Math.abs(x - Math.round(x)) < RATIONAL_TOL;
  return [1, 2, 3, 4].some((den) => nearInt(ratio * den) || nearInt(den / ratio));
}

const DEDUPE_DAYS = 30;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(b) - Date.parse(a)) / 86_400_000;

/** 同 ticker、同比例、30 天内的重复事件只留最早一条(Yahoo 偶有同一拆股记两天,如 WLFC 7/20 与 7/21)。 */
export function dedupeSplitEvents(events: SplitEvent[]): SplitEvent[] {
  const sorted = [...events].sort((a, b) => a.ticker.localeCompare(b.ticker) || a.date.localeCompare(b.date));
  const out: SplitEvent[] = [];
  for (const e of sorted) {
    const dup = out.some((k) => k.ticker === e.ticker && Math.abs(k.ratio - e.ratio) < 1e-9 && daysApart(k.date, e.date) <= DEDUPE_DAYS);
    if (!dup) out.push(e);
  }
  return out;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd web && npx tsx src/lib/managers/splitAdjust.check.ts`
Expected: `splitAdjust.check OK`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/managers/splitAdjust.ts web/src/lib/managers/splitAdjust.check.ts
git commit -m "feat(13f): 真拆股判定与拆股事件去重"
```

---

### Task 2：单个 CUSIP、单个季度对的拆股系数

**Files:**
- Modify: `web/src/lib/managers/splitAdjust.ts`
- Test: `web/src/lib/managers/splitAdjust.check.ts`

**Interfaces:**
- Consumes: Task 1 的 `SplitEvent`、`isRealSplit`、`dedupeSplitEvents`
- Produces:
  - `type PairHolder = { prevShares: number; shares: number }`：两季都持有的一位经理，正股按 CUSIP 汇总
  - `type SplitEvidence = { q: number; r: number; events: { date: string; ratio: number }[]; matching: number; bothHolders: number }`
  - `type SplitFactor = { cusip: string; ticker: string | null; fromPeriod: string; toPeriod: string; factor: number; source: "table" | "inferred"; evidence: SplitEvidence }`
  - `deriveSplitFactor(input: { cusip: string; ticker: string | null; fromPeriod: string; toPeriod: string; priceRatio: number; both: PairHolder[]; events: SplitEvent[] }): SplitFactor | null`
    - `priceRatio` = 本季末单价中位数 ÷ 上季末单价中位数
    - `events` = 该 ticker 的全部事件，不限日期
  - 常量 `PLAUSIBLE_MIN = 0.6`、`PLAUSIBLE_MAX = 1.67`、`MATCH_TOL = 0.01`、`INFER_RATIOS`

- [ ] **Step 1: 写失败的检查**

追加到 `splitAdjust.check.ts`（`console.log` 之前；把顶部 import 改为同时导入 `deriveSplitFactor`）：

```ts
import { deriveSplitFactor } from "./splitAdjust";

const pair = { cusip: "C", ticker: "T", fromPeriod: "2026-03-31", toPeriod: "2026-06-30" };
const H = (...ratios: number[]) => ratios.map((r) => ({ prevShares: 1000, shares: 1000 * r }));

// 表内 5 拆 1(CVNA 形态):单价 ÷5 附近,持有人股数各有增减 → 采用 5,来源 table。
{
  const f = deriveSplitFactor({ ...pair, priceRatio: 0.21, both: H(4.97, 4.43, 6.0, 6.75), events: [{ ticker: "T", date: "2026-05-01", ratio: 5 }] });
  assert.equal(f?.factor, 5); assert.equal(f?.source, "table");
  assert.equal(f?.evidence.bothHolders, 4);
}
// 表内只有一位持有人也可以(价格证据 + 表事件)。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.11, both: H(8.44), events: [{ ticker: "T", date: "2026-06-30", ratio: 10 }] })?.factor, 10, "除权日=季末当天算在本季");
// 表内伪拆股(分拆复权 1.067)→ 不调整。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.9, both: H(1.0, 1.02), events: [{ ticker: "T", date: "2026-05-01", ratio: 1.067 }] }), null);
// 表内重复事件(同比例 30 天内两条)→ 只算一次,系数 3 而不是 9。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.34, both: H(3, 3), events: [{ ticker: "T", date: "2026-05-20", ratio: 3 }, { ticker: "T", date: "2026-05-21", ratio: 3 }] })?.factor, 3);
// 表事件与价格矛盾(单价没跳变)→ 不采用表事件;推断也不成立 → null。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 1.05, both: H(1.1, 0.9), events: [{ ticker: "T", date: "2026-05-01", ratio: 2 }] }), null);
// 反向拆股 1:10:单价 ×10、股数 ×0.1 → 系数 0.1。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 9.5, both: H(0.1), events: [{ ticker: "T", date: "2026-05-01", ratio: 0.1 }] })?.factor, 0.1);
// 表外推断:单价减半、3 位持有人里 2 位股数恰好翻倍 → inferred 2。
{
  const f = deriveSplitFactor({ ...pair, priceRatio: 0.52, both: H(2.0, 2.005, 1.3), events: [] });
  assert.equal(f?.factor, 2); assert.equal(f?.source, "inferred"); assert.equal(f?.evidence.matching, 2);
}
// 表事件日期落在窗口外(表记错到下季初),但 13F 已体现 → 走推断。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.26, both: H(4, 4, 4), events: [{ ticker: "T", date: "2026-07-02", ratio: 4 }] })?.source, "inferred");
// 表外、只有一位持有人 → 无法交叉验证,不调整。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.5, both: H(2), events: [] }), null);
// 表外、恰好一半人翻倍(不过半)→ 不调整。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.5, both: H(2, 2, 1, 1), events: [] }), null);
// 股价腰斩但股数没变(崩盘,不是拆股)→ 不调整。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.5, both: H(1, 1, 1.01), events: [] }), null);
// 单价缺失(NaN / 0)→ 不调整。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: NaN, both: H(2, 2), events: [] }), null);
// 3:2(1.5)也在推断表里。
assert.equal(deriveSplitFactor({ ...pair, priceRatio: 0.67, both: H(1.5, 1.497, 1.5), events: [] })?.factor, 1.5);
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx src/lib/managers/splitAdjust.check.ts`
Expected: FAIL，`deriveSplitFactor` 未导出

- [ ] **Step 3: 实现**

追加到 `splitAdjust.ts`：

```ts
/** 两季都持有该 CUSIP 的一位经理(正股,按 CUSIP 汇总)。 */
export type PairHolder = { prevShares: number; shares: number };
export type SplitEvidence = { q: number; r: number; events: { date: string; ratio: number }[]; matching: number; bothHolders: number };
export type SplitFactor = {
  cusip: string;
  ticker: string | null;
  fromPeriod: string;
  toPeriod: string;
  /** 上季股数 × factor = 本季口径。 */
  factor: number;
  source: "table" | "inferred";
  evidence: SplitEvidence;
};

// 调整后季末单价比的合理区间:一个季度股价涨跌超出 0.6–1.67 倍时,不靠拆股解释。
export const PLAUSIBLE_MIN = 0.6;
export const PLAUSIBLE_MAX = 1.67;
// 表外推断:持有人股数比与 r 相差 ±1% 以内才算"按同一比例变化"。
export const MATCH_TOL = 0.01;
export const INFER_RATIOS = [1.5, 2, 3, 4, 5, 6, 8, 10, 15, 20, 25, 40, 50];

/**
 * 单个 CUSIP、单个季度对(上季 → 本季)的拆股系数;不需要调整 → null(= 系数 1)。
 * - 有表事件(真拆股、去重、日期在 (上季末, 本季末]):价格证据成立即采用,一位持有人也行。
 * - 否则表外推断:价格证据成立,且 ≥2 位、超过半数的两季持有者股数按同一比例变化。
 * 价格证据 = 调整后单价比 q·r 落在合理区间,且比不调整更平滑。股价腰斩不会让多数人股数同步翻倍;
 * 单个经理恰好加仓一倍不会让单价减半 —— 两条证据一起用,单靠任一条都会误判。
 */
export function deriveSplitFactor(input: {
  cusip: string;
  ticker: string | null;
  fromPeriod: string;
  toPeriod: string;
  priceRatio: number;
  both: PairHolder[];
  events: SplitEvent[];
}): SplitFactor | null {
  const { cusip, ticker, fromPeriod, toPeriod, priceRatio: q, both, events } = input;
  if (!Number.isFinite(q) || q <= 0) return null;
  const plausible = (r: number) => {
    const x = q * r;
    return x >= PLAUSIBLE_MIN && x <= PLAUSIBLE_MAX && Math.abs(Math.log(x)) < Math.abs(Math.log(q));
  };
  const ratios = both.filter((h) => h.prevShares > 0 && h.shares > 0).map((h) => h.shares / h.prevShares);
  const matching = (r: number) => ratios.filter((x) => Math.abs(x / r - 1) <= MATCH_TOL).length;
  const base = { cusip, ticker, fromPeriod, toPeriod };

  const inWindow = dedupeSplitEvents(events).filter((e) => isRealSplit(e.ratio) && e.date > fromPeriod && e.date <= toPeriod);
  if (inWindow.length) {
    const r = inWindow.reduce((acc, e) => acc * e.ratio, 1);
    if (plausible(r)) {
      return { ...base, factor: r, source: "table", evidence: { q, r, events: inWindow.map(({ date, ratio }) => ({ date, ratio })), matching: matching(r), bothHolders: ratios.length } };
    }
  }

  let best: { r: number; m: number } | null = null;
  for (const b of INFER_RATIOS) {
    for (const r of [b, 1 / b]) {
      const m = matching(r);
      if (m >= 2 && m > ratios.length / 2 && plausible(r) && (!best || m > best.m)) best = { r, m };
    }
  }
  if (!best) return null;
  return { ...base, factor: best.r, source: "inferred", evidence: { q, r: best.r, events: [], matching: best.m, bothHolders: ratios.length } };
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd web && npx tsx src/lib/managers/splitAdjust.check.ts`
Expected: `splitAdjust.check OK`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/managers/splitAdjust.ts web/src/lib/managers/splitAdjust.check.ts
git commit -m "feat(13f): 单 CUSIP 拆股系数(表事件 + 13F 交叉验证)"
```

---

### Task 3：全量系数与查表

**Files:**
- Modify: `web/src/lib/managers/splitAdjust.ts`
- Test: `web/src/lib/managers/splitAdjust.check.ts`

**Interfaces:**
- Consumes: Task 2 的 `deriveSplitFactor`、`SplitFactor`
- Produces:
  - `type HistoryHolding = { cusip: string; putCall?: string | null; shares: number; value: number }`
  - `type ManagerHistory = { slug: string; filings: { period: string; holdings: HistoryHolding[] }[] }`（filings 顺序不限）
  - `deriveSplitFactors(histories: ManagerHistory[], tickerOf: (cusip: string) => string | null, events: SplitEvent[]): SplitFactor[]`
  - `type SplitFactorLookup = (cusip: string, fromPeriod: string, toPeriod: string) => number`
  - `NO_SPLITS: SplitFactorLookup`（恒为 1）
  - `factorLookup(rows: { cusip: string; fromPeriod: string; toPeriod: string; factor: number }[]): SplitFactorLookup`

- [ ] **Step 1: 写失败的检查**

追加到 `splitAdjust.check.ts`（import 增加 `deriveSplitFactors, factorLookup, NO_SPLITS`）：

```ts
import { deriveSplitFactors, factorLookup, NO_SPLITS } from "./splitAdjust";

{
  // 三位经理持有 C(表里 2 拆 1,发生在 Q2);C 的季末单价 Q1 100、Q2 51。
  // m3 漏报 Q2:它的季度对是 (Q1, Q3),单独成组,不能套用 (Q1, Q2) 的系数。
  const h = (cusip: string, shares: number, px: number, putCall?: string) => ({ cusip, shares, value: shares * px, putCall });
  const Q1 = "2026-03-31", Q2 = "2026-06-30", Q3 = "2026-09-30";
  const histories = [
    { slug: "m1", filings: [{ period: Q1, holdings: [h("C", 100, 100), h("D", 10, 50)] }, { period: Q2, holdings: [h("C", 210, 51), h("D", 10, 55), h("C", 5, 51, "Call")] }] },
    { slug: "m2", filings: [{ period: Q2, holdings: [h("C", 400, 51)] }, { period: Q1, holdings: [h("C", 200, 100)] }] },
    { slug: "m3", filings: [{ period: Q1, holdings: [h("C", 50, 100)] }, { period: Q3, holdings: [h("C", 50, 100)] }] },
  ];
  const fs = deriveSplitFactors(histories, (c) => (c === "C" ? "CC" : null), [{ ticker: "CC", date: "2026-05-15", ratio: 2 }]);
  assert.deepEqual(fs.map((f) => `${f.cusip}|${f.fromPeriod}|${f.toPeriod}|${f.factor}|${f.source}`), [`C|${Q1}|${Q2}|2|table`], "只有 (Q1,Q2) 的 C;D 未拆、m3 的 (Q1,Q3) 价格未跳变");
  assert.equal(fs[0].evidence.bothHolders, 2, "期权行不计入持有人证据");

  const look = factorLookup(fs);
  assert.equal(look("C", Q1, Q2), 2);
  assert.equal(look("C", Q1, Q3), 1, "断季的季度对查不到 → 1");
  assert.equal(look("D", Q1, Q2), 1);
  assert.equal(NO_SPLITS("C", Q1, Q2), 1);
}
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx src/lib/managers/splitAdjust.check.ts`
Expected: FAIL，`deriveSplitFactors` 未导出

- [ ] **Step 3: 实现**

追加到 `splitAdjust.ts`：

```ts
export type HistoryHolding = { cusip: string; putCall?: string | null; shares: number; value: number };
export type ManagerHistory = { slug: string; filings: { period: string; holdings: HistoryHolding[] }[] };
export type SplitFactorLookup = (cusip: string, fromPeriod: string, toPeriod: string) => number;
export const NO_SPLITS: SplitFactorLookup = () => 1;

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** 正股按 CUSIP 汇总(13F 同券可多行/子账户);期权行不计入股数与单价证据。 */
function longByCusip(holdings: HistoryHolding[]): Map<string, { shares: number; value: number }> {
  const out = new Map<string, { shares: number; value: number }>();
  for (const h of holdings) {
    if (h.putCall) continue;
    const e = out.get(h.cusip) ?? { shares: 0, value: 0 };
    e.shares += h.shares;
    e.value += h.value;
    out.set(h.cusip, e);
  }
  return out;
}

/**
 * 全部经理、全部相邻季度对的拆股系数。季度对按每位经理实际申报的相邻两季(漏报一季时是 (Q1,Q3)),
 * 同一季度对的经理合在一起做交叉验证。季末单价取同一季全部持有人的中位数(同券同日同价,中位数抗个别脏行)。
 */
export function deriveSplitFactors(histories: ManagerHistory[], tickerOf: (cusip: string) => string | null, events: SplitEvent[]): SplitFactor[] {
  const prices = new Map<string, number[]>(); // `${cusip}|${period}` → 各持有人季末单价
  const pairs = new Map<string, { fromPeriod: string; toPeriod: string; holders: Map<string, PairHolder[]> }>();
  for (const m of histories) {
    const asc = [...m.filings].sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
    const agg = asc.map((f) => longByCusip(f.holdings));
    asc.forEach((f, i) => {
      for (const [cusip, e] of agg[i]) {
        if (e.shares <= 0 || e.value <= 0) continue;
        const k = `${cusip}|${f.period}`;
        const a = prices.get(k) ?? [];
        a.push(e.value / e.shares);
        prices.set(k, a);
      }
    });
    for (let i = 0; i + 1 < asc.length; i++) {
      const prev = agg[i], cur = agg[i + 1];
      if (!prev.size || !cur.size) continue;
      const pk = `${asc[i].period}|${asc[i + 1].period}`;
      const p = pairs.get(pk) ?? { fromPeriod: asc[i].period, toPeriod: asc[i + 1].period, holders: new Map<string, PairHolder[]>() };
      for (const [cusip, c] of cur) {
        const pv = prev.get(cusip);
        if (!pv) continue;
        const a = p.holders.get(cusip) ?? [];
        a.push({ prevShares: pv.shares, shares: c.shares });
        p.holders.set(cusip, a);
      }
      pairs.set(pk, p);
    }
  }

  const byTicker = new Map<string, SplitEvent[]>();
  for (const e of events) {
    const a = byTicker.get(e.ticker) ?? [];
    a.push(e);
    byTicker.set(e.ticker, a);
  }

  const out: SplitFactor[] = [];
  for (const p of pairs.values()) {
    for (const [cusip, both] of p.holders) {
      const ticker = tickerOf(cusip);
      const q = median(prices.get(`${cusip}|${p.toPeriod}`) ?? []) / median(prices.get(`${cusip}|${p.fromPeriod}`) ?? []);
      const f = deriveSplitFactor({ cusip, ticker, fromPeriod: p.fromPeriod, toPeriod: p.toPeriod, priceRatio: q, both, events: ticker ? byTicker.get(ticker) ?? [] : [] });
      if (f) out.push(f);
    }
  }
  return out.sort((a, b) => a.cusip.localeCompare(b.cusip) || a.fromPeriod.localeCompare(b.fromPeriod));
}

export function factorLookup(rows: { cusip: string; fromPeriod: string; toPeriod: string; factor: number }[]): SplitFactorLookup {
  const m = new Map(rows.map((r) => [`${r.cusip}|${r.fromPeriod}|${r.toPeriod}`, r.factor]));
  return (cusip, fromPeriod, toPeriod) => m.get(`${cusip}|${fromPeriod}|${toPeriod}`) ?? 1;
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd web && npx tsx src/lib/managers/splitAdjust.check.ts`
Expected: `splitAdjust.check OK`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/managers/splitAdjust.ts web/src/lib/managers/splitAdjust.check.ts
git commit -m "feat(13f): 全量拆股系数与查表"
```

---

### Task 4：换算到最新季口径，统一唯一的变动比较

**Files:**
- Modify: `web/src/lib/managers/splitAdjust.ts`
- Modify: `web/src/lib/managers/types.ts`（`Holding`、`HoldingChange` 各加 `splitFactor?: number`）
- Modify: `web/src/lib/managers/assemble.ts`
- Modify: `web/src/lib/consensus/compute.ts:258-273`（`diffHoldings`）
- Test: `web/src/lib/managers/splitAdjust.check.ts`、`web/src/lib/consensus/compute.check.ts`

**Interfaces:**
- Consumes: Task 3 的 `SplitFactorLookup`、`NO_SPLITS`、`factorLookup`
- Produces:
  - `SNAP_TOL = 0.005`
  - `rescaleToLatestBasis<H extends { cusip: string; putCall?: string | null; shares: number; splitFactor?: number }, F extends { period: string; holdings: H[] }>(filings: F[], lookup: SplitFactorLookup): F[]`
    - 返回按 period **降序**的新数组，最新季原样
    - 较早季的行 `shares` 换算成最新季口径，`splitFactor` = 累计系数（≠ 1 时才写）
  - `computeChanges(latest, prior)`：签名不变，增持 / 减持行带 `splitFactor: prior 行的 splitFactor`
  - `assembleManagerDetail(manager, filings, lookup: SplitFactorLookup = NO_SPLITS)`：`detail.filings` 是换算后的数组
  - `toScanChanges(changes: HoldingChange[]): ScanChange[]`（compute.ts）
  - `diffHoldings(latest, prior)`：签名不变，内部改用 `computeChanges`

- [ ] **Step 1: 写失败的检查（换算 + 联动）**

追加到 `splitAdjust.check.ts`（import 增加 `rescaleToLatestBasis`；再加 `import { assembleManagerDetail } from "./assemble"; import { deriveConviction } from "./conviction";`）：

```ts
import { rescaleToLatestBasis } from "./splitAdjust";
import { assembleManagerDetail } from "./assemble";
import { deriveConviction } from "./conviction";

{
  const Q1 = "2026-03-31", Q2 = "2026-06-30", Q3 = "2026-09-30";
  // B:Q2 拆 3:2、Q3 拆 2:1;零碎股换现金 → Q2 只有 ×1.497。A:无拆股。B 的 Call 行同 CUSIP。
  const look = factorLookup([
    { cusip: "B", fromPeriod: Q1, toPeriod: Q2, factor: 1.5 },
    { cusip: "B", fromPeriod: Q2, toPeriod: Q3, factor: 2 },
  ]);
  const hold = (cusip: string, shares: number, putCall?: string) => ({ cusip, issuer: cusip, shares, value: shares, putCall, weight: 0.1 });
  const filings = [
    { period: Q1, filedAt: "", accession: "1", totalValue: 0, holdings: [hold("A", 100), hold("B", 1000), hold("B", 10, "Call")] },
    { period: Q3, filedAt: "", accession: "3", totalValue: 0, holdings: [hold("A", 120), hold("B", 2994), hold("B", 30, "Call")] },
    { period: Q2, filedAt: "", accession: "2", totalValue: 0, holdings: [hold("A", 100), hold("B", 1497), hold("B", 15, "Call")] },
  ];
  const r = rescaleToLatestBasis(filings, look);
  assert.deepEqual(r.map((f) => f.period), [Q3, Q2, Q1], "降序");
  assert.equal(r[0].holdings.find((h) => h.cusip === "B" && !h.putCall)!.shares, 2994, "最新季不动");
  assert.equal(r[0].holdings[0].splitFactor, undefined);
  const q2b = r[1].holdings.find((h) => h.cusip === "B" && !h.putCall)!;
  assert.equal(q2b.shares, 2994); assert.equal(q2b.splitFactor, 2);
  const q1b = r[2].holdings.find((h) => h.cusip === "B" && !h.putCall)!;
  assert.equal(q1b.shares, 2994, "1000×1.5×2=3000,与 Q2 换算后的 2994 差 0.2%(<0.5%)→ 贴齐为未变");
  assert.equal(r[2].holdings.find((h) => h.cusip === "B" && h.putCall)!.shares, 30, "期权行同样换算");
  assert.equal(r[2].holdings.find((h) => h.cusip === "A")!.shares, 100, "无拆股不动");
  assert.equal(filings[0].holdings[1].shares, 1000, "不改入参");

  // 同券两行(子账户):按 CUSIP+期权类型汇总后与下一季比较,贴齐后两行合计 = 下一季合计。
  const multi = rescaleToLatestBasis([
    { period: Q1, holdings: [hold("M", 500), hold("M", 500)] },
    { period: Q2, holdings: [hold("M", 1996)] },
  ], factorLookup([{ cusip: "M", fromPeriod: Q1, toPeriod: Q2, factor: 2 }]));
  const mSum = multi[1].holdings.reduce((t, x) => t + x.shares, 0);
  assert.ok(Math.abs(mSum - 1996) < 1e-9, `多行汇总贴齐,got ${mSum}`);

  // 联动:投资人页的本季变动与 8 季信号。B 只是拆股 → 不是增持;A 是真增持。
  const mgr = { cik: "1", slug: "m", name: "M", person: "M" };
  const d = assembleManagerDetail(mgr, filings, look);
  assert.deepEqual(d.changes.filter((c) => !c.putCall).map((c) => `${c.cusip}:${c.kind}`), ["A:increased"]);
  const raw = assembleManagerDetail(mgr, filings);
  assert.ok(raw.changes.some((c) => c.cusip === "B" && c.kind === "increased"), "不传系数 = 旧行为(对照)");
  assert.ok(!deriveConviction(d.filings, 12).some((p) => p.cusip === "B" && p.signal === "accumulating"), "拆股季不算连续增持");
}
{
  // 贴齐只对有系数的行:无拆股的 0.05% 小变动仍记为增持。
  // (另:拆股行若差 0.6%(>0.5%)不贴齐,见下方 KLAC 例的真实减持。)
  const look = factorLookup([]);
  const hold = (shares: number) => ({ cusip: "Z", issuer: "Z", shares, value: shares, weight: 0.1 });
  const d = assembleManagerDetail({ cik: "1", slug: "m", name: "M", person: "M" }, [
    { period: "2026-03-31", filedAt: "", accession: "1", totalValue: 0, holdings: [hold(10000)] },
    { period: "2026-06-30", filedAt: "", accession: "2", totalValue: 0, holdings: [hold(10005)] },
  ], look);
  assert.equal(d.changes[0]?.kind, "increased");
}
{
  // 拆股后真减仓:10 拆 1,股数 ×8.44 → 实际 −15.6%,必须是减持并带 splitFactor。
  const look = factorLookup([{ cusip: "K", fromPeriod: "2026-03-31", toPeriod: "2026-06-30", factor: 10 }]);
  const hold = (shares: number) => ({ cusip: "K", issuer: "K", shares, value: shares, weight: 0.1 });
  const d = assembleManagerDetail({ cik: "1", slug: "m", name: "M", person: "M" }, [
    { period: "2026-03-31", filedAt: "", accession: "1", totalValue: 0, holdings: [hold(1000)] },
    { period: "2026-06-30", filedAt: "", accession: "2", totalValue: 0, holdings: [hold(8440)] },
  ], look);
  assert.equal(d.changes[0].kind, "decreased");
  assert.equal(d.changes[0].prevShares, 10000);
  assert.equal(d.changes[0].splitFactor, 10);
  assert.ok(Math.abs(d.changes[0].deltaPct! + 0.156) < 1e-9);
}
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx src/lib/managers/splitAdjust.check.ts`
Expected: FAIL，`rescaleToLatestBasis` 未导出

- [ ] **Step 3: 实现**

`types.ts`：在 `Holding` 和 `HoldingChange` 末尾各加一行：

```ts
  /** 拆股换算系数(换算到最新季口径时写入;≠1 才有)。见 splitAdjust.ts。 */
  splitFactor?: number;
```

`splitAdjust.ts` 追加：

```ts
// 零碎股按惯例换成现金:BN 3:2 拆股后股数是 ×1.497 而不是 ×1.5(差 0.2%)。有拆股系数的行,换算后与下一季相差 0.5% 以内即贴齐为"未变"。
export const SNAP_TOL = 0.005;

/**
 * 把较早各季的股数换算到最新季口径(乘以"从该季到最新季"的累计系数),返回按 period 降序的新数组,不改入参。
 * 按 CUSIP+期权类型汇总后再判断是否贴齐(同券多行时逐行比会让容差失效);期权行同样乘系数。
 */
export function rescaleToLatestBasis<
  H extends { cusip: string; putCall?: string | null; shares: number; splitFactor?: number },
  F extends { period: string; holdings: H[] },
>(filings: F[], lookup: SplitFactorLookup): F[] {
  const desc = [...filings].sort((a, b) => (a.period < b.period ? 1 : a.period > b.period ? -1 : 0));
  if (desc.length < 2) return desc;
  const keyOf = (h: H) => `${h.cusip}|${h.putCall ?? ""}`;
  const totals = (hs: H[]) => {
    const m = new Map<string, number>();
    for (const h of hs) m.set(keyOf(h), (m.get(keyOf(h)) ?? 0) + h.shares);
    return m;
  };
  const out: F[] = [desc[0]];
  let cum = new Map<string, number>(); // cusip → 从下一季到最新季的累计系数
  let nextTotals = totals(desc[0].holdings);
  for (let i = 1; i < desc.length; i++) {
    const f = desc[i];
    const toPeriod = desc[i - 1].period;
    const stepCum = new Map<string, number>();
    const cusips = new Set([...cum.keys(), ...f.holdings.map((h) => h.cusip)]);
    for (const c of cusips) stepCum.set(c, (cum.get(c) ?? 1) * lookup(c, f.period, toPeriod));
    const adjTotals = new Map<string, number>();
    for (const h of f.holdings) adjTotals.set(keyOf(h), (adjTotals.get(keyOf(h)) ?? 0) + h.shares * stepCum.get(h.cusip)!);
    const holdings = f.holdings.map((h) => {
      const c = stepCum.get(h.cusip)!;
      if (c === 1) return h;
      let shares = h.shares * c;
      const stepFactor = lookup(h.cusip, f.period, toPeriod);
      const adj = adjTotals.get(keyOf(h))!;
      const next = nextTotals.get(keyOf(h));
      if (stepFactor !== 1 && next != null && adj > 0 && Math.abs(adj - next) <= SNAP_TOL * next) shares = shares * (next / adj);
      return { ...h, shares, splitFactor: c };
    });
    out.push({ ...f, holdings });
    cum = stepCum;
    nextTotals = totals(holdings);
  }
  return out;
}
```

`assemble.ts`：
- 顶部加 `import { NO_SPLITS, rescaleToLatestBasis, type SplitFactorLookup } from "./splitAdjust";`
- 在 `computeChanges` 的 increased / decreased 分支对象里加 `splitFactor: ph.splitFactor`。
- `assembleManagerDetail` 改为：

```ts
export function assembleManagerDetail(manager: Manager, filings: FilingData[], splits: SplitFactorLookup = NO_SPLITS): ManagerDetail {
  // 拆股:较早各季股数先换算到最新季口径,本季变动与 8 季信号(conviction)同用一份(见 splitAdjust.ts)。
  const sorted = rescaleToLatestBasis(filings, splits);
  const latest = sorted[0];
  const prior = sorted[1];
  // (下面零持仓注释与 changes 行保持原样)
```

同时把注释块里“按 period 降序排序”改为“按 period 降序排序，较早各季股数换算到最新季口径”。

`compute.ts`：在文件顶部 import 区加入：

```ts
import { computeChanges } from "../managers/assemble";
import type { HoldingChange } from "../managers/types";
```

把 `diffHoldings` 整个函数替换为：

```ts
// QoQ 变动:全站唯一口径是 managers/assemble.ts 的 computeChanges(按 cusip+期权类型、可带拆股换算);这里只做形状转换。
export type DiffRow = { cusip: string; issuer: string; value: number | string; shares: number | string; put_call?: string | null; splitFactor?: number };
export function toScanChanges(changes: HoldingChange[]): ScanChange[] {
  return changes.map((c) => ({ cusip: c.cusip, issuer: c.issuer, kind: c.kind, value: c.value, putCall: c.putCall }));
}
export function diffHoldings(latest: DiffRow[], prior: DiffRow[]): ScanChange[] {
  const toH = (h: DiffRow) => ({ cusip: h.cusip, issuer: h.issuer, value: Number(h.value), shares: Number(h.shares), putCall: h.put_call ?? undefined, splitFactor: h.splitFactor });
  return toScanChanges(computeChanges(latest.map(toH), prior.map(toH)));
}
```

- [ ] **Step 4: 一致性回归（无拆股时新旧逐条一致）**

追加到 `web/src/lib/consensus/compute.check.ts` 末尾的 OK 打印之前：

```ts
// diffHoldings 改为 computeChanges 的封装:无拆股 fixture 上与旧实现逐条一致(含顺序、期权键、清仓取上季市值)。
{
  const legacy = (latest: DiffRow[], prior: DiffRow[]) => {
    const k = (h: DiffRow) => `${h.cusip}|${h.put_call ?? ""}`;
    const lm = new Map(latest.map((h) => [k(h), h])), pm = new Map(prior.map((h) => [k(h), h]));
    const out: ScanChange[] = [];
    for (const [key, lh] of lm) {
      const ph = pm.get(key);
      if (!ph) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "new", value: Number(lh.value), putCall: lh.put_call ?? undefined });
      else if (Number(lh.shares) > Number(ph.shares)) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "increased", value: Number(lh.value), putCall: lh.put_call ?? undefined });
      else if (Number(lh.shares) < Number(ph.shares)) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "decreased", value: Number(lh.value), putCall: lh.put_call ?? undefined });
    }
    for (const [key, ph] of pm) if (!lm.has(key)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", value: Number(ph.value), putCall: ph.put_call ?? undefined });
    return out;
  };
  const L: DiffRow[] = [
    { cusip: "A", issuer: "A", value: "200", shares: "20" }, { cusip: "B", issuer: "B", value: 50, shares: 5 },
    { cusip: "C", issuer: "C", value: 10, shares: 1, put_call: "Put" }, { cusip: "D", issuer: "D", value: 9, shares: 9 },
  ];
  const P: DiffRow[] = [
    { cusip: "A", issuer: "A", value: 100, shares: 10 }, { cusip: "B", issuer: "B", value: 60, shares: 6 },
    { cusip: "C", issuer: "C", value: 10, shares: 1 }, { cusip: "D", issuer: "D", value: 9, shares: 9 }, { cusip: "E", issuer: "E", value: 7, shares: 7 },
  ];
  assert.deepEqual(diffHoldings(L, P), legacy(L, P));
}
```

（若 `compute.check.ts` 顶部尚未导入 `DiffRow`、`ScanChange`、`assert`，按该文件现有导入风格补上：`DiffRow`、`ScanChange` 从 `./compute` 以 `type` 导入；该文件若用自定义 `assert(c, m)` 而非 `node:assert/strict`，就把 `assert.deepEqual(a, b)` 改为 `assert(JSON.stringify(a) === JSON.stringify(b), "diffHoldings 与旧实现一致")`。）

- [ ] **Step 5: 运行全部相关检查**

Run: `cd web && npx tsx src/lib/managers/splitAdjust.check.ts && npx tsx src/lib/consensus/compute.check.ts && npx tsx src/lib/managers/assemble.check.ts && npx tsx src/lib/managers/rowSignals.check.ts && npx tsx src/lib/reports/build.check.ts`
Expected: 五个 `OK`

- [ ] **Step 6: 类型检查**

Run: `cd web && npx tsc --noEmit -p . 2>&1 | head -20`
Expected: 无输出

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/managers/splitAdjust.ts web/src/lib/managers/splitAdjust.check.ts web/src/lib/managers/types.ts web/src/lib/managers/assemble.ts web/src/lib/consensus/compute.ts web/src/lib/consensus/compute.check.ts
git commit -m "feat(13f): 股数换算到最新季口径;diffHoldings 并入 computeChanges"
```

---

### Task 5：季度汇总（按金额）

**Files:**
- Create: `web/src/lib/managers/quarterSummary.ts`
- Test: `web/src/lib/managers/quarterSummary.check.ts`

**Interfaces:**
- Consumes: `Holding`、`HoldingChange`（含 Task 4 的 `splitFactor`）
- Produces:
  - `type QuarterVerdict = "buying" | "selling" | "mixed"`
  - `type QuarterMove = { cusip: string; issuer: string; kind: HoldingChange["kind"]; flowUsd: number; deltaPct: number | null; weightAfter: number | null; splitFactor?: number }`
  - `type QuarterSummary = { period: string; priorPeriod: string; latestValue: number; priorValue: number; latestCount: number; priorCount: number; netFlowUsd: number; verdict: QuarterVerdict; countVerdict: QuarterVerdict; counts: { opened: number; added: number; trimmed: number; exited: number }; topMoves: QuarterMove[]; exits: { cusip: string; issuer: string; priorValue: number }[] }`
  - `moveFlowUsd(c: HoldingChange): number`
  - `summarizeQuarter(args: { period: string; priorPeriod: string; latest: Holding[]; prior: Holding[]; changes: HoldingChange[] }): QuarterSummary`
  - 常量 `FLAT_THRESHOLD = 0.02`、`TOP_MOVES = 5`

- [ ] **Step 1: 写失败的检查**

```ts
// 运行: cd web && npx tsx src/lib/managers/quarterSummary.check.ts
import assert from "node:assert/strict";
import { summarizeQuarter, moveFlowUsd } from "./quarterSummary";
import { computeChanges } from "./assemble";
import type { Holding } from "./types";

const h = (cusip: string, shares: number, px: number, weight = 0, putCall?: string): Holding => ({ cusip, issuer: `${cusip} INC`, shares, value: shares * px, weight, putCall });
const prior = [h("A", 100, 10), h("B", 1000, 10), h("C", 50, 20), h("X", 10, 30), h("Y", 300, 10), h("P", 100, 10, 0, "Put")];
const latest = [h("A", 150, 12, 0.1), h("B", 400, 11, 0.3), h("C", 50, 25, 0.2), h("N", 100, 40, 0.4), h("P", 500, 10, 0, "Put")];
const changes = computeChanges(latest, prior);
const s = summarizeQuarter({ period: "2026-06-30", priorPeriod: "2026-03-31", latest, prior, changes });

// 单笔金额:新建=本季市值;清仓=−上季市值;增减=Δ股×本季末单价;期权不计。
assert.equal(moveFlowUsd(changes.find((c) => c.cusip === "A")!), 50 * 12);
assert.equal(moveFlowUsd(changes.find((c) => c.cusip === "B")!), -600 * 11);
assert.equal(moveFlowUsd(changes.find((c) => c.cusip === "N")!), 4000);
assert.equal(moveFlowUsd(changes.find((c) => c.cusip === "X")!), -300);
// 净额 = 600 − 6600 + 4000 − 300 − 3000 = −5300;上季正股市值 = 1000+10000+1000+300+3000 = 15300 → 净卖出。
assert.equal(s.netFlowUsd, -5300);
assert.equal(s.priorValue, 15300);
assert.equal(s.latestValue, 1800 + 4400 + 1250 + 4000);
assert.equal(s.latestCount, 4); assert.equal(s.priorCount, 5);
assert.equal(s.verdict, "selling");
// 只数口径(旧):买 2(A 增、N 新)vs 卖 3(B 减、X 清、Y 清)→ selling。
assert.equal(s.countVerdict, "selling");
assert.deepEqual(s.counts, { opened: 1, added: 1, trimmed: 1, exited: 2 });
// 前 5 笔按金额绝对值:B −6600、N 4000、Y −3000、A 600、X −300;期权 P 不进。
assert.deepEqual(s.topMoves.map((m) => m.cusip), ["B", "N", "Y", "A", "X"]);
assert.equal(s.topMoves[1].weightAfter, 0.4);
assert.equal(s.topMoves[2].weightAfter, null, "清仓无现占比");
// 清仓按上季市值降序。
assert.deepEqual(s.exits.map((e) => `${e.cusip}:${e.priorValue}`), ["Y:3000", "X:300"]);

// 持平阈值:净额不到上季正股市值 2% → mixed。
{
  const p = [h("A", 1000, 10)], l = [h("A", 1015, 10)];
  const q = summarizeQuarter({ period: "q", priorPeriod: "p", latest: l, prior: p, changes: computeChanges(l, p) });
  assert.equal(q.verdict, "mixed"); assert.equal(q.countVerdict, "buying");
}
// 只数说"加仓"、金额说"卖出"(Viking 形态):10 只小加仓 vs 1 只大清仓。
{
  const p = [...Array.from({ length: 10 }, (_, i) => h(`S${i}`, 10, 10)), h("BIG", 1000, 100)];
  const l = Array.from({ length: 10 }, (_, i) => h(`S${i}`, 11, 10));
  const q = summarizeQuarter({ period: "q", priorPeriod: "p", latest: l, prior: p, changes: computeChanges(l, p) });
  assert.equal(q.countVerdict, "buying"); assert.equal(q.verdict, "selling");
}
// 并列时按 issuer 字母序,结果确定。
{
  const p = [h("Z", 10, 10), h("A", 10, 10)], l = [h("Z", 20, 10), h("A", 20, 10)];
  const q = summarizeQuarter({ period: "q", priorPeriod: "p", latest: l, prior: p, changes: computeChanges(l, p) });
  assert.deepEqual(q.topMoves.map((m) => m.cusip), ["A", "Z"]);
}
// 拆股调整的行带出 splitFactor。
{
  const p = [{ ...h("K", 10000, 10), splitFactor: 10 }], l = [h("K", 8440, 10)];
  const q = summarizeQuarter({ period: "q", priorPeriod: "p", latest: l, prior: p, changes: computeChanges(l, p) });
  assert.equal(q.topMoves[0].splitFactor, 10); assert.equal(q.topMoves[0].kind, "decreased");
}
console.log("quarterSummary.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx src/lib/managers/quarterSummary.check.ts`
Expected: FAIL，找不到模块 `./quarterSummary`

- [ ] **Step 3: 实现**

```ts
// quarterSummary.ts — 一位经理本季对上季的汇总(纯函数):按金额判定净买卖、金额最大的几笔、计数、清仓名单。
// 金额按季末价估算(13F 不披露成交价);只算正股,期权名义市值不计。输入的 prior 应已做拆股换算(splitAdjust.ts)。
import type { Holding, HoldingChange } from "./types";

export type QuarterVerdict = "buying" | "selling" | "mixed";
export type QuarterMove = {
  cusip: string;
  issuer: string;
  kind: HoldingChange["kind"];
  flowUsd: number;
  deltaPct: number | null;
  weightAfter: number | null;
  splitFactor?: number;
};
export type QuarterSummary = {
  period: string;
  priorPeriod: string;
  latestValue: number;
  priorValue: number;
  latestCount: number;
  priorCount: number;
  netFlowUsd: number;
  /** 按金额:净额绝对值不到上季正股市值的 FLAT_THRESHOLD → mixed(基本持平)。 */
  verdict: QuarterVerdict;
  /** 旧口径(按只数),列表页在 PR B 切换前沿用。 */
  countVerdict: QuarterVerdict;
  counts: { opened: number; added: number; trimmed: number; exited: number };
  topMoves: QuarterMove[];
  exits: { cusip: string; issuer: string; priorValue: number }[];
};

export const FLAT_THRESHOLD = 0.02;
export const TOP_MOVES = 5;

/** 单笔估算金额:新建 = 本季市值;清仓 = −上季末市值;增减 = 股数变化 × 本季末单价。 */
export function moveFlowUsd(c: HoldingChange): number {
  if (c.kind === "new") return c.value;
  if (c.kind === "exited") return -c.value;
  return c.shares > 0 ? (c.shares - c.prevShares) * (c.value / c.shares) : 0;
}

export function summarizeQuarter(args: { period: string; priorPeriod: string; latest: Holding[]; prior: Holding[]; changes: HoldingChange[] }): QuarterSummary {
  const latest = args.latest.filter((h) => !h.putCall);
  const prior = args.prior.filter((h) => !h.putCall);
  const changes = args.changes.filter((c) => !c.putCall);
  const sum = (hs: Holding[]) => hs.reduce((s, h) => s + h.value, 0);
  const latestValue = sum(latest);
  const priorValue = sum(prior);

  const weight = new Map<string, number>();
  for (const h of latest) weight.set(h.cusip, (weight.get(h.cusip) ?? 0) + (h.weight ?? 0));

  const moves: QuarterMove[] = changes.map((c) => ({
    cusip: c.cusip,
    issuer: c.issuer,
    kind: c.kind,
    flowUsd: moveFlowUsd(c),
    deltaPct: c.deltaPct,
    weightAfter: c.kind === "exited" ? null : weight.get(c.cusip) ?? null,
    ...(c.splitFactor ? { splitFactor: c.splitFactor } : {}),
  }));
  const netFlowUsd = moves.reduce((s, m) => s + m.flowUsd, 0);

  const counts = {
    opened: changes.filter((c) => c.kind === "new").length,
    added: changes.filter((c) => c.kind === "increased").length,
    trimmed: changes.filter((c) => c.kind === "decreased").length,
    exited: changes.filter((c) => c.kind === "exited").length,
  };
  const buys = counts.opened + counts.added;
  const sells = counts.trimmed + counts.exited;
  const countVerdict: QuarterVerdict = buys > sells ? "buying" : sells > buys ? "selling" : "mixed";
  const flat = priorValue > 0 ? Math.abs(netFlowUsd) < FLAT_THRESHOLD * priorValue : netFlowUsd === 0;
  const verdict: QuarterVerdict = flat ? "mixed" : netFlowUsd > 0 ? "buying" : "selling";

  const topMoves = [...moves]
    .sort((a, b) => Math.abs(b.flowUsd) - Math.abs(a.flowUsd) || a.issuer.localeCompare(b.issuer))
    .slice(0, TOP_MOVES);
  const exits = changes
    .filter((c) => c.kind === "exited")
    .map((c) => ({ cusip: c.cusip, issuer: c.issuer, priorValue: c.value }))
    .sort((a, b) => b.priorValue - a.priorValue || a.issuer.localeCompare(b.issuer));

  return {
    period: args.period, priorPeriod: args.priorPeriod, latestValue, priorValue,
    latestCount: latest.length, priorCount: prior.length,
    netFlowUsd, verdict, countVerdict, counts, topMoves, exits,
  };
}
```

> `latestCount` / `priorCount` 用正股行数，与列表页旧 RPC 的 `count_delta` 一致。同券多行时会多算，这是旧口径如此，本 PR 不改。

- [ ] **Step 4: 运行，确认通过**

Run: `cd web && npx tsx src/lib/managers/quarterSummary.check.ts`
Expected: `quarterSummary.check OK`

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/managers/quarterSummary.ts web/src/lib/managers/quarterSummary.check.ts
git commit -m "feat(13f): 按金额的季度汇总 summarizeQuarter"
```

---

### Task 6：两张新表的 DDL（只写文件，不执行）

**Files:**
- Create: `web/supabase/migrations/20261028_split_adjustments_and_quarter_summary.sql`
- Modify: `web/supabase/schema.sql`（在 `consensus_stock_trend` 定义之后、`manager_index()` 注释块之前，贴入同样两段 `create table`）

**Interfaces:**
- Produces: 表 `split_adjustments`（列：cusip, from_period, to_period, ticker, factor, source, evidence, computed_at）、表 `manager_quarter_summary`（列见下）。Task 7、8、9 按这些列名读写。

- [ ] **Step 1: 写迁移文件**

```sql
-- split_adjustments:13F 股数的拆股换算系数(派生数据,可整表重算)。
-- 上季股数 × factor = 本季口径。由 13F 入库后的共识步骤(scripts/lib/computeConsensus.ts)每次全量重算;
-- 只存派生结果,holdings 里的 SEC 原始股数不改。见 web/src/lib/managers/splitAdjust.ts。
create table if not exists split_adjustments (
  cusip text not null,
  from_period date not null,
  to_period date not null,
  ticker text,
  factor numeric not null check (factor > 0),
  source text not null check (source in ('table','inferred')),
  evidence jsonb not null,
  computed_at timestamptz not null,
  primary key (cusip, from_period, to_period)
);
create index if not exists split_adjustments_to_period_idx on split_adjustments (to_period);
alter table split_adjustments enable row level security;

-- manager_quarter_summary:每位经理最新季对上季的汇总(按金额判定、前 5 笔、计数、清仓名单)。
-- 列表页 /investors 读它(取代 RPC manager_qoq);详情页用同一个纯函数现算,口径一致。
create table if not exists manager_quarter_summary (
  cik text primary key references managers(cik) on delete cascade,
  period date not null,
  prior_period date not null,
  latest_value numeric not null,
  prior_value numeric not null,
  latest_count int not null,
  prior_count int not null,
  net_flow_usd numeric not null,
  verdict text not null check (verdict in ('buying','selling','mixed')),
  count_verdict text not null check (count_verdict in ('buying','selling','mixed')),
  counts jsonb not null,
  top_moves jsonb not null,
  exits jsonb not null,
  computed_at timestamptz not null
);
alter table manager_quarter_summary enable row level security;

notify pgrst, 'reload schema';
```

> RLS 开启且不加策略，与 `quarterly_reports` 一致：service role 绕过 RLS，应用服务端和 GitHub Actions 都用 service key。

- [ ] **Step 2: 同步 `schema.sql`**

把上面两段 `create table` / `create index` / `alter table`（不含 `notify`）贴到 `schema.sql` 中 `consensus_stock_trend_ticker_idx` 那条语句之后。

- [ ] **Step 3: Commit**

```bash
git add web/supabase/migrations/20261028_split_adjustments_and_quarter_summary.sql web/supabase/schema.sql
git commit -m "db: split_adjustments 与 manager_quarter_summary 表定义(未执行)"
```

> **不要执行这段 DDL。** 它在 Task 11 由用户在 Supabase SQL Editor 执行。

---

### Task 7：共识步骤计算系数、写表、按新口径出动作

**Files:**
- Create: `web/scripts/lib/splitStore.ts`
- Test: `web/scripts/lib/splitStore.check.ts`
- Modify: `web/scripts/lib/computeConsensus.ts`

**Interfaces:**
- Consumes:
  - Task 3 的 `deriveSplitFactors`、`factorLookup`、`ManagerHistory`、`SplitEvent`
  - Task 4 的 `rescaleToLatestBasis`、`computeChanges`、`toScanChanges`
  - Task 5 的 `summarizeQuarter`、`QuarterSummary`
- Produces：
  - `isMissingTable(error: { code?: string } | null | undefined): boolean`（`42P01` 或 `PGRST205`）
  - `splitRow(f: SplitFactor, computedAt: string)` → `split_adjustments` 行对象
  - `summaryRow(cik: string, s: QuarterSummary, computedAt: string)` → `manager_quarter_summary` 行对象
  - `replaceDerivedRows(db, table: string, rows: object[], onConflict: string, computedAt: string): Promise<"ok" | "missing">`：先 upsert，再删 `computed_at < computedAt` 的行
  - `consensusChangesFor(latestH: DbHolding[], priorH: DbHolding[], latestPeriod: string, priorPeriod: string, lookup: SplitFactorLookup): ScanChange[]`
    - `DbHolding = { cusip: string; issuer: string; value: number | string; shares: number | string; weight?: number | string; put_call?: string | null }`
  - `computeAndStoreConsensus` 返回值增加 `splitFactors: number; summaries: number`

- [ ] **Step 1: 写失败的检查**

`web/scripts/lib/splitStore.check.ts`：

```ts
/** Run: cd web && npx tsx scripts/lib/splitStore.check.ts */
import assert from "node:assert/strict";
import { isMissingTable, splitRow, summaryRow, consensusChangesFor } from "./splitStore";
import { factorLookup } from "../../src/lib/managers/splitAdjust";

assert.ok(isMissingTable({ code: "42P01" }));
assert.ok(isMissingTable({ code: "PGRST205" }));
assert.ok(!isMissingTable({ code: "23505" }));
assert.ok(!isMissingTable(null));

const at = "2026-10-28T00:00:00.000Z";
assert.deepEqual(
  splitRow({ cusip: "C", ticker: "CC", fromPeriod: "2026-03-31", toPeriod: "2026-06-30", factor: 5, source: "table", evidence: { q: 0.2, r: 5, events: [], matching: 3, bothHolders: 4 } }, at),
  { cusip: "C", ticker: "CC", from_period: "2026-03-31", to_period: "2026-06-30", factor: 5, source: "table", evidence: { q: 0.2, r: 5, events: [], matching: 3, bothHolders: 4 }, computed_at: at },
);

const s = {
  period: "2026-06-30", priorPeriod: "2026-03-31", latestValue: 10, priorValue: 8, latestCount: 2, priorCount: 3,
  netFlowUsd: -1, verdict: "selling" as const, countVerdict: "buying" as const,
  counts: { opened: 1, added: 0, trimmed: 0, exited: 1 }, topMoves: [], exits: [],
};
assert.deepEqual(summaryRow("0001", s, at), {
  cik: "0001", period: "2026-06-30", prior_period: "2026-03-31", latest_value: 10, prior_value: 8, latest_count: 2, prior_count: 3,
  net_flow_usd: -1, verdict: "selling", count_verdict: "buying", counts: s.counts, top_moves: [], exits: [], computed_at: at,
});

// 共识动作:拆股换算后,纯拆股不再算买入;库里字符串数字照常处理。
{
  const look = factorLookup([{ cusip: "K", fromPeriod: "2026-03-31", toPeriod: "2026-06-30", factor: 5 }]);
  const L = [{ cusip: "K", issuer: "K", value: "500", shares: "500" }, { cusip: "A", issuer: "A", value: 20, shares: 20 }];
  const P = [{ cusip: "K", issuer: "K", value: "500", shares: "100" }, { cusip: "A", issuer: "A", value: 10, shares: 10 }];
  assert.deepEqual(consensusChangesFor(L, P, "2026-06-30", "2026-03-31", look).map((c) => `${c.cusip}:${c.kind}`), ["A:increased"]);
}
console.log("splitStore.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx scripts/lib/splitStore.check.ts`
Expected: FAIL，找不到模块 `./splitStore`

- [ ] **Step 3: 实现 `splitStore.ts`**

```ts
// splitStore.ts — 拆股系数与季度汇总的落库(共识步骤用)。纯映射 + 一个带过期清理的写入函数。
import type { SplitFactor, SplitFactorLookup } from "../../src/lib/managers/splitAdjust";
import { rescaleToLatestBasis } from "../../src/lib/managers/splitAdjust";
import { computeChanges } from "../../src/lib/managers/assemble";
import { toScanChanges, type ScanChange } from "../../src/lib/consensus/compute";
import type { QuarterSummary } from "../../src/lib/managers/quarterSummary";
import type { Holding } from "../../src/lib/managers/types";

/** 表未迁移:Postgres 42P01 / PostgREST PGRST205。代码先于 DDL 部署时据此降级。 */
export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export function splitRow(f: SplitFactor, computedAt: string) {
  return { cusip: f.cusip, ticker: f.ticker, from_period: f.fromPeriod, to_period: f.toPeriod, factor: f.factor, source: f.source, evidence: f.evidence, computed_at: computedAt };
}

export function summaryRow(cik: string, s: QuarterSummary, computedAt: string) {
  return {
    cik, period: s.period, prior_period: s.priorPeriod, latest_value: s.latestValue, prior_value: s.priorValue,
    latest_count: s.latestCount, prior_count: s.priorCount, net_flow_usd: s.netFlowUsd, verdict: s.verdict,
    count_verdict: s.countVerdict, counts: s.counts, top_moves: s.topMoves, exits: s.exits, computed_at: computedAt,
  };
}

export type DbHolding = { cusip: string; issuer: string; value: number | string; shares: number | string; weight?: number | string; put_call?: string | null };
export const toHolding = (h: DbHolding): Holding => ({
  cusip: h.cusip, issuer: h.issuer, value: Number(h.value), shares: Number(h.shares),
  weight: h.weight == null ? undefined : Number(h.weight), putCall: h.put_call ?? undefined,
});

/** 两季持仓 → 拆股换算后的共识动作(与投资人页 assembleManagerDetail 同一口径)。 */
export function consensusChangesFor(latestH: DbHolding[], priorH: DbHolding[], latestPeriod: string, priorPeriod: string, lookup: SplitFactorLookup): ScanChange[] {
  const [latest, prior] = rescaleToLatestBasis(
    [{ period: latestPeriod, holdings: latestH.map(toHolding) }, { period: priorPeriod, holdings: priorH.map(toHolding) }],
    lookup,
  );
  return toScanChanges(computeChanges(latest.holdings, prior.holdings));
}

/**
 * 派生表整表替换:先 upsert 本次全部行(computed_at = 本次时间),再删更早的行。
 * 不先删后写:详情页随时在读,先删会有一段时间读到空表(= 系数 1,假增持短暂复现)。
 * 表未迁移 → "missing"(调用方 warn 跳过);其他错误 THROW(静默失败会让页面继续发错数据)。
 */
export async function replaceDerivedRows(db: any, table: string, rows: object[], onConflict: string, computedAt: string): Promise<"ok" | "missing"> {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (isMissingTable(error)) return "missing";
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
  }
  const { error } = await db.from(table).delete().lt("computed_at", computedAt);
  if (isMissingTable(error)) return "missing";
  if (error) throw new Error(`${table} stale delete failed: ${error.message}`);
  return "ok";
}
```

- [ ] **Step 4: 运行，确认通过**

Run: `cd web && npx tsx scripts/lib/splitStore.check.ts`
Expected: `splitStore.check OK`

- [ ] **Step 5: 改造 `computeAndStoreConsensus`**

在 `web/scripts/lib/computeConsensus.ts`：

**(a) import**：顶部 import 改为不再导入 `diffHoldings`，并新增：

```ts
import { computeConsensus, computeStockHolders, computeStockTrend, computeCoOwnership, type ScanInput, type StockHolderScan, type TrendScan, type CusipInfo } from "../../src/lib/consensus/compute";
import { deriveSplitFactors, factorLookup, NO_SPLITS, rescaleToLatestBasis, type ManagerHistory, type SplitEvent } from "../../src/lib/managers/splitAdjust";
import { summarizeQuarter } from "../../src/lib/managers/quarterSummary";
import { computeChanges } from "../../src/lib/managers/assemble";
import { consensusChangesFor, replaceDerivedRows, splitRow, summaryRow, toHolding } from "./splitStore";
```

**(b) 一次读 8 季**：把 `const raws: Raw[] = []; for (const m of managers) { ... raws.push(...) }` 整段，以及后面“持有人数趋势”那段 `const trendScan: TrendScan[] = []; for (const m of managers) { ... trendScan.push(...) }` 整段，合并为下面这一个循环，放在原 `raws` 循环的位置。原趋势循环删除，`trendScan` 改在这里构造。

```ts
  type Raw = { cik: string; slug: string; person: string; period: string; priorPeriod: string | null; filedAt: string | null; latestH: any[]; priorH: any[] };
  const raws: Raw[] = [];
  const trendScan: TrendScan[] = [];
  const histories: ManagerHistory[] = [];
  for (const m of managers) {
    // 一次读最近 8 个不同 period(同 period 取最新 filed_at):本季动作、持有人数趋势、拆股交叉验证共用,
    // 取代原来"最近 2 季全列 + 8 季只读 cusip"两遍扫描。前 2 季读全列,更早的只读算系数要用的列(egress 护栏)。
    const tfRows = await readAll(db, "filings", "id,period,filed_at", (q) =>
      q.eq("cik", m.cik).order("period", { ascending: false }).order("id", { ascending: false }).limit(32)
    );
    const tf = latestDistinctPeriodFilings(tfRows, 8);
    if (!tf.length) continue;
    const hs: any[][] = [];
    for (let i = 0; i < tf.length; i++) {
      const cols = i < 2 ? "cusip,issuer,value,shares,weight,put_call" : "cusip,value,shares,put_call";
      hs.push(await readAll(db, "holdings", cols, (q) => q.eq("filing_id", tf[i].id).order("id", { ascending: true })));
    }
    raws.push({ cik: m.cik, slug: m.slug, person: m.person, period: tf[0].period, priorPeriod: tf[1]?.period ?? null, filedAt: tf[0].filed_at ?? null, latestH: hs[0], priorH: hs[1] ?? [] });
    trendScan.push({ slug: m.slug, filings: tf.map((f, i) => ({ period: f.period, cusips: hs[i].filter((h) => !h.put_call).map((h) => h.cusip) })) });
    histories.push({ slug: m.slug, filings: tf.map((f, i) => ({ period: f.period, holdings: hs[i].map((h) => ({ cusip: h.cusip, putCall: h.put_call ?? null, shares: Number(h.shares), value: Number(h.value) })) })) });
  }

  // 拆股系数:全部经理、全部季度对重算(第一次运行即完成历史回填)。
  const computedAt = new Date().toISOString();
  const splitEvents: SplitEvent[] = (await readAll(db, "stock_splits", "ticker,split_date,ratio", (q) => q.order("ticker", { ascending: true }).order("split_date", { ascending: true })))
    .map((r) => ({ ticker: r.ticker, date: r.split_date, ratio: Number(r.ratio) }));
  const splitFactors = deriveSplitFactors(histories, (c) => cmap.get(c)?.ticker ?? null, splitEvents);
  const splits = splitFactors.length ? factorLookup(splitFactors) : NO_SPLITS;
  if ((await replaceDerivedRows(db, "split_adjustments", splitFactors.map((f) => splitRow(f, computedAt)), "cusip,from_period,to_period", computedAt)) === "missing")
    console.warn("split_adjustments 表不存在 — 跳过写入(先跑 migration);本次共识仍按内存里的系数换算。");
```

**(c) changesOf 用新口径**：

```ts
  const changesOf = (r: Raw) =>
    (effective.period && r.period === effective.period && r.latestH.length > 0 && r.priorPeriod
      ? consensusChangesFor(r.latestH, r.priorH, r.period, r.priorPeriod, splits)
      : []);
```

> 无上季（`priorPeriod` 为 null）时返回 `[]`：旧代码在这种情况下会把全部持仓记成新建，这里改掉这个缺陷。`latestDistinctPeriodFilings` 只取 1 期，说明这位经理是新纳入跟踪的。

**(d) 季度汇总**：在 `const { holdings, moves } = computeConsensus(scan, cmap);` 之前加入：

```ts
  // 列表页季度汇总(所有有上季、本季非零持仓的经理;不受"有效变动季"过滤,与详情页口径一致)。
  const summaries = raws
    .filter((r) => r.priorPeriod && r.latestH.length > 0)
    .map((r) => {
      const [latest, prior] = rescaleToLatestBasis(
        [{ period: r.period, holdings: r.latestH.map(toHolding) }, { period: r.priorPeriod!, holdings: r.priorH.map(toHolding) }],
        splits,
      );
      const s = summarizeQuarter({ period: r.period, priorPeriod: r.priorPeriod!, latest: latest.holdings, prior: prior.holdings, changes: computeChanges(latest.holdings, prior.holdings) });
      return summaryRow(r.cik, s, computedAt);
    });
  if ((await replaceDerivedRows(db, "manager_quarter_summary", summaries, "cik", computedAt)) === "missing")
    console.warn("manager_quarter_summary 表不存在 — 跳过(先跑 migration);列表页继续用 RPC manager_qoq。");
```

**(e) 返回值**：函数签名的返回类型和**每一个** `return { ... }`（包括几个提前 return 的分支）都加上 `splitFactors: splitFactors.length, summaries: summaries.length`。原来趋势段的读库循环已在 (b) 删除，`computeStockTrend(trendScan, cmap)` 那行及之后不变。

**(f) 调用方日志**：`scripts/ingest-13f.ts:577` 与 `scripts/consensus.ts` 打印 stats 的地方，把 `splitFactors`、`summaries` 两个数也打出来。例如 ingest：

```ts
      console.log(`Consensus: holdings ${c.holdings} 行, moves ${c.moves} 行, 拆股系数 ${c.splitFactors} 条, 季度汇总 ${c.summaries} 户`);
```

- [ ] **Step 6: 运行检查、类型检查**

Run: `cd web && npx tsx scripts/lib/splitStore.check.ts && npx tsx scripts/lib/computeConsensus.check.ts && npx tsc --noEmit -p . 2>&1 | head -20 && npx eslint scripts/lib/splitStore.ts scripts/lib/computeConsensus.ts`
Expected: 两个 `OK`；tsc、eslint 无输出。根 tsconfig 只覆盖 `src/`，`scripts/` 下的类型错误靠 `tsx` 运行和 eslint 暴露。不要修与本 PR 无关的旧错误。

- [ ] **Step 7: Commit**

```bash
git add web/scripts/lib/splitStore.ts web/scripts/lib/splitStore.check.ts web/scripts/lib/computeConsensus.ts web/scripts/ingest-13f.ts web/scripts/consensus.ts
git commit -m "feat(13f): 共识步骤计算拆股系数与季度汇总并落库"
```

---

### Task 8：页面读取路径（详情页系数、列表页汇总、估值拆股护栏）

**Files:**
- Modify: `web/src/lib/managers/supabase.ts`
- Modify: `web/src/lib/managers/priceRead.ts:42-50`
- Test: `web/src/lib/managers/supabaseMap.check.ts`（新）

**Interfaces:**
- Consumes:
  - Task 3 的 `factorLookup`、`NO_SPLITS`
  - Task 4 的 `assembleManagerDetail(manager, filings, lookup)`
  - Task 1 的 `isRealSplit`
- Produces:
  - `mapDetailRows(manager, filingRows, holdingRows, splits: SplitFactorLookup = NO_SPLITS): ManagerDetail`
  - `getManagerDetail(cikOrSlug: string, opts?: { adjustSplits?: boolean }): Promise<ManagerDetail | null>`（默认 `adjustSplits: true`）
  - `type SummaryRow = { cik: string; latest_value: number | string; prior_value: number | string; latest_count: number; prior_count: number; count_verdict: string; top_moves: { issuer: string; kind: string }[] }`
  - `mapSummaryRows(rows: SummaryRow[]): Map<string, ManagerQoQ>`
  - `isMissingTableError(error): boolean`（在 `src/lib/managers/db.ts`，与 `scripts/lib/splitStore.ts` 的 `isMissingTable` 同逻辑；src 不从 scripts 导入）

- [ ] **Step 1: 写失败的检查**

`web/src/lib/managers/supabaseMap.check.ts`：

```ts
// 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/supabaseMap.check.ts
// (supabase.ts 导入 server-only,用 scripts/tsconfig.json 的桩。)
import assert from "node:assert/strict";
import { mapSummaryRows } from "./supabase";
import { isMissingTableError } from "./db";

const m = mapSummaryRows([
  { cik: "1", latest_value: "120", prior_value: "100", latest_count: 9, prior_count: 10, count_verdict: "buying", top_moves: [{ issuer: "UBER", kind: "new" }] },
  { cik: "2", latest_value: 5, prior_value: 0, latest_count: 1, prior_count: 0, count_verdict: "mixed", top_moves: [] },
]);
assert.deepEqual(m.get("1"), { valueDeltaPct: 0.2, countDelta: -1, verdict: "buying", topMoveIssuer: "UBER", topMoveKind: "new" });
assert.deepEqual(m.get("2"), { valueDeltaPct: null, countDelta: 1, verdict: "mixed", topMoveIssuer: null, topMoveKind: null });
assert.ok(isMissingTableError({ code: "42P01" }) && isMissingTableError({ code: "PGRST205" }) && !isMissingTableError({ code: "XX000" }) && !isMissingTableError(null));
console.log("supabaseMap.check OK");
```

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/supabaseMap.check.ts`
Expected: FAIL，`mapSummaryRows` 未导出

- [ ] **Step 3: 实现**

`db.ts` 末尾追加：

```ts
/** 表未迁移(Postgres 42P01 / PostgREST PGRST205):新派生表先于 DDL 部署时据此降级,其他错误照常抛。 */
export function isMissingTableError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42P01" || error?.code === "PGRST205";
}
```

`supabase.ts`：
- import 增加 `import { factorLookup, NO_SPLITS, type SplitFactorLookup } from "@/lib/managers/splitAdjust";`，并把 `isMissingTableError` 加进从 `@/lib/managers/db` 的 import。
- `mapDetailRows` 改为接收第 4 个参数并传下去：

```ts
export function mapDetailRows(manager: Manager, filingRows: any[], holdingRows: any[], splits: SplitFactorLookup = NO_SPLITS): ManagerDetail {
  // (byFiling / toFiling / filings 三行不变)
  return assembleManagerDetail(manager, filings, splits);
}
```

- `getManagerDetail` 签名改为 `(cikOrSlug: string, opts: { adjustSplits?: boolean } = {})`。在 holdings 查询之后、`if (!filings?.length) return null;` 之后加入：

```ts
  // 拆股换算系数:只取本人各季作为 to_period 的行(全表约几百行,按季过滤后更少)。
  // 表未迁移 → 系数 1(旧行为);其他错误照样 THROW(见上方注释:不能吞成 404)。
  let splits: SplitFactorLookup = NO_SPLITS;
  if (opts.adjustSplits !== false) {
    const periods = filings.map((f: any) => f.period);
    const { data: sa, error: sErr } = await withRetry(() => db.from("split_adjustments").select("cusip,from_period,to_period,factor").in("to_period", periods));
    if (sErr && !isMissingTableError(sErr)) throw new Error(`getManagerDetail split_adjustments query failed (${m.cik}): ${sErr.message}`);
    if (sa?.length) splits = factorLookup(sa.map((r: any) => ({ cusip: r.cusip, fromPeriod: r.from_period, toPeriod: r.to_period, factor: Number(r.factor) })));
  }
  return mapDetailRows({ cik: m.cik, slug: m.slug, name: m.name, person: m.person }, filings, holdings ?? [], splits);
```

（替换原来最后一行 `return mapDetailRows(...)`。）

- 新增纯映射并改 `getManagerQoQ`：

```ts
export type SummaryRow = { cik: string; latest_value: number | string; prior_value: number | string; latest_count: number; prior_count: number; count_verdict: string; top_moves: { issuer: string; kind: string }[] };
/** manager_quarter_summary 行 → 列表页 ManagerQoQ。PR A 阶段 verdict 仍用只数口径(count_verdict),与详情页一致。 */
export function mapSummaryRows(rows: SummaryRow[]): Map<string, ManagerQoQ> {
  const out = new Map<string, ManagerQoQ>();
  for (const r of rows) {
    const prior = Number(r.prior_value);
    const top = r.top_moves?.[0];
    out.set(r.cik, {
      valueDeltaPct: prior > 0 ? (Number(r.latest_value) - prior) / prior : null,
      countDelta: r.latest_count - r.prior_count,
      verdict: (r.count_verdict as ManagerQoQ["verdict"]) ?? null,
      topMoveIssuer: top?.issuer ?? null,
      topMoveKind: (top?.kind as ManagerQoQ["topMoveKind"]) ?? null,
    });
  }
  return out;
}
```

`getManagerQoQ` 函数体改为：先读表，表缺失时回退到原 RPC 逻辑（原代码整体保留为回退分支）：

```ts
export async function getManagerQoQ(): Promise<Map<string, ManagerQoQ>> {
  const db = getDb();
  // 读入库时算好的季度汇总(拆股已换算,与详情页同一函数);表未迁移 → 回退旧 RPC manager_qoq。
  const { data: rows, error: tErr } = await db.from("manager_quarter_summary").select("cik,latest_value,prior_value,latest_count,prior_count,count_verdict,top_moves");
  if (!tErr && rows) return mapSummaryRows(rows as SummaryRow[]);
  if (tErr && !isMissingTableError(tErr)) return new Map(); // 与原函数一致:出错优雅降级为空 Map(列表不显 QoQ)
  const out = new Map<string, ManagerQoQ>();
  const { data, error } = await db.rpc("manager_qoq");
  if (error || !data) return out;
  for (const r of data as QoQRow[]) {
    out.set(r.cik, {
      valueDeltaPct: r.value_delta_pct,
      countDelta: r.count_delta,
      verdict: (r.verdict as ManagerQoQ["verdict"]) ?? null,
      topMoveIssuer: r.top_move_issuer,
      topMoveKind: (r.top_move_kind as ManagerQoQ["topMoveKind"]) ?? null,
    });
  }
  return out;
}
```

> 函数上方的注释更新为：“每户季度变化信号（cik → ManagerQoQ）。仅 /investors 列表页调用。读 manager_quarter_summary；表未迁移回退 RPC manager_qoq；出错 → 空 Map（优雅降级）。”

`priceRead.ts` 的 `getLatestSplit`：

```ts
/** 某 ticker 最近一次**真拆股**日期(ISO)。分拆上市/股票股息的价格复权(CMCSA 1.067 等)不算,否则会误触发估值拆股护栏。无 env / 无表 / 无行 → null。 */
export const getLatestSplit = cache(async (ticker: string): Promise<string | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("stock_splits").select("split_date,ratio").eq("ticker", ticker)
    .order("split_date", { ascending: false }).limit(20);
  if (error) { console.error(`getLatestSplit(${ticker}) 失败: ${error.message}`); return null; }
  return (data ?? []).find((r: { ratio: number }) => isRealSplit(Number(r.ratio)))?.split_date ?? null;
});
```

并在 `priceRead.ts` 顶部 import `import { isRealSplit } from "@/lib/managers/splitAdjust";`。

- [ ] **Step 4: 运行检查**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/managers/supabaseMap.check.ts && npx tsx --tsconfig scripts/tsconfig.json scripts/priceRead.check.ts && npx tsc --noEmit -p . 2>&1 | head -20`
Expected: 两个 OK（`priceRead.check.ts` 若不覆盖 `getLatestSplit`，至少确认它仍通过）；tsc 无输出。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/managers/db.ts web/src/lib/managers/supabase.ts web/src/lib/managers/supabaseMap.check.ts web/src/lib/managers/priceRead.ts
git commit -m "feat(13f): 详情页读拆股系数;列表页读季度汇总;估值拆股护栏只认真拆股"
```

---

### Task 9：季度报告用同一口径

**Files:**
- Modify: `web/src/lib/reports/types.ts:77-99`
- Modify: `web/src/lib/reports/build.ts`
- Modify: `web/scripts/lib/loadReportInput.ts:83-112`
- Test: `web/src/lib/reports/build.check.ts`

**Interfaces:**
- Consumes: Task 3 的 `SplitFactorLookup`、`NO_SPLITS`、`factorLookup`；Task 4 的 `rescaleToLatestBasis`
- Produces:
  - `ReportManagerInput.priorPeriod?: string | null`
  - `ReportInput.splits?: SplitFactorLookup`（缺省 = `NO_SPLITS`）

- [ ] **Step 1: 写失败的检查**

追加到 `web/src/lib/reports/build.check.ts` 末尾 OK 打印之前（文件用的是自定义 `assert(c, m)`）：

```ts
// 拆股:上季股数先换算到报告季口径。e 只是 5 拆 1(股数 ×5)→ 不进共识买入;f 是真加仓 → 进。
{
  const input: ReportInput = {
    ...base,
    managers: [
      { ...mgr("e", [h("C_AAPL", 500, 1)], [h("C_AAPL", 100, 1)]), priorPeriod: "2026-06-30" },
      { ...mgr("f", [h("C_AAPL", 600, 1)], [h("C_AAPL", 100, 1)]), priorPeriod: "2026-06-30" },
    ],
    splits: factorLookup([{ cusip: "C_AAPL", fromPeriod: "2026-06-30", toPeriod: "2026-09-30", factor: 5 }]),
  };
  const r = buildQuarterlyReport(input);
  const aapl = r.bought.items.find((x) => x.key === "AAPL");
  assert(aapl?.managerCount === 1, `拆股后只有 f 算买入,got ${aapl?.managerCount}`);
}
```

> 在文件顶部 import 区加 `import { factorLookup } from "../managers/splitAdjust";`。

- [ ] **Step 2: 运行，确认失败**

Run: `cd web && npx tsx src/lib/reports/build.check.ts`
Expected: FAIL，提示类型上没有 `splits` / `priorPeriod`，或断言里 managerCount 为 2

- [ ] **Step 3: 实现**

`types.ts`：
- `ReportManagerInput` 增加：

```ts
  /** prior 那一季的 period(拆股换算按季度对查系数);缺省按无拆股处理。 */
  priorPeriod?: string | null;
```

- `ReportInput` 增加：

```ts
  /** 拆股换算系数(split_adjustments);缺省 = 不换算。 */
  splits?: SplitFactorLookup;
```

- 文件顶部 `import type { SplitFactorLookup } from "../managers/splitAdjust";`。

`build.ts`：
- import 增加 `import { NO_SPLITS, rescaleToLatestBasis } from "../managers/splitAdjust";`
- 在 `buildQuarterlyReport` 开头解构之后加：

```ts
  // 拆股:上季股数先换算到报告季口径,买卖口径与全站一致(splitAdjust.ts)。
  const splits = input.splits ?? NO_SPLITS;
  const priorOf = (m: ReportManagerInput): ReportHolding[] | null =>
    m.current && m.prior && m.priorPeriod
      ? rescaleToLatestBasis([{ period, holdings: m.current }, { period: m.priorPeriod, holdings: m.prior }], splits)[1].holdings
      : m.prior;
```

- `scan` 里的 `changes:` 改为 `changes: m.prior ? diffHoldings(toDiffRows(m.current!), toDiffRows(priorOf(m)!)) : [],`
- 名家动作处 `entry.moves = topWeightMoves(m.current, m.prior, keyOf, stock);` 改为 `entry.moves = topWeightMoves(m.current, priorOf(m)!, keyOf, stock);`
- import 类型增加 `ReportManagerInput`（若尚未导入）。

> `ReportHolding.putCall` 是 `string | null`，满足 `rescaleToLatestBasis` 的泛型约束 `putCall?: string | null`。持有人数环比（`longKeys`）只看 CUSIP，不受影响，保持用 `m.prior`。

`loadReportInput.ts`：
- 在 `const out: ReportManagerInput[] = [];` 之前读系数：

```ts
  // 拆股系数(共识步骤已写入;表未迁移 → 不换算)。
  let splits = NO_SPLITS;
  const { data: sa, error: saErr } = await db.from("split_adjustments").select("cusip,from_period,to_period,factor").eq("to_period", period);
  if (saErr && saErr.code !== "42P01" && saErr.code !== "PGRST205") throw new Error(`split_adjustments read: ${saErr.message}`);
  if (sa?.length) splits = factorLookup(sa.map((r: any) => ({ cusip: r.cusip, fromPeriod: r.from_period, toPeriod: r.to_period, factor: Number(r.factor) })));
```

- `out.push({...})` 里增加 `priorPeriod: r.prior?.period ?? null,`
- 返回的 `input` 对象里增加 `splits,`
- import 增加 `import { factorLookup, NO_SPLITS } from "../../src/lib/managers/splitAdjust";`

- [ ] **Step 4: 运行检查**

Run: `cd web && npx tsx src/lib/reports/build.check.ts && npx tsx scripts/lib/loadReportInput.check.ts && npx tsx src/lib/reports/readiness.check.ts`
Expected: 三个 OK

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/reports/types.ts web/src/lib/reports/build.ts web/src/lib/reports/build.check.ts web/scripts/lib/loadReportInput.ts
git commit -m "feat(report): 季度报告按拆股换算后的口径计算买卖"
```

---

### Task 10：验收探针

**Files:**
- Modify: `web/scripts/probe-split-fake-adds.ts`（整体改写）

**Interfaces:**
- Consumes: `getManagerDetail(slug, { adjustSplits })`（Task 8）、`computeChanges`

- [ ] **Step 1: 改写探针**

保留文件顶部的 `loadEnv`（三个候选路径、不打印任何值）。把 `main` 换成：对每位经理分别取原始口径（`adjustSplits: false`）和调整后口径的最新季变动，逐条对比，并汇总共识榜里受影响的票。

```ts
/**
 * probe-split-fake-adds.ts — 拆股修正验收(只读)。
 * 对每位经理,比较最新季变动的原始口径(不换算)与调整后口径(split_adjustments),列出所有变了的条目,
 * 并汇总 split_adjustments 的来源分布与共识榜受影响的票。基线(修正前)见 spec §一:最新季 24 条被真拆股污染。
 *
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-split-fake-adds.ts
 */
// (loadEnv 保持不变)

async function main() {
  loadEnv();
  const { getDb, hasSupabaseEnv } = await import("@/lib/managers/db");
  if (!hasSupabaseEnv()) { console.error("BLOCKED: 缺少 SUPABASE 凭据。"); process.exit(1); }
  const { getManagerDetail } = await import("@/lib/managers/supabase");
  const { holdingKey } = await import("@/lib/managers/assemble");
  const db = getDb();

  const { data: sa, error: saErr } = await db.from("split_adjustments").select("cusip,ticker,from_period,to_period,factor,source");
  if (saErr) throw new Error(`split_adjustments: ${saErr.message}(先执行 migration 并跑一次 npm run consensus)`);
  const bySource = (sa ?? []).reduce((m: Record<string, number>, r: any) => ((m[r.source] = (m[r.source] ?? 0) + 1), m), {});
  console.log(`split_adjustments: ${sa?.length ?? 0} 行`, bySource);

  const { data: mgrs } = await db.from("managers").select("slug,cik");
  let changed = 0, flipped = 0, vanished = 0;
  for (const m of (mgrs ?? []) as { slug: string; cik: string }[]) {
    const raw = await getManagerDetail(m.slug, { adjustSplits: false });
    const adj = await getManagerDetail(m.slug);
    if (!raw || !adj) continue;
    const am = new Map(adj.changes.map((c) => [holdingKey(c), c]));
    for (const rc of raw.changes) {
      const ac = am.get(holdingKey(rc));
      if (ac && ac.kind === rc.kind && ac.deltaPct === rc.deltaPct) continue;
      changed++;
      if (!ac) vanished++;
      else if ((rc.kind === "increased") !== (ac.kind === "increased")) flipped++;
      const pct = (x: number | null | undefined) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
      console.log(`  ${m.slug.padEnd(28)} ${rc.issuer.slice(0, 24).padEnd(24)} 原:${rc.kind} ${pct(rc.deltaPct)} → 调:${ac ? `${ac.kind} ${pct(ac.deltaPct)} ×${ac.splitFactor}` : "未变(纯拆股)"}`);
    }
  }
  console.log(`\n最新季被改正 ${changed} 条:方向翻转 ${flipped}、变为未变 ${vanished}、其余为幅度修正。基线:24 条(反向 11、纯拆股 3、幅度 10)。`);

  const { data: mv } = await db.from("consensus_moves").select("ticker,direction,manager_count").in("ticker", ["CVNA", "BKNG", "KLAC"]);
  console.log("共识榜(修正后):", (mv ?? []).map((r: any) => `${r.ticker} ${r.direction} ${r.manager_count}位`).join(" | "), "  基线:CVNA bought 8位、BKNG bought 7位、KLAC bought 3位");
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 类型检查**

Run: `cd web && npx eslint scripts/probe-split-fake-adds.ts && echo clean`
Expected: `clean`

- [ ] **Step 3: Commit**

```bash
git add web/scripts/probe-split-fake-adds.ts
git commit -m "chore(probe): 拆股修正验收探针(原始口径 vs 调整后口径)"
```

> 这一步不运行探针。系数表要在 Task 11 建好并跑过共识之后才有数据。

---

### Task 11：全量检查、开 PR、上生产（逐步经用户确认）

**Files:** 无新增

- [ ] **Step 1: 全量检查**

Run（`web/` 下）：

```bash
for f in $(git ls-files '*.check.ts' '*.check.tsx' | grep -v '^scripts/codemods/'); do npx tsx --tsconfig scripts/tsconfig.json "$f" >/dev/null 2>&1 || echo "FAIL $f"; done; echo done
```

Expected: 只打印 `done`。若某个检查在改动前就失败，用 `git stash push -u -m pr-a-baseline`、在基线上重跑、记下结果后 `git stash apply` 并删掉该条目，确认它与本 PR 无关，并写进 PR 描述。

Run: `cd web && npm run check:tokens && npm run check:type && npm run check:revalidate-paths && npx eslint src/lib/managers src/lib/consensus src/lib/reports scripts/lib && npx tsc --noEmit -p .`
Expected: 全部通过

Run: `cd web && npx next build 2>&1 | tail -15`
Expected: 构建成功。本地无 Supabase 凭据时若因取数失败而中止，记录错误、改用 Vercel 预览构建验证，不要伪造通过。

- [ ] **Step 2: 推送并开 PR（目标分支 `db-foundation`）**

```bash
git push -u origin HEAD
gh pr create --base db-foundation --title "13F 拆股修正:共享变动层按拆股换算(PR A)" --body-file /path/to/body.md
```

PR 描述必须包含：
- 问题与基线数字（spec §一表格）
- 新表 DDL 未执行
- 上线步骤（Step 3–6）
- 行为变化：新纳入跟踪、只有一季申报的经理不再在共识榜里把全部持仓记成“新建”（与详情页、报告一致）
- 已知取舍：只有一位持有人、表外的拆股无法交叉验证；同券多行仍沿用旧的 Map 取最后一行
- 末尾加 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`

开 PR 后按会话规则调用 `ccd_pr` 的 `get_status` / `bind_pr`。

- [ ] **Step 3: 预览核对（代码已部署、表还没建）**

在 Vercel 预览上打开：
- `/investors`（应与线上完全一样，走 RPC 回退）
- `/investors/dodge-and-cox`
- `/stocks/CVNA`

应正常渲染，无 500 / 404。预览服务端日志无 `split_adjustments query failed`。

- [ ] **Step 4: 【停，问用户】合并 PR**

得到明确同意后再合并，用完整 SHA：`gh pr merge --merge --match-head-commit <full-sha>`。等正式站部署成功。

- [ ] **Step 5: 【停，问用户】执行 DDL**

把迁移文件内容交给用户，请用户在 Supabase SQL Editor 执行。执行者不碰任何密钥。

- [ ] **Step 6: 【停，问用户】跑一次完整入库**

请用户在 GitHub Actions 手动触发 `ingest` workflow（`workflow_dispatch`）。它会依次：ingest → 共识（写两张新表）→ 刷新全站缓存 → 重算 live 报告（final 报告被触发器冻结，不变）。确认日志里出现“拆股系数 N 条，季度汇总 M 户”。

- [ ] **Step 7: 验收**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-split-fake-adds.ts`

Expected:
- 最新季被改正的条数 ≈ 24（另含表外推断成立的若干条）。
- 方向翻转 ≈ 11，变为未变 ≈ 3。
- CVNA bought 约 5 位，BKNG bought 约 5 位。

把实际输出贴进 PR 评论。与基线差异较大时，逐条看 `evidence` 解释原因，不要硬凑数字。

正式站抽查：
- `/investors/cas-investment-partners` 的 CVNA 应是减持。
- `/investors/gmo` 的 KLAC 应是减持。
- `/investors/dodge-and-cox` 的 BKNG 应是小幅增持。
- `/investors` 列表照常显示。

估值护栏：下一次 `valuation` workflow（每周六）运行后，CMCSA、FDX、BDX 不再显示“估值暂停”。如果用户希望提前，可以请用户手动触发该 workflow。

- [ ] **Step 8: 更新记忆与 spec 状态**

在 spec 头部状态行追加“PR A 已上线（日期、PR 链接）”，单独 commit 推到 `db-foundation` 前先问用户。
