# Landing 高级化重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页从「业余堆叠」重做成机构级编辑刊物 × 一件活数据主视觉（A+B 混合），同时清掉入口重复并修两处性能问题。

**Architecture:** 首页 `page.tsx` 保持 RSC + 日级 ISR，5 个数据读并行；重排为 Hero → 三步编号索引 → 方法与信任带 → 哲学引语 → Learn → 单 CTA 收尾。删掉全站淡入 wrapper，动效收敛到 Hero ledger 一处 stagger + 微交互。数据层新增「共识计数 + Top-6」廉价读，取代 5000 行过取。

**Tech Stack:** Next.js 16（App Router / Turbopack / RSC）、React 19、TypeScript、Tailwind v4 + `--tt-*` 令牌、Supabase（只读快照）、Fraunces + mono、lucide-react。

## Global Constraints

- **验证门（本项目无测试套件）**：每个任务以 `cd web && npx tsc --noEmit` = 0 + 定向 grep 断言 为门；视觉验收统一在末尾 Vercel preview 双语（zh/en）真机完成。本地 `next dev` 被 google fonts 屏蔽，不作运行时验证。
- **令牌唯一真相**：颜色只用 `--tt-*`/语义 token；除本计划新增的 `--tt-ease`/`--tt-dur` 外，不引入裸 hex。
- **字体系统**：Fraunces（`font-display`）作标题、mono（`font-mono`）作数字与眉标；眉标→标题→正文三级尺度明确拉开；数字一律 `tabular-nums`。
- **绿色克制**：深钱绿 `var(--tt-accent)` 只作单一 accent，不铺面。
- **禁 SaaS 模板相**：禁 shadcn Card / 描边盒堆叠；主用 hairline + 裸表格 + 编辑目录。禁渐变炫彩、禁影院式炫技。
- **动效稀疏有意图**：只有 Hero ledger stagger + CTA/数字微交互两处；统一 `--tt-ease`；严格守 `prefers-reduced-motion`。
- **RSC 边界**：默认 server component，`"use client"` 只包动效/交互子件；重做后 home 树 `"use client"` 从 9 处降到 1 处。
- **i18n**：双语 `COPY`（zh/en 纯本语言，禁中英混排，品牌锁形/既定术语除外）；所有站内链接经 `localePath`/`investorPath`/`stockPath`。
- **入口纪律**：同一目的地正文内**不超过 2 次**、**禁相同多链药丸块**、每次落在不同语境。落点：Hero→`/stocks/screener`；StepIndex 步①→`/investors`（roster CTA）、步②→`/investors/consensus`、步③→`/stocks`（most-held hub）；ClosingCTA→`/investors`（get-started，与步① roster 语境不同）。即 `/investors` 2 次（均干净），其余各 1 次；旧 4×`/investors`、双药丸三连消灭。
- **数据新鲜度**：dateline 标注来源 + 季度 + 日期（守 CLAUDE.md）。
- **爆炸半径**：不碰 TopNav/SubNav/Footer、令牌色板（仅加 ease token）、SEO metadata（`altFor` 保持）、其他页面、数据管道/schema。
- **提交**：每任务末尾 commit；commit message 中文，尾行 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。

## 文件结构

- `src/lib/managers/consensusRead.ts` — 新增 `readConsensusCount()`、`readConsensusHeldTop(n)`（廉价读）
- `src/lib/aggregations.ts` — 新增 `consensusCount()`、`consensusHeldTop(n)`（含 scan 兜底）
- `src/app/globals.css` — 新增 `--tt-ease` / `--tt-dur` 令牌
- `src/components/home/RevealStagger.tsx` — 新建（client，Hero ledger 逐行 stagger）
- `src/components/home/HeroMasthead.tsx` — 重写
- `src/components/home/StepIndex.tsx` — 新建（编号编辑目录 01/02/03）
- `src/components/home/TrustLockup.tsx` — 新建（来源/合规锁基元）
- `src/components/home/FoundationsGrid.tsx` — 重写（→ 方法与信任带）
- `src/components/home/ClosingCTA.tsx` — 重写（单 CTA）
- `src/components/home/SectionReveal.tsx` — 删除
- `src/components/home/FeatureRow.tsx` — 删除
- `src/components/home/TrackedInvestorsWall.tsx` — 删除（内容并入 StepIndex 步①）
- `src/app/[lang]/page.tsx` — 重排编排 + 接新数据读
- `src/components/home/{StrikeLeadersCard,ValueBandCard,PhilosophyQuote,LearnTeaser}.tsx` — 复用/微调

