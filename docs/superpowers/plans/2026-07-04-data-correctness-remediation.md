# 数据正确性修复 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复审计确认的 18+1 个数据正确性 bug,让站点不再对用户产出错误数字/错误信号。

**Architecture:** 分三阶段。Phase 1 = P0 + 9 个互不依赖的机械修(逐个提交)。Phase 2 = 期权口径簇(聚合层剔除 put/call,投资人持仓表保留并标注),收尾重跑 consensus。Phase 3 = 估值信号小修。外股 ADR 归一化不在本计划(另起 spec)。

**Tech Stack:** Next.js 16 (App Router) + TypeScript + Supabase(Postgres)。数据经 `scripts/*.ts`(tsx 运行)ingest。

## Global Constraints

- **无测试套件**(solo dev)。验证门:`cd web && npx tsc --noEmit`;纯函数用 `*.check.ts`(断言脚本,`npx tsx <file>` 运行,已有 `derive.check.ts`/`deriveValuationVerdict.check.ts` 先例);数据层改动重跑对应 script 后查真数据;UI 改动 preview 真机看。
- **本机 `next build` 必挂**(google fonts 被墙),不要用它当门。
- **文案中英不混排**:每个 locale 纯本语言。UI 新增文案(如 PUT/CALL 徽章)zh/en 各一份。
- **品牌无判决**:估值/信号文案忠于复利品牌,不投机不推荐。
- **提交信息**结尾加 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- **分支**: 本工作在 `fix/data-correctness-remediation`(off `db-foundation`)。原 `fix/screener-nav-divider` 上的估值健壮化 WIP(非经营性证券排除 + marginPct→valueFloor)已 `git stash`(stash@{0}),**不在本分支树内**。因此 Task 15 从 db-foundation 现状(`marginPct = rangeLo > 0 ? (rangeLo - price)/rangeLo : null`)**重新实现** valueFloor 锚定,不依赖 stash。用户日后 unstash 时 deriveValuationVerdict.ts 会与本批冲突,系同一改动、平凡调和。
- 本地 `db-foundation` 落后 `origin/db-foundation` 2 提交;PR 前可 rebase 到 origin。

---

# Phase 1 — P0 + 独立机械修

## Task 1: P0 — 过滤 NONE/空申报,空 filing 不得成为最新

13F-NT 通知类申报是一条 `cusip=000000000 / issuer=NONE / value=0 / shares=0` 占位行,现被当成最新持仓(Makaira Partners 线上显示 $0)。

**Files:**
- Modify: `web/scripts/ingest-13f.ts:220`(`parseInfoTable` 的 filter)
- Modify: `web/scripts/ingest-13f.ts`(`buildFilingData` 或其调用处,跳过 0 持仓 filing)
- Test: `web/scripts/ingest-13f.check.ts`(新建)

- [ ] **Step 1: 写失败断言** — 新建 `web/scripts/ingest-13f.check.ts`,导出并测试一个纯过滤谓词。先把过滤逻辑抽成可测函数。在 `ingest-13f.ts` 顶部附近加导出:

```ts
// 真实持仓谓词:排除 13F-NT 占位行(NONE / 全零 cusip / value+shares 全 0)。
export function isRealHolding(h: { cusip: string; issuer: string; value: number; shares: number }): boolean {
  if (!h.cusip || !h.issuer) return false;
  if (h.issuer.trim().toUpperCase() === "NONE") return false;
  if (/^0+$/.test(h.cusip)) return false;
  if ((h.value ?? 0) === 0 && (h.shares ?? 0) === 0) return false;
  return true;
}
```

`web/scripts/ingest-13f.check.ts`:

```ts
import { isRealHolding } from "./ingest-13f";
function assert(c: boolean, msg: string) { if (!c) { console.error("FAIL:", msg); process.exit(1); } }
assert(isRealHolding({ cusip: "037833100", issuer: "APPLE INC", value: 1e9, shares: 1000 }), "real holding kept");
assert(!isRealHolding({ cusip: "000000000", issuer: "NONE", value: 0, shares: 0 }), "NONE placeholder dropped");
assert(!isRealHolding({ cusip: "000000000", issuer: "NONE", value: 0, shares: 0 }) === true, "NONE dropped (bool)");
assert(!isRealHolding({ cusip: "", issuer: "X", value: 1, shares: 1 }), "empty cusip dropped");
console.log("ingest-13f.check OK");
```

- [ ] **Step 2: 跑,确认失败** — `cd web && npx tsx scripts/ingest-13f.check.ts` → 预期 FAIL(`isRealHolding` 未导出/未定义)。

- [ ] **Step 3: 实现** — (a) 在 `ingest-13f.ts` 加上 Step 1 的 `isRealHolding`;(b) 把 `parseInfoTable` 结尾 `return holdings.filter((h) => h.cusip && h.issuer);` 改为 `return holdings.filter(isRealHolding);`;(c) 在装配"最新 filing"处跳过 0 持仓 filing。定位 `buildFilingData` 调用链:某 filing 经 `parseInfoTable`+`normalizeValueForPeriod`+`aggregateByCusip` 后若 `holdings.length === 0`,则**不写入该 filing**(或标记跳过),使上一期真申报成为最新。在写 filing 前加:

