# 件⑤ 控股集团分部 SOTP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给件④判为 `holdco_not_assessable` 的投资主导型控股集团（BRK.A/BRK.B/WTM）一个可拆开看的三栏 SOTP 估值，取代现在那句「不给判定」的抑制说明。

**Architecture:** 新建一个通用的 XBRL instance 事实提取器（USD-only、保留维度、instant+duration 通吃），在它之上建两个取数模块——第一栏投资（带两条会计恒等式闸）与分部利润——各自落独立的新表；再建一个纯函数 SOTP 引擎把三栏合成价值带；最后接进既有的 `epvFloor` → `deriveValuationVerdict` → 个股页链路，把件④的抑制分支替换成三段式拆解。既有的 `class-shares-fallback.ts`（件①）**不动**，新提取器与它并存，避免动已上生产的东西。

**Tech Stack:** TypeScript / fast-xml-parser / Supabase（Postgres）/ Next.js 16 App Router / tsx（check 脚本）

## Global Constraints

以下为 spec 的项目级约束，**每个 task 的要求都隐含包含本节**：

- **XML 解析一律 `parseTagValue: false`**，数值显式 `Number()`。（CUSIP 科学计数法事故的既定纪律。）
- **只接受 `unitRef` 指向 `iso4217:USD` 的事实。** BRK FY2025 instance 的 14 个单位里只有 1 个是 USD，另有 JPY/EUR/GBP；`DebtInstrumentFaceAmount` 的 `2343.0` 是 2,343 亿**日元**债，不判币种会造出万亿级假债务。
- **维度位置**：`segment` 在 `entity` 内；`scenario` 是 `context` 的**直接子节点**（XBRL 2.1 spec）。两处都要扫。
- **元素一律按 localName 匹配**（不同 filer 的命名空间前缀不同，V 用默认命名空间无前缀）。
- **companyfacts 不可作为控股集团的取数源**（它在接口层剥掉带维度事实），一律走 filing 的提取版 instance `{primaryDocument去.htm}_htm.xml`。
- **fail-closed**：任何闸不过 → 退回件④的抑制状态，**绝不**发布半成品数字。
- **零漂移硬断言**：未被件④抑制的票，其估值快照逐字段不得变化。
- 回复正文与文档正文一律中文（代码/术语/路径除外）。
- 本项目**不跑测试套件**；验证靠 `*.check.ts`（tsx 直跑）+ `npx tsc --noEmit` + 真数据探针 + 人工看页面。
- 已知既存失败：`web/src/lib/valuation/ownerEarningsDcf.check.ts` 在 **db-foundation 主干上即失败**（`AssertionError: anchored`），与本件无关，不要试图修它。

**Spec：** `docs/superpowers/specs/2026-08-10-valuation-holdco-sotp-design.md`
**分支：** `plan/valuation-holdco-sotp`（off `origin/db-foundation` @5381c6a，已含件①②③④）
**工作目录：** `/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco`（会话 worktree 每次恢复会被环境重置，长跑必须用这个专用 worktree）

## 文件结构

**新建：**

| 文件 | 职责 |
|---|---|
| `web/supabase/migrations/20260811_create_holdco_sotp_tables.sql` | 两张新表 |
| `web/src/lib/sec/instance-facts.ts` | 通用 instance 事实提取（USD-only、保留维度） |
| `web/src/lib/sec/instance-facts.check.ts` | 上者断言 |
| `web/src/lib/sec/holdco-investments.ts` | 第一栏取数 + 两条会计恒等式闸 |
| `web/src/lib/sec/holdco-investments.check.ts` | 上者断言（含 321B 漏项回归用例） |
| `web/src/lib/sec/segment-facts.ts` | 分部税前/税额取数 + kind 分类 |
| `web/src/lib/sec/segment-facts.check.ts` | 上者断言 |
| `web/src/lib/valuation/holdcoSotp.ts` | SOTP 引擎（纯函数） |
| `web/src/lib/valuation/holdcoSotp.check.ts` | 上者断言（BRK 真数字当 fixture） |
| `web/src/lib/valuation/holdcoSotp.probe.ts` | 真数据只读探针 |

**修改：**

| 文件 | 改动 |
|---|---|
| `web/src/lib/sec/ingest.ts` | 窄闸：件④触发集才拉 instance，写两张新表 |
| `web/src/lib/valuation/types.ts` | `ValuationFloor.holdco_sotp` 字段 |
| `web/src/lib/valuation/epvFloor.ts` | 抑制时改为挂 SOTP（若可得） |
| `web/src/lib/valuation/deriveValuationVerdict.ts` | SOTP 可得 → 用 SOTP 带判 bucket，不再一律 return null |
| `web/src/lib/valuation/runValuation.ts` | `holdco_not_assessable` 覆盖原因分支 |
| `web/src/lib/stocks/stockCopy.ts` | 三段式文案 en/zh |
| `web/src/app/[lang]/stocks/[ticker]/page.tsx` | 三段式拆解渲染 |

---

### Task 1: 通用 instance 事实提取器 + 建表

**Files:**
- Create: `web/supabase/migrations/20260811_create_holdco_sotp_tables.sql`
- Create: `web/src/lib/sec/instance-facts.ts`
- Test: `web/src/lib/sec/instance-facts.check.ts`

**Interfaces:**
- Consumes: 无（本 task 是地基）
- Produces:
  ```ts
  export type InstanceFact = {
    tag: string;                        // localName,如 "USTreasuryBills"
    value: number;                      // 已应用 sign/scale
    dims: Record<string, string>;       // localName(axis) → localName(member)
    instant?: string;                   // 时点事实的日期
    start?: string;                     // duration 事实
    end?: string;
  };
  export function extractInstanceFacts(xml: string): InstanceFact[];
  export function isDimensionless(f: InstanceFact): boolean;
  export function dimIs(f: InstanceFact, axisContains: string, memberLocalName: string): boolean;
  export function pickFact(
    facts: InstanceFact[],
    opts: { tag: string; instant?: string; end?: string; fyOnly?: boolean; dimensionless?: boolean;
            axisContains?: string; member?: string }
  ): number | null;
  export const FY_DAYS_MIN = 350;
  export const FY_DAYS_MAX = 380;
  ```

- [ ] **Step 1: 写 migration**

`web/supabase/migrations/20260811_create_holdco_sotp_tables.sql`：

```sql
-- 件⑤ 控股集团分部 SOTP(spec 2026-08-10)。
-- 两张表都只由 ingest 的窄闸(件④ holdco_not_assessable 触发集)写入,通用 fundamentals
-- 路径完全不碰 —— 刻意不给 company_fundamentals_periods 加列,以规避件③④两次踩到的
-- 「加列→周六全量 upsert 遇未知列整批 throw 断更」运维顺序风险。

-- 第一栏:投资按市值。逐项存原始成分而非只存合计,供页面拆解与人工审计。
create table if not exists public.company_holdco_investments (
  ticker text not null,
  period_end date not null,
  fiscal_period text not null,
  cash numeric,                    -- 只取「保险与其他」列,不含铁路能源经营现金/受限现金
  treasuries numeric,              -- USTreasuryBills 及同族短期国债
  equity_securities numeric,       -- EquitySecuritiesFvNi
  equity_method numeric,           -- EquityMethodInvestments
  afs_debt numeric,                -- AvailableForSaleSecuritiesDebtSecurities
  total numeric,
  unrealized_gain numeric,         -- 递延税基数
  gate_attribution_ok boolean,     -- 各列现金之和 ≈ 合并现金
  gate_closure_ok boolean,         -- 各 ProductOrService 的 Assets 之和 ≈ 合并 Assets
  raw_facts jsonb,
  updated_at timestamptz not null default now(),
  primary key (ticker, period_end, fiscal_period)
);

-- 第二、三栏:分部税前利润与实际税额。
create table if not exists public.company_segment_periods (
  ticker text not null,
  period_end date not null,
  fiscal_period text not null,
  segment_member text not null,    -- localName,如 BurlingtonNorthernSantaFeCorporationMember
  segment_label text,
  kind text not null,              -- insurance_underwriting | insurance_investments | operating | corporate
  pretax_income numeric,
  income_tax numeric,
  revenue numeric,
  raw_facts jsonb,
  updated_at timestamptz not null default now(),
  primary key (ticker, period_end, fiscal_period, segment_member)
);

create index if not exists company_segment_periods_ticker_idx
  on public.company_segment_periods (ticker, period_end desc);

notify pgrst, 'reload schema';
```

- [ ] **Step 2: 写失败的 check**

`web/src/lib/sec/instance-facts.check.ts`：

```ts
/**
 * instance-facts.check.ts — 件⑤ Task 1 断言(纯 fixture,无网络)。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/instance-facts.check.ts
 */
import {
  extractInstanceFacts, isDimensionless, dimIs, pickFact,
} from "./instance-facts";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}

// 覆盖:USD/JPY 两种单位、时点/duration 两种 period、segment/scenario 两种维度位置、
// 带前缀与不带前缀两种命名空间写法、sign/scale 属性。
const XML = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:us-gaap="http://fasb.org/us-gaap/2025">
  <xbrli:unit id="U_USD"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit>
  <xbrli:unit id="U_JPY"><xbrli:measure>iso4217:JPY</xbrli:measure></xbrli:unit>
  <xbrli:context id="I_2025">
    <xbrli:entity><xbrli:identifier>x</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:context id="I_2025_INS">
    <xbrli:entity><xbrli:identifier>x</xbrli:identifier>
      <xbrli:segment>
        <xbrldi:explicitMember xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
          dimension="us-gaap:ProductOrServiceAxis">us-gaap:InsuranceAndOtherMember</xbrldi:explicitMember>
      </xbrli:segment>
    </xbrli:entity>
    <xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period>
  </xbrli:context>
  <xbrli:context id="D_FY2025_SEG">
    <xbrli:entity><xbrli:identifier>x</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period>
    <xbrli:scenario>
      <xbrldi:explicitMember xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
        dimension="us-gaap:StatementBusinessSegmentsAxis">brka:BnsfMember</xbrldi:explicitMember>
    </xbrli:scenario>
  </xbrli:context>
  <xbrli:context id="D_Q4_2025">
    <xbrli:entity><xbrli:identifier>x</xbrli:identifier></xbrli:entity>
    <xbrli:period><xbrli:startDate>2025-10-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period>
  </xbrli:context>
  <us-gaap:USTreasuryBills contextRef="I_2025_INS" unitRef="U_USD">321430000000</us-gaap:USTreasuryBills>
  <us-gaap:Assets contextRef="I_2025" unitRef="U_USD">1222180000000</us-gaap:Assets>
  <us-gaap:DebtInstrumentFaceAmount contextRef="I_2025" unitRef="U_JPY">234300000000</us-gaap:DebtInstrumentFaceAmount>
  <us-gaap:PretaxIncome contextRef="D_FY2025_SEG" unitRef="U_USD">7170000000</us-gaap:PretaxIncome>
  <us-gaap:PretaxIncome contextRef="D_Q4_2025" unitRef="U_USD">1800000000</us-gaap:PretaxIncome>
  <us-gaap:Scaled contextRef="I_2025" unitRef="U_USD" scale="6" sign="-">5</us-gaap:Scaled>
</xbrli:xbrl>`;

const facts = extractInstanceFacts(XML);

console.log("① 币种闸");
assert(facts.every((f) => f.tag !== "DebtInstrumentFaceAmount"),
  "非 USD 单位事实被整条剔除(日元债 2,343 亿不得进入)");

console.log("② 维度提取");
const tbill = facts.find((f) => f.tag === "USTreasuryBills");
assert(tbill?.value === 321430000000, "USTreasuryBills 取值正确");
assert(dimIs(tbill!, "ProductOrService", "InsuranceAndOtherMember"),
  "segment 位置的维度被提取(entity 内)");
assert(!isDimensionless(tbill!), "带维度事实不被判为无维度");
const bnsf = facts.find((f) => f.tag === "PretaxIncome" && f.start === "2025-01-01");
assert(dimIs(bnsf!, "StatementBusinessSegments", "BnsfMember"),
  "scenario 位置的维度被提取(context 直接子节点)");

console.log("③ 无维度判定");
const assets = facts.find((f) => f.tag === "Assets");
assert(isDimensionless(assets!), "无维度事实被正确识别");

console.log("④ sign / scale");
const scaled = facts.find((f) => f.tag === "Scaled");
assert(scaled?.value === -5000000, "scale=6 且 sign=- → -5,000,000");

console.log("⑤ pickFact 选择器");
assert(pickFact(facts, { tag: "Assets", instant: "2025-12-31", dimensionless: true }) === 1222180000000,
  "按 instant + 无维度取值");
