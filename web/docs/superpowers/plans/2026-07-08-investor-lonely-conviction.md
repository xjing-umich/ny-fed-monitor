# 投资人页 独门重仓(Lonely Conviction) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 投资人详情页头条从"体量陈列"进到"质量判断"——用双闸(少人持 + 够重)派生"独门重仓",做成头条数字 + 持仓表上方一小节。

**Architecture:** 一个纯函数 `deriveLonelyConviction`(带 `.check.ts` 断言)+ 投资人页三处改动(算 lonely、keyFacts 合并末两项并加"独门 N 只"、插独门小节)。复用页面已加载的 `holderCounts`(精确共持数含 count=1),零数据层改动、零部署 op。

**Tech Stack:** Next.js 16 App Router(RSC)/ React 19 / TypeScript / Tailwind v4 / tsx(断言脚本)。

**设计出处:** [2026-07-08-investor-lonely-conviction-design.md](../specs/2026-07-08-investor-lonely-conviction-design.md)

## Global Constraints

- **长仓 only**:入参用页面 `longHoldings`;`holderCounts` 已长仓口径(compute 侧剔 putCall)。
- **每 locale 纯本语言**,禁中英混排;去 AI 腔(朴素、每句带数字/名词,无破折号抒情/对偶/三元/对冲词)。`npm run ai-check` 不新增命中。
- **数据 as-of**:独门小节引导句带共持数据 as-of(`latest.period`,13F 披露期)。
- **SSR 全文可爬**:头条数字与小节均可见服务端全文。
- **优雅降级**:`holderCounts` 空 → `deriveLonelyConviction` 返回 `[]` → 小节不渲染、keyFact 显 0,页面其余照常。
- **权重口径**:组合权重在函数内自算 `value / totalValue`(与 keyFacts 的 `top1Pct` 同源),不用 `h.weight`(量纲不确定)。
- **Next 16 非你所知**:改任何 Next API 前先读 `web/node_modules/next/dist/docs/`;本计划仅在既有 RSC 页内加服务端渲染块,不碰 Next API。
- **验收门**:每 task 结束 `cd web && npx tsc --noEmit` = 0;纯函数 task 跑其 `.check.ts`;页面 task 跑 grep 断言 + 本地 `next dev` 目测 375/768/1280 + `npm run ai-check`。无测试套件(solo dev)。

## 文件结构

**新建**
- `web/src/lib/managers/lonelyConviction.ts` — `deriveLonelyConviction` + 常量 + `LonelyHolding` 类型
- `web/src/lib/managers/lonelyConviction.check.ts` — 断言脚本

**修改**
- `web/src/app/[lang]/investors/[slug]/page.tsx` — 算 `lonely`;keyFacts 合并末两项 + 加"独门 N 只";持仓表上方插独门小节

---

## Task 1: `deriveLonelyConviction` 纯函数 + 断言

**Files:**
- Create: `web/src/lib/managers/lonelyConviction.ts`
- Create: `web/src/lib/managers/lonelyConviction.check.ts`

**Interfaces:**
- Consumes: 无(纯函数,输入全由调用方给)。
- Produces:
  - `export type LonelyHolding = { issuer: string; ticker: string; weight: number; holderCount: number; value: number }`
  - `export const LONELY_MAX_HOLDERS = 2` / `MIN_CONVICTION_WEIGHT = 0.03` / `LONELY_LIMIT = 6`
  - `export function deriveLonelyConviction(input: { holdings: { cusip: string; issuer: string; value: number }[]; cusipToTicker: Map<string,string>; holderCounts: Map<string,number>; totalValue: number; maxHolders?: number; minWeight?: number; limit?: number }): LonelyHolding[]`

- [ ] **Step 1: 写断言(先失败)**

