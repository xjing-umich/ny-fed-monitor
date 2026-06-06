# Phase 1B — 扩经理人 + 共识物化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 13F 经理人从 6 户扩到 32 户(价值投资导向，每户仍 latest+prior)，并把「最多人持有 / 异动」从请求时全表扫(`aggregations.ts` 的 `scanAllManagers`)改为**ticker-keyed 物化快照表**(`consensus_holdings` / `consensus_moves`)，页面直接读表。

**Architecture:** 经理人改由 `web/config/managers.json` 驱动(替代 `ingest-13f.ts` 里硬编码的 `SEED_MANAGERS`)。摄取后(已有的 DB upsert + Task 1A 的 CUSIP 富化)新增一步「共识计算」：扫所有经理人的 latest(+prior) 持仓，经 `security_cusips` 把 cusip 聚合到 ticker，写两张快照表。Web 的 `aggregations.ts` 改为：有 Supabase env → 读快照表；否则 → 现有 `scanAllManagers`(JSON 回退，cusip-keyed)。计算逻辑做成纯函数单测 + 写库器(手动验证关卡)。

**Tech Stack:** Next.js 16 / TypeScript、`@supabase/supabase-js`、Supabase Postgres(线上已有 managers/filings/holdings + securities/security_cusips)、vitest(纯逻辑)、tsx。

**参考:** spec `docs/superpowers/specs/2026-06-06-data-layer-architecture-design.md`(§4.2 共识物化)；上一阶段 `2026-06-06-phase1a-securities-spine.md`(脊梁已完成，`security_cusips` 可用)。

> **用户偏好:** 主验收 = `npm run build` 通过；测试精简(只测纯逻辑)；真实 DB / SEC / 外部 API 为手动验证关卡。
> **范围决策(2026-06-06 与用户确认):** 只保 latest+prior(不在本阶段回填多季历史)；经理人名单为价值投资导向(见 Task 1)；Bridgewater(Dalio) 移除；Gotham(Greenblatt) 因 CIK 未能干净解析暂不纳入。
> **不碰:** AI 叙述竖切(归另一 session 的工作树)；估值层。

---

## 环境/约定
- App root: `/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web`。`@/*`→`web/src/*`。
- Node 20: 命令前置 `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`。
- Supabase 凭据在**仓库根** `.env.local`(脚本读 `../.env.local`)。
- 无 Postgres 连接串 → **建表 DDL 需用户在 Supabase SQL Editor 手动跑**；建新表后若 PostgREST 报 "not in schema cache"，跑 `NOTIFY pgrst, 'reload schema';`。
- 当前分支：从 `db-foundation` 切出新分支 `phase1b-managers-consensus`。

## 文件结构
```
web/config/managers.json                     32 户经理人配置(cik/slug/person)            [新建]
web/scripts/ingest-13f.ts                    读 config 替代硬编码 SEED_MANAGERS           [改]
web/supabase/schema.sql                      新增 consensus_holdings / consensus_moves    [改]
web/src/lib/consensus/compute.ts             纯聚合: holdings+cusipMap → 快照行            [新建]
web/src/lib/consensus/compute.test.ts        vitest: 聚合逻辑                             [新建]
web/scripts/lib/computeConsensus.ts          写库器: 扫库→compute→upsert 两表             [新建]
web/scripts/consensus.ts                     可执行入口(读 ../.env.local)                 [新建]
web/scripts/ingest-13f.ts                    摄取末尾追加共识计算                          [改]
web/src/lib/managers/consensusRead.ts        读快照表(env 门控) + 纯映射                  [新建]
web/src/lib/managers/consensusRead.test.ts   vitest: 行→类型映射                          [新建]
web/src/lib/aggregations.ts                  mostHeld/notableMoves 改读表, 否则回退扫描   [改]
web/package.json                             新增 "consensus" 脚本                         [改]
```

---

## Task 1: 经理人配置 + ingest 读配置

**Files:** Create `web/config/managers.json`; Modify `web/scripts/ingest-13f.ts`.

