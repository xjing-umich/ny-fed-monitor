# Landing 审计修补 + 首屏收紧 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修好首页可点性与文案/元数据缺口，并把 Hero 动向区降为裸列表、品牌 eyebrow 写入主内容。

**Architecture:** 组件级定点修改（不动页面信息架构）。按「可点 → Hero 首屏 → CTA → SEO/GEO」顺序提交，每步可独立验收。

**Tech Stack:** Next.js App Router、现有 `Link` / `stockPath` / `localePath` / `ogFor` / `EntityName`、Tailwind + CSS 变量。

**Spec:** `docs/superpowers/specs/2026-07-11-landing-audit-polish-design.md`

---

## 文件地图

| 操作 | 文件 | 职责 |
|------|------|------|
| Modify | `web/src/components/home/StepIndex.tsx` | Step 02 共识行加 `stockPath` 链接 |
| Modify | `web/src/components/home/HeroMasthead.tsx` | 品牌 eyebrow、副文 N 口径、本季标签、动向去 card |
| Modify | `web/src/components/common/DataStrip.tsx` | 两格整块可点 |
| Modify | `web/src/components/home/ClosingCTA.tsx` | 去掉过强 SEC 承诺副句 |
| Modify | `web/src/app/[lang]/page.tsx` | `ogFor` + `localePath` 导入 |
| Create | `web/public/llms.txt` | 根路径 GEO 说明，避开 `[lang]` |

**不要动：** 动向聚合算法、StrikeLeadersCard 结构、Philosophy/Learn/Foundations 布局、非首页表格。

**测试说明：** 无现成单元测试覆盖这些 UI。用 `rg`、浏览器点击、`curl` 元数据/`llms.txt`、末尾一次 `npx tsc --noEmit`。

---

### Task 1: Step 02 共识表可点

**Files:**
- Modify: `web/src/components/home/StepIndex.tsx`

- [ ] **Step 1: 补导入**

在 `StepIndex.tsx` 把：

```tsx
import { investorPath, localePath } from "@/lib/urls";
```

改为：

```tsx
import { investorPath, localePath, stockPath } from "@/lib/urls";
```

- [ ] **Step 2: 发行人包 Link**

把 Step 02 表格单元格：

```tsx
<td className="py-2.5 pr-3 text-[var(--tt-text)]">
  <EntityName issuer={row.issuer} />
</td>
```

改为：

```tsx
<td className="py-2.5 pr-3">
  <Link
    href={stockPath(lang, row.cusip)}
    className="text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
  >
    <EntityName issuer={row.issuer} ticker={row.cusip} />
  </Link>
</td>
```

说明：`HeldRow.cusip` 在共识路径上已是 tickerize 后的 id（与 Hero moves 一致）。`ticker` 可选；若徽章显得吵可只传 `issuer`。

- [ ] **Step 3: 本地确认**

```bash
rg -n 'stockPath\(lang, row\.cusip\)' web/src/components/home/StepIndex.tsx
```

Expected: 至少 1 处匹配。

浏览器打开 `http://localhost:3000/zh`，点 Step 02 第一行发行人，应进入对应 `/zh/stocks/...`。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/home/StepIndex.tsx
git commit -m "$(cat <<'EOF'
fix(ui): make landing consensus rows link to stocks

Step 02 looked like a ranking but issuers were plain text.
EOF
)"
```

---

### Task 2: Hero — 品牌、文案、动向裸列表

**Files:**
- Modify: `web/src/components/home/HeroMasthead.tsx`

- [ ] **Step 1: 更新 COPY**

在 `COPY.zh` / `COPY.en`：

1. 增加 `brand: "Compounder · 复利"` / `brand: "Compounder"`
2. 将 `live: "实时"` / `"live"` 改为 `quarterTag: "本季"` / `"This quarter"`（同步改 JSX 引用 `c.live` → `c.quarterTag`）
3. 将 `sub` 从字符串改为函数，并在 COPY 内放好无 N 的 fallback（不要把长句散落在 JSX）：

```tsx
zh: {
  // ...
  brand: "Compounder · 复利",
  quarterTag: "本季",
  sub: (n: number) =>
    `聚合本站追踪的 ${n} 位超级投资者的 SEC 13F 季度持仓，按 CUSIP 逐票归并。数据来源 SEC EDGAR。`,
  subFallback:
    "聚合本站追踪的超级投资者 SEC 13F 季度持仓，按 CUSIP 逐票归并。数据来源 SEC EDGAR。",
},
en: {
  // ...
  brand: "Compounder",
  quarterTag: "This quarter",
  sub: (n: number) =>
    `SEC 13F holdings from the ${n} superinvestors we track, aggregated by CUSIP. Source: SEC EDGAR.`,
  subFallback:
    "SEC 13F holdings from the superinvestors we track, aggregated by CUSIP. Source: SEC EDGAR.",
},
```

删除旧的 `live` / 旧 `sub` 字符串字段。
- [ ] **Step 2: 品牌 eyebrow**

在 freshness 行**上方**插入：

```tsx
<p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
  {c.brand}
