# Phase 1C — 日更价格 + 自动更新流水线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 ticker 脊梁挂上**每日收盘价**（`prices` 表，Finnhub `/quote` 拉取，按交易日累积历史），个股页展示"现价 + as-of"；并用 **GitHub Actions** 把价格(日更)与 13F(周更)做成自动流水线——网站只读库，更新全交给 Actions，解决"拉一次就馊"的问题。

**Architecture:** 新增 `prices(ticker,date,close,...)` 表(PK 含 date → 每个交易日累积一行)。`npm run prices` 读 `securities` 的真 ticker，逐个调 Finnhub `/quote`(免费档 60/min，无历史日线，故取当日收盘累积)，按 quote 返回的交易时间戳定 date、幂等 upsert。个股页经 env 门控读最新价(无库回退不显示)。两个 GitHub workflow：`prices.yml`(工作日美股收盘后)跑价格；`ingest.yml`(每周)跑 `npm run ingest`(幂等，已自动连带 enrich+consensus)。密钥走 GitHub Secrets。

**Tech Stack:** Next.js 16 / TS、`@supabase/supabase-js`、Supabase Postgres、Finnhub REST(`/quote`)、GitHub Actions、vitest、tsx。

**参考:** spec `docs/superpowers/specs/2026-06-06-data-layer-architecture-design.md`(§4.3 prices)；前序 1A 脊梁、1B 共识(`securities`/`consensus_*` 已在库)。

> **范围决策(2026-06-06 与用户确认):** 价格方案=「当前价先行，历史往后累积」(Finnhub 免费档无历史日线，不做回填)；数据源 Finnhub 主(key 已配 `FINNHUB_API_KEY`)，AkShare/A 股留后续；价格为**事实数据**，个股页只显示"现价+as-of+来源"，**不做任何技术指标/买卖提示**(护栏见 `valuation-philosophy-constraint`)。
> **不碰:** AI 叙述竖切(另一 session 工作树)；估值引擎(Phase 3)。

---

## 环境/约定
- App root: `/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web`。`@/*`→`web/src/*`。
- Node 20: 命令前置 `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`。
- 凭据：**仓库根** `.env.local`(脚本读 `../.env.local`)，已含 `FINNHUB_API_KEY` / `SUPABASE_*` / `OPENFIGI_API_KEY`。CI 走 GitHub Secrets(process.env 优先)。
- DDL 需用户在 Supabase SQL Editor 手动跑；新表后若报 schema cache → `NOTIFY pgrst, 'reload schema';`。
- 分支：从 `db-foundation` 切出 `phase1c-daily-prices`(确保已含 1A/1B 合并后的最新)。

## 文件结构
```
web/supabase/schema.sql                  追加 prices 表                              [改]
web/src/lib/prices/finnhub.ts            纯逻辑: quote 响应 → {close,date}            [新建]
web/src/lib/prices/finnhub.test.ts       vitest                                       [新建]
web/scripts/lib/updatePrices.ts          写库器: 读 securities ticker → quote → upsert [新建]
web/scripts/prices.ts                     入口(读 ../.env.local)                       [新建]
web/package.json                          新增 "prices" 脚本                           [改]
web/src/lib/managers/priceRead.ts         读最新价(env 门控) + 纯映射                  [新建]
web/src/lib/managers/priceRead.test.ts    vitest                                       [新建]
web/src/app/[lang]/stocks/[ticker]/page.tsx  keyFacts 加"现价 + as-of"                 [改]
.github/workflows/prices.yml             价格日更(工作日收盘后)                       [新建]
.github/workflows/ingest.yml             13F 周更(幂等, 连带 enrich+consensus)         [新建]
```

---

## Task 1: prices 表 schema

**Files:** Modify `web/supabase/schema.sql`

- [ ] **Step 1: 追加到 schema.sql 末尾**
```sql
-- 日更价格(ticker-keyed): Finnhub /quote 当日收盘, 按交易日累积。事实数据, 非信号。
create table if not exists prices (
  ticker text not null references securities(ticker) on delete cascade,
  date date not null,
  close numeric not null,
  currency text not null default 'USD',
  source text not null default 'finnhub',
  as_of timestamptz not null default now(),
  primary key (ticker, date)
);
create index if not exists prices_ticker_date_idx on prices (ticker, date desc);
```