- [ ] **Step 1: 写 `web/config/managers.json`**
```json
[
  { "cik": "0001067983", "slug": "berkshire-hathaway", "person": "Warren Buffett" },
  { "cik": "0001649339", "slug": "scion-asset-management", "person": "Michael Burry" },
  { "cik": "0001336528", "slug": "pershing-square", "person": "Bill Ackman" },
  { "cik": "0001061768", "slug": "baupost-group", "person": "Seth Klarman" },
  { "cik": "0001536411", "slug": "duquesne-family-office", "person": "Stanley Druckenmiller" },
  { "cik": "0000783412", "slug": "daily-journal", "person": "Charlie Munger" },
  { "cik": "0001569205", "slug": "fundsmith", "person": "Terry Smith" },
  { "cik": "0001112520", "slug": "akre-capital", "person": "Chuck Akre" },
  { "cik": "0001096343", "slug": "markel", "person": "Thomas Gayner" },
  { "cik": "0001549575", "slug": "pabrai-funds", "person": "Mohnish Pabrai" },
  { "cik": "0001709323", "slug": "himalaya-capital", "person": "Li Lu" },
  { "cik": "0001404599", "slug": "aquamarine", "person": "Guy Spier" },
  { "cik": "0001697868", "slug": "valley-forge-capital", "person": "Dev Kantesaria" },
  { "cik": "0001641864", "slug": "giverny-capital", "person": "François Rochon" },
  { "cik": "0001034524", "slug": "polen-capital", "person": "Polen Capital" },
  { "cik": "0000883965", "slug": "weitz-investment", "person": "Wallace Weitz" },
  { "cik": "0001115373", "slug": "semper-augustus", "person": "Chris Bloomstran" },
  { "cik": "0001553733", "slug": "brave-warrior", "person": "Glenn Greenberg" },
  { "cik": "0001056831", "slug": "fairholme", "person": "Bruce Berkowitz" },
  { "cik": "0000905567", "slug": "yacktman", "person": "Donald Yacktman" },
  { "cik": "0000813917", "slug": "harris-associates", "person": "Bill Nygren" },
  { "cik": "0000200217", "slug": "dodge-and-cox", "person": "Dodge & Cox" },
  { "cik": "0000728014", "slug": "ruane-cunniff", "person": "Ruane, Cunniff (Sequoia)" },
  { "cik": "0000732905", "slug": "tweedy-browne", "person": "Tweedy, Browne" },
  { "cik": "0001079114", "slug": "greenlight-capital", "person": "David Einhorn" },
  { "cik": "0001040273", "slug": "third-point", "person": "Daniel Loeb" },
  { "cik": "0001656456", "slug": "appaloosa", "person": "David Tepper" },
  { "cik": "0000921669", "slug": "icahn-capital", "person": "Carl Icahn" },
  { "cik": "0001647251", "slug": "tci-fund", "person": "Chris Hohn" },
  { "cik": "0000915191", "slug": "fairfax", "person": "Prem Watsa" },
  { "cik": "0000949509", "slug": "oaktree", "person": "Howard Marks" },
  { "cik": "0001166559", "slug": "gates-foundation-trust", "person": "Bill Gates" },
  { "cik": "0001671657", "slug": "dorsey-asset", "person": "Pat Dorsey" },
  { "cik": "0001759760", "slug": "hh-international", "person": "Duan Yongping" }
]
```

- [ ] **Step 2: ingest 读配置替代硬编码**

在 `web/scripts/ingest-13f.ts` 顶部 import 区(已有 `import * as fs from "fs"` / `path` / `fileURLToPath`)后，替换硬编码的 `const SEED_MANAGERS: Omit<Manager, "name">[] = [ ... ];` 为：
```ts
const SEED_MANAGERS: Omit<Manager, "name">[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../config/managers.json"), "utf8")
);
```
注意：`__dirname` 在文件中已定义(`path.dirname(fileURLToPath(import.meta.url))`)，确认该行在使用前。若 `__dirname` 定义在 `SEED_MANAGERS` 之后，把这段读取移到 `__dirname` 定义之后。

- [ ] **Step 3: 类型/构建校验(不实跑摄取)**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20 && node -e "const m=require('./config/managers.json'); if(!Array.isArray(m)||m.length!==34) throw new Error('expected 34, got '+m.length); console.log('managers.json OK:', m.length)"
```
Expected: 无类型错误；`managers.json OK: 34`。

- [ ] **Step 4: Commit**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/config/managers.json web/scripts/ingest-13f.ts && git commit -m "feat(13f): 经理人改由 config/managers.json 驱动(扩到 32 户价值投资名单)"
```

---

