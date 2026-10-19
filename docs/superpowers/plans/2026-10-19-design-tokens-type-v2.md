# 设计令牌 v2 + 字阶 v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把全站颜色换成 OKLCH 定义、深浅两套都可用、默认跟随系统的 v2 令牌；把全站字号换成以 15px 正文、12px 下限为核心的 v2 字阶，并把等宽字体收窄到 ticker 等代码类内容。

**Architecture:** 颜色只改 `globals.css`：v2 令牌是唯一真相源，旧的 `--tt-*` 与 shadcn 变量改为指向 v2 的别名，组件零改动。字阶在 `@theme` 中覆盖 Tailwind 默认字号，再用一个纯函数 codemod 机械替换组件里的任意值字号、`font-mono` 和装饰性 `uppercase`。四个 `tsx` 校验脚本守住结果。

**Tech Stack:** Next.js 16.2.6 App Router、React 19、Tailwind CSS 4.3、next-themes 0.4.6、tsx 4（运行 `*.check.ts`），Node 20。

**Spec:** `docs/superpowers/specs/2026-10-19-design-tokens-type-v2-design.md`

## Global Constraints

- 不新增任何 npm 依赖。
- 不新增客户端组件；默认仍是 RSC 零 hydration。
- 颜色一律 OKLCH 书写；每个主题下 spec 2.2 列出的文字/背景配对 ≥ 4.5:1。
- 全站最小字号 12px（`text-xs`），`src` 中不得出现 `text-[NNpx]`。
- `src` 中不得出现 `font-mono`（`components/ui/*`、`**/opengraph-image.tsx`、`src/lib/ogCard.tsx`、`*.check.ts` 除外）；ticker/代码用 `font-code`，数字与标签用 `font-data`。
- `uppercase` 只允许出现在这 5 个暂缓文件：`src/components/common/Badge.tsx`、`src/components/shell/MoveTag.tsx`、`src/components/entity/VerdictChip.tsx`、`src/components/valuation/ValuationBadge.tsx`、`src/components/entity/QuarterMovesPill.tsx`。
- 不改 URL、路由、hreflang、canonical、sitemap、OG 图、JSON-LD、`llms.txt`。
- 不碰 `src/components/ui/*`（零 import 死代码）。
- 文案遵守 `web/docs/copy-voice.md`；每个 locale 内不混排中英。
- 分支：从 `db-foundation` 切 `feat/tokens-type-v2`。**推到 `db-foundation` 会直接触发 Vercel 生产部署**，本计划内只提交到功能分支，不 push、不合并，等用户确认。
- 提交信息结尾加：`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **系统为深色的新访客首屏闪白。** `localStorage` 无 `theme` 且 `prefers-color-scheme: dark` 时，首帧就应是深色；用户点过切换后刷新要保持选择。由 Task 3 Step 5 手测覆盖。
2. **平板宽度横向溢出。** 现网在 768px 已溢出，原因是桌面导航放不下；字号变大会更挤。768px 下列表页与详情页不应出现页面级横向滚动。由 Task 7（导航断点）与 Task 8 Step 2 的控制台脚本覆盖。
3. **依赖 CSS 大写的小写字面量。** 去掉 `uppercase` 后，这类文案会以小写露出。副本实测已发现语言切换器 `zh`/`en`、信号标签 “Core 8q”、趋势行 “last 8q”。Task 5 的 codemod 报告列出每个被去掉大写的元素及其子节点上下文，Task 6 Step 3 逐条复核，Step 6 修文案。
4. **固定高度的元素被撑破。** `leading-none`、`h-*` 的胶囊或按钮在字号从 10/11px 升到 12px 后可能裁字。由 Task 8 Step 3 的裁切检测脚本覆盖。
5. **浅色主题下的胶囊与 `color-mix` 边框可读性。** 胶囊仍用旧别名（第三步才重做），浅色下要可读。由 Task 8 Step 4 的浅色截图核对覆盖。

**已在副本上预演（2026-10-19）。** 方法是把本计划的代码与 CSS 原样抽出，应用到 `web/` 的一份拷贝上。结果：
- 通过：`check:color`、`check:codemod`、`check:tokens`、`check:type`（含 src 扫描）、`tsc`。
- eslint 错误数与原代码相同，都是 42。
- 用 webpack dev server 启动：系统浅色 / 深色下首屏主题正确。

上面第 2、3 条就是这次预演发现的。尚未在真实工作区跑 `npm run build`。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `web/scripts/lib/color.ts` | 新建 | OKLCH→sRGB hex、WCAG 对比度（纯函数） |
| `web/scripts/color.check.ts` | 新建 | `color.ts` 的单元断言 |
| `web/scripts/check-contrast.ts` | 删除 | 旧脚本，写死了已废弃的色值，未接入任何 npm script |
| `web/scripts/design-tokens.check.ts` | 新建 | 解析 `globals.css`，校验 v2 令牌齐全与对比度 |
| `web/src/app/globals.css` | 改写 | v2 令牌、别名层、字阶、工具类 |
| `web/src/app/[lang]/layout.tsx` | 修改 | `defaultTheme="system"`、`viewport.themeColor` |
| `web/src/app/manifest.ts` | 修改 | 浅色底色 |
| `web/scripts/codemods/type-v2.ts` | 新建 | 纯函数 `transformSource` + CLI（dry-run / `--write`） |
| `web/scripts/codemods/type-v2.check.ts` | 新建 | codemod 样例断言 |
| `web/scripts/type-scale.check.ts` | 新建 | 扫描 `globals.css` 与 `src`，守字号下限、`font-mono`、`uppercase` |
| `web/src/components/shell/TopNav.tsx`、`MobileDrawer.tsx` | 修改 | 语言切换器显示 `中文` / `EN`；桌面导航断点 md→lg |
| `web/src/components/shell/AppShell.tsx` | 修改 | 移动头部断点 md→lg |
| `web/src/lib/managers/rowSignals.ts`、`components/entity/HolderTrend.tsx`、`components/shell/SubNav.tsx` | 修改 | 原依赖 CSS 大写的英文文案改为完整写法 |
| `web/package.json` | 修改 | 新增 `check:color` `check:tokens` `check:type` `check:codemod` |
| `web/src/**/*.tsx` | codemod 批改 | 字号、`font-data`/`font-code`、去装饰大写 |

---

### Task 0: 切分支

- [ ] **Step 1: 从 db-foundation 切功能分支**

```bash
cd /Users/junlinzhu/Desktop/TheCompounder/ny-fed-monitor
git status --short   # 预期为空；不为空先问用户
git switch db-foundation && git pull --ff-only
git switch -c feat/tokens-type-v2
```

---

### Task 1: 颜色数学库

**Files:**
- Create: `web/scripts/lib/color.ts`
- Create: `web/scripts/color.check.ts`
- Delete: `web/scripts/check-contrast.ts`
- Modify: `web/package.json`（scripts）

**Interfaces:**
- Produces:
  - `parseOklch(value: string): [number, number, number] | null`，接受 `oklch(L C H)`，L 为 0–1 小数。
  - `oklchToHex(L: number, C: number, H: number): string`，返回小写 `#rrggbb`，超色域时逐通道截断。
  - `contrastRatio(hexA: string, hexB: string): number`，WCAG 2.x，未取整。

- [ ] **Step 1: 写失败的检查**

`web/scripts/color.check.ts`：