---

### Task 1: 数据层 — 共识计数 + Top-6 廉价读

**Files:**
- Modify: `src/lib/managers/consensusRead.ts`（在 `readConsensusHeld` 附近新增两函数）
- Modify: `src/lib/aggregations.ts`（`consensusHeld` 附近新增 `consensusCount` / `consensusHeldTop`）

**Interfaces:**
- Produces:
  - `readConsensusCount(): Promise<number | null>` — count-only（`head:true`），`holder_count >= CONSENSUS_MIN_HOLDERS`；无 env → `null`
  - `readConsensusHeldTop(n: number): Promise<HeldRow[] | null>` — `holder_count >= CONSENSUS_MIN_HOLDERS` 排序取前 n；无 env → `null`
  - `consensusCount(): Promise<number>` — 库优先，兜底 scan 计数
  - `consensusHeldTop(n: number): Promise<HeldRow[]>` — 库优先，兜底 scan 取前 n
- Consumes: 现有 `getSupabase`（同文件内用法）、`mapHolderCountRows`/`HeldRow`、`CONSENSUS_MIN_HOLDERS`（`aggregations.ts` 导出）、`mostHeld`（兜底复用）

- [ ] **Step 1: 先确认 `consensusHeld` 现有调用方，避免误删语义**

Run: `cd web && grep -rn "consensusHeld\b" src/ | grep -v "consensusHeldTop"`
Expected: 仅 `page.tsx` 与 `aggregations.ts` 定义处引用（若他处也用，本任务只**新增**不改旧函数，旧函数保留）。记录结果到实现报告。

- [ ] **Step 2: 在 `consensusRead.ts` 新增两个廉价读**

在 `readConsensusHeld` 定义之后新增（`CONSENSUS_MIN_HOLDERS` 从 `@/lib/aggregations` import，或直接用常量 2 并注释指向单一真相；优先 import 保持单一真相）：

```ts
import { CONSENSUS_MIN_HOLDERS } from "@/lib/aggregations";

/** 共识票计数(holder_count>=CONSENSUS_MIN_HOLDERS)。count-only,零行传输。无 env→null。 */
export const readConsensusCount = cache(async (): Promise<number | null> => {
  const sb = getSupabase();
  if (!sb) return null;
  const { count, error } = await sb
    .from("consensus_holdings")
    .select("ticker", { count: "exact", head: true })
    .gte("holder_count", CONSENSUS_MIN_HOLDERS);
  if (error) { console.error(`readConsensusCount 失败: ${error.message}`); return null; }
  return count ?? 0;
});

/** 共识票 Top-n(holder_count>=阈值,已排序)。取代 mostHeld(5000) 过取。无 env→null。 */
export const readConsensusHeldTop = cache(async (n: number): Promise<HeldRow[] | null> => {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("consensus_holdings").select("ticker,issuer,holder_count,total_value")
    .gte("holder_count", CONSENSUS_MIN_HOLDERS)
    .order("holder_count", { ascending: false }).order("total_value", { ascending: false })
    .limit(n);
  if (error) { console.error(`readConsensusHeldTop 失败: ${error.message}`); return null; }
  return mapHolderCountRows
    ? data?.map((r) => ({ cusip: r.ticker, issuer: r.issuer, holderCount: r.holder_count, totalValue: Number(r.total_value) })) ?? null
    : null;
});
```

> 注：`getSupabase` 的确切获取方式照抄 `readConsensusHeld` 内的写法（同文件），勿臆造。行映射照 `readConsensusHeld` 现有 `.map(...)` 形状（见文件 line 12 附近）。

- [ ] **Step 3: 在 `aggregations.ts` 新增库优先 + scan 兜底的包装**

在 `consensusHeld` 之后新增：

