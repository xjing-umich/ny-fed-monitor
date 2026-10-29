# 13F Dataset 时间语义验证

核实日期：2026-10-30（香港时间）。本次只修时间口径，未执行生产 DDL、生产写入、工作流或部署。

## 当前基线与线上证据

开工抓取主线为 `db-foundation@d9c92e8`；PR #251 已于 2026-10-29 22:54 香港时间合并。实施期间 #256 合并，交付前跟进最新主线。

2026-10-30 00:22 香港时间，线上 `/sitemap.xml` 提供 2,408 个证券详情语言 URL。随后重新抓取历史受影响清单的 256 个 URL，256 个均返回内容，均存在 Q3 的持有人行而 Dataset 仍写 `2026-04-01/2026-06-30`。这只是对历史清单的复核，不是新一轮全站影响统计。逐页结果见 `2026-10-30-dataset-live-recheck.json`，抓取结束于 00:27 香港时间。

## 语义与实现

本日重新核实的官方依据：

- [Schema.org temporalCoverage](https://schema.org/temporalCoverage)：内容所描述的时间，可用 ISO 日期或区间表示。
- [Schema.org dateModified](https://schema.org/dateModified)：该 CreativeWork 最近修改的时间。
- [Google Dataset](https://developers.google.com/search/docs/appearance/structured-data/dataset)：temporalCoverage 可描述观察日期或时间区间；聚合多个来源时使用 isBasedOn。
- [Google sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)：lastmod 应反映页面的重大修改，需要持续可核实。

本次的解释与取舍：13F 持仓是季末观察，不是整季每天的观察。单季写季末日期；混季写最早/最晚季末的 ISO 区间，description 和可见表格说明逐一列出真实离散观察日期，明确区间之间无连续观察，比较基准独立标明。任一真实行的报告期未知/非法时省略整体 temporalCoverage，说明已知日期和未知行数。不借用清仓者、全站最新季度、比较季度或来源提交日扩大覆盖。

个股快照与逐户回退都从最终 `holders` 推导，来源提交日通过同 slug + period 的记录关联。Dataset 不含清仓行来源。投资人 Dataset 使用其最新实际申报季末。isBasedOn 的 CreativeWork 对象保留报告期与 SEC 提交日（datePublished）；已知 accession 的投资人页仍指向该原件，个股快照缺 accession 时仍使用该经理的 EDGAR 13F 申报列表作为定位入口，不虚构 accession。

## 持久化时间字段审计

- `web/supabase/schema.sql`：13F `filings`/`holdings` 没有可信的内容修订时间；filed_at 是 SEC 来源日期。
- `web/supabase/migrations/20260620_create_consensus_stock_holders.sql`：持有人与趋势快照的 computed_at 默认 now()。
- `web/scripts/lib/computeConsensus.ts`：持有人快照在重跑时删除/重写，因此 computed_at 可在内容不变时变化。
- #255/#256 新的内容比较发布时间属于 split_adjustments 与 manager_quarter_summary 两张派生表；不覆盖个股持有人 Dataset，更不覆盖整页的价格、估值和文案。

因此先省略持仓 Dataset 的可选 dateModified；动态数据页面 sitemap 的 lastmod 与目录 CollectionPage 的同类伪修改日也省略。价格/估值页不拿另一项内容的日期充当整页修改日。文章与季报继续使用各自已有的编辑/生成/定稿记录。没有新增字段或迁移。

若日后恢复这些日期，需要在发布阶段按 Dataset/页面的实际内容规范化比较并持久化修订时间：旧季更正、持有人增删、价格/估值与文案变化均应纳入相应对象；纯请求、无内容变化的重跑不前移时间。这不在本次实现范围内。

## 验证

- 新增 `datasetTime.check.ts`：单季、混季、非相邻旧季、无记录、未知/非法报告期、来源缺失、真实切季前后、旧季更正、相同内容重跑。
- 新增 `dataset-pages.check.tsx`：真实中英文个股/投资人页面 SSR，数据读取用固定 fixture、禁止外部请求；快照与逐户回退均覆盖混季、单季、提前申报清仓不扩充范围、来源提交日缺失。
- 回退到原始 page/seo 实现运行同一页面测试，得到预期失败：原值 `2026-04-01/2026-06-30`，期望 `2026-06-30/2026-09-30`；恢复修复后通过。
- 新增 `sitemap-time.check.ts`：动态数据 URL 不含伪 lastModified；原始来源提交日变化不改整页时间；文章/季报仍有真实记录。
- 相关 seo / freshness / stockConclusion / holderTrend checks，TypeScript，设计 token 和字号检查通过。
- 改动文件 lint：投资人目录已有 `Date.now()` 的 react-hooks/purity 错误（原始 HEAD 相同错误已独立重现），本次未改该行；其余改动文件 lint 通过。

构建与独立 review 的最终结果在 PR 验证部分补充。
