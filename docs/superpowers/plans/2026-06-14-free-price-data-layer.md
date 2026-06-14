# 免费价格数据层实现计划（Yahoo v8 主源 + Stooq + Twelve Data 三源降级）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用三个零/免费源（Yahoo v8 chart 主、Stooq 次、Twelve Data 末）替换 Finnhub，建成全量历史 + 每日入库的免费价格数据层，页面/估值只读库。

**Architecture:** `PriceProvider` 抽象后藏三个免费源；resolver 按优先级列表 `[Yahoo, Stooq, TwelveData]` 逐个降级（第一个新鲜结果即用），三家不同运营商分散 ToS/宕机风险。价格写入 `prices` 表；估值与未来走势图通过 `getLatestPrice` / `getPriceHistory` 只读库。沿用现有 store-first + Vercel cron + tsx 脚本模式。

**源选型依据:** Yahoo v8 chart（`query2.finance.yahoo.com/v8/finance/chart`）返回结构化 JSON、`range=max/5y` 一次拿全历史、`range=5d` 做每日增量、零 key——比 Stooq CSV 更好用，故作主力（参考 simonlin1212/global-stock-data, Apache-2.0 验证的零 key 端点）。Stooq、Twelve Data 作降级兜底。中国主机源（Sina/Tencent/Eastmoney）不进生产热路径（美国节点访问不稳）。

**Tech Stack:** TypeScript 5, Next.js 16 (app router), Supabase (Postgres), tsx 脚本, `@supabase/supabase-js`。

**Spec:** `docs/superpowers/specs/2026-06-14-free-price-data-layer-design.md`

**测试惯例:** 本项目无 jest 套件；纯函数用 `scripts/tests/*.ts`（tsx 跑断言，见 `npm run test:*`），其余靠 `npx tsc --noEmit` + 抽样跑脚本核对。

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `web/supabase/migrations/20260614_create_prices.sql` | `prices` + `price_ingest_runs` DDL | 新建 |
| `web/supabase/schema.sql` | 同步 DDL（源真相） | 追加 |
| `web/src/lib/prices/providers/types.ts` | `DailyClose` / `PriceProvider` 接口 | 新建 |
| `web/src/lib/prices/providers/symbol.ts` | ticker → Stooq / Yahoo 符号映射 | 新建 |
| `web/src/lib/prices/providers/yahoo.ts` | Yahoo v8 chart 解析（纯）+ provider（网络，主源） | 新建 |
| `web/src/lib/prices/providers/stooq.ts` | Stooq 解析（纯）+ provider（网络，次源） | 新建 |
| `web/src/lib/prices/providers/twelveData.ts` | Twelve Data 解析（纯）+ provider（带额度，末源） | 新建 |
| `web/src/lib/prices/providers/index.ts` | resolver：按 `[Yahoo, Stooq, TwelveData]` 顺序降级 | 新建 |
| `web/scripts/tests/price-providers.ts` | 纯函数断言测试 | 新建 |
| `web/src/lib/managers/priceRead.ts` | `getLatestPrice`(+source) / `getPriceHistory` | 改 |
| `web/src/lib/research/valuation/priceProvider.ts` | 保留 `mockPrice`，加 `fetchStorePrice`，删 Finnhub | 改 |
| `web/src/lib/research/valuation/buildValuationData.ts` | 默认读库取价 | 改 |
| `web/src/lib/prices/finnhub.ts` | 退役 | 删 |
| `web/scripts/lib/updatePrices.ts` | 改用 providers（每日） | 重写 |
| `web/scripts/prices.ts` | 去掉 FINNHUB 依赖 | 改 |
| `web/scripts/prices-backfill.ts` | 一次性历史回填入口 | 新建 |
| `web/package.json` | 加 `prices:backfill` / `test:price-providers` 脚本 | 改 |
| `web/src/app/api/cron/prices/route.ts` | 每日 cron 路由 | 新建 |
| `web/vercel.json` | 注册 cron | 改 |

---

## Task 1: 数据库迁移（prices + price_ingest_runs）

**Files:**
- Create: `web/supabase/migrations/20260614_create_prices.sql`
- Modify: `web/supabase/schema.sql`（文件末尾追加同一段 DDL）

- [ ] **Step 1: 写迁移文件**

`web/supabase/migrations/20260614_create_prices.sql`:

```sql
-- 每日收盘价（多源：'yahoo' | 'stooq' | 'twelvedata'）。store-first：页面只读此表。
create table if not exists prices (
  ticker text not null references securities(ticker),
  date date not null,
  close numeric not null,
  currency text not null default 'USD',
  source text not null,
  as_of timestamptz not null default now(),
  primary key (ticker, date)
);
create index if not exists prices_ticker_date_idx on prices(ticker, date desc);

-- 价格摄取运行记录（镜像 sec_ingest_runs），供运维 + health-watchdog。
create table if not exists price_ingest_runs (
  id bigint generated always as identity primary key,
  run_type text not null,                 -- 'backfill' | 'daily'
  status text not null,                   -- 'running' | 'success' | 'error'
  rows_written int,
  tickers_total int,
  tickers_filled_by_fallback int,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
```

- [ ] **Step 2: 同步到 schema.sql**

把上面整段 DDL 原样追加到 `web/supabase/schema.sql` 末尾（schema.sql 是本仓库的 schema 源真相）。

- [ ] **Step 3: 应用到 Supabase**

本项目迁移手动应用。在 Supabase SQL Editor 粘贴 Step 1 的 SQL 执行（或 `supabase db push` 若已配 CLI）。

- [ ] **Step 4: 验证表已建**

在 Supabase SQL Editor 运行：

```sql
select count(*) from prices;
select count(*) from price_ingest_runs;
```

Expected: 两条均返回 `0`（表存在、空）。

- [ ] **Step 5: 提交**

```bash
git add web/supabase/migrations/20260614_create_prices.sql web/supabase/schema.sql
git commit -m "feat(db): prices + price_ingest_runs 表(多源价格入库)"
```

---

## Task 2: Provider 接口类型

**Files:**
- Create: `web/src/lib/prices/providers/types.ts`

- [ ] **Step 1: 写类型**

`web/src/lib/prices/providers/types.ts`:

```ts
// 价格源统一返回结构。日级收盘价（EOD）。
export type PriceSource = "yahoo" | "stooq" | "twelvedata";

export type DailyClose = {
  ticker: string;     // 大写 app ticker
  date: string;       // YYYY-MM-DD (UTC 交易日)
  close: number;      // > 0
  currency: string;   // 'USD'
  source: PriceSource;
};

// 任一价格源实现此接口；网络细节藏在实现内。
export interface PriceProvider {
  name: PriceSource;
  fetchDaily(ticker: string): Promise<DailyClose | null>;
  fetchHistory(ticker: string, sinceYears: number): Promise<DailyClose[]>;
}
```

- [ ] **Step 2: 验证编译**

Run: `cd web && npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 3: 提交**

```bash
git add web/src/lib/prices/providers/types.ts
git commit -m "feat(prices): PriceProvider 接口 + DailyClose 类型"
```

---

## Task 3: Stooq 符号映射（TDD）

**Files:**
- Create: `web/src/lib/prices/providers/symbol.ts`
- Test: `web/scripts/tests/price-providers.ts`（本任务起逐步累加）

- [ ] **Step 1: 写失败测试**

`web/scripts/tests/price-providers.ts`:

```ts
/** 价格 provider 纯函数测试。用法: npm run test:price-providers */
import { toStooqSymbol } from "../../src/lib/prices/providers/symbol";

let failed = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`FAIL ${label}: got ${a}, want ${e}`); }
  else console.log(`ok   ${label}`);
}

// --- toStooqSymbol ---
eq(toStooqSymbol("AAPL"), "aapl.us", "symbol AAPL");
eq(toStooqSymbol("BRK.B"), "brk-b.us", "symbol BRK.B 点号转连字符");
eq(toStooqSymbol(" goog "), "goog.us", "symbol 去空格");

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
```

加 npm 脚本到 `web/package.json` 的 `"scripts"`：

```json
"test:price-providers": "tsx scripts/tests/price-providers.ts",
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm run test:price-providers`
Expected: FAIL — 报 `Cannot find module .../symbol`（文件还没建）。

- [ ] **Step 3: 写实现**

`web/src/lib/prices/providers/symbol.ts`:

```ts
// App ticker → Stooq 符号。美股：小写 + ".us"；点号转连字符（BRK.B → brk-b.us）。
export function toStooqSymbol(ticker: string): string {
  return `${ticker.trim().toLowerCase().replace(/\./g, "-")}.us`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run test:price-providers`
Expected: PASS — `symbol *` 三条 ok，`全部通过`。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/prices/providers/symbol.ts web/scripts/tests/price-providers.ts web/package.json
git commit -m "feat(prices): Stooq 符号映射 + 纯函数测试入口"
```

---

## Task 4: Stooq CSV 解析（TDD，纯函数）

**Files:**
- Create: `web/src/lib/prices/providers/stooq.ts`（先只放解析函数）
- Test: `web/scripts/tests/price-providers.ts`（追加）

- [ ] **Step 1: 追加失败测试**

在 `web/scripts/tests/price-providers.ts` 顶部 import 处追加：

```ts
import { parseStooqHistory, parseStooqQuote } from "../../src/lib/prices/providers/stooq";
```

在 `toStooqSymbol` 断言之后、`if (failed)` 之前追加：

```ts
// --- parseStooqHistory ---
const histCsv = "Date,Open,High,Low,Close,Volume\n2026-06-11,180.0,186.0,179.0,185.5,1000\n2026-06-12,185.0,190.0,184.0,188.25,2000\n";
const hist = parseStooqHistory(histCsv, "AAPL");
eq(hist.length, 2, "hist 行数");
eq(hist[1], { ticker: "AAPL", date: "2026-06-12", close: 188.25, currency: "USD", source: "stooq" }, "hist 末行映射");

// 脏行/无数据应被丢弃
const dirty = "Date,Open,High,Low,Close,Volume\n2026-06-12,N/D,N/D,N/D,N/D,N/D\n";
eq(parseStooqHistory(dirty, "AAPL").length, 0, "hist 丢弃 N/D 行");
eq(parseStooqHistory("", "AAPL").length, 0, "hist 空输入");

// --- parseStooqQuote（取末行）---
const quoteCsv = "Symbol,Date,Time,Open,High,Low,Close,Volume\nAAPL.US,2026-06-12,22:00:02,185.0,190.0,184.0,188.25,2000\n";
eq(parseStooqQuote(quoteCsv, "AAPL"), { ticker: "AAPL", date: "2026-06-12", close: 188.25, currency: "USD", source: "stooq" }, "quote 解析");
eq(parseStooqQuote("Symbol,Date,Time,Close\nAAPL.US,N/D,N/D,N/D\n", "AAPL"), null, "quote 无数据→null");
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm run test:price-providers`
Expected: FAIL — `Cannot find module .../stooq`。

- [ ] **Step 3: 写解析实现**

`web/src/lib/prices/providers/stooq.ts`:

```ts
import type { DailyClose } from "./types";

// Stooq 历史与轻量 quote CSV 都含 Date / Close 列；按表头名定位，容忍列顺序。
function parseStooqCsv(csv: string, ticker: string): DailyClose[] {
  const lines = csv.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const di = header.indexOf("date");
  const ci = header.indexOf("close");
  if (di < 0 || ci < 0) return [];
  const T = ticker.trim().toUpperCase();
  const out: DailyClose[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const date = (cols[di] ?? "").trim();
    const close = Number(cols[ci]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(close) || close <= 0) continue;
    out.push({ ticker: T, date, close, currency: "USD", source: "stooq" });
  }
  return out;
}

// 完整日线历史（升序）。
export function parseStooqHistory(csv: string, ticker: string): DailyClose[] {
  return parseStooqCsv(csv, ticker);
}

// 轻量 quote：取最后一条有效行（最新 EOD）。
export function parseStooqQuote(csv: string, ticker: string): DailyClose | null {
  const rows = parseStooqCsv(csv, ticker);
  return rows.length ? rows[rows.length - 1] : null;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run test:price-providers`
Expected: PASS — 新增 6 条断言全 ok。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/prices/providers/stooq.ts web/scripts/tests/price-providers.ts
git commit -m "feat(prices): Stooq CSV 解析(历史+quote) 纯函数 + 测试"
```

---

## Task 5: Stooq Provider 网络方法

**Files:**
- Modify: `web/src/lib/prices/providers/stooq.ts`（在解析函数下追加 class）

- [ ] **Step 1: 追加 provider 实现**

在 `web/src/lib/prices/providers/stooq.ts` 末尾追加：

```ts
import type { PriceProvider } from "./types";
import { toStooqSymbol } from "./symbol";

const HIST_URL = "https://stooq.com/q/d/l/";
const QUOTE_URL = "https://stooq.com/q/l/";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
function yearsAgo(n: number): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - n);
  return d;
}

