# 分股类经济股数回退 + 金融股口径收敛 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 V/BRK.B 这类分股类申报公司拿到真实经济股数从而可估值（件①），并修正 61xx 金融股被误判非金融、被 AI-capex 工业透镜误杀可靠性的口径（件②，AXP 直接受益）。

**Architecture:** 件① = SEC ingest 侧新增一个窄触发的回退模块：当某票 annual 全部年份缺 `shares_diluted` 时，拉最近 3 份 10-K 的提取版 XBRL instance（`*_htm.xml`），解析带 `ClassOfStockAxis` 维度的分股类 EPS/股数，用「净利÷挂牌类EPS」（路线B）与「挂牌类股数 tag」（路线A）双路互证（≤10% 容差）得出经济股数，落进 `shares_diluted` 同列并在 `raw_facts` 标注溯源；估值引擎零改动。件② = `moatCap.isFinancialSic` 纳入 [6100,6199] + `epvFloor.assembleFloor` 对金融股不发布 `ai_capex_distortion_warning`。

**Tech Stack:** TypeScript (Next.js web/)、fast-xml-parser ^5.8.0（已有依赖）、tsx 探针脚本、Supabase REST（只读探针）。

**Spec:** `docs/superpowers/specs/2026-07-26-valuation-multiclass-shares-and-financial-scope-design.md`

## Global Constraints

- 工作目录 = `web/`（仓库根下）。分支 `plan/valuation-multiclass-shares`（已建，off origin/db-foundation @18e7958）。
- 本项目**不跑测试套件**（solo-dev 纪律）：验证 = `npx tsc --noEmit`（在 `web/` 下跑）+ 仓库既有 `*.check.ts` 断言脚本 + 真数据探针。check/探针运行方式：`cd web && npx tsx --tsconfig scripts/tsconfig.json <path>`。
- fast-xml-parser 必须 **`parseTagValue: false`**（历史事故：CUSIP 被当科学计数法损坏，纪律不可破）。
- 回退与探针**绝不写数据库**；回退代码任何异常必须被 try/catch 吞掉并 console.error，不得打断主 ingest。
- 宁缺毋假：任何一年双路互证不过（缺路线、超差、净利≤0）→ 该年不补，不做单路放行。
- 代码注释风格跟随仓库（中文注释、讲约束不讲流水账）；提交信息格式跟随仓库近期提交（`feat(...)`/`fix(...)` 中文正文）。
- SEC 请求必须带 `User-Agent`（env `SEC_USER_AGENT`，`web/.env.local` 已有）；连续请求间 `sleep(300)`。
- git 提交末尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。

---

### Task 1: 分股类事实解析与经济股数推导（纯函数 + fixture check）

**Files:**
- Create: `web/src/lib/sec/class-shares-fallback.ts`
- Create: `web/src/lib/sec/class-shares-fallback.check.ts`

**Interfaces:**
- Produces（Task 2 依赖，签名必须一致）:
  - `export type ClassShareFact = { tag: string; member: string; start: string; end: string; value: number }`
  - `export function extractClassShareFacts(xml: string): ClassShareFact[]`
  - `export function listedClassToken(ticker: string): string`
  - `export type DerivedShares = { period_end: string; shares: number; eps: number; cross_check_pct: number; member: string }`
  - `export function deriveEconomicShares(facts: ClassShareFact[], token: string, periods: { period_end: string; net_income: number | null }[]): DerivedShares[]`

- [ ] **Step 1: 先读仓库范式**

读 `web/src/lib/sec/normalizeDilutedShares.check.ts`（check 脚本断言风格）与 `web/src/lib/sec/normalize-facts.ts:85-98`（量纲纪律），照其风格写本 task。

- [ ] **Step 2: 写 fixture check（先写、先跑、先红）**

`web/src/lib/sec/class-shares-fallback.check.ts`：

