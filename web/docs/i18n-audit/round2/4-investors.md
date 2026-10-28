# 4-investors：超级投资者板块 · 专业度审核（第二轮）

审核时间：2026-10-28。渲染页取自 http://localhost:3217，中英两侧都看了以下页面：/investors、/investors/consensus、/investors/buys、/investors/sells，以及详情页 berkshire-hathaway、akre-capital、olstein-capital（Q2 申报持仓为 0）、scion-asset-management（已停报）、pabrai-funds。
`/managers` 和 `/zh/managers` 都 308 到 /investors；`/managers/[cik]` 只做 permanentRedirect（`src/app/[lang]/managers/[cik]/page.tsx:26`），用户看不到，所以不审。
页面数据为 2026 Q2 13F（6 月 30 日的持仓，8 月 14 日前后申报），估值用 2026-10-27 收盘价。Q3 13F 的截止日是 11 月 14 日，当天是周六，顺延到 11 月 16 日。
外部对标：伯克希尔 2026 Q2 13F 的中文报道（澎湃、21 世纪经济报道、华尔街见闻、格隆汇等，2026-08-15 前后）原文写法是「新进 1 只、增持 7 只、减持 6 只、清仓 1 只」「持仓市值约 659.50 亿美元，约占 13F 股票组合持仓市值的 22%」「谷歌-A 增持约 2454 万股」「唯一新建仓的个股为霍顿房屋，仅 3564 股」。英文侧参考 MarketBeat、TipRanks 一类 13F 快讯的说法："acquired a new position / new stake"、"boosted / grew its stake"、"trimmed its stake"、"Sold Out"。

## 1. 区域结论

- **专业度：中文 2.5/5，英文 3.5/5。** 数字和口径大体可信，读起来也像个数据站。但中文页还是"英文数据站套了中文壳"：金额写 `$299.25B`、季度写 `Q2 2026`（第一轮已报，至今未改）、公司名用英文法定名、期权写 `PUT`、涨跌颜色走美式。英文页的主要问题是 EDGAR 原名没清洗干净。
- **最拉低专业感的三件事：**
  1. **13F 核心术语和两边读者的习惯错位。** 持仓表头只写「市值」，中文读者会读成公司市值；动作徽章写「新建」，中文媒体通行「新进 / 增持 / 减持 / 清仓」；「PUT / CALL」没有翻译；表头「本季动作 / This quarter」在 10 月底指的其实是 Q2。
  2. **买卖榜上的金额没有标注，口径也和读者理解的不一样。** 「加仓 $11.93B」实际是买方们期末持仓市值的合计，不是"买了多少"。第一轮报告的改写句甚至写成了「附每只股票的买入金额」，会把误读坐实。
  3. **发行人和机构名清洗不到位：** `Ge Aerospace`、`Dr Horton Inc`、`Davita`、`State Str SPDR S&P 500 ETF T`、`Baupost Group Llc/Ma`、`Cooperman Leon G`。中文目录按 Unicode 码位排序，不是拼音。部分中文译名不合行业惯例：「多西」应为「多尔西」；「罗杰斯」中文读者会默认是吉姆·罗杰斯。

## 2. 发现表

路径相对 `/Users/junlinzhu/Desktop/TheCompounder/ny-fed-monitor-i18n/web/`。第一轮已报的问题不在下表；第一轮的 P0 是否仍存在，见第 4 节。

