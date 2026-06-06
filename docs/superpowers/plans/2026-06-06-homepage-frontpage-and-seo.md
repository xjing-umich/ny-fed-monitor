# 首页数据头版 + 低成本 SEO 地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把首页从"海报"改成**编辑式数据头版 + 内链 hub**（报眉 + 本季显著动向 + 共识持仓 + 投资者榜 + 宏观速览，全部用现有数据、每个实体可点），并顺手做低成本 SEO 地基（共享聚合层、sitemap/robots、JSON-LD、hreflang）。

**Architecture:** 新增 `lib/aggregations.ts` 把"扫描全体经理人持仓"的逻辑收敛为 `React.cache` 包裹的纯聚合（`mostHeld`/`notableMoves`），首页与 `/stocks` 共用。首页改写为聚合头版（不套 EntityPage，自建小区块）。SEO 用 Next app-router 原生 `sitemap.ts`/`robots.ts` + 各页 `generateMetadata` 的 `alternates`(hreflang) + 内联 JSON-LD。纯逻辑走 vitest，UI/SEO 走 `npm run build` + curl 校验。

**Tech Stack:** Next.js 16 (App Router, RSC, `sitemap`/`robots`/`metadata` API), React 19, Tailwind v4 + 编辑式 token（衬线 `--font-display`、发丝线、等宽数字、钞票绿）, vitest. 参考 spec: `docs/superpowers/specs/2026-06-06-homepage-frontpage-and-seo.md`。

---

## 环境/约定
- App root: `web/`（`@/*`→`web/src/*`）。Node 20：npm 前置 `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`。
- ⚠️ `web/AGENTS.md`：改造版 Next 16 —— 写 sitemap/robots/metadata/JSON-LD 前先读 `web/node_modules/next/dist/docs/` 对应指南。
- 分支 `phase0-product-skeleton`。设计语言：金融编辑刊物风、单语言 per lang、CSS hover（Server Component 不得传事件处理器）。
- 主验收：`npm run build` 通过 + `npm test` 绿 + curl 路由/SEO 校验。dev server 通常在 :3100。

## 数据/类型基础（已存在，复用）
- `getManagerIndex(): Promise<{ generatedAt: string; managers: ManagerSummary[] }>`；`ManagerSummary={cik,slug,name,person,period,totalValue,holdingCount,topHolding}`。
- `getManagerDetail(slug): Promise<ManagerDetail|null>`；`ManagerDetail={manager,latest:{period,filedAt,holdings:Holding[],totalValue},changes:HoldingChange[]}`。
- `Holding={cusip,issuer,value,shares,weight?}`；`HoldingChange={cusip,issuer,kind:"new"|"exited"|"increased"|"decreased",prevShares,shares,value,deltaPct}`。
- URL：`@/lib/urls` `investorPath/stockPath/macroPath`。Nav：`@/lib/nav` `MACRO_GROUPS`。标签：`@/lib/dashboard` `sectionLabel/metricLabel`。Section：`@/lib/build` `buildAllSections`。

## 文件结构
```
web/src/lib/aggregations.ts                 [新建] React.cache 扫描 + mostHeld()/notableMoves()（纯聚合）
web/src/lib/__tests__/aggregations.test.ts  [新建] vitest: 计数/排序正确
web/src/app/[lang]/page.tsx                 [改写] 数据头版（5 区块 + JSON-LD）
web/src/app/[lang]/stocks/page.tsx          [改] 改用 aggregations.mostHeld（去内联重复）
web/src/app/sitemap.ts                      [新建] 全实体 URL（双语）
web/src/app/robots.ts                       [新建] 允许抓取 + 指向 sitemap
web/src/app/[lang]/investors/[slug]/page.tsx [改] metadata 加 alternates(hreflang)+canonical，注 BreadcrumbList JSON-LD
web/src/app/[lang]/stocks/[id]/page.tsx     [改] 同上（hreflang + BreadcrumbList）
web/src/app/[lang]/macro/[indicator]/page.tsx [改] 同上（hreflang）
```

---

## Task 1: 聚合层 `lib/aggregations.ts`（TDD）

**Files:** Create `web/src/lib/aggregations.ts`, `web/src/lib/__tests__/aggregations.test.ts`

- [ ] **Step 1: 写失败测试**

测试用**纯计算函数**（不依赖真实数据读取）：把扫描与计算拆开——`computeMostHeld(scan)` 和 `computeNotableMoves(scan)` 接收一个已扫描的数组，便于单测。

