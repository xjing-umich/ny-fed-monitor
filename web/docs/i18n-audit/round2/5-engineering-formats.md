# 5 · 工程层 i18n + 格式化基础设施 + 涨跌色（2026-10-28）

审核对象：本地 http://localhost:3217（`next dev`，Next 16.2.6），有 3 处在生产 https://thecompounder.fyi 复核过（2026-10-28 实测）。
每类页面抽一个 URL 看了 `<head>`：`/`、`/zh`、`/stocks/DECK`、`/zh/stocks/DECK`、`/investors/akre-capital`、`/zh/investors/akre-capital`、`/learn/how-to-read-a-13f`、`/zh/learn/how-to-read-a-13f`、`/stocks/screener`、`/zh/stocks/screener?view=strike_zone`。
格式统计另外加了 `/zh/stocks/AAPL`、`/zh/investors/berkshire-hathaway`、`/zh/investors`、`/zh/investors/buys`、`/zh/investors/consensus`、`/zh/stocks`、`/zh/learn/q2-2026-superinvestor-consensus` 和 `/sitemap.xml`、`/robots.txt`。
中间产物（渲染 HTML、去标签正文、统计脚本）在 `/private/tmp/claude-501/-Users-junlinzhu-Desktop-TheCompounder/17388869-4919-4572-9461-fc3815da1709/scratchpad/i18n-pro/e5/`。

---

## 1. 区域结论

- **专业度打分：中文 3 / 5，英文 4 / 5。** 工程骨架是对的：`<html lang>`、canonical、成对的 hreflang 加 x-default、og:locale 和 og:locale:alternate 在 5 类页面上全部正确。拉低分数的是"数字长什么样"这一层，它基本没有做本地化。
- **最拉低专业感的 3 件事：**
  1. **格式化层没有语言参数。** 全站调用 `Intl` 的地方是 **0**。金额、季度、日期、股价的格式化函数里，只有首页的 `fmtDeadline` 会看语言。抽样的 12 个中文页渲染出 **403 处 `$X.XB/M`、79 处 `Q2 2026`、111 处 ISO 日期**，没有一处「亿」「万」或「年月日」（研报正文除外）。
  2. **涨跌色没按中文习惯走，而且语义 token 混在一起。** `--tt-positive` 就是品牌绿，同时用来表示"买入/加仓""低于价值/击球区""数据新鲜"。所以现在没法只按语言把"涨跌"这一类颜色翻过来，要先拆 token。
  3. **中文 SEO 有三处工程缺口。** sitemap 里中文 `<loc>` 是 0 条；hreflang 只有 `zh-CN`，没有通用的 `zh`，新加坡、香港、台湾的中文用户会被分到英文页；语言切换器会丢掉 `?view=` `?q=` `?sort=` 这些查询参数。

---

## 2. 发现表

> 只列第一轮没报过的。第一轮已经报过的单点（`formatUSD` 中文出 B/M、`quarterLabel` 不分语言、`fmtMarginPct` 负号、`价值带 / sh`、OG alt 是英文等）这里不重复。下面的 F1 是把这些单点合起来，给出基础设施层面的方案。

