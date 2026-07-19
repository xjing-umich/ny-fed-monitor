# Stocks 列表页注入估值一瞥 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/stocks` 主列表只高亮落在击球区/低于价值带的少数共识股（绿标 + 安全边际 %），高于价值/无判定不显。

**Architecture:** 新增有界读取器 `readBargainVerdicts()`（一条 `or(in_strike_zone, below)` 查询，≤~110 行）→ `stocks/page.tsx` 内存 O(1) join 到最多 5000 行共识 → `StocksTable` 在名称格渲染绿标、尾部渲染绿 %。零迁移零 ingest，`valuation_snapshot` 已有 988 行真数据，合并即生效。

**Tech Stack:** Next.js 16（Turbopack 魔改版，改代码前读 `web/AGENTS.md` / `node_modules/next/dist/docs/`）、React 19 RSC、TypeScript、Tailwind v4 `--tt-*` 令牌、Supabase(PostgREST)。

## Global Constraints

- 回复/计划/文档正文一律**中文**；代码/className/命令/既定术语/路径除外（[[reply-and-plan-in-chinese]]）。
- **无测试套件**（[[no-tests-solo-dev]]）：验证门 = `cd web && npx tsc --noEmit` 返回 0 + preview 真渲染。绝不声称"测试通过"。
- 排版 **Option B**：区块/卡标题/UI 一律 Geist Sans（无 class），Fraunces 只给页面 H1/品牌，数字/眉标/徽章 `font-mono`；**任何非 H1 处出现 `font-display` = regression**。
- 令牌只用 `--tt-*`（`--tt-accent`/`--tt-positive`/`--tt-text`/`--tt-muted`/`--tt-faint`/`--tt-border`…）；**禁 shadcn 别名**（`bg-card`/`text-muted-foreground`…，暗色漂移）。圆角用 `rounded-sm`/`rounded-md`，禁 `rounded-full`/`rounded-lg` 于非圆点。
- 文案守 `web/docs/copy-voice.md`：具体、数据先行、无 AI/营销腔；**每 locale 纯单语**（禁中英混排），例外仅品牌锁形 + 既定术语（如「击球区」/`13F`/`SEC 13F`）。en 与 zh 各按本语感判。
- 前景闸（唯一真相源，勿改）：`reliable && (inStrikeZone || bucket==="below") && marginPct>0`，且过 `isImplausibleBand`。与 `stocks/[ticker]/page.tsx` 的 `marginShown`、screener strike/below 视图同源。
- **零部署**：不新增/改表，不写迁移，不跑 `valuation:ingest`。异常/表未迁移（`42P01`/`PGRST205`）→ 空 Map 优雅降级，绝不抛。
- 分支 `feat/stocks-list-valuation-glance`（已建，spec 已提交 `1e78948`）。commit message 末尾附 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- gh CLI 非 collaborator，不能开 PR；完成后给用户 web compare URL（base = db-foundation）。

---

## File Structure

- `web/src/lib/valuation/valuationSnapshot.ts` — 追加 `BargainVerdict` type + `readBargainVerdicts()` cache 读取器（紧邻现有 `readValuationVerdicts`/`readStrikeZoneLeaders`，复用同文件已 import 的 `cache`/`getDb`/`hasSupabaseEnv`/`withRetry`/`isImplausibleBand`）。
- `web/src/app/[lang]/stocks/StocksTable.tsx` — `StockRow` 加 `bargain` 字段；文件内局部 `BargainMark` 组件；Security 列 cell 与尾部清单渲染绿标。
- `web/src/app/[lang]/stocks/page.tsx` — `Promise.all` 追加读取器、join、intro 文案追加一句。

---

## Task 1: 读取器 `readBargainVerdicts()`

**Files:**
- Modify: `web/src/lib/valuation/valuationSnapshot.ts`（在 `readValuationVerdicts` 之后、`StrikeLeader` 之前追加）

**Interfaces:**
- Consumes: 同文件已 import 的 `cache`、`getDb`、`hasSupabaseEnv`、`withRetry`、`isImplausibleBand`（无需新增 import；若缺再补）。
- Produces: `export type BargainVerdict = { inStrikeZone: boolean; marginPct: number }`；`export const readBargainVerdicts: () => Promise<Map<string, BargainVerdict>>`（key = 大写 ticker）。

- [ ] **Step 1: 追加 type 与读取器**

在 `web/src/lib/valuation/valuationSnapshot.ts` 中 `readValuationVerdicts` 定义块之后追加：