```ts
/**
 * class-shares-fallback.check.ts — 分股类经济股数推导断言（纯 fixture,无网络）。
 * 场景:V 形态(默认命名空间+摊薄as-converted)/BRK 形态(xbrli:前缀+basic equivalent)/
 * 超差拒绝/B1B2 成员排除/负净利跳过。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/class-shares-fallback.check.ts
 */
import { extractClassShareFacts, deriveEconomicShares, listedClassToken } from "./class-shares-fallback";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.error(`  ✗ ${msg}`); }
}

// ── fixture 1:V 形态(默认命名空间;Class A 摊薄股数即 as-converted 经济总量) ──
const V_XML = `<?xml version="1.0" encoding="utf-8"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:v="http://visa/20250930">
  <context id="cA"><entity><identifier scheme="s">0001403161</identifier><segment>
    <xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">us-gaap:CommonClassAMember</xbrldi:explicitMember>
  </segment></entity><period><startDate>2024-10-01</startDate><endDate>2025-09-30</endDate></period></context>
  <context id="cB1"><entity><identifier scheme="s">0001403161</identifier><segment>
    <xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">v:CommonClassB1Member</xbrldi:explicitMember>
  </segment></entity><period><startDate>2024-10-01</startDate><endDate>2025-09-30</endDate></period></context>
  <us-gaap:EarningsPerShareDiluted contextRef="cA" unitRef="u" decimals="2">10.20</us-gaap:EarningsPerShareDiluted>
  <us-gaap:EarningsPerShareDiluted contextRef="cB1" unitRef="u" decimals="2">15.95</us-gaap:EarningsPerShareDiluted>
  <us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding contextRef="cA" unitRef="sh" decimals="-6">1966000000</us-gaap:WeightedAverageNumberOfDilutedSharesOutstanding>
</xbrl>`;

console.log("fixture 1: V 形态");
const vFacts = extractClassShareFacts(V_XML);
assert(vFacts.some((f) => f.tag === "EarningsPerShareDiluted" && f.member === "CommonClassAMember" && f.value === 10.2), "提取到 Class A 摊薄 EPS(默认命名空间)");
assert(vFacts.some((f) => f.member === "CommonClassB1Member"), "提取到 B1 成员事实");
const vDerived = deriveEconomicShares(vFacts, listedClassToken("V"), [{ period_end: "2025-09-30", net_income: 20_058_000_000 }]);
assert(vDerived.length === 1, "V FY2025 推导出 1 行");
assert(Math.abs(vDerived[0].shares - 20_058_000_000 / 10.2) < 1, "经济股数=净利÷EPS_A(路线B定值)");
assert(vDerived[0].cross_check_pct < 0.01, "双路互证偏差 <1%");

// ── fixture 2:BRK 形态(xbrli: 前缀;仅 basic;EquivalentClassBMember) ──
const BRK_XML = `<?xml version="1.0" encoding="utf-8"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:brka="http://brk/20251231">
  <xbrli:context id="cEqB"><xbrli:entity><xbrli:identifier scheme="s">0001067983</xbrli:identifier><xbrli:segment>
    <xbrldi:explicitMember dimension="us-gaap:StatementClassOfStockAxis">brka:EquivalentClassBMember</xbrldi:explicitMember>
  </xbrli:segment></xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context>
  <us-gaap:EarningsPerShareBasic contextRef="cEqB" unitRef="u" decimals="2">31.04</us-gaap:EarningsPerShareBasic>
  <us-gaap:WeightedAverageNumberOfSharesOutstandingBasic contextRef="cEqB" unitRef="sh" decimals="0">2157335139</us-gaap:WeightedAverageNumberOfSharesOutstandingBasic>
</xbrli:xbrl>`;

console.log("fixture 2: BRK 形态");
const brkFacts = extractClassShareFacts(BRK_XML);
assert(brkFacts.length === 2, "xbrli: 前缀命名空间可解析");
const brkDerived = deriveEconomicShares(brkFacts, listedClassToken("BRK.B"), [{ period_end: "2025-12-31", net_income: 66_968_000_000 }]);
assert(brkDerived.length === 1 && Math.abs(brkDerived[0].shares - 66_968_000_000 / 31.04) < 1, "BRK.B basic/basic 配对推导成功(1500 换算内生)");

// ── fixture 3:超差拒绝(股数 tag 与净利÷EPS 偏差 >10% → 不补) ──
console.log("fixture 3: 超差拒绝");
const badFacts: typeof vFacts = [
  { tag: "EarningsPerShareDiluted", member: "CommonClassAMember", start: "2024-10-01", end: "2025-09-30", value: 10.2 },
  { tag: "WeightedAverageNumberOfDilutedSharesOutstanding", member: "CommonClassAMember", start: "2024-10-01", end: "2025-09-30", value: 1_714_000_000 },
];
assert(deriveEconomicShares(badFacts, "ClassA", [{ period_end: "2025-09-30", net_income: 20_058_000_000 }]).length === 0, "偏差 14.7% 被 10% 闸拒绝(宁缺毋假)");

// ── fixture 4:token 匹配纪律 ──
console.log("fixture 4: token 匹配");
assert(listedClassToken("BRK.B") === "ClassB" && listedClassToken("V") === "ClassA" && listedClassToken("BRK.A") === "ClassA", "后缀 .A/.B 映射,无后缀默认 ClassA");
const b2Facts: typeof vFacts = [
  { tag: "EarningsPerShareDiluted", member: "CommonClassB2Member", start: "2025-01-01", end: "2025-12-31", value: 15.7 },
  { tag: "WeightedAverageNumberOfDilutedSharesOutstanding", member: "CommonClassB2Member", start: "2025-01-01", end: "2025-12-31", value: 120_000_000 },
];
assert(deriveEconomicShares(b2Facts, "ClassB", [{ period_end: "2025-12-31", net_income: 1_884_000_000 }]).length === 0, "ClassB token 不匹配 ClassB2Member(后随数字排除)");

// ── fixture 5:负净利年跳过 ──
console.log("fixture 5: 负净利跳过");
assert(deriveEconomicShares(vFacts, "ClassA", [{ period_end: "2025-09-30", net_income: -1_000_000 }]).length === 0, "净利≤0 → 路线B无定义 → 该年不补");

if (failed) { console.error(`\n${failed} 个断言失败`); process.exit(1); }
console.log("\n全部通过");
```