Create `web/src/lib/__tests__/aggregations.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeMostHeld, computeNotableMoves, type ScanRow } from "@/lib/aggregations";

const scan: ScanRow[] = [
  { slug: "a", person: "A", holdings: [
      { cusip: "X", issuer: "XCorp", value: 100, shares: 10, weight: 0.5 },
      { cusip: "Y", issuer: "YCorp", value: 50, shares: 5 },
    ], changes: [
      { cusip: "X", issuer: "XCorp", kind: "new", prevShares: 0, shares: 10, value: 100, deltaPct: null },
    ] },
  { slug: "b", person: "B", holdings: [
      { cusip: "X", issuer: "XCorp", value: 200, shares: 20, weight: 0.8 },
    ], changes: [
      { cusip: "X", issuer: "XCorp", kind: "increased", prevShares: 5, shares: 20, value: 200, deltaPct: 3 },
      { cusip: "Y", issuer: "YCorp", kind: "exited", prevShares: 7, shares: 0, value: 0, deltaPct: null },
    ] },
];

describe("computeMostHeld", () => {
  it("ranks by holder count then total value", () => {
    const r = computeMostHeld(scan, 10);
    expect(r[0]).toMatchObject({ cusip: "X", issuer: "XCorp", holderCount: 2, totalValue: 300 });
    expect(r[1]).toMatchObject({ cusip: "Y", holderCount: 1, totalValue: 50 });
  });
});

describe("computeNotableMoves", () => {
  it("counts buyers (new/increased) and sellers (exited/decreased) per cusip", () => {
    const r = computeNotableMoves(scan, 10);
    expect(r.mostBought[0]).toMatchObject({ cusip: "X", issuer: "XCorp", count: 2 });
    expect(r.mostSold[0]).toMatchObject({ cusip: "Y", issuer: "YCorp", count: 1 });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm test -- aggregations`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `web/src/lib/aggregations.ts`**

```ts
import { cache } from "react";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import type { Holding, HoldingChange } from "@/lib/managers/types";

export type ScanRow = {
  slug: string;
  person: string;
  holdings: Holding[];
  changes: HoldingChange[];
};

export type HeldRow = { cusip: string; issuer: string; holderCount: number; totalValue: number };
export type MoveRow = { cusip: string; issuer: string; count: number; value: number };
export type NotableMoves = { mostBought: MoveRow[]; mostSold: MoveRow[] };

/** Scan every manager's latest holdings + changes. Cached per render to avoid re-reads. */
export const scanAllManagers = cache(async (): Promise<ScanRow[]> => {
  const idx = await getManagerIndex();
  const rows = await Promise.all(
    (idx.managers ?? []).map(async (m) => {
      const d = await getManagerDetail(m.slug);
      if (!d) return null;
      return { slug: m.slug, person: m.person, holdings: d.latest.holdings ?? [], changes: d.changes ?? [] };
    })
  );
  return rows.filter((r): r is ScanRow => r !== null);
});

export function computeMostHeld(scan: ScanRow[], limit: number): HeldRow[] {
  const agg = new Map<string, { issuer: string; holders: Set<string>; totalValue: number }>();
  for (const row of scan) {
    for (const h of row.holdings) {
      const e = agg.get(h.cusip) ?? { issuer: h.issuer, holders: new Set<string>(), totalValue: 0 };
      e.holders.add(row.slug);
      e.totalValue += h.value ?? 0;
      if (!e.issuer && h.issuer) e.issuer = h.issuer;
      agg.set(h.cusip, e);
    }
  }
  return [...agg.entries()]
    .map(([cusip, e]) => ({ cusip, issuer: e.issuer, holderCount: e.holders.size, totalValue: e.totalValue }))
    .sort((a, b) => b.holderCount - a.holderCount || b.totalValue - a.totalValue)
    .slice(0, limit);
}

export function computeNotableMoves(scan: ScanRow[], limit: number): NotableMoves {
  const buys = new Map<string, { issuer: string; count: number; value: number }>();
  const sells = new Map<string, { issuer: string; count: number; value: number }>();
  for (const row of scan) {
    for (const c of row.changes) {
      if (c.kind === "new" || c.kind === "increased") {
        const e = buys.get(c.cusip) ?? { issuer: c.issuer, count: 0, value: 0 };
        e.count += 1; e.value += c.value ?? 0; buys.set(c.cusip, e);
      } else if (c.kind === "exited" || c.kind === "decreased") {
        const e = sells.get(c.cusip) ?? { issuer: c.issuer, count: 0, value: 0 };
        e.count += 1; e.value += c.value ?? 0; sells.set(c.cusip, e);
      }
    }
  }
  const top = (m: Map<string, { issuer: string; count: number; value: number }>): MoveRow[] =>
    [...m.entries()]
      .map(([cusip, e]) => ({ cusip, issuer: e.issuer, count: e.count, value: e.value }))
      .sort((a, b) => b.count - a.count || b.value - a.value)
      .slice(0, limit);
  return { mostBought: top(buys), mostSold: top(sells) };
}

// Convenience wrappers that scan + compute (server-only callers).
export async function mostHeld(limit = 40): Promise<HeldRow[]> {
  return computeMostHeld(await scanAllManagers(), limit);
}
export async function notableMoves(limit = 6): Promise<NotableMoves> {
  return computeNotableMoves(await scanAllManagers(), limit);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm test -- aggregations`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add web/src/lib/aggregations.ts web/src/lib/__tests__/aggregations.test.ts
