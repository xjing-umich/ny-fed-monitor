# ④b 语境化 /learn 链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在个股/投资人详情页的三个区块旁各挂一条轻量语境链接，把"正在看的事实"接到解释它的常青 `/learn` 文章。

**Architecture:** 新建一个纯展示 RSC 组件 `LearnLink`（`localePath` 生成 URL，无逻辑无数据），在个股页两处、投资人页一处按渲染的组件符号锚定放置。固定映射（页面区块 → slug），不做实体派生。

**Tech Stack:** Next.js App Router (RSC, 零 hydration)、`next/link`、`--tt-*` 品牌 token、`localePath(lang, path)`（`@/lib/urls`）。

## Global Constraints

- 分支：`plan/learn-contextual-links`，off `db-foundation` @ e63c14e。
- URL 单一真相源：`localePath(lang, path)`（en 裸前缀 / zh `/zh` 前缀）；**禁**硬编码 `/${lang}/...`。
- 仅用 `--tt-*` token；纯 RSC，**禁** `"use client"`／hydration。
- 每 locale 纯本语言，**禁**中英混排；无买卖/目标价/评级/择时措辞。
- 无常驻测试套件（solo dev）；验证 = `npx tsc --noEmit`（在 `web/` 下）+ 部署后 view-source + 人工 dark/light。**禁** `next build`（本机 google fonts 被墙必失败）。
- 三条常青 slug（已核对在 `web/src/lib/learn.ts`）：`how-to-read-a-13f`、`reading-business-quality`、`what-is-a-superinvestor`。**禁**用 `q1-2026-superinvestor-consensus`（带季度、非常青）。

## File Structure

- 新建 `web/src/components/common/LearnLink.tsx` — 纯展示语境链接组件（唯一职责：渲染一条 mono `/learn` 链接）。
- 改 `web/src/app/[lang]/stocks/[ticker]/page.tsx` — 估值卡后 + 持有人表后各插一条 `<LearnLink>`。
- 改 `web/src/app/[lang]/investors/[slug]/page.tsx` — 持仓表后插一条 `<LearnLink>`。

---

### Task 1: `LearnLink` 组件

**Files:**
- Create: `web/src/components/common/LearnLink.tsx`

**Interfaces:**
- Consumes: `localePath` from `@/lib/urls`；`Lang` from `@/lib/nav`；`Link` from `next/link`。
- Produces: `export function LearnLink({ lang, slug, label }: { lang: Lang; slug: string; label: string }): JSX.Element`。后续任务按此签名调用。

- [ ] **Step 1: 写组件**

`web/src/components/common/LearnLink.tsx`：

```tsx
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { localePath } from "@/lib/urls";

/**
 * 语境化延伸阅读链接。把当前区块接到解释它的常青 /learn 文章。
 * 纯展示 RSC——无逻辑无数据依赖；URL 走 localePath(单一真相源)。
 * 刻意做轻:一行 mono 链接,不是面板,不与 DiscoveryHandoff 主 CTA 争戏。
 */
export function LearnLink({ lang, slug, label }: { lang: Lang; slug: string; label: string }) {
  return (
    <Link
      href={localePath(lang, `/learn/${slug}`)}
      className="group mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-accent)]"
    >
      {label}
      <span aria-hidden className="transition-colors group-hover:text-[var(--tt-accent)]">→</span>
    </Link>
  );
}
```

- [ ] **Step 2: 类型门**

Run（在 `web/` 下）：`npx tsc --noEmit`
Expected: 零错误（组件独立、仅依赖既有 `localePath`/`Lang`）。

- [ ] **Step 3: Commit**

```bash
git add web/src/components/common/LearnLink.tsx
git commit -m "feat(learn): LearnLink 语境链接组件(纯RSC, localePath)"
```

---