export class StooqProvider implements PriceProvider {
  readonly name = "stooq" as const;
  constructor(private fetchImpl: typeof fetch = fetch) {}

  async fetchHistory(ticker: string, sinceYears: number): Promise<DailyClose[]> {
    const sym = toStooqSymbol(ticker);
    const url = `${HIST_URL}?s=${sym}&i=d&d1=${ymd(yearsAgo(sinceYears))}&d2=${ymd(new Date())}`;
    const res = await this.fetchImpl(url);
    if (!res.ok) return [];
    return parseStooqHistory(await res.text(), ticker);
  }

  async fetchDaily(ticker: string): Promise<DailyClose | null> {
    const sym = toStooqSymbol(ticker);
    const url = `${QUOTE_URL}?s=${sym}&f=sd2t2ohlcv&h&e=csv`;
    const res = await this.fetchImpl(url);
    if (!res.ok) return null;
    return parseStooqQuote(await res.text(), ticker);
  }
}
```

- [ ] **Step 2: 验证编译**

Run: `cd web && npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 3: 抽样手测网络（真实拉取）**

Run（在仓库根，需联网；无需任何 API key）:

```bash
cd web && npx tsx -e "import {StooqProvider} from './src/lib/prices/providers/stooq'; const p=new StooqProvider(); (async()=>{ console.log('AAPL daily', await p.fetchDaily('AAPL')); const h=await p.fetchHistory('BRK.B',1); console.log('BRK.B hist rows', h.length, h[h.length-1]); })()"
```

Expected: 打印一条 AAPL `{ticker:'AAPL',date,close>0,source:'stooq'}`；BRK.B 历史 rows > 100 且末行 close > 0（验证点号符号映射通路）。

- [ ] **Step 4: 提交**

```bash
git add web/src/lib/prices/providers/stooq.ts
git commit -m "feat(prices): StooqProvider 网络拉取(历史+每日 quote)"
```

---

## Task 6: Twelve Data Provider（解析 TDD + 带额度网络）

**Files:**
- Create: `web/src/lib/prices/providers/twelveData.ts`
- Test: `web/scripts/tests/price-providers.ts`（追加）

- [ ] **Step 1: 追加失败测试**

在测试文件 import 区追加：

```ts
import { parseTwelveQuote, parseTwelveTimeSeries } from "../../src/lib/prices/providers/twelveData";
```

在 `if (failed)` 之前追加：

```ts
// --- parseTwelveQuote ---
eq(parseTwelveQuote({ close: "188.25", datetime: "2026-06-12", currency: "USD" }, "AAPL"),
   { ticker: "AAPL", date: "2026-06-12", close: 188.25, currency: "USD", source: "twelvedata" }, "twelve quote 解析");
eq(parseTwelveQuote({ code: 429, message: "limit", status: "error" }, "AAPL"), null, "twelve quote 限额→null");

// --- parseTwelveTimeSeries ---
const ts = parseTwelveTimeSeries({ status: "ok", values: [
  { datetime: "2026-06-12", close: "188.25" },
  { datetime: "2026-06-11", close: "185.50" },
]}, "AAPL");
eq(ts.length, 2, "twelve ts 行数");
eq(ts[0], { ticker: "AAPL", date: "2026-06-12", close: 188.25, currency: "USD", source: "twelvedata" }, "twelve ts 映射");
eq(parseTwelveTimeSeries({ status: "error", code: 429 }, "AAPL").length, 0, "twelve ts 错误→空");
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm run test:price-providers`
Expected: FAIL — `Cannot find module .../twelveData`。

- [ ] **Step 3: 写实现**

`web/src/lib/prices/providers/twelveData.ts`:

```ts
import type { DailyClose, PriceProvider } from "./types";

type TwelveQuoteJson = { close?: string | number; datetime?: string; currency?: string; status?: string };
type TwelveSeriesJson = { status?: string; values?: Array<{ datetime?: string; close?: string | number }> };

function toRow(ticker: string, datetime: unknown, close: unknown): DailyClose | null {
  const date = String(datetime ?? "").slice(0, 10);
  const c = Number(close);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(c) || c <= 0) return null;
  return { ticker: ticker.trim().toUpperCase(), date, close: c, currency: "USD", source: "twelvedata" };
}

export function parseTwelveQuote(json: TwelveQuoteJson, ticker: string): DailyClose | null {
  if (!json || json.status === "error") return null;
  return toRow(ticker, json.datetime, json.close);
}

export function parseTwelveTimeSeries(json: TwelveSeriesJson, ticker: string): DailyClose[] {
  if (!json || json.status === "error" || !Array.isArray(json.values)) return [];
  const out: DailyClose[] = [];
  for (const v of json.values) {
    const row = toRow(ticker, v.datetime, v.close);
    if (row) out.push(row);
  }
  return out;
}

// 免费档 800/天：构造时给预算，每次调用扣 1，耗尽即停（返回 null/空，不报错）。
export class TwelveDataProvider implements PriceProvider {
  readonly name = "twelvedata" as const;
  private used = 0;
  constructor(
    private apiKey: string,
    private dailyBudget = 800,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  remaining(): number {
    return Math.max(0, this.dailyBudget - this.used);
  }

  async fetchDaily(ticker: string): Promise<DailyClose | null> {
    if (!this.apiKey || this.remaining() <= 0) return null;
    this.used++;
    const res = await this.fetchImpl(
      `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(ticker)}&apikey=${this.apiKey}`,
    );
    if (!res.ok) return null;
    return parseTwelveQuote(await res.json(), ticker);
  }

  async fetchHistory(ticker: string, sinceYears: number): Promise<DailyClose[]> {
    if (!this.apiKey || this.remaining() <= 0) return [];
    this.used++;
    const size = Math.min(5000, Math.ceil(sinceYears * 260) + 10);
    const res = await this.fetchImpl(
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(ticker)}&interval=1day&outputsize=${size}&apikey=${this.apiKey}`,
    );
    if (!res.ok) return [];
    return parseTwelveTimeSeries(await res.json(), ticker);
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run test:price-providers`
Expected: PASS — 新增 5 条断言全 ok。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/prices/providers/twelveData.ts web/scripts/tests/price-providers.ts
git commit -m "feat(prices): TwelveDataProvider(解析纯函数 + 带额度网络)"
```