```ts
if (filingData.holdings.length === 0) {
  console.warn(`[ingest-13f] 跳过空 filing(NONE/13F-NT): ${filingMeta.accession} ${filingMeta.period}`);
  continue; // 或在 map 后 filter 掉
}
```

- [ ] **Step 4: 跑,确认通过** — `npx tsx scripts/ingest-13f.check.ts` → 预期 `ingest-13f.check OK`;`npx tsc --noEmit` 通过。

- [ ] **Step 5: 清脏数据 + 重跑** — 删掉已入库的空 filing 行后重跑该户 ingest(按 `sec-valuation-ingest-ops` 记忆的跑法,`cd web` 单进程)。验证:Makaira Partners 投资人页显示上一期真组合(非 $0)。**注意**:此步动生产数据,执行者须确认 env/口径。

- [ ] **Step 6: 提交**

```bash
git add web/scripts/ingest-13f.ts web/scripts/ingest-13f.check.ts
git commit -m "fix(13f): 过滤NONE/13F-NT占位申报,空filing不再当最新持仓

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 2: most-sold 全额清仓显示 $0 → 用上季市值

`diff()`(DB 路径)与 `computeChanges()`(内存 fallback)的 exited 行都把 value 设为 0,导致"卖出最多"面板对全额清仓显示 `$0`。

**Files:**
- Modify: `web/scripts/lib/computeConsensus.ts:28`
- Modify: `web/src/lib/managers/assemble.ts:26`
- Test: `web/src/lib/managers/assemble.check.ts`(新建)

- [ ] **Step 1: 写失败断言** — `web/src/lib/managers/assemble.check.ts`:

```ts
import { computeChanges } from "./assemble";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
const prior = [{ cusip: "A", issuer: "AAA", value: 5_000_000_000, shares: 100, weight: 0.5 }] as any;
const latest = [] as any;
const ch = computeChanges(latest, prior);
const exited = ch.find((c) => c.kind === "exited");
assert(!!exited, "exited change emitted");
assert(exited!.value === 5_000_000_000, `exited value = prior value, got ${exited!.value}`);
console.log("assemble.check OK");
```

- [ ] **Step 2: 跑,确认失败** — `cd web && npx tsx src/lib/managers/assemble.check.ts` → FAIL(当前 value=0)。

- [ ] **Step 3: 实现** — `assemble.ts:26` 把 exited 的 `value: 0` 改为 `value: ph.value`:

```ts
for (const [k, ph] of pm) {
  if (!lm.has(k)) out.push({ cusip: ph.cusip, putCall: ph.putCall, issuer: ph.issuer, kind: "exited", prevShares: ph.shares, shares: 0, value: ph.value, deltaPct: -1 });
}
```

`computeConsensus.ts:28`(`diff()`)同理,exited 用 `ph.value`:

```ts
for (const [k, ph] of pm) if (!lm.has(k)) out.push({ cusip: ph.cusip, issuer: ph.issuer, kind: "exited", value: Number(ph.value) });
```

- [ ] **Step 4: 跑,确认通过** — `npx tsx src/lib/managers/assemble.check.ts` → OK;`npx tsc --noEmit` 通过。

- [ ] **Step 5: 重跑 consensus** — 重跑 consensus ingest(`computeAndStoreConsensus`)后查首页"卖出最多"面板不再 `$0`。

- [ ] **Step 6: 提交**

```bash
git add web/scripts/lib/computeConsensus.ts web/src/lib/managers/assemble.ts web/src/lib/managers/assemble.check.ts
git commit -m "fix(consensus): 全额清仓net_value用上季市值,most-sold不再显示\$0

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 3: total_debt 双算重叠 XBRL 概念

`collectTotalDebt` 对每个 period_end 把所有匹配 tag 相加。`LongTermDebtAndFinanceLeaseObligationsNoncurrent` 与 `LongTermDebtNoncurrent` 是重叠概念(前者含后者),两者并存即双算。

**Files:**
- Modify: `web/src/lib/sec/normalize-facts.ts:269-288`(`collectTotalDebt`)
- Test: `web/src/lib/sec/normalize-facts.check.ts`(若无则新建)

- [ ] **Step 1: 写失败断言** — 抽一个纯函数 `pickDebtTags(tagsPresent: Set<string>): string[]`,按优先级组每组取一。`normalize-facts.check.ts`:

