# Entity Alias Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build one unified alias resolution layer so any reasonable alias for an investor or stock (person name, successor, ticker, CUSIP, Chinese name, former name) 308-redirects to its single canonical page, and exposes those aliases to search/AI via structured data.

**Architecture:** A namespaced `aliasIndex: Record<EntityType, Map<normalizedAlias, {canonicalSlug, confidence}>>`, built at request/build time by merging **curated** sources (`config/managers.json` new fields + existing `INVESTOR_ALIASES`) with **derived** sources (securities spine `getCusipMap` for stocks; EDGAR `formerNames` for investors). `resolveEntity(type, rawSlug)` is a pure Map lookup after `normalize()`. Three consumers read it: (1) page-level `permanentRedirect` before `notFound()`, (2) `alternateName` in JSON-LD, (3) holdings-table issuer→canonical-ticker links. Only `confidence: "high"` triggers redirects; `loose` (none in v1) is reserved for a future Wikidata producer.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript 5 (strict), Supabase (with static-JSON fallback), `next/navigation` `permanentRedirect`, `react`'s `cache()`. Solo-dev convention: **no test suite** — verify each task with `npx tsc --noEmit` (run from `web/`) plus manual page/URL checks; commit after each task.

**Worktree:** `.claude/worktrees/entity-alias` (branch `feat/entity-alias-resolution`). All commands run from the `web/` subdirectory of that worktree.

---

## File Structure

**New files (all under `web/`):**
- `src/lib/aliases/normalize.ts` — `normalize()`, pure, no `server-only`.
- `src/lib/aliases/types.ts` — `EntityType`, `AliasTarget`, `AliasEntry`, `BuiltIndex`. Pure types.
- `src/lib/aliases/config.ts` — curated investor alias entries from `config/managers.json` + `INVESTOR_ALIASES` + `former-names.json`. No `server-only` (only static imports).
- `src/lib/aliases/resolve.ts` — `buildFromEntries()` (pure), cached `resolveEntity()` and `getEntityAliases()`. Has `server-only` (imports `getCusipMap`).
- `src/data/13f/former-names.json` — derived artifact `Record<slug, string[]>`, emitted by ingest. Seeded as `{}`.
- `supabase/migrations/20260609_add_former_names_to_managers.sql` — additive `former_names` column.

**Modified files:**
- `config/managers.json` — add optional `people[]` / `aliases[]` curated fields (Berkshire fully worked).
- `src/app/[lang]/investors/[slug]/page.tsx` — redirect (Task 4), alternateName (Task 7), holdings link (Task 9).
- `src/app/[lang]/stocks/[ticker]/page.tsx` — redirect (Task 5), alternateName (Task 8).
- `scripts/ingest-13f.ts` — capture `formerNames`, emit `former-names.json`, write DB column (Task 6).
- `scripts/lib/supabaseUpsert.ts` — add `former_names` to manager upsert payload (Task 6).

**Phasing (per spec §5, sequenced so consumer ① ships first):**
- **Phase A — Core** (Tasks 1–3): resolution layer + curated data. No user-visible change yet.
- **Phase B — Consumer ① redirects** (Tasks 4–5): shippable on its own.
- **Phase C — EDGAR formerNames** (Task 6): enriches investor aliases via ingest.
- **Phase D — Consumer ② structured data** (Tasks 7–8).
- **Phase E — Consumer ③ internal links** (Task 9).

---

## Task 1: Normalize + alias types

**Files:**
- Create: `web/src/lib/aliases/normalize.ts`
- Create: `web/src/lib/aliases/types.ts`

- [ ] **Step 1: Write `normalize.ts`**

```typescript
// web/src/lib/aliases/normalize.ts
// 别名归一化:查询侧与存储侧共用,保证两端对齐(spec §3.2)。
// trim → 小写 → 去掉所有非「字母/数字」字符(标点、空格、点、斜杠)。
// 中日韩文字属于 \p{L}(字母),原样保留,不拆分、不转拼音(v1)。
//   "BRK.B"        → "brkb"
//   "BRK/B"        → "brkb"
//   "Warren Buffett" → "warrenbuffett"
//   "苹果公司"      → "苹果公司"
export function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}
```

- [ ] **Step 2: Write `types.ts`**

```typescript
// web/src/lib/aliases/types.ts
// 统一实体别名解析层的类型(spec §3.1)。

// URL 的 section 天然隔离命名空间:/investors/* 只查 investor,/stocks/* 只查 stock,
// 互不冲突(如 "brk" 在两侧各自命中)。预留 "macro"。
export type EntityType = "investor" | "stock";

// confidence: "high" 才触发 301/308 重定向;"loose" 只进结构化数据(v1 无 loose 来源,
// 这是接 Wikidata 时的安全闸,见 spec §3.3)。
export type AliasTarget = { canonicalSlug: string; confidence: "high" | "loose" };

// 构建期的中间三元组:alias=可命中的别名原文(未归一化);display=结构化数据展示用的
// 别名(空串表示该条不进 alternateName,如 slug 自指);canonical=目标 canonical slug。
export type AliasEntry = { alias: string; display: string; canonical: string };

// 构建产物:resolve 用于重定向(归一化别名 → canonical,已去歧义);
// display 用于结构化数据(canonical → 该实体所有展示别名)。
export type BuiltIndex = {
  resolve: Map<string, string>;
  display: Map<string, string[]>;
};
```

