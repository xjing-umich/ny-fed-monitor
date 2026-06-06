# Phase 0 产品骨架重做 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现有"内部监控台"外壳重做成"面向公开访客的产品外壳"——新信息架构(顶导3入口+移动抽屉+搜索)、统一 shadcn/Tailwind 干净亲和亮色设计、实体页统一模板、真落地页、移动端优先——**完全不碰数据**(仍用现有 6 位经理人 + 现有 Fed 数据)。

**Architecture:** 纯逻辑(导航/URL/分组映射)走 TDD + vitest；UI 组件按"route ①：AI 在 shadcn/Tailwind 里直接出码 → 浏览器实时评审"工作，计划只锁定**文件路径/组件接口/槽位结构/验收清单**，像素在执行期实时产出。旧路由 301 到新路由。每个 Phase 0 任务结束都能 `npm run build` 通过并独立上线。

**Tech Stack:** Next.js 16.2.6 (App Router, RSC)、React 19.2.4、Tailwind v4、shadcn(base-nova/base-ui)、next-themes、recharts、lucide、vitest(新增)。参考 spec: `docs/superpowers/specs/2026-06-06-phase0-product-skeleton-design.md`。

---

## 环境/约定
- App root: `/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web`(`src/` 布局；`@/*`→`web/src/*`)。
- Node 20：每条 npm 前置 `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`。
- ⚠️ **`web/AGENTS.md` 警告本版 Next.js 经改造**：写路由/metadata/redirect/middleware 前，先读 `web/node_modules/next/dist/docs/` 中对应指南，遵守弃用提示。
- 分支 `db-foundation`；按用户节奏 commit，不主动 push。
- 主验收：`npm run build` 通过 + 纯逻辑 vitest 绿 + 桌面/移动浏览器走查。

## 文件结构
```
web/src/lib/nav.ts                         [新建] 顶导配置 + Fed section→宏观分组映射 + 本地化标签helper(纯)
web/src/lib/urls.ts                        [新建] slug/cik/cusip 路径构造 + 旧→新URL映射规则(纯)
web/src/lib/__tests__/nav.test.ts          [新建] vitest: 分组映射/标签
web/src/lib/__tests__/urls.test.ts         [新建] vitest: 路径构造/重定向规则
web/vitest.config.ts                       [新建] vitest 配置
web/src/app/globals.css                    [改] 亮色为默认主题 + --tt-* 映射到 shadcn token, 深色可选
web/src/components/shell/AppShell.tsx       [新建] 外壳(顶导+移动抽屉容器)
web/src/components/shell/TopNav.tsx         [新建] 桌面顶部导航 + 语言/主题/搜索入口
web/src/components/shell/MobileDrawer.tsx   [新建] 移动端抽屉导航
web/src/components/shell/SearchBox.tsx      [新建] 全局搜索(Phase0: 经理人/指标客户端过滤)
web/src/components/entity/EntityPage.tsx    [新建] 实体页统一模板(6槽位)
web/src/components/entity/KeyFacts.tsx      [新建] 关键事实条
web/src/components/entity/VerdictChip.tsx   [新建] 结论 chip
web/src/components/entity/AINarrative.tsx   [新建] 嵌入式 AI 叙述(包 /api/ai-analysis)
web/src/components/entity/SourceFooter.tsx  [新建] 来源+时效(数据准确性规则)
web/src/components/entity/RelatedLinks.tsx  [新建] 相关实体交叉链接
web/src/app/[lang]/layout.tsx              [改] 用 AppShell 取代固定侧栏布局
web/src/app/[lang]/page.tsx                [改写] 真落地页
web/src/app/[lang]/investors/page.tsx      [新建] 经理人列表(搜索/排序/筛选)
web/src/app/[lang]/investors/[slug]/page.tsx [新建] 经理人实体页
web/src/app/[lang]/stocks/[id]/page.tsx    [新建] 个股实体页(cusip派生)
web/src/app/[lang]/macro/page.tsx          [新建] 宏观概览(资金面/供给面/政策面)
web/src/app/[lang]/macro/[indicator]/page.tsx [新建] 宏观指标实体页
web/src/app/[lang]/managers/[cik]/page.tsx [改] 改为 cik→slug 永久重定向
web/next.config.ts (或 vercel.ts)          [改] 静态旧→新 301 重定向
web/src/components/dashboard/Sidebar.tsx   [删] 被 AppShell 取代
web/src/components/dashboard/Header.tsx    [删] 被 AppShell 取代
```

