# 超级投资者 · 聚合落地页设计

> 状态：设计已与用户分段确认（2026-06-07），待用户审阅 spec 后转 writing-plans。
> 所属规划 thread：Compounder 产品长期规划。
> 相关记忆：[[product-direction]]、[[data-layer-state]]、[[valuation-philosophy-constraint]]、[[seo-english-first]]。

## 1. 背景与目标

超级投资者（13F）是产品的第一个冷启动楔子，也是已投入最多的一条腿。现状核查（2026-06-07）发现这条腿其实是**半成品**：跨投资人的聚合计算（`mostHeld` / `notableMoves`）早已写好并物化到 `consensus_*` 表，但**只在首页露出 6–8 条**，没有专属落地页。`SECONDARY_NAV.investors` 已为「本季最多人买 / 最多人卖 / 共识持仓」留了三个 `soon:true` 占位 tab，从未通路由。

**目标**：把这三个聚合视图做成完整落地页，质量验收基准是**比 Dataroma 与 ValueSider 更强、且让普通投资者更容易获取信息**。

**竞品调研结论（2026-06，实测/第三方交叉验证）——两家共同病根 = 我们的赢点**：
1. 只给冷数据、**不给解读**（新手看不懂"为什么重要"）。
2. **没有季度并排对比（QoQ）**；Dataroma 要逐行点 history 链接才看得到环比。
3. **数据截至日期标注不统一/不显眼**，而 13F 固有滞后最多 45 天。
4. Dataroma 缺一个"按持有大佬数可排序的共识总表"（散落各处）；ValueSider 有但藏在冷冰冰的 screener 里；界面老旧、移动端弱。

**非目标（明确不做 v1）**：客户端排序/筛选 screener、CSV 导出、最大持有人列、列表内现价、个股趋势 sparkline、AI 叙述、估值判决。

## 2. 范围与 IA

### 2.1 三个新页面（均在超投 section 下，canonical）

| 路由 | 内容 | 数据来源（现成函数） |
|---|---|---|
| `/[lang]/investors/consensus` | 共识持仓：最多大佬同时持有 | `mostHeld()` |
| `/[lang]/investors/buys` | 本季最多人买 | `notableMoves().mostBought` |
| `/[lang]/investors/sells` | 本季最多人卖 | `notableMoves().mostSold` |

### 2.2 导航

`web/src/lib/nav.ts` 中 `SECONDARY_NAV.investors` 的三个 `soon:true` tab（`buys` / `sells` / `consensus`）：去掉 `soon`、补 `href`（`/investors/buys` 等），即通路由。

### 2.3 /stocks 重定位为薄目录/搜索页（保留「个股」一级导航）

「个股」是 product-direction 里特意提为一级导航的入口，故 **`/stocks` 不做 301**，而是把"最多机构持有"榜单内容搬到 `/investors/consensus`（canonical 唯一），`/stocks` 本身改造为轻量个股入口：

- `/[lang]/stocks` v1 = **搜索框 + 个股索引（字母或行业）+ "按持有大佬数浏览 → consensus" 的 CTA**。**不再渲染"最多机构持有"排行表**，以免与 consensus 内容重复抢排名。
- **保留不动**：`/[lang]/stocks/[ticker]` 个股详情页、sitemap 全量个股、canonical ticker URL、各页 OG。
- `SECONDARY_NAV.stocks` 现有 `held→/stocks`：改为 `/stocks` 仍指目录页本身；`held`（最多机构持有）作为概念已搬到超投 consensus，stocks 二级移除 `held`、`moves` 两 tab（或整组 stocks 二级在 v1 隐藏，因目录页本身即一级落地）。
- 注：薄目录页是本 spec 相对"纯三页"的唯一额外小页，换取保住「个股」一级决策。

### 2.4 渲染策略

