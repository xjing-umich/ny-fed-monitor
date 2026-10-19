# 设计令牌 v2 + 字阶 v2

**日期：** 2026-10-19
**状态：** 方向已获用户认可（首期 UX 改版提案 https://claude.ai/artifact/V52oFBFHX3o5mahrqtAp2y ），本文是首期第一步的设计
**范围：** `web/src/app/globals.css`、主题默认值、`viewport.themeColor`、`manifest.ts`、全站字号与等宽字体用法、因去大写而露出的英文文案、桌面导航断点（现网 768px 溢出）
**所属：** 首期第 1 步，见 `docs/superpowers/specs/2026-10-19-ux-phase1-roadmap.md`
**不在范围：** 组件形态重做（估值胶囊、13F 动作字形、区块标题“左标题右来源”结构）、页面结构调整、HUD 角标与左侧色条的移除、OG 图、`components/ui/*`（零 import 的死代码，见 `web/docs/cleanup-plan.md`）

## 1. 背景

2026-07-18 的 “The Ledger in the Dark” 把深色设为默认，浅色降级为“能用但不打磨”。2026-10-19 的线上审查发现：

- 正文 13px；`text-[10px]` 53 处、`text-[11px]` 59 处，多为大写等宽标签。深色底上小字最难读（NN/g《Dark Mode vs. Light Mode》；MIT AgeLab 结论）。
- `--ink-3` `#877E66` 在卡片底 `#151B17` 上只有 4.33:1，未过 WCAG AA。
- 绿色同时承担品牌、眉标、链接、加仓、低于价值、净买入、正增长、按钮、焦点框 9 种含义。
- 浅色主题底色 `#FAF8F3` 落在暖米色纸张区间，是 2026 年 AI 生成页面最常见的底色；审查时强制切换 class 观察到导航区对比异常（需用真实切换按钮复验）。
- 研究型产品（Morningstar、Seeking Alpha、TIKR、Finviz）普遍浅色默认；本站流量主要是搜索落地的冷访客。

本步只做“地基”：一套新的语义令牌（深浅两套都是一等公民，默认跟随系统）和一套新的字阶。旧的 `--tt-*` 与 shadcn 变量名保留为别名映射到新令牌，组件代码不需要逐个改色，保证一次上线不碎。

## 2. 决定

### 2.1 主题策略

- `ThemeProvider` 的 `defaultTheme` 由 `"dark"` 改为 `"system"`（`enableSystem` 已开启，`attribute="class"` 不变）。
- next-themes 0.4.6 只在用户点击切换时写 `localStorage.theme`。从未点过的访客将跟随系统；点过的保留其选择。
- `:root` 存放**浅色**值，`.dark` 存放**深色**值。删除 `.light` 块（next-themes 仍会给 `<html>` 加 `light` class，无副作用）。无 JS 的访客看到浅色。
- 切换按钮维持两态（深 / 浅），不加“跟随系统”第三态（YAGNI）。
- `viewport.themeColor`：浅色 `#f8fbf9`，深色 `#0c120f`。`manifest.ts`：`background_color` 与 `theme_color` 均为 `#f8fbf9`。

### 2.2 令牌 v2（唯一真相源）

全部以 OKLCH 书写；中性色向品牌绿（色相 165）带 0.004–0.018 彩度。下表 hex 为换算结果，仅供核对。

