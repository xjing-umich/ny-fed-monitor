# 投资人页估值姿态升头条 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 详情页把已加载的估值姿态从「页底出口」提到「头条读法」——keyFact 第 4 项换成击球区数、持仓表上方加一个「便宜持仓」小节,三处计数共用一份 reliable-gated 纯函数。

**Architecture:** 纯页面派生 + 一个纯函数(`deriveValuationPosture`),复用页面**已调用**的 `readValuationVerdicts` 结果。零新读取器、零迁移、零部署 op。镜像上一轮独门重仓(`lonelyConviction.ts`)的结构与打法。

**Tech Stack:** Next 16 App Router / React 19 RSC / TypeScript / Tailwind v4 `--tt-*` 令牌。

## Global Constraints

- **回复与文档正文中文**(代码/类名/命令/既定术语/路径除外)。
- **数据 as-of**:估值小节引导句必带估值 as-of(`posture.asOf`=价格日),与 13F 披露期 `latest.period` 分开标(CLAUDE.md 硬规)。
- **信心闸**:估值计数只认 `reliable=true`(与 `/stocks/screener` strike_zone/below 视图同口径)。
- **去 AI 腔**:朴素、每句带数字/名词;禁破折号抒情/对偶/三元枚举/对冲词/装饰图标。
- **每 locale 纯本语言**,禁中英混排;例外仅品牌锁形 + 击球区/strike zone 等既定术语。
- **SSR 全文可爬**:头条数字与小节服务端全文可见(RSC 默认)。
- **优雅降级**:`verdicts` 空 → 各计数 0、`cheap:[]` → 小节不渲染、keyFact 显 0、页面不炸。
- **验收门**:`cd web && npx tsc --noEmit` = 0(本地 `next build` 因 Google Fonts 墙必失败,不用它当门);`npx tsx src/lib/managers/valuationPosture.check.ts` OK;`npm run ai-check` 无新增。无测试套件(solo dev)。
- **长仓 only**:入参用页面 `longHoldings`。

---

### Task 1: 纯函数 `deriveValuationPosture` + 断言

**Files:**
- Create: `web/src/lib/managers/valuationPosture.ts`
- Test: `web/src/lib/managers/valuationPosture.check.ts`

**Interfaces:**
- Consumes: `SnapshotVerdict`(from `@/lib/valuation/valuationSnapshot` — 字段 `bucket:"below"|"within"|"above"` / `inStrikeZone:boolean` / `marginPct:number|null` / `reliable:boolean` / `priceDate:string`);`VerdictBucket`(from `@/lib/valuation/deriveValuationVerdict`)。
- Produces: `deriveValuationPosture(input): ValuationPosture`、类型 `ValuationPosture` / `CheapHolding`、常量 `POSTURE_LIMIT = 6`。供 Task 2 页面消费。

- [ ] **Step 1: 写断言脚本(先失败)**

Create `web/src/lib/managers/valuationPosture.check.ts`:

```ts
import { deriveValuationPosture, type CheapHolding } from "./valuationPosture";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

// 造 verdict 的小工厂(只填被 deriveValuationPosture 读到的字段, 其余给合法占位)
function v(partial: Partial<SnapshotVerdict>): SnapshotVerdict {
  return {
    ticker: "X", bucket: "within", inStrikeZone: false, rangeLo: 1, rangeHi: 2,
    price: 1.5, priceDate: "2026-06-30", marginPct: null, coverage: "full",
    reliable: true, computedAt: "2026-07-01", ...partial,
  };
}

const cusipToTicker = new Map([
  ["ACUSIP", "A"], ["BCUSIP", "B"], ["CCUSIP", "C"],
  ["DCUSIP", "D"], ["ECUSIP", "E"], ["FCUSIP", "F"],
]);
// A: 击球区+可信(margin 0.30, priceDate 07-01) → cheap+strike
// B: below+可信(margin 0.10) → cheap(非击球区)
// C: below 但 reliable=false → 信心闸滤掉, 不计
// D: within → 不 cheap
// E: above → 不 cheap
// F: 击球区但 marginPct=null → cheap, 排序垫底
const verdicts = new Map<string, SnapshotVerdict>([
  ["A", v({ ticker: "A", bucket: "below", inStrikeZone: true, marginPct: 0.30, priceDate: "2026-07-01" })],
  ["B", v({ ticker: "B", bucket: "below", inStrikeZone: false, marginPct: 0.10, priceDate: "2026-06-30" })],
  ["C", v({ ticker: "C", bucket: "below", inStrikeZone: true, marginPct: 0.50, reliable: false })],
  ["D", v({ ticker: "D", bucket: "within", inStrikeZone: false, marginPct: 0.02 })],
  ["E", v({ ticker: "E", bucket: "above", inStrikeZone: false })],
  ["F", v({ ticker: "F", bucket: "below", inStrikeZone: true, marginPct: null, priceDate: "2026-06-20" })],
]);
const holdings = [
  { cusip: "ACUSIP", issuer: "Alpha" }, { cusip: "BCUSIP", issuer: "Bravo" },
  { cusip: "CCUSIP", issuer: "Charlie" }, { cusip: "DCUSIP", issuer: "Delta" },
  { cusip: "ECUSIP", issuer: "Echo" }, { cusip: "FCUSIP", issuer: "Foxtrot" },
];

const p = deriveValuationPosture({ holdings, cusipToTicker, verdicts });
// (a) 信心闸: C(reliable=false) 不计入任何计数、不进 cheap
assert(!p.cheap.some((x) => x.ticker === "C"), "C(reliable=false) 不应进 cheap");
// (b) 计数: covered = A,B,D,E,F = 5(C 被闸掉); strike = A,F = 2; below = A,B,F = 3
assert(p.covered === 5, `covered=5, got ${p.covered}`);
assert(p.strikeCount === 2, `strikeCount=2(A,F), got ${p.strikeCount}`);
assert(p.belowCount === 3, `belowCount=3(A,B,F), got ${p.belowCount}`);
// (c) cheap 判据 = inStrikeZone ∪ below → A,B,F(D within/E above 不进)
assert(p.cheap.length === 3, `cheap=3(A,B,F), got ${p.cheap.length}: ${p.cheap.map((x) => x.ticker)}`);
assert(!p.cheap.some((x) => ["D", "E"].includes(x.ticker)), "within/above 不应进 cheap");
// (d) 降序 + null 垫底: A(0.30), B(0.10), F(null)
assert(p.cheap.map((x: CheapHolding) => x.ticker).join(",") === "A,B,F", `排序应 A,B,F, got ${p.cheap.map((x) => x.ticker)}`);
// (e) asOf = 参与行(covered)最大 priceDate = 2026-07-01(A)
assert(p.asOf === "2026-07-01", `asOf=2026-07-01, got ${p.asOf}`);
// (f) 空输入 / verdicts 空 → 全 0 + cheap:[] + asOf:""
const empty = deriveValuationPosture({ holdings, cusipToTicker, verdicts: new Map() });
assert(empty.covered === 0 && empty.strikeCount === 0 && empty.belowCount === 0 && empty.cheap.length === 0 && empty.asOf === "", "verdicts 空 → 全 0 降级");
assert(deriveValuationPosture({ holdings: [], cusipToTicker, verdicts }).covered === 0, "空 holdings → covered 0");

console.log("valuationPosture.check OK");
```

- [ ] **Step 2: 跑断言, 确认失败**

Run: `cd web && npx tsx src/lib/managers/valuationPosture.check.ts`
Expected: 报错(模块不存在)。

- [ ] **Step 3: 写实现**

Create `web/src/lib/managers/valuationPosture.ts`:

```ts
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import type { VerdictBucket } from "@/lib/valuation/deriveValuationVerdict";

export type CheapHolding = {
  issuer: string;
  ticker: string;
  marginPct: number | null; // 安全边际(分数); 展示 Math.round(*100)%
  inStrikeZone: boolean;
  bucket: VerdictBucket;
};

export type ValuationPosture = {
  covered: number; // 有可信估值(reliable)的长仓持仓数(分母)
  strikeCount: number; // inStrikeZone && reliable
  belowCount: number; // bucket==="below" && reliable
  cheap: CheapHolding[]; // inStrikeZone ∪ below, marginPct 降序(null 垫底), 不截断
  asOf: string; // 参与计数行最大 priceDate; 无则 ""
};

export const POSTURE_LIMIT = 6;

/**
 * 从已加载的估值快照(readValuationVerdicts 结果)派生投资人组合的「估值姿态」。
 * 信心闸: 只认 reliable=true(与 /stocks/screener strike_zone/below 视图同口径)。
 * 纯函数、零 IO → valuationPosture.check.ts 断言。截断挪展示层(返回全部 cheap)。
 */
export function deriveValuationPosture(input: {
  holdings: { cusip: string; issuer: string }[];
  cusipToTicker: Map<string, string>;
  verdicts: Map<string, SnapshotVerdict>;
}): ValuationPosture {
  let covered = 0;
  let strikeCount = 0;
  let belowCount = 0;
  let asOf = "";
  const cheap: CheapHolding[] = [];
  for (const h of input.holdings) {
    const ticker = input.cusipToTicker.get(h.cusip);
    if (!ticker) continue;
    const vd = input.verdicts.get(ticker.toUpperCase());
    if (vd == null || !vd.reliable) continue; // 信心闸
    covered += 1;
    if (vd.priceDate && vd.priceDate > asOf) asOf = vd.priceDate;
    const isBelow = vd.bucket === "below";
    if (vd.inStrikeZone) strikeCount += 1;
    if (isBelow) belowCount += 1;
    if (vd.inStrikeZone || isBelow) {
      cheap.push({
        issuer: h.issuer,
        ticker,
        marginPct: vd.marginPct,
        inStrikeZone: vd.inStrikeZone,
        bucket: vd.bucket,
      });
    }
  }
  // marginPct 降序, null 垫底
  cheap.sort((a, b) => {
    if (a.marginPct == null && b.marginPct == null) return 0;
    if (a.marginPct == null) return 1;
    if (b.marginPct == null) return -1;
    return b.marginPct - a.marginPct;
  });
  return { covered, strikeCount, belowCount, cheap, asOf };
}
```

- [ ] **Step 4: 跑断言, 确认通过**

Run: `cd web && npx tsx src/lib/managers/valuationPosture.check.ts`
Expected: `valuationPosture.check OK`

- [ ] **Step 5: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: 0 报错。

- [ ] **Step 6: 提交**

```bash
git add web/src/lib/managers/valuationPosture.ts web/src/lib/managers/valuationPosture.check.ts
git commit -m "feat(investors): deriveValuationPosture 纯函数(reliable闸/cheap=strike∪below/断言)"
```

---

### Task 2: 投资人页整合(keyFact 换击球区 + 估值姿态小节 + 独门 h2 补计数 + handoff 共享)

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`

**Interfaces:**
- Consumes: Task 1 的 `deriveValuationPosture` / `POSTURE_LIMIT`;页面已有 `longHoldings` / `cusipToTicker` / `verdicts` / `lonely` / `latest` / `cleanIssuer` / `stockPath` / `investorHandoffFor`。
- Produces: 无(终端页面)。

- [ ] **Step 1: import 纯函数**

在文件顶部 import 区(紧邻 `lonelyConviction` 那行,当前约 page.tsx 顶部 import 组)新增:

```ts
import { deriveValuationPosture, POSTURE_LIMIT } from "@/lib/managers/valuationPosture";
```

- [ ] **Step 2: 用 posture 替换 ad-hoc strikeCount 块**

找到当前 `strikeCount` 计算块([page.tsx:314-318](../../../src/app/[lang]/investors/[slug]/page.tsx:314)):

```ts
  // 该投资人当前持仓中现价落在击球区的只数(与 screener strike_zone 视图同口径)。
  const strikeCount = longHoldings.reduce((acc, h) => {
    const tk = cusipToTicker.get(h.cusip);
    return acc + (tk && verdicts.get(tk.toUpperCase())?.inStrikeZone ? 1 : 0);
  }, 0);
```

替换为(reliable-gated 单一真相源,喂 keyFact/小节/handoff):

```ts
  // 组合估值姿态(现价 vs 保守价值带): reliable-gated 单一真相源, 喂 keyFact/小节/页底 handoff。
  const posture = deriveValuationPosture({
    holdings: longHoldings.map((h) => ({ cusip: h.cusip, issuer: h.issuer })),
    cusipToTicker,
    verdicts,
  });
```

> 说明:原 `strikeCount` 未加 reliable 闸;`posture.strikeCount` 已加(口径向 screener 对齐)。下方 line 550 handoff 改用 `posture.strikeCount`(Step 5)。

- [ ] **Step 3: keyFacts 第 4 项:独门重仓 → 击球区**

找到 `keyFacts`([page.tsx:412-417](../../../src/app/[lang]/investors/[slug]/page.tsx:412))第 4 项:

```ts
    { label: lang === "zh" ? "独门重仓" : "Lonely bets", value: lang === "zh" ? `${lonely.length} 只` : String(lonely.length) },