```ts
import { pickDebtTags } from "./normalize-facts";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
// 两个 noncurrent 重叠 tag 并存 → 只取合并租赁那个
const picked = pickDebtTags(new Set(["LongTermDebtAndFinanceLeaseObligationsNoncurrent","LongTermDebtNoncurrent","ShortTermBorrowings"]));
assert(picked.includes("LongTermDebtAndFinanceLeaseObligationsNoncurrent"), "合并租赁tag优先");
assert(!picked.includes("LongTermDebtNoncurrent"), "纯LongTermDebt被去重");
assert(picked.includes("ShortTermBorrowings"), "短期借款独立组保留");
// 只报纯 tag → 退纯 tag
const picked2 = pickDebtTags(new Set(["LongTermDebtNoncurrent"]));
assert(picked2.includes("LongTermDebtNoncurrent"), "无合并tag时退纯tag");
console.log("normalize-facts.check OK");
```

- [ ] **Step 2: 跑,确认失败** — `cd web && npx tsx src/lib/sec/normalize-facts.check.ts` → FAIL。

- [ ] **Step 3: 实现** — 加 `pickDebtTags` 并在 `collectTotalDebt` 里按 period_end 的可用 tag 先选组再加总:

```ts
// 债务概念优先级组:每组只取一个,避免重叠概念双算(合并租赁 tag 含纯 LongTermDebt)。
const DEBT_GROUPS: string[][] = [
  ["LongTermDebtAndFinanceLeaseObligationsCurrent", "LongTermDebtCurrent"],
  ["LongTermDebtAndFinanceLeaseObligationsNoncurrent", "LongTermDebtNoncurrent"],
  ["ShortTermBorrowings"],
];
export function pickDebtTags(present: Set<string>): string[] {
  const out: string[] = [];
  for (const group of DEBT_GROUPS) {
    const hit = group.find((t) => present.has(t)); // 组内按优先级取第一个存在的
    if (hit) out.push(hit);
  }
  return out;
}
```

`collectTotalDebt` 里 `summed` 计算改为:先对每个 end 求 `present = new Set(tagMap.keys())`,`keep = new Set(pickDebtTags(present))`,只加总 `keep` 内的 tag:

```ts
for (const [end, tagMap] of byEnd) {
  const keep = new Set(pickDebtTags(new Set(tagMap.keys())));
  const kept = Array.from(tagMap.entries()).filter(([t]) => keep.has(t)).map(([, p]) => p);
  const total = kept.reduce((sum, p) => sum + p.val, 0);
  const earliestFiled = kept.reduce((min, p) => (p.filed < min ? p.filed : min), "9999-99-99");
  summed.set(end, { val: total, end, filed: earliestFiled, accn: null, tag: [...keep].join("+"), days: null });
}
```

- [ ] **Step 4: 跑,确认通过** — `npx tsx src/lib/sec/normalize-facts.check.ts` → OK;`npx tsc --noEmit` 通过。

- [ ] **Step 5: 抽查对账** — 对 1-2 只已知含融资租赁的票(重跑 sec fundamentals 后)核 `total_debt` 不再明显偏高;debt_to_equity 红旗不再误触。

- [ ] **Step 6: 提交**