| 令牌 | 用途 | 浅色 OKLCH | 浅 hex | 深色 OKLCH | 深 hex |
|---|---|---|---|---|---|
| `--canvas` | 页面底 | `oklch(0.985 0.004 165)` | #f8fbf9 | `oklch(0.175 0.010 165)` | #0c120f |
| `--surface` | 面板 / 表格 | `oklch(1 0 0)` | #ffffff | `oklch(0.205 0.012 165)` | #121916 |
| `--sunk` | 表头 / 悬停 / 凹陷（深色下比底色亮一档，悬停可见） | `oklch(0.965 0.006 165)` | #f0f5f2 | `oklch(0.24 0.012 165)` | #1a211e |
| `--line` | 发丝线 | `oklch(0.905 0.008 165)` | #dbe1de | `oklch(0.29 0.012 165)` | #262d2a |
| `--line-strong` | 强调线 / 输入框边 | `oklch(0.84 0.010 165)` | #c5cdc9 | `oklch(0.36 0.012 165)` | #383f3b |
| `--ink-1` | 正文 | `oklch(0.23 0.018 165)` | #15201b | `oklch(0.94 0.008 165)` | #e6edea |
| `--ink-2` | 辅助 | `oklch(0.43 0.016 165)` | #48534e | `oklch(0.76 0.012 165)` | #aab4af |
| `--ink-3` | 时间戳 / 来源 | `oklch(0.52 0.014 165)` | #626c67 | `oklch(0.66 0.012 165)` | #8c9590 |
| `--brand` | Logo、主按钮、焦点 | `oklch(0.47 0.105 158)` | #0e6c43 | `oklch(0.76 0.13 158)` | #5eca91 |
| `--brand-soft` | 品牌浅底 | `oklch(0.95 0.03 158)` | #dff5e7 | `oklch(0.27 0.05 158)` | #0d2e1d |
| `--on-brand` | 品牌色上的字 | `oklch(1 0 0)` | #ffffff | `oklch(0.175 0.010 165)` | #0c120f |
| `--val-below` | 估值：低于价值 / 击球区 | `oklch(0.52 0.13 152)` | #137d41 | `oklch(0.76 0.14 152)` | #63ca84 |
| `--val-below-soft` | 其浅底 | `oklch(0.962 0.03 152)` | #e4f9e9 | `oklch(0.27 0.05 152)` | #112d1a |
| `--val-within` | 估值：价值带内 | `oklch(0.50 0.035 250)` | #546577 | `oklch(0.74 0.04 250)` | #98adc4 |
| `--val-within-soft` | 其浅底 | `oklch(0.95 0.012 250)` | #e9eff6 | `oklch(0.27 0.02 250)` | #1f2730 |
| `--val-above` | 估值：高于价值 | `oklch(0.54 0.13 65)` | #a15b00 | `oklch(0.80 0.12 75)` | #ebb25f |
| `--val-above-soft` | 其浅底 | `oklch(0.962 0.035 70)` | #ffefda | `oklch(0.28 0.05 70)` | #382409 |
| `--alert` | 数据异常 / 过期 / 错误 | `oklch(0.53 0.16 28)` | #b63b32 | `oklch(0.72 0.13 28)` | #eb8376 |
| `--alert-soft` | 其浅底 | `oklch(0.95 0.03 28)` | #ffe7e3 | `oklch(0.27 0.05 28)` | #3b1c18 |

**对比度门槛（由 `check:tokens` 强制）**，每个主题都必须 ≥ 4.5:1：

- `ink-1/2/3` × `canvas/surface/sunk`
- `brand` × `canvas/surface/brand-soft`；`on-brand` × `brand`
- `val-below/within/above`、`alert` × `canvas/surface/各自 soft`
- `ink-1/2` × `brand-soft`

按上表计算：浅色最低 4.64（`val-above` 在 `val-above-soft` 上），深色最低 5.32（`ink-3` 在 `sunk` 上）。

### 2.3 旧名映射（兼容层）

组件里现有的 `--tt-*`（约 690 处）与 shadcn 变量（约 40 处）全部改为指向 v2 令牌，只在 `:root` 定义一次（`.dark` 只覆盖 v2 原值，别名自动跟随）：

| 旧名 | 指向 |
|---|---|
| `--background` `--tt-bg` | `--canvas` |
| `--card` `--popover` `--sidebar` `--tt-panel` | `--surface` |
| `--secondary` `--muted` `--tt-panel-2` `--tt-surface` | `--sunk` |
| `--foreground` `--card-foreground` `--popover-foreground` `--secondary-foreground` `--sidebar-foreground` `--tt-text` | `--ink-1` |
| `--muted-foreground` `--tt-muted` | `--ink-2` |
| `--tt-faint` | `--ink-3` |
| `--primary` `--ring` `--sidebar-primary` `--sidebar-ring` `--tt-accent` `--tt-positive` `--positive` | `--brand` |
| `--primary-foreground` `--sidebar-primary-foreground` | `--on-brand` |
| `--accent` `--sidebar-accent` | `--brand-soft` |
| `--accent-foreground` `--sidebar-accent-foreground` | `--brand` |
| `--destructive` `--tt-negative` | `--alert` |
| `--warn` `--tt-warn` | `--val-above` |
| `--border` `--sidebar-border` `--tt-border` | `--line` |
| `--border-strong` `--input` `--tt-border-strong` `--tick-color` | `--line-strong` |
| `--chart-1..5` | `--brand` / `--alert` / `--val-above` / `--val-within` / `--ink-3` |
| `--glow-primary` `--glow-warn` | `none`（两套主题都关闭发光） |

