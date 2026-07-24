# 估值基点 TTM 化(增量法)实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 估值引擎"最新一年"基点从最新 10-K 换成 TTM(增量法拼接),消除最高 13 个月滞后;历史正常化保持纯 FY;拼不出整体回退 FY 零漂移。

**Architecture:** 新纯函数 `buildTtm`(FundamentalPeriod 层合成一条 `fiscal_period="TTM"` 行)→ `fundamentalsToFloorInput` 经既有 mapper 转成 `floorInput.ttm` → `computeValuationFloor` 用 `workYears=[TTM, FY-1…]` 跑窗口选取,`allYears` 保持纯 FY。ingest/个股页把 as-of 两道闸重锚 TTM 期末,payload 加 `fundamental_basis`。

**Tech Stack:** TypeScript(Next 16 App Router)、Supabase REST、tsx 脚本。

**Spec:** `docs/superpowers/specs/2026-07-24-ttm-valuation-basis-design.md`(已获批;各 Task 引用其 §号)

## Global Constraints

- 本项目**无测试框架**:验证 = `npx tsc --noEmit` + 各 `*.check.ts`(`npx tsx --tsconfig scripts/tsconfig.json <file>`,check 文件在 src 内用 `npx tsx src/lib/valuation/xxx.check.ts` 跑,失败即 `process.exit(1)`)。
- 分支:`plan/valuation-ttm-basis`(off db-foundation,spec 已在其上)。
- 回复/注释/文档正文中文,代码标识符与既有英文注释风格不变;UI 文案 en/zh 各自成文,禁中英混排、禁 AI 腔(过 `web/docs/copy-voice.md` 口味)。
- 所有真数据脚本先 `cd web`,env 从 `.env.local` 读(`SUPABASE_URL`/`SUPABASE_SERVICE_KEY`/`SEC_USER_AGENT`)。
- **零漂移红线**:不传 quarterRows / TTM 拼不出的票,floorInput 与 verdict 与现状 byte-for-byte 一致。
- 常量不许拍脑袋:`TTM_PAIR_WINDOW_DAYS=45`、`TTM_MAX_NEW_QUARTERS=3` 已在 spec §4.2 落定(45 天覆盖 4-4-5 财历与周末漂移;>3 个新季度说明年报缺报)。
- 生产 DB 写入(`valuation:ingest`)不在本计划内,合并后另行授权。

---

### Task 1: `ttmBasis.ts` 纯函数合成模块 + check

**Files:**
- Create: `web/src/lib/valuation/ttmBasis.ts`
- Create: `web/src/lib/valuation/ttmBasis.check.ts`

**Interfaces:**
- Consumes: `FundamentalPeriod`(`@/lib/sec/normalize-facts`)
- Produces: `buildTtm(fyRows: FundamentalPeriod[], quarterRows: FundamentalPeriod[]): TtmSynthesis | null`,其中 `TtmSynthesis = { row: FundamentalPeriod; period_end: string; quarters_used: string[]; degraded_fields: string[] }`。Task 3 依赖此签名。

- [ ] **Step 1: 写 `ttmBasis.ts`**(spec §4 全量落地)