| # | 页面/位置 | 严重度 | 类别 | 现状 | 为什么不专业（对标） | 建议 |
|---|---|---|---|---|---|---|
| E1 | `/sitemap.xml`；`src/app/sitemap.ts:33-47`（`entry()`） | P1 | 工程 | 每条 `<url>` 只有英文 `<loc>`，中文只出现在 `xhtml:link` 里。本地实测 **1317 条 `<loc>`，以 `/zh` 开头的是 0 条**，生产环境同样是 0 条（2026-10-28 复核）。代码注释说这样"比各列一条更好"。 | Google 的多语言 sitemap 规范要求每个语言版本各占一个 `<url>`，每个 `<url>` 里列出包括自己在内的全部 alternate。Baidu 和 Bing 基本不读 `xhtml:link`，所以对它们来说中文页等于没提交。 | 让 `entry()` 返回两条，en 和 zh 各一条，`alternates.languages` 完全相同：`return (["en","zh"] as const).map(l => ({ url: BASE + localePath(l, path), changeFrequency, priority: l === "en" ? priority : priority * 0.9, ...(lastModified ? { lastModified } : {}), alternates: { languages: ALT } }))`，主循环里改成 `urls.push(...entry(...))`。注释也一并改掉。 |
| E2 | 所有页面 `<head>`：`src/lib/seo.ts:128`（`altFor`），以及 `sitemap.ts:45` | P1 | 工程 | hreflang 只有 `en`、`zh-CN`、`x-default`（指向 en）。 | `zh-CN` 只匹配中国大陆的中文用户。浏览器语言是 zh-SG、zh-HK、zh-TW、zh-MY 的人（也就是富途、老虎在海外的主力用户）对不上任何一个 zh 版本，会落到 x-default，也就是英文页。Google 的建议是给区域码再配一个不带区域的通用语言码。 | 在 `altFor` 和 sitemap 里加一行 `zh: localePath("zh", path)`，保留 `zh-CN`。也可以改成 `zh-Hans` 加 `zh`。另外把散在 6 处的 `"zh-CN"` 字面量收成 `lib/urls.ts` 里的一个常量 `HTML_LANG`，`layout.tsx:128`、`page.tsx:112`、`learn/[slug]/page.tsx:81,143`、`seo.ts:91,128` 都从这里取。 |
| E3 | 顶栏和抽屉里的语言切换：`src/components/shell/TopNav.tsx:32-35,113-115`、`MobileDrawer.tsx:36-39` | P1 | 工程 | 只保留了 pathname。实测在 `/zh/stocks/screener?view=strike_zone` 点 EN，链接是 `href="/stocks/screener"`。`/stocks`、`/investors` 列表把 `q`、`sort`、`page`、`vf` 放在 URL 里（`components/list/useListState.ts:46`），切换语言后这些都会丢，`#锚点` 也会丢。另外切换链接写的是 `hrefLang="zh"`，`<head>` 里写的是 `zh-CN`，两边不一致。 | Bloomberg、Morningstar、富途网页版切换语言后都停在同一视图，筛选条件保留。用户筛好以后一切换就回到默认视图，会觉得是 bug。 | 不要在外壳里用 `useSearchParams`，否则全站静态页都会退成 CSR。改在点击时拼接：`onClick={(e) => { e.preventDefault(); router.push(otherLangPath + location.search + location.hash) }}`，`href` 仍写 `otherLangPath`，保证无 JS 和爬虫也能用。`hrefLang` 改成和 head 一致的 `zh-CN`。 |
| E4 | 中文长文正文：`src/components/legal/ProseDoc.tsx:46,58`（Learn 文章、季度报告、法律页共用）；`src/app/globals.css:255` | P1 | 工程 | 实测 `/zh/learn/how-to-read-a-13f` 正文是 `14px`，行高 `22.75px`（1.625），颜色是 muted 灰。`:lang(zh)` 的行高 1.8 只作用在 `.text-base` 上，正文段落用的是 `text-sm`，没被覆盖。 | 中文长文按 14px、1.6 排会显得又密又小。华尔街见闻、财新、雪球长文的正文大约 16–17px、行高 1.75–1.9，用正文色而不是辅助灰。站里给中文设的 1.8 规则恰好没用到最长的那段阅读内容上。 | `ProseDoc` 正文改成 `text-base text-[var(--tt-text)]`。这样 zh 自动走 1.8 行高，en 也是 15px、1.7，英文页也受益。如果只想改中文，就在 `globals.css` 加 `:lang(zh) .prose-body { font-size: 1rem; line-height: 1.85 }`。 |
| F1 | 格式化基础设施（全站） | P1 | 格式 | 盘点结果：`Intl.*` 调用 **0 处**。`formatUSD` 调用 **26 处 / 11 文件**，`quarterLabel` **42 处 / 13 文件**，`perShare` 12 处、EPFC 的 `usd/usd0` 12 处，都不分语言。`.toFixed(` 48 处 / 22 文件，手写 `` `$${…}` `` 19 处 / 6 文件，`toLocaleString` 12 处 / 7 文件，其中 9 处没传 locale。分语言的格式化函数只有 `HeroMasthead.tsx:52 fmtDeadline` 一个。 | 见第 4 节对标表。中文财经媒体和研报写「1.62亿美元」「2026年6月30日」「2026年二季度」；美式写法是 "$162M"、"June 30, 2026"、"Q2 2026"。现在两种语言共用一套英文格式。 | 新建 `src/lib/i18n/format.ts`，规范和落地方式见第 4 节。旧函数先改成调用新函数的薄包装，再逐个替换调用点。在 `scripts/ai-tells.ts` 里加两条检查：禁止不传 locale 的 `toLocaleString()`，禁止 `` `$${…}[MBT]` ``。 |
| C1 | 涨跌/正负色（全站，见第 5 节清单） | P1（待决策） | 颜色 | 两种语言都是"绿 = 买入、加仓、市值上升；橙 = 减仓、市值下降；红 = 清仓、卖出"。绿色就是品牌色 `--brand`，同时用于击球区、安全边际和数据新鲜标记。 | 中国大陆读者的习惯是红涨绿跌，富途、老虎、雪球在大陆默认都是这样。中文页上「清仓」标红、「新进」标绿，读者第一眼的方向感是反的。 | 见第 3 节 Q1。不管最后选哪个方案，都要先拆 token。 |
| E5 | 全站字体栈：`src/app/globals.css:127`（`--font-sans: var(--font-geist-sans)`），`layout.tsx:22-27` | P2 | 工程 | `html` 计算出的 `font-family` 是 `"GeistSans","GeistSans Fallback"`：没有中文字体，也没有 `sans-serif` 兜底。注释说中文会"走系统 CJK 栈"，但栈里其实没写。macOS Chrome 上我用文字宽度比对过，实际命中苹方（宽度 1993.1 对苹方 1993.4、宋体 1986.5）。Windows、Android、Linux 没测，会由浏览器的默认字体设置决定，可能落到宋体。 | 专业中文站都会显式写出中文字体回退（苹方、冬青黑、微软雅黑、思源黑体），不让渲染结果取决于浏览器设置。 | `--font-sans: var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", ui-sans-serif, system-ui, sans-serif;`。`.font-data` 和 `.font-heading` 同样补上。拉丁字母仍然先命中 Geist，汉字走中文字体。 |
| E6 | JSON-LD：`src/app/[lang]/investors/[slug]/page.tsx:512`（Dataset）、`src/app/[lang]/stocks/[ticker]/page.tsx:579`（FAQPage） | P2 | 工程 | 首页的 Organization/WebSite、个股 Dataset（`seo.ts:91`）、Article 都带了 `inLanguage`。投资人页的 Dataset 和个股 FAQPage 没带。FAQ 正文里也是 `$161.9M`、`2026-06-30`。 | 中文 FAQ 不标语言，对 GEO 和答案引擎是一个弱信号。抽取的答案还会带着英文格式。 | 两处都加 `inLanguage: HTML_LANG[lang]`。FAQ 文本改用新的格式化函数。 |
| E7 | 英文页 `og:image`：所有 file-based `opengraph-image`（根、about、learn、learn/[slug]、stocks/[ticker]、investors/[slug]、buys、sells、consensus，共 9 个） | P2 | 工程 | 英文页输出的是 `https://thecompounder.fyi/en/stocks/DECK/opengraph-image?…`，这是内部 rewrite 路径。生产实测这个地址会 **301** 到无前缀路径（2026-10-28）。本地 dev 下 host 显示成 localhost，这只是 dev 环境的现象。 | 分享抓取会多一跳 301，部分平台（LinkedIn、部分 IM）对 og:image 的重定向容错差。英文 URL 已经去掉了 `/en`，图片地址还带着，前后不一致。 | 在这几页的 `generateMetadata` 里显式写 `openGraph.images: [absoluteUrl(localePath(lang, "/stocks/" + t + "/opengraph-image"))]`，或者抽成 helper `ogImageFor(lang, path)` 一次修好。 |
| E8 | 季度邮件 HTML：`src/lib/reports/email.ts:104` | P2 | 工程 | `<html>` 没有 `lang`，也没有 `<meta charset>`。字体栈是 `-apple-system,Segoe UI,Helvetica,Arial,sans-serif`，没有中文字体，`line-height:1.5`。好的一面是邮件已经按语言分了 Resend 群组（`api/subscribe/route.ts:40-42`），英文版顶部有「中文版 →」。 | Windows 版 Outlook 遇到没指定中文字体的 CJK 文字，常会回退到宋体或 MS Mincho，中文邮件看起来像公文。 | zh 版写 `<html lang="zh-CN"><head><meta charset="utf-8"></head>`。字体用 `-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Segoe UI",Helvetica,Arial,sans-serif`，`line-height:1.7`。en 版写 `lang="en"`。 |
| F2 | `src/lib/format.ts:10`（`formatUSD` 低于 100 万的分支） | P2 | 格式 | 同一列里混着 `$1.3M` 和 `$963,518`（`/zh/stocks/AAPL` 持仓表，去标签文本第 268–325 行）。 | 同一列数字的精度和形态应当一致。Bloomberg、Morningstar 的持仓表在 100 万以下用 `$964K`，中文写「96.4万」。 | 用 compact 统一：en `$964K`，zh `96.4万`。实现见第 4 节。 |
| F3 | 没传 locale 的 `toLocaleString()`，共 9 处：`format.ts:10`、`ScreenerTable.tsx:76,87,98`、`StrikeLeadersCard.tsx:63,68`、`stocks/[ticker]/page.tsx:223`、`investors/[slug]/page.tsx:220`、`ui/chart.tsx:258` | P2 | 格式 | 输出由运行环境决定。`formatUSD` 会在 client 组件里调用（`InvestorListClient.tsx`、`StocksTable.tsx`），浏览器语言是 de-DE 或 fr-FR 时会显示成 `$963.518` 或 `$963 518`，还会引发 hydration 不一致。 | 金融数据的格式应当是确定的，不该跟着访客的系统语言变化。`EarningsPowerFloorCard.tsx:13-16` 的注释已经写明要固定 `"en-US"`，但别处没照做。 | 全部改走新格式化函数，locale 写死为 `en-US` 或 `zh-CN`。 |
| F4 | 重复实现的金额格式化：`EarningsPowerFloorCard.tsx:35-41`（`usd()`）对比 `format.ts:5`；`src/lib/charts.ts`（没有任何文件引用） | P2 | 格式 | EPFC 显示 `$82.10B`、`$12.34M`（M 两位小数），`formatUSD` 显示 `$355.1M`（M 一位小数）。同一个个股页上两种精度并存。`charts.ts` 是 NY Fed 时期的遗留，`$X.XB`、`YYYY/MM` 都是死代码。 | 同一页同一量级出现两种精度，看起来不像一个数据团队做的。 | 两处都并入新格式化函数，删掉 `charts.ts`。 |
| F5 | 股价取整：`ScreenerTable.tsx:98`（现价 `$348`）、`StrikeLeadersCard.tsx:63-68`、个股页估值摘要「今天的价格 $347」（EPFC `usd0`） | P2 | 格式 | 现价显示成整数美元，同一页折叠区里又是 `$75.90`。 | 美股报价的惯例是保留两位小数（$347.62），雪球、富途、Morningstar 都一样。估值区间取整没问题，现价不应取整。 | 现价一律用 `price()`：en `$347.62`，zh 表格 `347.62`、正文「347.62 美元」。估值区间可以保留整数。 |
| F6 | 区间连接号：`EarningsPowerFloorCard.tsx:23-25`（`range()`）对比 `format.ts:208`（`fmtValueBand`） | P2 | 格式 | 同一页同时有 `$81.99 – $158.34`（两边带空格）和 `$76–$158`（不带空格）。 | 按 AP 和 Chicago 的规范，数字区间用不带空格的 en dash。中文同样不带空格。 | 统一成 `${a}–${b}`，放进新模块的 `range()`。 |

