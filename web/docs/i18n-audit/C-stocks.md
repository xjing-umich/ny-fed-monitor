# C-stocks 文案审核（个股板块 + 通用组件 + 数据新鲜度提示）

审核范围：`src/app/[lang]/stocks/**`、`src/lib/stocks/*`、`src/components/entity/*`（除 InvestorProfileProse / QuarterMovesLine / NewsletterCTA）、`src/components/common/*`、`src/components/list/*`、`src/components/discovery/*`、`src/lib/discovery/*`、`src/lib/freshness/*`、`src/lib/sections/dataFreshness.ts`、`src/lib/format.ts`、`src/lib/externalLinks.ts`、`src/components/home/filingProgressText.ts`。
只审用户可见字符串；模板函数按实际渲染结果判断（示例数据：AAPL，23 位持有人，Q2 2026）。

---

## 1. 区域概况

整体感觉：**数据骨架扎实、英文明显好于中文，但中文大量直接搬用工程口径**，读起来像内部 spec 而非写给投资者看的产品文案。英文侧多数句子能过 copy-voice 的"只有我们能说"判据，但有几处自造术语（value band、buy line、valued stocks、Position 列）母语金融读者会卡住。

三个最主要的问题模式：

1. **"持有者是谁"这一核心概念，全站至少 6 种叫法（X1，最严重）。** 同一个数字（持有该股的被追踪 13F 申报人数），列表页叫"持有机构数"，详情页叫"持有人数"，副导航叫"最多机构持有"，SEO 标题叫"最多人持有"，筛选器叫"5+ 位机构"，目录叫"两位及以上投资人"，趋势句叫"超级投资者……47 家"，新鲜度提示叫"该投资者 / 该申报主体"。`stockCopy.ts` 顶部注释想区分"机构 vs 人"，但两者数的是同一批人，强行区分反而让读者以为是两个数，而且"机构持有"会被理解成 Yahoo 那种"机构持股"（几千家），属于**意思误导**。
   - 典型：列表页列名「持有机构数 23」 vs 详情页 keyFact「持有人数 23」 vs 筛选器「被 5+ 位机构共同持有」。
2. **工程口径外露（Z2）。** "口径""可估值""单法口径""两法夹逼""保守引擎常态""申报中 30/68""切换""位置观察""每股口径疑错""数据回填""斜率"——全是开发者语言。
   - 典型：筛选器零结果时「当前没有可估值股票落在击球区（……；保守引擎常态）。」
3. **翻译腔 + 机器拼接感（Z1/X3）。** "被 Compounder 追踪的 23 位超级投资者持有""持有该证券的超级投资者""占其组合 5.2%（×3 次重复）""截至 2026-06-30 季度""有 0 位新建 AAPL 仓位"；拼接处还会出现中文名前后多余空格（"仓位最大的是 巴菲特，"）。

值得保留、可作风格锚点的句子：
- EN `stockProse` 第 4 段 "…so this is disclosed long ownership, not a complete picture." —— 具体、有主张。
- EN `filingSeasonNote` "Rows marked Q3 2026 are new filings and aren't counted in the Q2 2026 moves above." —— 一句话说清口径。
- EN `holdcoSotpNote` "Underwriting gets the lower range because its results swing far harder." —— 像人说话。
- EN `FreshnessBadge.inactive` "Holdings below are historical, not current." —— 干净。
- ZH `holdcoSotpIntro` "下面按巴菲特本人的分栏法拆开算" —— 有画面、有出处，是中文侧少见的好句。
- `stockCopy` 的 STOCK_UI（展开其余 N 只 / 第 p / n 页 / 搜索代码或公司…）短小准确。

另：`src/lib/sections/dataFreshness.ts`（`数据新鲜度 Data Freshness`、`点击 Refresh 会更新…`）中英混排很重，但全仓无调用方（NY Fed monitor 遗留），用户看不到，**不计入发现**，建议直接删除。`discoveryHandoff.ts` 的 `EYEBROW`（"下一步 · 值不值"）未被 `DiscoveryHandoff` 渲染，同样不计。

---

## 2. 术语清单

| 概念 | 当前中文 | 当前英文 | 一致？ | 建议用词 |
|---|---|---|---|---|
| 被追踪的 13F 申报人（总体） | 超级投资者 / 投资人 / 投资者 / 机构 / 顶级投资者 / 申报主体 / 追踪范围内 | superinvestors / investors / managers / filers / holders | ❌ 两侧都乱 | 中文统一 **超级投资者**（首次）/ **投资人**（简称，量词一律"位"）；不用"机构""申报主体""顶级投资者"。英文统一 **superinvestors**（首次）/ **investors**；"manager""filer"只在讲申报机制时用 |
| 持有该股的人数 | 持有机构数（列表、筛选）/ 持有人数（详情）/ 持有（移动端）/ N 家（趋势句） | Holders | ❌ 中文 | 中文统一 **持有人数**（列名）、"N 位持有"；删除 `holdersInstitution` 与 `holdersPeople` 的区分 |
| 按持有人数排序 | 按持有机构数 | By holders | ❌ | **按持有人数** |
| 副导航"最多持有" | 最多机构持有（nav）/ 最多人持有（SEO、eyebrow） | Most held | ❌ 中文 | **最多人持有**（与 SEO 一致） |
| 击球区 | 击球区 | Strike zone | ✅ | 保留（巴菲特/Ted Williams 典故，配释义） |
| 买入线 | 买入线 | buy line | ⚠️ 英文自造 | 中文保留；英文改 **buy price**（"intrinsic value minus a margin of safety"） |
| 价值带 | 价值带 | value band / band | ⚠️ 英文不惯用 | 中文可留"价值带"，但面向新读者处写"价值区间"；英文改 **value range** |
| 可估值股票 | 可估值 / 全部可估值 | valued stocks / All valued | ⚠️ 两侧都生硬 | 中文 **已估值的股票**（或直接"股票"）；英文 **stocks we value** / "All" |
| 低于内在价值档 | 低于内在价值（valuationLabel）/ 有安全边际（筛选 tab）/ 低估股（handoff） | Below intrinsic value / undervalued | ❌ 中文 | 统一 **低于内在价值** |
| 安全边际数值 | 安全边际 −32% | margin of safety −32% | ⚠️ 符号反直觉 | 显示为 **32%**（安全边际本身是正数）；如需方向，写"低于内在价值 32%" |
| 估值红旗/待确认 | 待确认 / 估值带红旗 / 便宜信号 | pending / flagged / cheap signal | ⚠️ | 中文 **待确认**；英文 **needs review**（"pending" 在美式语境像"订单处理中"） |
| 本季动作 | 新建/增持/减持/清仓（MoveMark、QuarterMovesLine）vs 新建/加仓/减仓/清仓（stockProse）；"动作""动向""增减" | opened/added/trimmed/exited；New/Added/Trimmed | ❌ 中文 | 统一 **新建 / 加仓 / 减仓 / 清仓**（"增持/减持"在 A 股语境偏指大股东公告增减持）；统称"**持仓变动**"，不用"动作" |
| 共同持有 | 共持信号 / 共同重仓 / 共同持有 | co-ownership / commonly hold | ❌ | 中文 **一起持有**；英文 "**also own**"；删掉"信号""重仓" |
| 证券 / 标的 | 该证券 / 标的 | this security / Security | ⚠️ | 中文 **股票**（列名可用"股票"），英文 **stock** |
| 筛选器列"位置" | 位置 | Position | ❌ 英文歧义（持仓站里 position=仓位） | 中文 **估值**；英文 **Valuation** |
| 季度标签 | Q2 2026（中英共用） | Q2 2026 | ⚠️ 中文 | 中文页用 **2026 Q2** 或 "2026 年二季度"（正文） |
| 日期 | 2026-06-30（正文里裸 ISO） | 2026-06-30 / quarter ended 2026-06-30 | ⚠️ | 表格/来源保留 ISO；正文中文写"2026 年 6 月 30 日"，英文写 "June 30, 2026" |
| 10 年期美债 | 10 年期美债（来源脚注）/ 10 年期国债（DataStrip） | 10-year Treasury / 10Y Treasury | ❌ 中文 | 统一 **10 年期美债** |
| 13F 滞后 | 可能滞后最多 45 天 | can lag up to 45 days | ✅（措辞可调） | "最多晚 45 天才公开" |
| 共识持仓（DataStrip） | 共识持仓 | Consensus stocks | ⚠️ 英文：美国读者会理解成"分析师一致预期" | 英文 **Widely held**（全站 nav 联动，跨区） |