```bash
git add web/src/lib/sec/normalize-facts.ts web/src/lib/sec/normalize-facts.check.ts
git commit -m "fix(sec): total_debt按优先级组去重,不再双算重叠债务概念

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 4: 45 天申报截止日 off-by-one

`mostRecentDueQuarter` 用 `<=` 把截止日当天就判成 due,使当天恰在申报窗口内的户被误标 stale。

**Files:**
- Modify: `web/src/lib/freshness/derive.ts:62`
- Modify: `web/src/lib/freshness/derive.check.ts`(补边界用例)

- [ ] **Step 1: 补失败断言** — 在 `derive.check.ts` 加 `2026-05-15`(Q1-2026 截止日当天)边界:

```ts
// 2026-05-15 = Mar-31 + 45 天,恰为 SEC 截止日当天,当天数据尚未逾期。
assert(filingFreshness("2025-12-31", new Date("2026-05-15T00:00:00Z")) === "fresh", "截止日当天Q4持仓仍fresh");
assert(filingFreshness("2025-12-31", new Date("2026-05-16T00:00:00Z")) === "stale", "截止日次日才stale");
```

- [ ] **Step 2: 跑,确认失败** — `cd web && npx tsx src/lib/freshness/derive.check.ts` → FAIL(当天判 stale)。

- [ ] **Step 3: 实现** — `derive.ts:62` `<=` → `<`:

```ts
.filter((qe) => addDays(qe, FILING_DEADLINE_DAYS) < t)
```

- [ ] **Step 4: 跑,确认通过** — `npx tsx src/lib/freshness/derive.check.ts` → OK;`npx tsc --noEmit`。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/freshness/derive.ts web/src/lib/freshness/derive.check.ts
git commit -m "fix(freshness): 45天截止日当天不再误判stale(<=改<)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 5: formatUSD `$1000.0M` 应滚到 `$1.00B`

`(v/1e6).toFixed(1)` 对 [999_950_000, 1e9) 舍入到 `1000.0` → `$1000.0M`。

**Files:**
- Modify: `web/src/lib/format.ts:5-9`
- Test: `web/src/lib/format.check.ts`(新建)

- [ ] **Step 1: 写失败断言** — `web/src/lib/format.check.ts`:

```ts
import { formatUSD } from "./format";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
assert(formatUSD(999_999_999) === "$1.00B", `边界滚B, got ${formatUSD(999_999_999)}`);
assert(formatUSD(1_500_000_000) === "$1.50B", "常规B");
assert(formatUSD(1_500_000) === "$1.5M", "常规M");
console.log("format.check OK");
```

- [ ] **Step 2: 跑,确认失败** — `cd web && npx tsx src/lib/format.check.ts` → FAIL(得 `$1000.0M`)。

- [ ] **Step 3: 实现** — 用向下取整的阈值判断,避免舍入越界:

```ts
export function formatUSD(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 9.995e11) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 9.995e8) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
```

(阈值 `9.995e8` 保证任何会四舍五入到 `1000.0M` 的值都进 B 档;T 档同理。)

- [ ] **Step 4: 跑,确认通过** — `npx tsx src/lib/format.check.ts` → OK;`npx tsc --noEmit`。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/format.ts web/src/lib/format.check.ts
git commit -m "fix(format): formatUSD边界值滚到B/T,不再显示\$1000.0M

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 6: companyShortName 误剥 GROUP/HOLDINGS

`CORP_SUFFIXES` 含 `group/holdings/holding`,把多词公司名尾词剥掉生成错误短名别名。

**Files:**
- Modify: `web/src/lib/aliases/resolve.ts:45-52`
- Test: `web/src/lib/aliases/resolve.check.ts`(若无则新建;若 `companyShortName` 未导出则加导出)

- [ ] **Step 1: 写失败断言** — 确保 `companyShortName` 导出(改 `function` 为 `export function`)。`resolve.check.ts`:

```ts
import { companyShortName } from "./resolve";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
assert(companyShortName("Apple Inc") === "Apple", "APPLE INC → Apple");
assert(companyShortName("Blackstone Group") === "Blackstone Group", "GROUP 不剥");
assert(companyShortName("Alexandria Real Estate Equities") !== "", "多词名保留");
console.log("resolve.check OK");
```

- [ ] **Step 2: 跑,确认失败** — `cd web && npx tsx src/lib/aliases/resolve.check.ts` → FAIL(GROUP 被剥成 "Blackstone")。

- [ ] **Step 3: 实现** — 从 `CORP_SUFFIXES` 移除 `"holdings", "hldgs", "holding", "group", "grp"`:

```ts
const CORP_SUFFIXES = new Set([
  "inc", "incorporated", "corp", "corporation", "co", "company", "cos",
  "ltd", "limited", "plc", "lp", "llc", "llp", "sa", "nv", "ag",
  "com", "the", "trust", "tr",
  "class", "cl", "a", "b", "c",
  "common", "stock", "stk", "shares", "share", "sponsored", "adr", "ads",
  "ord", "ordinary", "cap", "new", "del", "reit", "units", "unit",
]);
```

- [ ] **Step 4: 跑,确认通过** — `npx tsx src/lib/aliases/resolve.check.ts` → OK;`npx tsc --noEmit`。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/aliases/resolve.ts web/src/lib/aliases/resolve.check.ts
git commit -m "fix(aliases): 不再把GROUP/HOLDINGS当后缀剥掉

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 7: Screener 微小正 margin 显示 `−0%`

`−${Math.round(r.marginPct * 100)}%` 对 0<pct<0.005 舍入到 0 → `−0%`(3 处:L48/L54/L116)。

**Files:**
- Modify: `web/src/lib/format.ts`(加 `fmtMarginPct` helper)
- Modify: `web/src/app/[lang]/stocks/screener/ScreenerTable.tsx:48,54,116`
- Test: `web/src/lib/format.check.ts`(续用)

- [ ] **Step 1: 写失败断言** — 在 `format.check.ts` 追加:

```ts
import { fmtMarginPct } from "./format";
assert(fmtMarginPct(0.002) === "<1%", `微小正margin显示<1%, got ${fmtMarginPct(0.002)}`);
assert(fmtMarginPct(0.23) === "−23%", "常规margin带负号");
```

- [ ] **Step 2: 跑,确认失败** — `npx tsx src/lib/format.check.ts` → FAIL。

- [ ] **Step 3: 实现** — `format.ts` 加:

```ts
/** 安全边际展示:−N%;四舍五入到 0 但实际 >0 → "<1%"(不带负号,避免 −0%)。 */
export function fmtMarginPct(pct: number): string {
  const n = Math.round(pct * 100);
  return n <= 0 ? "<1%" : `−${n}%`;
}
```

`ScreenerTable.tsx` 三处 `−${Math.round(r.marginPct * 100)}%` 改为 `{fmtMarginPct(r.marginPct)}`(L48、L54 保留 `⚠`,L116 tail)。顶部 import `fmtMarginPct`。

- [ ] **Step 4: 跑,确认通过** — `npx tsx src/lib/format.check.ts` → OK;`npx tsc --noEmit`。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/format.ts web/src/lib/format.check.ts "web/src/app/[lang]/stocks/screener/ScreenerTable.tsx"
git commit -m "fix(screener): 微小正margin显示<1%而非−0%

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 8: WeightQoQ 箭头(按股数)与权重数字反向

箭头/色取自 `kind`(股数动作),数字取自权重,两者可反向(股数增但组合权重降)。让箭头与它标注的权重数字一致。

**Files:**
- Modify: `web/src/components/common/qoqDirection.tsx:42-48`

- [ ] **Step 1: 实现** — 箭头/色改由 `cur` vs `prior`(权重本身)驱动;保留"新建"分支不变:

```ts
const up = cur != null && prior != null && cur > prior;
const down = cur != null && prior != null && cur < prior;
const arrow = up ? "▲" : down ? "▼" : "";
const colorClass = up
  ? "text-[var(--tt-positive)]"
  : down
  ? "text-[var(--tt-warn)]"
  : "text-[var(--tt-faint)]";