```ts
export type BargainVerdict = { inStrikeZone: boolean; marginPct: number };

/**
 * 读"便宜"票(击球区 或 低于价值带, reliable)的按-ticker map, 供 /stocks 列表高亮稀有便宜。
 * 行数有界(击球区 24 + 低于价值 91, 去重后 ≤~110), 无 IN 巨列表 → 无 URL 超长风险。
 * 前景闸: reliable(SQL) + (inStrikeZone||below)(SQL) + marginPct>0(JS) + !isImplausibleBand(JS),
 * 与 readValuationVerdicts / stocks/[ticker] marginShown 同源。
 * 任何异常/表未迁移(42P01/PGRST205)→ 空 Map 优雅降级(列表零标记, 不抛)。
 */
export const readBargainVerdicts = cache(
  async (): Promise<Map<string, BargainVerdict>> => {
    const out = new Map<string, BargainVerdict>();
    if (!hasSupabaseEnv()) return out;
    const isMissingTable = (e: unknown) => {
      const code = (e as { code?: string }).code;
      return code === "42P01" || code === "PGRST205";
    };
    try {
      const { data, error } = await withRetry(() =>
        getDb()
          .from("valuation_snapshot")
          .select("ticker,range_lo,range_hi,price,margin_pct,in_strike_zone,verdict_bucket")
          .eq("reliable", true)
          .or("in_strike_zone.eq.true,verdict_bucket.eq.below")
          .limit(500),
      );
      if (error) {
        if (!isMissingTable(error))
          console.error(`readBargainVerdicts 失败: ${(error as Error).message}`);
        return out;
      }
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const marginPct = r.margin_pct == null ? null : Number(r.margin_pct);
        if (marginPct == null || marginPct <= 0) continue;
        if (
          isImplausibleBand({
            rangeLo: Number(r.range_lo),
            rangeHi: Number(r.range_hi),
            price: Number(r.price),
            marginPct,
          })
        )
          continue;
        out.set(String(r.ticker).toUpperCase(), {
          inStrikeZone: Boolean(r.in_strike_zone),
          marginPct,
        });
      }
      return out;
    } catch (err) {
      console.error(`readBargainVerdicts 异常: ${err instanceof Error ? err.message : String(err)}`);
      return out;
    }
  },
);
```

- [ ] **Step 2: 确认 import 齐备**

在文件顶部确认已 import `cache`（`react`）、`getDb`/`hasSupabaseEnv`/`withRetry`（本仓 supabase helper）、`isImplausibleBand`（估值口径 util）。这些被现有 `readValuationVerdicts`/`readStrikeZoneLeaders` 使用，通常已在。若 tsc 报缺，按现有读取器同源补齐。

Run: `cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx tsc --noEmit`
Expected: 退出码 0（`.next/types/validator.ts` 里 research 路由的 `TS2307` 是 dev server 占用 `.next` 的环境产物，与本改动无关，忽略）。

- [ ] **Step 3: 探针验证查询形状与行数（不 import 读取器——server-only 会崩，见 [[tsx-ingest-server-only-stub]]；改用独立 PostgREST 探针复刻查询）**

写临时探针到 `web/_probe_bargain.mjs`：

```js
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim()];}));
const U = env.SUPABASE_URL, K = env.SUPABASE_SERVICE_KEY;
const r = await fetch(`${U}/rest/v1/valuation_snapshot?select=ticker,in_strike_zone,verdict_bucket,margin_pct,reliable&reliable=eq.true&or=(in_strike_zone.eq.true,verdict_bucket.eq.below)&limit=500`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
const d = await r.json();
console.log("rows:", d.length);
console.log("all reliable:", d.every(x=>x.reliable));
console.log("all strike-or-below:", d.every(x=>x.in_strike_zone===true || x.verdict_bucket==="below"));
console.log("positive margin:", d.filter(x=>x.margin_pct>0).length, "/", d.length);
console.log("sample:", d.slice(0,5).map(x=>`${x.ticker} strike=${x.in_strike_zone} ${x.verdict_bucket} ${x.margin_pct}`));
```

Run: `cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && node ./_probe_bargain.mjs && rm -f ./_probe_bargain.mjs`
Expected: `rows:` 在 ~80–150 之间（有界，远低于 500 硬顶）；`all reliable: true`；`all strike-or-below: true`；每行有 ticker/bucket/margin。若行数逼近 500，停下核对（可能口径异常）。

- [ ] **Step 4: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/valuation/valuationSnapshot.ts
git commit -m "$(printf 'feat(valuation): readBargainVerdicts 读取器 — 有界读击球区/低于价值票\n\n供 /stocks 列表高亮稀有便宜。一条 or(in_strike_zone,below) 查询, reliable+\n正边际+isImplausibleBand 三重前景闸, ≤~110 行无 IN 巨列表。空 Map 优雅降级。\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: 页面 join + `StocksTable` 渲染绿标

