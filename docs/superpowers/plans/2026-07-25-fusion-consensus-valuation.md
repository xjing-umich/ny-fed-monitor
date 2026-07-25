# 13F 共识 × 估值 融合信号（T1 点亮融合）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「13F 共识 × 估值 verdict」缝成一等融合信号，铺到三个发现面（screener/共识页/投资人页），让"聪明钱在买 × 这价格值不值"第一次在聚合面上被算出来、排出来、看得见。

**Architecture:** 一个纯函数内核 `deriveFusionSignal`（把 holderCount + SnapshotVerdict 缝成吸引力排序键 + 顶层标志 + 隐含预期档），三面复用。screener 新增 `conviction` 视图（新 reader 倒序查 consensus_holdings→join snapshot，按吸引力排）；共识页给排行每行挂估值 badge；ValuationBadge 在 full 密度多吐 expectations 副标 + 投资人页 posture 聚合一行。纯读既有物化数据，零迁移、零 ingest 依赖。

**Tech Stack:** TypeScript 纯函数 + `.check.ts`（tsx 断言，无常驻测试套件）、Next.js App Router RSC、Supabase（只读快照/共识表）、`--tt-*` token。

## Global Constraints

- 分支：`plan/fusion-consensus-valuation`，off `db-foundation` @ 8234502（已 rebase 到最新）。**用已建好的 worktree** `.claude/worktrees/fusion-consensus`；**禁**碰无关在途文件（如 `web/src/components/home/PhilosophyQuote.tsx`、`web/src/lib/learn.ts`）。
- **零迁移 / 零 ingest 依赖**：只读现有 `valuation_snapshot`、`consensus_holdings`、`readValuationVerdicts`。不改任何估值数值/判定或 13F 聚合口径。
- **合规红线**：融合话是**观察不是建议**——`{N} 家持有 · {位置} · 现价隐含 {档}`。无 BUY/SELL/HOLD/目标价/"该买"。隐含数字**永远与位置并置**，禁单独展示。
- **文案**：每 locale 纯本语言（禁中英混排），遵 `web/docs/copy-voice.md`，去 AI 腔（无破折号抒情/三元枚举/对冲词）。位置/档次沿用既有术语（击球区/低于价值带/带内/高于价值；温和/公允/苛刻）。
- **视觉**：仅 `--tt-*` token（语义层，映射 `--ink-1/2/3`，均已 WCAG AA）；机构级编辑质感、克制的绿；复用既有基元（`PageHeader`/`DataTable`/`AggregateRankingList`/`ValuationBadge`）；**禁 shadcn Card**；顶层高亮用克制手段（细边框重音/眉标），**禁**大色块/装饰图标/emoji；真数据当主角。显示字体现为 Saira（`--font-display`），排序 UI 复用最近合入的 table 移动端排序基元（45908cf），别另造。触达区 ≥44px，窄屏不破版，dark/light 双扫。
- **降级**：所有 reader 表缺（42P01/PGRST205）/无 env → 空结果，绝不抛；`deriveFusionSignal` 缺 verdict/holderCount → 落末档、不崩、隐含档省略。
- 无常驻测试（solo dev）：验证 = `npx tsx <file>.check.ts` + `npx tsc --noEmit`（`web/` 下）+ 部署后真数据抽查。**禁 `next build`**（本机 google fonts 被墙）。DB reader / RSC 页面无法本地单测，其正确性靠 Task 1 的纯函数测试 + tsc + 部署抽查（与本仓 `readValuationScreen` 等既有 reader 同惯例）。

## File Structure

