# 个股首屏正式实现 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 把用户确认的 AAPL 首屏原型落实到所有个股页，十秒内可辨价格位置、主要持有人和日期。

**Architecture:** 新增纯展示决策与线性坐标函数、两个 RSC 展示组件；StockConclusionBand 改为纵向摘要。页面只装配已读取的数据，可信普通估值及 SOTP 用新概览，所有缺价/未评估/待确认等分支继续显示原原因与明细。原估值卡 all/details 不变。

**Tech Stack:** Next.js 16 App Router、Tailwind v4、现有设计令牌、tsx assert 检查和 renderToStaticMarkup。

**Spec:** `docs/superpowers/specs/2026-10-30-stock-first-screen-design.md`

## Global Constraints

- 不新增数据库查询、依赖、客户端组件；不改估值模型/数值、路由、metadata、JSON-LD、事件名。
- 原生 details，沿用 ShareButton/主题切换；中英文、深浅色、375/768/1440px。
- 字阶上限40px、辅助标签下限12px；只用现有估值色，待确认中性。日期/价格来源常显。
- 基于最新 db-foundation，在现有干净 UX worktree 的 `codex/stock-first-screen` 实现。Git 用 `/usr/bin/git`，推送用既有 HTTPS 认证。
- 文案按 web/docs/copy-voice.md；不以估值区间位置替代内在价值判定，不虚构当前季度统一日期。
- 旧估值卡 all/details 行为保留；错误/低信心原因不折叠隐藏。历史趋势搬入持仓证据原生折叠，不删除。

## Review Focus

1. price在range内、bucket却below：首屏必须按真实区间位置表述；Task1/2夹具。
2. 0/1位持有人、长英文名、未知/混合日期：不造名字，不截断口径；Task3夹具和浏览器。
3. 无价、币种不一致、过期、待确认、增长证据缺口：新图不得绕过现有估值闸门；Task1/4夹具。
4. 极窄/单点/极大数：坐标有限、比例真实、文字不重叠、现价不裁剪；Task1/2边界与浏览器。
5. 特殊模式的信息损失：SOTP保留方法身份、无中枢不造中枢、净流动资产等特殊提示仍可见；Task4装配与终审。

---

### Task 1: 纯展示模型和线性轴

**Files:** Create `web/src/lib/stocks/stockFirstScreen.ts` and `.check.ts`.

**Interfaces:** Consumes `ValuationVerdict`, type-only `LatestPrice`, `bandPosition`, i18n per-share/price/date helpers. Produces `linearValueAxis(lo:number,hi:number,price:number): { max:number; low:number; high:number; price:number; ticks:number[] } | null` (positions为0–100比例)；`stockValueSummary({verdict,quote,reference?,kind},lang): StockValueSummary|null`；`stockFallbackHeading(state,reliable,lang):string`。kind为earnings/zero-growth/sotp。

- [x] Step1 写失败检查：轴(90,180,360)终点400、坐标22.5/45/90；p=lo/hi为within；单点、0.01级、1e12级数有限；NaN/负/倒置返回null。bucket below而p150处在90..180时标题为区间内。reliable=false、stale、非USD、缺价/无verdict返回null；缺中枢不显示reference，SOTP标签不是OE-DCF。
- [x] Step2 Run `cd web && node_modules/.bin/tsx --tsconfig scripts/tsconfig.json src/lib/stocks/stockFirstScreen.check.ts`，Expected失败（模块不存在）。
- [x] Step3 实现以上签名。轴从0开始，padding8%，目标4个间隔，采用1/2/2.5/5/10的十进制友好步长向上取整；处理乘法溢出回退、禁止NaN。结论使用区间位置，位置差值只在有限时展示。
- [x] Step4 重跑检查，Expected OK；commit。

### Task 2: 价格与价值概览组件

**Files:** Create `web/src/components/stocks/LinearValueAxis.tsx`, `StockValuationSummary.tsx`, `StockFirstScreen.check.tsx`.

