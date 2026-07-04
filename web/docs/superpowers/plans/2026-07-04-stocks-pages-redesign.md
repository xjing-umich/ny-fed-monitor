# Stocks 三页前端重做实施计划

> **给接力 agent：** 当前按内联执行，不分派子代理。每个任务用 checkbox 追踪；本项目无测试套件，TDD 式步骤改为“先写 grep/视觉验收断言，再做最小实现，再跑断言/tsc，再提交”。

**目标：** 按唯一真相源 spec 重做 `/stocks`、`/stocks/screener`、`/stocks/[ticker]` 三页前端呈现，让详情页回到“谁持有”为主角，估值降为克制的一行信号。

**架构：** 保持 Next App Router 服务端页面形态，不改 `EntityPage` 对外接口，不新增 client hydration。详情页只重排现有数据派生后的 DOM：masthead 后外链、估值一行、持有人表、单行出口链、原生 `<details>` 佐证。估值位置档仍由 `deriveValuationVerdict` 单一真相源产生，本计划不动估值引擎或数据层。

**技术栈：** Next `16.2.6` App Router、React/TypeScript、Tailwind token class、项目现有 `--tt-*` token、Fraunces display 字体、原生 `<details>`、RSC。

---

## 环境与约束记录

- 当前工作区：`/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor`。
- 已确认分支：`feat/stocks-pages-redesign`，不切换分支。
- 已确认未跟踪无关文件：`.cursor/`、`linkedin-home-h5-hero.png`。本任务不添加、不修改、不删除、不提交它们。
- 已读取 spec：`web/docs/superpowers/specs/2026-07-04-stocks-pages-redesign-design.md`。
- 已读取项目规则：`web/AGENTS.md` 与 `web/CLAUDE.md` 引用链。
- Next 16 文档检查：按规则查找 `web/node_modules/next/dist/docs/`，该 npm 包内没有 `dist/docs` 文件，也没有 markdown docs；已确认当前 Next 版本为 `16.2.6`。实现时沿用现有 App Router `page.tsx`、`generateMetadata`、`params: Promise<...>`、`searchParams: Promise<...>` 写法，不凭旧 `middleware` 经验改 proxy/middleware。
- 验收门：不新增/恢复测试，不跑 `vitest`，不跑 `npm run build` 作为验收；使用 `cd web && npx tsc --noEmit`、grep 断言、必要 `npx tsx` 自检、本地 dev 三档真机。

---

## 文件结构与责任

- 修改 `web/src/app/[lang]/stocks/[ticker]/page.tsx`
  - 重排详情页骨架。
  - 删除 `OwnershipConsensusPanel`、关键事实折叠块、页脚 `related` 数据传入。
  - masthead 下渲染强调版 `ExternalFinanceLinks`。
  - 在持有人 section 内保留 `buildConsensusSentence` 的 `sr-only` SSR GEO 句。
  - 给 `HoldersTable` 增加 meta 行与 `QuarterMovesPill`。

- 修改 `web/src/components/valuation/EarningsPowerFloorCard.tsx`
  - 删除圆角 `Panel` 外壳。
  - 首屏只展示状态、gauge、一句话和价格时点。
  - capex、资产地板、net-net、model cautions、高杠杆/薄数据提示、方法数字都进入同一个 `<details>`。
  - `per_share_unavailable` 与无价格分支同样保持一行 + 折叠方法。

- 删除 `web/src/components/entity/OwnershipConsensusPanel.tsx`
  - 清掉详情页引用后删除文件。

- 修改 `web/src/components/discovery/DiscoveryHandoff.tsx`
  - 保持 props/导出不变。
  - 从面板降为单行文字链，去 eyebrow 与反问式装饰。

- 修改 `web/src/lib/discovery/discoveryHandoff.ts`
  - `stockHandoffFor` 的兜底与 CTA 文案改陈述句。
  - 不改变 investor 出口函数接口。

- 修改 `web/src/components/entity/ExternalFinanceLinks.tsx`
  - 增加带文字标签、触控高度不低于 44px 的强调 variant。
  - 保持 `table`/现有用法不破坏。

- 修改 `web/src/components/entity/NewsletterCTA.tsx` 或 `web/src/lib/footer.ts`
  - 按 spec 重写订阅 blurb。若站点 footer 复用同一文案，则改 `footerCopy`，避免局部硬编码。

