# 引导线：把 landing → investor → stock 串成一条路（共识接力棒）设计

- **日期**：2026-06-28
- **状态**：设计已确认（待用户审阅本 spec）
- **基线**：origin/db-foundation @ 0bcde12
- **主线定位**：三个面（landing 入口 / investor "谁聪明" / stock "值不值"）都已建好、各自不差，但它们是**目录式拼装（平行支柱）**，不是**旅程式拼装（顺序传棒）**。本 PRD 补的是把三页串成一条引导线的**连接组织**。
- **交付边界**：本 thread 仅产出 spec + 三块各自的 plan；执行在独立 thread/worktree，从 `db-foundation` 切分支。
- **关联**：受 [[valuation-philosophy-constraint]]（禁荐股/目标价）、[[no-mixed-language-copy]]（纯单语）、[[frontend-design-language]]（机构编辑风/`--tt-*`/眉标节奏/绿色克制/禁 shadcn Card）、[[ui-component-system]]（DataTable 四原语/MoveTag/Badge 专属语义）硬约束。吃 ②（`valuation_snapshot`/`ValuationBadge`/`StrikeZonePicks`）与共识层（`consensus_holdings.holder_count`、`consensus_moves.dominant_kind`）的现成成果。

---

## 0. 为什么做这个（诊断）

实地读三页（2026-06-28）的结论：

**landing 是"三扇平行门"，不是"一条路"。** 主体是三条并列 `FeatureRow`，各自一个 CTA 通向一个**列表页**：① 13F 追踪 → `/investors`；② 跨基金共识 → `/investors/consensus`；③ 估值 → `/stocks`。这是功能陈列柜——用户落地后是"三选一"，没有一句叙事把他从①顺势推到②再到③。

**详情页之间接力棒掉了。** 行级互链双向都通（stock 持有人行 → investor 页；investor 持仓行 → stock 页），但**没有人把用户往下一棒递**：
- investor 页**对人群是瞎的**——持仓表只有 市值/估值徽章/股数/权重，**没有一列**告诉你"这只票还有多少其他超投也持有"。`consensus_holdings.holder_count` 早已有（估值快照都 join 它了），就是没接。站在某投资人页，分不出哪些持仓是**全场共识**、哪些是**他一个人的孤注**——而这正是 13F 这条腿最有价值的洞察（信念 × 共识的交叉）。
- stock 页是**一张平铺持有人表**——没把"谁在买"抬成信号（共识强度/本季净方向/谁重仓没并到估值结论旁）。

**根因是同一个**：两个详情页都对**已经算好的共识/聚合维度视而不见**。把这根"共识接力棒"对称地穿进两页、再在 landing 上把三行串成叙事，引导线就成立。

非目标（YAGNI / 守纪律）：
- 不引入任何外部新数据（全程复用现成快照/聚合）。
- 不合并页面、不动 URL/canonical/hreflang。
- 不做荐股/目标价/评级/动量（守 [[valuation-philosophy-constraint]]）。
- 不重算估值、不新增 per-request 重查询（共识料已在快照/聚合读取器里）。
- 不碰 research 腿（用户明确判定 research 接入不急；本 PRD 只做"谁在买×值不值"两腿的合力）。

---

## 1. 统领抓手：共识接力棒

把三页串起来的单一连接元素 = **共识维度**：一只票被几位超投持有（`holder_count`）+ 本季净方向（`dominant_kind` / opened·added·trimmed·exited）+ 是否落 strike zone（②）。它是贯穿三段的同一根棒：

| 面 | 接力棒怎么传 |
|---|---|
| **landing** | 抛钩子："这 N 位超投正共同看好这些票，其中几只还便宜 →"（三步叙事的落点已是 `StrikeLeadersCard`）|
| **investor** | 用它判断："这位的这笔持仓**既是全场共识、又便宜** → 去看这只票"（holder_count 列 + StrikeZonePicks 升级为显式下一步）|
| **stock** | 接住并收束："完整人群 + 估值结论并置；想看背后是谁 → 回上一棒"（共识信号块 + 持有人→投资人回拉）|

---

## 2. 三个可独立执行的块（执行顺序：③ → ② → ①，倒序）

倒序理由：没必要先把用户往一条**落点还是平表**的线上引；先让 stock 页值得抵达（③），再修 investor 牵引（②），最后装 landing 漏斗（①）。三块各自独立出 plan、独立执行线。

### 块③ · stock 共识信号块（落点，先建）

**File:** `web/src/app/[lang]/stocks/[ticker]/page.tsx` + 新组件 `web/src/components/entity/OwnershipConsensusPanel.tsx`

