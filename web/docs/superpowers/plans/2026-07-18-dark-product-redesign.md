# Dark Product Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把全站从浅色"金融编辑部"主题翻转为深色产品级主题（"暗室里的账本"），并在落地页/个股页/投资者页各建立一个"重音时刻"。

**Architecture:** 单一 token 真相（`globals.css`）翻转为深色默认、浅色 opt-in；ui 基元去 shadcn 默认样式；新增 `Display` 与 `Section` 两个原语；页面级改造只动 masthead/hero 层，数据逻辑零改动。

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4 (@theme inline), next-themes, base-ui, CVA.

**Spec:** `docs/superpowers/specs/2026-07-18-dark-product-redesign-design.md`

## Global Constraints

- 数据获取逻辑、RSC 结构、ISR `revalidate` 一律不动；本计划是纯表现层改造。
- 动效白名单只有三种：一次性 reveal（≤0.4s）、hero/投资者摘要各一次 count-up、估值带游标过渡。禁止循环动画/视差/粒子。
- 发光只用于数据（`--glow-*`），禁止装饰性辉光、渐变墙、blur 玻璃墙。
- 用户可见文案遵循 `docs/copy-voice.md`；本计划不改任何文案，只改层级。
- 每任务结束跑 `npm run build` 必须零错误。
- 基础字号 13px 不变；`--tt-*` 旧 token 名称保留，只改映射值。

---

### Task 1: 深色 token 翻转（globals.css）

**Files:**
- Modify: `src/app/globals.css:7-140`（`:root` 与 `.dark` 两个块对调并新增 token）

**Interfaces:**
- Produces: `:root` 深色值；`.light` opt-in 类承载原浅色值；新增 token `--glow-primary`、`--glow-warn`、`--ink-1/2/3`。所有旧 `--tt-*` 名称不变。

- [ ] **Step 1: 重写 `:root` 为深色默认值**

把 `:root`（第 13-81 行）替换为（值来自现 `.dark` 块并微调）：

```css
/* DARK is the default theme — "The Ledger in the Dark": warm ink-green near-black,
   semantic data glow, hairlines. Light theme survives as .light opt-in (usable, not polished). */
:root {
  --background:          #0E1411; /* 墨绿近黑，从品牌绿长出 */
  --foreground:          #EDE7DA;
  --card:                #151B17;
  --card-foreground:     #EDE7DA;
  --popover:             #151B17;
  --popover-foreground:  #EDE7DA;

  --primary:             #4FBF8A; /* lifted money-green */
  --primary-foreground:  #0E1A13;

  --secondary:           #1D2420;
  --secondary-foreground:#DDD5C6;
  --muted:               #1A201C;
  --muted-foreground:    #A89C8A;
  --accent:              #1C2B25;
  --accent-foreground:   #9FE0BE;

  --destructive:         #D9756A;
  --positive:            #4FBF8A;
  --warn:                #D9AF63;

  --border:              #26302A; /* 半透明发丝线的实体等价 */
  --border-strong:       #3A453D;
  --input:               #3A453D;
  --ring:                #4FBF8A;
  --radius:              0.375rem; /* 6px — 深色上更锐利 */

  /* Ink hierarchy — 三级正文层级，替代 muted/faint 的模糊用法 */
  --ink-1:               #EDE7DA; /* 正文 */
  --ink-2:               #A89C8A; /* 辅助 */
  --ink-3:               #6E6656; /* 仅时间戳/来源 */

  /* Data glow — 全站唯一允许的发光，只服务数据 */
  --glow-primary:        0 0 24px rgba(79, 191, 138, 0.35);
  --glow-warn:           0 0 24px rgba(217, 175, 99, 0.30);

  /* Motion */
  --tt-ease: cubic-bezier(0.2, 0.6, 0.2, 1);
  --tt-dur: 0.5s;

  /* Sidebar */
  --sidebar:             #151B17;
  --sidebar-foreground:  #EDE7DA;
  --sidebar-primary:     #4FBF8A;
  --sidebar-primary-foreground: #0E1A13;
  --sidebar-accent:      #1C2B25;
  --sidebar-accent-foreground: #9FE0BE;
  --sidebar-border:      #26302A;
  --sidebar-ring:        #4FBF8A;

  /* Chart palette — 深色底校色 */
  --chart-1: #4FBF8A;
  --chart-2: #D9756A;
  --chart-3: #D9AF63;
  --chart-4: #C9BCA6;
  --chart-5: #BE9468;

  /* Legacy terminal tokens — 名称不变, 映射到深色语义值 */
  --tt-bg:            var(--background);
  --tt-panel:         var(--card);
  --tt-panel-2:       var(--muted);
  --tt-surface:       var(--accent);
  --tt-border:        var(--border);
  --tt-border-strong: var(--border-strong);
  --tt-text:          var(--ink-1);
  --tt-muted:         var(--ink-2);
  --tt-faint:         var(--ink-3);
  --tt-accent:        var(--primary);
  --tt-positive:      var(--positive);
  --tt-negative:      var(--destructive);
  --tt-warn:          var(--warn);
}
```

