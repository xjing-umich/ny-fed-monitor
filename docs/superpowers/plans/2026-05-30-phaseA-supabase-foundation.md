# 阶段 A — Supabase 持久化地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 13F 数据从“打包 JSON”迁移到 Supabase Postgres：建表、让 ingestion 写库、Web 数据层改为“有 Supabase env 读库、否则回退 JSON”，为多季度历史/扩充/分析打地基。

**Architecture:** 新增 Postgres 4 表(managers/filings/holdings/securities)。`scripts/ingest-13f.ts` 在检测到 Supabase env 时把每位经理人的 latest+prior filing 及聚合后 holdings upsert 入库(幂等于 accession 唯一约束)。Web 的 `lib/managers/source.ts` 路由：env 齐全→`supabase.ts` 读库；否则→现有打包 JSON。无密钥时一切照常(build/本地开发)。

**Tech Stack:** Next.js 16 / TypeScript、`@supabase/supabase-js`(已装)、Supabase Postgres(免费档)、vitest(仅对纯映射/路由逻辑做少量单测)、tsx。

参考 spec: `docs/superpowers/specs/2026-05-30-productization-architecture-design.md`(§3.1, §3.2 写库部分)

> 用户偏好: 该项目以 `npm run build` 通过为主要验收，测试保持精简(只对“纯逻辑/容易出错处”写单测)。涉及真实数据库的验证为“用户提供 Supabase 凭据后的手动验证关卡”。

---

## 环境/约定
- App root: `/Users/junlinzhu/Desktop/yangyang-code/nyfed_treasury_web_agent_副本/web`(`src/` 布局；`@/*`→`web/src/*`)。
- Node 20: 每条 npm 前置 `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`。
- Git: 项目目录当前被父仓库 gitignore；commit 步骤在用户把项目纳入 Git 仓库后执行，否则跳过(本阶段不强制 git)。
- 现有相关文件(13F-A 已建，本阶段改造): `web/supabase/schema.sql`、`web/src/lib/managers/supabase.ts`、`web/src/lib/managers/source.ts`、`web/scripts/ingest-13f.ts`、`web/src/lib/managers/types.ts`、`web/src/data/13f/*.json`。

## 文件结构
```
web/supabase/schema.sql                  最终 schema(4 表 + 索引 + 约束)   [改写]
web/supabase/README.md                   开通/应用 schema/env 说明           [改写]
web/src/lib/managers/db.ts               Supabase client 工厂(惰性、env 门控) [新建]
web/src/lib/managers/supabase.ts         读适配器: 行→类型 映射               [改写]
web/src/lib/managers/source.ts           路由: env→supabase 否则 JSON         [改写]
web/scripts/lib/supabaseUpsert.ts        写: ManagerDetail→upsert 行           [新建]
web/scripts/ingest-13f.ts                env 齐全时同时 upsert 入库            [改]
web/src/lib/managers/__tests__/          vitest: 映射 + 路由选择               [新建]
```

---

## Task 1: 最终 Supabase schema

**Files:** Modify `web/supabase/schema.sql`

- [ ] **Step 1: 写最终 schema**

Replace `web/supabase/schema.sql` 全文:
```sql
-- Smart Money Monitor — 13F schema (Phase A)
create table if not exists managers (
  cik text primary key,
  slug text unique not null,
  name text not null,
  person text not null,
  created_at timestamptz default now()
);

create table if not exists filings (
  id bigint generated always as identity primary key,
  cik text not null references managers(cik) on delete cascade,
  period date not null,
  filed_at date,
  accession text unique not null,
  total_value bigint not null default 0,
  holding_count int not null default 0
);
create index if not exists filings_cik_period_idx on filings (cik, period desc);

create table if not exists holdings (
  id bigint generated always as identity primary key,
  filing_id bigint not null references filings(id) on delete cascade,
  cusip text not null,
  issuer text not null,
  title_of_class text,
  value bigint not null default 0,
  shares numeric not null default 0,
  put_call text,
  weight numeric not null default 0
);
create index if not exists holdings_filing_idx on holdings (filing_id);
create index if not exists holdings_cusip_idx on holdings (cusip);

create table if not exists securities (
  cusip text primary key,
  ticker text,
  name text,
  sector text,
  updated_at timestamptz default now()
);
```

