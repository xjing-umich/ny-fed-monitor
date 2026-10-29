# PR 2 续接执行记录

> **For agentic workers:** Use superpowers:executing-plans to execute the already approved design inline. This document reconciles the 10/25 plan with the 10/28 decisions.

**Goal:** 导航直达击球区，统一展示词表、估值色阶与动作字形，为投资人页 PR B 提供共享组件。

**Architecture:** 保留现有 Next.js RSC 与共享词源。只修改展示、导航与验证，不新增查询，不修改估值引擎和入库。

**Tech Stack:** Next.js 16.2.6、React 19、TypeScript、Tailwind v4、tsx 检查。

**Spec:** `docs/superpowers/specs/2026-10-25-detail-conclusion-first-design.md` §4/§6；范围以 `2026-10-28-investor-conclusion-first-design.md` §七为准；词表以项目 `reports/六页全面提升方案 2026-10-28.md` D1–D13 为准。

## Global Constraints

- 不新增 Supabase 查询，不修改计算出的估值、持仓或市场数字。
- 不修改投资人详情页布局、四格和金额倾向，这些由 PR B 实施。
- 不推送、合并、入库或部署；完成后交用户审阅。
- 中英文统一“价值区间 / Value range”；title/meta 使用“内在价值区间 / intrinsic value range”。
- 动作采用“● 新进 / ▲ 增持 / ▼ 减持 / ○ 清仓”，正文色；绿色专用于估值。
- 新增门禁只检查展示词表与可确定的事实约束，不钉死历史实时数字。

## Review Focus

- 价格在区间内但低于内在价值时，标尺应显示在区间内，击球区结论仍由原引擎给出。
- 区间退化为单点、内在价值落在区间外时，不应产生 NaN、无穷或错误位置标签。
- 中英文筛选器含查询参数、内部 variant 路径时，高亮击球区且不高亮个股。
- 1024px 导航不得溢出；375px 的移动导航和页内锚点仍可访问。
- 待确认估值保持中性；动作在深浅色都能凭文字与字形辨认。

### Task 1: 导航

- [x] 新增并运行 `src/lib/nav.check.ts`，验证首页、个股、筛选器和内部 variant 的唯一高亮及中英文 href。
- [x] `TOP_NAV` 增加 strike；导出 `isNavActive(key, href, barePath)`，TopNav/MobileDrawer 共用；链接标 `aria-current`。
- [x] 运行导航检查、TypeScript 与相关 ESLint。

### Task 2: 估值词表与标尺

- [x] 更新既有 valuationLabel / valuationVerdictChip 检查，先验证旧实现失败。
- [x] 统一词源及消费端展示文字；新增 val-below / val-within / val-above Tone，待确认保持 neutral。
- [x] 标尺位置按 rangeLo/rangeHi，内在价值另标位置；新增价格落在区间内但低于 IV、区间退化、带外 IV 检查。
- [x] 运行 valuationLabel、valuationVerdictChip、bandPosition、估值卡渲染与 TypeScript。

### Task 3: 动作与个股页

- [x] 更新 quarterMovesText / qoqDirection 检查并确认先失败。
- [x] 导出 `MOVE_GLYPH`；共享动作字符串加字形，保留持平与清仓在持有人表的既有处理。
- [x] 持有人数仅在结论带展示；页内锚点补可见的滚动提示；不重复改 PR B 的部分。
- [x] 运行动作、结论带和导航渲染检查。

### Task 4: 门禁与验收

- [x] 加 `check:lexicon`，扫描用户可见字符串，排除注释、变量名与历史报告快照；消除词表冲突。
- [x] `check:facts` 首批覆盖首页/筛选器计数链路和区间位置，明确不是全站实时审计。
- [x] 执行 TypeScript、ESLint、现有 prebuild 门禁及仓库检查；报告基线失败。
- [x] 本地浏览器核对导航与代表性标尺；独立审查完整 diff；修复重要问题后交用户。

## 验证结果（2026-10-29）

- TypeScript、修改文件 ESLint（0 errors）、prebuild（含 lexicon/facts）及 fixture production build 通过；生成 65 个静态页面。
- 全仓 110 个检查，109 通过；唯一失败 `ownerEarningsDcf.check.ts:115` 的 `anchored` 断言已在上游 `5c351dd` 导出源码独立复现，留给数据会话处理。
- 中英文导航 1024/1280/1440px 与 375px 抽屉无页面横向溢出，击球区唯一高亮；标尺中英、375/768/1440px、深浅色使用本地合成夹具核对。
- 独立审查无重要阻断；遗漏的 Band 表头已按 D1 补齐并受词表门禁保护。
- `check:facts` 仅为首批本地契约检查，不代表生产数据、全部分母与增速口径已完成审计。
- 未推送、合并、触发工作流或部署。浏览器与构建数据为本地合成夹具，不是最新财务或市场数据。