`--tt-surface` 从“绿调悬停底”改为中性 `--sunk`，是本步唯一有意的语义收紧：悬停与选中不再染绿。“加仓 / 低于价值仍共用绿色”等语义拆分留给首期第三步（颜色语义拆分），本步不动。

其余：`--radius` 两套统一为 `0.375rem`；动效变量 `--tt-ease/--tt-dur/--tt-dur-fast` 原样保留在 `:root`。

### 2.4 字阶 v2

在 `@theme` 中覆盖 Tailwind 默认字号，全站只有这一套：

| 类 | 字号 | 行高 | 角色 |
|---|---|---|---|
| `text-xs` | 0.75rem（12px） | 1.45 | **全站下限**：标签、时间戳、来源 |
| `text-sm` | 0.875rem（14px） | 1.5 | 表格、控件 |
| `text-base` | 0.9375rem（15px） | 1.7 | 正文 |
| `text-lg` | 1.0625rem（17px） | 1.5 | 引导段 |
| `text-xl` | 1.25rem（20px） | 1.4 | 小标题 / 关键数字 |
| `text-2xl` | 1.375rem（22px） | 1.3 | 区块标题 |
| `text-3xl` | 1.75rem（28px） | 1.2 | 页面标题（移动） |
| `text-4xl` | 2.125rem（34px） | 1.15 | 页面标题（桌面） |
| `text-5xl` | 2.5rem（40px） | 1.1 | 首页主标题上限 |

- `body`：15px / 1.7；`:lang(zh) body` 行高 1.8；删除深色专用的 `letter-spacing: 0.01em` 补偿。
- 任意值字号映射：`text-[10px]` `text-[11px]` `text-[12px]` → `text-xs`；`text-[13px]` → `text-sm`；`text-[15px]` → `text-base`。迁移后 `src` 中不得再出现 `text-[NNpx]`。
- **等宽字体只给代码类内容。** 新增两个工具类：
  - `.font-data`：Geist Sans + `tabular-nums`。替代所有原先用于数字、标签、表头的 `font-mono`。
  - `.font-code`：Geist Mono。只用于 ticker、CUSIP 等代码。
  - 迁移后 `src` 中不再使用 `font-mono`（`components/ui/*` 与 OG 图除外）。
- **去掉装饰性大写。** 所有带 `uppercase` 的 class 串去掉 `uppercase` 与正向字距（`tracking-wider` / `tracking-widest` / `tracking-[0.xxem]`）。源文案已是句子式大小写（如 `"SEC 13F · holders"`），无需改文案。语言切换器的 `zh` / `en` 改为渲染 `中文` / `EN`。
- **暂缓的文件（第三步重做时一并处理）。** 以下胶囊组件只升字号到 12px，保留大写与等宽：
  - `components/common/Badge.tsx`
  - `components/shell/MoveTag.tsx`
  - `components/entity/VerdictChip.tsx`
  - `components/valuation/ValuationBadge.tsx`
  - `components/entity/QuarterMovesPill.tsx`
- **全局工具类重定义：**
  - `.tt-eyebrow`：12px、500、Geist Sans、无大写、字距 0、颜色 `--ink-2`，不再是绿色。
  - `.tt-label` / `.tt-faint-label`：12px、500、无大写、字距 0，颜色分别为 `--ink-2` / `--ink-3`。

## 3. 迁移方式