```ts
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";

// spec §4.2:配对窗 ±45 天(覆盖 4-4-5 财历/周末漂移);FY 后新季度 >3 个 = 年报缺报,整体放弃。
export const TTM_PAIR_WINDOW_DAYS = 45;
export const TTM_MAX_NEW_QUARTERS = 3;

/** 流量项:TTM = FY + Σ新季度 − Σ去年同期(spec §4.3)。 */
const FLOW_FIELDS = [
  "revenue", "gross_profit", "operating_income", "net_income", "pretax_income",
  "income_tax_expense", "d_and_a", "capex", "rd_expense", "sga_expense",
  "stock_based_comp", "operating_cash_flow", "share_repurchases", "dividends_paid",
] as const;
type FlowField = (typeof FLOW_FIELDS)[number];

/** 存量项:直取最新真实 10-Q,单项 null 回退 FY 值(spec §4.3)。 */
const STOCK_FIELDS = [
  "shareholders_equity", "goodwill", "intangibles", "cash_and_equivalents",
  "short_term_investments", "total_debt", "net_debt", "working_capital", "ppe_net",
  "current_assets", "current_liabilities", "total_assets", "total_liabilities",
  "minority_interest", "preferred_equity",
] as const;

export type TtmSynthesis = {
  /** fiscal_period="TTM" 合成行,FundamentalPeriod 同构 → 复用既有 row→ValuationFloorYear mapper。 */
  row: FundamentalPeriod;
  period_end: string;
  quarters_used: string[];
  /** 单项回退 FY 原值的流量字段(revenue/net_income 落入即整体 null,不会出现在成功结果里)。 */
  degraded_fields: string[];
};

const isRealQ = (r: FundamentalPeriod): boolean =>
  r.form === "10-Q" && r.is_derived !== true && r.period_end != null;

const daysBetween = (a: string, b: string): number =>
  Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** 去年同期配对:全按 period_end 日期窗,禁用 fiscal_year/fiscal_period 标签(spec §3 off-by-one 雷区)。 */
function findYearAgoMatch(q: FundamentalPeriod, pool: FundamentalPeriod[], fyEnd: string): FundamentalPeriod | null {
  const target = Date.parse(q.period_end) - 365 * 86_400_000;
  let best: FundamentalPeriod | null = null;
  let bestDist = Infinity;
  for (const c of pool) {
    if (c.period_end > fyEnd) continue; // 配对季度必须落在 FY 锚窗口内,否则差额跑出锚外
    const dist = Math.abs(Date.parse(c.period_end) - target) / 86_400_000;
    if (dist <= TTM_PAIR_WINDOW_DAYS && dist < bestDist) { best = c; bestDist = dist; }
  }
  return best;
}

const fin = (v: number | null | undefined): v is number => v != null && Number.isFinite(v);

/**
 * TTM 合成(spec §4):增量法 TTM = 最新FY + Σ(FY后真实10-Q) − Σ(去年同期真实10-Q)。
 * 返回 null = 不可用,调用方回退 FY(现状路径,零漂移)。五道卫生闸见 spec §4.4。
 */
export function buildTtm(
  fyRows: FundamentalPeriod[],
  quarterRows: FundamentalPeriod[],
): TtmSynthesis | null {
  const fy0 = (fyRows ?? [])
    .filter((r) => r.fiscal_period === "FY" && r.period_end != null)
    .sort((a, b) => b.period_end.localeCompare(a.period_end))[0];
  if (!fy0) return null;

  const realQs = (quarterRows ?? []).filter(isRealQ);
  const newQs = realQs
    .filter((q) => q.period_end > fy0.period_end)
    .sort((a, b) => a.period_end.localeCompare(b.period_end));
  if (newQs.length === 0) return null;                      // 闸1:没有比年报新的 10-Q
  if (newQs.length > TTM_MAX_NEW_QUARTERS) return null;     // 闸1':年报缺报
  // 同一新季度期末重复行(修订重报)取 filing_date 最新的一条
  const dedupNew = [...new Map(newQs.map((q) => [q.period_end, q])).values()];

  const matches: FundamentalPeriod[] = [];
  for (const q of dedupNew) {
    const m = findYearAgoMatch(q, realQs, fy0.period_end);
    if (!m) return null;                                    // 闸2:缺去年同期配对
    matches.push(m);
  }

  const degraded: string[] = [];
  const flow: Partial<Record<FlowField, number | null>> = {};
  for (const f of FLOW_FIELDS) {
    const parts = [fy0[f], ...dedupNew.map((q) => q[f]), ...matches.map((m) => m[f])];
    if (parts.every(fin)) {
      flow[f] = (fy0[f] as number)
        + dedupNew.reduce((s, q) => s + (q[f] as number), 0)
        - matches.reduce((s, m) => s + (m[f] as number), 0);
    } else {
      flow[f] = fy0[f];                                     // 单项回退 FY 原值
      degraded.push(f);
    }
  }
  if (degraded.includes("revenue") || degraded.includes("net_income")) return null; // 闸4:核心流量必须真 TTM
  const rev = flow.revenue, ni = flow.net_income;
  if (!fin(rev) || rev <= 0 || !fin(ni)) return null;       // 闸3:TTM 营收/净利不成立
  // 闸5:物理不变量(与 fundamentalsIntegrityViolated 同口径)
  if (fin(flow.operating_income) && flow.operating_income > rev) return null;
  if (fin(flow.gross_profit) && flow.gross_profit > rev) return null;

  const lastQ = dedupNew[dedupNew.length - 1];
  const stock = Object.fromEntries(
    STOCK_FIELDS.map((f) => [f, lastQ[f] ?? fy0[f]]),        // 存量:最新10-Q,单项 null 回退 FY
  );
  const taxRate = fin(flow.income_tax_expense) && fin(flow.pretax_income) && (flow.pretax_income as number) > 0
    ? (flow.income_tax_expense as number) / (flow.pretax_income as number)
    : null;

  const row: FundamentalPeriod = {
    ...fy0,
    ...stock,
    ...flow,
    fiscal_year: (fy0.fiscal_year ?? 0) + 1,                // spec §4.3:滚动窗标签 = FY0+1(工作序列已剔 FY0,无冲突)
    fiscal_period: "TTM",
    period_end: lastQ.period_end,
    filing_date: lastQ.filing_date,
    accession_number: lastQ.accession_number,
    form: "10-K+10-Q",
    shares_diluted: lastQ.shares_diluted ?? fy0.shares_diluted, // 最新10-Q报告值;null 回退 FY
    effective_tax_rate: taxRate,
    operating_margin: fin(flow.operating_income) ? (flow.operating_income as number) / rev : null,
    // 未重算的派生列一律清空,防 FY 旧值假冒 TTM
    eps_diluted: null, free_cash_flow: null, ebitda: null,
    revenue_yoy: null, net_income_yoy: null, fcf_yoy: null,
    gross_margin: null, net_margin: null, fcf_margin: null, roe: null,
    shares_outstanding: lastQ.shares_outstanding ?? null,
  };
  return { row, period_end: lastQ.period_end, quarters_used: dedupNew.map((q) => q.period_end), degraded_fields: degraded };
}
```