- [ ] **Step 3: 跑 check 确认红**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/class-shares-fallback.check.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 `class-shares-fallback.ts` 纯函数部分**

```ts
import { XMLParser } from "fast-xml-parser";

/** 分股类维度事实(localName 化):tag 如 EarningsPerShareDiluted,member 如 CommonClassAMember。 */
export type ClassShareFact = { tag: string; member: string; start: string; end: string; value: number };
export type DerivedShares = { period_end: string; shares: number; eps: number; cross_check_pct: number; member: string };

/** 双路互证容差:|股数tag − 净利÷EPS|/后者 超过即拒绝(V 的 basic-A 1714M 这类非经济总量来源在此被天然挡下,实测偏差 14.7%)。 */
export const CROSS_CHECK_TOLERANCE = 0.1;
/** FY duration 窗口,对齐 normalize-facts flowBucket 的 350–380 天口径。 */
const FY_DAYS_MIN = 350;
const FY_DAYS_MAX = 380;

const SHARE_TAGS = new Set([
  "EarningsPerShareDiluted",
  "EarningsPerShareBasic",
  "WeightedAverageNumberOfDilutedSharesOutstanding",
  "WeightedAverageNumberOfSharesOutstandingBasic",
]);

const localName = (key: string) => key.split(":").pop() ?? key;
const asArray = <T,>(x: T | T[] | undefined | null): T[] => (Array.isArray(x) ? x : x == null ? [] : [x]);

/** 挂牌股类 token:ticker 后缀 .A/.B → ClassA/ClassB,无后缀默认 ClassA(V/多数单挂牌类)。 */
export function listedClassToken(ticker: string): string {
  const m = ticker.toUpperCase().match(/\.([AB])$/);
  return `Class${m ? m[1] : "A"}`;
}

/** member 匹配:localName 含 token 且 token 后一位不是数字(把 V 的 CommonClassB1/B2Member 从 ClassB 排除)。 */
export function memberMatchesToken(member: string, token: string): boolean {
  const idx = member.indexOf(token);
  if (idx < 0) return false;
  const next = member.charAt(idx + token.length);
  return !/[0-9]/.test(next);
}

type AnyObj = Record<string, unknown>;

function findByLocalName(obj: AnyObj, name: string): unknown {
  for (const [k, v] of Object.entries(obj)) if (localName(k) === name) return v;
  return undefined;
}

/**
 * 提取带 ClassOfStock 维度的分股类事实。companyfacts API 在接口层剥掉带维度事实,
 * 这里读的是 filing 的提取版 XBRL instance(*_htm.xml),维度仍在 context 里。
 * 命名空间兼容:V 用默认命名空间(元素无前缀),其他 filer 可能带 xbrli: 前缀 → 一律按 localName 匹配。
 * parseTagValue:false 是硬纪律(CUSIP 科学计数法事故),数值一律显式 Number()。
 */
export function extractClassShareFacts(xml: string): ClassShareFact[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false });
  const parsed = parser.parse(xml) as AnyObj;
  const root = findByLocalName(parsed, "xbrl") as AnyObj | undefined;
  if (!root) return [];

  // context id → { start,end,classMember } (维度可在 segment 或 scenario 下)
  const contexts = new Map<string, { start: string; end: string; member: string }>();
  for (const [k, v] of Object.entries(root)) {
    if (localName(k) !== "context") continue;
    for (const ctx of asArray(v as AnyObj | AnyObj[])) {
      const id = (ctx as AnyObj)["@_id"] as string | undefined;
      const period = findByLocalName(ctx as AnyObj, "period") as AnyObj | undefined;
      if (!id || !period) continue;
      const start = findByLocalName(period, "startDate");
      const end = findByLocalName(period, "endDate");
      if (typeof start !== "string" || typeof end !== "string") continue; // instant/无 duration → 不是本回退关心的流量事实
      const entity = findByLocalName(ctx as AnyObj, "entity") as AnyObj | undefined;
      let member: string | undefined;
      for (const holder of ["segment", "scenario"]) {
        const seg = entity ? (findByLocalName(entity, holder) as AnyObj | undefined) : undefined;
        if (!seg) continue;
        for (const [mk, mv] of Object.entries(seg)) {
          if (localName(mk) !== "explicitMember") continue;
          for (const em of asArray(mv as AnyObj | AnyObj[])) {
            const dim = (em as AnyObj)["@_dimension"];
            const text = (em as AnyObj)["#text"];
            if (typeof dim === "string" && dim.includes("ClassOfStock") && typeof text === "string") {
              member = localName(text);
            }
          }
        }
      }
      if (member) contexts.set(id, { start, end, member });
    }
  }

  // 事实:root 下 localName 命中 SHARE_TAGS 的元素,contextRef 指向分股类 context
  const out: ClassShareFact[] = [];
  const seen = new Map<string, number>(); // 去重:同 (tag,member,start,end) 多次申报(spike 实测有重复);值冲突则整键剔除
  const conflicted = new Set<string>();
  for (const [k, v] of Object.entries(root)) {
    const tag = localName(k);
    if (!SHARE_TAGS.has(tag)) continue;
    for (const fact of asArray(v as AnyObj | AnyObj[])) {
      const ref = (fact as AnyObj)["@_contextRef"] as string | undefined;
      const text = (fact as AnyObj)["#text"];
      const ctx = ref ? contexts.get(ref) : undefined;
      if (!ctx || typeof text !== "string") continue;
      const value = Number(text.replace(/,/g, ""));
      if (!Number.isFinite(value)) continue;
      const key = `${tag}|${ctx.member}|${ctx.start}|${ctx.end}`;
      const prev = seen.get(key);
      if (prev != null && prev !== value) { conflicted.add(key); continue; }
      if (prev == null) {
        seen.set(key, value);
        out.push({ tag, member: ctx.member, start: ctx.start, end: ctx.end, value });
      }
    }
  }
  return out.filter((f) => !conflicted.has(`${f.tag}|${f.member}|${f.start}|${f.end}`));
}

const durationDays = (f: ClassShareFact) =>
  (new Date(f.end).getTime() - new Date(f.start).getTime()) / 86_400_000;

/**
 * 经济股数推导(spec §2.3):
 *   路线B(定值) = 该期总净利 ÷ 挂牌类 EPS —— 能复现挂牌类每股收益的经济除数,换算率(如 BRK 1:1500)天然内生;
 *   路线A(对账) = 挂牌类股数 tag。
 * 配对必须同口径(摊薄/摊薄 优先,basic/basic 兜底,不混配),双路都在且偏差 ≤10% 才接受;
 * 任一路缺、超差、净利≤0 → 该年不补(宁缺毋假)。
 */
export function deriveEconomicShares(
  facts: ClassShareFact[],
  token: string,
  periods: { period_end: string; net_income: number | null }[],
): DerivedShares[] {
  const out: DerivedShares[] = [];
  for (const p of periods) {
    if (p.net_income == null || !(p.net_income > 0)) continue;
    const inWindow = facts.filter(
      (f) => f.end === p.period_end && durationDays(f) >= FY_DAYS_MIN && durationDays(f) <= FY_DAYS_MAX && memberMatchesToken(f.member, token),
    );
    const pick = (tag: string) => inWindow.find((f) => f.tag === tag);
    const pairs: [ClassShareFact | undefined, ClassShareFact | undefined][] = [
      [pick("EarningsPerShareDiluted"), pick("WeightedAverageNumberOfDilutedSharesOutstanding")],
      [pick("EarningsPerShareBasic"), pick("WeightedAverageNumberOfSharesOutstandingBasic")],
    ];
    const pair = pairs.find(([eps, sh]) => eps != null && sh != null && eps.value > 0 && sh.value > 0);
    if (!pair) continue;
    const [eps, sharesTag] = pair as [ClassShareFact, ClassShareFact];
    const routeB = p.net_income / eps.value;
    const dev = Math.abs(sharesTag.value - routeB) / routeB;
    if (dev > CROSS_CHECK_TOLERANCE) continue;
    out.push({ period_end: p.period_end, shares: routeB, eps: eps.value, cross_check_pct: dev, member: eps.member });
  }
  return out;
}
```