---

## Task 6.5: Yahoo v8 Chart Provider（主源，TDD 解析 + 网络）

零 key 端点 `query2.finance.yahoo.com/v8/finance/chart`：JSON OHLCV，`range=max/5y` 拿历史、`range=5d` 拿最新。US 票点号转连字符（BRK.B → BRK-B）。作三源里的优先主力。

**Files:**
- Modify: `web/src/lib/prices/providers/symbol.ts`（加 `toYahooSymbol`）
- Create: `web/src/lib/prices/providers/yahoo.ts`
- Test: `web/scripts/tests/price-providers.ts`（追加）

- [ ] **Step 1: 加 toYahooSymbol + 追加失败测试**

在 `web/src/lib/prices/providers/symbol.ts` 末尾追加：

```ts
// App ticker → Yahoo 符号。美股原样大写；点号转连字符（BRK.B → BRK-B）。
export function toYahooSymbol(ticker: string): string {
  return ticker.trim().toUpperCase().replace(/\./g, "-");
}
```

在 `web/scripts/tests/price-providers.ts` import 区追加：

```ts
import { toYahooSymbol } from "../../src/lib/prices/providers/symbol";
import { parseYahooChart, parseYahooLatest } from "../../src/lib/prices/providers/yahoo";
```

在 `if (failed)` 之前追加：

```ts
// --- toYahooSymbol ---
eq(toYahooSymbol("AAPL"), "AAPL", "yahoo symbol AAPL");
eq(toYahooSymbol("BRK.B"), "BRK-B", "yahoo symbol BRK.B 点号转连字符");

// --- parseYahooChart / parseYahooLatest ---
const yj = { chart: { result: [ {
  meta: { currency: "USD" },
  timestamp: [1749600000, 1749686400],
  indicators: { quote: [ { close: [185.5, 188.25] } ] },
} ], error: null } };
const yrows = parseYahooChart(yj, "AAPL");
eq(yrows.length, 2, "yahoo chart 行数");
eq(yrows[1].close, 188.25, "yahoo chart 末行 close");
eq(yrows[1].source, "yahoo", "yahoo chart source");
eq(/^\d{4}-\d{2}-\d{2}$/.test(yrows[1].date), true, "yahoo chart date 格式");
eq(parseYahooLatest(yj, "AAPL")?.close, 188.25, "yahoo latest 取末行");
eq(parseYahooChart({ chart: { result: [], error: "x" } }, "AAPL").length, 0, "yahoo 错误→空");
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm run test:price-providers`
Expected: FAIL — `Cannot find module .../yahoo`。

- [ ] **Step 3: 写实现**

`web/src/lib/prices/providers/yahoo.ts`:

```ts
import type { DailyClose, PriceProvider } from "./types";
import { toYahooSymbol } from "./symbol";

type YahooChartJson = {
  chart?: {
    result?: Array<{
      meta?: { currency?: string };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null> }> };
    }>;
    error?: unknown;
  };
};

// 用未复权 close（与 Stooq/Twelve 一致, 便于跨源比较 + 对齐当时市值）。
export function parseYahooChart(json: YahooChartJson, ticker: string): DailyClose[] {
  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp;
  const closes = r?.indicators?.quote?.[0]?.close;
  if (!Array.isArray(ts) || !Array.isArray(closes)) return [];
  const T = ticker.trim().toUpperCase();
  const currency = r?.meta?.currency ?? "USD";
  const out: DailyClose[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = Number(closes[i]);
    if (!Number.isFinite(c) || c <= 0) continue;
    const date = new Date(ts[i] * 1000).toISOString().slice(0, 10);
    out.push({ ticker: T, date, close: c, currency, source: "yahoo" });
  }
  return out;
}

export function parseYahooLatest(json: YahooChartJson, ticker: string): DailyClose | null {
  const rows = parseYahooChart(json, ticker);
  return rows.length ? rows[rows.length - 1] : null;
}

const CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/";
const UA = "Mozilla/5.0 (compatible; CompounderBot/1.0)";

export class YahooChartProvider implements PriceProvider {
  readonly name = "yahoo" as const;
  constructor(private fetchImpl: typeof fetch = fetch) {}

  private async fetchRange(ticker: string, range: string): Promise<DailyClose[]> {
    const sym = toYahooSymbol(ticker);
    const url = `${CHART_URL}${encodeURIComponent(sym)}?interval=1d&range=${range}`;
    const res = await this.fetchImpl(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return [];
    return parseYahooChart(await res.json(), ticker);
  }

  async fetchHistory(ticker: string, sinceYears: number): Promise<DailyClose[]> {
    const range = sinceYears >= 10 ? "max" : `${Math.max(1, Math.ceil(sinceYears))}y`;
    return this.fetchRange(ticker, range);
  }

  async fetchDaily(ticker: string): Promise<DailyClose | null> {
    const rows = await this.fetchRange(ticker, "5d");
    return rows.length ? rows[rows.length - 1] : null;
  }
}
```

- [ ] **Step 4: 跑测试确认通过 + 抽样手测网络**

Run: `cd web && npm run test:price-providers`
Expected: PASS — 新增 8 条断言全 ok。

抽样真拉（需联网，无 key）:

```bash
cd web && npx tsx -e "import {YahooChartProvider} from './src/lib/prices/providers/yahoo'; const p=new YahooChartProvider(); (async()=>{ console.log('AAPL daily', await p.fetchDaily('AAPL')); const h=await p.fetchHistory('BRK.B',5); console.log('BRK.B hist rows', h.length, h[h.length-1]); })()"
```

Expected: AAPL `{...,source:'yahoo',close>0}`；BRK.B（→BRK-B）历史 rows > 1000、末行 close > 0。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/prices/providers/yahoo.ts web/src/lib/prices/providers/symbol.ts web/scripts/tests/price-providers.ts
git commit -m "feat(prices): YahooChartProvider(v8 chart, 主源) + toYahooSymbol + 测试"
```

---

## Task 7: Resolver（按 [Yahoo, Stooq, TwelveData] 顺序降级，TDD）

**Files:**
- Create: `web/src/lib/prices/providers/index.ts`
- Test: `web/scripts/tests/price-providers.ts`（追加）

- [ ] **Step 1: 追加失败测试（用假 provider 注入）**

在测试 import 区追加：

```ts
import { isStale, resolveDaily } from "../../src/lib/prices/providers";
import type { DailyClose, PriceProvider } from "../../src/lib/prices/providers/types";
```

在 `if (failed)` 之前追加：

```ts
// --- isStale ---
const todayIso = new Date().toISOString().slice(0, 10);
eq(isStale({ ticker: "X", date: todayIso, close: 1, currency: "USD", source: "stooq" }), false, "isStale 今日→false");
eq(isStale({ ticker: "X", date: "2000-01-01", close: 1, currency: "USD", source: "stooq" }), true, "isStale 远古→true");
eq(isStale(null), true, "isStale null→true");