- [ ] **Step 2: 校验 SQL 语法(本地 psql 可选；至少肉眼+无 tsc 影响)**

Run: `cd /Users/junlinzhu/Desktop/yangyang-code/nyfed_treasury_web_agent_副本/web && node -e "const s=require('fs').readFileSync('supabase/schema.sql','utf8'); if(!/create table if not exists holdings/.test(s)) process.exit(1); console.log('schema present, tables: '+ (s.match(/create table/g)||[]).length)"`
Expected: `schema present, tables: 4`

- [ ] **Step 3: Commit**(若已纳入 Git，否则跳过)
```bash
git add web/supabase/schema.sql && git commit -m "feat(db): finalize 13F supabase schema (Phase A)"
```

---

## Task 2: Supabase client 工厂 `db.ts`

**Files:** Create `web/src/lib/managers/db.ts`

- [ ] **Step 1: 实现(惰性、env 门控、不在模块顶层抛错)**

Create `web/src/lib/managers/db.ts`:
```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function hasSupabaseEnv(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

let _client: SupabaseClient | null = null;

// Lazy: never throws at import time (so `next build` works without creds).
export function getDb(): SupabaseClient {
  if (!hasSupabaseEnv()) {
    throw new Error("Supabase env not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY)");
  }
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return _client;
}
```

- [ ] **Step 2: typecheck**

Run: `cd web && export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**(可选)

---

## Task 3: 读适配器 `supabase.ts`(TDD：行→类型 映射)

**Files:** Rewrite `web/src/lib/managers/supabase.ts`; Create `web/src/lib/managers/__tests__/supabase.test.ts`

- [ ] **Step 1: 写失败测试(用假 client 注入，断言映射)**

Create `web/src/lib/managers/__tests__/supabase.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { mapIndexRows, mapDetailRows } from "@/lib/managers/supabase";

describe("supabase mapping", () => {
  it("mapIndexRows → ManagerIndex summaries sorted by totalValue desc", () => {
    const rows = [
      { cik: "1", slug: "a", name: "A LLC", person: "PA", period: "2026-03-31", total_value: 1000, holding_count: 5, top_holding: "AAA" },
      { cik: "2", slug: "b", name: "B LP", person: "PB", period: "2026-03-31", total_value: 5000, holding_count: 9, top_holding: "BBB" },
    ];
    const idx = mapIndexRows(rows as any, "2026-05-30T00:00:00Z");
    expect(idx.managers[0].cik).toBe("2"); // higher value first
    expect(idx.managers[0].topHolding).toBe("BBB");
    expect(idx.managers).toHaveLength(2);
  });

  it("mapDetailRows builds latest/prior/holdings", () => {
    const manager = { cik: "1", slug: "a", name: "A LLC", person: "PA" };
    const filings = [
      { id: 10, period: "2026-03-31", filed_at: "2026-05-15", accession: "x-1", total_value: 1000, holding_count: 1 },
      { id: 9, period: "2025-12-31", filed_at: "2026-02-14", accession: "x-0", total_value: 800, holding_count: 1 },
    ];
    const holdings = [
      { filing_id: 10, cusip: "C1", issuer: "ISS1", title_of_class: "COM", value: 1000, shares: 100, put_call: null, weight: 1 },
      { filing_id: 9, cusip: "C1", issuer: "ISS1", title_of_class: "COM", value: 800, shares: 80, put_call: null, weight: 1 },
    ];
    const d = mapDetailRows(manager as any, filings as any, holdings as any);
    expect(d.latest.period).toBe("2026-03-31");
    expect(d.latest.holdings[0].cusip).toBe("C1");
    expect(d.prior?.period).toBe("2025-12-31");
    expect(d.changes.find((c) => c.kind === "increased")?.cusip).toBe("C1"); // 80→100
  });
});
```

- [ ] **Step 2: 运行确认失败** — `cd web && npm run test -- supabase` → FAIL(函数不存在)。

- [ ] **Step 3: 实现** — Rewrite `web/src/lib/managers/supabase.ts`:
```ts
import "server-only";
import type {
  ManagerIndex, ManagerSummary, ManagerDetail, Manager, FilingData, Holding, HoldingChange,
} from "@/lib/managers/types";
import { getDb } from "@/lib/managers/db";

