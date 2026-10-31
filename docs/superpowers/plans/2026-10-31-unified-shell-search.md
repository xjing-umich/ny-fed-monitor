# Unified shell and search implementation plan

> Execute natively with superpowers:executing-plans in the reused isolated worktree; one fresh final reviewer. The user approved this first consistency pass and stock-list validation.

**Goal:** 首页与研究页共享品牌、导航、语言/主题控件和搜索行为，以个股列表验证。
**Architecture:** 提升 A5 冷蓝中性色/品牌色为全站 OKLCH 令牌，金融语义色独立；统一 SiteHeader 和 GlobalSearch，保留首页独立hero与研究页的数据密度。复用现有共享索引及已验证的精确匹配，移除重复实现。现有订阅与数据读写边界保持原样。
**Scope:** 桌面/手机公共外壳、页脚、通用字形和搜索；个股列表仅验证其筛选、排序、翻页和对齐。详情页结构、估值模型、数据库及数据发布流程不在本轮改动范围。

## Product decisions

- 品牌统一为冷蓝/冰蓝，内容页保持安静的浅色/深色底。首页的大幅渐变与宽字阶仅用于首页。
- 品牌链接返回首页；导航共用投资人/个股/击球区/学习四个入口，保留已有研究功能。当前页/详情页正确标记所属项，估值选股器只标记击球区。
- 内页桌面导航展示全站搜索；首页的主要搜索保留在hero。手机菜单提供同一全站搜索，语言与主题按钮在菜单外可达；原生dialog提供焦点约束、Escape关闭与焦点返回。
- 搜索结果区分公司/投资人；精确代码优先、上下键、Enter、Escape、IME、空结果和局部索引故障共用一份实现。未知代码不伪装成已收录结果。
- 列表内搜索是本列表筛选，继续独立于全站查询；URL、筛选、排序、分页、日期/来源和估值语义保持正确。
- 保留中英、375/768/1440、明暗主题、减少动态效果、≥12px文字、约44px触控目标。v2对比度门禁≥4.5:1。
- 当前授权为实现/验收/PR预览；不自动合并或发布本轮。

## Task 1 — Shared search contract

**Files:** create lib/search/{types,match,match.check}.ts and components/shell/{GlobalSearch.tsx,search.module.css}; adapt LandingSearch and legacy SearchBox; move shared index types/imports.

- [ ] 写扩展fixture验证T/F/ON/MA、精确名称、中文别名、分组、空白/无匹配及有界结果。先观察RED，再提升已有匹配逻辑并GREEN。
- [ ] 把首页交互提升为共享组件：header/hero/menu三种外观；统一局部故障提示、鼠标/键盘、组合输入保护、选择后导航、焦点外关闭和可滚动结果。
- [ ] 通过现有索引/快照回归；不新增数据读取或浏览器数据库请求。

## Task 2 — Shared shell and tokens

**Files:** create shell/{SiteHeader.tsx,siteHeader.module.css}; modify AppShell, ShellFrame usage, Footer, nav, globals and root layout; remove unused duplicate headers/drawer. Normalize landing local aliases to global palette.

- [ ] 针对导航所属项、品牌/金融语义色分离补行为约束；实现共享桌面和手机header，路由切换关闭菜单，语言切换保留当前路径与查询。
- [ ] 提升色板并运行tokens/type/lexicon门禁；保留估值状态色，统一通用字体与页脚品牌。首页hero构图保留。
- [ ] 验证个股列表筛选、排序、分页与导航/语言切换相容，缺数据说明不被主题掩盖。

## Task 3 — Acceptance and PR

- [ ] TypeScript、changed-file ESLint、共享搜索/导航fixture、现有股票/SEO回归、prebuild门禁、production build。
- [ ] 浏览器矩阵：home/stocks/investors/detail/screener/learn × zh/en × light/dark ×375/768/1440；重点个股列表；检查搜索精确代码/别名、无匹配、IME、Esc、焦点、菜单、语言保留查询、导航高亮及减少动态效果。
- [ ] 新鲜独立review，修复重要问题并复测；推送 feat/unified-shell-search，创建目标db-foundation的PR并验收预览。保留本地预览供用户判断，不合并。

## Review focus

1. Header与hero同屏搜索重复、手机dialog关闭后残留弹层/滚动锁、跨路由或语言后的状态残留。
2. 当前选中结果随query/locale/index改变失效；精确短代码不被前8项截掉；IME回车不得跳转。
3. 金融涨跌/估值状态不能随品牌色变蓝；两主题文字/控件对比达标；字体/字阶不影响原数据密度。
4. 列表本地筛选与全站搜索分别工作；语言切换保留query与hash，screener的选中态正确。
5. 缺部分索引保留可用结果并说明缺失，不触发全库扫描，不产生新增数据写入。