- [ ] **Step 3: Verify types compile**

Run: `cd web && npx tsc --noEmit`
Expected: PASS (no errors). These files are not yet imported anywhere; tsc just confirms they're valid.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/aliases/normalize.ts web/src/lib/aliases/types.ts
git commit -m "feat(aliases): normalize() + alias layer types"
```

---

## Task 2: Curated investor alias config

This task adds the curated data home (`config/managers.json` new fields), the typed loader that merges curated sources, and seeds the (initially empty) `former-names.json` artifact so the loader's import always resolves.

**Files:**
- Modify: `web/config/managers.json` (add `people`/`aliases` to Berkshire — the spec §4.1 worked example)
- Create: `web/src/data/13f/former-names.json`
- Create: `web/src/lib/aliases/config.ts`

- [ ] **Step 1: Add curated fields to the Berkshire entry in `config/managers.json`**

The file is a JSON array of `{cik, slug, person}`. Edit ONLY the Berkshire entry (first element) to add `people` and `aliases`. The ingest script parses this file as `Omit<Manager,"name">[]` via `JSON.parse` — extra fields are ignored at runtime and do not break ingest.

Replace:
```json
  { "cik": "0001067983", "slug": "berkshire-hathaway", "person": "Warren Buffett" },
```
With:
```json
  {
    "cik": "0001067983",
    "slug": "berkshire-hathaway",
    "person": "Warren Buffett",
    "people": [
      { "name": "Warren Buffett", "zh": "巴菲特" },
      { "name": "Greg Abel", "zh": "阿贝尔", "role": "CEO" },
      { "name": "Charlie Munger", "zh": "芒格" }
    ],
    "aliases": ["BRK", "BRK.A", "BRK.B", "伯克希尔", "伯克希尔哈撒韦"]
  },
```

(Other 33 managers gain person-name + Chinese aliases automatically in Step 3 via the `person` field and `INVESTOR_ALIASES`. Adding `people`/`aliases` to them later is incremental data entry, not code — out of scope for v1 beyond this worked example.)

- [ ] **Step 2: Seed the derived former-names artifact**

```bash
mkdir -p web/src/data/13f
printf '{}\n' > web/src/data/13f/former-names.json
```

(Task 6's ingest run will overwrite this with real `{slug: [formerName, ...]}` data. It must exist now so `config.ts`'s static import resolves at build time.)

- [ ] **Step 3: Write `config.ts`**

```typescript
// web/src/lib/aliases/config.ts
// 投资人「人工策划」别名的归宿与读取(spec §4.1)。三个静态来源在此合并成 AliasEntry[]:
//   1. config/managers.json 新增的 people[]/aliases[](人名含接班人、票代、中英)
//   2. 既有 INVESTOR_ALIASES(中文搜索词,已维护 34 位,复用免重录)
//   3. src/data/13f/former-names.json(EDGAR 曾用名,由 ingest 写;Task 6 前为空 {})
// 全为 confidence=high。静态导入 → 有库/无库两环境都可用(spec §4.4)。
import managersRaw from "../../../config/managers.json";
import { INVESTOR_ALIASES } from "@/lib/investorAliases";
import formerNamesRaw from "@/data/13f/former-names.json";
import type { AliasEntry } from "./types";

type CuratedPerson = { name: string; zh?: string; role?: string };
type CuratedManager = {
  cik: string;
  slug: string;
  person: string;
  people?: CuratedPerson[];
  aliases?: string[];
};

const MANAGERS = managersRaw as CuratedManager[];
const FORMER = formerNamesRaw as Record<string, string[]>;

