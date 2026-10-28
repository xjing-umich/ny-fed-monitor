# B-investors：超级投资者板块文案审核

审核范围：`src/app/[lang]/investors/**`、`src/lib/managers/*`（用户可见部分）、`src/components/aggregate/*`、`src/lib/aggregate/blurb.ts`、`src/components/investor/*`、`src/lib/entity/quarterMovesText.ts`、`src/components/entity/InvestorProfileProse.tsx`、`QuarterMovesLine.tsx`。`aggregations.ts`、`consensus/compute.ts`、`consensusRead / treasuryRead / priceRead / fusionSignal / holderCounts / zeroReports` 里没有用户可见字符串（只有日志），所以不在下表。
另有几处字符串定义在别的区域，但会渲染到本板块页面上（`shareText.ts`、`formatUSD`、`nav.ts`），这些标了「跨区」，如果其他区域已经报过，可以去重。
所有路径都相对于 `/Users/junlinzhu/Desktop/TheCompounder/ny-fed-monitor/web/`。

---

## 1. 区域概况

整体感觉：**数字是真的，句子是机器拼的**。表格标签和短 badge 大多干净；问题集中在模板拼出来的整句里，包括页头脚注、解读条、「组合速览」正文、估值姿态引语、独门重仓引语、分享文案。这些句子的中文像是先想好英文再逐词换成中文，英文又带着中文语序；内部口径词（基准季、披露门槛、覆盖率、估值无红旗、待确认、占聚合、人次）直接摆给了读者。

三个最主要的问题模式：

1. **内部口径外露（Z2/E3）**：工程判定条件被原样翻成了用户文案。最典型的是买卖页页头下的脚注，渲染出来是：「统计基准季：Q2 2026（Q3 2026 尚未达到披露门槛：截止日前）。另有 23 位已交 Q3 2026。」英文是 "Baseline quarter: Q2 2026 (Q3 2026 not yet at disclosure threshold: before filing deadline)."。读者想知道的其实只有一件事：为什么还是 Q2，Q3 什么时候来。
2. **模板拼接后的怪句（X3）**：量词、单复数、空值、重复词。例如共识页：「估值徽章：估值截至 2026-10-24 收盘价（SEC 财报 × 收盘价）」，"估值"和"收盘价"各出现两次；英文是 "Valuation badges: Valuations as of the 2026-10-24 close (…)"。再如隐含预期句："3 demand a demanding growth rate"。还有「清仓 5：A、B、C 另 2 只」，以及持仓数只有 1 时的 "The top 1 holdings represent 100%"。
3. **同一概念多种叫法（X1）**：超级投资者 / 超投 / 顶级投资者 / 顶级价值投资者 / 投资人 / 投资者；新建 / 新建仓 / 本季新增，对应 New / Opened；加仓 / 增持，减仓 / 减持；量词「位 / 家」混用（独门重仓用「家超投」）。英文侧也在 superinvestors / managers / top investors 之间来回换。

另有两处**准确性问题**，比腔调更要紧：
- 「持仓微调 / Mostly held」的判定条件其实是"买入笔数 = 卖出笔数"。8 买 8 卖是一次大换仓，现在却标成了"微调"。
- 「最受关注的卖出 / The most notable sale」实际是按原持股数排序选出来的，跟"受关注"没有关系。

**可以当风格锚点、值得表扬的句子**：
- `NotCountedNote`：「申报截止日已过仍未交新一季，旧仓位不算当前持有。」/ "They missed the latest filing deadline, so their old positions don't count as current holdings." 两种语言都短、具体，并且说清了原因。
- 零持仓说明：「申报没写原因，常见的是清盘、委托转给别家管理人，或管理规模跌破 13F 申报门槛，这里不算作卖出。」英文 "discretion moving to another adviser" 是地道的行业说法。
- 列表 tooltip（英文）："Prices don't move this much in a quarter: usually redemptions, a wind-down, or a change in reporting scope — not necessarily active selling or buying."
- 英文正文："The single largest position is Apple at 22.3% of the portfolio, followed by American Express at 10.1% and Bank of America at 9.8%."
- 中文板块名「独门重仓」：短、有画面感，是母语说法（英文对应的 "Lonely conviction" 反而需要改）。

---

## 2. 术语清单