```

替换为:

```ts
    { label: lang === "zh" ? "击球区" : "Strike zone", value: String(posture.strikeCount) },
```

- [ ] **Step 4: 估值姿态小节(独门小节之前)+ 独门 h2 补计数**

找到 children 里独门小节起点([page.tsx:510](../../../src/app/[lang]/investors/[slug]/page.tsx:510) `{lonely.length > 0 && (`)。在它**之前**插入估值姿态小节:

```tsx
          {posture.cheap.length > 0 && (
            <section aria-label={lang === "zh" ? "估值姿态" : "Valuation posture"}>
              <h2 className="border-t border-[var(--tt-border)] pt-4 pb-3 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                {lang === "zh" ? "估值姿态" : "Valuation posture"}
              </h2>
              <p className="mb-3 text-sm text-[var(--tt-muted)]">
                {lang === "zh"
                  ? `这只基金 ${posture.covered} 只可估值美股持仓中，有 ${posture.cheap.length} 只现价低于保守价值带${posture.strikeCount > 0 ? `（其中 ${posture.strikeCount} 只落在击球区）` : ""}${posture.asOf ? `（估值截至 ${posture.asOf}）` : ""}：`
                  : `Of ${posture.covered} valued US positions, ${posture.cheap.length} trade below a conservative value band${posture.strikeCount > 0 ? ` (${posture.strikeCount} in the strike zone)` : ""}${posture.asOf ? ` (as of ${posture.asOf})` : ""}:`}
              </p>
              <div className="flex flex-wrap gap-2">
                {posture.cheap.slice(0, POSTURE_LIMIT).map((h) => (
                  <Link
                    key={h.ticker}
                    href={stockPath(lang, h.ticker)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--tt-border)] px-2.5 py-1 no-underline transition-colors hover:border-[var(--tt-accent)]"
                  >
                    <span className="text-sm text-[var(--tt-text)]">{cleanIssuer(h.issuer)}</span>
                    <span className="font-mono text-[11px] text-[var(--tt-muted)]">
                      {h.marginPct != null
                        ? `${Math.round(h.marginPct * 100)}% ${lang === "zh" ? "安全边际" : "margin"} · `
                        : ""}
                      {h.inStrikeZone
                        ? lang === "zh" ? "击球区" : "strike zone"
                        : lang === "zh" ? "低于价值带" : "below band"}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
```

同一步,把独门小节 h2 文本([page.tsx:513](../../../src/app/[lang]/investors/[slug]/page.tsx:513))补计数:

```tsx
                {lang === "zh" ? "独门重仓" : "Lonely conviction"}
```

改为:

```tsx
                {lang === "zh" ? `独门重仓 · ${lonely.length} 只` : `Lonely conviction · ${lonely.length}`}
```

> 校验:`Link` / `stockPath` / `cleanIssuer` 均已在本文件 import(独门小节已用),无需新 import。

- [ ] **Step 5: 页底 handoff 改用 posture.strikeCount**

找到 [page.tsx:550](../../../src/app/[lang]/investors/[slug]/page.tsx:550):

```tsx
          <DiscoveryHandoff {...investorHandoffFor(strikeCount, manager.person, lang)} />
```

改为:

```tsx
          <DiscoveryHandoff {...investorHandoffFor(posture.strikeCount, manager.person, lang)} />
```

- [ ] **Step 6: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: 0 报错(尤其确认无残留 `strikeCount` 未定义引用)。

- [ ] **Step 7: ai-check 门**

Run: `cd web && npm run ai-check`
Expected: 无新增违规。

- [ ] **Step 8: 提交**

```bash
git add "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(investors): 估值姿态升头条(keyFact击球区+便宜持仓小节+独门h2计数+handoff同源)"
```

---

## Self-Review(写完计划回看)

- **Spec coverage**:A→Task1;B/C/D/E→Task2 Steps 3/4/4/5。全覆盖。
- **Placeholder scan**:无 TBD/TODO;每步含真实代码/命令/期望输出。
- **Type consistency**:`deriveValuationPosture` 签名 Task1 定义、Task2 按 `{holdings,cusipToTicker,verdicts}` 调用一致;`POSTURE_LIMIT` 两处一致;`posture.strikeCount/covered/cheap/asOf` 字段与类型定义一致。
- **口径**:三处计数(keyFact/小节/handoff)均取自单一 `posture`,N 不漂移;reliable 闸集中在纯函数。
