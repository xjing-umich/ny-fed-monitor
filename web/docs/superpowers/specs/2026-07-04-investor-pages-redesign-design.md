# 超级投资者 列表页 + 详情页 重做 · 设计文档

**日期**：2026-07-04
**分支**：`feat/investor-pages-redesign`（off `db-foundation`）
**所属**：前端精修长期线（frontend-optimization-thread）
**范围**：`/investors`（列表）+ `/investors/[slug]`（详情）两页的前端与设计重做。不动数据层、不动路由、不动其它页。

---

## 1. 目标与约束

**用户诉求（原话）**
- 详情页：「一定要做到**简洁**并且能**抓住用户的眼睛**」；「不是单独功能调整，整页需要全方面审视，**不需要的删除、需要的加强**」。
- 列表页：「**极大增强易用性**，现在明显不够」。
- 「同时要考虑 **H5 和 PC**」。

**硬约束（贯穿验收）**
- **去 AI 感 / 强产品感**（[[anti-ai-product-sense]]）：禁破折号抒情/对偶/三元枚举/对冲词/SaaS 样板；禁装饰图标堆；**真数据当主角**，任何"图形"必须由真数据本身生成，不加纯装饰。
- **机构级编辑设计语言**（frontend-design-language）：令牌只用 `--tt-*`；Fraunces + mono；绿色克制；PageHeader/DataStrip/DataTable 等既有基元优先复用，不引 shadcn Card。
- **SEO 红线**（seo-english-first）：详情页的确定性正文是 SEO 支柱，**不得删除**，折叠也必须服务端渲染、爬虫可读。
- **响应式**：PC（`max-w-5xl` 单列容器）与 H5（`AppShell` 移动 sticky 头 + 抽屉）双端都要过。DataTable 既有"表↔卡"断点机制复用。
- **无测试项目**（no-tests-solo-dev）：验证门 = `npx tsc --noEmit` = 0 + grep 断言；本地 `next dev` 跑不了（Google Fonts + Supabase 硬依赖，local-build-google-fonts-blocked），运行时真机验收走 Vercel preview。

**明确不做（YAGNI）**
- 不改数据 loader / aggregations / 估值引擎；复用现成 reader。
- 详情页不加"击球区数"到列表（列表 C1 已裁掉）。
- 不引入客户端图表库；权重条等用纯 CSS/SSR。
- 不做投资者对比、不做收藏/关注。

---

## 2. 详情页 `/investors/[slug]` 重做

### 2.1 现状问题（诊断结论）
1. 核心数据 `HoldingsTable` 被排在 body 第 5 段（最底），信息优先级倒挂。
2. body 五段（Prose→ConvictionPicks→StrikeZonePicks→DiscoveryHandoff→HoldingsTable）用**同一个** section header 样式（`border-t` + 10px mono eyebrow），连续五次，节奏单调、无主次。
3. `ConvictionPicks`（高信念·3列卡片+Sparkline）与 `StrikeZonePicks`（击球区·绿chips）语义重叠（都在给持仓贴价值/信念标注），却用两套视觉语言。
4. 季度信息在 subtitle、freshness 徽章、KeyFacts「报告季度」三处重复。
5. `bg-panel` 框多次出现（DiscoveryHandoff + NewsletterCTA），稀释"框=重点"。

### 2.2 处置决定（留/删/合/强）

| 段落 | 处置 | 落地 |
|---|---|---|
| **HoldingsTable** | ⬆️ 提到 body 首位 + 强化（主角） | 权重列内嵌横向**权重条**（真数据变图形）；前几大仓行视觉加重；行内合并"信号"徽章（见下 A1）。 |
| **ConvictionPicks + StrikeZonePicks** | 🔀 合并 → **行内信号（A1）** | 两段撤销为独立 section；把"信念信号"（连续加仓/长期核心/新建）与"击球区/便宜"标注**内联进持仓表的行**（桌面为行右侧徽章列；H5 收进移动卡片 trail 位）。彻底消灭两个重复段落头。 |
| **InvestorProfileProse** | ⬇️ 降位 + **折叠（B2）** | 移到持仓/信号之后、来源之前；包进 `<details>`（默认收起，标题"关于这位投资者 / About this investor"）。**SSR 渲染全文**，`<details>` 原生可折叠，爬虫读得到全文（不伤 SEO）。 |
| **DiscoveryHandoff** | ✅ 保留为**页面唯一** panel 框 | 保持 `bg-panel` 出口面板；其它区块一律不用 panel 底框，让此框成为视觉落点。 |
| **KeyFacts** | ✂️ 收紧 4 格 | **删「报告季度」**（与 subtitle/freshness 重复）；换成有信号的格：**第一大仓占比**（`top1.value / totalValue`）。保留：组合市值、持仓数、第一大持仓（名）。 |
| masthead / SourceFooter / RelatedLinks / NewsletterCTA | 保留 | 骨架不动。masthead 的 h1+verdict+share 行在窄屏的换行错落顺带收一下。 |