```ts
/** 共识票计数:库优先,无库回退扫描计数。 */
export async function consensusCount(): Promise<number> {
  const { readConsensusCount } = await import("@/lib/managers/consensusRead");
  const fromDb = await readConsensusCount();
  if (fromDb !== null) return fromDb;
  return (await consensusHeld()).length; // 回退:无库时全量派生
}

/** 共识票 Top-n:库优先,无库回退扫描取前 n。 */
export async function consensusHeldTop(n: number): Promise<HeldRow[]> {
  const { readConsensusHeldTop } = await import("@/lib/managers/consensusRead");
  const fromDb = await readConsensusHeldTop(n);
  if (fromDb && fromDb.length) return fromDb;
  return (await consensusHeld()).slice(0, n); // 回退
}
```

- [ ] **Step 4: 类型门**

Run: `cd web && npx tsc --noEmit`
Expected: 退出码 0，无报错。

- [ ] **Step 5: 断言查询形状**

Run: `cd web && grep -n "count: \"exact\", head: true\|\.gte(\"holder_count\"\|\.limit(n)" src/lib/managers/consensusRead.ts`
Expected: 命中 count-only 与 `.gte` 与 `.limit(n)`（证明是廉价读，非 5000 全取）。

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/managers/consensusRead.ts web/src/lib/aggregations.ts
git commit -m "perf(home): 共识读拆分为 count-only + Top-6,取代 5000 行过取

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: 动效地基 — ease 令牌 + RevealStagger

**Files:**
- Modify: `src/app/globals.css`（`:root` 与 `.dark` 两处 token 块附近，加全局 ease/时长）
- Create: `src/components/home/RevealStagger.tsx`

**Interfaces:**
- Produces:
  - CSS 变量 `--tt-ease: cubic-bezier(0.2, 0.6, 0.2, 1);` 与 `--tt-dur: 0.5s;`（全局可用）
  - `RevealStagger({ children, stepMs? }): React.ReactElement` — client；对**直接子元素**逐个 `stepMs`（默认 60）递进入场（opacity 0→1 + translateY(6px)→0），一次性，`IntersectionObserver` 触发；`prefers-reduced-motion` 时不动、直接可见。

- [ ] **Step 1: 加全局 ease/时长令牌**

在 `globals.css` 的 `:root {...}` 内（`--radius` 附近）加一行；`.dark` 无需重复（曲线/时长不随主题变）。若希望集中，也可放在 `:root` 后独立 `:root { --tt-ease: ...; --tt-dur: ...; }`。写：

```css
  /* Motion — 全站统一过渡曲线/时长(动效稀疏化的单一真相) */
  --tt-ease: cubic-bezier(0.2, 0.6, 0.2, 1);
  --tt-dur: 0.5s;
```

- [ ] **Step 2: 建 RevealStagger（client，一次性，守 reduced-motion）**

```tsx
"use client";
import { useEffect, useRef } from "react";

export default function RevealStagger({
  children,
  stepMs = 60,
}: {
  children: React.ReactNode;
  stepMs?: number;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const kids = Array.from(el.children) as HTMLElement[];
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    kids.forEach((k) => {
      k.style.opacity = "0";
      k.style.transform = "translateY(6px)";
      k.style.transition = "opacity var(--tt-dur) var(--tt-ease), transform var(--tt-dur) var(--tt-ease)";
    });
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        kids.forEach((k, i) => {
          window.setTimeout(() => {
            k.style.opacity = "1";
            k.style.transform = "translateY(0)";
          }, i * stepMs);
        });
        io.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stepMs]);
  return <div ref={ref}>{children}</div>;
}
```

- [ ] **Step 3: 类型门**

Run: `cd web && npx tsc --noEmit`
Expected: 退出码 0。

- [ ] **Step 4: 断言令牌存在**

Run: `cd web && grep -n "\-\-tt-ease\|\-\-tt-dur" src/app/globals.css`
Expected: 命中两个令牌定义。

- [ ] **Step 5: Commit**

