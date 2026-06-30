# 发现面接力（Discovery Handoff）设计

- 日期：2026-06-30
- 分支：`plan/discovery-handoff`（off `db-foundation`）
- 上游审计：见 2026-06-28 引导线（consensus baton）后续的产品路径审计
- 范围：引导线四修中的 ①+②（"发现面接力"）。③macro 贴现率桥、④`/research` 清理+learn 链接另开 spec。

## 问题（来自产品路径审计）

核心 A↔B 回路（investor detail ⇄ stock detail）已健康，但被三个结构缺陷困住，无法形成"有人带路"的会话：

1. **SEO 落地者被困在"单股孤岛"。** 这是最致命的，因为它直击真实入口——Google 不送人到首页（首页虽是好枢纽却没人从那进），人落在 `/stocks/AAPL`、`/investors/<slug>` 这种深页。从深页只能在 A↔B 之间就**这一只**反复横跳，**没有任何出口通向 screener**（值不值/strike zone 的发现器，即站点最强差异化）。详情页对**彼此**链接很好，对**发现面**链接为零 → 会话深度无法延伸到"整个机会集"。
2. **发现面差异化未被激活。** screener 已经有 `holderCount` 列且 `consensus_holdings` 已 join（见"既有事实"），但**不可排序**——"既便宜、又被一堆超投持有"这张最差异化的表无法被一键召出。

> 诚实修正：审计中一度认为 "screener 无持有人归属"。复核代码后确认 **Holders 列已存在**（`ScreenerTable.tsx` 的 `holders` 列 + `valuationSnapshot.ts` 的 join）。因此 ② 不是"加列"，而仅是"加排序"。

## 目标 / 非目标

**目标**
- 个股页、投资人页各加一个**上下文感知**的"下一步"出口，把当前实体自然延伸到 screener 的对应视图。
- screener 让既有 `holderCount` 列**可排序**，使"低估 × 共识最强"可一键置顶。

**非目标（YAGNI）**
- 不新增 screener 视图（如命名的"聪明钱也便宜"榜）——后续可做。
- 不接 macro（③）、不动 `/research`/learn（④）。
- 不接埋点/度量——本仓暂无 analytics，成功标准为**结构性**（链接存在、SSR 可见、路径可追溯），非点击率。
- 不引入客户端交互（保持 RSC、零 hydration）。

## 约束（硬）

- **估值哲学红线**：所有文案只陈述事实（位置/数量），禁 buy/sell/HOLD/目标价/评级/动量/时机。出口是"观察邀请"，不是行动建议。
- **文案禁中英混排**：每 locale 纯单语言。
- **设计语言**：只用 `--tt-*` token；复用 `rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)]` 面板；绿色 mono eyebrow（10px tracking 0.12–0.14em）→ Fraunces 标题不抢戏；CTA 用 mono + `→` + `group-hover:text-[var(--tt-accent)]`（同 block② 给 StrikeZonePicks 的箭头）。禁 shadcn Card。
- **RSC / SSG+ISR**：无 `"use client"`；链接进 SSR HTML 供爬虫。
- **优雅降级**：env 缺失/表缺失/verdict 为空 → 兜底文案 + 兜底链接，绝不抛错。
- **无测试套件**：验证 = `.check.ts`（tsx 裸跑）+ `npx tsc --noEmit` + curl view-source SSR + 人工 QA（dark/light，390/768/1280）。本机 `next build` 因 google fonts 被墙必失败，不用它当门。

## 既有事实（设计输入，已复核代码）

- `deriveValuationVerdict({floor, strikeZone, oeDcf, reconciliation})` → `{ bucket: "below"|"within"|"above", inStrikeZone, coverage: "full"|"single_lamp", reliable, marginPct }`（`src/lib/valuation/deriveValuationVerdict.ts`）。
- 个股页 `src/app/[lang]/stocks/[ticker]/page.tsx` 已算出 `strikeZone`、`oeDcf`、`reconciliation`（约 330–342 行）——加一次 `deriveValuationVerdict` 即得 handoff 状态输入。
- 投资人页 `src/app/[lang]/investors/[slug]/page.tsx` 已有 `verdicts: Map<string, SnapshotVerdict>`（`readValuationVerdicts`，约 291 行）+ 持仓 → 可数"几只在击球区"。
- screener `readValuationScreen(view, limit)`（`src/lib/valuation/valuationSnapshot.ts`）已 join `consensus_holdings` 取 `issuer`+`holder_count`，按 `margin_pct desc` 排；`ScreenerRow.holderCount` 已存在；`ScreenerTable` 已渲染 "持有机构/Holders" 列。视图：`"strike_zone"|"below"|"all"`。
- screener 视图分段控件是纯 `<Link>`（零 JS）。

## 架构

两个纯函数 + 一个 RSC 展示组件，沿用本仓"纯逻辑脱离 server-only 边界 + RSC panel"范式（参考 `consensusSummary.ts` / `holderCounts.ts`）。