- [ ] **Step 5: 跑 check 确认全绿**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/class-shares-fallback.check.ts`
Expected: `全部通过`，exit 0。

- [ ] **Step 6: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/sec/class-shares-fallback.ts web/src/lib/sec/class-shares-fallback.check.ts
git commit -m "feat(sec): 分股类经济股数推导纯函数(双路互证,换算率EPS比率内生)"
```

---

### Task 2: 回退接入 ingest + 真数据只读探针（含 V/BRK.B verdict 预览）

**Files:**
- Modify: `web/src/lib/sec/sec-client.ts`（新增 `secFetchText`）
- Modify: `web/src/lib/sec/class-shares-fallback.ts`（新增 fetch/apply 部分）
- Modify: `web/src/lib/sec/ingest.ts:188-194`（normalize 之后、落库之前挂回退）
- Create: `web/scripts/probe-multiclass-shares.ts`

**Interfaces:**
- Consumes: Task 1 的 `extractClassShareFacts` / `deriveEconomicShares` / `listedClassToken`。
- Produces:
  - `export function needsClassSharesFallback(annual: FundamentalPeriod[]): boolean`
  - `export async function applyClassSharesFallback(annual: FundamentalPeriod[], filings: NormalizedFiling[]): Promise<number>`（就地 patch 行，返回补上的年数）