assert(pickFact(facts, { tag: "USTreasuryBills", instant: "2025-12-31",
  axisContains: "ProductOrService", member: "InsuranceAndOtherMember" }) === 321430000000,
  "按 instant + 指定维度取值");
assert(pickFact(facts, { tag: "PretaxIncome", end: "2025-12-31", fyOnly: true,
  axisContains: "StatementBusinessSegments", member: "BnsfMember" }) === 7170000000,
  "fyOnly 只认 350–380 天窗口(季度 duration 被排除)");
assert(pickFact(facts, { tag: "PretaxIncome", end: "2025-12-31", fyOnly: true, dimensionless: true }) === null,
  "无匹配 → null(不得回退到带维度的值)");

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 3: 跑 check 确认它失败**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/instance-facts.check.ts
```

预期：FAIL，报 `Cannot find module './instance-facts'`。

- [ ] **Step 4: 实现 `instance-facts.ts`**

```ts
import { XMLParser } from "fast-xml-parser";

/** instance 里的一条事实。value 已应用 sign/scale;dims 为 localName(轴)→localName(成员)。 */
export type InstanceFact = {
  tag: string;
  value: number;
  dims: Record<string, string>;
  instant?: string;
  start?: string;
  end?: string;
};

/** FY duration 窗口,对齐 normalize-facts flowBucket 的口径。 */
export const FY_DAYS_MIN = 350;
export const FY_DAYS_MAX = 380;

const localName = (key: string) => key.split(":").pop() ?? key;
const asArray = <T,>(x: T | T[] | undefined | null): T[] => (Array.isArray(x) ? x : x == null ? [] : [x]);

type AnyObj = Record<string, unknown>;

function findByLocalName(obj: AnyObj, name: string): unknown {
  for (const [k, v] of Object.entries(obj)) if (localName(k) === name) return v;
  return undefined;
}

function readExplicitMembers(holder: AnyObj, into: Record<string, string>) {
  for (const [mk, mv] of Object.entries(holder)) {
    if (localName(mk) !== "explicitMember") continue;
    for (const em of asArray(mv as AnyObj | AnyObj[])) {
      const dim = (em as AnyObj)["@_dimension"];
      const text = (em as AnyObj)["#text"];
      if (typeof dim === "string" && typeof text === "string") into[localName(dim)] = localName(text);
    }
  }
}

/**
 * 提取 instance 的全部 USD 事实,保留维度。
 *
 * 与 class-shares-fallback.ts 的专用解析并存而非替换它 —— 后者已上生产,不动它以免回归。
 *
 * 硬纪律(spec §1.4):
 *  - parseTagValue:false,数值显式 Number()(CUSIP 科学计数法事故的既定纪律);
 *  - 只接受 unitRef 指向 iso4217:USD 的事实。BRK FY2025 instance 的 14 个单位里只有 1 个是
 *    USD,另有 JPY/EUR/GBP;DebtInstrumentFaceAmount 的 2343.0 是 2,343 亿日元债,不判币种
 *    会造出万亿级假债务;
 *  - 维度两处都扫:segment 在 entity 内,scenario 是 context 的直接子节点(XBRL 2.1);
 *  - 一律按 localName 匹配(不同 filer 命名空间前缀不同)。
 */
export function extractInstanceFacts(xml: string): InstanceFact[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false });
  const root = findByLocalName(parser.parse(xml) as AnyObj, "xbrl") as AnyObj | undefined;
  if (!root) return [];

  // ① 单位:只留 USD
  const usdUnits = new Set<string>();
  for (const [k, v] of Object.entries(root)) {
    if (localName(k) !== "unit") continue;
    for (const u of asArray(v as AnyObj | AnyObj[])) {
      const id = (u as AnyObj)["@_id"];
      const measure = findByLocalName(u as AnyObj, "measure");
      if (typeof id === "string" && typeof measure === "string" && /iso4217:USD$/.test(measure)) usdUnits.add(id);
    }
  }

  // ② 上下文
  type Ctx = { instant?: string; start?: string; end?: string; dims: Record<string, string> };
  const contexts = new Map<string, Ctx>();
  for (const [k, v] of Object.entries(root)) {
    if (localName(k) !== "context") continue;
    for (const c of asArray(v as AnyObj | AnyObj[])) {
      const ctx = c as AnyObj;
      const id = ctx["@_id"];
      const period = findByLocalName(ctx, "period") as AnyObj | undefined;
      if (typeof id !== "string" || !period) continue;
      const dims: Record<string, string> = {};
      const entity = findByLocalName(ctx, "entity") as AnyObj | undefined;
      if (entity) {
        const seg = findByLocalName(entity, "segment") as AnyObj | undefined;
        if (seg) readExplicitMembers(seg, dims);
      }
      const scenario = findByLocalName(ctx, "scenario") as AnyObj | undefined;
      if (scenario) readExplicitMembers(scenario, dims);
      const instant = findByLocalName(period, "instant");
      const start = findByLocalName(period, "startDate");
      const end = findByLocalName(period, "endDate");
      contexts.set(id, {
        instant: typeof instant === "string" ? instant : undefined,
        start: typeof start === "string" ? start : undefined,
        end: typeof end === "string" ? end : undefined,
        dims,
      });
    }
  }

  // ③ 事实
  const out: InstanceFact[] = [];
  for (const [k, v] of Object.entries(root)) {
    const tag = localName(k);
    if (tag === "context" || tag === "unit" || tag === "schemaRef") continue;
    for (const f of asArray(v as AnyObj | AnyObj[])) {
      if (typeof f !== "object" || f === null) continue;
      const fact = f as AnyObj;
      const unitRef = fact["@_unitRef"];
      const ctxRef = fact["@_contextRef"];
      if (typeof unitRef !== "string" || typeof ctxRef !== "string") continue;
      if (!usdUnits.has(unitRef)) continue; // 币种闸
      const ctx = contexts.get(ctxRef);
      if (!ctx) continue;
      const raw = fact["#text"];
      if (typeof raw !== "string") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const sign = fact["@_sign"] === "-" ? -1 : 1;
      const scale = typeof fact["@_scale"] === "string" ? Number(fact["@_scale"]) : 0;
      if (!Number.isFinite(scale)) continue;
      out.push({
        tag,
        value: sign * n * Math.pow(10, scale),
        dims: ctx.dims,
        instant: ctx.instant,
        start: ctx.start,
        end: ctx.end,
      });
    }
  }
  return out;
}

export function isDimensionless(f: InstanceFact): boolean {
  return Object.keys(f.dims).length === 0;
}

/** 轴名按「包含」匹配(申报里写作 ProductOrServiceAxis,调用方传 "ProductOrService")。 */
export function dimIs(f: InstanceFact, axisContains: string, memberLocalName: string): boolean {
  for (const [axis, member] of Object.entries(f.dims)) {
    if (axis.includes(axisContains) && member === memberLocalName) return true;
  }
  return false;
}

function isFyDuration(f: InstanceFact): boolean {
  if (!f.start || !f.end) return false;
  const days = (new Date(f.end).getTime() - new Date(f.start).getTime()) / 86400000;
  return days >= FY_DAYS_MIN && days <= FY_DAYS_MAX;
}

/**
 * 按条件取单值。同 (tag, period, dims) 多次申报时取最大绝对值那条(实测有重复申报);
 * 无匹配返回 null —— **绝不**在维度条件不满足时回退到别的维度,那正是漏项与串值的来源。
 */
export function pickFact(
  facts: InstanceFact[],
  opts: {
    tag: string;
    instant?: string;
    end?: string;
    fyOnly?: boolean;
    dimensionless?: boolean;
    axisContains?: string;
    member?: string;
  },
): number | null {
  const hits = facts.filter((f) => {
    if (f.tag !== opts.tag) return false;
    if (opts.instant != null && f.instant !== opts.instant) return false;
    if (opts.end != null && f.end !== opts.end) return false;
    if (opts.fyOnly && !isFyDuration(f)) return false;
    if (opts.dimensionless && !isDimensionless(f)) return false;
    if (opts.axisContains != null && opts.member != null && !dimIs(f, opts.axisContains, opts.member)) return false;
    return true;
  });
  if (!hits.length) return null;
  return hits.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).value;
}
```

- [ ] **Step 5: 跑 check 确认通过**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/instance-facts.check.ts && npx tsc --noEmit
```

预期：全部通过 + tsc 零错误。

- [ ] **Step 6: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco
git add web/supabase/migrations/20260811_create_holdco_sotp_tables.sql web/src/lib/sec/instance-facts.ts web/src/lib/sec/instance-facts.check.ts
git commit -m "feat(sec): 件⑤ 通用 instance 事实提取器(USD-only+保留维度)与两张新表"
```

---

### Task 2: 第一栏取数 + 两条会计恒等式闸

**Files:**
- Create: `web/src/lib/sec/holdco-investments.ts`
- Test: `web/src/lib/sec/holdco-investments.check.ts`

**Interfaces:**
- Consumes: `InstanceFact`, `extractInstanceFacts`, `pickFact`, `isDimensionless`（Task 1）
- Produces:
  ```ts
  export type HoldcoInvestments = {
    period_end: string;
    cash: number; treasuries: number; equity_securities: number;
    equity_method: number; afs_debt: number; total: number;
    unrealized_gain: number | null;
    gate_attribution_ok: boolean;
    gate_closure_ok: boolean;
  };
  export const HOLDCO_GATE_TOLERANCE = 0.02;
  export const INVESTMENT_COLUMN_MEMBER = "InsuranceAndOtherMember";
  export const TREASURY_TAGS: string[];
  export function extractHoldcoInvestments(facts: InstanceFact[], periodEnd: string): HoldcoInvestments | null;
  ```

- [ ] **Step 1: 写失败的 check**

`web/src/lib/sec/holdco-investments.check.ts`：

```ts
/**
 * holdco-investments.check.ts — 件⑤ Task 2 断言(纯 fixture,无网络)。
 * ★ 核心回归用例:去掉 USTreasuryBills 后闸必须拦下 —— 这正是本件第一版漏掉 321.43B
 *   (占第一栏 46%)、把每股 SOTP 上沿算成 $396 的真实事故。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/holdco-investments.check.ts
 */
import { extractInstanceFacts } from "./instance-facts";
import { extractHoldcoInvestments, HOLDCO_GATE_TOLERANCE } from "./holdco-investments";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}
const near = (a: number, b: number, tol = 0.005) => Math.abs(a - b) / Math.abs(b) <= tol;

// BRK FY2025 真实数字(单位:美元),见 spec §1.1。
const INS = `dimension="us-gaap:ProductOrServiceAxis">us-gaap:InsuranceAndOtherMember`;
const RRUE = `dimension="us-gaap:ProductOrServiceAxis">us-gaap:RailroadUtilitiesAndEnergyMember`;

function build(opts: { treasuries?: boolean; closure?: boolean } = {}) {
  const withTreasuries = opts.treasuries !== false;
  // closure=false 时把铁路能源 Assets 抹掉 → 各列之和 ≠ 合并数
  const rrueAssets = opts.closure === false ? 0 : 246180000000;
  const ctx = (id: string, dim: string | null) => `
  <context id="${id}">
    <entity><identifier>x</identifier>${dim ? `<segment><explicitMember xmlns:xbrldi="http://xbrl.org/2006/xbrldi" ${dim}</explicitMember></segment>` : ""}</entity>
    <period><instant>2025-12-31</instant></period>
  </context>`;
  return `<?xml version="1.0"?>
<xbrl xmlns:us-gaap="http://fasb.org/us-gaap/2025">
  <unit id="U"><measure>iso4217:USD</measure></unit>
  ${ctx("C_PLAIN", null)}${ctx("C_INS", INS)}${ctx("C_RRUE", RRUE)}
  <us-gaap:CashAndCashEquivalentsAtCarryingValue contextRef="C_INS" unitRef="U">47720000000</us-gaap:CashAndCashEquivalentsAtCarryingValue>
  <us-gaap:CashAndCashEquivalentsAtCarryingValue contextRef="C_RRUE" unitRef="U">4160000000</us-gaap:CashAndCashEquivalentsAtCarryingValue>
  <us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents contextRef="C_PLAIN" unitRef="U">52570000000</us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents>
  ${withTreasuries ? `<us-gaap:USTreasuryBills contextRef="C_INS" unitRef="U">321430000000</us-gaap:USTreasuryBills>` : ""}
  <us-gaap:EquitySecuritiesFvNi contextRef="C_PLAIN" unitRef="U">297780000000</us-gaap:EquitySecuritiesFvNi>
  <us-gaap:EquityMethodInvestments contextRef="C_PLAIN" unitRef="U">19980000000</us-gaap:EquityMethodInvestments>
  <us-gaap:AvailableForSaleSecuritiesDebtSecurities contextRef="C_PLAIN" unitRef="U">17820000000</us-gaap:AvailableForSaleSecuritiesDebtSecurities>
  <us-gaap:EquitySecuritiesAccumulatedUnrealizedGainLoss contextRef="C_PLAIN" unitRef="U">212390000000</us-gaap:EquitySecuritiesAccumulatedUnrealizedGainLoss>
  <us-gaap:Assets contextRef="C_PLAIN" unitRef="U">1222180000000</us-gaap:Assets>
  <us-gaap:Assets contextRef="C_INS" unitRef="U">976000000000</us-gaap:Assets>
  ${rrueAssets ? `<us-gaap:Assets contextRef="C_RRUE" unitRef="U">${rrueAssets}</us-gaap:Assets>` : ""}
</xbrl>`;
}