```

(注:`kind` 入参保留签名不动,避免改所有调用点;仅不再用它定方向。)

- [ ] **Step 2: tsc + 目视** — `cd web && npx tsc --noEmit`;preview 投资人页,确认箭头方向与"X% → Y%"数字一致。

- [ ] **Step 3: 提交**

```bash
git add "web/src/components/common/qoqDirection.tsx"
git commit -m "fix(qoq): 权重箭头改由权重数字驱动,不再与数字反向

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 9: CUSIP→ticker 跳转信任脏 ticker(PLAUSIBLE)

个股页 `redirect` 用 `security_cusips.ticker` 但无 `isLikelyTicker` 闸(兄弟消费者 `resolve.ts:73`/`sitemap.ts:97` 都有),脏 ticker 会 301 到 `/stocks/<垃圾>`。

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx:246`(附近的 cusip 解析跳转)

- [ ] **Step 1: 实现** — 顶部 import `{ isLikelyTicker } from "@/lib/externalLinks"`。`page.tsx:246` 现为 `if (asCusip?.ticker && asCusip.ticker !== rawTicker)`,加 `isLikelyTicker` 闸:

```ts
if (asCusip?.ticker && asCusip.ticker !== rawTicker && isLikelyTicker(asCusip.ticker)) {
  redirect(stockPath(lang, asCusip.ticker));
}
```

- [ ] **Step 2: tsc** — `cd web && npx tsc --noEmit` 通过。

- [ ] **Step 3: 提交**

```bash
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "fix(stocks): cusip跳转加isLikelyTicker闸,不再301到垃圾ticker页

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase 2 — 期权口径簇(聚合剔除 + 表内标注)

**共同前提:** `Holding` 与 `HoldingChange` 已带 `putCall?: string`。判定期权:`isOption(h) = !!h.putCall`(值为 "Put"/"Call")。新增一个共享谓词避免各处重复:

```ts
// web/src/lib/managers/types.ts 或就近工具:期权行(put/call),非普通股多头。
export const isOptionHolding = (h: { putCall?: string }): boolean => !!h.putCall;
```

## Task 10: 共识计算剔除期权(根治点)

`computeConsensus.ts` 构建四张快照表前不含 put/call 过滤。

**Files:**
- Modify: `web/scripts/lib/computeConsensus.ts:43-44`(读 holdings 加 `put_call` 并过滤)
- Modify: `web/src/lib/consensus/compute.ts`(若在纯函数层过滤则加谓词)
- Test: `web/src/lib/consensus/compute.check.ts`(新建)

- [ ] **Step 1: 写失败断言** — `compute.check.ts` 验证含 put 的 scan 不把该 put 计成持有人:

```ts
import { computeConsensus } from "./compute";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
const cmap = new Map([["PLTRCUSIP", { ticker: "PLTR", name: "Palantir" }]]);
const scan = [
  { slug: "scion", holdings: [{ cusip: "PLTRCUSIP", issuer: "Palantir", value: 9e8, putCall: "Put" }], changes: [] },
  { slug: "longonly", holdings: [{ cusip: "PLTRCUSIP", issuer: "Palantir", value: 1e8 }], changes: [] },
] as any;
const { holdings } = computeConsensus(scan, cmap);
const pltr = holdings.find((h) => h.ticker === "PLTR");
assert(pltr?.holder_count === 1, `PLTR只有1个长仓持有人(排除put), got ${pltr?.holder_count}`);
assert(pltr?.total_value === 1e8, `total_value排除put名义值, got ${pltr?.total_value}`);
console.log("compute.check OK");
```

- [ ] **Step 2: 跑,确认失败** — `cd web && npx tsx src/lib/consensus/compute.check.ts` → FAIL(holder_count=2)。