---

## Task 0: 测试工具 + 纯逻辑基座(导航/URL)

**Files:**
- Create: `web/vitest.config.ts`, `web/src/lib/nav.ts`, `web/src/lib/urls.ts`, `web/src/lib/__tests__/nav.test.ts`, `web/src/lib/__tests__/urls.test.ts`
- Modify: `web/package.json`(devDep + test script)

- [ ] **Step 1: 装 vitest + 加 test 脚本**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm i -D vitest@^2`
然后在 `package.json` 的 `"scripts"` 加：
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: 写 vitest 配置**

Create `web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

- [ ] **Step 3: 写失败测试 — nav 分组映射**

Create `web/src/lib/__tests__/nav.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { TOP_NAV, MACRO_GROUPS, indicatorToGroup, navLabel } from "@/lib/nav";

describe("nav config", () => {
  it("exposes exactly three top-level entries", () => {
    expect(TOP_NAV.map((e) => e.key)).toEqual(["home", "investors", "macro"]);
  });
  it("maps every legacy section into one macro group", () => {
    const all = MACRO_GROUPS.flatMap((g) => g.indicators);
    for (const key of ["dealer-inventory", "repo-financing", "reference-rates", "auction-risk", "soma", "policy-expectations"]) {
      expect(all).toContain(key);
    }
  });
  it("resolves an indicator to its group key", () => {
    expect(indicatorToGroup("repo-financing")).toBe("funding");
    expect(indicatorToGroup("auction-risk")).toBe("supply");
  });
  it("localizes labels", () => {
    expect(navLabel("zh", "investors")).toBe("超级投资者");
    expect(navLabel("en", "investors")).toBe("Superinvestors");
  });
});
```

- [ ] **Step 4: 跑测试确认失败**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm test -- nav`
Expected: FAIL（`@/lib/nav` 不存在）

- [ ] **Step 5: 实现 nav.ts**

Create `web/src/lib/nav.ts`（资金面/供给面/政策面分组 + 顶导3入口 + 标签）:
```ts
export type Lang = "zh" | "en";

export const TOP_NAV = [
  { key: "home", zh: "首页", en: "Home", href: "" },
  { key: "investors", zh: "超级投资者", en: "Superinvestors", href: "/investors" },
  { key: "macro", zh: "宏观/流动性", en: "Macro / Liquidity", href: "/macro" },
] as const;

// 把原 Fed sections 归并为访客能懂的 3 组（每个指标配一行白话在指标页文案里）
export const MACRO_GROUPS = [
  { key: "funding", zh: "资金面", en: "Funding",
    indicators: ["repo-financing", "reference-rates", "facility-usage", "fails"] },
  { key: "supply", zh: "供给面", en: "Supply",
    indicators: ["auction-risk", "soma", "dealer-inventory", "transactions", "market-share"] },
  { key: "policy", zh: "政策面", en: "Policy",
    indicators: ["policy-expectations"] },
] as const;

export function indicatorToGroup(indicator: string): string | null {
  const g = MACRO_GROUPS.find((g) => (g.indicators as readonly string[]).includes(indicator));
  return g ? g.key : null;
}

const LABELS: Record<string, { zh: string; en: string }> = Object.fromEntries(
  TOP_NAV.map((e) => [e.key, { zh: e.zh, en: e.en }])
);

export function navLabel(lang: Lang, key: string): string {
  const l = LABELS[key];
  return l ? l[lang] : key;
}
```

- [ ] **Step 6: 跑测试确认通过**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm test -- nav`
Expected: PASS

- [ ] **Step 7: 写失败测试 — urls 路径/重定向**

Create `web/src/lib/__tests__/urls.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { investorPath, stockPath, macroPath, legacyRedirect } from "@/lib/urls";

describe("url builders", () => {
  it("builds localized entity paths", () => {
    expect(investorPath("zh", "warren-buffett-berkshire")).toBe("/zh/investors/warren-buffett-berkshire");
    expect(stockPath("en", "037833100")).toBe("/en/stocks/037833100");
    expect(macroPath("zh", "repo-financing")).toBe("/zh/macro/repo-financing");
  });
  it("maps legacy managers list to investors", () => {
    expect(legacyRedirect("/zh/managers")).toBe("/zh/investors");
  });
  it("maps legacy section to macro indicator", () => {
    expect(legacyRedirect("/en/repo-financing")).toBe("/en/macro/repo-financing");
  });
  it("returns null for non-legacy paths", () => {
    expect(legacyRedirect("/zh/investors")).toBeNull();
  });
});
```