```ts
/**
 * scripts/lib/color.ts 的单元断言。跑法:cd web && npx tsx scripts/color.check.ts
 */
import { contrastRatio, oklchToHex, parseOklch } from "./lib/color";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exit(1); } }

assert(oklchToHex(1, 0, 0) === "#ffffff", `白, got ${oklchToHex(1, 0, 0)}`);
assert(oklchToHex(0, 0, 0) === "#000000", `黑, got ${oklchToHex(0, 0, 0)}`);
// spec 2.2 表中的换算值
assert(oklchToHex(0.47, 0.105, 158) === "#0e6c43", `brand light, got ${oklchToHex(0.47, 0.105, 158)}`);
assert(oklchToHex(0.175, 0.01, 165) === "#0c120f", `canvas dark, got ${oklchToHex(0.175, 0.01, 165)}`);
assert(oklchToHex(0.54, 0.13, 65) === "#a15b00", `val-above light, got ${oklchToHex(0.54, 0.13, 65)}`);

assert(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 1e-9, "黑白 21:1");
assert(Math.abs(contrastRatio("#ffffff", "#000000") - 21) < 1e-9, "顺序无关");
assert(contrastRatio("#777777", "#ffffff").toFixed(2) === "4.48", `#777 on white, got ${contrastRatio("#777777", "#ffffff")}`);

const p = parseOklch("oklch(0.985 0.004 165)");
assert(p !== null && p[0] === 0.985 && p[1] === 0.004 && p[2] === 165, "parse 三元");
assert(JSON.stringify(parseOklch("oklch(1 0 0)")) === "[1,0,0]", "parse 整数");
assert(parseOklch("#ffffff") === null, "非 oklch 返回 null");
assert(parseOklch("var(--canvas)") === null, "var() 返回 null");

console.log("color.check OK");
```

- [ ] **Step 2: 运行确认失败**

Run: `cd web && npx tsx scripts/color.check.ts`
Expected: 报错 `Cannot find module './lib/color'`

- [ ] **Step 3: 实现**

`web/scripts/lib/color.ts`：

```ts
/**
 * 颜色数学(纯函数):OKLCH → sRGB hex,WCAG 2.x 对比度。
 * 供 design-tokens.check.ts 校验 globals.css 的 v2 令牌。公式取自 Björn Ottosson 的 OKLab 定义。
 */

export function parseOklch(value: string): [number, number, number] | null {
  const m = value.trim().match(/^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

export function oklchToHex(L: number, C: number, H: number): string {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const lin = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return "#" + lin
    .map((x) => {
      const c = Math.min(1, Math.max(0, x));
      const g = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      return Math.round(g * 255).toString(16).padStart(2, "0");
    })
    .join("");
}

function relativeLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const [hi, lo] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd web && npx tsx scripts/color.check.ts`
Expected: `color.check OK`

- [ ] **Step 5: 删旧脚本、登记 npm script**

```bash
cd web && git rm scripts/check-contrast.ts
```

在 `web/package.json` 的 `scripts` 中 `"check:revalidate-paths"` 一行之后加入：

```json
    "check:color": "tsx scripts/color.check.ts",
```

Run: `npm run check:color` → `color.check OK`

- [ ] **Step 6: Commit**

```bash
git add web/scripts/lib/color.ts web/scripts/color.check.ts web/package.json
git commit -m "chore(design): OKLCH 与 WCAG 对比度纯函数,替换写死旧色值的 check-contrast

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 令牌 v2 写入 globals.css

**Files:**
- Create: `web/scripts/design-tokens.check.ts`
- Modify: `web/src/app/globals.css:1-203`（令牌区与 `@theme inline`），`globals.css:225-238`（body 规则）
- Modify: `web/package.json`

**Interfaces:**
- Consumes: `parseOklch`、`oklchToHex`、`contrastRatio`（Task 1）
- Produces: CSS 自定义属性 `--canvas --surface --sunk --line --line-strong --ink-1 --ink-2 --ink-3 --brand --brand-soft --on-brand --val-below --val-below-soft --val-within --val-within-soft --val-above --val-above-soft --alert --alert-soft`；Tailwind 颜色工具类 `bg-canvas`、`text-ink-2`、`border-line`、`bg-val-below-soft` 等（由 `--color-*` 生成）。旧名全部保留为别名。

- [ ] **Step 1: 写失败的检查**

`web/scripts/design-tokens.check.ts`：

```ts
/**
 * 守 globals.css 的 v2 令牌:两套主题齐全、以 OKLCH 书写、文字配对 ≥ 4.5:1、发光关闭、无 .light 块。
 * spec: docs/superpowers/specs/2026-10-19-design-tokens-type-v2-design.md §2.2
 * 跑法:cd web && npx tsx scripts/design-tokens.check.ts
 */
import fs from "node:fs";
import path from "node:path";
import { contrastRatio, oklchToHex, parseOklch } from "./lib/color";

const CSS = fs.readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf8");
const failures: string[] = [];

const V2 = [
  "canvas", "surface", "sunk", "line", "line-strong",
  "ink-1", "ink-2", "ink-3",
  "brand", "brand-soft", "on-brand",
  "val-below", "val-below-soft", "val-within", "val-within-soft",
  "val-above", "val-above-soft", "alert", "alert-soft",
] as const;

const PAIRS: Array<[string, string]> = [
  ["ink-1", "canvas"], ["ink-1", "surface"], ["ink-1", "sunk"],
  ["ink-2", "canvas"], ["ink-2", "surface"], ["ink-2", "sunk"],
  ["ink-3", "canvas"], ["ink-3", "surface"], ["ink-3", "sunk"],
  ["brand", "canvas"], ["brand", "surface"], ["brand", "brand-soft"], ["on-brand", "brand"],
  ["val-below", "canvas"], ["val-below", "surface"], ["val-below", "val-below-soft"],
  ["val-within", "canvas"], ["val-within", "surface"], ["val-within", "val-within-soft"],
  ["val-above", "canvas"], ["val-above", "surface"], ["val-above", "val-above-soft"],
  ["alert", "canvas"], ["alert", "surface"], ["alert", "alert-soft"],
  ["ink-1", "brand-soft"], ["ink-2", "brand-soft"],
];

function block(selector: string): string | null {
  const re = new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)^\\}`, "m");
  return CSS.match(re)?.[1] ?? null;
}

function decls(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out.set(m[1], m[2].trim());
  return out;
}

