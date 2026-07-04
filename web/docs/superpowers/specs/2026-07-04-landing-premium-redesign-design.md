# Landing 高级化重做 — 设计文档

- 日期：2026-07-04
- 分支（待建）：`feat/landing-premium-redesign`，off `db-foundation`
- 归属：前端优化长期线（`frontend-optimization-thread`）的一环
- 状态：设计已逐段获批，待写实施计划

## 1. 背景与问题

用户反馈当前首页「太业余」。逐层诊断（用户确认四层全中）：视觉排版不精致、结构叙事平庸、缺机构/权威质感、动效交互廉价。另有一份先前发现的**入口重复**账未清。

技术根因（已实测定位，非拍脑袋）：

- **动效**：`SectionReveal` 给全站 9 个板块**无差别**套「fade-up 10px / 0.5s」。全站统一滚动淡入是最典型的模板/独立开发者 tell；且 9 个 `IntersectionObserver` + 内联 `opacity/transform` 带来 CLS 风险与客户端开销。
- **构图**：`FeatureRow ①②③` 是经典「SaaS 左右交替特性行 + 描边面板」，正是 2026 高端要抛弃的模板长相。
- **节奏**：全站 `max-w-5xl` 居中、`mt-20/mt-24` 等距、反复 `border-t pt-8`——单调堆叠，无满幅、无尺度对比、无编辑式不对称。
- **Hero**：字号克制（3xl→5xl），右侧「显著动向」只是描边表格盒，缺统率全屏的活数据主视觉。
- **入口重复**（正文内，不含全局 TopNav）：`/investors` 出现 **4 次**（Hero 药丸、TrackedInvestorsWall、FeatureRow①、ClosingCTA），`/stocks` **3 次**，`/stocks/screener` **2 次**；Hero 药丸与 ClosingCTA 药丸是**逐字相同**的三连；第 3、4 块（TrackedInvestorsWall + FeatureRow①）**背靠背都是投资者**。

**关键判断**：品牌既定方向（Fraunces serif + mono、暖纸编辑色板、克制绿、真 SEC 数据、不荐股不预测）**恰好踩在 2026 高端主脊上**（见下）。问题**不在方向、不在令牌/色板**，在**构图、节奏、动效的执行质感**。令牌本身保留。

## 2. 参照系（2026 当下高端 landing 共识，附来源）