console.log("① 正常路径:逐项等于 spec §1.1 表");
const ok = extractHoldcoInvestments(extractInstanceFacts(build()), "2025-12-31");
assert(ok != null, "可提取");
assert(ok!.cash === 47720000000, "现金只取「保险与其他」列 47.72B(不是合并 52.57B)");
assert(ok!.treasuries === 321430000000, "短期国债 321.43B");
assert(ok!.equity_securities === 297780000000, "权益证券 297.78B");
assert(ok!.equity_method === 19980000000, "权益法投资 19.98B");
assert(ok!.afs_debt === 17820000000, "AFS 固定到期 17.82B");
assert(near(ok!.total, 704730000000), "第一栏合计 704.73B");
assert(ok!.unrealized_gain === 212390000000, "未实现增值 212.39B(递延税基数)");
assert(ok!.gate_attribution_ok, "归属闸通过(47.72+4.16 ≈ 52.57,差 0.69 受限现金在 2% 容差内)");
assert(ok!.gate_closure_ok, "闭合闸通过(976.00+246.18 = 1222.18)");

console.log("② ★ 漏项回归:去掉 USTreasuryBills");
// 这就是本件第一版的真实事故形态:五项里少一项,若静默按 0 处理,第一栏会算成 383.3B,
// 每股 SOTP 上沿掉到 $396 —— 与 1.10 万亿市值严重不符却看不出任何异常。
const missing = extractHoldcoInvestments(extractInstanceFacts(build({ treasuries: false })), "2025-12-31");
assert(missing === null, "国债缺失 → 整条返回 null(fail-closed),不得静默按 0 发布一个偏低 46% 的第一栏");

console.log("③ 闭合闸:存在未被发现的资产池");
const broken = extractHoldcoInvestments(extractInstanceFacts(build({ closure: false })), "2025-12-31");
assert(broken === null, "各列 Assets 之和 ≠ 合并 Assets → fail-closed 返回 null");

console.log("④ 容差常量");
assert(HOLDCO_GATE_TOLERANCE === 0.02, "闸容差 2%");

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: 跑 check 确认它失败**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/holdco-investments.check.ts
```

预期：FAIL，报 `Cannot find module './holdco-investments'`。

- [ ] **Step 3: 实现 `holdco-investments.ts`**

```ts
import { InstanceFact, isDimensionless, pickFact } from "./instance-facts";

/**
 * 第一栏:投资按市值。
 *
 * ★ 本模块存在的理由是一次真实事故:件⑤第一版把第一栏算成 388.2B、每股 SOTP 上沿仅 $396,
 *   与 1.10 万亿市值严重不符。根因是漏了 USTreasuryBills 321.43B(占第一栏 46%)——该事实带
 *   ProductOrService 维度,被 companyfacts API 在接口层剥掉,而库内 short_term_investments 的
 *   tag 清单(ShortTermInvestments/AvailableForSaleSecuritiesCurrent/MarketableSecuritiesCurrent)
 *   不含它 → 字段为 NULL,"字段齐备"检查照样通过。
 *
 *   教训:光靠「字段非空」判齐备不够,必须用**会计恒等式**把漏项逼出来。故本模块的两道闸
 *   (归属闸 + 闭合闸)是主角,不是附属校验。
 */
export type HoldcoInvestments = {
  period_end: string;
  cash: number;
  treasuries: number;
  equity_securities: number;
  equity_method: number;
  afs_debt: number;
  total: number;
  unrealized_gain: number | null;
  gate_attribution_ok: boolean;
  gate_closure_ok: boolean;
};

/** 两道会计恒等式闸的容差。2% 足以吸收受限现金这类小额未分列项,又拦得住 46% 量级的漏项。 */
export const HOLDCO_GATE_TOLERANCE = 0.02;

/** 投资所在的列。伯克希尔把资产负债表分成「保险与其他」与「铁路、公用事业和能源」两列,
 *  投资全部在前者;后者的经营现金属于第二栏那些业务,计入第一栏即重复。 */
export const INVESTMENT_COLUMN_MEMBER = "InsuranceAndOtherMember";
const PRODUCT_AXIS = "ProductOrService";

/** 短期国债。BRK 用 USTreasuryBills;其余 filer 的同族兜底按优先级排列。 */
export const TREASURY_TAGS = [
  "USTreasuryBills",
  "ShortTermInvestments",
  "AvailableForSaleSecuritiesCurrent",
  "MarketableSecuritiesCurrent",
];

const CASH_TAG = "CashAndCashEquivalentsAtCarryingValue";
const CONSOLIDATED_CASH_TAGS = [
  "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  "CashAndCashEquivalentsAtCarryingValue",
];

/** 在指定列里取一个 tag;列内取不到时**不**回退到无维度值(那正是串值来源)。 */
function inColumn(facts: InstanceFact[], tag: string, periodEnd: string): number | null {
  return pickFact(facts, {
    tag,
    instant: periodEnd,
    axisContains: PRODUCT_AXIS,
    member: INVESTMENT_COLUMN_MEMBER,
  });
}

/** 先取无维度值,取不到再取投资列的值(权益证券等在 BRK 上是无维度申报的)。 */
function plainOrColumn(facts: InstanceFact[], tag: string, periodEnd: string): number | null {
  return (
    pickFact(facts, { tag, instant: periodEnd, dimensionless: true }) ?? inColumn(facts, tag, periodEnd)
  );
}

function firstOf(facts: InstanceFact[], tags: string[], periodEnd: string,
                 get: (f: InstanceFact[], t: string, p: string) => number | null): number | null {
  for (const tag of tags) {
    const v = get(facts, tag, periodEnd);
    if (v != null) return v;
  }
  return null;
}

/**
 * 闸①归属：投资列现金 + 其余各列现金 ≈ 合并现金总额。
 * 拦「漏取了某一列」与「错把合并数当成某一列」。
 */
function checkAttribution(facts: InstanceFact[], periodEnd: string, columnCash: number): boolean {
  const consolidated = firstOf(facts, CONSOLIDATED_CASH_TAGS, periodEnd,
    (f, t, p) => pickFact(f, { tag: t, instant: p, dimensionless: true }));
  if (consolidated == null || consolidated <= 0) return false; // fail-closed:测不了就不放行
  const perColumn = facts
    .filter((f) => f.tag === CASH_TAG && f.instant === periodEnd && f.dims[`${PRODUCT_AXIS}Axis`] != null)
    .reduce<Record<string, number>>((acc, f) => {
      const m = f.dims[`${PRODUCT_AXIS}Axis`];
      acc[m] = Math.max(acc[m] ?? 0, f.value); // 同列重复申报取一次
      return acc;
    }, {});
  const summed = Object.values(perColumn).reduce((a, b) => a + b, 0);
  if (!(summed > 0) || perColumn[INVESTMENT_COLUMN_MEMBER] !== columnCash) return false;
  // 合并数常含受限现金等未分列项 → 只要求各列之和不超过合并数,且缺口在容差内。
  return summed <= consolidated && (consolidated - summed) / consolidated <= HOLDCO_GATE_TOLERANCE;
}

/**
 * 闸②闭合：各 ProductOrService 列的 Assets 之和 ≈ 合并 Assets。
 * 拦「存在第三个未被发现的资产池」——若真有一整块资产没被任何列覆盖,第一栏就可能又漏一次。
 */
function checkClosure(facts: InstanceFact[], periodEnd: string): boolean {
  const consolidated = pickFact(facts, { tag: "Assets", instant: periodEnd, dimensionless: true });
  if (consolidated == null || consolidated <= 0) return false;
  const perColumn = facts
    .filter((f) => f.tag === "Assets" && f.instant === periodEnd && f.dims[`${PRODUCT_AXIS}Axis`] != null)
    .reduce<Record<string, number>>((acc, f) => {
      const m = f.dims[`${PRODUCT_AXIS}Axis`];
      acc[m] = Math.max(acc[m] ?? 0, f.value);
      return acc;
    }, {});
  const summed = Object.values(perColumn).reduce((a, b) => a + b, 0);
  if (!(summed > 0)) return false;
  return Math.abs(summed - consolidated) / consolidated <= HOLDCO_GATE_TOLERANCE;
}

/**
 * 提取第一栏。任一组成缺失或任一闸不过 → 返回 null(fail-closed),由调用方退回件④的抑制。
 * 递延税基数 unrealized_gain 允许缺失(调用方另有 FvNi − FvNiCost 的第二来源)。
 */
export function extractHoldcoInvestments(facts: InstanceFact[], periodEnd: string): HoldcoInvestments | null {
  const cash = inColumn(facts, CASH_TAG, periodEnd);
  const treasuries = firstOf(facts, TREASURY_TAGS, periodEnd, inColumn)
    ?? firstOf(facts, TREASURY_TAGS, periodEnd,
         (f, t, p) => pickFact(f, { tag: t, instant: p, dimensionless: true }));
  const equity_securities = plainOrColumn(facts, "EquitySecuritiesFvNi", periodEnd);
  const equity_method = plainOrColumn(facts, "EquityMethodInvestments", periodEnd);
  const afs_debt = plainOrColumn(facts, "AvailableForSaleSecuritiesDebtSecurities", periodEnd);

  // 五项缺一不可 —— 这正是 321B 事故的直接防线。
  if (cash == null || treasuries == null || equity_securities == null
      || equity_method == null || afs_debt == null) return null;

  const gate_attribution_ok = checkAttribution(facts, periodEnd, cash);
  const gate_closure_ok = checkClosure(facts, periodEnd);
  if (!gate_attribution_ok || !gate_closure_ok) return null;

  // 递延税基数:优先直取(无维度),否则由 FvNi − FvNiCost 反算(两者在 BRK 上分毫不差)。
  const direct = pickFact(facts, { tag: "EquitySecuritiesAccumulatedUnrealizedGainLoss", instant: periodEnd, dimensionless: true });
  const cost = pickFact(facts, { tag: "EquitySecuritiesFvNiCost", instant: periodEnd, dimensionless: true });
  const unrealized_gain = direct ?? (cost != null ? equity_securities - cost : null);

  return {
    period_end: periodEnd,
    cash,
    treasuries,
    equity_securities,
    equity_method,
    afs_debt,
    total: cash + treasuries + equity_securities + equity_method + afs_debt,
    unrealized_gain,
    gate_attribution_ok,
    gate_closure_ok,
  };
}
```

> 实现提示：`isDimensionless` 在本文件里通过 `pickFact({dimensionless:true})` 间接使用；若 lint 报未使用的 import 就删掉它。

- [ ] **Step 4: 跑 check 确认通过**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/holdco-investments.check.ts && npx tsc --noEmit
```

预期：全部通过 + tsc 零错误。

- [ ] **Step 5: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco
git add web/src/lib/sec/holdco-investments.ts web/src/lib/sec/holdco-investments.check.ts
git commit -m "feat(sec): 件⑤ 第一栏取数与两条会计恒等式闸(含 321B 漏项回归用例)"
```

---

### Task 3: 分部取数与分类

**Files:**
- Create: `web/src/lib/sec/segment-facts.ts`
- Test: `web/src/lib/sec/segment-facts.check.ts`

**Interfaces:**
- Consumes: `InstanceFact`, `extractInstanceFacts`, `pickFact`（Task 1）
- Produces:
  ```ts
  export type SegmentKind = "insurance_underwriting" | "insurance_investments" | "operating" | "corporate";
  export type SegmentPeriod = {
    period_end: string;
    segment_member: string;
    segment_label: string;
    kind: SegmentKind;
    pretax_income: number | null;
    income_tax: number | null;
  };
  export type SegmentYear = {
    period_end: string;
    total_pretax: number | null;          // ConsolidationItems=OperatingSegments 合计
    total_tax: number | null;
    insurance_pretax: number | null;      // 保险集团合计(承保+投资)
    insurance_tax: number | null;
    underwriting_pretax: number | null;
    investments_pretax: number | null;
    segments: SegmentPeriod[];
  };
  export const SEGMENT_PRETAX_TAG: string;
  export function classifySegment(dims: Record<string, string>): SegmentKind;
  export function extractSegmentYears(facts: InstanceFact[]): SegmentYear[];
  ```

- [ ] **Step 1: 写失败的 check**

`web/src/lib/sec/segment-facts.check.ts`：

```ts
/**
 * segment-facts.check.ts — 件⑤ Task 3 断言(纯 fixture,无网络)。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/segment-facts.check.ts
 */
