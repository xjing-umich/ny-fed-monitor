# macro 贴现率桥（双向）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用"10 年期美债贴现率"这条真实关系接双向语义桥——估值卡 DGS10 锚 → macro 利率视图，macro 页 → screener——让 macro 脱离孤岛。

**Architecture:** 纯 RSC、零客户端逻辑。方向 1 是估值卡 provenance 段内加一条守卫渲染的 `next/link`；方向 2 是新建小展示组件 `ValuationBridgeCta` 挂到 macro overview 页。所有站内 URL 走 `localePath` 单一真相源。无数据集成、不改估值计算、不碰 macro 管线。

**Tech Stack:** Next.js App Router（RSC）、TypeScript、Tailwind（仅 `--tt-*`）。验证用 `npx tsc --noEmit` + curl view-source（**不用 `next build`**——本机 google fonts 被墙必失败）。

## Global Constraints

- **URL 必走 `localePath(lang, path)`**（`@/lib/urls`）：i18n hide-default-locale 迁移已合并（PR #132/#133），**en 裸前缀 / zh 加 `/zh`**。硬编码 `/${lang}/...` 已作废（英文会 301，破坏 canonical）。`localePath` 支持带 query（`localePath(lang, "/macro?view=macro-pricing")`）。
- 估值哲学红线：文案只陈述事实/教育（利率是贴现率地基），无 buy/sell/目标价/评级。
- 文案禁中英混排：每 locale 纯单语言。
- 设计语言：仅 `--tt-*` token；mono eyebrow/链接 + `→`；`rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)]` 面板；纯 RSC 无 `"use client"`。
- 诚实：估值卡侧仅当有真锚（`oeDcf.discount.dgs10_value` 非空）才渲染链接；兜底 9–11% 带时不渲染。
- 优雅降级：任一读取缺失不影响页面。
- 工作目录：命令在 `web/` 下；分支 `plan/macro-discount-bridge`（基最新 `db-foundation`）。
- 本仓 Next.js 有破坏性改动：动 Next API 前读 `node_modules/next/dist/docs/`（本计划仅用 `next/link` 标准用法 + 组件 props）。

---

### Task A: 方向 1 — 估值卡 DGS10 贴现锚 → macro

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`（加 `next/link` + `localePath` import + provenance 段守卫链接）

**Interfaces:**
- Consumes: 组件既有 `lang: Lang`、`oeDcf?: OeDcfAssessment`（`oeDcf.discount.dgs10_value?: number` / `dgs10_date?: string`）、文件内 `pct1`（`EarningsPowerFloorCard.tsx:28`）、`zh`（= `lang === "zh"`）；`localePath`（`@/lib/urls`）。
- Produces: 无（纯 UI 追加）。

- [ ] **Step 1: 加 import**

在 `web/src/components/valuation/EarningsPowerFloorCard.tsx` 顶部 import 区加：
```ts
import Link from "next/link";
import { localePath } from "@/lib/urls";
```

- [ ] **Step 2: provenance 段加守卫链接**

在 provenance `<div>` 内、`{oeDcf?.assessable ? (...) : null}`（"所有者盈利 DCF：增长 g₁ …" 那个 `<p>` 块，约 458–464 行）之后、`{floor.high_leverage_note ? … }`（约 467 行）之前，插入：
```tsx
        {oeDcf?.discount?.dgs10_value != null ? (
          <p>
            <Link
              href={localePath(lang, "/macro?view=macro-pricing")}
              className="font-mono text-[11px] text-[var(--tt-muted)] no-underline hover:text-[var(--tt-accent)]"
            >
              {zh ? "贴现锚 · 10Y 美债 " : "Discount anchor · 10Y Treasury "}
              {pct1(oeDcf.discount.dgs10_value)}
              {oeDcf.discount.dgs10_date ? ` @ ${oeDcf.discount.dgs10_date}` : ""}
              {zh ? " — 看利率走势 →" : " — see rate trend →"}
            </Link>
          </p>
        ) : null}