// --- resolveDaily：假 provider, 按列表顺序降级 ---
const mk = (name: "yahoo" | "stooq" | "twelvedata", row: DailyClose | null): PriceProvider => ({
  name,
  fetchDaily: async () => row,
  fetchHistory: async () => (row ? [row] : []),
});
const freshYahoo = { ticker: "X", date: todayIso, close: 10, currency: "USD", source: "yahoo" } as DailyClose;
const twelveRow = { ticker: "X", date: todayIso, close: 20, currency: "USD", source: "twelvedata" } as DailyClose;
const staleYahoo = { ticker: "X", date: "2000-01-01", close: 9, currency: "USD", source: "yahoo" } as DailyClose;

(async () => {
  eq((await resolveDaily("X", [mk("yahoo", freshYahoo), mk("stooq", twelveRow)]))?.source, "yahoo", "resolve 首个新鲜直接用");
  eq((await resolveDaily("X", [mk("yahoo", null), mk("stooq", null), mk("twelvedata", twelveRow)]))?.source, "twelvedata", "resolve 顺延到末位");
  eq(await resolveDaily("X", [mk("yahoo", null)]), null, "resolve 全空→null");
  eq((await resolveDaily("X", [mk("yahoo", staleYahoo), mk("stooq", null)]))?.source, "yahoo", "resolve 都不新鲜→返回首个非空");

  if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
  console.log("\n全部通过");
})();
```

注意：把文件**原有的**结尾两行

```ts
if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
```

删除（因为现在结尾汇报移进了上面的 async IIFE，确保异步断言也被计入）。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npm run test:price-providers`
Expected: FAIL — `Cannot find module .../providers`（index 还没建）。

- [ ] **Step 3: 写 resolver**

`web/src/lib/prices/providers/index.ts`:

```ts
import type { DailyClose, PriceProvider } from "./types";

export type { DailyClose, PriceProvider, PriceSource } from "./types";
export { YahooChartProvider } from "./yahoo";
export { StooqProvider } from "./stooq";
export { TwelveDataProvider } from "./twelveData";

// 价格陈旧判定：latest date 落后超过 maxAgeDays（自然日，宽容覆盖周末/假日）。
export function isStale(d: DailyClose | null, maxAgeDays = 5): boolean {
  if (!d) return true;
  const ageMs = Date.now() - new Date(`${d.date}T00:00:00Z`).getTime();
  return ageMs > maxAgeDays * 86_400_000;
}

// 每日：按 providers 顺序逐个尝试；返回第一个"新鲜"结果；都不新鲜则返回首个非空（尽力而为）。
export async function resolveDaily(
  ticker: string,
  providers: PriceProvider[],
): Promise<DailyClose | null> {
  let best: DailyClose | null = null;
  for (const p of providers) {
    const d = await p.fetchDaily(ticker).catch(() => null);
    if (d && !isStale(d)) return d;
    if (d && !best) best = d;
  }
  return best;
}

// 历史：按 providers 顺序，返回第一个非空。
export async function resolveHistory(
  ticker: string,
  sinceYears: number,
  providers: PriceProvider[],
): Promise<DailyClose[]> {
  for (const p of providers) {
    const rows = await p.fetchHistory(ticker, sinceYears).catch(() => []);
    if (rows.length) return rows;
  }
  return [];
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npm run test:price-providers`
Expected: PASS — `全部通过`，含 isStale 3 条 + resolveDaily 4 条。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/prices/providers/index.ts web/scripts/tests/price-providers.ts
git commit -m "feat(prices): resolver(按 [Yahoo,Stooq,TwelveData] 顺序降级) + isStale + 测试"
```

---

## Task 8: 读取层（getLatestPrice 带 source + getPriceHistory）

**Files:**
- Modify: `web/src/lib/managers/priceRead.ts`

- [ ] **Step 1: 改写 priceRead.ts**

把 `web/src/lib/managers/priceRead.ts` 整体替换为：

```ts
import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";

export type LatestPrice = { close: number; date: string; currency: string; source?: string };
export type PricePoint = { date: string; close: number };

/** 现价事实展示(纯函数, 单测)。无价→占位。 */
export function fmtPriceFact(p: LatestPrice | null): string {
  if (!p) return "—";
  const sym = p.currency === "USD" ? "$" : "";
  return `${sym}${p.close.toFixed(2)}`;
}

/** 某 ticker 最新一条价格。无 env / 无数据 → null。 */
export const getLatestPrice = cache(async (ticker: string): Promise<LatestPrice | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("prices").select("close,date,currency,source").eq("ticker", ticker)
    .order("date", { ascending: false }).limit(1);
  if (error) { console.error(`getLatestPrice(${ticker}) 失败: ${error.message}`); return null; }
  const r = data?.[0];
  return r ? { close: Number(r.close), date: r.date, currency: r.currency ?? "USD", source: r.source } : null;
});

/** 某 ticker 近 N 天价格历史(升序), 供走势图/历史估值带。无 env/数据→[]。 */
export const getPriceHistory = cache(async (ticker: string, days = 365): Promise<PricePoint[]> => {
  if (!hasSupabaseEnv()) return [];
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await getDb()
    .from("prices").select("date,close").eq("ticker", ticker)
    .gte("date", cutoff).order("date", { ascending: true }).limit(5000);
  if (error) { console.error(`getPriceHistory(${ticker}) 失败: ${error.message}`); return []; }
  return (data ?? []).map((r: { date: string; close: number }) => ({ date: r.date, close: Number(r.close) }));
});
```

- [ ] **Step 2: 验证编译**

Run: `cd web && npx tsc --noEmit`
Expected: 无新增错误。

- [ ] **Step 3: 提交**

```bash
git add web/src/lib/managers/priceRead.ts
git commit -m "feat(prices): getLatestPrice 带 source + 新增 getPriceHistory"
```

---

## Task 9: 估值接入读库 + 退役 Finnhub

**Files:**
- Modify: `web/src/lib/research/valuation/priceProvider.ts`
- Modify: `web/src/lib/research/valuation/buildValuationData.ts`
- Delete: `web/src/lib/prices/finnhub.ts`
- Rewrite: `web/scripts/lib/updatePrices.ts`

- [ ] **Step 1: 改 priceProvider.ts（保留 mockPrice，删 Finnhub，加 fetchStorePrice）**

把 `web/src/lib/research/valuation/priceProvider.ts` 整体替换为：

```ts
import "server-only";
import { getLatestPrice } from "@/lib/managers/priceRead";
import type { PriceData } from "./types";