**第一轮报过、仍然存在且影响专业感的 P0**（只列一行，不展开）：首页中文动向芯片仍是 `NEW/ADD/EXIT/TRIM`，`/zh` 上出现 7 次（`MoveTag.tsx:4-7`）；季度邮件标题仍是「…{n} 家机构这季动了什么」（`reports/email.ts:128`）；个股 meta description 仍是「最大持有人 布卢姆斯特兰」，多一个空格（`stocks/[ticker]/page.tsx:113`）。

**合格、不用改的地方**（审过，记一笔免得重复审）：`<html lang>` 为 zh-CN / en；每页都有 canonical；hreflang 成对并带 x-default，`altFor` 是单一来源；og:locale 和 og:locale:alternate 5 类页面全对；screener 带 `?view=` 时 canonical 去掉查询参数指回主页面；robots 没有语言相关问题；负号全站一律用 U+2212（抽样页面里 ASCII 连字符负数 0 处，`−` 65 处）；中英混排空格约 96% 一致（784 处中英之间有空格，34 处紧贴，基本都是「·8季」芯片，第一轮已报）；邮件按语言分群组。全站没有 RSS 和 Atom feed，不存在 feed 语言问题；是否要加 feed 属于产品决定，不算 i18n 缺陷。

---

## 3. 需要产品拍板的问题

