# 拆股口径护栏(Phase 1)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 当基本面 as-of 早于最近一次拆股、价格已是拆股后口径时,抑制被 10 倍放大的假估值判定(verdict → null),并在个股页给一句诚实说明。

**Architecture:** Yahoo `chart` 请求加 `&events=splits` 抓拆股事件 → 存入新表 `stock_splits`;新增纯谓词 `isSplitCoverageStale(fundamentalsAsOf, latestSplitDate)`,由个股页与快照 ingest 两处读 `getLatestSplit(ticker)` + 最新 FY `period_end` 算出 flag,传入共享纯函数 `deriveValuationVerdict`(为 true 时 `return null`);个股页在 flag 为 true 时改渲染说明文案而非估值卡。

**Tech Stack:** Next.js(App Router,见 `web/AGENTS.md`——非你熟悉的 Next)、TypeScript、Supabase(PostgREST)、`node:assert` + `tsx` 自检(无测试框架,逐文件 `npx tsx x.check.ts` 跑)。

## Global Constraints

- 所有回复正文 + plan/文档正文一律中文(代码/术语/路径除外)。
- UI 文案禁中英混排:en/zh 各自纯本语言,独立判定质量;遵 `web/docs/copy-voice.md`(具体、去 AI 腔)。
- 本项目默认不跑测试套件;纯函数用 `.check.ts` 自检,整体用 `npx tsc` 当门。
- 迁移幂等(`if not exists`),结尾 `notify pgrst, 'reload schema';`,命名 `YYYYMMDD_<desc>.sql`。
- 价格 `close` 用未复权语义的现有约定不变(本计划不碰价格解析行为)。
- 全部改动在 worktree `.claude/worktrees/heuristic-leakey-2b12b0/web` 下,分支 `jlz/interesting-euclid-e45ae8`。
- ⚠️ worktree 无 node_modules:`.check.ts` / `tsc` 用 worktree 可跑(tsx/tsc 走全局);但**读真库的探针须在主仓库 `/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web` 跑**(有 node_modules + .env.local)。

---

### Task 1: Yahoo 拆股事件解析

**Files:**
- Modify: `web/src/lib/prices/providers/types.ts`(加 `SplitEvent` 类型)
- Modify: `web/src/lib/prices/providers/yahoo.ts`(加 `parseYahooSplits` + `YahooChartProvider.fetchSplits`)
- Test: `web/src/lib/prices/providers/yahoo-splits.check.ts`(新建)

**Interfaces:**
- Produces:
  - `type SplitEvent = { ticker: string; split_date: string; ratio: number }`(在 `types.ts` 导出)
  - `export function parseYahooSplits(json: unknown, ticker: string): SplitEvent[]`(在 `yahoo.ts`)
  - `YahooChartProvider.fetchSplits(ticker: string, sinceYears?: number): Promise<SplitEvent[]>`

- [ ] **Step 1: 在 types.ts 追加 SplitEvent 类型**

在 `web/src/lib/prices/providers/types.ts` 末尾(`PriceProvider` 接口之后)追加:

```ts
// 拆股事件(仅 Yahoo 提供)。ratio = numerator/denominator(如 10-for-1 → 10)。
export type SplitEvent = {
  ticker: string;    // 大写 app ticker
  split_date: string; // YYYY-MM-DD(拆股生效日,UTC)
  ratio: number;      // > 0
};
```

- [ ] **Step 2: 写失败测试**

新建 `web/src/lib/prices/providers/yahoo-splits.check.ts`:

```ts
/**
 * yahoo-splits.check.ts — Yahoo chart events.splits 解析自检。
 * Run: cd web && npx tsx src/lib/prices/providers/yahoo-splits.check.ts
 */
import assert from "node:assert";
import { parseYahooSplits } from "./yahoo";

// KLAC 10-for-1,生效 2026-06-12(epoch 1749686400 = 2026-06-12T00:00:00Z)。
const withSplit = {
  chart: {
    result: [
      {
        meta: { currency: "USD" },
        events: {
          splits: {
            "1749686400": { date: 1749686400, numerator: 10, denominator: 1, splitRatio: "10:1" },
          },
        },
      },
    ],
  },
};

const parsed = parseYahooSplits(withSplit, "klac");
assert.strictEqual(parsed.length, 1, "应解析出 1 个拆股事件");
assert.strictEqual(parsed[0].ticker, "KLAC", "ticker 归一为大写");
assert.strictEqual(parsed[0].split_date, "2026-06-12", "split_date 由 epoch 转 ISO");
assert.strictEqual(parsed[0].ratio, 10, "ratio = numerator/denominator");

// 无 events → 空数组(不抛)。
assert.deepStrictEqual(parseYahooSplits({ chart: { result: [{ meta: {} }] } }, "AAPL"), []);
// 退化输入 → 空数组。
assert.deepStrictEqual(parseYahooSplits({}, "AAPL"), []);
assert.deepStrictEqual(parseYahooSplits(null, "AAPL"), []);

console.log("yahoo-splits.check.ts ✓");
```

