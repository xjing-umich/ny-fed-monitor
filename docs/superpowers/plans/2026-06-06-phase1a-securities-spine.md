# Phase 1A — 证券主表脊梁 (Securities ticker spine + CUSIP 富化) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立以 ticker 为锚的 `securities` 证券主表 + `security_cusips` 映射表，用 OpenFIGI 把 13F holdings 里 1322 个 CUSIP 富化成 ticker，并让个股页从 CUSIP-keyed 升级为 ticker-keyed（旧 CUSIP URL 301 到 ticker）——这是「三合一」愿景的总开关。

**Architecture:** `securities` 现为空表(0 行)，可干净重建为 ticker 主键 + 独立 `security_cusips(cusip PK → ticker)` 映射表。新增富化脚本读 `holdings` 的去重 CUSIP，调 OpenFIGI v3 mapping(CUSIP 需补足 9 位前导零)，幂等 upsert 到两表。Web 读取层新增 `cusip↔ticker` 解析器(有 Supabase env 读库、否则返回空 Map 回退)。个股路由参数从 `[id]`(cusip) 改为 `[ticker]`，按 ticker 聚合持有人；命中旧 CUSIP 时 301 到 ticker。

**Tech Stack:** Next.js 16 / TypeScript、`@supabase/supabase-js`(已装)、Supabase Postgres(已开通，线上库已有 managers/filings/holdings 数据)、OpenFIGI v3 REST、vitest(仅纯逻辑)、tsx。

**参考 spec:** `docs/superpowers/specs/2026-06-06-data-layer-architecture-design.md`(§4.1 脊梁、§4.2、§5 迁移、§6 Phase 1 第 1 步)

> **用户偏好(沿用 phaseA 计划):** 该项目以 `npm run build` 通过为主要验收；测试保持精简(只对纯逻辑/易错处写单测)；涉及真实数据库/外部 API 的验证为「手动验证关卡」。
>
> **价值观护栏(记忆 `valuation-philosophy-constraint`):** 本计划只建脊梁与持仓关联，不涉及估值；个股页保留「估值数据即将上线」占位，不得加入任何买卖/目标价信号。

---

## 环境/约定

- App root: `/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web`(`src/` 布局；`@/*` → `web/src/*`)。
- Node 20: 每条命令前置 `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`。
- Supabase 凭据在**仓库根** `.env.local`(不在 `web/`)：`SUPABASE_URL` / `SUPABASE_SERVICE_KEY`。脚本读取时用 `../.env.local`(相对 `web/`)。
- OpenFIGI key 可选：环境变量 `OPENFIGI_API_KEY`。无 key 时富化仍可跑(限速 ~250 CUSIP/分钟，1322 个约 6 分钟)；有 free key 时批量 100、约数秒。**前提(可选，不阻塞)：** 用户在 https://www.openfigi.com/api 申请免费 key 写入 `.env.local`。
- 线上库现状(已实测)：`managers` 6、`filings` 12、`holdings` 2325、`securities` 0、去重 CUSIP 1322。

## 文件结构

```
web/supabase/schema.sql                         securities 重建为 ticker 主键 + security_cusips   [改]
web/supabase/README.md                          记录脊梁表与富化步骤                                [改]
web/src/lib/securities/openfigi.ts              纯逻辑: cusip 补零 + OpenFIGI 响应→映射行           [新建]
web/src/lib/securities/openfigi.test.ts         vitest: 补零 + 响应解析                             [新建]
web/src/lib/managers/securities.ts              读取层: cusip→ticker Map / ticker→cusips(env 门控)  [新建]
web/scripts/lib/enrichSecurities.ts             富化核心: 去重 cusip → OpenFIGI → upsert 两表       [新建]
web/scripts/enrich-securities.ts                可执行入口(读 ../.env.local, 调富化核心)            [新建]
web/scripts/ingest-13f.ts                       摄取后顺带富化新 cusip                              [改]
web/src/app/[lang]/stocks/[ticker]/page.tsx     由 [id] 重命名, 按 ticker 聚合 + cusip 301         [改/移]
web/src/lib/urls.ts                             stockPath 改用 ticker；新增 cusip 301 辅助          [改]
web/package.json                                 新增 "enrich" 脚本                                 [改]
```