注:若 `FundamentalPeriod` 上还有本文件未列出的派生字段,一并在 `row` 里置 null(原则:凡不是本函数算出的派生值,不得保留 FY 旧值)。`roe` 等若 tsc 报不存在则删掉该行。

- [ ] **Step 2: 写 `ttmBasis.check.ts`**(卫生闸逐条负例 + 正例对账,spec §9.6)

```ts
import { buildTtm, TTM_PAIR_WINDOW_DAYS } from "./ttmBasis";
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";

let failed = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) { console.error(`FAIL: ${msg}`); failed++; } else console.log(`ok: ${msg}`);
};

// 最小合法行工厂:只填本模块消费的字段,其余 null。
const base: FundamentalPeriod = {
  ticker: "T", cik: "0", form: "10-K", fiscal_year: 2025, fiscal_period: "FY",
  period_end: "2025-12-31", filing_date: "2026-02-01", accession_number: null,
  revenue: 400, gross_profit: 200, operating_income: 100, net_income: 80, eps_diluted: null,
  shares_diluted: 10, operating_cash_flow: 120, capex: -20, free_cash_flow: null,
  d_and_a: 15, stock_based_comp: 5, rd_expense: 30, sga_expense: 50, interest_expense: null,
  pretax_income: 100, income_tax_expense: 20, dividends_paid: 8, share_repurchases: 12,
  cash_and_equivalents: 50, short_term_investments: null, current_assets: 90, current_liabilities: 60,
  total_assets: 500, total_liabilities: 300, total_debt: 100, ppe_net: 80,
  goodwill: 40, intangibles: 10, shareholders_equity: 200, minority_interest: null,
  preferred_equity: null, shares_outstanding: null, ebitda: null, working_capital: 30,
  effective_tax_rate: 0.2, revenue_yoy: null, net_income_yoy: null, fcf_yoy: null,
  gross_margin: null, operating_margin: 0.25, net_margin: null, fcf_margin: null, roe: null,
  net_debt: 50, is_derived: false, data_quality: "high",
} as unknown as FundamentalPeriod;
const q = (end: string, over: Partial<FundamentalPeriod>): FundamentalPeriod =>
  ({ ...base, form: "10-Q", fiscal_period: "Q?", period_end: end, ...over }) as FundamentalPeriod;

// 正例:FY2025(400) + Q1'26(110) − Q1'25(90) = 420
const q1n = q("2026-03-31", { revenue: 110, net_income: 30, operating_income: 28, gross_profit: 55,
  pretax_income: 30, income_tax_expense: 6, d_and_a: 4, capex: -6, rd_expense: 8, sga_expense: 12,
  stock_based_comp: 2, operating_cash_flow: 35, share_repurchases: 3, dividends_paid: 2,
  shareholders_equity: 210, shares_diluted: 9.8 });
const q1o = q("2025-03-31", { revenue: 90, net_income: 20, operating_income: 22, gross_profit: 45,
  pretax_income: 25, income_tax_expense: 5, d_and_a: 3, capex: -4, rd_expense: 7, sga_expense: 11,
  stock_based_comp: 1, operating_cash_flow: 28, share_repurchases: 2, dividends_paid: 2 });
{
  const r = buildTtm([base], [q1n, q1o]);
  assert(r != null, "正例可合成");
  assert(r!.row.revenue === 420, `TTM revenue 420,得 ${r!.row.revenue}`);
  assert(r!.row.net_income === 90, `TTM NI 90,得 ${r!.row.net_income}`);
  assert(r!.row.shareholders_equity === 210, "存量取最新10-Q");
  assert(r!.row.shares_diluted === 9.8, "shares 取最新10-Q");
  assert(r!.period_end === "2026-03-31" && r!.row.fiscal_year === 2026, "期末/标签");
  assert(r!.degraded_fields.length === 0, "无 degraded");
}
// 闸1:无新季度
assert(buildTtm([base], [q1o]) === null, "闸1 无新季度→null");
// 闸2:缺去年同期配对(把旧季度期末挪出±45天窗)
assert(buildTtm([base], [q1n, q("2025-01-15", { revenue: 90 })]) === null, "闸2 缺配对→null");
// 闸2':配对不吃派生行
assert(buildTtm([base], [q1n, { ...q1o, is_derived: true } as FundamentalPeriod]) === null, "派生行不算配对→null");
// 闸4:新季度 revenue null → 核心 degraded → null
assert(buildTtm([base], [{ ...q1n, revenue: null } as FundamentalPeriod, q1o]) === null, "闸4 核心流量缺→null");
// 闸3:TTM revenue ≤ 0(400 + 10 − 500 = −90)
assert(buildTtm([base], [{ ...q1n, revenue: 10 } as FundamentalPeriod, { ...q1o, revenue: 500 } as FundamentalPeriod]) === null, "闸3 TTM营收≤0→null");
// 闸5:不变量 opInc > revenue(TTM opInc = 390+120−5 = 505 > TTM rev = 400+101−95 = 406)
assert(buildTtm(
  [{ ...base, operating_income: 390 } as FundamentalPeriod],
  [{ ...q1n, operating_income: 120, revenue: 101 } as FundamentalPeriod,
   { ...q1o, operating_income: 5, revenue: 95 } as FundamentalPeriod],
) === null, "闸5 opInc>rev 不变量→null");
// 单项 degraded:rd_expense 缺 → 回退 FY 值且记录
{
  const r = buildTtm([base], [{ ...q1n, rd_expense: null } as FundamentalPeriod, q1o]);
  assert(r != null && r.row.rd_expense === base.rd_expense && r.degraded_fields.includes("rd_expense"), "单项degraded回退FY并记录");
}
console.log(failed ? `\n${failed} failure(s)` : "\nttmBasis.check ALL GREEN");
if (failed) process.exit(1);
```


