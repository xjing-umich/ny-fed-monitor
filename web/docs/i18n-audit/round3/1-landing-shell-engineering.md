# 第三轮：Landing、全站外壳与工程边界

审核日：**2026-10-30（香港时间）**。正式站 [thecompounder.fyi](https://thecompounder.fyi)，生产提交 `b6aebf2c8d51d92907be60ab7ea7f45340bd689c`。HTTP 证据采集 23:42；浏览器补验约 23:43–23:50。报告只记录检查与建议，没有修改产品代码。

## 方法和边界

HTTP 抓取首页、stocks、screener、investors、learn、about、terms、privacy、disclaimer 的双语版本，以及中英文不存在路径，共20次请求。另复核其他分区的 HTML 和源码。原始响应位于 `/tmp/compounder-i18n-round3-20261030/shell/`，可保留的 URL、状态和时间清单见 [coverage.json](coverage.json)。

浏览器使用正式域名及 `tc_internal=1`，核对桌面辅助树、375×812 手机视口、列表空搜索、Contact 弹窗、语言切换和404。没有提交联系表单、订阅、分享或更改线上数据。辅助树检查不是使用真实屏幕阅读器完成的听读测试。未全面检查深色模式、200%缩放、键盘焦点及性能，不对此给分。

金额、利率、季度和人数均为页面当时展示的文案样本，不是重新研究后的财务结论。以页面所列数据日期为准，不把抓取日当行情日。

## P1：首页对覆盖范围和金融含义的承诺

### H01 · 13F被写成“手里的每一股”，时点又像季末立即披露

- 线上：[中文首页](https://thecompounder.fyi/zh?tc_internal=1)、[英文首页](https://thecompounder.fyi/?tc_internal=1)，2026-10-30。原文「每季度末，13F逼这些经理公开手里的每一股」/ “Every quarter-end, a 13F forces these managers to disclose each share they own.”；旁边「上报延迟45天」/ “45-day reporting lag”。
- 位置：`web/src/components/home/StepIndex.tsx:34`、`:56`；`HeroMasthead.tsx:33`、`:50`。
- 影响：将特定范围的季末证券持仓快照扩成全部资产，同时混淆持仓日与披露日；固定45天也不是每一份申报的实际延迟。与 Learn 的 L2 是同一时点语义问题，实施时合并。
- 依据：2026-10-30重新查询 [SEC Form 13F FAQ](https://www.sec.gov/rules-regulations/staff-guidance/frequently-asked-questions-about-form-13f) 及 [Investor.gov Form 13F](https://www.investor.gov/introduction-investing/investing-basics/glossary/form-13f-reports-filed-institutional-investment)：覆盖指定13(f)证券，通常在季末后45天内提交；不是完整投资组合或实时持仓。截止日顺延等细则不在此重新制定。
- 建议正文：ZH「13F记录的是季末时点、纳入申报范围的证券持仓。我们逐季存档，方便比较持仓数量的变化。」EN “13F filings show reportable securities held at quarter-end. We archive each filing so you can compare reported holdings over time.”
- 建议时间行：ZH「持仓截至2026Q2 · 来源 SEC 13F · 季末快照，披露有延迟」；EN “Holdings as of Q2 2026 · SEC 13F · Quarter-end snapshots, disclosed with a delay”。季度来自数据，不能硬编码示例。

### H02 · 按持有人数排序，被中文称为“重仓”

- 同一首页原文：「多少只重仓落在同一张桌子上」「同一只票被越多独立经理人重仓…按持有基金数排序」。英文只说 hold，没有相同的重仓强度断言。
- 位置：`StepIndex.tsx:25`、`:26`、`:28`；数据使用 `aggregations.ts:65`、`:70`、`:77` 的独立持有人集合，没有以组合占比限定重仓。
- 影响：共同持有不等于多位投资人都将其列为重仓；机构、基金和个人主语也混用。
- 建议：ZH「哪些股票被多位投资人共同持有」「按持有人数排序，作为进一步研究的起点。」EN “Which stocks are widely held?” / “Ranked by the number of tracked investors holding each stock.” 表头统一「持有人数」/ “Holders”，不把所有申报主体都称作基金。

### H03 · “逐笔估值”“每一只都定价”超出当前可展示覆盖

- 同一首页原文：「逐笔对齐第一性原理估值」「给每一只标的定价」；英文 “Each holding checked against a first-principles valuation” / “We value every holding…”；另有「三套保守方法」「不为故事和预期付费」。
- 位置：`HeroMasthead.tsx:21`、`:39`；`StepIndex.tsx:19`–`:20`、`:41`–`:42`；首页信任说明在 `web/src/app/[lang]/page.tsx`。
- 影响：当次正式站筛选器没有可展示结果，详情又有缺证据、单法或未评估分支。模型还存在增长及其他假设。全覆盖和完全不依赖预期的承诺会掩盖这些边界。此项不认定当前缺结果的技术原因，详见 S6。
- 建议：ZH「从公开持仓，进一步查看个股估值。」「财报资料足够时，我们用盈利能力、资产和现金流估算价值区间，并列明假设与缺失数据。」EN “Go from disclosed holdings to stock valuations.” / “Where the filings support an estimate, we show a value range based on earnings, assets, and cash flow, alongside assumptions and missing data.” 方法数随实际适用分支介绍，不在首页承诺每只均完成三法。

## P2：隐藏文字、外壳与移动阅读

| ID | 当次线上证据及位置 | 影响与具体建议 |
|---|---|---|
| G01 · 中文列表的英文可访问名称 | [中文stocks](https://thecompounder.fyi/zh/stocks?tc_internal=1) 桌面辅助树为 `持有机构数 sorted descending`，手机排序组为 `Sort`。直接进入 [无匹配搜索](https://thecompounder.fyi/zh/stocks?q=ZZZQQQ_I18N_AUDIT&tc_internal=1)，可见「无匹配结果」，清除按钮却为 `Clear search`。`stocks/StocksTable.tsx:138,153` 未传完整排序文本，`common/DataTable.tsx:81`–`:83` 和 `list/ListToolbar.tsx:41` 为英文默认值。 | 调用方传「已按升序排列／已按降序排列／排序／清除搜索」。`aria-sort` 的标准值仍使用 ascending/descending，不翻译规范值。投资人列表已传中文 clear/sort 文本，不能将此漏翻扩大到所有列表。S13归入本项，不重复计数。 |
| G02 · 移动排序缺方向文本 | [中文investors](https://thecompounder.fyi/zh/investors?tc_internal=1)，375px：活动按钮只有「持仓市值（美元）」和 `aria-pressed=true`，↓处于 `aria-hidden`。`DataTable.tsx:243`–`:253`。 | 方向只靠可见箭头，辅助树没有升/降序。手机活动按钮也输出本语言sr-only方向文字。I区C01归入本项。未做真实读屏器听读。 |
| G03 · 中文长名称在手机横向溢出 | 中文stocks在375px实测 `clientWidth=375`、`scrollWidth=414`，BRK.A/B的中英文公司名与ticker使卡片变宽。`EntityName.tsx:21`–`:27` 及 `stocks/StocksTable.tsx` 的移动卡片组合。 | 原有截断类仍不足以约束该组合。中文用短展示名、保留ticker，法定全名放详情；检查外层flex/grid的最小宽度。以375px、长中英文名称、ticker和金额共同出现为验收样本。没有据此声称全部手机页面都溢出，也没有推断唯一CSS根因。 |
| G04 · Contact中文仍留半角标点 | 浏览器打开首页「联系我们」后，原文「有问题、反馈或合作意向?给我们留言,我们会尽快回复。」「称呼(可选)」。`shell/ContactModal.tsx:18`–`:25`。 | ZH「有问题、反馈或合作意向？给我们留言，我们会尽快回复。」「称呼（可选）」；成功、失败提示同批统一中文标点。API错误码已有语言映射，不再误报英文服务端错误会直接展示；未实际提交表单验证。EN可统一 sentence case 为 “Contact us”。 |
| G05 · 中文404标题仍继承英文默认值 | [中文不存在路径](https://thecompounder.fyi/zh/this-route-does-not-exist?tc_internal=1) 返回404，正文与站点导航已中文，DOM lang=`zh-CN`，但title仍为 `Compounder — Smart-money holdings × valuation`。`app/[lang]/layout.tsx:43`、`:57`；`app/[lang]/not-found.tsx`。 | 中文标题建议「页面未找到 — Compounder」，英文 “Page not found — Compounder”。DOM同时有 `index, follow` 和 Next追加的 `noindex`；因此**不报告“404被允许索引”**。原先无外壳/无lang的问题已修。 |
| G06 · 人数、共识定义与金额范围提示不足 | 首页「共识持仓1204」没有“至少2位”定义；利率有日期但没有FRED来源；投资人金额未说明是13F持仓值而非AUM。`DataStrip.tsx:63`、`:69`；`StepIndex.tsx` 投资人列表。 | ZH「至少2位共同持有 · 1,204只」/ EN “Held by 2+ investors · 1,204 stocks”；利率附 “FRED · {date}”；名单金额标题写「13F持仓市值（美元）」/ “13F portfolio value (USD)”。数字动态格式化，示例不得硬编码。首页94与全量目录97分别有资格范围，不能仅因数字不同报数据矛盾。 |
| G07 · 首页工程表达与术语不统一 | 「第一性原理估值」「按CUSIP逐票归并」「第二只眼」及Learn「读懂生意，而非代码」。位置见H03、`HeroMasthead.tsx:23`；Learn见L11。 | 主说明优先「按证券归并，比较不同投资人的持仓」，将CUSIP定义移到统计方法。价值区间/所有者盈利等术语全站统一一次，避免按页面分别决定。英文专业缩写可保留，但不等于中文必须原样直出。品牌和ticker不算漏翻。 |

## 待进一步定位：语言往返会重复锚点

2026-10-30，IAB浏览器两次复现相同序列：

1. 进入 `/zh/stocks?q=AAPL&sort=value&dir=asc&tc_internal=1#main-content`。
2. 点击EN，URL为 `/stocks?q=AAPL&sort=value&dir=asc&tc_internal=1#main-content`，搜索仍为AAPL，语言及title正确。
3. 点击中文，URL变为 `/zh/stocks?q=AAPL&sort=value&dir=asc&tc_internal=1#main-content#main-content`，查询、语言和title仍正确。

`shell/langSwitch.ts:12`–`:15` 只显式拼接一次hash；本轮未确定重复来自路由缓存、框架或浏览器环境。记录为P2候选，需在正常Chrome复核，再定位并修复；**不能把整项语言切换验收判通过，也不能把旧的“查询参数全部丢失”重新报告**。普通查询参数保留已得到本轮浏览器证据。无JS或修饰键新标签页不保留参数是当前设计边界。

## 工程检查与正面核销

- 对全部100份成功HTTP响应检查lang、canonical及en/zh-CN/zh/x-default alternate：与规范双语路径对应，无异常；查询状态canonical回基础路径。此次采集的中文sitemap条目已独立存在。正式站sitemap共2636项，本轮没有逐项访问。
- `npm run -s check:i18n-format`：退出0，`OK (138 UI files)`。当前只查部分格式函数是否传语言、无locale的toLocaleString；不覆盖静态长文、任意引擎说明和默认aria文案。
- `npm run -s ai-check`：退出0，扫描402段，0 hard / 0 soft；句长统计有提示，不能据此认定文章自然、量纲正确。未运行build或完整单测，本轮没有修改产品代码。
- 本轮确认已修：中文10年期“美债收益率”；首页/主要表格中文实体名；中文亿/万、季度、常用日期格式；买方持仓合计标签及卖方混合金额移除；中文404外壳和lang；About品牌标题重复；正常内容页的语言metadata。
- 尚未覆盖：提交型表单成功/失败实际响应、分享剪贴板、未公开动态报告、线上无法触发的数据错误/估值行分支、2636项sitemap逐URL以及全部投资人/股票实体。相关源码风险见其他分区，不能称作已在线复现。

## 修复后验收重点

先把金融标签与输入数据对象对齐，再做格式和语言润色。回归至少包括：13F历史/当前、ADR/ADS、银行、TTM与FY、无估值结果、少于5仓与零仓、中文长公司名；以及桌面/手机排序方向、清除搜索、Contact弹窗、404、带查询和hash的双向语言切换。只靠现有两条脚本会继续漏掉这些问题。
