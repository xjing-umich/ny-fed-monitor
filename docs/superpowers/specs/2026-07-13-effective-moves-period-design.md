# 动向有效基准季（Effective Moves Period）设计稿

日期：2026-07-13  
状态：brainstorm 已通过（待实现）  
关联：[[2026-06-12-freshness-guard-design]]（聚合动向「只统计全局最新季」口径的修补）

## 1. 背景与问题

生产复现（2026-07-12）：

- 少数 manager 已交 `2026-06-30`，绝大多数仍停在 `2026-03-31`。
- `globalLatestPeriod` = 全站 `max(period)` → `2026-06-30`。
- `currentQuarterOnly` / `computeConsensus` 的 `changesOf` 只保留 `period === max` 的人 → 动向样本近空。
- 结果：Hero 右侧「显著动向」整块不渲染；`/investors/buys`、`/sells` 显示 Data coming soon；`consensus_moves` 表可为 0 行。
- 同时 `consensus_holdings`（985）与 `/investors/consensus` 正常——持仓快照不走「当季变动」过滤。

既有 freshness-guard §C2 写明 buys/sells「只统计全局最新季有申报的 manager」。该规则在**披露季中段**成立时正确，但在**新季刚出现早鸟、尚未成气候**时会把整站动向抬空，并与裸文案「本季 / this quarter」叠加，易被误读成「日历最新季没数据」或「看到的就是最新季」。

## 2. 已拍板的决策

1. **范围**：只修动向有效基准季（Hero 动向、buys/sells、`notableMoves` / `currentQuarterOnly`、`holderDeltas`、`npm run consensus` → `consensus_moves`）。**不做**个股估值空态文案（SNOW 等另案）。
2. **有效门槛（日历 + 覆盖率）**：对候选 `max = globalLatestPeriod(periods)`：
   - 若 `today ≤ max + 45 天`（SEC 截止日前）→ 回退上一季末；
   - 否则若 `filed(max) / total < 0.5` → 回退上一季末；
   - 否则采用 `max`。
   - 覆盖率阈值 `COVERAGE_MIN = 0.5`（相对**追踪总人数**，不是相对已交某人）。
3. **读时与物化同口径**：页面过滤与 `computeConsensus` 写 `consensus_moves` 共用同一 `effectiveMovesPeriod`，避免库与页面分叉。
4. **防误会（双防）**：
   - 主榜只展示已成气候的那一季（不跟早鸟跑）；
   - **聚合动向面**去掉裸「本季 / this quarter」，改为具体 `quarterLabel`（如 `Q1 2026`）。范围见 §C 文案清单（in/out），避免全站误扫个人页「本季动作」。
5. **下一季进度披露**：仅 buys/sells 脚注；Hero 只保留有效季标签，不写「另有 N 位已交下一季」。
6. **脚注**：基准季明示；回退时写原因（截止日前 / 覆盖率 x/y）；若 `maxPeriod > 有效季`，buys/sells 追加「另有 N 位已交 {maxPeriod}」。
7. **持仓共识不动**：`consensus_holdings` / excludeInactive 叠加口径不变；`freshness13F` 仍可用全站 max 做相对落后标注（个人页），不把 stale 阈值改绑到有效动向季。
8. **部署顺序**：`notableMoves` 优先读 `consensus_moves`；仅改读时过滤不够。合并后必须跑一次 `npm run consensus`，否则 Hero/buys/sells 在 DB 快路径下仍可能空或错季。

## 3. 设计

### A. 纯函数（`web/src/lib/freshness/derive.ts`）

零 IO、确定性、可单测。复用既有 `FILING_DEADLINE_DAYS`、`globalLatestPeriod`、`parseUTC` / 季度算术。

```ts
export const MOVES_COVERAGE_MIN = 0.5;

export type EffectiveMovesReason =
  | "due_and_covered"
  | "before_deadline"
  | "low_coverage"
  | "empty";

export type EffectiveMovesPeriod = {
  period: string | null; // 动向基准季 YYYY-MM-DD
  reason: EffectiveMovesReason;
  maxPeriod: string | null; // 全站 max，供脚注「下一季进度」
  coverage: { filed: number; total: number }; // 相对 maxPeriod
};

/** periods = 每位 manager 的 latest.period；today 可注入便于单测。 */
export function effectiveMovesPeriod(
  periods: Array<string | null | undefined>,
  today: Date,
): EffectiveMovesPeriod;
```

算法要点：

1. `total` = 合法 period 条数；`maxPeriod = globalLatestPeriod(periods)`；空 → `{ period: null, reason: "empty", ... }`。
2. `filed` = `periods` 中等于 `maxPeriod` 的个数。
3. 截止日：`deadline = maxPeriod + FILING_DEADLINE_DAYS`（与 `mostRecentDueQuarter` 同语义：严格在截止日之后才算「已到期」）。未到期 → 基准 = 上一季末，`reason: "before_deadline"`。
4. 已到期但 `filed/total < MOVES_COVERAGE_MIN` → 基准 = 上一季末，`reason: "low_coverage"`。
5. 否则基准 = `maxPeriod`，`reason: "due_and_covered"`。
6. 「上一季末」：对季度末日期做固定回退（03-31→12-31 上年；06-30→03-31；09-30→06-30；12-31→09-30）。若回退后的季在 `periods` 中无人申报，仍返回该 period（消费方过滤后为空 + 脚注解释；**禁止**把多季混进同一动向榜）。