```bash
git add web/src/app/globals.css web/src/components/home/RevealStagger.tsx
git commit -m "feat(home): 加全局动效令牌 --tt-ease/--tt-dur + RevealStagger 一次性 stagger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: HeroMasthead 重写 — 巨型编辑主张 + 活数据 ledger + 单 CTA

**Files:**
- Rewrite: `src/components/home/HeroMasthead.tsx`

**Interfaces:**
- Consumes: `stockPath`/`localePath`（`@/lib/urls`）、`RevealStagger`（Task 2）、`EntityName`、`MoveTag`、`FreshnessDot`、`filingFreshness`/`quarterLabel`、`formatUSD`、`NotableMoves`/`MoveRow` 类型（保持现有 import）
- Produces: `HeroMasthead({ lang, period, moves }): React.ReactElement`（props 签名不变，便于 page.tsx 无缝替换）

**craft 参数（务必落实）：**
- 主张标题：`font-display font-medium leading-[1.05] tracking-tight text-[var(--tt-text)]`，尺度 `text-4xl sm:text-6xl md:text-7xl`（比旧 3xl/5xl 明显放大）；第二句用 `text-[var(--tt-faint)]` 弱化，制造层次。
- 眉标 dateline：`font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-accent)]` + `FreshnessDot`，文案含**季度 + 来源 + 45 天延迟**（沿用 `c.asOf`）。
- **单一主 CTA**（删旧三连药丸 `links` 数组）：文案「看个股估值 → / See per-stock valuation →」，`href={localePath(lang, "/stocks/screener")}`；样式 `font-display text-[15px] [border-bottom:1px_solid_var(--tt-accent)] hover:text-[var(--tt-accent)]` + `→` 位移微交互，过渡用 `transition-colors`（曲线继承全局，或显式 `[transition:color_var(--tt-dur)_var(--tt-ease)]`）。
- 右侧 ledger：不再是描边表格盒堆叠——外层仅一层克制容器（`rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)]` 可保留但内部用 hairline 分组），把「最多人增持 / 减持」两组行**包进 `<RevealStagger>`**（逐行打印感）；行内 `MoveTag` + `EntityName` + 右对齐 mono `tabular-nums`；增持绿 `var(--tt-positive)`、减持 oxblood `var(--tt-negative)` 克制点缀。
- 双语 `COPY` 保留 zh/en，纯本语言。

- [ ] **Step 1: 重写组件**

按上方 craft 参数重写 `HeroMasthead.tsx`：删除 `links` 三连数组与 `<nav>` 多链接，改为单 CTA；`PanelRows` 的两次调用外层套 `<RevealStagger>`（每组一个，或整体一个含两组）；标题尺度换成 `text-4xl sm:text-6xl md:text-7xl`。保留 `moves` 为空时不渲染 ledger 的 guard。

- [ ] **Step 2: 类型门**

Run: `cd web && npx tsc --noEmit`
Expected: 退出码 0。

- [ ] **Step 3: 断言无三连药丸、单 CTA、有大字号**

Run: `cd web && grep -n "screener\|text-7xl\|RevealStagger" src/components/home/HeroMasthead.tsx && grep -c "localePath(lang, \"/investors\")\|localePath(lang, \"/stocks\")" src/components/home/HeroMasthead.tsx`
Expected：第一段命中 screener CTA、`text-7xl`、`RevealStagger`；第二段计数为 `0`（Hero 内不再直接链 /investors 或裸 /stocks，只留 screener）。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/home/HeroMasthead.tsx
git commit -m "feat(home): Hero 重写—巨型编辑主张+活数据 ledger stagger+单 CTA,删三连药丸

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: StepIndex 新建 — 编号编辑目录（吸收投资者墙）

**Files:**
- Create: `src/components/home/StepIndex.tsx`

**Interfaces:**
- Consumes: `investorPath`/`stockPath`/`localePath`、`EntityName`、`formatUSD`、`StrikeLeadersCard`、`ValueBandCard`、`HeldRow`（`@/lib/aggregations` 类型）、manager 列表类型（照 page.tsx 现用 `topManagers`/`topInvestors` 的元素形状）、strike 结果类型（`readStrikeZoneLeaders` 返回）
- Produces:
  - `StepIndex({ lang, investors, held, strike }): React.ReactElement`
    - `investors`: 传入 `topManagers.slice(0, 12)`（含 `slug`/`person`/`totalValue`/`cik`）
    - `held`: `consensusHeldTop(6)` 的结果（`HeldRow[]`）
    - `strike`: `{ leaders: ...; total: number }`（`readStrikeZoneLeaders` 返回）

**craft 参数：**
- 三步各一行编辑目录项，不对称栏：`grid grid-cols-1 md:grid-cols-[0.38fr_0.62fr] gap-6 md:gap-10`；左列大号 mono 序号 `01/02/03`（`font-mono text-4xl text-[var(--tt-faint)]`）+ 眉标 + serif 标题（`font-display text-3xl sm:text-4xl`）+ 一句正文 + **单个 CTA**；右列真数据。
- 步①「超级投资者」：右列 = 投资者名网格/裸表（吸收原 TrackedInvestorsWall，**不带自己的 CTA**——CTA 由左列统一出），左列 CTA → `localePath(lang, "/investors")`（roster 语境）。
- 步②「跨基金共识」：右列 = `held` 的裸表（`EntityName` + `holderCount`），CTA → `localePath(lang, "/investors/consensus")`。
- 步③「估值」：右列 = `strike.leaders.length > 0 ? <StrikeLeadersCard .../> : <ValueBandCard .../>`，CTA → `localePath(lang, "/stocks")`。
- 步与步之间 hairline 分隔（`border-t border-[var(--tt-border)] pt-10 first:border-0 first:pt-0`），近满幅容器由 page.tsx 提供（见 Task 7）。
- 双语 `COPY`：三步的 eyebrow/title/body/cta 文案沿用现 FeatureRow 里已审校的中英文（copy 迁移，不新造），纯本语言。

- [ ] **Step 1: 写 StepIndex**

实现三步编辑目录；每步左列结构统一抽一个内部 `StepRow` 子函数（序号/眉标/标题/正文/CTA），右列作为 `children` 或 `slot` 传入，保证三步视觉一致、DRY。投资者网格右列内部渲染，不引入独立 CTA。

- [ ] **Step 2: 类型门**

Run: `cd web && npx tsc --noEmit`
Expected: 退出码 0。

- [ ] **Step 3: 断言三目的地各恰 1 次、无重复 CTA**

Run: `cd web && grep -c "localePath(lang, \"/investors\")\|localePath(lang, \"/investors/consensus\")\|localePath(lang, \"/stocks\")" src/components/home/StepIndex.tsx`
Expected: 3（三步各一）。再 `grep -n "浏览全部投资者\|Browse all investors" src/components/home/StepIndex.tsx` 应仅出现一次（步①左列 CTA）。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/home/StepIndex.tsx
git commit -m "feat(home): 新建 StepIndex 编号编辑目录,吸收投资者墙,每步单 CTA

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: TrustLockup 基元 + FoundationsGrid 重写为方法与信任带

**Files:**
- Create: `src/components/home/TrustLockup.tsx`
- Rewrite: `src/components/home/FoundationsGrid.tsx`

**Interfaces:**
- Produces:
  - `TrustLockup({ label, value, lang? }): React.ReactElement` — mono 标签 + 值的 hairline 锁片（`font-mono text-[10px] uppercase tracking-[0.12em]` 标签 + `text-sm` 值，`border border-[var(--tt-border)] rounded-md px-3 py-2`）
  - `FoundationsGrid({ lang }): React.ReactElement`（签名不变）
- Consumes: lucide 图标（沿用现有集）、`localePath`（macro 入口）

**craft 参数：**
- FoundationsGrid 顶部眉标「建立在一手来源之上 / Built on primary sources」保留。
- 九宫特性网格保留（图标 + label），但**新增一排信任 lockup**：把 `SEC EDGAR · 一手来源`、`45 天申报延迟`、`不荐股 · 不预测` 三条用 `TrustLockup` 显性呈现（合规升为设计元素，非埋底小字）。
- macro 入口从旧 page.tsx trust strip 迁来：`localePath(lang, "/macro")` 的「宏观流动性 →」放在信任带尾部一行，克制。
- 双语 COPY，纯本语言。

- [ ] **Step 1: 写 TrustLockup 基元**

- [ ] **Step 2: 重写 FoundationsGrid**，加三条 TrustLockup + macro 入口。

- [ ] **Step 3: 类型门**

Run: `cd web && npx tsc --noEmit`
Expected: 退出码 0。

- [ ] **Step 4: 断言合规锁与 macro 入口**

Run: `cd web && grep -n "不荐股\|No recommendations\|localePath(lang, \"/macro\")\|TrustLockup" src/components/home/FoundationsGrid.tsx`
Expected: 命中合规文案、macro 入口、TrustLockup 使用。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/home/TrustLockup.tsx web/src/components/home/FoundationsGrid.tsx
git commit -m "feat(home): 新建 TrustLockup;FoundationsGrid→方法与信任带,合规升为设计元素+并入 macro 入口

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: ClosingCTA 重写 — 单一强 CTA

**Files:**
- Rewrite: `src/components/home/ClosingCTA.tsx`

**Interfaces:**
- Produces: `ClosingCTA({ lang }): React.ReactElement`（签名不变）
- Consumes: `localePath`

**craft 参数：**
- 保留大字号收尾主张（`font-display text-3xl sm:text-5xl`）+ 副文案。
- **删三连药丸 `links` 数组**，改单个强 CTA：「从任意投资者、任意股票开始 → / Start with any investor, any stock →」，`href={localePath(lang, "/investors")}`（get-started 语境，与 StepIndex 步① 的 roster 语境不同；按入口纪律 `/investors` 允许 2 次干净出现，无冲突）。
- CTA 样式沿用现 group hover + `→` 位移微交互，过渡曲线继承全局。

- [ ] **Step 1: 重写 ClosingCTA 为单 CTA → `/investors`**

- [ ] **Step 2: 类型门**

Run: `cd web && npx tsc --noEmit`
Expected: 退出码 0。

- [ ] **Step 3: 断言单 CTA、无三连**

Run: `cd web && grep -c "localePath(lang," src/components/home/ClosingCTA.tsx`
Expected: 1。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/home/ClosingCTA.tsx
git commit -m "feat(home): ClosingCTA 单一强 CTA→/investors,删三连药丸

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: page.tsx 重排编排 + 清理死组件

**Files:**
- Rewrite（编排段）: `src/app/[lang]/page.tsx`
- Delete: `src/components/home/SectionReveal.tsx`、`src/components/home/FeatureRow.tsx`、`src/components/home/TrackedInvestorsWall.tsx`

**Interfaces:**
- Consumes: `HeroMasthead`、`StepIndex`、`FoundationsGrid`、`PhilosophyQuote`、`LearnTeaser`、`ClosingCTA`、`DataStrip`（决策见下）、`consensusCount`/`consensusHeldTop`（Task 1）
- 数据读改动：`held`（`consensusHeld()`）→ `heldTop = consensusHeldTop(6)` + `heldCount = consensusCount()`；`DataStrip` 的 `consensusCount` 传 `heldCount`。

- [ ] **Step 1: 改数据读**

把 `Promise.all` 里的 `consensusHeld()` 换成并行的 `consensusHeldTop(6)` 与 `consensusCount()`；`held.length` 的用途改用 `heldCount`，`held.slice(0,6)` 改用 `heldTop`。

- [ ] **Step 2: 重排 JSX 骨架**

新顺序（去掉所有 `<SectionReveal>` 包裹；间距节奏用大小交替，不再等距 `mt-20/24`）：
```
<HeroMasthead .../>
<DataStrip .../>                     {/* dateline 信号;若 Hero 已含 dateline 则决定是否保留,见 Step 3 */}
<section 近满幅 max-w-6xl>            {/* 打破 max-w-5xl 牢笼 */}
  <StepIndex lang investors={topManagers.slice(0,12)} held={heldTop} strike={strike} />
