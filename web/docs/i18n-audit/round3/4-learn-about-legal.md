# 第三轮：Learn、季度报告、About 与法律页

审核日期：2026-10-30。生产基线为当日 21:22 香港时间上线的 `b6aebf2c8d51d92907be60ab7ea7f45340bd689c`。本报告只记录审核结果，没有修改产品代码。

## 结论与证据边界

Learn 和法律页的中文半角标点问题已明显修复，Q1/Q2 静态文章也已有季度快照提示。主要剩余问题集中在：静态正文没有跟随格式化层迁移；中文长文保留逐句直译；历史附注用了会过期的现在时；少数中英文句子会把财务概念或页面规则说错。About 的来源披露仍不足以解释站内股价、利率与模型估值从何而来。

HTTP 采集时间为 **2026-10-30 23:42:00–23:42:07（香港时间）**。通过线上 Learn 索引真实链接发现 7 篇文章，再与当次生产 sitemap 核对；没有猜测文章 slug。共采集 24 个 HTML 页面：索引 2 页、7 篇静态文章的中英文 14 页、About/Terms/Privacy/Disclaimer 中英文 8 页，均返回 200。每次请求带 `?tc_internal=1`，下文链接省略该内部参数。证据目录为 `/tmp/compounder-i18n-round3-20261030/learn/`，保存原始 HTML、HTTP/抓取时间、标题、meta、链接、main/body 文本。

当次索引和 sitemap **没有列出独立动态季度报告**。Q1/Q2 路由优先返回手写文章（`web/src/app/[lang]/learn/[slug]/page.tsx:35`），不能据这两页认定 `ReportArticle` 已在线上验收。下文把模板问题单独标为代码路径证据；不把未发布页面写成线上复现。没有使用浏览器，不评价排版、OG 图片像素、点击行为或读屏效果；这些由主审核负责。没有重新拉取财报、行情、利率，也没有核实文中历史数字的投资含义。以下金额、人数和日期只作当次页面文本样本。

## P1：先修影响理解与信任的表述

### L1 · 中英都把现金流金额和净利率直接比较