- [ ] **Step 3: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/prices/providers/yahoo-splits.check.ts`
Expected: FAIL —— `parseYahooSplits` 未导出(`SyntaxError`/`does not provide an export`)。

- [ ] **Step 4: 实现 parseYahooSplits + fetchSplits**

在 `web/src/lib/prices/providers/yahoo.ts`:

顶部 import 改为带上 `SplitEvent`:

```ts
import type { DailyClose, PriceProvider, SplitEvent } from "./types";
```

在 `parseYahooLatest` 之后追加解析函数:

```ts
type YahooSplitsJson = {
  chart?: { result?: Array<{ events?: { splits?: Record<string, { date?: number; numerator?: number; denominator?: number }> } }> };
};

// 解析 chart.result[0].events.splits → SplitEvent[]。无 events / 退化输入 → []。
export function parseYahooSplits(json: unknown, ticker: string): SplitEvent[] {
  const splits = (json as YahooSplitsJson)?.chart?.result?.[0]?.events?.splits;
  if (!splits || typeof splits !== "object") return [];
  const T = ticker.trim().toUpperCase();
  const out: SplitEvent[] = [];
  for (const ev of Object.values(splits)) {
    const num = Number(ev?.numerator);
    const den = Number(ev?.denominator);
    const epoch = Number(ev?.date);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0 || num <= 0) continue;
    if (!Number.isFinite(epoch)) continue;
    const split_date = new Date(epoch * 1000).toISOString().slice(0, 10);
    out.push({ ticker: T, split_date, ratio: num / den });
  }
  return out;
}
```

在 `YahooChartProvider` 类内(`fetchDaily` 之后)追加 `fetchSplits`。拆股窗口默认 2 年即可(超 2 年前拆股的公司早已报出拆股后财报,护栏本就不触发):

```ts
  async fetchSplits(ticker: string, sinceYears = 2): Promise<SplitEvent[]> {
    const sym = toYahooSymbol(ticker);
    const range = `${Math.max(1, Math.ceil(sinceYears))}y`;
    const url = `${CHART_URL}${encodeURIComponent(sym)}?interval=1d&range=${range}&events=splits`;
    const res = await this.fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return [];
    return parseYahooSplits(await res.json(), ticker);
  }
```

- [ ] **Step 5: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/prices/providers/yahoo-splits.check.ts`
Expected: `yahoo-splits.check.ts ✓`

- [ ] **Step 6: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/prices/providers/types.ts web/src/lib/prices/providers/yahoo.ts web/src/lib/prices/providers/yahoo-splits.check.ts
git commit -m "feat(prices): 解析 Yahoo chart events.splits 拆股事件"
```

---

### Task 2: stock_splits 表 + ingest upsert + 读取器

**Files:**
- Create: `web/supabase/migrations/20260716_create_stock_splits.sql`
- Modify: `web/scripts/lib/updatePrices.ts`(loop 后抓 splits 并 upsert)
- Modify: `web/src/lib/managers/priceRead.ts`(加 `getLatestSplit`)

**Interfaces:**
- Consumes: `YahooChartProvider.fetchSplits`(Task 1)
- Produces: `export const getLatestSplit: (ticker: string) => Promise<string | null>`(返回该 ticker 最近 `split_date`,无表/无 env/无行 → null)

- [ ] **Step 1: 写迁移**

新建 `web/supabase/migrations/20260716_create_stock_splits.sql`:

```sql
-- stock_splits: 存 Yahoo 报告的拆股事件,供估值口径护栏判定"基本面 as-of 是否早于最近拆股"。
-- 拆股后至下一份财报落地前,SEC 侧 shares_diluted 仍是拆股前口径,而价格已是拆股后 →
-- 每股价值带被放大 ~拆股比例倍。护栏读此表把 verdict 抑制为无判定,避免假安全边际。
create table if not exists public.stock_splits (
  ticker text not null,
  split_date date not null,
  ratio numeric not null,
  primary key (ticker, split_date)
);
notify pgrst, 'reload schema';
```

- [ ] **Step 2: ingest 顺带抓 splits 并 upsert**

改 `web/scripts/lib/updatePrices.ts`。顶部 import 加上 `YahooChartProvider` 与类型:

```ts
import { defaultProviders, resolveDaily, YahooChartProvider, type DailyClose, type SplitEvent } from "../../src/lib/prices/providers/index.js";
```

(确认 `web/src/lib/prices/providers/index.ts` 已 `export { YahooChartProvider }` —— 已有;`SplitEvent` 需在 index.ts 补 re-export,见 Step 2b。)

在主 ticker 循环内、`await sleep(throttle)` 之前,追加 splits 抓取到一个数组(复用同一 throttle 节奏,Yahoo 专用 provider):

```ts
    const yahoo = new YahooChartProvider();
    const splitRows: SplitEvent[] = [];