**Files:**
- Modify: `web/src/app/[lang]/stocks/StocksTable.tsx`（`StockRow` type + `BargainMark` + Security cell + 尾部）
- Modify: `web/src/app/[lang]/stocks/page.tsx`（`Promise.all` + join + intro 文案）

**Interfaces:**
- Consumes: `readBargainVerdicts`（Task 1，`() => Promise<Map<string, BargainVerdict>>`）、`BargainVerdict`、既有 `fmtMarginPct`（`@/lib/format`）、`EntityName`、`DataTable`、`stockPath`、`cleanIssuer`、`Lang`。
- Produces: 无下游依赖（终点任务）。

- [ ] **Step 1: `StocksTable.tsx` — `StockRow` 加字段 + import `fmtMarginPct`**

改 `StockRow` type（在现有字段后加一行）：

```ts
export type StockRow = {
  ticker: string;
  issuer: string;
  holderCount: number;
  totalValue: number;
  /** 持有人数条宽(px),服务端按榜首归一化预算 */
  barWidth: number;
  /** 落在击球区/低于价值带(reliable)才非空 —— 稀有便宜高亮;服务端按前景闸预算 */
  bargain: { inStrikeZone: boolean; marginPct: number } | null;
};
```

顶部 import 追加 `fmtMarginPct`（与现有 `formatUSD, cleanIssuer` 同源自 `@/lib/format`）：

```ts
import { formatUSD, cleanIssuer, fmtMarginPct } from "@/lib/format";
```

- [ ] **Step 2: `StocksTable.tsx` — 加 `BargainMark` 局部组件**

在 `StocksTable` 函数**之前**（文件内、`TOP_N` 常量之后）加：

```tsx
// 稀有便宜绿标:击球区显 chip「击球区/Strike zone」+ 安全边际%;低于价值带(非严格击球区)只显绿%。
// 颜色不单独承义 —— 整体 aria-label 念全, chip/数字 aria-hidden。
function BargainMark({ bargain, lang }: { bargain: { inStrikeZone: boolean; marginPct: number }; lang: Lang }) {
  const isZh = lang === "zh";
  const pct = fmtMarginPct(bargain.marginPct);
  const label = bargain.inStrikeZone
    ? isZh ? `击球区，安全边际 ${pct}` : `In strike zone, margin of safety ${pct}`
    : isZh ? `低于价值带，安全边际 ${pct}` : `Below value band, margin of safety ${pct}`;
  return (
    <span className="inline-flex items-baseline gap-1.5" aria-label={label}>
      {bargain.inStrikeZone && (
        <span
          aria-hidden
          className="rounded-sm border border-[var(--tt-accent)] px-1 py-px font-mono text-[9px] uppercase leading-none tracking-[0.08em] text-[var(--tt-accent)]"
        >
          {isZh ? "击球区" : "Strike zone"}
        </span>
      )}
      <span aria-hidden className="font-mono text-[11px] tabular-nums text-[var(--tt-positive)]">
        {pct}
      </span>
    </span>
  );
}
```

- [ ] **Step 3: `StocksTable.tsx` — Security 列 cell 渲染绿标**

把 `security` 列的 `cell` 从：

```tsx
      cell: (r) => <EntityName issuer={r.issuer} ticker={r.ticker} />,
```

改为：

```tsx
      cell: (r) => (
        <span className="inline-flex items-baseline gap-2">
          <EntityName issuer={r.issuer} ticker={r.ticker} />
          {r.bargain ? <BargainMark bargain={r.bargain} lang={lang} /> : null}
        </span>
      ),
```

- [ ] **Step 4: `StocksTable.tsx` — 尾部折叠清单命中行补绿 %**

在尾部 `<Link>`（`{r.ticker}` 的 span 之后、`</Link>` 之前）加一行条件绿 %：

```tsx
                <Link
                  href={stockPath(lang, r.ticker)}
                  className="min-w-0 truncate text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)]"
                >
                  {cleanIssuer(r.issuer)}
                  <span className="ml-1.5 font-mono text-[11px] text-[var(--tt-faint)]">{r.ticker}</span>
                  {r.bargain ? (
                    <span className="ml-1.5 font-mono text-[11px] tabular-nums text-[var(--tt-positive)]">
                      {fmtMarginPct(r.bargain.marginPct)}
                    </span>
                  ) : null}
                </Link>
```

- [ ] **Step 5: `page.tsx` — import 读取器**

`web/src/app/[lang]/stocks/page.tsx` 顶部 import 区加：

```ts
import { readBargainVerdicts } from "@/lib/valuation/valuationSnapshot";
```

- [ ] **Step 6: `page.tsx` — `Promise.all` 追加 + join**

把：

```ts
  const [rows, cusipMap, idx] = await Promise.all([
    consensusHeld(),
    getCusipMap(),
    getManagerIndex(),
  ]);
```

改为：