const root = block(":root");
const dark = block(".dark");
if (!root) failures.push("找不到 :root 块");
if (!dark) failures.push("找不到 .dark 块");
if (/^\.light\s*\{/m.test(CSS)) failures.push(".light 块应已删除(:root 即浅色)");

if (root && dark) {
  const themes = { light: decls(root), dark: new Map([...decls(root), ...decls(dark)]) };
  const darkOwn = decls(dark);
  for (const name of V2) if (!darkOwn.has(name)) failures.push(`.dark 缺少 --${name}`);

  for (const [theme, d] of Object.entries(themes)) {
    const hex = new Map<string, string>();
    for (const name of V2) {
      const raw = d.get(name);
      const p = raw ? parseOklch(raw) : null;
      if (!p) { failures.push(`[${theme}] --${name} 缺失或不是 oklch(): ${raw}`); continue; }
      hex.set(name, oklchToHex(...p));
    }
    for (const [fg, bg] of PAIRS) {
      const a = hex.get(fg), b = hex.get(bg);
      if (!a || !b) continue;
      const r = contrastRatio(a, b);
      if (r < 4.5) failures.push(`[${theme}] --${fg} on --${bg} = ${r.toFixed(2)}:1 < 4.5`);
    }
    for (const g of ["glow-primary", "glow-warn"]) {
      if (d.get(g) !== "none") failures.push(`[${theme}] --${g} 应为 none, got ${d.get(g)}`);
    }
  }
}

if (failures.length) { failures.forEach((f) => console.error("FAIL:", f)); process.exit(1); }
console.log("design-tokens.check OK");
```

在 `web/package.json` 的 `scripts` 中 `"check:color"` 之后加入：

```json
    "check:tokens": "tsx scripts/design-tokens.check.ts",
```

- [ ] **Step 2: 运行确认失败**

Run: `cd web && npm run check:tokens`
Expected: 多条 FAIL，至少包含 `.light 块应已删除` 与 `--canvas 缺失或不是 oklch()`。

- [ ] **Step 3: 替换 globals.css 第 1–203 行**

用下面的内容整体替换 `web/src/app/globals.css` 从文件开头到 `@theme inline { … }` 结束（原第 203 行）的全部内容。第 205 行起的 `/* ── Keyframes ── */` 及之后先保留不动。

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

@custom-variant dark (&:is(.dark *));
@custom-variant light (&:is(.light *));

/* Tokens v2 (2026-10-19) — docs/superpowers/specs/2026-10-19-design-tokens-type-v2-design.md
   :root = 浅色,.dark = 深色;默认跟随系统(next-themes defaultTheme="system")。
   v2 令牌是唯一真相源。下方别名层(--tt-* / shadcn 名)只在 :root 定义一次,
   .dark 只覆盖 v2 原值,别名自动跟随。中性色向品牌绿(色相 165)带少量彩度。
   改色后跑 npm run check:tokens(两套主题文字配对 ≥ 4.5:1)。 */
:root {
  /* ── v2 · light ── */
  --canvas:          oklch(0.985 0.004 165);
  --surface:         oklch(1 0 0);
  --sunk:            oklch(0.965 0.006 165);
  --line:            oklch(0.905 0.008 165);
  --line-strong:     oklch(0.84 0.010 165);
  --ink-1:           oklch(0.23 0.018 165);  /* 正文 */
  --ink-2:           oklch(0.43 0.016 165);  /* 辅助 */
  --ink-3:           oklch(0.52 0.014 165);  /* 时间戳 / 来源 */
  --brand:           oklch(0.47 0.105 158);  /* Logo、主按钮、焦点 */
  --brand-soft:      oklch(0.95 0.03 158);
  --on-brand:        oklch(1 0 0);
  --val-below:       oklch(0.52 0.13 152);   /* 估值:低于价值 / 击球区 */
  --val-below-soft:  oklch(0.962 0.03 152);
  --val-within:      oklch(0.50 0.035 250);  /* 估值:价值带内 */
  --val-within-soft: oklch(0.95 0.012 250);
  --val-above:       oklch(0.54 0.13 65);    /* 估值:高于价值 */
  --val-above-soft:  oklch(0.962 0.035 70);
  --alert:           oklch(0.53 0.16 28);    /* 数据异常 / 过期 / 错误 */
  --alert-soft:      oklch(0.95 0.03 28);
  color-scheme: light;

  /* ── 别名层:旧名 → v2(组件迁移完成前保留)── */
  --background:          var(--canvas);
  --foreground:          var(--ink-1);
  --card:                var(--surface);
  --card-foreground:     var(--ink-1);
  --popover:             var(--surface);
  --popover-foreground:  var(--ink-1);
  --primary:             var(--brand);
  --primary-foreground:  var(--on-brand);
  --secondary:           var(--sunk);
  --secondary-foreground:var(--ink-1);
  --muted:               var(--sunk);
  --muted-foreground:    var(--ink-2);
  --accent:              var(--brand-soft);
  --accent-foreground:   var(--brand);
  --destructive:         var(--alert);
  --positive:            var(--brand);
  --warn:                var(--val-above);
  --border:              var(--line);
  --border-strong:       var(--line-strong);
  --input:               var(--line-strong);
  --ring:                var(--brand);
  --radius:              0.375rem;

  --glow-primary:        none; /* v2 关闭发光,变量保留以免消费方失效 */
  --glow-warn:           none;
  --tick-color:          var(--line-strong);

  --sidebar:                    var(--surface);
  --sidebar-foreground:         var(--ink-1);
  --sidebar-primary:            var(--brand);
  --sidebar-primary-foreground: var(--on-brand);
  --sidebar-accent:             var(--brand-soft);
  --sidebar-accent-foreground:  var(--brand);
  --sidebar-border:             var(--line);
  --sidebar-ring:               var(--brand);

  --chart-1: var(--brand);
  --chart-2: var(--alert);
  --chart-3: var(--val-above);
  --chart-4: var(--val-within);
  --chart-5: var(--ink-3);

  --tt-bg:            var(--canvas);
  --tt-panel:         var(--surface);
  --tt-panel-2:       var(--sunk);
  --tt-surface:       var(--sunk); /* 悬停 / 选中改为中性,不再染绿 */
  --tt-border:        var(--line);
  --tt-border-strong: var(--line-strong);
  --tt-text:          var(--ink-1);
  --tt-muted:         var(--ink-2);
  --tt-faint:         var(--ink-3);
  --tt-accent:        var(--brand);
  --tt-positive:      var(--brand);
  --tt-negative:      var(--alert);
  --tt-warn:          var(--val-above);

  /* Motion */
  --tt-ease: cubic-bezier(0.2, 0.6, 0.2, 1);
  --tt-dur: 0.5s;
  --tt-dur-fast: 0.15s;
}

/* ── v2 · dark:只覆盖 v2 原值 ── */
.dark {
  --canvas:          oklch(0.175 0.010 165);
  --surface:         oklch(0.205 0.012 165);
  --sunk:            oklch(0.155 0.009 165);
  --line:            oklch(0.29 0.012 165);
  --line-strong:     oklch(0.36 0.012 165);
  --ink-1:           oklch(0.94 0.008 165);
  --ink-2:           oklch(0.76 0.012 165);
  --ink-3:           oklch(0.66 0.012 165);
  --brand:           oklch(0.76 0.13 158);
  --brand-soft:      oklch(0.27 0.05 158);
  --on-brand:        oklch(0.175 0.010 165);
  --val-below:       oklch(0.76 0.14 152);
  --val-below-soft:  oklch(0.27 0.05 152);
  --val-within:      oklch(0.74 0.04 250);
  --val-within-soft: oklch(0.27 0.02 250);
  --val-above:       oklch(0.80 0.12 75);
  --val-above-soft:  oklch(0.28 0.05 70);
  --alert:           oklch(0.72 0.13 28);
  --alert-soft:      oklch(0.27 0.05 28);
  color-scheme: dark;
}

@theme inline {
  --color-background:    var(--background);
  --color-foreground:    var(--foreground);
  --font-sans:           var(--font-geist-sans);
  --font-mono:           var(--font-geist-mono);
  --font-display:        var(--font-display), "Helvetica Neue", Arial, sans-serif;
  --font-heading:        var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;

  /* v2 语义色工具类(bg-canvas / text-ink-2 / border-line / bg-val-below-soft …) */
  --color-canvas:          var(--canvas);
  --color-surface:         var(--surface);
  --color-sunk:            var(--sunk);
  --color-line:            var(--line);
  --color-line-strong:     var(--line-strong);
  --color-ink-1:           var(--ink-1);
  --color-ink-2:           var(--ink-2);
  --color-ink-3:           var(--ink-3);
  --color-brand:           var(--brand);
  --color-brand-soft:      var(--brand-soft);
  --color-on-brand:        var(--on-brand);
  --color-val-below:       var(--val-below);
  --color-val-below-soft:  var(--val-below-soft);
  --color-val-within:      var(--val-within);
  --color-val-within-soft: var(--val-within-soft);
  --color-val-above:       var(--val-above);
  --color-val-above-soft:  var(--val-above-soft);
  --color-alert:           var(--alert);
  --color-alert-soft:      var(--alert-soft);

  --color-sidebar-ring:              var(--sidebar-ring);
  --color-sidebar-border:            var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent:            var(--sidebar-accent);
  --color-sidebar-primary-foreground:var(--sidebar-primary-foreground);
  --color-sidebar-primary:           var(--sidebar-primary);
  --color-sidebar-foreground:        var(--sidebar-foreground);
  --color-sidebar:                   var(--sidebar);
  --color-chart-5: var(--chart-5);
  --color-chart-4: var(--chart-4);
  --color-chart-3: var(--chart-3);
  --color-chart-2: var(--chart-2);
  --color-chart-1: var(--chart-1);
  --color-ring:          var(--ring);
  --color-input:         var(--input);
  --color-border:        var(--border);
  --color-destructive:   var(--destructive);
  --color-positive:      var(--positive);
  --color-warn:          var(--warn);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent:        var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted:         var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary:     var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary:       var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover:       var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card:          var(--card);
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
}
```

注意：`--color-surface` 与 `--color-line` 会生成 `bg-surface`、`border-line` 等新工具类。动手前先 `grep -rn "bg-surface\|text-surface\|border-line\b" web/src`，确认这些类名此前未被使用（预期无结果）。

- [ ] **Step 4: 删除深色专用的字距补偿**

在 `globals.css` 的 `@layer base` 里，删掉 `body` 规则中的这两行：

```css
    /* 深底浅字补偿:极轻微加宽字距,提升 13px 正文的辨读(浅色主题不需要) */
    letter-spacing: 0.01em;
```

并删掉紧随其后的整条规则：

```css
  .light body {
    letter-spacing: normal;
  }
```

（`body` 的字号与行高在 Task 4 一并改。）

- [ ] **Step 5: 运行确认通过**

Run: `cd web && npm run check:tokens`
Expected: `design-tokens.check OK`

- [ ] **Step 6: 构建冒烟**

Run: `cd web && npx tsc --noEmit && npm run build`
Expected: 均成功。此时站点默认仍是深色（Task 3 才改默认），深色外观应与现网接近；悬停底从绿调变为中性。

- [ ] **Step 7: Commit**

```bash
git add web/src/app/globals.css web/scripts/design-tokens.check.ts web/package.json
git commit -m "feat(design): 令牌 v2(OKLCH,深浅两套),旧名改为别名层,关闭发光

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 默认跟随系统

**Files:**
- Modify: `web/src/app/[lang]/layout.tsx:101-106`（viewport）、`:160-165`（ThemeProvider）
- Modify: `web/src/app/manifest.ts:11-12`

**Interfaces:**
- Consumes: Task 2 的 `:root`（浅色）/ `.dark`（深色）结构

- [ ] **Step 1: 改 viewport.themeColor**

`web/src/app/[lang]/layout.tsx`，把：

```ts
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0E1411" },
    { media: "(prefers-color-scheme: light)", color: "#0E1411" },
  ],
};
```

改为：

```ts
// 与 globals.css v2 的 --canvas 一致(浅 oklch(0.985 0.004 165) / 深 oklch(0.175 0.010 165))
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0c120f" },
    { media: "(prefers-color-scheme: light)", color: "#f8fbf9" },
  ],
};
```

- [ ] **Step 2: 默认主题改为 system**

同一文件，把 `defaultTheme="dark"` 改为 `defaultTheme="system"`（`attribute="class"`、`enableSystem`、`disableTransitionOnChange` 保持不变）。

- [ ] **Step 3: manifest 改浅色**

`web/src/app/manifest.ts`：

```ts
    background_color: "#f8fbf9",
    theme_color: "#f8fbf9",