export function investorAliasEntries(): AliasEntry[] {
  const out: AliasEntry[] = [];
  // display="" → 该别名只用于解析/重定向,不进 alternateName(如 slug 自指)。
  const push = (alias: string, canonical: string, display: string = alias) => {
    if (alias && alias.trim()) out.push({ alias, display, canonical });
  };
  for (const m of MANAGERS) {
    push(m.slug, m.slug, "");        // 自指:变体(如 "Berkshire Hathaway")归一化后命中 canonical
    push(m.person, m.slug);          // 现有英文人名
    for (const p of m.people ?? []) {
      push(p.name, m.slug);
      if (p.zh) push(p.zh, m.slug);
    }
    for (const a of m.aliases ?? []) push(a, m.slug);
    const zh = INVESTOR_ALIASES[m.slug];
    if (zh) for (const tok of zh.split(/\s+/)) push(tok, m.slug);
    for (const fn of FORMER[m.slug] ?? []) push(fn, m.slug);
  }
  return out;
}
```

- [ ] **Step 4: Verify compile + import resolution**

Run: `cd web && npx tsc --noEmit`
Expected: PASS. This confirms the relative import `../../../config/managers.json` and `@/data/13f/former-names.json` both resolve under `resolveJsonModule` (verified: tsconfig has `resolveJsonModule: true`, no `rootDir` restriction).

- [ ] **Step 5: Commit**

```bash
git add web/config/managers.json web/src/data/13f/former-names.json web/src/lib/aliases/config.ts
git commit -m "feat(aliases): curated investor alias config (managers.json fields + INVESTOR_ALIASES + formerNames seed)"
```

---

## Task 3: Alias index builder + resolveEntity + getEntityAliases

**Files:**
- Create: `web/src/lib/aliases/resolve.ts`

- [ ] **Step 1: Write `resolve.ts`**

```typescript
// web/src/lib/aliases/resolve.ts
// 解析核心(spec §3.1, §6)。运行时永远是查 Map;复杂度全在构建期数据聚合。
// cache() 让同一请求内多次解析只构建一次索引(与 source.ts/securities.ts 一致)。
import "server-only";
import { cache } from "react";
import { normalize } from "./normalize";
import { cleanIssuer } from "@/lib/format";
import { investorAliasEntries } from "./config";
import { getCusipMap } from "@/lib/managers/securities";
import type { EntityType, AliasEntry, AliasTarget, BuiltIndex } from "./types";

// 纯函数:AliasEntry[] → BuiltIndex。处理 spec §6 边界:
//   - 歧义(一个归一化别名 → 多个不同 canonical):不进 resolve(宁可 404 也不错跳),记日志。
//   - 自指 / canonical 撞别名:canonical 永远赢——canonical 自身的归一化键映射到它自己,
//     解析返回它,调用方再比较 rawSlug≠canonical 决定是否跳(见消费点)。
export function buildFromEntries(entries: AliasEntry[]): BuiltIndex {
  const norm2canon = new Map<string, Set<string>>();
  const display = new Map<string, Set<string>>();
  for (const e of entries) {
    const n = normalize(e.alias);
    if (!n) continue;
    (norm2canon.get(n) ?? norm2canon.set(n, new Set()).get(n)!).add(e.canonical);
    if (e.display) {
      (display.get(e.canonical) ?? display.set(e.canonical, new Set()).get(e.canonical)!).add(e.display);
    }
  }
  const resolve = new Map<string, string>();
  for (const [n, set] of norm2canon) {
    if (set.size === 1) resolve.set(n, [...set][0]);
    else console.warn(`[alias] 歧义别名 "${n}" → ${[...set].join(", ")}; 跳过(不重定向)`);
  }
  const displayArr = new Map<string, string[]>();
  for (const [c, set] of display) displayArr.set(c, [...set]);
  return { resolve, display: displayArr };
}

// 投资人索引:全部来自静态 config(两环境都可用)。
const buildInvestorIndex = cache(async (): Promise<BuiltIndex> =>
  buildFromEntries(investorAliasEntries())
);

// 个股索引:从证券脊梁 getCusipMap 派生(零 hardcode, spec §4.3)。
//   normalize(name)→ticker、ticker→ticker(自指)、cusip→ticker。
// 无 Supabase env(本地)→ getCusipMap 为空 → 索引为空 → 优雅降级,不解析(spec §4.4)。
const buildStockIndex = cache(async (): Promise<BuiltIndex> => {
  const cusipMap = await getCusipMap();
  const entries: AliasEntry[] = [];
  for (const [cusip, info] of cusipMap) {
    if (!info.ticker) continue;
    entries.push({ alias: info.ticker, display: info.ticker, canonical: info.ticker });
    entries.push({ alias: cusip, display: "", canonical: info.ticker });
    if (info.name) entries.push({ alias: info.name, display: cleanIssuer(info.name), canonical: info.ticker });
  }
  return buildFromEntries(entries);
});

async function indexFor(type: EntityType): Promise<BuiltIndex> {
  return type === "investor" ? buildInvestorIndex() : buildStockIndex();
}

// 任意别名 → canonical。仅返回 confidence=high(v1 全 high);loose 不经此函数(只进
// 结构化数据)。未命中 → null。调用方负责比较 rawSlug≠canonicalSlug 再决定跳转。
// rawSlug 来自 URL 动态段:Next 不会自动解码(中文别名到达时仍是 %E5%B7%B4… 形式),
// 故先 decodeURIComponent 再归一化;畸形编码则回退原串。
export async function resolveEntity(type: EntityType, rawSlug: string): Promise<AliasTarget | null> {
  const idx = await indexFor(type);
  let decoded = rawSlug;
  try {
    decoded = decodeURIComponent(rawSlug);
  } catch {
    // 畸形百分号编码 → 用原串(normalize 会去掉残余标点)。
  }
  const hit = idx.resolve.get(normalize(decoded));
  return hit ? { canonicalSlug: hit, confidence: "high" } : null;
}

