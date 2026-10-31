# A5 Landing Production Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline in the existing isolated worktree, with one fresh final reviewer. User approved trying the accepted A5 design; preserve this execution method.

**Goal:** 将已认可的整页原型接入真实首页，生成可验收的 PR 预览。
**Architecture:** 首页 RSC 读取现有持仓、报价、财报与申报进度；复用 runValuation、stockValueSummary、LinearValueAxis。搜索使用真实持仓索引；独立小客户端负责搜索、原生导航 dialog 和公司 tabs。仅首页使用全宽 shell、蓝色令牌和 display 字阶；订阅复用现有接口且仅保留一处。
**Tech Stack:** Next16.2.6 / React19 / CSS module / native details/dialog / existing readers.
**Spec:** docs/superpowers/specs/2026-10-31-landing-redesign-design.md

## Global Constraints

- A5 深蓝、冰蓝、少量青色，柔和过渡和透明背景；关键文字清晰。桌面 H1≤56px，手机32–40px，辅助≥12px。
- 中英文、明暗主题、375/768/1440px、减少动态效果；保留 URL、metadata、Organization/WebSite JSON-LD 与3天ISR。
- 不改表/估值模型/数据写入流程；复用现有校验。来源、持仓日期、报价日期、财报期分别标明，外部数据按实际读取核实。
- 只创建 PR 和预览，合并/正式发布等待该轮验收授权。Code review通过后自动推送PR。

## Review Focus

1. 首页与详情页同一数据/安全闸；待确认、缺价、非美元、过期、不合理数值不画确定估值图。
2. 搜索按公司/投资人区分；无匹配与网络/索引不可用提示诚实；键盘与鼠标共享选择行为。
3. 某公司无持有人或读取失败，不能编造零持有或跳到不存在详情。
4. 申报进度使用 effectiveMovesPeriod，不能固定3/94或提前宣称季度完整。
5. 首页 shell 不影响站内其他路由；订阅仅一处；所有语言/主题下不横向溢出。

### Task 1: 真实案例与安全展示模型

**Files:** create web/src/lib/home/companyExample.ts, readCompanyExamples.ts, companyExample.check.ts.
**Interfaces:** readCompanyExamples(lang)→CompanyExample[]；纯 deriveCompanyExample 接受 current holders、ValuationRun、LatestPrice、财报日期，产出可序列化模型。UI仅消费 summary 或诚实 fallback。
- [ ] 先写fixture检查：有效/SOTP/零增长、混合季度/陈旧持有人、无持仓、待确认/缺价/非USD/不同报价日期/坏轴。
- [ ] 运行确认缺实现失败；实现复用现有 runValuation 和 stockValueSummary 校验；运行全部fixture通过。

### Task 2: 搜索与全页接入

**Files:** create components/home/landing/{LandingHeader,LandingSearch,CompanyExamples,LandingPage}.tsx, landing.module.css; create shell/ShellFrame.tsx; modify app/[lang]/page.tsx and layout.tsx, shell/AppShell.tsx and Footer.tsx; create lib/home/search.ts, search.check.ts.
**Interfaces:** ShellFrame accepts rendered header/footer slots and children, identifies only /, /en, /zh as home. Landing search consumes real SearchItem[] built with existing managers + mostHeld; group keys derive from typed kind/path.
- [ ] 先写search fixture，覆盖中文别名/大小写/ticker/分组/空结果；RED→实现→GREEN。
- [ ] 将确认的HTML/CSS构图转换为组件，复用真实股票summary/坐标与订阅表单；完整来源native details；首页独立样式且SSR默认内容可见。
- [ ] 首页footer关闭额外订阅，保留其他页面现状；语言/主题沿用existing routing/next-themes。

### Task 3: 验证、独立review、PR预览

- [ ] typecheck/lint；npm prebuild门禁；相关stockFirstScreen/LinearValueAxis/页面SEO回归；production build。
- [ ] 浏览器375/768/1440×中英×深浅：搜索公司/投资人、无匹配、键盘、案例、说明、手机菜单、主题/语言、订阅mock成功/失败，详情/列表回归；禁止真实订阅。
- [ ] 新鲜独立review；修复阻塞问题并验证，提交推送 feat/landing-a5 创建目标db-foundation的PR，附预览构建与验收状态。不自动合并。