</p>
```

原 freshness 行加 `mt-2`（或等价间距），避免贴死。

- [ ] **Step 3: 副文绑定 N**

```tsx
<p className="mt-4 max-w-[42ch] text-sm leading-relaxed text-[var(--tt-muted)]">
  {typeof investorCount === "number" && investorCount > 0
    ? c.sub(investorCount)
    : c.subFallback}
</p>
```

- [ ] **Step 4: 动向去 card**

将：

```tsx
<aside className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-4 sm:p-5">
```

改为（裸列表，仅保留底部分隔感）：

```tsx
<aside>
```

标题行可保留 `border-b border-[var(--tt-border-strong)] pb-2`；去掉 panel padding 后，若视觉过紧可加 `md:pl-2` 之类轻微间距，**不要**加回 `bg-[var(--tt-panel)]` / `rounded-md`。

把 `{c.live}` 改为 `{c.quarterTag}`。

- [ ] **Step 5: 校验**

```bash
rg -n '实时|"live"|tt-panel|数百家|hundreds' web/src/components/home/HeroMasthead.tsx
```

Expected: 无「实时」/英文 live 标签、无 `tt-panel`、无「数百家」/hundreds。

浏览器 `/zh`：主内容见品牌 eyebrow；动向无卡片底；标签为「本季」。

- [ ] **Step 6: Commit**

```bash
git add web/src/components/home/HeroMasthead.tsx
git commit -m "$(cat <<'EOF'
fix(ui): tighten landing hero brand, copy, and moves list

Add brand eyebrow, align sub to tracked N, demote moves chrome, drop live label.
EOF
)"
```

---

### Task 3: DataStrip 整格可点

**Files:**
- Modify: `web/src/components/common/DataStrip.tsx`

- [ ] **Step 1: 导入**

```tsx
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { localePath } from "@/lib/urls";
```

- [ ] **Step 2: Tile 支持 href**

将 `Tile` 改为可选 `href`；有 `href` 时用 `Link` 包整块：

```tsx
function Tile({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
}) {
  const inner = (
    <>
      <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--tt-faint)]">{label}</span>
      <span className="font-mono text-lg font-medium tabular-nums leading-none text-[var(--tt-text)] transition-colors group-hover:text-[var(--tt-accent)]">
        {value}
      </span>
      {sub ? <span className="font-mono text-[10px] text-[var(--tt-faint)]">{sub}</span> : null}
    </>
  );
  const className = "group flex flex-col gap-1 px-4 py-3 first:pl-0 no-underline";
  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}
```

- [ ] **Step 3: 传入链接**

```tsx
<Tile
  label={t.consensus}
  value={consensusCount > 0 ? String(consensusCount) : "—"}
  href={localePath(lang, "/investors/consensus")}
/>
<Tile
  label={t.dgs10}
  value={dgs10 ? `${dgs10.value.toFixed(2)}%` : "—"}
  sub={dgs10 ? (lang === "zh" ? `截至 ${dgs10.date}` : `as of ${dgs10.date}`) : undefined}
  href={localePath(lang, "/macro")}
/>
```

- [ ] **Step 4: 校验**

浏览器：点「共识持仓」→ `/zh/investors/consensus`；点「10 年期国债」→ `/zh/macro`。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/common/DataStrip.tsx
git commit -m "$(cat <<'EOF'
fix(ui): link landing DataStrip tiles to consensus and macro

Proof stats should exit to the surfaces they summarize.
EOF
)"
```

---

### Task 4: ClosingCTA 副句

**Files:**
- Modify: `web/src/components/home/ClosingCTA.tsx`

- [ ] **Step 1: 改 COPY.sub**

```tsx
zh: {
  line: "从任意一位投资者、任意一只股票开始。",
  sub: "从投资者名单或个股估值开始。",
  cta: "打开投资者名单",
},
en: {
  line: "Start with any investor, any stock.",
  sub: "Start from the investor list or a single-stock valuation.",
  cta: "Open the investor list",
},
```