- [ ] **Step 3: 实现** — 两层择一,推荐**在纯函数入口过滤**(单点、可测):`compute.ts` 的 `computeConsensus`/`computeStockHolders`/`computeStockTrend` 各在遍历 holdings 前 `.filter((h) => !h.putCall)`。同时 `ScanHolding`/`StockHolderScan.holdings` 类型加 `putCall?: string`。并在 `computeConsensus.ts:43-44` 的 `readAll` 列加 `put_call`,映射到 `putCall`:

```ts
const latestH = await readAll(db, "holdings", "cusip,issuer,value,shares,weight,put_call", (q) => q.eq("filing_id", filings[0].id));
// ...映射 scan/holderScan 时:holdings: r.latestH.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: Number(h.value), putCall: h.put_call ?? undefined }))
```

`diff()` 的 cusip 键碰撞:过滤期权后同 cusip 只剩正股一行,碰撞消失(无需再改键)。

- [ ] **Step 4: 跑,确认通过** — `npx tsx src/lib/consensus/compute.check.ts` → OK;`npx tsc --noEmit`。

- [ ] **Step 5: 重跑 consensus** — 重跑 `computeAndStoreConsensus`。验证:PLTR 个股页"谁在持有"不含 Scion;PLTR holder_count 减 1。

- [ ] **Step 6: 提交**

```bash
git add web/scripts/lib/computeConsensus.ts web/src/lib/consensus/compute.ts web/src/lib/consensus/compute.check.ts
git commit -m "fix(consensus): holder/moves/trend剔除put/call,期权不再算多头

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 11: aggregations fallback 剔除期权

`computeMostHeld`(L44)按 `h.cusip` 聚合、`computeNotableMoves`(L70)按 `c.cusip` 计数,均含期权。

**Files:**
- Modify: `web/src/lib/aggregations.ts:44-88`
- Test: `web/src/lib/aggregations.check.ts`(新建)

- [ ] **Step 1: 写失败断言** — `aggregations.check.ts`:

```ts
import { computeMostHeld, computeNotableMoves } from "./aggregations";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
const scan = [{ slug:"s", person:"S", period:"2026-03-31",
  holdings:[{cusip:"X",issuer:"XX",value:9e8,shares:1,weight:1,putCall:"Put"} as any,{cusip:"Y",issuer:"YY",value:1e8,shares:1,weight:0.1} as any],
  changes:[] }] as any;
const held = computeMostHeld(scan, 10);
assert(!held.find((h)=>h.cusip==="X"), "put不计入most-held");
assert(!!held.find((h)=>h.cusip==="Y"), "普通股保留");
console.log("aggregations.check OK");
```

- [ ] **Step 2: 跑,确认失败** — `cd web && npx tsx src/lib/aggregations.check.ts` → FAIL。

- [ ] **Step 3: 实现** — `computeMostHeld` 内层遍历加 `if (h.putCall) continue;`;`computeNotableMoves` 的 `for (const c of row.changes)` 内加 `if (c.putCall) continue;`。

- [ ] **Step 4: 跑,确认通过** — `npx tsx src/lib/aggregations.check.ts` → OK;`npx tsc --noEmit`。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/aggregations.ts web/src/lib/aggregations.check.ts
git commit -m "fix(aggregations): most-held/notable-moves剔除期权(fallback路径)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 12: 投资人页汇总口径长仓 only

`topHolding`(L331)、`top1`(L380)、`totalValue` 展示(L359/386)、`holdings.length`(L370)、QoQ(L350-352)含期权。

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`(汇总计算处)

- [ ] **Step 1: 实现** — 在算 keyFacts 前派生长仓子集与长仓总值,汇总一律基于它;持仓表仍用全量(Task 13):

```ts
const longHoldings = latest.holdings.filter((h) => !h.putCall);
const longTotalValue = longHoldings.reduce((s, h) => s + h.value, 0);
```

将 `topHolding`/`shareTopHolding`/`top1`/`top1Pct` 的 `latest.holdings` 换成 `longHoldings`,分母用 `longTotalValue`;`latest.holdings.length`(L370/387、`posCount`)换成 `longHoldings.length`;`valDeltaPct`/`cntDelta` 的 prior 也用 prior 的长仓子集:

```ts
const priorLong = prior ? prior.holdings.filter((h) => !h.putCall) : null;
const priorLongTotal = priorLong ? priorLong.reduce((s, h) => s + h.value, 0) : 0;
const valDeltaPct = priorLong && priorLongTotal > 0 ? (longTotalValue - priorLongTotal) / priorLongTotal : null;
const cntDelta = priorLong ? longHoldings.length - priorLong.length : 0;
```

组合市值展示 `formatUSD(latest.totalValue)` 两处(L359/386)换成 `formatUSD(longTotalValue)`。

- [ ] **Step 2: tsc + 目视** — `npx tsc --noEmit`;preview `/en/investors/scion-asset-management`,确认"第一大持仓"不再是 Palantir、组合市值不含 $912M put。