---

## Task 1: Schema — securities 重建为 ticker 主表 + security_cusips

**Files:**
- Modify: `web/supabase/schema.sql`(顶部 `securities` 表定义，第 35–41 行)

- [ ] **Step 1: 替换 securities 表定义**

把 `web/supabase/schema.sql` 中现有的：
```sql
create table if not exists securities (
  cusip text primary key,
  ticker text,
  name text,
  sector text,
  updated_at timestamptz default now()
);
```
替换为：
```sql
-- 证券主表(脊梁): ticker 为锚, 三支柱挂其上
create table if not exists securities (
  ticker text primary key,
  name text,
  exchange text,
  sector text,
  figi text,
  primary_cusip text,
  source text,
  as_of date,
  updated_at timestamptz not null default now()
);

-- CUSIP → ticker 映射(13F holdings 用 cusip, 经此表落到脊梁)
-- cusip 存 holdings 中的原始形态(可能缺前导零), 补零仅用于调 OpenFIGI
create table if not exists security_cusips (
  cusip text primary key,
  ticker text references securities(ticker) on delete set null,
  issuer text,
  resolved boolean not null default false,
  source text,
  updated_at timestamptz not null default now()
);
create index if not exists security_cusips_ticker_idx on security_cusips (ticker);
```

- [ ] **Step 2: 校验 SQL 文本含两表**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node -e "const s=require('fs').readFileSync('supabase/schema.sql','utf8'); const ok=/create table if not exists securities[\s\S]*ticker text primary key/.test(s)&&/create table if not exists security_cusips/.test(s); if(!ok)process.exit(1); console.log('OK: spine tables present')"
```
Expected: `OK: spine tables present`

- [ ] **Step 3: 应用到线上库(手动验证关卡)**

`securities` 现为 0 行，直接重建无数据损失。在 Supabase SQL Editor 执行(或 psql)：
```sql
drop table if exists securities cascade;
```
然后把 `web/supabase/schema.sql` 中**上述两个 create 语句**贴入执行。

Run(验证两表存在且为空)：
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node --input-type=module -e '
import { createClient } from "@supabase/supabase-js"; import WebSocket from "ws"; import fs from "fs";
const env=fs.readFileSync("../.env.local","utf8"); const g=k=>{const m=env.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].trim().replace(/^["\x27]|["\x27]$/g,""):undefined;};
const db=createClient(g("SUPABASE_URL"),g("SUPABASE_SERVICE_KEY"),{auth:{persistSession:false},realtime:{transport:WebSocket}});
for(const t of ["securities","security_cusips"]){const{count,error}=await db.from(t).select("*",{count:"exact",head:true});console.log(t,error?("ERR "+error.message):(count+" rows"));}
process.exit(0);'
```
Expected: `securities 0 rows` 和 `security_cusips 0 rows`(无 ERR)。

- [ ] **Step 4: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/supabase/schema.sql && git commit -m "feat(data): securities 重建为 ticker 主表 + security_cusips 映射"
```

---

## Task 2: OpenFIGI 纯逻辑(补零 + 响应解析)

**Files:**
- Create: `web/src/lib/securities/openfigi.ts`
- Test: `web/src/lib/securities/openfigi.test.ts`

- [ ] **Step 1: 写失败测试**

`web/src/lib/securities/openfigi.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { padCusip, parseMappingResult, type MappingResultItem } from "./openfigi";

describe("padCusip", () => {
  it("补足 9 位前导零", () => {
    expect(padCusip("37833100")).toBe("037833100"); // Apple, 缺 1 位
  });
  it("已是 9 位则原样返回", () => {
    expect(padCusip("191216100")).toBe("191216100"); // Coca-Cola
  });
});