- [ ] **Step 1: `sec-client.ts` 加 `secFetchText`**

照 `secFetchJson` 逐字风格：

```ts
export async function secFetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": getSecUserAgent(),
      "Accept-Encoding": "gzip, deflate"
    }
  });

  if (!response.ok) {
    throw new Error(`SEC request failed ${response.status}: ${url}`);
  }

  return response.text();
}
```

- [ ] **Step 2: `class-shares-fallback.ts` 加 fetch/apply**

文件顶部补 import：`import type { FundamentalPeriod } from "./normalize-facts";`、`import type { NormalizedFiling } from "./company-submissions";`、`import { filingIndexUrl, secFetchJson, secFetchText, sleep } from "./sec-client";`

```ts
/** 触发窄闸(spec §2.1):annual 全部年份缺 shares_diluted 且至少一年有净利。字段已有值的票零影响。 */
export function needsClassSharesFallback(annual: FundamentalPeriod[]): boolean {
  return (
    annual.length > 0 &&
    annual.every((p) => p.shares_diluted == null) &&
    annual.some((p) => p.net_income != null)
  );
}

/** 每票最多解析的 10-K 份数:每份 instance 带 3 个 FY 的利润表事实(BRK 实测),3 份覆盖 6-FY 窗口有余。 */
const MAX_10K_INSTANCES = 3;

type EdgarIndex = { directory?: { item?: { name?: string }[] } };

/** 提取版 instance 文件名 = primaryDocument 去 .htm 加 _htm.xml;404 时回退读目录 index.json 找 *_htm.xml。 */
async function fetchInstanceXml(filing: NormalizedFiling): Promise<string | null> {
  const dir = filingIndexUrl(filing.cik, filing.accession_number);
  const guess = filing.primary_document?.replace(/\.htm$/i, "_htm.xml");
  if (guess) {
    try {
      return await secFetchText(`${dir}${guess}`);
    } catch {
      // fall through to index.json
    }
  }
  try {
    const index = await secFetchJson<EdgarIndex>(`${dir}index.json`);
    const name = index.directory?.item?.map((i) => i.name).find((n) => n?.endsWith("_htm.xml"));
    if (!name) return null;
    return await secFetchText(`${dir}${name}`);
  } catch {
    return null;
  }
}

/**
 * 分股类经济股数回退(spec §2):从最近 3 份 10-K 的提取版 XBRL instance 抽分股类事实,
 * 双路互证推导经济股数,就地 patch annual 行(shares_diluted / 空缺的 eps_diluted / raw_facts 溯源)。
 * 任何异常吞掉打日志 —— 回退绝不打断主 ingest。返回补上的年数。
 */
export async function applyClassSharesFallback(annual: FundamentalPeriod[], filings: NormalizedFiling[]): Promise<number> {
  try {
    const ticker = annual[0]?.ticker;
    if (!ticker) return 0;
    const tenKs = filings
      .filter((f) => f.form === "10-K" && f.primary_document)
      .sort((a, b) => (b.filing_date ?? "").localeCompare(a.filing_date ?? ""))
      .slice(0, MAX_10K_INSTANCES);
    if (!tenKs.length) return 0;

    const facts: ClassShareFact[] = [];
    for (const filing of tenKs) {
      const xml = await fetchInstanceXml(filing);
      if (xml) facts.push(...extractClassShareFacts(xml));
      await sleep(300);
    }
    if (!facts.length) return 0; // MLP/单类缺数等:instance 里没有分股类事实 → 诚实空缺

    const token = listedClassToken(ticker);
    const derived = deriveEconomicShares(
      facts,
      token,
      annual.map((p) => ({ period_end: p.period_end, net_income: p.net_income })),
    );
    const byEnd = new Map(derived.map((d) => [d.period_end, d]));
    let patched = 0;
    for (const row of annual) {
      const d = byEnd.get(row.period_end);
      if (!d) continue;
      row.shares_diluted = Math.round(d.shares);
      if (row.eps_diluted == null) row.eps_diluted = d.eps; // 挂牌类申报 EPS,非合成值
      row.raw_facts = {
        ...row.raw_facts,
        shares_diluted: {
          tag: "class-dimension:eps-implied",
          val: String(Math.round(d.shares)),
          filed: row.filing_date ?? "",
          days: null,
          derived: true,
          member: d.member,
          cross_check_pct: d.cross_check_pct,
        },
      };
      patched++;
    }
    return patched;
  } catch (err) {
    console.error(`class-shares fallback failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    return 0;
  }
}
```

- [ ] **Step 3: 挂进 `ingest.ts`**

在 `ingest.ts` 顶部 import：`import { needsClassSharesFallback, applyClassSharesFallback } from "./class-shares-fallback";`
在 `const normalized = normalizeCompanyFacts(...)` 之后、`delete` 之前插入：

```ts
    // 分股类申报公司(V/BRK 等)在 companyfacts 拿不到无维度股数 → 从 10-K instance 的
    // ClassOfStockAxis 维度事实回退推导经济股数(spec 2026-07-26)。窄闸:全年份缺股数才触发。
    if (needsClassSharesFallback(normalized.annual)) {
      const patched = await applyClassSharesFallback(normalized.annual, filings);
      if (patched > 0) console.log(`  ${ticker}: class-dimension share fallback patched ${patched} FY rows`);
    }