- 修改 `web/src/app/[lang]/stocks/screener/page.tsx`
  - 顶部压缩为定位 + GEO 句。
  - 视图/排序合并一排。
  - 删除表前边框免责盒，把短免责并入底部方法论。
  - strike zone 首现补释。

- 修改 `web/src/app/[lang]/stocks/page.tsx`
  - 文案从“最多机构同时持有 / held by the most superinvestors simultaneously”改为“最多人持有 / most widely held”。
  - 不加搜索，不动 `StocksTable`。

---

## Task 1：详情页持有人优先骨架

**文件：**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`
- Modify: `web/src/components/entity/ExternalFinanceLinks.tsx`

- [ ] **Step 1：写断言目标**
  - 目标断言：
    - 详情页出现 `variant="prominent"` 的 `ExternalFinanceLinks`，位置在 `EntityPage` children 开头。
    - `OwnershipConsensusPanel` 不再出现在详情页。
    - `related={related}` 不再从详情页传入。
    - `关键事实与外部链接` / `Key facts & links` 不再出现。

- [ ] **Step 2：外链组件新增强调 variant**
  - 将 `Variant` 扩展为 `"table" | "detail" | "prominent"`。
  - `prominent` 渲染为一排 `<a>`，带图标与文字标签，`min-h-[44px]`，边框 hairline，使用 `--tt-*` token。
  - `table/detail` 保持图标模式，避免列表页回归。

- [ ] **Step 3：重排详情页 children**
  - masthead 后第一块：仅当 `cusipsForTicker.length > 0` 渲染 `<ExternalFinanceLinks variant="prominent" ... />`。
  - 估值 section 保持在持有人表上方，但只作为一行信号。
  - 删除 `OwnershipConsensusPanel` 渲染。
  - `HoldersTable` 移到 handoff 前。
  - `DiscoveryHandoff` 放在 `HoldersTable` 后。
  - 删除 `keyFactsNode`、`factLabels`、`related` 计算。
  - `EntityPage` 保留 `keyFacts={[]}`，不传 `related`。

- [ ] **Step 4：持有人表补 meta 与 GEO 句**
  - `HoldersTable` props 增加 `issuer`、`ticker`、`totalValue`、`moves`、`period`。
  - 表头下增加 meta：`N 位持有 · 合计 $X · 本季 +opened 新建 / −exited 清仓`；英文等价为纯英文。
  - 复用 `QuarterMovesPill`，全零时自然返回 `null`。
  - 在 section 内加入 `<p className="sr-only">{buildConsensusSentence(...)}</p>`。

- [ ] **Step 5：验证并提交**
  - Run: `rg "OwnershipConsensusPanel|关键事实与外部链接|Key facts & links|related=\\{related\\}|keyFactsNode" web/src/app/[lang]/stocks/[ticker]/page.tsx`
  - Expected: 无匹配。
  - Run: `rg "variant=\\\"prominent\\\"|buildConsensusSentence|QuarterMovesPill" web/src/app/[lang]/stocks/[ticker]/page.tsx`
  - Expected: 三类匹配均存在。
  - Run: `cd web && npx tsc --noEmit`
  - Expected: exit 0。
  - Commit: `feat: simplify stock detail ownership layout`

---

## Task 2：估值卡降为一行信号

**文件：**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`

- [ ] **Step 1：写断言目标**
  - 目标断言：
    - 文件内不再定义/使用 `Panel`。
    - `MethodDetails` 仍使用原生 `<details>`。
    - `COPY` 中旧 panel 标题/导语不再参与渲染。
    - `disclaimerSpine` 不在首屏 `ValueSpine` 渲染，只在折叠方法里保留必要方法免责。

- [ ] **Step 2：移除外壳**
  - 删除 `ReactNode` import 与 `Panel` 组件。
  - `EarningsPowerFloorCard` 返回普通 `<div className="space-y-3">`。
  - 页面外层 `h2` 继续由详情页控制。

- [ ] **Step 3：迁移次要信号**
  - `ValueSpine` 首屏只留 status、gauge、sentence、price as-of。
  - 将 capex ramp、asset floor、net-net、model cautions 渲染移入 `MethodDetails`。
  - 高杠杆 warning、earnings basis note、`CompactFloor` 里的多项数字进入 `MethodDetails` 或折叠内辅助段。