三页均 **ISR 静态**（与全站一致），`revalidate` 跟 13F 季度节奏（建议 86400s / 1 天，因 consensus 表由摄取流水线季度级更新）。数据来自已物化的 `consensus_*` 表，天然适合静态化、对 SEO 友好。**不做客户端筛选/排序**。Top N 静态排行：共识 Top 50、买卖各 Top 30。移动优先。

## 3. 列与数据（来源分档）

档位：✅现成 · ⚙️需派生（组件内或新函数）· ✂️v1 砍。

### 3.1 共识页 `consensus`

| 列 | 档位 | 说明 |
|---|---|---|
| 持有大佬数 `holderCount` | ✅ | `mostHeld()` 直接给。**主数字**，补 Dataroma 的缺列 |
| 占聚合组合 % | ⚙️ 组件内 | `row.totalValue ÷ Σ totalValue`，零新数据 |
| 本季环比（+N/−N 位持有人） | ⚙️ 新函数 | 见 §4.3 `readConsensusHolderDeltas()`。打"无 QoQ"病根的关键列 |
| 最大持有人 | ✂️ v1 砍 | `HeldRow` 不含持有人身份，需扩 DB/扫描。留 v1.1 |
| 现价 | ✂️ v1 砍 | 需 join `prices` 批量；个股页已有现价。列表保持轻 |

### 3.2 买/卖页 `buys` / `sells`

| 列 | 档位 | 说明 |
|---|---|---|
| 做该动作的大佬数 `count` | ✅ | `notableMoves()` 直接给。主数字 |
| 主导动作 `dominantKind` | ✅ | new/increased（买）· exited/decreased（卖）→ 中英标签 + 色块 |
| 涉及金额 `value` | ✅ | 次排序/展示 |

### 3.3 v1 共识页"5 件套"

持有大佬数 + 占比% + 环比 delta + 解读句 + 数据截至徽标。其余列砍。

## 4. 组件、数据函数与装配

### 4.1 复用

`SubNav`（翻 soon→href）、相关链接/页脚模式、`src/lib/ogCard.tsx`（各页 OG 图）、`src/lib/macroNames.ts` 同款 i18n 抽法。参照 `web/src/app/[lang]/stocks/page.tsx` 与 `investors/page.tsx` 的 server-component + ISR 写法。

### 4.2 新增组件（单一职责）

- **`AggregateRankingList`**（B 为主响应式，见可视化已确认方向）：移动端＝编辑式卡片行，大数字＝主指标（共识页：大佬数；买卖页：动作大佬数）+ delta 箭头 / 动作色块；桌面端用 CSS 在右侧补列（共识：占聚合% ；买卖：涉及金额）。买卖页与共识页复用同件，靠 props 切换主数字语义与列。
- **`AggregateBlurb`**：渲染 §5 解读条（纸白底 + 钞票绿左边框）。
- **`DataAsOfBadge`**：`数据截至 {snapshotDate} · 13F，最多滞后 45 天` / `As of {snapshotDate} · 13F, up to 45-day lag`，双语。满足全局数据准确性硬规则。

### 4.3 新增数据函数（v1 唯一新数据工作）

`readConsensusHolderDeltas()`，置于 `web/src/lib/managers/consensusRead.ts`：从 `consensus_moves` 派生每 ticker 的 `new 数 − exited 数` = 持有人净增减，返回 `Map<ticker, number>`。无 Supabase env 时回退到扫描计算（与现有 `mostHeld`/`notableMoves` 回退一致）。共识页用它填 delta 列与解读句的 `delta` 槽。

### 4.4 页面装配（三个 `page.tsx`，全 ISR）

- **consensus**：`mostHeld(50)` + `readConsensusHolderDeltas()` → 组件内算占比 → `DataAsOfBadge` + `AggregateBlurb` + `AggregateRankingList`。
- **buys / sells**：`notableMoves(30)` 取对应一侧 → 同结构（无 delta 列）。
- 每页：metadata 英文优先（title/description/OG 英文）、`og:locale` 按语言切、`ItemList` 结构化数据、专属 OG 图、canonical。