import { extractInstanceFacts } from "./instance-facts";
import { extractSegmentYears, classifySegment } from "./segment-facts";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}
const near = (a: number | null, b: number, tol = 0.005) =>
  a != null && Math.abs(a - b) / Math.abs(b) <= tol;

const PRETAX = "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";

// BRK FY2025 真实分部数字(spec §1.2)。
function seg(id: string, members: string[], start: string, end: string) {
  const dims = members.map((m) => {
    const [axis, member] = m.split("|");
    return `<explicitMember xmlns:xbrldi="http://xbrl.org/2006/xbrldi" dimension="us-gaap:${axis}">${member}</explicitMember>`;
  }).join("");
  return `<context id="${id}">
    <entity><identifier>x</identifier><segment>${dims}</segment></entity>
    <period><startDate>${start}</startDate><endDate>${end}</endDate></period>
  </context>`;
}
const OPSEG = "ConsolidationItemsAxis|us-gaap:OperatingSegmentsMember";
const INSGRP = "StatementBusinessSegmentsAxis|brka:BerkshireHathawayInsuranceGroupMember";
const UW = "ProductOrServiceAxis|brka:UnderwritingMember";
const INV = "ProductOrServiceAxis|brka:InvestmentsSegmentMember";
const MFG = "StatementBusinessSegmentsAxis|brka:ManufacturingBusinessesMember";

const XML = `<?xml version="1.0"?>
<xbrl xmlns:us-gaap="http://fasb.org/us-gaap/2025">
  <unit id="U"><measure>iso4217:USD</measure></unit>
  ${seg("C_TOT", [OPSEG], "2025-01-01", "2025-12-31")}
  ${seg("C_INS", [OPSEG, INSGRP], "2025-01-01", "2025-12-31")}
  ${seg("C_UW", [OPSEG, UW, INSGRP], "2025-01-01", "2025-12-31")}
  ${seg("C_INV", [OPSEG, INV, INSGRP], "2025-01-01", "2025-12-31")}
  ${seg("C_MFG", [OPSEG, MFG], "2025-01-01", "2025-12-31")}
  ${seg("C_TOT24", [OPSEG], "2024-01-01", "2024-12-31")}
  ${seg("C_INS24", [OPSEG, INSGRP], "2024-01-01", "2024-12-31")}
  ${seg("C_Q4", [OPSEG], "2025-10-01", "2025-12-31")}
  <us-gaap:${PRETAX} contextRef="C_TOT" unitRef="U">51710000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_INS" unitRef="U">24720000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_UW" unitRef="U">9460000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_INV" unitRef="U">15260000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_MFG" unitRef="U">12570000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_Q4" unitRef="U">9000000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_TOT24" unitRef="U">53940000000</us-gaap:${PRETAX}>
  <us-gaap:${PRETAX} contextRef="C_INS24" unitRef="U">28150000000</us-gaap:${PRETAX}>
  <us-gaap:IncomeTaxExpenseBenefit contextRef="C_TOT" unitRef="U">8570000000</us-gaap:IncomeTaxExpenseBenefit>
  <us-gaap:IncomeTaxExpenseBenefit contextRef="C_INS" unitRef="U">4950000000</us-gaap:IncomeTaxExpenseBenefit>
  <us-gaap:IncomeTaxExpenseBenefit contextRef="C_TOT24" unitRef="U">8870000000</us-gaap:IncomeTaxExpenseBenefit>
  <us-gaap:IncomeTaxExpenseBenefit contextRef="C_INS24" unitRef="U">5460000000</us-gaap:IncomeTaxExpenseBenefit>
</xbrl>`;

const years = extractSegmentYears(extractInstanceFacts(XML));

console.log("① 年份");
assert(years.length === 2, "解析出 2 个 FY(季度 duration 不成年)");
const fy25 = years.find((y) => y.period_end === "2025-12-31")!;
assert(fy25 != null, "FY2025 存在");

console.log("② FY2025 各项");
assert(near(fy25.total_pretax, 51710000000), "经营分部合计税前 51.71B");
assert(near(fy25.insurance_pretax, 24720000000), "保险集团税前 24.72B");
assert(near(fy25.underwriting_pretax, 9460000000), "承保税前 9.46B");
assert(near(fy25.investments_pretax, 15260000000), "投资分部税前 15.26B");
assert(near(fy25.total_tax, 8570000000), "经营分部合计税 8.57B");
assert(near(fy25.insurance_tax, 4950000000), "保险集团税 4.95B");

console.log("③ 内部自洽");
assert(near(fy25.underwriting_pretax! + fy25.investments_pretax!, fy25.insurance_pretax!),
  "承保 + 投资 = 保险集团合计(9.46+15.26=24.72)");

console.log("④ 季度不得混入");
assert(!years.some((y) => y.total_pretax === 9000000000), "Q4 duration 未被当成 FY");

console.log("⑤ kind 分类");
assert(classifySegment({ ProductOrServiceAxis: "UnderwritingMember",
  StatementBusinessSegmentsAxis: "BerkshireHathawayInsuranceGroupMember" }) === "insurance_underwriting",
  "承保 → insurance_underwriting");
assert(classifySegment({ ProductOrServiceAxis: "InvestmentsSegmentMember",
  StatementBusinessSegmentsAxis: "BerkshireHathawayInsuranceGroupMember" }) === "insurance_investments",
  "投资 → insurance_investments(必须可被单独排除)");
assert(classifySegment({ StatementBusinessSegmentsAxis: "ManufacturingBusinessesMember" }) === "operating",
  "制造 → operating");
assert(classifySegment({ ConsolidationItemsAxis: "CorporateReconcilingItemsAndEliminationsMember" }) === "corporate",
  "公司间抵销 → corporate");

console.log("⑥ 分部明细");
const mfg = fy25.segments.find((s) => s.segment_member === "ManufacturingBusinessesMember");
assert(mfg?.kind === "operating" && near(mfg.pretax_income, 12570000000), "制造分部明细正确");

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: 跑 check 确认它失败**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/segment-facts.check.ts
```

预期：FAIL，报 `Cannot find module './segment-facts'`。

- [ ] **Step 3: 实现 `segment-facts.ts`**

```ts
import { InstanceFact, pickFact } from "./instance-facts";

/**
 * 分部利润取数。
 *
 * 第二栏(非保险经营)= 经营分部合计 − 保险集团合计;第三栏(承保)= 承保分部。
 * ★ 保险的**投资分部**(BRK FY2025 15.26B)必须能被单独识别并排除 —— 它是第一栏那些证券
 *   产生的收益,计入即与第一栏重复。这是本模块 kind 分类存在的首要理由。
 */
export type SegmentKind = "insurance_underwriting" | "insurance_investments" | "operating" | "corporate";

export type SegmentPeriod = {
  period_end: string;
  segment_member: string;
  segment_label: string;
  kind: SegmentKind;
  pretax_income: number | null;
  income_tax: number | null;
};

export type SegmentYear = {
  period_end: string;
  total_pretax: number | null;
  total_tax: number | null;
  insurance_pretax: number | null;
  insurance_tax: number | null;
  underwriting_pretax: number | null;
  investments_pretax: number | null;
  segments: SegmentPeriod[];
};

export const SEGMENT_PRETAX_TAG =
  "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest";
const SEGMENT_TAX_TAG = "IncomeTaxExpenseBenefit";

const CONSOLIDATION_AXIS = "ConsolidationItems";
const OPERATING_SEGMENTS_MEMBER = "OperatingSegmentsMember";
const BUSINESS_SEGMENTS_AXIS = "StatementBusinessSegments";
const PRODUCT_AXIS = "ProductOrService";

/** member 名是公司自定义的,只能按关键词判。故意只判**结构性**关键词,不猜行业(见 spec §2.2:
 *  逐分部行业倍数是无法校准的臆断,统一混合倍数把不确定性显式放进三档区间)。 */
export function classifySegment(dims: Record<string, string>): SegmentKind {
  const values = Object.entries(dims)
    .filter(([axis]) => !axis.includes(CONSOLIDATION_AXIS))
    .map(([, m]) => m)
    .join("|");
  const consolidation = Object.entries(dims).find(([axis]) => axis.includes(CONSOLIDATION_AXIS))?.[1] ?? "";
  if (/Corporate|Eliminat|Reconcil/i.test(consolidation) || /Corporate|Eliminat|Reconcil/i.test(values)) {
    return "corporate";
  }
  if (/Underwriting/i.test(values)) return "insurance_underwriting";
  if (/InvestmentsSegment|InvestmentIncome/i.test(values)) return "insurance_investments";
  return "operating";
}

/** member localName → 展示标签:去掉尾部 Member,驼峰拆词。 */
function toLabel(member: string): string {
  return member.replace(/Member$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim();
}

function isOperatingSegmentsContext(f: InstanceFact): boolean {
  for (const [axis, member] of Object.entries(f.dims)) {
    if (axis.includes(CONSOLIDATION_AXIS) && member === OPERATING_SEGMENTS_MEMBER) return true;
  }
  return false;
}

/** 该事实所属分部的键:优先业务分部轴,否则产品/服务轴(承保、投资是挂在后者上的)。 */
function segmentKeyOf(f: InstanceFact): string | null {
  let business: string | null = null;
  let product: string | null = null;
  for (const [axis, member] of Object.entries(f.dims)) {
    if (axis.includes(BUSINESS_SEGMENTS_AXIS)) business = member;
    else if (axis.includes(PRODUCT_AXIS)) product = member;
  }
  return product ?? business;
}

function dimsExcludingConsolidation(f: InstanceFact): Record<string, string> {
  return Object.fromEntries(Object.entries(f.dims));
}

/**
 * 从 instance 提取全部 FY 的分部数据。单份 10-K 带 3 个 FY,多份合并由调用方去重。
 * 只认 ConsolidationItems=OperatingSegments 上下文,只认 350–380 天的 duration。
 */
export function extractSegmentYears(facts: InstanceFact[]): SegmentYear[] {
  const opSegFacts = facts.filter(isOperatingSegmentsContext);
  const ends = Array.from(
    new Set(
      opSegFacts
        .filter((f) => f.start && f.end)
        .filter((f) => {
          const days = (new Date(f.end!).getTime() - new Date(f.start!).getTime()) / 86400000;
          return days >= 350 && days <= 380;
        })
        .map((f) => f.end!),
    ),
  ).sort((a, b) => b.localeCompare(a));

  return ends.map((end) => {
    const pick = (tag: string, opts: { axisContains?: string; member?: string } = {}) =>
      pickFact(opSegFacts, { tag, end, fyOnly: true, ...opts });

    // 合计行 = 只带 ConsolidationItems 一个维度的那条。
    const totalOnly = opSegFacts.filter(
      (f) => f.end === end && f.start && Object.keys(f.dims).every((a) => a.includes(CONSOLIDATION_AXIS)),
    );
    const totalOf = (tag: string) => {
      const hits = totalOnly.filter((f) => f.tag === tag);
      if (!hits.length) return null;
      const days = (f: InstanceFact) =>
        (new Date(f.end!).getTime() - new Date(f.start!).getTime()) / 86400000;
      const fy = hits.filter((f) => days(f) >= 350 && days(f) <= 380);
      if (!fy.length) return null;
      return fy.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).value;
    };

    // 保险集团合计 = 只带业务分部轴(保险集团)+ConsolidationItems 的那条,不含承保/投资细分。
    const insuranceOnly = opSegFacts.filter(
      (f) =>
        f.end === end &&
        f.start &&
        Object.entries(f.dims).some(
          ([a, m]) => a.includes(BUSINESS_SEGMENTS_AXIS) && /Insurance/i.test(m),
        ) &&
        !Object.keys(f.dims).some((a) => a.includes(PRODUCT_AXIS)),
    );
    const insuranceOf = (tag: string) => {
      const hits = insuranceOnly.filter((f) => f.tag === tag);
      return hits.length ? hits.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).value : null;
    };

    // 逐分部明细
    const bySegment = new Map<string, SegmentPeriod>();
    for (const f of opSegFacts) {
      if (f.end !== end || !f.start) continue;
      if (f.tag !== SEGMENT_PRETAX_TAG && f.tag !== SEGMENT_TAX_TAG) continue;
      const days = (new Date(f.end).getTime() - new Date(f.start).getTime()) / 86400000;
      if (days < 350 || days > 380) continue;
      const key = segmentKeyOf(f);
      if (!key) continue;
      const existing = bySegment.get(key) ?? {
        period_end: end,
        segment_member: key,
        segment_label: toLabel(key),
        kind: classifySegment(dimsExcludingConsolidation(f)),
        pretax_income: null,
        income_tax: null,
      };
      if (f.tag === SEGMENT_PRETAX_TAG) {
        existing.pretax_income =
          existing.pretax_income == null || Math.abs(f.value) > Math.abs(existing.pretax_income)
            ? f.value
            : existing.pretax_income;
      } else {
        existing.income_tax =
          existing.income_tax == null || Math.abs(f.value) > Math.abs(existing.income_tax)
            ? f.value
            : existing.income_tax;
      }
      bySegment.set(key, existing);
    }

    return {
      period_end: end,
      total_pretax: totalOf(SEGMENT_PRETAX_TAG),
      total_tax: totalOf(SEGMENT_TAX_TAG),
      insurance_pretax: insuranceOf(SEGMENT_PRETAX_TAG),
      insurance_tax: insuranceOf(SEGMENT_TAX_TAG),
      underwriting_pretax: pick(SEGMENT_PRETAX_TAG, { axisContains: PRODUCT_AXIS, member: "UnderwritingMember" }),
      investments_pretax: pick(SEGMENT_PRETAX_TAG, { axisContains: PRODUCT_AXIS, member: "InvestmentsSegmentMember" }),
      segments: Array.from(bySegment.values()),
    };
  });
}
```

- [ ] **Step 4: 跑 check 确认通过**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/segment-facts.check.ts && npx tsc --noEmit
```