// 该 canonical 的全部展示别名(用于结构化数据 alternateName, spec §5.2)。无 → []。
export async function getEntityAliases(type: EntityType, canonicalSlug: string): Promise<string[]> {
  const idx = await indexFor(type);
  return idx.display.get(canonicalSlug) ?? [];
}
```

- [ ] **Step 2: Verify compile**

Run: `cd web && npx tsc --noEmit`
Expected: PASS. Confirms `cleanIssuer` (from `@/lib/format`), `getCusipMap` (from `@/lib/managers/securities`), and the config import all line up.

- [ ] **Step 3: Verify resolution behavior in a real dev render (no separate test framework — solo-dev convention)**

This is verified end-to-end by Tasks 4–5 (the redirect consumers). No standalone check here; the pure `buildFromEntries` logic is small and fully exercised by those redirects. Proceed.

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/aliases/resolve.ts
git commit -m "feat(aliases): buildFromEntries + resolveEntity + getEntityAliases (investor+stock indexes)"
```

---

## Task 4: Consumer ① — investor page redirect

Insert alias resolution between the failed data load and `notFound()`.

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`

- [ ] **Step 1: Add `permanentRedirect` to the `next/navigation` import**

Current (line 2):
```typescript
import { notFound } from "next/navigation";
```
Change to:
```typescript
import { notFound, permanentRedirect } from "next/navigation";
```

- [ ] **Step 2: Add the `resolveEntity` import**

After the existing `import { investorPath, stockPath } from "@/lib/urls";` line (line 8), add:
```typescript
import { resolveEntity } from "@/lib/aliases/resolve";
```

- [ ] **Step 3: Insert redirect before `notFound()`**

Current (around lines 231–232):
```typescript
  const d = await getManagerDetail(slug);
  if (!d) notFound();
```
Change to:
```typescript
  const d = await getManagerDetail(slug);
  if (!d) {
    // 别名解析:查不到真实页 → 尝试把别名(人名/接班人/票代/中英/曾用名)308 跳到 canonical。
    // 仅 high 触发;命中且 ≠ 当前 slug 才跳(自指 no-op);否则 404。permanentRedirect 抛出,
    // 控制流等价于 notFound()(spec §5.1, §6)。
    const hit = await resolveEntity("investor", slug);
    if (hit && hit.canonicalSlug !== slug) permanentRedirect(investorPath(lang, hit.canonicalSlug));
    notFound();
  }
```

- [ ] **Step 4: Verify compile**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual verification in dev**

```bash
cd web && npm run dev
```
In another shell (server on :3000), confirm 308 + correct `Location` for aliases, and that a genuine miss still 404s:
```bash
curl -sI "http://localhost:3000/en/investors/warren-buffett"   | grep -iE "HTTP|location"
curl -sI "http://localhost:3000/en/investors/greg-abel"        | grep -iE "HTTP|location"
curl -sI "http://localhost:3000/en/investors/brk"              | grep -iE "HTTP|location"
curl -sI "http://localhost:3000/zh/investors/巴菲特"            | grep -iE "HTTP|location"
curl -sI "http://localhost:3000/en/investors/zzz-not-real-xyz" | grep -iE "HTTP|location"
```
Expected: first four → `HTTP/1.1 308` with `location: /en/investors/berkshire-hathaway` (or `/zh/...` for the Chinese one). Last → `HTTP/1.1 404`. Stop the dev server (Ctrl-C) when done.

- [ ] **Step 6: Commit**

```bash
git add "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(aliases): investor page 308-redirects aliases to canonical before notFound"
```

---

## Task 5: Consumer ① — stock page redirect

The stock page already redirects raw CUSIP → ticker (a `redirect()` near line 318). Add an **additive** alias resolution after it to catch company-name and any other derived aliases. Leave the existing CUSIP block untouched (proven; for a CUSIP input it throws before reaching the new code).

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

- [ ] **Step 1: Add `permanentRedirect` to the `next/navigation` import**

Current (line 2):
```typescript
import { notFound, redirect } from "next/navigation";
```
Change to:
```typescript
import { notFound, redirect, permanentRedirect } from "next/navigation";
```

- [ ] **Step 2: Add `stockPath` and `resolveEntity` imports**

Current (line 7):
```typescript
import { investorPath } from "@/lib/urls";
```
Change to:
```typescript
import { investorPath, stockPath } from "@/lib/urls";
import { resolveEntity } from "@/lib/aliases/resolve";
```

- [ ] **Step 3: Insert name-alias resolution after the existing CUSIP redirect block**

Current (around lines 316–322):
```typescript
  // 旧 CUSIP URL → 301 到 ticker(若该 cusip 已解析)
  const cusipMap = await getCusipMap();
  const asCusip = cusipMap.get(rawTicker);
  if (asCusip?.ticker && asCusip.ticker !== rawTicker) {
    redirect(`/${lang}/stocks/${asCusip.ticker}`);
  }

  const ticker = rawTicker;
