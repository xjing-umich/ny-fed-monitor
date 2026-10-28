# 2-stocks：个股列表 / 选股器 / 个股详情（不含估值区块），专业度审核（第二轮）

样本：2026-10-28 用 curl 抓取本地 :3217 渲染页，中英各一份。页面包括 /zh/stocks、/stocks、/zh/stocks/screener、/stocks/screener、?view=conviction，以及 DECK、AAPL、PDD 三只个股的详情页。另回源码核对了 `format.ts`、`qoqDirection.tsx`、`aliases/config.ts`、`zhNames.ts`、`ScreenerTable.tsx`、`[ticker]/page.tsx`。
第一轮 C-stocks.md 已经报过的问题不再重复，只在第 4 节列一行“仍存在”。

## 1. 区域结论

- **专业度打分：中文 2/5，英文 3/5。** 数据骨架和 Dataroma、WhaleWisdom 同一个量级，但数字的“写法”还停留在工程默认值上。中文页的金额、季度、股数基本都是英文格式；英文页的公司名大小写和价格精度会被美国读者一眼看出是业余站。
- **最拉低专业感的 3 件事：**
  1. **持有人表的投资人名字有三套写法混在一张表里。** 中文页有音译的姓（布卢姆斯特兰、奈格伦、罗琼），有英文全名（Shad Rowe、David Katz），也有基金名（道奇考克斯、普伦资本、红杉基金）；同一页的动向行里又写成全名「霍华德·马克斯」。英文页则是人名和机构名混用。
  2. **中文页把“持仓市值”写成「市值」，还在用 `$76.77B`、`$963,518` 这类英文格式。** 中文读者会把「市值 $17.91B」读成公司总市值；而同一列在 $1M 以下突然变成全额美元，单位前后不一致。
  3. **价格和占比的精度不够。** 选股器现价取整到美元（$2.9 的股票显示成 $3）；占比 `0.0% → 0.0%` 在 AAPL 持有人表里出现了 10 次左右。专业站会写成 `$2.88` 和 `<0.1%`（或保留两位小数）。

## 2. 发现表