### 2.3 新纵向骨架
```
标题条(h1 + verdict chip + share)
  → freshness notice
  → KeyFacts(收紧: 市值 / 持仓数 / 第一大仓占比 / 第一大持仓名)
  → 【持仓表 — 主角】权重条 + 前排加重 + 行内信号徽章
  → <details> 关于这位投资者(折叠, SSR 全文)
  → DiscoveryHandoff(唯一 panel 出口)
  → SourceFooter / RelatedLinks / NewsletterCTA
```
五个同质段落头 → 一条清晰主次：**持仓一屏见** → 想深读点开正文 → 想去下一步有出口。

### 2.4 视觉细节
- **权重条**：持仓表「权重」列或标的名下方，一条 `--tt-accent`/中性色横条，宽度 = 该仓占组合权重（`h.weight`），纯 CSS `width: N%`，无 JS。第一大仓最长，占比一眼可比。
- **行内信号徽章**：
  - 便宜（击球区命中）：小徽章"便宜/Cheap"或 `−N%`（复用 `verdicts.get(ticker).inStrikeZone` + `marginPct`）。
  - 高信念：小徽章"连续加仓·Nq / 长期核心·Nq"（复用 `deriveConviction`）。
  - 徽章克制：桌面右侧独立窄列；H5 收进卡片 trail，最多 1-2 个，避免堆砌。
- **前排加重**：前 3-5 行标的名字重略升（`font-medium` → 视觉锚），或加极淡的行底纹于 top-N（二选一，实现期定）。

---

## 3. 列表页 `/investors` 重做（C1）

### 3.1 现状问题
1. 无排名序号（`showRank` 未开）—— 榜单分量缺失，第 1 与第 50 视觉等重。
2. 搜索 = 一条光下划线，无"共 N 位/匹配 M 位"计数；排序按钮 `py-1`(~24px) < 44px 触控目标。
3. 只能按市值/持仓数排，缺"扫描维度"（找不到"这季在买的人"）。
4. 顶部 SubNav 分隔线 + PageHeader 底线"线—标题—线"三明治；PageHeader eyebrow "SEC 13F·季度披露"与 SubNav 分区语义重复。

### 3.2 处置决定（C1）

| 现状 | 处置 | 落地 |
|---|---|---|
| 无序号 | ➕ **榜单序号** | `DataTable showRank`（已支持）；桌面序号列、H5 卡片序号（组件已有）。 |
| 弱搜索 | 🔧 **真·筛选栏** | 搜索框做实（保持 hairline 风但更明确）；右侧显示"共 76 位 · 匹配 M 位 / 76 investors · M shown"实时计数；排序按钮升 **min-h-44px**（H5）。 |
| 排序单一 | ➕ **本季动作快筛** | 一排 segment 快筛：全部 / 加仓 / 减仓 / 微调（复用 `m.qoq.verdict`：buying/selling/mixed）。客户端 `useMemo` 过滤，零新增 IO。 |
| 行等重 | 💪 **头部加重** | 配合序号，前 10 名视觉略加重（名字字重或极淡锚）。 |
| 三明治头 | ✂️ **去冗余** | SubNav 分隔线与 PageHeader 底线二选一（保 SubNav，PageHeader 去底线或反之，实现期定）；删 PageHeader 与 SubNav 重复的 eyebrow。 |