- [ ] **Step 2: 文本校验**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node -e "const s=require('fs').readFileSync('supabase/schema.sql','utf8'); if(!/create table if not exists prices/.test(s))process.exit(1); console.log('prices table present')"
```
Expected: `prices table present`

- [ ] **Step 3: 应用到线上库(手动验证关卡)** — 用户在 SQL Editor 跑上面那段。验证：
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node --input-type=module -e '
import { createClient } from "@supabase/supabase-js"; import WebSocket from "ws"; import fs from "fs";
const env=fs.readFileSync("../.env.local","utf8"); const g=k=>{const m=env.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].trim().replace(/^["\x27]|["\x27]$/g,""):undefined;};
const db=createClient(g("SUPABASE_URL"),g("SUPABASE_SERVICE_KEY"),{auth:{persistSession:false},realtime:{transport:WebSocket}});
const r=await db.from("prices").select("ticker").limit(1); console.log("prices:", r.error?("ERR "+r.error.message):"就绪");
process.exit(0);'
```
Expected: `prices: 就绪`

- [ ] **Step 4: Commit**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/supabase/schema.sql && git commit -m "feat(data): prices 日更价格表"
```

---

## Task 2: Finnhub 纯逻辑

**Files:** Create `web/src/lib/prices/finnhub.ts` (+test)

- [ ] **Step 1: 失败测试 `web/src/lib/prices/finnhub.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { parseQuote, type FinnhubQuote } from "./finnhub";

describe("parseQuote", () => {
  it("取 c(当前价) + t(时间戳)→交易日(UTC)", () => {
    const q: FinnhubQuote = { c: 307.36, t: 1780689600, d: -3.87, dp: -1.24, h: 315, l: 307, o: 312, pc: 311 };
    expect(parseQuote(q)).toEqual({ close: 307.36, date: "2026-06-05" });
  });
  it("c=0 或缺失 → null(无效报价, 跳过)", () => {
    expect(parseQuote({ c: 0, t: 1780689600 } as FinnhubQuote)).toBeNull();
    expect(parseQuote({} as FinnhubQuote)).toBeNull();
  });
});
```
> 注: `t` 是秒级 epoch(最后成交时间)。1780689600 → 2026-06-05(UTC)。用 quote 自带的交易日, 而非"今天", 这样周末/节假日重跑只会幂等重写最后交易日。

- [ ] **Step 2: 运行确认失败**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/prices/finnhub.test.ts
```
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 `web/src/lib/prices/finnhub.ts`**
```ts
// Finnhub /quote 纯逻辑(无网络): 响应 → {close,date}。网络在 scripts/lib/updatePrices.ts。
export type FinnhubQuote = { c?: number; t?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number };
export type ParsedQuote = { close: number; date: string };

/** c=当前/最近收盘价; t=最后成交秒级 epoch。c>0 才有效; date 取 t 的 UTC 日期(交易日)。 */
export function parseQuote(q: FinnhubQuote): ParsedQuote | null {
  if (!q || typeof q.c !== "number" || q.c <= 0 || typeof q.t !== "number" || q.t <= 0) return null;
  const date = new Date(q.t * 1000).toISOString().slice(0, 10);
  return { close: q.c, date };
}
```

- [ ] **Step 4: 运行确认通过**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/prices/finnhub.test.ts
```
Expected: PASS(2 用例)。

- [ ] **Step 5: Commit**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/src/lib/prices/finnhub.ts web/src/lib/prices/finnhub.test.ts && git commit -m "feat(prices): Finnhub quote 纯逻辑 + 单测"
```

---

## Task 3: 价格写库器 + 入口

**Files:** Create `web/scripts/lib/updatePrices.ts`, `web/scripts/prices.ts`; Modify `web/package.json`