## Task 2: 运行摄取(手动验证关卡 — SEC + DB + 富化)

**Files:** none (运行已改的脚本)

- [ ] **Step 1: 跑 ingest(全量 32 户, latest+prior)**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npm run ingest 2>&1 | tail -40
```
Expected: 每户打印写入 JSON + upserted to Supabase；末尾 `Securities enrich: ...`；新增经理人的 holdings/securities 入库。个别户失败(无 13F-HR/解析异常)会 `FAILED` 跳过、不阻塞整批——记录哪些失败。

- [ ] **Step 2: 校验入库(手动)**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node --input-type=module -e '
import { createClient } from "@supabase/supabase-js"; import WebSocket from "ws"; import fs from "fs";
const env=fs.readFileSync("../.env.local","utf8"); const g=k=>{const m=env.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].trim().replace(/^["\x27]|["\x27]$/g,""):undefined;};
const db=createClient(g("SUPABASE_URL"),g("SUPABASE_SERVICE_KEY"),{auth:{persistSession:false},realtime:{transport:WebSocket}});
for(const t of ["managers","filings","holdings","securities","security_cusips"]){const{count}=await db.from(t).select("*",{count:"exact",head:true});console.log(t,count);}
process.exit(0);'
```
Expected: `managers` ≈ 32(减去失败户)；`filings` ≈ 2×managers；holdings/securities/security_cusips 显著增长。记录实际数值。

> 注: 此步同时把新经理人的 JSON 写入 `web/src/data/13f/*.json`，但 `source.ts` 的 JSON 回退是**静态 import 固定 6 个文件**——新户的 JSON 不会自动进回退集。本阶段不扩 JSON 回退(线上读 DB 即可)；如需本地无库也能看新户，后续再统一回退策略。**本阶段不把新 JSON 文件加入 git**(体积大且非真源)，仅依赖 DB。

- [ ] **Step 3: 还原本地 data 目录(避免提交大 JSON)**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git checkout -- web/src/data/13f/ && git status --short web/src/data/13f/
```
Expected: 无改动(新写入的 JSON 被还原/忽略，保持仓库里原 6 个文件不变)。

---

## Task 3: consensus 快照表 schema

**Files:** Modify `web/supabase/schema.sql`

- [ ] **Step 1: 追加两表到 schema.sql 末尾**
```sql
-- 共识物化快照(ticker-keyed): 替代请求时全表扫。每次摄取后整体重算。
create table if not exists consensus_holdings (
  ticker text primary key,
  issuer text,
  holder_count int not null default 0,
  total_value bigint not null default 0,
  computed_at timestamptz not null default now()
);
create index if not exists consensus_holdings_rank_idx
  on consensus_holdings (holder_count desc, total_value desc);

create table if not exists consensus_moves (
  ticker text not null,
  direction text not null,            -- 'bought' | 'sold'
  issuer text,
  manager_count int not null default 0,
  net_value bigint not null default 0,
  computed_at timestamptz not null default now(),
  primary key (ticker, direction)
);
create index if not exists consensus_moves_rank_idx
  on consensus_moves (direction, manager_count desc, net_value desc);
```

- [ ] **Step 2: 文本校验**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node -e "const s=require('fs').readFileSync('supabase/schema.sql','utf8'); if(!/consensus_holdings/.test(s)||!/consensus_moves/.test(s))process.exit(1); console.log('consensus tables present')"
```
Expected: `consensus tables present`

- [ ] **Step 3: 应用到线上库(手动验证关卡)**

在 Supabase SQL Editor 跑上面两段 `create table`/`create index`。若随后读报 schema cache，跑 `NOTIFY pgrst, 'reload schema';`。验证：
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node --input-type=module -e '
import { createClient } from "@supabase/supabase-js"; import WebSocket from "ws"; import fs from "fs";
const env=fs.readFileSync("../.env.local","utf8"); const g=k=>{const m=env.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].trim().replace(/^["\x27]|["\x27]$/g,""):undefined;};
const db=createClient(g("SUPABASE_URL"),g("SUPABASE_SERVICE_KEY"),{auth:{persistSession:false},realtime:{transport:WebSocket}});
for(const t of ["consensus_holdings","consensus_moves"]){const r=await db.from(t).select("ticker").limit(1);console.log(t, r.error?("ERR "+r.error.message):"OK");}
process.exit(0);'
```
Expected: 两表均 `OK`。

- [ ] **Step 4: Commit**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/supabase/schema.sql && git commit -m "feat(data): consensus_holdings / consensus_moves 快照表"
```