### Task 2: 个股页挂两条语境链接

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`（`<EarningsPowerFloorCard>` ≈486 之后、`<HoldersTable>` ≈499 之后；行号会漂，**按组件符号定位**）

**Interfaces:**
- Consumes: `LearnLink`（Task 1）。
- 页面已有 `lang: Lang` 在作用域内；已 `import { ... localePath } from "@/lib/urls"`、`import type { Lang } from "@/lib/nav"`。

- [ ] **Step 1: 加 import**

在 `page.tsx` 顶部 import 区（紧邻既有 `DiscoveryHandoff` import 附近）加：

```tsx
import { LearnLink } from "@/components/common/LearnLink";
```

- [ ] **Step 2: 估值卡后插链接**

定位渲染 `<EarningsPowerFloorCard ... />` 的收尾处，在其**紧随之后**（同一父容器内、`<DiscoveryHandoff>` 之前）插入：

```tsx
<LearnLink
  lang={lang}
  slug="reading-business-quality"
  label={lang === "zh" ? "什么样的生意算优质" : "What makes a business high quality"}
/>
```

- [ ] **Step 3: 持有人表后插链接**

定位渲染 `<HoldersTable ... />` 之处，在其**紧随之后**插入：

```tsx
<LearnLink
  lang={lang}
  slug="how-to-read-a-13f"
  label={lang === "zh" ? "如何读懂 13F" : "How to read a 13F"}
/>
```

- [ ] **Step 4: 类型门**

Run（`web/` 下）：`npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 5: Commit**

```bash
git add web/src/app/\[lang\]/stocks/\[ticker\]/page.tsx
git commit -m "feat(learn): 个股页估值卡/持有人表旁挂语境链接"
```

---

### Task 3: 投资人页挂一条语境链接

**Files:**
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`（`<HoldingsTable>` ≈506 之后；**按组件符号定位**）

**Interfaces:**
- Consumes: `LearnLink`（Task 1）。
- 页面已有 `lang: Lang` 在作用域内；已 `import { ... localePath } from "@/lib/urls"`。

- [ ] **Step 1: 加 import**

在 `page.tsx` 顶部 import 区加：

```tsx
import { LearnLink } from "@/components/common/LearnLink";
```

- [ ] **Step 2: 持仓表后插链接**

定位渲染 `<HoldingsTable ... />` 之处，在其**紧随之后**（`<DiscoveryHandoff>` 之前）插入：

```tsx
<LearnLink
  lang={lang}
  slug="what-is-a-superinvestor"
  label={lang === "zh" ? "什么是超级投资者" : "What is a superinvestor"}
/>
```

- [ ] **Step 3: 类型门**

Run（`web/` 下）：`npx tsc --noEmit`
Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add web/src/app/\[lang\]/investors/\[slug\]/page.tsx
git commit -m "feat(learn): 投资人页持仓表旁挂语境链接"
```

---

## 验收（部署后）

1. `npx tsc --noEmit` 全程零错（每 Task 已含）。
2. view-source 三页各含对应链接，英文页为**裸**前缀：
   - `/stocks/<ticker>` → `href="/learn/reading-business-quality"` 与 `href="/learn/how-to-read-a-13f"`
   - `/investors/<slug>` → `href="/learn/what-is-a-superinvestor"`
   - 中文页对应 `/zh/learn/...`。
3. 人工 dark/light：mono 11px muted→accent hover、`→` 尾随、贴所属区块之下、不抢 `DiscoveryHandoff` 戏。

## Self-Review

- **Spec 覆盖**：§三固定映射→Task 2/3 三条链接全覆盖；§四组件→Task 1；§五锚点→Task 2/3 按符号定位；§六合规（纯教育、无混排、`--tt-*`、`localePath`）→Global Constraints + 各 Task；§七降级（静态无守卫）→无额外代码，符合；§八测试→各 Task tsc 门 + 验收段。无遗漏。
- **占位扫描**：无 TBD/TODO；每步含实际代码或实际命令。
- **类型一致**：`LearnLink({ lang, slug, label })` 签名在 Task 1 定义，Task 2/3 调用完全一致（`lang`/`slug`/`label` 三 props）。
