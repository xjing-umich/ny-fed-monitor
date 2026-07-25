# 13F 共识 × 估值 融合信号（T1 · 点亮融合）— 设计

- 日期：2026-07-25
- 分支：`plan/fusion-consensus-valuation`（off `db-foundation` @ b05caff）
- 状态：设计待认可
- 上位：[[north-star-strategy]]（权威站·代表作）、[[product-direction]]、[[macro-pillar-retired-two-pillar-pivot]]（产品收敛双柱）、[[valuation-reform-expectations-roadmap]]（竞品裁决：融合结构性哑火）、[[valuation-philosophy-constraint]]（禁投机/推荐）、[[anti-ai-product-sense]]、[[frontend-design-language]]

## 一、目标与背景

产品已收敛为**双柱：谁在买（13F）× 值不值（估值）**。核心差异化是把两柱缝成单一洞察——「聪明钱在买 × 这价格值不值」。三期估值改造（P1 反向 DCF 预期、P2 护城河→CAP，均已合并）已让优质股 verdict 可用，但**测绘证实这条融合从没接到任何聚合面上**：

- `valuation_snapshot.payload.expectations` / `moatCap` **落库且已读回类型，但全站零组件渲染**（最后一跳断线）。
- 共识报告页 `investors/consensus/page.tsx` **只读 13F、完全不读估值**——"最多人持有的票现在贵不贵"是空格。
- screener **有 holder_count 显示列，但没有"高共识 × 估值吸引力"的相交/排序视图**——产品核心命题没有任何页面产出它。

本设计（T1）把「13F 共识 × 估值 verdict」做成**一等融合信号**，铺到三个发现面。纯接线：数据全物化、零新迁移、零 ingest 依赖。

## 二、核心决策：标注全集 + 排序（非硬交集筛选）

**避开空集陷阱**：`strike_zone` 视图已被 reliable 闸卡窄，优质股又极少落进击球区；若做"击球区 ∩ 高共识"的**硬筛选**，结果常年近空 = 把竞品审计发现的"哑火"重演。

故融合信号采用 **B：标注全集 + 排序**——纳入所有高共识票，**按估值吸引力排序**（便宜置顶、偏贵向下），每行挂 verdict + 隐含预期；真正落在"便宜 ∩ 高共识"的票标为**顶层高亮**。融合**恒常在线、永不空页**：交集存在时自然浮顶，不存在时页面仍有料（"聪明钱最爱的这些票，现在估值分别落在哪、市场在赌什么"）。这从根上把"gating 到空集"改成"annotate 全集 + 排序"。

## 三、非目标（YAGNI）

- **不做**首页三柱 leaders 互挂（T1 的④，留后）。
- **不改**任何估值数值/判定或 13F 聚合口径——纯读取既有物化数据 + 呈现。
- **不引入**新迁移 / 新表 / 新 ingest 步骤——`valuation_snapshot`、`consensus_holdings`、`readValuationVerdicts` 均已就位。
- **不做**Form4/内幕流（数据不存在）。
- **不碰** macro（已退役）。

## 四、架构（ingest 早已算好，页面只读+缝合）

编排顺序不变；新增一个纯函数内核，三面复用。

1. **共享内核** `web/src/lib/managers/fusionSignal.ts`（放 `managers/` 因它桥接 13F+估值）：
   ```ts
   export type FusionSignal = {
     attractivenessRank: number;   // 排序键：便宜档最小(置顶)→偏贵最大
     isCheapConsensus: boolean;    // holderCount≥N ∧ (inStrikeZone || bucket==="below") ∧ reliable → 顶层高亮
     impliedTier?: ExpectationsTier; // 来自 verdict.expectations（可缺）
   };
   export function deriveFusionSignal(input: {
     holderCount: number;
     verdict: SnapshotVerdict | undefined;
   }): FusionSignal;
   ```
   纯、可测。缺 verdict/holderCount → rank 落末、isCheapConsensus=false、impliedTier 省略（不崩、不误导）。
   - 排序键口径：位置档权重（便宜 0 / 带内 1 / 高于 2；单法或未确认便宜降级到带内档权重）× 大基数 − holderCount（同档内共识高者优先）。具体常量在计划期钉入 `.check.ts`。

2. **① screener 新视图** `ScreenView="conviction"`：
   - **新 reader `readConvictionScreen(limit)`**（不改现有 `readValuationScreen` 契约）：查询**倒序**——先从 `consensus_holdings` 取 `holder_count ≥ CONSENSUS_MIN` 的票，再 join `valuation_snapshot` 取 verdict，`deriveFusionSignal` 排序。降级同现有 reader（表缺/无 env → 空，绝不抛）。
   - `CONSENSUS_MIN = 5` 起步（97 管理人里 5+ 家共同持有已是明显信号），常量，落库后按真实分布校准。
   - UI：screener 加一个 tab；行渲染复用现有行 + expectations 副标 + 顶层高亮（见 §五）。

3. **② 共识报告页接估值** `investors/consensus/page.tsx`：
   - 加 `readValuationVerdicts(rows.map(ticker))`（批量单查询，rows 已是 top-50）。
   - `AggregateRankingList` 的 `RankRow` 增一个可选估值槽，渲 `ValuationBadge`（显全档，让"多人持有**但**高于价值"如实可见）。