---

## 3. 逐条发现表

| 位置(file:line) | 严重度 | 标签 | 现状 | 问题一句话 | 建议改写 |
|---|---|---|---|---|---|
| src/lib/stocks/stockCopy.ts:11-24 | P0 | X1 | zh `holdersInstitution: "持有机构数"`、`holdersPeople: "持有人数"`、`byHolders: "按持有机构数"` | 同一个数分成"机构数/人数"两个名字，"机构持有"还会被误读成机构持股总数 | zh 三个键统一：`holdersInstitution: "持有人数"`、`holdersInstitutionShort: "持有人"`、`holdersPeople: "持有人数"`、`byHolders: "按持有人数"`（并删掉顶部"ZH 必须区分机构 vs 人"的约定） |
| src/app/[lang]/stocks/page.tsx:42-43 | P0 | X1/Z4 | zh title `个股 · 最多人持有 — Compounder · 复利`；desc `统计顶级投资者 13F 持仓中，最多人持有的股票。` | 标题无搜索词；"顶级投资者"是第三种叫法；"统计…中，…的股票"翻译腔 | title：`超级投资者持有最多的股票（13F）— Compounder · 复利`；desc：`哪些股票被最多超级投资者同时持有、合计持有多少市值，数据来自他们最新的 13F 申报。` |
| src/app/[lang]/stocks/page.tsx:46-47 | P0 | E4/E5 | en `Stocks · Most held — Compounder`；`Most widely held securities among tracked superinvestors, derived from 13F filings.` | 标题像面包屑不像搜索标题；"securities…derived from"偏公文 | title：`Most-Held Stocks Among Superinvestors (13F) — Compounder`；desc：`The stocks the superinvestors we track hold most widely, and how much they hold in total, from their latest 13F filings.` |
| src/app/[lang]/stocks/page.tsx:115 + src/lib/nav.ts:26 | P1 | X1 | eyebrow `SEC 13F · 最多人持有`；副导航 `最多机构持有` | 同页上下两种说法 | 副导航改 `最多人持有`，与 eyebrow、SEO 一致 |
| src/app/[lang]/stocks/page.tsx:119 | P0 | X2/Z4 | zh intro `按持有机构数排列，数据来源：SEC 13F 持仓披露。少数落在击球区（…）的以绿色标出，估值截至 2026-10-24 收盘价。` | 绿色实际也标"低于内在价值"的票（BargainMark），文案只说击球区→与画面不符；"估值截至…收盘价"搭配不通 | `按持有人数排序，数据来自 SEC 13F。绿色数字是现价低于内在价值的少数几只，带「击球区」标签的已跌破买入线（内在价值再打一个安全边际的折扣）。估值按 2026-10-24 收盘价计算。` |
| src/app/[lang]/stocks/page.tsx:120 | P1 | X2/E5 | en `Ranked by number of superinvestors holding the security. … The few in the strike zone — price below the buy line: … — are marked in green (valuations as of the 2026-10-24 close).` | 同上画面不符；"buy line"自造；破折号里再套冒号，结构过重 | `Ranked by how many superinvestors hold each stock, from SEC 13F filings. Green figures mark the few trading below intrinsic value; a "Strike zone" tag means the price is also below our buy price (intrinsic value minus a margin of safety). Valuations use the 2026-10-24 close.` |
| src/app/[lang]/stocks/page.tsx:133 | P1 | X1/Z7 | zh `全部 480 只被两位及以上投资人持有的股票，按代码排序` | 折叠标题过长；"投资人"又一种叫法；"被…持有"被动 | `全部 480 只股票（至少 2 位超级投资者持有），按代码排序` |
| src/app/[lang]/stocks/StocksTable.tsx:38-39 | P1 | X2 | aria zh `击球区，安全边际 −32%`；en `In strike zone, margin of safety −32%` | 安全边际本身是正数，"安全边际 −32%"读起来像"没有安全边际" | zh `击球区，现价低于内在价值 32%`；en `In the strike zone, 32% below intrinsic value`（可视数字同步去掉负号，见 format.ts 条） |
| src/lib/format.ts:17-18 | P1 | X2 | `fmtMarginPct` → `−32%`，用在「安全边际」列/keyFact 下 | 列名是"安全边际"，数值却带负号，方向感反了（详情页 keyFact 也是「安全边际 −32%」绿色） | 安全边际处直接显示 `32%`；若某处要表达"相对内在价值"，列名改为「较内在价值」/"vs. intrinsic value"再保留 `−32%` |
| src/lib/format.ts:7-9 | P2 | E4 | `$41.20B` / `$412.5M` | B 用两位小数、M 用一位，精度不一致；正文里"$41.20B"尾零不自然 | B/T 也取一位：`$41.2B`；正文场景英文可写 `$41.2 billion` |
| src/app/[lang]/stocks/StocksTable.tsx:128-135 + src/components/list/ListToolbar.tsx:41 | P2 | X4 | 未传 `clearLabel` → 中文页清除按钮 aria-label 为 `Clear search` | 中文页读屏念英文 | STOCK_UI 加 `clearSearch: "清除搜索"` / `"Clear search"` 并传入 |
| src/app/[lang]/stocks/StocksTable.tsx:138-164 + src/components/common/DataTable.tsx:83,89 | P2 | X4 | 未传 `sortGroupLabel` → 中文页移动端排序组 aria `Sort`；DataTable 默认空态 `No data available` | 中文页英文漏出 | STOCK_UI 加 `sortGroup: "排序"` / `"Sort by"`；DataTable 的默认值改为必填或按 lang 取（个股详情页两张表未传 emptyText） |
| src/lib/stocks/stockCopy.ts:61 | P2 | E4 | en `prev: "Prev"` | 缩写 | `Previous` |
| src/lib/stocks/stockCopy.ts:40 / 55 | P2 | Z2/E3 | zh `当前档暂无可估值股票。`；en `No valued stocks in this view yet.` | "档""可估值"是内部词；"valued stocks"像"受珍视的股票" | zh `这个视图下暂时没有股票。`；en `No stocks in this view right now.` |
| src/app/[lang]/stocks/[ticker]/page.tsx:121 | P0 | Z1/Z4 | zh title `苹果 Apple Inc（AAPL）股票 — 谁在持有 \| Compounder · 复利` | "股票 — 谁在持有"是英文语序直译，搜索意图词弱 | `谁在持有苹果（AAPL）？超级投资者 13F 持仓 \| Compounder · 复利`（无中文名时用英文名：`谁在持有 Visa Inc（V）？…`） |
| src/app/[lang]/stocks/[ticker]/page.tsx:123 | P0 | E1 | en `Apple Inc (AAPL) Stock — Who's Holding \| Compounder` | "Who's Holding" 不是母语搜索说法 | `Who Owns Apple Inc (AAPL)? Superinvestor 13F Holdings \| Compounder` |
| src/app/[lang]/stocks/[ticker]/page.tsx:113 | P0 | Z5/Z7 | zh desc `23 位超级投资者持有 苹果 Apple Inc（AAPL），合计 $41.20B（多数申报截至 Q2 2026），最大持有人 伯克希尔。各家仓位与季度增减，来自 SEC 13F 申报。` | 中文名两侧多余空格；括号里塞口径；末句是名词堆叠 | `23 位超级投资者持有苹果（AAPL），合计 $41.2B，持仓最多的是伯克希尔（截至 2026 Q2，个别人已交新季）。逐家看仓位大小和本季加减仓，数据来自 SEC 13F。` |
| src/app/[lang]/stocks/[ticker]/page.tsx:114 | P0 | E1 | en `23 superinvestors hold Apple Inc (AAPL): $41.20B combined as of Q2 2026 (most filings), led by Berkshire Hathaway. Position sizes and quarter-over-quarter moves from SEC 13F filings.` | "(most filings)" 悬空看不懂；末句无谓语 | `23 superinvestors own Apple Inc (AAPL), worth $41.2B combined as of Q2 2026 for most filers. Berkshire Hathaway holds the most. See each position and how it changed last quarter, from SEC 13F filings.` |
| src/app/[lang]/stocks/[ticker]/page.tsx:122,124 | P1 | X2/E3 | fallback desc zh `查看机构 13F 持仓明细、仓位大小与持有分布`；en `See institutional 13F holders, position sizes, and ownership` | "机构/institutional holders"在美股语境是几千家机构持股，与我们几十位超级投资者不是一回事；"持有分布"空泛 | zh `谁在持有 {名}（{T}）？看哪些超级投资者持有它、各自仓位多大，数据来自 SEC 13F。`；en `Which superinvestors own {Issuer} ({T}), and how big are their positions? From SEC 13F filings.` |
| src/app/[lang]/stocks/[ticker]/page.tsx:603-604 | P2 | X2 | Dataset name zh `…的机构 13F 持有人`；en `…institutional 13F holders` | 同上，"institutional" 误导 | zh `{Issuer}（{T}）的超级投资者 13F 持仓`；en `{Issuer} ({T}) superinvestor 13F holdings` |
| src/app/[lang]/stocks/[ticker]/opengraph-image.tsx:33,6 | P1 | X4 | 中文 OG 卡 eyebrow `Stocks · AAPL`；alt `Who's holding — Compounder` | 中文分享图出现英文 UI 词 | eyebrow 按语言：`个股 · AAPL` / `Stocks · AAPL`；alt 动态化：`谁在持有 {名} — Compounder` / `Who owns {Issuer} — Compounder` |
| src/app/[lang]/stocks/[ticker]/opengraph-image.tsx:36-37 | P1 | Z4 | zh subtitle `超级投资者持仓与仓位分布` | "持仓""仓位"重复，"分布"空 | `哪些超级投资者持有，各持多少` |
| src/app/[lang]/stocks/[ticker]/page.tsx:574 | P2 | Z1/Z5 | FAQ zh `根据各位投资人最新一份 SEC 13F 披露（多数截至 2026-06-30 季度），23 位超级投资者持有 苹果 Apple Inc（AAPL）：A、B、…（23 个名字）。合计市值约 $41.20B…` | "截至 2026-06-30 季度"不通；名字多余空格；"约"配两位小数自相矛盾 | `按各人最新一份 13F（多数为 2026 年二季度），23 位超级投资者持有苹果（AAPL）：A、B、C 等。合计约 $41.2B，持仓最多的是伯克希尔。` |
| src/app/[lang]/stocks/[ticker]/page.tsx:575 | P2 | E4 | FAQ en `Per each investor's latest SEC 13F filing (most for the quarter ended 2026-06-30)…` | "Per each"冗余；ISO 日期入正文 | `Based on each investor's latest 13F (mostly for the quarter ended June 30, 2026), 23 superinvestors own Apple Inc (AAPL): …. Together they hold about $41.2B; Berkshire Hathaway holds the most.` |
| src/lib/stocks/stockCopy.ts:69 / 129 | P2 | Z7 | zh `23 位超级投资者持有。`；en `Held by 23 superinvestors.` | 副标题只重复 keyFact 里已有的数字，浪费首屏最显眼一行 | zh `23 位超级投资者持有，合计 $41.2B；持仓最多的是伯克希尔。`；en `23 superinvestors own it, $41.2B combined. Berkshire Hathaway holds the most.`（需把 total/top 传入） |
| src/lib/stocks/stockCopy.ts:71 | P1 | Z4 | zh disclaimer `仅供教育与信息参考，不构成投资建议。13F 持仓为机构自行申报，可能滞后最多 45 天。` | "可能滞后最多"语序别扭；"机构"术语冲突 | `仅供学习参考，不构成投资建议。13F 由投资人自行申报，季末后最多 45 天才公开，看到的持仓可能已经变了。` |
| src/lib/stocks/stockCopy.ts:131 | P1 | E1 | en `Educational data only — not investment advice. 13F positions are self-reported and can lag up to 45 days.` | "Educational data"不是英文说法 | `For education only, not investment advice. 13F holdings are self-reported and can be filed up to 45 days after quarter-end, so they may be out of date.` |
| src/app/[lang]/stocks/[ticker]/page.tsx:153,164 | P0 | Z1/E4 | 持有人表标题 zh `持有该证券的超级投资者`；en `Superinvestors Holding This Security` | 中文"该证券"翻译腔；英文 Title Case，与同页 "Business quality" 等 Sentence case 不一致；"security"偏法务 | zh `谁持有苹果（AAPL）`（无中文名用 ticker）或静态 `持有这只股票的超级投资者`；en `Superinvestors who own this stock` |
| src/app/[lang]/stocks/[ticker]/page.tsx:161 | P2 | Z4 | zh meta `23 位持有 · 合计 $41.20B` | "23 位持有"缺宾语 | `23 位持有人 · 合计 $41.2B` |
| src/app/[lang]/stocks/[ticker]/page.tsx:169 | P2 | E4 | en `Weight (prev→now)` | 缩写 + 箭头当标点 | `Weight (last Q → this Q)` 或 `Portfolio weight, prior → latest` |
| src/lib/stocks/stockCopy.ts:76 / 136 | P2 | Z5 | eyebrow `SEC 10-K · 基本面`、`估值 · 价值带`、`SEC 13F · 持有人`、`SEC 13F · 共持信号`、`SEC 13F · 说明` | 每节都"来源 · 名词"，`·` 堆叠成模板感；"共持信号""说明"空 | 只在需要标来源处留：`来源：SEC 10-K`、`来源：SEC 13F`；删除"共持信号""说明"这类无信息 eyebrow |
| src/lib/stocks/stockCopy.ts:81 | P2 | Z2 | zh `FCF 利润率` | 中英混写，非通行说法 | `自由现金流率` |
| src/lib/stocks/stockCopy.ts:82-83 / 142-143 | P2 | E4 | zh `营收 $280.5B → $391.0B · 近 5 年`；en `Revenue $280.5B → $391.0B · 5y` | 箭头当谓语；"5y"太电报体 | zh `营收：5 个财年从 $280.5B 增至 $391.0B`；en `Revenue grew from $280.5B to $391.0B over 5 fiscal years`（下降时用"降至 / fell"） |
| src/lib/stocks/stockCopy.ts:84 / 144 | P1 | Z7/E5 | zh `基本面数据不完整，仅供参考。`；en `Fundamentals data incomplete — read with care.` | "仅供参考"空泛，没说哪里不可靠 | zh `这家公司的财报数据有缺口，上面几个数可能不准。`；en `Some of this company's filing data is missing, so treat these figures as rough.` |
| src/app/[lang]/stocks/[ticker]/page.tsx:687-691 + stockCopy.ts:109 | P1 | X2 | 生意质量区块下方显示 `估值口径：截至 2026-06-30 的滚动十二个月（…）` | 生意质量四个指标取的是最新完整财年（businessQuality.ts:57-62），不是 TTM；在这里挂"估值口径"既放错区块又与右上角"截至 FY 末"日期打架；同句在估值区块（:844）又出现一次 | 从生意质量区块删掉这一行，只留在估值区块 |
| src/lib/stocks/stockCopy.ts:109 | P1 | Z2 | zh `估值口径：截至 2026-06-30 的滚动十二个月（最新 10-K 叠加未审计 10-Q）。` | "口径""叠加"是内部词 | `估值用的是截至 2026-06-30 的近十二个月数据：最新年报，加上之后未经审计的季报。` |
| src/lib/stocks/stockCopy.ts:169 | P2 | E5 | en `Valuation basis: trailing twelve months to 2026-06-30 — latest 10-K plus unaudited 10-Q filings.` | 可更口语 | `Valuation uses trailing-12-month figures through June 30, 2026: the latest 10-K plus unaudited 10-Qs since.` |
| src/lib/stocks/stockCopy.ts:89 | P1 | Z1/Z2 | zh `该公司近期拆股，每股估值口径待下一份财报对齐后恢复。` | "该""口径""对齐"三连 | `这家公司刚拆过股，最新财报里还是拆股前的股数。等下一份财报把股数更新过来，再恢复每股估值。` |
| src/lib/stocks/stockCopy.ts:149 | P2 | E5 | en `Recent stock split — per-share valuation is paused until the next filing restates the share count.` | 可接受，略硬 | `The company just split its stock, and its latest filing still shows the old share count. Per-share valuation resumes after the next filing.` |
| src/lib/stocks/stockCopy.ts:90 | P1 | Z2 | zh `多年回购已把股东权益压成负数，重置价值和护城河没法从资产端算，这里不给出估值判定。` | "重置价值""资产端""估值判定"术语堆叠 | `多年回购把股东权益压成了负数，没法从资产这头估算重建成本、判断护城河，所以这里不下估值结论。` |
| src/lib/stocks/stockCopy.ts:150 | P2 | E3 | en `…so reproduction value and the moat can't be assessed from the asset side. No valuation verdict is shown here.` | "reproduction value" Greenwald 术语未解释 | `Years of buybacks have pushed shareholders' equity below zero, so we can't estimate what it would cost to rebuild the business, or size its moat, from the balance sheet. No valuation call here.` |
| src/lib/stocks/stockCopy.ts:91 | P1 | Z2/Z7 | zh holdcoNotAssessable（约 110 字，"整体盈利力和资产重置价值放在一起比，对它没有经济含义"） | 术语密集、长句套长句 | `这是一家以投资组合为主的控股公司。拿合并报表的盈利能力去比资产重建成本，对它没有意义：一篮子上市证券的重建成本就是市价，持有它们也谈不上护城河。所以这里不给价值区间和护城河结论，下面的资产底价只当作下限参考。` |
| src/lib/stocks/stockCopy.ts:151 | P2 | E5 | en holdcoNotAssessable | 可读，但 "says nothing here""is a floor only" 略绕 | `This is a holding company built around an investment portfolio. Comparing its consolidated earnings power with the cost to rebuild it tells you nothing: a portfolio of listed stocks costs exactly its market value to recreate, and owning one isn't a moat. So there's no value range or moat call here. The asset floor below is only a lower bound.` |
| src/lib/stocks/stockCopy.ts:93 / 153 | P1 | Z2/E4 | zh `每股中枢 · 基础档`；en `central estimate · per share` | "中枢""档"内部词；英文小写开头 | zh `每股估值（基准情形）`；en `Per share, base case` |
| src/lib/stocks/stockCopy.ts:95 | P2 | Z1 | zh holdcoSotpIntro `…合并层面的单一口径对它没有经济含义。下面按巴菲特本人的分栏法拆开算…` | 前半句口径腔，后半句很好 | `这是一家以投资组合为主的控股公司，只看合并报表的一个数说明不了什么。下面按巴菲特本人的分栏法拆开算：投资按市值计，经营业务按盈利给倍数，两者相加，再减去未实现投资收益对应的递延税。` |
| src/lib/stocks/stockCopy.ts:155 | P1 | E1 | en `…a single consolidated lens says little about it. Below it is broken out the way Buffett himself presented it…` | "Below it is broken out"倒装生硬 | `This is a holding company built around an investment portfolio, so one consolidated number says little. We break it out the way Buffett does in his letters: investments at market value, operating businesses at a multiple of earnings, minus the deferred tax owed on unrealized gains.` |
| src/lib/stocks/stockCopy.ts:102 | P2 | Z4/Z7 | zh holdcoSotpNote `…浮存金成本为负，扣它会与承保利润重复惩罚。…投资与递延税是时点数，这两行在三档下取值相同。` | "重复惩罚""时点数""三档"不像中文 | `经营业务和承保利润都取最近三个财年的平均值，分别按 12/15/18 倍和 8/10/12 倍估值；承保结果波动大得多，所以倍数更低。浮存金不从投资组合里扣：它的成本是负的，再扣一次等于和承保利润重复计算。经营业务实际税率低于法定税率，主要来自能源业务的可再生能源税收抵免。投资和递延税是某一时点的数，三种情形下都一样。` |
| src/lib/stocks/stockCopy.ts:103-105 / 163-165 | P2 | X2/E3 | zh `悲观 / 基础 / 乐观`；en `Low / Base / High` | 中英语义不对等；美式惯用 Bear/Base/Bull | en `Bear / Base / Bull`；zh 保留或改 `保守 / 基准 / 乐观` |
| src/lib/stocks/stockCopy.ts:106 / 166 | P2 | Z4 | zh `资产底（每股）`；en `Asset floor (per share)` | "资产底"生造 | zh `资产底价（每股）`；en 可留 |
| src/lib/stocks/stockCopy.ts:107 | P1 | Z2/Z7 | zh `这家公司的财报数据存在口径问题（如营业利润高于营收），数值不可靠，暂不给出估值判定，待数据修正后恢复。` | 四个分句、"口径问题"外露 | `这家公司的财报数据有明显错误（比如营业利润比营收还高），我们先不给估值，数据修正后再恢复。` |
| src/lib/stocks/stockCopy.ts:167 | P2 | E5 | en `This company's reported figures contain an impossible value (e.g., operating income above revenue), so the data can't be trusted and no valuation verdict is shown until it's corrected.` | 一句太长 | `This company's filings contain an impossible number (operating income above revenue, for example). We're holding off on a valuation until the data is fixed.` |
| src/lib/stocks/stockCopy.ts:108 / 168 | P1 | Z4/E1 | zh `内在价值怎么读`；en `How to read intrinsic value` | 内在价值是"算/估"出来的，不是"读"的 | zh `内在价值是怎么估出来的`；en `How we estimate intrinsic value` |
| src/lib/stocks/stockCopy.ts:118-121 | P0 | X2/Z2/Z5 | zh coOwned `eyebrow: "SEC 13F · 共持信号"`、`lead: "持有 Apple Inc（AAPL）的这些人还共同重仓 →"`、`shared: "12 人"` | "重仓"指仓位大，但这里数的是共同持有人数→意思错；"这些人"无先行词；箭头当标点；"共持信号"自造；量词"人"与全站"位"不一 | eyebrow 删；lead `持有苹果（AAPL）的超级投资者，还常一起持有这些股票：`；shared `12 位` |
| src/lib/stocks/stockCopy.ts:178-181 | P1 | E1/X2 | en title `Also held by these investors`；lead `Investors holding Apple Inc (AAPL) also commonly hold →` | 标题读起来像"这只股还被这些人持有"（下面却是股票列表）；"commonly hold"不地道 | title `What AAPL's holders also own`；lead `Superinvestors who own Apple Inc (AAPL) also tend to own:`；shared 保留 `12 holders` |
| src/lib/stocks/stockCopy.ts:123-124 / 183-184 | P1 | Z7/E3 | 折叠标题 zh `文字说明`；en `Written summary`；eyebrow `SEC 13F · 说明 / notes` | 等同于 "Details"，违反 FoldedSection 自己的注释；不告诉读者里面是什么 | zh `持有情况概述：谁持有、本季怎么动`；en `Ownership summary: who holds it and what changed`；eyebrow 删 |
| src/lib/stocks/stockProse.ts:61 | P1 | Z1/Z5 | zh `Apple Inc（AAPL）被 Compounder 追踪的 23 位超级投资者持有，合计申报市值 $41.20B。仓位最大的是 巴菲特，占其组合 21.3%。` | "被…持有"长被动；中文名前多余空格；"占其组合"文言 | `我们追踪的超级投资者里，有 23 位持有苹果（AAPL），申报市值合计 $41.2B。持仓最多的是巴菲特，这只股票占他组合的 21.3%。`（代码：去掉链接前后空格，issuer 换 displayName） |
| src/lib/stocks/stockProse.ts:55-57 | P2 | E4 | en `…is held by 23 of the superinvestors tracked on Compounder, with a combined $41.20B in reported 13F value. The largest position belongs to X, where it makes up 21.3% of the portfolio.` | 可读；"where it makes up"略绕 | `23 of the superinvestors we track own Apple Inc (AAPL), with $41.2B in combined 13F value. X has the biggest stake, at 21.3% of the portfolio.` |
| src/lib/stocks/stockProse.ts:73-79 | P1 | Z5/Z7/E1 | zh `按市值，其他主要持有人包括 A（占其组合 5.2%）、B（占其组合 3.1%） 和 C（占其组合 1.0%）。`；en `…include A (5.2% of its book)…` | " 和 "两侧半角空格；"占其组合"连写三次；英文用 its 指人 | zh `其余持仓较大的还有：A（占组合 5.2%）、B（3.1%）和 C（1.0%）。`；en `Other large holders: A (5.2% of portfolio), B (3.1%) and C (1.0%).` |
| src/lib/stocks/stockProse.ts:88,92 | P1 | X3/Z2/X1 | zh `截至 2026-06-30 的这一季，追踪范围内有 0 位新建 AAPL 仓位，4 位加仓，3 位减仓，1 位清仓。`；en `…0 of the tracked filers opened a new position…` | 计数为 0 时照样输出"0 位新建"；"追踪范围内""filers"内部词；"加仓/减仓"与表格 MoveMark"增持/减持"不一致 | 跳过为 0 的项。zh `2026 年二季度，4 位加仓、3 位减仓、1 位清仓 AAPL。`；en `In Q2 2026, 4 investors added to AAPL, 3 trimmed, and 1 sold out.` |
| src/lib/stocks/stockProse.ts:109-113 | P1 | Z4/Z7 | zh 第 4 段 `以上持有人数与市值来自最新的 SEC Form 13F 申报，截至 2026-06-30 季度。…13F 仅涵盖美股多头持仓，且可能滞后实际组合最多 45 天，因此这是已披露的多头持有情况，并非完整全貌。` | "截至 …季度"不通；"完整全貌"叠义；一段 4 句信息过载 | `以上数字来自各人最新的 13F 申报，多数为 2026 年二季度。另有 5 位已提前交了三季度申报，表里按新申报列出，但不算进上面的季度增减。13F 只披露美股多头仓位，而且最多晚 45 天才公开，所以这里只是公开的多头持仓，不是完整组合。来源：SEC EDGAR。` |
| src/lib/stocks/stockProse.ts:102-106 | P2 | E4 | en `…through the quarter ended 2026-06-30. 5 investors have already filed…` | ISO 日期入正文；句首数字 | `…through the quarter ended June 30, 2026. Five investors have already filed for Q3 2026; …` |
| src/lib/stocks/filingSeasonNote.ts:15-16 | P1 | Z2/Z4 | zh `Q3 2026 申报中 30/68。标 Q3 2026 的行是新申报，不计入上面的 Q2 2026 动作。` | "申报中 30/68"像日志；"动作"不是中文说法 | `Q3 2026 的 13F 正在陆续提交，68 位里已交 30 位。名字旁标着 Q3 2026 的是新交的申报，不算进上面的 Q2 增减统计。` |
| src/lib/stocks/filingSeasonNote.ts:18 | P2 | E1 | en `Q3 2026 filings arriving: 30 of 68.` | 后半句很好；前半句电报体 | `Q3 2026 filings are coming in: 30 of 68 so far.` |
| src/components/home/filingProgressText.ts:12 | P0 | Z2/Z5 | zh（首页 hero）`Q3 2026 申报进行中 · 68 位中 30 位已交（另有 3 位上季未申报，不计入） · 11 月 16 日截止后切换` | "切换"切什么用户不知道；三个 `·` 串起长句 | `Q3 2026 的 13F 陆续提交中：68 位已交 30 位（另 3 位上季没交，不计入）。11 月 16 日截止后，全站换成 Q3 数据。` |
| src/components/home/filingProgressText.ts:14 | P0 | E1/E3 | en `Q3 2026 filings arriving · 30 of 68 in (3 more missed last quarter and aren't counted) · switches after Nov 16` | "30 of 68 in""switches"看不懂 | `Q3 2026 filings coming in: 30 of 68 so far (3 others missed last quarter and aren't counted). The site moves to Q3 data after the Nov 16 deadline.` |
| src/lib/freshness/excludedClause.ts:7 | P2 | E1 | en ` (3 more missed last quarter and aren't counted)` | "more"暗示是额外已交的人 | ` (3 others missed last quarter and aren't counted)` |
| src/lib/freshness/derive.ts:230 | P2 | Z5 | `quarterLabel` 中文页也输出 `Q2 2026` | 中文习惯年在前 | 增加 lang 参数：zh 返回 `2026 Q2`（正文可用"2026 年二季度"），en 保持 `Q2 2026` |
| src/components/entity/HolderTrend.tsx:13-14 | P1 | X3/Z1 | zh `近 8 季持有该证券的超级投资者：41 → 47 家。` | 超级投资者配"家"；"该证券"；箭头做谓语 | `近 8 个季度，持有它的超级投资者从 41 位增至 47 位。`（减少时"降至"） |
| src/components/entity/HolderTrend.tsx:15 / 23 | P1 | Z2/E3 | zh `早期季度持有人数可能因数据回填偏低，斜率仅供参考。`；en `Early quarters may understate holder counts due to data backfill — read the slope with care.` | "数据回填""斜率""backfill"都是工程词 | zh `较早几个季度的数据还不全，人数可能偏少，别太看重这条线的走势。`；en `Our data for earlier quarters is less complete, so older counts may run low. Don't read too much into the trend.` |
| src/components/entity/HolderTrend.tsx:16-17 | P2 | Z4 | zh inline `持有人 41 → 47 · 近 8 季` | "近 8 季"口语少见 | `持有人数 41 → 47（近 8 个季度）` |
| src/components/entity/FreshnessBadge.tsx:10 | P1 | Z1/Z2/X1 | zh `⚠ 该投资者最新公开 13F 为 2025-12-31，落后当前披露季 2 季。以下持仓与解读反映该期数据，可能并非当前持仓。` | "该…该…"、"披露季"、"反映该期数据"翻译腔；"投资者"又一种叫法 | `⚠ 他最新一份 13F 停在 2025 Q4，比大多数人晚了 2 个季度。下面的持仓和解读都是那时的，现在可能已经变了。` |
| src/components/entity/FreshnessBadge.tsx:18 | P1 | E3/X1 | en `⚠ This manager's most recent public 13F covers 2025-12-31, 2 quarters behind the latest disclosure quarter. Holdings below reflect that filing and may not be current.` | "disclosure quarter"自造；"covers 2025-12-31"日期当季度 | `⚠ This investor's latest 13F is for Q4 2025, two quarters behind most others. The holdings below are from that filing and may have changed since.` |
| src/components/entity/FreshnessBadge.tsx:12 / 20 | P1 | Z2/X1 | zh `⚠ 已停报：该申报主体最后一次 13F 为 2025-06-30，此后未再申报。…`；en `…this filer's last 13F covers…` | "申报主体""filer"内部词 | zh `⚠ 已停止申报：他最后一份 13F 是 2025 Q2，之后再没交过。下面是历史持仓，不是现在的。`；en `⚠ No longer filing: this investor's last 13F was for Q2 2025. Holdings below are historical, not current.` |
| src/components/entity/FreshnessDot.tsx:13 | P2 | Z4 | zh `数据新鲜` | 中文不说数据"新鲜" | `数据最新` |
| src/components/entity/SourceFooter.tsx + page.tsx:669 | P2 | Z5/X1 | zh 来源 `FRED 10 年期美债(DGS10)`；DataStrip.tsx:9 `10 年期国债` | 中文里半角括号；同一指标两种叫法 | `FRED 10 年期美债（DGS10）`；DataStrip 统一为 `10 年期美债` |
| src/app/[lang]/stocks/[ticker]/page.tsx:496 | P2 | Z2 | 来源名 `SEC 10-K + 10-Q (XBRL)` | "XBRL" 对读者无意义 | `SEC 10-K + 10-Q`（zh 可写 `SEC 年报 + 季报`） |
| src/lib/stocks/stockCopy.ts:38 + src/app/[lang]/stocks/[ticker]/page.tsx:926 | P2 | Z4 | zh `也可在` + 三个图标 | 半截句"也可在……"没有收尾动词 | `在其他网站查看`；en `Also on` 可留 |
| src/lib/stocks/stockCopy.ts:12 + src/app/[lang]/stocks/StocksTable.tsx:89 | P2 | Z2/E4 | 列名 zh `标的`；en `Security` | "标的"偏行话；榜单全是股票 | zh `股票`；en `Stock` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:43 | P0 | Z2 | zh title `个股 · 按价值带 — Compounder · 复利` | "价值带"是自造词，放进 SEO 标题没人搜 | `个股估值筛选：哪些现价低于内在价值 — Compounder · 复利` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:44 | P0 | Z2 | zh desc `…哪些落在击球区、安全边际多少。位置观察，非买卖建议。` | "位置观察"不知所云 | `按现价离内在价值有多远筛选个股：哪些已落在击球区，安全边际有多大。仅供参考，不构成买卖建议。` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:47-48 | P0 | E3/E1 | en title `Stocks · By value — Compounder`；desc `…Observational, not advice.` | "By value"歧义（按市值？）；"Observational"不是英文免责说法 | title `Stock Screener: Price vs. Intrinsic Value — Compounder`；desc `See which stocks trade below intrinsic value, which are in the strike zone, and how wide each margin of safety is. Not investment advice.` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:58 | P0 | X2/X1 | 视图 tab zh `机构重仓 · 按估值`；en `Most-held · by value` | "重仓"指仓位重，这里实际是"至少 5 位持有"→意思错；中英不对等；"机构"术语冲突 | zh `多人持有`；en `Widely held` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:60 | P0 | X1/X2 | 视图 tab zh `有安全边际`；en `Below intrinsic value` | 与估值徽章"低于内在价值"不一致；击球区也"有安全边际"，分类重叠 | zh `低于内在价值` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:61 | P1 | Z2/E3 | 视图 tab zh `全部可估值`；en `All valued` | "可估值"内部词 | zh `全部`；en `All` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:104-108 | P1 | Z2/Z5 | eyebrow zh `13F × 估值 · 机构重仓`、`估值 · 按价值带`；en `13F × valuation · most held` | "×"和"·"叠用，像内部命名 | zh `13F 持仓 + 估值`、`估值筛选`；en `13F holdings + valuation`、`Valuation screener` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:83 | P1 | Z1/Z2 | zh `现在 3 只可估值股票落在击球区（价格低于买入线：内在价值扣除安全边际），截至 2026-10-24。` | "可估值"；日期尾挂；括号里冒号定义生硬 | `截至 2026-10-24，有 3 只股票落在击球区：现价已低于买入线（内在价值再打一个安全边际的折扣）。` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:84 | P1 | E3 | en `3 valued stocks are in the strike zone (price below the buy line: intrinsic value minus a margin of safety), as of 2026-10-24.` | "valued stocks""buy line" | `As of 2026-10-24, 3 stocks are in the strike zone, trading below our buy price (intrinsic value minus a margin of safety).` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:86 | P1 | Z2/X2 | zh `当前没有可估值股票落在击球区（…；保守引擎常态）。`（英文无对应半句） | "保守引擎常态"纯内部词；中英不对等 | zh `眼下没有股票落在击球区。我们的估值故意偏保守，这很正常。`；en `No stocks are in the strike zone right now. Our valuations are deliberately conservative, so that's normal.` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:90 | P1 | X3/Z2/Z5 | zh `120 只被 5+ 位机构共同持有的股票，按现价相对内在价值的位置排序：便宜的在前。落在击球区且机构共识高的置顶。位置观察，非买卖建议。` | "5+ 位机构"量词错配且"+"不是中文写法；"机构共识高""位置观察"内部词 | `至少 5 位超级投资者同时持有的 120 只股票，按现价离内在价值有多远排序，越便宜越靠前；已落在击球区、持有人又多的排在最上面。仅供参考，不构成买卖建议。` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:91 | P1 | X1/E1 | en `120 stocks held by 5+ managers, … Those in the strike zone with high consensus rise to the top. Observational, not advice.` | "managers"术语不一；"high consensus"指代不清 | `120 stocks owned by at least 5 superinvestors, sorted by how far price sits below intrinsic value, cheapest first. Strike-zone stocks with the most holders are pinned to the top. Not investment advice.` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:122 | P1 | Z1/Z4 | zh intro `按现价相对内在价值的位置排序，安全边际高者在前。来源：公司财报与公开市场价格。` | "相对…的位置"翻译腔；"高者在前"文白夹杂 | `按安全边际从大到小排序。数据来自公司财报和公开市场收盘价。` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:152 | P1 | E3 | sort chip en `By margin` | 美国读者会理解成利润率 | `By margin of safety` |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:183 | P1 | Z2/X4/Z4 | zh 页脚 `估值截至 2026-10-24 · 方法：保守 Greenwald 价值带 + Owner-Earnings DCF 两法夹逼。安全边际是现价相对内在价值的距离，不含质量或时机判断；仅供参考，非投资建议。`（无日期时 `估值刷新中`） | 中文页留英文方法名；"两法夹逼"数学黑话 | `估值截至 2026-10-24。方法：用格林沃尔德的保守价值区间，和巴菲特式的所有者盈余现金流折现（DCF）互相校验。安全边际只说明现价比内在价值低多少，不代表公司好坏，也不提示买点。不构成投资建议。`（无日期：`估值更新中`） |
| src/app/[lang]/stocks/screener/_screenerPage.tsx:184 | P2 | E4 | en `Valuation as of 2026-10-24 · method: conservative Greenwald value band + Owner-Earnings DCF. …`（无日期 `Valuation refreshing`） | "·"后小写、加号连接；"refreshing"不自然 | `Valuations as of 2026-10-24. Method: a conservative Greenwald value range, cross-checked with an owner-earnings DCF. Margin of safety measures how far price sits below intrinsic value; it says nothing about quality or timing. Not investment advice.`（无日期：`Valuations updating`） |
| src/app/[lang]/stocks/screener/ScreenerTable.tsx:40-42 | P0 | E3/Z2 | 列名 zh `位置`；en `Position` | 持仓网站里 "Position" = 仓位，必然误读；"位置"也不说明是什么 | zh `估值`；en `Valuation` |
| src/app/[lang]/stocks/screener/ScreenerTable.tsx:72 | P1 | X4/E4 | 列名 zh `价值带 / sh`；en `Value band / sh` | 中文列名夹英文缩写 "sh" | zh `每股价值区间`；en `Value range / share` |
| src/app/[lang]/stocks/screener/ScreenerTable.tsx:51 | P2 | E3 | 移动端 en `Margin` | 同 By margin 歧义 | `Safety margin` |
| src/app/[lang]/stocks/screener/ScreenerTable.tsx:61,150 | P1 | Z2/E1 | tooltip zh `估值带红旗（盈利下滑/高杠杆/模型不稳/每股口径疑错），边际不可信，未计入便宜信号。`；en `Valuation flagged (declining earnings / high leverage / model instability / per-share doubt); margin not trustworthy, excluded from the cheap signal.` | "每股口径疑错""便宜信号""per-share doubt""cheap signal"不是人话；且与 valuationLabel.pendingWhy 文案重复两份 | zh `这只股票的估值有警示：盈利在下滑、负债偏高、模型结果不稳，或每股数据可能有误。这个安全边际靠不住，没有算进便宜名单。`；en `Flagged: falling earnings, heavy debt, an unstable model, or questionable per-share data. Don't rely on this margin; it isn't counted as cheap.`（直接复用 valuationLabel 的同一句） |
| src/app/[lang]/stocks/screener/ScreenerTable.tsx:126-127 | P1 | Z2/X2 | zh `带 * 的为单法口径，内在价值一列为零增长价值。价值带下沿是零增长价值；内在价值含增长假设，个别公司会低于下沿。` | 前句说内在价值=零增长，后句说内在价值含增长，读者看着自相矛盾；"单法口径"内部词 | `标 * 的股票只用了一种估值方法，它的内在价值就是不含增长的价值。其余股票的内在价值包含增长假设，个别会低于价值区间下沿（下沿即零增长价值）。` |
| src/app/[lang]/stocks/screener/ScreenerTable.tsx:127 | P2 | E5 | en `Rows marked * use a single method; their intrinsic value is the zero-growth value. The band's lower edge is…` | 同上逻辑跳跃 | `Stocks marked * use one valuation method, so their intrinsic value is the no-growth value. For the rest, intrinsic value includes growth assumptions and can occasionally sit below the low end of the range (which is the no-growth value).` |
| src/lib/discovery/discoveryHandoff.ts:48 | P1 | Z4/E5 | zh `AAPL 现价不低于内在价值。`；en `AAPL's price is not below its intrinsic value.` | 双重否定读着像机器输出 | zh `按我们的估算，AAPL 现在不算便宜。`；en `By our estimate, AAPL isn't trading below intrinsic value.`（CTA 保持"看当前击球区股票 / See what's in the strike zone now"） |
| src/lib/discovery/discoveryHandoff.ts:25-26 | P2 | Z4/E3 | zh `看哪些股票现价低于内在价值。` + `浏览全部可估值股票`；en `Browse all valued stocks` | 祈使句无主语、"可估值"内部词 | zh `想找现价低于内在价值的股票？` + `看估值筛选`；en `Looking for stocks below intrinsic value?` + `Open the screener` |
| src/lib/discovery/discoveryHandoff.ts:34 | P2 | X2 | zh CTA `看全市场击球区` | 只覆盖已估值的几百只，"全市场"夸大 | `看所有击球区股票` |
| src/lib/discovery/discoveryHandoff.ts:42 | P2 | X1/Z7 | zh CTA `按安全边际浏览全部低估股`；en `Browse all undervalued stocks by margin of safety` | "低估股"第三种叫法；太长 | zh `看所有低于内在价值的股票`；en `See all stocks below intrinsic value` |
| src/lib/discovery/discoveryHandoff.ts:61 | P1 | X3 | zh 尾巴 `，另有 5 只待确认（A、B、C 等 5 只）` | "5 只"说两遍 | `，另有 5 只待确认（A、B、C 等）` |
| src/lib/discovery/discoveryHandoff.ts:77,87 | P2 | Z4/Z5 | zh `巴菲特 有 3 只持仓现价落在击球区…`、`巴菲特 目前没有已确认的击球区持仓…` | 中文名后多余空格；"持仓现价落在"拗口 | `巴菲特有 3 只持仓落在击球区…`、`巴菲特目前没有确认落在击球区的持仓…`（拼接时中文名不加空格） |
| src/lib/discovery/discoveryHandoff.ts:64,78 | P2 | E3 | en `…; 2 more are pending (X and Y)` | "pending"没解释，像订单状态 | `…; 2 more look cheap but need review (X and Y)` |
| src/lib/discovery/discoveryHandoff.ts:89 | P2 | Z7 | zh CTA `按安全边际浏览低于内在价值的股票` | 太长 | `看所有低于内在价值的股票` |
| src/components/common/qoqDirection.tsx:9 | P1 | X1 | zh MoveMark `新建 / 增持 / 减持` vs stockProse `加仓 / 减仓` | 同页表格和正文两套说法 | 统一 `新建 / 加仓 / 减仓`（并同步 quarterMovesText） |
| src/components/common/DataStrip.tsx:10 | P2 | E3 | en `Consensus stocks` | 美国读者会理解成"分析师一致预期" | `Widely held stocks`（需与 nav 的 Consensus 一并改，跨区） |