```

> 定位靠符号不靠行号（卡片此期加了 net-net，行号会漂）：找 provenance `<div>` 里那段脚注 `<p>` 序列，插在"Owner-earnings DCF: growth g₁…"块与 `high_leverage_note` 之间。`pct1` 是文件内既有工具（DGS10 已用它显示，`:365`/`:435`）；`zh` = `lang === "zh"`，若局部不可见则内联 `lang === "zh" ?`。

- [ ] **Step 3: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出（exit 0）

- [ ] **Step 4: 提交**

```bash
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): 估值卡 DGS10 贴现锚链到 macro 利率视图(有真锚才渲染, 走 localePath)"
```

---

### Task B: 方向 2 — macro → screener（新组件 + 挂载）

**Files:**
- Create: `web/src/components/macro/ValuationBridgeCta.tsx`
- Modify: `web/src/app/[lang]/macro/page.tsx`（import + 挂载在 `MacroViewModules` featured 块之后、Market Summary `<section>` 之前）

**Interfaces:**
- Consumes: `Lang`（`@/lib/nav`）、`localePath`（`@/lib/urls`）。
- Produces: `function ValuationBridgeCta({ lang }: { lang: Lang }): JSX.Element`。

- [ ] **Step 1: 建组件**

`web/src/components/macro/ValuationBridgeCta.tsx`：
```tsx
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { localePath } from "@/lib/urls";

// macro→核心 语义桥: 10Y 美债利率是估值引擎的贴现率地基, 引 macro 读者去 screener。
// 纯 RSC 展示 + 静态链接; 只陈述事实(利率↔估值), 无买卖建议。
const COPY = {
  zh: {
    eyebrow: "利率 × 估值",
    body: "10 年期美债利率是我们给每只股票估值时用的贴现率地基。",
    cta: "看看现在哪些股票相对保守价值带便宜 →",
  },
  en: {
    eyebrow: "Rates × valuation",
    body: "The 10-year Treasury yield is the discount-rate floor we use to value every stock.",
    cta: "See which stocks are cheap against a conservative value band →",
  },
} as const;

export function ValuationBridgeCta({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  return (
    <section className="mt-6 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{c.eyebrow}</p>
      <p className="mt-2 text-sm text-[var(--tt-text)]">{c.body}</p>
      <Link
        href={localePath(lang, "/stocks/screener")}
        className="group mt-3 inline-flex items-center gap-1 font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-accent)]"
      >
        {c.cta}
      </Link>
    </section>
  );
}
```

- [ ] **Step 2: macro 页 import + 挂载**

在 `web/src/app/[lang]/macro/page.tsx` import 区加：
```ts
import { ValuationBridgeCta } from "@/components/macro/ValuationBridgeCta";
```

在包裹 featured `<MacroViewModules lang={lang} data={data} placement="featured" />` 的 `</React.Suspense>` 之后、紧接的 Market Summary `<section>`（内含 `SectionKicker` "市场摘要"/"Market Summary"）之前，插入：
```tsx
      <ValuationBridgeCta lang={lang} />
```

> 定位靠符号（`placement="featured"` 后、`SectionKicker` "Market Summary" 前），不信行号。

- [ ] **Step 3: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出（exit 0）

- [ ] **Step 4: 提交**

```bash
git add web/src/components/macro/ValuationBridgeCta.tsx "web/src/app/[lang]/macro/page.tsx"
git commit -m "feat(macro): ValuationBridgeCta——利率↔估值桥, macro 页引向 screener(走 localePath)"
```

---

## 最终验证（两任务后）

- [ ] `cd web && npx tsc --noEmit` → exit 0
- [ ] curl view-source（dev 或部署）——注意英文是**裸前缀**：
  - 有真 DGS10 锚的个股页（如 `/stocks/AAPL`）→ HTML 含 `/macro?view=macro-pricing` 链接；薄数据/兜底带票 → 不含该链接。
  - `/macro` → HTML 含 `/stocks/screener` 链接。
  - 中文对照：`/zh/stocks/AAPL` 出 `/zh/macro?view=macro-pricing`；`/zh/macro` 出 `/zh/stocks/screener`。
- [ ] 人工 QA：dark/light + 390/768/1280；文案纯单语言、无买卖措辞；两链接点击正常跳转（英文不出现 `/en` 前缀、不发生 301）。

## Self-Review 结论

- **Spec 覆盖**：方向 1（估值卡→macro，含 `dgs10_value` 空守卫）=Task A；方向 2（macro→screener）=Task B；`localePath` 硬约束贯穿两任务；合规文案=具体 copy；设计语言=mono/rounded-md/`--tt-*`；降级=A 守卫 + B 纯静态。无遗漏。
- **占位符**：无。每步给完整代码 + 符号定位。
- **类型一致**：`ValuationBridgeCta({ lang: Lang })`、`oeDcf.discount.dgs10_value`（`DiscountBandProvenance`）、`localePath(lang, path)` 与最新 db-foundation 代码一致；`COPY` 按 `Lang` 键取。
- **对齐最新代码**：URL 全走 `localePath`（i18n 迁移后唯一正确写法，已合并的 `discoveryHandoff.ts` 即此写法）；卡片锚点/ macro 挂载点均按符号定位（卡片加了 net-net、行号已漂）。