```ts
  const [rows, cusipMap, idx, bargains] = await Promise.all([
    consensusHeld(),
    getCusipMap(),
    getManagerIndex(),
    readBargainVerdicts(),
  ]);
```

把 `tableRows` 塑形块内 `return { ... }` 改为附上 `bargain`（`ticker` 已在上文算出）：

```ts
    return {
      ticker,
      issuer: row.issuer,
      holderCount: row.holderCount,
      totalValue: row.totalValue,
      barWidth: Math.round((row.holderCount / maxHolders) * 32),
      bargain: bargains.get(ticker.toUpperCase()) ?? null,
    };
```

- [ ] **Step 7: `page.tsx` — intro 文案各加一句**

把 `PageHeader` 的 `intro` 从：

```tsx
          intro={isZh
            ? "按持有机构数排列，数据来源：SEC 13F 持仓披露。"
            : "Ranked by number of superinvestors holding the security. Source: SEC 13F filings."}
```

改为：

```tsx
          intro={isZh
            ? "按持有机构数排列，数据来源：SEC 13F 持仓披露。少数落在击球区（现价低于保守价值带）的以绿色标出。"
            : "Ranked by number of superinvestors holding the security. Source: SEC 13F filings. The few in the strike zone — price below our conservative value band — are marked in green."}
```

- [ ] **Step 8: tsc 门**

Run: `cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web && npx tsc --noEmit`
Expected: 退出码 0（同 Task 1 Step 2 的 research 路由 `TS2307` 环境噪声忽略）。

- [ ] **Step 9: preview 真渲染验收（四态 + 移动 + 降级）**

启动 dev server（`preview_start` name=`web-dev`，port 3000；勿用 Bash 跑 dev）。逐项在浏览器核（`read_page`/`javascript_tool` 读计算样式，别只靠截图——程序化 scroll 后截图可能全黑，见 [[frontend-optimization-thread]]）：

1. `/en/stocks`：多数行无标记；至少 1 行击球区显绿 chip「Strike zone」+ `+X%`；无 `font-display`（区块/标记全 Sans/mono）。
2. `/zh/stocks`：同上，chip 显「击球区」，纯中文无混排。
3. 高于价值行（如 AAPL）无任何绿标。
4. 尾部展开「Show more/展开其余」：命中行 ticker 后有绿 `+X%`。
5. 明暗双模：`javascript_tool` 读绿标计算色 = `--tt-accent`(rgb 79,191,138)/`--tt-positive`；暗色无漂移。
6. 移动 375px（`resize_window`）：名称格绿标不撑破行、root `scrollWidth===clientWidth===375` 无横向溢出。
7. a11y：`read_page` 确认绿标节点有 `aria-label`（"击球区，安全边际 …"/"In strike zone, …"）。
8. 截图存证（桌面暗 + 移动）。

若发现问题：改源码 → 重验步骤 1–8。

- [ ] **Step 10: Commit**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/app/\[lang\]/stocks/StocksTable.tsx web/src/app/\[lang\]/stocks/page.tsx
git commit -m "$(printf 'feat(stocks): 主列表高亮稀有便宜 — 击球区/低于价值带绿标\n\n名称格显绿 chip「击球区」+安全边际%%(reliable+便宜档), 高于价值/无判定不显;\n尾部命中行补绿%%; intro 加一句说明。页面 Promise.all 追加 readBargainVerdicts\n内存 join, 零迁移零 ingest。\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## 收尾（全部任务后）

- [ ] push 分支：`git push -u origin feat/stocks-list-valuation-glance`
- [ ] 给用户 web compare URL：`https://github.com/xjing-umich/ny-fed-monitor/compare/db-foundation...feat/stocks-list-valuation-glance?expand=1` + 中文标题/正文。
- [ ] 更新记忆 [[frontend-optimization-thread]]：站㈠「Stocks 列表页注入估值」→ 已建+推送待合；记录 Approach A / readBargainVerdicts / 零部署。

## Self-Review 结论（写者自查）

- **Spec 覆盖**：前景闸(Task1 SQL+JS / Task2 依赖)✓、名称格绿标(Task2 S3)✓、chip+margin(S2)✓、尾部绿%(S4)✓、intro 文案(S7)✓、零部署读取器(Task1)✓、降级(Task1 空 Map)✓、a11y aria-label(S2)✓、明暗/移动(S9)✓。无遗漏。
- **占位符**：无 TBD/TODO；每步含真代码或真命令。
- **类型一致**：`bargain: {inStrikeZone,marginPct}|null` 在 StockRow(Task2 S1)、BargainMark props(S2)、page join(S6)、reader `BargainVerdict`(Task1) 四处签名一致；`fmtMarginPct`/`readBargainVerdicts` 名称跨任务一致。