- **不新建卡样式**：复用 `EarningsPowerFloorCard` 内本地 `Panel` 壳的同款式（`<section className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 sm:p-6">` + `<header className="border-b border-[var(--tt-border-strong)] pb-3">` 内绿眉标 → Fraunces 标题），做对称的 `OwnershipConsensusPanel`，与估值 Panel **上下并置** → 视觉同构 = "值不值 × 谁在买 两个判断并列"。
- 内容（全部现成料，零新查询）：
  - **共识强度**：`holders.length`（N 位超投持有）+ `totalValue`（合计市值，已在 page 算出）。
  - **本季净方向**：现在挂在页眉的 `QuarterMovesPill`（`moves.opened/added/trimmed/exited`）**升级进面板**——徽章一律走既有 `MoveTag`（实心绿/红 NEW/ADD/EXIT/TRIM 专属语义）/`Badge`，**不造新色**。一句自足事实句（GEO 可引用）："本季 N 位持有人中 X 家加仓、Y 家减仓（截至 <period>）"。
  - **头号重仓人**：`topHolder.person`（已算出），链到其 investor 页。
- **回拉钩子**：面板内/底 "持有它的投资人 →" 指向下方明细或直接复用持有人行链（接力棒回传）。
- 平铺 `HoldersTable` **保留在面板下方**作明细（不删）；页眉 `QuarterMovesPill` 收编进面板后移除页眉重复。
- **as-of**：净方向句带 `latestPeriod`；面板 sources 沿用页面 `SEC EDGAR 13F` + `filingFreshness`。
- **合规**：纯陈述持仓/滞后变动，沿用估值卡话术（"An observation … not investment advice, not a buy/sell signal, not a price target" 的同气文案），无荐股。
- **降级**：holders 已是页面渲染前提（`holders.length===0 → notFound()`），面板恒有数据；`moves` 全 0 → 净方向句退化为"本季无变动"，面板仍渲染共识强度。

### 块② · investor 牵引（接力棒）

**File:** `web/src/app/[lang]/investors/[slug]/page.tsx`（HoldingsTable 列）+ `web/src/components/investor/StrikeZonePicks.tsx`

- **持仓表加"另有 N 持有"列**：`DataTable` 加一列 `holderCount`（接 `consensus_holdings.holder_count`）。
  - 取数：**新增小读取器**（如 `readHolderCounts(tickers): Promise<Map<string, number>>`）按持仓 ticker 批量 `.in('ticker', tickers)` 查 `consensus_holdings`，与现有 `readValuationVerdicts(holdingTickers)` 同范式（单次查询、零 per-ticker 扇出）。**不要用 `readConsensusHeld(limit)`**——它只返回按 holder_count 排序的 Top-N，投资人持仓常落在 Top-N 之外会丢值。无 env/表缺 → 返回空 Map、该列留空、不崩。该读取器供 ②（investor 列）与 ③（如需复核 N）共用。
  - 列定义遵 [[ui-component-system]]：`role:"metric"`、数字 `font-mono tabular-nums`、密度紧时 `hideOnMobile`；**遵绿色克制**——不整列绿（faint/muted 数字，非 accent）。
  - 语义：让用户一眼分清这位的持仓里哪些是共识重仓、哪些是孤注。
- **StrikeZonePicks 升级为显式"下一步"**：它已是绿描边 chip 的"便宜持仓"条（命中=自足 GEO 句 + chips，纯位置语言）。**只调文案/钩子**——加一句过渡（"这位的持仓里，这些现在落在保守价值带内 → 看个股估值"）+ chip 行尾 `→` 强化"去看这只票"的交接。零新组件、不改其合规话术与三态逻辑。

### 块① · landing 三步叙事

**File:** `web/src/components/home/FeatureRow.tsx` + `web/src/app/[lang]/page.tsx`

- `FeatureRow` 加**可选** `step?: number`（纯增量、不破坏现有调用）：眉标前缀 mono 序号（`①②③` 或 `01/02/03`），三行串成**编号下降路径**。
- 三行之间补**一句过渡 thesis**（mono muted 小字），把"投资者 → 共识 → 估值"显式连成因果叙事：跟谁 → 他们共同看好啥 → 那只到底便不便宜。
- **不碰** `reverse` 的右/左/右 节奏（[[frontend-design-language]] 明确保留）；眉标→Fraunces→muted intro 节奏不动。
- ③ 行落点已是 `StrikeLeadersCard`（便宜且被持有）——叙事终点天然成立，无需新组件。
- 可选：在 hero 或三步起点加**一句"开始这条路"**的引导（指向 ① 投资者），强化"一条路"而非"三扇门"。保持绿色克制（描边/下划线，非实心绿按钮）。

---

## 3. 数据通路（均现成，零外部新数据）

- `holder_count`：`consensus_holdings`（`readConsensusHeld` / 批量 ticker→count 映射）。块②③共用。
- `dominant_kind` / 本季 moves：stock 页已算出的 `moves`（块③直接用）；`consensus_moves.dominant_kind` 备聚合句。
- strike zone / verdict：②的 `valuation_snapshot` / `readValuationVerdicts` / `StrikeZonePicks`（已在 investor 页加载）。
- 新鲜度 as-of：`filingFreshness` / `latestPeriod`（两页已有）。
- **CUSIP→ticker**：块②补 holder_count 时按 `cusipToTicker`（investor 页已建）映射，缺 ticker 的行该列留空（不臆造）。