```

- [ ] **Step 4: 类型检查**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出（成功）

- [ ] **Step 5: 手测主题行为（Review Focus 1）**

```bash
cd web && npm run dev
```

用浏览器打开 `http://localhost:3000/en`，DevTools 中：

1. Application → Local Storage → 删除 `theme` 键。
2. Rendering → Emulate CSS media feature `prefers-color-scheme: dark`，开启 Network 节流 “Slow 4G”，硬刷新。预期：首帧即深色，没有白闪；Elements 面板 `<html>` 的 class 含 `dark`。
3. 切到 `prefers-color-scheme: light` 并刷新。预期：浅色，`<html>` 含 `light`。
4. 点导航右侧的主题按钮切到深色，刷新。预期：保持深色，`localStorage.theme === "dark"`。
5. DevTools → Settings → Debugger → Disable JavaScript，删除 `theme` 键后刷新。预期：页面为浅色且文字可读。完成后重新启用 JS。

任何一项不符合预期，停下来排查，不要进入下一个 Task。

- [ ] **Step 6: Commit**

```bash
git add web/src/app/[lang]/layout.tsx web/src/app/manifest.ts
git commit -m "feat(theme): 默认跟随系统,themeColor 与 manifest 对齐 v2 底色

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 字阶 v2 写入 globals.css

**Files:**
- Modify: `web/src/app/globals.css`（新增 `@theme` 字阶块；改写 `@layer base` 的 body；改写 `@layer utilities`）
- Create: `web/scripts/type-scale.check.ts`（本 Task 只含 globals 部分）
- Modify: `web/package.json`

**Interfaces:**
- Produces: 工具类 `font-data`（Geist Sans + tabular-nums）、`font-code`（Geist Mono）；重定义后的 `.tt-eyebrow` `.tt-label` `.tt-faint-label`；覆盖后的 `text-xs … text-5xl`。

- [ ] **Step 1: 写失败的检查（globals 部分）**

`web/scripts/type-scale.check.ts`：

```ts
/**
 * 守字阶 v2:globals.css 无 <12px 字号、字阶覆盖齐全、font-data/font-code 已定义。
 * Task 6 会在本文件追加对 src 的扫描。
 * spec: docs/superpowers/specs/2026-10-19-design-tokens-type-v2-design.md §2.4
 * 跑法:cd web && npx tsx scripts/type-scale.check.ts
 */
import fs from "node:fs";
import path from "node:path";

const failures: string[] = [];
const CSS = fs.readFileSync(path.join(__dirname, "../src/app/globals.css"), "utf8");

// 1. globals.css 中任何 font-size 不得小于 12px / 0.75rem
for (const m of CSS.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) {
  const px = m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1]);
  if (px < 12) failures.push(`globals.css font-size ${m[0]} < 12px`);
}

// 2. 字阶覆盖齐全(值与 spec §2.4 一致)
const SCALE: Record<string, string> = {
  xs: "0.75rem", sm: "0.875rem", base: "0.9375rem", lg: "1.0625rem",
  xl: "1.25rem", "2xl": "1.375rem", "3xl": "1.75rem", "4xl": "2.125rem", "5xl": "2.5rem",
};
for (const [k, v] of Object.entries(SCALE)) {
  if (!new RegExp(`--text-${k}:\\s*${v.replace(".", "\\.")};`).test(CSS)) failures.push(`缺少 --text-${k}: ${v}`);
}