### Q1 中文页要不要改成红涨绿跌（待决策）

**影响范围**（grep：`tt-positive` 25 处 / 14 文件，`tt-negative` 13 处 / 12 文件，`tt-warn` 23 处 / 12 文件。按语义分三类，只有 A 类是"方向色"）：

| 类 | 语义 | 位置 | 改红涨后是否跟着翻 |
|---|---|---|---|
| **A 方向（约 10 文件 / 25 处）** | 买卖动作、环比增减 | `shell/MoveTag.tsx:14`（首页动向芯片）；`home/HeroMasthead.tsx:79-82`（首页动向行）；`investors/InvestorListClient.tsx:93-116`（市值环比、持仓数变化、四种动作色）；`investors/[slug]/page.tsx:371-373`（整体加仓/减仓）、`:411`（持仓环比）、`:622-625`（本季动作条）；`investors/_movesPage.tsx:21-25`（买卖榜 badge）；`aggregate/AggregateRankingList.tsx:57`（共识榜持有人数变化）；载体组件 `entity/VerdictChip.tsx`、`common/Badge.tsx`、`ui/badge.tsx` | 翻 |
| B 估值状态 | 低于价值、击球区、高于价值 | `stocks/screener/ScreenerTable.tsx:32,57,145`；`stocks/StocksTable.tsx:50`；`valuation/ValuationBadge.tsx:40-45`；`valuation/EarningsPowerFloorCard.tsx:397-413`（刻度盘）；`stocks/StockConclusionBand.tsx:35`（`--val-below`）；`lib/valuation/valuationLabel.ts` | 不翻（这是状态，不是涨跌） |
| C 系统状态 | 数据新鲜/过期、错误、警示 | `entity/FreshnessDot.tsx`、`FreshnessBadge.tsx`、`KeyFacts.tsx`；`shell/NewsletterForm.tsx:100`、`ContactModal.tsx:212`；`valuation/PriceBetBlock.tsx:112`；EPFC 的警示行；`investors/[slug]/page.tsx:173`（Put） | 不翻 |