- [ ] **Step 1: 写库器 `web/scripts/lib/updatePrices.ts`**
```ts
import { parseQuote, type FinnhubQuote } from "../../src/lib/prices/finnhub";

const QUOTE_URL = "https://finnhub.io/api/v1/quote";
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function fetchQuote(symbol: string, key: string): Promise<FinnhubQuote | null> {
  const res = await fetch(`${QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${key}`);
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) return null;
  return (await res.json()) as FinnhubQuote;
}

/**
 * 读 securities 全部真 ticker, 逐个拉 Finnhub /quote, upsert (ticker,date,close)。
 * 免费档 60/min → 每次 ~1.1s 间隔。429 退避重试一次。返回统计。
 */
export async function updatePrices(db: any, key: string): Promise<{ total: number; written: number; skipped: number }> {
  const tickers: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("securities").select("ticker").range(from, from + 999);
    if (error) throw new Error(`securities read: ${error.message}`);
    if (!data?.length) break;
    tickers.push(...data.map((r: { ticker: string }) => r.ticker));
    if (data.length < 1000) break;
  }

  let written = 0, skipped = 0;
  const rows: { ticker: string; date: string; close: number; source: string }[] = [];
  for (const ticker of tickers) {
    let q: FinnhubQuote | null = null;
    try {
      q = await fetchQuote(ticker, key);
    } catch (e) {
      if (e instanceof Error && e.message === "RATE_LIMIT") { await sleep(5000); try { q = await fetchQuote(ticker, key); } catch { q = null; } }
    }
    const parsed = q ? parseQuote(q) : null;
    if (!parsed) { skipped++; await sleep(1100); continue; }
    rows.push({ ticker, date: parsed.date, close: parsed.close, source: "finnhub" });
    written++;
    if (rows.length >= 200) { await flush(db, rows.splice(0)); }
    await sleep(1100); // 免费档 60/min
  }
  if (rows.length) await flush(db, rows.splice(0));
  return { total: tickers.length, written, skipped };
}

async function flush(db: any, rows: { ticker: string; date: string; close: number; source: string }[]): Promise<void> {
  const { error } = await db.from("prices").upsert(rows, { onConflict: "ticker,date" });
  if (error) console.warn(`prices upsert err: ${error.message}`);
}
```

- [ ] **Step 2: 入口 `web/scripts/prices.ts`**
```ts
/** 价格日更入口: 读仓库根 .env.local(或 process.env), 拉 Finnhub 写 prices。用法: npm run prices */
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
  const fk = env.FINNHUB_API_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  if (!fk) throw new Error("缺少 FINNHUB_API_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });
  const s = await updatePrices(db, fk);
  console.log(`价格完成: 拉取 ${s.total}, 写入 ${s.written}, 跳过 ${s.skipped}`);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
```

- [ ] **Step 3: package.json 加脚本** — 在 `"consensus": ...` 行下加：
```json
    "prices": "tsx scripts/prices.ts",
```

- [ ] **Step 4: 编译校验(不实跑)**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```
Expected: 无类型错误。

- [ ] **Step 5: Commit**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/scripts/lib/updatePrices.ts web/scripts/prices.ts web/package.json && git commit -m "feat(prices): Finnhub 价格写库器 + 入口脚本"
```

---

## Task 4: 跑价格(手动验证关卡)

- [ ] **Step 1: 跑 prices(~1545 ticker, 免费档约 28 分钟)**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npm run prices 2>&1 | tail -5
```
Expected: `价格完成: 拉取 N, 写入 M, 跳过 K`(M 占多数；点号 ticker 如 BRK.B 若 Finnhub 不识别会进 skipped——记录)。
> 控制器执行；耗时长可后台跑。

- [ ] **Step 2: 抽查(手动)**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node --input-type=module -e '
import { createClient } from "@supabase/supabase-js"; import WebSocket from "ws"; import fs from "fs";
const env=fs.readFileSync("../.env.local","utf8"); const g=k=>{const m=env.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].trim().replace(/^["\x27]|["\x27]$/g,""):undefined;};
const db=createClient(g("SUPABASE_URL"),g("SUPABASE_SERVICE_KEY"),{auth:{persistSession:false},realtime:{transport:WebSocket}});
const {count}=await db.from("prices").select("*",{count:"exact",head:true});
const {data}=await db.from("prices").select("ticker,date,close").in("ticker",["AAPL","MSFT","BRK.B"]);
console.log("prices 行:",count,"| 抽样:",JSON.stringify(data));
process.exit(0);'
```
Expected: 行数 ~写入数；AAPL/MSFT 有合理收盘价 + date。记录 BRK.B 是否取到(决定点号 ticker 是否需符号映射，见 Task 5 注)。

---

## Task 5: 读最新价 + 个股页展示

**Files:** Create `web/src/lib/managers/priceRead.ts` (+test); Modify `web/src/app/[lang]/stocks/[ticker]/page.tsx`

- [ ] **Step 1: 失败测试 `web/src/lib/managers/priceRead.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { fmtPriceFact } from "./priceRead";

describe("fmtPriceFact", () => {
  it("有价 → 显示现价 + 货币", () => {
    expect(fmtPriceFact({ close: 307.36, date: "2026-06-05", currency: "USD" })).toBe("$307.36");
  });
  it("无价 → 占位符", () => {
    expect(fmtPriceFact(null)).toBe("—");
  });
});
```

- [ ] **Step 2: 运行确认失败**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/managers/priceRead.test.ts
```
Expected: FAIL。

- [ ] **Step 3: 实现 `web/src/lib/managers/priceRead.ts`**
```ts
import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";

export type LatestPrice = { close: number; date: string; currency: string };

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
    .from("prices").select("close,date,currency").eq("ticker", ticker)
    .order("date", { ascending: false }).limit(1);
  if (error) { console.error(`getLatestPrice(${ticker}) 失败: ${error.message}`); return null; }
  const r = data?.[0];
  return r ? { close: Number(r.close), date: r.date, currency: r.currency ?? "USD" } : null;
});
```

- [ ] **Step 4: 运行确认通过**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/managers/priceRead.test.ts
```
Expected: PASS。