| 页面/位置 | 严重度 | 类别 | 现状（原文） | 为什么不专业（对标） | 建议（成品） |
|---|---|---|---|---|---|
| /zh/stocks 列名；/zh/stocks/AAPL 持有人表列名。`src/lib/stocks/stockCopy.ts:15-16`、`src/app/[lang]/stocks/[ticker]/page.tsx:162` | **P0** | 术语 | zh 列表页列名「合计市值」、移动端「市值」；持有人表列名「市值」，值为 `$17.91B`（MSFT 一行） | 在中文股票语境里，「市值」默认指**公司总市值**（富途、雪球、Wind 都是这个意思），读者会以为微软市值只有 179 亿。中文媒体写 13F 一律用「持仓市值」，比如“伯克希尔二季度末持仓市值 xx 亿美元”。本站 JSON-LD 的 `variableMeasured` 自己就写着「持仓市值（美元）」（同文件约 :600），可见代码里知道正确写法，只是表头没有用上。 | zh：`totalValue: "合计持仓市值"`、`totalValueShort: "持仓市值"`；持有人表 `value: "持仓市值"`。en 的 "Value / Total value" 可以保留（WhaleWisdom 写 Market Value，Dataroma 写 Value） |
| 持有人表“投资人”列与动向行（三只样本都有）。`src/lib/aliases/config.ts:62-70`（`managerZhName`：名家全名 > people[].zh > INVESTOR_ALIASES 首词 > 英文） | **P1** | 术语/页面感 | zh AAPL 同一张表：「格兰瑟姆 / 奈格伦 / 罗琼 / 鲁索 / 布卢姆斯特兰」（只有音译姓）+「Shad Rowe / David Katz / Francis Chou」（英文全名）+「道奇考克斯 / 普伦资本 / 红杉基金」（机构名）；PDD 动向行写「清仓 3（霍华德·马克斯、Sarah Ketterer、泰珀）」。en：`Warren Buffett & Greg Abel`、`Ray Dalio` 和 `Dodge & Cox`、`Polen Capital`、`Ruane Cunniff (Sequoia Fund)` 并列 | 中文财经媒体只给有通行译名的人用中文（巴菲特、段永平、李录、达利欧、霍华德·马克斯），其余直接写英文名或基金名，比如「绿光资本（David Einhorn）」。「布卢姆斯特兰」「奈格伦」这种只写姓的音译，读者搜不到、也认不出是谁。英文侧，Bloomberg/WSJ 报道 13F 以申报机构为主语（"Bridgewater Associates boosted…"），Dataroma 写作 "Chris Bloomstran - Semper Augustus"。把桥水的 13F 直接记在 Ray Dalio 名下，在专业读者看来也不准确（达利欧已经不管投资决策）。 | 需要拍板，见第 3 节第 2 项。最低限度的修法：zh 只在有公认译名时用中文，**用全名不用光秃的姓**；没有公认译名的用英文全名。机构主导的（Bridgewater、Dodge & Cox、GMO、Polen）显示机构名。代码上，`zhAnchor` 不再回退到 `INVESTOR_ALIASES` 首词 |
| /zh/stocks、/zh/stocks/screener、个股页“他们还共同持有”。`StocksTable.tsx:93`、`ScreenerTable.tsx:33,141`、`[ticker]/page.tsx:961`（都直接用 `cleanIssuer`，没有走 `stockDisplayName`） | **P1** | 页面感 | zh 列表和选股器里是 `Microsoft Corp`、`Apple Inc`、`PDD Holdings Inc`、`Weibo Corp ADR`、`Joyy Inc ADR`；同站详情页 H1 却是「苹果 Apple Inc」「拼多多 PDD Holdings Inc」 | 富途、老虎、雪球的美股列表都以中文简称为主、英文代码为辅。中概股在中文页只显示英文法定名尤其扎眼。`zhNames.ts` 已经有映射，只是列表这几处没调用。 | 三处都改成 `stockDisplayName(lang, ticker, issuer)`。另外 `zhNames.ts` 补上样本里出现但缺失的中概股：`WB: "微博", JOYY: "欢聚", FINV: "信也科技", NOAH: "诺亚控股", YUMC: "百胜中国", VIPS: "唯品会", GDS: "万国数据"` |
| /zh/stocks/AAPL 持有人表“市值”列。`src/lib/format.ts:5-11`（`formatUSD`） | **P1** | 格式 | 同一列里 `$1.3M`、`$963,518`、`$894,701`、`$278,075` 混排；B 用两位小数（`$65.95B`），M 用一位（`$355.1M`） | 同一列的单位应当一致。WhaleWisdom 整列以千美元为单位，Dataroma 整列都是全额。<$1M 时回退成全额美元，原因是 `formatUSD` 没有 K 档；而且 `toLocaleString()` 没传 locale，输出取决于服务器的区域设置。 | en：加 K 档并统一一位小数，`$65.9B / $355.1M / $963.5K`，并显式写 `toLocaleString("en-US")`。zh：见下一行 |
| 中文页所有金额：H1 区、key facts、SEO description、文字说明、列表、持有人表。`format.ts:5-11` | **P1** | 格式 | zh `4 位持有 · 合计 $161.9M`、`合计申报市值 $3.11B`、描述 `合计 $76.77B` | 中文财经稿和研报写「1.62 亿美元」「767.7 亿美元」，表格写「亿 / 万」，并在表头注明「（美元）」。B 区第一轮的成品句也是「合计 2,634 亿美元」，C 区第一轮却还保留 `$41.2B`，两区建议互相矛盾，这里一并统一。 | 新增 `fmtMoney(v, lang, mode)`。zh 正文：`161,900,000 → "1.62 亿美元"`，`963,518 → "96.4 万美元"`；zh 表格：表头写「持仓市值（美元）」，单元格写 `659.5 亿`、`3.55 亿`、`96.4 万`。可以直接用 `new Intl.NumberFormat("zh-CN",{notation:"compact",maximumFractionDigits:2})`，它会输出 `1.62亿`，再补一个空格。en 正文（FAQ、文字说明）按 AP 写法用 `$161.9 million`，表格和 meta 用 `$161.9M` |
| 持有人表权重列。`src/components/common/qoqDirection.tsx:14-15`（`fmtPct1`） | **P1** | 格式 | AAPL 表中 `0.0% → 0.0%` 出现约 10 次（道奇考克斯、鲁索、普伦资本、红杉基金…）；DECK 有「格兰瑟姆 增持 0.0% → 0.0%」 | 「增持」配上 0.0% → 0.0%，看起来像数据坏了。Dataroma 的占比保留两位小数（0.03%），彭博终端对极小值写 `<0.1%`。 | `w>0 && w<0.0005` 时输出 `<0.1%`（en 同样）；或者全表改成两位小数 |
| 选股器“现价 / 内在价值 / 价值带”列。`ScreenerTable.tsx:76,87,98` | **P1** | 格式 | `Math.round(n)`：FINV 现价 `$3`、WB `$6`、AMPY `$4`、VYX `$8`；内在价值 `$12`、`$5` | 美股报价的惯例是保留两位小数，所有行情站都这样。现价 $2.88 显示成 $3，误差 4%，比很多行的安全边际差值还大，读者没法自己核对“安全边际 76%”。 | 现价一律两位小数：`$2.88`、`$81.23`。内在价值和区间在 ≥$100 时可以取整，<$100 保留一位，<$10 保留两位，比如 `$11.6–$13.9` |
| 选股器 dateline 与价格日期打架。`_screenerPage.tsx:116` + `ScreenerTable.tsx:99` | **P1** | 页面感 | 页头写「估值截至 2026-10-28」/ "Valuation as of 2026-10-28"，每行现价下方却是 `2026-10-27`；列表页写的又是「估值截至 2026-10-27 收盘价」 | 这里的 10-28 是 `computedAt`（脚本运行的日期），不是市场日期。专业站的 as-of 只锚定行情日（Morningstar 写 "Price as of 10/27/2026 close"）。同一个产品里两页、同一页上下两行给出不同的日期，会直接伤害信任。 | dateline 改用价格日期：zh `按 2026 年 10 月 27 日收盘价`，en `As of the Oct 27, 2026 close`。每行下面重复的 `2026-10-27` 删掉，只在个别价格日期不同的行标注 |
| /stocks、/zh/stocks、选股器、个股页的公司英文名。`src/lib/format.ts`（`cleanIssuer` / `WORD_CASE`） | **P1** | 页面感（en） | 目录里有 35 个以上缩写型名称被写成了首字母大写：`Eog Resources`、`Cme Group`、`Agco Corp`、`Aaon Inc`、`Adt Inc`、`Bce Inc`、`Msa Safety`、`Ugi Corp`、`Vici Properties`、`Wex Inc`、`Xpo Inc`、`Gxo Logistics`、`Qxo Inc`、`Rli Corp`、`Wsfs Financial`、`Txnm Energy`、`Nov Inc`、`Apa Corp`、`Abm Industries` 等；品牌大小写错误：`Nvidia Corp`、`Abbvie Inc`、`Sofi Technologies`、`Marsh & Mclennan Cos`、`Ziprecruiter`、`Dexcom`、`On Semiconductor`；截断或未清洗：`Noah Holdings Ltd Spon Ads`、`International Bancshares Crp`、`Pelagos Insurance Capital Lt`、`Zim Integrated Shipping Serv`、`Fidelity National Info Serv` | 美国读者对 "Eog"、"Nvidia Corp" 的感受，相当于中文读者看到「茅台酒业股份」：一看就知道是机器生成的。Bloomberg、Morningstar 都用公司自己的写法（EOG Resources、NVIDIA、AbbVie）。 | 短期：把上面这些补进 `WORD_CASE` 和 `ISSUER_NAME_FIXES`（`Ads`→`ADR`、`Crp`→`Corp`、`Lt`→`Ltd`、`Serv`→`Services`）。规则：首词与 ticker 相同且全是辅音或 ≤3 个字母时，整词大写。长期：名称来源换成交易所或行情源的 display name（如 Yahoo 的 `longName`），不再从 13F 的 28 字符截断名里清洗 |
| 持有人表缺少“持股变动”列。`[ticker]/page.tsx:209-224` | **P1** | 页面感 | AAPL：「段永平 减持 · 36.7% → 41.1%」；DECK：「格兰瑟姆 增持 · 0.0% → 0.0%」。表里只有动作标签和权重，没有股数变动幅度 | 权重受股价影响，经常和动作方向相反，读者看到“减持但占比上升”会以为数据错了。Dataroma 的 Activity 列写 "Reduce 7.52%"，WhaleWisdom 有 "% Change" 列，13F 站把持股变动百分比当成标配。 | 新增列 zh「持股变动」/ en「Change in shares」，值为 `+12.3%`、`−7.5%`、`新进`/`New`。权重列改为表头「占组合」/「% of portfolio」，只显示本季值，上季值放 tooltip 里 |
| 持有人表“持股”列。`[ticker]/page.tsx:163,223` | P2 | 术语/格式 | zh 表头「持股」，值 `227,917,808` | 「持股」单独作表头时，可以读成持股数，也可以读成持股比例。中文行情站对大数写「2.28 亿股」。 | 表头 zh 改「持股数（股）」；中文单元格大于 1 亿时写 `2.28 亿`，大于 1 万时写 `1,227 万`。en 的 "Shares" 保留 |
| 本季动向标签（表格）和文字说明的动词。`qoqDirection.tsx:9`（新建/增持/减持）对比 `stockProse.ts:92`（新建/加仓/减仓） | P1 | 术语（**修正第一轮建议**） | 同一页表格写「增持 / 减持」，正文写「加仓 / 减仓」。第一轮和 README 术语表定为「新进 / 加仓 / 减仓 / 清仓」，并把「增持 / 减持」列为不再使用 | 第一轮的理由是“增持/减持在 A 股指大股东公告”，这一点不成立。中文财经媒体报道 13F 的固定写法就是「增持 / 减持 / 新进（新建仓）/ 清仓」，例如「伯克希尔二季度减持苹果、增持西方石油」「桥水 13F：新进…、清仓…」。公募季报解读、北向资金报道里同样说机构「增持 / 减持」。「加仓 / 减仓」是雪球帖子和散户的口语。两者都能读懂，但要像专业财经媒体，应选「增持 / 减持」。 | 统一为 **新进 / 增持 / 减持 / 清仓**（「新建」改「新进」，其余保持表格现在的写法），`stockProse.ts:92` 跟着改。en 表格标签建议 `Trimmed` 改为 `Reduced`：trim 暗示小幅减仓，而 MoveMark 对减 90% 也标 Trimmed；WhaleWisdom 和 Dataroma 的表格都用 Reduce。正文里仍可用 trimmed |
| /zh/stocks 同一页两个总数。`stocks/page.tsx:133` 对比 `stockCopy.ts:43` | P2 | 页面感 | 目录写「全部 1204 只被两位及以上投资人持有的股票」，表格底部写「共 1206 只」 | 同一页上两个“全部”的数不一样，专业读者会去核对。差异来自目录多了一道 `isLikelyTicker` + 去重过滤。 | 两处用同一个谓词，或者在表格计数里注明“含 2 只非标准代码证券”。最简单的做法是表格也用目录那套过滤 |
| 选股器 H1。`stockCopy.ts:39/54`（`stocksTitle`），由 `_screenerPage.tsx` 复用 | P2 | 页面感 | /stocks/screener 的 H1 也是「个股」/"Stocks"，与列表页 H1 相同 | Finviz、Morningstar、富途都把筛选器单独命名为「选股器」/"Stock Screener"。H1 重名会让读者不确定自己在哪一页。第一轮只改了 eyebrow 和 SEO，没有涉及 H1。 | zh `估值选股器`，en `Valuation screener` |
| PDD 详情页“生意质量”。`[ticker]/page.tsx:903-916` + 来源行 `SEC 20-F (XBRL)` | P2 | 页面感/格式 | `营收 $9.12B → $61.75B · 近 6 年`，`营收增速 +14.5%`，没有币种说明 | 拼多多的 20-F 以人民币报告，中文读者熟悉的口径是「2025 年营收 4,xxx 亿元人民币」。页面显示美元却不说明折算方式（看数值像是用各年 20-F 的便利汇率换算的），增速里还混进了汇率变动。Morningstar 对外币报告的公司会标 "Financials in CNY"。 | 对报告币种不是 USD 的公司，在生意质量标题旁加一行：zh `财报以人民币列示，此处按各年 20-F 折算汇率换成美元`，en `Reported in CNY; converted to USD at each 20-F's convenience rate`。更好的做法是中概股直接显示人民币 |
| 列表页与持有人表的读屏排序提示。`src/components/common/DataTable.tsx:81-82`，`StocksTable.tsx` 没有传入 | P2 | 工程 | 中文页排序列 sr-only 文本为 `sorted descending` / `sorted ascending` | 中文页读屏念英文。第一轮报过 `sortGroupLabel` 和 `No data available`，没报这两个。 | `STOCK_UI` 加 `sortAsc: "升序" / sortDesc: "降序"` 并传入；更彻底的做法是 DataTable 把这几个 label 改成必填 |