```
Change to:
```typescript
  // 旧 CUSIP URL → 301 到 ticker(若该 cusip 已解析)
  const cusipMap = await getCusipMap();
  const asCusip = cusipMap.get(rawTicker);
  if (asCusip?.ticker && asCusip.ticker !== rawTicker) {
    redirect(`/${lang}/stocks/${asCusip.ticker}`);
  }

  // 别名解析:公司名等非票代别名(如 /stocks/apple)308 跳到 canonical ticker。
  // ticker 自指 no-op;无库(本地)→ 索引空 → null → 不跳,沿用原逻辑(spec §5.1)。
  const aliasHit = await resolveEntity("stock", rawTicker);
  if (aliasHit && aliasHit.canonicalSlug !== rawTicker) {
    permanentRedirect(stockPath(lang, aliasHit.canonicalSlug));
  }

  const ticker = rawTicker;
```

- [ ] **Step 4: Verify compile**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual verification in dev (requires Supabase env — stock index derives from the spine)**

Stock derivation needs `getCusipMap`, which is empty without Supabase env. If `.env.local` has Supabase creds:
```bash
cd web && npm run dev
# pick a real held company name present in the spine, e.g. "apple"
curl -sI "http://localhost:3000/en/stocks/apple" | grep -iE "HTTP|location"
curl -sI "http://localhost:3000/en/stocks/AAPL"  | grep -iE "HTTP|location"   # canonical, no redirect
```
Expected: `apple` → `308` `location: /en/stocks/AAPL` (the resolved ticker); `AAPL` → `200` (self, no redirect). If no Supabase env locally, this is a no-op by design (empty index) — confirm `tsc` passes and rely on the investor redirect as the shippable proof for Phase B.

- [ ] **Step 6: Commit**

```bash
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(aliases): stock page 308-redirects name aliases to canonical ticker"
```

> **Phase B checkpoint:** Consumer ① (301/308 redirects) is complete and independently shippable. Recommend reviewing/merging here before proceeding.

---

## Task 6: Consumer source — EDGAR formerNames (automatic investor aliases)

Capture SEC `formerNames` during ingest, emit them to the static `former-names.json` artifact (which `config.ts` already reads — both environments), and double-write to a new `managers.former_names` column for parity (spec §4.2). Confirmed: the SEC `submissions/CIK*.json` payload contains a top-level `formerNames: [{name, from, to}]`.

**Files:**
- Modify: `web/scripts/ingest-13f.ts`
- Modify: `web/scripts/lib/supabaseUpsert.ts`
- Create: `web/supabase/migrations/20260609_add_former_names_to_managers.sql`

- [ ] **Step 1: Extend the `SubmissionsData` interface**

Current (lines 60–71):
```typescript
  name: string;
  filings: {
    recent: {
      form: string[];
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      primaryDocument: string[];
    };
  };
}
```
Change the `name: string;` line region to add the field (insert after `name: string;`):
```typescript
  name: string;
  formerNames?: Array<{ name: string; from?: string; to?: string }>;
  filings: {
    recent: {
      form: string[];
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      primaryDocument: string[];
    };
  };
}
```

- [ ] **Step 2: Return `formerNames` from `getLatestFilings`**

Current (lines 86–91):
```typescript
  const data = await fetchJson<SubmissionsData>(url);
  await sleep(250);

  const { form, accessionNumber, filingDate, reportDate } = data.filings.recent;
  const name = data.name;
```
Change to:
```typescript
  const data = await fetchJson<SubmissionsData>(url);
  await sleep(250);

  const { form, accessionNumber, filingDate, reportDate } = data.filings.recent;
  const name = data.name;
  const formerNames = (data.formerNames ?? []).map((f) => f.name).filter(Boolean);
```
And change the function's `return` (around lines 116–117):
```typescript
  return { name, filings: selected };
```
to:
```typescript
  return { name, formerNames, filings: selected };
```

- [ ] **Step 3: Thread `formerNames` through `ingestManager` and collect in `main()`**

`ingestManager` currently destructures `const { name, filings } = await getLatestFilings(...)` and returns `ManagerDetail`. We need former names per slug at the `main()` level. Keep the return type unchanged (no churn to `Manager`/`ManagerDetail` types — protects acceptance #8). Instead, accumulate into a module map.

After the imports / constants near the top of the file (e.g. right after the `const OUT_DIR = ...` line, around line 35), add:
```typescript
// slug → EDGAR 曾用名(基金改名史)。ingest 期填充,末尾 emit 到 former-names.json。
const FORMER_NAMES: Record<string, string[]> = {};
```

In `ingestManager`, change the destructure (around line 315):
```typescript
  const { name, filings } = await getLatestFilings(seed.cik, 2);
```
to:
```typescript
  const { name, formerNames, filings } = await getLatestFilings(seed.cik, 2);
  if (formerNames.length) FORMER_NAMES[seed.slug] = formerNames;