- [ ] **Step 3: 提交**

```bash
git add "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "fix(investors): 汇总(top holding/组合市值/持仓数/QoQ)口径改长仓only

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 13: 持仓表保留期权 + PUT/CALL 标注

期权行仍显示,但清楚标 `PUT`/`CALL`,并注明市值为名义价值;权重按长仓总值重算(期权行不显权重)。

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`(`HoldingsTable` 的 issuer/value/weight 列)

- [ ] **Step 1: 实现** — issuer 列在 `EntityName` 后按 `h.putCall` 加徽章:

```tsx
cell: (h) => (
  <span className="inline-flex items-center gap-1.5">
    <EntityName issuer={h.issuer} ticker={cusipToTicker.get(h.cusip) ?? h.cusip} />
    {h.putCall && (
      <span
        className={`rounded-sm px-1 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${h.putCall === "Put" ? "text-[var(--tt-warn)]" : "text-[var(--tt-muted)]"} border border-current/40`}
        title={lang === "zh" ? "期权:市值为标的名义价值,非权利金" : "Option: value is notional, not premium"}
      >
        {h.putCall === "Put" ? "PUT" : "CALL"}
      </span>
    )}
  </span>
),
```

weight 列:期权行不显权重条(名义权重无意义):

```tsx
cell: (h) => h.putCall ? <span className="text-[var(--tt-faint)]">—</span> : <WeightBar weight={h.weight ?? null} />,
```

(HOLD_COPY 无需新增文案键;徽章 PUT/CALL 为既定金融术语,title 走 zh/en 双份。)

- [ ] **Step 2: tsc + 目视** — `npx tsc --noEmit`;preview Scion 页,确认 Palantir 行带红色 `PUT` 徽章、无权重条,hover 有名义价值说明。

- [ ] **Step 3: 提交**

```bash
git add "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(investors): 持仓表期权行加PUT/CALL标注+名义价值说明,期权不显权重

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

# Phase 3 — 估值信号小修

## Task 14: 陈旧价不当现价喂 strike-zone

`getLatestPrice` 无时龄上限,退市/取数失败的票拿旧 close 当现价。

**Files:**
- Modify: `web/src/lib/managers/priceRead.ts:16-24`(加最大时龄)
- Test: `web/src/lib/managers/priceRead.check.ts`(新建,测纯判定 helper)

- [ ] **Step 1: 写失败断言** — 抽 `isPriceStale(date, today, maxDays)` 纯函数。`priceRead.check.ts`:

```ts
import { isPriceStale } from "./priceRead";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
assert(isPriceStale("2026-06-01", new Date("2026-07-04T00:00:00Z"), 10) === true, "33天前的价stale");
assert(isPriceStale("2026-07-02", new Date("2026-07-04T00:00:00Z"), 10) === false, "2天前的价fresh");
console.log("priceRead.check OK");
```

- [ ] **Step 2: 跑,确认失败** — `cd web && npx tsx src/lib/managers/priceRead.check.ts` → FAIL。

- [ ] **Step 3: 实现** — 加 `isPriceStale` 与常量 `PRICE_MAX_AGE_DAYS = 10`,`getLatestPrice` 返回结果带 `stale` 标记(不硬丢,消费者决定):

```ts
export const PRICE_MAX_AGE_DAYS = 10;
export function isPriceStale(date: string, today: Date, maxDays = PRICE_MAX_AGE_DAYS): boolean {
  const d = new Date(date + "T00:00:00Z").getTime();
  return (today.getTime() - d) / 86_400_000 > maxDays;
}
```

`LatestPrice` 加 `stale?: boolean`;`getLatestPrice` 里 `stale: isPriceStale(r.date, new Date())`。`scripts/valuation-ingest.ts:106-108` 消费处:若 `price?.stale`,不喂 strikeZone/oeDcf(记 skipped 或写 verdict 时标 stale coverage)。

- [ ] **Step 4: 跑,确认通过** — `npx tsx src/lib/managers/priceRead.check.ts` → OK;`npx tsc --noEmit`。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/managers/priceRead.ts web/src/lib/managers/priceRead.check.ts web/scripts/valuation-ingest.ts
git commit -m "fix(valuation): 陈旧价(>10天)不再当现价喂strike-zone

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 15: margin 锚定 valueFloor + 展示价值带一致 + 空白 margin

现状(db-foundation)`marginPct = rangeLo > 0 ? (rangeLo - price)/rangeLo : null`,拿 OE-DCF 低端 `rangeLo` 当分母,与 EPV 世界的 strike 判据打架 → below 名显示天文负 margin(GCO −566%/HLX −1307%)。本任务:marginPct 改锚 `valueFloor`(与 inStrikeZone/position 同底),展示价值带下沿也对齐 valueFloor,并处理 `valueFloor≤0` 空白 margin。

**Files:**
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts`(valueFloor≤0 分支)
- Modify: `web/src/app/[lang]/stocks/screener/ScreenerTable.tsx:67`(band 展示锚一致)
- Modify: `web/src/lib/valuation/deriveValuationVerdict.check.ts`(补用例)