- [ ] **Step 2: 把 `.dark` 块改为 `.light`，承载原浅色值**

把 `.dark {`（第 84 行）改为 `.light {`，块内值整体替换为原 `:root` 浅色值（`#FAF8F3` 那套，含原 `--tt-faint: #998F82`），并补上：

```css
  --ink-1: #1C1917;
  --ink-2: #6B6157;
  --ink-3: #998F82;
  --glow-primary: none;
  --glow-warn: none;
```

- [ ] **Step 3: 更新 `@custom-variant` 和 base 层**

第 5 行改为同时支持两种覆盖：

```css
@custom-variant dark (&:is(.dark *));
@custom-variant light (&:is(.light *));
```

（`.dark` 类继续由 next-themes 使用；默认 `:root` 已是深色，`.dark` 类存在时值与 `:root` 一致，无害。）

- [ ] **Step 4: 验证构建**

Run: `npm run build`
Expected: 构建成功；浏览器目视全站已变深色。

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): dark-first token flip — ledger in the dark"
```

---

### Task 2: 默认主题切换为 dark

**Files:**
- Modify: `src/app/[lang]/layout.tsx:98-103,155-160`

**Interfaces:**
- Consumes: Task 1 的 token。
- Produces: 首屏即深色，无 FOUC。

- [ ] **Step 1: 修改 ThemeProvider 与 viewport**

`layout.tsx` 中 `defaultTheme="system"` 改为 `defaultTheme="dark"`；viewport 改为：

```ts
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E1411" },
    { media: "(prefers-color-scheme: light)", color: "#0E1411" },
  ],
};
```

- [ ] **Step 2: 验证**

Run: `npm run build`，然后 `npm run dev` 目视确认默认深色、主题切换器仍能切到浅色（`.light` 类）。验证后停掉 dev server。
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "src/app/[lang]/layout.tsx"
git commit -m "feat(theme): default to dark"
```

---

### Task 3: ui 基元去 shadcn 化（card / badge / table / button）

**Files:**
- Modify: `src/components/ui/card.tsx:15`
- Modify: `src/components/ui/badge.tsx:8-27`
- Modify: `src/components/ui/table.tsx`（先读该文件）
- Modify: `src/components/ui/button.tsx:7-41`

**Interfaces:**
- Produces: 全站 card/badge/table/button 呈现"Raycast 面板"质感：发丝线 + 顶部 1px 内发光边缘 + 无 ring/shadow。

- [ ] **Step 1: Card**

`card.tsx` 第 15 行的 className 中：
- `rounded-xl` → `rounded-lg`
- 删除 `ring-1 ring-foreground/10`
- 新增 `border border-[var(--tt-border)] shadow-[inset_0_1px_0_0_rgba(237,231,218,0.06)]`
- 同步把 `CardHeader`/`CardFooter` 里的 `rounded-t-xl`/`rounded-b-xl` 改为 `rounded-t-lg`/`rounded-b-lg`

- [ ] **Step 2: Badge**

`badge.tsx` cva 基础串中 `rounded-4xl` → `rounded-sm`（与 ValuationBadge 的 10px mono 工业风一致）；`default` variant 的 `bg-primary text-primary-foreground` → `border border-[var(--tt-positive)] text-[var(--tt-positive)] bg-[var(--tt-positive)]/10`，与 ValuationBadge 的"已确认便宜"样式同源。

- [ ] **Step 3: Table**