**数据准确性（[[CLAUDE.md 全局硬规]]）**：所有共识数字带 as-of（披露季/45 天滞后口径），文案显式标 self-reported·lagged-disclosure，不臆测动机。

---

## 4. 合规护栏（贯穿）

- 共识强度/净方向 = **客观计数与方向**，非推荐；文案只讲"N 位持有 / X 家加仓"，禁 BUY/SELL/HOLD/目标价/评级/"最佳"。
- strike zone = **位置/距离**，非时机；沿用 ② 既有话术。
- 接力棒文案是**导航牵引**（"看这只票 →"），非买卖指令——措辞守纪律。
- 与估值卡同气：把不确定性/滞后摊在明处。

---

## 5. SEO / GEO / 前端最佳实践

- 全 RSC 零 hydration：共识面板 + holder_count 列 + 三步叙事全进服务端 HTML（爬虫可见）。
- 块③净方向句自足、带实体计数 + 日期（"N 位超投持有 X，本季 Y 家加仓，截至 Z"）→ 高可引用；可选扩 stock 页 FAQ/Organization JSON-LD 已有结构。
- 令牌唯一 `--tt-*`、Fraunces（`font-display`）+ Geist Mono（`font-mono tabular-nums`）、`rounded-md`、禁 shadcn `Card`、`SectionReveal` 既有动效、明暗双模等价。
- 性能：块② holder_count 走**单次批量映射**（同 verdicts 范式），不新增 per-ticker 扇出；块③用页面已加载量，零新查询。守 [[ui-component-system]] 长列表纪律（不全量富渲染、不传 client 组件）。

---

## 6. 架构与文件清单

| 块 | 动作 | 文件 | 说明 |
|---|---|---|---|
| ③ | 新建 | `web/src/components/entity/OwnershipConsensusPanel.tsx` | 共识信号面板（复用 Panel 款式，与估值 Panel 并置）|
| ③ | 改 | `web/src/app/[lang]/stocks/[ticker]/page.tsx` | 装入面板、收编页眉 QuarterMovesPill、持有人表降为明细 |
| ② | 改 | `web/src/app/[lang]/investors/[slug]/page.tsx` | 持仓表加 holderCount 列 + 批量取数 |
| ② | 改 | `web/src/components/investor/StrikeZonePicks.tsx` | 升级为显式"下一步"牵引（文案/钩子）|
| ① | 改 | `web/src/components/home/FeatureRow.tsx` | 加可选 `step` prop |
| ① | 改 | `web/src/app/[lang]/page.tsx` | 三步序号 + 过渡叙事 + 可选起点引导 |
| ②③ | 复用 | `readConsensusHeld`/`consensus_holdings`、`MoveTag`/`Badge`、`DataTable`、`EarningsPowerFloorCard` 的 Panel 款式 | 现成，零或极小改动 |

模块边界：各块一个执行单元；块间唯一共享是"共识料读取"（holder_count 批量映射），可抽一个小读取器供 ②③ 共用。

---

## 7. 测试与验收（[[no-tests-solo-dev]]）

无测试框架，验收 = `npx tsc --noEmit` + view-source（curl）+ 人工 QA（含明暗双模 + 移动 390/平板 768/桌面 1280 三宽）。

QA 矩阵：
1. **块③**：stock 页共识面板与估值面板并置、同构；N 位持有 + 本季净方向句（MoveTag 徽章）+ 头号重仓人链；持有人表降为下方明细、页眉不再重复 Pill；moves 全 0 退化句正确。
2. **块②**：投资人持仓表"另有 N 持有"列真值（对得上 consensus_holdings）；缺 ticker 行该列空、不崩；StrikeZonePicks 过渡句 + `→` 在场、三态逻辑不变。
3. **块①**：三行带序号 + 过渡叙事读成一条路；`reverse` 节奏未破；旧调用（无 step）不回归。
4. **接力棒闭环**：landing ① → investor → (holder_count 看共识 + StrikeZonePicks) → stock 共识面板 → 头号重仓人回 investor，全程链路通、无死链。
5. **合规**：三块文案无 buy/sell/target/rating；as-of 在场。
6. **SEO**：curl 三页，共识面板/holder_count 列/三步叙事在 SSR payload（非浏览器渲染）。
7. **设计语言**：唯一 `--tt-*`、绿色克制（无整列绿/无实心绿按钮）、`rounded-md`、明暗等价。
8. **门**：`cd web && npx tsc --noEmit` = 0。

---

## 8. 交付边界

独立三 plan、独立执行线，倒序 ③→②→①。读现成快照/聚合（`consensus_holdings`/`valuation_snapshot`/页面已加载量），零外部新数据、零迁移。每块完成走 [[finishing-a-development-branch]] 收口（PR 到 db-foundation）。