// store-first：估值从 prices 表读最新收盘价（由 Yahoo/Stooq/TwelveData 摄取入库）。
export async function fetchStorePrice(ticker: string): Promise<PriceData | null> {
  const T = ticker.trim().toUpperCase();
  const p = await getLatestPrice(T);
  if (!p) return null;
  return {
    ticker: T,
    latest_price: p.close,
    price_date: p.date,
    currency: p.currency,
    source: p.source ? `STORE_${p.source.toUpperCase()}` : "STORE",
  };
}

export function mockPrice(ticker: string, latestPrice = 430, priceDate = "2026-06-08"): PriceData {
  return {
    ticker: ticker.trim().toUpperCase(),
    latest_price: latestPrice,
    price_date: priceDate,
    currency: "USD",
    source: "MOCK_PRICE",
  };
}
```

- [ ] **Step 2: 改 buildValuationData.ts（默认读库取价）**

把 `web/src/lib/research/valuation/buildValuationData.ts` 整体替换为：

```ts
import type { NormalizedResearchData } from "../schemas/researchSchemas";
import { calculateValuation } from "./calculateValuation";
import { fetchStorePrice, mockPrice } from "./priceProvider";
import type { PriceData, ValuationResult } from "./types";

export async function buildValuationForResearchData(
  normalizedData: NormalizedResearchData,
  options: { mock?: boolean; price?: PriceData | null } = {},
): Promise<ValuationResult> {
  const price = options.mock
    ? (options.price ?? mockPrice(normalizedData.ticker))
    : (options.price ?? (await fetchStorePrice(normalizedData.ticker)));
  return calculateValuation({ ...normalizedData, price });
}
```

注意：`options.fetchImpl` 参数已移除（不再有 live HTTP）。`route.ts` 的三处调用（`{ mock: true }` / 无参 / 无参）均不传 `fetchImpl`，无需改动。

- [ ] **Step 3: 删除 finnhub.ts**

```bash
git rm web/src/lib/prices/finnhub.ts
```

- [ ] **Step 4: 重写每日摄取 updatePrices.ts（改用 providers）**

把 `web/scripts/lib/updatePrices.ts` 整体替换为：

```ts
import { YahooChartProvider, StooqProvider, TwelveDataProvider, resolveDaily, type DailyClose } from "../../src/lib/prices/providers/index.js";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

type PriceRow = { ticker: string; date: string; close: number; currency: string; source: string; as_of: string };

/**
 * 读 securities 全部 ticker, 按 [Yahoo, Stooq, TwelveData] 顺序取最新 EOD, upsert prices。
 * 小间隔礼貌拉取。返回统计（fallback = 非主源 Yahoo 命中的票数）。
 */
export async function updatePrices(
  db: any,
  opts: { twelveKey?: string; twelveBudget?: number; throttleMs?: number } = {},
): Promise<{ total: number; written: number; skipped: number; fallback: number }> {
  const tickers: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("securities").select("ticker").range(from, from + 999);
    if (error) throw new Error(`securities read: ${error.message}`);
    if (!data?.length) break;
    tickers.push(...data.map((r: { ticker: string }) => r.ticker));
    if (data.length < 1000) break;
  }

  const providers = [
    new YahooChartProvider(),
    new StooqProvider(),
    ...(opts.twelveKey ? [new TwelveDataProvider(opts.twelveKey, opts.twelveBudget ?? 800)] : []),
  ];
  const throttle = opts.throttleMs ?? 150;

  let written = 0, skipped = 0, fallback = 0;
  const rows: PriceRow[] = [];
  for (const ticker of tickers) {
    const d: DailyClose | null = await resolveDaily(ticker, providers);
    if (!d) { skipped++; await sleep(throttle); continue; }
    if (d.source !== "yahoo") fallback++;
    rows.push({ ticker, date: d.date, close: d.close, currency: d.currency, source: d.source, as_of: new Date().toISOString() });
    written++;
    if (rows.length >= 200) await flush(db, rows.splice(0));
    await sleep(throttle);
  }
  if (rows.length) await flush(db, rows.splice(0));
  return { total: tickers.length, written, skipped, fallback };
}

async function flush(db: any, rows: PriceRow[]): Promise<void> {
  const { error } = await db.from("prices").upsert(rows, { onConflict: "ticker,date" });
  if (error) console.warn(`prices upsert err: ${error.message}`);
}
```

- [ ] **Step 5: 验证编译 + 既有估值测试仍通过**

Run: `cd web && npx tsc --noEmit && npm run test:valuation-data-layer`
Expected: tsc 无错；`test:valuation-data-layer` 仍 PASS（`mockPrice` 路径未变，证明 barrel 导出未断）。

- [ ] **Step 6: 提交**

```bash
git add web/src/lib/research/valuation/priceProvider.ts web/src/lib/research/valuation/buildValuationData.ts web/scripts/lib/updatePrices.ts
git commit -m "refactor(prices): 估值改读库取价, 每日摄取改用 Stooq+TwelveData, 退役 Finnhub"
```

---

## Task 10: 每日脚本 + 回填脚本 + npm 脚本

**Files:**
- Modify: `web/scripts/prices.ts`
- Create: `web/scripts/prices-backfill.ts`
- Modify: `web/package.json`

- [ ] **Step 1: 改 prices.ts（去 FINNHUB 依赖，传 TwelveData key）**

把 `web/scripts/prices.ts` 整体替换为：

```ts
/** 价格日更入口: 三源 [Yahoo, Stooq, TwelveData] 顺序降级 写 prices。用法: npm run prices */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { updatePrices } from "./lib/updatePrices.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });
  const s = await updatePrices(db, { twelveKey: env.TWELVE_DATA_API_KEY });
  console.log(`价格日更完成: 拉取 ${s.total}, 写入 ${s.written}, 跳过 ${s.skipped}, 非主源补 ${s.fallback}`);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