**阻塞点**：`--tt-positive` 等于 `--brand`，A、B、C 三类共用（`globals.css:90`）。`--tt-negative` 等于 `--alert`，和错误红是同一个色（`globals.css:91`）。直接在 `:lang(zh)` 下交换这两个 token，会把击球区、品牌按钮、"数据新鲜"一起染红，把表单报错染绿。

**选项：**
- **甲 · 维持现状（两种语言都绿涨红跌）。** 零成本，和英文版、品牌绿一致。代价是中文读者对方向的第一反应是反的。
- **乙 · 中文默认红涨绿跌，只翻 A 类（推荐）。** 先新增 `--move-up`、`--move-down`（加上减仓用的浅色版 `--move-down-soft`），把 A 类约 25 处从 `tt-positive`、`tt-warn`、`tt-negative` 改指向它们；再在 `:root:lang(zh)` 下交换这组的取值。B、C 类不动。工作量大约半天。动作芯片保留文字（新进、加仓），色盲用户和跨文化读者靠文字也能读懂。上涨用的红色要和 `--alert` 拉开明度或色相，避免"加仓"看起来像报错。
- **丙 · 方向不用颜色，只用 ＋/− 和文字，颜色留给估值状态。** 最中性。代价是信息密度下降，和所有对标站都不一样。
- **丁 · 做成用户设置（富途的做法），默认按语言。** 最完整。但要存偏好、处理首屏闪烁，对一个没有账户体系的站来说偏重。

**推荐乙。** 理由：中文读者主要来自富途、老虎、雪球，大陆默认都是红涨绿跌。改动只限 A 类，B 类击球区继续用品牌绿，读者会把它当作"站点主题色"而不是"跌"。"拆 token"这一步不管选哪个方案都应该做。

### Q2 中文大额金额怎么写

- **甲（推荐）**：正文和卡片写「1.62亿美元」「768亿美元」；表格单元格写「1.62亿」，币种放进表头「市值（美元）」。这是 Wind 和券商研报的写法：表头写单位，格子里只放数。
- 乙：「$1.62亿」。字符最短，但 `$` 加「亿」的混写在大陆财经媒体里不常见。
- 丙：保留 `$1.62B`。不做本地化，中文读者需要自己换算，这正是第一轮 B 区报的问题。

### Q3 中文"数字 + 单位"和日期内部要不要加空格（修正第一轮的规范）

第一轮写作规范第 2 条是"中文和英文、数字之间留一个空格"，术语表因此写成「2026 年 6 月 30 日」、`fmtDeadline` 输出「8 月 14 日」。**中文财经媒体和研报（新华社财经、财新、华尔街见闻、Wind）的惯例是日期和"数字＋量词/单位"内部不加空格**：「2026年6月30日」「1.62亿美元」「12.3%」。`Intl` 的 zh-CN 输出也是这样。
**推荐**：空格只加在"中文 ↔ 拉丁词或 ticker"之间（「持有 AAPL」「SEC 13F」），以及"中文 ↔ 一个完整数字串"之间（「合计 1.62亿美元」）。日期、亿、万、%、年、月、日、季 和数字紧排。这样代码直接用 `Intl` 的输出，不用后处理。

### Q4 首次访问的语言分流

