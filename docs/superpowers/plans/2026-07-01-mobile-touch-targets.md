# 移动端触控区达标（Batch M1）实施计划

> **给执行者：** 必用子技能 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实施。步骤用 checkbox（`- [ ]`）语法跟踪。

**目标：** 把所有移动端可触达的交互控件提升到 ≥44×44px 的 tap 区（WCAG 2.5.5 / Apple HIG），且**不改动图标视觉尺寸**；顺带修掉唯一一处会随移动浏览器地址栏收展而跳动的 `100vh`。

**方案（按面型分两种技法）：** ① **纯移动面**（`md:hidden` 抽屉、联系弹窗）——直接放大控件盒子，移动端更大的控件本就是正确手感；② **桌面/移动共用面**（SubNav 二级导航条、估值卡 `<summary>`）——只在 `max-sm:` 断点内加高，保证桌面的编辑式紧凑密度**逐像素不变**。图标的 `size` 属性**一律不动**，只扩 padding / `min-h`。

**技术栈：** Next.js 16（App Router, Turbopack）、React 19、Tailwind CSS、自定义 `--tt-*` 设计令牌、lucide-react 图标。

## 全局约束

- 颜色/令牌：**只用 `--tt-*` 令牌**，禁用 shadcn 语义别名（暗色会漂移）。出自 [[frontend-design-language]]。
- 圆角：这些控件只用 `rounded-md`；禁止引入 `rounded-full/lg/xl`。出自 [[frontend-design-language]]。
- 图标视觉尺寸**冻结**：任何 lucide `size={...}` 都不改。只允许 tap 区（padding / `min-h` / 盒子 `w-h`）变大。
- 共用组件（SubNav、EarningsPowerFloorCard）的**桌面（≥`sm`，640px+）渲染必须与改动前逐像素一致**——用 `max-sm:` 变体强制实现，绝不用无条件类或 `sm:`-重置类（会泄漏到桌面）。
- 不改任何文案；本批不涉及文案改动。出自 [[no-mixed-language-copy]]。
- 验证门：`npx tsc --noEmit`（exit 0）——本仓**无测试套件**（单人开发，[[no-tests-solo-dev]]）；集成门是用 preview 浏览器做 375px 实测（`next dev` 本地能跑；`next build` 被 Google Fonts 墙挡，[[local-build-google-fonts-blocked]]）。
- 从 `db-foundation` 切分支；单一关注点分支 `fix/mobile-touch-targets`。commit trailer：`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。
- `gh` 不能开 PR（非 collaborator）；给用户网页 compare URL 合到 `db-foundation`。

---

### 任务 0：建分支

**文件：** 无（仅 git）

- [ ] **步骤 1：从最新主干切分支**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git checkout db-foundation
git pull --ff-only
git checkout -b fix/mobile-touch-targets
```

预期：当前在 `fix/mobile-touch-targets`，工作树干净。

---

### 任务 1：MobileDrawer —— 汉堡 / 关闭 / 主题 / 语言 chip

**文件：**
- 修改：`web/src/components/shell/MobileDrawer.tsx`（第 60、100、145、156、168 行）

**接口：**
- 依赖：不依赖其它任务。
- 产出：不被其它任务依赖。纯表现层 className 编辑。

抽屉是 `md:hidden`（纯移动面）→ 直接放大盒子。

- [ ] **步骤 1：汉堡按钮 → 44px（第 60 行）**

把汉堡按钮 className 里的 `w-8 h-8` 换成 `w-11 h-11`。`<Menu size={16} />` 不动。结果 className：

```
md:hidden flex items-center justify-center w-11 h-11 rounded-md border border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors
```

- [ ] **步骤 2：抽屉关闭按钮 → 44px（第 100 行）**

把关闭按钮 className 里的 `w-7 h-7` 换成 `w-11 h-11`。`<X size={16} />` 不动。结果 className：

```
flex items-center justify-center w-11 h-11 rounded-md text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors
```

- [ ] **步骤 3：主题切换 → 44px（第 168 行）**

把主题切换 className 里的 `w-8 h-8` 换成 `w-11 h-11`。`<Sun size={14} />`/`<Moon size={14} />` 不动。结果 className：

```
flex items-center justify-center w-11 h-11 rounded-md border border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors
```

- [ ] **步骤 4：语言 chip → 44px tap 高度（第 145 与 156 行）**

在**当前语言的 `<span>`（第 145 行）和另一语言的 `<Link>`（第 156 行）两处**，把开头的 `px-2.5 py-1` 改为 `inline-flex items-center justify-center min-h-[44px] px-3`。这样每个 locale chip 成为标准的 44 高 tap 药丸；mono `text-[11px]` 与所有颜色/边框类保留。结果开头类：

- 当前语言 span：`inline-flex items-center justify-center min-h-[44px] px-3 rounded text-[11px] font-mono uppercase tracking-wider text-[var(--tt-accent)] bg-[color-mix(in_srgb,var(--tt-accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--tt-accent)_30%,transparent)]`
- 另一语言 link：`inline-flex items-center justify-center min-h-[44px] px-3 rounded text-[11px] font-mono uppercase tracking-wider transition-colors no-underline text-[var(--tt-muted)] hover:text-[var(--tt-text)] border border-[var(--tt-border)]`