- [ ] **Step 4：处理 fallback**
  - `per_share_unavailable` 显示一句原因 + `<details>` 形式的说明，不加卡壳。
  - `CompactFloor` 只保留短句，不渲染独立免责；方法免责归入折叠。

- [ ] **Step 5：验证并提交**
  - Run: `rg "function Panel|<Panel|panelTitle|panelIntro|disclaimerSpine" web/src/components/valuation/EarningsPowerFloorCard.tsx`
  - Expected: 无 `Panel`/旧标题/旧首屏免责匹配；若 `disclaimerSpine` 被改名为方法免责，旧名也应无匹配。
  - Run: `rg "<details|methodSummary|priceAsOf" web/src/components/valuation/EarningsPowerFloorCard.tsx`
  - Expected: 折叠与价格时点仍存在。
  - Run: `cd web && npx tsc --noEmit`
  - Expected: exit 0。
  - Commit: `feat: compress stock valuation signal`

---

## Task 3：删除共识面板并降噪出口链

**文件：**
- Delete: `web/src/components/entity/OwnershipConsensusPanel.tsx`
- Modify: `web/src/components/discovery/DiscoveryHandoff.tsx`
- Modify: `web/src/lib/discovery/discoveryHandoff.ts`

- [ ] **Step 1：写断言目标**
  - 目标断言：
    - 全仓库 `OwnershipConsensusPanel` 无引用。
    - `DiscoveryHandoff` 不再有 `rounded-md border bg-[var(--tt-panel)]` 面板样式。
    - `stockHandoffFor` 兜底不再用 `?` 反问。

- [ ] **Step 2：删除旧组件**
  - 删除 `OwnershipConsensusPanel.tsx`。
  - 确认 `buildConsensusSentence` 仍由详情页持有人 section 引用，`consensusSummary.check.ts` 不动。

- [ ] **Step 3：改出口链呈现**
  - 保持 `DiscoveryHandoff({ eyebrow, line, href, ctaLabel })` 签名。
  - 不渲染 `eyebrow`，避免下游类型变化。
  - 输出一行：`line` + `Link` + `→`，无 Panel 外壳。

- [ ] **Step 4：改 stock 文案**
  - 中文兜底：`看哪些股票相对价值带便宜。`
  - 英文兜底：`See which stocks look cheap against a conservative value band.`
  - CTA 保持内部链接价值，但避免 chatbot 式反问。

- [ ] **Step 5：验证并提交**
  - Run: `rg "OwnershipConsensusPanel" web/src`
  - Expected: 无匹配。
  - Run: `rg "想知道|Want to see|\\?" web/src/lib/discovery/discoveryHandoff.ts web/src/components/discovery/DiscoveryHandoff.tsx`
  - Expected: `stockHandoffFor` 无反问；若 investor 英文专名有问号也需人工确认不是出口文案。
  - Run: `cd web && npx tsc --noEmit`
  - Expected: exit 0。
  - Commit: `feat: reduce discovery handoff chrome`

---

## Task 4：Screener 顶部压缩

**文件：**
- Modify: `web/src/app/[lang]/stocks/screener/page.tsx`

- [ ] **Step 1：写断言目标**
  - 目标断言：
    - 表前不再有边框免责盒。
    - 视图与排序在同一个 nav/controls 区块。
    - 首段出现 strike zone 解释：“现价低于保守价值带” / “price below the conservative value band”。

- [ ] **Step 2：合并顶部文案**
  - H1 保持“个股 · 按价值带 / Stocks · By value”。
  - intro 一段同时包含定位与 `geo`，不让 `geo` 单独占一行。
  - strike zone 首现补释。

- [ ] **Step 3：合并视图/排序**
  - 用一个 `<nav>` 或 `<div role="navigation">` 包住 view links 与 sort links。
  - 用轻分隔符区分两组，不再有独立“排序 / Sort” label 立牌。

- [ ] **Step 4：移动免责**
  - 删除表前 `rounded-md border` 免责段。
  - 底部方法论缩成一行，包含“仅供参考/非投资建议”和 margin-of-safety 定义。

- [ ] **Step 5：验证并提交**
  - Run: `rg "rounded-md border|排序|Sort" web/src/app/[lang]/stocks/screener/page.tsx`
  - Expected: 无表前免责盒；排序 label 不再单独出现。
  - Run: `rg "现价低于保守价值带|price below the conservative value band|安全边际只是|Margin of safety is" web/src/app/[lang]/stocks/screener/page.tsx`
  - Expected: 解释与底部短免责存在。
  - Run: `cd web && npx tsc --noEmit`
  - Expected: exit 0。
  - Commit: `feat: tighten stocks screener header`

