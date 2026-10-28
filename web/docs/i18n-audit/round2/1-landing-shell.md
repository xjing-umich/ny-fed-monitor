# 1-landing-shell：首页 / 全站外壳 / About / 法律页 / Learn 列表与 13F 文章 / 404（第二轮·专业度）

审核日期：2026-10-28。对象是本地站 http://localhost:3217 的渲染结果（curl 取 HTML，404 用浏览器面板复核），以及源码（只读）。第一轮 A-brand.md、E-learn-reports.md 已报过的问题，这里不再重复。
数据核对：首页 10 年期美债 5.00%（截至 2026-10-23）与 FRED DGS10 一致（FRED 2026-10-23 = 5.00，取数于 2026-10-28）。伯克希尔 $299.25B 与财联社/同花顺报道的 Q2 2026 13F「股票组合市值约 2993 亿美元」一致（2026-08-15 报道）。

## 1. 区域结论

- **专业度打分：中文 2.5 / 5，英文 3.5 / 5。** 英文的问题主要是遣词。中文页的首屏数据层（金额、日期、公司名）仍是英文数据站的格式，像一个"翻译了标签的英文站"，不像中文财经页。
- **最拉低专业感的 3 件事：**
  1. **中文首页首屏的数据格式没有本地化**：`Microsoft Corp`、`$11.93B`、`截至 2026-10-23`、`10 年期国债`、`共识持仓 1206`。首页组件调用 `EntityName` 时没有传 lang，`formatUSD` 不区分语言，日期没有经过格式化函数。
  2. **404 不成体系**：拼错的路径（如 `/zh/stock/AAPL`）会直接落到 Next 默认的英文黑底页 "404: This page could not be found."，没有站点外壳，也没有中文。
  3. **数据来源披露不全**：About 和免责声明只写了 SEC EDGAR，但站上同时用了 Yahoo/Stooq/东方财富的股价、SEC XBRL 财报和 FRED 利率，估值也是本站自己的模型结论。专业数据站（Morningstar、WhaleWisdom）都会逐项列出来源和延迟。

## 2. 发现表