| 概念 | 当前中文 | 当前英文 | 一致？ | 建议 |
|---|---|---|---|---|
| 被跟踪的基金经理（总称） | 超级投资者 / 超投 / 顶级投资者 / 顶级价值投资者 / 投资人 / 投资者 | Superinvestors / superinvestors / managers / top investors / tracked superinvestors | ✗ 两侧都乱 | 中文：正式名用「超级投资者」，句中泛称统一用「投资人」，**不用**「超投」「顶级投资者」「投资者」。英文：统一用 "superinvestors"，泛称用 "investors"，不用 "managers"、"top investors"。 |
| 人数量词 | 位 / 家（独门重仓）/ 人次 | — | ✗ | 一律用「位」；删掉「人次」。 |
| 股票数量词 | 只 / 个 / 条 | — | ✗ | 指股票一律用「只」（例：「41 只持仓」）。 |
| 新开仓 | 新建（列表、详情计数）/ 新建仓（买卖页）/ 本季新增（分享）/ 重磅新建 | New / Opened / opened / Big new position | ✗ | 中文 badge 和计数都用「新建仓」（单独写「新建」像"新建文件"按钮）。英文 badge 用 "New"，句中动词用 "opened"。 |
| 加仓 | 加仓 / 增持（quarterMovesText） | Added | ✗ | 统一用「加仓」。「增持 / 减持」在 A 股语境多指大股东公告，容易产生错位联想。 |
| 减仓 | 减仓 / 减持 | Trimmed | ✗ | 统一用「减仓」。 |
| 清仓 | 清仓 | Exited / sold（卖页解读条 "sold or trimmed"） | ✗ 英文侧 | 英文统一用 "exited"。 |
| 买卖相当（verdict mixed） | 持仓微调 / 微调 | Mostly held / Held | ✗，且不准确 | 「有买有卖」/ "Mixed"；买卖都为 0 时单独写「本季未动」/ "No changes"。 |
| 净买入（verdict buying） | 整体加仓 | Net buying | ✓（英文略有歧义） | 判定是按笔数比较，"Net buying" 容易被读成金额净买入，可改 "More buys than sells"；空间不够就保留。 |
| 持仓占组合比例 | 权重 | Weight | ✓ | 中文改为「仓位占比」或「占组合」；英文改为 "% of portfolio"。「权重」是指数编制的用词。 |
| 一只股票被几位超级投资者持有 | 持有人数 / 持有 / 共持 / N 家 | Holders / holders / holder count | ✗ | 表头中文用「几位持有」，英文用 "Held by"。句中写「N 位持有」/ "N own it"。 |
| 共识持仓 | 共识持仓 / 共识首位 / 共识股 | Consensus holdings / consensus names / #1 consensus pick | ✗ | 页名保留「共识持仓 / Consensus holdings」。句中不要写「共识首位」「consensus pick」（pick 带推荐意味），改写成「持有人数最多」/ "most widely held"。 |
| 估值姿态 | 估值姿态 | Valuation posture | ✓ 但两侧都是自造词 | 中文：「现在便宜的持仓」；英文："Which holdings look cheap"。 |
| 独门重仓 | 独门重仓 | Lonely conviction | 中文好，英文自造 | 中文保留；英文改 "Big bets few others own"。 |
| 待确认（估值有疑点） | 待确认 | pending | ✓ 但两侧都看不懂 | 中文：「数据待核」；英文："under review"。第一次出现时用一句话解释原因。 |
| 击球区 | 击球区 | strike zone | ✓ | 保留（是站内概念，有 Learn 文章承接）。 |
| 季度标签 | Q2 2026（中文页也是这个写法） | Q2 2026 | — | 中文页建议用「2026 Q2」或「2026 年二季度」。 |
| 报告期日期 | 2026-06-30（正文和独门重仓引语里的 ISO 日期） | 2026-06-30 | — | 中文写「2026 年 6 月 30 日」，英文写 "June 30, 2026"；季度语境下直接用季度标签。 |
| 金额 | $263.45B（中文页也是） | $263.45B | — | 跨区（`formatUSD`）：中文页建议显示为「2,634.5 亿美元」。 |
| 组合占比基数 | 占聚合 | of aggregate | ✗ 自造 | 「占前 50 合计市值」/ "of top-50 combined value"。 |

---

## 3. 逐条发现