## 3. 格式现状清单（本区域，按类别）

| 类别 | zh 现状 | zh 目标 | en 现状 | en 目标 | 由谁出 |
|---|---|---|---|---|---|
| 金额（表格） | `$65.95B` `$355.1M` `$963,518` | 表头「持仓市值（美元）」，单元格 `659.5 亿` `3.55 亿` `96.4 万` | 同左 | `$65.9B` `$355.1M` `$963.5K` | `fmtMoney(v, lang, "table")` |
| 金额（正文 / SEO / FAQ） | `合计 $161.9M` | `合计 1.62 亿美元` | `$161.9M combined` | `$161.9 million`（meta 可用 `$161.9M`） | `fmtMoney(v, lang, "prose")` |
| 股数 | `227,917,808` | `2.28 亿`（表头「持股数（股）」） | `227,917,808` ✔ | 保持 | `fmtShares(v, lang)` |
| 组合占比 | `0.0%` | `<0.1%` | `0.0%` | `<0.1%` | `fmtWeight` |
| 现价 | `$3` `$81` | `$2.88` `$81.23` | 同左 | 同左 | `fmtPrice`（固定两位） |
| 季度标签（徽章、动向行） | `Q2 2026` | `2026 Q2`，正文写「2026 年第二季度」 | `Q2 2026` ✔ | 保持 | `quarterLabel(period, lang)`（第一轮已定，未落地） |
| 日期（dateline / 正文） | `估值截至 2026-10-28` | `按 2026 年 10 月 27 日收盘价`；来源脚注可保留 ISO | `Valuation as of 2026-10-28` | `As of the Oct 27, 2026 close` | `fmtDate(d, lang)` |
| 正负号 | 生意质量用 ASCII `-`（`page.tsx:913` 的 `toFixed`） | 统一用 `−`（U+2212），或者全站统一用 `-` | 同左 | 同左 | `fmtSignedPct` |