```

(上面两行放在 `const rows: PriceRow[] = [];` 附近,循环外。)循环内 `written++;` 之后追加:

```ts
      const splits = await yahoo.fetchSplits(ticker).catch(() => [] as SplitEvent[]);
      if (splits.length) splitRows.push(...splits);
```

循环结束、`if (rows.length) await flush(...)` 之后追加 splits 落库:

```ts
    if (splitRows.length) {
      const { error } = await db.from("stock_splits").upsert(
        splitRows.map((s) => ({ ticker: s.ticker, split_date: s.split_date, ratio: s.ratio })),
        { onConflict: "ticker,split_date" },
      );
      if (error) console.warn(`stock_splits upsert err: ${error.message}`);
    }
```

- [ ] **Step 2b: index.ts 补 SplitEvent re-export**

改 `web/src/lib/prices/providers/index.ts` 的类型 re-export 行:

```ts
export type { DailyClose, PriceProvider, PriceSource, SplitEvent } from "./types";
```

- [ ] **Step 3: 加 getLatestSplit 读取器**

改 `web/src/lib/managers/priceRead.ts`,在 `getPriceHistory` 之后追加:

```ts
/** 某 ticker 最近一次拆股日期(ISO)。无 env / 无表 / 无行 → null。护栏用。 */
export const getLatestSplit = cache(async (ticker: string): Promise<string | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("stock_splits").select("split_date").eq("ticker", ticker)
    .order("split_date", { ascending: false }).limit(1);
  if (error) { console.error(`getLatestSplit(${ticker}) 失败: ${error.message}`); return null; }
  return data?.[0]?.split_date ?? null;
});
```

- [ ] **Step 4: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 5: Commit**

```bash
git add web/supabase/migrations/20260716_create_stock_splits.sql web/scripts/lib/updatePrices.ts web/src/lib/prices/providers/index.ts web/src/lib/managers/priceRead.ts
git commit -m "feat(prices): stock_splits 表 + ingest 抓拆股 + getLatestSplit 读取器"
```

> **注:** 本 Task 的库端验证(表建成 + KLAC 拆股行写入)属上线步骤(需授权跑 migration + price ingest),不在实现期跑。见文末「上线与验证」。

---

### Task 3: 护栏纯函数 + deriveValuationVerdict 收口

**Files:**
- Create: `web/src/lib/valuation/splitCoverage.ts`
- Create: `web/src/lib/valuation/splitCoverage.check.ts`
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts`(入参加 `splitCoverageStale?`,早返回 null)
- Modify: `web/src/lib/valuation/deriveValuationVerdict.check.ts`(加一条断言)
- Modify: `web/src/lib/valuation/index.ts`(导出 `isSplitCoverageStale`)

**Interfaces:**
- Produces: `export function isSplitCoverageStale(input: { fundamentalsAsOf: string | null; latestSplitDate: string | null }): boolean`
- Modifies: `deriveValuationVerdict` 入参对象新增可选 `splitCoverageStale?: boolean`

- [ ] **Step 1: 写 splitCoverage 失败测试**

新建 `web/src/lib/valuation/splitCoverage.check.ts`:

```ts
/**
 * splitCoverage.check.ts — 拆股口径陈旧谓词自检。
 * Run: cd web && npx tsx src/lib/valuation/splitCoverage.check.ts
 */
import assert from "node:assert";
import { isSplitCoverageStale } from "./splitCoverage";

// 拆股晚于基本面 as-of → 陈旧(每股口径与拆股后价格错配)。
assert.strictEqual(isSplitCoverageStale({ fundamentalsAsOf: "2025-06-30", latestSplitDate: "2026-06-12" }), true);
// 拆股早于/等于基本面 as-of(拆股后财报已落地)→ 不陈旧。
assert.strictEqual(isSplitCoverageStale({ fundamentalsAsOf: "2026-06-30", latestSplitDate: "2026-06-12" }), false);
assert.strictEqual(isSplitCoverageStale({ fundamentalsAsOf: "2026-06-12", latestSplitDate: "2026-06-12" }), false);
// 任一缺失 → 不陈旧(降级为今日行为,不误伤)。
assert.strictEqual(isSplitCoverageStale({ fundamentalsAsOf: "2025-06-30", latestSplitDate: null }), false);
assert.strictEqual(isSplitCoverageStale({ fundamentalsAsOf: null, latestSplitDate: "2026-06-12" }), false);

console.log("splitCoverage.check.ts ✓");
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/splitCoverage.check.ts`
Expected: FAIL —— `./splitCoverage` 模块不存在。

- [ ] **Step 3: 实现 splitCoverage.ts**

新建 `web/src/lib/valuation/splitCoverage.ts`:

```ts
// splitCoverage.ts — 拆股口径陈旧判定(纯函数,单一真相)。
// 基本面 as-of(最新 FY period_end)早于最近拆股日期 → SEC 侧 shares 仍是拆股前口径,
// 而价格已是拆股后 → 每股价值带被放大 ~拆股比例倍。触发时估值判定不可信,整条抑制。
// 拆股后财报一 ingest(period_end ≥ split_date),谓词自动转 false,估值恢复。
export function isSplitCoverageStale(input: {
  fundamentalsAsOf: string | null; // 最新 FY period_end(ISO date)
  latestSplitDate: string | null;  // stock_splits 中该 ticker 最近拆股日期(ISO date)
}): boolean {
  const { fundamentalsAsOf, latestSplitDate } = input;
  if (!latestSplitDate || !fundamentalsAsOf) return false;
  return latestSplitDate > fundamentalsAsOf; // ISO date 字符串字典序比较对 YYYY-MM-DD 安全
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/splitCoverage.check.ts`
Expected: `splitCoverage.check.ts ✓`

- [ ] **Step 5: deriveValuationVerdict 加入参 + 早返回**

改 `web/src/lib/valuation/deriveValuationVerdict.ts`。入参类型(约 line 126-131)加一个可选字段:

```ts
export function deriveValuationVerdict(input: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
  /** 拆股口径陈旧(基本面 as-of 早于最近拆股)→ 每股口径与拆股后价格错配,整条抑制为无判定。
   *  语义同 isImplausibleBand,由调用方经 isSplitCoverageStale 算出后传入。 */
  splitCoverageStale?: boolean;
}): ValuationVerdict | null {
```

函数体最前(现 `const { floor, strikeZone, oeDcf, reconciliation } = input;` 那行)改为一并解构并早返回:

```ts
  const { floor, strikeZone, oeDcf, reconciliation, splitCoverageStale } = input;
  if (splitCoverageStale) return null; // 拆股口径错配 → 无可信判定(每股带被放大 ~拆股比例倍)
  if (!floor || floor.kind !== "floor") return null; // thin data / per_share_unavailable
```

同时更新文件顶部注释块,补记这道护栏(与 `isImplausibleBand` / `assessReliability` 并列)。

- [ ] **Step 6: deriveValuationVerdict.check.ts 加断言**

在 `web/src/lib/valuation/deriveValuationVerdict.check.ts` 末尾(`console.log` 之前)追加。用文件内已有的 `floorStub()` 与 `sz(...)` 辅助:

```ts
// 拆股口径陈旧 → 整条抑制为 null,即便 floor/strikeZone 完整、位置本可算出。
assert.strictEqual(
  deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), splitCoverageStale: true }),
  null,
  "splitCoverageStale=true → verdict 抑制为 null",
);
// 未传 / false → 行为不变(回归:仍算出非 null 判定)。
assert.ok(
  deriveValuationVerdict({ floor: floorStub(), strikeZone: sz("in_strike_zone"), splitCoverageStale: false }) != null,
  "splitCoverageStale=false → 判定照常算出",
);
```