| 位置(file:line) | 严重度 | 标签 | 现状 | 问题一句话 | 建议改写 |
|---|---|---|---|---|---|
| src/app/[lang]/investors/page.tsx:58,62 | P0 | E2 / X1 | zh「追踪顶级基金经理的 SEC 13F 季度持仓披露，了解聪明钱在买什么。」/ en "Track top fund managers' quarterly SEC 13F disclosures to see what smart money is buying." | SEO 描述用了 "smart money"（简报点名的腔调词），也没提我们收录了多少人，换任何一家 13F 站点都能用。 | zh：「巴菲特、段永平等 81 位超级投资者的 13F 季度持仓：每人买了什么、卖了什么、重仓什么，数据来自 SEC。」<br>en: "The 13F portfolios of 81 superinvestors, from Buffett to Pabrai: what each one bought, sold, and holds biggest this quarter. Data from SEC filings." |
| src/app/[lang]/investors/page.tsx:22 | P1 | Z4 / Z5 | zh「按组合市值排列 · 最新 13F 季」 | 「13F 季」是生造词，"·"把两段硬拼在一起。 | zh：「按组合市值排序，用的是每人最新一份 13F」 |
| src/app/[lang]/investors/InvestorListClient.tsx:39,68 + [slug]/page.tsx:359 | P1 | X2（准确性） | zh「持仓微调」/ en "Mostly held"（判定：买入笔数 = 卖出笔数，见 manager_qoq SQL） | 8 买 8 卖是一次大换仓，现在被标成"微调 / 基本没动"，意思错了。 | zh：「有买有卖」（买卖都为 0 时：「本季未动」）<br>en: "Mixed" (0/0: "No changes") |
| src/app/[lang]/investors/InvestorListClient.tsx:46-49,75-78 | P1 | X1 / E3 | 筛选 chip zh「全部动向 / 加仓 / 减仓 / 微调」；en "Any move / Buying / Selling / Held" | chip 与 badge（整体加仓 / Net buying）说法不一致；"Held" 单独作为筛选项看不出意思。 | zh：「全部 / 买多于卖 / 卖多于买 / 有买有卖」<br>en: "All / Net buyers / Net sellers / Mixed" |
| src/app/[lang]/investors/InvestorListClient.tsx:40-41,69-70 | P1 | Z4 / E1 | 渲染：zh「最大：Apple 新建」；en "Top: Apple New" | 中文「新建」读起来像按钮；英文 "Apple New" 把形容词放在名词后，读不通。 | zh：「最大一笔：Apple（新建仓）」<br>en: "Biggest move: new Apple stake"（空间不够时："Biggest: Apple (new)"） |
| src/app/[lang]/investors/InvestorListClient.tsx:43 | P2 | Z4 | zh「匹配 3 / 共 81 位」 | 斜杠记法是工程味，不像中文。 | zh：「找到 3 位（共 81 位）」 |
| src/app/[lang]/investors/InvestorListClient.tsx:80 | P2 | E4 | en "Prev" | 缩写，和 "Next" 不对称。 | en: "Previous" |
| src/app/[lang]/investors/InvestorListClient.tsx:63-65 | P2 | E3 | en 列头 "Holdings"（值是数量）、"Period" | "Holdings" 像是指持仓列表；"Period" 太抽象。 | en: "Positions", "Quarter" |
| src/app/[lang]/investors/InvestorListClient.tsx:45 | P2 | Z1 | zh tooltip「13F 申报原文数字。股价一季变不了这么多…」 | 第一句是名词短语，不是句子。 | zh：「这是 13F 原始申报里的数字。股价一个季度变不了这么多，多半是资金赎回、清盘或申报范围变了，不等于主动买卖。」 |
| src/app/[lang]/investors/[slug]/page.tsx:92,98 + lib/managers/displayName.ts:66 | P0 | E1 / X2 | en title "Mohnish Pabrai Portfolio — 13F Holdings Q2 2026 \| Compounder"；zh「莫尼什·帕伯莱（Mohnish Pabrai）持仓组合 — 13F Q2 2026 \| Compounder · 复利」 | 英文缺所有格，"Portfolio — 13F Holdings" 意思重复；中文标题没有「持仓」二字，"持仓组合 — 13F"也重复。 | en: "Mohnish Pabrai's 13F Portfolio, Q2 2026 \| Compounder"<br>zh：「帕伯莱（Mohnish Pabrai）13F 持仓 · 2026 Q2 \| Compounder · 复利」 |
| src/app/[lang]/investors/[slug]/page.tsx:95,101 | P0 | Z1 / E5 | 渲染 zh「巴菲特、阿贝尔（Berkshire Hathaway Inc）的 SEC 13F 持仓组合，Q2 2026：41 个持仓，市值 $263.45B，第一大持仓 Apple。含环比变动，数据来自 SEC EDGAR。」en "…: 41 positions worth $263.45B, led by Apple. Quarter-over-quarter changes, sourced from SEC EDGAR." | 中文是名词链加「含环比变动」，像在填表；英文最后一句是没有谓语的碎片。 | zh：「巴菲特、阿贝尔（Berkshire Hathaway）2026 Q2 的 13F：41 只持仓，合计 2,634 亿美元，第一大是 Apple。附每只股票的季度增减，数据来自 SEC。」<br>en: "Warren Buffett & Greg Abel's 13F for Q2 2026: 41 positions worth $263.45B, led by Apple, with every change from last quarter. Data from SEC EDGAR." |
| src/app/[lang]/investors/[slug]/page.tsx:94 | P1 | Z7 | zh「…的 SEC 13F 申报持仓为零，未列任何持仓。」 | 「持仓为零」和「未列任何持仓」说的是一件事。 | zh：「Olstein Capital 2026 Q2 交的 13F 里一只股票都没有。数据来自 SEC EDGAR。」 |
| src/app/[lang]/investors/[slug]/page.tsx:374-381 | P0 | X3 | 分享文案把 `issuer` 原样传给 `buildShareText`，没有经过 `cleanIssuer`。渲染：「巴菲特、阿贝尔 最新 13F：第一大持仓 APPLE INC，本季新增 XXX CORP DEL。」 | 分享出去的是 EDGAR 的全大写原名，还带 "DEL" 之类后缀；页面其他地方都清洗过，只有这里漏了。 | 对 `shareTopHolding` 和 `shareAddedName` 套一层 `cleanIssuer()`。（另见下方 shareText 条目里的句子改写。） |
| src/app/[lang]/investors/[slug]/opengraph-image.tsx:22 | P1 | X3 | `subtitle: d.manager.name` → OG 图显示 "BERKSHIRE HATHAWAY INC" | 用的是没清洗的全大写基金名，页面上其他地方都用 `displayFundName`。 | 改成 `displayFundName(d.manager.name)`。 |
| src/app/[lang]/investors/{buys,sells,consensus}/opengraph-image.tsx:3,12-13 | P0 | X4 | OG 图 eyebrow "Superinvestor 13F"，title "Top buys" / "Top sells" / "Consensus holdings"；alt 也只有英文 | 中文页分享到微信、X 时，卡片显示的是英文。 | 按 `params.lang` 出双语：zh eyebrow「超级投资者 13F」，title 分别为「本季买的人最多」「本季卖的人最多」「共识持仓」；alt 同步双语。 |
| src/app/[lang]/investors/[slug]/page.tsx:115,120 | P1 | X1 / E3 | 表头 zh「持有人数」/ en "Holders" | 「持有人数」容易被理解成公司股东人数；"Holders" 同样有歧义。 | zh：「几位持有」（tooltip：「我们跟踪的超级投资者里有几位持有」）<br>en: "Held by" |
| src/app/[lang]/investors/[slug]/page.tsx:115,120 | P1 | Z4 | 表头 zh「权重」/ en "Weight" | 「权重」是编指数时的用词，散户说「仓位」「占比」。 | zh：「仓位占比」<br>en: "% of portfolio" |
| src/app/[lang]/investors/[slug]/page.tsx:116 | P2 | X1 | zh「显示前 25 条，共 41 个持仓」 | 量词「条 / 个」混用。 | zh：「只列前 25 只，共 41 只」 |
| src/app/[lang]/investors/[slug]/page.tsx:158 | P2 | Z5 | zh tooltip「期权:市值为标的名义价值,非权利金」 | 中文句里用了半角冒号和逗号。 | zh：「期权：这里的市值是标的股票的名义价值，不是权利金。」 |
| src/app/[lang]/investors/[slug]/page.tsx:236 | P2 | X2 | eyebrow zh「SEC 13F · 最新持仓」/ en "SEC 13F · latest filing" | 两种语言说的不是同一个东西。 | zh：「SEC 13F · 最新一份申报」或 en: "SEC 13F · latest holdings"，二选一对齐。 |
| src/app/[lang]/investors/[slug]/page.tsx:266-273 + components/entity/QuarterMovesLine.tsx:23 | P1 | X3 | 渲染 zh「清仓 5：Apple、Microsoft、Alphabet 另 2 只」；QuarterMovesLine「…（A、B、C 另 2 位）」 | 「另 2 只」直接贴在名单后面，没有连接词，读不通。 | zh：「清仓 5 只：Apple、Microsoft、Alphabet 等，另有 2 只」或「…Alphabet 等 5 只」 |
| src/app/[lang]/investors/[slug]/page.tsx:605 + InvestorListClient.tsx:40 | P1 | Z4 / X1 | 本季动作四格 zh「新建 / 加仓 / 减仓 / 清仓」 | 单独的「新建」像 UI 按钮，而且和买卖页的「新建仓」不一致。 | zh：「新建仓 / 加仓 / 减仓 / 清仓」 |
| src/app/[lang]/investors/[slug]/page.tsx:630-631 | P1 | X3 / E1 / Z4 | 渲染 zh「按 2026-10-24 收盘价隐含的预期：3 只市场要求苛刻的增速，5 只温和。」（无日期时是「按现收盘价…」）；en "By what the 2026-10-24 close implies: 3 demand a demanding growth rate, 5 modest." | 中文主谓宾打架（「3 只市场要求…」）；英文 "demand a demanding" 是重复用词；「现收盘价」是生造词。 | zh：「按 10 月 24 日收盘价倒推：3 只股价里押的增长偏高，5 只押得不多。」<br>en: "At the Oct 24 close, 3 holdings are priced for demanding growth and 5 for modest growth." |
| src/app/[lang]/investors/[slug]/page.tsx:472 | P2 | X2 | key fact zh「低于内在价值」/ en "Below intrinsic value"，值为 "3" | 标签没说明这是计数，"3" 可能被读成 3%。 | zh：「低于内在价值的持仓」，值显示为「3 只」<br>en: "Holdings below value" |
| src/app/[lang]/investors/[slug]/page.tsx:594 | P2 | Z5 | zh「估值(SEC 财报 × 收盘价)」 | 半角括号。 | zh：「估值（SEC 财报 × 收盘价）」 |
| src/app/[lang]/investors/[slug]/page.tsx:636-639 | P1 | Z2 / E3 | 小节标题 zh「估值姿态」/ en "Valuation posture" | 两种语言都是内部概念名，读者看不出这一节讲什么。 | zh：「现在便宜的持仓」<br>en: "Which holdings look cheap" |
| lib/managers/valuationPosture.ts:90-100（渲染于 [slug]/page.tsx:642） | P1 | Z2 / Z4 / E3 | 渲染 zh「这只基金 12 只估值无红旗的美股持仓中，有 3 只现价低于内在价值（其中 1 只落在击球区）；另有 2 只待确认（估值截至 2026-10-24）：」；en "Of 12 valued US positions without red flags, 3 trade below intrinsic value (1 in the strike zone); 2 more pending (as of 2026-10-24):" | 「这只基金」用在人名页上不对，量词「只」还和后面的「12 只」撞了；「估值无红旗」「待确认」「pending」都是内部口径；括号套括号。 | zh：「我们能可靠估值的 12 只持仓里，3 只现价低于内在价值，其中 1 只已进击球区（按 10 月 24 日收盘价）。另有 2 只看着便宜，但财报数据有疑点，暂不计入：」<br>en: "Of the 12 holdings we can value with confidence, 3 trade below intrinsic value, 1 of them in the strike zone (Oct 24 close). Two more look cheap, but their numbers are still under review:" |
| src/app/[lang]/investors/[slug]/page.tsx:655-657 | P2 | E3 | 列表项右侧 "35% · 击球区" / "35% · Strike zone" | 35% 是安全边际，但没有任何标注。 | zh：「安全边际 35% · 击球区」<br>en: "35% margin of safety · Strike zone"（窄屏可用 "35% below value"） |
| src/app/[lang]/investors/[slug]/page.tsx:676 + lib/valuation/valuationLabel.ts:20 | P2 | Z2 / E3 | 后缀 zh「· 待确认」/ en "· pending" | 没说明在等什么确认。 | zh：「· 数据待核」<br>en: "· under review"（原因已在 tooltip 中，保留） |
| src/app/[lang]/investors/[slug]/page.tsx:685-688 | P1 | E3 | 小节标题 en "Lonely conviction" | 自造词，美国金融读者读着奇怪（lonely 带情绪色彩）。中文「独门重仓」很好，保留。 | en: "Big bets few others own" |
| src/app/[lang]/investors/[slug]/page.tsx:697-698（LONELY_MAX_HOLDERS=2，**包含本人**） | P1 | Z1 / Z2 / Z5 / X2 | 渲染 zh「以下持仓仅被 ≤2 家超投持有、且各占该组合 3% 以上（截至 2026-06-30）：」；en "Held by ≤2 tracked superinvestors, each ≥3% of this portfolio (as of 2026-06-30):" | 被字句、缩写「超投」、量词「家」、正文里出现 ≤ 符号和 ISO 日期；而且「≤2」包含他本人，读者会理解成"另外最多 2 位"。 | zh：「这几只股票各占他组合 3% 以上，而我们跟踪的其他超级投资者里最多只有 1 位也持有（2026 Q2）：」<br>en: "Each is at least 3% of this portfolio, and at most one other superinvestor we track owns it (Q2 2026):" |
| src/app/[lang]/investors/[slug]/page.tsx:711 | P1 | X3 / E3 | 列表项 zh「12% · 2 家」/ en "12% · 2" | 英文那个数字完全没有标注；中文「家」与全站的「位」不一致；"1" 的情况本应写成"只有他持有"。 | zh：holderCount===1 时显示「12% · 只有他持有」，否则显示「12% · 共 2 位持有」<br>en: "12% · sole holder" / "12% · 2 holders" |
| src/app/[lang]/investors/[slug]/page.tsx:722 | P2 | E4 | en LearnLink "What is a superinvestor" | 问句没有问号，语气偏书面。 | en: "What's a superinvestor?" / zh：「什么是超级投资者？」 |
| src/app/[lang]/investors/[slug]/page.tsx:724 + components/entity/InvestorProfileProse.tsx:22 | P2 | X3 / Z7 | 折叠标题「关于这位投资者 / About this investor」里面又有 h2「组合速览 / Portfolio overview」 | 伯克希尔、Dodge & Cox 这类机构页上写「这位」不对；两层标题说的是同一件事。 | 折叠标题 zh：「组合概况」/ en: "Portfolio at a glance"，并删掉内层 h2。 |
| src/app/[lang]/investors/[slug]/page.tsx:418-431 | P2 | Z2 / E1 | zh「…提交的 13F（SEC 原文）只有一行全 0 占位，未列任何持仓。」en "(SEC original) has a single all-zero placeholder row" | 「全 0 占位行」是数据层的说法；"SEC original" 不是英文说法。 | zh：「Olstein Capital 8 月 14 日交的 13F（SEC 原件）里一只股票都没有。」<br>en: "The 13F Olstein filed on Aug 14 (view on SEC.gov) lists no positions at all." |
| src/app/[lang]/investors/[slug]/page.tsx:439 | P2 | Z7 | zh scopeNote 一句话塞了：环比、两期市值、持仓数、出处、原因、免责 | 括号里信息太多，读者要停下来解析。 | zh：「组合市值比上季少了 96%（$150 亿 → $6.7 亿，持仓 42 → 8 只）。股价一个季度跌不了这么多，常见原因是客户赎回、清盘，或部分账户不再计入 13F，不等于基金经理主动卖了这么多。」 |
| lib/managers/displayName.ts:76,81 | P2 | Z5 | zh 副标题「Berkshire Hathaway Inc — 2026 年 1 月起由 CEO 阿贝尔…掌管…；美股持仓通过 SEC 13F 季度披露」 | 中文句里用了英文破折号加空格；「通过…季度披露」是公文腔。 | zh：「Berkshire Hathaway：2026 年 1 月起由 CEO 阿贝尔（Greg Abel）掌管，巴菲特任董事长。美股持仓每季在 SEC 13F 中公开。」 |
| lib/managers/displayName.ts:39 | P2 | Z1 | zh「芒格生前建立的组合；芒格已于 2023 年 11 月去世，之后的申报不是他的决定」 | 「申报不是他的决定」搭配不当，做决定的是调仓，不是申报。 | zh：「芒格生前搭起的组合。他 2023 年 11 月去世，此后的买卖已不是他的决定。」 |
| lib/managers/rowSignals.ts:14-17 | P1 | Z3 / Z4 | 信号列 zh「重磅新建」「重磅加仓」「从不减仓·4季」 | 「重磅」是标题党词，实际门槛只是仓位 ≥3%；「从不」夸大了，实际只看最近 4 季。 | zh：「新建大仓」「大幅加仓」「4 季未减」「连续加仓 3 季」「核心仓 6 季」 |
| lib/managers/rowSignals.ts:20-23 | P2 | E1 | en "Adding · 3 quarters"、"No trims · 4 quarters" | 可以更像行情终端里的短标签。 | en: "Added 3 qtrs straight", "Held, no trims · 4 qtrs", "Core · 6 qtrs" |
| lib/managers/profileProse.ts:85 | P1 | E1 | en "The top 5 holdings represent 71% of that value, a concentrated portfolio." | 句末同位语悬空，是中文「属…组合」的直译。 | en: "The top five make up 71% of it, so this is a concentrated portfolio." |
| lib/managers/profileProse.ts:88 + :70-80 | P1 | Z1 / Z5 | zh「Berkshire Hathaway Inc 最新一期 13F 申报(截至 2026-06-30)报告 41 个持仓，合计市值 $263.45B。前 5 大持仓占其中 71%，属高度集中的组合。」 | 「申报…报告」重复；半角括号；ISO 日期；「前 5 大持仓…属…组合」主语对不上。 | zh：「Berkshire Hathaway 最新一份 13F（2026 Q2）列了 41 只股票，合计 2,634 亿美元。前 5 大占了 71%，持仓相当集中。」（中等档：「集中度中等」；分散档：「持仓比较分散」） |
| lib/managers/profileProse.ts:68,85,88 | P1 | X3 | 持仓只有 1–4 只时，topK=n：en "The top 1 holdings represent 100%"；zh「前 1 大持仓占其中 100%」 | 单复数错，而且是一句没有信息量的话。 | n≤2 时跳过这句，或改成 zh「只持有 2 只股票」/ en "It holds just 2 stocks."；topK=1 时绝不能拼成 "top 1 holdings"。 |
| lib/managers/profileProse.ts:103-104 | P2 | Z5 | zh「其次是 American Express(10.1%) 和 Bank Of America(9.8%)。」 | 半角括号紧贴英文名。 | zh：「其次是 American Express（10.1%）和 Bank of America（9.8%）。」 |
| lib/managers/profileProse.ts:120,126 | P2 | Z5 / X3 | zh「较上一季度，巴菲特、阿贝尔 新建 3 个持仓，清仓 2 个，加仓 5 个，减仓 4 个。」；全为 0 时 en "opened 0 new positions, exited 0, added to 0, and trimmed 0." | 中文名后多了一个空格；数字全为 0 时这句话等于什么也没说。 | zh：「和上季比，巴菲特、阿贝尔新建仓 3 只、清仓 2 只、加仓 5 只、减仓 4 只。」全为 0 时 zh：「和上季比，持仓一只没动。」en: "No changes from last quarter." |
| lib/managers/profileProse.ts:123,129（exits 按 prevShares 排序） | P1 | X2（准确性） | zh「最受关注的卖出是清仓 X。」/ en "The most notable sale was the full exit from X." | 这里是按原持股**股数**排序选出来的，"最受关注 / most notable"是编出来的判断。 | zh：「清仓里规模最大的是 X。」<br>en: "The biggest exit was X." （排序最好也改成按上季市值） |
| lib/managers/profileProse.ts:155-157 | P2 | Z6 / Z4 | zh「在全部 12 个季度的申报中，Apple 每期都在持仓之列，American Express 亦然。按市值计，Apple 目前排在第 1 位。」 | 「之列」「亦然」偏文言，和站上其他口语化的文案不协调；排第 1 的信息上一段已经说过。 | zh：「我们收录的 12 个季度里，Apple 和 American Express 每一季都在。」（rank1===1 时省略后半句；否则写「Apple 目前是第 3 大持仓。」） |
| lib/managers/profileProse.ts:167,170 | P1 | Z1 / E5 | zh「…因此是滞后且不完整的组合视图。」en "…so it is a lagging and partial view of the portfolio." | 「组合视图」是翻译腔；「约 45 天后提交」也不准确，45 天是截止期限。 | zh：「13F 最晚在季末后 45 天内交，只列美股多头，所以它是一张晚了一个多月、也不完整的持仓快照。来源：SEC EDGAR。」<br>en: "A 13F is due within 45 days of quarter-end and lists only long positions in US-listed stocks, so treat it as a late, partial snapshot. Source: SEC EDGAR." |
| lib/entity/quarterMovesText.ts:9 | P1 | X1 | zh「Q2 2026：新建 0 · 增持 4 · 减持 12 · 清仓 1」 | 「增持 / 减持」和页面其他地方的「加仓 / 减仓」不一致；单独的「新建」读起来也别扭。 | zh：「2026 Q2：新建仓 0 · 加仓 4 · 减仓 12 · 清仓 1」 |
| src/app/[lang]/investors/_movesPage.tsx:39-49,53-65 | P1 | Z2 / E3 | 渲染 zh「统计基准季：Q2 2026（Q3 2026 尚未达到披露门槛：截止日前）。另有 23 位已交 Q3 2026。未计入（最新申报更早）：段永平（Q1 2026）。」en "Baseline quarter: Q2 2026 (Q3 2026 not yet at disclosure threshold: before filing deadline). 23 managers have already filed Q3 2026. Not counted (older latest filing): …" | 基准季、披露门槛、覆盖率都是工程判定条件；读者真正想知道的是"为什么还是 Q2，Q3 什么时候来"。 | zh（截止日前）：「本页按 2026 Q2 统计。Q3 的 13F 11 月 14 日才截止，目前 81 位里只有 23 位交了，等交齐再切换。没算进来的（最新 13F 还停在更早季度）：段永平（2026 Q1）。」<br>en: "Counts are for Q2 2026. Q3 filings aren't due until Nov 14, and only 23 of 81 investors have filed, so we'll switch once most are in. Not included (latest 13F is older): Duan Yongping (Q1 2026)."<br>（低覆盖率分支 zh：「…Q3 的 13F 目前只交了 23/81 位，太少，先不切换。」） |
| src/app/[lang]/investors/_movesPage.tsx:94 + lib/nav.ts:21-22 | P0 | E3 / X1 | 页面 H1 en "Top buys" / "Top sells"；zh H1「最多人买」，SubNav「本季最多人买」 | 美国读者看到 "Top buys" 会理解成金额最大的买入，实际是按人数排的；中英两边的 H1 与导航名也不一致。 | en: "Most bought" / "Most sold"<br>zh：H1 与导航统一为「本季买的人最多」/「本季卖的人最多」 |
| src/app/[lang]/investors/_movesPage.tsx:105-107 | P1 | Z1 / E1 | zh「在 Q2 2026 被最多超级投资者新建仓或加仓的股票。」en "Stocks most superinvestors opened or added in Q2 2026." | 中文是被字句加长定语；英文 "opened or added" 缺宾语，"most superinvestors" 有歧义。 | zh：「2026 Q2 新建仓或加仓人数最多的股票。」/「…清仓或减仓人数最多的股票。」<br>en: "The stocks the most superinvestors bought or added to in Q2 2026." / "…sold out of or trimmed in Q2 2026." |
| src/app/[lang]/investors/buys/page.tsx:15-16, sells/page.tsx:15-16 | P0 | Z1 / Z2 / X1 | zh「按最新可比 13F 申报季，被最多顶级投资者新建仓或加仓的股票。」en "…in the latest comparable 13F quarter." | SEO 描述里出现「可比」"comparable"这种口径词；被字句；「顶级投资者」与站名「超级投资者」不一致。 | zh：「上一季哪些股票被最多超级投资者买进？按新建仓、加仓的人数排序，附每只股票的买入金额，数据来自 13F。」<br>en: "Which stocks did the most superinvestors buy last quarter? Ranked by how many opened or added to a position, from their latest 13F filings." （sells 页同构） |
| src/app/[lang]/investors/_movesPage.tsx:22 vs [slug]/page.tsx:605 | P2 | X1 | en badge "Opened" vs "New" | 同一动作在不同页面用了两个词。 | en: 全站 badge 统一用 "New"。 |
| src/app/[lang]/investors/_movesPage.tsx:145 | P2 | X1 | 大数字下的小字 zh「位投资者」/ en "managers" | 英文用了 "managers"，和全站的 "superinvestors / investors" 不一致。 | zh：「位」<br>en: "investors" |
| lib/aggregate/blurb.ts:33-35 | P1 | Z1 / Z4 | 渲染 zh「Q2 2026，AAPL 获最多投资者买入（新建仓或加仓）——12 位，其后是 MSFT、GOOGL。」 | 「获最多投资者买入」是被动加欧化结构；括号、破折号、逗号叠在一起。 | zh：「2026 Q2 买入 AAPL 的超级投资者最多，有 12 位新建仓或加仓；其次是 MSFT 和 GOOGL。」 |
| lib/aggregate/blurb.ts:37-39 | P1 | E1 / X1 | en "In Q2 2026, AAPL drew the most buying — opened or added (12 superinvestors), followed by MSFT and GOOGL."；卖出侧写的是 "selling — sold or trimmed" | em-dash 后面接括号，读不顺；卖出侧用了 "sold"，其他地方都是 "exited"。 | en: "More superinvestors bought AAPL in Q2 2026 than any other stock: 12 opened or added to a position. MSFT and GOOGL were next."（卖出侧："…sold AAPL…: 12 exited or trimmed.") |
| lib/aggregate/blurb.ts:19-23 | P1 | Z1 / Z2 / E5 | zh「本季纳入统计的 79 位超级投资者中，AAPL 被 23 位同时持有、居共识首位，环比 +2 位；前五大共识股合计出现 98 人次。」en "…The top 5 consensus names appear in 98 portfolios combined." | 被字句、「居共识首位」、「人次」；"98 人次"是重复计数，对读者没有意义。 | zh：「我们统计的 79 位超级投资者里，23 位持有 AAPL，比上季多 2 位，排第一。」<br>en: "AAPL is the most widely held stock among the 79 superinvestors we count this quarter: 23 own it, 2 more than last quarter."（删掉 top-5 合计这句） |
| src/app/[lang]/investors/consensus/page.tsx:36-37 | P0 | Z1 / X1 | zh「顶级价值投资者 13F 中被最多人同时持有的股票，含季度环比。」 | SEO 描述：被字句，「顶级价值投资者」与站名不一致，「含季度环比」是填表腔。 | zh：「81 位超级投资者里，哪些股票被最多人同时持有？按持有人数排序，附每只股票比上季多了几位、少了几位。数据来自 13F。」<br>en: "The stocks the most superinvestors own at once, ranked by holder count, with how many joined or left since last quarter. From 13F filings." |
| src/app/[lang]/investors/consensus/page.tsx:116 + lib/valuation/asOf.ts:21 | P1 | X3 | 渲染 zh「估值徽章：估值截至 2026-10-24 收盘价（SEC 财报 × 收盘价）」；en "Valuation badges: Valuations as of the 2026-10-24 close (SEC filings × closing prices)" | 前缀和 `valuationAsOfText` 拼在一起后，"估值""收盘价"各出现两次，英文句中还出现了大写 V；「估值徽章」也是内部叫法。 | zh：「估值按 10 月 24 日收盘价和 SEC 财报计算。」<br>en: "Valuations use the Oct 24 close and SEC financials." |
| src/app/[lang]/investors/consensus/page.tsx:98 | P2 | Z2 | eyebrow zh「跨基金共识 · SEC 13F」 | 「跨基金共识」偏抽象。 | zh：「SEC 13F · 多人同时持有」<br>en: "SEC 13F · held by many" |
| components/aggregate/AggregateRankingList.tsx:46 | P1 | Z2 / E3 | zh「占聚合 12.3%」/ en "12.3% of aggregate" | 「聚合」是自造词，读者不知道分母是什么（实际是榜单前 50 只的合计市值）。 | zh：「占前 50 合计市值 12.3%」<br>en: "12.3% of top-50 value" |
| components/aggregate/AggregateRankingList.tsx:56-61 | P2 | X3 | 有 delta 时，大数字下面只显示「+2 位」/"+2"，"持有"标签被替换掉了 | 大数字 23 代表什么，没有说明。 | 两行都显示：「23 位持有」+「比上季 +2」/ "23 holders" + "+2 vs Q1" |
| components/aggregate/AggregateRankingList.tsx:30 | P2 | X2 | 空状态 zh「数据准备中」/ en "Data coming soon" | 没数据通常是读库失败，"coming soon"是在承诺一件我们不能保证的事。 | zh：「暂时没取到数据，稍后刷新再看。」<br>en: "No data right now. Try again in a bit." |
| components/aggregate/DataAsOfBadge.tsx:7-8 | P2 | Z4 / E1 | zh「数据截至 Q2 2026 · 13F，最多滞后 45 天」/ en "As of Q2 2026 · 13F, up to 45-day lag" | 「13F，最多滞后 45 天」主语不清。 | zh：「2026 Q2 数据 · 13F 在季末 45 天内公开」<br>en: "Q2 2026 data · 13Fs arrive up to 45 days after quarter-end" |
| src/lib/share/shareText.ts:33-34（跨区，consensus 页调用） | P0 | Z1 / E3 / X1 | zh「本季 AAPL 被 23 位顶级投资者同时持有，居共识首位。」en "…held by 23 top investors this quarter — the #1 consensus pick." | 分享文案：被字句，「顶级投资者」与站名不一致；"pick" 暗示推荐，和"零推荐措辞"的原则冲突。 | zh：「本季 23 位超级投资者都持有 AAPL，人数排第一。via @thecompounder」<br>en: "23 superinvestors own AAPL this quarter, more than any other stock. via @thecompounder" |
| src/lib/share/shareText.ts:41-58（跨区，buys/sells 页调用） | P0 | Z1 / X2 | zh「Q2 2026 AAPL 遭最多顶级投资者减持（12 位）。」en "…saw the most selling from top investors (12)." | 「遭」带贬义；「减持」漏掉了清仓；人数裸放在括号里；英文 "(12)" 没有单位。 | zh：「2026 Q2 有 12 位超级投资者清仓或减仓 AAPL，人数最多。」/ 买入侧：「…有 12 位超级投资者买入 AAPL…」<br>en: "12 superinvestors sold or trimmed AAPL in Q2 2026, more than any other stock." |
| src/lib/share/shareText.ts:27-28（跨区，investor 页调用） | P1 | Z5 / E1 | zh「巴菲特、阿贝尔 最新 13F：第一大持仓 APPLE INC，本季新增 …」en "…'s latest 13F — top holding Apple, added X this quarter." | 中文名后多一个空格（再加上前面提到的原始 issuer 问题）；英文用破折号串起两个碎片。 | zh：「巴菲特、阿贝尔最新 13F：第一大持仓 Apple，本季新建仓 Occidental。」<br>en: "Buffett & Abel's latest 13F: Apple is still the top holding, and they opened a stake in Occidental." |
| lib/format.ts:5-11 `formatUSD`（跨区，本板块所有金额） | P1 | X4 | 中文页显示 "$263.45B"、"$1.2M" | 中文页里混入英文量级缩写 B / M，中文读者需要自己换算。 | zh：「2,634.5 亿美元」「120 万美元」（加一个 `formatUSD(v, lang)` 参数） |
| 全区（正文、独门重仓引语、页脚） | P2 | E4 / Z5 | 报告期以 ISO 日期 "2026-06-30" 出现在句中；中文页季度写作 "Q2 2026" | 英文读者习惯 "June 30, 2026"；中文语序更自然的是「2026 Q2」或「2026 年二季度」。 | 在句中写季度标签：zh 用「2026 Q2」，en 用 "Q2 2026"；必须写日期时，en 用 "June 30, 2026"，zh 用「2026 年 6 月 30 日」。 |