结论：需要统一的格式化函数。现在 `format.ts` 只有一个不分语言的 `formatUSD`，其余格式散落在组件里：`toLocaleString()`、`Math.round`、`toFixed(1)` 各写各的。建议在 `format.ts` 集中提供 `fmtMoney / fmtShares / fmtWeight / fmtPrice / fmtDate / quarterLabel`，全部带 `lang` 参数，并用 `Intl.NumberFormat` 显式指定 `zh-CN` 或 `en-US`。可以和第一轮的“第 1 批机械统一”一起做。

## 4. 需要产品拍板的问题

1. **涨跌颜色（待决策）**
   - 现状：本区域没有按价格涨跌上色的元素。绿色 `--val-below` 只表示“低于内在价值 / 击球区”（`StocksTable.tsx:50`、`ScreenerTable.tsx:32,57,145`、`ValuationBadge.tsx:40-42`、KeyFacts 的 `positive`），琥珀色 `--val-above` 表示“高于价值”，持有人表的增持/减持标签是中性灰（`qoqDirection.tsx:26`）。
   - 影响范围：本区域只有以上估值语义色。首页的 `MoveTag`（绿 = 买、红 = 卖）不在本区域，由全局审核负责。
   - **建议：本区域不翻转。** 理由是这里的颜色表达的是估值高低，不是涨跌，而且和中文读者熟悉的估值温度计配色一致：蛋卷、且慢等指数估值表用绿 = 低估、黄 = 正常、红 = 高估。持有人表的买卖标签继续保持中性色，不要上红绿，避免中美两套涨跌习惯的冲突。