**现状**：`next.config.ts:5-9` 明确不按 Accept-Language 跳转，无前缀路径永远是英文，也没有提示条。这符合 Google 的建议：不要用 Accept-Language 或 IP 自动重定向可抓取的页面，因为 Googlebot 不带 Accept-Language、从美国抓取，自动跳转会让中文页抓不到或被误判。
**业界做法**：不跳转，只在首次访问时显示一条可关闭的提示，例如 Accept-Language 首选 zh、落在英文页时显示「检测到你偏好中文 · 切换到中文版 →」，链接到同路径并带上查询参数（依赖 E3）。用户的选择存进 cookie，只用于以后不再提示，不用于重定向。moomoo、Morningstar 国际站、Notion 都是这么做的。
**推荐**：做提示条，优先级低于 E1–E4。中文用户主要从微信或分享链接进来，拿到的本来就是 `/zh` URL。

---

## 4. 格式规范表与落地方式

### 4.1 现状统计（12 个中文抽样页渲染后的正文，去掉标签和脚本后用正则计数）

| 页面 | `$X.XB/M` | 无后缀 `$` | `Q# YYYY` | ISO 日期 | 「亿/万」 | 「年月日」 |
|---|---|---|---|---|---|---|
| /zh | 23 | 17 | 5 | 2 | 0 | 0 |
| /zh/stocks/DECK | 14 | 25 | 2 | 19 | 0 | 0 |
| /zh/stocks/AAPL | 42 | 38 | 6 | 21 | 0 | 0 |
| /zh/investors/akre-capital | 42 | 0 | 0 | 9 | 0 | 0 |
| /zh/investors/berkshire-hathaway | 52 | 0 | 0 | 10 | 0 | 0 |
| /zh/investors | 100 | 0 | 50 | 0 | 0 | 0 |
| /zh/investors/buys | 30 | 0 | 10 | 0 | 0 | 0 |
| /zh/investors/consensus | 0 | 0 | 4 | 1 | 0 | 0 |
| /zh/stocks | 100 | 0 | 1 | 1 | 0 | 0 |
| /zh/stocks/screener?view=strike_zone | 0 | 56 | 0 | 41 | 0 | 0 |
| /zh/learn/how-to-read-a-13f | 0 | 0 | 0 | 1 | 1 | 0 |
| /zh/learn/q2-2026-superinvestor-consensus | 0 | 0 | 1 | 6 | 5 | 1 |
| **合计** | **403** | **136** | **79** | **111** | 6 | 1 |

英文页同类问题：ISO 日期出现在英文正文和来源行里（`/stocks/AAPL` 21 处，`/investors/akre-capital` 9 处，例如 "In the quarter ended 2026-06-30"、"Valuations as of the 2026-10-27 close"）；`/ sh` 在 `/stocks/AAPL` 出现 5 处。

**按函数分（语言感知 = 会根据 lang 输出不同格式）：**

| 函数 | 位置 | 调用 | 语言感知 | 输出 |
|---|---|---|---|---|
| `formatUSD` | `lib/format.ts:5` | 26 / 11 文件 | 否 | `$1.50B`（B/T 两位小数）、`$355.1M`（一位）、`$963,518`（无 locale） |
| `fmtMarginPct` | `lib/format.ts:17` | 9 / 6 | 不需要 | `32%`、`<1%` |
| `fmtValueBand` | `lib/format.ts:208` | 由调用方传 fmt | 否 | `$76–$158` |
| `quarterLabel` | `lib/freshness/derive.ts:225` | 42 / 13 | 否 | `Q2 2026` |
| `quarterInterval` | `lib/seo.ts:65` | 结构化数据 | 不需要（ISO 8601 区间，正确） | `2026-04-01/2026-06-30` |
| `fmtDeadline` | `components/home/HeroMasthead.tsx:52` | 首页 | **是** | 「8 月 14 日」/ `Aug 14` |
| `fmtPriceFact` | `lib/managers/priceRead.ts:12` | 2 | 否 | `$347.62` |
| `perShare / usd0 / range / pct / pct1 / usd` | `components/valuation/EarningsPowerFloorCard.tsx:13-41` | 各十几处 | 否（固定 en-US，注释里写了理由） | `$75.90`、`$347`、`$81.99 – $158.34`、`$82.10B` |
| `fmtPctDelta / fmtCountDelta` | `app/[lang]/investors/InvestorListClient.tsx:93,100` | 投资人列表 | 不需要 | `+12%`、`−3`（U+2212，正确） |
| `pct / signed` | `lib/reports/copy.ts:9-10` | 报告 | 不需要 | `12.3%`、`+3` |
| `quarterPhrase` | `lib/llms.ts:38` | llms.txt（只有英文） | 不需要 | `Q2 2026 (quarter ended 2026-06-30)` |
| `formatBillions / formatTrillions / formatPercent / formatAxisDate` | `lib/charts.ts` | **0（死代码）** | — | 删除 |
| 原样输出的 `period` / `filedAt` / `priceDate` 字符串 | `entity/SourceFooter.tsx:18-19`、`aggregate/DataAsOfBadge.tsx:7`、`ScreenerTable.tsx:99`、`stocks/stockProse.ts`、FAQ、估值"截至"等 | 多处 | 否 | `2026-06-30` |