```
src/lib/discovery/discoveryHandoff.ts          ← 纯函数，无 "server-only"，可 .check.ts 裸跑
  stockHandoffFor(verdict, ticker, lang)        → DiscoveryCta
  investorHandoffFor(strikeCount, person, lang) → DiscoveryCta
  // DiscoveryCta = { eyebrow: string; line: string; href: string; ctaLabel: string }

src/components/discovery/DiscoveryHandoff.tsx  ← RSC 展示组件（纯展示，零逻辑）
  props: DiscoveryCta & { lang: Lang }
```

- 纯函数吃归一化状态、吐文案+链接；唯一的条件分支（档位→文案）被隔离、可测。
- 展示组件只渲染面板外壳 + eyebrow + line + CTA 链接，两页复用。

### 数据流

- **个股页**：`deriveValuationVerdict(...)` → `stockHandoffFor(verdict, ticker, lang)` → `<DiscoveryHandoff {...cta} lang={lang} />`，放在 `OwnershipConsensusPanel` 之后。
- **投资人页**：`strikeCount = holdings.filter(h => verdicts.get(tk)?.inStrikeZone).length` → `investorHandoffFor(strikeCount, person, lang)` → `<DiscoveryHandoff .../>`，放在 `StrikeZonePicks` 之后。

## ① 状态 → 文案映射（合规核心）

英文为同义纯英文版（不混排）。`{T}`=ticker，`{P}`=person，`{k}`=只数。

**个股页**（按 verdict 档位）：

| 状态 | 文案（zh） | 链接 |
|---|---|---|
| `inStrikeZone === true`（最先判定，coverage/bucket 不再细分） | "{T} 现价落在保守价值带下方。看全市场还有哪些落在击球区 →" | `/{lang}/stocks/screener?view=strike_zone` |
| `below` 非 inStrikeZone | "{T} 现价低于保守价值带。按安全边际浏览全部低估股 →" | `?view=below` |
| `within` / `above` | "{T} 现价不低于保守价值带。看看现在哪些股票落在击球区 →" | `?view=strike_zone` |
| verdict=null / `reliable=false` / 无 coverage | "浏览全部可估值股票，按价值带排序 →" | `/{lang}/stocks/screener` |

**投资人页**（k = 该投资人持仓落在击球区的只数）：

| 状态 | 文案（zh） | 链接 |
|---|---|---|
| k>0 | "{P} 有 {k} 只持仓现价落在击球区。看全市场击球区清单 →" | `?view=strike_zone` |
| k=0 | "{P} 当前无持仓落在击球区。按价值带浏览全市场 →" | `?view=below` |

eyebrow（zh / en）："下一步 · 值不值" / "Next · is it cheap"（mono、绿色克制，定稿即此，纯函数随文案一并返回）。

设计意图：把"这一只 / 这个人的持仓"延伸到"整个机会集"。措辞中性——"看看哪些落在击球区"是观察邀请，非"该买"。

## ② screener 可排序

- 加 URL 参数 `?sort=holders`（缺省/非法 → `margin`，即现状）。
- 视图分段控件旁加一组 mono 小切换（纯 `<Link>`、零 JS、同款样式）："按安全边际 / 按持有机构"（en: "By margin / By holders"），保留当前 `view`。
- 排序在**内存**对已读 ≤200 行做：`sort=holders` → `holderCount desc`，并列再 `marginPct desc`。不开第二条查询路径。
- 在 `strike_zone` 视图 + `sort=holders` 下 = "最便宜且共识最强"置顶。
- `holderCount` 列与 join 保持原样，零迁移。

## 放置与设计语言

- 个股页：`DiscoveryHandoff` 放 `OwnershipConsensusPanel` 之后（估值/共识叙事收尾接"去看更多"）。
- 投资人页：放 `StrikeZonePicks` 之后（延续"这个人的击球区"→"全市场击球区"）。
- 外观：`rounded-md` 面板 + 绿色 mono eyebrow + 一句 line（`--tt-text`）+ mono CTA（`→`，hover 转 `--tt-accent`）。仅 `--tt-*` token。

## 错误处理 / 降级

- verdict=null / 无估值 / `reliable=false` → 个股页走兜底档（generic 文案 + `screener` 根链接）。
- 投资人页无 verdicts（env/表缺）→ k=0 档。
- `strikeTotal`/数字不可知 → 文案不带数字，仍给链接。
- `sort` 非法 → 落 `margin`。
- 任一读取失败一律返回兜底，绝不抛错（沿用 graceful degradation）。

## 测试

- `src/lib/discovery/discoveryHandoff.check.ts`：裸 `cd web && npx tsx ...` 跑（纯函数、无 server-only）。覆盖个股四档 + 投资人 k>0 / k=0 + null 兜底 + 链接 href 正确（含 lang 前缀与 view 参数）。
- `npx tsc --noEmit` 全绿。
- 三页 curl view-source 验 SSR 出链接；dark/light + 390/768/1280 人工 QA。

## 分解为执行块（建议）

1. **块 A — 纯函数 + 测试**：`discoveryHandoff.ts` + `.check.ts`（裸跑通过）。
2. **块 B — RSC 组件 + 两页接线**：`DiscoveryHandoff.tsx` + 个股页 `deriveValuationVerdict` 接线 + 投资人页 strikeCount 接线。
3. **块 C — screener 可排序**：`?sort=holders` 参数 + 切换控件 + 内存排序。

A→B 有依赖；C 独立，可并行。