4. **③ 投资人页 + ValuationBadge 渲染 expectations**：
   - `ValuationBadge` 在 **`full` 密度**多吐一行 expectations 副标（"现价隐含 {档}"）；**`sparse` 密度（持仓表 50 行）保持干净、不加**（防噪音）。
   - 投资人页 posture 小节加一行**聚合**（如"组合里 N 只现价隐含苛刻增速"），复用已加载的 `verdicts`，零新 IO。

**降级/新鲜度**：三面全部零迁移、零 ingest 依赖，只读现有快照与共识表。融合话 as-of 用 snapshot `computedAt` + consensus period，如实标注（守 CLAUDE.md 数据来源+日期规）。两面已有 `DataAsOfBadge`。

## 五、前端 UX / 视觉设计（贯穿，非事后补）

绑死既有设计语言（[[frontend-design-language]]）：仅 `--tt-*` token、机构级编辑质感、**克制的绿**、`PageHeader`/`DataStrip`/`AggregateRankingList` 既有基元、**禁 shadcn Card**、真数据当主角、去 AI 感（[[anti-ai-product-sense]]）。

- **融合行的视觉层级**：一行三段信息（谁在买 · 估值位置 · 隐含预期）须有**明确主次**，不是三个同权 chip 平铺。持有家数用 Mono 数字眉标（数据优先）；估值位置用既有 `ValuationBadge` 语汇（击球区绿/其余中性）；隐含预期为**弱化副标**（`--tt-faint`/`--tt-muted`），从属不抢戏。
- **顶层高亮（便宜 ∩ 高共识）**：用**克制**手段区分——细左边框重音 / 轻微底色 / 眉标，**不用**大色块、不用装饰图标、不用 emoji。高亮是"这几只值得先看"的安静信号，非营销横幅。
- **screener conviction tab**：与现有 tab 同构（sr-only 语义、44px 触达、aria-current），行布局复用现有 screener 行密度，避免另起一套视觉。
- **共识页估值列**：badge 融进 `AggregateRankingList` 现有行节奏，不撑破排行版式；窄屏列可折叠/让位（响应式表↔卡片规则见 [[ui-component-system]]）。
- **expectations 副标**：`full` 密度下作 badge 下方一行小字，字号/色阶低于位置档，**永远与位置并置**（单独一个"隐含 X%"无意义且像投机提示）。
- **响应式/主题**：窄屏不破版（`overflow-x` 或列让位）；dark/light 各扫一眼；触达区 ≥44px。
- **空态**：conviction 视图理论上不空（B 决策），但若真空（数据未 ingest/表缺）→ 优雅空态文案，非空壳、非报错。

## 六、合规红线

- 融合话是**观察不是建议**：`{N} 家持有 · {位置} · 现价隐含 {档}`。无 BUY/SELL/HOLD/目标价/"该买"。守 [[valuation-philosophy-constraint]]。
- 隐含数字**永远与位置/历史并置**，禁单独展示。
- 每 locale 纯本语言（禁中英混排，[[no-mixed-language-copy]]），遵 `web/docs/copy-voice.md`；位置/档次沿用既有术语（击球区/低于价值带/带内/高于价值；温和/公允/苛刻）。

## 七、测试与验收

项目无常驻测试（solo dev）：纯函数 `.check.ts` + `npx tsc --noEmit` + 部署后真数据抽查。**禁 `next build`**（本机 google fonts 被墙）。

1. `fusionSignal.check.ts`：排序键顺序（便宜档 rank < 带内 < 高于；同档 holderCount 高者靠前）；`isCheapConsensus` 阈值（holderCount≥5 ∧ 便宜 ∧ reliable）；缺 verdict/holderCount → 降级不崩。
2. `npx tsc --noEmit`（`web/` 下）零错。
3. 部署后真数据抽查：
   - `/stocks/screener` conviction 视图**非空**、顶层高亮的确是便宜∩高共识、按吸引力排序正确。
   - `/investors/consensus` top 票每行估值 badge 正确（多人持有但高于价值的如实显示）。
   - 某投资人页 posture 聚合行数与实际 verdicts 对得上；持仓表每行**未**被 expectations 塞乱。
   - 合规：无买卖/目标价措辞；隐含数字均带位置对照。
   - 窄屏/dark-light/44px 触达各扫一眼。

## 八、触及文件清单

- 新建 `web/src/lib/managers/fusionSignal.ts` + `.check.ts` — 纯函数内核。
- 新建 `web/src/lib/valuation/valuationSnapshot.ts` 内 `readConvictionScreen`（或同目录新文件）+ 扩 `ScreenView` 联合类型。
- 改 `web/src/app/[lang]/stocks/screener/page.tsx`（或其 tab/数据层）— conviction tab + 行渲染。
- 改 `web/src/app/[lang]/investors/consensus/page.tsx` — 接 `readValuationVerdicts` + 传估值槽。
- 改 `web/src/components/aggregate/AggregateRankingList.tsx` — `RankRow` 加可选估值槽。
- 改 `web/src/components/valuation/ValuationBadge.tsx` — `full` 密度多吐 expectations 副标。
- 改 `web/src/app/[lang]/investors/[slug]/page.tsx` — posture 小节聚合行。

## 九、这一步如何咬合竞争力

竞品全部零融合（dataroma/WhaleWisdom 纯 13F、券商估值另开页）。T1 让「聪明钱在买 × 这价格值不值」第一次在发现面上被**算出来、排出来、看得见**——这是全网唯一。前三期估值改造是为这一刻铺路；T1 是把它真正接通开火的最后一根线。后续 T3（把 13F 深化成更多信号喂给融合）在此之上继续加深。