先读 `src/components/ui/table.tsx`。把所有 `border-b`/`border-t` 颜色统一为 `border-[var(--tt-border)]`；表头文字加 `tt-label` 同款样式（11px uppercase mono, `color: var(--ink-2)`）；行 hover 用 `hover:bg-[var(--tt-surface)]`。

- [ ] **Step 4: Button**

`button.tsx` cva 基础串中 `rounded-lg` 保留；`outline` variant 的 `dark:bg-input/30` 等 dark: 前缀类可删（深色已是默认）；`default` 不变（绿底墨字在深色下成立）。

- [ ] **Step 5: 验证**

Run: `npm run build`
Expected: 构建成功；目视卡片无 ring、圆角统一 6px 家族。

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/
git commit -m "feat(ui): de-shadcn primitives — hairline panels, editorial badges"
```

---

### Task 4: 新增 Display 与 Section 原语

**Files:**
- Create: `src/components/common/Display.tsx`
- Create: `src/components/common/Section.tsx`

**Interfaces:**
- Produces:
  - `Display({ as?, size: "xl" | "2xl" | "3xl", glow?: boolean, className?, children })` — 展示级数字/标题。size 映射：`xl`=text-5xl(48px)、`2xl`=text-7xl(72px)、`3xl`=text-8xl(96px)，全部 `tnum`。
  - `Section({ rhythm?: "sm" | "md" | "lg" | "xl", className?, children })` — 间距音阶封装：`sm`=mt-8、`md`=mt-16、`lg`=mt-24、`xl`=mt-32。

- [ ] **Step 1: 写 Display.tsx**

```tsx
import React from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  xl: "text-5xl",
  "2xl": "text-7xl",
  "3xl": "text-8xl",
} as const;

/** 展示级数字/标题 — 全站"重音时刻"的唯一载体。glow 只给数据用。 */
export function Display({
  as: Tag = "div",
  size = "xl",
  glow = false,
  className,
  children,
}: {
  as?: "div" | "span" | "p" | "h1" | "h2";
  size?: keyof typeof SIZES;
  glow?: boolean;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Tag
      className={cn(
        "tnum font-medium leading-none tracking-tight text-[var(--ink-1)]",
        SIZES[size],
        className,
      )}
      style={glow ? { textShadow: "var(--glow-primary)" } : undefined}
    >
      {children}
    </Tag>
  );
}
```

- [ ] **Step 2: 写 Section.tsx**

```tsx
import React from "react";
import { cn } from "@/lib/utils";

const RHYTHM = { sm: "mt-8", md: "mt-16", lg: "mt-24", xl: "mt-32" } as const;