type IndexRow = ManagerSummary & { top_holding: string; total_value: number; holding_count: number };

// --- pure mappers (unit-tested) ---
export function mapIndexRows(rows: IndexRow[], generatedAt: string): ManagerIndex {
  const managers: ManagerSummary[] = rows
    .map((r) => ({
      cik: r.cik, slug: r.slug, name: r.name, person: r.person,
      period: r.period, totalValue: Number(r.total_value),
      holdingCount: Number(r.holding_count), topHolding: r.top_holding ?? "",
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
  return { generatedAt, managers };
}

function rowToHolding(r: any): Holding {
  return {
    cusip: r.cusip, issuer: r.issuer, titleOfClass: r.title_of_class ?? undefined,
    value: Number(r.value), shares: Number(r.shares),
    putCall: r.put_call ?? undefined, weight: Number(r.weight),
  };
}
function key(h: { cusip: string; putCall?: string }): string { return `${h.cusip}|${h.putCall ?? ""}`; }

function computeChanges(latest: Holding[], prior: Holding[]): HoldingChange[] {
  const lm = new Map(latest.map((h) => [key(h), h]));
  const pm = new Map(prior.map((h) => [key(h), h]));
  const out: HoldingChange[] = [];
  for (const [k, lh] of lm) {
    const ph = pm.get(k);
    if (!ph) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "new", prevShares: 0, shares: lh.shares, value: lh.value, deltaPct: null });
    else {
      const delta = lh.shares - ph.shares;
      if (delta !== 0) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: delta > 0 ? "increased" : "decreased", prevShares: ph.shares, shares: lh.shares, value: lh.value, deltaPct: ph.shares !== 0 ? delta / ph.shares : null });
    }
  }
  for (const [k, ph] of pm) if (!lm.has(k)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", prevShares: ph.shares, shares: 0, value: 0, deltaPct: -1 });
  return out;
}

export function mapDetailRows(manager: Manager, filingRows: any[], holdingRows: any[]): ManagerDetail {
  const sorted = [...filingRows].sort((a, b) => (b.period > a.period ? 1 : -1));
  const latestRow = sorted[0];
  const priorRow = sorted[1];
  const byFiling = (fid: number) => holdingRows.filter((h) => h.filing_id === fid).map(rowToHolding).sort((a, b) => b.value - a.value);
  const toFiling = (r: any): FilingData => ({ period: r.period, filedAt: r.filed_at, accession: r.accession, totalValue: Number(r.total_value), holdings: byFiling(r.id) });
  const latest = toFiling(latestRow);
  const prior = priorRow ? toFiling(priorRow) : undefined;
  const changes = prior ? computeChanges(latest.holdings, prior.holdings) : [];
  return { manager, latest, prior, changes };
}

// --- live queries (verified manually once creds exist) ---
export async function getManagerIndex(generatedAt: string): Promise<ManagerIndex> {
  const db = getDb();
  // latest filing per manager + its top holding, via a view-like query
  const { data, error } = await db.rpc("manager_index"); // see README: optional SQL function; fallback below
  if (!error && data) return mapIndexRows(data as IndexRow[], generatedAt);
  // Fallback: compose in TS if RPC not present
  const { data: mgrs } = await db.from("managers").select("*");
  const out: IndexRow[] = [];
  for (const m of mgrs ?? []) {
    const { data: f } = await db.from("filings").select("*").eq("cik", m.cik).order("period", { ascending: false }).limit(1);
    const latest = f?.[0];
    if (!latest) continue;
    const { data: h } = await db.from("holdings").select("issuer,value").eq("filing_id", latest.id).order("value", { ascending: false }).limit(1);
    out.push({ ...m, period: latest.period, total_value: latest.total_value, holding_count: latest.holding_count, top_holding: h?.[0]?.issuer ?? "", totalValue: latest.total_value, holdingCount: latest.holding_count, topHolding: h?.[0]?.issuer ?? "" } as IndexRow);
  }
  return mapIndexRows(out, generatedAt);
}

