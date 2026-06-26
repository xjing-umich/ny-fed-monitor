# Stock 详情页瘦身 · 两支柱 + 折叠佐证区（渐进披露，SEO/GEO 无损）— 设计

**日期：** 2026-06-25
**状态：** 设计已确认（架构 A 折叠佐证区 / 估值在上 / 原生 `<details>` 渐进披露），待用户审阅 → writing-plans
**对应路线：** 个股实体页 · 呈现层瘦身 · [[prd-roadmap]] · 硬约束 [[valuation-philosophy-constraint]] · 复用 [[ui-component-system]]
**基线：** `origin/db-foundation`（已含估值引擎 v2 + 呈现层 v2 + OE-DCF 两法夹逼；`EarningsPowerFloorCard` 自带可折叠详情段；`DataTable` 响应式表↔卡片；`EntityPage` 统一壳）
**前序：** 三件事规划（① Landing 枢纽 / ② Investor 加强 / ③ 本 spec）中的 **③**，先做（最具体、痛点最大、自包含）。

---

## 0. 为什么做这个

个股页 `stocks/[ticker]` 是全站最密的单页：综述 prose → **估值大卡**（2 盏 EPV + 增长价值 + OE-DCF + 两法对账 + 可折叠详情）→ 持有人趋势 → 持有人表 → footer。内容过多，主次不分。

**用户定调：两根支柱最重要——「值不值」（估值结论）+「谁在买」（持有人表）。其余（综述 prose / 持有人趋势 / Key Facts / 外部链接）不删，降为佐证，找合适方式渲染。**

**瘦身手法 = 折叠/渐进披露（零功能损失）**：单页变短、深度一点即开。**纯呈现层重排 + 一个新 RSC 折叠组件，不碰数据层、估值纯函数、ingest、`/research`、价格层、investor 页。**

---

## 1. 新版页面骨架（top → bottom）

```
Masthead（极简）         h1 issuer + "Held by N superinvestors (TICKER)" + 本季进出 pill + 免责
─────────────────────────────────────
§ 支柱① 估值结论 (h2)     头条。默认只显 verdict + 价值带 + 价格位置 + 一句话 + 免责
                         方法内部(2盏EPV/GV/OE-DCF/对账/护城河/假设)全进卡内 <details>
§ 支柱② 持有人表 (h2)     谁在买。默认 Top 10，溢出行进 <details>「展开全部 N 位」
─────────────────────────────────────
延伸信息（佐证区）         每块一个 <details> 折叠、summary 可见且为完整语义行：
  ▸ Ownership overview (h2)   组合综述 prose（SEO/GEO 资产，留 DOM）
  ▸ Holders over time (h2)    趋势 sparkline + "N→M"
  ▸ Key facts & links (h2)    Ticker/合计市值/最大持有人 + 外部财务链接
─────────────────────────────────────
Footer                   SourceFooter + RelatedLinks + Newsletter（不动）
JSON-LD                  breadcrumb / FAQ / Organization（不动，隐形 SEO/GEO）
```

**与现状的差异**：① 估值从「prose 之后」提到**最前**（头条）；② 持有人表紧随其后（原在最末）；③ prose / 趋势 / Key Facts 从「正文流」降到**折叠佐证区**；④ `EntityPage.keyFacts` 醒目 band 取消（传 `[]`），Key Facts 内容下沉到佐证区折叠块（holder count 已在 subtitle，零信息损失）。

---

## 2. 两支柱怎么"瘦"

### 2.1 支柱① 估值结论（默认=结论，方法折叠）
- `EarningsPowerFloorCard` **默认视图只保留结论**：verdict + 价值带（cheaper→pricier gauge）+ 价格位置标记 + 一句话读数 + 强制免责。
- **方法内部全部进卡内已有的 `<details>`**：2 盏 EPV、增长价值三档、OE-DCF 区间、两法对账（分歧%/终值占比>70%/OE yield/DGS10 as-of/无桥注）、护城河信号、假设与来源。
- 审计已确认对账/诊断行已折叠；本 spec 只需**核对默认视图是否还残留 EPV 盏/GV 展开**，若有则一并推进 fold。**不改估值纯函数、不改任何数字与口径。**
- 合规不变（[[valuation-philosophy-constraint]]）：结论=价格 vs 保守价值区间的**位置** + 安全边际，无 BUY/SELL/目标价/评级。