- 新建 `web/src/lib/managers/fusionSignal.ts` — 纯函数内核（桥接 13F+估值，放 managers/）。
- 新建 `web/src/lib/managers/fusionSignal.check.ts` — 纯函数断言。
- 改 `web/src/lib/valuation/valuationSnapshot.ts` — 扩 `ScreenView` 联合 + 新 `readConvictionScreen`。
- 改 `web/src/app/[lang]/stocks/screener/page.tsx` — conviction tab（VIEWS + parseView + 路由到新 reader）。
- 改 `web/src/app/[lang]/stocks/screener/ScreenerTable.tsx` — expectations 副标 + 顶层高亮。
- 改 `web/src/components/aggregate/AggregateRankingList.tsx` — `RankRow` 加可选估值槽 + 渲染。
- 改 `web/src/app/[lang]/investors/consensus/page.tsx` — 接 `readValuationVerdicts` + 传估值槽。
- 改 `web/src/components/valuation/ValuationBadge.tsx` — `full` 密度多吐 expectations 副标。
- 改 `web/src/app/[lang]/investors/[slug]/page.tsx` — posture 小节聚合一行。

---

### Task 1: `deriveFusionSignal` 纯函数内核（TDD）

**Files:**
- Create: `web/src/lib/managers/fusionSignal.ts`
- Test: `web/src/lib/managers/fusionSignal.check.ts`

**Interfaces:**
- Consumes: `SnapshotVerdict`（`@/lib/valuation/valuationSnapshot`，type-only import，字段 `inStrikeZone`/`bucket`/`reliable`/`expectations?`）；`ExpectationsTier`（`@/lib/valuation/types`）。
- Produces:
  ```ts
  export const CONSENSUS_MIN = 5; // "高共识"门槛:≥5 家管理人共同持有(97 管理人里已是明显信号)。落库后按真实分布校准。
  export type FusionSignal = {
    attractivenessRank: number;      // 越小越靠前(便宜档 0 权重置顶);同档内 holderCount 高者更靠前
    isCheapConsensus: boolean;       // holderCount≥CONSENSUS_MIN ∧ 已确认便宜 → 顶层高亮
    impliedTier?: ExpectationsTier;  // verdict.expectations 可评估时的隐含增速档
  };
  export function deriveFusionSignal(input: {
    holderCount: number;
    verdict: SnapshotVerdict | undefined;
  }): FusionSignal;
  ```

- [ ] **Step 1: 写失败测试**

`web/src/lib/managers/fusionSignal.check.ts`：
```ts
import { deriveFusionSignal, CONSENSUS_MIN } from "./fusionSignal";
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok:", m);
}
const v = (o: Partial<SnapshotVerdict>): SnapshotVerdict => ({
  ticker: "X", bucket: "within", inStrikeZone: false, rangeLo: 1, rangeHi: 2,
  price: 1.5, priceDate: "2026-01-01", marginPct: 0, coverage: "full",
  reliable: true, computedAt: "2026-01-01", ...o,
} as SnapshotVerdict);

// 1) 便宜档 rank < 带内 < 高于
{
  const cheap = deriveFusionSignal({ holderCount: 3, verdict: v({ inStrikeZone: true }) }).attractivenessRank;
  const within = deriveFusionSignal({ holderCount: 3, verdict: v({ bucket: "within" }) }).attractivenessRank;
  const above = deriveFusionSignal({ holderCount: 3, verdict: v({ bucket: "above" }) }).attractivenessRank;
  assert(cheap < within && within < above, "便宜 < 带内 < 高于");
}
// 2) 同档内 holderCount 高者靠前(rank 更小)
{
  const many = deriveFusionSignal({ holderCount: 20, verdict: v({ inStrikeZone: true }) }).attractivenessRank;
  const few = deriveFusionSignal({ holderCount: 4, verdict: v({ inStrikeZone: true }) }).attractivenessRank;
  assert(many < few, "同档 holderCount 高者 rank 更小(靠前)");
}
// 3) 未确认便宜(reliable=false)不算便宜档,降到带内权重
{
  const unconf = deriveFusionSignal({ holderCount: 10, verdict: v({ inStrikeZone: true, reliable: false }) });
  const within = deriveFusionSignal({ holderCount: 10, verdict: v({ bucket: "within" }) });
  assert(unconf.attractivenessRank === within.attractivenessRank, "未确认便宜=带内权重");
  assert(unconf.isCheapConsensus === false, "未确认便宜 → 非顶层");
}
// 4) isCheapConsensus 阈值
{
  assert(deriveFusionSignal({ holderCount: CONSENSUS_MIN, verdict: v({ inStrikeZone: true }) }).isCheapConsensus === true, "≥门槛 ∧ 便宜 → 顶层");
  assert(deriveFusionSignal({ holderCount: CONSENSUS_MIN - 1, verdict: v({ inStrikeZone: true }) }).isCheapConsensus === false, "低于门槛 → 非顶层");
  assert(deriveFusionSignal({ holderCount: 50, verdict: v({ bucket: "below" }) }).isCheapConsensus === true, "below 档也算便宜");
  assert(deriveFusionSignal({ holderCount: 50, verdict: v({ bucket: "above" }) }).isCheapConsensus === false, "高于价值 → 非顶层");
}
// 5) 隐含预期档透传
{
  const withTier = deriveFusionSignal({ holderCount: 3, verdict: v({ expectations: { assessable: true, tier: "demanding" } as any }) });
  assert(withTier.impliedTier === "demanding", "expectations 可评估 → 透传 tier");
  const noTier = deriveFusionSignal({ holderCount: 3, verdict: v({ expectations: { assessable: false } as any }) });
  assert(noTier.impliedTier === undefined, "expectations 不可评估 → 省略");
}
// 6) 缺 verdict 降级不崩,落末档
{
  const none = deriveFusionSignal({ holderCount: 0, verdict: undefined });
  assert(Number.isFinite(none.attractivenessRank) && none.isCheapConsensus === false && none.impliedTier === undefined, "缺 verdict → 落末档,不崩");
  const above = deriveFusionSignal({ holderCount: 0, verdict: v({ bucket: "above" }) });
  assert(none.attractivenessRank > above.attractivenessRank, "无估值排在高于价值之后");
}
console.log(process.exitCode ? "SOME TESTS FAILED" : "ALL PASS");
```