```

- [ ] **Step 4: 写真数据只读探针**

`web/scripts/probe-multiclass-shares.ts`：加载 env 的样板照抄 `web/scripts/probe-ttm-basis.ts:40-49`（loadEnv → 写回 process.env）。核心逻辑：

```ts
/**
 * probe-multiclass-shares.ts — 分股类股数回退真数据验收探针(只读,不写库)。
 * 对 V / BRK.B / BRK.A:live 拉 submissions+10-K instance → 推导经济股数 →
 * 与 DB 里的 annual 行(缺股数)在内存合成 patched 行 → 走真引擎 runValuation 预览 verdict。
 * 硬断言:V 股数∈[1.8B,2.2B];BRK.B∈[2.0B,2.3B];双路偏差<1%;V/BRK.B verdict 非 null。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-multiclass-shares.ts
 */
```

流程（每票）：
1. `resolveTickerCik(ticker)` → `fetchCompanySubmissions(cik)` → `normalizeRecentFilings(ticker, submission)`（与 ingest 同路径，import 自 `@/lib/sec/*`）。
2. `getSecCompanyData(ticker)` 读 DB annual/quarterly 行（V/BRK 现状 shares 全 null）。
3. 深拷贝 annual（`structuredClone`），断言 `needsClassSharesFallback(copy) === true`，跑 `applyClassSharesFallback(copy, filings)`，打印每年 `{period_end, shares, eps, cross_check_pct}`。
4. 硬断言（失败 `process.exit(1)`）：V 最新 FY shares ∈ [1.8e9, 2.2e9]；BRK.B ∈ [2.0e9, 2.3e9]；两者 cross_check_pct < 0.01；patched ≥ 3。BRK.A 只打印不断言（挂牌 A 类，股数应 ~1.4e6 量级）。
5. verdict 预览：照 `valuation-ingest.ts:130-180` 的组装逻辑（sic 转 number → `fundamentalsToFloorInput(ticker, ticker, patchedAnnual, null, sic, sec.quarterly)` → `getLatestPrice`/`getLatestDgs10` → `runValuation`），打印 `suppressedReason / floor.kind / verdict{bucket, rangeLo, rangeHi, price, reliable}`。硬断言：V 与 BRK.B `verdict !== null`（即 G2 解除且未被 isImplausibleBand 拦）。

- [ ] **Step 5: 跑探针（需网络 + `web/.env.local`）**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-multiclass-shares.ts`
Expected: 三票推导明细 + 断言全过 + V/BRK.B verdict 非 null。**把完整输出贴进 task 汇报**（BRK.B 的 bucket/reliable 是件③立案依据）。

- [ ] **Step 6: 跑 Task 1 check + tsc 回归**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/class-shares-fallback.check.ts && npx tsc --noEmit`
Expected: 全绿。

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/sec/class-shares-fallback.ts web/src/lib/sec/sec-client.ts web/src/lib/sec/ingest.ts web/scripts/probe-multiclass-shares.ts
git commit -m "feat(sec): 10-K instance 分股类股数回退接入 ingest(V/BRK 可估值)+真数据探针"
```

---

### Task 3: 金融股口径收敛（isFinancialSic 纳入 61xx + ai_capex 金融豁免）

**Files:**
- Modify: `web/src/lib/valuation/moatCap.ts:308-322`
- Modify: `web/src/lib/valuation/epvFloor.ts:192-194`

**Interfaces:**
- Produces: `SIC_CREDIT_RANGE: [number, number]`（导出常量，Task 4 sweep 用）；`isFinancialSic` 行为扩展。

- [ ] **Step 1: 先摸清消费面**

Run: `cd web && grep -rn "isFinancialSic\|is_financial" src/ --include="*.ts" --include="*.tsx" -l`
读每处调用点，确认改动只经由 `isFinancialSic` 单点生效、无别处复刻 SIC 区间的地方。若发现复刻，停下来在汇报里说明（不要顺手改）。

- [ ] **Step 2: `moatCap.ts` 扩区间**

```ts
/** 银行(National/State Commercial Banks 等)SIC 区间。 */
export const SIC_BANK_RANGE: [number, number] = [6020, 6099];
/** 非存款类信贷机构(Nondepository Credit Institutions:AXP 6199/COF·SYF 6141 等)SIC 区间。 */
export const SIC_CREDIT_RANGE: [number, number] = [6100, 6199];
/** 保险(Fire/Marine/Casualty、Life 等)SIC 区间。 */
export const SIC_INSURANCE_RANGE: [number, number] = [6300, 6399];