### 2.2 支柱② 持有人表（默认 Top N + 折叠溢出）
- `HoldersTable`（stocks page 内 120–203）默认渲染**前 10 大持有人**（按 value 降序，与现排序一致）。
- 第 11+ 行包进 `<details><summary>展开全部 N 位持有人</summary> …剩余行… </details>`——**原生、零 JS、全部行留在 DOM**（见 §4 SEO/GEO）。
- 退出者 chips（"Exited this quarter (N)"）保持现状（已压缩）。
- `N ≤ 10` 时不渲染折叠开关（无溢出）。

---

## 3. 佐证区怎么渲染

新增轻量 RSC 组件 **`FoldedSection`**（纯 `<details>/<summary>`，无 `"use client"`、零 hydration）：
- props：`{ title: string; lead?: string; children; defaultOpen?: boolean }`。
- `<summary>` = eyebrow 风格的语义标题（§4 要求其为 `<h2>` 级别、且 summary 文案为**完整可独立阅读的一行**，非 "Details"）。
- 视觉沿用 `--tt-*` token、font-display eyebrow、border-t 分隔，与现有 section 节奏一致。
- 纯 CSS 折叠箭头（无 JS）；尊重 `prefers-reduced-motion`（不做高度动画或仅用 CSS）。

三块次要内容各包一个 `FoldedSection`，**默认折叠（`defaultOpen=false`）**：
1. **Ownership overview** — `StockProse`（综述）。`summary` 文案 = prose 首句或"Who owns it & recent moves"完整语义行（保一条可见 SEO 摘要句）。
2. **Holders over time** — `HolderTrend`（趋势 sparkline + "N→M"）。`<2` 季内部仍返回 null → 该块不渲染。
3. **Key facts & links** — Ticker / 合计市值 / 最大持有人三行 + `ExternalFinanceLinks`。理由：这些与持有人表**高度冗余**（=行数/求和/首行），唯一需常驻可见的 holder count 已在 masthead subtitle。

---

## 4. SEO / GEO / 前端最佳实践（硬约束，本次新增重点）

**折叠方案的天然优势**：RSC/SSR + 原生 `<details>` ⇒ 所有内容都在**首屏服务端 HTML** 里，Googlebot 与 LLM 爬虫（GPTBot / ClaudeBot / PerplexityBot / Google-Extended）**无需执行 JS** 即可读全文。折叠是**视觉行为，不是 DOM 裁剪**——HTML 负载不减（这是刻意的，为 SEO/GEO 保全文）。

### 4.1 收录（SEO）——直接呼应 [[seo-indexing-404-rootcause]] / [[seo-english-first]]
- **内容绝不条件渲染掉**：折叠的 prose / 全部持有人行**必须在服务端 HTML 中**（包进 `<details>`，不是点击后才 fetch/注入）。验收以 `view-source` / `curl` 确认，不看浏览器渲染态。
- **保留一条可见摘要句**：prose 折叠块的 `<summary>` 必须是完整一句（首句或综述句），避免 Google 把折叠正文判为低权重——可见锚句 + DOM 内全文 = 两头都占。
- 不改 sitemap / canonical / hreflang / robots；不引入 noindex。

### 4.2 语义结构与标题层级（SEO + GEO + a11y）
- **文档大纲正确**：`h1`（issuer）→ 各 section `h2`（估值结论 / 持有人 / 综述 / 趋势 / Key facts），**不跳级**。现状用 `<span>` eyebrow——本次升级为真正的 `<h2>`（视觉不变，仅语义化），让爬虫/LLM 正确解析结构。
- 折叠块标题：`<details>` 的 `<summary>` 内含 `h2` 级标签（或 section 用 `h2` + `details` 包正文）；以**标题大纲检查**（headingsMap / a11y 工具）确认无断层、无重复 h1。
- 表格保持原生 `<table>` 语义（`DataTable` 已是）；sparkline 维持 `aria-hidden` + 文本承载意义（现状）。

### 4.3 可被引用（GEO）
- **每根支柱给一句自包含、带日期、含实体名的事实行**，便于 LLM 逐字引用：
  - 估值：复用现有 verdict 读数，确保是**完整句**且含 as-of 日期与公司名（如"As of {priceAsOf}, {issuer} ({ticker}) trades at ${price}; its conservative owner-earnings value range is ${low}–${high}/share — {position}."）。**合规：区间 + 位置 + 日期，无目标价/买卖**。
  - 持有人：现有 subtitle + FAQ JSON-LD 已答"谁持有 X"——**保留不动**（GEO 已强）。