describe("parseMappingResult", () => {
  it("取第一条 data 的 ticker/name/exchCode/figi", () => {
    const item: MappingResultItem = {
      data: [
        { ticker: "AAPL", name: "APPLE INC", exchCode: "US", figi: "BBG000B9XRY4", securityType: "Common Stock" },
      ],
    };
    expect(parseMappingResult("37833100", "APPLE INC", item)).toEqual({
      cusip: "37833100",
      ticker: "AAPL",
      name: "APPLE INC",
      exchange: "US",
      figi: "BBG000B9XRY4",
      resolved: true,
    });
  });
  it("warning(无匹配)→ resolved false, ticker null, 保留 issuer 名", () => {
    const item: MappingResultItem = { warning: "No identifier found." };
    expect(parseMappingResult("999999999", "OBSCURE FUND", item)).toEqual({
      cusip: "999999999",
      ticker: null,
      name: "OBSCURE FUND",
      exchange: null,
      figi: null,
      resolved: false,
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/securities/openfigi.test.ts
```
Expected: FAIL(`Cannot find module './openfigi'`)。

- [ ] **Step 3: 写实现**

`web/src/lib/securities/openfigi.ts`:
```ts
// OpenFIGI v3 mapping 的纯逻辑(无网络): CUSIP 补零 + 响应行解析。
// 网络/批处理在 scripts/lib/enrichSecurities.ts。

export type FigiData = {
  ticker?: string;
  name?: string;
  exchCode?: string;
  figi?: string;
  securityType?: string;
};
export type MappingResultItem = { data?: FigiData[]; warning?: string; error?: string };

export type SecurityRow = {
  cusip: string;
  ticker: string | null;
  name: string | null;
  exchange: string | null;
  figi: string | null;
  resolved: boolean;
};

/** SEC 13F CUSIP 常缺前导零；OpenFIGI 要求标准 9 位。 */
export function padCusip(cusip: string): string {
  return cusip.trim().padStart(9, "0");
}

/** 把一条 OpenFIGI 结果解析为待写库的行。无匹配/报错 → resolved=false 并保留 issuer 名。 */
export function parseMappingResult(
  cusip: string,
  issuer: string,
  item: MappingResultItem
): SecurityRow {
  const first = item?.data?.[0];
  if (first?.ticker) {
    return {
      cusip,
      ticker: first.ticker,
      name: first.name ?? issuer,
      exchange: first.exchCode ?? null,
      figi: first.figi ?? null,
      resolved: true,
    };
  }
  return { cusip, ticker: null, name: issuer, exchange: null, figi: null, resolved: false };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/securities/openfigi.test.ts
```
Expected: PASS(4 个用例)。

- [ ] **Step 5: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/src/lib/securities/openfigi.ts web/src/lib/securities/openfigi.test.ts && git commit -m "feat(data): OpenFIGI 纯逻辑(cusip 补零 + 响应解析) + 单测"
```

---

## Task 3: 富化核心 + 可执行入口(去重 CUSIP → OpenFIGI → upsert)

**Files:**
- Create: `web/scripts/lib/enrichSecurities.ts`
- Create: `web/scripts/enrich-securities.ts`
- Modify: `web/package.json`(scripts)

- [ ] **Step 1: 写富化核心**

`web/scripts/lib/enrichSecurities.ts`:
```ts
import { padCusip, parseMappingResult, type MappingResultItem, type SecurityRow } from "../../src/lib/securities/openfigi";

const OPENFIGI_URL = "https://api.openfigi.com/v3/mapping";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** 调 OpenFIGI 映射一批(已补零)。返回与输入等长的结果数组。 */
export async function mapBatch(
  pairs: { cusip: string; issuer: string }[],
  apiKey?: string
): Promise<SecurityRow[]> {
  const body = pairs.map((p) => ({ idType: "ID_CUSIP", idValue: padCusip(p.cusip), exchCode: "US" }));
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-OPENFIGI-APIKEY"] = apiKey;
  const res = await fetch(OPENFIGI_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenFIGI HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as MappingResultItem[];
  return pairs.map((p, i) => parseMappingResult(p.cusip, p.issuer, json[i] ?? { warning: "no result" }));
}

/**
 * 从 holdings 取去重 cusip(带 issuer), 跳过 security_cusips 中已 resolved 的, 分批富化并 upsert 两表。
 * db: supabase client。返回统计。
 */
export async function enrichSecurities(db: any, apiKey?: string): Promise<{ total: number; resolved: number; unresolved: number }> {
  // 1) 去重 cusip + 代表性 issuer(分页读 holdings)
  const cusipIssuer = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("holdings").select("cusip,issuer").range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) if (!cusipIssuer.has(r.cusip)) cusipIssuer.set(r.cusip, r.issuer);
    if (data.length < 1000) break;
  }

  // 2) 已 resolved 的跳过(幂等)
  const done = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("security_cusips").select("cusip").eq("resolved", true).range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) done.add(r.cusip);
    if (data.length < 1000) break;
  }

  const todo = [...cusipIssuer.entries()].filter(([c]) => !done.has(c)).map(([cusip, issuer]) => ({ cusip, issuer }));

  // 3) 分批: 有 key 100/批, 无 key 10/批; 限速避免 429
  const batchSize = apiKey ? 100 : 10;
  const intervalMs = apiKey ? 300 : 2600; // 无 key < 25 req/min
  let resolved = 0, unresolved = 0;
  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    let rows: SecurityRow[];
    try {
      rows = await mapBatch(batch, apiKey);
    } catch (e) {
      console.warn(`batch ${i}-${i + batch.length} failed: ${e instanceof Error ? e.message : e}`);
      await sleep(intervalMs);
      continue;
    }
    // securities upsert(仅 resolved 行)
    const secs = rows.filter((r) => r.resolved && r.ticker).map((r) => ({
      ticker: r.ticker, name: r.name, exchange: r.exchange, figi: r.figi, primary_cusip: r.cusip, source: "openfigi", as_of: new Date().toISOString().slice(0, 10),
    }));
    if (secs.length) {
      const { error } = await db.from("securities").upsert(secs, { onConflict: "ticker" });
      if (error) console.warn(`securities upsert err: ${error.message}`);
    }
    // security_cusips upsert(全部行, 含未解析占位以免下次重查)
    const maps = rows.map((r) => ({ cusip: r.cusip, ticker: r.ticker, issuer: r.name, resolved: r.resolved, source: "openfigi" }));
    const { error: mErr } = await db.from("security_cusips").upsert(maps, { onConflict: "cusip" });
    if (mErr) console.warn(`security_cusips upsert err: ${mErr.message}`);
    for (const r of rows) (r.resolved ? resolved++ : unresolved++);
    console.log(`progress ${Math.min(i + batchSize, todo.length)}/${todo.length} (resolved ${resolved}, unresolved ${unresolved})`);
    await sleep(intervalMs);
  }
  return { total: todo.length, resolved, unresolved };
}
```

- [ ] **Step 2: 写可执行入口**

`web/scripts/enrich-securities.ts`:
```ts
/** CUSIP→ticker 富化入口: 读仓库根 .env.local, 调 enrichSecurities。用法: npm run enrich */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { enrichSecurities } from "./lib/enrichSecurities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(): Record<string, string> {
  const p = path.join(__dirname, "../../.env.local"); // web/scripts → repo root
  const out: Record<string, string> = {};
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return { ...out, ...process.env } as Record<string, string>;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("缺少 SUPABASE_URL / SUPABASE_SERVICE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });
  const stats = await enrichSecurities(db, env.OPENFIGI_API_KEY);
  console.log(`完成: 处理 ${stats.total}, 解析 ${stats.resolved}, 未解析 ${stats.unresolved}`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
```

- [ ] **Step 3: 加 package.json 脚本**

在 `web/package.json` 的 `scripts` 中，于 `"ingest": "tsx scripts/ingest-13f.ts",` 下一行加：
```json
    "enrich": "tsx scripts/enrich-securities.ts",
```

- [ ] **Step 4: 跑富化(手动验证关卡 — 真实 OpenFIGI + 库写入)**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npm run enrich
```
Expected: 进度日志滚动；结尾 `完成: 处理 1322, 解析 N, 未解析 M`(N 远大于 M；期权/外国/部分基金会未解析，正常)。无 key 约 6 分钟。

- [ ] **Step 5: 抽查库内结果(手动验证关卡)**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node --input-type=module -e '
import { createClient } from "@supabase/supabase-js"; import WebSocket from "ws"; import fs from "fs";
const env=fs.readFileSync("../.env.local","utf8"); const g=k=>{const m=env.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].trim().replace(/^["\x27]|["\x27]$/g,""):undefined;};
const db=createClient(g("SUPABASE_URL"),g("SUPABASE_SERVICE_KEY"),{auth:{persistSession:false},realtime:{transport:WebSocket}});
const {count:sc}=await db.from("securities").select("*",{count:"exact",head:true});
const {count:mc}=await db.from("security_cusips").select("*",{count:"exact",head:true});
const {data}=await db.from("security_cusips").select("cusip,ticker,issuer").eq("cusip","37833100");
console.log("securities",sc,"| security_cusips",mc,"| AAPL row",JSON.stringify(data));
process.exit(0);'
```
Expected: `securities` 数百行；`security_cusips` 1322 行；AAPL 行 `ticker:"AAPL"`。

- [ ] **Step 6: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/scripts/lib/enrichSecurities.ts web/scripts/enrich-securities.ts web/package.json && git commit -m "feat(data): OpenFIGI 富化脚本(holdings cusip → securities/security_cusips)"
```

---

## Task 4: Web 读取层 — cusip↔ticker 解析器(env 门控, JSON 回退空 Map)

**Files:**
- Create: `web/src/lib/managers/securities.ts`
- Test: `web/src/lib/managers/securities.test.ts`

- [ ] **Step 1: 写失败测试(仅纯映射逻辑)**

`web/src/lib/managers/securities.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { rowsToCusipMap, type CusipMapRow } from "./securities";

describe("rowsToCusipMap", () => {
  it("把行映射为 cusip → {ticker,name}", () => {
    const rows: CusipMapRow[] = [
      { cusip: "37833100", ticker: "AAPL", issuer: "APPLE INC" },
      { cusip: "999999999", ticker: null, issuer: "OBSCURE FUND" },
    ];
    const m = rowsToCusipMap(rows);
    expect(m.get("37833100")).toEqual({ ticker: "AAPL", name: "APPLE INC" });
    expect(m.get("999999999")).toEqual({ ticker: null, name: "OBSCURE FUND" });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/managers/securities.test.ts
```
Expected: FAIL(`Cannot find module './securities'`)。

- [ ] **Step 3: 写实现**

`web/src/lib/managers/securities.ts`:
```ts
import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";

export type CusipMapRow = { cusip: string; ticker: string | null; issuer: string | null };
export type CusipInfo = { ticker: string | null; name: string | null };

/** 纯映射(单测): 行数组 → cusip Map。 */
export function rowsToCusipMap(rows: CusipMapRow[]): Map<string, CusipInfo> {
  const m = new Map<string, CusipInfo>();
  for (const r of rows) m.set(r.cusip, { ticker: r.ticker, name: r.issuer });
  return m;
}

/** 全量 cusip→info Map。无 Supabase env(本地 JSON 开发) → 空 Map(优雅降级)。每次渲染缓存一次。 */
export const getCusipMap = cache(async (): Promise<Map<string, CusipInfo>> => {
  if (!hasSupabaseEnv()) return new Map();
  const db = getDb();
  const rows: CusipMapRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("security_cusips").select("cusip,ticker,issuer").range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...(data as CusipMapRow[]));
    if (data.length < 1000) break;
  }
  return rowsToCusipMap(rows);
});

/** ticker → 该 ticker 下的全部 cusip(用于按 ticker 聚合持有人)。无 env → []。 */
export async function tickerToCusips(ticker: string): Promise<string[]> {
  if (!hasSupabaseEnv()) return [];
  const db = getDb();
  const { data } = await db.from("security_cusips").select("cusip").eq("ticker", ticker);
  return (data ?? []).map((r: { cusip: string }) => r.cusip);
}
```

- [ ] **Step 4: 运行确认通过**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/managers/securities.test.ts
```
Expected: PASS。

> 注: `server-only` 在 vitest 下由现有 `src/__mocks__/server-only.ts` 处理(项目已有该 mock)。若测试报 `server-only` 解析错误，确认 `vitest.config.ts` 的 alias 已含该 mock(沿用现状，无需改)。

- [ ] **Step 5: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/src/lib/managers/securities.ts web/src/lib/managers/securities.test.ts && git commit -m "feat(data): cusip↔ticker 读取层(env 门控, JSON 回退空 Map) + 单测"
```

---

## Task 5: 个股页 ticker 化([id]→[ticker], 按 ticker 聚合, 旧 cusip 301)

**Files:**
- Move + Modify: `web/src/app/[lang]/stocks/[id]/page.tsx` → `web/src/app/[lang]/stocks/[ticker]/page.tsx`
- Modify: `web/src/lib/urls.ts`

- [ ] **Step 1: 重命名路由目录(保留 git 历史)**

Run:
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && git mv "src/app/[lang]/stocks/[id]" "src/app/[lang]/stocks/[ticker]"
```

- [ ] **Step 2: 改 urls.ts — stockPath 语义为 ticker**

把 `web/src/lib/urls.ts` 中：
```ts
export const stockPath = (lang: Lang, id: string) => `/${lang}/stocks/${id}`;
```
替换为：
```ts
// 个股 URL 以 ticker 为锚(无 ticker 的标的回退用 cusip, 仍可访问)
export const stockPath = (lang: Lang, tickerOrCusip: string) => `/${lang}/stocks/${tickerOrCusip}`;
```
(签名不变、仅语义/命名澄清；调用方传 ticker 时即得 ticker URL。)

- [ ] **Step 3: 改写个股页 — 按 ticker 聚合 + cusip 301**

把 `web/src/app/[lang]/stocks/[ticker]/page.tsx` 中两处 `params: Promise<{ lang: string; id: string }>` 改为 `{ lang: string; ticker: string }`，并把页面主体替换为按 ticker 解析。完整替换 `export default async function StockCusipPage` 与 `generateMetadata` 的取参与聚合逻辑如下(其余 `HoldersTable`/`TABLE_COPY`/imports 保留)：

在文件顶部 imports 增加：
```ts
import { redirect } from "next/navigation";
import { getCusipMap, tickerToCusips } from "@/lib/managers/securities";
```

`generateMetadata` 改为：
```ts
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; ticker: string }>;
}): Promise<Metadata> {
  const { lang: rawLang, ticker } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";

  // ticker 下任一 cusip 的 issuer 名作展示
  const cusips = await tickerToCusips(ticker);
  const cusipMap = await getCusipMap();
  let issuer = ticker;
  for (const c of cusips) { const info = cusipMap.get(c); if (info?.name) { issuer = info.name; break; } }

  const l = lang === "en" ? "en" : "zh";
  const alternates = {
    canonical: `/${l}/stocks/${ticker}`,
    languages: { "zh-CN": `/zh/stocks/${ticker}`, en: `/en/stocks/${ticker}` },
  };
  return lang === "zh"
    ? { title: `${issuer}（${ticker}）— 谁在持有 / 机构持仓 — Compounder · 复利`,
        description: `查看持有 ${issuer}（${ticker}）的超级投资者，了解机构持仓分布。`, alternates }
    : { title: `${issuer} (${ticker}) — Who's Holding — Compounder · 复利`,
        description: `See which superinvestors hold ${issuer} (${ticker}) and their position sizes.`, alternates };
}
```

页面主体(`export default ...`)取参与聚合替换为：
```ts
export default async function StockTickerPage({
  params,
}: {
  params: Promise<{ lang: string; ticker: string }>;
}): Promise<React.ReactElement> {
  const { lang: rawLang, ticker: rawTicker } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  // 旧 CUSIP URL → 301 到 ticker(若该 cusip 已解析)
  const cusipMap = await getCusipMap();
  const asCusip = cusipMap.get(rawTicker);
  if (asCusip?.ticker && asCusip.ticker !== rawTicker) {
    redirect(`/${lang}/stocks/${asCusip.ticker}`);
  }

  const ticker = rawTicker;
  // 该 ticker 下的全部 cusip(含历史)；若库为空(本地)或未解析, 回退把入参当作单个 cusip
  const cusipsForTicker = await tickerToCusips(ticker);
  const targetCusips = new Set(cusipsForTicker.length ? cusipsForTicker : [ticker]);

  const idx = await getManagerIndex();
  const holders: HolderRow[] = [];
  const issuerFreq: Record<string, number> = {};
  let latestFiledAt = "";

  for (const summary of idx.managers) {
    const d = await getManagerDetail(summary.slug);
    if (!d) continue;
    const h = d.latest.holdings.find((holding) => targetCusips.has(holding.cusip));
    if (!h) continue;
    issuerFreq[h.issuer] = (issuerFreq[h.issuer] ?? 0) + 1;
    if (!latestFiledAt || d.latest.filedAt > latestFiledAt) latestFiledAt = d.latest.filedAt;
    holders.push({ person: summary.person, slug: summary.slug, value: h.value, shares: h.shares, weight: h.weight });
  }

  if (holders.length === 0) notFound();

  const issuer = Object.entries(issuerFreq).sort((a, b) => b[1] - a[1])[0][0];
  const n = holders.length;
  const totalValue = holders.reduce((sum, r) => sum + r.value, 0);
  const topHolder = [...holders].sort((a, b) => b.value - a.value)[0];

  const subtitle =
    lang === "zh"
      ? `${n} 位超级投资者持有 ${issuer}（${ticker}）。股票估值数据即将上线。`
      : `Held by ${n} superinvestor${n === 1 ? "" : "s"} (${ticker}). Valuation data coming soon.`;

  const keyFacts = [
    { label: lang === "zh" ? "代码" : "Ticker", value: ticker },
    { label: lang === "zh" ? "持有人数" : "Holder count", value: String(n) },
    { label: lang === "zh" ? "合计市值" : "Total value held", value: formatUSD(totalValue) },
    { label: lang === "zh" ? "最大持有人" : "Largest holder", value: topHolder.person },
  ];

  const related = [...holders]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((r) => ({ label: r.person, href: investorPath(lang, r.slug) }));

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: lang === "zh" ? "个股" : "Stocks", item: `https://compounder.fyi/${lang}/stocks` },
      { "@type": "ListItem", position: 2, name: issuer, item: `https://compounder.fyi/${lang}/stocks/${ticker}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <EntityPage
        lang={lang}
        title={issuer}
        subtitle={subtitle}
        keyFacts={keyFacts}
        aiPageKey={`stock:${ticker}`}
        sources={[{ name: "SEC EDGAR 13F", asOf: latestFiledAt }]}
        related={related}
      >
        <HoldersTable holders={holders} lang={lang} />
      </EntityPage>
    </>
  );
}
```

> 说明: `aiPageKey` 由 `stock:${cusip}` 改为 `stock:${ticker}`——旧的 cusip-keyed AI 缓存会自然失效重算(可接受)。

- [ ] **Step 4: 确认 /stocks 列表页链接走 ticker**

Run(检查 stocks 列表页用 `stockPath` 传的是 cusip 还是 ticker):
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && grep -n "stockPath\|cusip\|ticker" "src/app/[lang]/stocks/page.tsx"
```
若列表项仍用 `stockPath(lang, row.cusip)`，改为：先从 `getCusipMap()` 取 `info.ticker`，有 ticker 用 ticker、否则回退 cusip。具体：在该页数据组装处，对每行 `const info = cusipMap.get(row.cusip); const href = stockPath(lang, info?.ticker ?? row.cusip);`，并在文件顶部 `import { getCusipMap } from "@/lib/managers/securities";` 后 `const cusipMap = await getCusipMap();`(该页已是 async server component)。

- [ ] **Step 5: 构建验证(主要验收关卡)**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npm run build
```
Expected: 构建成功，无类型错误；`/[lang]/stocks/[ticker]` 路由出现在输出中。

- [ ] **Step 6: 手动验证关卡(本地起服, 需 web/.env.local 指向库)**

> 本地默认无 `web/.env.local` → 读 JSON 回退, ticker 解析返回空, 个股页把入参当 cusip(旧行为仍可用)。要验证 ticker 化, 临时 `cp ../.env.local .env.local` 后 `npm run dev`, 访问 `/zh/stocks/AAPL`(应列出持有 Apple 的投资者), 再访问 `/zh/stocks/37833100`(应 301 到 `/zh/stocks/AAPL`)。验证后删除临时 `web/.env.local`。

- [ ] **Step 7: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add -A web/src/app/"[lang]"/stocks web/src/lib/urls.ts && git commit -m "feat(stocks): 个股页由 cusip 升级为 ticker-keyed, 旧 cusip 301 到 ticker"
```

---

## Task 6: 摄取后顺带富化(让未来新 CUSIP 自动接入脊梁)

**Files:**
- Modify: `web/scripts/ingest-13f.ts`(Supabase upsert 块之后)

- [ ] **Step 1: 在 ingest 的 Supabase 写库后追加富化调用**

`web/scripts/ingest-13f.ts` 顶部 imports 增加：
```ts
import { enrichSecurities } from "./lib/enrichSecurities.js";
```
在 `console.log("Supabase upsert done.");` 之后、`} else {` 之前插入：
```ts
    try {
      const stats = await enrichSecurities(db, process.env.OPENFIGI_API_KEY);
      console.log(`Securities enrich: 处理 ${stats.total}, 解析 ${stats.resolved}, 未解析 ${stats.unresolved}`);
    } catch (e) {
      console.warn(`Securities enrich failed (非致命): ${e instanceof Error ? e.message : e}`);
    }
```
(因 `enrichSecurities` 只处理 `resolved=false` 的新 cusip，重复运行成本低、幂等。)

- [ ] **Step 2: 类型/构建验证**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx tsc --noEmit -p tsconfig.json
```
Expected: 无错误(若项目无独立 tsc 校验脚本，则以 Step 3 的 `npm run build` 为准)。

- [ ] **Step 3: 全量测试 + 构建(收尾验收)**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run && npm run build
```
Expected: 全部测试 PASS；构建成功。

- [ ] **Step 4: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/scripts/ingest-13f.ts && git commit -m "feat(data): 13F 摄取后自动富化新 CUSIP 到证券脊梁"
```

---

## 后续计划(本计划之外, 各自独立)

- **Phase 1B — 共识物化**: `consensus_holdings/consensus_moves` 表 + 摄取后预算，`aggregations.ts`/首页/`/stocks` 改读表(替代请求时全表扫)。
- **Phase 1C — 日更价格**: `prices` 表(Finnhub 主/AkShare 兜底)挂 ticker 脊梁 + 个股页价格。
- **Phase 1D — 宏观双路径收敛**: `build.ts` 改读 `market_*` DB，cron 写、前台不再裸抓。
- **Phase 1E — 统一 provenance/freshness**: 把宏观的 `freshness_status` 模型推广到 13F/价格(逐户/逐表新鲜度，UI 统一标来源+as-of)。
- **Phase 2 — 财报**: `fundamentals` 多年回填。
- **Phase 3 — 估值**: `valuation_runs` + Skill 产物落库 + AI 叙述(护栏: 无推荐/目标价)。

---

## Self-Review 检查

- **Spec 覆盖**: §4.1 脊梁(Task 1)、CUSIP 富化/桥(Task 2-3)、读取层 env 门控(Task 4)、§5 迁移与个股 ticker 化+301(Task 5)、摄取接入(Task 6)。共识/价格/财报/估值/宏观收敛已显式列为后续独立计划。
- **类型一致**: `SecurityRow`(openfigi.ts)贯穿 Task 2-3；`CusipInfo`/`CusipMapRow`(securities.ts)贯穿 Task 4-5；`getCusipMap`/`tickerToCusips` 命名在 Task 4 定义、Task 5 调用一致。
- **无占位符**: 所有 step 含真实代码/命令/预期输出。
- **DB/外部 API 验证**: 按用户偏好设为手动验证关卡(Task 1 Step 3、Task 3 Step 4-5、Task 5 Step 6)，纯逻辑走 vitest，最终以 `npm run build` 为主要验收。