git commit -m "Add shared holdings aggregations (mostHeld/notableMoves, React.cache scan)"
```

---

## Task 2: `/stocks` 改用共享聚合（去重）

**Files:** Modify `web/src/app/[lang]/stocks/page.tsx`

- [ ] **Step 1: 改造**

把 `stocks/page.tsx` 里"内联扫描全体经理人 + 聚合 most-held"的代码删除，改为 `import { mostHeld } from "@/lib/aggregations"` 并 `const rows = await mostHeld(40)`。`rows` 字段为 `{cusip, issuer, holderCount, totalValue}`，与原渲染所需一致（如有命名差异，调整渲染处引用）。保留页面其余编辑式渲染/ SubNav 不变。

- [ ] **Step 2: 构建 + 校验**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
Expected: 通过。`/zh/stocks` 仍显示最多机构持有列表（与改造前一致）。

- [ ] **Step 3: 提交**

```bash
git add web/src/app/[lang]/stocks/page.tsx
git commit -m "Reuse shared mostHeld aggregation in /stocks (remove inline duplicate)"
```

---

## Task 3: 首页数据头版改写

**Files:** Modify (改写) `web/src/app/[lang]/page.tsx`

> UI 任务（route ①：编辑式直接出码 + 浏览器评审）。结构契约如下，像素在执行期产出，须匹配现有编辑式风格（衬线小标题、发丝 `border-t`、等宽数字、钞票绿、单语言 per lang）。

- [ ] **Step 1: 读现有首页 + 一个编辑式参考**

读当前 `web/src/app/[lang]/page.tsx`（将被替换）与 `web/src/app/[lang]/stocks/page.tsx`（编辑式表格参考）。

- [ ] **Step 2: 改写首页为 server component 数据头版**

数据获取（server）：
```ts
const idx = await getManagerIndex();
const topManagers = [...(idx.managers ?? [])].sort((a,b)=>b.totalValue-a.totalValue);
const period = topManagers[0]?.period ?? "";
const moves = await notableMoves(6);           // from @/lib/aggregations
const held = await mostHeld(8);
let macroSignals = [];
try {
  const data = await buildAllSections();
  macroSignals = ["reference-rates","repo-financing","auction-risk"]
    .map(k => data.sections[k]).filter(Boolean)
    .map(s => ({ key: s.key, name: sectionLabel(lang, s) ?? s.key,
                 metric: (s.key_metrics ?? []).find(m => m.value && !String(m.value).toLowerCase().includes("unavailable")) }))
    .filter(x => x.metric).slice(0,3);
} catch { macroSignals = []; }
```
渲染 5 区块（编辑式、所有实体可点）：
1. **报眉**：`截至 {period} · {topManagers.length} 位投资者 · 数据来源 SEC 13F`（en: `As of {period} · {n} investors · Source: SEC 13F`）。小字、muted、发丝下边。
2. **本季显著动向**：两栏 `本季最多人增持 / 最多人减持`（en `Most bought / Most sold this quarter`）。每栏列 `moves.mostBought/.mostSold`：issuer（链 `stockPath(lang,cusip)`）+ `{count} 位`（en `{count} investors`）+ `formatUSD(value)`。等宽数字、发丝行。
3. **共识持仓**：`held` Top 8 表（issuer 链 stockPath、holderCount、formatUSD(totalValue)），标题 + 右上 `查看全部 →` 到 `/${lang}/stocks`。
4. **投资者一览**：`topManagers` 表（person 链 investorPath、formatUSD(totalValue)、holdingCount、topHolding），右上 `查看全部 →` 到 `/${lang}/investors`。
5. **宏观速览**：`macroSignals` 每个一行（name 链 macroPath、metric 值），标题右上 `查看全部 →` 到 `/${lang}/macro`。
- 布局：桌面用 grid（如头条动向占主栏，共识/宏观可右侧栏或顺序堆叠——执行期取舍），移动端单列堆叠。
- **防御**：任何块为空则省略，不崩。无大 hero、无三张介绍卡。
- 用 `formatUSD` from `@/lib/format`；`sectionLabel`/`metricLabel` from `@/lib/dashboard`。
- **不得**在 server component 传 onClick/onMouseEnter（hover 用 Tailwind `hover:` 类）。

- [ ] **Step 3: 首页 JSON-LD（结构化数据）**

在首页返回的 JSX 顶部加一个内联 `<script type="application/ld+json">`（Server Component 安全），内容用 `JSON.stringify`：
```ts
const ld = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Compounder",
  url: `https://compounder.fyi/${lang}`,
  description: lang === "zh"
    ? "聚合超级投资者 13F 持仓、个股估值与宏观流动性。"
    : "Smart-money 13F holdings, single-stock valuation, and the macro funding backdrop.",
};
```
渲染：`<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />`。

- [ ] **Step 4: 首页 generateMetadata（含 hreflang）**

```ts
export async function generateMetadata({ params }): Promise<Metadata> {
  const { lang } = await params;
  const l = lang === "en" ? "en" : "zh";
  const title = l === "zh" ? "Compounder · 复利 — 超级投资者持仓 × 个股估值 × 宏观" : "Compounder — Smart-money holdings × valuation × macro";
  const description = l === "zh"
    ? "追踪巴菲特等顶级投资者的 SEC 13F 季度持仓、跨机构共识与宏观流动性信号。数据来源 SEC EDGAR / NY Fed。"
    : "Track top investors' SEC 13F holdings, cross-fund consensus, and macro funding signals. Sources: SEC EDGAR / NY Fed.";
  return {
    title, description,
    alternates: { canonical: `/${l}`, languages: { "zh-CN": "/zh", en: "/en" } },
  };
}
```

- [ ] **Step 5: 构建 + 浏览器评审（视觉检查点）**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
Expected: 通过。`npm run dev` 看 `/zh` 与 `/en`：无大 hero；报眉 + 5 数据块；所有实体可点；移动端堆叠；zh 纯中文 / en 纯英文。**控制器（非本子代理）将截图与用户确认观感后再继续。**

- [ ] **Step 6: 提交**

```bash
git add web/src/app/[lang]/page.tsx
git commit -m "Rewrite home as editorial data front-page (notable moves, consensus, investors, macro) + JSON-LD/hreflang"
```

---

## Task 4: sitemap + robots

**Files:** Create `web/src/app/sitemap.ts`, `web/src/app/robots.ts`

- [ ] **Step 1: 读 Next app-router sitemap/robots 指南**

读 `web/node_modules/next/dist/docs/` 中 `sitemap` / `robots` 约定（`MetadataRoute.Sitemap` / `MetadataRoute.Robots` 的返回形状与文件位置）。

- [ ] **Step 2: 实现 `web/src/app/sitemap.ts`**

```ts
import type { MetadataRoute } from "next";
import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld } from "@/lib/aggregations";
import { MACRO_GROUPS } from "@/lib/nav";

