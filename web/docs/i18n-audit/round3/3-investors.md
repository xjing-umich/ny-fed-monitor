# 第三轮 i18n 审核：投资人、买卖榜、共识榜

审核日期：**2026-10-30**。线上取证时间：香港时间 **23:41–23:43**。本报告只审核并写文档，没有修改产品代码。

源码基线：`b6aebf2c8d51d92907be60ab7ea7f45340bd689c`，本地目录 `/Users/junlinzhu/Desktop/TheCompounder/ny-fed-monitor-i18n`。主审核提供的生产基线为香港时间 21:22 上线的 Vercel `dpl_9sJPURQRzK77RZZDD1eBaZ6n5omA`；本分区直接读取正式域名的当前 HTTP 响应，并与该提交源码核对。

## 覆盖范围及证据边界

- 正式域名 `https://thecompounder.fyi` 的 **22 个中英文页面**：`/{zh,en}/investors`、`/investors/buys`、`/investors/sells`、`/investors/consensus`，以及详情 `berkshire-hathaway`、`baupost-group`、`hh-international`、`scion-asset-management`、`bridgewater-associates`、`daily-journal`、`olstein-capital`，全部 HTTP 200。
- 每次请求追加 `?tc_internal=1`；原始 HTML、metadata、main 文本、body 文本保存在 `/tmp/compounder-i18n-round3-20261030/investors/`。例如 `zh_investors_scion-asset-management.{html,json,txt,body.txt}`。`.json` 含完整请求 URL 和实际抓取时间。
- **HTTP 不能证明交互列表已经显示。** `/investors` 的 SSR 是 `Suspense` fallback「…」和静态全量目录。本报告只把目录、页头、metadata 记为在线观察；交互列表的筛选、排序、分页、空结果、移动端及读屏行为由主审核补 hydrated 快照。详情同时包含桌面表和移动卡片的 HTML，文本抽取会重复，不能据此认定页面上显示两遍。
- 样本特征：伯克希尔（新进/增持/减持/清仓四分支）、Baupost（净卖出、金额最大排序）、H&H（中文人名、ADS）、Scion（停报、期权）、桥水（ETF、大组合、按金额与按只数方向相反）、Daily Journal（机构归属、零交易、少于五仓）、Olstein（零持仓）。
- 下文金融数值只用于核对**界面用语和统计口径**，不是当前市场数据或投资研究结论；数据期和申报日按页面展示引用，没有将历史 13F 当作当前实时仓位。
- 参照：`../round2/README.md`、`../round2/4-investors.md`、`../../copy-voice.md`。第二轮的建议、待定方案均不自动视为当前授权。

## 结论

本轮没有发现需要定为 P0 的已复现 i18n 问题。**4 个 P1 仍会误导主体、时点或金额口径**：桥水归给达利欧、Scion 的“本季/季度披露”矛盾、期权与组合总值的解释不在可见正文、共识榜“占聚合”的分母没有说清。

PR B 的核心已经上线：净买卖按估算金额判定、动作使用文字与字形、详情增加季度变化、展示金额最大的动作、少量持仓默认展开/其余折叠、无交易时隐藏动作块。中文金额/季度/日期及主要公司名也明显改善。剩余问题应按下面的具体文案修正，不应重开已经解决的动作四词选择。

## 在线复现的问题

本节每条外部观察均采集于 **2026-10-30**；完整含审计参数的 URL 和时刻见证据 `.json`。文件行号均相对 `web/`，以本次提交为准。

### I01 · P1：桥水的当前申报和交易被归给达利欧

