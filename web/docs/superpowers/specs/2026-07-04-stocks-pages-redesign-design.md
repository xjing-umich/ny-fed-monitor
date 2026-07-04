# Stocks 页面重做设计（列表 / Screener / 详情）

**日期**：2026-07-04
**分支基线**：`db-foundation`（新分支 off db-foundation）
**目标**：把 `/stocks` 三页从「噪音多、AI 味重、易用性一般」改成「主角明确、克制、去模板感」。详情页是重灾区，占本次约 80% 工作量。

---

## 背景与诊断（自审真实代码得出）

三页现状：
- `/stocks`（列表，最多机构持有）——最干净。`PageHeader + StocksTable + 免责脚注`。
- `/stocks/screener`（按价值带）——中等。一张 6 列表被四段解释文字包裹。
- `/stocks/[ticker]`（详情）——重灾区。

### 详情页六大问题
1. **优先级倒置**：H1/SEO 是「谁持有这只股票」，但正文第一块是密集估值卡，持有人表被压到第 4 块（首屏之下）。用户问 A，页面先答 B。
2. **三连同模板面板**：估值卡 / `OwnershipConsensusPanel` / `DiscoveryHandoff` 是同一套路重复三遍（`绿眉标 → Fraunces 标题 → 导语 → 免责`），机械模板感 = AI/SaaS 味直接来源。
3. **免责刷屏**：全页 5–6 次免责（masthead、估值导语、估值 spine、共识导语、共识尾）。反复自我防御是 AI 文案典型特征。
4. **冗余**：`OwnershipConsensusPanel` 复述紧跟其后的 `HoldersTable`（n 位 / 合计 / 头号重仓 / 本季动向）；页脚 `RelatedLinks` 第三次列 top holders。
5. **估值卡是最重 AI 味单点**：一张卡塞导语 + 状态 + gauge + 整句 + capex 警示 + 资产地板 + net-net + model cautions 框 + spine 免责 + 价格时点 + 折叠方法（ROIIC/WACC/终值/贴现带）。信息密度远超个股页所需。
6. **噪音功能**：`DiscoveryHandoff` 的 chatbot 式反问、`NewsletterCTA` 的 SaaS 营销腔、把「关键事实+外链」这种该露的也折进 `<details>`。

---

## 决策（已与用户对齐）

- **D1 详情页主角 = 谁持有**：持有人表当头条，与 H1/SEO/13F 定位对齐。估值降为可点开的次要信号。
- **D2 估值卡 = 一行结论 + 位置条，方法全折叠**：首屏只留状态词 + gauge + 一句话；capex/net-net/model cautions/方法数字全收进 `<details>`。
- **D3 公司外链提上来强调**：Yahoo / Google Finance / SEC EDGAR 从折叠区拎到 masthead 正下方做成醒目一排。
- **D4 不需要的直接删**：共识面板、页脚 RelatedLinks、关键事实 dl、中间重复免责。
- **一致性顺风**：上一轮 investor 详情页已拍板的模式（持有人优先 / 行内信号 / 正文折叠 / 精简 handoff）与本次对齐，两个详情页同构。

---

## 详情页 `/stocks/[ticker]` 目标骨架

```
① Masthead   eyebrow「SEC 13F」· H1(公司名) · 副标题「N 位超级投资者持有 X（TICKER）」· 一句总免责
② 外链排     [Yahoo Finance] [Google Finance] [SEC EDGAR]   ← 提上来强调，带标签，非折叠
③ 估值一行   状态词 + cheaper→fair→pricier gauge + 一句话 ·「方法与数字 ▸」折叠
④ 持有人表   头条。表头 meta 行:「N 位持有 · 合计 $X · 本季 +opened/−exited」+ 本季动向 pill
⑤ 出口链     「看哪些股票相对价值带便宜 →」单行文字链
⑥ 折叠佐证   持有概览 ▸ / 持有人趋势 ▸（内容留 DOM，供 SEO/GEO）
⑦ 页脚       SourceFooter · NewsletterCTA（重写文案）
```

### 逐块规格

**① Masthead**（复用 `EntityPage` header）
- 保留 eyebrow / H1 / subtitle。
- **免责收敛**：本页唯一的总免责放这里（现文案：「仅供教育与信息参考，不构成投资建议。13F 持仓为机构自行申报，可能滞后最多 45 天。」）。其余各块内的免责一律删除，只保留估值折叠内 `MethodDetails` 的方法免责一处（合规底线：估值必须带免责）。全页免责 6 → 2。