### 4.2 推荐规范

| 类型 | 英文（en-US，对标 WSJ、Bloomberg、Morningstar） | 中文（zh-CN，对标 Wind、券商研报、华尔街见闻） |
|---|---|---|
| 整数、股数 | `1,234,567`；表头 "Shares" | 表格 `1,234,567`，表头「持股数（股）」；正文「123.5万股」 |
| 大额美元（卡片、表格） | 三位有效数字：`$964K` `$162M` `$5.11B` `$76.8B` `$3.6T` | 表格 `96.4万` `1.62亿` `51.1亿` `768亿` `3.6万亿`，表头写「（美元）」；卡片和正文写「1.62亿美元」 |
| 负金额 | `−$162M`（U+2212，保持现在的约定） | `−1.62亿美元` |
| 每股价格（现价） | `$347.62`（两位小数）；正文 "$347.62 a share" | 表格 `347.62`，表头「现价（美元）」；正文「每股 347.62 美元」 |
| 每股估值区间 | `$76–$158 per share`；表头 "Value range (per share)"；不用 `/ sh` | 「每股 76–158 美元」；表头「每股价值区间（美元）」 |
| 百分比 | `21.3%`；变化 `+12.3%` / `−12.3%` | 同英文 |
| 百分点变化 | `+2.1 pts`（或 "2.1 percentage points"） | 「+2.1个百分点」 |
| 权重迁移 | `28% → 22%` | 同英文 |
| 日期（正文、来源行） | `June 30, 2026`；紧凑写法 `Jun 30, 2026`；同年内可写 `Aug 14` | 「2026年6月30日」；同年内写「8月14日」 |
| 日期（密集表格列） | `Jun 30, 2026` 或 `6/30/2026`，美国读者不用 ISO | `2026-06-30` 可以保留（Wind 表格的惯例） |
| 季度（标签、徽章、标题） | `Q2 2026` | `2026 Q2`（第一轮的建议，可以保留；研报里也常见 `2026Q2`，选一种全站统一） |
| 季度（正文） | "the second quarter of 2026" / "the June quarter" | 「2026年二季度」 |
| 报告期表述 | "for the quarter ended June 30, 2026" | 「2026年二季度（截至6月30日）」 |
| 区间 | `$76–$158`，en dash，两侧不加空格 | 同 |

### 4.3 落地方式

```ts
// src/lib/i18n/format.ts —— 全站唯一的数字/日期出口(server 与 client 共用)
import type { Lang } from "@/lib/nav";
export const LOCALE = { zh: "zh-CN", en: "en-US" } as const;
const MINUS = "−";
const nfCache = new Map<string, Intl.NumberFormat>();
const nf = (lang: Lang, o: Intl.NumberFormatOptions) => {
  const k = lang + JSON.stringify(o);
  let f = nfCache.get(k); if (!f) nfCache.set(k, (f = new Intl.NumberFormat(LOCALE[lang], o)));
  return f;
};
const fixMinus = (s: string) => s.replace(/^-/, MINUS);

export const money = (v: number, lang: Lang, ctx: "table" | "prose" = "prose") =>
  fixMinus(lang === "en"
    ? nf("en", { style: "currency", currency: "USD", notation: "compact", maximumSignificantDigits: 3 }).format(v)
    : nf("zh", { notation: "compact", maximumSignificantDigits: 3 }).format(v) + (ctx === "prose" ? "美元" : ""));
export const price   = (v: number, lang: Lang, ctx: "table" | "prose" = "table") => /* en $347.62；zh 表格 347.62，正文 347.62美元 */;
export const shares  = (v: number, lang: Lang) => nf(lang, {}).format(v);
export const pctDelta = (x: number, lang: Lang, d = 1) =>
  fixMinus(nf(lang, { style: "percent", signDisplay: "exceptZero", maximumFractionDigits: d }).format(x));
export const date = (iso: string, lang: Lang, style: "long" | "short" = "long") =>
  new Intl.DateTimeFormat(LOCALE[lang], { timeZone: "UTC", dateStyle: style === "long" ? "long" : "medium" })
    .format(new Date(iso.slice(0, 10) + "T00:00:00Z")); // en: June 30, 2026 / Jun 30, 2026；zh: 2026年6月30日（表格列另用 ISO）
export const quarter = (period: string, lang: Lang, style: "label" | "prose" = "label") => /* en Q2 2026；zh 2026 Q2 / 2026年二季度 */;
export const range = (a: string, b: string) => `${a}–${b}`;
```