// 3. 新工具类已定义,旧的 .font-mono 覆盖已移除
if (!/\.font-data\s*\{[^}]*tabular-nums/.test(CSS)) failures.push("缺少 .font-data(需含 tabular-nums)");
if (!/\.font-code\s*\{[^}]*--font-geist-mono/.test(CSS)) failures.push("缺少 .font-code(Geist Mono)");
if (/\.font-mono\s*\{/.test(CSS)) failures.push(".font-mono 覆盖应已删除");

// 4. 眉标/标签不再大写
for (const cls of ["tt-eyebrow", "tt-label", "tt-faint-label"]) {
  const body = CSS.match(new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`))?.[1];
  if (!body) failures.push(`缺少 .${cls}`);
  else if (/text-transform:\s*uppercase/.test(body)) failures.push(`.${cls} 仍是 uppercase`);
}

if (failures.length) { failures.forEach((f) => console.error("FAIL:", f)); process.exit(1); }
console.log("type-scale.check OK");
```

在 `web/package.json` 的 `scripts` 中 `"check:tokens"` 之后加入：

```json
    "check:type": "tsx scripts/type-scale.check.ts",
```

- [ ] **Step 2: 运行确认失败**

Run: `cd web && npm run check:type`
Expected: FAIL，包含 `font-size: 10px < 12px`、`缺少 --text-xs`、`缺少 .font-data`、`.font-mono 覆盖应已删除`。

- [ ] **Step 3: 新增字阶块**

在 `globals.css` 的 `@theme inline { … }` 结束之后、`/* ── Keyframes ── */` 之前插入：

```css
/* 字阶 v2 — 覆盖 Tailwind 默认字号,全站只此一套。12px 为下限,禁止 text-[NNpx]。 */
@theme {
  --text-xs: 0.75rem;     --text-xs--line-height: 1.45;   /* 12 标签 / 时间戳 / 来源 */
  --text-sm: 0.875rem;    --text-sm--line-height: 1.5;    /* 14 表格 / 控件 */
  --text-base: 0.9375rem; --text-base--line-height: 1.7;  /* 15 正文 */
  --text-lg: 1.0625rem;   --text-lg--line-height: 1.5;    /* 17 引导段 */
  --text-xl: 1.25rem;     --text-xl--line-height: 1.4;    /* 20 小标题 / 关键数字 */
  --text-2xl: 1.375rem;   --text-2xl--line-height: 1.3;   /* 22 区块标题 */
  --text-3xl: 1.75rem;    --text-3xl--line-height: 1.2;   /* 28 页面标题(移动) */
  --text-4xl: 2.125rem;   --text-4xl--line-height: 1.15;  /* 34 页面标题(桌面) */
  --text-5xl: 2.5rem;     --text-5xl--line-height: 1.1;   /* 40 首页主标题上限 */
}
```

- [ ] **Step 4: 改写 body 规则**

`@layer base` 中的 `body` 与 `:lang(zh) body` 规则改为：

```css
  body {
    @apply bg-background text-foreground;
    font-size: var(--text-base);
    line-height: 1.7;
  }
  /* 汉字在正文字号下偏密:zh 行高 1.8(html lang 已按 locale 设置) */
  :lang(zh) body {
    line-height: 1.8;
  }
```

- [ ] **Step 5: 改写工具类**

`@layer utilities` 中：删除 `.font-mono { … }` 规则；保留 `.tnum`、`.font-display`、`:lang(zh) .tracking-tight`、`.ticks`；把 `.tt-eyebrow`、`.tt-label`、`.tt-faint-label` 三条规则替换为下面的内容，并新增 `.font-data`、`.font-code`：

```css
  /* 数字、标签、表头:Sans + 等宽数字(替代旧的 font-mono 用法) */
  .font-data {
    font-family: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
    font-variant-numeric: tabular-nums;
  }
  /* 代码类内容专用:ticker、CUSIP */
  .font-code {
    font-family: var(--font-geist-mono), ui-monospace, monospace;
  }
  /* 区块/页眉标识:句子式大小写,不再是绿色大写等宽。
     (SectionHeading 改成“左标题右来源”结构在首期第三步。) */
  .tt-eyebrow {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--ink-2);
  }
  .tt-label {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--ink-2);
  }
  .tt-faint-label {
    font-size: 12px;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--ink-3);
  }
```

- [ ] **Step 6: 运行确认通过**

Run: `cd web && npm run check:type && npm run check:tokens`
Expected: `type-scale.check OK`、`design-tokens.check OK`

- [ ] **Step 7: Commit**

```bash
git add web/src/app/globals.css web/scripts/type-scale.check.ts web/package.json
git commit -m "feat(design): 字阶 v2(正文 15、下限 12),新增 font-data/font-code,眉标去大写

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 字阶 codemod

**Files:**
- Create: `web/scripts/codemods/type-v2.ts`
- Create: `web/scripts/codemods/type-v2.check.ts`
- Modify: `web/package.json`

**Interfaces:**
- Produces:
  - `type Mode = "full" | "size-only"`
  - `type Change = { line: number; before: string; after: string; child: string }`
  - `findLiterals(src: string): Array<{ start: number; end: number }>`：返回双引号与反引号字面量的内容区间（不含引号），跳过注释；反引号内的 `${…}` 按括号配对整体跳过，嵌套模板不会提前闭合。单引号不视为字面量（本仓库 class 串只用双引号/反引号，JSX 文本里的英文撇号会把单引号扫描带偏）。
  - `transformClassString(s: string, mode: Mode, child: string): string`
  - `transformSource(src: string, mode: Mode): { out: string; changes: Change[] }`
  - CLI：`npx tsx scripts/codemods/type-v2.ts [--write]`，在 `web/` 下运行，扫描 `src/`，默认 dry-run 打印报告。

- [ ] **Step 1: 写失败的检查**

`web/scripts/codemods/type-v2.check.ts`：

```ts
/**
 * type-v2 codemod 的样例断言。跑法:cd web && npx tsx scripts/codemods/type-v2.check.ts
 */
import { findLiterals, transformSource } from "./type-v2";

function eq(actual: string, expected: string, m: string) {
  if (actual !== expected) {
    console.error(`FAIL: ${m}\n  expected: ${expected}\n  actual:   ${actual}`);
    process.exit(1);
  }
}
const full = (s: string) => transformSource(s, "full").out;
const sizeOnly = (s: string) => transformSource(s, "size-only").out;

// 字号映射,保留响应式前缀
eq(full(`<p className="text-[10px] sm:text-[11px]">x</p>`), `<p className="text-xs sm:text-xs">x</p>`, "10/11px → xs");
eq(full(`<p className="text-[12px] text-[13px] text-[15px]">x</p>`), `<p className="text-xs text-sm text-base">x</p>`, "12/13/15px");

// 典型标签:去大写与正向字距,mono → data
eq(
  full(`<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">Source</span>`),
  `<span className="font-data text-xs text-[var(--tt-faint)]">Source</span>`,
  "标签",
);

// ticker 子节点 → font-code(同行)
eq(
  full(`<span className="ml-1.5 font-mono text-[11px] text-[var(--tt-faint)]">{h.ticker}</span>`),
  `<span className="ml-1.5 font-code text-xs text-[var(--tt-faint)]">{h.ticker}</span>`,
  "同行 ticker",
);
// ticker 子节点在下一行(EntityName 形态),uppercase 一并去掉
eq(
  full(`<span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-faint)]">\n          {ticker}\n        </span>`),
  `<span className="shrink-0 font-code text-xs text-[var(--tt-faint)]">\n          {ticker}\n        </span>`,
  "下一行 ticker",
);
eq(full(`<span className="font-mono">{c.coTicker}</span>`), `<span className="font-code">{c.coTicker}</span>`, "coTicker");
eq(full(`<span className="font-mono text-lg">{titleMeta}</span>`), `<span className="font-code text-lg">{titleMeta}</span>`, "titleMeta");

// tracking-tight 不是装饰字距,保留;无 uppercase 时正向字距也保留
eq(full(`<h1 className="uppercase tracking-tight">x</h1>`), `<h1 className="tracking-tight">x</h1>`, "保留 tracking-tight");
eq(full(`<p className="tracking-[0.06em] text-sm">x</p>`), `<p className="tracking-[0.06em] text-sm">x</p>`, "无 uppercase 不动字距");
eq(full(`<p className="uppercase tracking-wider sm:tracking-widest">x</p>`), `<p className="">x</p>`, "各种正向字距");

// 模板字面量与嵌套模板
eq(
  full("<span className={`inline-block font-mono text-[10px] uppercase ${cls}`}>x</span>"),
  "<span className={`inline-block font-data text-xs ${cls}`}>x</span>",
  "模板字面量",
);
eq(
  full("const a = `x${y ? `z` : \"\"}`; const b = \"font-mono text-[11px]\";"),
  "const a = `x${y ? `z` : \"\"}`; const b = \"font-data text-xs\";",
  "嵌套模板不吞掉后续字面量",
);

// size-only 模式只改字号
eq(
  sizeOnly(`<span className="font-mono text-[10px] uppercase tracking-[0.08em]">ADD</span>`),
  `<span className="font-mono text-xs uppercase tracking-[0.08em]">ADD</span>`,
  "size-only",
);

// 注释与普通文案不动
eq(full(`// font-mono text-[10px] uppercase\nconst x = 1;`), `// font-mono text-[10px] uppercase\nconst x = 1;`, "行注释");
eq(full(`{/* text-[11px] */}`), `{/* text-[11px] */}`, "块注释");
eq(full(`const m = "keys are uppercase only";`), `const m = "keys are uppercase only";`, "非 class 串里的 uppercase");
eq(full(`<p>It's "fine" here</p>`), `<p>It's "fine" here</p>`, "JSX 文本撇号");

// 变更报告带行号与子节点上下文
const r = transformSource(`a\n<span className="font-mono uppercase">{l}</span>`, "full");
if (r.changes.length !== 1 || r.changes[0].line !== 2 || !r.changes[0].child.startsWith(">{l}")) {
  console.error("FAIL: 变更报告", JSON.stringify(r.changes));
  process.exit(1);
}

// findLiterals 基本形态
const lits = findLiterals(`x = "a" + \`b\${"c"}d\`;`);
if (lits.length !== 2) { console.error("FAIL: findLiterals 计数", lits); process.exit(1); }

console.log("type-v2.check OK");
```

在 `web/package.json` 的 `scripts` 中 `"check:type"` 之后加入：

```json
    "check:codemod": "tsx scripts/codemods/type-v2.check.ts",
```

- [ ] **Step 2: 运行确认失败**

Run: `cd web && npm run check:codemod`
Expected: 报错 `Cannot find module './type-v2'`

- [ ] **Step 3: 实现 codemod**

`web/scripts/codemods/type-v2.ts`：

```ts
/**
 * 字阶 v2 codemod(一次性):把 class 串中的任意值字号、font-mono、装饰性 uppercase 换成 v2 用法。
 * spec: docs/superpowers/specs/2026-10-19-design-tokens-type-v2-design.md §2.4 / §3
 *
 * 跑法(在 web/ 下):
 *   npx tsx scripts/codemods/type-v2.ts           # dry-run,打印每条变更
 *   npx tsx scripts/codemods/type-v2.ts --write   # 写回文件
 */
import fs from "node:fs";
import path from "node:path";

export type Mode = "full" | "size-only";
export type Change = { line: number; before: string; after: string; child: string };

const SIZE_MAP: Array<[string, string]> = [
  ["text-[10px]", "text-xs"],
  ["text-[11px]", "text-xs"],
  ["text-[12px]", "text-xs"],
  ["text-[13px]", "text-sm"],
  ["text-[15px]", "text-base"],
];

/** 元素的第一个子节点是 ticker/titleMeta 表达式 → 该元素用 font-code。 */
const TICKER_CHILD = /^[^<>{}]*>\s*\{[\w.?]*(?:[tT]icker|titleMeta)\}/;
/** 看起来像 Tailwind class 串(避免误伤普通文案里的 "uppercase" 一词)。 */
const CLASSY = /(?:^|\s)(?:\S*:)?(?:text|font|tracking|px|py|rounded|border|bg|inline|flex|leading)-/;
const HAS_UPPERCASE = /(?:^|\s|:)uppercase(?=\s|$)/;
const STRIP_TOKEN = /^(?:\S*:)?(?:uppercase|tracking-(?:wide|wider|widest|\[0?\.\d+em\]))$/;
const FONT_MONO = /(?<![\w-])font-mono(?![\w-])/g;

/** 跳过平衡的 ${ … },返回闭合 } 之后的位置;内部的双引号/反引号字面量整体跳过。 */
function skipExpr(src: string, i: number): number {
  let depth = 1;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === '"') { i = skipQuoted(src, i); continue; }
    if (ch === "`") { i = skipTemplate(src, i); continue; }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return i;
}

/** i 指向开头的 `;返回闭合 ` 之后的位置。 */
function skipTemplate(src: string, i: number): number {
  i++;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") { i += 2; continue; }
    if (ch === "`") return i + 1;
    if (ch === "$" && src[i + 1] === "{") { i = skipExpr(src, i + 2); continue; }
    i++;
  }
  return i;
}

/** i 指向开头的 ";返回闭合 " 之后的位置;遇换行视为未闭合,返回 i+1。 */
function skipQuoted(src: string, i: number): number {
  let j = i + 1;
  while (j < src.length) {
    const ch = src[j];
    if (ch === "\\") { j += 2; continue; }
    if (ch === "\n") return i + 1;
    if (ch === '"') return j + 1;
    j++;
  }
  return i + 1;
}

export function findLiterals(src: string): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const e = src.indexOf("*/", i + 2);
      i = e === -1 ? src.length : e + 2;
      continue;
    }
    if (ch === '"') {
      const next = skipQuoted(src, i);
      if (src[next - 1] === '"' && next - 1 > i) out.push({ start: i + 1, end: next - 1 });
      i = next;
      continue;
    }
    if (ch === "`") {
      const next = skipTemplate(src, i);
      out.push({ start: i + 1, end: next - 1 });
      i = next;
      continue;
    }
    i++;
  }
  return out;
}