| 页面/位置 | 严重度 | 类别 | 现状 | 为什么不专业 | 建议 |
|---|---|---|---|---|---|
| `/zh` 首屏动向面板、共识表<br>`src/components/home/HeroMasthead.tsx:73`、`src/components/home/StepIndex.tsx:157` | P1 | 格式/术语 | zh：`Microsoft Corp MSFT`、`Alphabet Inc Class A GOOGL`、`Taiwan Semiconductor ADR TSM`、`Visa Inc Class A V` | 中文财经页（富途、同花顺、华尔街见闻）在表格里都用中文简称，如「微软」「谷歌-A」「台积电」。站内个股页已经通过 `stockDisplayName` 显示中文名，首页却是英文法定名，同一只股票在站内有两种叫法。`EntityName` 已支持 `lang` 参数，只是这两处没有传。 | 两处都改成 `<EntityName issuer=… ticker=… lang={lang} />`。期望效果：zh「微软 MSFT」「谷歌-A GOOGL」「台积电 TSM」；en 不变。 |
| `/zh` 首屏动向面板、超级投资者名单<br>`HeroMasthead.tsx:85`、`StepIndex.tsx:192`、`src/lib/format.ts:5`（`formatUSD` 无 lang 参数） | P1 | 格式 | zh：`20 位 · $11.93B`、`巴菲特与阿贝尔 $299.25B` | 中文财经媒体写大额一律用「亿美元」，例如财联社写伯克希尔「股票组合市值约 2993 亿美元」。`$11.93B` 中文读者需要自己换算，B 和 M 的量级也容易看错。 | 在 `format.ts` 加 `formatMoney(v, lang)`。zh 规则：≥1e12 写「X.XX 万亿美元」，≥1e8 写「X.X 亿美元」，≥1e4 写「X 万美元」。例：`$11.93B` → `119.3 亿美元`，`$299.25B` → `2992.5 亿美元`，`$161.9M` → `1.62 亿美元`。en 保持 `$11.93B`。每股价格（如 `$346`）在中文页可以保留美元符号，不需要改。 |
| `/` 与 `/zh` 动向面板<br>`HeroMasthead.tsx:85` | P1 | 页面感 | zh `TRIM 谷歌 GOOGL 27 位 · $12.57B`；en `27 · $12.57B` | 金额没有标签，读者分不清 $12.57B 是卖出的金额、卖完后剩下的持仓，还是全部持有人的市值。源码 `aggregations.ts:93` 累加的是 `HoldingChange.value`，语义需要团队确认。WhaleWisdom、Dataroma 的金额列都有列名。 | 面板标题下加一行列名。zh：「人数 · 相关持仓市值」；en：「Investors · Position value」。名称按 `value` 的真实含义定，如果是变动后的持仓市值，就写「变动后持仓市值 / Value after change」。 |
| `/zh`、`/` 数据条<br>`src/components/common/DataStrip.tsx:9` | P1 | 术语 | zh「10 年期国债 5.00%」 | 中文语境里单说「10 年期国债」默认指中国国债（中债 10Y 目前在 2% 以下），5.00% 会被当成错误数据。站内个股页写的是「10 年期美债」（`stocks/[ticker]/page.tsx:751`），两处不一致。 | zh：「10 年期美债收益率」；en：「10-year Treasury yield」（`10Y Treasury` 少了 yield，读起来像价格）。 |
| `/zh`、`/` 数据条<br>`DataStrip.tsx:9-10, 61` | P1 | 术语/格式 | zh「共识持仓 1206」；en「Consensus stocks 1206」 | 1206 是被 2 位及以上投资人持有的股票数（`CONSENSUS_MIN_HOLDERS = 2`）。把 1206 只都叫"共识"会夸大这个概念：读者理解的共识是 Top 10 那一档。数字没有单位，英文也缺千分位。 | zh：「2 位以上共同持有」，数值写「1,206 只」；en：「Held by 2+ superinvestors」，数值写「1,206」。用 `Intl.NumberFormat("en-US")` 加千分位，中文数据格同样用千分位（Wind、东方财富都这么写）。 |
| `/zh`、`/` 数据条<br>`DataStrip.tsx:67` | P2 | 格式/页面感 | zh「截至 2026-10-23」；en「as of 2026-10-23」，没有写来源 | 宏观数据通常要注明来源，彭博和华尔街见闻都会写 "Source: FRED"。英文页用 ISO 日期也不符合美式习惯。 | zh：「FRED · 2026 年 10 月 23 日」；en：「FRED · Oct 23, 2026」。 |
| 法律页、文章页、Learn 列表的日期<br>`src/components/legal/ProseDoc.tsx:39`（法律页和文章页共用）、`src/app/[lang]/learn/page.tsx:136, 156` | P1 | 格式 | zh「最后更新 · 2026-06-06」「更新于 2026-10-19」；en「Last updated · 2026-06-06」「Updated 2026-10-19」 | 署名区的日期是给读者看的，不是数据表。中文财经媒体写「2026 年 6 月 6 日」，美式写 "June 6, 2026"。用 `·` 连接标签和日期也不像正文的写法。 | 在 `format.ts` 加 `formatDate(iso, lang, "long" \| "short")`。zh：「最后更新：2026 年 6 月 6 日」「更新于 2026 年 10 月 19 日」；en："Last updated: June 6, 2026"、"Updated Oct 19, 2026"。表格和来源行仍可保留 ISO（与第一轮术语表一致）。`HeroMasthead.tsx:49-57` 里的 `EN_MONTHS` / `fmtDeadline` 是临时写的格式化逻辑，应并入这个函数。 |
| 拼错的任意路径，如 `/zh/nonexistent-xyz`、`/nonexistent-xyz`<br>`src/app/` 下没有 `global-not-found`，`[lang]` 下也没有兜底的 `[...rest]` 路由 | P1 | 页面感/工程 | 中英文都显示 Next 默认的黑底英文页 "404: This page could not be found."，`<html>` 没有 lang 属性，也没有导航和页脚 | 金融数据站的 URL 经常被手敲或从旧链接进来，比如 `/stock/AAPL` 和 `/stocks/AAPL`。掉到框架默认页，看起来就像网站坏了。只有 `notFound()` 触发时才会显示定制的 `[lang]/not-found.tsx`。 | 加 `src/app/[lang]/[...rest]/page.tsx`，里面直接调 `notFound()`，这样 `/zh/*` 和 `/*` 的未知路径都会走现有的本地化 404。或者按 `not-found.tsx:7` 注释的提示，启用 `globalNotFound`。 |
| 未知股票代码的 404，如 `/zh/stocks/ZZZQQ`<br>个股页的 `generateMetadata` | P2 | 页面感/工程 | 页面正文是「页面未找到」，但标签页标题是「ZZZQQ（ZZZQQ）股票 — 谁在持有 \| Compounder · 复利」，description 写着「谁在持有 ZZZQQ（ZZZQQ）？」，`robots` 为 index | 404 页顶着一个"有这只股票"的标题，自相矛盾。 | `generateMetadata` 在查不到股票时返回 zh「页面未找到 — Compounder 复利」/ en「Page not found — Compounder」，并设置 `robots: { index: false }`。 |
| 页面 title 后缀<br>`src/app/[lang]/about/page.tsx:21`；对照个股页标题 | P2 | 页面感 | 「关于 Compounder — Compounder」「About Compounder — Compounder」；首页用「Compounder · 复利 — …」，个股页用「… \| Compounder · 复利」，其他页用「… — Compounder」 | 品牌名在 About 标题里重复出现。站内有三种后缀，分隔符也有 `—`、`\|`、`·` 三种，中文页大多没有「复利」。 | 统一 zh 后缀为「 — Compounder 复利」，en 为「 — Compounder」。About 页的 title 改成 zh「关于我们 — Compounder 复利」/ en「About — Compounder」。 |
| About「数据与来源」<br>`src/lib/about.ts:39, 80` | P1 | 页面感 | 只写了「主要为美国证券交易委员会 EDGAR 系统(13F 等申报)」/ "primarily … EDGAR" | 实际来源还有：股价来自 Yahoo、Stooq、东方财富（`src/lib/prices/providers/`），财报来自 SEC 10-K/10-Q XBRL，利率来自 FRED。个股页的来源行已经列全，About 却没有。专业站都会列出全部来源，例如 Morningstar 的 data sources 页。 | zh：「持仓：SEC EDGAR 的 13F 申报，季末后最长 45 天披露。财报：SEC 10-K/10-Q（XBRL）。股价：前一交易日收盘价（Yahoo Finance 等），不是实时行情。利率：FRED 10 年期美债收益率。估值是本站用公开数据算出来的模型结果，不是任何机构的评级。」en 按同样结构写。供应商名称请先跟工程确认。 |
| 免责声明「数据来源与准确性」<br>`src/lib/legal.ts:43`（en 在约 :76） | P2 | 页面感（涉及法律，需律师确认） | 同样只列了 EDGAR；全文也没有说明估值和"击球区"是本站模型的估计值 | 美国金融站的免责声明通常会单独说明 "fair value estimates are … not guarantees"（Morningstar 写法），以及第三方行情的延迟。这里涉及法律含义，**不给成品句，只标出缺口**。 | 请律师评估是否补充三点：①来源列全（同上）；②估值和击球区是基于假设的模型估计，不保证准确；③运营者是否持有文中提到的证券（利益冲突声明，美国财经媒体和中国券商研报都有这一节）。 |
| 免责声明「风险提示」<br>`src/lib/legal.ts:56` | P2 | 术语 | zh「历史表现不代表未来结果」 | 中文监管和基金业的标准说法是「过往业绩不代表未来表现」，基金合同和券商研报都这么写。 | 「过往表现不代表未来表现。」（措辞标准化，含义不变） |
| 隐私政策「第三方处理者」<br>`src/lib/legal.ts:161, 172` | P2 | 术语（需律师确认） | zh「第三方处理者」 | 在《个人信息保护法》里，「个人信息处理者」指的是决定处理目的的一方，相当于 GDPR 的 controller。这里要说的是受托方，相当于 processor。中文隐私政策通常写「受托处理方」或「第三方服务提供商」。 | 「第三方服务提供商（受托处理）」 |
| 13F 文章：申报门槛<br>`src/lib/learn.ts:48`（en）、`:89`（zh）；`:303/367/435/505` 同一说法 | P2 | 术语/准确性 | en「at least $100 million in U.S. stocks」；zh「管理着至少 1 亿美元美股的机构」 | SEC 规则的口径是对 1 亿美元以上的 "Section 13(f) securities" 行使投资裁量权，范围包括美国上市股票、ADR、部分期权和可转债。WhaleWisdom 和 SEC FAQ 都按这个写。说成"美股"不算错，但一篇专讲"怎么读 13F"的文章应该写准确。 | en：「Any institutional investment manager with discretion over at least $100 million in 13(f) securities (mostly U.S.-listed stocks) has to file …」；zh：「对至少 1 亿美元"13(f) 证券"（主要是美国上市股票）有投资决定权的机构投资管理人，都要按季度向 SEC 报送 13F。」 |
| 13F 文章：遗漏的部分<br>`learn.ts:64`（en）、`:105`（zh） | P2 | 准确性/页面感 | en「foreign shares … don't show up」；zh「海外股份…统统不在里面」；全文没有提到保密申请和 13F/A | 首页就列着 "Taiwan Semiconductor ADR"，读者会问"海外股不是不在里面吗"。专业读者还会注意到漏了"保密处理"：伯克希尔多次申请对部分仓位延后披露，之后再用 13F/A 补报。讲 13F 盲区的文章里，这是常识级内容。 | en：「…foreign shares that trade only abroad (U.S.-listed ADRs do appear)…」，并在这一段末尾加一句：「Managers can also ask the SEC to keep a position confidential for a while; it shows up later in an amended filing (13F/A).」zh：「…只在海外上市的股票（在美国上市的 ADR 会出现）…」，并加一句：「基金还可以申请对部分仓位暂缓披露，之后用修订申报（13F/A）补上，伯克希尔就这样做过。」 |
| 13F 文章页署名与引用<br>`src/app/[lang]/learn/[slug]/page.tsx`（ProseDoc 头部） | P2 | 页面感 | 没有作者或编辑署名，也没有指向 SEC 原始说明的链接 | Morningstar、华尔街见闻等专业财经内容都有作者或编辑署名，讲规则的文章也会链接监管原文。对一个以"一手来源"为卖点的站，这一项尤其重要。 | 署名行写 zh「Compounder 编辑部 · 更新于 2026 年 6 月 7 日」/ en "By the Compounder team · Updated June 7, 2026"。文末加"延伸阅读"：SEC 的 Frequently Asked Questions About Form 13F（sec.gov）。 |
| 首页超级投资者名单<br>`StepIndex.tsx:188-192`；名称来自 `src/lib/managers/displayName.ts:57` | P2 | 页面感 | zh：「比尔·阿克曼」「特里·史密斯」（全名）、「霍恩」「盖茨」「达利欧」（只有姓）、「Ravenel Boykin Curry」（没有翻译）、「道奇考克斯」混在一列；金额没有标签 | 同一列的人名格式不统一，看起来是三套规则拼在一起的。机构名「Dodge & Cox」的中文通行写法是「道奇与考克斯」。金额是 13F 持仓市值，不是 AUM，没有标签容易被当成管理规模。 | 列表统一用「姓（或通行简称）」，没有通行中文名的保留英文，但写短名（Ravenel Curry）。机构名改成「道奇与考克斯」。金额列加小字标题：zh「13F 持仓市值」，en「13F portfolio value」（Dataroma 写 "Portfolio value"）。 |
| 语言切换器<br>`src/components/shell/TopNav.tsx:107, 119`；`MobileDrawer.tsx:165, 178` | P2 | 页面感 | 「中文 \| EN」 | 一边写全称一边写缩写，不对称。FT 中文网、WSJ 中文版的切换器都写「中文 / English」或「简 / EN」。 | 「中文 / English」；窄屏可以写「中 / EN」。 |
| zh 页 `<meta name="keywords">`<br>`src/app/[lang]/layout.tsx:60` | P2 | 工程（顺手记） | 中文页的 keywords 全是英文：`13F, superinvestors, smart money holdings…` | Google 忽略这个字段，但百度仍会参考。中文页没有一个中文关键词，还包含第一轮要求弃用的 smart money。 | 按 lang 分开写。zh：`13F, 超级投资者, 巴菲特持仓, 13F 持仓, 价值投资, 内在价值, 个股估值, SEC`。 |