/** 落地页节奏原语 — 替代散落的魔法 margin（mt-28/32/24/20…）。 */
export function Section({
  rhythm = "lg",
  className,
  children,
}: {
  rhythm?: keyof typeof RHYTHM;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return <section className={cn(RHYTHM[rhythm], className)}>{children}</section>;
}
```

- [ ] **Step 3: 验证 + Commit**

Run: `npm run build`
Expected: PASS

```bash
git add src/components/common/Display.tsx src/components/common/Section.tsx
git commit -m "feat(ui): Display + Section primitives"
```

---

### Task 5: 落地页 — hero 大数字 + 节奏音阶

**Files:**
- Modify: `src/components/home/HeroMasthead.tsx:99-132`
- Modify: `src/app/[lang]/page.tsx:120-142`

**Interfaces:**
- Consumes: Task 4 的 `Display`、`Section`。

- [ ] **Step 1: HeroMasthead 重音**

在 `HeroMasthead` 的左栏（brand eyebrow 之后、h1 之前）插入展示数字。`investorCount` prop 已存在：

```tsx
{typeof investorCount === "number" && investorCount > 0 && (
  <Display size="3xl" glow className="mt-6 font-display">
    {investorCount}
  </Display>
)}
```

h1 字号从 `text-4xl sm:text-5xl md:text-6xl` 降为 `text-2xl sm:text-3xl`（让位给数字成为主角）；`headlineMuted` 段（第 112 行）的 `text-[var(--tt-faint)]` 改为 `text-[var(--ink-2)]`。

- [ ] **Step 2: page.tsx 节奏**

`page.tsx` 第 124-142 行的 `mt-28/mt-32/mt-24/mt-20/mt-28` 包装换成 Section 原语：

```tsx
<Section rhythm="xl" className="mx-auto max-w-6xl">
  <StepIndex lang={lang} investors={topManagers.slice(0, 12)} held={heldTop} strike={strike} />
</Section>
<Section rhythm="lg"><FoundationsGrid lang={lang} /></Section>
<Section rhythm="md"><PhilosophyQuote lang={lang} featuredHref={buffettHref} /></Section>
<Section rhythm="md"><LearnTeaser lang={lang} /></Section>
<Section rhythm="xl"><ClosingCTA lang={lang} /></Section>
```

import 处加 `import { Section } from "@/components/common/Section";`

- [ ] **Step 3: 验证 + Commit**

Run: `npm run build`
Expected: PASS；目视 hero 数字为视觉中心。

```bash
git add src/components/home/HeroMasthead.tsx "src/app/[lang]/page.tsx"
git commit -m "feat(home): hero display numeral + rhythm scale"
```

---

### Task 6: DataStrip 发光数据带 + StepIndex 大编号

**Files:**
- Modify: `src/components/common/DataStrip.tsx:24-56`
- Modify: `src/components/home/StepIndex.tsx`（先读，186 行）

- [ ] **Step 1: DataStrip**

Tile 的数字 span（第 27 行）字号 `text-lg` → `text-2xl`，并加 style `{{ textShadow: "var(--glow-primary)" }}`；section 容器（第 55 行）的 `py-1` → `py-2`。

- [ ] **Step 2: StepIndex**

先读文件。把步骤编号（01/02/03 或等效标记）用 `Display size="xl"` 渲染，mono 字重，`color: var(--ink-3)`；卡片容器若有 `rounded-xl`/`shadow` 改为 Task 3 的面板语言（`rounded-lg border border-[var(--tt-border)]`）。

- [ ] **Step 3: 验证 + Commit**

Run: `npm run build`
Expected: PASS

```bash
git add src/components/common/DataStrip.tsx src/components/home/StepIndex.tsx
git commit -m "feat(home): luminous data strip + oversized step numerals"
```

---

### Task 7: 投资者页 — 本季动作摘要时刻

**Files:**
- Modify: `src/app/[lang]/investors/[slug]/page.tsx`（604 行，先读；动作数据应在页面已有的 moves/period 数据中）

**Interfaces:**
- Consumes: Task 4 的 `Display`。

- [ ] **Step 1: 读文件并定位**

读 `page.tsx`，找到顶部 masthead 区与已有的本季 moves 数据（new/increased/exited 计数）。若计数未现成，用页面已加载的数据在渲染前聚出 `added / increased / exited` 三个数（纯 JS reduce，不新增数据请求）。

- [ ] **Step 2: 渲染三数字摘要**

在 masthead 下方插入：

```tsx
<div className="grid grid-cols-3 gap-4 border-y border-[var(--tt-border)] py-6">
  {[
    { label: lang === "zh" ? "新建" : "New", value: added, color: "var(--tt-positive)" },
    { label: lang === "zh" ? "加仓" : "Added", value: increased, color: "var(--ink-1)" },
    { label: lang === "zh" ? "清仓" : "Exited", value: exited, color: "var(--tt-negative)" },
  ].map((s) => (
    <div key={s.label}>
      <p className="tt-label">{s.label}</p>
      <Display size="2xl" className="mt-2" glow={s.label === "新建" || s.label === "New"}>
        <span style={{ color: s.color }}>{s.value}</span>
      </Display>
    </div>
  ))}
</div>
```

- [ ] **Step 3: 验证 + Commit**

Run: `npm run build`
Expected: PASS；抽查 2-3 个投资者页目视。

```bash
git add "src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(investors): quarter-moves display summary"
```

---

### Task 8: 个股页 — 估值带签名渲染

**Files:**
- Modify: `src/app/[lang]/stocks/[ticker]/page.tsx`（先读）
- Modify: `src/components/valuation/EarningsPowerFloorCard.tsx`（632 行，估值带实际渲染处，先读定位 band/track）

- [ ] **Step 1: 读文件定位估值带**

读上述两文件，找到估值带（strike zone / value band）的 track/bar 渲染节点与当前价格标记节点。

- [ ] **Step 2: 签名渲染**

- 当前价格标记：加一个 `box-shadow: var(--glow-primary)` 的游标样式 + `transition: left var(--tt-dur) var(--tt-ease)`（白名单动效③）。
- 估值带 strike-zone 区段：底色用 `var(--tt-positive)` 15% 透明度，边缘 1px `var(--tt-positive)/50`。
- 价格数值用 `Display size="xl"` 呈现（如该页已有大价格则只统一为 Display）。

- [ ] **Step 3: 验证 + Commit**

Run: `npm run build`
Expected: PASS；目视估值带有"仪器刻度盘"感、价格游标发光。

```bash
git add "src/app/[lang]/stocks/[ticker]/page.tsx" src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(stocks): signature valuation-band render with glowing price cursor"
```

---

### Task 9: 墨色层级修复 + 对比度校验

**Files:**
- Modify: 全站 `text-[var(--tt-faint)]` 用于整段正文处（重点：`HeroMasthead.tsx`、`FoundationsGrid.tsx`、`macro/page.tsx`）
- Modify: `docs/copy-voice.md`（checklist 加一条）
- Create: `scripts/check-contrast.ts`

- [ ] **Step 1: 写对比度脚本**

```ts
// scripts/check-contrast.ts — WCAG AA 校验三级墨色 vs 背景
const lum = (hex: string) => {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const bg = "#0E1411";
for (const [name, hex] of [["ink-1", "#EDE7DA"], ["ink-2", "#A89C8A"], ["ink-3", "#6E6656"]] as const) {
  const r = ratio(hex, bg);
  const pass = name === "ink-3" ? r >= 3 : r >= 4.5; // ink-3 仅大字号/辅助图形
  console.log(`${name}: ${r.toFixed(2)}:1 ${pass ? "PASS" : "FAIL"}`);
  if (!pass) process.exitCode = 1;
}
```

Run: `npx tsx scripts/check-contrast.ts`
Expected: ink-1/ink-2 ≥ 4.5 PASS，ink-3 ≥ 3 PASS；FAIL 则调亮该级 hex 并重跑。

- [ ] **Step 2: 正文层级修复**

grep `text-\[var\(--tt-faint\)\]`，凡用于完整句子/段落的改为 `text-[var(--tt-muted)]`（即 ink-2）；`--tt-faint`（ink-3）只保留给时间戳、来源标注、装饰性标签。

- [ ] **Step 3: copy-voice 规则**

`docs/copy-voice.md` 的 checklist 追加一条（中英文各一）：

```markdown
- [ ] 没有任何一整段正文使用 faint/muted 灰度（ink-3 只给时间戳与来源标注）。
- [ ] No full paragraph is set in faint/muted gray (ink-3 is for timestamps and sourcing only).
```

- [ ] **Step 4: 验证 + Commit**

Run: `npm run build && npx tsx scripts/check-contrast.ts`
Expected: 全 PASS

```bash
git add -A
git commit -m "feat(theme): ink hierarchy fix + AA contrast gate"
```

---

### Task 10: macro 遗留面板内联 style 清理

**Files:**
- Modify: `src/components/dashboard/SectionBody.tsx`、`src/components/dashboard/SectionChart.tsx`（先读）

- [ ] **Step 1:** 读两文件，把内联 `style={{ color: ... }}` 中引用的旧值全部确认走 `--tt-*` token（多数已是），删除硬编码 hex（若有）。
- [ ] **Step 2:** mode pill 的 4px radius 改为 `rounded-sm`，与基元一致。
- [ ] **Step 3: 验证 + Commit**

Run: `npm run build`
Expected: PASS

```bash
git add src/components/dashboard/
git commit -m "refactor(macro): fold legacy inline styles into token system"
```

---

### Task 11: 终审

- [ ] **Step 1:** `npm run build && npm run lint` 全绿。
- [ ] **Step 2:** 目视走查清单：无渐变墙 / 无 blur 滥用（仅 drawer/modal scrim）/ 间距全来自 Section 音阶 / 发光只出现在数据上 / 每页恰一个重音时刻。
- [ ] **Step 3:** 抽查 zh 与 en 两个 locale 的落地页、一个个股页、一个投资者页。
- [ ] **Step 4:** 最终 commit 或收拾尾巴。
