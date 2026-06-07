# 个股外部数据出口 (Per-Ticker External Finance Links) — 设计

- 日期: 2026-06-07
- 状态: 已确认设计,待写实施计划
- 分支: feat/homepage-redesign

## 1. 目标与定位

为每只股票提供通向大厂深度数据的出口,弥补本站基于免费基建、无法自建丰富个股数据(行情/K线/财报原文)的现实。

- **主要价值: UX**。诚实地把用户一键导向权威深度数据,留住对本站的信任,符合"忠于复利品牌"的约束。
- **次要价值: SEO**。指向权威相关来源的出站链接是一个轻微的内容可信度信号。
  - 明确认知: 出站链接**不会**提升本站自身权重(PageRank 是传出而非收进),涨权重靠的是入站链接。因此 SEO 不是主要动机,只是顺带收益。

## 2. 链出目标 (3 个)

| 站点 | 用途 | URL 模板 |
|---|---|---|
| Yahoo Finance | 行情/K线/新闻 | `https://finance.yahoo.com/quote/{TICKER}` |
| Google Finance | 行情/搜索 | `https://www.google.com/finance/quote/{TICKER}:{EXCHANGE}`(见降级规则) |
| SEC EDGAR | 官方申报原文 | `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&ticker={TICKER}&type=10-K&count=40` |

### Google Finance 交易所降级规则
Google Finance 必须带交易所后缀,否则 404。`securities.exchange` 在部分 cusip 上缺失或为泛代码(如 `"US"`)。

- 维护一个小的交易所归一化映射,把已知值映射到 Google 兼容代码:
  - OpenFIGI `UW` / `UQ` / `NASDAQ` → `NASDAQ`
  - OpenFIGI `UN` / `NYSE` → `NYSE`
  - 其他/缺失/无法映射 → **降级**为 `https://www.google.com/search?q={TICKER}+stock`
- 目标: Google 链接**永不拼出 404**。

### Ticker 归一化
- URL 中的 ticker 用规范化形式。注意双类股: 数据库存 `BRK.B`。
  - Yahoo 用 `-`(`BRK-B`)。
  - Google Finance / SEC 按各自接受格式处理(SEC EDGAR ticker 查询大小写不敏感,点号需在构造时校验)。
- 在 `buildExternalFinanceLinks()` 内集中处理 per-站点的 ticker 形态,调用方不关心。

## 3. 视觉规范

- 三个图标横排,统一尺寸,**统一低调灰**(复用现有次要文字色)。
- hover 时单个图标亮回品牌色:
  - Yahoo 紫 `#6001D2`
  - Google 蓝 `#4285F4`
  - SEC 维持深灰(无品牌色)
- 无文字标签;每个链接带 `title` + `aria-label`(如 `View AAPL on Yahoo Finance`)。
- 所有链接: `target="_blank"` + `rel="noopener noreferrer"`。
- 暗色主题适配(站点为深色背景)。

### 两个使用位置 (variant)
组件 `ExternalFinanceLinks` 提供 `variant: "table" | "detail"`,两处复用。

**A. 列表 table(`/[lang]/stocks`)** — `variant="table"`,紧凑
- 在 table 最右侧新增一窄列(表头留空或极轻标注)。
- 每行放紧凑三图标簇(尺寸约 14–16px)。
- **桌面端: 默认极低调(低 opacity,近乎隐形),鼠标悬停该行时整簇提亮**(opacity → 满)。用行级 group-hover 实现。
- **移动端 / 触屏(无 hover): 常驻可见,保持低调灰**。
- 目的: 密表保持干净,不 hover 时不抢视线。

**B. 详情页(`/[lang]/stocks/[ticker]`)** — `variant="detail"`,标准
- 放入 Key Facts 行(现价/代码/持有人数/合计市值/最大持有人)作为**最后一个 cell**,标题"外部数据"。
- 图标标准尺寸(约 18px),常驻可见,统一灰,hover 亮回品牌色。

## 4. 图标来源(零新依赖)

- **Yahoo / Google**: 从 Simple Icons 拷 SVG 路径,内联成两个本地组件 `YahooIcon.tsx` / `GoogleIcon.tsx`,`fill="currentColor"`,颜色由 CSS 控制(灰/品牌色)。CC0 许可,免费;链到对方官网属指明性合理使用。
- **SEC**: 用已装的 `lucide-react` 的 `FileText`(SEC 无品牌 logo,这是现实,任何主流库都没有)。

## 5. 数据接入

- 详情页与列表页需要每个 ticker 的 `exchange`(目前页面未读取)。
- 加一个轻量 helper 读取 `securities.exchange`:
  - 详情页: 按单 ticker 取。
  - 列表页: 批量取(随现有 most-held 查询一并 join/select `securities.exchange`,避免 N+1)。
- 取不到 exchange 时, Google 链接走降级 URL,**不报错、不影响 Yahoo/SEC**。

## 6. 组件与文件结构

| 文件 | 职责 |
|---|---|
| `src/lib/externalLinks.ts`(新建) | `buildExternalFinanceLinks(ticker, exchange)` → `{ yahoo, google, sec }` URL;含交易所归一化映射 + per-站点 ticker 归一化 + Google 降级 |
| `src/components/icons/YahooIcon.tsx`(新建) | 内联 Yahoo SVG, `currentColor` |
| `src/components/icons/GoogleIcon.tsx`(新建) | 内联 Google SVG, `currentColor` |
| `src/components/entity/ExternalFinanceLinks.tsx`(新建) | 入参 `{ ticker, exchange, variant }`,渲染三图标行;封装 hover/品牌色/可访问性 |
| `src/app/[lang]/stocks/page.tsx`(改) | 列表查询补 `exchange`;每行渲染 `variant="table"` |
| `src/app/[lang]/stocks/[ticker]/page.tsx`(改) | Key Facts 区域渲染 `variant="detail"` |

## 7. 不做的 (YAGNI)

- 不做第三方站(Finviz / StockAnalysis / Roic.ai)。
- 不做 logo 墙、不做配置开关、不做新数据抓取(只用已有 `securities.exchange`)。
- 不在投资人页或其他列表加(仅个股列表 + 个股详情)。

## 8. 验证(本项目无测试套件,人工 + tsc)

- `tsc` 通过。
- 详情页与列表页页面观察: 三图标显示、灰/hover 品牌色、桌面 hover 提亮、移动常驻。
- 抽查几个 ticker 的三个链接实际可达(含一个 exchange 缺失的,确认 Google 走降级且不 404):如 AAPL(NASDAQ)、BAC(NYSE)、BRK.B(双类股)、以及一个无 exchange 的 cusip。