**第一轮 P0 在本区仍存在（不展开）：**
- 首页 title/description 仍有 smart-money 和 `×`（`[lang]/page.tsx:35-40`）。
- 首屏「逐笔对齐第一性原理估值」和「按 CUSIP 逐票归并」（`HeroMasthead.tsx:21-25`）。
- asOf 行「来源 SEC 13F · 上报延迟 45 天」，季度写成 `Q2 2026`（`HeroMasthead.tsx:30`）。
- 申报进度行「已交 / 切换」（`filingProgressText.ts`）。
- 中文页 MoveTag 显示 NEW/ADD/TRIM/EXIT（`MoveTag.tsx:4-7`）。
- 子导航「本季最多人买 / 最多机构持有 / 按价值带」（`nav.ts:21-27`）。
- Learn H1「读懂生意，而非代码」和 description「严肃投资者」（`learn/page.tsx:32-33`）。
- 默认 OG 卡已修复。

## 3. 需要产品拍板的问题

**Q1. 13F 变动用「增持/减持」还是「加仓/减仓」（对第一轮术语表的修正意见）**
第一轮选了「新进/加仓/减仓/清仓」，理由是"增持/减持在 A 股语境里指大股东公告"。这个理由站不住：中文财经媒体报道 13F 时，通行写法就是 **新进 / 增持 / 减持 / 清仓**。例如同花顺和财联社报道伯克希尔 2026 年二季度 13F 时写的是"新进 1 只股票、增持了 7 只股票、减持了 6 只股票，同时还清仓了 1 只股票"（[同花顺](https://stock.10jqka.com.cn/20260815/c678982033.shtml)，2026-08-15）。「加仓/减仓」是雪球和散户的口语，也能看懂，但不是媒体和研报的写法。
- 选项 A（推荐）：徽章用 新进 / 增持 / 减持 / 清仓（都是两个字，芯片宽度不变）；榜单标题用「买入最多 / 卖出最多」（沿用第一轮建议）。
- 选项 B：维持第一轮的「加仓/减仓」，更口语，但和媒体写法不一致。

**Q2. 涨跌颜色（待决策）**
现状是绿色表示正向（`--tt-positive = --brand`，色相 158），红色表示负向（`--tt-negative = --alert`，色相 28），即美式惯例。本区受影响的位置：`MoveTag.tsx:14`（买入徽章绿、卖出徽章红），`HeroMasthead.tsx:79-83`（买入行绿、卖出行红）。全站其他用到正/负色的组件：`InvestorListClient`、`investors/[slug]/page`、`StocksTable`、`ScreenerTable`、`AggregateRankingList`、`KeyFacts`、`VerdictChip`、`ValuationBadge`、`EarningsPowerFloorCard`、`Badge`、`ui/badge`。`FreshnessBadge/Dot` 和表单成功/失败提示表示的是状态，不是方向，不受影响。
难点在于：正向色就是品牌绿。如果中文页直接把 positive 翻成红色，"好/便宜"和"买入"会一起变红，和品牌色冲突。
- 选项 A（推荐）：新增方向色 token `--tt-up` / `--tt-down`，只给"方向"语义用（买卖动作、持仓增减、价格涨跌），并按 lang 映射：zh 红为买入或上涨、绿为卖出或下跌，en 相反。估值档位（便宜/贵）和状态色保持语义色，不随语言变。
- 选项 B：中英都不变。代价是中文读者看到绿色的"增持"会直觉读成负面。
- 选项 C：方向一律改用中性色加箭头或符号（▲▼），两种语言都不用红绿。最省事，但信息密度最低。

**Q3. 是否统一建格式化层**（建议做，属于第 1 批"机械统一"）
在 `src/lib/format.ts` 增加四个函数，组件不再各自拼字符串：
- `formatMoney(v, lang)`：zh `119.3 亿美元`，en `$11.93B`
- `formatDate(iso, lang, style)`：zh `2026 年 10 月 23 日` / `10 月 23 日`，en `Oct 23, 2026`
- `formatCount(n, lang)`：`1,206`
- `quarterLabel(period, lang)`：zh `2026 Q2`，en `Q2 2026`

同时把 `HeroMasthead.tsx` 里的 `EN_MONTHS` / `fmtDeadline` 并进来，`ai-check` 再加一条规则：zh 的 COPY 里出现 `$…B` / `$…M` 时报警。