2. **投资人名字的显示方案**
   - A. 只显示人名（英文页现状）。
   - B. 只显示机构名（与 SEC、彭博一致）。
   - C. 有代表人物的显示人名，机构主导的显示机构名；中文只在有公认译名时用中文全名，否则用英文。
   - **推荐 C。** 它保留了“超级投资者 = 人”的产品定位，同时消除三套写法混排的问题。需要在 `managers.json` 里给每位投资人标一个 `display: "person" | "firm"`，并删掉只写姓的中文音译回退。
3. **中文页金额单位**：继续用 `$xB`，还是改成「亿 / 万美元」。**推荐改成亿 / 万美元**，因为这是中文财经媒体和券商研报的通用写法，B 区第一轮的成品句也已经这样写。
4. **重开 README 第 7 节之外的一项术语**：持仓变动用「新进 / 增持 / 减持 / 清仓」还是「新进 / 加仓 / 减仓 / 清仓」。**推荐前者**，理由见发现表。

## 5. 第一轮 P0 在本区域仍存在（不展开）

- `stockCopy.ts:11-24` 列名仍是「持有机构数 / 按持有机构数」，列表页、选股器、conviction 视图都能看到。
- `stocks/page.tsx:42-47` SEO 标题仍是「个股 · 最多人持有」/ "Stocks · Most held"，描述里仍有「顶级投资者」。
- `[ticker]/page.tsx:121/123` 标题仍是「…股票 — 谁在持有」/ "…Stock — Who's Holding"。`:113/114` 描述中文名两侧仍有空格（「最大持有人 布卢姆斯特兰」）。
- 持有人表标题仍是「持有该证券的超级投资者」/ "Superinvestors Holding This Security"。
- 共同持有区仍是「…的这些人还共同重仓 →」，量词仍是「3 人」。
- 选股器 SEO 仍是「个股 · 按价值带」「位置观察」/ "Observational, not advice"。列名「位置 / Position」仍在。en tab 仍是 "Most-held · by value"（zh 已改为「多人持有 · 按估值」）。
