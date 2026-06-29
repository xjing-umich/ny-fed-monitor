# 引导线 块②：investor 牵引（共识列 + StrikeZonePicks 下一步）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让投资人页（`/[lang]/investors/[slug]`）不再对"人群"瞎——持仓表加一列「共识/持有人数」（这只票被几位超投持有），并把已有的 `StrikeZonePicks` 从"展示"升级成显式的"下一步 → 看这只票"的接力棒。

**Architecture:** 新增一个按 ticker 批量查 `consensus_holdings.holder_count` 的读取器（`readHolderCounts`，纯映射部分可单测）→ 投资人页在已有 `readValuationVerdicts(holdingTickers)` 旁并行取 holderCounts，传入 `HoldingsTable` 新增一列 → `StrikeZonePicks` 加一句过渡 CTA + chip 行尾 `→`。全 RSC、零 hydration、零外部新数据（只读现成 `consensus_holdings`）。

**Tech Stack:** Next.js 16 App Router（RSC，无 "use client"）、TypeScript、Supabase（`consensus_holdings`，经既有 `getDb`/`hasSupabaseEnv`）、Tailwind（仅 `--tt-*`）、tsx（`.check.ts`）。

## Global Constraints

- 令牌只用 `--tt-*`，**禁 shadcn 别名**（`text-foreground`/`bg-card`/`border-border`）；明暗双模等价。
- 字体：数字 + 标签 Geist Mono（`font-mono` + `tabular-nums`）；标题 Fraunces（`font-display`）。
- **绿色克制**：新列数字**不上 accent 绿**（用 `--tt-text`/`--tt-muted`/`--tt-faint`）；不整列绿。
- 合规（[[valuation-philosophy-constraint]]）：共识列 = 客观计数；CTA 是**导航牵引**非买卖指令；**禁 BUY/SELL/HOLD/目标价/评级**；StrikeZonePicks 既有 as-of/位置话术不动。
- 文案禁中英混排（[[no-mixed-language-copy]]）：每 locale 纯单语。
- 全 RSC 零 hydration，列与 CTA 进服务端 HTML。
- **取数纪律**：holder_count 按持仓 ticker **批量 `.in()` 单查**（与 `readValuationVerdicts` 同范式），**不得用 `readConsensusHeld(limit)`**（它只返回 Top-N，投资人持仓常落在外、会丢值）；无 env/表缺 → 空 Map、不崩。
- 验证（[[no-tests-solo-dev]]）：纯函数 = `npx tsx <file>.check.ts`；门 = `cd web && npx tsc --noEmit`（**非 `next build`**，本机 google fonts 被墙）；外加 curl SSR + 人工 QA（明暗双模 + 390/768/1280）。

---

## File Structure

- **Modify** `web/src/lib/managers/consensusRead.ts` — 加纯映射 `mapHolderCountRows` + 读取器 `readHolderCounts(tickers)`。
- **Create** `web/src/lib/managers/consensusRead.check.ts` — tsx 断言纯映射（含空/重复/大小写归一）。
- **Modify** `web/src/app/[lang]/investors/[slug]/page.tsx` — `HOLD_COPY` 加列标签；`HoldingsTable` 加 `holderCounts` prop + 一列；页面取 holderCounts 并传入。
- **Modify** `web/src/components/investor/StrikeZonePicks.tsx` — 加过渡 CTA 句 + chip 行尾 `→`。

---

## Task 1: `readHolderCounts` 读取器 + 纯映射 check

**Files:**
- Modify: `web/src/lib/managers/consensusRead.ts`
- Test: `web/src/lib/managers/consensusRead.check.ts`

**Interfaces:**
- Consumes: 既有 `hasSupabaseEnv`/`getDb`（`@/lib/managers/db`）。
- Produces:
  - `mapHolderCountRows(rows: { ticker: string; holder_count: number }[]): Map<string, number>` —— 纯映射，key = ticker 大写，value = holder_count。Task 1 测试。
  - `readHolderCounts(tickers: string[]): Promise<Map<string, number>>` —— 批量 `.in('ticker', …)` 查 `consensus_holdings`；空入参/无 env/出错 → 空 Map。Task 2 调用。

- [ ] **Step 1: 写失败的 check（纯映射）**

Create `web/src/lib/managers/consensusRead.check.ts`:

```ts
import { strict as assert } from "node:assert";
import { mapHolderCountRows } from "./consensusRead";

// 1) 基本映射 + 大写归一
const m = mapHolderCountRows([
  { ticker: "AAPL", holder_count: 12 },
  { ticker: "msft", holder_count: 7 },
]);
assert.equal(m.get("AAPL"), 12, "AAPL count");
assert.equal(m.get("MSFT"), 7, "lowercase ticker → uppercase key");
assert.equal(m.get("aapl"), undefined, "keys are uppercase only");

// 2) 空输入 → 空 Map
assert.equal(mapHolderCountRows([]).size, 0, "empty rows → empty map");

// 3) 重复 ticker → 后者覆盖(或同值幂等), 不抛
const dup = mapHolderCountRows([
  { ticker: "AAPL", holder_count: 12 },
  { ticker: "AAPL", holder_count: 12 },
]);
assert.equal(dup.get("AAPL"), 12, "dup ticker tolerated");

console.log("consensusRead.check.ts: all assertions passed");
```

- [ ] **Step 2: 跑 check 确认失败**

Run: `cd web && npx tsx src/lib/managers/consensusRead.check.ts`
Expected: 失败（`mapHolderCountRows` 未导出）。

- [ ] **Step 3: 实现（在 `consensusRead.ts` 加映射 + 读取器）**

在 `consensusRead.ts` 内（紧随既有 `readConsensusHeld` 之后）加：

```ts
type HolderCountDbRow = { ticker: string; holder_count: number };

/** 纯映射(单测): consensus_holdings 行 → ticker(大写)→holder_count Map。 */
export function mapHolderCountRows(rows: HolderCountDbRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.ticker.toUpperCase(), Number(r.holder_count));
  return out;
}

/**
 * 按持仓 ticker 批量取"该票被几位超投持有"(consensus_holdings.holder_count)。
 * 与 readValuationVerdicts 同范式: 单次 .in() 查、零 per-ticker 扇出。
 * 空入参 / 无 env / 出错 → 空 Map(优雅降级, 不阻断渲染)。
 * 注意: 绝不用 readConsensusHeld(limit)(只返回 Top-N, 投资人持仓常落在外)。
 */
export const readHolderCounts = cache(async (tickers: string[]): Promise<Map<string, number>> => {
  if (!hasSupabaseEnv() || tickers.length === 0) return new Map();
  const upper = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const { data, error } = await getDb()
    .from("consensus_holdings").select("ticker,holder_count").in("ticker", upper);
  if (error) { console.error(`readHolderCounts 失败: ${error.message}`); return new Map(); }
  return mapHolderCountRows((data ?? []) as HolderCountDbRow[]);
});
```

> `cache`/`hasSupabaseEnv`/`getDb` 已在文件顶部 import，无需新增 import。若 `consensus_holdings.ticker` 实际存为小写，`.in("ticker", upper)` 仍可能错配——QA Step（Task 2）会用真 ticker 核对计数；若发现大小写不符，改为查原样 `tickers` 并保留 map 端 `.toUpperCase()` 归一。

- [ ] **Step 4: 跑 check 确认通过**

Run: `cd web && npx tsx src/lib/managers/consensusRead.check.ts`
Expected: `consensusRead.check.ts: all assertions passed`

- [ ] **Step 5: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 6: 提交**

```bash
cd web && git add src/lib/managers/consensusRead.ts src/lib/managers/consensusRead.check.ts
git commit -m "feat(investor): readHolderCounts 按 ticker 批量取共识持有数 + 纯映射 check"
```

---