---

## Task 4: 共识计算纯逻辑 + 写库器

**Files:** Create `web/src/lib/consensus/compute.ts` (+test); Create `web/scripts/lib/computeConsensus.ts`.

- [ ] **Step 1: 写失败测试 `web/src/lib/consensus/compute.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { computeConsensus, type ScanInput } from "./compute";

const cusipToTicker = new Map<string, { ticker: string | null; name: string | null }>([
  ["C1", { ticker: "AAA", name: "Alpha Inc" }],
  ["C2", { ticker: "BBB", name: "Beta Inc" }],
  ["C3", { ticker: null, name: "Unmapped Co" }], // 未解析 → 用 cusip 兜底键
]);

const scan: ScanInput[] = [
  { slug: "m1", holdings: [{ cusip: "C1", issuer: "Alpha Inc", value: 100 }, { cusip: "C2", issuer: "Beta Inc", value: 50 }],
    changes: [{ cusip: "C1", issuer: "Alpha Inc", kind: "new", value: 100 }] },
  { slug: "m2", holdings: [{ cusip: "C1", issuer: "Alpha Inc", value: 200 }],
    changes: [{ cusip: "C1", issuer: "Alpha Inc", kind: "increased", value: 200 }, { cusip: "C2", issuer: "Beta Inc", kind: "exited", value: 0 }] },
];

describe("computeConsensus", () => {
  it("most-held 按 ticker 聚合持有人数与市值", () => {
    const { holdings } = computeConsensus(scan, cusipToTicker);
    const aaa = holdings.find((h) => h.ticker === "AAA");
    expect(aaa).toEqual({ ticker: "AAA", issuer: "Alpha Inc", holder_count: 2, total_value: 300 });
    const bbb = holdings.find((h) => h.ticker === "BBB");
    expect(bbb?.holder_count).toBe(1);
  });
  it("未解析 cusip 用 cusip 作兜底 ticker 键", () => {
    const scan2: ScanInput[] = [{ slug: "m", holdings: [{ cusip: "C3", issuer: "Unmapped Co", value: 10 }], changes: [] }];
    const { holdings } = computeConsensus(scan2, cusipToTicker);
    expect(holdings[0]).toEqual({ ticker: "C3", issuer: "Unmapped Co", holder_count: 1, total_value: 10 });
  });
  it("moves 按方向聚合: new/increased→bought, exited/decreased→sold", () => {
    const { moves } = computeConsensus(scan, cusipToTicker);
    const bought = moves.find((m) => m.ticker === "AAA" && m.direction === "bought");
    expect(bought).toEqual({ ticker: "AAA", direction: "bought", issuer: "Alpha Inc", manager_count: 2, net_value: 300 });
    const sold = moves.find((m) => m.ticker === "BBB" && m.direction === "sold");
    expect(sold?.manager_count).toBe(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/consensus/compute.test.ts
```
Expected: FAIL(`Cannot find module './compute'`).