- [ ] **步骤 5：类型检查**

运行：`cd web && npx tsc --noEmit`
预期：exit 0，无错误。

- [ ] **步骤 6：提交**

```bash
git add web/src/components/shell/MobileDrawer.tsx
git commit -m "fix(a11y): MobileDrawer 触控区达标 44px(汉堡/关闭/主题/语言 chip)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### 任务 2：ContactModal —— 关闭按钮

**文件：**
- 修改：`web/src/components/shell/ContactModal.tsx:139`

**接口：** 无依赖、无产出。

弹窗在所有视口渲染；关闭 × 现为 `w-7 h-7`（28px）。直接放大——44px 的弹窗关闭在任何视口都是标准做法。

- [ ] **步骤 1：关闭按钮 → 44px**

把第 139 行关闭按钮 className 里的 `w-7 h-7` 换成 `w-11 h-11`。lucide `<X size={...} />` 不动。结果 className：

```
shrink-0 flex items-center justify-center w-11 h-11 rounded-md text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors
```

- [ ] **步骤 2：类型检查**

运行：`cd web && npx tsc --noEmit`
预期：exit 0。

- [ ] **步骤 3：提交**

```bash
git add web/src/components/shell/ContactModal.tsx
git commit -m "fix(a11y): ContactModal 关闭按钮触控区 → 44px

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### 任务 3：SubNav —— 响应式 tap 高度（桌面不变）

**文件：**
- 修改：`web/src/components/shell/SubNav.tsx`（第 29 与 44 行）

**接口：** 无依赖、无产出。

SubNav 是桌面+移动共用的横向滚动条。桌面密度（`py-2.5`，约 24–32px）是有意的编辑式设计，**绝不能改**。两个 pill 元素本就有 `flex items-center`，因此 `max-sm:min-h-[44px]` 只在移动端把文字居中于 44px 高度里。

- [ ] **步骤 1：禁用态「即将上线」pill（第 29 行）**

给 `<span>` className 加 `max-sm:min-h-[44px]`。结果 className：

```
relative flex items-center gap-1.5 max-sm:min-h-[44px] px-4 py-2.5 text-[11px] uppercase tracking-[0.1em] text-[var(--tt-faint)] cursor-not-allowed select-none shrink-0
```

- [ ] **步骤 2：激活/链接 pill（第 44 行）**

给 `<Link>` className（传入 class helper 的数组里第一个字符串）加 `max-sm:min-h-[44px]`。结果第一个字符串：

```
relative flex items-center max-sm:min-h-[44px] px-4 py-2.5 text-[11px] uppercase tracking-[0.1em] transition-colors no-underline shrink-0
```

- [ ] **步骤 3：类型检查**

运行：`cd web && npx tsc --noEmit`
预期：exit 0。

- [ ] **步骤 4：提交**

```bash
git add web/src/components/shell/SubNav.tsx
git commit -m "fix(a11y): SubNav pill 移动端 tap 高度 44px(max-sm,桌面不变)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### 任务 4：EarningsPowerFloorCard —— `<summary>` tap 高度（桌面不变）

**文件：**
- 修改：`web/src/components/valuation/EarningsPowerFloorCard.tsx:399`

**接口：** 无依赖、无产出。

共用组件。保留原生展开三角与桌面内联外观；只在移动端经 `max-sm:min-h-[44px]` 加高（作用于默认的 `list-item` 显示——不用 `flex`，故原生 marker 存活、桌面零改动）。满宽 `<summary>`（约 301px）× 44px 是很容易命中的目标。

- [ ] **步骤 1：给 summary 加移动端 min-height**

给第 399 行 `<summary>` className 加 `max-sm:min-h-[44px] max-sm:py-1`。结果 className：

```
cursor-pointer text-[var(--tt-faint)] max-sm:min-h-[44px] max-sm:py-1
```

- [ ] **步骤 2：类型检查**

运行：`cd web && npx tsc --noEmit`
预期：exit 0。

- [ ] **步骤 3：提交**

```bash
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "fix(a11y): 估值卡 Method&numbers 展开条移动端 tap 44px(max-sm)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### 任务 5：AppShell —— dvh

**文件：**
- 修改：`web/src/components/shell/AppShell.tsx:16`

**接口：** 无依赖、无产出。

`min-h-screen`（= `100vh`）会在移动地址栏收/展时让 footer 跳动。`100dvh` 跟随动态视口。桌面上 `100dvh === 100vh`，故桌面无改动。

- [ ] **步骤 1：替换高度单位**

把 `min-h-screen` 换成 `min-h-[100dvh]`。根 wrapper `<div>` 结果 className：

```
flex flex-col min-h-[100dvh]
```

- [ ] **步骤 2：类型检查**

运行：`cd web && npx tsc --noEmit`
预期：exit 0。