- [ ] **Step 3: 跑 check 验证**

Run: `cd web && npx tsx src/lib/valuation/ttmBasis.check.ts`
Expected: `ttmBasis.check ALL GREEN`

- [ ] **Step 4: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/valuation/ttmBasis.ts web/src/lib/valuation/ttmBasis.check.ts
git commit -m "feat(valuation): TTM synthesis via incremental splicing (pure module + gates)"
```

---

### Task 2: `floorInput.ttm` 字段 + `computeValuationFloor` workYears seam

**Files:**
- Modify: `web/src/lib/valuation/types.ts:256-262`(ValuationFloorInput)
- Modify: `web/src/lib/valuation/epvFloor.ts:103-125`(computeValuationFloor)
- Modify: `web/src/lib/valuation/epvFloor.check.ts`(追加断言)

**Interfaces:**
- Consumes: 无(类型层)
- Produces: `ValuationFloorInput.ttm?: { year: ValuationFloorYear; period_end: string; quarters_used: string[] }`;Task 3 依赖此字段名。

- [ ] **Step 1: types.ts 加字段**(插在 `sic?: number;` 之后)

```ts
  /** TTM 合成基点(spec 2026-07-24-ttm-valuation-basis):最新基点用滚动十二个月行顶替最新 FY;
   *  years 本身保持纯 FY(增长回归/盈利闸/roicLongTermStrong 的审计地基不动)。缺省 = 纯 FY 现状。 */
  ttm?: { year: ValuationFloorYear; period_end: string; quarters_used: string[] };