- [ ] **Step 3: 写实现 `web/src/lib/consensus/compute.ts`**
```ts
// 共识计算纯逻辑(无 I/O): 把各经理人 latest 持仓/changes 聚合为 ticker-keyed 快照行。
// cusip → ticker 经传入的 map; 未解析 cusip 用 cusip 自身作兜底键(与个股页回退一致)。

export type ScanHolding = { cusip: string; issuer: string; value: number };
export type ScanChange = { cusip: string; issuer: string; kind: "new" | "exited" | "increased" | "decreased"; value: number };
export type ScanInput = { slug: string; holdings: ScanHolding[]; changes: ScanChange[] };
export type CusipInfo = { ticker: string | null; name: string | null };

export type ConsensusHoldingRow = { ticker: string; issuer: string; holder_count: number; total_value: number };
export type ConsensusMoveRow = { ticker: string; direction: "bought" | "sold"; issuer: string; manager_count: number; net_value: number };

function keyOf(cusip: string, map: Map<string, CusipInfo>): { ticker: string; name: string | null } {
  const info = map.get(cusip);
  return { ticker: info?.ticker ?? cusip, name: info?.name ?? null };
}

export function computeConsensus(
  scan: ScanInput[],
  cusipToTicker: Map<string, CusipInfo>
): { holdings: ConsensusHoldingRow[]; moves: ConsensusMoveRow[] } {
  const held = new Map<string, { issuer: string; holders: Set<string>; total: number }>();
  for (const m of scan) {
    for (const h of m.holdings) {
      const { ticker, name } = keyOf(h.cusip, cusipToTicker);
      const e = held.get(ticker) ?? { issuer: name ?? h.issuer, holders: new Set<string>(), total: 0 };
      e.holders.add(m.slug);
      e.total += h.value ?? 0;
      if (!e.issuer) e.issuer = name ?? h.issuer;
      held.set(ticker, e);
    }
  }
  const holdings: ConsensusHoldingRow[] = [...held.entries()]
    .map(([ticker, e]) => ({ ticker, issuer: e.issuer, holder_count: e.holders.size, total_value: e.total }))
    .sort((a, b) => b.holder_count - a.holder_count || b.total_value - a.total_value);

  const mv = new Map<string, { issuer: string; managers: Set<string>; net: number; direction: "bought" | "sold" }>();
  for (const m of scan) {
    for (const c of m.changes) {
      const direction: "bought" | "sold" | null =
        c.kind === "new" || c.kind === "increased" ? "bought" : c.kind === "exited" || c.kind === "decreased" ? "sold" : null;
      if (!direction) continue;
      const { ticker, name } = keyOf(c.cusip, cusipToTicker);
      const k = `${ticker}|${direction}`;
      const e = mv.get(k) ?? { issuer: name ?? c.issuer, managers: new Set<string>(), net: 0, direction };
      e.managers.add(m.slug);
      e.net += c.value ?? 0;
      mv.set(k, e);
    }
  }
  const moves: ConsensusMoveRow[] = [...mv.entries()]
    .map(([k, e]) => ({ ticker: k.split("|")[0], direction: e.direction, issuer: e.issuer, manager_count: e.managers.size, net_value: e.net }))
    .sort((a, b) => b.manager_count - a.manager_count || b.net_value - a.net_value);

  return { holdings, moves };
}
```

- [ ] **Step 4: 运行确认通过**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/consensus/compute.test.ts
```
Expected: PASS(3 用例)。

- [ ] **Step 5: 写库器 `web/scripts/lib/computeConsensus.ts`**
```ts
import { computeConsensus, type ScanInput, type CusipInfo } from "../../src/lib/consensus/compute";

/** 分页读全表为数组。 */
async function readAll(db: any, table: string, cols: string, filter?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} read: ${error.message}`);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

/** 计算 QoQ changes(与 supabase.ts 的口径一致: 按 cusip|put_call)。这里简化为按 cusip。 */
function diff(latest: any[], prior: any[]): ScanInput["changes"] {
  const lm = new Map(latest.map((h) => [h.cusip, h]));
  const pm = new Map(prior.map((h) => [h.cusip, h]));
  const out: ScanInput["changes"] = [];
  for (const [k, lh] of lm) {
    const ph = pm.get(k);
    if (!ph) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "new", value: Number(lh.value) });
    else if (Number(lh.shares) > Number(ph.shares)) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "increased", value: Number(lh.value) });
    else if (Number(lh.shares) < Number(ph.shares)) out.push({ cusip: lh.cusip, issuer: lh.issuer, kind: "decreased", value: Number(lh.value) });
  }
  for (const [k, ph] of pm) if (!lm.has(k)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", value: 0 });
  return out;
}

export async function computeAndStoreConsensus(db: any): Promise<{ holdings: number; moves: number }> {
  // 1) cusip → ticker map
  const cmap = new Map<string, CusipInfo>();
  for (const r of await readAll(db, "security_cusips", "cusip,ticker,issuer"))
    cmap.set(r.cusip, { ticker: r.ticker, name: r.issuer });

  // 2) 每个经理人的 latest(+prior) filing 及其 holdings
  const managers = await readAll(db, "managers", "cik,slug");
  const scan: ScanInput[] = [];
  for (const m of managers) {
    const filings = await readAll(db, "filings", "id,period", (q) => q.eq("cik", m.cik).order("period", { ascending: false }).limit(2));
    if (!filings.length) continue;
    const latestH = await readAll(db, "holdings", "cusip,issuer,value,shares", (q) => q.eq("filing_id", filings[0].id));
    const priorH = filings[1] ? await readAll(db, "holdings", "cusip,issuer,value,shares", (q) => q.eq("filing_id", filings[1].id)) : [];
    scan.push({
      slug: m.slug,
      holdings: latestH.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: Number(h.value) })),
      changes: diff(latestH, priorH),
    });
  }

  // 3) 计算 + 整体重算(先清后写, 保证移除的标的不残留)
  const { holdings, moves } = computeConsensus(scan, cmap);
  await db.from("consensus_holdings").delete().neq("ticker", "");
  await db.from("consensus_moves").delete().neq("ticker", "");
  // 分批写(避免单次过大)
  for (let i = 0; i < holdings.length; i += 500) {
    const { error } = await db.from("consensus_holdings").upsert(holdings.slice(i, i + 500), { onConflict: "ticker" });
    if (error) console.warn(`consensus_holdings upsert err: ${error.message}`);
  }
  for (let i = 0; i < moves.length; i += 500) {
    const { error } = await db.from("consensus_moves").upsert(moves.slice(i, i + 500), { onConflict: "ticker,direction" });
    if (error) console.warn(`consensus_moves upsert err: ${error.message}`);
  }
  return { holdings: holdings.length, moves: moves.length };
}
```