/**
 * is_financial = sic∈[6020,6099]∪[6100,6199]∪[6300,6399](银行+信贷机构+保险)。
 * 61xx 于 2026-07-26 纳入:AXP(6199)/COF/SYF(6141) 与银行同为受监管的融资性资产负债表,
 * 此前漏判为非金融、被课杠杆溢价/AI-capex 工业透镜,与 D7 金融豁免意图不符。
 * 62xx 券商(GS/MS/SCHW 6211)不在此列:现行判定可用,扩围需独立校准,不搭车。
 */
export function isFinancialSic(sic: number | null | undefined): boolean {
  if (sic == null || !Number.isFinite(sic)) return false;
  return (
    (sic >= SIC_BANK_RANGE[0] && sic <= SIC_BANK_RANGE[1]) ||
    (sic >= SIC_CREDIT_RANGE[0] && sic <= SIC_CREDIT_RANGE[1]) ||
    (sic >= SIC_INSURANCE_RANGE[0] && sic <= SIC_INSURANCE_RANGE[1])
  );
}
```

- [ ] **Step 3: `epvFloor.ts` ai_capex 金融豁免**

`assembleFloor` 中原行 `const aiCapexDistortion = mc.ai_capex_distortion_warning;` 改为：

```ts
  // AI-hog 闸(capex 两年≥2×)是"维护性 capex 被增长性 capex 污染"的工业企业透镜;金融企业的
  // 资产负债表扩张由存款/应收/监管资本驱动,PP&E capex 是经营成本级小项,该透镜无判别力
  // (AXP 误伤实例:2026-07 探针)。金融股风险的既定通道是可信度闸(high_leverage && is_financial)
  // 与 SGR 封顶(spec D7),此 flag 对金融股不发布 —— 同一变量顺带流入 suppressedFlags 与
  // growthValue,三处行为一致化;maintenanceCapex 内部对 OE 的 D&A 封顶数值修正保留(量级无害)。
  const aiCapexDistortion = mc.ai_capex_distortion_warning === true && !isFinancial;