**② 外链排**（新位置）
- `ExternalFinanceLinks`（Yahoo / Google Finance / SEC EDGAR）从原「关键事实」折叠块移出，渲染在 masthead 正下方。
- 强调 = 带文字标签的一排链接（非现在表格里那种极小 mono 图标），触控 ≥44px，`variant` 视需要新增或复用 `detail`。
- 仅当 `cusipsForTicker.length > 0`（真实证券）时渲染。

**③ 估值一行**（改造 `EarningsPowerFloorCard`）
- 首屏只保留 `ValueSpine` 的三样：状态徽章（安全边际 / 合理价值 / 高于价值）+ cheaper→fair→pricier gauge + 一句话解读。
- 现在 `ValueSpine` 里的 capex 警示句、资产地板句、net-net 句、model cautions 框——**全部移入折叠**（与 `MethodDetails` 合并为一个 `<details>「方法与数字」`）。
- 去掉整张 `Panel` 外壳（eyebrow「估值·两种方法」+ 标题「盈利能力与资产地基」+ 导语 + spine 免责）。改为与 ④ 一致的 `h2 eyebrow` 小标 +内容，不再是圆角大卡。
- 价格时点小字保留（`价格截至 date · source`），CLAUDE.md 硬规。
- `per_share_unavailable` / `CompactFloor`（无价格）分支：同样折叠为一行 + `<details>`。
- 位置档来源仍是 `deriveValuationVerdict` 单一真相源，不改口径。

**④ 持有人表（头条）**（改造 `HoldersTable` + 删 `OwnershipConsensusPanel`）
- 表提到估值一行之下。
- 新增表头 meta 行（替代被删的共识面板）：`N 位持有 · 合计 $X · 本季 +{opened} 新建 / −{exited} 清仓`（数字来自已聚合的 `moves`/`n`/`totalValue`，零新增 IO）+ 复用 `QuarterMovesPill`（全零返回 null）。
- 头号重仓不再单独一行——表按 value 降序，首行即最大持有人。
- 表体、Top-10 + `<details>` 折叠溢出、清仓 chip 列表：保留现状。
- 删除 `OwnershipConsensusPanel` 组件的渲染；其 `sr-only` GEO 事实句（`buildConsensusSentence`）迁移到本 section 内保留（SSR 可引用，别丢 GEO）。

**⑤ 出口链**（改造 `DiscoveryHandoff`）
- 去掉 `Panel` 外壳 + eyebrow「下一步·值不值」+ 反问句。
- 降为持有人表下方一行文字链：文案由 `stockHandoffFor` 提供的 `line` 改为陈述句（去反问），`ctaLabel` + `→`。
- 保留内部链接（SEO/discovery 价值），只去装饰与反问腔。

**⑥ 折叠佐证**
- 「持有概览」（`StockProse` 4 段）+「持有人趋势」（`HolderTrend`）保持 `<details>` 折叠，内容留 DOM。
- **删除「关键事实与外部链接」折叠块**：外链已提到 ②；ticker 在 H1；合计市值 / 头号重仓已在 ④ 表头与首行。整块冗余。

**⑦ 页脚**
- `SourceFooter` 保留。
- **删除 `RelatedLinks`**（top 6 holders 与 ④ 完全重复）。
- `NewsletterCTA` 保留（站点级增长位），**重写文案去 SaaS 腔**：
  - zh 现「每期精选 13F 异动与估值洞察，直达你的邮箱。」→「新一季 13F 异动与估值更新，发到你的邮箱。」
  - en 现「Curated 13F moves and valuation insights, straight to your inbox.」→「New-quarter 13F moves and valuation updates, to your inbox.」
  - （去掉「精选/Curated」「直达/straight to」营销词。）

---

## Screener `/stocks/screener` 精简

现状：表格上方 5 段（intro + geo 动态句 + 视图排 + 排序排 + 边框免责盒），表格下方方法论一段。

改成：
- **顶部块**：H1「个股 · 按价值带」+ 一句定位（保留）。geo 动态句并入定位段之后同一区，不单占一行。
- **视图/排序**：合并为一排（视图 3 链 + 排序 2 链在同一行，用分隔），去掉「排序」label 前缀的冗余。
- **删边框免责盒**：把「非买卖建议、安全边际只是距离」这句缩短，并入底部方法论段（与列表页一致：免责在脚注，不在表上方立牌）。
- **strike zone 首现补释**：定位句内首次出现「进入区 / strike zone」处补一句「（现价低于保守价值带）」。
- 底部方法论段：保留但缩一行，去重复免责（已在同段）。
- `ScreenerTable` 本体不动。