</section>
<FoundationsGrid .../>               {/* 方法与信任带 */}
<PhilosophyQuote .../>
<LearnTeaser .../>
<ClosingCTA .../>
```
删除旧的「三步 caption 段」、三条 `<FeatureRow>`、`<TrackedInvestorsWall>` 段、底部 trust strip 的 macro 链接（已迁入 FoundationsGrid）。保留底部 source 声明行（SEC EDGAR · 45 天延迟）或并入 FoundationsGrid 信任带（二选一，避免重复 source 文案）。

- [ ] **Step 3: DataStrip 决策**

若 Hero 的 dateline 已覆盖 period/investorCount/consensusCount/dgs10 信号，则 home 不再渲染 `<DataStrip>`（保留基元文件，仅 home 不引）；否则保留一处。实现者择一并在报告说明。无论哪种，`heldCount` 必须有消费者。

- [ ] **Step 4: 删死组件**

```bash
git rm web/src/components/home/SectionReveal.tsx web/src/components/home/FeatureRow.tsx web/src/components/home/TrackedInvestorsWall.tsx
```

- [ ] **Step 5: 类型门**

Run: `cd web && npx tsc --noEmit`
Expected: 退出码 0（若报未使用 import，清掉）。

- [ ] **Step 6: grep-zero 与入口计数（关键验收）**

Run:
```bash
cd web && \
echo "== 死引用应为 0 ==" && grep -rn "SectionReveal\|FeatureRow\|TrackedInvestorsWall" src/ ; \
echo "== 入口计数(page.tsx 正文) ==" && grep -c "localePath(lang, \"/investors\")\|localePath(lang, \"/investors/buys\")\|localePath(lang, \"/investors/consensus\")\|localePath(lang, \"/stocks\")\|localePath(lang, \"/stocks/screener\")" src/app/\[lang\]/page.tsx
```
Expected: 第一段无任何输出（死引用清零）；page.tsx 正文层面这些入口已下沉到子组件，此处计数可为 0（说明未在 page 直接重复）。真正入口计数由各子组件断言（Task 3/4/5/6）保证。

- [ ] **Step 7: 客户端组件计数 9→1**

Run: `cd web && grep -rln "use client" src/components/home/`
Expected: 仅 `RevealStagger.tsx` 一个文件。

- [ ] **Step 8: Commit**

```bash
git add -A web/src/app/[lang]/page.tsx web/src/components/home/
git commit -m "feat(home): page 重排为编辑刊物骨架,接廉价共识读,删 SectionReveal/FeatureRow/投资者墙

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: 四层验收 + 真机 preview