```

- [ ] **Step 4: Emit `former-names.json` in `main()` (next to `index.json`)**

Current (around lines 392–396, after writing `index.json`):
```typescript
  const indexPath = path.join(OUT_DIR, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\nIndex written to ${indexPath}`);
  console.log(`Total managers processed: ${summaries.length}`);
```
Insert immediately after those lines:
```typescript
  const formerPath = path.join(OUT_DIR, "former-names.json");
  fs.writeFileSync(formerPath, JSON.stringify(FORMER_NAMES, null, 2));
  console.log(`Former names written to ${formerPath} (${Object.keys(FORMER_NAMES).length} managers with history)`);
```

- [ ] **Step 5: Double-write `former_names` to Supabase via the upsert payload**

In `web/scripts/lib/supabaseUpsert.ts`, extend the manager payload type and `buildUpsertPayload`.

Current `UpsertPayload` (lines 5–9):
```typescript
export type UpsertPayload = {
  manager: { cik: string; slug: string; name: string; person: string };
  filings: FilingRow[];
  holdingsByAccession: Record<string, HoldingRow[]>;
};
```
Change `manager` to allow the optional column:
```typescript
export type UpsertPayload = {
  manager: { cik: string; slug: string; name: string; person: string; former_names?: string[] };
  filings: FilingRow[];
  holdingsByAccession: Record<string, HoldingRow[]>;
};
```

`buildUpsertPayload` takes only `ManagerDetail`, which does not carry formerNames. Add an optional second arg so ingest can pass them without changing `Manager` types. Current (lines 20–27):
```typescript
export function buildUpsertPayload(d: ManagerDetail): UpsertPayload {
  const filings: FilingData[] = [d.latest, ...(d.prior ? [d.prior] : [])];
  return {
    manager: d.manager,
    filings: filings.map((f) => filingRow(d.manager.cik, f)),
    holdingsByAccession: Object.fromEntries(filings.map((f) => [f.accession, holdingRows(f)])),
  };
}
```
Change to:
```typescript
export function buildUpsertPayload(d: ManagerDetail, formerNames?: string[]): UpsertPayload {
  const filings: FilingData[] = [d.latest, ...(d.prior ? [d.prior] : [])];
  return {
    manager: { ...d.manager, ...(formerNames?.length ? { former_names: formerNames } : {}) },
    filings: filings.map((f) => filingRow(d.manager.cik, f)),
    holdingsByAccession: Object.fromEntries(filings.map((f) => [f.accession, holdingRows(f)])),
  };
}
```
And update `upsertManagerDetail` (line 30) to accept + forward former names:
```typescript
export async function upsertManagerDetail(db: any, d: ManagerDetail): Promise<void> {
  const p = buildUpsertPayload(d);
```
Change to:
```typescript
export async function upsertManagerDetail(db: any, d: ManagerDetail, formerNames?: string[]): Promise<void> {
  const p = buildUpsertPayload(d, formerNames);
```

Then in `ingest-13f.ts` `main()`, the Supabase upsert loop (around line 423) currently:
```typescript
    for (const detail of allDetails) {
      try { await upsertManagerDetail(db, detail); console.log(`[${detail.manager.slug}] upserted to Supabase`); }
```
Change to:
```typescript
    for (const detail of allDetails) {
      try { await upsertManagerDetail(db, detail, FORMER_NAMES[detail.manager.slug]); console.log(`[${detail.manager.slug}] upserted to Supabase`); }
```

- [ ] **Step 6: Create the additive migration**

```sql
-- web/supabase/migrations/20260609_add_former_names_to_managers.sql
-- 实体别名解析层:EDGAR 基金曾用名(formerNames)。可空、默认 null,纯增列,不影响现有读取
-- (manager_index RPC / mapIndexRows 仍只选既有列)。应用层别名解析读静态 former-names.json,
-- 本列为双写一致性/将来 DB 侧消费预留(spec §4.2)。
alter table managers add column if not exists former_names text[] default null;
```

> Note: this SQL must be run manually in the Supabase SQL Editor (this repo applies migrations by hand — there is no automated migration runner). The column is additive and nullable, so the app and `manager_index` RPC keep working whether or not it has been applied.

- [ ] **Step 7: Verify compile**

Run: `cd web && npx tsc --noEmit`
Expected: PASS. (Verifies the script + upsert lib type changes. `npm run ingest` itself hits the live SEC API and is run by the user on demand, not as part of this verification.)

- [ ] **Step 8: Commit**

```bash
git add web/scripts/ingest-13f.ts web/scripts/lib/supabaseUpsert.ts web/supabase/migrations/20260609_add_former_names_to_managers.sql
git commit -m "feat(aliases): ingest captures EDGAR formerNames → former-names.json + managers.former_names"
```

> After merge, the user runs `npm run ingest` (and applies the migration) to populate real former names. `config.ts` picks them up automatically on the next build.

---

## Task 7: Consumer ② — investor page alternateName

Expose curated/derived aliases on the investor page's `Person` JSON-LD so search/AI match every name. Pure facts (high/loose), no compliance concern (spec §5.2).

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`

- [ ] **Step 1: Import `getEntityAliases`**

The `resolveEntity` import added in Task 4 is at the top. Change it to also import `getEntityAliases`:
```typescript
import { resolveEntity } from "@/lib/aliases/resolve";
```
to:
```typescript
import { resolveEntity, getEntityAliases } from "@/lib/aliases/resolve";
```

- [ ] **Step 2: Fetch aliases and add `alternateName` to the `Person` object**

The page component is async and `manager` is in scope before the `person` JSON-LD is built (around line 340). Just before the `const person = {` line, add:
```typescript
  // 别名外露:把人名/接班人/票代/中英/曾用名喂给搜索/AI(spec §5.2)。排除与主名重复者。
  const aliasNames = (await getEntityAliases("investor", manager.slug)).filter((a) => a !== manager.person);
```
Then in the `person` object, add an `alternateName` field. Current:
```typescript
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: manager.person,
    url: `https://thecompounder.fyi/${lang}/investors/${manager.slug}`,
```
Change to:
```typescript
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: manager.person,
    ...(aliasNames.length ? { alternateName: aliasNames } : {}),
    url: `https://thecompounder.fyi/${lang}/investors/${manager.slug}`,
```

- [ ] **Step 3: Verify compile**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual verification in dev**

```bash
cd web && npm run dev
curl -s "http://localhost:3000/en/investors/berkshire-hathaway" | grep -o '"alternateName":\[[^]]*\]' | head -1
```
Expected: a JSON array containing names like `"Greg Abel"`, `"Charlie Munger"`, `"BRK.B"`, `"巴菲特"`, etc. (order not significant). Stop the dev server when done.

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(aliases): investor Person JSON-LD exposes alternateName"
```

---

## Task 8: Consumer ② — stock page alternateName

Add an `Organization` JSON-LD node carrying the company's `name` + `alternateName` (other company names, ticker). The stock page currently emits `breadcrumb` + `faq` only; add a third node (spec §5.2; Chinese name deferred to Tier 2).

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

- [ ] **Step 1: Import `getEntityAliases`**

The `resolveEntity` import added in Task 5:
```typescript
import { resolveEntity } from "@/lib/aliases/resolve";
```
Change to:
```typescript
import { resolveEntity, getEntityAliases } from "@/lib/aliases/resolve";
```

- [ ] **Step 2: Build the company `alternateName` node**

`ticker` and `issuer` are in scope before the JSON-LD block (the `faq` object is built around line 404). Immediately after the `const faq = { ... };` object (just before the `return (` near line 428), add:
```typescript
  // 个股别名外露:公司名变体 + 票代(CUSIP 不外露——非用户语义;中文名待 Tier 2)。
  const stockAliases = (await getEntityAliases("stock", ticker)).filter(
    (a) => a !== issuer && a !== ticker
  );
  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: issuer,
    alternateName: [ticker, ...stockAliases],
    url: `https://thecompounder.fyi/${lang}/stocks/${ticker}`,
  };
```

- [ ] **Step 3: Emit the node**

Current `return` head (around line 426–429):
```typescript
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
```
Change to:
```typescript
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }} />
```

- [ ] **Step 4: Verify compile**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual verification in dev (Supabase env needed for non-ticker aliases; ticker always present)**

```bash
cd web && npm run dev
curl -s "http://localhost:3000/en/stocks/AAPL" | grep -o '"@type":"Organization"[^<]*' | head -1
```
Expected: an `Organization` node with `"name"` set to the issuer and `"alternateName"` including `"AAPL"`. With Supabase env, company-name variants from the spine also appear. Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(aliases): stock page Organization JSON-LD exposes alternateName"
```