- [ ] **Step 6: 入口 `web/scripts/consensus.ts`**
```ts
/** 共识物化入口: 读仓库根 .env.local, 扫库重算 consensus_*。用法: npm run consensus */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { computeAndStoreConsensus } from "./lib/computeConsensus.js";

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
  const stats = await computeAndStoreConsensus(db);
  console.log(`共识完成: holdings ${stats.holdings} 行, moves ${stats.moves} 行`);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
```

- [ ] **Step 7: package.json 加脚本**

在 `"enrich": ...` 行下加：
```json
    "consensus": "tsx scripts/consensus.ts",
```

- [ ] **Step 8: 编译校验(不实跑)**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/consensus/compute.test.ts && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```
Expected: 测试 PASS；无类型错误。

- [ ] **Step 9: Commit**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/src/lib/consensus web/scripts/lib/computeConsensus.ts web/scripts/consensus.ts web/package.json && git commit -m "feat(consensus): 共识计算纯逻辑 + 写库器 + 入口脚本"
```

---

## Task 5: 运行共识计算(手动验证关卡)

- [ ] **Step 1: 跑 consensus**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npm run consensus 2>&1 | tail -10
```
Expected: `共识完成: holdings N 行, moves M 行`(N 为去重 ticker 数)。

- [ ] **Step 2: 抽查**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node --input-type=module -e '
import { createClient } from "@supabase/supabase-js"; import WebSocket from "ws"; import fs from "fs";
const env=fs.readFileSync("../.env.local","utf8"); const g=k=>{const m=env.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].trim().replace(/^["\x27]|["\x27]$/g,""):undefined;};
const db=createClient(g("SUPABASE_URL"),g("SUPABASE_SERVICE_KEY"),{auth:{persistSession:false},realtime:{transport:WebSocket}});
const {data:top}=await db.from("consensus_holdings").select("ticker,issuer,holder_count,total_value").order("holder_count",{ascending:false}).limit(8);
console.log("Top held:", JSON.stringify(top,null,1));
process.exit(0);'
```
Expected: 头部是被最多经理人持有的标的(如 AAPL/MSFT/GOOGL 等)，`holder_count` 合理(>1)。

---

## Task 6: aggregations 读快照表(env 门控, 否则回退扫描)

**Files:** Create `web/src/lib/managers/consensusRead.ts` (+test); Modify `web/src/lib/aggregations.ts`.