export function transformClassString(s: string, mode: Mode, child: string): string {
  let out = s;
  for (const [from, to] of SIZE_MAP) out = out.split(from).join(to);
  if (mode === "size-only") return out;

  FONT_MONO.lastIndex = 0;
  if (FONT_MONO.test(out)) {
    FONT_MONO.lastIndex = 0;
    out = out.replace(FONT_MONO, TICKER_CHILD.test(child) ? "font-code" : "font-data");
  }

  if (CLASSY.test(out) || /^\s*uppercase\b/.test(out)) {
    if (HAS_UPPERCASE.test(out)) {
      const lead = out.match(/^\s*/)![0];
      const trail = out.match(/\s*$/)![0];
      const kept = out.trim().split(/\s+/).filter((t) => !STRIP_TOKEN.test(t));
      out = kept.length ? lead + kept.join(" ") + trail : "";
    }
  }
  return out;
}

export function transformSource(src: string, mode: Mode): { out: string; changes: Change[] } {
  const changes: Change[] = [];
  let out = "";
  let last = 0;
  for (const { start, end } of findLiterals(src)) {
    const before = src.slice(start, end);
    const child = src.slice(end + 1, end + 201);
    const after = transformClassString(before, mode, child);
    out += src.slice(last, start) + after;
    last = end;
    if (after !== before) {
      changes.push({ line: src.slice(0, start).split("\n").length, before, after, child: child.slice(0, 60) });
    }
  }
  out += src.slice(last);
  return { out, changes };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const SIZE_ONLY_FILES = new Set([
  "src/components/common/Badge.tsx",
  "src/components/shell/MoveTag.tsx",
  "src/components/entity/VerdictChip.tsx",
  "src/components/valuation/ValuationBadge.tsx",
  "src/components/entity/QuarterMovesPill.tsx",
]);

function excluded(rel: string): boolean {
  return (
    rel.startsWith("src/components/ui/") ||
    rel.endsWith("opengraph-image.tsx") ||
    rel === "src/lib/ogCard.tsx" ||
    rel.endsWith(".check.ts")
  );
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

if (require.main === module) {
  const root = path.join(__dirname, "../..");
  const write = process.argv.includes("--write");
  let files = 0, total = 0;
  for (const abs of walk(path.join(root, "src"))) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    if (excluded(rel)) continue;
    const mode: Mode = SIZE_ONLY_FILES.has(rel) ? "size-only" : "full";
    const src = fs.readFileSync(abs, "utf8");
    const { out, changes } = transformSource(src, mode);
    if (!changes.length) continue;
    files++;
    total += changes.length;
    for (const c of changes) {
      const flag = /uppercase/.test(c.before) && !/uppercase/.test(c.after) ? " [-UPPER]" : "";
      console.log(`${rel}:${c.line}${flag}\n  - ${c.before.trim()}\n  + ${c.after.trim()}\n  child: ${JSON.stringify(c.child)}`);
    }
    if (write) fs.writeFileSync(abs, out);
  }
  console.log(`\n${write ? "WROTE" : "DRY-RUN"}: ${total} changes in ${files} files`);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd web && npm run check:codemod`
Expected: `type-v2.check OK`

如果某条断言失败，修实现直到全部通过；不要改断言去迁就实现。

- [ ] **Step 5: Commit**

```bash
git add web/scripts/codemods web/package.json
git commit -m "chore(design): 字阶 v2 codemod(纯函数 + 样例断言)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 对全站应用 codemod

**Files:**
- Modify: `web/src/**/*.tsx`（codemod 批改，预计 40 余个文件）
- Modify: `web/src/components/shell/TopNav.tsx:106,116`、`web/src/components/shell/MobileDrawer.tsx:156,167`
- Modify: `web/scripts/type-scale.check.ts`（追加 src 扫描）

**Interfaces:**
- Consumes: `transformSource`（Task 5）；`font-data` / `font-code` / 字阶（Task 4）

- [ ] **Step 1: 追加 src 扫描到 type-scale.check（先让它失败）**

在 `web/scripts/type-scale.check.ts` 中，把 `if (failures.length) …` 这一行之前插入：

```ts
// 5. src 扫描:禁止任意值字号与 font-mono;uppercase 只许出现在暂缓文件
const SRC = path.join(__dirname, "../src");
const DEFERRED = new Set([
  "components/common/Badge.tsx",
  "components/shell/MoveTag.tsx",
  "components/entity/VerdictChip.tsx",
  "components/valuation/ValuationBadge.tsx",
  "components/entity/QuarterMovesPill.tsx",
]);
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(e.name) ? [full] : [];
  });
}
function stripComments(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
for (const abs of walk(SRC)) {
  const rel = path.relative(SRC, abs).split(path.sep).join("/");
  if (rel.startsWith("components/ui/") || rel.endsWith("opengraph-image.tsx") || rel === "lib/ogCard.tsx" || rel.endsWith(".check.ts")) continue;
  const lines = stripComments(fs.readFileSync(abs, "utf8")).split("\n");
  lines.forEach((ln, i) => {
    const at = `${rel}:${i + 1}`;
    if (/text-\[\d+(?:\.\d+)?px\]/.test(ln)) failures.push(`${at} 任意值字号: ${ln.trim()}`);
    if (!DEFERRED.has(rel) && /(?<![\w-])font-mono(?![\w-])/.test(ln)) failures.push(`${at} font-mono(用 font-data / font-code): ${ln.trim()}`);
    if (!DEFERRED.has(rel) && /(?:["'`\s:])uppercase(?=["'`\s])/.test(ln)) failures.push(`${at} uppercase: ${ln.trim()}`);
  });
}
```

Run: `cd web && npm run check:type`
Expected: FAIL，共约 300 条（2026-10-19 在副本上实测 308 条），类别为 `任意值字号`、`font-mono`、`uppercase`；最多的三个文件是 `stocks/[ticker]/page.tsx`、`investors/[slug]/page.tsx`、`DataTable.tsx`。

- [ ] **Step 2: dry-run 并保存报告**

```bash
cd web && npx tsx scripts/codemods/type-v2.ts > /tmp/type-v2-report.txt; tail -1 /tmp/type-v2-report.txt
```

Expected: 末行形如 `DRY-RUN: <N> changes in <M> files`。2026-10-19 在副本上实测为 `156 changes in 49 files`，其中 68 条带 `[-UPPER]`；若 `src` 期间有改动，数字会略有出入。

- [ ] **Step 3: 复核报告中的风险条目（Review Focus 3）**

```bash
awk '/^src/{f=$0; up=($0 ~ /\[-UPPER\]/)} /^  child:/{ if (up && $0 ~ /child: "( |\\n)*>( |\\n)*\{?[a-z]/) print f "  " substr($0,1,70) }' /tmp/type-v2-report.txt
grep -B2 "^  + .*font-code" /tmp/type-v2-report.txt | grep -E "^src"
```

- 第一条命令列出“去掉大写、且子节点是变量或以小写开头”的元素（副本实测 49 条）。逐条打开源码，顺着变量找到英文文案：
  - 文案是小写开头、依赖 CSS 大写的，改成句子式大小写。
  - 文案是中文或本来就大小写正确的，忽略。
  - 2026-10-19 副本实测已确认需要改的有 3 处，Step 5、Step 6 处理：
    - 语言切换器的 `{l}`
    - `rowSignals.ts` 的英文信号标签（渲染出 “Core 8q”）
    - `HolderTrend.tsx` 的 `inline`（渲染出 “last 8q”）
  - 另有 `SubNav.tsx` 的 `"soon"`，同在 Step 6 处理。
- 第二条命令列出被判为 `font-code` 的位置。副本实测恰好 6 处，均为 ticker / titleMeta 渲染处：
  - `EntityName.tsx:20`
  - `EntityPage.tsx:75`
  - `ScreenerTable.tsx:122`
  - `stocks/[ticker]/page.tsx:814`（`coTicker`）
  - `investors/[slug]/page.tsx:575`、`:613`（`h.ticker`）

  出现其他位置时人工判断。

- [ ] **Step 4: 写回**

```bash
cd web && npx tsx scripts/codemods/type-v2.ts --write | tail -1
```

Expected: `WROTE: <N> changes in <M> files`，N 与 Step 2 相同。

- [ ] **Step 5: 语言切换器改显示文案**

`web/src/components/shell/TopNav.tsx` 与 `web/src/components/shell/MobileDrawer.tsx` 中，语言切换的两处 `{l}`（active 的 `<span>` 与非 active 的 `<Link>`，每个文件 2 处）都改为：

```tsx
{l === "zh" ? "中文" : "EN"}
```

`key={l}` 不变。

- [ ] **Step 6: 修正原本依赖 CSS 大写的英文文案**

去掉大写后，这几处英文会以小写或缩写露出。按“读起来轻松”的原则改成完整的句子式写法（中文不变）：

`web/src/lib/managers/rowSignals.ts` 的 `CONV_LABEL.en`：

```ts
  en: {
    accumulating: (_q, s) => `Adding · ${s} quarters`,
    fresh_conviction: () => "Big new position",
    long_core: (q) => `Core · ${q} quarters`,
    never_trimmed: (q) => `No trims · ${q} quarters`,
  },