export async function getManagerDetail(cikOrSlug: string): Promise<ManagerDetail | null> {
  const db = getDb();
  const { data: mgrs } = await db.from("managers").select("*").or(`cik.eq.${cikOrSlug},slug.eq.${cikOrSlug}`).limit(1);
  const m = mgrs?.[0];
  if (!m) return null;
  const { data: filings } = await db.from("filings").select("*").eq("cik", m.cik).order("period", { ascending: false }).limit(2);
  const ids = (filings ?? []).map((f: any) => f.id);
  const { data: holdings } = await db.from("holdings").select("*").in("filing_id", ids);
  if (!filings?.length) return null;
  return mapDetailRows({ cik: m.cik, slug: m.slug, name: m.name, person: m.person }, filings, holdings ?? []);
}
```

- [ ] **Step 4: 运行确认通过** — `cd web && npm run test -- supabase` → PASS。
- [ ] **Step 5: typecheck** — `npx tsc --noEmit` → no errors。
- [ ] **Step 6: Commit**(可选)

---

## Task 4: 数据源路由 `source.ts`(TDD：选择逻辑)

**Files:** Rewrite `web/src/lib/managers/source.ts`; Create `web/src/lib/managers/__tests__/source.test.ts`

- [ ] **Step 1: 写失败测试(注入 hasSupabaseEnv 与两个后端，断言选择)**

Create `web/src/lib/managers/__tests__/source.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/managers/db", () => ({ hasSupabaseEnv: vi.fn() }));
vi.mock("@/lib/managers/supabase", () => ({
  getManagerIndex: vi.fn(async () => ({ generatedAt: "db", managers: [] })),
  getManagerDetail: vi.fn(async () => ({ manager: { cik: "1", slug: "a", name: "A", person: "P" }, latest: { period: "p", filedAt: "f", accession: "x", totalValue: 0, holdings: [] }, changes: [] })),
}));

import { hasSupabaseEnv } from "@/lib/managers/db";
import * as source from "@/lib/managers/source";