- 线上：[中文生意质量](https://thecompounder.fyi/zh/learn/reading-business-quality)、[英文](https://thecompounder.fyi/learn/reading-business-quality)，2026-10-30。
- 原文：「Alphabet 的自由现金流只有净利率的一半出头」；“Alphabet's free cash flow running at a little more than half its net margin”。
- 位置：`web/src/lib/learn.ts:671`、`:605`。同篇前文比较的是 FCF 利润率与净利率，这里漏掉 `margin`，把金额与比例变成了同一量纲。
- 成品替换（沿用文章历史样本，不更新数字）：
  - ZH：「Alphabet 的自由现金流利润率约为净利率的一半。这反映了它当时的大额投入，接下来要判断的是，这些投入能否带来回报。」
  - EN: “Alphabet's free-cash-flow margin was a little more than half its net margin. The company was investing heavily; the question is whether that spending will earn a return.”

### L2 · 把申报期限写成数据最多只旧 45 天

- 线上：[如何读懂 13F](https://thecompounder.fyi/zh/learn/how-to-read-a-13f)、[英文](https://thecompounder.fyi/learn/how-to-read-a-13f)；[跨基金共识](https://thecompounder.fyi/zh/learn/reading-cross-fund-consensus)、[英文](https://thecompounder.fyi/learn/reading-cross-fund-consensus)；[Q1](https://thecompounder.fyi/zh/learn/q1-2026-superinvestor-consensus)、[英文](https://thecompounder.fyi/learn/q1-2026-superinvestor-consensus)，2026-10-30。
- 原文：「首先，它最多能滞后 45 天」「13F 最多能比真实组合滞后 45 天」；“it can be up to 45 days stale”; “A 13F is long-only, up to 45 days old”。页面同时又说仓位可能已是几个月前，读者会误把截止期限当成最大陈旧程度。
- 位置：`web/src/lib/learn.ts:63`、`:104`、`:232`、`:274`、`:338`、`:402`。Q2 的“when it lands / 交上来时”已缩小语义范围，但其他常青文章仍没有这个限定。
- 成品替换（不重写监管期限规则）：
  - ZH：「13F 披露的是季末那一天的持仓。等你读到申报时，仓位可能已过去数周甚至数月，此后也可能发生变化。」
  - EN: “A 13F is a quarter-end snapshot. By the time you read it, the positions may be weeks or months old and may have changed.”
- 如保留具体申报期限，另起一句解释期限及顺延规则；这部分属于监管表述，须专业确认，不能把“45 天”继续写成文章在任何阅读日期下的陈旧上限。

### L4 · About 把模型当作公开数据，来源又几乎只列 13F

- 线上：[中文 About](https://thecompounder.fyi/zh/about)、[英文](https://thecompounder.fyi/about)，2026-10-30。
- 原文：「我们把两类公开数据放到一起：超级投资者的 SEC 13F 持仓和基金之间的重叠，以及单只股票的估值框架。」来源段仅为「主要为…EDGAR 系统（13F 等申报）」；英文同样写 “two kinds of public data” 和 “primarily … EDGAR”。
- 位置：`web/src/lib/about.ts:18`、`:39`、`:59`、`:80`。
- 代码交叉证据：默认股价链为 Yahoo → 东方财富，`web/src/lib/prices/providers/index.ts:62`；SEC XBRL 为 `web/src/lib/sec/company-facts.ts:33`；FRED 为 `web/src/lib/sources/fred.ts:37`。**更正旧报告：Stooq 只是休眠导出，不在当前默认链中（providers/index.ts:8），不要沿用 round2 的三源并列建议。**这些仅说明当前代码配置，不能替代逐条价格实际来源字段。
- About 成品替换：
  - ZH：「我们整理超级投资者公开披露的持仓，并用财报、股价和利率数据估算个股价值。持仓来自 SEC EDGAR 的 13F 申报；财务数据来自 SEC XBRL 财报；股价默认取自 Yahoo Finance，必要时使用东方财富；美国国债收益率来自 FRED。估值由本站模型计算，不是监管机构发布的数据。各项数据的报告期、价格日期和具体来源以相应页面标注为准。」
  - EN: “We organize superinvestors' disclosed holdings and estimate stock values using financial statements, prices, and interest rates. Holdings come from SEC EDGAR 13F filings; financials come from SEC XBRL filings; prices use Yahoo Finance, with Eastmoney as a fallback; and U.S. Treasury yields come from FRED. Valuations are estimates from our own models, not data published by a regulator. See each page for the reporting period, price date, and specific source.”
- 免责声明也有同样披露缺口（[中](https://thecompounder.fyi/zh/disclaimer)、[英](https://thecompounder.fyi/disclaimer)，`web/src/lib/legal.ts:43`、`:76`），但免责声明的责任表述及来源条款须专业确认；本报告不直接给法律实质替换意见。

## P2：静态文章、索引和说明页的可执行修改

### L3 · P2：历史附注用了会过期的现在时

- 线上：[中文 Q2](https://thecompounder.fyi/zh/learn/q2-2026-superinvestor-consensus)、[英文](https://thecompounder.fyi/learn/q2-2026-superinvestor-consensus)，2026-10-30。
- 原文：「当时计入 92 位。之后修复了两位投资人的申报读取（Ackman 的 13F-NT 代报、Olstein 的零持仓申报），实时页现为 94 位。」；“…so the live pages now count 94.”
- 主审核复核：本轮首页实际为94位，与这句当前相符，**不是当次数量错误**；按静态时间表述的维护风险降为P2。
- 位置：`web/src/lib/learn.ts:498`、`:428`。`snapshotNote` 是静态文本；未来新增、排除、修正或换季都会使 `现为 / now` 失效。正文“8 月 14 日前全部报齐”也比英文 “were due by August 14” 多声称了实际申报完成，且后文又明确排除了 5 位，容易误读成全名单都已报齐（`:500`、`:430`）。
- 成品替换：
  - ZH：「本文按写作时计入的 92 位投资人保留。此后，两位投资人的申报读取问题得到修复，计入人数曾调整为 94 位。最新人数与申报状态请查看实时榜单。」
  - EN: “This article preserves the 92-investor snapshot used when it was written. Later filing-reading fixes brought the count to 94. See the live rankings for the latest count and filing status.”
  - 引言首句 ZH：「本文回顾截至2026年6月30日的二季度持仓。」EN: “This article reviews holdings as of June 30, 2026.” 原有截止日期若需保留，单独写“申报截止日”，不声称全部完成。
- 不建议为了追上实时页而改动本文历史分母和持仓数字；修改的是时间指代。

### L5 · 格式化层只覆盖了组件，静态正文和卡片仍漏迁

- 线上：[Learn 中文](https://thecompounder.fyi/zh/learn)、[英文](https://thecompounder.fyi/learn)；[Q1 中文](https://thecompounder.fyi/zh/learn/q1-2026-superinvestor-consensus)、[Q2 中文](https://thecompounder.fyi/zh/learn/q2-2026-superinvestor-consensus)、[生意质量中文](https://thecompounder.fyi/zh/learn/reading-business-quality)，2026-10-30。
- 原文：索引“更新于 2026-10-19”；标题“2026 Q2”；正文“2026 年 Q2”“截至 2026-06-30”；金额“767.7 亿美元”“1.45 亿美元”；生意质量来源末段“核对于 2026-10-19”。与同页已格式化的“最后更新 · 2026年10月19日”“季度快照：2026Q2”混用。
- 位置：`web/src/app/[lang]/learn/page.tsx:155`、`:175` 原样输出 `.updated`；`web/src/lib/learn.ts:356`、`:362`、`:493`、`:500`、`:514`、`:521`、`:545`、`:649`、`:680`。法律更新时间同样直接输出 ISO，`web/src/components/legal/LegalArticle.tsx:17`。
- 成品替换：ZH「更新于2026年10月19日」「2026Q2：超级投资者持有、买入与卖出了什么」「本文回顾2026年二季度的持仓。」「合计持仓767.7亿美元」「其中一笔持仓为1.45亿美元」「数字核对于2026年10月19日。」EN “Updated Oct 19, 2026”; “Q2 2026: What the superinvestors held, bought, and sold”; “Figures checked on Oct 19, 2026.”
- 静态金额保留历史数值与精度，只迁写法；无需重拉行情。机器用 ISO 日期继续保留，改的是正文与卡片可见文本。

### L6 · 生意质量文章的中文仍是逐句直译

- 线上：[中文](https://thecompounder.fyi/zh/learn/reading-business-quality)、[英文](https://thecompounder.fyi/learn/reading-business-quality)，2026-10-30。
- 原文：「你能从公司财报里的几个数字走出很远」「一种看法的方法」「每一块钱营收里最终活到利润那一步」「对定价权最快的一眼」「Mastercard 是同一个形状」「同样的数字坐在稳如堡垒的资产负债表上」。
- 位置：`web/src/lib/learn.ts:636`、`:648`、`:657`、`:665`。这不是单靠统一标点能解决的问题。
- 成品替换：
  - ZH 引言：「知道谁持有一只股票，只是研究的起点。接下来要问：这门生意好不好？这篇用利润率、现金流和资本回报率三个角度，说明怎样从财报判断生意质量。案例来自超级投资者的持仓，不是对这些股票的投资结论。」
  - EN 引言: “Knowing who owns a stock is a starting point. The next question is whether the business is any good. This guide uses margins, cash flow, and returns on capital to show what to look for in the financial statements, with examples from superinvestor holdings.”
  - ZH 净利率段：「净利率表示每100元营收最终能留下多少净利润。持续较高的利润率可以帮助你观察定价权，但还要结合同行和多年趋势判断。」
  - EN: “Net margin tells you how much net profit remains from each $100 of revenue. A consistently high margin can help you assess pricing power, alongside industry comparisons and the trend over time.”
  - ZH ROE 句：「借债和回购都可能让股东权益变小，从而推高 ROE。因此，同样高的 ROE，还要看资产负债表是否稳健。」
  - EN: “Debt and buybacks can reduce equity and lift ROE. A high ROE therefore needs to be read alongside the balance sheet.”

### L7 · 共识文章的比喻与后置定语妨碍中文阅读

- 线上：[中文](https://thecompounder.fyi/zh/learn/reading-cross-fund-consensus)、[英文](https://thecompounder.fyi/learn/reading-cross-fund-consensus)，2026-10-30。
- 原文：「把它当成一份阅读清单，由一群读得很仔细的人开出来的」「当一打人持有同一只股票」「让它把你引向值得细看的名字」。
- 位置：`web/src/lib/learn.ts:266`、`:273`、`:281`。
- 成品替换：
  - ZH：「你可以把共识持仓当作一份研究清单，先从这些投资人反复关注的公司看起。」EN: “Use widely held stocks as a research list, starting with the companies these investors keep returning to.”
  - ZH：「十几位投资人持有同一只股票，可能只是同一个观点传开了，并不等于十几份独立判断。」EN: “A dozen holders may reflect one idea spreading rather than a dozen independent judgments.”
  - ZH：「打开个股列表，找出持有人数最多的公司，再挑值得深入了解的生意。」EN: “Open the stock list, see which companies have the most holders, and choose businesses to study further.”

### L8 · Q1/Q2 把股票写成“名字”，持有者量词和动作词混用

- 线上：[Q1 中文](https://thecompounder.fyi/zh/learn/q1-2026-superinvestor-consensus)、[英文](https://thecompounder.fyi/learn/q1-2026-superinvestor-consensus)；[Q2 中文](https://thecompounder.fyi/zh/learn/q2-2026-superinvestor-consensus)、[英文](https://thecompounder.fyi/learn/q2-2026-superinvestor-consensus)，2026-10-30。
- 原文：「Microsoft 是本季被买得最广的名字」「同时出现在两张榜上的名字」「大名字里一边倒的是 Apple」「7 位投资人…没有一家加仓、减仓或卖出」「持有家数」。
- 位置：`web/src/lib/learn.ts:381`、`:393`、`:395`、`:521`、`:530`、`:534`、`:537`。季度快照公共提示也沿用“家数”（`web/src/app/[lang]/learn/[slug]/page.tsx:216`）。
- 成品替换：
  - ZH：「本季度增持微软的投资人最多。」EN: “More investors added to Microsoft than to any other stock that quarter.”
  - ZH 小标题：「同时出现在买入榜和卖出榜的股票」。EN: “Stocks on both lists”。
  - ZH：「7位投资人新进这只股票，其他投资人没有增持、减持或清仓。」EN: “Seven investors opened positions; no others added, trimmed, or exited.”
  - ZH：「文中的持有人数按写作时追踪的投资人计算。」EN: “Holder counts reflect the investors tracked when this article was written.”
- 中文描述投资人统一用“位”，组合用“个”，基金作为明确机构名时才用“家”；动作统一新进/增持/减持/清仓。不必把英文自然的 “name” 也机械删掉，重点是中文不能沿用它的代称。

### L9 · 中文文章和相关链接仍大量保留可翻译的英文公司名

- 线上：[Q1](https://thecompounder.fyi/zh/learn/q1-2026-superinvestor-consensus)、[Q2](https://thecompounder.fyi/zh/learn/q2-2026-superinvestor-consensus)、[生意质量](https://thecompounder.fyi/zh/learn/reading-business-quality)、[内在价值](https://thecompounder.fyi/zh/learn/what-is-intrinsic-value)，2026-10-30。
- 原文：同篇 Q2 既写 “Apple”“Berkshire Hathaway”，又写“伯克希尔”“台积电”；生意质量文末相关列表仍是 “Apple / Amazon / Berkshire Hathaway”。
- 位置：`web/src/lib/learn.ts:374`、`:513`、`:514`、`:649`、`:671`、`:685`、`:690`、`:692`、`:832`。包括 `[[stock:...|Label]]` 中的标签和 `related[].label`，不是漏传 lang 就能全部修复。
- 成品替换样例：ZH「苹果（AAPL）在本文样本中有27位投资人持有。」后文用“苹果”；相关链接写“微软 / 苹果 / 亚马逊 / 伯克希尔”。EN “Apple (AAPL) had 27 holders in this article's sample.”; “Microsoft / Apple / Amazon / Berkshire Hathaway”。
- 只替换有确定常用译名的公司标签；ticker、slug、SEC、13F、Form 13F、ROE、公司法定专名不做盲目去英文处理。

### L10 · 英文共识定义用了祈使句，误把用户持仓写成入榜条件

- 线上：[英文跨基金共识](https://thecompounder.fyi/learn/reading-cross-fund-consensus)、[中文](https://thecompounder.fyi/zh/learn/reading-cross-fund-consensus)，2026-10-30。
- 原文：“Hold the same name as two or more of them and the stock shows up on the Stocks page”。主语变成读者，读起来是“你和其中两位持有同一股票才会展示”。中文这句没有同样问题。
- 位置：`web/src/lib/learn.ts:216`（中文对应 `:258`）。
- 成品替换：EN “A stock appears on the Stocks page when two or more tracked investors hold it. The list is ranked by holder count.” ZH「至少有两位追踪中的投资人持有，这只股票就会出现在个股列表中，并按持有人数排序。」

### L11 · Learn 门面仍有翻译腔，“代码”也不是 ticker 的清晰中文

- 线上：[中文索引](https://thecompounder.fyi/zh/learn)、[英文](https://thecompounder.fyi/learn)，2026-10-30。
- 原文：「读懂生意，而非代码」「像严肃投资者那样读懂生意的大白话指南」「内在价值，是价值投资底下最根本的一个概念」「归到一处、做得可读」。
- 位置：`web/src/app/[lang]/learn/page.tsx:34`、`:35`；`web/src/lib/learn.ts:873`（品牌块）、内在价值 description（同 slug 中文元数据）。
- 成品替换：ZH 标题「从股票代码，看到背后的生意」；简介「从13F持仓到公司财报，学会自己判断一门生意。」EN “Look beyond the ticker”; “From 13F holdings to financial statements, learn to judge a business for yourself.”
- 中文品牌块可以直接收紧为：「Compounder 整理超级投资者的持仓与个股估值，帮助你从公开数据开始研究。判断由你自己做。这里的内容仅供学习，不构成投资建议。」EN “Compounder brings together superinvestor holdings and stock valuations as a starting point for research. The judgment stays yours. For education only; not investment advice.”

### L12 · 同一概念仍出现“股东盈余 / 所有者盈利 / 一条带 / 价值区间”

- 线上：[中文生意质量](https://thecompounder.fyi/zh/learn/reading-business-quality)、[英文](https://thecompounder.fyi/learn/reading-business-quality)；[中文内在价值](https://thecompounder.fyi/zh/learn/what-is-intrinsic-value)、[英文](https://thecompounder.fyi/learn/what-is-intrinsic-value)，2026-10-30。
- 原文：「巴菲特的“股东盈余”（owner earnings）」「价值估算显示成一条带」；英文 “The value estimate shows up as a band”。站内估值组件另用“所有者盈利”，所以不能声称术语已集中统一。
- 位置：`web/src/lib/learn.ts:656`、`:823`、`:754`；交叉代码 `web/src/components/valuation/EarningsPowerFloorCard.tsx:176`。
- 成品替换：ZH「巴菲特所说的所有者盈余（owner earnings），关注的是所有者最终可以拿走多少现金。」EN “Buffett's owner earnings focuses on the cash owners can ultimately take out.” ZH「页面以价值区间展示估算结果，因为估值本身就有不确定性。」EN “The page shows an estimated value range because valuation involves uncertainty.”
- “所有者盈余”按首轮术语提案给出；落地时须和估值页同批定一个词，不宜只改单篇。FCF 首次可写“自由现金流利润率（FCF margin）”，后文写中文全称；ROE 同理首次释义，保留通行缩写。

### L13 · 中文 OG alt 留英文；正文标题与 OG title 的语言已正确

- 线上：[中文索引](https://thecompounder.fyi/zh/learn)、[中文 Q2](https://thecompounder.fyi/zh/learn/q2-2026-superinvestor-consensus)、[中文 About](https://thecompounder.fyi/zh/about)，2026-10-30 HTTP meta：`og:image:alt` 分别仍为 `Compounder — Learn`、`Compounder — Learn`、`About Compounder`。其他中文文章同样是 `Compounder — Learn`。
- 位置：`web/src/app/[lang]/learn/opengraph-image.tsx:3`、`web/src/app/[lang]/learn/[slug]/opengraph-image.tsx:7`、`web/src/app/[lang]/about/opengraph-image.tsx:3`。
- 成品替换：索引 ZH「Compounder：价值投资学习指南」，EN “Compounder: value investing guides”；文章使用文章本身对应语言标题；About ZH「关于 Compounder」，EN “About Compounder”。可以在页面 metadata 按 lang 设置对应 image alt，不能只改一个固定 export 导致英文反向漏翻。
- 本项只确认 metadata；没有把“alt 为英文”误报成“OG 图片像素也是英文”。当次采集的文章 H1、title、description、og:title、og:description 均跟随所选语言。

### L14 · 隐私页 newsletter 未翻译；法律时间与引号风格仍未统一

- 线上：[中文隐私](https://thecompounder.fyi/zh/privacy)、[英文](https://thecompounder.fyi/privacy)，2026-10-30。
- 原文：「用于发送 newsletter」「通过 newsletter 邮件中的退订链接」；页面“最后更新 · 2026-10-28”。
- 位置：`web/src/lib/legal.ts:166`、`:186`；日期见 `web/src/components/legal/LegalArticle.tsx:17`。
- 仅语言替换：ZH「用于发送邮件简报」「你可随时通过邮件简报中的退订链接取消订阅。」EN 继续使用 “newsletter”; “You can unsubscribe at any time via the link in any newsletter email.” 日期 ZH「最后更新 · 2026年10月28日」，EN “Last updated · Oct 28, 2026”。
- Terms 的「按“现状”和“现有”基础提供」「后果性」「代码归本站所有」，Disclaimer 的「历史表现不代表未来结果」依然存在，`web/src/lib/legal.ts:103`、`:109`、`:115`、`:56`，见 [Terms 中](https://thecompounder.fyi/zh/terms)、[Terms 英](https://thecompounder.fyi/terms)、[Disclaimer 中](https://thecompounder.fyi/zh/disclaimer)、[Disclaimer 英](https://thecompounder.fyi/disclaimer)。**这些涉及法律措辞，标为需专业确认，不提供直接实质替换句，也不沿用旧审核中未经确认的责任主体改写。** 中文引号目前混用“”和「」，作为统一编辑风格处理，不列为半角标点硬错误。

## 动态季度报告：代码证据，未在线上复现

以下没有可验证的已发布动态页面 URL。目标路由模式由 `web/src/lib/reports/period.ts:39` 生成 `/learn/q{季度}-{年份}-superinvestor-consensus` 及中文前缀；本次不把模式当真实已发布 URL。Q1/Q2 的线上链接仍指向静态文章。

### T1 · P1 · 没有持仓变化也会被解释为“缺上一季申报”

- 原文：「本季无可比动作（缺上一季申报）」/ “No comparable moves (no prior filing)”。
- 位置：`web/src/components/reports/ReportArticle.tsx:103` 只按 `f.moves.length === 0` 选择该句；`web/src/lib/reports/copy.ts:166` 定义原因。`build.ts:84`、`:107` 显示，即使本季与前季都存在，只要没有股份变化，`moves` 同样为空。
- 用**合成输入**验证：同一投资人两季都有相同的 AAPL 持仓，构造器产出 `filed:true, moves:[]`，渲染分支仍选择上述“no prior filing”。这是本地纯函数复现，不是线上真实持仓事件。
- 成品替换应按结构化原因分开：
  - 无较早申报：ZH「缺少较早申报，暂不能比较持仓变化。」EN “No earlier filing is available to compare holdings.”
  - 有申报、无股份变化：ZH「本季申报股数未变。」EN “Reported share counts were unchanged this quarter.”
  - 若暂不能新增原因字段，安全的通用文案为 ZH「本季暂无可展示的持仓变动。」EN “No holding changes to show this quarter.” 不应断言缺失原因。

### T2 · P1 · 代码允许跨季比较，文案却一律说“上一季”

- 原文：「统计本季相对上一季…」「只在本季已申报、且有上一季申报的同一批投资人内比较」；EN “versus the prior quarter”; “also filed the prior one”。
- 位置：`web/src/components/reports/ReportArticle.tsx:119`、`:120`、`:125`、`:126`；`web/src/lib/reports/copy.ts:28`、`:166`。输入契约 `web/src/lib/reports/types.ts:84` 明确 `prior` 是“早于 P 的最近一季”，可以跳过上一季；构造器 `build.ts:43`、`:56` 只检查是否存在 `prior`，不检查 `priorPeriod === priorQuarter(period)`。
- 成品替换（若维持现有算法）：ZH「持仓变动与每位投资人最近一次较早申报比较；两次申报未必相隔一个季度。」EN “Holding changes are compared with each investor's most recent earlier filing, which may be more than one quarter earlier.” 表头 ZH「较前次申报」EN “vs. previous filing”。
- 若产品要求真正的季度环比，则筛选严格上一季输入，再保留现有季度说法；不能仅改一个注释。本文不替产品选择算法。

### T3 · P2 · 报告模板仍有工程词、旧名称和标题大小写

- 原文：「暂无满足条件的共识动作」「方法与口径」「避免…造成虚降」「估值引擎」「覆盖率达标后…定稿冻结」；标题 “Superinvestor Consensus Report”，动作表头 “Funds”。
- 位置：`web/src/lib/reports/copy.ts:16`、`:47`、`:148`、`:193`；`web/src/components/reports/ReportArticle.tsx:44`、`:120`、`:121`、`:122`。中文方法首句还有不自然的“${roster} 位中、上一季及之后…”（`copy.ts:193`）。
- 成品替换：
  - ZH「已申报的投资人中，暂没有符合统计条件的共同买卖。」EN “No shared buying or selling meets the criteria among investors who have filed.”
  - ZH「统计方法」EN “How the figures are counted”。ZH「只比较两次都有申报的投资人，避免尚未申报被误算成持有人减少。」EN “We compare investors with both filings so a missing filing is not mistaken for a drop in holders.”
  - ZH「估值来自本站模型，只展示数据较可靠的结果。」EN “Valuations come from our models; only results based on sufficiently reliable data are shown.”
  - ZH「申报季结束、收到足够申报后，报告会定稿，此后不再自动更新。」EN “The report will be finalized after filing season once enough filings are available. It will then stop updating automatically.”
  - EN 标题 “Q3 2026 superinvestor consensus report”；“Funds” 若统计单位是投资人，改 “Investors”；同季“Sold out”与别处“Exited”择一定稿。季度名作为模板样本，不代表该动态报告已发布。
- 股票用 ticker 的紧凑表格不是漏翻；只有无法匹配 ticker 时回退的原始 `issuer` 才需要名称清洗/展示名策略（`ReportArticle.tsx:13`、`copy.ts:12`）。未采集到真实动态实例，因此不报告某个具体大写名称已在线上出现。

## 本轮正面核销与保留项

| 旧问题 | 本轮证据与结论 |
|---|---|
| 中文长文大面积半角逗号、冒号、括号 | 12 个中文 main 文本按 CJK 相邻 `, : ; ? ! ( )` 模式扫描，命中为 0；通读也未看到旧报告中的大面积半角标点。说明机械迁移已有成效；不据此宣称全站所有字符串通过。 |
| Q2 把 186 误写成不同组合数量 | 线上中英已为“186 个持仓 / 186 positions across the 92 portfolios”（`learn.ts:513`、`:443`），已修；本文没有重算或认证这组历史样本。 |
| 历史季报没有时间边界 | 线上 Q1/Q2 中英均有 Snapshot、报告季末、写作日期和实时榜单链接，已修基础框架；L3 是附注时间指代的剩余问题。 |
| 文章顶部日期不本地化、返回链接出现“返回 学习” | 7 篇中英正文顶部日期已按语言展示；中文返回文本为“← 返回学习”（`web/src/app/[lang]/learn/[slug]/page.tsx:104`、`:179`）。索引及法律日期剩余见 L5。 |
| 报告英文 “Shares down AAPL” | 模板已改为 “Sold some AAPL”，并说明股数变化与组合权重可能相反（`reports/copy.ts:117`、`:134`）；这是代码核销，未对生产动态页做视觉核销。 |
| 模板英文单复数 | `superinvestorCount`、`holderCountText`、击球区单只股票 `sits`、展开单只股票，以及 `excludedClause` 的 other/isn't 均有明确单复数分支。没有在当前静态文章采集里发现应单独上报的 `1 …s` 拼接错误；这不等于所有动态数值组合都验收通过。 |
| 法律披露从未更新 | 隐私政策已写 PostHog、匿名标识和不录屏/不记录输入，并显示 2026-10-28；本轮仅确认双语文字存在，不认证它与线上技术行为完全相符。 |
| 所有文章 SEO 都是英文 | 本次 24 页的 `<html lang>`、页面 title/description 及 OG title/description 与所选语言一致。剩余英文 OG alt 见 L13；英文标题多数仍为 Title Case，是后续统一 sentence case 的编辑项。 |

## 覆盖清单与下一轮验收

以下 slug 全部取自生产 Learn 索引并抓取双语版本，均人工通读 main 文本；“覆盖”只代表本报告的方法范围，不代表内容、法律或财务事实逐项认证。

| 内容 | 英文线上 URL | 中文线上 URL | 主要余项 |
|---|---|---|---|
| Learn 索引 | [EN](https://thecompounder.fyi/learn) | [ZH](https://thecompounder.fyi/zh/learn) | L5、L11、L13 |
| 如何读懂 13F | [EN](https://thecompounder.fyi/learn/how-to-read-a-13f) | [ZH](https://thecompounder.fyi/zh/learn/how-to-read-a-13f) | L2；“权重”可改“占组合比例”，不改数值 |
| 什么是超级投资者 | [EN](https://thecompounder.fyi/learn/what-is-a-superinvestor) | [ZH](https://thecompounder.fyi/zh/learn/what-is-a-superinvestor) | 中文“对这个范围的边界很诚实”可改“清楚自己懂什么，也承认哪些不懂”（`web/src/lib/learn.ts:189`）；EN 可保留 “honest about where that understanding ends” |
| 内在价值 | [EN](https://thecompounder.fyi/learn/what-is-intrinsic-value) | [ZH](https://thecompounder.fyi/zh/learn/what-is-intrinsic-value) | L9、L12；“那场演讲”“第四个概念”缺首次铺垫（`learn.ts:724`、`:732`、`:793`、`:801`），可写“在1999年的太阳谷演讲中 / In a 1999 talk at Sun Valley”“另一个关键概念是能力圈 / Another key idea is the circle of competence”，不补造历史引文来源 |
| 跨基金共识 | [EN](https://thecompounder.fyi/learn/reading-cross-fund-consensus) | [ZH](https://thecompounder.fyi/zh/learn/reading-cross-fund-consensus) | L2、L7、L10 |
| Q1 静态报告 | [EN](https://thecompounder.fyi/learn/q1-2026-superinvestor-consensus) | [ZH](https://thecompounder.fyi/zh/learn/q1-2026-superinvestor-consensus) | L2、L5、L8、L9 |
| Q2 静态报告 | [EN](https://thecompounder.fyi/learn/q2-2026-superinvestor-consensus) | [ZH](https://thecompounder.fyi/zh/learn/q2-2026-superinvestor-consensus) | L3、L5、L8、L9 |
| 生意质量 | [EN](https://thecompounder.fyi/learn/reading-business-quality) | [ZH](https://thecompounder.fyi/zh/learn/reading-business-quality) | L1、L5、L6、L9、L12 |
| About | [EN](https://thecompounder.fyi/about) | [ZH](https://thecompounder.fyi/zh/about) | L4、L13；英文小标题 Title Case 可与站内 sentence case 统一 |
| Terms | [EN](https://thecompounder.fyi/terms) | [ZH](https://thecompounder.fyi/zh/terms) | L14，法律措辞需专业确认 |
| Privacy | [EN](https://thecompounder.fyi/privacy) | [ZH](https://thecompounder.fyi/zh/privacy) | L14 |
| Disclaimer | [EN](https://thecompounder.fyi/disclaimer) | [ZH](https://thecompounder.fyi/zh/disclaimer) | L4、L14，法律措辞需专业确认 |

下一轮最有价值的验收是：修正 L1/L2/L4 及 L3 的时间措辞后重抓对应双语正文；把静态来源日期、季度、金额一并迁移；用没有变动/缺较早申报/跨季比较三个合成场景检查动态报告原因文案。动态报告真正发布后，才补其线上双语、OG 与交互验收。现阶段不应把“构建通过”当成长文已经自然、来源披露已经完整或未发布动态模板已经线上通过。
