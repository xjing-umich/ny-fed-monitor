# 设计：Macro 全栈清理 + 投资人别名 301

- 日期：2026-07-19
- 分支：`fix/seo-brand-consistency-alias-redirects`（从 `db-foundation` 拉出；项目惯例 PR base = `db-foundation`）
- 背景：2026-07-19 SEO 全面审计。GSC（7/10）：已收录 416 / 未收录 46；sitemap 1073 URL 已提交成功（7/12）。技术地基健康，本次处理两项收口工作。

## 目标

1. **Macro 板块全栈下线**：该板块与"超级投资者持仓 × 估值"主线定位不符，站长决定全局清理，顺带消除残留的 "Treasury Market Monitor" 旧品牌名。
2. **投资人别名 301**：`/investors/ackman`、`/investors/baupost` 等常见人名 URL 目前 404，给 76 位投资人加唯一姓氏别名 301，接住自然搜索和站外链接。

## 非目标

- 不动 Supabase 任何历史数据表（删数据不可逆；保留无成本）。
- 不动估值链路：`lib/sources/fred.ts`、`src/lib/managers/treasuryRead.ts`（实时 FRED 抓取 + `market_rates` 表 last-good 兜底）、`scripts/valuation-ingest.ts` 中的 `persistDgs10()` 调用。
- 不处理 GSC 里那 1 个"重复网页，规范网页不同"——等站长提供具体 URL 后另行处理。
- 不做外链建设（SEO_INDEXING_PLAN 任务 5，站长侧动作）。

## 关键决策（已与站长确认）

| 决策点 | 结论 |
|---|---|
| Macro 清理深度 | 全栈清理：前台页面 + API + cron + 脚本 + macro 专属 lib 全部移除 |
| 旧 /macro URL 处置 | 自然 404，Google 自行剔除；不做 301/410 |
| 清理切法 | 单 PR 一次完成，不留中间态 |
| 别名 301 机制 | `next.config.ts` `redirects()` 声明式（沿用 `/managers → /investors` 先例） |

## 第一部分：Macro 清理

### 直接删除

- `src/app/[lang]/macro/` 整个目录（page、methodology、[indicator]、Macro* 组件；en/zh 同路径一起消失）
- `src/app/api/market/`（14 个路由）、`src/app/api/ai/funding-stress/`、`src/app/api/cron/market-ingest/`
- `scripts/macro-ingest.ts` 及 `package.json` 的 `macro:ingest` 脚本
- macro 专属 lib：`src/lib/macroSnapshot.ts`、`macroResearch.ts`、`macroNames.ts`、`indicatorBlurbs.ts`、`analyzers/macroPricing.ts`、`analyzers/macroConditions.ts`
- `vercel.json` 中 `/api/cron/market-ingest` cron 条目（health-watchdog、sec-fundamentals 保留）
- `next.config.ts` 中 11 条指向 `/macro/*` 的 `LEGACY_SECTION_SLUGS` 旧跳转

### 改写引用（文件保留，摘掉 macro 部分）

- 导航：`src/lib/nav.ts`、`src/components/shell/SubNav.tsx`
- 首页：`src/app/[lang]/page.tsx`、`src/components/home/FoundationsGrid.tsx`（macro 模块/卡片）
- `src/app/sitemap.ts`：移除 `/macro`、`/macro/methodology` 两条目
- 内容与文案：`src/lib/learn.ts` 及 learn 文章内 macro 链接、`src/lib/seo.ts`、`src/lib/i18n.ts`（清 macro 文案与 "Treasury Market Monitor" 残留）
- 健康检查：`src/lib/health/gather.ts`、`checks.ts`、`checks.check.ts` 中 market 数据相关检查（health-watchdog cron 本身保留）
- 其他引用点：`src/lib/freshness/derive.ts`、`src/lib/build.ts`、`src/lib/ingestion/auth.ts`、`src/components/dashboard/SectionBody.tsx`、`src/components/common/DataStrip.tsx`
- 若发现某组件只服务 macro（如 MacroSubNav），随目录一起删

### 保留红线

`lib/sources/fred.ts`、`treasuryRead.ts`、`market_rates` 表、`persistDgs10()`。删除任何文件前先确认不在估值 DGS10 链路上。

## 第二部分：投资人别名 301

- 在 `next.config.ts` `redirects()` 追加别名映射。
- 别名来源：76 位投资人的 `person` 字段，提取**唯一姓氏**（如 ackman → pershing-square、buffett → berkshire-hathaway、tepper → appaloosa、klarman → baupost-group、burry → scion-asset-management）。
- 人工审查剔除歧义：姓氏撞名（如 smith）、与现有 slug/路由冲突、单字母或过短姓氏，一律不收。
- 每个别名覆盖两种来源形态：`/investors/<alias>`（裸，英文）与 `/:lang(zh|en)/investors/<alias>`，目标为对应语言的规范 `/investors/<slug>`，`permanent: true`。
- 实现后必须实测三种 URL 形态（裸 / `/zh` / `/en`）均 301 到正确 slug——`src/proxy.ts` 也管 `/en` 301 与裸路径 rewrite，执行顺序以实测为准；若 next.config 跳转在 proxy rewrite 之后不生效，则改在 proxy 中补一条别名映射（设计意图不变：三种形态都 301 到规范 URL）。

## 错误与边界处理

- 引用清不干净 → `tsc` 立即暴露（项目无测试套件）。
- 删除中遇到共享组件（macro 与非 macro 都用）→ 只摘 macro 分支，不删组件。
- 别名映射为空或全部撞名 → 至少保证头部 20 位知名投资人有手工别名。

## 验证清单

1. `tsc` 通过、`next build` 通过（先 `export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"`）。
2. 全局 grep `macro|Macro|Treasury Market Monitor`，src 内零残留引用（历史注释除外）。
3. 本地 dev 实测：
   - `/macro`、`/macro/methodology`、`/zh/macro` → 404
   - 别名三形态（`/investors/ackman`、`/zh/investors/ackman`、`/en/investors/ackman`）→ 301 到 `/investors/pershing-square` / `/zh/investors/pershing-square`
   - 首页、`/investors`、`/stocks/AAPL` 正常渲染，导航无 macro 入口
   - `/sitemap.xml` 无 macro 条目
4. 按项目惯例提 PR（base `db-foundation`），不直接推主干。

## 部署后（站长侧，非本 spec）

- 合并部署后 2~4 周回看 GSC：/macro 相关 404 会被 Google 自然剔除；"网页会自动重定向"一行应能看到别名 301 被正确识别。