**Files:** 无代码改动（除验收中发现的修补）

- [ ] **Step 1: 技术门总检**

Run:
```bash
cd web && npx tsc --noEmit && \
grep -rn "SectionReveal\|FeatureRow\|TrackedInvestorsWall" src/ ; \
grep -rln "use client" src/components/home/
```
Expected: tsc=0；死引用无输出；client 仅 RevealStagger。

- [ ] **Step 2: 设计原则 8 条自查**（逐条对 §6 第 2 层打勾，问题回修）：令牌无裸 hex（除 `--tt-ease/--tt-dur`）、字体三级尺度、绿色克制、无 Card/描边堆叠、无渐变/影院、动效两处、RSC 边界、响应式。

- [ ] **Step 3: 产品原则 7 条自查**（对 §6 第 3 层）：不荐股不预测显性、dateline 标注来源+季度+日期、纯本语言无混排、免费无账户表达、macro 克制。

- [ ] **Step 4: 性能自查**：确认 page.tsx 已无 `consensusHeld()`（5000 行）调用、改用 `consensusHeldTop(6)`+`consensusCount()`；client 组件 9→1。
Run: `cd web && grep -n "consensusHeld\b\|consensusHeldTop\|consensusCount" src/app/\[lang\]/page.tsx`
Expected: 只见 `consensusHeldTop`/`consensusCount`，不见裸 `consensusHeld(`。