```

- [ ] **Step 2: 写回填脚本 prices-backfill.ts**

`web/scripts/prices-backfill.ts`:

```ts
/** 一次性历史回填: 全 securities, 按 [Yahoo, Stooq, TwelveData] 顺序拉近 N 年日线 upsert prices。
 *  用法: npm run prices:backfill [-- 年数 单只ticker]
 *  例:   npm run prices:backfill            (全量, 默认 5 年)
 *        npm run prices:backfill -- 5 AAPL  (只回填 AAPL, 5 年) */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { YahooChartProvider, StooqProvider, TwelveDataProvider, resolveHistory } from "../src/lib/prices/providers/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local");
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { ...out, ...process.env } as Record<string, string>;
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const env = loadEnv();
  const years = Number(process.argv[2]) || 5;
  const only = process.argv[3]?.toUpperCase();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });

  let tickers: string[] = [];
  if (only) tickers = [only];
  else for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("securities").select("ticker").range(from, from + 999);
    if (error) throw new Error(`securities read: ${error.message}`);
    if (!data?.length) break;
    tickers.push(...data.map((r: { ticker: string }) => r.ticker));
    if (data.length < 1000) break;
  }

  const providers = [
    new YahooChartProvider(),
    new StooqProvider(),
    ...(env.TWELVE_DATA_API_KEY ? [new TwelveDataProvider(env.TWELVE_DATA_API_KEY, 800)] : []),
  ];
  let totalRows = 0, done = 0, empty = 0;
  for (const ticker of tickers) {
    const hist = await resolveHistory(ticker, years, providers);
    if (hist.length) {
      const asOf = new Date().toISOString();
      const rows = hist.map((d) => ({ ticker: d.ticker, date: d.date, close: d.close, currency: d.currency, source: d.source, as_of: asOf }));
      for (let i = 0; i < rows.length; i += 1000) {
        const { error } = await db.from("prices").upsert(rows.slice(i, i + 1000), { onConflict: "ticker,date" });
        if (error) console.warn(`${ticker} upsert err: ${error.message}`);
      }
      totalRows += rows.length;
    } else empty++;
    done++;
    if (done % 50 === 0) console.log(`  进度 ${done}/${tickers.length}, 累计行 ${totalRows}, 空 ${empty}`);
    await sleep(200);
  }
  console.log(`回填完成: ticker ${tickers.length}, 写入行 ${totalRows}, 无数据 ${empty}`);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