### 3.3 交互与状态
- 筛选/排序全在 `InvestorListClient`（已是 `"use client"`）内 `useMemo` 组合：`query`（搜索）× `verdictFilter`（快筛）× `sort`（市值/持仓数）。
- 计数：`总数 = managers.length`；`匹配数 = filtered.length`；快筛/搜索任一生效时显示"匹配 M / 共 N"，否则只显"共 N"。
- 空结果：DataTable `emptyText` 已支持。
- 快筛 chip 触控 ≥44px（H5）；键盘可达、`aria-pressed`。

### 3.4 响应式
- PC：SubNav → 精简头 → 筛选栏(搜索+快筛+排序，一行/换行) → DataTable 桌面表(序号+各列)。
- H5：移动 sticky 头(AppShell) → SubNav 横滚 → 头 → 筛选栏堆叠(搜索占满行、快筛 chip 横排可滚、排序按钮 44px) → DataTable 卡片(序号+人名/机构+市值/持仓数 metric+本季动作 trail)。

---

## 4. 影响文件（预估）

**详情页**
- `web/src/app/[lang]/investors/[slug]/page.tsx` — 重排 body 顺序；KeyFacts 收紧（删报告季度、加第一大仓占比）；正文包 `<details>`；持仓表提前。
- `web/src/app/[lang]/investors/[slug]/page.tsx` 内 `HoldingsTable`（或抽出组件）— 加权重条列 + 行内信号徽章；吸收 ConvictionPicks/StrikeZonePicks 的信号逻辑。
- `web/src/components/entity/ConvictionPicks.tsx` / `web/src/components/investor/StrikeZonePicks.tsx` — 逻辑并入持仓表行内信号后，独立组件删除或降级为信号推导 util。
- `web/src/components/entity/InvestorProfileProse.tsx` — 包裹/适配折叠形态（或在 page 层包 `<details>`）。
- 可能新增：`web/src/components/investor/WeightBar.tsx`（纯 CSS 权重条）、`web/src/lib/managers/rowSignals.ts`（行信号推导，合并 conviction+strike）。

**列表页**
- `web/src/app/[lang]/investors/InvestorListClient.tsx` — 加快筛 state + 计数 + 排序按钮 44px + showRank；筛选栏重排。
- `web/src/app/[lang]/investors/page.tsx` / `web/src/components/common/PageHeader.tsx` / `web/src/components/shell/SubNav.tsx` — 去三明治（改动最小化，优先只调 investors 页而非全局 PageHeader，避免波及其它列表页）。

**共享基元**：`DataTable`（showRank 已支持；如需权重条内联，评估是否加通用能力或详情页局部实现）。改动优先"局部化"，避免波及复用 DataTable/PageHeader 的其它页。

---

## 5. 验收（四层，沿用 landing 标准）

1. **技术门**：`npx tsc --noEmit` = 0；grep 断言（删除的组件无残留 import；无硬编码 `/${lang}/` 路径，走 `localePath`/`stockPath`）。
2. **设计**：主次层级清晰（持仓一屏见）；section header 不再五段同质；panel 框全页仅一处；令牌合规、无 shadcn Card。
3. **去 AI 感 / 产品感**：文案无 AI 腔（无破折号抒情/对偶/三元枚举/对冲词/SaaS 样板）；权重条/信号徽章均由真数据生成、无纯装饰；每句带具体名词或数字。
4. **产品**：详情页——持仓主角、正文可折叠且爬虫可读、单一出口；列表页——序号榜单、真筛选栏+计数、本季动作快筛、44px 触控。
5. **响应式**：PC + H5 双端过；H5 无横向溢出、触控目标 ≥44px、卡片不挤。

**运行时验收**：本地 tsc 为门；真机（含权重条渲染、折叠展开、快筛交互、H5 卡片）在 Vercel preview 复验。

---

## 6. 开放项（实现期定，不阻塞）
- 前排加重用"字重"还是"极淡行底纹"——实现时二选一，看真机效果。
- 去三明治：调 PageHeader 还是 SubNav 的边框——优先不动全局组件，只在 investors 页局部处理。
- ConvictionPicks/StrikeZonePicks 是整删还是保留为纯推导 util——看信号内联后代码复用度。