- [ ] **Step 2: 运行测试确认失败**

Run（`web/` 下）：`npx tsx src/lib/managers/fusionSignal.check.ts`
Expected: 失败（模块未实现）。

- [ ] **Step 3: 写实现**

`web/src/lib/managers/fusionSignal.ts`：
```ts
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import type { ExpectationsTier } from "@/lib/valuation/types";

export const CONSENSUS_MIN = 5;

export type FusionSignal = {
  attractivenessRank: number;
  isCheapConsensus: boolean;
  impliedTier?: ExpectationsTier;
};

// 位置档权重:便宜(已确认) 0 → 带内/未确认便宜 1 → 高于价值 2 → 无估值 3。
const W_CHEAP = 0, W_WITHIN = 1, W_ABOVE = 2, W_UNVALUED = 3;
const RANK_SCALE = 1_000_000; // 权重主序,holderCount 次序(同档高者靠前)

function isConfirmedCheap(v: SnapshotVerdict): boolean {
  return (v.inStrikeZone || v.bucket === "below") && v.reliable !== false;
}
function bucketWeight(v: SnapshotVerdict | undefined): number {
  if (!v) return W_UNVALUED;
  if (isConfirmedCheap(v)) return W_CHEAP;
  if (v.bucket === "above") return W_ABOVE;
  return W_WITHIN; // 带内,或未确认便宜(reliable=false)
}

export function deriveFusionSignal(input: {
  holderCount: number;
  verdict: SnapshotVerdict | undefined;
}): FusionSignal {
  const { holderCount, verdict } = input;
  const weight = bucketWeight(verdict);
  const attractivenessRank = weight * RANK_SCALE - Math.max(0, holderCount);
  const isCheapConsensus = weight === W_CHEAP && holderCount >= CONSENSUS_MIN;
  const impliedTier = verdict?.expectations?.assessable ? verdict.expectations.tier : undefined;
  return { attractivenessRank, isCheapConsensus, ...(impliedTier ? { impliedTier } : {}) };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run（`web/` 下）：`npx tsx src/lib/managers/fusionSignal.check.ts`
Expected: `ALL PASS`（exitCode 0）。

- [ ] **Step 5: 类型门**

Run（`web/` 下）：`npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/managers/fusionSignal.ts web/src/lib/managers/fusionSignal.check.ts
git commit -m "feat(fusion): 13F共识×估值吸引力排序纯函数内核(deriveFusionSignal)"
```

---

### Task 2: ① screener `conviction` 视图（新 reader + tab + 行渲染）

**Files:**
- Modify: `web/src/lib/valuation/valuationSnapshot.ts`（扩 `ScreenView` + 新 `readConvictionScreen`）
- Modify: `web/src/app/[lang]/stocks/screener/page.tsx`（VIEWS + parseView + 路由）
- Modify: `web/src/app/[lang]/stocks/screener/ScreenerTable.tsx`（expectations 副标 + 顶层高亮）

**Interfaces:**
- Consumes: `deriveFusionSignal`（Task 1）；既有 `ScreenerRow`、`isImplausibleBand`、`readValuationVerdicts`。
- Produces: `readConvictionScreen(limit): Promise<{ rows: ScreenerRow[]; heldTotal: number; computedAt: string | null }>`；`ScreenView` 增 `"conviction"`。

- [ ] **Step 1: 扩 `ScreenView` + 写 `readConvictionScreen`**

在 `web/src/lib/valuation/valuationSnapshot.ts`：
把 `export type ScreenView = "strike_zone" | "below" | "all";` 改为：
```ts
export type ScreenView = "strike_zone" | "below" | "all" | "conviction";
```
在 `readValuationScreen` 之后新增（复用既有 `isMissingTable`/`withRetry`/`getDb`/`hasSupabaseEnv`/`isImplausibleBand`；**倒序查**：先 consensus_holdings 取高共识票，再 join snapshot）：
```ts
import { deriveFusionSignal, CONSENSUS_MIN } from "@/lib/managers/fusionSignal";