```

- [ ] **Step 2: computeValuationFloor seam**(spec §5)。现文件 103-125 行改为:

```ts
export function computeValuationFloor(input: ValuationFloorInput): ValuationFloor | PerShareUnavailable | undefined {
  // TTM 基点(spec §5):工作序列 = [TTM, FY-1…](TTM 顶替 FY0,窗口与 FY-1 不重叠);
  // allYears 保持纯 FY —— 回归型判据(roicLongTermStrong/growthFranchise/结构性趋势)审计地基不动。
  const fyYears = input.years;
  const workYears = input.ttm ? [input.ttm.year, ...fyYears.slice(1)] : fyYears;
  const earningsYears = selectEarningsYears(workYears);
  if (earningsYears.length < MIN_YEARS) return undefined;

  const shares =
    earningsYears.map((y) => y.shares_diluted).find((s) => s != null && s > 0) ??
    workYears.map((y) => y.shares_diluted).find((s) => s != null && s > 0);
  if (shares == null) return { kind: "per_share_unavailable", reason: MULTI_CLASS_REASON };

  const marginYears = selectYears(workYears);
  const isFinancial = isFinancialSic(input.sic);
  const allYears = fyYears;
  if (marginYears.length >= MIN_YEARS) return buildFullFloor(marginYears, shares, isFinancial, allYears);
  return buildSingleLampFloor(earningsYears, shares, isFinancial, allYears);
}
```

(原 107-113 行注释保留原位语义:shares 兜底遍历从 `input.years` 改 `workYears`;118-122 行既有中文注释块保留,`const allYears = input.years;` 改为 `const allYears = fyYears;`。)

- [ ] **Step 3: epvFloor.check.ts 追加两条断言**(文件既有断言风格照抄):
  1. **零漂移**:任取既有 check 用的合成 floorInput,不带 `ttm` 跑 `computeValuationFloor`,与改动前结果 JSON.stringify 相等(实现上:断言与该 check 既有期望值不变即够——既有断言全绿本身就是零漂移证明,此条可并入说明注释)。
  2. **TTM 生效**:构造 6 年 FY 输入(各年 revenue 100…150),再附 `ttm: { year: {...最新年副本, revenue: 999, net_income: <对应>, fiscal_year: 最新+1 }, period_end: "2099-01-01", quarters_used: [] }`,断言返回 floor 的 `epv` 相关口径吃到 999(最直接:`as_of_fiscal_year === 最新+1` 且 `years_used[0] === 最新+1`)。

- [ ] **Step 4: 跑 check + tsc**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts && npx tsc --noEmit`
Expected: 全绿、0 errors(既有断言不许动——动了 = 破坏零漂移红线,回去修实现)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/valuation/types.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): ttm seam in computeValuationFloor; allYears stays pure FY"
```

---

### Task 3: 接线 — mapper 复用、读取器扩容、ingest/个股页 as-of 重锚、payload

**Files:**
- Modify: `web/src/lib/valuation/fundamentalsToFloorInput.ts`
- Modify: `web/src/lib/sec/read.ts`(quarterly 8→12)
- Modify: `web/scripts/valuation-ingest.ts:141` 附近
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx:369-389`