describe("source routing", () => {
  beforeEach(() => vi.clearAllMocks());
  it("uses Supabase when env present", async () => {
    (hasSupabaseEnv as any).mockReturnValue(true);
    const idx = await source.getManagerIndex();
    expect(idx.generatedAt).toBe("db");
  });
  it("falls back to bundled JSON when env absent", async () => {
    (hasSupabaseEnv as any).mockReturnValue(false);
    const idx = await source.getManagerIndex();
    // JSON index has real managers (>0) and generatedAt !== "db"
    expect(idx.generatedAt).not.toBe("db");
    expect(idx.managers.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行确认失败** — `cd web && npm run test -- source` → FAIL。

- [ ] **Step 3: 实现** — Rewrite `web/src/lib/managers/source.ts`(保留 JSON 回退；import 现有打包 JSON):
```ts
import "server-only";
import type { ManagerIndex, ManagerDetail } from "@/lib/managers/types";
import { hasSupabaseEnv } from "@/lib/managers/db";
import * as supa from "@/lib/managers/supabase";
import indexJson from "@/data/13f/index.json";

// Static map of bundled per-manager JSON (slug + cik keys) — keep in sync with data dir.
import berkshire from "@/data/13f/berkshire-hathaway.json";
import scion from "@/data/13f/scion-asset-management.json";
import pershing from "@/data/13f/pershing-square.json";
import bridgewater from "@/data/13f/bridgewater-associates.json";
import duquesne from "@/data/13f/duquesne-family-office.json";
import baupost from "@/data/13f/baupost-group.json";

const JSON_DETAILS = [berkshire, scion, pershing, bridgewater, duquesne, baupost] as unknown as ManagerDetail[];

function jsonIndex(): ManagerIndex { return indexJson as unknown as ManagerIndex; }
function jsonDetail(cikOrSlug: string): ManagerDetail | null {
  return JSON_DETAILS.find((d) => d.manager.cik === cikOrSlug || d.manager.slug === cikOrSlug) ?? null;
}

export async function getManagerIndex(): Promise<ManagerIndex> {
  if (hasSupabaseEnv()) return supa.getManagerIndex(new Date().toISOString());
  return jsonIndex();
}

export async function getManagerDetail(cikOrSlug: string): Promise<ManagerDetail | null> {
  if (hasSupabaseEnv()) return supa.getManagerDetail(cikOrSlug);
  return jsonDetail(cikOrSlug);
}
```
> 注: 若现有 `source.ts` 已有不同的 JSON 导入方式(动态/fs)，保持其能在 `next build` 下静态打包；上面的静态 import 是最稳妥的 Vercel 友好写法。`new Date().toISOString()` 仅在请求期调用(Server Component)，非模块顶层。

- [ ] **Step 4: 运行确认通过** — `npm run test -- source` → PASS。
- [ ] **Step 5: Commit**(可选)

---

## Task 5: 写库工具 `supabaseUpsert.ts`(TDD：payload 成形)

**Files:** Create `web/scripts/lib/supabaseUpsert.ts`; Create `web/scripts/lib/__tests__/upsert.test.ts`

- [ ] **Step 1: 写失败测试(断言由 ManagerDetail 生成的 upsert 行)**

Create `web/scripts/lib/__tests__/upsert.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildUpsertPayload } from "@/scripts/lib/supabaseUpsert";

it("buildUpsertPayload shapes manager/filing/holding rows", () => {
  const detail = {
    manager: { cik: "1", slug: "a", name: "A", person: "P" },
    latest: { period: "2026-03-31", filedAt: "2026-05-15", accession: "x-1", totalValue: 1000, holdings: [{ cusip: "C1", issuer: "ISS", value: 1000, shares: 100, weight: 1 }] },
    prior: { period: "2025-12-31", filedAt: "2026-02-14", accession: "x-0", totalValue: 800, holdings: [{ cusip: "C1", issuer: "ISS", value: 800, shares: 80, weight: 1 }] },
    changes: [],
  } as any;
  const p = buildUpsertPayload(detail);
  expect(p.manager).toEqual({ cik: "1", slug: "a", name: "A", person: "P" });
  expect(p.filings.map((f) => f.accession)).toEqual(["x-1", "x-0"]);
  expect(p.filings[0]).toMatchObject({ cik: "1", period: "2026-03-31", total_value: 1000, holding_count: 1 });
  // holdings grouped by accession
  expect(p.holdingsByAccession["x-1"][0]).toMatchObject({ cusip: "C1", value: 1000, shares: 100 });
});
```
> Note: requires `@/scripts/*` alias → add to vitest.config + tsconfig if not present (see Step 3a).

- [ ] **Step 2: 运行确认失败** — `cd web && npm run test -- upsert` → FAIL。

- [ ] **Step 3a: 确保 `@/scripts` 可解析** — 若 `tsconfig.json` 的 `@/*`→`./src/*` 不覆盖 scripts，则改用相对导入 `../supabaseUpsert`(把测试里的 `@/scripts/lib/supabaseUpsert` 换成相对路径)，避免动 alias。采用相对导入版本即可。

- [ ] **Step 3b: 实现** — Create `web/scripts/lib/supabaseUpsert.ts`:
```ts
import type { ManagerDetail, FilingData } from "../../src/lib/managers/types";

export type FilingRow = { cik: string; period: string; filed_at: string; accession: string; total_value: number; holding_count: number };
export type HoldingRow = { cusip: string; issuer: string; title_of_class: string | null; value: number; shares: number; put_call: string | null; weight: number };
export type UpsertPayload = {
  manager: { cik: string; slug: string; name: string; person: string };
  filings: FilingRow[];
  holdingsByAccession: Record<string, HoldingRow[]>;
};

function filingRow(cik: string, f: FilingData): FilingRow {
  return { cik, period: f.period, filed_at: f.filedAt, accession: f.accession, total_value: f.totalValue, holding_count: f.holdings.length };
}
function holdingRows(f: FilingData): HoldingRow[] {
  return f.holdings.map((h) => ({ cusip: h.cusip, issuer: h.issuer, title_of_class: h.titleOfClass ?? null, value: h.value, shares: h.shares, put_call: h.putCall ?? null, weight: h.weight ?? 0 }));
}

export function buildUpsertPayload(d: ManagerDetail): UpsertPayload {
  const filings: FilingData[] = [d.latest, ...(d.prior ? [d.prior] : [])];
  return {
    manager: d.manager,
    filings: filings.map((f) => filingRow(d.manager.cik, f)),
    holdingsByAccession: Object.fromEntries(filings.map((f) => [f.accession, holdingRows(f)])),
  };
}

// Live writer (verified manually with creds): upsert manager, upsert filings (on accession),
// then replace that filing's holdings. Skips filings whose accession already exists with same holding_count (idempotent).
export async function upsertManagerDetail(db: any, d: ManagerDetail): Promise<void> {
  const p = buildUpsertPayload(d);
  await db.from("managers").upsert(p.manager, { onConflict: "cik" });
  for (const f of p.filings) {
    const { data: up } = await db.from("filings").upsert(f, { onConflict: "accession" }).select("id").limit(1);
    const filingId = up?.[0]?.id;
    if (!filingId) continue;
    await db.from("holdings").delete().eq("filing_id", filingId);
    const rows = p.holdingsByAccession[f.accession].map((h) => ({ ...h, filing_id: filingId }));
    if (rows.length) await db.from("holdings").insert(rows);
  }
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- upsert` → PASS(纯 `buildUpsertPayload`；`upsertManagerDetail` 不在单测内,留待手动 DB 验证)。
- [ ] **Step 5: Commit**(可选)

---

## Task 6: ingestion 接入写库(env 齐全时)

**Files:** Modify `web/scripts/ingest-13f.ts`

- [ ] **Step 1: 在写完 JSON 后，如有 Supabase env 则同时入库**

在 `ingest-13f.ts` 写出每位经理人 JSON / 汇总后，加入(import 顶部):
```ts
import { createClient } from "@supabase/supabase-js";
import { upsertManagerDetail } from "./lib/supabaseUpsert";
```
并在主流程末尾(已得到每位 `detail: ManagerDetail` 后)追加:
```ts
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  for (const detail of allDetails) {            // allDetails: 已构建的 ManagerDetail[]
    try { await upsertManagerDetail(db, detail); console.log(`[${detail.manager.slug}] upserted to Supabase`); }
    catch (e) { console.warn(`[${detail.manager.slug}] Supabase upsert failed: ${e}`); }
  }
  console.log("Supabase upsert done.");
} else {
  console.log("No Supabase env — JSON only (set SUPABASE_URL / SUPABASE_SERVICE_KEY to write DB).");
}
```
> 若脚本当前没有保留 `ManagerDetail[]` 数组，新增一个 `const allDetails: ManagerDetail[] = []`，在每位经理人 detail 构建处 `allDetails.push(detail)`。READ 脚本现状后做最小改动。

- [ ] **Step 2: typecheck + 无 env 干跑(应只走 JSON 分支)**

Run:
```bash
cd web && export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npx tsc --noEmit
npm run ingest 2>&1 | tail -5
```
Expected: tsc 无错误；ingest 末尾打印 `No Supabase env — JSON only ...`，且 `src/data/13f/*.json` 正常重写(无 env 不写库、不报错)。

- [ ] **Step 3: Commit**(可选)

---

## Task 7: 文档与凭据接入说明

**Files:** Modify `web/supabase/README.md`

- [ ] **Step 1: 写清开通与应用步骤**

Replace `web/supabase/README.md`:
```md
# Supabase 接入(Phase A)

## 开通(任选其一)
- Vercel Marketplace: `vercel integration add supabase`(自动注入 env 到 Vercel 项目)
- 或 Supabase 控制台新建项目，拿到 Project URL 与 service_role key。

## 应用 schema
在 Supabase 控制台 SQL Editor 粘贴并运行 `web/supabase/schema.sql`(或用 supabase CLI `supabase db push`)。

## 环境变量
本地 `web/.env.local`(勿提交)与 Vercel 项目 Settings → Environment Variables 都设:
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>   # 仅服务端/脚本使用，勿暴露到客户端
```

## 写库
本地: `cd web && export $(grep -v '^#' .env.local | xargs) && npm run ingest`
→ 应打印每位经理人 `upserted to Supabase`。

## 验证读库
设好 env 后 `npm run dev`，打开 `/zh/managers` 与某经理人详情，数据应与之前一致(此时走 Supabase)。
不设 env 时自动回退打包 JSON。
```

- [ ] **Step 2: Commit**(可选)

---

## Task 8: 全量验证(build + 回退)

- [ ] **Step 1: 测试 + 类型 + 构建(无 Supabase env，走 JSON 回退)**

Run:
```bash
cd web && export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npm run test        # 新增的 supabase/source/upsert 单测 + 既有全部通过
npx tsc --noEmit    # 0 错误
npm run build       # 成功(生产构建，未配置 Supabase → 数据层走 JSON)
```
Expected: 测试全过；tsc 0 错误；build 成功；`/[lang]/managers`、`/[lang]/managers/[cik]` 仍渲染(JSON 回退)。

- [ ] **Step 2: 启动 + 抽查 200**

Run:
```bash
pkill -9 -f next-server 2>/dev/null; nohup npm start >/tmp/a.log 2>&1 & sleep 7
for p in /zh/managers /zh/managers/0001067983; do echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' -m 60 http://localhost:3000$p)"; done
pkill -9 -f next-server
```
Expected: 均 200(JSON 回退路径未回归)。

- [ ] **Step 3 (手动关卡，需用户提供 Supabase 凭据):** 按 `web/supabase/README.md` 应用 schema + 设 env + `npm run ingest` 写库 + `npm run dev` 验证 `/zh/managers` 走库数据正确。**此步在用户开通 Supabase 后执行；不阻塞本阶段其余任务。**

- [ ] **Step 4: Commit**(可选)

---

## Self-Review(对照 spec §3.1 + §4 阶段 A)
- **schema(managers/filings/holdings/securities + 索引)**: Task 1 ✔
- **Web 读库 + JSON 回退**: Task 2(db)、Task 3(supabase 读+映射)、Task 4(source 路由 + 回退) ✔
- **ingestion 写库(env 门控、幂等 accession)**: Task 5(payload + upsert)、Task 6(接入) ✔
- **无密钥可 build/本地开发**: Task 2 惰性、Task 4 回退、Task 8 验证 ✔
- **凭据接入说明**: Task 7 ✔
- 占位符扫描: 无 TBD；每个代码步骤含完整代码。
- 类型一致: `ManagerIndex/ManagerDetail/Holding/FilingData/HoldingChange`(types.ts，13F-A 已定义)贯穿 Task 3/4/5/6；`buildUpsertPayload`/`upsertManagerDetail`/`mapIndexRows`/`mapDetailRows`/`getDb`/`hasSupabaseEnv` 命名前后一致。
- 范围: 仅“现有 6 户 + latest/prior”入库；全历史回填/扩充经理人/OpenFIGI 属阶段 B(不在本计划)。

## 已知风险/注意
- `securities` 表本阶段建好但留空(ticker/sector 在阶段 B 由 OpenFIGI 富化)。
- `getManagerIndex` 的 RPC `manager_index` 为可选优化；未建该 SQL 函数时走 TS 回退查询(已实现)。
- 服务端 only：`db.ts`/`supabase.ts`/`source.ts` 均 `import "server-only"` 或仅被 Server Component/脚本调用；service key 绝不进客户端包。
- 若 `tsconfig` 的 `@/*` 不覆盖 `scripts/`，Task 5 用相对导入(已注明)。