- [ ] **Step 5: 个股页加"现价 + as-of"**

在 `web/src/app/[lang]/stocks/[ticker]/page.tsx`:
- 顶部 import 加：`import { getLatestPrice, fmtPriceFact } from "@/lib/managers/priceRead";`
- 在页面主体计算 `holders` 之后、构造 `keyFacts` 之前加：
```ts
  const price = await getLatestPrice(ticker);
```
- 在 `keyFacts` 数组**最前面**插入一项(现价优先展示)：
```ts
    { label: lang === "zh" ? "现价" : "Price", value: fmtPriceFact(price) },
```
- 把价格的来源/日期并入页面已有的 `sources`(EntityPage 的 sources 数组)。找到现有：
```ts
        sources={[{ name: "SEC EDGAR 13F", asOf: latestFiledAt }]}
```
改为(有价时追加一条 Finnhub 来源 + as-of)：
```ts
        sources={price
          ? [{ name: "SEC EDGAR 13F", asOf: latestFiledAt }, { name: "Finnhub", asOf: price.date }]
          : [{ name: "SEC EDGAR 13F", asOf: latestFiledAt }]}
```
> 护栏: 只展示现价数字 + 来源 + 日期, 不加涨跌色块/技术指标/买卖提示。
> 注(点号 ticker): 若 Task 4 发现 BRK.B 等 Finnhub 取不到价, 在 `getLatestPrice` 查询前不做特殊处理即可(查不到→null→显示"—"); 符号映射(点号→Finnhub 格式)留作后续, 不在本计划扩。

- [ ] **Step 6: 测试 + 构建(主验收)**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run && npm run build 2>&1 | grep -E "Compiled successfully|Failed to compile" | head
```
Expected: 测试全 PASS；`Compiled successfully`。

- [ ] **Step 7: Commit**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/src/lib/managers/priceRead.ts web/src/lib/managers/priceRead.test.ts web/src/app/"[lang]"/stocks/"[ticker]"/page.tsx && git commit -m "feat(stocks): 个股页展示现价 + as-of(Finnhub), 仅事实不做信号"
```