```

`web/src/components/entity/HolderTrend.tsx` 的 `en.inline`：

```ts
    inline: (n: number, first: number, last: number) =>
      `Holders ${first} → ${last} · last ${n} quarters`,
```

`web/src/components/shell/SubNav.tsx` 中 `{lang === "zh" ? "即将上线" : "soon"}` 的 `"soon"` 改为 `"Soon"`。

这些文案没有被任何 `*.check.ts` 断言引用（2026-10-19 已 grep 确认）。

- [ ] **Step 7: 补漏 codemod 未覆盖的 ticker 位置**

```bash
cd web && grep -rnE 'font-data[^"]*"[^>]*>[[:space:]]*\{[^}]*([tT]icker|[cC]usip|[sS]ymbol)' src
```

预期无输出（副本实测为空）。有输出时，把对应元素的 `font-data` 改为 `font-code`。

- [ ] **Step 8: 运行全部检查**

```bash
cd web && npm run check:type && npm run check:tokens && npm run check:color && npm run check:codemod && npm run check:revalidate-paths && npx tsc --noEmit && npm run ai-check
cd web && npx eslint src -f json 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const n=JSON.parse(d).flatMap(f=>f.messages).filter(m=>m.severity===2).length;console.log('eslint errors',n);process.exit(n>42?1:0)})"
```

Expected: 全部通过。eslint 有 42 个存量错误（`no-explicit-any`、`no-require-imports`、`react-hooks/purity`，2026-10-19 实测，与本计划无关），门槛是错误数不增加。`check:type` 若仍有残留（例如 codemod 未识别的字面量形态），按报错逐条手改，遵守同样的映射规则。

- [ ] **Step 9: 构建**

Run: `cd web && npm run build`
Expected: 成功。

- [ ] **Step 10: Commit**

```bash
git add web/src web/scripts/type-scale.check.ts
git commit -m "refactor(design): 全站应用字阶 v2(12px 下限、font-data/font-code、去装饰大写),补齐原依赖大写的英文文案

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 导航断点（修复现网 768px 横向溢出）

