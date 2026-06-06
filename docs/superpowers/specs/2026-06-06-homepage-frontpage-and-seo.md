# 首页数据头版 + 低成本 SEO 地基 设计

- 日期: 2026-06-06
- 状态: 已与用户确认方向与范围，待复核 → 写实现计划
- 背景: 现首页是"海报"（大 hero + 三张介绍卡），在真正给出数据前占满一屏。用户要求改成**直接给已有信息的数据头版**，并从独立开发者颠覆大厂的角度，让它既"一眼有效信息"又利于 **Google 收录 / 被 AI 引用**。
- 分支: `phase0-product-skeleton`（在编辑式重塑 + Compounder 品牌之上继续）。

## 1. 战略定位（本轮确认）
- 首页 = **编辑式数据头版 + 内链 hub**：报眉下直接上数据，几乎不讲 pitch；每个投资者/个股/指标都是链接，喂爬虫发现全部实体页。
- 认知校准：SEO 真正的引擎是**实体页的广度×质量×新鲜度**（依赖后续 Phase 1 扩数据 + Phase 3 深度结构化）。本轮做"首页 hub + 低成本 SEO 地基"，用**现有 6 位投资者数据**即可，不扩数据源。
- 设计语言沿用现状：金融编辑刊物风（衬线小标题、发丝分隔线、等宽数字、钞票绿、单语言 per lang）。

## 2. 首页结构（`web/src/app/[lang]/page.tsx` 改写）
报头由 AppShell 提供；页面正文从上到下：

1. **报眉 dateline**（一行信息非口号）：`截至 {最新报告期} · {N} 位投资者 · 数据来源 SEC 13F`（en 对应英文）。承担"新鲜度"信号。
2. **本季显著动向**（头条）：跨所有投资者聚合 `changes`，两栏：
   - 最多人增持：按"有多少位投资者 new/increased 该 cusip"排序的 Top N（issuer → 几位增持 → 合计市值）
   - 最多人减持：按 exited/decreased 计数的 Top N
   - 每行 issuer 链接到 `stockPath(cusip)`。
3. **共识持仓**：被最多机构持有的名字（holderCount，复用聚合）Top N → 表格，"查看全部 →" 到 `/stocks`。
4. **投资者一览**：按组合市值排名（人名 · 市值 · 持仓数 · 第一大持仓），人名链接 `investorPath(slug)`，"查看全部 →" 到 `/investors`。
5. **宏观速览**：2–3 个关键信号（reference-rates / repo-financing / auction-risk 优先），白话名 + 数值 + 一词解读，链接 `macroPath(indicator)`。
- 排版：桌面"头条宽栏 + 共识/宏观侧栏"的报纸感网格（可用 grid），移动端堆叠。无大 hero、无三张介绍卡。
- 防御式：任何块数据缺失则优雅省略，不崩。

## 3. 聚合逻辑抽取（`web/src/lib/aggregations.ts` 新建）
把"扫描全体经理人持仓"的逻辑收敛到一处，首页与 `/stocks` 共用，消除 `/stocks/page.tsx` 内联重复：
- `getAllHoldingsScan()`: 对 `getManagerIndex()` 的每位 `getManagerDetail(slug)` 取 latest.holdings + changes，**用 `React.cache` 包裹**避免一次渲染内重复扫描。
- `mostHeld(limit)`: 按 cusip 聚合 holderCount + totalValue + 展示 issuer，降序。（`/stocks/page.tsx` 改为调用它。）
- `notableMoves(limit)`: 聚合 changes → `{ mostBought: {cusip,issuer,count,value}[], mostSold: {...}[] }`（count = 该 cusip 被多少位投资者 new/increased 或 exited/decreased）。
- 返回类型显式，纯函数风格（除数据读取外无副作用）。

## 4. 低成本 SEO 地基
- **`web/src/app/sitemap.ts`**（Next app-router）：列出 home、`/investors`、所有 `/investors/[slug]`、`/stocks`、`mostHeld` 的 Top ~50 `/stocks/[cusip]`（避免上千条）、`/macro`、所有 `/macro/[indicator]`，**zh + en 双语**，每条带 `lastModified`（用数据报告期/构建日）。
- **`web/src/app/robots.ts`**：允许抓取，指向 sitemap。
- **hreflang**：在各页 `generateMetadata` 加 `alternates.languages`（zh-CN / en）+ `canonical`。优先 home、investor、stock、macro 指标页。
- **JSON-LD 结构化数据**：
  - 首页：`Organization`（Compounder）+ `ItemList`（Top 投资者）。
  - 投资者实体页：`BreadcrumbList` +（可选）`Dataset`（持仓数据集，注明 SEC 13F 来源 + 报告期）。
  - 个股页：`BreadcrumbList`（+ 最小 `Dataset`）。
  - 以内联 `<script type="application/ld+json">`（在 Server Component 中安全）。
- **metadata 文案**：首页 + 实体页 title/description 写成**含具体事实 + 来源**的句式（利于 GEO 被引用），单语言 per lang。
- 不做：付费、账号、真 AI 接入、扩数据源——均属后续阶段。

## 5. 组件/数据流
- `page.tsx`(server)：调 `getManagerIndex` + `aggregations.mostHeld/notableMoves` + `buildAllSections`(try/catch) → 渲染 5 块 + JSON-LD。
- 复用 EntityPage？否——首页是聚合头版，自建编辑式区块组件（小而专），不套 EntityPage。
- `/stocks/page.tsx` 改为复用 `aggregations.mostHeld`。
- 新增 `sitemap.ts` / `robots.ts` 读 `getManagerIndex` + `mostHeld` + `MACRO_GROUPS` 生成 URL。

## 6. 验收
- `npm run build` 通过；`npm test` 绿（聚合纯逻辑可加少量 vitest：mostHeld/notableMoves 计数正确）。
- 首页：无大 hero；报眉 + 5 个数据块，所有实体名可点；移动端堆叠正常；zh 纯中文 / en 纯英文标签。
- SEO：`/sitemap.xml`、`/robots.txt` 可访问且含实体 URL；查看首页源码含 JSON-LD 与 hreflang；无 RSC 事件处理器违规。
- 数据准确性：报眉与各块标"截至 + 来源"。

## 7. 实现注意
- ⚠️ `web/AGENTS.md`：改造版 Next 16 —— 写 sitemap/robots/metadata/JSON-LD 前先查 `web/node_modules/next/dist/docs/`（app-router 的 `sitemap`/`robots`/`alternates` API）。
- 编辑式样式一致；等宽数字；单语言 per lang；CSS hover（勿在 Server Component 用事件处理器）。
- `React.cache` 包裹全量扫描，控制首页/sitemap 的数据读取成本。