/**
 * conviction 视图:机构重仓宇宙(holder_count≥CONSENSUS_MIN)按估值吸引力排序(便宜置顶)。
 * 与 readValuationScreen 相反:先 consensus_holdings 筛高共识,再 join valuation_snapshot。
 * 便宜∩高共识票靠 deriveFusionSignal 自然浮顶(标注全集+排序,永不空页)。降级:表缺/无 env → 空,绝不抛。
 */
export const readConvictionScreen = cache(
  async (limit: number): Promise<{ rows: ScreenerRow[]; heldTotal: number; computedAt: string | null }> => {
    const empty = { rows: [] as ScreenerRow[], heldTotal: 0, computedAt: null as string | null };
    if (!hasSupabaseEnv()) return empty;
    const isMissingTable = (e: unknown) => {
      const code = (e as { code?: string }).code;
      return code === "42P01" || code === "PGRST205";
    };
    try {
      // ① 高共识票(holder_count≥门槛),按持有人数降序取前 limit
      const { data: hData, error: hErr } = await withRetry(() =>
        getDb()
          .from("consensus_holdings")
          .select("ticker,issuer,holder_count")
          .gte("holder_count", CONSENSUS_MIN)
          .order("holder_count", { ascending: false })
          .limit(limit),
      );
      if (hErr) {
        if (!isMissingTable(hErr)) console.error(`readConvictionScreen holders 失败: ${(hErr as Error).message}`);
        return empty;
      }
      const held = (hData ?? []) as { ticker: string; issuer: string | null; holder_count: number | null }[];
      if (held.length === 0) return empty;
      const heldTotal = held.length;
      const tickers = held.map((h) => h.ticker.toUpperCase());
      const holderOf = new Map(tickers.map((tk, i) => [tk, held[i].holder_count ?? 0] as const));
      const issuerOf = new Map(tickers.map((tk, i) => [tk, held[i].issuer ?? ""] as const));

      // ② join valuation_snapshot
      const { data: sData, error: sErr } = await withRetry(() =>
        getDb()
          .from("valuation_snapshot")
          .select("ticker,verdict_bucket,in_strike_zone,range_lo,range_hi,price,price_date,margin_pct,coverage,reliable,computed_at,payload")
          .in("ticker", tickers),
      );
      if (sErr) {
        if (!isMissingTable(sErr)) console.error(`readConvictionScreen snapshot 失败: ${(sErr as Error).message}`);
        return { ...empty, heldTotal };
      }
      const snapOf = new Map<string, Row>();
      for (const r of (sData ?? []) as Row[]) snapOf.set(r.ticker.toUpperCase(), r);

      const rows: ScreenerRow[] = tickers
        .map((tk): ScreenerRow => {
          const r = snapOf.get(tk);
          const hc = holderOf.get(tk) ?? 0;
          return {
            ticker: tk,
            issuer: issuerOf.get(tk) || tk,
            bucket: (r?.verdict_bucket as VerdictBucket) ?? "above",
            inStrikeZone: r?.in_strike_zone ?? false,
            rangeLo: r ? Number(r.range_lo) : 0,
            rangeHi: r ? Number(r.range_hi) : 0,
            price: r ? Number(r.price) : 0,
            priceDate: r?.price_date ?? "",
            marginPct: r?.margin_pct == null ? null : Number(r.margin_pct),
            coverage: (r?.coverage as VerdictCoverage) ?? "none",
            reliable: r?.reliable ?? true,
            computedAt: r?.computed_at ?? "",
            holderCount: hc,
            expectations: r?.payload?.expectations,
          };
        })
        // 坏数据行(价值带与现价严重脱节)不进面
        .filter((r) => !(r.price > 0 && isImplausibleBand(r)))
        // 按估值吸引力排序:便宜∩高共识置顶
        .sort(
          (a, b) =>
            deriveFusionSignal({ holderCount: a.holderCount, verdict: a }).attractivenessRank -
            deriveFusionSignal({ holderCount: b.holderCount, verdict: b }).attractivenessRank,
        );
      const computedAt = rows.reduce<string | null>((mx, r) => (mx == null || r.computedAt > mx ? r.computedAt : mx), null);
      return { rows, heldTotal, computedAt };
    } catch (err) {
      console.error(`readConvictionScreen 异常: ${err instanceof Error ? err.message : String(err)}`);
      return empty;
    }
  },
);
```
**注**：`ScreenerRow` 需含可选 `expectations?: ExpectationsAssessment` 字段（供行渲染 impliedTier）。在 `ScreenerRow` type 末尾补一行 `expectations?: ExpectationsAssessment;`（`ExpectationsAssessment` 已在本文件从 `./types` import；若无则加 type-only import）。同时确认本文件顶部 `Row` type 的 `payload` 已含 `expectations?`（valuationSnapshot 现有 `Row.payload?: { expectations?; moatCap? }`，直接复用）。

- [ ] **Step 2: screener 页加 conviction tab + 路由**

在 `web/src/app/[lang]/stocks/screener/page.tsx`：
① import 加 `readConvictionScreen`：
```ts
import { readValuationScreen, readConvictionScreen, type ScreenView } from "@/lib/valuation/valuationSnapshot";
```
② `parseView` 支持 conviction：
```ts
function parseView(v: string | undefined): ScreenView {
  return v === "strike_zone" || v === "below" || v === "conviction" ? v : "all";
}
```
③ `VIEWS` 数组加一项（放最前，作为主打融合视图）：
```ts
const VIEWS: { key: ScreenView; zh: string; en: string }[] = [
  { key: "conviction", zh: "机构重仓 · 按估值", en: "Most-held · by value" },
  { key: "strike_zone", zh: "击球区", en: "Strike zone" },
  { key: "below", zh: "有安全边际", en: "Below value" },
  { key: "all", zh: "全部可估值", en: "All valued" },
];
```
④ 数据分支（在现有 `readValuationScreen` 调用处替换为按视图选 reader）：
```ts
const isConviction = view === "conviction";
const screen = isConviction
  ? await readConvictionScreen(SCREEN_LIMIT)
  : await readValuationScreen(view, SCREEN_LIMIT);