- [ ] **Step 1: 补失败断言** — `deriveValuationVerdict.check.ts` 加:①below 桶、`valueFloor>0` → `marginPct === (valueFloor - price)/valueFloor`(非 rangeLo 口径);②below 桶、`valueFloor≤0` → `marginPct === null`;③断言输出的 `rangeLo === valueFloor`(展示价值带下沿 = marginPct 分母,同锚)。

- [ ] **Step 2: 跑,确认失败** — `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts` → FAIL。

- [ ] **Step 3: 实现** — `deriveValuationVerdict.ts`:(a) 找到 `const marginPct = rangeLo > 0 ? (rangeLo - price) / rangeLo : null;`,改为锚 valueFloor:

```ts
// 安全边际相对 valueFloor(与 inStrikeZone/epv.position 同一个底),而非 rangeLo(OE-DCF+增长最小端)。
// 二者可差 10× → 旧口径下 below 名显示天文负 margin(GCO −566%/HLX −1307%)且污染 strike 排序。
const valueFloor = epv.valueFloor;
const marginPct = valueFloor > 0 ? (valueFloor - price) / valueFloor : null;
```

(b) 输出的 `rangeLo` 对齐到 `valueFloor`(展示价值带下沿 = marginPct 分母),`rangeHi` 不变;(c) `valueFloor≤0` 时 marginPct=null,ScreenerTable 的 `marginPct != null && > 0` 已把 below 绿标空白拦成 `—`,无需额外改;`ScreenerTable.tsx:67` 的 `band(r.rangeLo, r.rangeHi)` 因 rangeLo=valueFloor 自然与 margin 列同锚。同步更新 `marginPct` 字段的 JSDoc 说明。

- [ ] **Step 4: 跑,确认通过** — `npx tsx src/lib/valuation/deriveValuationVerdict.check.ts` → OK;`npx tsc --noEmit`。抽查 GCO/HLX 不再天文负 margin。

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/deriveValuationVerdict.check.ts "web/src/app/[lang]/stocks/screener/ScreenerTable.tsx"
git commit -m "fix(valuation): margin与展示价值带同锚valueFloor,处理valueFloor<=0空白margin

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

## Task 16: OE-DCF `anchored` 反映 DGS10 陈旧度

last-good DGS10 无论多旧都标 `anchored:true`。

**Files:**
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts:99-126`(`discountBand`)

- [ ] **Step 1: 实现** — `discountBand(dgs10)` 的 dgs10 分支(L110-126)现无条件 `anchored: true`。dgs10 已带 `date`。加常量 `DGS10_MAX_AGE_DAYS = 45`,用 Task 14 的 `isPriceStale` 判 `dgs10.date` 陈旧:

```ts
import { isPriceStale } from "@/lib/managers/priceRead";
const DGS10_MAX_AGE_DAYS = 45;
// ...在 dgs10 分支内:
const stale = isPriceStale(dgs10.date, new Date(), DGS10_MAX_AGE_DAYS);
return {
  r_low: rLow,
  r_high: rHigh,
  midpoint: (rLow + rHigh) / 2,
  dgs10_value: dgs10Dec,
  dgs10_date: dgs10.date,
  anchored: !stale,
  inverted,
  note: stale
    ? `DGS10 last-good ${dgs10.date} 已超 ${DGS10_MAX_AGE_DAYS} 天,贴现带未锚定实时利率。`
    : inverted
    ? `DGS10 ${dgs10.value.toFixed(2)}% pushes the +4.5% end above the 12% strict threshold; band shown as [min,max].`
    : `Discount band: ${(rLow * 100).toFixed(2)}%–${(rHigh * 100).toFixed(2)}% (DGS10 +4.5% to a 12% strict end, as of ${dgs10.date}).`,
};
```

(note 文案面向内部 provenance;若展示给终端用户须补 en 版。)

- [ ] **Step 2: tsc** — `cd web && npx tsc --noEmit`。

- [ ] **Step 3: 提交**

```bash
git add web/src/lib/valuation/ownerEarningsDcf.ts
git commit -m "fix(valuation): DGS10 last-good过旧时anchored置false

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 收尾验证(全部完成后)

- [ ] `cd web && npx tsc --noEmit` 全绿。
- [ ] 全部 `*.check.ts` 跑一遍通过。
- [ ] 重跑 ingest + consensus + valuation-ingest(按 `sec-valuation-ingest-ops` 记忆的跑法)。
- [ ] Preview 真机抽查:Scion 页(top holding 非 Palantir、Palantir 行带 PUT 标)、PLTR 个股页(持有人不含 Burry)、Makaira 页(非 $0)、consensus 页、screener(无 −0%/无天文负 margin)。
- [ ] 更新记忆 `bug-audit-2026-07`:状态从"全部待修"改为已修阶段。