- [ ] **Step 2: 校验**

```bash
rg -n '每个数字都能点回|Every number links to the SEC' web/src/components/home/ClosingCTA.tsx
```

Expected: 无匹配。

- [ ] **Step 3: Commit**

```bash
git add web/src/components/home/ClosingCTA.tsx
git commit -m "$(cat <<'EOF'
fix(copy): align landing closing CTA with real exits

Drop overclaim that every number links back to an SEC filing.
EOF
)"
```

---

### Task 5: 首页 OG 本地化

**Files:**
- Modify: `web/src/app/[lang]/page.tsx`

- [ ] **Step 1: 扩展导入**

```tsx
import { altFor, ogFor } from "@/lib/seo";
import { investorPath, localePath } from "@/lib/urls";
```

（若已有 `investorPath` 单独导入，合并进同一行。）

- [ ] **Step 2: generateMetadata 返回值**

在现有 `title` / `description` / `alternates` 上展开 `ogFor`：

```tsx
return {
  title,
  description,
  alternates: altFor(l, ""),
  ...ogFor({
    lang: l,
    title,
    description,
    path: localePath(l, ""),
  }),
};
```

- [ ] **Step 3: 校验**

```bash
curl -s http://localhost:3000/zh | rg -o 'property="og:title" content="[^"]+"|property="og:description" content="[^"]+"|property="og:locale" content="[^"]+"'
```

Expected：`og:title` / `og:description` 为中文（与页面 title/description 一致）；`og:locale` 为 `zh_CN`。

对 `/`（en）再跑一次，应为英文。

- [ ] **Step 4: Commit**

```bash
git add web/src/app/[lang]/page.tsx
git commit -m "$(cat <<'EOF'
fix(seo): localize homepage Open Graph for zh and en

Page title was locale-aware but OG/Twitter still used English layout defaults.
EOF
)"
```

---

### Task 6: 根路径 `llms.txt`

**Files:**
- Create: `web/public/llms.txt`

- [ ] **Step 1: 新建文件**

内容：

```text
# Compounder

Compounder (复利) tracks superinvestor SEC 13F holdings and conservative single-stock valuation bands.

Primary URLs:
- https://thecompounder.fyi/ (en)
- https://thecompounder.fyi/zh (zh-CN)
- https://thecompounder.fyi/investors
- https://thecompounder.fyi/stocks

Data source: SEC EDGAR 13F filings (45-day reporting lag).
Stance: no stock recommendations, no forecasts.
```

必须放在 `web/public/`，**不要**放进 `app/[lang]/`。

- [ ] **Step 2: 校验**

```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3000/llms.txt
curl -s http://localhost:3000/llms.txt | head -5
```

Expected: `200`，正文以 `# Compounder` 开头（不是 HTML 404）。

- [ ] **Step 3: Commit**

```bash
git add web/public/llms.txt
git commit -m "$(cat <<'EOF'
chore(seo): add root llms.txt for AI crawlers

Serve outside [lang] so /llms.txt is not captured as a locale segment.
EOF
)"
```

---

### Task 7: 收尾验收

**Files:** 无新文件（回归检查）

- [ ] **Step 1: 类型检查**

```bash
cd web && npx tsc --noEmit
```

Expected: 退出码 0。

- [ ] **Step 2: 对照 spec 成功标准**

| # | 检查 | 方法 |
|---|------|------|
| 1 | Step 02 可进个股 | 浏览器点击 |
| 2 | 动向无 panel；无「实时」 | 视觉 + `rg` |
| 3 | 主内容有品牌 eyebrow | 视觉 |
| 4 | DataStrip → consensus / macro | 浏览器 |
| 5 | `/zh` OG 中文 | `curl` + `rg` |
| 6 | `/llms.txt` 200 | `curl` |
| 7 | 中英 COPY 都已改 | diff / 扫一眼 en |
| 8 | 桌面 + 窄屏首屏：动向裸列表可读、无横向溢出 | 浏览器 390 宽 + 桌面 |

- [ ] **Step 3: 可选 — 标记 spec 状态**

将 `docs/superpowers/specs/2026-07-11-landing-audit-polish-design.md` 顶部 Status 改为 `Implemented`（若仓库惯例如此），单独 commit：

```bash
git add docs/superpowers/specs/2026-07-11-landing-audit-polish-design.md
git commit -m "docs: mark landing audit polish spec implemented"
```