---

## 4. 本区域最想优先改的 Top 5

1. **三个 OG 图英文化 + 投资人页分享文案用了原始 EDGAR 名**（buys/sells/consensus `opengraph-image.tsx`；`[slug]/page.tsx:374-378` 漏了 `cleanIssuer`；`[slug]/opengraph-image.tsx:22` 漏了 `displayFundName`）。这些是分享时最先被看到的地方，属于硬 bug，改动量最小。
2. **统一术语**：超级投资者 / 投资人（不用超投、顶级投资者），量词「位 / 只」，「新建仓 / 加仓 / 减仓 / 清仓」（不用"新建"单字，不用"增持 / 减持"），英文统一用 superinvestors / investors / New·Added·Trimmed·Exited。涉及 nav、badge、quarterMovesText、shareText、SEO description，一次改齐。
3. **修正两处与事实不符的说法**：verdict "mixed" 被叫成「持仓微调 / Mostly held」（实际是买卖笔数相等）；正文「最受关注的卖出 / most notable sale」（实际按股数排序）。
4. **重写买卖页脚注与三条解读条**（`_movesPage.tsx` 的 movesFootnote、`blurb.ts` 的 consensus 和 moves 两句）：去掉基准季、披露门槛、人次、占聚合这些口径词，改成"为什么还是 Q2、Q3 何时来、谁排第一、比上季多几位"的人话。
5. **投资人详情页三段引语**：估值姿态引语（`valuationPosture.ts`）、独门重仓引语（含 "≤2 包含本人" 的歧义）、隐含预期句（"demand a demanding"）。同时把小节名「估值姿态 / Valuation posture」改为「现在便宜的持仓 / Which holdings look cheap」，"Lonely conviction" 改为 "Big bets few others own"。