---

## 列表页 `/stocks` 微调

- 文案：metadata description 与页面语义里「被最多机构同时持有 / held by the most superinvestors simultaneously」→ 更口语克制的「最多人持有 / most widely held」。`PageHeader` intro 保留。
- `StocksTable`、分页、外链列：不动。
- **搜索框：本次不做**（低优先，列表是共识预过滤的有限集，YAGNI）。

---

## 全站 AI 味文案清洗清单（本次一并改）

| 位置 | 现文案 | 问题 | 改法 |
|---|---|---|---|
| 共识面板标题 | 「谁在买 / Who's buying it」 | 误导：其实是"谁持有"非"本季买入" | 组件删除，问题随之消失 |
| 共识面板导语 | 「描述动作、不下判决」 | AI 生硬对偶 | 组件删除 |
| DiscoveryHandoff | 「想知道现在哪些股票…便宜？」 | chatbot 反问 nudge | 改陈述句「看哪些股票相对价值带便宜」 |
| NewsletterCTA | 「每期精选…直达你的邮箱」 | SaaS 营销腔 | 见 ⑦ |
| Screener 免责盒 | 立牌式独立免责框 | 过度防御 | 缩短并入脚注 |
| 列表页 | 「被最多机构同时持有」 | 文档腔 | 「最多人持有」 |

**保留不动**（合规/品牌底线）：估值折叠内的方法免责、价格时点小字、masthead 总免责、`SourceFooter`。

---

## 硬约束（Global Constraints，每个任务都适用）

- **语言**：所有 UI 文案每个 locale 纯本语言，禁中英混排（品牌锁形 / strike zone 既定术语除外）。回复与文档正文中文。
- **去 AI 感**：禁破折号抒情 / 对偶 / 三元枚举 / 对冲词 / SaaS 样板；真数据当主角；每句带具体名词或数字。
- **数据准确性**（CLAUDE.md）：价格必带 as-of 时点。
- **SEO 红线**：确定性正文（持有概览 / 趋势 / GEO 事实句）必须 SSR 全文留 DOM，爬虫可读；折叠用原生 `<details>` 零 JS。
- **设计令牌**：只用 `--tt-*`；Fraunces + mono；绿色克制；禁 shadcn Card；沿用 PageHeader / DataTable / Badge 基元。
- **RSC 边界**：详情页为服务端组件，零新增 client hydration（现有折叠均原生 `<details>`）。
- **估值口径不动**：`deriveValuationVerdict` 单一真相源；本次只改呈现层，不动估值引擎与档位逻辑。
- **测试**：本项目无测试套件；门 = `cd web && npx tsc --noEmit` = 0 + grep 断言 + 本地 `next dev` + preview 真机三档（375/768/1280）。

---

## 影响的文件（预估）

**详情页**
- `web/src/app/[lang]/stocks/[ticker]/page.tsx`（重排正文骨架、删共识面板/RelatedLinks/关键事实、外链提上、迁 GEO 句）
- `web/src/components/valuation/EarningsPowerFloorCard.tsx`（去 Panel 外壳、一行 + 全折叠）
- `web/src/components/entity/OwnershipConsensusPanel.tsx`（**删除**）
- `web/src/components/discovery/DiscoveryHandoff.tsx`（去外壳/去反问，降为文字链）
- `web/src/components/entity/NewsletterCTA.tsx`（文案）
- `web/src/components/entity/ExternalFinanceLinks.tsx`（可能新增强调 variant）
- `web/src/lib/discovery/discoveryHandoff.ts`（line 改陈述句）

**Screener**
- `web/src/app/[lang]/stocks/screener/page.tsx`（顶部精简、删免责盒、strike zone 补释）

**列表页**
- `web/src/app/[lang]/stocks/page.tsx`（文案）

---

## 非目标（Out of Scope）

- 不动估值引擎 / 数据层 / 价格与基本面 loader。
- 不动 `EntityPage` 共享框架的对外接口（investor 页共用，避免回归）。
- 列表页不加搜索。
- 不动 `SubNav` / 路由结构 / ISR 策略。