1. **令牌：** 只改 `globals.css`，组件零改动。
2. **字阶：** 用一个纯函数 codemod `transformSource(src)` 对 `src/**/*.{ts,tsx}` 做 class 级替换。排除 `components/ui/`、`opengraph-image.tsx`、`lib/ogCard.tsx`；胶囊组件走“仅字号”模式。
   - codemod 以 class 串（引号或反引号内的字面量）为单位处理。
   - 若某个 `font-mono` 元素的子节点（同行或下一行）是 `{…ticker}` / `{…Ticker}` / `{titleMeta}`，改为 `font-code`，否则改为 `font-data`。
   - codemod 输出逐条变更报告（文件:行），供人工复核。
3. **门禁脚本**（`tsx`，与仓库现有 `*.check.ts` 风格一致：失败 `process.exit(1)`）：
   - `check:color`：OKLCH→sRGB 换算与 WCAG 对比度函数的单元检查。
   - `check:tokens`：解析 `globals.css`，校验 v2 令牌在 `:root` 与 `.dark` 中齐全，且 2.2 节所列配对全部 ≥ 4.5；发光变量为 `none`；不存在 `.light {` 块。
   - `check:type`：扫描 `src`。禁止 `text-[NNpx]` 与 `font-mono`；`uppercase` 只允许出现在暂缓文件中；`globals.css` 中不得有小于 12px 的 `font-size`。
   - `check:codemod`：codemod 的样例输入输出断言。

## 4. 验收

- 四个新 `check:*` 全部通过；`npx tsc --noEmit`、`npm run build` 通过；现有 `check:revalidate-paths` 与 `npm run ai-check` 不回退；eslint 错误数不超过存量的 42 个（2026-10-19 实测，均与本步无关）。
- 去大写后露出的英文文案改为完整写法，例如 “Core 8q” → “Core · 8 quarters”，“last 8q” → “last 8 quarters”。
- 桌面导航从 `lg`（1024px）起显示，768–1023px 使用抽屉导航，修复现网 768px 宽度下 `scrollWidth` 1018 的横向溢出。
- 在 375 / 768 / 1440 三档 × 深 / 浅两套下，检查 `/en`、`/zh`、`/en/investors`、`/en/investors/berkshire-hathaway`、`/en/stocks`、`/en/stocks/AAPL`、`/en/stocks/screener`、`/en/learn`：
  - 无横向滚动：`document.documentElement.scrollWidth <= innerWidth`。
  - 导航 Logo、搜索框、语言切换在浅色下清晰可读。
  - 表格数字列对齐（tabular-nums 生效）。
  - ticker 仍为等宽。
- 系统为深色、且 `localStorage` 无 `theme` 的新访客首屏即为深色，无闪白；点切换按钮后选择持久化。
- 关闭 JS 时页面为浅色且可读。

## 5. 原则核对（精简但不简单，信息准确，读起来轻松）

- **精简：** 去掉发光、绿色眉标、装饰性大写字距。不新增任何视觉元素。
- **不简单：** 不删任何数据、文案或区块，只改呈现。
- **信息准确：**
  - 所有 as-of 与来源原样保留。
  - 把 “Core 8q” 这类缩写写全，避免误读。
  - 不改任何数字的计算。
- **读起来轻松：**
  - 正文 15px，下限 12px。
  - 文字对比度在两套主题下都 ≥ 4.5:1。
  - 等宽字体只留给 ticker。
  - 平板宽度不再横向滚动。

## 6. 风险

- **字号变大导致表格变宽。** 正文 13→15、标签 10/11→12。手机端已折叠为卡片，风险主要在 768–1024 的平板宽度。验收时逐页检查。
- **去大写后个别文案显得小写开头**（依赖 CSS 大写的小写字面量）。靠 codemod 报告加人工复核兜底，已知一处为语言切换器。
- **旧深色用户感知变化。** 点过切换的人保持深色；没点过、系统为浅色的老访客会看到浅色。这是本次的预期结果。
- **视觉过渡期。** 语义拆分（第三步）完成前，绿色仍兼任“加仓”和“低于价值”；`--tt-warn` 指向 `--val-above` 后，警示与“高于价值”同为琥珀色，与现状一致。