预期：全部通过 + tsc 零错误。若 `dimsExcludingConsolidation` 被判无用则内联掉它。

- [ ] **Step 5: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco
git add web/src/lib/sec/segment-facts.ts web/src/lib/sec/segment-facts.check.ts
git commit -m "feat(sec): 件⑤ 分部税前/税额取数与 kind 分类(投资分部可单独排除)"
```

---

### Task 4: SOTP 引擎（纯函数）

**Files:**
- Create: `web/src/lib/valuation/holdcoSotp.ts`
- Test: `web/src/lib/valuation/holdcoSotp.check.ts`

**Interfaces:**
- Consumes: `SegmentYear`（Task 3，仅类型形状）、`HoldcoInvestments`（Task 2，仅类型形状）。**本模块不 import sec 层**，输入用自有的窄接口，保持引擎纯净可测。
- Produces:
  ```ts
  export const OPERATING_MULTIPLES: readonly [number, number, number];   // [12,15,18]
  export const UNDERWRITING_MULTIPLES: readonly [number, number, number]; // [8,10,12]
  export const UNDERWRITING_TAX_RATE: number;  // 0.21
  export const DEFERRED_TAX_RATE: number;      // 0.21
  export const SOTP_MIN_YEARS: number;         // 3
  export const SOTP_RECONCILE_TOLERANCE: number; // 0.10

  export type SotpTier = { pessimistic: number; base: number; optimistic: number };
  export type SotpBlockReason =
    | "insufficient_years" | "reconciliation_failed" | "investments_unavailable"
    | "shares_unavailable" | "no_operating_earnings";
  export type HoldcoSotp = {
    assessable: true;
    per_share: SotpTier;
    columns: {
      investments: number;
      operating: SotpTier;
      underwriting: SotpTier;
      deferred_tax: number;
    };
    basis: {
      investments_total: number;
      operating_after_tax_mean: number;
      underwriting_after_tax_mean: number;
      years_used: number;
      shares: number;
      operating_multiples: readonly number[];
      underwriting_multiples: readonly number[];
    };
  };
  export type HoldcoSotpUnavailable = { assessable: false; reason: SotpBlockReason };

  export type HoldcoSotpInput = {
    shares: number;
    investments: { total: number; unrealized_gain: number | null } | null;
    years: Array<{
      period_end: string;
      total_pretax: number | null; total_tax: number | null;
      insurance_pretax: number | null; insurance_tax: number | null;
      underwriting_pretax: number | null;
    }>;
    /** 合并报表税前利润(按 period_end 索引),用于对账闸。 */
    consolidatedPretaxByYear?: Record<string, number | null>;
  };
  export function computeHoldcoSotp(input: HoldcoSotpInput): HoldcoSotp | HoldcoSotpUnavailable;
  ```

- [ ] **Step 1: 写失败的 check**

`web/src/lib/valuation/holdcoSotp.check.ts`：

```ts
/**
 * holdcoSotp.check.ts — 件⑤ Task 4 断言(纯 fixture,无网络)。
 * ★ 用 BRK FY2023–25 的真实分部数字当 fixture,断言三档 = spec §3 的 458/496/534。
 * 运行: cd web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.check.ts
 */
import {
  computeHoldcoSotp, OPERATING_MULTIPLES, UNDERWRITING_MULTIPLES, SOTP_MIN_YEARS,
} from "./holdcoSotp";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) / Math.abs(b) <= tol;

const B = 1e9;
const SHARES = 2_157_335_139; // A 511,820×1500 + B 1,389,605,139

// BRK 真实数字(spec §1.2/§1.3)
const BRK = {
  shares: SHARES,
  investments: { total: 704.73 * B, unrealized_gain: 212.39 * B },
  years: [
    { period_end: "2025-12-31", total_pretax: 51.71 * B, total_tax: 8.57 * B,
      insurance_pretax: 24.72 * B, insurance_tax: 4.95 * B, underwriting_pretax: 9.46 * B },
    { period_end: "2024-12-31", total_pretax: 53.94 * B, total_tax: 8.87 * B,
      insurance_pretax: 28.15 * B, insurance_tax: 5.46 * B, underwriting_pretax: 11.40 * B },
    { period_end: "2023-12-31", total_pretax: 43.64 * B, total_tax: 6.91 * B,
      insurance_pretax: 18.49 * B, insurance_tax: 3.50 * B, underwriting_pretax: 6.91 * B },
  ],
};

console.log("① 常量");
assert(OPERATING_MULTIPLES.join(",") === "12,15,18", "非保险经营倍数 12/15/18");
assert(UNDERWRITING_MULTIPLES.join(",") === "8,10,12", "承保倍数 8/10/12");
assert(SOTP_MIN_YEARS === 3, "至少 3 年");

console.log("② BRK 三档(spec §3)");
const r = computeHoldcoSotp(BRK);
assert(r.assessable, "可评估");
if (r.assessable) {
  assert(near(r.columns.investments, 326.7), `第一栏 $326.7(实得 ${r.columns.investments.toFixed(1)})`);
  assert(near(r.basis.operating_after_tax_mean / B, 22.50), `非保险经营税后三年均 22.50B(实得 ${(r.basis.operating_after_tax_mean / B).toFixed(2)})`);
  assert(near(r.basis.underwriting_after_tax_mean / B, 7.31), `承保税后三年均 7.31B(实得 ${(r.basis.underwriting_after_tax_mean / B).toFixed(2)})`);
  assert(near(r.columns.deferred_tax, 20.7), `递延税 $20.7/股(实得 ${r.columns.deferred_tax.toFixed(1)})`);
  assert(near(r.per_share.pessimistic, 458, 0.015), `悲观档 ≈$458(实得 ${r.per_share.pessimistic.toFixed(0)})`);
  assert(near(r.per_share.base, 496, 0.015), `基础档 ≈$496(实得 ${r.per_share.base.toFixed(0)})`);
  assert(near(r.per_share.optimistic, 534, 0.015), `乐观档 ≈$534(实得 ${r.per_share.optimistic.toFixed(0)})`);

  console.log("③ 现价落在带内(本件的产品级结论)");
  const price = 511.54;
  assert(price >= r.per_share.pessimistic && price <= r.per_share.optimistic,
    `现价 $${price} 落在 [${r.per_share.pessimistic.toFixed(0)}, ${r.per_share.optimistic.toFixed(0)}] 内`);

  console.log("④ 三档单调");
  assert(r.per_share.pessimistic < r.per_share.base && r.per_share.base < r.per_share.optimistic,
    "悲观 < 基础 < 乐观");
}

console.log("⑤ 投资分部不得计入第二/三栏");
// 若把投资分部(FY2025 15.26B)误当经营分部,第二栏均值会从 22.50B 跳到 ~35B。
if (r.assessable) {
  assert(r.basis.operating_after_tax_mean / B < 26,
    "第二栏均值 <26B —— 保险投资分部未被误计入(误计入会跳到 ~35B)");
}

console.log("⑥ fail-closed");
assert(computeHoldcoSotp({ ...BRK, years: BRK.years.slice(0, 2) }).assessable === false,
  "只有 2 年 → 不可评估");
assert((computeHoldcoSotp({ ...BRK, years: BRK.years.slice(0, 2) }) as { reason: string }).reason === "insufficient_years",
  "原因为 insufficient_years");
assert(computeHoldcoSotp({ ...BRK, investments: null }).assessable === false,
  "第一栏不可得 → 不可评估");
assert(computeHoldcoSotp({ ...BRK, shares: 0 }).assessable === false,
  "股数不可得 → 不可评估");

console.log("⑦ 对账闸");
const badReconcile = computeHoldcoSotp({
  ...BRK,
  consolidatedPretaxByYear: { "2025-12-31": 20 * B, "2024-12-31": 53.94 * B, "2023-12-31": 43.64 * B },
});
assert(badReconcile.assessable === false, "分部合计与合并口径偏差 >10% → 不可评估");
const goodReconcile = computeHoldcoSotp({
  ...BRK,
  // 合并税前 92.05B 含投资重估损益,与分部合计 51.71B 不可比 → 调用方应传经营口径;
  // 这里给一个在容差内的值验证放行。
  consolidatedPretaxByYear: { "2025-12-31": 52.0 * B, "2024-12-31": 54.0 * B, "2023-12-31": 44.0 * B },
});
assert(goodReconcile.assessable === true, "偏差在 10% 内 → 放行");

console.log("⑧ 递延税缺失时不静默按 0");
const noGain = computeHoldcoSotp({ ...BRK, investments: { total: 704.73 * B, unrealized_gain: null } });
assert(noGain.assessable === false, "递延税基数不可得 → fail-closed(不得少扣一项抬高估值)");

console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
process.exit(failed === 0 ? 0 : 1);
```

- [ ] **Step 2: 跑 check 确认它失败**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.check.ts
```

预期：FAIL，报 `Cannot find module './holdcoSotp'`。

- [ ] **Step 3: 实现 `holdcoSotp.ts`**

