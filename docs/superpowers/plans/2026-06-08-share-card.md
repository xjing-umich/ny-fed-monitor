# 分享卡 / Share Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给投资人页与三张聚合页（consensus/buys/sells）加一个高可用、可复用的分享入口（native share / 复制链接 / X / Telegram）+ 确定性双语预填文案 + Vercel Analytics 打点。

**Architecture:** 哑展示组件 `ShareButton`（client，只吃 `{url,text,labels,meta}`，零业务知识）+ 两个纯函数模块（`shareText` 拼文案、`intents` 拼分享意图 URL）。页面（server component）算好绝对 canonical URL 与确定性文案，把成品字符串传给 `ShareButton`。能力降级链：`navigator.share` → clipboard → `execCommand` → 选中文本，保证任何环境可用；`track()` fire-and-forget，永不阻断分享。

**Tech Stack:** Next.js App Router（定制版）、TypeScript、Tailwind（`--tt-*` 主题变量）、`@vercel/analytics`（`track`）。

**本项目约定：不写测试套件**（见记忆 no-tests-solo-dev）。每个任务用 `npx tsc --noEmit` 类型检查 + 必要时人工看页面，再 commit。所有命令在 `web/` 目录下运行。分支 `feat/share-card`（worktree `.claude/worktrees/share-card`，基于 origin/db-foundation）。

---

### Task 1: 纯函数 — 分享意图 URL

**Files:**
- Create: `web/src/lib/share/intents.ts`

- [ ] **Step 1: 写 `intents.ts`**

```typescript
// 纯函数：拼 X / Telegram 的分享意图链接。URLSearchParams 负责编码。
export function xIntentUrl(text: string, url: string): string {
  const q = new URLSearchParams({ text, url });
  return `https://twitter.com/intent/tweet?${q.toString()}`;
}