- [ ] **Step 5: 推分支 + Vercel preview 真机验收**

```bash
git push -u origin feat/landing-premium-redesign
```
在 Vercel preview 上双语（`/` 与 `/zh`）逐屏验收：Hero 大字号+ledger stagger、三步索引不对称、信任带合规锁、单 CTA 收尾、无重复入口、移动端不塌。截图/记录交用户终审。

---

## Self-Review（作者自检，已执行）

- **Spec 覆盖**：§3.1 IA→Task 3/4/5/6/7；§3.2 craft→各组件 craft 参数；§3.3 动效→Task 2 + Hero；§4 范围→Task 3-7 文件动作；§5 性能→Task 1 + Task 7 Step1 + Task 8 Step4；§6 验收→Task 8。无遗漏。
- **占位符扫描**：无 TBD/TODO；逻辑步给了完整代码，视觉步给了 craft 参数 + 确切类名（视觉最终打磨由 frontend-design 实现者在建时完成，属预期委派，非占位）。
- **类型一致**：`readConsensusCount`/`readConsensusHeldTop`/`consensusCount`/`consensusHeldTop`/`RevealStagger`/`TrustLockup`/`StepIndex` 命名跨任务一致；`HeldRow` 沿用既有类型。
- **入口纪律**：规则为「同一目的地≤2 次、禁药丸三连、语境各异」。`/investors` 干净出现 2 次（StepIndex① roster + ClosingCTA get-started），Hero→screener、步②→consensus、步③→/stocks 各 1 次；旧 4× 与双药丸消灭。无回改依赖。