const rows = screen.rows;
const computedAt = screen.computedAt;
const strikeTotal = isConviction ? 0 : (screen as { strikeTotal: number }).strikeTotal;
const heldTotal = isConviction ? (screen as { heldTotal: number }).heldTotal : 0;
const sortedRows = isConviction ? rows : sortScreenerRows(rows, sort);
```
⑤ conviction 视图的顶部句（`geo` 之外，仅该视图）与 intro 调整——在 `geo` 定义后加：
```ts
const convictionIntro = isZh
  ? `${heldTotal} 只被 ${CONSENSUS_MIN}+ 位机构共同持有的股票，按现价相对保守价值带的位置排序：便宜的在前。落在击球区且机构共识高的置顶。位置观察，非买卖建议。`
  : `${heldTotal} stocks held by ${CONSENSUS_MIN}+ managers, ordered by where price sits against a conservative value band — cheapest first. Those in the strike zone with high consensus rise to the top. Observational, not advice.`;
```
（`CONSENSUS_MIN` 从 `@/lib/managers/fusionSignal` import。）把 `PageHeader` 的 `intro` 改为 `isConviction ? convictionIntro : (原有 intro)`；`eyebrow` conviction 时用 `isZh ? "13F × 估值 · 机构重仓" : "13F × valuation · most held"`。排序控件（margin/holders）在 conviction 视图隐藏（该视图自带吸引力排序）：把那段 sort `<Link>` 包在 `{!isConviction && (…)}` 内。

- [ ] **Step 3: ScreenerTable 顶层高亮（conviction 视图）**

在 `web/src/app/[lang]/stocks/screener/ScreenerTable.tsx`，给 `ScreenerTable` 加可选 `highlightCheapConsensus` 开关，conviction 视图传 true；顶层行（`isCheapConsensus`）加克制的左边框重音（无色块/图标）。改签名与 security 列：
```ts
import { deriveFusionSignal } from "@/lib/managers/fusionSignal";
// ...
export function ScreenerTable({ lang, rows, highlight = false }: { lang: Lang; rows: ScreenerRow[]; highlight?: boolean }) {
```
在 security 列 cell 里，highlight 且顶层时加左重音（`DataTable` 的 cell 支持返回任意节点；用一个带左边框的内联包裹）：
```ts
cell: (r) => {
  const top = highlight && deriveFusionSignal({ holderCount: r.holderCount, verdict: r }).isCheapConsensus;
  return (
    <span className={top ? "block border-l-2 border-[var(--tt-positive)] pl-2 -ml-2" : undefined}>
      <EntityName issuer={r.issuer} ticker={r.ticker} />
    </span>
  );
},
```
screener 页渲染处：`<ScreenerTable lang={lang} rows={sortedRows} highlight={isConviction} />`。

- [ ] **Step 4: 类型门**

Run（`web/` 下）：`npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/valuation/valuationSnapshot.ts "web/src/app/[lang]/stocks/screener/page.tsx" "web/src/app/[lang]/stocks/screener/ScreenerTable.tsx"
git commit -m "feat(screener): conviction视图(机构重仓×估值吸引力排序,便宜∩高共识置顶)"
```

---

### Task 3: ② 共识报告页接估值（排行每行挂 badge）

**Files:**
- Modify: `web/src/components/aggregate/AggregateRankingList.tsx`（`RankRow` 加可选估值槽 + 渲染）
- Modify: `web/src/app/[lang]/investors/consensus/page.tsx`（接 `readValuationVerdicts`）

**Interfaces:**
- Consumes: 既有 `readValuationVerdicts(tickers): Promise<Map<string, SnapshotVerdict>>`、`ValuationBadge`、`mostHeld`。
- Produces: `RankRow.valuation?: SnapshotVerdict`（渲染时 badge）。

- [ ] **Step 1: `RankRow` 加估值槽 + 渲染 badge**

在 `web/src/components/aggregate/AggregateRankingList.tsx`：
① import：
```ts
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import { ValuationBadge } from "@/components/valuation/ValuationBadge";
```
② `RankRow` type 末尾加：
```ts
  valuation?: SnapshotVerdict;   // 共识页:该票当前估值位置(可缺 → 不渲染)
```
③ 在行内 meta 那行（`pctOfAggregate`/`kindLabel` 所在的 `<div className="mt-1 flex flex-wrap …">`）末尾追加：
```tsx
{r.valuation && <ValuationBadge verdict={r.valuation} lang={lang} />}
```
（full 密度默认，显全档；含 Task 4 后自带 expectations 副标。）

- [ ] **Step 2: 共识页接 `readValuationVerdicts` 并挂到 rankRows**

在 `web/src/app/[lang]/investors/consensus/page.tsx`：
① import：
```ts
import { readValuationVerdicts } from "@/lib/valuation/valuationSnapshot";
```
② 在现有 `const [rows, deltas, idx] = await Promise.all([mostHeld(50), holderDeltas(), getManagerIndex()]);` 之后加：
```ts
const verdicts = await readValuationVerdicts(rows.map((r) => r.ticker));
```
③ 在构造 `rankRows` 的 `rows.map(...)` 里，给每行补 `valuation`：
```ts
    valuation: verdicts.get(r.ticker.toUpperCase()),
```
（放进现有 `rankRows` 对象字面量末尾。）

- [ ] **Step 3: 类型门**

Run（`web/` 下）：`npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/aggregate/AggregateRankingList.tsx "web/src/app/[lang]/investors/consensus/page.tsx"
git commit -m "feat(consensus): 最多人持有排行每行挂估值位置(最多人持有的票现在贵不贵)"
```

---

### Task 4: ③ ValuationBadge 多吐 expectations + 投资人页 posture 聚合行

**Files:**
- Modify: `web/src/components/valuation/ValuationBadge.tsx`（`full` 密度 expectations 副标）
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`（posture 小节聚合一行）

**Interfaces:**
- Consumes: 既有 `SnapshotVerdict.expectations`（`ExpectationsAssessment`，字段 `assessable`/`tier`）；投资人页已加载的 `verdicts: Map<string, SnapshotVerdict>`。

- [ ] **Step 1: ValuationBadge full 密度多吐 expectations 副标**

在 `web/src/components/valuation/ValuationBadge.tsx`：
① `COPY` 的 zh/en 各加 expectations 档文案：
```ts
// zh COPY 内:
expect: { modest: "隐含温和", fair: "隐含公允", demanding: "隐含苛刻" } as Record<"modest"|"fair"|"demanding", string>,
// en COPY 内:
expect: { modest: "implies modest", fair: "implies fair", demanding: "implies demanding" } as Record<"modest"|"fair"|"demanding", string>,
```
② 现在组件 `return <span …>{label}{marker}</span>;` 是单 badge。改为：当 `density === "full"` 且 `verdict.expectations?.assessable && verdict.expectations.tier` 时，badge 下方叠一行弱化副标；否则保持原单 span。替换末尾 return：
```tsx
  const badge = (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-0.5 font-mono text-[11px] ${cls}`}
    >
      {label}
      {marker}
    </span>
  );
  const exTier = verdict.expectations?.assessable ? verdict.expectations.tier : undefined;
  if (density === "full" && exTier) {
    return (
      <span className="inline-flex flex-col gap-0.5">
        {badge}
        <span className="font-mono text-[10px] text-[var(--tt-faint)]">{t.expect[exTier]}</span>
      </span>
    );
  }
  return badge;