**Interfaces:**
- Consumes: Task 1 `buildTtm`、Task 2 `floorInput.ttm`
- Produces: `fundamentalsToFloorInput(ticker, companyName, rows, adsRatio, sic, quarterRows?)` 第 6 参;payload 里 `fundamental_basis: { kind: "ttm" | "fy"; as_of: string | null; quarters_used?: string[] }`。Task 4/5 依赖。

- [ ] **Step 1: fundamentalsToFloorInput 抽 mapper + 加第 6 参**

把现有 `.map((r) => ({...}))` 的行内对象字面量抽成文件内函数 `toFloorYear(r: FundamentalPeriod, adsRatio: number): ValuationFloorYear`(内容逐字搬移,含 adsRatio 归一化与 capex 取绝对值注释),`years` 改为 `.map((r) => toFloorYear(r, adsRatio))`。然后:

```ts
import { buildTtm } from "./ttmBasis";

export function fundamentalsToFloorInput(
  ticker: string,
  companyName: string | null | undefined,
  rows: FundamentalPeriod[] | undefined,
  adsRatio: number = 1,
  sic?: number | null,
  quarterRows?: FundamentalPeriod[],
): ValuationFloorInput {
  const years: ValuationFloorYear[] = /* 现状不动(FY 过滤+排序+toFloorYear) */;
  // TTM 基点(spec §4-5):合成失败 → 不填 ttm,引擎走纯 FY 现状(零漂移)。
  const ttmSyn = quarterRows?.length ? buildTtm(rows ?? [], quarterRows) : null;
  const ttm = ttmSyn
    ? { year: toFloorYear(ttmSyn.row, adsRatio), period_end: ttmSyn.period_end, quarters_used: ttmSyn.quarters_used }
    : undefined;
  return { ticker, company_name: companyName ?? undefined, years, sic: sic ?? undefined, ...(ttm ? { ttm } : {}) };
}
```

- [ ] **Step 2: read.ts quarterly 扩容**

`src/lib/sec/read.ts` 中 `.slice(0, 8)` → `.slice(0, 12)`(注释:TTM 增量法最坏 3 新 + 3 配对 + 跨年缓冲,spec §4.2)。periods 查询 `limit(32)` 不动(6 FY + 12 Q 足够)。

- [ ] **Step 3: ingest 接线**(`scripts/valuation-ingest.ts` 141 行起)

```ts
      const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual, ads.ratio, sic, sec.quarterly);
      // as-of 重锚(spec §6):TTM 生效 → 新鲜度/拆股闸都按 TTM 期末判
      const fundamentalsAsOf = floorInput.ttm?.period_end ?? sec.annual?.[0]?.period_end ?? null;
      const fundamentalsStale = isFundamentalsStale(fundamentalsAsOf, computedAt);
```

`isSplitCoverageStale` 调用里 `fundamentalsAsOf: sec.annual?.[0]?.period_end ?? null` → `fundamentalsAsOf`。
rows.push 的 payload 增:

```ts
        payload: {
          ...v,
          expectations: run.expectations,
          methods: run.methods,
          fundamental_basis: floorInput.ttm
            ? { kind: "ttm", as_of: floorInput.ttm.period_end, quarters_used: floorInput.ttm.quarters_used }
            : { kind: "fy", as_of: sec.annual?.[0]?.period_end ?? null },
          ...(run.oeDcf?.assessable && run.oeDcf.moatCap ? { moatCap: run.oeDcf.moatCap } : {}),
        },
```

并在循环计数区加 `let ttmBasis = 0;`,valued++ 处 `if (floorInput.ttm) ttmBasis++;`,结尾 summary console 打印 `TTM基点: ${ttmBasis}/${valued}`(spec §9.5 三分账的 ingest 侧)。