写 `web/src/lib/managers/lonelyConviction.check.ts`:
```ts
import { deriveLonelyConviction } from "./lonelyConviction";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const cusipToTicker = new Map([
  ["ACUSIP", "A"], ["BCUSIP", "B"], ["CCUSIP", "C"], ["DCUSIP", "D"], ["ECUSIP", "E"],
]);
// A: 1 家持(独门), B: 2 家(独门), C: 5 家(拥挤), D: 1 家(独门但小仓); E: 共持数缺失
const holderCounts = new Map([["A", 1], ["B", 2], ["C", 5], ["D", 1]]);
const holdings = [
  { cusip: "ACUSIP", issuer: "Alpha", value: 200 },   // 20% 权重, 独门 → 入选
  { cusip: "BCUSIP", issuer: "Bravo", value: 40 },    // 4% 权重, 独门 → 入选
  { cusip: "CCUSIP", issuer: "Charlie", value: 300 }, // 30% 但 5 家持 → 排除
  { cusip: "DCUSIP", issuer: "Delta", value: 20 },    // 2% (<3%) 独门但小仓 → 排除
  { cusip: "ECUSIP", issuer: "Echo", value: 500 },    // 共持数 undefined → 保守跳过
];
const r = deriveLonelyConviction({ holdings, cusipToTicker, holderCounts, totalValue: 1000 });
assert(r.length === 2, `双闸命中 2, got ${r.length}: ${JSON.stringify(r.map((x) => x.ticker))}`);
assert(r[0].ticker === "A" && r[1].ticker === "B", `按 weight 降序应 A,B, got ${r.map((x) => x.ticker)}`);
assert(Math.abs(r[0].weight - 0.2) < 1e-9, `A weight=0.2, got ${r[0].weight}`);
assert(r[0].holderCount === 1, `A holderCount=1, got ${r[0].holderCount}`);
assert(!r.some((x) => ["C", "D", "E"].includes(x.ticker)), `C(拥挤)/D(小仓)/E(共持缺失)不应入选`);

// totalValue<=0 → [](降级)
assert(deriveLonelyConviction({ holdings, cusipToTicker, holderCounts, totalValue: 0 }).length === 0, `totalValue=0 → []`);

// limit 截断: 10 只都独门够重 → 只取 6
const many = Array.from({ length: 10 }, (_, i) => ({ cusip: `X${i}`, issuer: `X${i}`, value: 100 }));
const c2t = new Map(many.map((h) => [h.cusip, h.cusip]));
const hc = new Map(many.map((h) => [h.cusip.toUpperCase(), 1]));
const rl = deriveLonelyConviction({ holdings: many, cusipToTicker: c2t, holderCounts: hc, totalValue: 1000 });
assert(rl.length === 6, `limit=6 截断, got ${rl.length}`);

console.log("lonelyConviction.check OK");
```

- [ ] **Step 2: 跑, 确认失败**

Run: `cd web && npx tsx src/lib/managers/lonelyConviction.check.ts`
Expected: 报错 `Cannot find module './lonelyConviction'`(FAIL)。

- [ ] **Step 3: 实现纯函数**

写 `web/src/lib/managers/lonelyConviction.ts`:
```ts
// 独门重仓(Lonely Conviction): 少人持 + 够重的交集 —— 一个投资人最不随大流的实质下注。
// 双闸: 共持数 ≤ maxHolders(默认 2 = 只此人 + 至多 1 家)且 组合权重 ≥ minWeight(默认 3%)。
// 权重在函数内自算 value/totalValue(与投资人页 top1Pct 同源), 不依赖 h.weight 的量纲。

export type LonelyHolding = {
  issuer: string;
  ticker: string;
  weight: number;       // 组合权重(0–1), = value / totalValue
  holderCount: number;  // 被几家超投共持(含本人)
  value: number;
};

export const LONELY_MAX_HOLDERS = 2;
export const MIN_CONVICTION_WEIGHT = 0.03;
export const LONELY_LIMIT = 6;

export function deriveLonelyConviction(input: {
  holdings: { cusip: string; issuer: string; value: number }[];
  cusipToTicker: Map<string, string>;
  holderCounts: Map<string, number>;
  totalValue: number;
  maxHolders?: number;
  minWeight?: number;
  limit?: number;
}): LonelyHolding[] {
  const maxHolders = input.maxHolders ?? LONELY_MAX_HOLDERS;
  const minWeight = input.minWeight ?? MIN_CONVICTION_WEIGHT;
  const limit = input.limit ?? LONELY_LIMIT;
  const { totalValue } = input;
  if (!(totalValue > 0)) return [];

  const out: LonelyHolding[] = [];
  for (const h of input.holdings) {
    const ticker = input.cusipToTicker.get(h.cusip);
    if (!ticker) continue;                                   // 未解析 ticker → 跳
    const holderCount = input.holderCounts.get(ticker.toUpperCase());
    if (holderCount == null || holderCount > maxHolders) continue;  // 共持缺失/拥挤 → 跳
    const weight = h.value / totalValue;
    if (weight < minWeight) continue;                        // 太小 → 跳
    out.push({ issuer: h.issuer, ticker, weight, holderCount, value: h.value });
  }
  out.sort((a, b) => b.weight - a.weight);
  return out.slice(0, limit);
}
```

- [ ] **Step 4: 跑, 确认通过**

Run: `cd web && npx tsx src/lib/managers/lonelyConviction.check.ts`
Expected: `lonelyConviction.check OK`。

- [ ] **Step 5: 类型闸**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出(0 错误)。