## Task 2: 持仓表加「共识/持有人数」列 + 页面接线

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`

**Interfaces:**
- Consumes: `readHolderCounts`（Task 1）。
- HoldingsTable 新增必填 prop `holderCounts: Map<string, number>`（必填 → 强制页面同 task 传入，保证 task 边界 tsc 干净）。

- [ ] **Step 1: 加 import**

在 page.tsx 顶部已有 `import { readValuationVerdicts, type SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";` 等；加：

```tsx
import { readHolderCounts } from "@/lib/managers/consensusRead";
```

> 注：若文件已从 `@/lib/managers/consensusRead` import 其它符号，则并入该行，不要重复 import 语句。

- [ ] **Step 2: COPY 加列标签（中英各一处）**

把 `HOLD_COPY` 两个 `cols` 各加一个 `consensus` 字段：

zh（行 `cols: { issuer: "标的", value: "市值", valuation: "估值", shares: "持股数", weight: "权重(上季→本季)" }`）改为：

```ts
    cols: { issuer: "标的", value: "市值", valuation: "估值", consensus: "持有人数", shares: "持股数", weight: "权重(上季→本季)" },
```

en（行 `cols: { issuer: "Security", value: "Value", valuation: "Valuation", shares: "Shares", weight: "Weight (prev→now)" }`）改为：

```ts
    cols: { issuer: "Security", value: "Value", valuation: "Valuation", consensus: "Holders", shares: "Shares", weight: "Weight (prev→now)" },
```

> 语义：该列 = 这只票被**几位**被追踪的超投持有（共识广度），让用户一眼分清这位的持仓里哪些是共识、哪些是孤注。

- [ ] **Step 3: HoldingsTable 加 `holderCounts` prop**

把 `HoldingsTable` 的参数解构与类型从：

```tsx
function HoldingsTable({
  holdings,
  prior,
  changes,
  lang,
  cusipToTicker,
  verdicts,
}: {
  holdings: Holding[];
  prior?: FilingData;
  changes: HoldingChange[];
  lang: Lang;
  cusipToTicker: Map<string, string>;
  verdicts: Map<string, SnapshotVerdict>;
}): React.ReactElement {
```

改为（加 `holderCounts`）：

```tsx
function HoldingsTable({
  holdings,
  prior,
  changes,
  lang,
  cusipToTicker,
  verdicts,
  holderCounts,
}: {
  holdings: Holding[];
  prior?: FilingData;
  changes: HoldingChange[];
  lang: Lang;
  cusipToTicker: Map<string, string>;
  verdicts: Map<string, SnapshotVerdict>;
  holderCounts: Map<string, number>;
}): React.ReactElement {
```

- [ ] **Step 4: 加列定义（插在 `valuation` 列之后、`shares` 列之前）**

在 `columns` 数组里，`valuation` 列对象之后插入：

```tsx
    {
      key: "consensus",
      header: t.cols.consensus,
      align: "right",
      width: "w-24",
      cell: (h) => {
        const tk = cusipToTicker.get(h.cusip);
        const c = tk ? holderCounts.get(tk.toUpperCase()) : undefined;
        return c != null
          ? <span className="font-mono tabular-nums text-[var(--tt-muted)]">{c}</span>
          : <span className="text-[var(--tt-faint)]">—</span>;
      },
    },
```

> 数字走 `--tt-muted`（**不绿**，遵绿色克制）；缺 ticker / 不在 map → `—`。`role` 默认 `metric` → 移动端堆叠卡里作"持有人数: N"块，无需 `hideOnMobile`（这是块②的核心信号，移动端也要在）。

- [ ] **Step 5: 页面取 holderCounts（在 verdicts 取数旁）**

页面里现有：

```tsx
  const holdingTickers = latest.holdings
    .map((h) => cusipToTicker.get(h.cusip))
    .filter((t): t is string => Boolean(t));
  const verdicts = await readValuationVerdicts(holdingTickers);
```

在其后加一行（并行取数；两者都廉价、顺序亦可）：

```tsx
  const holderCounts = await readHolderCounts(holdingTickers);
```

- [ ] **Step 6: 把 holderCounts 传给 HoldingsTable**

把调用：

```tsx
          <HoldingsTable holdings={latest.holdings} prior={prior} changes={changes} lang={lang} cusipToTicker={cusipToTicker} verdicts={verdicts} />
```

改为：

```tsx
          <HoldingsTable holdings={latest.holdings} prior={prior} changes={changes} lang={lang} cusipToTicker={cusipToTicker} verdicts={verdicts} holderCounts={holderCounts} />
```

- [ ] **Step 7: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 8: SSR + 数据核验**

```bash
cd web && npm ci && npm run dev &
# 待启动:
curl -s http://localhost:3000/en/investors/warren-buffett | grep -iE "Holders</|tabular-nums"
```

Expected: 持仓表头含新「Holders」列；某真持仓的计数能对得上 `/stocks/<ticker>` 页"N 位超投持有"（抽 1-2 只交叉核对，验证 `.in()` 大小写匹配正确）。若本机无 env → 列显 `—`、页面不崩（降级正确），数据核对放部署预览。

- [ ] **Step 9: 人工 QA（明暗双模 + 三宽）**

`/en/investors/...` 与 `/zh/investors/...`：新列在桌面表 + 移动卡都在；数字 `--tt-muted` 非绿；`—` 退化正确；纯单语；暗色等价；390/768/1280 不塌（列变多，确认 `breakpoint="lg"` 下 1024 以下转卡片、不挤）。

- [ ] **Step 10: 提交**

```bash
cd web && git add src/app/\[lang\]/investors/\[slug\]/page.tsx
git commit -m "feat(investor): 持仓表加共识(持有人数)列, 一眼分清共识 vs 孤注"
```

---

## Task 3: StrikeZonePicks 升级为显式"下一步"牵引

**Files:**
- Modify: `web/src/components/investor/StrikeZonePicks.tsx`

**Interfaces:**
- 纯展示改动；无新 prop、无新取数。三态逻辑（无可估值→null / 零命中→空句 / ≥1→句+chips）、合规 footnote 不变。

- [ ] **Step 1: COPY 加一句过渡 CTA**

在 `COPY` 的 `zh` 与 `en` 各加一个 `cta` 字段：

zh 块内加：

```ts
    cta: "点开任一只看个股估值 →",
```

en 块内加：

```ts
    cta: "Open any to see the stock's valuation →",
```

> 这是**导航牵引**（去看个股页），非买卖建议——守合规。

- [ ] **Step 2: 命中时渲染 CTA（chips 之上）**

把命中分支：

```tsx
      {hits.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
```

改为先插一行 CTA：

```tsx
      {hits.length > 0 && (
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)]">
          {t.cta}
        </p>
      )}
      {hits.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
```

> CTA 用绿 mono（accent 限于这种小牵引文案，符合绿色克制：链接/小点缀可绿，整块不绿）。

- [ ] **Step 3: chip 行尾加 `→`（强化"去看这只票"）**

在每个 chip `<Link>` 内，把现有的 margin 段之后、`</Link>` 之前加一个箭头 span。即把：

```tsx
              {v.marginPct != null && v.marginPct > 0 && (
                <span className="font-mono text-[var(--tt-positive)]">−{Math.round(v.marginPct * 100)}%</span>
              )}
            </Link>
```

改为：

```tsx
              {v.marginPct != null && v.marginPct > 0 && (
                <span className="font-mono text-[var(--tt-positive)]">−{Math.round(v.marginPct * 100)}%</span>
              )}
              <span aria-hidden className="text-[var(--tt-faint)] transition-colors group-hover:text-[var(--tt-accent)]">→</span>
            </Link>
```

> `→` 用 faint（克制），chip 本身已是绿描边 hover 态；不引入新色。

- [ ] **Step 4: tsc 门**

Run: `cd web && npx tsc --noEmit`
Expected: exit 0。

- [ ] **Step 5: SSR + 人工 QA**

```bash
curl -s http://localhost:3000/en/investors/warren-buffett | grep -iE "see the stock|→"
```

Expected（取一只有 strike-zone 命中的投资人）：CTA 句 + chip 行尾 `→` 在 SSR HTML。人工：命中时 CTA + 箭头在场、零命中时仍只显诚实空句（CTA 不出）、无可估值持仓时整块不渲染（三态未破）；明暗双模 + 移动不塌；纯单语。

- [ ] **Step 6: 提交**

```bash
cd web && git add src/components/investor/StrikeZonePicks.tsx
git commit -m "feat(investor): StrikeZonePicks 升级为显式'下一步→看个股估值'牵引"
```

---

## Self-Review

**1. Spec coverage（对 spec §2 块②）：**
- 持仓表加「另有 N 持有」列（接 `holder_count`，批量 `.in()` 非 Top-N）→ Task 1 + Task 2 ✓（列语义=共识广度，标签"持有人数/Holders"；honesty：显示总持有数而非"另有 N"，避免 ±1 歧义——记于此）
- 列遵 `role:"metric"` + 数字 mono + 绿色克制 → Task 2 Step 4 ✓
- 缺 ticker / 无 env 降级 → Task 1 空 Map + Task 2 `—` ✓
- StrikeZonePicks 升级为显式"下一步"（过渡句 + `→`），不改三态/合规话术 → Task 3 ✓
- 取数纪律（单查、不用 readConsensusHeld）→ Task 1 实现 + 注释 ✓
- 设计语言/合规/单语 → Global Constraints + 各 Step ✓

**2. Placeholder scan：** 无 TBD/TODO；每步含真码或真命令 + 期望。✓

**3. Type consistency：** `readHolderCounts(tickers: string[]): Promise<Map<string, number>>` 定义（Task 1）与调用（Task 2 Step 5）一致；`holderCounts: Map<string, number>` prop 定义（Task 2 Step 3）与列 cell 取用（Step 4 `holderCounts.get(tk.toUpperCase())`）、页面传入（Step 6）一致；map key 全程大写（reader 端 `.toUpperCase()` + cell 端 `.toUpperCase()`）。✓

**4. 偏差登记：** spec 写「另有 N 持有」，实现取**总持有数**（标签"持有人数/Holders"）以避免"是否含本投资人"的 ±1 歧义——更诚实、可与个股页"N 位超投持有"直接交叉核对（Task 2 Step 8 正用此核对）。

---

## Execution Handoff

执行在独立 thread/worktree：从 `db-foundation`（含块③已上线）切 `feat/guided-line-investor-handoff`，逐 task 走 subagent-driven 或 executing-plans，每 task 末提交，完成后走 [[finishing-a-development-branch]] 开 PR 到 db-foundation。本块是引导线倒序第二块（②）；①landing 三步叙事另起 plan。