- [ ] **Step 7: 导出 isSplitCoverageStale**

改 `web/src/lib/valuation/index.ts`,追加:

```ts
export { isSplitCoverageStale } from "./splitCoverage";
```

- [ ] **Step 8: 跑两个 check + tsc**

Run:
```bash
cd web && npx tsx src/lib/valuation/splitCoverage.check.ts \
  && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts \
  && npx tsc --noEmit
```
Expected: 两个 `✓`,tsc 无新增错误。

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/valuation/splitCoverage.ts web/src/lib/valuation/splitCoverage.check.ts web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/deriveValuationVerdict.check.ts web/src/lib/valuation/index.ts
git commit -m "feat(valuation): 拆股口径护栏 isSplitCoverageStale + deriveValuationVerdict 收口"
```

---

### Task 4: 个股页接线 + 说明文案

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`(算 flag、传 verdict、gate 估值卡渲染为说明)
- Modify: `web/src/lib/stocks/stockCopy.ts`(zh `valuation` 约 line 73-79、en `valuation` 约 line 116-122,各加 `splitPaused` 键)

**Interfaces:**
- Consumes: `getLatestSplit`(Task 2)、`isSplitCoverageStale`(Task 3)、`deriveValuationVerdict` 的 `splitCoverageStale` 入参(Task 3)

- [ ] **Step 1: 新增文案键 splitPaused**

改 `web/src/lib/stocks/stockCopy.ts`。zh 的 `valuation` 对象(现 `eyebrow/titleFallback/below/within/above`)加一键:

```ts
      splitPaused: "该公司近期拆股，每股估值口径待下一份财报对齐后恢复。",
```

en 的 `valuation` 对象同位加:

```ts
      splitPaused: "Recent stock split — per-share valuation is paused until the next filing restates the share count.",
```

(遵 copy-voice:具体、去 AI 腔;en/zh 各自独立成句,非互译填充。zh 用全角逗号,与该文件既有中文标点一致。)

- [ ] **Step 2: 页面算 splitCoverageStale 并传入 verdict**

改 `web/src/app/[lang]/stocks/[ticker]/page.tsx`。

顶部 import 补 `getLatestSplit`(来自 `@/lib/managers/priceRead`)与 `isSplitCoverageStale`(来自 `@/lib/valuation`)。

在 `handoffVerdict` 计算(约 line 410-413)之前,插入 flag 计算(复用 line 380 已用的 `sec.annual?.[0]?.period_end` 作基本面 as-of):

```ts
  // 拆股口径护栏:基本面 as-of 早于最近拆股 → 每股口径与拆股后价格错配,整条抑制估值判定。
  const splitCoverageStale = isSplitCoverageStale({
    fundamentalsAsOf: sec.annual?.[0]?.period_end ?? null,
    latestSplitDate: valuationFloor?.kind === "floor" ? await getLatestSplit(ticker) : null,
  });
```

把 `handoffVerdict` 的 `deriveValuationVerdict(...)` 调用加上该入参:

```ts
  const handoffVerdict =
    valuationFloor?.kind === "floor"
      ? deriveValuationVerdict({ floor: valuationFloor, strikeZone, oeDcf, reconciliation, splitCoverageStale })
      : null;
```

- [ ] **Step 3: gate 估值区渲染(说明 vs 卡片)**

在估值 `<section>`(约 line 609-630,`{valuationFloor && (`)内,把 `<EarningsPowerFloorCard .../>` 的渲染按 `splitCoverageStale` 分支。将现有:

```tsx
              <div className="mt-3">
                <EarningsPowerFloorCard
                  floor={valuationFloor}
                  strikeZone={strikeZone}
                  oeDcf={oeDcf}
                  reconciliation={reconciliation}
                  issuer={issuer}
                  ticker={ticker}
                  lang={lang}
                  showStatus={false}
                />
              </div>
              {expectations?.assessable && (
                <PriceBetBlock expectations={expectations} lang={lang} />
              )}
```

改为:

```tsx
              {splitCoverageStale ? (
                <p className="mt-3 text-sm text-[var(--tt-muted)]">{page.valuation.splitPaused}</p>
              ) : (
                <>
                  <div className="mt-3">
                    <EarningsPowerFloorCard
                      floor={valuationFloor}
                      strikeZone={strikeZone}
                      oeDcf={oeDcf}
                      reconciliation={reconciliation}
                      issuer={issuer}
                      ticker={ticker}
                      lang={lang}
                      showStatus={false}
                    />
                  </div>
                  {expectations?.assessable && (
                    <PriceBetBlock expectations={expectations} lang={lang} />
                  )}
                </>
              )}
```

理由:卡片在 verdict=null 时仍渲染 `MethodDetails`(每股方法明细),那是被放大 ~拆股比例倍的错数字;故 split-stale 时整卡不渲染,只留一句说明。`valuationTitle` 此时已回退 `titleFallback`(因 `handoffVerdict` 为 null),与说明并列自然。

- [ ] **Step 4: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx" web/src/lib/stocks/stockCopy.ts
git commit -m "feat(stocks): 个股页拆股口径护栏接线 + 抑制说明文案"
```

---

### Task 5: 快照 ingest 接线

**Files:**
- Modify: `web/scripts/valuation-ingest.ts`(算 flag、传入 verdict → null 则跳过入表)

**Interfaces:**
- Consumes: `getLatestSplit`(Task 2)、`isSplitCoverageStale`(Task 3)

- [ ] **Step 1: ingest 算 flag 并传入**

改 `web/scripts/valuation-ingest.ts`。

顶部 import 补 `getLatestSplit`(`@/lib/managers/priceRead`)与 `isSplitCoverageStale`(`@/lib/valuation`)。

在 `deriveValuationVerdict` 调用(约 line 165)之前算 flag(复用 line 151 已用的 `sec.annual?.[0]?.period_end`;此处 `price` 已在上文取得):

```ts
      const splitCoverageStale = isSplitCoverageStale({
        fundamentalsAsOf: sec.annual?.[0]?.period_end ?? null,
        latestSplitDate: await getLatestSplit(ticker),
      });
      const v = deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation, splitCoverageStale });
```

(下方现有 `if (!v) { skipped++; intentionallyUnvaluable.add(ticker); continue; }` 逻辑不变 —— split-stale → v 为 null → 该票不入快照,screener/投资人页面自动一致抑制。)

- [ ] **Step 2: tsc 门(scripts tsconfig)**

Run: `cd web && npx tsc --noEmit -p scripts/tsconfig.json 2>/dev/null || npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 3: Commit**

```bash
git add web/scripts/valuation-ingest.ts
git commit -m "feat(valuation-ingest): 快照写入接入拆股口径护栏"
```

---

## 上线与验证(需用户授权,不在实现期跑)

护栏依赖 `stock_splits` 有数据才生效;数据靠改造后的 price ingest 填。故实现期只做**代码级验证**(tsc + .check.ts),库/页面级验证在授权跑数据后做。

**代码级(实现期即做):**
- 各 Task 的 `.check.ts` 全绿 + `npx tsc --noEmit` 零新增错误。

**库/页面级(授权后):**
1. Apply 迁移 `20260716_create_stock_splits.sql`(建表)。
2. 跑一次 **price ingest**(带新 `&events=splits`)→ 填 `stock_splits`。核 KLAC 有行:`ticker=KLAC, split_date=2026-06-12, ratio=10`。
3. **KLAC 探针复现验证**(主仓库跑,已有探针 `scripts/probe-klac-split.ts`,给它接上 `getLatestSplit` + `isSplitCoverageStale` 后重跑):verdict 应为 `null`(splitCoverageStale=true)。
4. **零误伤对照**:挑一只近期无拆股、基本面新鲜的票(如 MSFT)→ verdict 与今日逐字一致。
5. **页面级**:dev server / preview 打开 `/stocks/KLAC`,估值区应显示 en/zh 说明,而非假「击球区」,且不出现 $259–$589 每股方法明细。
6. 估值快照重算走 **valuation:ingest** → 生产 screener / 投资人页对 KLAC 一致无判定。

## Phase 2(另开 thread,不在本计划)

口径纠正:拉累积拆股因子,把拆股前期数 `shares_diluted × 因子` restate 到拆股后基准,让 KLAC 正确显示「远高于内在价值」而非仅抑制。须处理拆股后财报落地时的去重防双调。