**Interfaces:** LinearValueAxis consumes Task1 axis和原始lo/hi/price/lang，输出RSC SVG/HTML。StockValuationSummary consumes Task1 `StockValueSummary`、lang、可选marginText，输出醒目H2、收盘价、模型区间/单点、可选中枢、同轴图、原生口径details。

- [x] Step1 写失败渲染检查：双语标题/收盘价/来源/价格日/参考名称；轴aria完整含数值；相同值区间折成单点；只有一个可见价格数字、参考只一次；details含模型属性与取整说明；没有客户端指令。单一零增长估计不写含增长上沿。
- [x] Step2 Run `cd web && node_modules/.bin/tsx --tsconfig scripts/tsconfig.json src/components/stocks/StockFirstScreen.check.tsx`，Expected模块不存在。
- [x] Step3 实现组件，字体用现有字阶；SVG文字首尾按anchor处理，少量刻度且间隔合理；颜色来自position，范围不来自bucket。手机至少44px说明热区。
- [x] Step4 重跑检查，Expected OK；commit。

### Task 3: 纵向结论带与持仓摘要

**Files:** Modify `web/src/components/stocks/StockConclusionBand.tsx`, `.check.tsx`.

**Interfaces:** 保留lang/left/marginText；holders新增 `leaders:{name:string;href:string}[]`、`snapshotNote:string`，移除首屏trend；以count/total替代line，保留quarter/moves/exited。父页面负责排序取两位、用snapshotTime生成口径。

- [x] Step1 更新渲染断言，验证左右分栏类消失、leader链接按传入顺序、snapshotNote位于动作分组前，动作季度独立；0 leaders不画身份行，1位没有空分隔符、长名可换行。既有清仓列表和nav检查保留。
- [x] Step2 运行 StockConclusionBand.check，Expected因未渲染新字段失败。
- [x] Step3 实现纵向布局：left先；摘要含计数/市值、主要名字、snapshotNote、动作+股数口径；折叠前留关键日期。沿用共享QuarterMovesLine，不另写动作计数或清仓名单。
- [x] Step4 重跑检查，Expected OK；commit。

### Task 4: 页面装配与状态保全

**Files:** Modify `web/src/app/[lang]/stocks/[ticker]/page.tsx`；按需补 `StockFirstScreen.check.tsx`；不改EarningsPowerFloorCard的计算或all/details。

**Interfaces:** new model使用同一次run.verdict、latestPrice、有效OE中性值或SOTP中枢。仅可信card/spine或可信SOTP使用新概览，其余沿用bandLeft且加Task1的中性醒目标题。已有方法卡提供全部原风险解释。

- [x] Step1 补组件/装配检查，锁定全部fallback不出现新比较图；SOTP/单灯名称；缺失价格/增长证据原因仍可读。先运行，Expected缺装配或闸门断言失败。
- [x] Step2 组装新摘要；删除重复masthead估值和预期徽章；PriceBetBlock正文保留。leaders取现有holders按市值降序前2，snapshotTime使用实际periods，不用动作季度冒充。
- [x] Step3 trendSeries传入HoldersTable，新增原生details保留HolderTrend与回填提示；原snapshotNote搬首屏不重复，原申报季说明保留。其余证据、行数与链接不变。
- [x] Step4 Run各feature checks、`tsc --noEmit`、改动文件ESLint、prebuild；Expected无新增失败。commit。

### Task 5: 整体验证、独立review与PR

- [ ] 跑全量check并与实现前基线比较。运行prebuild（包含最新derived门禁）、revalidate-paths/color；不得弱化断言。发布记录注明原有失败。
- [ ] 当前head编译后本地生产模式验证或Vercel预览完整构建。AAPL、PDD、M、BRK.B与不可评估样例，双语375/768/1440×深浅色；无真实样例的边界用明确标注的合成夹具。检查姓名/价格日期/混季口径首屏可读、目录无遮挡、热区、无横向溢出、图标注不重叠。
- [ ] 独立完整分支review，修复真实P1/P2，重跑相关检查；review通过自动push和开PR到db-foundation并attach。若基线推进先验证集成，不覆盖其他会话文件。
- [ ] 核对预览检查与真实SSR内容，报告PR、验证范围、现存限制；不自动合并。