- [ ] **Step 1: 写失败测试 `web/src/lib/managers/consensusRead.test.ts`**
```ts
import { describe, it, expect } from "vitest";
import { mapHeldRows, mapMoveRows } from "./consensusRead";

describe("consensusRead mappers", () => {
  it("held 行→HeldRow(ticker 作 key)", () => {
    expect(mapHeldRows([{ ticker: "AAPL", issuer: "APPLE INC", holder_count: 5, total_value: 999 }])).toEqual([
      { cusip: "AAPL", issuer: "APPLE INC", holderCount: 5, totalValue: 999 },
    ]);
  });
  it("move 行→按方向拆 mostBought/mostSold", () => {
    const { mostBought, mostSold } = mapMoveRows([
      { ticker: "AAPL", direction: "bought", issuer: "APPLE INC", manager_count: 3, net_value: 100 },
      { ticker: "XOM", direction: "sold", issuer: "EXXON", manager_count: 2, net_value: 50 },
    ]);
    expect(mostBought).toEqual([{ cusip: "AAPL", issuer: "APPLE INC", count: 3, value: 100 }]);
    expect(mostSold).toEqual([{ cusip: "XOM", issuer: "EXXON", count: 2, value: 50 }]);
  });
});
```
> 说明: 为最小改动，沿用现有 `HeldRow`/`MoveRow` 的字段名(`cusip`/`count`/`value`)，把 `cusip` 字段填入 ticker —— 页面链接用 `stockPath(lang, row.cusip)`，传 ticker 即得 ticker URL(与 Task 1A 个股页一致)。

- [ ] **Step 2: 运行确认失败**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run src/lib/managers/consensusRead.test.ts
```
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 写实现 `web/src/lib/managers/consensusRead.ts`**
```ts
import "server-only";
import { cache } from "react";
import { hasSupabaseEnv, getDb } from "@/lib/managers/db";
import type { HeldRow, MoveRow, NotableMoves } from "@/lib/aggregations";

type HeldDbRow = { ticker: string; issuer: string; holder_count: number; total_value: number };
type MoveDbRow = { ticker: string; direction: string; issuer: string; manager_count: number; net_value: number };

/** 纯映射(单测): consensus_holdings 行 → HeldRow(cusip 字段填 ticker)。 */
export function mapHeldRows(rows: HeldDbRow[]): HeldRow[] {
  return rows.map((r) => ({ cusip: r.ticker, issuer: r.issuer, holderCount: r.holder_count, totalValue: Number(r.total_value) }));
}
/** 纯映射(单测): consensus_moves 行 → {mostBought, mostSold}。 */
export function mapMoveRows(rows: MoveDbRow[]): NotableMoves {
  const toRow = (r: MoveDbRow): MoveRow => ({ cusip: r.ticker, issuer: r.issuer, count: r.manager_count, value: Number(r.net_value) });
  return {
    mostBought: rows.filter((r) => r.direction === "bought").map(toRow),
    mostSold: rows.filter((r) => r.direction === "sold").map(toRow),
  };
}

/** 读 most-held 快照(已按 holder_count 排序)。无 env → null(调用方回退扫描)。 */
export const readConsensusHeld = cache(async (limit: number): Promise<HeldRow[] | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("consensus_holdings").select("ticker,issuer,holder_count,total_value")
    .order("holder_count", { ascending: false }).order("total_value", { ascending: false }).limit(limit);
  if (error) { console.error(`readConsensusHeld 失败: ${error.message}`); return null; }
  return mapHeldRows((data ?? []) as HeldDbRow[]);
});

/** 读 notable-moves 快照。无 env → null。 */
export const readConsensusMoves = cache(async (limit: number): Promise<NotableMoves | null> => {
  if (!hasSupabaseEnv()) return null;
  const { data, error } = await getDb()
    .from("consensus_moves").select("ticker,direction,issuer,manager_count,net_value")
    .order("manager_count", { ascending: false }).order("net_value", { ascending: false });
  if (error) { console.error(`readConsensusMoves 失败: ${error.message}`); return null; }
  const all = mapMoveRows((data ?? []) as MoveDbRow[]);
  return { mostBought: all.mostBought.slice(0, limit), mostSold: all.mostSold.slice(0, limit) };
});
```

- [ ] **Step 4: 改 `web/src/lib/aggregations.ts` 的 `mostHeld`/`notableMoves` 优先读表**

把文件末尾：
```ts
export async function mostHeld(limit = 40): Promise<HeldRow[]> {
  return computeMostHeld(await scanAllManagers(), limit);
}
export async function notableMoves(limit = 6): Promise<NotableMoves> {
  return computeNotableMoves(await scanAllManagers(), limit);
}
```
替换为：
```ts
export async function mostHeld(limit = 40): Promise<HeldRow[]> {
  const { readConsensusHeld } = await import("@/lib/managers/consensusRead");
  const fromDb = await readConsensusHeld(limit);
  if (fromDb && fromDb.length) return fromDb;
  return computeMostHeld(await scanAllManagers(), limit); // 回退: 无库/空表时请求时计算
}
export async function notableMoves(limit = 6): Promise<NotableMoves> {
  const { readConsensusMoves } = await import("@/lib/managers/consensusRead");
  const fromDb = await readConsensusMoves(limit);
  if (fromDb && (fromDb.mostBought.length || fromDb.mostSold.length)) return fromDb;
  return computeNotableMoves(await scanAllManagers(), limit);
}
```
> 用动态 `import()` 避免 `aggregations.ts`(被多处 import)在无 server-only 环境下静态拉入 `consensusRead`；且打破 `consensusRead` ↔ `aggregations` 的类型循环引用(consensusRead 仅 import type)。

- [ ] **Step 5: 运行测试 + 构建(主验收)**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run && npm run build 2>&1 | grep -E "Compiled successfully|Failed to compile|error" | head
```
Expected: 全部测试 PASS；`Compiled successfully`。