```
（合规:隐含档永远显示在位置 badge 之下、与位置并置,不单独出现;无买卖措辞。sparse 密度不受影响,持仓表保持干净。）

- [ ] **Step 2: 投资人页 posture 小节加聚合一行**

在 `web/src/app/[lang]/investors/[slug]/page.tsx`，posture 小节内（`<p>` 概述之后、`<ul>` cheap 列表之前），用已加载的 `verdicts` 算隐含苛刻/温和计数并显示一行。在 posture `<section>` 内插入：
```tsx
{(() => {
  const held = holdingTickers.map((tk) => verdicts.get(tk.toUpperCase())).filter(Boolean) as SnapshotVerdict[];
  const demanding = held.filter((x) => x.expectations?.assessable && x.expectations.tier === "demanding").length;
  const modest = held.filter((x) => x.expectations?.assessable && x.expectations.tier === "modest").length;
  if (demanding === 0 && modest === 0) return null;
  return (
    <p className="mb-3 text-[13px] text-[var(--tt-faint)]">
      {lang === "zh"
        ? `按现价隐含预期：${demanding} 只市场要求苛刻的增速，${modest} 只温和。`
        : `By what price implies: ${demanding} demand a demanding growth rate, ${modest} modest.`}
    </p>
  );
})()}
```
（`holdingTickers` 与 `verdicts` 均为该页已存在变量，见 page.tsx:305 附近；`SnapshotVerdict` 已 import。零新增 IO。）

- [ ] **Step 3: 类型门**

Run（`web/` 下）：`npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/valuation/ValuationBadge.tsx "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(valuation): full密度badge多吐隐含预期+投资人页posture隐含增速聚合行"
```

---

## 验收（部署后）

1. Task 1 `.check.ts` PASS；每 Task `npx tsc --noEmit` 零错。
2. **真数据抽查**：
   - `/stocks/screener?view=conviction`：**非空**；便宜∩高共识（holder_count≥5 且已确认便宜）置顶且有左重音；往下依次带内、高于价值；每行位置 badge 下有隐含预期副标；排序控件在该视图隐藏。
   - `/investors/consensus`：最多人持有榜每行挂估值 badge；"多人持有**但**高于价值"的票如实显示高于价值（不只亮便宜档）。
   - 某投资人页（如 Buffett）：posture 小节出现"按现价隐含预期：N 只苛刻、M 只温和"一行，计数与实际 verdicts 对得上；**持仓表每行未**被 expectations 塞乱（sparse 密度不变）。
3. **合规**：三面均无买卖/目标价措辞；隐含档永远在位置之下并置，不单独出现。
4. **视觉/响应式**：conviction 顶层高亮是克制左重音（无色块/图标/emoji）；窄屏不破版、44px 触达；dark/light 各扫一眼；每 locale 纯本语言。
5. **降级**：consensus_holdings/valuation_snapshot 缺表或无 env → conviction 视图优雅空态、共识页 badge 静默省略、无报错。

## Self-Review

- **Spec 覆盖**：§二核心决策(标注全集+排序)→Task 2 `readConvictionScreen` 排序 + 不做硬筛选；§四.1 共享内核→Task 1；§四.2 ①screener→Task 2；§四.3 ②共识页→Task 3；§四.4 ③badge+posture→Task 4；§五 UX(克制高亮/token/Saira/复用排序基元)→Task 2 Step 3 + Global Constraints；§六合规→Task 4 Step 1 注 + Global Constraints；§七测试→各 Task + 验收段。无遗漏。
- **占位扫描**：无 TBD/TODO；纯函数与接线均给完整代码与真实符号（`deriveFusionSignal`/`readConvictionScreen`/`readValuationVerdicts`/`ValuationBadge`/`RankRow`/`ScreenerRow`）。
- **类型一致**：`FusionSignal`/`deriveFusionSignal`（Task 1）→ Task 2 排序消费同签名；`ScreenView` 增 `"conviction"`（Task 2 定义）→ page.tsx parseView/VIEWS 同名；`RankRow.valuation`（Task 3 定义）→ 共识页赋值 + AggregateRankingList 渲染同名；`SnapshotVerdict.expectations.tier`（既有）→ Task 4 badge/posture 同字段。
- **顺序/风险**：Task 1（纯内核）→ Task 2/3/4（三面接线，彼此独立，可任意序）。Task 3/4 有先后弱耦合：Task 3 的 badge 在 Task 4 落地后自带 expectations 副标——但 Task 3 先合也不破（badge 只是暂无副标），无硬依赖。每提交点独立编译、不改任何估值数值/判定。