---

## Task 6: GitHub Actions 自动更新流水线

**Files:** Create `.github/workflows/prices.yml`, `.github/workflows/ingest.yml`(仓库根, 非 web/)

- [ ] **Step 1: 价格日更 `/.github/workflows/prices.yml`**
```yaml
name: Daily Prices
on:
  schedule:
    - cron: "0 22 * * 1-5"   # 工作日 22:00 UTC(美股收盘后, 兼顾夏令时)
  workflow_dispatch: {}
jobs:
  prices:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
        working-directory: web
      - run: npm run prices
        working-directory: web
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          FINNHUB_API_KEY: ${{ secrets.FINNHUB_API_KEY }}
```

- [ ] **Step 2: 13F 周更 `/.github/workflows/ingest.yml`**
```yaml
name: Weekly 13F Ingest
on:
  schedule:
    - cron: "0 9 * * 1"      # 每周一 09:00 UTC; 幂等(无新 filing 不写)
  workflow_dispatch: {}
jobs:
  ingest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
        working-directory: web
      - run: npm run ingest      # 末尾已自动连带 enrich + consensus
        working-directory: web
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
          OPENFIGI_API_KEY: ${{ secrets.OPENFIGI_API_KEY }}
```
> 注: ingest 写 `web/src/data/13f/*.json` 与 `index.json`(workspace 内, CI 不提交, 跑完即弃); DB 才是真源。

- [ ] **Step 3: 校验 YAML 可解析**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && node -e "const fs=require('fs');for(const f of ['.github/workflows/prices.yml','.github/workflows/ingest.yml']){const s=fs.readFileSync(f,'utf8'); if(!/cron:/.test(s)||!/working-directory: web/.test(s))process.exit(1);} console.log('workflows OK')"
```
Expected: `workflows OK`

- [ ] **Step 4: 用户配置 GitHub Secrets(手动关卡)**

在 GitHub 仓库 `xjing-umich/ny-fed-monitor` → Settings → Secrets and variables → Actions，新增：
`SUPABASE_URL`、`SUPABASE_SERVICE_KEY`、`FINNHUB_API_KEY`、`OPENFIGI_API_KEY`(值同仓库根 `.env.local`)。
> 配好后可在 Actions 页对两个 workflow 点 "Run workflow"(workflow_dispatch) 手动验证一次。

- [ ] **Step 5: Commit**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add .github/workflows/prices.yml .github/workflows/ingest.yml && git commit -m "ci: 价格日更 + 13F 周更 GitHub Actions(网站只读库, 更新走 Actions)"
```

---

## 后续(本计划之外)
- 点号 ticker(BRK.B 等)→ Finnhub 符号映射(若 Task 4 发现取不到)。
- 价格历史小图(累积一段时间后)；A 股/AkShare 兜底。
- 1D 宏观双路径收敛；1E 统一 provenance/freshness(把 as-of/过期标红做成全站统一)；Phase 2 财报；Phase 3 估值。

## Self-Review 检查
- **Spec 覆盖**: §4.3 prices(Task 1)、Finnhub 拉取(Task 2-4)、个股页现价+as-of(Task 5)、自动更新流水线(Task 6)。
- **类型一致**: `FinnhubQuote`/`ParsedQuote`(finnhub.ts)→ updatePrices(Task 3);`LatestPrice`(priceRead.ts)→ 页面(Task 5)。
- **回退/护栏**: 无 env → getLatestPrice 返回 null → 页面显示"—";价格仅事实(现价+来源+日期), 无信号/技术指标。
- **更新闭环**: 价格日更 + 13F 周更(连带 enrich+consensus)经 GitHub Actions, 网站只读库——解决"拉一次就馊"。
- **DB/外部验证**: 建表(Task 1)、跑价格(Task 4)、配 Secrets+触发 workflow(Task 6)为手动关卡;纯逻辑 vitest;主验收 `npm run build`。