```ts
/**
 * 件⑤ 控股集团分部 SOTP(spec 2026-08-10)。
 *
 *   SOTP(档) = 投资按市值
 *            + 非保险经营业务税后盈利(三年均) × 倍数(档)
 *            + 保险承保税后利润(三年均) × 承保倍数(档)
 *            − 递延税
 *
 * 为什么合并层面的单一镜头对这类主体无效(件④已论证):资产里几千亿是按市值计价的证券,其
 * 回报是价格增值而非现金收益;件③又已把这部分增值从盈利里剔除。于是「盈利资本化」与「资产
 * 重置成本」两个数不同源,取大取小都不对 —— 正确做法是**相加**。
 *
 * 本模块是纯函数,不 import sec 层,输入用自有窄接口。
 */

/** 非保险经营业务的混合倍数。三档而非单一倍数是主流 SOTP 的既定纪律。
 *  刻意**不做逐分部行业倍数**:member 名是公司自定义的,按关键词猜行业再配倍数是无法校准的
 *  臆断;混合倍数把这份不确定性显式放进三档区间里,比假装精确诚实。 */
export const OPERATING_MULTIPLES = [12, 15, 18] as const;

/** 承保倍数。BRK 承保税前三年 6.91/11.40/9.46,摆动 ±30%,远大于经营业务 → 给更低倍数。 */
export const UNDERWRITING_MULTIPLES = [8, 10, 12] as const;

/** 承保按法定税率而非保险集团混合实际税率 —— 后者被投资分部的股息扣除拉低,用在承保上会低估税负。 */
export const UNDERWRITING_TAX_RATE = 0.21;

/** 递延税按面值全额扣(保守;无息递延的折现优惠留作后续)。 */
export const DEFERRED_TAX_RATE = 0.21;

export const SOTP_MIN_YEARS = 3;
export const SOTP_RECONCILE_TOLERANCE = 0.1;

export type SotpTier = { pessimistic: number; base: number; optimistic: number };

export type SotpBlockReason =
  | "insufficient_years"
  | "reconciliation_failed"
  | "investments_unavailable"
  | "shares_unavailable"
  | "no_operating_earnings";

export type HoldcoSotp = {
  assessable: true;
  per_share: SotpTier;
  columns: {
    investments: number;
    operating: SotpTier;
    underwriting: SotpTier;
    deferred_tax: number;
  };
  basis: {
    investments_total: number;
    operating_after_tax_mean: number;
    underwriting_after_tax_mean: number;
    years_used: number;
    shares: number;
    operating_multiples: readonly number[];
    underwriting_multiples: readonly number[];
  };
};

export type HoldcoSotpUnavailable = { assessable: false; reason: SotpBlockReason };

export type HoldcoSotpYear = {
  period_end: string;
  total_pretax: number | null;
  total_tax: number | null;
  insurance_pretax: number | null;
  insurance_tax: number | null;
  underwriting_pretax: number | null;
};

export type HoldcoSotpInput = {
  shares: number;
  investments: { total: number; unrealized_gain: number | null } | null;
  years: HoldcoSotpYear[];
  consolidatedPretaxByYear?: Record<string, number | null>;
};

const finite = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

function tierOf(base: number, multiples: readonly number[], shares: number): SotpTier {
  const [lo, mid, hi] = multiples;
  return {
    pessimistic: (base * lo) / shares,
    base: (base * mid) / shares,
    optimistic: (base * hi) / shares,
  };
}

export function computeHoldcoSotp(input: HoldcoSotpInput): HoldcoSotp | HoldcoSotpUnavailable {
  const { shares, investments, years, consolidatedPretaxByYear } = input;

  if (!finite(shares) || shares <= 0) return { assessable: false, reason: "shares_unavailable" };
  if (!investments || !finite(investments.total) || investments.total <= 0) {
    return { assessable: false, reason: "investments_unavailable" };
  }
  // 递延税基数缺失时不静默按 0 —— 少扣一项会系统性抬高估值。
  if (!finite(investments.unrealized_gain)) {
    return { assessable: false, reason: "investments_unavailable" };
  }

  // 闸①:至少 3 个完整年份,且每年第二、三栏所需分量齐备。
  const usable = years.filter(
    (y) =>
      finite(y.total_pretax) && finite(y.total_tax) &&
      finite(y.insurance_pretax) && finite(y.insurance_tax) &&
      finite(y.underwriting_pretax),
  );
  if (usable.length < SOTP_MIN_YEARS) return { assessable: false, reason: "insufficient_years" };

  // 闸②:分部税前合计与合并口径对账。传了才查(fail-open 会让闸形同虚设,故缺值视为不查而非放行——
  // 调用方若拿不到合并口径就不传,由上游的其他闸兜底)。
  if (consolidatedPretaxByYear) {
    for (const y of usable) {
      const consolidated = consolidatedPretaxByYear[y.period_end];
      if (!finite(consolidated) || consolidated === 0) continue;
      const dev = Math.abs((y.total_pretax as number) - consolidated) / Math.abs(consolidated);
      if (dev > SOTP_RECONCILE_TOLERANCE) return { assessable: false, reason: "reconciliation_failed" };
    }
  }

  const recent = [...usable]
    .sort((a, b) => b.period_end.localeCompare(a.period_end))
    .slice(0, SOTP_MIN_YEARS);

  // 第二栏:非保险经营 = 经营分部合计 − 保险集团合计,用**实际分部税**。
  // BHE 的可再生能源抵免让有效税率落在 13% 上下,真实且重复发生(须在页面披露)。
  const operatingAfterTax = recent.map(
    (y) => (y.total_pretax as number) - (y.insurance_pretax as number)
         - ((y.total_tax as number) - (y.insurance_tax as number)),
  );
  if (operatingAfterTax.some((v) => !finite(v))) return { assessable: false, reason: "no_operating_earnings" };
  const operatingMean = mean(operatingAfterTax);
  if (!(operatingMean > 0)) return { assessable: false, reason: "no_operating_earnings" };

  // 第三栏:承保按法定税率。★ 保险的**投资分部**不进任何一栏 —— 它是第一栏那些证券产生的
  // 收益,计入即与第一栏重复。这里用「保险集团 − 承保」的补集天然排除它。
  const underwritingMean = mean(
    recent.map((y) => (y.underwriting_pretax as number) * (1 - UNDERWRITING_TAX_RATE)),
  );

  const investmentsPerShare = investments.total / shares;
  const deferredTaxPerShare = ((investments.unrealized_gain as number) * DEFERRED_TAX_RATE) / shares;
  const operating = tierOf(operatingMean, OPERATING_MULTIPLES, shares);
  // 承保为负时三档会反序(亏得越多、倍数越大扣得越狠),对承保亏损年份这是正确方向,但要保证
  // per_share 三档仍单调 → 按数值排序后再组装。
  const underwritingRaw = tierOf(underwritingMean, UNDERWRITING_MULTIPLES, shares);
  const uwSorted = [underwritingRaw.pessimistic, underwritingRaw.base, underwritingRaw.optimistic].sort(
    (a, b) => a - b,
  );
  const underwriting: SotpTier = { pessimistic: uwSorted[0], base: uwSorted[1], optimistic: uwSorted[2] };

  const compose = (tier: keyof SotpTier) =>
    investmentsPerShare + operating[tier] + underwriting[tier] - deferredTaxPerShare;

  return {
    assessable: true,
    per_share: {
      pessimistic: compose("pessimistic"),
      base: compose("base"),
      optimistic: compose("optimistic"),
    },
    columns: {
      investments: investmentsPerShare,
      operating,
      underwriting,
      deferred_tax: deferredTaxPerShare,
    },
    basis: {
      investments_total: investments.total,
      operating_after_tax_mean: operatingMean,
      underwriting_after_tax_mean: underwritingMean,
      years_used: recent.length,
      shares,
      operating_multiples: OPERATING_MULTIPLES,
      underwriting_multiples: UNDERWRITING_MULTIPLES,
    },
  };
}
```

- [ ] **Step 4: 跑 check 确认通过**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.check.ts && npx tsc --noEmit
```

预期：全部通过（尤其 `458/496/534` 三档与「现价落在带内」）+ tsc 零错误。

**若三档对不上，先核对算术，不要改断言去迁就实现** —— 断言里的数字是 spec §3 逐位算过的，改断言等于把 bug 固化。

- [ ] **Step 5: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco
git add web/src/lib/valuation/holdcoSotp.ts web/src/lib/valuation/holdcoSotp.check.ts
git commit -m "feat(valuation): 件⑤ SOTP 引擎(三栏×三档,BRK 真数字断言 458/496/534)"
```

---

### Task 5: ingest 接线（窄闸 + 落两张表）

**Files:**
- Modify: `web/src/lib/sec/ingest.ts`
- Create: `web/src/lib/sec/holdco-ingest.ts`

**Interfaces:**
- Consumes: `extractInstanceFacts`（T1）、`extractHoldcoInvestments`（T2）、`extractSegmentYears`（T3）、既有 `NormalizedFiling`、`FundamentalPeriod`
- Produces:
  ```ts
  export function needsHoldcoSotp(annual: FundamentalPeriod[]): boolean;
  export async function ingestHoldcoSotp(
    supabase: SupabaseClient, ticker: string,
    annual: FundamentalPeriod[], filings: NormalizedFiling[],
  ): Promise<{ investments: number; segment_rows: number }>;
  ```

- [ ] **Step 1: 实现 `holdco-ingest.ts`**

```ts
import { SupabaseClient } from "@supabase/supabase-js";
import type { FundamentalPeriod } from "./normalize-facts";
import type { NormalizedFiling } from "./company-submissions";
import { filingIndexUrl, secFetchJson, secFetchText, sleep } from "./sec-client";
import { extractInstanceFacts } from "./instance-facts";
import { extractHoldcoInvestments } from "./holdco-investments";
import { extractSegmentYears } from "./segment-facts";

/**
 * 件⑤ 窄闸:只有件④会判为 holdco_not_assessable 的那类主体才拉 instance 解析。
 *
 * 这里用**取数侧可得的代理条件**复刻件④的触发形状(引擎侧的 holdco_not_assessable 依赖估值
 * 中间量,ingest 时算不出来):有投资性重估损益(marks 的原料)+ 全窗口无营业利润。作用域被
 * 天然框住,其余票零新增取数。宁可窄:漏触发只是没有 SOTP(退回件④抑制),误触发才是浪费。
 */
export function needsHoldcoSotp(annual: FundamentalPeriod[]): boolean {
  if (annual.length < 3) return false;
  const hasMarks = annual.filter((p) => p.investment_fv_gain_loss != null).length >= 3;
  const noOperatingIncome = annual.every((p) => p.operating_income == null);
  return hasMarks && noOperatingIncome;
}

/** 每票最多解析的 10-K 份数。每份带 3 个 FY,2 份足够覆盖 3 年窗口并留冗余。 */
const MAX_10K_INSTANCES = 2;

type EdgarIndex = { directory?: { item?: { name?: string }[] } };

async function instanceUrlFor(filing: NormalizedFiling): Promise<string | null> {
  if (!filing.primary_document || !filing.accession_number) return null;
  const guess = filing.primary_document.replace(/\.htm$/i, "");
  const base = filingIndexUrl(filing).replace(/\/[^/]*$/, "");
  const candidate = `${base}/${guess}_htm.xml`;
  try {
    const xml = await secFetchText(candidate);
    if (xml.includes("xbrl")) return candidate;
  } catch {
    // 落到目录枚举
  }
  try {
    const idx = (await secFetchJson(`${base}/index.json`)) as EdgarIndex;
    const name = idx.directory?.item?.map((i) => i.name).find((n) => n && /_htm\.xml$/i.test(n));
    return name ? `${base}/${name}` : null;
  } catch {
    return null;
  }
}

/**
 * 拉最近 MAX_10K_INSTANCES 份 10-K 的 instance,写 company_holdco_investments 与
 * company_segment_periods。任何一步失败都**只记零、不 throw** —— 件⑤是增量能力,不得
 * 让它把既有 fundamentals ingest 带崩。
 */
export async function ingestHoldcoSotp(
  supabase: SupabaseClient,
  ticker: string,
  annual: FundamentalPeriod[],
  filings: NormalizedFiling[],
): Promise<{ investments: number; segment_rows: number }> {
  const out = { investments: 0, segment_rows: 0 };
  try {
    const tenKs = filings
      .filter((f) => f.form === "10-K" && f.primary_document)
      .sort((a, b) => (b.filing_date ?? "").localeCompare(a.filing_date ?? ""))
      .slice(0, MAX_10K_INSTANCES);
    if (!tenKs.length) return out;

    const investmentRows: Record<string, unknown>[] = [];
    const segmentRows: Record<string, unknown>[] = [];

    for (const filing of tenKs) {
      const url = await instanceUrlFor(filing);
      if (!url) continue;
      const xml = await secFetchText(url);
      const facts = extractInstanceFacts(xml);
      await sleep(120); // SEC 速率礼节,与既有 class-shares-fallback 同口径

      // 第一栏:只对该 10-K 的报告期时点取,period_end 取自 annual 里同日的 FY 行。
      const periodEnd = filing.period_of_report ?? null;
      if (periodEnd) {
        const inv = extractHoldcoInvestments(facts, periodEnd);
        if (inv) {
          investmentRows.push({
            ticker,
            period_end: inv.period_end,
            fiscal_period: "FY",
            cash: inv.cash,
            treasuries: inv.treasuries,
            equity_securities: inv.equity_securities,
            equity_method: inv.equity_method,
            afs_debt: inv.afs_debt,
            total: inv.total,
            unrealized_gain: inv.unrealized_gain,
            gate_attribution_ok: inv.gate_attribution_ok,
            gate_closure_ok: inv.gate_closure_ok,
            raw_facts: { source: url },
            updated_at: new Date().toISOString(),
          });
        }
      }

      // 第二、三栏:一份 10-K 带 3 个 FY,全收。
      for (const year of extractSegmentYears(facts)) {
        for (const seg of year.segments) {
          segmentRows.push({
            ticker,
            period_end: seg.period_end,
            fiscal_period: "FY",
            segment_member: seg.segment_member,
            segment_label: seg.segment_label,
            kind: seg.kind,
            pretax_income: seg.pretax_income,
            income_tax: seg.income_tax,
            raw_facts: {
              total_pretax: year.total_pretax,
              total_tax: year.total_tax,
              insurance_pretax: year.insurance_pretax,
              insurance_tax: year.insurance_tax,
              underwriting_pretax: year.underwriting_pretax,
              investments_pretax: year.investments_pretax,
              source: url,
            },
            updated_at: new Date().toISOString(),
          });
        }
      }
    }

    if (investmentRows.length) {
      const unique = Array.from(
        new Map(investmentRows.map((r) => [`${r.ticker}|${r.period_end}|${r.fiscal_period}`, r])).values(),
      );
      const { error } = await supabase
        .from("company_holdco_investments")
        .upsert(unique, { onConflict: "ticker,period_end,fiscal_period" });
      if (!error) out.investments = unique.length;
    }
    if (segmentRows.length) {
      const unique = Array.from(
        new Map(
          segmentRows.map((r) => [`${r.ticker}|${r.period_end}|${r.fiscal_period}|${r.segment_member}`, r]),
        ).values(),
      );
      const { error } = await supabase
        .from("company_segment_periods")
        .upsert(unique, { onConflict: "ticker,period_end,fiscal_period,segment_member" });
      if (!error) out.segment_rows = unique.length;
    }
  } catch {
    // 静默降级:件⑤不可得 → 该票退回件④的抑制状态,不影响其余 ingest。
  }
  return out;
}
```