- [ ] **Step 6: 手动验证关卡(连库本地，可选)**

`cp ../.env.local .env.local && npm run dev`，访问 `/zh/stocks`(最多机构持有列表，应是 32 户聚合后的结果、链接走 ticker)；验证后 `rm .env.local`，并 `rm -rf .next` 若改路由(本任务未改路由，通常无需)。

- [ ] **Step 7: Commit**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/src/lib/managers/consensusRead.ts web/src/lib/managers/consensusRead.test.ts web/src/lib/aggregations.ts && git commit -m "feat(consensus): mostHeld/notableMoves 优先读快照表, 无库回退请求时扫描"
```

---

## Task 7: 摄取后自动算共识 + 收尾

**Files:** Modify `web/scripts/ingest-13f.ts`.

- [ ] **Step 1: ingest 末尾(富化之后)追加共识计算**

顶部 import 加：
```ts
import { computeAndStoreConsensus } from "./lib/computeConsensus.js";
```
在 Task 1A 加的 `Securities enrich: ...` 那段 try/catch **之后**(仍在 `if (sbUrl && sbKey)` 块内)插入：
```ts
    try {
      const c = await computeAndStoreConsensus(db);
      console.log(`Consensus: holdings ${c.holdings} 行, moves ${c.moves} 行`);
    } catch (e) {
      console.warn(`Consensus 计算失败 (非致命): ${e instanceof Error ? e.message : e}`);
    }
```

- [ ] **Step 2: 全量测试 + 构建(收尾验收)**
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx vitest run && npm run build 2>&1 | grep -E "Compiled successfully|Failed to compile" | head
```
Expected: 测试全 PASS；`Compiled successfully`。

- [ ] **Step 3: Commit**
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor && git add web/scripts/ingest-13f.ts && git commit -m "feat(13f): 摄取后自动重算共识快照"
```

---

## 后续(本计划之外)
- 多季历史回填(趋势图前提) + JSON 回退策略统一(新户本地可见)。
- 1C 日更价格 / 1D 宏观双路径收敛 / 1E 统一 provenance / Phase 2 财报 / Phase 3 估值。
- Bridgewater(Dalio) 旧数据从库中清理(本阶段未删，仅不再摄取)。

## Self-Review 检查
- **Spec 覆盖**: §4.2 consensus_holdings/consensus_moves(Task 3)、摄取后预算(Task 5/7)、页面改读表(Task 6)。扩经理人(Task 1-2)。
- **类型一致**: `ScanInput`/`CusipInfo`/`ConsensusHoldingRow`/`ConsensusMoveRow`(compute.ts)贯穿 Task 4；`HeldRow`/`MoveRow`/`NotableMoves` 复用 `aggregations.ts` 既有导出(Task 6 import type)。`readConsensusHeld`/`readConsensusMoves` 在 Task 6 定义并由 aggregations 动态 import。
- **回退一致**: 无 Supabase env → consensusRead 返回 null → aggregations 回退 `scanAllManagers`(现有 JSON 行为)；个股页/列表页对未解析 ticker 用 cusip 兜底(与 Task 1A 一致)。
- **DB/外部验证**: 建表(Task 3 Step 3)、跑 ingest(Task 2)、跑 consensus(Task 5)、连库本地(Task 6 Step 6)均为手动关卡；纯逻辑走 vitest；主验收 `npm run build`。
- **数据准确性**: consensusRead 读失败记录并回退(不静默); 计算器整体先清后写避免残留。