- [ ] **Step 4: 个股页接线**(`page.tsx:369-389`,与 ingest 同构)

```ts
  const floorInput = fundamentalsToFloorInput(ticker, issuer, sec.annual, ads.ratio, sic, sec.quarterly);
  const fundamentalsAsOf = floorInput.ttm?.period_end ?? sec.annual?.[0]?.period_end ?? null;
  const fundamentalsStale = isFundamentalsStale(fundamentalsAsOf, new Date().toISOString());
```

`isSplitCoverageStale({ fundamentalsAsOf: sec.annual?.[0]?.period_end ?? null, latestSplitDate })` → `{ fundamentalsAsOf, latestSplitDate }`。

- [ ] **Step 5: tsc + 既有 check 回归**

Run: `cd web && npx tsc --noEmit && npx tsx src/lib/valuation/epvFloor.check.ts && npx tsx src/lib/valuation/ttmBasis.check.ts && npx tsx src/lib/valuation/runValuation.check.ts`
Expected: 全绿

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/valuation/fundamentalsToFloorInput.ts web/src/lib/sec/read.ts web/scripts/valuation-ingest.ts "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(valuation): wire TTM basis into ingest and stock page; re-anchor as-of gates"
```

---

### Task 4: UI — as-of/眉标/双语披露

**Files:**
- Modify: `web/src/lib/stocks/stockCopy.ts`(en 块 121-144 行区、zh 对应块)
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`(估值节 + Business quality 头部)

**Interfaces:**
- Consumes: Task 3 `floorInput.ttm`
- Produces: 无(叶子)

**口径裁定(spec §7 的诚实化细化,已在 spec 自审立场内)**:Business quality 四指标仍是年度数,它的 `as of` **保持年报期末不变**(as-of 必须描述所展示数字的口径);TTM 生效时在估值节与 BQ 头部各加一行披露,眉标不动。

- [ ] **Step 1: stockCopy 两语各加一条**(en 块 `valuation` 内、zh 块对应处;zh 纯中文、en 纯英文,禁混排)

```ts
      // en
      ttmBasis: (d: string) => `Valuation basis: trailing twelve months to ${d} — latest 10-K plus unaudited 10-Q filings.`,
      // zh
      ttmBasis: (d: string) => `估值口径:截至 ${d} 的滚动十二个月(最新 10-K 叠加未审计 10-Q)。`,
```

- [ ] **Step 2: page.tsx 渲染**。估值节 `<EarningsPowerFloorCard …/>` 所在 `<div className="mt-3">` 之后(与 PriceBetBlock 之间)加:

```tsx
                  {floorInput.ttm && (
                    <p className="mt-2 text-xs text-[var(--tt-muted)]">
                      {page.valuation.ttmBasis(floorInput.ttm.period_end)}
                    </p>
                  )}
```

Business quality 头部(546-560 行区,`page.bq.asOf(bq.asOf)` 渲染点同级)在 as-of 之后追加同一行文案(条件同上,复用 `page.valuation.ttmBasis`,不新增 bq 键——同一句话不写两份)。

- [ ] **Step 3: 目检双语**(无本地渲染条件时以 tsc + 代码走查代替;文案对照 `web/docs/copy-voice.md`:无破折号抒情、无对仗、无 SaaS 腔)

Run: `cd web && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/stocks/stockCopy.ts "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(stocks): TTM basis disclosure on valuation and business-quality sections"
```

---

### Task 5: 真数据验收探针(spec §9.1-9.5)

**Files:**
- Create: `web/scripts/probe-ttm-basis.ts`(只读,照抄 `probe-growth-franchise.ts` 的 env/import 骨架)

**Interfaces:**
- Consumes: Task 3 全链(`getSecCompanyData` → `fundamentalsToFloorInput` 带/不带 quarterly → `runValuation`)
- Produces: 验收数字,回填 spec 新增小节"验收记录(2026-07-24)"

- [ ] **Step 1: 写探针**。对每只 ticker 跑两遍引擎(A=现状:不传 quarterRows;B=TTM:传 `sec.quarterly`),打印:`basis(fy/ttm) | as_of | TTM rev/NI | FY rev/NI | IV(neutral) | bucket | band | marginPct`。ticker 集:

```
GOOGL MSFT AMZN NFLX EMN HRB ASML SAP NVO SPGI BKNG
```

内置三条硬断言(任一失败 exit 1):
1. **GOOGL 对账**(spec §9.1):`ttm.revenue ≈ 402_836e6 + Q1'26 − Q1'25`,与脚本内独立用 REST 拉的三个数字复算值相对误差 < 0.1%;`as_of === "2026-03-31"`(若 Q2'26 已入库则改断言为 ≥ "2026-03-31" 并打印实际)。
2. **FY-only 零漂移**(spec §9.3):ASML/SAP/NVO(20-F 外股,无 10-Q)A/B 两遍 `JSON.stringify(run.verdict)` 与 `JSON.stringify(floorInput.years)` 全等,且 `floorInput.ttm === undefined`。
3. **HRB 季节性**(spec §9.2):打印 `|TTM_NI − FY_NI| / FY_NI`,断言 < 15%(增量法抵消季节性;HRB verdict 仍被死角闸抑制,只看 floor 层数字,探针里对 HRB 跳过 verdict 断言并注明)。

- [ ] **Step 2: 跑探针,记录输出**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-ttm-basis.ts`
Expected: 三条断言全过;SPGI/BKNG 打印行显式标注 split 抑制在 TTM as-of 下是否解除(spec §6 副作用,只记录方向,不作硬断言——取决于 10-Q 是否已覆盖拆股)。

- [ ] **Step 3: 全 universe 三分账抽样**(spec §9.5 的本地版,不写生产库):探针加 `--sample N` 模式,从 consensus 随机取 80 票跑 B 路,输出 `ttm命中 / fy回退 / 引擎抑制` 三计数;断言:抑制数 ≤ A 路同集抑制数(TTM 不得新增抑制)。

- [ ] **Step 4: 验收数字回填 spec**(新增"## 验收记录(2026-07-24)"小节,贴探针关键行),commit

```bash
git add web/scripts/probe-ttm-basis.ts docs/superpowers/specs/2026-07-24-ttm-valuation-basis-design.md
git commit -m "test(valuation): TTM acceptance probe — GOOGL reconciliation, ADR zero-drift, HRB seasonality"
```

---

### Task 6: 全套回归 + 终验

**Files:** 无新文件(只跑)

- [ ] **Step 1: 全部 check 脚本**

Run: `cd web && for f in src/lib/valuation/*.check.ts; do echo "== $f"; npx tsx "$f" || exit 1; done`
Expected: 全绿(尤其 epvFloor/runValuation/splitCoverage/fundamentalsStale——as-of 重锚不许破坏既有语义断言)

- [ ] **Step 2: tsc 终验**

Run: `cd web && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 3: 零漂移终证**:`git stash` 暂存全部改动 → 跑 `probe-ttm-basis.ts` 的 A 路对照集(MSFT/NFLX/EMN)记录 verdict JSON → `git stash pop` → 再跑 A 路(仍不传 quarterly)比对全等。证明"不启用 TTM 时代码路径 byte-for-byte"。

- [ ] **Step 4: Commit(如有回归修复)+ 汇报**

```bash
git add -A && git commit -m "chore(valuation): ttm regression fixes" # 仅在有修复时
```

---

## Self-Review 记录

- **Spec 覆盖**:§4→Task1;§5→Task2;§4.2 读取器扩容+§6+§7 payload→Task3;§7 UI→Task4;§9.1-9.6→Task1(负例)/Task5(真数据)/Task6(回归);§8 非目标未越界。
- **类型一致**:`buildTtm`/`TtmSynthesis`/`floorInput.ttm.{year,period_end,quarters_used}`/`fundamental_basis` 四处名称已交叉核对。
- **占位符**:Task1 Step2 有两处标注"必须落成真实断言"的显式指令,非占位;其余无 TBD。
- **已知取舍**:BQ 卡 as-of 保持年度口径(诚实性裁定,见 Task4 口径裁定段);TTM 行 R&D aging age-1 空档(spec §4.3 已记)。