## 5. 解读句规则模板

约束：**纯事实派生、可回溯到下方表格、零推荐措辞**（遵 [[valuation-philosophy-constraint]] 禁投机/禁荐股）。确定性模板而非 AI → **不需要"AI 生成可能有误"免责**。

模板函数：`consensusBlurb(rows, deltas, lang)` / `movesBlurb(rows, side, lang)`，输出字符串；槽位全部来自已查询的聚合行。

**共识页**
- EN: `Among {managerCount} superinvestors tracked, {topTicker} is the most widely held — in {holderCount} portfolios ({+/−delta} vs last quarter). The top 5 consensus names appear in {sumTop5} portfolios combined.`
- ZH: `本季纳入统计的 {managerCount} 位超级投资者中，{topTicker}（{issuer}）被 {holderCount} 位同时持有、居共识首位，环比 {+/−delta} 位；前五大共识股合计出现 {sumTop5} 人次。`

**买入页**
- EN: `This quarter, {topTicker} drew the most buying — {count} superinvestors opened or added, followed by {2nd} and {3rd}.`
- ZH: `本季 {topTicker} 获最多大佬买入——{count} 位新建仓或加仓，其后是 {2nd}、{3rd}。`

**卖出页**：同构，措辞改"减持/清仓 / sold or trimmed"。

**边界（确定性）**：
- `delta=0` → 显示"持平 / unchanged"，不显示 `+0`。
- 数据为空（无库/季度空窗）→ 不渲染解读条；列表显示"数据准备中 / Data coming soon"；徽标仍显示最近快照日期。
- 并列第一（holderCount 相同）→ 按 `totalValue` 次排，模板只述第一名。
- delta 缺失 → 该行显示"—"。

## 6. 数据时效与准确性

- 每页顶部 `DataAsOfBadge` 醒目标注快照季度截至日 + "13F，最多滞后 45 天"。
- `snapshotDate` 来源：consensus 快照对应的最新 filing 季度截至日（13F period of report）。需在读取层一并返回或单独查询最新季度。
- 不显示任何买卖信号/估值判断（遵护栏）；解读句仅陈述持仓事实。

## 7. 验收标准

1. 三个路由 `/investors/{consensus,buys,sells}` 在 zh/en 均 200，ISR 静态。
2. `SubNav.investors` 三 tab 通路由、active 态正确。
3. `/stocks` 改薄目录/搜索页（搜索框 + 索引 + consensus CTA），不再渲染最多机构持有榜单；「个股」一级导航仍指 `/stocks`；`/stocks/[ticker]` 与 sitemap 不受影响。consensus 为最多机构持有内容的唯一 canonical。
4. 共识页含 5 件套：持有大佬数（主数字）、占比%、环比 delta、解读句、数据截至徽标；移动端 B 卡片、桌面补列。
5. 买/卖页含动作大佬数（主数字）、动作色块标签、涉及金额、解读句、徽标。
6. 解读句确定性、双语、无推荐措辞、可回溯到表格；空数据走边界分支不报错。
7. 无 Supabase env 时三页回退到扫描计算仍可渲染（与现有回退一致）。
8. 每页 metadata 英文优先 + `ItemList` 结构化数据 + 专属 OG 图。

## 8. 风险与备注

- **唯一新数据工作** = `readConsensusHolderDeltas()`；若 `consensus_moves` 的 kind 粒度不足以区分 new/exited，需回退按 `scanAllManagers` 比对 latest/prior 持有人集合派生（成本略增，仍可行）。
- `/stocks` 从"最多机构持有"改为薄目录页，其历史"most held"内容/排名信号转移到 `/investors/consensus`——需在 GSC 关注 consensus 新页收录与 `/stocks` 内容变更后的表现；consensus 为该内容唯一 canonical，避免重复。
- 多 session 共用主工作树：本 spec 的实现应在独立分支/worktree 进行（遵 [[data-layer-state]] 教训）。