```

- [ ] **Step 3: 加 npm 脚本**

在 `web/package.json` 的 `"scripts"` 里、`"prices"` 行后加：

```json
"prices:backfill": "tsx scripts/prices-backfill.ts",
```

（`test:price-providers` 已在 Task 3 加入。）

- [ ] **Step 4: 验证编译**

Run: `cd web && npx tsc --noEmit`
Expected: 无错误。

- [ ] **Step 5: 抽样回填核对（真实写库，需 Supabase env）**

Run:

```bash
cd web && npm run prices:backfill -- 5 AAPL
```

Expected: 打印 `回填完成: ticker 1, 写入行 >1000, 无数据 0`。随后在 Supabase 运行 `select count(*), min(date), max(date) from prices where ticker='AAPL';` 应见 ~5 年行数、max(date) 近期、close 合理。

- [ ] **Step 6: 提交**

```bash
git add web/scripts/prices.ts web/scripts/prices-backfill.ts web/package.json
git commit -m "feat(prices): 每日脚本改 Stooq+TwelveData + 新增历史回填脚本"
```

---

## Task 11: 每日 Cron 路由 + vercel.json

**Files:**
- Create: `web/src/app/api/cron/prices/route.ts`
- Modify: `web/vercel.json`

- [ ] **Step 1: 写 cron 路由（含 price_ingest_runs 记录）**

`web/src/app/api/cron/prices/route.ts`:

```ts
import { isAuthorizedIngestRequest, unauthorizedResponse } from "@/lib/ingestion/auth";
import { databaseNotConfigured } from "@/lib/ingestion/routes";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";
import { YahooChartProvider, StooqProvider, TwelveDataProvider, resolveDaily, type DailyClose } from "@/lib/prices/providers";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorizedIngestRequest(request)) return unauthorizedResponse();
  if (!hasSupabaseEnv()) return databaseNotConfigured();

  const db = getDb();
  const { data: run } = await db.from("price_ingest_runs")
    .insert({ run_type: "daily", status: "running" }).select("id").single();
  const runId = run?.id;

  try {
    const tickers: string[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("securities").select("ticker").range(from, from + 999);
      if (error) throw new Error(`securities read: ${error.message}`);
      if (!data?.length) break;
      tickers.push(...data.map((r: { ticker: string }) => r.ticker));
      if (data.length < 1000) break;
    }

    const providers = [
      new YahooChartProvider(),
      new StooqProvider(),
      ...(process.env.TWELVE_DATA_API_KEY ? [new TwelveDataProvider(process.env.TWELVE_DATA_API_KEY, 800)] : []),
    ];
    let written = 0, skipped = 0, fallback = 0;
    const rows: Array<{ ticker: string; date: string; close: number; currency: string; source: string; as_of: string }> = [];
    for (const ticker of tickers) {
      const d: DailyClose | null = await resolveDaily(ticker, providers);
      if (!d) { skipped++; await sleep(120); continue; }
      if (d.source !== "yahoo") fallback++;
      rows.push({ ticker, date: d.date, close: d.close, currency: d.currency, source: d.source, as_of: new Date().toISOString() });
      written++;
      if (rows.length >= 200) { await db.from("prices").upsert(rows.splice(0), { onConflict: "ticker,date" }); }
      await sleep(120);
    }
    if (rows.length) await db.from("prices").upsert(rows.splice(0), { onConflict: "ticker,date" });

    if (runId) await db.from("price_ingest_runs").update({
      status: "success", rows_written: written, tickers_total: tickers.length,
      tickers_filled_by_fallback: fallback, finished_at: new Date().toISOString(),
    }).eq("id", runId);

    return Response.json({ ok: true, total: tickers.length, written, skipped, fallback });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (runId) await db.from("price_ingest_runs").update({
      status: "error", error_message: msg, finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return Response.json({ ok: false, message: msg }, { status: 500 });
  }
}
```

注意：`databaseNotConfigured` 已存在于 `web/src/lib/ingestion/routes.ts`（与 `market-ingest/route.ts` 同款导入），直接用。

- [ ] **Step 2: 注册 cron**

把 `web/vercel.json` 替换为（在数组首位加 prices，工作日美东收盘后 ≈ 21:30 UTC）：

```json
{
  "crons": [
    {
      "path": "/api/cron/prices",
      "schedule": "30 21 * * 1-5"
    },
    {
      "path": "/api/cron/market-ingest",
      "schedule": "0 10 * * 1-5"
    },
    {
      "path": "/api/cron/health-watchdog",
      "schedule": "0 13 * * *"
    },
    {
      "path": "/api/cron/sec-fundamentals",
      "schedule": "0 11 * * 0"
    }
  ]
}
```

- [ ] **Step 3: 验证编译 + 路由本地手测**

Run: `cd web && npx tsc --noEmit`
Expected: 无错误。

本地手测（启动 dev server，另开终端；`INGEST_SECRET` 取 `.env.local` 同名值）:

```bash
cd web && npm run dev   # 一个终端
# 另一终端：
curl -s -H "Authorization: Bearer $INGEST_SECRET" http://localhost:3000/api/cron/prices | head -c 300
```

Expected: 返回 `{"ok":true,"total":...,"written":...,...}`；`price_ingest_runs` 多一条 `status='success'`。无 secret 时返回 401。

- [ ] **Step 4: 提交**

```bash
git add web/src/app/api/cron/prices/route.ts web/vercel.json
git commit -m "feat(prices): 每日价格 cron 路由 + vercel.json 注册(工作日收盘后)"
```

---

## Task 12: 价格陈旧告警接入 health-watchdog

健康看门狗的 route 只调用 `gatherHealth(today)`（见 `health-watchdog/route.ts`）；真正的检查在 `web/src/lib/health/gather.ts`，问题用 `HealthProblem`（`checks.ts`）结构 `{ pipeline, source, message, asOf, expected }`。本任务加一个 `gatherPrices` 检查并入 `gatherHealth`。

**Files:**
- Modify: `web/src/lib/health/checks.ts`（`pipeline` 联合类型加 `"prices"`）
- Modify: `web/src/lib/health/gather.ts`（加 `gatherPrices` + 并入 `gatherHealth`）

- [ ] **Step 1: 扩 pipeline 联合类型**

`web/src/lib/health/checks.ts` 第 7 行：

```ts
  pipeline: "13f" | "macro";
```

改为：

```ts
  pipeline: "13f" | "macro" | "prices";
```

- [ ] **Step 2: 在 gather.ts 加 gatherPrices**

在 `web/src/lib/health/gather.ts` 的 `gatherMacro` 函数之后、`gatherHealth` 之前插入：

```ts
// 读最近一次成功的 daily 价格摄取, 超 3 天没成功 → 告警(管道疑似停跑)。
async function gatherPrices(today: Date): Promise<{ problems: HealthProblem[]; info: string[] }> {
  try {
    const { data, error } = await getDb()
      .from("price_ingest_runs")
      .select("finished_at,rows_written")
      .eq("run_type", "daily").eq("status", "success")
      .order("finished_at", { ascending: false }).limit(1);
    if (error) throw error;
    const last = (data ?? [])[0] as { finished_at: string; rows_written: number } | undefined;
    if (!last) {
      return { problems: [{ pipeline: "prices", source: "价格整体", message: "价格从未成功摄取", asOf: null, expected: "应有每日刷新" }], info: [] };
    }
    const days = Math.floor((today.getTime() - new Date(last.finished_at).getTime()) / 86_400_000);
    if (days > 3) {
      return { problems: [{ pipeline: "prices", source: "价格整体", message: `价格管道可能停跑: ${days} 天未成功摄取`, asOf: last.finished_at.slice(0, 10), expected: "应 ≤ 3 天" }], info: [] };
    }
    return { problems: [], info: [`价格最近成功摄取 ${last.finished_at.slice(0, 10)} (写入 ${last.rows_written})`] };
  } catch (e) {
    return { problems: [{ pipeline: "prices", source: "价格核查", message: `核查自身出错: ${e instanceof Error ? e.message : String(e)}`, asOf: null, expected: "核查应成功" }], info: [] };
  }
}
```

- [ ] **Step 3: 并入 gatherHealth**

把 `web/src/lib/health/gather.ts` 的 `gatherHealth` 替换为：

```ts
export async function gatherHealth(today: Date): Promise<HealthReport> {
  const [r13, rMacro, rPrices] = await Promise.all([gather13F(today), gatherMacro(today), gatherPrices(today)]);
  const problems = [...r13.problems, ...rMacro.problems, ...rPrices.problems];
  const info = [...r13.info, ...rMacro.info, ...rPrices.info];
  return { ok: problems.length === 0, checkedAt: today.toISOString(), problems, info };
}
```

- [ ] **Step 4: 验证编译 + dryRun 手测**

Run: `cd web && npx tsc --noEmit`
Expected: 无错误。

dryRun（dev server 起着时）:

```bash
curl -s -H "Authorization: Bearer $INGEST_SECRET" "http://localhost:3000/api/cron/health-watchdog?dryRun=1" | head -c 400
```

Expected: JSON 含 prices 相关 `info`（已成功摄取过）或 `problems`（从未/停跑），不报 500。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/health/checks.ts web/src/lib/health/gather.ts
git commit -m "feat(prices): health-watchdog 检测价格摄取停更告警"
```

---

## 收尾验证（全部任务后）

- [ ] `cd web && npx tsc --noEmit` 全绿
- [ ] `cd web && npm run test:price-providers` 全通过
- [ ] `cd web && npm run test:valuation-data-layer` 仍通过（估值未回归）
- [ ] `npm run prices:backfill -- 5 AAPL` + `npm run prices` 抽样核对入库
- [ ] 个股/研究页打开一只已回填 ticker，确认估值用上库内价格、显示"截至 {date}/来源"

## 范围外（不在本计划）

- 走势图 UI 组件（消费 `getPriceHistory`）——单独前端任务
- 全量历史回填的生产执行（长任务，建议 GitHub Action 或本地跑一次）
- 历史估值带 / 区间涨跌计算——后续功能
```