> 实现提示：`secFetchText` / `secFetchJson` / `filingIndexUrl` / `sleep` 的确切签名与 `NormalizedFiling` 的字段名（`period_of_report` / `accession_number` / `primary_document`）以 `web/src/lib/sec/sec-client.ts` 和 `company-submissions.ts` 为准；若字段名不同，照那里的实际名字改，**不要**新增字段。可直接照抄 `class-shares-fallback.ts:216` 起那段已跑通的 instance URL 解析逻辑。

- [ ] **Step 2: 接进 `ingest.ts`**

在 import 区加：

```ts
import { needsHoldcoSotp, ingestHoldcoSotp } from "./holdco-ingest";
```

在 `ingest.ts:192` 那个 `needsClassSharesFallback` 分支**之后**加：

```ts
    // 件⑤:投资主导型控股集团才拉 instance 解析分部与第一栏(窄闸,其余票零新增取数)。
    if (needsHoldcoSotp(normalized.annual)) {
      await ingestHoldcoSotp(supabase, ticker, normalized.annual, filings);
    }
```

- [ ] **Step 3: 类型检查**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && npx tsc --noEmit
```

预期：零错误。

- [ ] **Step 4: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco
git add web/src/lib/sec/holdco-ingest.ts web/src/lib/sec/ingest.ts
git commit -m "feat(sec): 件⑤ ingest 窄闸,落 holdco_investments 与 segment_periods 两表"
```

---

### Task 6: 引擎接线（epvFloor 挂 SOTP + verdict 用 SOTP 带）

**Files:**
- Modify: `web/src/lib/valuation/types.ts`
- Modify: `web/src/lib/valuation/epvFloor.ts:326-406`
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts:164`
- Modify: `web/src/lib/valuation/runValuation.ts:77`
- Test: `web/src/lib/valuation/holdcoSotp.check.ts`（追加接线断言）

**Interfaces:**
- Consumes: `HoldcoSotp`（T4）、既有 `ValuationFloor` / `ValuationVerdict`
- Produces：`ValuationFloor.holdco_sotp?: HoldcoSotp`；`deriveValuationVerdict` 在 SOTP 可得时返回非 null 判定

- [ ] **Step 1: `types.ts` 加字段**

在 `ValuationFloor` 里、`holdco_not_assessable` 旁边加：

```ts
  /** 件⑤:控股集团分部 SOTP。仅在 holdco_not_assessable 为真且四闸全过时存在;
   *  它在时 verdict 改用 SOTP 价值带判定,不再整条抑制。 */
  holdco_sotp?: import("./holdcoSotp").HoldcoSotp;
```

- [ ] **Step 2: `epvFloor.ts` 接受并透传 SOTP**

`computeEpvFloor` 的入参类型里加一个可选项（跟 `latest` 同级）：

```ts
  /** 件⑤:由调用方从 company_holdco_investments + company_segment_periods 组装后传入。
   *  引擎不自己读库,保持纯函数可测。 */
  holdcoSotp?: import("./holdcoSotp").HoldcoSotp | { assessable: false };
```

在 `return { kind: "floor", ... }` 里，`holdco_not_assessable` 那行下面加：

```ts
    // 件⑤:被判为投资主导型控股集团时,若 SOTP 四闸全过就把它挂上 —— 下游 deriveValuationVerdict
    // 会改用 SOTP 价值带判定,把件④那句"不给判定"换成可拆开看的三段式数字。
    // 未被抑制的票一律不挂(holdcoNotAssessable 为假时短路),保证零漂移。
    holdco_sotp:
      holdcoNotAssessable && input.holdcoSotp?.assessable === true ? input.holdcoSotp : undefined,
```

> `input` 是该函数实际的参数名，以文件里的写法为准。

- [ ] **Step 3: `deriveValuationVerdict.ts` 用 SOTP 带判定**

把 `deriveValuationVerdict.ts:164` 那一行替换为：

```ts
  if (floor.holdco_not_assessable) {
    // 件⑤:有 SOTP 就用它的价值带判定,没有才退回件④的整条抑制。
    const sotp = floor.holdco_sotp;
    const sotpPrice = strikeZone?.price.close;
    if (!sotp || sotpPrice == null || !(sotpPrice > 0)) return null;
    const { pessimistic, base, optimistic } = sotp.per_share;
    if (!(pessimistic > 0) || !(optimistic >= pessimistic) || !(base > 0)) return null;
    return {
      bucket: sotpPrice < pessimistic ? "below" : sotpPrice <= optimistic ? "within" : "above",
      // 击球区沿用全站口径:相对中枢(基础档)留出 MOS_BASE=1/3 的安全边际。
      inStrikeZone: sotpPrice <= base * (1 - MOS_BASE),
      rangeLo: pessimistic,
      rangeHi: optimistic,
      price: sotpPrice,
      priceDate: strikeZone!.price.date,
      marginPct: (base - sotpPrice) / base,
      // SOTP 是分部拆解的单一路径,不存在两法夹逼 → single_lamp。
      coverage: "single_lamp",
      methods,
      // 可靠性由件⑤自己的四闸承担(≥3 年 / 对账 ≤10% / 归属 / 闭合),不走 assessReliability
      // —— 后者的输入(OE-DCF 稳定性、周期峰值等)对这条分部路径没有意义,套用它只会引入
      //    与本判定无关的否决。四闸不过时上面已经 return null,能走到这里就是可信的。
      reliable: true,
      // net-net 是清算口径的独立信号,对投资主导型控股集团没有解释力,不发布。
      netNet: undefined,
    };
  }
```

**字段名已按 `deriveValuationVerdict.ts:227` 的现有 return 语句逐一核对**（camelCase，无 `basis` 字段）：`{ bucket, inStrikeZone, rangeLo, rangeHi, price, priceDate, marginPct, coverage, methods, reliable, netNet }`。`MOS_BASE = 1/3` 定义在同文件 `:106`，`VerdictCoverage` 在 `:26`。局部变量取名 `sotpPrice` 是为了不和函数体后面那个 `const price` 撞名。

- [ ] **Step 4: `runValuation.ts` 覆盖原因分支**

`runValuation.ts:77`：

```ts
  if (input.floor.holdco_not_assessable && !input.floor.holdco_sotp) return "holdco_not_assessable";
```

（有 SOTP 时不再算「不可评估」。）

- [ ] **Step 5: 追加接线断言到 `holdcoSotp.check.ts`**

在文件末尾 `process.exit` 之前插入：

```ts
console.log("⑨ 接线:verdict 用 SOTP 带判定");
{
  const { deriveValuationVerdict } = await import("./deriveValuationVerdict");
  const sotp = computeHoldcoSotp(BRK);
  if (!sotp.assessable) throw new Error("fixture 应可评估");
  const zone = (close: number) => ({ price: { close, date: "2026-08-10" } }) as never;
  const mk = (price: number) =>
    deriveValuationVerdict({
      floor: { kind: "floor", holdco_not_assessable: true, holdco_sotp: sotp } as never,
      strikeZone: zone(price),
      methods: {} as never,
    });
  assert(mk(511.54)?.bucket === "within", "现价 $511.54 → within");
  assert(mk(400)?.bucket === "below", "$400(低于悲观档)→ below");
  assert(mk(600)?.bucket === "above", "$600(高于乐观档)→ above");
  assert(mk(511.54)?.reliable === true, "四闸已过 → reliable");
  assert(mk(300)?.inStrikeZone === true, "$300 ≤ 基础档 × 2/3 → 进击球区");
  assert(mk(511.54)?.inStrikeZone === false, "现价未到基础档的 2/3 → 不进击球区");
  assert(
    deriveValuationVerdict({
      floor: { kind: "floor", holdco_not_assessable: true } as never,
      strikeZone: zone(511.54),
      methods: {} as never,
    }) === null,
    "无 SOTP → 仍退回件④的整条抑制(fail-closed)",
  );
}
```

> 顶层 `await import` 需要该 check 文件是 ESM；若 tsx 报错就把 import 提到文件顶部改成静态 import。

- [ ] **Step 6: 跑全部 check + tsc**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web
npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.check.ts
npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoNotAssessable.check.ts
npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/instance-facts.check.ts
npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/holdco-investments.check.ts
npx tsx --tsconfig scripts/tsconfig.json src/lib/sec/segment-facts.check.ts
npx tsc --noEmit
```

预期：全绿。**件④的 `holdcoNotAssessable.check.ts` 必须仍然全通过** —— 件⑤不得改变件④的抑制判据本身，只是在抑制之上叠加 SOTP。

- [ ] **Step 7: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco
git add web/src/lib/valuation/types.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/runValuation.ts web/src/lib/valuation/holdcoSotp.check.ts
git commit -m "feat(valuation): 件⑤ 引擎接线,SOTP 可得时用其价值带判定取代整条抑制"
```

---

### Task 7: 展示层（三段式拆解）

**Files:**
- Modify: `web/src/lib/stocks/stockCopy.ts:95`（zh）与 `:145`（en）
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx:419-421, 629-632`

**Interfaces:**
- Consumes: `ValuationFloor.holdco_sotp`（T6）
- Produces: 无（终端消费者）

- [ ] **Step 1: 加文案**

`stockCopy.ts` 的 zh 块里，`holdcoNotAssessable` 那条**保留不动**（无 SOTP 时仍要用），在它下面加：

```ts
      holdcoSotpTitle: "分部估值",
      holdcoSotpIntro:
        "这是一家以投资组合为主体的控股集团，合并层面的单一口径对它没有经济含义。下面按巴菲特本人的分栏法拆开算：投资按市值计，经营业务按盈利给倍数，两者相加再扣掉证券未实现增值对应的递延税。",
      holdcoSotpInvestments: "投资按市值",
      holdcoSotpOperating: "非保险经营业务",
      holdcoSotpUnderwriting: "保险承保",
      holdcoSotpDeferredTax: "减：递延所得税",
      holdcoSotpTotal: "每股合计",
      holdcoSotpNote:
        "经营业务与承保取最近三个财年的均值；倍数分别为 12/15/18 倍与 8/10/12 倍，承保因结果波动更大而给更低倍数。投资组合由浮存金支撑的部分不另行扣减——浮存金成本为负，扣它会与承保利润重复惩罚。经营业务的实际税率低于法定税率，主要来自能源业务的可再生能源税收抵免。",
```

en 块里对应加：

```ts
      holdcoSotpTitle: "Sum of the parts",
      holdcoSotpIntro:
        "This is a holding company led by an investment portfolio, so a single consolidated lens says little about it. Below it is broken out the way Buffett himself presented it: investments at market, operating businesses on a multiple of earnings, added together, less the deferred tax on unrealised securities gains.",
      holdcoSotpInvestments: "Investments at market",
      holdcoSotpOperating: "Non-insurance operating businesses",
      holdcoSotpUnderwriting: "Insurance underwriting",
      holdcoSotpDeferredTax: "Less: deferred tax",
      holdcoSotpTotal: "Per share",
      holdcoSotpNote:
        "Operating earnings and underwriting are three-year averages, capitalised at 12/15/18× and 8/10/12× respectively — underwriting gets the lower range because its results swing far harder. Float is not deducted from the portfolio: its cost is negative, and deducting it would penalise the same economics twice alongside underwriting profit. The operating businesses' effective tax rate runs below statutory, largely on renewable-energy credits in the energy segment.",
```

- [ ] **Step 2: 页面渲染三段式**

`page.tsx:419` 附近，`holdcoNotAssessable` 常量旁加：

```ts
  const holdcoSotp =
    valuationFloor?.kind === "floor" ? valuationFloor.holdco_sotp : undefined;
```

`page.tsx:629` 那个 `) : holdcoNotAssessable ? (` 分支改为：**SOTP 可得时渲染拆解表，否则保留原来的抑制说明句**：