### B. 接线

| 位点 | 改动 |
|------|------|
| `aggregations.currentQuarterOnly` | 过滤 `period === effectiveMovesPeriod(...).period`（不再 `=== globalLatestPeriod`） |
| `aggregations.notableMoves` / `holderDeltas` | 经 `currentQuarterOnly` 自动吃到有效季；DB `readConsensusMoves` 快路径仍优先，空则扫描回退（既有）。**故仅合并代码不够：必须重跑 consensus 才能让快路径与有效季对齐** |
| `scripts/lib/computeConsensus.ts` | `changesOf`：仅当 `r.period === effective.period` 时算 changes（写 `consensus_moves`）；holdings 扫描口径不变 |
| `investors/_movesPage.tsx` | 脚注用 `effective`；未计入名单 = `period < effective.period`（仅更早申报者；早鸟 max 申报者只出现在「另有 N 位已交 max」句，勿与「更早」名单重复）；回退原因 + 可选「另有 N 位已交 maxPeriod」；eyebrow / heading / intro 见 §C |
| `HeroMasthead` | 动向面板 `panelTitle` / `quarterTag` → 具体 `quarterLabel(effectivePeriod)`。首页需传入 `effectivePeriod`（与 `notableMoves` 同源）。**左侧品牌行 as-of / `filingFreshness(period)` 仍用全站追踪样本的报告期（今日多为众数季或 index 代表 period），不强制改成有效动向季**——左栏讲「我们在追踪哪一季披露」，右栏讲「动向榜按哪一季统计」，脚注/标签各自诚实 |
| buys/sells metadata + OG | 见 §C in 清单 |

运维：合并后跑一次 `npm run consensus`，确认 `consensus_moves` 非空且与页面口径一致。

### C. 文案清单（in / out）

本轮「去掉裸本季」**只针对聚合动向面**（读者会把「本季」理解成全站动向基准的地方）。个人投资者 / 个股页相对「该户自己的最新申报季」保留「本季」口语，避免一次改爆全站。

**In（必须改成带 `quarterLabel(effective)` 或中性不暗示日历最新季）**

| 面 | 今日裸「本季」位点 | 目标 |
|----|-------------------|------|
| Hero 动向 | `panelTitle` / `quarterTag` | `Notable moves · Q1 2026` / `Q1 2026 显著动向`；标签同 `quarterLabel` |
| buys/sells 页 | eyebrow、heading、intro（`_movesPage`） | eyebrow 例：`13F 动向 · Q1 2026`；heading 可保留「最多人买/卖」语义但去掉或替换裸「本季」；intro 用有效季 |
| buys/sells metadata | `buys/page.tsx`、`sells/page.tsx` title/description | 与页内口径一致，带季或改为中性「最新可比申报季」 |
| buys/sells OG | `buys/opengraph-image.tsx`、`sells/opengraph-image.tsx` | 同上，去掉 `this quarter` 裸写 |
| buys/sells blurb / share | `movesBlurb`、`shareText` 的 buys/sells 分支 | 分享句带有效季或中性「最新可比季」，不写裸 this quarter |

**Out（本轮不改）**

- `nav.ts`「本季最多人买/卖」——导航短标签；点进页后以页内季标签为准（改 nav 易挤版，YAGNI）
- 个人页：`InvestorNarrative`、`InvestorListClient`「本季动作」、`[slug]/page` 清仓标题、AI prompt「称本季」
- 个股页：holders「this quarter +N opened」、`QuarterMovesPill`、stock prose
- Learn 文章、共识持仓 blurb（`consensus` 分支）、哲学向「不是 this quarter's hot trade」

**buys/sells 脚注信息结构**（句子按 copy-voice 收紧；锁定结构不锁死用词）

- 正常采用：`Baseline quarter: {effective}.` + 未计入名单（若有）
- 回退：`Baseline quarter: {effective} ({maxPeriod} not yet at disclosure threshold: before filing deadline / coverage {filed}/{total}). {N} managers have already filed {maxPeriod}.`
- 中文对称：`统计基准季：…（…尚未达到披露门槛：截止日前 / 覆盖率 x/y）。另有 N 位已交 …。`
- Hero：**不**展示下一季 N

### D. 非目标（YAGNI）

- 不做「下一季预览榜」或 Hero 进度条。
- 不改 `consensus_holdings` / 共识持仓页叠加。
- 不改 `freshness13F` 的 0–1 / 2–3 / ≥4 阈值定义。
- 不修个股页「No usable market price」误用文案（SNOW/CRCL）。
- 不改 §C Out 清单中的个人页 / 个股 / nav / learn 文案。

## 4. 验证

- `web/src/lib/freshness/derive.check.ts`：截止日前回退、截止日后低覆盖回退、≥50% 且已到期采用 max、空输入、上一季末算术。
- 人工 / 生产等价分布：Hero 有动向；buys/sells 有榜；脚注含有效季 + 原因 + N（当 max > effective）。
- 人为满足「已到期 ∧ 覆盖率 ≥50%」→ 切到新季。
- `npm run consensus` 后 `consensus_moves` 行数 > 0。
- `npx tsc --noEmit`（web）通过。

## 5. 工程约束

- 先读后写：改 Next 页面前对照 `web/node_modules/next/dist/docs/` 相关指南。
- 用户可见文案遵循 `docs/copy-voice.md` 与 `web/AGENTS.md`。
- 实现前另开 writing-plans → 实现 plan；本文件止于设计。