| 页面 / 位置 | 严重度 | 类别 | 现状（原文） | 为什么不专业（对标） | 建议（可直接替换） |
|---|---|---|---|---|---|
| /zh/investors/* 持仓表、移动端卡片 · `src/app/[lang]/investors/[slug]/page.tsx:131` | P1 | 术语 | zh 表头「市值」，值为 `$65.95B`（苹果那一行） | 中文财经语境里，单写「市值」默认指**公司总市值**，苹果一行写"市值 659.5 亿"会被误读。中文 13F 报道一律写「持仓市值」，例如「苹果持仓市值约 659.50 亿美元」。 | zh：「持仓市值」。en 的 "Value" 保留，Dataroma 也这么写；想更明确可以写 "Market value"。 |
| /zh/investors 列表 · `InvestorListClient.tsx:34`；详情页 KeyFacts「组合市值」 | P2 | 术语 | zh「组合市值」 | 能看懂，但 13F 报道的通行写法是「13F 持仓市值」「股票组合持仓市值」。 | zh：「持仓市值」，和上一条统一。 |
| 列表徽章、详情页四格、买卖榜 · `InvestorListClient.tsx:41`、`[slug]/page.tsx:622-625`、`_movesPage.tsx:22-25`、`src/lib/entity/quarterMovesText.ts:9` | P1（**待拍板**，见第 3 节） | 术语 | zh「新建 / 加仓 / 减仓 / 清仓」（买卖榜用「新建仓」，quarterMovesText 用「增持 / 减持」） | 中文媒体报道 13F 的标准四件套是**「新进 / 增持 / 减持 / 清仓」**，见上文伯克希尔 Q2 报道。「新进」这个说法也来自 A 股十大股东表。第一轮以"增持/减持在 A 股多指大股东公告"为由否掉了它，但在 13F 语境下媒体用的恰恰是这一组；「加仓 / 减仓」是雪球式口语，能接受，但不是报道体。 | 徽章、计数、榜单统一为「新进 / 增持 / 减持 / 清仓」。若选口语体，至少把「新建」改成「新进」（README 术语表已经选了「新进」，代码还没跟上）。 |
| 详情页持仓表期权行 · `[slug]/page.tsx:173-177` | P1 | 术语 | zh 页标签 `PUT` / `CALL`（Scion 页：`Palantir … PLTR PUT`、`英伟达 Nvidia Corp NVDA PUT`） | 中文页出现了没翻译的英文期权术语。中文报道写伯里时用「看跌期权」「看涨期权」；港股语境是「认沽 / 认购」。 | zh：「看跌期权」/「看涨期权」，窄屏写「看跌」/「看涨」。en 保留 PUT / CALL，或写成 "Put" / "Call"。 |
| /investors 列表表头 · `InvestorListClient.tsx:37,67` | P1 | 页面感 / 日期 | zh「本季动作」/ en "This quarter"，整列都是 2026 Q2 的变动（今天是 10 月 28 日，本季是 Q4） | 列表里写"本季"，内容却是两个季度前的。专业 13F 站会写死季度，比如 WhaleWisdom 用 "Q2 2026 change"。 | zh：「最新一季变动」，或动态拼成「2026Q2 变动」。en："Latest 13F changes"，或 "Q2 2026 changes"。 |
| /investors/buys、/sells 各行金额 · `src/components/aggregate/AggregateRankingList.tsx:50`；口径见 `src/lib/aggregations.ts:93` + `src/lib/consensus/compute.ts:266-271` | P1 | 页面感 / 准确性 | zh「加仓 $11.93B」/ en "Added $11.93B"（MSFT 那一行） | 金额没有标签，紧跟在「加仓」后面，读者必然理解成"加仓金额"。实际值是**这些买方期末持仓市值的合计**。卖出榜更乱：减仓的按剩余持仓算，清仓的按上季持仓算，两种口径相加。第一轮 B 区第 115 行给的 SEO 改写句「附每只股票的买入金额」**本身是错的**，建议不要采用。 | 买入榜 zh「买方持仓合计 $11.93B」/ en "Buyers' combined stake $11.93B"。卖出榜要么删掉金额，要么改成"卖方上季持仓合计"（需同时改口径）。想真正显示"买了多少"，就得按 (shares − prevShares) × 价格 计算。 |
| /zh/investors/buys、/sells、/consensus 榜单 · `AggregateRankingList.tsx:41` | P1 | 页面感 / 术语 | zh 页只显示英文法定名：`Microsoft Corp`、`Taiwan Semiconductor ADR`、`Walt Disney Co` | 详情页同一只股票显示「台积电」「微软」（`zhNames.ts` 里有 135 个），榜单页却是英文。原因是 `<EntityName>` 没有传 `lang`，属于漏传，不是缺数据。中文 13F 报道里不会出现 "Taiwan Semiconductor ADR"。 | 改成 `<EntityName issuer={r.issuer} ticker={r.ticker} lang={lang} />`。 |
| zh 全站个股名格式 · `src/lib/stocks/zhNames.ts:37-40` `stockDisplayName`；正文 `src/lib/managers/profileProse.ts` | P2 | 页面感 | zh「苹果 Apple Inc」「谷歌 Alphabet Inc Class A」「万事达 Mastercard Inc Class A」；同一段正文前面写「苹果 Apple Inc」，后面又写「Mastercard Inc Class A 目前排在第 1 位」 | 中文行情和资讯里的写法是「苹果（AAPL）」，ticker 已经单独显示时就只写「苹果」。中文名后面再跟英文法定名，是数据库直出的样子。A/C 股的通行写法是「谷歌-A」「谷歌-C」（富途、老虎行情名；Q2 报道原文也是「谷歌-A 增持约 2454 万股」）。 | 表格：中文名 + ticker 徽章，有中文名时不再显示英文法定名，没有中文名才显示英文名。正文：首次出现写「苹果（AAPL）」，之后写「苹果」。A/C 股：`GOOGL → 谷歌-A`、`GOOG → 谷歌-C`、`BRK.B → 伯克希尔-B`。 |
| 全板块发行人名 · `src/lib/format.ts:62-86`（`WORD_CASE` 缺词）、`ISSUER_NAME_FIXES` | P1 | 页面感（en/zh） | `Ge Aerospace`、`Dr Horton Inc`、`Davita Inc`、`Verisign Inc`、`Nvidia Corporation`、`State Str SPDR S&P 500 ETF T`、`Nebius Group N.V`、`Haemonetics Corp Mass`；同一页同时出现 `Humana, Inc` 和 `Humana Inc` | 把公司名标题化后弄坏了品牌大小写，被截断的名字也露在外面。Bloomberg 和 Morningstar 写的是 GE Aerospace、D.R. Horton、DaVita、VeriSign、NVIDIA、SPDR S&P 500 ETF Trust。伯克希尔 Q2 唯一新进的就是 D.R. Horton，页面正文却写成 "Dr Horton Inc"。 | WORD_CASE 补 `Ge→GE`、`Davita→DaVita`、`Verisign→VeriSign`、`Nvidia→NVIDIA`；ISSUER_NAME_FIXES 补 `Dr Horton Inc→D.R. Horton Inc`、`State Str SPDR S&P 500 ETF T→SPDR S&P 500 ETF Trust`；去掉结尾的 `Mass` 和 `N.V` 缺点。更稳的做法是展示名一律以 ticker 主数据（`stocks.name`）为准，13F 原名只作回退。 |
| 列表、目录、详情页副标题里的机构名 · `src/lib/managers/profileProse.ts:13-14` `displayFundName` | P1 | 页面感（en/zh） | `Baupost Group Llc/Ma`、`Matrix Asset Advisors Inc/Ny`、`Southeastern Asset Management Inc/Tn/`、`Sound Shore Management Inc /Ct/`、`Disciplined Growth Investors Inc /Mn`、`Fairfax Financial Holdings Ltd/ Can`、`Check Capital Management Inc/Ca`、`Cooperman Leon G`、`Icahn Carl C`；en 列表里出现 `Dodge & Cox Dodge & Cox` | EDGAR 的注册州后缀和"姓在前"的个人申报名直接露给了读者。WhaleWisdom 和 Dataroma 都会写成 "Baupost Group"、"Icahn Capital"。原因是 `displayFundName` 只清洗全大写的名字，库里已经是首字母大写的名字不经过 `cleanFilerName`。 | `displayFundName` 一律走 `cleanFilerName`，并加上 `/(?:\s*\/\s*[A-Za-z]{2,3}\/?)$/` 去掉州后缀、`Llc→LLC`。个人申报主体用覆盖表，例如 `Cooperman Leon G → Omega Family Office (Leon Cooperman)`、`Icahn Carl C → Icahn Capital`。fund 和 label 相同时不再重复显示。 |
| /zh/investors 目录 · `src/components/list/LinkDirectory.tsx:31` | P1 | 工程 / 页面感 | 标题写「全部 97 位投资人，按姓名排序」，实际顺序是：48 个英文名在前，之后是「伊坎、伯科威茨、佩尔茨、勒布、哈尔沃森…」 | `localeCompare(…, "en")` 对汉字按码位排，不是拼音序，中文读者找「巴菲特」要往下翻 50 行。中文站的目录惯例是按拼音首字母 A–Z 分组。 | `a.label.localeCompare(b.label, lang === "zh" ? "zh-Hans-CN-u-co-pinyin" : "en", { sensitivity: "base" })`（组件要加 `lang` 参数）。最好再按首字母分组：「A 阿克尔、艾因霍恩… B 巴菲特与阿贝尔、比尔·阿克曼…」。 |
| 中文人名译法 · `src/lib/investorAliases.ts:37`、`config/managers.json:262`（另见 :247、:457） | P1 | 术语 | 「多西」(Pat Dorsey)、「罗杰斯」(John Rogers, Ariel) | Pat Dorsey 的通行译名是**帕特·多尔西**（《巴菲特的护城河》作者署名）。单写「罗杰斯」，中文读者第一反应是吉姆·罗杰斯，等于认错了人。 | 「帕特·多尔西」「约翰·罗杰斯」。 |
| 同上，全目录 | P2 | 页面感 | 只写姓的（泰珀、盖纳、米勒、戴维斯、斯皮尔）和写全名的（比尔·阿克曼、霍华德·马克斯、迈克尔·伯里）混在一起 | 中文媒体对知名度一般的人第一次出现都写全名；只有「巴菲特」「达利欧」「段永平」这种级别的才单写姓或简称。 | 统一写全名：「大卫·泰珀」「汤姆·盖纳」「比尔·米勒」「克里斯·戴维斯」「盖伊·斯皮尔」，巴菲特、达利欧、伊坎、段永平、李录保持现状。en 侧 "Ravenel Boykin Curry" 改为 "Boykin Curry"（Dataroma 的写法）。 |
| 详情页持仓表结构 · `[slug]/page.tsx:129-137` `HOLD_COPY.cols` | P1 | 页面感 | 列为「标的 / 市值 / 估值 / 持有人数 / 持股数 / 权重 / 信号」，没有本季变动列 | 读 13F 最想看的就是每只股票本季的增减。Dataroma 有 "Recent activity: Add 12.5% / Reduce 30%"，中文报道写「谷歌-A 增持约 2454 万股」。现在只能看到页头「加仓 7」这样的计数，看不到加了谁、加了多少。数据已经有了（`changes[].deltaPct / prevShares`）。 | 加一列 zh「季度变动」，值为「新进 / 增持 +31% / 减持 −12% / —」；en "Change"，值为 "New / Add +31% / Trim −12% / —"。 |
| 详情页持仓表、KeyFacts · Scion 页 | P2 | 页面感 | 「组合市值 $68.1M」，表中却有 `PLTR PUT $912.1M` 一行，单行比整个组合还大 | 期权行的名义价值不计入组合市值（代码注释里写了），但页面上没有说明，读者会以为算错了。 | 「组合市值」下面加一行小字：zh「不含期权，期权按名义价值列示」/ en "Excludes options; options shown at notional value"。 |
| Scion 副标题 · `src/lib/managers/displayName.ts:85-88` | P2 | 页面感 | zh「迈克尔·伯里（Michael Burry）掌管，美股持仓通过 SEC 13F 季度披露」，下一行是「⚠ 已停报」 | 同一屏前后矛盾。 | 停报的主体去掉"季度披露"后缀。zh：「Scion Asset Management，迈克尔·伯里掌管；2025Q3 之后不再申报 13F。」 |
| Olstein（零持仓）详情页 | P2 | 页面感 | 申报持仓为 0，页面仍显示「低于内在价值 0」和「Robert Olstein 目前没有已确认的击球区持仓」 | 在空组合上跑估值模块，只会显得像机器在填空。 | 持仓为 0 时隐藏「低于内在价值」这一格和击球区那句话。 |
| 组合速览「最大的新建仓位」 · `profileProse.ts:123,129` | P2 | 页面感 / 准确性 | zh「其中最大的新建仓位是 Dr Horton Inc」/ en "The largest new buy was Dr Horton Inc"（本季只新进这一只，媒体报道仅 3,564 股、约 58 万美元） | 只有一只却说"最大的"，还暗示这是笔大买卖。 | 只有 1 只时，zh「唯一新进的是 D.R. 霍顿（DHI），仓位很小。」/ en "The only new stake was a small one in D.R. Horton (DHI)."，多只时保留原句。 |
| /investors/consensus、伯克希尔持仓表 | P2 | 页面感 | Alphabet A/C 分两行：共识榜第 2 名 GOOGL 41 位、第 4 名 GOOG 36 位；伯克希尔表中 9.4% 和 3.2% 分列，可口可乐 10.9% 因此排第 3 | 中文报道按"合并口径"计算，把 Alphabet 算作伯克希尔第三大持仓（12.62%）。分开列会改变排名，至少应该说明。 | 共识榜和持仓表按发行人合并（「谷歌（A+C）」），或在行内注明「另有 C 类股 3.2%」。 |
| 英文语法 · `src/lib/discovery/discoveryHandoff.ts:88`、`src/lib/managers/valuationPosture.ts:98` | P2 | 页面感（en） | "Warren Buffett & Greg Abel **has** no confirmed strike-zone positions"；Scion 页 "1 **trade** below intrinsic value" | 复合主语后动词没用复数；1 后面动词没用单数。美式编辑一眼就会挑出来。 | 按 label 是否含 " & " 选 have/has；`cheap === 1 ? "trades" : "trade"`。 |
| 列表筛选 · `InvestorListClient.tsx:50,80` | P2 | 术语 | 筛选标签写 zh「买卖相当」/ en "Even"，同一行的徽章写「有买有卖」/ "Mixed" | 第一轮之后只改了一半，同一屏里一个状态有两种叫法。 | 筛选标签改为「有买有卖」/ "Mixed"。 |
| 格式：zh 持股数 · `[slug]/page.tsx` shares 列 | P2 | 格式 | 「227,917,808」 | 中文报道和行情软件写「2.28 亿股」「2454 万股」。 | zh 用 `Intl.NumberFormat("zh-CN",{notation:"compact",maximumFractionDigits:2})` 输出，再加「股」，得到「2.28 亿股」；en 保持现状。 |
| 格式：en 页头日期 · `src/components/entity/FreshnessBadge.tsx:16` | P2 | 格式（en） | "Data as of 2026-06-30 (filed 2026-08-14) · Source: SEC EDGAR" | 美式产品界面的日期写 "Jun 30, 2026"，ISO 是工程写法。第一轮只要求改正文，页头这类标注不在范围内。13F 的"截至"指持仓日期。 | "Holdings as of Jun 30, 2026 · Filed Aug 14, 2026 · Source: SEC EDGAR"。zh 页头保留 ISO 可以接受（Wind 和 Choice 的表格都这么写），但「数据截至」建议改成「持仓截至」。 |
| 格式：en 金额精度、未标注的变动 · `src/lib/format.ts:5-11`、`InvestorListClient.tsx:96-108`、`[slug]/page.tsx:409-411` | P2 | 格式（en） | `$1.10B` 旁边是 `$601.9M`（4 位有效数字和 3 位混用）；"Portfolio value $299.25B (+14%)"；列表 "161+5"、"$299.25B+14%" 紧贴在一起 | 没写 +14% 是和什么比；数字和增量粘在一起像笔误。Bloomberg 和 WhaleWisdom 会写成 "(+14% QoQ)"、"161 (+5)"。 | en "(+14% QoQ)"，列表写 "161 (+5)"、"$299.3B · +14%"。B/M 统一为 3 位有效数字：`$1.10B / $602M`。 |
| og:image:alt（中文页） · `[slug]/opengraph-image.tsx:6`、buys/sells/consensus 的 `opengraph-image.tsx:3` | P2 | 工程 | zh 页 alt 是 "Superinvestor 13F holdings — Compounder"、"…top buys…" | 卡片图已经出双语，alt 还是静态英文。读屏用户和微信预览拿到的都是英文。 | 改用 `generateImageMetadata` 按 lang 输出：zh「超级投资者 13F 持仓 — Compounder · 复利」。 |
| 全板块涨跌色 · 影响范围见第 3 节 | P1（**待拍板**） | 颜色 | 新进、增持、市值上升用绿色（`--tt-positive` = 品牌绿）；减持、市值下降用橙色；**清仓、共识人数减少用 `--tt-negative`**，也就是 `--alert`，在 globals.css:33 的注释里定义为「数据异常 / 过期 / 错误」 | 中国大陆读者习惯红涨绿跌，看到「+14%」是绿的、「清仓」是红的，会读反。另外不论哪种语言，把正常交易动作（清仓）画成错误色本身就不对。 | 见第 3 节。 |

**顺手记给"全局 / 工程"那位：** 详情页 JSON-LD 的 `Dataset` 和 `ItemList` 都没有 `inLanguage`（`[slug]/page.tsx:514` 附近，`_movesPage.tsx` 的 ItemList）。zh 页 `ItemList.name` 用的是英文法定名（"Microsoft Corp"）。`quarterLabel`（`src/lib/freshness/derive.ts:225`）不接受 `lang`，有 42 处调用。`formatUSD` 不接受 `lang`。全站没有统一的日期格式化函数。

### 格式现状与目标（本区域）

| 类别 | zh 现状 → 目标 | en 现状 → 目标 | 是否已在第一轮报过 |
|---|---|---|---|
| 金额 | `$299.25B` → 「2,992.5 亿美元」（表格内可省为「2992.5 亿」并在表头注「美元」） | `$299.25B` 保留，精度统一为 3 位有效数字 | zh 已报（`formatUSD` 加 lang），仍存在 |
| 小金额 | `$601.9M` / `$4.1M` → 「6.02 亿美元」/「410 万美元」 | `$602M` / `$4.1M` | 同上 |
| 股数 | `227,917,808` → 「2.28 亿股」 | 保留 | 新 |
| 季度 | `Q2 2026` → 「2026Q2」（表格）/「2026 年二季度」（正文） | `Q2 2026` 保留 | 已报，仍存在 |
| 日期（页头和来源） | `2026-06-30` 保留（符合 Wind 习惯），「数据截至」改「持仓截至」 | `2026-06-30` → `Jun 30, 2026` | en 是新问题 |
| 变动 | `+14%`、`161+5` 保留，加分隔 | `(+14% QoQ)`、`161 (+5)` | 新 |

**建议用一个格式化入口统一处理：** 在 `src/lib/format.ts` 增加 `fmtMoney(v, lang)`、`fmtShares(n, lang)`、`fmtDate(iso, lang)`，`quarterLabel(p, lang)` 迁移过来。底层用 `Intl.NumberFormat("zh-CN",{notation:"compact"})`，实测 2.9925e11 输出「2992.5亿」，再拼「美元」；日期用 `Intl.DateTimeFormat`，en 实测输出 "Jun 30, 2026"。

## 3. 需要产品拍板的问题

### 3.1 13F 动作四件套用哪组词
- A：「新进 / 增持 / 减持 / 清仓」。这是中文财经媒体报道 13F 的标准写法，伯克希尔 2026 Q2 各家报道原文就是这组。
- B：「新进 / 加仓 / 减仓 / 清仓」。README 术语表现在的选择，偏雪球口语。
- C：现状「新建 / 加仓 / 减仓 / 清仓」，买卖榜另用「新建仓」，quarterMovesText 用「增持 / 减持」，三套并存。
- **推荐 A。** 第一轮担心「增持 / 减持」会让人联想到 A 股大股东公告，但读 13F 的人恰恰是从这些媒体报道里学会这组词的；而且「增持 X 股 / 减持 X%」可以直接接数量，口语的「加仓」接数量反而别扭。退一步，至少把「新建」统一成「新进」。英文保持 New / Added / Trimmed / Exited 即可，这和 13F 快讯的 "new stake / added to / trimmed / exited (sold out)" 一致。

### 3.2 涨跌和买卖用什么颜色
影响范围（均为渲染页实测）：
- `InvestorListClient.tsx:96-121`：市值环比、持仓数增减、verdict 徽章、"最大一笔"的动作色。
- `[slug]/page.tsx:409-411`：KeyFacts 里的环比；`:622-625`：四格计数里，新进是绿色，清仓是 `--tt-negative`；`:173`：PUT 用橙色。
- `_movesPage.tsx:21-26`：买入榜用 positive，卖出榜用 warn。
- `AggregateRankingList.tsx:57`：共识人数增加用 accent，减少用 `--tt-negative`。
- 公共组件：`Badge.tsx:6-8`、`VerdictChip.tsx:6-15`、`KeyFacts.tsx:18-20`。

选项：
- A：维持国际惯例（绿涨），中英一致。
- B：中文页切换成红涨绿跌。但 `--tt-positive` 就是品牌绿，切换后品牌色会和"跌"绑在一起。
- C：买卖动作不再用红绿表达方向，改用中性色加 ▲▼ 或文字。红绿只留给估值档位，而估值档位本来就和涨跌无关。

**推荐 C，并且无论选哪项，都先把「清仓」和「共识人数减少」从 `--alert`（错误色）挪到 `--tt-warn` 或中性色。** 13F 动作不是价格涨跌，用颜色暗示好坏本来就有"推荐"的味道，和站点"不给建议"的立场冲突。这件事待决策。

### 3.3 Alphabet A/C 等多类股是否合并展示
中文报道按"合并口径"把 Alphabet 算作伯克希尔第三大持仓，页面上则把它排在可口可乐之后。推荐持仓表和共识榜都按发行人合并，展开后再分类别。这件事待决策。

## 4. 第一轮 P0 在本区域的状态（仅标注，不展开）

- 仍存在：/investors 的 SEO description 写着 "smart money" / 「聪明钱」（`investors/page.tsx:58,62`）。
- 仍存在：详情页 title 和 description 的写法（「伯克希尔（巴菲特与阿贝尔）持仓组合 — 13F Q2 2026」「…含环比变动」"Portfolio — 13F Holdings Q2 2026"）。
- 仍存在：buys、sells、consensus 的 SEO description（「按最新可比 13F 申报季，被最多顶级投资者…」「顶级价值投资者 13F 中…」）。
- 仍存在：H1 "Top buys" / "Top sells"（`_movesPage.tsx:94`）。
- 仍存在：consensus、buys、sells 的分享文案仍是「顶级投资者」「居共识首位」「遭…减持」"#1 consensus pick"（`src/lib/share/shareText.ts:33-58`）。
- 已修：buys、sells、consensus 和 [slug] 的 OG 卡片正文已按语言出图，[slug] 的 subtitle 已用 `displayFundName`；分享文案已统一经过 `cleanIssuer`。唯一残留是 og:image:alt（见上表）。

## 5. 依据

- 伯克希尔 2026 Q2 13F 中文报道（2026-08-15 前后）：澎湃 https://m.thepaper.cn/detail/31403622 ；21 世纪经济报道 https://m.sfccn.com/2026/8-15/2MMDE0MDRfMjIxMDI2Mw.html ；虎嗅 https://m.huxiu.com/article/4883316.html ；华尔街见闻 https://wallstreetcn.com/articles/3667761 。用到的原文写法：「新进1只股票、增持了7只股票、减持了6只股票，同时还清仓了1只股票」「持仓市值约659.50亿美元，约占13F股票组合持仓市值比例的22%」「谷歌-A增持约2454万股」「按合并口径成为…第三大持仓」。
- 早几季的 13F 报道：环球网 https://finance.huanqiu.com/article/4RaHHkamJg6 （「新建仓达美航空」「清仓了亚马逊」）、格隆汇 https://m.gelonghui.com/p/3202975 。
- 英文 13F 快讯措辞：MarketBeat（"acquired a new position"、"boosted its position"、"trimmed its stake"）；TipRanks 对冲基金页（"Sold Out"、"New"）https://www.tipranks.com/stocks/wt/hedge-funds 。
- 「帕特·多尔西」是《巴菲特的护城河》中译本的署名，见 Goodreads 中文版条目 https://www.goodreads.com/work/quotes/83865151 、华尔街见闻 https://wallstreetcn.com/articles/3741747 。