const BASE = "https://compounder.fyi";
const LANGS = ["zh", "en"] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const idx = await getManagerIndex();
  const held = await mostHeld(50);
  const indicators = MACRO_GROUPS.flatMap((g) => g.indicators as readonly string[]);
  const urls: MetadataRoute.Sitemap = [];
  for (const lang of LANGS) {
    urls.push({ url: `${BASE}/${lang}`, changeFrequency: "daily", priority: 1 });
    urls.push({ url: `${BASE}/${lang}/investors`, changeFrequency: "weekly", priority: 0.8 });
    urls.push({ url: `${BASE}/${lang}/stocks`, changeFrequency: "weekly", priority: 0.8 });
    urls.push({ url: `${BASE}/${lang}/macro`, changeFrequency: "daily", priority: 0.7 });
    for (const m of idx.managers ?? []) urls.push({ url: `${BASE}/${lang}/investors/${m.slug}`, changeFrequency: "weekly", priority: 0.7 });
    for (const h of held) urls.push({ url: `${BASE}/${lang}/stocks/${h.cusip}`, changeFrequency: "weekly", priority: 0.6 });
    for (const ind of indicators) urls.push({ url: `${BASE}/${lang}/macro/${ind}`, changeFrequency: "daily", priority: 0.6 });
  }
  return urls;
}
```

- [ ] **Step 3: 实现 `web/src/app/robots.ts`**

```ts
import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://compounder.fyi/sitemap.xml",
  };
}
```

- [ ] **Step 4: 构建 + curl 校验**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
然后 dev 下：`curl -s http://localhost:3100/sitemap.xml | grep -c "/investors/"`（>0）、`curl -s http://localhost:3100/robots.txt | grep -c "Sitemap"`（>0）。
Expected: 通过且非空。