- [ ] **Step 6: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/managers/lonelyConviction.ts web/src/lib/managers/lonelyConviction.check.ts
git commit -m "feat(investors): deriveLonelyConviction 纯函数(双闸:少人持+够重)+断言

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 投资人页整合(keyFacts + 独门小节)

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`

**Interfaces:**
- Consumes: `deriveLonelyConviction`、`LonelyHolding`(Task 1);页面已有 `longHoldings`、`longTotalValue`、`cusipToTicker`、`holderCounts`、`topHolding`、`top1Pct`、`latest.period`、`stockPath`、`cleanIssuer`、`Link`(均已 import / 在作用域)。
- Produces: 无(页面末端)。

- [ ] **Step 1: import 纯函数**

在 `web/src/app/[lang]/investors/[slug]/page.tsx` 顶部 import 区加:
```ts
import { deriveLonelyConviction } from "@/lib/managers/lonelyConviction";
```

- [ ] **Step 2: 算 lonely(keyFacts 之前)**

用 grep 定位 `const keyFacts = [`(现约 line 408)。在它**之前**插入(此处 `longHoldings`/`longTotalValue`/`cusipToTicker`/`holderCounts` 均已在作用域):
```ts
  // 独门重仓(少人持 ∩ 够重): 与 keyFact 的 N 同源, 喂下方小节。
  const lonely = deriveLonelyConviction({
    holdings: longHoldings.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: h.value })),
    cusipToTicker,
    holderCounts,
    totalValue: longTotalValue,
  });
```

- [ ] **Step 3: keyFacts 合并末两项 + 加独门**

grep 定位 keyFacts 数组(现 line 408-413)。把末两项:
```ts
    { label: lang === "zh" ? "第一大持仓" : "Top holding", value: topHolding },
    { label: lang === "zh" ? "第一大仓占比" : "Top position", value: top1Pct != null ? `${top1Pct.toFixed(1)}%` : "—" },
```
替换为(合并"第一大持仓"+"占比"成一项,腾出的位放"独门重仓"):
```ts
    { label: lang === "zh" ? "第一大持仓" : "Top holding", value: top1Pct != null ? `${topHolding} · ${top1Pct.toFixed(0)}%` : topHolding },
    { label: lang === "zh" ? "独门重仓" : "Lonely bets", value: lang === "zh" ? `${lonely.length} 只` : String(lonely.length) },
```

- [ ] **Step 4: 插独门小节(持仓表之前)**

grep 定位 `<HoldingsTable`(现约 line 507)。在该行**之前**插入(它在 `<EntityPage>` 的 children `<>...</>` 内):
```tsx
          {lonely.length > 0 && (
            <section aria-label={lang === "zh" ? "独门重仓" : "Lonely conviction"}>
              <div className="border-t border-[var(--tt-border)] pt-4 pb-3">
                <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                  {lang === "zh" ? "独门重仓" : "Lonely conviction"}
                </span>
              </div>
              <p className="mb-3 text-sm text-[var(--tt-muted)]">
                {lang === "zh"
                  ? `以下持仓被至多 2 家超投持有、且各占其组合 3% 以上（共持数据截至 ${latest.period}）：`
                  : `Held by at most 2 tracked superinvestors and each ≥3% of this portfolio (holder data as of ${latest.period}):`}
              </p>
              <div className="flex flex-wrap gap-2">
                {lonely.map((h) => (
                  <Link
                    key={h.ticker}
                    href={stockPath(lang, h.ticker)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--tt-border)] px-2.5 py-1 no-underline transition-colors hover:border-[var(--tt-accent)]"
                  >
                    <span className="text-sm text-[var(--tt-text)]">{cleanIssuer(h.issuer)}</span>
                    <span className="font-mono text-[11px] text-[var(--tt-muted)]">
                      {Math.round(h.weight * 100)}% · {lang === "zh" ? `仅 ${h.holderCount} 家持有` : `held by ${h.holderCount}`}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
```

- [ ] **Step 5: 类型闸 + grep 断言**

Run:
```bash
cd web && npx tsc --noEmit \
  && grep -n "deriveLonelyConviction\|独门重仓\|Lonely conviction\|Lonely bets" "src/app/[lang]/investors/[slug]/page.tsx"
```
Expected: tsc 无输出;命中 import、算 lonely、keyFact 项、小节标题(≥4 处)。

- [ ] **Step 6: 本地目测**

启动 `next dev`,访问一个持仓多、可能有独门票的投资人页(如 `/investors/<slug>`)。确认:keyFacts 第 3 项为"第一大持仓 X · N%"、第 4 项为"独门重仓 N 只";若 N>0,持仓表上方出现独门小节 chip(每个 `issuer · X% · 仅 N 家持有`,链到个股页);N=0 时小节不渲染、keyFact 显"0 只"。375/768/1280 三档不溢出。

- [ ] **Step 7: 去 AI 腔 lint**

Run: `cd web && npm run ai-check`
Expected: 不因本次改动新增命中。

- [ ] **Step 8: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(investors): 独门重仓头条(keyFacts合并末两项+加N只)+持仓表上方小节

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 收尾(全部 task 后)

- [ ] 全量类型闸:`cd web && npx tsc --noEmit` = 0
- [ ] 纯函数断言:`npx tsx src/lib/managers/lonelyConviction.check.ts` OK
- [ ] 去 AI 腔:`npm run ai-check` 无新增
- [ ] 本地三档目测投资人页:keyFacts 合并+独门数字、独门小节(N>0)/不渲染(N=0)、chip 内链、引导句 as-of
- [ ] 转 superpowers:finishing-a-development-branch 收尾(PR 走网页,gh 非 collaborator);**无部署 op**(纯页面+纯函数,合并即生效)