---

## Task 5：列表页文案与订阅文案

**文件：**
- Modify: `web/src/app/[lang]/stocks/page.tsx`
- Modify: `web/src/lib/footer.ts`

- [ ] **Step 1：写断言目标**
  - 目标断言：
    - `/stocks` metadata/eyebrow 不再出现“被最多机构同时持有”。
    - 英文 description 使用 `most widely held`。
    - newsletter blurb 按 spec 改为克制文案。

- [ ] **Step 2：改列表页文案**
  - zh title/description/eyebrow 改“最多人持有”。
  - en description 改 “Most widely held securities...” 或等价克制表达。
  - 不改 `StocksTable`，不加搜索。

- [ ] **Step 3：改订阅 blurb**
  - zh：`新一季 13F 异动与估值更新，发到你的邮箱。`
  - en：`New-quarter 13F moves and valuation updates, to your inbox.`
  - 若文件已有半角逗号风格，保持项目当前标点风格，不引入混合 locale 文案。

- [ ] **Step 4：验证并提交**
  - Run: `rg "被最多机构同时持有|held by the most superinvestors simultaneously|Curated 13F|每期精选|straight to your inbox" web/src/app/[lang]/stocks/page.tsx web/src/lib/footer.ts`
  - Expected: 无匹配。
  - Run: `rg "最多人持有|most widely held|新一季 13F|New-quarter 13F" web/src/app/[lang]/stocks/page.tsx web/src/lib/footer.ts`
  - Expected: 新文案存在。
  - Run: `cd web && npx tsc --noEmit`
  - Expected: exit 0。
  - Commit: `feat: refine stocks copy`

---

## Task 6：最终验证、真机验收与 push

**文件：**
- No planned code changes unless validation finds a mismatch.

- [ ] **Step 1：最终类型检查**
  - Run: `cd web && npx tsc --noEmit`
  - Expected: exit 0。

- [ ] **Step 2：最终 grep 断言**
  - `rg "OwnershipConsensusPanel" web/src` → 无匹配。
  - `rg "关键事实与外部链接|Key facts & links|keyFactsNode|related=\\{related\\}" web/src/app/[lang]/stocks/[ticker]/page.tsx` → 无匹配。
  - `rg "variant=\\\"prominent\\\"|ExternalFinanceLinks" web/src/app/[lang]/stocks/[ticker]/page.tsx` → 外链在详情页 children 前段存在。
  - `rg "<details|FoldedSection|methodSummary" web/src/app/[lang]/stocks/[ticker]/page.tsx web/src/components/valuation/EarningsPowerFloorCard.tsx` → 折叠佐证与估值方法存在。
  - `rg "现价低于保守价值带|price below the conservative value band" web/src/app/[lang]/stocks/screener/page.tsx` → screener 首现解释存在。
  - `rg "最多人持有|most widely held" web/src/app/[lang]/stocks/page.tsx` → 列表文案存在。

- [ ] **Step 3：本地 dev 三档真机验收**
  - 启动：`cd web && npm run dev`。
  - 打开至少：
    - `/en/stocks`
    - `/en/stocks/screener`
    - `/en/stocks/AAPL` 或本地数据可用的 ticker。
  - 检查 375/768/1280：
    - 详情页 masthead 下外链为带文字的一排，触控高度足够。
    - 估值只是一行状态 + gauge + 一句话；方法数字折叠。
    - 持有人表在 handoff 前，表头 meta 与本季 pill 可见。
    - 持有概览/趋势用原生 details，展开内容 SSR 可见。
    - screener 顶部不再有独立边框免责盒。

- [ ] **Step 4：工作区与提交核对**
  - Run: `git status --short`
  - Expected: 仅本任务文件已提交；无关 `.cursor/`、`linkedin-home-h5-hero.png` 仍未跟踪且未提交。

- [ ] **Step 5：push 当前分支**
  - Run: `git push`
  - Expected: 当前 `feat/stocks-pages-redesign` push 成功。
  - 不执行 `gh pr create`；最终提醒用户网页创建 PR，base=`db-foundation`。