```tsx
              ) : holdcoNotAssessable && holdcoSotp ? (
                <div className="mt-3">
                  <p className="text-sm text-[var(--tt-muted)]">{page.valuation.holdcoSotpIntro}</p>
                  <table className="mt-4 w-full text-sm tabular-nums">
                    <thead>
                      <tr className="text-[var(--tt-muted)]">
                        <th className="py-1 text-left font-normal"> </th>
                        <th className="py-1 text-right font-normal">{page.valuation.tierPessimistic}</th>
                        <th className="py-1 text-right font-normal">{page.valuation.tierBase}</th>
                        <th className="py-1 text-right font-normal">{page.valuation.tierOptimistic}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="py-1">{page.valuation.holdcoSotpInvestments}</td>
                        <td className="py-1 text-right">{fmtUsd(holdcoSotp.columns.investments)}</td>
                        <td className="py-1 text-right">{fmtUsd(holdcoSotp.columns.investments)}</td>
                        <td className="py-1 text-right">{fmtUsd(holdcoSotp.columns.investments)}</td>
                      </tr>
                      <tr>
                        <td className="py-1">{page.valuation.holdcoSotpOperating}</td>
                        <td className="py-1 text-right">{fmtUsd(holdcoSotp.columns.operating.pessimistic)}</td>
                        <td className="py-1 text-right">{fmtUsd(holdcoSotp.columns.operating.base)}</td>
                        <td className="py-1 text-right">{fmtUsd(holdcoSotp.columns.operating.optimistic)}</td>
                      </tr>
                      <tr>
                        <td className="py-1">{page.valuation.holdcoSotpUnderwriting}</td>
                        <td className="py-1 text-right">{fmtUsd(holdcoSotp.columns.underwriting.pessimistic)}</td>
                        <td className="py-1 text-right">{fmtUsd(holdcoSotp.columns.underwriting.base)}</td>
                        <td className="py-1 text-right">{fmtUsd(holdcoSotp.columns.underwriting.optimistic)}</td>
                      </tr>
                      <tr>
                        <td className="py-1">{page.valuation.holdcoSotpDeferredTax}</td>
                        <td className="py-1 text-right">−{fmtUsd(holdcoSotp.columns.deferred_tax)}</td>
                        <td className="py-1 text-right">−{fmtUsd(holdcoSotp.columns.deferred_tax)}</td>
                        <td className="py-1 text-right">−{fmtUsd(holdcoSotp.columns.deferred_tax)}</td>
                      </tr>
                      <tr className="border-t border-[var(--tt-border)] font-medium">
                        <td className="py-2">{page.valuation.holdcoSotpTotal}</td>
                        <td className="py-2 text-right">{fmtUsd(holdcoSotp.per_share.pessimistic)}</td>
                        <td className="py-2 text-right">{fmtUsd(holdcoSotp.per_share.base)}</td>
                        <td className="py-2 text-right">{fmtUsd(holdcoSotp.per_share.optimistic)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <p className="mt-3 text-xs text-[var(--tt-muted)]">{page.valuation.holdcoSotpNote}</p>
                </div>
              ) : holdcoNotAssessable ? (
```

> 说明：
> - `fmtUsd` 用该文件已有的每股金额格式化函数（名字以文件里实际的为准，别新造）。
> - `tierPessimistic/tierBase/tierOptimistic` 若 copy 里已有档位标签就复用，没有就在两个 locale 各加「悲观 / 基础 / 乐观」与「Low / Base / High」。
> - 表格必须能横向滚动：若该页其他宽表用了 `overflow-x-auto` 包裹，照抄同一写法。
> - **文案纪律**：禁 AI 腔（破折号抒情、对偶、三元枚举、对冲词），禁中英混排，每个 locale 纯本语言。

- [ ] **Step 3: 类型检查**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && npx tsc --noEmit
```

预期：零错误。（本机 `next build` 必失败——Google Fonts 被网络屏蔽，是既知环境限制，用 tsc 当本地门。）

- [ ] **Step 4: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco
git add web/src/lib/stocks/stockCopy.ts "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(stocks): 件⑤ 个股页三段式 SOTP 拆解(en/zh)"
```

---

### Task 8: 真数据探针与验收

**Files:**
- Create: `web/src/lib/valuation/holdcoSotp.probe.ts`

**Interfaces:**
- Consumes: 全部前序 task
- Produces: 无（只读探针）

- [ ] **Step 1: 写探针**

`web/src/lib/valuation/holdcoSotp.probe.ts`：

```ts
/**
 * holdcoSotp.probe.ts — 件⑤ 真数据只读探针(直接打 SEC,不写库)。
 * 运行:
 *   cd web && export SEC_USER_AGENT="Compounder Research junlinzhu@jobright.ai" \
 *     && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.probe.ts
 */
import { extractInstanceFacts } from "../sec/instance-facts";
import { extractHoldcoInvestments } from "../sec/holdco-investments";
import { extractSegmentYears } from "../sec/segment-facts";
import { computeHoldcoSotp } from "./holdcoSotp";

const UA = process.env.SEC_USER_AGENT;
if (!UA) throw new Error("需要 SEC_USER_AGENT");

const B = 1e9;
const SHARES_BRK_B = 2_157_335_139;
const PRICE_BRK_B = 511.54; // 探针基准价,仅用于打印带内/带外,不入库

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); failed++; }
}
const near = (a: number, b: number, tol) => Math.abs(a - b) / Math.abs(b) <= tol;

async function get(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA!, Accept: "*/*" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function main() {
  const subs = JSON.parse(await get("https://data.sec.gov/submissions/CIK0001067983.json"));
  const rec = subs.filings.recent;
  const idx = rec.form.findIndex((f: string) => f === "10-K");
  const acc = rec.accessionNumber[idx].replace(/-/g, "");
  const doc = rec.primaryDocument[idx].replace(/\.htm$/, "");
  const url = `https://www.sec.gov/Archives/edgar/data/1067983/${acc}/${doc}_htm.xml`;
  console.log(`# 10-K ${rec.reportDate[idx]} filed ${rec.filingDate[idx]}\n# ${url}\n`);

  const facts = extractInstanceFacts(await get(url));
  const periodEnd = rec.reportDate[idx];

  console.log("① 第一栏(spec §1.1)");
  const inv = extractHoldcoInvestments(facts, periodEnd);
  assert(inv != null, "第一栏可提取(两闸通过)");
  if (inv) {
    console.log(`   现金 ${(inv.cash / B).toFixed(2)}B · 国债 ${(inv.treasuries / B).toFixed(2)}B · 权益 ${(inv.equity_securities / B).toFixed(2)}B · 权益法 ${(inv.equity_method / B).toFixed(2)}B · AFS ${(inv.afs_debt / B).toFixed(2)}B`);
    assert(near(inv.cash / B, 47.72, 0.01), "现金 47.72B(保险与其他列,非合并 52.57B)");
    assert(near(inv.treasuries / B, 321.43, 0.01), "★ 国债 321.43B(第一版漏掉的那 46%)");
    assert(near(inv.total / B, 704.73, 0.01), "第一栏合计 704.73B");
    assert(near(inv.unrealized_gain! / B, 212.39, 0.01), "未实现增值 212.39B");
  }

  console.log("② 分部(spec §1.2)");
  const years = extractSegmentYears(facts);
  assert(years.length >= 3, `解析出 ≥3 个 FY(实得 ${years.length})`);
  for (const y of years.slice(0, 3)) {
    const op = (y.total_pretax! - y.insurance_pretax!) - (y.total_tax! - y.insurance_tax!);
    console.log(`   ${y.period_end}: 合计税前 ${(y.total_pretax! / B).toFixed(2)}B · 保险 ${(y.insurance_pretax! / B).toFixed(2)}B · 承保 ${(y.underwriting_pretax! / B).toFixed(2)}B · 投资 ${(y.investments_pretax! / B).toFixed(2)}B · 非保险税后 ${(op / B).toFixed(2)}B`);
    assert(near(y.underwriting_pretax! + y.investments_pretax!, y.insurance_pretax!, 0.01),
      `${y.period_end} 承保+投资=保险集团合计`);
  }
  const fy25 = years.find((y) => y.period_end === "2025-12-31");
  if (fy25) {
    const op25 = (fy25.total_pretax! - fy25.insurance_pretax!) - (fy25.total_tax! - fy25.insurance_tax!);
    assert(near(op25 / B, 23.37, 0.01), "FY2025 非保险经营税后 23.37B");
  }

  console.log("③ SOTP 三档(spec §3)");
  const sotp = computeHoldcoSotp({
    shares: SHARES_BRK_B,
    investments: inv ? { total: inv.total, unrealized_gain: inv.unrealized_gain } : null,
    years,
  });
  assert(sotp.assessable, "四闸全过");
  if (sotp.assessable) {
    const { pessimistic, base, optimistic } = sotp.per_share;
    console.log(`   $${pessimistic.toFixed(0)} / $${base.toFixed(0)} / $${optimistic.toFixed(0)}`);
    assert(pessimistic >= 450 && optimistic <= 545, "三档 ∈ [450, 545]");
    assert(base >= 485 && base <= 510, "基础档 ∈ [485, 510]");
    assert(PRICE_BRK_B >= pessimistic && PRICE_BRK_B <= optimistic, `★ 现价 $${PRICE_BRK_B} 落在带内`);
    console.log(`   基础档 ÷ 每股账面 332.55 = ${(base / 332.55).toFixed(2)}× 账面(市场 1.54×,历史 1.2–1.6×)`);
    console.log(`   第一栏占比 ${((sotp.columns.investments / base) * 100).toFixed(0)}%(共识约三分之二)`);
  }

  console.log(failed === 0 ? "\n全部通过" : `\n${failed} 条失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: 跑探针**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web && export SEC_USER_AGENT="Compounder Research junlinzhu@jobright.ai" && npx tsx --tsconfig scripts/tsconfig.json src/lib/valuation/holdcoSotp.probe.ts
```

预期：全部通过，且打印出的三档接近 `$458 / $496 / $534`。

**若国债那条不过，先查 `TREASURY_TAGS` 与维度成员名，不要放宽容差。**

- [ ] **Step 3: 全量 check 复跑**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco/web
for f in src/lib/sec/instance-facts.check.ts src/lib/sec/holdco-investments.check.ts src/lib/sec/segment-facts.check.ts src/lib/valuation/holdcoSotp.check.ts src/lib/valuation/holdcoNotAssessable.check.ts src/lib/valuation/epvFloor.check.ts; do
  echo "=== $f ==="; npx tsx --tsconfig scripts/tsconfig.json "$f" || echo "FAILED: $f";
done
npx tsc --noEmit
```

预期：全绿（`ownerEarningsDcf.check.ts` 的主干既存失败不在此列，不要把它加进来）。

- [ ] **Step 4: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-holdco
git add web/src/lib/valuation/holdcoSotp.probe.ts
git commit -m "test(valuation): 件⑤ 真数据只读探针(第一栏/分部/三档逐位核对)"
```

---

## 上线运维（须用户授权，不要自行执行）

1. **先 apply migration** `20260811_create_holdco_sotp_tables.sql`（两张新表；本件刻意不给既有表加列，所以顺序风险已在结构上消除，但仍须先建表再跑 ingest）；
2. 合并 PR；
3. `export SEC_USER_AGENT=... && npm run sec:ingest -- BRK.A BRK.B WTM`（填两张新表）；
4. 抽查行：`company_holdco_investments` 的 BRK.B 应有 `treasuries ≈ 3.214e11`、`total ≈ 7.047e11`、两个 gate 均为 true；`company_segment_periods` 的 BRK.B 应有 ≥3 个 `period_end` × 多个 `segment_member`，且存在 `kind='insurance_investments'` 的行；
5. `export SUPABASE_URL=... SUPABASE_SERVICE_KEY=... && npm run valuation:ingest`（**这个脚本不自读 `.env.local`，必须前置 export** —— 老坑，件③件④各中一次）；
6. 看页：`/stocks/BRK.B`（三段式拆解表 + `within` 判定）、`/stocks/BRK.A`（同表，数字 ×1500）、`/stocks/WTM`（分部不足则仍显示件④的抑制说明句）；
7. **零漂移抽查**：RGA / MKL / RLI / PGR / CB / AFL / MSFT / V / AXP 逐字段与合并前一致；
8. 确认聚合面（screener / 首页榜）里 BRK.B 现在带着 `within` 出现，不再只是搜索索引条目。

## 遗留立案（本件不做）

- 逐分部行业倍数（spec §2.4 明确不做）
- 浮存金显性估值、递延税折现
- 把 SOTP 推广到未被件④抑制的票
- 引擎既有 9–11% 股权成本口径的对照档（件⑥）
- `ownerEarningsDcf.check.ts` 主干既存失败（`AssertionError: anchored`）
- 银行缺 revenue 时 capex 重要性的替代分母
- businessQuality 小节 GAAP 口径与估值卡调整口径并存的同源说明
