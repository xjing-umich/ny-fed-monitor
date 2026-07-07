# ④b 语境化 `/learn` 链接 — 设计

- 日期：2026-07-07
- 分支：`plan/learn-contextual-links`（off `db-foundation` @ e63c14e）
- 状态：设计已认可，待落计划
- 上位纲领：[[north-star-strategy]]（内容站·权威性·教育而非荐股）

## 一、目标与背景

超级投资者/个股详情页目前把"事实"（谁在买、值不值）呈现得很足，但**没有把读者接到解释这些事实的常青文**。`/learn` 有 5 篇文章，其中 3 篇是常青解释文，却只能从 `/learn` 列表页进入——详情页读者（站内主要落点）看不到它们。

本设计在三个详情页区块旁各放**一条**轻量语境链接，把"正在看的东西"接到"解释它的文章"。这是 ④b（语境链接），**不含** ④a（研究页删除，已延后）。

## 二、非目标（YAGNI）

- **不做**实体派生（不按当前股票/投资人动态选文）——固定映射即可，简单可靠。
- **不做**新面板/卡片——不与 `DiscoveryHandoff`（主 CTA 面板）争戏，只是一行 mono 链接。
- **不碰** `q1-2026-superinvestor-consensus`（带季度、非常青）与 `reading-cross-fund-consensus`（本次三区块用不到）。
- **不做**埋点（CTA 埋点是另一条线，不在此 PRD）。

## 三、固定映射（页面区块 → 常青文）

| 放置区块 | slug | 短标签 zh | 短标签 en |
|---|---|---|---|
| 个股页 · 持有人表附近 | `how-to-read-a-13f` | 如何读懂 13F | How to read a 13F |
| 个股页 · 估值卡附近 | `reading-business-quality` | 什么样的生意算优质 | What makes a business high quality |
| 投资人页 · 持仓表附近 | `what-is-a-superinvestor` | 什么是超级投资者 | What is a superinvestor |

三条 slug 均为 `web/src/lib/learn.ts` 中既有的常青文（已核对在库）。文案用**短标签**而非文章全名（全名如 "What Makes a Business High Quality: Reading the Numbers…" 过长）。

## 四、组件设计

### `web/src/components/common/LearnLink.tsx`（新建，RSC，纯展示）

```
props: { lang: Lang; slug: string; label: string }
render: <Link href={localePath(lang, `/learn/${slug}`)} class="…mono muted → hover accent…">{label} →</Link>
```

- 零逻辑、零数据依赖、零 hydration（纯 RSC）。
- URL 单一真相源走 `localePath(lang, ...)`（en 裸前缀 / zh `/zh` 前缀）——不硬编码 `/${lang}/`。
- 设计语言：mono 小字（如 `text-[11px]`/`text-xs`）、`--tt-muted` → hover `--tt-accent`、尾随 ` →`。仅用 `--tt-*` token。
- 刻意做轻：**不是**面板，是一行链接，挂在它所解释的区块正下方（次级延伸阅读，不抢 `DiscoveryHandoff` 主 CTA 的戏）。

## 五、放置锚点（按符号锚定，不信行号）

churn 提示：个股页近期并入共持/趋势/信号相交等特性，行号会漂——放置**按渲染的组件符号**定位，不写死行号。

- **个股页** `src/app/[lang]/stocks/[ticker]/page.tsx`
  - `<EarningsPowerFloorCard … />` 之后 → `<LearnLink slug="reading-business-quality" …/>`
  - `<HoldersTable … />` 之后 → `<LearnLink slug="how-to-read-a-13f" …/>`
  - 两者都在既有 `<DiscoveryHandoff>` 之上/之外，不与之嵌套。
- **投资人页** `src/app/[lang]/investors/[slug]/page.tsx`
  - `<HoldingsTable … />` 之后 → `<LearnLink slug="what-is-a-superinvestor" …/>`

标签文案在放置处按 `lang` 三元取值（zh/en 短标签，见 §三表），避免中英混排。

## 六、合规与设计红线

- 纯教育链接，**无**买卖/目标价/评级/择时措辞——契合估值哲学红线与 [[north-star-strategy]] 信条。
- 每 locale 纯本语言，无中英混排。
- 仅 `--tt-*` token；纯 RSC；URL 走 `localePath`。

## 七、降级

纯静态链接、无外部数据、无 DB 依赖 → 不会运行期失败。slug 是硬编码常量，指向 `learn.ts` 既有常青文；若将来有人删文，链接会 404（低风险，常青文稳定，不设额外守卫）。

## 八、测试与验收

项目无常驻测试套件（solo dev）。`LearnLink` 是纯展示 + 静态链接，无纯函数逻辑，故不加 `.check.ts`。验收：

1. `npx tsc --noEmit` 零错。
2. 部署后 view-source 三页各含对应 `/learn/<slug>` 链接，且英文页为**裸**前缀（`/learn/…`，非 `/en/learn/…`）、中文页为 `/zh/learn/…`。
3. 人工 dark/light 各扫一眼：mono 小字、muted→accent hover、`→` 尾随、贴在所属区块之下、不抢 `DiscoveryHandoff` 戏。

## 九、触及文件清单

- 新建：`web/src/components/common/LearnLink.tsx`
- 改：`web/src/app/[lang]/stocks/[ticker]/page.tsx`（+2 处 LearnLink）
- 改：`web/src/app/[lang]/investors/[slug]/page.tsx`（+1 处 LearnLink）