---

## Task 9: Consumer ③ — holdings issuer → canonical ticker link (CUSIP join)

The holdings table currently links each row to `/stocks/{cusip}` and shows no ticker badge (a 9-digit CUSIP fails `isLikelyTicker`). The stock page then redirects CUSIP→ticker. Resolve CUSIP→ticker at render so the link points **directly** to the canonical ticker page (no redirect hop) and the ticker badge shows. Fall back to the CUSIP link when unresolved (preserves current local/no-DB behavior); render as plain text only when a row has no CUSIP at all (spec §5.3, §8).

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`

- [ ] **Step 1: Import `getCusipMap`**

After the `import { EntityName } from "@/components/common/EntityName";` line (line 17), add:
```typescript
import { getCusipMap } from "@/lib/managers/securities";
```

- [ ] **Step 2: Add a `cusipToTicker` prop to `HoldingsTable`**

The component signature (around lines 124–134):
```typescript
function HoldingsTable({
  holdings,
  prior,
  changes,
  lang,
}: {
  holdings: Holding[];
  prior?: FilingData;
  changes: HoldingChange[];
  lang: Lang;
}): React.ReactElement {
```
Change to:
```typescript
function HoldingsTable({
  holdings,
  prior,
  changes,
  lang,
  cusipToTicker,
}: {
  holdings: Holding[];
  prior?: FilingData;
  changes: HoldingChange[];
  lang: Lang;
  cusipToTicker: Map<string, string>;
}): React.ReactElement {
```

- [ ] **Step 3: Use the resolved ticker in the issuer cell and row link**

The issuer column cell (around line 150):
```typescript
      cell: (h) => <EntityName issuer={h.issuer} ticker={h.cusip} />,
```
Change to (show the resolved ticker badge; fall back to cusip — `isLikelyTicker` will simply hide the badge for a raw cusip):
```typescript
      cell: (h) => <EntityName issuer={h.issuer} ticker={cusipToTicker.get(h.cusip) ?? h.cusip} />,
```

The `DataTable` `rowHref` (around line 194):
```typescript
        rowHref={(h) => stockPath(lang, h.cusip)}
```
Change to (canonical ticker when resolved; else cusip link; else no link for cusip-less rows):
```typescript
        rowHref={(h) => {
          const tk = cusipToTicker.get(h.cusip);
          if (tk) return stockPath(lang, tk);
          return h.cusip ? stockPath(lang, h.cusip) : "";
        }}
```
(Verified: `DataTable` renders a plain row when `rowHref` returns a falsy string — see `const href = rowHref?.(row)` guards in `DataTable.tsx`.)

- [ ] **Step 4: Build `cusipToTicker` in the page and pass it to `HoldingsTable`**

In the page component, after `const { manager, latest, prior, changes } = d;` (around line 234), add:
```typescript
  // CUSIP→ticker 内链解析(spec §5.3)。无库(本地)→ 空 Map → 退回原 cusip 链接(行为不变)。
  const cusipMap = await getCusipMap();
  const cusipToTicker = new Map<string, string>();
  for (const [cusip, info] of cusipMap) if (info.ticker) cusipToTicker.set(cusip, info.ticker);
```

The `<HoldingsTable .../>` call site (line 381):
```typescript
        <HoldingsTable holdings={latest.holdings} prior={prior} changes={changes} lang={lang} />
```
Change to:
```typescript
        <HoldingsTable holdings={latest.holdings} prior={prior} changes={changes} lang={lang} cusipToTicker={cusipToTicker} />
```

- [ ] **Step 5: Verify compile**

Run: `cd web && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Manual verification in dev (Supabase env shows direct ticker links + badges)**

```bash
cd web && npm run dev
# View source of an investor page; holdings rows should link to /{lang}/stocks/{TICKER}
curl -s "http://localhost:3000/en/investors/berkshire-hathaway" | grep -oE '/en/stocks/[A-Z.]+' | sort -u | head
```
Expected (with Supabase env): row links point to ticker symbols (e.g. `/en/stocks/AAPL`), not 9-char CUSIPs. Without Supabase env, links remain CUSIP-based (unchanged behavior) — confirm the page still renders and `tsc` passes. Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(aliases): holdings issuer links resolve CUSIP→canonical ticker"
```

---

## Self-Review (run by plan author against spec)

**Spec coverage:**
- §3.1 core (`EntityType`/`AliasTarget`/`resolveEntity`/`aliasIndex`) → Tasks 1, 3. ✅
- §3.2 normalize → Task 1. ✅
- §3.3 confidence gate (high-only redirects; loose reserved) → Task 3 (`resolveEntity` returns high; `getEntityAliases` carries display set). ✅
- §4.1 curated investor config (managers.json `people`/`aliases` + reuse `INVESTOR_ALIASES`) → Task 2. ✅
- §4.2 EDGAR formerNames auto (ingest → static + Supabase) → Task 6. ✅
- §4.3 stock derived from spine (name/ticker/cusip → ticker, zero hardcode) → Task 3 `buildStockIndex`. ✅
- §4.4 merge + DB/JSON two-environment → Task 2/3 (config static both envs; spine derived degrades to empty without DB). ✅
- §5.1 inbound 308 redirect before notFound, alias slugs excluded from `generateStaticParams` (we don't add them) → Tasks 4, 5. ✅
- §5.2 alternateName on both pages → Tasks 7, 8. ✅
- §5.3 issuer→stock CUSIP internal link → Task 9. ✅
- §6 boundaries (canonical wins / ambiguity skip / self no-op / one-hop) → Task 3 `buildFromEntries` (ambiguity dropped + logged; self-ref handled by caller's `!==` check) and consumer `canonicalSlug !== rawSlug` guards. ✅
- §7 acceptance #1–9 → covered by Tasks 4 (1,3), 5 (2), 7/8 (4), 9 (5), 3 (6,9), 2/3 (7), 2 (8). ✅
- §8 risks (cusip missing → plain text; ambiguity skip; formerNames noise stays high v1) → Task 9 Step 3 + Task 3. ✅
- Tier-2/Wikidata future producer → architecture preserved (`loose` confidence + `display` set unused in v1 but wired). ✅

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N" — every code step shows full content. ✅

**Type consistency:** `EntityType`/`AliasTarget`/`AliasEntry`/`BuiltIndex` defined in Task 1, consumed identically in Tasks 2–3. `investorAliasEntries()` (Task 2) ↔ `buildFromEntries`/`buildInvestorIndex` (Task 3). `resolveEntity`/`getEntityAliases` signatures stable across Tasks 4–9. `cusipToTicker: Map<string,string>` consistent in Task 9. `Manager`/`ManagerDetail` types intentionally untouched (acceptance #8). ✅