- **2026-10-30 / URL**：[中文](https://thecompounder.fyi/zh/investors/bridgewater-associates?tc_internal=1)、[英文](https://thecompounder.fyi/en/investors/bridgewater-associates?tc_internal=1)。原文 H1「达利欧」/ `Ray Dalio`，副标题「达利欧（Ray Dalio）掌管」/ `managed by Ray Dalio`；组合速览「较上一季度，达利欧新进 214 只…」，metadata `Ray Dalio's SEC 13F portfolio … Q2 2026`。JSON-LD 仍为 `Person: Ray Dalio`，`worksFor: Bridgewater Associates, LP`。
- **代码**：`src/lib/managers/displayName.ts:21` 的 stewardship 只有伯克希尔及 Daily Journal，`:46` 的机构名单没有桥水，`:57-62,81-90` 继续回退人名；`src/lib/managers/profileProse.ts:121,127` 将交易动作直接归给该 label；`src/app/[lang]/investors/[slug]/page.tsx:387-398` 输出 Person。
- **影响**：从 H1、正文到搜索摘要、结构化数据，都把机构 2026Q2 的申报写成创始人的当前决策。这不是简单的译名偏好。
- **重新核实的外部依据**（2026-10-30）：桥水官网当前 [People](https://www.bridgewater.com/people) 列示 Nir Bar Dea 及 Bob Prince、Greg Jensen、Karen Karniol-Tambour 等领导者；官方 [Completed Transition](https://www.bridgewater.com/people/bridgewaters-completed-transition)（原文发布日期 2022-10-04）说明日常管理和投资监督已完成向新领导团队/投资委员会的交接。没有依据将这份 2026 申报视为达利欧个人的操作。
- **推荐双语**：H1 `桥水基金` / `Bridgewater Associates`；副标题 `雷·达利欧创立；以下为桥水机构申报的 13F 持仓。` / `Founded by Ray Dalio; these are Bridgewater's institutional 13F holdings.`；所有交易主语和 Dataset 改机构，Ray Dalio 可保留为创始人检索入口。

### I02 · P1：Scion 明示历史数据，却仍以“本季”和持续披露描述

- **2026-10-30 / URL**：[中文](https://thecompounder.fyi/zh/investors/scion-asset-management?tc_internal=1)、[英文](https://thecompounder.fyi/en/investors/scion-asset-management?tc_internal=1)。原文同时出现「▲ 本季净买入」「美股持仓通过 SEC 13F 季度披露」「⚠ 已停报…以下为历史数据，并非当前持仓」；英文 `Net buyer this quarter`、`US equity positions disclosed quarterly via SEC 13F`、`Holdings below are historical, not current.`。动作实际是 `2025Q3` / `Q3 2025`。
- **代码**：`src/lib/managers/displayName.ts:81-90` 不接收 freshness；`src/lib/managers/investorConclusion.ts:20-26,105-107` 固定 this quarter；`src/components/investor/QuarterMovesBlock.tsx:15-16,27`；`src/components/investor/InvestorHoldingsTable.tsx:20,27`。
- **影响**：当前 2026 年页面把一年多前的动作叫“本季”，与紧邻停报警示自相矛盾。普通当前详情也在 10 月底用“本季”指 Q2，但停报样本的问题最明确。
- **推荐双语**：带实际期的 `2025Q3 净买入（历史申报）` / `Net buyer in Q3 2025 (historical filing)`；段标题 `该申报季变动` / `Changes in this filing`；停报主体副标题 `最后公开 13F 为 2025Q3；以下为历史持仓。` / `Last public 13F: Q3 2025; holdings below are historical.`。一般详情则用 `最新申报季变动` / `Latest 13F changes`，不要用日历本季。

### I03 · P1：组合市值排除期权，但期权大额仍与组合金额共用“Value”，解释仅藏在 title

- **2026-10-30 / URL**：[中文 Scion](https://thecompounder.fyi/zh/investors/scion-asset-management?tc_internal=1)、[英文 Scion](https://thecompounder.fyi/en/investors/scion-asset-management?tc_internal=1)。原文「组合市值 6810万美元 / 持仓数 4」，表格却列「Palantir…看跌期权 9.12亿」；英文 `Portfolio value $68.1M`，`PLTR PUT $912M`，另有 NVIDIA、Pfizer、Halliburton 期权行。
- **代码**：`src/app/[lang]/investors/[slug]/page.tsx:165,219,307-320` 总值及计数排期权；`src/components/investor/InvestorHoldingsTable.tsx:69-75` 解释仅在 `title="期权:市值为标的名义价值,非权利金"` / `Option: value is notional, not premium`，`:94-98` 共用金额列，`:49` 还按这一金额将期权排在普通持仓之前。
- **影响**：仅从可见正文，单行 9.12 亿比组合 6810 万大十余倍，且 4 个持仓实际列 8 行，像加总错误。中文 PUT/CALL 翻译已修，但第二轮的口径说明只算部分修复；`title` 不能替代正文或可靠的辅助说明。本报告没有做 hover/读屏实测。
- **推荐双语**：组合旁显示 `非期权持仓市值 · 不含期权` / `Non-option portfolio value · excludes options`；表上说明 `期权列示标的名义价值，不是权利金，也不计入组合市值及持仓数。` / `Options show underlying notional value, not premium, and are excluded from portfolio value and position count.`。可把期权独立成小节，金额列标 `名义价值` / `Notional value`。

### I04 · P1：共识榜“占聚合”其实只占当前榜内前 50 只的市值

- **2026-10-30 / URL**：[中文共识榜](https://thecompounder.fyi/zh/investors/consensus?tc_internal=1)、[英文](https://thecompounder.fyi/en/investors/consensus?tc_internal=1)。原文 MSFT「占聚合 3.3%」/ `3.3% of aggregate`，AAPL「占聚合 14.0%」/ `14.0% of aggregate`，没有分母说明。
- **代码**：`src/app/[lang]/investors/consensus/page.tsx:52` 只拉 `mostHeld(50)`；`:62,67` 用这 50 行的市值和作分母；`src/components/aggregate/AggregateRankingList.tsx:45-47` 却只写 aggregate。
- **影响**：容易被读成所有纳入机构的全部 13F 持仓市值占比，实际分母是按持有人数入榜的前 50 只。数值会随着榜单截断长度变化。
- **推荐双语**：如维持当前计算，写 `占榜内 50 只持仓市值 3.3%` / `3.3% of the listed 50 holdings' combined value`；如产品要显示全部样本市值占比，再调整分母并写 `占纳入机构全部非期权 13F 持仓市值` / `Share of all included non-option 13F holdings`。这是要先确认的统计展示选择，不能只把 aggregate 翻得更顺。

### I05 · P2：新“金额估算”的清仓估价时点及比例分母仍不完整

- **2026-10-30 / URL**：[中文伯克希尔](https://thecompounder.fyi/zh/investors/berkshire-hathaway?tc_internal=1)、[英文 Baupost](https://thecompounder.fyi/en/investors/baupost-group?tc_internal=1)。原文「净买入约 151亿美元（约占组合 6%）」、`net seller of about $302M (about 6% of the portfolio)`；方法只写「金额按季末价估算，只算正股」/ `Dollar amounts are estimated at quarter-end prices, stocks only (no options).`。
- **代码**：`src/lib/managers/quarterSummary.ts:35-39` 新进取当季值、清仓取上季值、增减按股数差乘当季末单价；`src/lib/managers/assemble.ts:68-69` 清仓 `value=ph.value`；`src/lib/managers/investorConclusion.ts:54-57` 比例分母是 `priorValue`；`src/components/investor/QuarterMovesBlock.tsx:22,33` 方法省略清仓例外。
- **影响**：“约”已避免把数字称成交金额，但“季末”没说哪一季，且比例看起来会按旁边最新组合市值计算。桥水还包含 SPY、IVV 等 ETF，“只算正股/stocks only”也比实际的“不含期权”窄。
- **推荐双语**：`约占上季非期权组合市值 6%` / `about 6% of prior-quarter non-option portfolio value`；方法 `增减按持仓数量变化与本季末价格估算；清仓用上季末持仓市值。不含期权，也不是实际成交金额。` / `Adds and trims use changes in reported holdings at current quarter-end prices; exits use prior quarter-end value. Excludes options; these are not actual transaction amounts.`。

### I06 · P2：详情新表头仍是“本季 / 市值”，百分比没有说明是持仓数量变化

- **2026-10-30 / URL**：[中文伯克希尔](https://thecompounder.fyi/zh/investors/berkshire-hathaway?tc_internal=1)、[英文](https://thecompounder.fyi/en/investors/berkshire-hathaway?tc_internal=1)。原文「标的 / 本季 / 市值(美元) / 占比」，GOOGL 为 `▲ +45%`；英文 `Security / This qtr / Value / Weight`。
- **代码**：`src/components/investor/InvestorHoldingsTable.tsx:20,27,84-98`；`src/lib/managers/investorConclusion.ts:96-101`；百分比实际来自 `src/lib/managers/assemble.ts:59-64` 的股数变化。
- **影响**：第二轮“新增季度变化列”已落地，但简写仍可能被读成市值或权重增幅，中文“市值”仍易理解成公司总市值。“本季”的时点问题见 I02。
- **推荐双语**：`持仓数量变动` / `Position-size change`，辅助说明 `较上季申报数量；已知拆股已调整` / `Change in reported shares or units versus the prior filing, adjusted for known splits`；`持仓市值（美元）` / `Holding value`。ETF 用份额、普通股用股数，不应把所有数量统称“股”。当前表没有原始股数列，因此未从 HTTP 样本发现股/份绝对数量误标。

### I07 · P2：买卖榜单行动作标签是“多数动作”，却未说明

- **2026-10-30 / URL**：[中文买入榜](https://thecompounder.fyi/zh/investors/buys?tc_internal=1)、[英文](https://thecompounder.fyi/en/investors/buys?tc_internal=1)。原文 MSFT 行「增持 / 买方持仓合计 119亿美元 / 20 位投资者」；英文 `Added / Buyers' combined stake $11.9B / 20 managers`。页头说明实际统计“新进或增持”。卖出榜同样把清仓/减持合并人数却在行上仅显示 `Trimmed`。
- **代码**：`src/app/[lang]/investors/_movesPage.tsx:84-90` 取 `r.dominantKind` 作为唯一 kindLabel，而 `primary=r.count` 是两种动作合计。
- **影响**：用户可能把这一行理解为 20 位全部“增持”，标签并不能代表全部计数。
- **推荐双语**：直接用范围标签 `新进或增持` / `Opened or added`，`清仓或减持` / `Exited or trimmed`；若保留 dominantKind，则写 `以增持为主` / `Mostly adds`，并保留总计动作范围。

### I08 · P2：中文目录仍混用全名、只有姓氏的音译和机构

- **2026-10-30 / URL**：[中文投资人目录](https://thecompounder.fyi/zh/investors?tc_internal=1)。原文同一目录有「塞斯·卡拉曼」「帕特·多尔西」「约翰·罗杰斯」，也有「泰珀」「盖纳」「米勒」「戴维斯」「斯皮尔」「勒布」，另有英文全名与机构名。英文目录仍为 `Ravenel Boykin Curry`。
- **代码**：`src/lib/aliases/config.ts:24-28,62-69` 是精选名单全名优先、其余取别名首词；`src/lib/investorAliases.ts:14,17,30-31` 等仍以姓氏音译为首词；`src/lib/managers/displayName.ts:57-62` 直接使用该结果。
- **影响**：一些译名无法独立识别，展示风格随是否进精选名单变化。帕特·多尔西、约翰·罗杰斯两处明确错误已经修复，不能再列为未修。
- **推荐双语**：展示名与搜索别名分开，第一次用完整公认名字；如 `大卫·泰珀 / David Tepper`、`汤姆·盖纳 / Tom Gayner`、`克里斯·戴维斯 / Chris Davis`、`盖伊·斯皮尔 / Guy Spier`。机构主导的名称规则单独确认；桥水应优先按 I01 修正归属。

### I09 · P2：中文“按姓名排序”目录仍使用英文 collation

- **2026-10-30 / URL**：[中文目录](https://thecompounder.fyi/zh/investors?tc_internal=1)。原文标题「全部 97 位投资人，按姓名排序」，中文段为「伊坎、伯科威茨、佩尔茨、勒布、哈尔沃森…」，不是拼音顺序。
- **代码**：`src/components/list/LinkDirectory.tsx:30` 固定 `localeCompare(...,"en",...)`，组件没有 lang；`src/app/[lang]/investors/page.tsx:25,108-115` 给它中文标题和 label。
- **影响**：中文读者无法按标题预期定位名字。该观察针对 SSR 静态目录，**不是交互表默认排序**。
- **推荐双语**：中文目录用 `zh-CN-u-co-pinyin`，标 `按名称拼音排序`；英文维持 `A–Z`。中英文混排在同一规则下如何分组应明确一次。

### I10 · P2：名称清洗仍漏注册地尾缀、截断名称和正文中的中文名

- **2026-10-30 / URL**：[中文目录](https://thecompounder.fyi/zh/investors?tc_internal=1) 原文 `Sound Shore Management Inc /Ct/`、`Southeastern Asset Management Inc/Tn/`、`Fairfax Financial Holdings Ltd/ Can`；[英文 Baupost](https://thecompounder.fyi/en/investors/baupost-group?tc_internal=1) 原文 `Restaurant Brands Intern`、`Norwegian Cruise Line Holdin`；[中文桥水](https://thecompounder.fyi/zh/investors/bridgewater-associates?tc_internal=1) 原文 `Ishr Ibx Usd Invgd Cb Etf-Ui`。伯克希尔速览先写「苹果 Apple Inc」，稍后同段写「按市值计，Apple Inc 目前排在第 1 位」。
- **代码**：`src/lib/format.ts:132-160` 州尾缀正则不含最后一条 `/`，且 `/ Can` 不在清理范围；`:166` 起截断名称修补未覆盖样本。`src/lib/managers/profileProse.ts:154,158` 排名句将 name 放在纯字符串，绕过 `InvestorProfileProse.tsx:34-35` 的中译处理。
- **影响**：名称仍像未加工的 SEC 原始字段；部分关键名无法读全，同一正文实体名也不一致。
- **推荐双语**：核实后补全展示名，如 `Restaurant Brands International`、`Norwegian Cruise Line Holdings`，ETF 应按 ticker/CUSIP 对应官方全名处理；州/国家尾缀应按独立元数据规则剥离。排名句使用同一实体渲染函数：`苹果（AAPL）按持仓市值列第一。` / `Apple (AAPL) ranks first by holding value.`。

### I11 · P2：英文把持仓人次之和写成独立组合数量

- **2026-10-30 / URL**：[英文共识榜](https://thecompounder.fyi/en/investors/consensus?tc_internal=1)。原文 `Among the 94 superinvestors… The top 5 consensus names appear in 192 portfolios combined.`；[中文](https://thecompounder.fyi/zh/investors/consensus?tc_internal=1) 是准确得多的「前五大共识股合计出现 192 人次」。
- **代码**：`src/lib/aggregate/blurb.ts:16,23` 实际把前五只的 holderCount 相加。
- **影响**：94 位样本里似乎出现 192 个 portfolio；同一机构持有多只时重复计数，不能用未限定的 portfolios 描述。
- **推荐双语**：`前五只股票合计有 192 次机构持仓记录，同一机构可重复计数。` / `The top five stocks account for 192 fund-stock holdings, counting a portfolio once for each stock it owns.`，也可删掉这一重复总和。

### I12 · P2：英文复合主语仍用 has

- **2026-10-30 / URL**：[英文伯克希尔](https://thecompounder.fyi/en/investors/berkshire-hathaway?tc_internal=1)。原文 `Warren Buffett & Greg Abel has no confirmed strike-zone positions right now.`。
- **代码**：`src/lib/discovery/discoveryHandoff.ts:89` 固定 `${person} has`。
- **影响**：第二轮已报的基础语法错误仍在线。人名组合及机构主语无需复杂推断即可避免。
- **推荐双语**：`该组合暂无已确认的击球区持仓。` / `This portfolio has no confirmed strike-zone positions.`；若保留两个人名则用 `have`。

### I13 · P2：只有四个持仓，首屏仍说“前 5 大”

- **2026-10-30 / URL**：[中文 Daily Journal](https://thecompounder.fyi/zh/investors/daily-journal?tc_internal=1)、[英文](https://thecompounder.fyi/en/investors/daily-journal?tc_internal=1)，原文「持仓数 4 / 前 5 大占 100%」/ `Holdings 4 / Top 5: 100%`。Scion 也如此，而正文已正确写 `top 4 holdings`。
- **代码**：`src/app/[lang]/investors/[slug]/page.tsx:306,320` 计算最多取五项，标签却固定 5；`src/lib/managers/profileProse.ts:68,85` 已使用 `Math.min(5,...)`。
- **影响**：边界样本会让读者以为少了一行、少了一个持仓。
- **推荐双语**：沿用正文计数，`前 4 大占 100%` / `Top 4: 100%`，或 `全部 4 个持仓` / `All 4 positions`。

### I14 · P2：中文 OG 图 alt 仍为静态英文

- **2026-10-30 / URL**：[中文详情](https://thecompounder.fyi/zh/investors/baupost-group?tc_internal=1)、[buys](https://thecompounder.fyi/zh/investors/buys?tc_internal=1)、[sells](https://thecompounder.fyi/zh/investors/sells?tc_internal=1)、[consensus](https://thecompounder.fyi/zh/investors/consensus?tc_internal=1)。metadata 原文分别 `Superinvestor 13F holdings — Compounder`、`Superinvestor 13F top buys — Compounder`、`Superinvestor 13F top sells — Compounder`、`Superinvestor 13F consensus holdings — Compounder`。
- **代码**：`src/app/[lang]/investors/[slug]/opengraph-image.tsx:6`，三个榜单的 `opengraph-image.tsx:3`。
- **影响**：中文分享卡的替代文本仍是英文，第二轮问题未修；本报告未对生成图片本身重新做视觉验收。
- **推荐双语**：详情 `塞斯·卡拉曼的 13F 持仓 — Compounder · 复利` / `Seth Klarman's 13F holdings — Compounder`；榜单按各自本地化标题生成 alt，而非静态 export。

### I15 · P3：唯一一只新进仍写“最大的新进”

- **2026-10-30 / URL**：[中文伯克希尔](https://thecompounder.fyi/zh/investors/berkshire-hathaway?tc_internal=1)、[英文](https://thecompounder.fyi/en/investors/berkshire-hathaway?tc_internal=1)。原文新进 1 只，随后「其中最大的新进持仓是 D.R. Horton Inc」/ `The largest new buy was D.R. Horton Inc.`。H&H 也走同样分支。
- **代码**：`src/lib/managers/profileProse.ts:123,129` 只检查是否存在第一项。
- **影响**：数值不算错，但文案制造不存在的比较；不符合 copy-voice 的具体性要求。
- **推荐双语**：`唯一新进的是 D.R. Horton（DHI）。` / `The only new position was D.R. Horton (DHI).`，多于一只再写 largest。无需加入未经核实的“大/小买卖”判断。

### I16 · P3：英文买榜 opened/added 缺少 position/stake，持仓“未变”范围也可更精确

- **2026-10-30 / URL**：[英文买榜](https://thecompounder.fyi/en/investors/buys?tc_internal=1)。原文 `Stocks most superinvestors opened or added in Q2 2026.`、`MSFT drew the most buying — opened or added (20 superinvestors)`；[英文 Daily Journal](https://thecompounder.fyi/en/investors/daily-journal?tc_internal=1) 表格 `Unchanged` 实际只指报告的持仓数量。
- **代码**：`src/app/[lang]/investors/_movesPage.tsx:108`；`src/lib/aggregate/blurb.ts:37-39`；`src/lib/managers/investorConclusion.ts:99`。
- **影响**：英语通常是 open a position / add to a position，不能直接 opened a stock。Unchanged 可被读成金额或仓位均不变。
- **推荐双语**：`2026Q2 最多机构新进或增持的股票。` / `Stocks in which the most tracked managers opened or increased positions in Q2 2026.`；数量未变写 `持仓数量未变` / `Share/unit count unchanged`。

### I17 · P3：零持仓仍接上估值导流句

- **2026-10-30 / URL**：[中文 Olstein](https://thecompounder.fyi/zh/investors/olstein-capital?tc_internal=1)、[英文](https://thecompounder.fyi/en/investors/olstein-capital?tc_internal=1)。正文已明确本次申报零持仓、没有持仓表和估值模块，页尾却仍写「Robert Olstein 目前没有已确认的击球区持仓」/ `Robert Olstein has no confirmed strike-zone positions right now.`。
- **代码**：`src/app/[lang]/investors/[slug]/page.tsx:251,457-461` 已隐藏持仓表，但 `:517` 的页底 handoff 未以 zeroReport 隐藏；`src/lib/discovery/discoveryHandoff.ts:84-90` 使用通常估值空状态。
- **影响**：第二轮“空组合不应跑估值式文案”仍剩这一处；该句逻辑上为真，但暗示做过正常估值覆盖。
- **推荐双语**：零持仓时隐藏此 handoff，或 `本次申报没有可供估值的持仓。` / `This filing has no positions to assess.`。全市场浏览链接可作为独立导航保留。

## 主审核交互补验与仅代码发现

### C01 · P2：移动排序的升降方向没有可听文本（主审核在线补验）

- `src/components/common/DataTable.tsx:230-253` 的移动排序按钮只有 `aria-pressed`，方向箭头在 `aria-hidden` 中；桌面 `:158-160` 才渲染传入的 sr-only 文案。**已修的部分**：`InvestorListClient.tsx:60-61,91-92,310-312,329-331` 已传中文/英文排序状态及排序组名。
- 原文代码：`{isActive && <span aria-hidden>{sortDir === "asc" ? " ↑" : " ↓"}</span>}`。点击改变方向后，移动辅助树可能只宣布“已按下”而不宣布升/降序。
- **2026-10-30 / URL**：[中文投资人列表](https://thecompounder.fyi/zh/investors?tc_internal=1)。主审核在 375px 手机视口实测，活动按钮 accessible name 为「持仓市值（美元）」、`aria-pressed=true`，箭头是 `aria-hidden`，没有方向文本或 aria-label。本分区没有自行使用浏览器工具；这是主审核提供的补验证据。此问题由主审核合并进全站无障碍条目，避免跨区重复计数。
- 推荐：移动活动按钮也加 sr-only `已按升序排列 / 已按降序排列`、`sorted ascending / sorted descending`，或将方向放入 accessible name。

### C02 · P2 候选：1 trade 的单数分支仍未修

- `src/lib/managers/valuationPosture.ts:98-101` 固定 `${cheap} trade below intrinsic value`，`cheap===1` 时仍应为 `1 trades below intrinsic value`，更自然为 `one position trades below intrinsic value`。
- 本次所有指定在线详情的估值均为 Not assessed / 未评估，没有触发估值姿态段，**未在线复现**，不重复声称已看到 Scion 的 `1 trade`。
- 推荐双语：`有 1 只持仓现价低于内在价值` / `1 position trades below intrinsic value`；复数 `N positions trade…`。

### C03 · P2 候选：分享内容仍存在术语、时点与排名范围问题

- `src/lib/share/shareText.ts:24-27` 将 new position 写为「本季新增」/ `added … this quarter`；`:36-37` 仍写「顶级投资者」「本季」/ `#1 consensus pick`；`:56-57` 把清仓与减持合计的卖出榜写成“减持”。详情调用 `page.tsx:234-238` 没传报告期；共识输入类型也没有 quarterLabel。
- 推荐：传实际报告期，用 `新进 / opened a new position`；共识用 `2026Q2 最多机构共同持有` / `most widely held in Q2 2026`；卖出用 `清仓或减持 / exited or trimmed`。本分区没有点击分享或读取剪贴板，所以只标代码发现；主审核可在不实际发布的前提下查看分享菜单/链接参数。

### C04 · P3：列表环比仍可能显示 +0%（主审核在线补验）

- **2026-10-30 / URL**：[中文投资人列表](https://thecompounder.fyi/zh/investors?tc_internal=1)。主审核 375px 手机快照中第三行奈格伦显示「752亿 +0%」。`src/app/[lang]/investors/InvestorListClient.tsx:97-100` 只排除原始值等于零，微小正值仍 `toFixed(0)` 为 +0%。
- 影响：显示一个方向符号却没有可见变化，属于低优先格式问题，不能据此断言真实增长恰好为零。推荐 `+<1%` / `+<1%`，或明确精度后写 `基本持平 / Roughly unchanged`；与全站百分比格式器统一。

## 第二轮与新 PR B 的核销

以下在线样本均为 **2026-10-30**，引用页面原文作为核销依据；没有把“源码看起来修了”当作客户端已经生效。

| 旧问题 / PR B 目标 | 本轮状态和当前证据 | 代码依据 |
|---|---|---|
| 动作四件套混用“新建/加仓/减仓” | **已修（本范围可见正文）**。[伯克希尔](https://thecompounder.fyi/zh/investors/berkshire-hathaway?tc_internal=1)「● 新进 1 · ▲ 增持 7 · ▼ 减持 6 · ○ 清仓 1」；英文 New/Added/Trimmed/Exited。分享仍有残留，见 C03 | `quarterMovesText.ts:7-10`；`QuarterMovesBlock.tsx:59,77` |
| 净买卖按只数判断 | **详情已核销**。[桥水](https://thecompounder.fyi/zh/investors/bridgewater-associates?tc_internal=1) 买入类 214+399=613，卖出类 378+210=588，但标「净卖出约 48亿美元」；证明已用金额方向。主审核另确认手机列表出现净买入/净卖出/基本持平及 2% 方法说明；具体桥水行的金额一致性仍可补核 | `quarterSummary.ts:35-39,62-74`；`supabase.ts:90-113` |
| 动作使用估值绿/错误红 | **详情 PR B 已修**。新进/增持/减持/清仓使用中性色+字形。**未全覆盖**：买卖榜仍 positive/warn，consensus 人数下降仍 negative，保留为产品颜色决策，不能称全站已统一 | `InvestorListClient.tsx:110-120`；`QuarterMovesBlock.tsx:59`；`_movesPage.tsx:21-25`；`AggregateRankingList.tsx:60` |
| 金额最大动作 / 按金额排序 | **详情已修**。[Baupost](https://thecompounder.fyi/en/investors/baupost-group?tc_internal=1) `biggest move … trimming Wesco … $267M`，随后 exit $260M、adds $156M/$149M、new $137M，按金额绝对值降序；不再用当前持仓大小称最大调仓 | `quarterSummary.ts:76-82` |
| 买入榜金额被误当买入额；卖榜混合金额 | **已修主要标签**。[买榜](https://thecompounder.fyi/zh/investors/buys?tc_internal=1)「买方持仓合计 119亿美元」/ `Buyers' combined stake $11.9B`；[卖榜](https://thecompounder.fyi/en/investors/sells?tc_internal=1) 无混合口径金额。建议再补“季末”但不再报成完全无标签 | `_movesPage.tsx:88-89` |
| 详情缺季度变化列 | **结构已修，文案部分修复**。伯克希尔 GOOGL `▲ +45%`、DHI `● 新进`；仍需 I06 表头和计量口径说明 | `InvestorHoldingsTable.tsx:83-90` |
| 中文金额、季度、日期、极小占比 | **样本已修**。伯克希尔「2990亿美元」「2026Q2」「2026年6月30日」，DHI「58.1万」「<0.1%」；英文 `$299B`、`Q2 2026`、`Jun 30, 2026`。没再看到旧 B/M 金额和正文 ISO 日期 | `i18n/format.ts` 及各调用 |
| 中文页面没有公司中文名、PUT/CALL 未翻译 | **主要可见列表与正文已修**。买榜「微软 Microsoft Corp」「亚马逊 Amazon.com Inc」；Scion「看跌期权」「看涨期权」。名称清洗和纯字符串句子仍有 I10，期权解释仍有 I03 | `AggregateRankingList.tsx:42`；`InvestorHoldingsTable.tsx:68-74` |
| 伯克希尔/Daily Journal 归属 | **样本已修主要事实表达**。伯克希尔说明阿贝尔任 CEO、巴菲特任董事长；Daily Journal 说明芒格生前建立、之后申报不是其决定；DJ H1 为机构。桥水遗漏见 I01 | `displayName.ts:21-42` |
| 停报的搜索摘要 | **Scion 已修**。title `Last 13F Holdings Q3 2025 (No Longer Filing)` /「最后一份 13F 2025Q3（已停报）」；主文仍有 I02 矛盾 | `[slug]/page.tsx:94-107,111-126` |
| 零交易/空组合机械动作块 | **主要结构已修**。Daily Journal 没有动作 H2/徽章；Olstein 明说零持仓并隐藏持仓表/估值段，且无净卖出判定；剩 handoff 见 I17 | `investorConclusion.ts:14-17`；`[slug]/page.tsx:249-269,457-461` |
| “聪明钱 / smart money”SEO | **列表已修**。[列表 metadata](https://thecompounder.fyi/zh/investors?tc_internal=1)「查看 97 位超级投资者的 SEC 13F 持仓、仓位大小与季度增减，以 2026Q2 为比较季度」；英文 `Explore 97 superinvestor portfolios…`。共识 meta 仍有“顶级价值投资者”，属于声音统一残留 | `seo.ts:90-100`；`consensus/page.tsx:36` |
| 两个明确人名译名、部分 EDGAR 名 | **已修部分**。目录「帕特·多尔西」「约翰·罗杰斯」「Baupost Group LLC」「Dodge & Cox」「Leon G Cooperman」；详情 `D.R. Horton Inc`、`NVIDIA Corp`。未修范围见 I08/I10 | `aliases/config.ts:25-28`；`format.ts:132-168` |
| 日期标题“数据截至”应更具体 | **日期格式已修；名词未改**。各详情仍 `Data as of` /「数据截至」，表述为“持仓截至/Holdings as of”更准确。不是优先阻断项 | `FreshnessBadge.tsx` |
| 详情 Dataset 缺语言 | **已修**。在线 JSON-LD 有 `inLanguage: zh-CN/en`；买卖榜及共识 ItemList 仍未设置，交由全局/工程区合并追踪 | `[slug]/page.tsx:352`；`_movesPage.tsx:115-123`；`consensus/page.tsx:84-91` |
| 交互表排序与空状态漏英文 | **不能从 HTTP 完成核销**。代码已双语 noResults、clear、sortGroup 和桌面 sort state；主审核手机补验确认移动方向缺失（C01）。详情无持仓时已不渲染 DataTable，不能把公共默认 `No data available` 直接当本页在线漏翻译 | `InvestorListClient.tsx:46,60-61,77,91-92,309-312,328-331` |

## 待决策及主审核补验

1. **名称展示规则**：机构主导时以机构为主、人物为辅助；未知公认译名保留英文全名。桥水当前归属属于 I01 确定性修正；其余 D4 风格不是已授权的批量改名。
2. **“投资人/投资者”统一**：列表标题“超级投资者”，搜索“投资人或机构”，目录“97 位投资人”，详情“这位投资者”仍混用。选择一个用户面对的词及机构统称；英语 Investor/Firm 也应与主体模型一致。
3. **Consensus/共识是否继续用**：现在只是共同持有人数，不代表投资意见一致。至少配“按持有人数”的明示说明；中文“顶级价值投资者”、英文 share 的 `#1 consensus pick` 应按 copy-voice 改成可核对事实。
4. **多类股**：[2026-10-30 共识榜](https://thecompounder.fyi/zh/investors/consensus?tc_internal=1) GOOGL/GOOG 分别第 2/4，BRK.B/BRK.A 也分行；伯克希尔详情同样分列。保持分证券可以成立，但必须说明；是否按发行人合并要连同持有人去重、金额及权重一起设计，不能仅改名字或相加人数。
5. **颜色**：PR B 的投资人详情/列表已中性，旧聚合榜的正负色没全部更换。维持或统一由主审核汇总决策，本报告不把第二轮颜色建议当作已确认规范。
6. **主审核 hydrated 补验**：中英文 `/investors` 默认/点击排序、`?vf=buying/selling/mixed`、不匹配搜索空状态、清空筛选、分页和移动排序 accessible name；尤其核对桥水列表是否也按金额显示净卖出，Baupost/Scion 的行是否与详情一致。共享 capture 只能核对序列化 props/源码，不能替代这一步。
7. **估值为空的措辞**：本次指定详情均多为“未评估/Not assessed”，但页尾写“没有已确认的击球区持仓”。它没有直接说“高估”，仍可更具体为“尚无可靠估值覆盖”类分支；需要结合实际覆盖状态设计，不因本轮 HTTP 样本空估值便推断估值管线故障。

## 建议修复顺序

先修 I01–I04 的主体、时点、期权与分母，再统一 I05–I07 的单位和金额口径。I08–I14 可集中到名称、编辑及无障碍批次；I15–I17 是轻量文案分支。上述均为审核建议，当前任务没有执行修复、提交、推送或创建 PR。