- [ ] **Step 5: 提交**

```bash
git add web/src/app/sitemap.ts web/src/app/robots.ts
git commit -m "Add sitemap.xml (all entity URLs, bilingual) + robots.txt"
```

---

## Task 5: 实体页 hreflang + 面包屑 JSON-LD

**Files:** Modify `web/src/app/[lang]/investors/[slug]/page.tsx`, `web/src/app/[lang]/stocks/[id]/page.tsx`, `web/src/app/[lang]/macro/[indicator]/page.tsx`

- [ ] **Step 1: 三页的 `generateMetadata` 加 alternates(hreflang+canonical)**

在每页现有 `generateMetadata` 返回对象里加（路径按各页参数拼）：
- investor: `alternates: { canonical: \`/${l}/investors/${slug}\`, languages: { "zh-CN": \`/zh/investors/${slug}\`, en: \`/en/investors/${slug}\` } }`
- stock: 同理用 `/stocks/${id}`
- macro: 同理用 `/macro/${indicator}`

- [ ] **Step 2: investor + stock 页注 BreadcrumbList JSON-LD**

在两页返回 JSX 顶部加内联 JSON-LD（Server Component 安全）。investor 页示例：
```ts
const breadcrumb = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: lang === "zh" ? "超级投资者" : "Superinvestors", item: `https://compounder.fyi/${lang}/investors` },
    { "@type": "ListItem", position: 2, name: manager.person, item: `https://compounder.fyi/${lang}/investors/${manager.slug}` },
  ],
};
// <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
```
stock 页同构（position2 = issuer，item = stock URL；position1 = 个股/Stocks → `/stocks`）。

- [ ] **Step 3: 构建 + curl 校验**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
dev 下：`curl -s http://localhost:3100/zh/investors/berkshire-hathaway | grep -c "BreadcrumbList"`（>0）、`grep -c "hreflang\|zh-CN"` 该页源码（>0）。
Expected: 通过且非空。

- [ ] **Step 4: 提交**

```bash
git add web/src/app/[lang]/investors/[slug]/page.tsx web/src/app/[lang]/stocks/[id]/page.tsx web/src/app/[lang]/macro/[indicator]/page.tsx
git commit -m "Add hreflang alternates + BreadcrumbList JSON-LD to entity pages"
```

---

## Task 6: 全量校验

**Files:** 无新建

- [ ] **Step 1: 测试 + 构建**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm test && npm run build`
Expected: vitest 全绿（含 aggregations）+ 构建通过。

- [ ] **Step 2: 路由 + SEO 矩阵（dev :3100）**

curl http_code 期望 200：`/zh` `/en` `/zh/stocks` `/zh/investors` `/zh/investors/berkshire-hathaway` `/zh/macro` `/sitemap.xml` `/robots.txt`。
内容检查：`/zh` 源码含 `application/ld+json` 与 `zh-CN`；`/sitemap.xml` 含 `/investors/` 与 `/stocks/`；`grep -c "Event handlers cannot"` 于 `/zh` = 0。

- [ ] **Step 3: 双视口人工走查**

桌面 + 移动看 `/zh` 与 `/en`：报眉 + 5 数据块、无大 hero、实体可点、单语言、编辑式一致。

- [ ] **Step 4: 最终提交**

```bash
git add -A -- web/src
git reset web/src/data/13f/index.json 2>/dev/null || true
git commit -m "Homepage front-page + SEO foundation: final verification" --allow-empty
```

---

## Self-Review 覆盖核对(spec ↔ 任务)
- §2 首页 5 区块 → Task 3。✅
- §3 aggregations 抽取 + /stocks 复用 → Task 1 + Task 2。✅
- §4 sitemap/robots → Task 4；hreflang → Task 3(首页)+Task 5(实体页)；JSON-LD → Task 3(Organization)+Task 5(Breadcrumb)；metadata 事实文案 → Task 3/5。✅
- §6 验收(build+vitest+curl+人工) → 各任务 build/curl 步 + Task 6。✅
- §7 AGENTS.md 注意 → Task 4/5 含"先读 docs"步。✅
- 边界"不碰数据源" → 仅读 `getManagerIndex/Detail`、`buildAllSections`；新增聚合/sitemap/robots/metadata，无 ingestion/schema/api 改动。✅
- notableMoves 用"投资者计数"而非退出美元额（数据无 prior value）→ Task 1 实现并单测。✅