```

- [ ] **Step 4: 跑存量 check 脚本回归**

Run: `cd web && for f in src/lib/valuation/*.check.ts; do echo "== $f"; npx tsx --tsconfig scripts/tsconfig.json "$f" || echo "FAILED: $f"; done`
Expected: 全绿。若有 check 因本改动语义性失败（如断言 61xx 非金融），按新口径更新该 check 的断言与注释，不得删除断言。

- [ ] **Step 5: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/valuation/moatCap.ts web/src/lib/valuation/epvFloor.ts
git commit -m "fix(valuation): isFinancialSic 纳入 61xx 信贷机构;ai_capex 闸对金融股豁免(工业透镜误伤 AXP)"
```

---

### Task 4: 金融面回归 sweep 探针（翻转清单逐票裁决的弹药）

**Files:**
- Create: `web/scripts/probe-financial-reliability-sweep.ts`

**Interfaces:**
- Consumes: Task 3 的 `SIC_CREDIT_RANGE`；真引擎组装路径同 `valuation-ingest.ts`。

- [ ] **Step 1: 写 sweep 探针**

```ts
/**
 * probe-financial-reliability-sweep.ts — 件② 回归 sweep(只读)。
 * 对象:sec_companies 中 sic∈[6020,6099]∪[6100,6199]∪[6300,6399] 且在 valuation_snapshot
 * 或 consensus_holdings 里的票 + 非金融对照组(MSFT/GOOGL/NVDA/HRB/KLAC/COST)。
 * 每票用当前代码跑真引擎,与生产 valuation_snapshot 对比 (reliable, bucket),打印翻转表:
 *   ticker | sic | is_financial(new) | ai_flag_raw | snapshot(reliable,bucket) | now(reliable,bucket) | 预期成因
 * 预期成因判定:A=sic∈[6100,6199](is_financial 翻转) / B=is_financial && ai_flag_raw(豁免生效) / none。
 * 硬断言:①对照组 reliable/bucket 零翻转;②每个 reliable 翻转的成因 ∈ {A,B}(none → exit 1);
 * ③AXP: reliable=true 且 bucket="above"。价格漂移导致的 band 数值差不判失败,只打印。
 * ai_flag_raw 直接调 maintenanceCapex(floorInput 的 workingYears)取原始 flag(floor 对金融股已不发布)。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-financial-reliability-sweep.ts
 */
```

实现要点：env 加载样板照 `probe-ttm-basis.ts`；用 `createClient` 直连拉 `sec_companies`（select ticker,sic）与 `valuation_snapshot`（select ticker,verdict_bucket,reliable）；引擎组装照抄 `valuation-ingest.ts:130-180`（含 sic text→number、TTM、guards）；`maintenanceCapex` import 自 `@/lib/valuation/maintenanceCapex`，输入用 `workingYears(floorInput)`（import 自 `@/lib/valuation/epvFloor`）。逐票 `sleep(50)` 防 DB 压力；对 `run.verdict === null` 的票打印 `suppressedReason` 并跳过对比（生产也无行）。

- [ ] **Step 2: 跑 sweep**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-financial-reliability-sweep.ts`
Expected: 断言全过；**完整翻转表贴进 task 汇报**（供主线程逐票裁决——特别关注 SYF/BAC/WFC/COF/GS 五票的走向与成因列）。

- [ ] **Step 3: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 0 错误。

- [ ] **Step 4: Commit**

```bash
git add web/scripts/probe-financial-reliability-sweep.ts
git commit -m "chore(valuation): 金融面回归 sweep 探针(件②翻转清单+对照组零漂移断言)"
```

---

## Self-Review 记录

- Spec 覆盖：§2.1-2.5 → Task 1/2；§3.1-3.2 → Task 3；§3.3 → Task 4；§5 验收 1→T1、2→T2、3→T4、4→各 task tsc 步。§6 运维在合并后由主线程执行（不属于任务）。
- 类型一致性：`ClassShareFact/DerivedShares/needsClassSharesFallback/applyClassSharesFallback/SIC_CREDIT_RANGE` 在 Interfaces 与代码块中签名一致。
- 无占位符：所有代码步均给出完整代码或明确的照抄来源（文件:行号）。