- 编辑体 serif 大标题是「看起来是设计过的而非模板拼的」最快捷径；Robinhood 2024 改版把金融营销当**杂志**做。（[designrevision](https://designrevision.com/blog/fintech-saas-landing-pages)、[sitesplaced](https://sitesplaced.com/blog/best-landing-pages-of-2026)，2026）
- **单一美学信念，贯彻到每个尺度**——Awwwards 现给奖的金融站都是一个坚定视觉主张执行到底。（[Awwwards Fintech](https://www.awwwards.com/inspiration/fintech-design-basis)、[toimi](https://toimi.pro/blog/best-fintech-website-designs/)，2026）
- 金融站用**保守色板**（navy/深绿/白）+ 克制强调色，**把合规/来源披露当设计元素**；埋底的法律小字是「品类弱点信号」。（[shadowdigital](https://www.shadowdigital.cc/resources/best-fintech-website-design-examples)、[Blend B2B](https://www.blendb2b.com/blog/best-fintech-website-examples)，2026）
- 信任门槛越高越走向 **editorial microsite**：真数据织进正文、图表像活的仪表盘，而非单屏 hero + 卡片堆。参照 Mercury、Koyfin。（[stripedhorse](https://www.stripedhorse.com/blog/best-financial-website-designs)，2026）

**方向定案**：**A+B 混合**——编辑刊物骨架（A：Stripe Press / Robinhood 2024 / Mercury / The Economist）+ 一件真正活的数据主视觉（B：Koyfin / Bloomberg 的数据密度）。**排除方向 C（影院式炫技）**，撞「不 flashy SaaS / 机构克制」品牌红线。

## 3. 设计

### 3.1 信息架构（IA）+ 入口纪律

保留强产品逻辑「①跟谁 → ②共识 → ③便不便宜」，但每块只留一个入口、每块自带一件真数据。

| # | 板块 | 做法 | 唯一入口 |
|---|---|---|---|
| 1 | **Hero** | 巨型 Fraunces 编辑标题 + 一件统率全屏的活数据主视觉（本季显著动向升格为编辑 ledger + dateline）。**只留 1 个主 CTA**，删三连药丸 | 主 CTA → screener |
| 2 | **三步索引** | 取代 caption + 三条 FeatureRow，做成**编号编辑目录**（01/02/03）：① 超级投资者〔**内嵌** investor wall，吸收 TrackedInvestorsWall，消灭背靠背〕② 跨基金共识〔mini 表〕③ 估值〔strike leaders / 价值带兜底〕。每步一件真数据 + 一个 CTA | ①`/investors` ②`/investors/consensus` ③`/stocks` |
| 3 | **方法与信任** | FoundationsGrid → 「建立在一手来源之上」信任带，SEC 来源 / 45 天延迟 / 不荐股不预测**做成可见设计元素锁** | — |
| 4 | **哲学引语** | PhilosophyQuote 保留，编辑呼吸停顿 | Buffett 页 |
| 5 | **Learn** | LearnTeaser 保留 | `/learn` |
| 6 | **Closing** | **单一强 CTA**（「从任意投资者、任意股票开始 →」），删三连药丸；macro 入口收进底部信任锁 | 1 个 CTA |

**入口纪律（重做后）**：双药丸书挡整体删除；背靠背投资者块合并；每个目的地正文内只出现 **1 次**（TopNav 全局那份不算）。`/investors` 4→1，`/stocks` 3→1。

### 3.2 视觉 craft

- **字体尺度阶**（三档明确拉开）：Hero 主张 `clamp(text-6xl→7xl)` Fraunces medium `leading-[1.05] tracking-tight`；板块标题 `text-3xl→4xl`；眉标 mono `text-[10px]` uppercase `tracking-[0.14em]` 深绿。数字一律 mono `tabular-nums`。
- **间距节奏**（打破等距）：抛弃全站 `mt-20/24` 等距，改大小节奏交替（Hero 后大呼吸 ~`mt-32`，索引内部紧凑，信任带前再放大）。引入**一处近满幅**（`max-w-6xl` 内部分栏）打破 `max-w-5xl` 牢笼制造尺度对比。Hairline 分隔减量，只在真正换章处用。
- **不对称与网格**（去 SaaS 特性行相）：三步索引用不对称栏宽（如 `[0.4fr_0.6fr]`），左列大号 mono 序号 + serif 标题，右列真数据，像研究刊物 TOC。描边面板 `rounded-md border` 减重，多用 hairline 底线裸表格。

### 3.3 动效（从「全站淡入」改成「稀疏有意图」）

- **删除**包住 9 个 section 的 `SectionReveal` 无差别淡入。
- 只保留**两处**：(a) Hero 活数据 ledger 首屏**逐行 stagger 入场**（~60ms 递进，一次性，像终端在打印数据）；(b) 数字/CTA **微交互**（hover 下划线 accent 生长、→ 箭头位移）。
- 新增全局统一过渡曲线/时长 token（`--tt-ease` 等），取代各处散写的 `.5s ease-out`。
- 严格守 `prefers-reduced-motion`。

## 4. 改动范围

### 组件（`src/components/home/*`）

| 文件 | 动作 | 说明 |
|---|---|---|
| `HeroMasthead.tsx` | 重写 | 巨型 serif 主张 + 单 CTA + 活数据 ledger；吸收 DataStrip dateline |
| `SectionReveal.tsx` | 删除 | 移除全站淡入；如需 Hero stagger 另建小而有意图的 client util |
| `FeatureRow.tsx` | 删除 | 被编辑目录取代 |
| `TrackedInvestorsWall.tsx` | 并入 | 内容并进三步索引步①，文件删除或降级为 index 内部子件 |
| `FoundationsGrid.tsx` | 重写 | → 方法与信任带；**删九宫装饰图标格**（AI/模板 tell），改克制方法论陈述 + 3 条事实 lockup |
| `ClosingCTA.tsx` | 重写 | 单一强 CTA，去三连药丸；并入 macro 入口 |
| `StrikeLeadersCard.tsx` / `ValueBandCard.tsx` | 复用 | 步③真数据 / 兜底 |
| `PhilosophyQuote.tsx` / `LearnTeaser.tsx` | 保留（微调） | — |
| `StepIndex.tsx` | 新建 | 编号编辑目录，每步内嵌真数据 + 单 CTA |
| `TrustLockup.tsx` | 新建 | 来源/合规锁基元 |
| `page.tsx` | 重写编排 | 按 §3.1 骨架重排；数据读取见 §5 |

### 共享基元 / 全局

- `DataStrip`（common）：先查别处引用；home 若不再直接引，**保留基元本身**，不动其他页。
- `globals.css`：新增统一 `--tt-ease`/时长 token。
- **不碰** TopNav/SubNav/Footer、令牌色板（仅加 ease token）、SEO metadata（`altFor` 保持）——爆炸半径关在首页内。

### i18n / 数据 / 红线

- 双语 `COPY`（zh/en 纯本语言，不混排）；`localePath` 纪律沿用。
- **文案按「产品感/去 AI 感」重写**（见 §6.2b），不沿用现有 AI 腔 copy。
- 真数据来源不变（SEC 13F / 估值 snapshot），沿用现有 loader；dateline 标注**来源 + 季度 + 日期**。
- 不荐股不预测合规线升格为设计元素而非删除。

### 3.3b 文案声音（产品感 / 去 AI 感）

现有 copy 是 AI 味主源。重做必须换声音：

- **AI 腔病灶（禁）**：破折号抒情对仗（"See what they own — and what it's worth."）、对偶排比（"who's building… who's getting out"）、三元枚举花活（"— Buffett… Greenwald… asset… —"）、对冲词（"worth noting"）、万能过渡句（"Holdings are only the start."）、通用 SaaS 样板（"Get started" / "Browse free, no account."）。
- **产品感（要）**：每句带**具体名词 / 真数字**否则删；让真数据（真投资者名、真 ticker、真 \$、真持有人数）当情绪主角；有编辑立场（复利、只为已证实价值付费）；克制——数据能说话就少说、敢留白。
- **示范 before→after**（真数字由 dateline 注入，不写死）：
  - Hero EN：~~"See what they own — and what it's worth."~~ → "72 investors. One quarter. Every position they just reported."
  - Hero ZH：~~"看他们持有什么——以及值多少钱。"~~ → "72 位投资者，上季度刚上报的每一笔持仓。"
  - 估值 EN：~~"Holdings are only the start… pay only for proven value."~~ → "We value every holding on proven earnings and assets. No growth story you have to believe."
  - Closing EN：~~"Browse free, no account."~~ → "Every number links to the SEC filing it came from."

## 5. 性能与数据请求修复

首页 `page.tsx` 数据读要重排，顺手修实测发现的问题：

1. **`consensusHeld` 过取修复**：当前 `mostHeld(5000)` 拉最多 5000 行只为渲染 6 行 + 一个计数（`readConsensusHeld` SQL `... limit(5000)`），撞 Supabase egress。改为两条廉价查询：① `count`-only（`.gte("holder_count",2)` head:true，零行传输）取共识计数；② `.gte("holder_count",2).limit(6)` 取 Top-6。新增读函数，不改既有 `consensusHeld` 的其他调用方语义（若有）。
2. **客户端组件 9→1**：删 `SectionReveal` wrapper 后，home 树 `"use client"` 从 9 处降到 1 处（仅 Hero stagger util）；消除 9× IntersectionObserver 与首帧 CLS。
3. 其余读维持现状（均无请求时外部抓取，守 build-no-live-external-fetch）：`getLatestDgs10` 读 last-good、`readStrikeZoneLeaders` 已 `cache()`+count+limit、`notableMoves`/`getManagerIndex` 体量小、5 读 `Promise.all` 并行无瀑布。

## 6. 验收（四层，逐条过才算完成）

### 第 1 层 · 技术门

- `npx tsc --noEmit` = 0。
- grep-zero：`SectionReveal`、`FeatureRow` 引用清零；三连药丸（Hero/Closing 里 `{投资者,股票,估值}` 三连 `localePath` 数组）清零。
- 入口计数（按精确 `localePath`/`*Path` 目的地串判定，`/stocks/screener` 与 `/stocks` 分开算）：正文内 `/investors` 恰 1 次、`/stocks`（most-held hub）恰 1 次、`/stocks/screener`（Hero 主 CTA）恰 1 次、`/investors/consensus` 恰 1 次。
- Vercel preview 双语（zh/en）逐屏视觉验收（本地 `next dev` 被 google fonts 挡，运行时只能真机）。

### 第 2 层 · 设计原则（8）

1. 令牌唯一真相：颜色只用 `--tt-*`/语义 token；除新增 `--tt-ease`/时长外不引入裸 hex。
2. 字体系统：Fraunces 标题、mono 数字与眉标；眉标→标题→正文三级尺度明确拉开。
3. 绿色克制：深钱绿 `#1B5E3F` 只作单一 accent，不铺面。
4. 禁 SaaS 模板相：禁 shadcn Card / 描边盒堆叠；主用 hairline + 裸表格 + 编辑目录。
5. 不 flashy：无渐变炫彩、无影院式炫技；机构克制。
6. 动效稀疏有意图：全站淡入删除，仅 Hero ledger stagger + 微交互两处；统一曲线；守 `prefers-reduced-motion`。
7. RSC 边界：默认 server component，`"use client"` 只包动效/交互子件。
8. 响应式：遵守既定表↔卡片断点规则，移动端不塌。

### 第 2b 层 · 产品感 / 去 AI 感（6，用户明确强调）

1. **文案无 AI 腔**：无破折号抒情对仗、无对偶排比、无三元枚举花活、无对冲词、无万能过渡句、无通用 SaaS 样板（"Get started"/"Browse free"）。
2. **每句带具体名词/真数字**，否则删；形容词不承担说服。
3. **真数据当主角**：真投资者名 / ticker / \$ / 持有人数在视觉与情绪上领先，不是标题形容词。
4. **无装饰图标堆**：不给每个特性配一个图标铺网格（FoundationsGrid 九宫图标格必须删）。
5. **不过度标签化**：数据能说话的板块砍掉多余 eyebrow/body，敢留白；不是每块都三件套。
6. **有编辑立场与声音**：体现复利/只为已证实价值付费的观点，非中立功能罗列。

### 第 3 层 · 产品原则（7）

1. 忠于复利品牌 + 巴菲特/格雷厄姆语气；文案不制造 FOMO。
2. 禁投机/荐股/预测/个性化投资建议（美国投顾法约束线）；无「买入/目标价/必涨」类表述。
3. 合规护栏显性化：SEC 来源 / 45 天延迟 / 不荐股不预测升为可见设计元素，非埋底小字。
4. 真数据可溯源：每个数字回溯 SEC EDGAR；dateline 标注来源 + 季度 + 日期。
5. 英文优先 + 纯本语言：zh/en 各自纯本语言，禁中英混排（品牌锁形/既定术语除外）。
6. 权威而非增长噱头：贴北极星「机构级权威站 + 代表作」；免费浏览、无需账户的克制表达保留。
7. 三合一定位不失衡：13F×估值为主线，macro 入口保留但克制。

### 第 4 层 · 性能与数据请求

1. `consensusHeld` 5000 行 → count-only + limit(6) 两条廉价查询。
2. 客户端组件 9→1（删 SectionReveal wrapper）。
3. Vercel preview 确认首页数据读无大结果集、无请求时外部抓取。

## 7. 非目标（YAGNI）

- 不做方向 C 的影院式动效 / 视频 hero / scroll-linked morphing。
- 不动 TopNav/SubNav/Footer/令牌色板/SEO metadata/其他页面。
- 不引入新字体、新依赖、新图表库。
- 不改数据管道 / ingest / DB schema。