**实测 `Intl` 的行为**（Node v20.20.0，2026-10-28 在本机运行）：

| 输入 | `zh-CN` compact（默认） | `zh-CN` compact、3 位有效数字 | `zh-CN` currency + `currencyDisplay:"name"` | `en-US` currency compact、3 位有效数字 |
|---|---|---|---|---|
| 963,518 | 96万 | 96.4万 | 96.4万美元 | $964K |
| 161,900,000 | **1.6亿** | 1.62亿 | 1.62亿美元 | $162M |
| 5,110,000,000 | 51亿 | 51.1亿 | 51.1亿美元 | $5.11B |
| 76,770,000,000 | 768亿 | 768亿 | 768亿美元 | $76.8B |
| 3.6e12 | 3.6万亿 | 3.6万亿 | 3.6万亿美元 | $3.6T |
| −161,900,000 | -1.6亿 | -1.62亿 | -1.62亿美元 | -$162M |

日期：`zh-CN` 的 `dateStyle:"long"` 输出「2026年6月30日」；`en-US` 的 long 输出 "June 30, 2026"，medium 输出 "Jun 30, 2026"。

**限制和注意事项：**
1. **zh compact 默认只保留约 2 位有效数字**（1.6亿、51亿），精度不够，必须加 `maximumSignificantDigits: 3`。
2. **zh 的 `style:"currency"` 会输出 `US$1.62亿`**，这不是中文媒体的写法。正文用 `currencyDisplay:"name"`（得到「1.62亿美元」），表格用普通 compact 再在表头写单位。
3. **负号是 ASCII 的 `-`**。全站现在一律用 U+2212，所以要后处理成 `−`，或者用 `formatToParts` 把 `minusSign` 换掉。
4. 数字和「亿」之间没有空格，`signDisplay` 的行为也和 en 一致。这和第 3 节 Q3 的推荐吻合，不需要额外处理。
5. **季度没有对应的 `Intl` API**，`quarter()` 只能手写，但全站只在这一处写。
6. **日期字符串必须按 UTC 解析和格式化**（`timeZone:"UTC"`）。否则 `2026-06-30` 在美西浏览器的 client 组件里会显示成 6 月 29 日。
7. **Node 和浏览器的 ICU/CLDR 版本可能不同**，个别 locale 的输出会有细微差别。client 组件里的数字最好在 server 端格式化成字符串再传下去，或者只用上面这些稳定的选项。不要再用不传 locale 的 `toLocaleString()`。
8. Edge runtime（OG 图）同样有完整 ICU，可以共用这个模块。

**替换顺序（约 1.5–2 天，可以并入第一轮计划的"第 1 批 机械统一"）：**
1. 建好模块，并在 `format.check.ts` 里补快照测试，覆盖上表每一行。
2. `formatUSD(v)` 改成 `money(v, lang, "table")`（26 处），`quarterLabel(p)` 改成 `quarter(p, lang)`（42 处），这两步覆盖 4.1 表里约 80% 的计数。
3. EPFC 的 `perShare/usd/usd0/range` 和 ScreenerTable、StrikeLeadersCard 的手写 `$`（约 40 处），并修掉 F4、F5、F6。
4. 原样输出的 ISO 日期改成 `date()`：SourceFooter、DataAsOfBadge、估值"截至"、stockProse、FAQ JSON-LD、learn 的"最后更新"。
5. 在 `ai-check` 里加防回退规则：禁止不传 locale 的 `toLocaleString()`、`` `$${…}[MBT]` ``，以及 `src/**` 里除 `lib/i18n/format.ts` 以外的 `.toFixed(` 直接输出到 UI 的写法（白名单另列）。

---

## 5. 统计口径说明

- grep 统计排除了 `*.check.ts`、`lib/sec`、`lib/ingestion`、`lib/health`、`app/api`（这些地方没有面向用户的输出）。
- 渲染计数用的是去掉 `<script>` 和 `<style>` 后的正文，同一个数字在桌面表格和移动卡片里各算一次（DataTable 会渲染两份），所以计数会偏高，但两种语言的比例不受影响。`/zh/investors`、`/zh/stocks` 都是 100，是因为首屏只渲染 100 行。
- 生产复核（2026-10-28）：sitemap 中文 `<loc>` 0 条；`/en/stocks/DECK/opengraph-image` 返回 301；生产的 og:image 指向 `/en/…`。