- [ ] **步骤 3：提交**

```bash
git add web/src/components/shell/AppShell.tsx
git commit -m "fix(ui): AppShell min-h-screen → 100dvh(修移动地址栏收展 footer 跳动)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### 任务 6：线上实测全扫 + 推送

**文件：** 无（仅验证）

这是集成门。preview 实测集中放这里，因为抽屉与弹窗是条件渲染——必须打开才能量到真实尺寸。

- [ ] **步骤 1：起 dev server**

用 preview_start，配置名 `web-dev`（port 3000）。确认能服务。

- [ ] **步骤 2：移动端——打开抽屉，量四个抽屉控件**

preview 缩到 `mobile`（375×812）。导航到 `http://localhost:3000/en`。点「Open menu」汉堡。然后 eval 量抽屉控件：

```js
(() => {
  const q = sel => { const el = document.querySelector(sel); if(!el) return null; const r = el.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)}; };
  return {
    hamburger: q('button[aria-label="Open menu"]'),
    close: q('button[aria-label="Close menu"]'),
    theme: q('button[aria-label="Toggle theme"]'),
    langChip: (() => { const a=[...document.querySelectorAll('[aria-current="true"], a[href]')].filter(e=>/^(zh|en)$/i.test(e.textContent.trim()))[0]; if(!a) return null; const r=a.getBoundingClientRect(); return {w:Math.round(r.width),h:Math.round(r.height)}; })(),
  };
})()
```

预期：hamburger `44×44`、close `44×44`、theme `44×44`、langChip `h ≥ 44`。若有任何 < 44，改对应任务 1 的类再量一遍。

- [ ] **步骤 3：移动端——量 SubNav pill 与 summary**

导航到 `http://localhost:3000/en/stocks`（有 SubNav）。eval：

```js
(() => {
  const pill = document.querySelector('nav a[href*="/stocks"], nav a[href*="/investors"]');
  const pr = pill && pill.getBoundingClientRect();
  return { subnavPillH: pr ? Math.round(pr.height) : null };
})()
```

预期：`subnavPillH ≥ 44`。再导航到 `http://localhost:3000/en/stocks/AAPL`，eval：

```js
(() => { const s=document.querySelector('details > summary'); const r=s&&s.getBoundingClientRect(); return { summaryH: r?Math.round(r.height):null }; })()
```

预期：`summaryH ≥ 44`。

- [ ] **步骤 4：桌面回归——SubNav + summary 不变**

preview 缩到 `desktop`（1280×800）。重载 `http://localhost:3000/en/stocks`，重跑步骤 3 的 SubNav pill eval。预期：pill 高度是**原来的紧凑值（约 24–34px），不是 44**——证明 `max-sm:` 没泄漏到桌面。重载 `/en/stocks/AAPL` 重跑 summary eval；预期原来的小高度（非 44）。

- [ ] **步骤 5：暗色视觉平衡**

缩到 `mobile` 且 `colorScheme: dark`。重载 `/en`，打开抽屉，preview_screenshot。确认放大后的汉堡/关闭/主题/语言 chip 看起来平衡（不臃肿）、令牌解析到暗色值。**若 44px 语言 chip 显得视觉过重，回退方案**：保持 chip 视觉小，改用伪元素扩隐形热区——第 145/156 行用 `relative` + `before:absolute before:-inset-2 before:content-['']`，并撤掉 `min-h-[44px]` 的盒子放大。按步骤 2 重量（热区仍 ≥44）。

- [ ] **步骤 6：dvh 核验**

仍在 `/en` 移动端，对 AppShell 根 `div.flex.flex-col` eval `getComputedStyle(...).minHeight`；确认解析为跟随 812 视口的 px 值（非 0/auto）。静止态 footer 无空隙。

- [ ] **步骤 7：停 server，推送，给出 compare URL**

```bash
git push -u origin fix/mobile-touch-targets
```

然后给用户：`https://github.com/xjing-umich/ny-fed-monitor/compare/db-foundation...fix/mobile-touch-targets?expand=1`

---

## 自检

**1. 需求覆盖** —— 审计出的每个 P1 触控区都有任务对应：汉堡/关闭/主题/语言 → 任务 1；弹窗关闭 → 任务 2；SubNav pill → 任务 3；估值卡 `<summary>` → 任务 4；P2 的 `dvh` → 任务 5；全部线上验证 → 任务 6。审计驳回项（SearchBox/Footer/SubNav「溢出」、NewsletterForm aria-label）已正确排除（线上实测证伪）。桌面 TopNav 切换与 Batch-M2 项（密集字号 legibility、safe-area）按全局约束意图明确不在本批。

**2. 占位符扫描** —— 无 TBD/TODO；每个代码步骤都给出确切的结果 className 字符串与确切 eval 片段、带数值阈值的预期。

**3. 类型一致性** —— 无新类型/函数；全部改动是 Tailwind className 字符串编辑，不存在跨任务签名漂移。行号锚定 2026-07-01 读到的版本；若文件行号漂移，执行者应按 class 字符串匹配、而非行号。