现网问题：在 768–1023px 宽度下，桌面导航（`hidden md:flex`）放不下 Logo、四个导航项、搜索框、语言切换和主题按钮，页面出现横向滚动。2026-10-19 在 `/investors/berkshire-hathaway` 实测：768px 宽时 `scrollWidth` 为 1018；1024px 时刚好贴边。字阶 v2 放大了字号，只会更挤。修法是把桌面导航的起点从 `md`（768）提到 `lg`（1024），平板宽度改用现有的抽屉导航。

**Files:**
- Modify: `web/src/components/shell/TopNav.tsx:49`
- Modify: `web/src/components/shell/AppShell.tsx:29`
- Modify: `web/src/components/shell/MobileDrawer.tsx:68,76,89`
- Modify: `web/src/components/shell/SearchBox.tsx:177`（仅在 Step 3 失败时）

- [ ] **Step 1: 记录失败**

```bash
cd web && npm run dev
```

用 768×1024 视口打开 `http://localhost:3000/investors/berkshire-hathaway`，在控制台运行：

```js
[innerWidth, document.documentElement.scrollWidth]
```

Expected: 第二个数大于 768（溢出）。

- [ ] **Step 2: 断点改为 lg**

- `TopNav.tsx:49`：`hidden md:flex` → `hidden lg:flex`
- `AppShell.tsx:29`：`md:hidden` → `lg:hidden`
- `MobileDrawer.tsx`：第 68、76、89 行的 `md:hidden` → `lg:hidden`

不要改其他文件里的 `md:` 断点，它们控制的是内容布局，不是导航。

- [ ] **Step 3: 复测**

在 768、900、1023、1024、1100、1440 六个宽度下，对 `/en`、`/en/investors/berkshire-hathaway`、`/en/stocks/AAPL` 分别运行 Step 1 的脚本。

Expected: 两个数全部相等。

若 1024 或 1100 仍溢出，说明是桌面导航本身太宽：把 `SearchBox.tsx` 非 hero 输入框的 `w-56` 改为 `w-40 xl:w-56`，再复测。

- [ ] **Step 4: 抽屉可用性**

在 900px 宽下点开汉堡按钮：
- 抽屉能打开和关闭。
- 导航、语言切换、主题切换都能用。
- 触控区 ≥ 44px。

- [ ] **Step 5: Commit**

```bash
git add web/src/components/shell
git commit -m "fix(shell): 桌面导航起点 md→lg,修复 768–1023px 横向溢出

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 视觉验收

**Files:**
- Modify: `docs/superpowers/specs/2026-10-19-design-tokens-type-v2-design.md`（状态行）

- [ ] **Step 1: 启动并逐页截图**

```bash
cd web && npm run dev
```

页面清单：`/en`、`/zh`、`/en/investors`、`/en/investors/berkshire-hathaway`、`/en/stocks`、`/en/stocks/AAPL`、`/zh/stocks/AAPL`、`/en/stocks/screener`、`/en/learn`。

视口：375×812、768×1024、1440×900。

主题：深、浅各一遍（用导航右侧的主题按钮切换）。

每页核对：
- 导航 Logo、搜索框、语言切换在两套主题下清晰可读。
- 表格数字列对齐。
- ticker 为等宽。
- 区块眉标为句子式大小写、灰色。

- [ ] **Step 2: 横向溢出检测（Review Focus 2）**

在每个页面、每个视口的 DevTools 控制台运行：

```js
document.documentElement.scrollWidth <= innerWidth
  ? "OK"
  : [...document.querySelectorAll("body *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 5).map(e => e.outerHTML.slice(0, 120))
```

Expected: `"OK"`。返回元素列表时，修对应元素（通常是给长内容加 `min-w-0` / `truncate`，或让表格容器 `overflow-x-auto`），修完重跑。

- [ ] **Step 3: 裁字检测（Review Focus 4）**

同上，在每个页面运行：

```js
[...document.querySelectorAll("body *")]
  .filter(e => { const s = getComputedStyle(e); return (s.overflow === "hidden" || s.overflowY === "hidden" || s.textOverflow === "ellipsis") && e.scrollHeight > e.clientHeight + 1 && e.children.length === 0; })
  .slice(0, 10).map(e => [e.className.toString().slice(0, 80), e.textContent.slice(0, 40)])
```

Expected: `[]`，或只有设计上就该截断的长名称单行（`truncate`）。胶囊或按钮出现在列表里时，去掉其 `leading-none` / 固定高度，改为 `py-0.5` 一类的内边距。

- [ ] **Step 4: 浅色主题胶囊核对（Review Focus 5）**

在浅色主题下打开 `/en/investors`、`/en/investors/berkshire-hathaway`、`/en/investors/consensus`、`/en/stocks/screener`，逐个看 `NET BUYING`、`ADD`/`TRIM`、`Below value`、`Strike zone` 等胶囊：文字与边框必须清晰可辨。不清晰的，记录到 PR 描述的“留给第三步”清单，不在本计划内改胶囊结构。

- [ ] **Step 5: 更新 spec 状态并提交**

把 spec 第 4 行（以 `**状态：**` 开头）改为 `**状态：** 已实现（分支 feat/tokens-type-v2，待合并）`。

```bash
git add docs/superpowers/specs/2026-10-19-design-tokens-type-v2-design.md
git commit -m "docs(design): 令牌 v2 + 字阶 v2 已实现

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: 交付**

向用户报告：
- 各项检查的结果。
- 截图里发现并修复的问题。
- 留给第三步的胶囊问题清单。

询问用户是否 push 并开 PR 到 `db-foundation`。未经确认不 push。
