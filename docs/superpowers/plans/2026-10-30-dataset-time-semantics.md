# Dataset 时间语义修复计划

> 本次按用户已给定的修复原则直接实施，使用 executing-plans 在当前会话执行；完工后独立 code review，通过后推送并创建到 db-foundation 的 PR。

**Goal:** 让 13F Dataset 如实描述实际表格的离散季末快照，并区分报告期、来源提交日和本站修改时间。

**Architecture:** 从实际非清仓持有人行推导快照日期；用最早/最晚季末作 ISO 区间边界，description 逐一列出观察日期、缺失期和比较基准，明确区间并非连续观测。单季只标季末。任一行报告期未知时省略整体覆盖期，保留已知日期说明。SEC 提交日放进 isBasedOn CreativeWork.datePublished。无可信本站内容修改时间则省略可选 dateModified/lastmod。

**Tech Stack:** Next.js 16.2.6 / TypeScript / tsx check scripts。

**Spec:** 当前会话用户委托的四项原则；不改比较季度/买卖动作，不执行生产 DDL、写入、工作流或部署。

## Review Focus

- 单季/混季/非相邻季：只从真实持有人行推出日期，不填补间隔或借用清仓者日期。
- 空值/非法日期/较旧申报：不虚构完整覆盖；保留已知快照说明。
- 基准季切换：覆盖期不随比较基准变动，说明中的基准独立更新。
- 旧季更正及不变内容重跑：来源提交日可变，dateModified 始终不从该日期、computed_at 或当前请求推导。
- 整页含价格和估值：13F 提交日不可充当页面 lastmod；编辑文章/定稿季报的可信日期仍保留。

## Tasks

- [x] 写失败测试：Dataset 快照语义、来源信息、未知数据、切季、旧季更正、重跑稳定性，以及 sitemap 动态数据页不含假修改日。
- [x] 实现共享时间/来源辅助函数；接入个股实际持有人行与投资人 latest filing；在正文呈现同源时间说明。
- [x] 去除动态数据页 sitemap 与列表 CollectionPage 中用 filedAt/报告期冒充的修改日，保留文章/季报的记录。
- [x] 跑相关 check、TypeScript、lint 和同源 SSR 页面验证；记录官方定义、当前线上抽样与持久化字段审计。
- [x] 独立 code review，无阻塞发现；按授权进入推送/创建 PR 步骤（不合并）。