export function telegramIntentUrl(text: string, url: string): string {
  const q = new URLSearchParams({ url, text });
  return `https://t.me/share/url?${q.toString()}`;
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无新增报错（PASS）。

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/share/intents.ts
git commit -m "feat(share): X/Telegram 分享意图 URL 纯函数"
```

---

### Task 2: 绝对 URL helper + 确定性文案纯函数

**Files:**
- Modify: `web/src/lib/urls.ts`（追加 `SITE_ORIGIN` 与 `absoluteUrl`）
- Create: `web/src/lib/share/shareText.ts`

- [ ] **Step 1: 在 `urls.ts` 顶部 import 之后追加常量与 helper**

在 `web/src/lib/urls.ts` 中，找到现有的：

```typescript
export const macroPath = (lang: Lang, indicator: string) => `/${lang}/macro/${indicator}`;
```

在该行**之后**插入：

```typescript

// 站点 canonical 源（与 layout.tsx metadataBase 一致）。分享/外链需绝对地址。
export const SITE_ORIGIN = "https://thecompounder.fyi";
export const absoluteUrl = (path: string) => `${SITE_ORIGIN}${path}`;
```

- [ ] **Step 2: 写 `shareText.ts`**

```typescript
import type { Lang } from "@/lib/nav";

// 分享文案输入：按页面类型区分（discriminated union）。槽位全部来自页面已查询的确定性数据。
export type ShareInput =
  | { kind: "investor"; managerName: string; topHolding: string | null; addedName: string | null }
  | { kind: "consensus"; topName: string | null; holderCount: number | null; managerCount: number }
  | { kind: "buys"; topName: string | null; count: number | null }
  | { kind: "sells"; topName: string | null; count: number | null };

const VIA = "via @thecompounder";

/**
 * 拼确定性、双语、零推荐措辞的分享文案。
 * 任一关键槽位缺失 → 退化为 `${fallbackTitle} ${VIA}`，绝不拼数据断言。
 */
export function buildShareText(input: ShareInput, lang: Lang, fallbackTitle: string): string {
  const fallback = `${fallbackTitle} ${VIA}`;
  switch (input.kind) {
    case "investor": {
      if (!input.topHolding) return fallback;
      const added = input.addedName
        ? lang === "zh"
          ? `，本季新增 ${input.addedName}`
          : `, added ${input.addedName} this quarter`
        : "";
      return lang === "zh"
        ? `${input.managerName} 最新 13F：第一大持仓 ${input.topHolding}${added}。${VIA}`
        : `${input.managerName}'s latest 13F — top holding ${input.topHolding}${added}. ${VIA}`;
    }
    case "consensus": {
      if (!input.topName || input.holderCount == null) return fallback;
      return lang === "zh"
        ? `本季 ${input.topName} 被 ${input.holderCount} 位顶级投资者同时持有，居共识首位。${VIA}`
        : `${input.topName} is held by ${input.holderCount} top investors this quarter — the #1 consensus pick. ${VIA}`;
    }
    case "buys": {
      if (!input.topName || input.count == null) return fallback;
      return lang === "zh"
        ? `本季 ${input.topName} 获最多顶级投资者买入（${input.count} 位）。${VIA}`
        : `${input.topName} drew the most buying from top investors this quarter (${input.count}). ${VIA}`;
    }
    case "sells": {
      if (!input.topName || input.count == null) return fallback;
      return lang === "zh"
        ? `本季 ${input.topName} 遭最多顶级投资者减持（${input.count} 位）。${VIA}`
        : `${input.topName} saw the most selling from top investors this quarter (${input.count}). ${VIA}`;
    }
  }
}

export type ShareLabels = { button: string; copy: string; copied: string; x: string; telegram: string };

// 分享按钮的双语 UI 文案（与业务数据无关，集中一处避免各页重复）。
export function shareLabels(lang: Lang): ShareLabels {
  return lang === "zh"
    ? { button: "分享", copy: "复制链接", copied: "已复制 ✓", x: "分享到 X", telegram: "分享到 Telegram" }
    : { button: "Share", copy: "Copy link", copied: "Copied ✓", x: "Share on X", telegram: "Share on Telegram" };
}
```

- [ ] **Step 3: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/urls.ts web/src/lib/share/shareText.ts
git commit -m "feat(share): 绝对URL helper + 确定性双语分享文案纯函数"
```

---

### Task 3: ShareButton 哑组件（client）

**Files:**
- Create: `web/src/components/share/ShareButton.tsx`

说明：不依赖图标库（lucide 版本不确定），纯文本按钮。能力检测只在事件 handler 内进行（render 期绝不读 `navigator` → 无 hydration 不一致）。

- [ ] **Step 1: 写 `ShareButton.tsx`**

```tsx
"use client";

import React from "react";
import { track } from "@vercel/analytics";
import { xIntentUrl, telegramIntentUrl } from "@/lib/share/intents";
import type { ShareLabels } from "@/lib/share/shareText";

const DEFAULT_LABELS: ShareLabels = {
  button: "Share",
  copy: "Copy link",
  copied: "Copied ✓",
  x: "Share on X",
  telegram: "Share on Telegram",
};

export function ShareButton({
  url,
  text,
  labels,
  meta,
}: {
  url: string;
  text: string;
  labels?: Partial<ShareLabels>;
  /** 不透明键值，原样并入 track payload（保持组件无业务知识）。如 { entity, entityType, lang } */
  meta?: Record<string, string>;
}): React.ReactElement {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // 打点：fire-and-forget，被 adblock 拦截/抛错绝不阻断分享。
  const fire = (event: string, method?: string) => {
    try {
      track(event, { ...(meta ?? {}), ...(method ? { method } : {}) });
    } catch {
      /* analytics blocked — ignore */
    }
  };

  const closeMenu = React.useCallback(() => setOpen(false), []);

  // 桌面菜单：点击外部 + Esc 关闭
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeMenu]);

  const flashCopied = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = async () => {
    fire("share_click", "copy");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        legacyCopy(url);
      }
      fire("copy_link");
      flashCopied();
    } catch {
      legacyCopy(url);
      flashCopied();
    }
    closeMenu();
  };

  const onMainClick = async () => {
    // 能力检测在此（handler 内），不在 render，避免 SSR/CSR 标记不一致
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      fire("share_click", "native");
      try {
        await navigator.share({ text, url });
      } catch (err) {
        // 用户取消 → 非错误；其他错误 → 退回桌面菜单
        if ((err as Error)?.name !== "AbortError") setOpen(true);
      }
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={onMainClick}
        aria-label={t.button}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--tt-border)] px-3 py-1.5 text-xs font-medium text-[var(--tt-muted)] transition-colors hover:bg-[var(--tt-panel)] hover:text-[var(--tt-text)]"
      >
        {t.button}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-lg border border-[var(--tt-border)] bg-[var(--tt-surface)] py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={copyLink}
            className="block w-full px-3 py-2 text-left text-sm text-[var(--tt-text)] hover:bg-[var(--tt-panel)]"
          >
            {copied ? t.copied : t.copy}
          </button>
          <a
            role="menuitem"
            href={xIntentUrl(text, url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              fire("share_click", "x");
              closeMenu();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-[var(--tt-text)] hover:bg-[var(--tt-panel)]"
          >
            {t.x}
          </a>
          <a
            role="menuitem"
            href={telegramIntentUrl(text, url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              fire("share_click", "telegram");
              closeMenu();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-[var(--tt-text)] hover:bg-[var(--tt-panel)]"
          >
            {t.telegram}
          </a>
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {copied ? t.copied : ""}
      </span>
    </div>
  );
}

// 兜底复制：clipboard API 不可用（非安全上下文/老浏览器）时用隐藏 textarea + execCommand。
function legacyCopy(value: string): void {
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* 最后兜底：保留选中，用户手动复制 */
  }
  document.body.removeChild(ta);
}
```

- [ ] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add web/src/components/share/ShareButton.tsx
git commit -m "feat(share): ShareButton 哑组件(能力降级链+aria-live+打点容错)"
```

---

### Task 4: EntityPage 增 headerAction 槽 + 装配投资人页

**Files:**
- Modify: `web/src/components/entity/EntityPage.tsx`
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`

- [ ] **Step 1: EntityPage 增 `headerAction` prop**

在 `EntityPageProps` 类型中，找到：

```typescript
  /** Optional compliance/disclaimer line shown under the subtitle. */
  disclaimer?: string;
};
```

改为：

```typescript
  /** Optional compliance/disclaimer line shown under the subtitle. */
  disclaimer?: string;
  /** 可选：标题行右侧操作（如分享按钮）。 */
  headerAction?: React.ReactNode;
};
```

- [ ] **Step 2: 解构与渲染 headerAction**

在函数签名解构里，找到：

```typescript
  children,
  sources,
  related,
  disclaimer,
}: EntityPageProps): React.ReactElement {
```

改为：

```typescript
  children,
  sources,
  related,
  disclaimer,
  headerAction,
}: EntityPageProps): React.ReactElement {
```

然后在 masthead 标题行，找到：

```tsx
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="font-display text-3xl sm:text-4xl font-medium leading-[1.1] tracking-tight text-foreground">
            {title}
          </h1>
          {verdict && <VerdictChip label={verdict.label} tone={verdict.tone} />}
        </div>
```

改为：

```tsx
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="font-display text-3xl sm:text-4xl font-medium leading-[1.1] tracking-tight text-foreground">
            {title}
          </h1>
          {verdict && <VerdictChip label={verdict.label} tone={verdict.tone} />}
          {headerAction && <div className="ml-auto self-center">{headerAction}</div>}
        </div>
```

- [ ] **Step 3: 投资人页 import**

在 `web/src/app/[lang]/investors/[slug]/page.tsx` 顶部 import 区，找到现有：

```typescript
import { investorPath } from "@/lib/urls";
```

（若该 import 写法不同，定位到 `@/lib/urls` 的 import 行）改为：

```typescript
import { investorPath, absoluteUrl } from "@/lib/urls";
import { ShareButton } from "@/components/share/ShareButton";
import { buildShareText, shareLabels } from "@/lib/share/shareText";
```

- [ ] **Step 4: 投资人页算分享数据**

在组件内，找到（约第 256 行）：

```typescript
  // Key facts
  const topHolding =
    latest.holdings.length > 0
      ? [...latest.holdings].sort((a, b) => b.value - a.value)[0].issuer
      : "—";
```

在这段**之后**插入：

```typescript
  // 分享文案数据（确定性，缺失走退化）
  const shareTopHolding =
    latest.holdings.length > 0
      ? [...latest.holdings].sort((a, b) => b.value - a.value)[0].issuer
      : null;
  const shareAddedName = changes.find((c) => c.kind === "new")?.issuer ?? null;
  const shareUrl = absoluteUrl(investorPath(lang, slug));
  const shareText = buildShareText(
    { kind: "investor", managerName: manager.person, topHolding: shareTopHolding, addedName: shareAddedName },
    lang,
    manager.person,
  );
```

- [ ] **Step 5: 把 ShareButton 传给 EntityPage**

找到：

```tsx
      <EntityPage
        lang={lang}
        title={manager.person}
        subtitle={subtitle}
        verdict={verdict}
        keyFacts={keyFacts}
```

改为：

```tsx
      <EntityPage
        lang={lang}
        title={manager.person}
        subtitle={subtitle}
        verdict={verdict}
        keyFacts={keyFacts}
        headerAction={
          <ShareButton
            url={shareUrl}
            text={shareText}
            labels={shareLabels(lang)}
            meta={{ entity: slug, entityType: "investor", lang }}
          />
        }
```

- [ ] **Step 6: 类型检查 + 本地看页面**

Run: `npx tsc --noEmit`
Expected: PASS。

Run: `npm run dev`，浏览器打开 `http://localhost:3000/zh/investors/warren-buffett`
Expected: 标题行右侧出现「分享」按钮；桌面点击弹出含「复制链接 / 分享到 X / 分享到 Telegram」的菜单；点复制出现「已复制 ✓」；点 X 新开预填推文窗口。控制台无 hydration 警告。

- [ ] **Step 7: Commit**

```bash
git add web/src/components/entity/EntityPage.tsx "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(share): 投资人页接入分享按钮(EntityPage headerAction 槽)"
```

---

### Task 5: 装配共识页

**Files:**
- Modify: `web/src/app/[lang]/investors/consensus/page.tsx`

- [ ] **Step 1: import**

顶部找到：

```typescript
import { stockPath } from "@/lib/urls";
```

改为：

```typescript
import { stockPath, absoluteUrl } from "@/lib/urls";
import { ShareButton } from "@/components/share/ShareButton";
import { buildShareText, shareLabels } from "@/lib/share/shareText";
```

- [ ] **Step 2: 算分享数据**

找到：

```typescript
  const blurbRows: BlurbRow[] = rankRows.map((r) => ({ ticker: r.ticker, issuer: r.issuer, primary: r.primary, delta: r.delta }));
```

在其**之后**插入：

```typescript
  const top = rankRows[0];
  const shareUrl = absoluteUrl(`/${lang}/investors/consensus`);
  const shareText = buildShareText(
    { kind: "consensus", topName: top?.issuer ?? null, holderCount: top?.primary ?? null, managerCount },
    lang,
    isZh ? "共识持仓" : "Consensus holdings",
  );
```

- [ ] **Step 3: 在标题区放分享按钮**

找到 header 块：

```tsx
        <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
          <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">
            {isZh ? "共识持仓" : "Consensus holdings"}
          </h1>
          <p className="mt-2 text-sm text-[var(--tt-muted)]">
            {isZh ? "最多超级投资者同时持有的股票，按持有人数排列。" : "Stocks held by the most superinvestors, ranked by holder count."}
          </p>
          <div className="mt-3"><DataAsOfBadge lang={lang} /></div>
        </div>
```

改为（标题与按钮同排，两端对齐）：

```tsx
        <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">
              {isZh ? "共识持仓" : "Consensus holdings"}
            </h1>
            <div className="shrink-0 pt-1">
              <ShareButton
                url={shareUrl}
                text={shareText}
                labels={shareLabels(lang)}
                meta={{ entity: "consensus", entityType: "consensus", lang }}
              />
            </div>
          </div>
          <p className="mt-2 text-sm text-[var(--tt-muted)]">
            {isZh ? "最多超级投资者同时持有的股票，按持有人数排列。" : "Stocks held by the most superinvestors, ranked by holder count."}
          </p>
          <div className="mt-3"><DataAsOfBadge lang={lang} /></div>
        </div>
```

- [ ] **Step 4: 类型检查 + 看页面**

Run: `npx tsc --noEmit`
Expected: PASS。
浏览器看 `http://localhost:3000/zh/investors/consensus`：标题右侧有分享按钮，文案形如「本季 {公司} 被 {N} 位顶级投资者同时持有…」。

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/[lang]/investors/consensus/page.tsx"
git commit -m "feat(share): 共识页接入分享按钮"
```

---

### Task 6: 装配买/卖页（共用 _movesPage）

**Files:**
- Modify: `web/src/app/[lang]/investors/_movesPage.tsx`

（注：buys/sells 两页都渲染 `MovesPage`，改这一个文件即覆盖两页。`_movesPage.tsx` 与 consensus 同级目录，确认实际路径，可能为 `web/src/app/[lang]/investors/_movesPage.tsx`。）

- [ ] **Step 1: import**

顶部找到：

```typescript
import { stockPath } from "@/lib/urls";
```

改为：

```typescript
import { stockPath, absoluteUrl } from "@/lib/urls";
import { ShareButton } from "@/components/share/ShareButton";
import { buildShareText, shareLabels } from "@/lib/share/shareText";
```

- [ ] **Step 2: 算分享数据**

找到：

```typescript
  const heading = side === "buy" ? (isZh ? "本季最多人买" : "Top buys") : (isZh ? "本季最多人卖" : "Top sells");
```

在其**之后**插入：

```typescript
  const top = rankRows[0];
  const shareSlug = side === "buy" ? "buys" : "sells";
  const shareUrl = absoluteUrl(`/${lang}/investors/${shareSlug}`);
  const shareText = buildShareText(
    side === "buy"
      ? { kind: "buys", topName: top?.issuer ?? null, count: top?.primary ?? null }
      : { kind: "sells", topName: top?.issuer ?? null, count: top?.primary ?? null },
    lang,
    heading,
  );
```

- [ ] **Step 3: 标题区放分享按钮**

找到 header 块：

```tsx
        <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
          <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">{heading}</h1>
          <p className="mt-2 text-sm text-[var(--tt-muted)]">{sub}</p>
          <div className="mt-3"><DataAsOfBadge lang={lang} /></div>
        </div>
```

改为：

```tsx
        <div className="mb-6 border-b border-[var(--tt-border)] pb-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-display text-3xl font-medium tracking-tight text-[var(--tt-text)] sm:text-4xl">{heading}</h1>
            <div className="shrink-0 pt-1">
              <ShareButton
                url={shareUrl}
                text={shareText}
                labels={shareLabels(lang)}
                meta={{ entity: shareSlug, entityType: shareSlug, lang }}
              />
            </div>
          </div>
          <p className="mt-2 text-sm text-[var(--tt-muted)]">{sub}</p>
          <div className="mt-3"><DataAsOfBadge lang={lang} /></div>
        </div>
```

- [ ] **Step 4: 类型检查 + 看页面**

Run: `npx tsc --noEmit`
Expected: PASS。
浏览器看 `http://localhost:3000/zh/investors/buys` 与 `/zh/investors/sells`：标题右侧均有分享按钮，文案分别为「获最多…买入」「遭最多…减持」。

- [ ] **Step 5: Commit**

```bash
git add "web/src/app/[lang]/investors/_movesPage.tsx"
git commit -m "feat(share): 买/卖页接入分享按钮"
```

---

### Task 7: 整体验证（build + 多语言/边界人工核查）

**Files:** 无（仅验证）

- [ ] **Step 1: 全量类型检查 + 生产构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 均 PASS，无类型错误、无 build 失败。

- [ ] **Step 2: 英文页核查**

浏览器逐个看：
- `http://localhost:3000/en/investors/warren-buffett`
- `http://localhost:3000/en/investors/consensus`
- `http://localhost:3000/en/investors/buys`
- `http://localhost:3000/en/investors/sells`

Expected：四页均有「Share」按钮；菜单为英文「Copy link / Share on X / Share on Telegram」；文案为英文确定性句、结尾 `via @thecompounder`。

- [ ] **Step 3: 边界核查（退化分支）**

找一个持仓为空 / 无 prior 的投资者页（若存在），或临时确认逻辑：当 `topHolding`/`topName` 为 null 时，分享文案应退化为「页面标题 + via @thecompounder」，不报错、不出现 `null`/`undefined` 字样。

- [ ] **Step 4: 打点核查**

部署到 Vercel 预览（或本地触发后看 Vercel Analytics）后，点击各分享路径，确认 `share_click`（含 `method` = native/copy/x/telegram）与 `copy_link` 事件上报、属性 `entity`/`entityType`/`lang` 正确。
（若仅本地，确认浏览器 Network 有 `/_vercel/insights/event` 请求即可。）

- [ ] **Step 5: 可访问性 + URL 核查**

- 键盘：Tab 到分享按钮可聚焦，Enter 打开菜单，Esc 关闭，点击页面其他处关闭。
- 复制出的链接为带 lang 的绝对地址（如 `https://thecompounder.fyi/zh/investors/warren-buffett`）。
- 把该链接贴到任一支持 unfurl 的工具，确认展开既有 OG 品牌卡。

- [ ] **Step 6: 最终 commit（如有验证期微调）**

```bash
git add -A
git commit -m "chore(share): 验证期收尾(类型/构建/多语言/边界/打点)"
```

---

## 验收对照（spec §7）

1. 四类页面出现分享按钮、降级链生效 → Task 4/5/6 + Task 7 Step 1。
2. clipboard 不可用走 execCommand → Task 3 `legacyCopy`。
3. 取消不报错、复制有 aria-live 提示 → Task 3 `onMainClick`/`flashCopied`。
4. SSR 不读 navigator、无 hydration 警告 → Task 3 设计 + Task 4 Step 6。
5. 文案确定性、双语、无推荐、缺失退化 → Task 2 `buildShareText` + Task 7 Step 3。
6. 分享 URL = 带 lang 的 canonical 绝对地址 → Task 2 `absoluteUrl` + 各装配任务。
7. `share_click`/`copy_link` 属性正确、track 抛错不阻断 → Task 3 `fire()` + Task 7 Step 4。
8. 事件定义已同步 measurement-loop 埋点表 → 已在规划 thread 对齐（`chore/growth-measurement-loop` 分支文档；本仓库 merge 时一并带入）。
9. ShareButton 为哑组件（props 仅 `{url,text,labels?,meta?}`，meta 为不透明键值）→ Task 3。

> 备注：spec §6 原写 props `{url,text,label?}`；实现细化为 `{url,text,labels?,meta?}`——`labels` 为双语 UI 文案、`meta` 为不透明打点键值，二者均与业务数据解耦，组件仍无业务知识，符合"哑组件"原则。