---

## 4. Top 5 优先修改

1. **统一"持有者"术语（全区 X1，带意思误导）**：删掉 `stockCopy.ts` 里"机构 vs 人"的区分，中文全站统一"超级投资者 / 投资人 / 持有人数"，量词一律"位"；去掉所有"机构""机构重仓""institutional holders""5+ 位机构""N 家"。影响列表列名、副导航、筛选 tab、SEO 描述、Dataset、趋势句、新鲜度提示。
2. **修正会让读者理解错的几处**：筛选 tab「机构重仓」→「多人持有」、「有安全边际」→「低于内在价值」；共持区「共同重仓」→「一起持有」，英文标题改为 "What AAPL's holders also own"；筛选器列 "Position/位置" → "Valuation/估值"；"安全边际 −32%" 去掉负号；列表页 intro 说清"绿色 = 低于内在价值，标签 = 击球区"；生意质量区块删掉放错位置的"估值口径"行。
3. **首页申报进度行 + 个股页申报季提示去工程腔**（`filingProgressText.ts`、`filingSeasonNote.ts`）：把"申报中 30/68""切换""动作""switches"改成读者能看懂的一句话，首页 hero 曝光最高。
4. **SEO 标题/描述/OG 重写**（个股详情、列表、筛选器三页）：中文去掉"股票 — 谁在持有""按价值带"这类直译和自造词，英文改成 "Who Owns Apple (AAPL)?" "Stock Screener: Price vs. Intrinsic Value"；中文 OG 卡去掉英文 eyebrow `Stocks ·`。
5. **筛选器整页去口径化**：零结果"保守引擎常态"、页脚"两法夹逼"和英文方法名、红旗 tooltip"每股口径疑错/便宜信号"、`*` 脚注的自相矛盾，按上表成品句替换；同时把 `stockProse` 的四段正文改成中文母语语序（去被动、去"占其组合"三连、跳过 0 计数、去拼接空格）。
