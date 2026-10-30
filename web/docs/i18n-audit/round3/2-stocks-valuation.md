# 第三轮：股票列表、筛选器与个股估值

## 审核口径与覆盖

- 日期：**2026-10-30**，HTTP 采集时间 **23:41:41–23:42:16 香港时间**。生产域名 `https://thecompounder.fyi`；部署标识由主审核提供：`dpl_9sJPURQRzK77RZZDD1eBaZ6n5omA`，21:22 香港时间上线。
- 源码：`b6aebf2c8d51d92907be60ab7ea7f45340bd689c`，工作目录 `/Users/junlinzhu/Desktop/TheCompounder/ny-fed-monitor-i18n`，已用 `git rev-parse HEAD` 核对。
- 依据：第二轮 `2-stocks.md` / `3-valuation.md` / `README.md` 与 `web/docs/copy-voice.md`。本报告不假设第二轮的待决策项已实施；已修项单独核销。
- 方法：Python urllib 读取正式站 HTML，解析主内容、标题、属性与链接，再对应当前源码。**未使用浏览器**；移动布局、交互、实际辅助技术输出由主审核集中验证。股票列表是客户端表格，HTTP 主内容中的目录可核对，列表排序后的行序与搜索交互不能凭 SSR 占位符判通过。
- 证据：`/tmp/compounder-i18n-round3-20261030/stocks/` 中保存每个 URL 的 `.html`、`.json`（抓取时间/HTTP 日期/标题/链接）、`.txt`、`.body.txt`。实际采集 URL 均追加 `tc_internal=1`，不向分析系统混入审核流量。
- 下列金融数字**仅为界面文案样本**，不是估值或研究结论；没有独立复核其财务真值。样本页面标注的行情日为 **2026-10-29（Yahoo Finance）**；13F 主季度为 **2026-06-30**，部分持有人行另标 **2026Q3**。DECK/JPM/BRK.B 的估值 TTM 为 **2026-06-30**，CMCSA 为 **2026-09-30**，PDD 年报期为 **2025-12-31（SEC 20-F，2026-04-29 提交）**。FRED 利率日期按页面保留为 2026-10-27 或 2026-10-28，不把抓取日期当作数据日期。

以下均在 **2026-10-30** 抓取，36 个 URL 全部返回 HTTP 200。表中每一项同时覆盖英文路径与 `/zh` 路径：

| 路径（省略主域名） | 查询组合 | 核对范围 |
|---|---|---|
| `/stocks`、`/zh/stocks` | 无；`?sort=value`；`?q=AAPL`；`?sort=holders&dir=asc` | 页面说明、目录、元信息；客户端行序留给浏览器验证 |
| `/stocks/screener`、`/zh/stocks/screener` | 无；`?sort=holders` | all 视图、默认安全边际排序、持有机构数排序 |
| 同上 | `?view=strike_zone`；`?view=strike_zone&sort=holders` | 击球区两种排序 |
| 同上 | `?view=below`；`?view=below&sort=holders` | 低于内在价值两种排序 |
| 同上 | `?view=conviction`；`?view=conviction&sort=holders` | 多人持有视图；此视图本来不提供排序切换，额外 sort 参数不代表另一种有效排序 |
| `/stocks/{ticker}`、`/zh/stocks/{ticker}` | AAPL、DECK、PDD、JPM、BRK.B、CMCSA | 正常估值、高估、盈利下滑、缺增长证据、ADR、银行、SOTP、杠杆溢价与折叠方法说明 |

**覆盖限制：筛选器所有视图均为空表。** 线上只能验证空态、视图和排序链接的文字，无法实测筛选器行内价格、价值区间、单法星号、持有人数排序结果。主审核已用浏览器确认 `/zh/stocks/screener?tc_internal=1` 同样没有表格，不是 urllib 忽略脚本导致的假空态。下文明确区分“线上复现”与“仅代码发现”。

## P0

本抽样没有确认新的 P0。第二轮的“股价取整”“持仓市值表头歧义”已不在详情样本复现，见核销表；不沿用旧分数或把旧 P0 原样重新计数。