- [ ] **Step 8: 跑测试确认失败**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm test -- urls`
Expected: FAIL（`@/lib/urls` 不存在）

- [ ] **Step 9: 实现 urls.ts**

Create `web/src/lib/urls.ts`:
```ts
import type { Lang } from "@/lib/nav";
import { MACRO_GROUPS } from "@/lib/nav";

export const investorPath = (lang: Lang, slug: string) => `/${lang}/investors/${slug}`;
export const stockPath = (lang: Lang, id: string) => `/${lang}/stocks/${id}`;
export const macroPath = (lang: Lang, indicator: string) => `/${lang}/macro/${indicator}`;

const SECTION_KEYS = new Set(MACRO_GROUPS.flatMap((g) => g.indicators as readonly string[]));

// 旧→新：/{lang}/managers → /{lang}/investors；/{lang}/{section} → /{lang}/macro/{section}
// 注意：/{lang}/managers/{cik} 的 cik→slug 需查数据，由动态重定向页处理(Task 4)，此处不覆盖。
export function legacyRedirect(path: string): string | null {
  const m = path.match(/^\/(zh|en)(\/.*)?$/);
  if (!m) return null;
  const lang = m[1];
  const rest = m[2] ?? "";
  if (rest === "/managers") return `/${lang}/investors`;
  const seg = rest.replace(/^\//, "");
  if (SECTION_KEYS.has(seg)) return `/${lang}/macro/${seg}`;
  return null;
}
```

- [ ] **Step 10: 跑测试确认通过 + 提交**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm test`
Expected: PASS（nav + urls 全绿）
```bash
git add web/package.json web/vitest.config.ts web/src/lib/nav.ts web/src/lib/urls.ts web/src/lib/__tests__/
git commit -m "Add vitest + nav/url logic foundations for Phase 0 skeleton"
```

---

## Task 1: 统一设计系统 — 亮色亲和主题(设计方向检查点)

**Files:** Modify `web/src/app/globals.css`

> UI 任务：按 route ① 实时出码 + 浏览器评审。本任务是**设计方向锁定检查点**——后续所有页面都用这里定下的主题 token。

- [ ] **Step 1: 读 Next/Tailwind v4 主题指南**

读 `web/node_modules/next/dist/docs/` 相关页 + 现有 `globals.css` 里 `--tt-*` 与 shadcn `--background/--foreground/--primary/...` token，弄清当前深色默认值。

- [ ] **Step 2: 加亮色为默认主题 + 映射**

在 `globals.css` 把**亮色设为默认**（`:root` 用干净亮色：近白底、深灰字、克制的强调色），把现有 `--tt-*`（`--tt-panel/--tt-border/--tt-text/--tt-muted/--tt-faint/--tt-accent/--tt-positive/--tt-warn/--tt-negative`）重定义为引用 shadcn 语义 token，使两套合一；深色移到 `.dark`（next-themes 已接）。保留等宽字体仅用于数字/指标。

- [ ] **Step 3: 出关键页样板供评审**

用 frontend-design 在新主题下生成**落地页 hero + 经理人实体页**两张静态样板（真组件、shadcn/Tailwind），`npm run dev` 在浏览器看。
**检查点 — 与用户确认：** 干净亲和亮色风是否到位？强调色/圆角/间距/字号定稿？深浅主题切换正常？确认后再继续后续 UI 任务。

- [ ] **Step 4: 构建校验 + 提交**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
Expected: 构建通过
```bash
git add web/src/app/globals.css
git commit -m "Unify design system: light approachable theme, map --tt-* to shadcn tokens"
```

---

## Task 2: AppShell — 顶导 + 移动抽屉(取代固定侧栏)

**Files:**
- Create: `web/src/components/shell/AppShell.tsx`, `TopNav.tsx`, `MobileDrawer.tsx`, `SearchBox.tsx`
- Modify: `web/src/app/[lang]/layout.tsx`
- Delete: `web/src/components/dashboard/Sidebar.tsx`, `web/src/components/dashboard/Header.tsx`

**接口契约：**
```ts
// AppShell.tsx (server-friendly wrapper; 渲染 children)
function AppShell(props: { lang: "zh" | "en"; children: React.ReactNode }): JSX.Element
// TopNav.tsx ("use client") — 桌面顶部条：Logo + TOP_NAV(navLabel) + SearchBox + 语言切换 + 主题切换；usePathname 高亮 active
function TopNav(props: { lang: "zh" | "en" }): JSX.Element
// MobileDrawer.tsx ("use client") — 汉堡触发的抽屉，含 TOP_NAV + 语言/主题
function MobileDrawer(props: { lang: "zh" | "en" }): JSX.Element
// SearchBox.tsx ("use client") — Phase0 客户端过滤经理人/指标名→跳转；输入框 + 结果下拉
function SearchBox(props: { lang: "zh" | "en"; items: { label: string; href: string }[] }): JSX.Element
```

- [ ] **Step 1: 读路由/客户端组件指南** — `web/node_modules/next/dist/docs/` 中 layout/client component 相关页。
- [ ] **Step 2: 实现 TopNav/MobileDrawer/SearchBox/AppShell**（route ①：用 `@/lib/nav` 的 `TOP_NAV`/`navLabel`，复用现有语言/主题切换逻辑；响应式：≥md 顶导、<md 汉堡抽屉；内容容器 `max-width` 居中）。SearchBox 的 items 由 layout 传入：经理人(getManagerIndex→person/name)+宏观指标(MACRO_GROUPS)。
- [ ] **Step 3: 改 layout.tsx** 用 `<AppShell lang={lang}>{children}</AppShell>` 取代固定 240 侧栏 + `marginLeft:240`；保留 footer(来源+不提供交易建议)。
- [ ] **Step 4: 删 Sidebar.tsx / Header.tsx**，并 `grep -rn "dashboard/Sidebar\|dashboard/Header" web/src` 清残留引用。
- [ ] **Step 5: 构建 + 浏览器走查**

Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
Expected: 通过；`npm run dev` 桌面顶导 + 手机抽屉均正常、active 高亮、语言/主题/搜索可用。
- [ ] **Step 6: 提交**
```bash
git add web/src/components/shell web/src/app/[lang]/layout.tsx
git rm web/src/components/dashboard/Sidebar.tsx web/src/components/dashboard/Header.tsx
git commit -m "Replace fixed sidebar with responsive AppShell (top nav + mobile drawer + search)"
```

---

## Task 3: 实体页统一模板 EntityPage

**Files:** Create `web/src/components/entity/EntityPage.tsx` + `KeyFacts.tsx` + `VerdictChip.tsx` + `AINarrative.tsx` + `SourceFooter.tsx` + `RelatedLinks.tsx`

**接口契约：**
```ts
type KeyFact = { label: string; value: string; tone?: "positive" | "warn" | "negative" | "neutral" };
type RelatedItem = { label: string; href: string };
type EntityPageProps = {
  lang: "zh" | "en";
  title: string;
  subtitle: string;                 // 一句白话"这是什么"
  verdict?: { label: string; tone: "positive" | "warn" | "negative" | "neutral" };
  keyFacts: KeyFact[];              // 3–5 个
  aiPageKey?: string;              // 传给 AINarrative 拉 /api/ai-analysis 缓存
  children: React.ReactNode;       // 数据主体(表/图)
  sources: { name: string; asOf: string }[]; // SourceFooter
  related?: RelatedItem[];
};
function EntityPage(props: EntityPageProps): JSX.Element  // 渲染 6 槽位：标题区/关键事实/AI叙述/主体/来源/相关
```
- [ ] **Step 1:** 实现 6 个组件（route ①）。`AINarrative`("use client") 复用现有 `/api/ai-analysis` fetch 模式（参考 `AIMarketCommentary.tsx`），按 `aiPageKey` 取；无缓存→"暂无解读"占位，不报错。`SourceFooter` 强制显示 `name + as of`（数据准确性规则）。
- [ ] **Step 2: 构建校验**
Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
Expected: 通过（模板暂未被页面引用也应编译）。
- [ ] **Step 3: 提交**
```bash
git add web/src/components/entity
git commit -m "Add shared EntityPage template (title/keyfacts/AI narrative/body/sources/related)"
```

---

## Task 4: 经理人列表 + 实体页(新路由) + cik→slug 重定向

**Files:**
- Create: `web/src/app/[lang]/investors/page.tsx`, `web/src/app/[lang]/investors/[slug]/page.tsx`
- Modify: `web/src/app/[lang]/managers/[cik]/page.tsx`(改为重定向)
- Modify: `web/next.config.ts`(静态 `/managers`→`/investors` 301)

- [ ] **Step 1: 读重定向 API** — `web/node_modules/next/dist/docs/` 查 Next 16 的 `redirect`/`permanentRedirect`(next/navigation) 与 `next.config` redirects 的当前写法。
- [ ] **Step 2: investors 列表页**（route ①）：`getManagerIndex()` → 卡片网格，支持客户端搜索(person/name)、排序(总市值/持仓数)、筛选。卡片链接 `investorPath(lang, m.slug)`。
- [ ] **Step 3: investors/[slug] 实体页**：`getManagerDetail(slug)`(已支持 slug) → 用 `EntityPage`：keyFacts=总市值/持仓数/最新报告期/第一大持仓；主体=持仓表(issuer/value/shares/weight) + `changes`(新建/清仓/加减仓)；每行 issuer 链接到 `stockPath(lang, cusip)`；`aiPageKey="investor:<slug>"`；sources=[{name:"SEC EDGAR 13F", asOf: latest.filedAt}]；related=其他经理人。未命中 slug→`notFound()`。
- [ ] **Step 4: cik→slug 永久重定向**：把 `app/[lang]/managers/[cik]/page.tsx` 改为：`getManagerDetail(cik)`→拿 `manager.slug`→`permanentRedirect(investorPath(lang, slug))`；查不到→`notFound()`。
- [ ] **Step 5: 静态重定向**：`next.config.ts` 加 `/:lang(zh|en)/managers` → `/:lang/investors`(permanent)。
- [ ] **Step 6: 构建 + 走查**
Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
Expected: 通过；`/zh/investors` 列表可搜可排，点入实体页正常；旧 `/zh/managers` 与 `/zh/managers/0001067983` 都 301 到新址。
- [ ] **Step 7: 提交**
```bash
git add web/src/app/[lang]/investors web/src/app/[lang]/managers web/next.config.ts
git commit -m "Add investors list + slug entity page; 301 legacy /managers routes"
```

---

## Task 5: 个股实体页(cusip 派生)

**Files:** Create `web/src/app/[lang]/stocks/[id]/page.tsx`

> Phase 0 无 ticker，`[id]` = cusip；Phase 1 接 ticker 后改 ticker + 加 301。

- [ ] **Step 1: 派生"谁持有此 cusip"**：`getManagerIndex()` 拿全部经理人 → 对每位 `getManagerDetail(slug)` → 在 `latest.holdings` 找该 `cusip`，聚合出 {持有的经理人列表, 各自 value/shares/weight, issuer 名}。无人持有→`notFound()`。
- [ ] **Step 2: 渲染**（route ①）用 `EntityPage`：title=issuer；subtitle=白话(如"X 位超级投资者持有的证券，CUSIP …")；keyFacts=持有人数/合计市值/最大持有人；主体=持有人表(经理人→value/weight，链接回 `investorPath`)；`aiPageKey="stock:<cusip>"`；sources=[{name:"SEC EDGAR 13F", asOf: 各经理人 filedAt 最新}]；标注"估值数据即将上线"占位。
- [ ] **Step 3: 构建 + 走查**
Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
Expected: 通过；从经理人实体页点某持仓 issuer → 进入 `/zh/stocks/<cusip>`，列出哪些经理人持有它。
- [ ] **Step 4: 提交**
```bash
git add web/src/app/[lang]/stocks
git commit -m "Add holdings-derived stock detail page (keyed by cusip for Phase 0)"
```

---

## Task 6: 宏观概览 + 指标实体页 + section 重定向

**Files:**
- Create: `web/src/app/[lang]/macro/page.tsx`, `web/src/app/[lang]/macro/[indicator]/page.tsx`
- Modify: `web/src/app/[lang]/[section]/page.tsx`(改为重定向) 或在 `next.config.ts` 配重定向
- Reuse: `web/src/lib/build.ts`(`buildAllSections`), `web/src/lib/dashboard.ts`

- [ ] **Step 1: 宏观概览 `/macro`**（route ①）：用 `MACRO_GROUPS` 按 资金面/供给面/政策面 三组渲染指标卡（每张配一行白话 + 现有信号标签经白话化），卡片链 `macroPath(lang, indicator)`。
- [ ] **Step 2: 指标实体页 `/macro/[indicator]`**：校验 indicator∈现有 sections，否则 `notFound()`；用 `buildAllSections()` 取该 section → `EntityPage`：title=section 名(白话)；subtitle=该指标一句话解释；keyFacts=section.key_metrics 前几项；主体=复用现有图表组件(`SectionChart`/`DataTable` 等)；`aiPageKey="macro:<indicator>"`；sources=[{name: section 数据源, asOf: section as_of}]；related=同组其它指标。
- [ ] **Step 3: 旧 section 重定向**：`/:lang/:section` 旧路径 301 到 `/:lang/macro/:section`。优先在 `next.config.ts` 用显式列表(把 `MACRO_GROUPS` 里的 indicator 逐条列出 redirect，permanent)；保留 `data-freshness` 等系统页的处理(归入 supply 或单列，执行期定)。
- [ ] **Step 4: 删除/退役旧 `[section]` 动态页**（被 macro + 重定向取代），`grep -rn "\[section\]" web/src` 清引用。
- [ ] **Step 5: 构建 + 走查**
Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
Expected: 通过；`/zh/macro` 三组呈现，点入指标页有图有白话；旧 `/zh/repo-financing` 301 到 `/zh/macro/repo-financing`。
- [ ] **Step 6: 提交**
```bash
git add web/src/app/[lang]/macro web/next.config.ts
git rm -r web/src/app/[lang]/[section]
git commit -m "Add macro overview + indicator entity pages; 301 legacy section routes"
```

---

## Task 7: 真落地页(首页)

**Files:** Modify (改写) `web/src/app/[lang]/page.tsx`

- [ ] **Step 1: 改写为访客落地页**（route ①）：① 英雄区点题"谁在买 × 值不值 × 大环境"价值主张 ② 三大支柱入口卡(超级投资者→/investors、个股估值→说明、宏观流动性→/macro) ③ "本周热点" teaser(用现有数据能算的简版：如最大持仓/最新信号；不足则静态精选) ④ 一个样例经理人(getManagerIndex top1) + 一个样例宏观信号(白话) ⑤ 底部信任(来源+不提供交易建议)。保留紧凑"市场信号"条但用白话标注。
- [ ] **Step 2: 设计评审检查点** — `npm run dev` 浏览器看落地页桌面/移动；与用户确认信息层级与"新手能懂"。
- [ ] **Step 3: 构建 + 提交**
Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm run build`
Expected: 通过。
```bash
git add web/src/app/[lang]/page.tsx
git commit -m "Rewrite home as visitor landing page (three pillars + plain language)"
```

---

## Task 8: 收尾 + 全量校验

**Files:** 清理残留；无新建

- [ ] **Step 1: 清死代码** — `grep -rn "dashboard/Sidebar\|dashboard/Header\|\[section\]\|/managers/" web/src` 确认无悬空引用(除 managers/[cik] 重定向页)；`AIMarketCommentary.tsx` 若已被 `AINarrative` 取代则评估删除，否则保留。
- [ ] **Step 2: 全量测试 + 构建**
Run: `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH" && cd web && npm test && npm run build`
Expected: vitest 全绿 + 构建通过。
- [ ] **Step 3: 双视口人工走查** — 桌面 + 移动各走：首页→超级投资者列表→经理人实体页→点持仓→个股页→宏观概览→指标页；旧链接 301；亮/暗主题；语言切换；搜索。
- [ ] **Step 4: 最终提交**
```bash
git add -A
git commit -m "Phase 0 cleanup: remove dead shell code, verify build + tests + redirects"
```

---

## Self-Review 覆盖核对(spec §3 ↔ 任务)
- §3.1 IA/路由(3入口/slug/旧301) → Task 0(nav/urls)+2(顶导)+4(investors/managers 301)+6(macro/section 301)。✅
- §3.2 设计系统统一 → Task 1。✅
- §3.3 实体页模板 → Task 3，被 4/5/6 复用。✅
- §3.4 落地页 → Task 7。✅
- §3.5 移动端外壳 → Task 2。✅
- §3 个股从持仓点入、不进一级导航 → Task 4 持仓行链接 + Task 5；TOP_NAV 仅3入口(Task 0)。✅
- §6 验收(build + 精简 vitest + 人工) → Task 0 测试基座 + 各任务 build 步 + Task 8。✅
- §7 AGENTS.md Next 改造注意 → Task 1/2/4 均含"先读 node_modules/next/dist/docs"步。✅
- 边界"不碰数据" → 全程仅读 `getManagerIndex/Detail`、`buildAllSections`，无 ingestion/schema 改动。✅
```