- 不新增结构化数据（YAGNI）；现有 breadcrumb / FAQ / Organization 三类已覆盖核心实体与问答。

### 4.4 前端最佳实践 / 性能 / a11y
- 全程 **RSC、无 `"use client"`、零 hydration**：完整 SSR HTML（利于 LCP + 爬虫）。
- 原生 `<details>` 键盘可达、屏幕阅读器可达；折叠不引入 **CLS**（占位稳定，summary 常驻）。
- 响应式沿用 [[ui-component-system]] 的表↔卡片断点；token `--tt-*`、`tabular-nums`、font-display eyebrow。
- **数据准确性规则**：各板块 as-of 随内容保留（DGS10 as-of / filed date / price as-of），明确来源与日期。
- 实现前读 `node_modules/next/dist/docs/`（本仓 Next 有破坏性改动，见 web/AGENTS.md）；本机 google fonts 被屏蔽，**本地门用 `tsc --noEmit`**，不跑 next build（[[local-build-google-fonts-blocked]]）。

---

## 5. 架构与文件

- 改 `web/src/app/[lang]/stocks/[ticker]/page.tsx`：
  - children 重排：**估值 section（h2）→ 持有人表 → FoldedSection(prose) → FoldedSection(trend) → FoldedSection(keyfacts+links)**。
  - `EntityPage` 传 `keyFacts={[]}`（取消醒目 band）；Key Facts 内容移入佐证区折叠块。
  - 估值 eyebrow `<span>` 升级为 `<h2>`（视觉不变）。
- **新增** `web/src/components/entity/FoldedSection.tsx`：可复用纯 `<details>` 折叠块（RSC，`title/lead/children/defaultOpen`，`<summary>` 含 `h2`）。
- 改 `HoldersTable`（stocks page 内联，120–203）：默认 Top 10 + 溢出 `<details>` 折叠（全行留 DOM）。
- 核对 `web/src/components/valuation/EarningsPowerFloorCard.tsx`：默认视图=结论，残留方法块推进卡内 fold（小改，不动口径）。
- **不碰**：估值纯函数（epvFloor/growthValue/ownerEarningsDcf/…）、ingest、`/research`、价格层、investor 页、structured data 生成逻辑。

---

## 6. 测试（[[no-tests-solo-dev]]）

- `tsc --noEmit`（本地门）。
- **SEO/GEO 验收（view-source / curl，不看浏览器渲染）**：折叠的 prose 全文 + 全部持有人行**在服务端 HTML 中**；标题大纲 `h1→h2` 不跳级、单一 h1；三类 JSON-LD 仍输出。
- **真数据 QA**（拷 `web/.env.local`）：
  - GOOG/AAPL（富估值）→ 估值结论头条紧凑、方法默认折叠；持有人 Top 10 + 展开；佐证三块折叠。
  - `per_share_unavailable` 票（多股权）→ 估值卡诚实档，仍作头条。
  - 金融单盏票 → 单灯档正常。
  - ASML（估值 undefined）→ 估值支柱缺席，**持有人表自动顶上当头条**（页面不空）。
  - `N ≤ 10` 票 → 持有人无折叠开关；`<2` 季 → 趋势块不渲染。
- a11y：原生 `<details>` 键盘展开/收起；sparkline `aria-hidden` + 文本意义在位。

---

## 7. 合规护栏（底线不变）

- 估值结论仍是"价格 vs 保守价值区间的位置 + 安全边际"，无 BUY/SELL/HOLD/目标价/评级；免责保留。
- 折叠**不改任何数字、口径、披露项**——纯呈现层重排。每板块标 as-of / 财年 / 退化项。

---

## 8. 交付边界与后续

本 thread 仅产 spec + plan，执行在独立 worktree/分支（从 `origin/db-foundation` 切）。
- **本 spec 完成后**：回到三件事路线 → **② Investor 加强**（先澄清能力方向）→ **① Landing 枢纽**（依赖 ②③ 详情页定型后做）。
- `FoldedSection` 为可复用资产，② Investor 加强 / ① Landing 枢纽 均可复用。