## P1：影响金融含义或对数据状态的理解

### S1 · 估值折叠仍直出英文引擎说明与内部代号

**线上复现（2026-10-30）：** [中文 DECK](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1)、[中文 PDD](https://thecompounder.fyi/zh/stocks/PDD?tc_internal=1)、[中文 JPM](https://thecompounder.fyi/zh/stocks/JPM?tc_internal=1)、[中文 CMCSA](https://thecompounder.fyi/zh/stocks/CMCSA?tc_internal=1) 及各自英文页。展开“方法与数字”对应的 HTML：

- DECK 中文：`Graham earnings-power value (normalized NOPAT)`；`v1 简化：Maintenance capex (degraded) deducted in full cash (write A)`。
- DECK/PDD/JPM/CMCSA 中文：`AV_conservative`、`AV_reproduction`、`股数 diluted`；DCF 段尾 `matching the engine owner-earnings lamp`。
- CMCSA 中文另见 `audit #2`、`MM Proposition II`；中文原生说明和英文引擎段落连在一起。
- JPM 中文：`Operating income is not reported separately ... the unlevered NOPAT lens does not apply.`；PDD 中文：`增长价值无法评估 — Current comparable financial evidence is incomplete.`。

**位置：** `web/src/components/valuation/EarningsPowerFloorCard.tsx:335`（lamp label）、`:338`（不可评估原因）、`:341`（earnings/leverage/discount/bridge）、`:347`（v1 和 simplifications）、`:357`（growth-value reason）、`:803`（earnings basis）、`:850`（asset basis）、`:855`（moat basis）、`:864`（tax/share basis）、`:872`（DCF notes）、`:878`（high leverage note）。

**影响：** 核心方法说明在中文页仍不可读；英文页也暴露实现版本、审计编号和变量名。不能把它们视为少量保留专业缩写。此次代码的新结构化增长警示已有中文，但没有覆盖旧 engine prose，因而 #258 后仍不能核销整项。

**推荐成品与落地边界：** 展示层按结构化原因和数字生成双语说明，不对任意英文字符串做不完整替换；移除 `v1`、`write A`、`audit #2`、`engine lamp`。例如：

- zh：`盈利能力价值（EPV，正常化税后经营利润）`；`所有者盈利价值（零增长参考）`；`模型简化：维持性资本开支按现金全额扣除，未计营运资本变动；股权激励保留为费用。`
- en：`Earnings power value (EPV, normalized NOPAT)`；`Owner-earnings value (zero-growth reference)`；`Model simplifications: maintenance capex is deducted in cash; working-capital changes are excluded; stock-based compensation remains an expense.`
- zh：`因缺少可比营业利润资料，无法计算增长价值。股数口径：摊薄股数。` / en：`Growth value is unavailable because comparable operating-income data are missing. Share basis: diluted shares.`
- 资产测试两种口径可写 `保守资产价值（有形净资产加资本化研发）` / `Conservative asset value (tangible net assets plus capitalized R&D)`，另一口径按其真实构成解释，不向用户展示 `AV_*`。

### S2 · PDD 以 ADS 归一化，却仍标 `/股`、`/sh`

**线上复现（2026-10-30）：** [中文 PDD](https://thecompounder.fyi/zh/stocks/PDD?tc_internal=1)：`Graham ... $75.85–$90.37 / 股`、`= $43.62 / 股`；[英文 PDD](https://thecompounder.fyi/stocks/PDD?tc_internal=1) 同处 `/ sh`。两个页面正文均未解释 ADS 或比例。行情样本为 Yahoo Finance 2026-10-29，财报为 SEC 20-F 2025-12-31。

**位置：** `web/src/app/[lang]/stocks/[ticker]/page.tsx:443` 读取 ADR/ADS 元数据并做归一化；`web/src/lib/valuation/adsNormalization.ts:1` 明确引擎除以每 ADS 普通股比例；`EarningsPowerFloorCard.tsx:125`、`:180` 固定单位，`:336`、`:850` 渲染。筛选器也固定 `价值区间 / sh`（`ScreenerTable.tsx:74`），但因全表为空，后者**仅代码发现**。

**影响：** ADS 与普通股被混用，可能把跨上市地比较的单位理解错。缺增长证据的分支仍有零增长参考，不能因为主估值隐藏而忽略单位。

**推荐成品：** 把 security unit 与可信 ratio 传到所有每份证券的数值组件。

- zh：`每 ADS 零增长价值 $76–$90`；en：`Zero-growth value: $76–$90 per ADS`。
- 首次出现：zh `1 ADS = {ratio} 股普通股`；en `1 ADS = {ratio} ordinary shares`。比例必须来自当前可信元数据，本轮未独立核验具体比例，不把旧报告的 1:4 当最新事实。
- 普通股保留 `美元/股` / `USD/share`，ADR 用 `美元/ADS` / `USD/ADS`；混合筛选表在行内显示单位或在证券旁做明确标记，不用整列 `/sh` 覆盖两类证券。

### S3 · 银行有形净资产仍被称作“重置价值”

**线上复现（2026-10-30）：** [中文 JPM](https://thecompounder.fyi/zh/stocks/JPM?tc_internal=1)：`所有者盈利 DCF $215.47–$392.68 · Greenwald 零增长 $246.06 · 重置 $118.99`；`重置价值 = 有形净资产 3210亿美元 = $118.99 / 股`。紧随英文计算定义为 `shareholders' equity − goodwill − intangibles, ÷ diluted shares`。[英文 JPM](https://thecompounder.fyi/stocks/JPM?tc_internal=1) 写 `Reproduction value`。页面所用 TTM 截至 2026-06-30。

**位置：** `EarningsPowerFloorCard.tsx:835`、`:846`、`:855`；已有 `floor.is_financial` 可区分银行分支，但这几处未分支。

**影响：** 显示的数是每股有形净资产，却被套上非金融企业重置资产的术语；护城河说明继续称 reproduction test，造成方法对象错位。

**推荐成品：** 银行分支写 zh `每股有形净资产（TBVPS）$119`，en `Tangible book value per share (TBVPS): $119`；解释写 zh `股东权益扣除商誉及其他无形资产，再除以摊薄股数。` / en `Shareholders' equity less goodwill and other intangible assets, divided by diluted shares.`。护城河比值说明同步明确为 `盈利能力价值 / 有形净资产` / `Earnings power value / tangible book value`。是否改变银行估值模型属于独立产品/研究决策，本项只确认当前标签与当前公式不对应。

### S4 · TTM 年仍在研发资本化行伪装成 FY

**线上复现（2026-10-30）：** [中文 DECK](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1) 同一折叠区分别写 `年份：TTM 2026-06-30, 2024, 2023, 2022, 2021` 与 `资本化研发 1.3亿美元（FY 2026, 2024, 2023, 2022）`；[英文 DECK](https://thecompounder.fyi/stocks/DECK?tc_internal=1) 也输出 `（FY 2026, ...）`。财报来源行明确是 SEC 10-K + 10-Q，截至 2026-06-30。

**位置：** `EarningsPowerFloorCard.tsx:325` 已有 `yearsUsedText` 将窗口首项标成 TTM；`:848` 却直接拼 `rd_years_used` 为 FY；`:870` 还会拼出 `OE FY TTM ...`。

**影响：** 财年与滚动十二个月是不同期间；相邻行用两种标签称呼同一合成期。年份跳号也没有解释，易被读成丢了一年。

**推荐成品：** 保留真实期间并共用格式器；zh `资本化研发：1.3亿美元（截至2026年6月30日的最近十二个月及 FY2022–FY2024）`；en `Capitalized R&D: $130M (TTM to Jun 30, 2026 and FY2022–FY2024)`。列表应由实际 `rd_years_used` 生成，示例不是硬编码范围。`OE FY TTM` 改为 `所有者盈利所用期间：...` / `Owner-earnings periods: ...`。

### S5 · 反向 DCF 把隐含所有者盈利增速与历史营收直接判高低

**线上复现（2026-10-30）：** [中文 JPM](https://thecompounder.fyi/zh/stocks/JPM?tc_internal=1)：`现价把公司未来几年的所有者盈利年增速定在 6.8%；公司过去营收年增 10.4%（2020–2025 年化）。低于它自己做到过的。`；[英文 JPM](https://thecompounder.fyi/stocks/JPM?tc_internal=1) 对应 `Below what it has already done.`。行情为 2026-10-29，历史区间为页面所列 2020–2025。

**位置：** `web/src/components/valuation/PriceBetBlock.tsx:35`、`:40`、`:55`、`:59`。

**影响：** 两个指标不同，不能用“自己已经做到过”将它们写成同口径历史验证。增加年份区间修复了期间披露，但没有修复指标错位。

**推荐成品：** 优先用历史所有者盈利增速作同口径比较。若仍用营收，删除胜负式结论，写 zh `反向 DCF：现价隐含所有者盈利年增约6.8%。历史营收年化增长10.4%（2020–2025）；两者口径不同，仅供对照。`；en `Reverse DCF: the price implies about 6.8% annual owner-earnings growth. Revenue grew 10.4% annually in 2020–2025; the measures differ and are shown for context.`。`再增长约7年` 也应明确是“假设所有者盈利按该营收增速增长”的模型情景。

### S6 · 筛选器空态把结果不可用与“没有机会”写成同一状态

**线上复现（2026-10-30）：** [中文 all](https://thecompounder.fyi/zh/stocks/screener?tc_internal=1) 和[英文 all](https://thecompounder.fyi/stocks/screener?tc_internal=1) 及 strike_zone / below 的全部排序组合均没有表格，分别写 `当前没有已确认的击球区股票`、`当前档暂无可估值股票。`、`估值刷新中` / `No valued stocks are confirmed in the strike zone right now`、`No valued stocks in this view yet.`、`Valuation refreshing`。[中文 conviction](https://thecompounder.fyi/zh/stocks/screener?view=conviction&tc_internal=1) 写 `0 只被 5+ 位机构共同持有的股票`；英文为 `0 stocks held by 5+ managers`。

**位置：** `_screenerPage.tsx:89`–`:100`、`:192`；`stockCopy.ts:40` / `:55`。数据层 `valuationSnapshot.ts:302`、`:349`、`:405`、`:444`、`:484` 把无环境、查询失败、当前模型无快照、快照不匹配、过滤后空结果归入相同输出形状；conviction 的 heldTotal 实际是匹配当前可展示估值的行数，不是所有“5+人持有股票”的总数。

**影响：** 当前线上可观察事实是“没有可展示结果”；不能据此断言数据库故障，也不能据此断言市场没有符合条件的股票。“刷新中”还暗示有正在运行的刷新任务，代码没有提供该事实。

**推荐成品：** 数据契约区分 `empty_result` 与 `missing_or_current_model_unpublished` / `unavailable`，再决定计数和空态；不可用时不报市场零数量。

- 尚无当前结果：zh `当前模型的估值结果尚不可用，暂无法展示筛选名单。可先查看个股页。`；en `Results for the current valuation model are not available yet. Browse individual stock pages in the meantime.`
- 读取失败：zh `暂时无法读取估值结果，请稍后重试。`；en `Valuation results are temporarily unavailable. Please try again later.`
- 真实空筛选：zh `按{价格日期}的收盘价，当前没有符合此筛选条件的股票。`；en `No stocks match this view using closing prices from {date}.`
- conviction 的可用结果计数：zh `{n}只由至少5位机构持有、且有当前可用估值的股票`；en `{n} stocks held by at least 5 managers with a current valuation available`。

## P2：标签、精度和阅读一致性

下表“线上”观察日期均为 **2026-10-30**；引用 URL 均保留 `tc_internal=1`。仅代码发现的行不计为本轮线上复现。

| ID / 状态 | 原文、影响及源码定位 | 推荐中文 / 英文成品 |
|---|---|---|
| S7 · 线上 · SOTP扣减与单位 | [BRK.B中](https://thecompounder.fyi/zh/stocks/BRK.B?tc_internal=1) `减：递延所得税` 配 `−$20.67`；[英文](https://thecompounder.fyi/stocks/BRK.B?tc_internal=1) `Less: deferred tax` 配 `−$20.67`。列名只有悲观/基础/乐观，没有每股单位。`stocks/[ticker]/page.tsx:872`、`:898`–`:900`，`stockCopy.ts:101` / `:165`。双重扣减措辞在财务表里含混，表外的“每股中枢”不能替代表格单位。 | 保留减字则数字用正值：`减：递延所得税 $21` / `Less: deferred tax $21`；或标签去减字、保留负号。表格注明 `每股估值（美元）` / `Value per share (USD)`。 |
| S8 · 线上 · 估值精度仍两套 | [DECK中](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1) 头条 `$66`，折叠 `$58.89–$74.46`；[BRK.B中](https://thecompounder.fyi/zh/stocks/BRK.B?tc_internal=1) 头条 `$496.25`、刻度区间 `$458–$534`。`EarningsPowerFloorCard.tsx:13`、`:26` 与 `stocks/[ticker]/page.tsx:721`、`:887`。现价两位是正确的；估计值到美分仍有虚假精确和展示漂移。 | 现价固定两位；每股/ADS估值≥$10取整、<$10两位；`所有者盈利 DCF $59–$74` / `Owner-earnings DCF $59–$74`；SOTP `每股中枢 $496` / `Base value $496/share`。若有意保留计算明细美分，应明确标“计算明细”而统一头条规则。 |
| S9 · 线上 · 筛选器H1及方法名 | [中](https://thecompounder.fyi/zh/stocks/screener?tc_internal=1) H1仍 `个股`，[英](https://thecompounder.fyi/stocks/screener?tc_internal=1) `Stocks`；中文页脚 `Owner-Earnings DCF 两法夹逼`，与详情“所有者盈利 DCF”不同。`_screenerPage.tsx:119`、`:192`，`stockCopy.ts:39` / `:54`。筛选器与持仓规模列表难区分，“两法夹逼”又忽略单法行。 | H1 `估值选股器` / `Valuation screener`；方法 `方法：Greenwald 估值与所有者盈利折现；单法结果另行标注。` / `Methods: Greenwald valuation and owner-earnings DCF; single-method results are marked.` |
| S10 · 线上文案 + 代码确认 · 排序说明不随sort变化 | [按机构数中文](https://thecompounder.fyi/zh/stocks/screener?sort=holders&tc_internal=1) 选中“按持有机构数”，intro仍 `安全边际高者在前`；[英文](https://thecompounder.fyi/stocks/screener?sort=holders&tc_internal=1) `deepest margin of safety first`。`_screenerPage.tsx:131`–`:132`；真实排序函数 `screenerSort.ts:14` 为持有人数降序、并列再按安全边际。空表下没有可验证行序，只确认描述与所选排序契约冲突。 | holders时写 `按持有机构数从多到少排列；人数相同则按安全边际排列。` / `Ordered by holder count, then by margin of safety.`；默认保留安全边际描述。 |
| S11 · 线上 · 中文目录名漏本地化 | [中文列表目录](https://thecompounder.fyi/zh/stocks?tc_internal=1) `AAPL Apple Inc`、`PDD PDD Holdings Inc`，而[详情](https://thecompounder.fyi/zh/stocks/PDD?tc_internal=1) H1为 `拼多多 PDD Holdings Inc`。`stocks/page.tsx:90` 目录note仅cleanIssuer；结构化数据`:120`却已用stockDisplayName。表格EntityName已修好，不把整张表漏lang再报一次。 | 目录同样调用stockDisplayName：`AAPL 苹果 Apple Inc` / `AAPL Apple Inc`；`PDD 拼多多 PDD Holdings Inc` / `PDD PDD Holdings Inc`。 |
| S12 · 线上HTML属性 · 价格游标title误用日期标签 | [DECK中](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1) `data-price-marker`的title为 `价格截至 $82.76`；[英文](https://thecompounder.fyi/stocks/DECK?tc_internal=1) `Price as of $82.76`。`EarningsPowerFloorCard.tsx:485` 把priceAsOf与金额拼接。日期标签后接金额，hover/潜在辅助技术说明无意义。本轮只确认HTML属性，没有声称已实测读屏输出。 | 仅表达值：`现价 $82.76` / `Price $82.76`；或传入日期后写 `现价 $82.76，截至2026年10月29日` / `Price $82.76 as of Oct 29, 2026`。 |
| S13 · 主审核浏览器补证；跨区引用，不重复计数 · 中文排序可访问名称 | 本分区源码发现：`StocksTable.tsx:138`、`:153` 两处DataTable未传sortAscLabel/sortDescLabel/sortGroupLabel；默认在`DataTable.tsx:81`–`:83`为 `sorted ascending` / `sorted descending` / `Sort`。主审核2026-10-30在[中文列表](https://thecompounder.fyi/zh/stocks?tc_internal=1)浏览器AX确认 `持有机构数 sorted descending`、移动端group `Sort`，另有清除搜索按钮 `Clear search`。浏览器辅助树与详细证据归主审核全局工程报告。 | 调用方传 `升序` / `降序` / `排序` / `清除搜索`；en `Sorted ascending` / `Sorted descending` / `Sort` / `Clear search`。不是翻译aria-sort规范值，规范值应保留ascending/descending。 |
| S14 · 仅代码发现 · NCAV中文仍有口径歧义 | 六只样本没有触发net-net提示，**无本轮线上复现URL**。`EarningsPowerFloorCard.tsx:181`–`:184`仍写 `每股净流动资产`；`netNet.ts:47`实际是流动资产减全部负债，另扣优先股。不能核销第二轮此项。 | 首次写 `每股净流动资产价值（NCAV：流动资产减全部负债，并扣除优先股账面值）` / `Net current asset value per share (NCAV: current assets less all liabilities and preferred stock)`；后续简称NCAV。保留“深度折价也可能伴随经营困境”的风险说明。 |
| S15 · 线上 · 生意质量期间标签不够明确 | [DECK中](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1)：`截至2026-03-31`、`营收年化增速（2020–2025）`、`营收... · 2021–2026`，另插`估值口径：...TTM 2026-06-30`。[CMCSA中](https://thecompounder.fyi/zh/stocks/CMCSA?tc_internal=1)同区同时标FY截至2025-12-31与估值TTM2026-09-30。`businessQuality.ts:55`从period_end取历年，`stocks/[ticker]/page.tsx:540`增速用fiscal-year序列，`:927`、`:934`标两种截止。这里不判财务数据错误，只确认期间口径未说明。 | 年报指标明确 `最新完整财年（截至{date}）` / `Latest full fiscal year (ended {date})`；轨迹用实际FY而非期末历年，或明确 `按报告期末年份列示` / `Years refer to reporting-period ends`；TTM只写为另一个估值口径。 |

## 已修核销与不再重复报告

线上核销日期均为 **2026-10-30**；价格仅作UI样本。筛选器空表限制仍适用。

| 第二轮项目 | 本轮结论 / 证据 |
|---|---|
| 详情股价取整 | **已修。** [DECK](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1) `现价$82.76`；[AAPL](https://thecompounder.fyi/stocks/AAPL?tc_internal=1) `$348.91`，未取整。筛选器`ScreenerTable.tsx:100`已用fmtPrice，但线上没有数据行，因此筛选器精度只核对代码，不称在线通过。 |
| “市值”被读成公司总市值 | **详情已修。** [AAPL中](https://thecompounder.fyi/zh/stocks/AAPL?tc_internal=1)表头`持仓市值（美元）`、`持股数（股）`；[英文](https://thecompounder.fyi/stocks/AAPL?tc_internal=1)仍为Value/Shares。股票表代码也已使用“合计持仓市值（美元）”；真实客户端表由主审核核对。 |
| 中文金额、季度、极小占比 | **本抽样已修。** [DECK中](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1) `1.62亿美元`、`2026Q2`、`<0.1% → <0.1%`，不再$161.9M、Q2 2026、0.0%→0.0%。 |
| 13F动作混用新建/加仓/减仓 | **本抽样已修。** [PDD中](https://thecompounder.fyi/zh/stocks/PDD?tc_internal=1)首屏、表格和文字说明统一`新进 / 增持 / 减持 / 清仓`。不再重复旧动作术语问题。 |
| 价值带位置与内在价值关系冲突 | **本抽样已修。** [DECK中](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1)刻度盘`区间内`，正文明确`落在价值区间内，高于内在价值（约$66）`；不再把低于IV等同低于区间。 |
| “含增长中枢内在价值”头条 | **已修。** [AAPL中](https://thecompounder.fyi/zh/stocks/AAPL?tc_internal=1)头条`内在价值`，不再显示旧长标签。 |
| “零增长基准”重复显示 | **已修原先的重复项。** [DECK中](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1)折叠不再重复`零增长基准`，而注明Greenwald零增长与所有者盈利DCF。不同方法仍有不同零增长数值，须按方法名理解；本轮不把旧重复数字P0重报。 |
| 反向DCF“1 more years” | **代码已修，未在线命中1年样本。** `PriceBetBlock.tsx:64`已按n===1选择year/years。指标可比性仍见S5，不能由单复数修复而一并核销。 |
| screener按收盘价日期而非computedAt | **代码已修，线上无法核销。** `_screenerPage.tsx:82`从priceDate取asOf，`:123`调用valuationAsOfText；当前空态没有行情日期。 |
| 表格/共同持有公司名漏lang | **代码已修这些调用点。** StocksTable/ScreenerTable的EntityName已传lang；[DECK中](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1)共同持有显示`微软 Microsoft Corp`、`谷歌 Alphabet Inc Class A`。目录剩余遗漏单列S11。 |

## 尚待产品决策或后续验证

1. **投资人显示名政策尚未统一实施。** 2026-10-30 [DECK中](https://thecompounder.fyi/zh/stocks/DECK?tc_internal=1)仍有“布卢姆斯特兰 / 艾因霍恩 / 达利欧 / 格兰瑟姆”，[PDD中](https://thecompounder.fyi/zh/stocks/PDD?tc_internal=1)有“道奇考克斯 / Norbert Lou / Sarah Ketterer”。`aliases/config.ts:62`–`:69`仍可回退别名首词。建议延续第二轮D4：有通行中文名用完整人名，机构主导用机构名，无通行译名用英文全名；不要把历史建议当已落地。此项跨投资者分区统一治理，不在本报告另计重复高优先级。
2. **持有人数量的“人/机构”口径**仍是产品约定：股票列表/筛选器用“持有机构数”，详情用“位/人”。`stockCopy.ts:3`–`:7`显式如此设计。更准确的共同口径可为“追踪投资者/申报机构”，但需统一实体模型；本轮不凭语言偏好宣称数据库计数错。
3. **ADR显示单位、银行资产锚名称**的当前问题可直接按真实计算口径改文案（S2/S3）；若要改变计量口径或估值模型，则是另一个需研究论证的决策。
4. **颜色**：本区当前是估值高低颜色，而非价格涨跌；无证据支持为中文直接翻转。继续保留第二轮待决策状态，不把`--val-below`、`--val-above`当涨跌色。
5. **没有核销的线上交互**：股票列表搜索/翻页/升降序、语言切换是否保留query、移动端排序控件、筛选器恢复数据后的行内单位与pending/single-method星号、真实读屏输出，由主审核浏览器证据补齐（排序AX漏译已补证，见S13；移动端375px宽度下414px溢出由主审核布局报告归档，不在本分区重复计数）。S14的NCAV触发需另选确实命中的股票再做线上回归，不能由当前六只样本推出全站通过。
