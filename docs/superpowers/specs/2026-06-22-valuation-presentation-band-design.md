# 估值呈现层 v2·价值带 + 价格位置（接 GV/重置AV/三档）— 设计

**日期：** 2026-06-22
**状态：** 设计已确认（5 档位置 + 历史锚拆出），待用户审阅 → writing-plans
**对应路线：** 估值腿（值不值）· 呈现层 · [[prd-roadmap]] · 硬约束 [[valuation-philosophy-constraint]]
**基线：** `origin/db-foundation`（已含**忠实引擎 v2** PR #74：`graham_epv`/`buffett_epv`/`asset_floor`(重置价值)/`moat_reading`(含`franchise_value`)/`growth_value`(三档) + `strikeZone`(v1 三档)）
**前序：** `2026-06-21-valuation-engine-v2-canonical-design.md`（引擎对齐原典，已上线）

---

## 0. 为什么做这个（病灶仍在呈现端）

引擎 v2 已算出真 Greenwald GV（`growth_value.per_share` 三档）、重置价值 AV、`franchise_value`，**但卡片没读它们**——`StrikeBand.ceiling` 仍 = 零增长 EPV 高端。后果：核心病灶「对优质复利公司零信息」**在呈现端没修**——zone 三档仍用零增长 `floorConservative` 判，好公司价格高于零增长 EPV → 照样显示 "above floor / outside"，和平庸公司无差别。

本层把引擎 v2 已产出的字段接进卡片，把"带"从零增长升级到 `max(AV,EPV) → +GV`，重构价格位置——这是病灶的最终呈现端修复。**纯接已产出字段，零数据风险、不碰引擎、不碰 ingest。**

**历史估值锚（自身历史倍数带）拆出本 spec**：它需多年价格序列（`getPriceHistory` 默认仅 365 天，`prices` 表深度本地查不了），是独立纯函数 + 独立数据核，另起 spec + 数据前置，避免拖累本层零风险交付。

---

## 1. 价值带（接已产出字段，全部确定性）

每股口径，输入全来自 `ValuationFloor`（`asset_floor.per_share` / `graham_epv`/`buffett_epv` 的 `per_share_low|high` / `growth_value.per_share.{pessimistic,neutral,optimistic}`）+ `StrikeZoneAssessment.price`。

```
EPV_low   = min(可评估灯 per_share_low)        // = 现 strikeZone.epv.floorConservative
EPV_high  = max(可评估灯 per_share_high)        // = 现 strikeZone.epv.ceiling（零增长高端）
AV_ps     = asset_floor.per_share（可评估时）

valueFloor          = max(AV_ps, EPV_low)        // Greenwald base 的保守端（驱动击球区）
valueBaseZeroGrowth = max(AV_ps, EPV_high)       // 零增长价值顶
valueCeiling[s]     = valueBaseZeroGrowth + growth_value.per_share[s]   // s∈{pess,neut,opt}
```

- 天然单调：`valueFloor ≤ valueBaseZeroGrowth ≤ ceiling_pess ≤ ceiling_neut ≤ ceiling_opt`（GV≥0 且三档有序）。
- **GV 不可评估 / `gated_to_zero`**（无护城河 / ROIIC≤WACC，如 MA）→ 三上沿坍缩到 `valueBaseZeroGrowth`，退回零增长带 + 诚实"无增长价值"标注。
- **AV 不可评估**（如 MA 有形账面为负）→ `valueFloor/base` 用 EPV-only。
- 引擎返回 `undefined`（外国 IFRS filer 如 ASML）→ 整估值段不渲染（page 已有门控）。

## 2. 价格位置（5 档，全程"位置"非判决——直接修病灶）

对 `price.close` 分档（具名常量，沿用 `GRAHAM_MOS=1/3`）：

| # | 条件 | 标签（观察，非买卖） |
|---|---|---|
| 1 | `price ≤ valueFloor×(1−⅓)` | **In strike zone**——连保守地板都≥⅓安全边际（最强，不变） |
| 2 | `valueFloor×⅔ < price ≤ valueFloor` | **Approaching**——逼近击球区，安全边际未及⅓ |
| 3 | `valueFloor < price ≤ valueBaseZeroGrowth` | **在零增长价值区内**（子位：偏下/偏上） |
| 4 | `valueBaseZeroGrowth < price ≤ ceiling_neutral` | **在护城河调整价值带内**——优质公司终于落此有位置，不再一律"太贵" |
| 5a | `ceiling_neutral < price ≤ ceiling_optimistic` | **上沿区**——仅乐观增长情景支撑现价 |
| 5b | `price > ceiling_optimistic` | **高于上沿**——超出即便给足护城河增长的乐观上沿，这才是有依据的"贵" |

- **退化**：GV 坍缩时档 4/5 消失 → 退回 {1,2,3,>base} 四态（=v1 行为 + 诚实"无增长价值"）。
- 每档都是"价格在你保守—乐观区间的位置"，**判断交用户**；无 BUY/SELL/HOLD/目标价。

## 3. 重置价值 AV + 护城河显性化

- 卡片明示 `重置价值 = 有形净资产 $X + 资本化R&D $Y`（用 `asset_floor.tangible_net_assets`/`capitalized_rd`/`rd_years_used`），让"为何能合理高于账面"有解释。
- `moat_reading.franchise_value`（EPV−AV 美元溢价）+ signal（franchise/commodity/value_destruction/not_assessable）方向性读数。

## 4. 三档敏感性读出（skill 强制）

一行可读摘要：`若护城河维持 {duration_years} 年、ROIIC≈{roiic}：增长价值 ${per_share.pess}–${per_share.opt}/股`（wacc_band、`gated_to_zero`/`not_assessable` 各自诚实文案）。假设全外显——这是把"机械 DCF"和"诚实区间"区分开的纪律。

## 5. 可视化（RSC、零 hydration、GEO 友好）

升级 `StrikeBand` → 价值带：数轴上 **AV tick · 两盏 EPV 区间带 · valueBaseZeroGrowth 基准线 · 三条 GV 上沿刻度(pess/neut/opt) · 阴影击球区段(≤valueFloor×⅔) · 当前价标记**。配 legend + 位置句 + 三档摘要 + 重置价值/护城河 callout + 强制免责 + 价格 as-of/source 脚注。沿用 `--tt-*`、font-mono tabular-nums、保持无 `"use client"`。

## 6. 架构与文件

- 改 `web/src/lib/valuation/strikeZone.ts`：`deriveStrikeZone(floor, price)` 扩展——纳入 `asset_floor.per_share` 与 `growth_value.per_share` 算 `valueFloor/base/ceiling[3]` + 5 档位置；类型 `StrikeZoneAssessment.epv` 扩展（加 `base`、`ceilings:{pess,neut,opt}`、位置枚举从 3 态扩到 5 档；保留向后兼容字段）。改 `strikeZone.check.ts`。
- 改 `web/src/lib/valuation/types.ts`：扩 `StrikeZone` 枚举 + `StrikeZoneAssessment.epv`。
- 改 `web/src/components/valuation/EarningsPowerFloorCard.tsx`：band 升级 + 5 档位置文案 + AV/护城河/三档 callout。
- `web/src/app/[lang]/stocks/[ticker]/page.tsx`：基本无需改（已传 `floor`(含 growth_value) + `strikeZone`）。
- **不碰**：引擎纯函数（epvFloor/growthValue/…）、ingest、`/research`、价格层。

## 7. 测试（[[no-tests-solo-dev]]）

`strikeZone.check.ts`（`npx tsx`）新断言：
- 价值带单调（valueFloor≤base≤pess≤neut≤opt）、5 档边界（含 ⅓ 临界、neutral/optimistic 上沿临界）。
- GV `gated_to_zero`/不可评估 → 上沿坍缩、退回四态、标注。
- AV 不可评估 → valueFloor 用 EPV-only。
- currency≠USD → 价格段退化（沿用）；floor undefined → 段不渲染。
- 向后兼容：原三档票（GV=0）行为不变。

集成：`tsc --noEmit` + `npm run build`（worktree 需 `npm ci` 真包，见 [[worktree-build-needs-real-node-modules]]）。
真数据 QA（拷主 checkout `web/.env.local` 进 worktree）：**GOOG/MSFT 等优质票现应落档 3/4（带内有位置），不再 "above floor"**（病灶修复验收）；MA（GV=0）退化为零增长带；ASML 整段不渲染；一只深度便宜票落 in_strike_zone。

## 8. 合规护栏（底线不变）

无 BUY/SELL/目标价/评级；5 档全是"价格在保守—乐观带的位置"，判断交用户。强制免责更新：增长价值=护城河开闸+保守+非预测/非目标价。每结论标 as-of/财年/退化项（GV 坍缩、AV 缺、单带 WACC 等）。

## 9. 交付边界与后续

本 thread 仅产 spec + plan，执行在独立 worktree/分支（从 `origin/db-foundation` 切）。
**后续**：历史估值锚（自身历史 owner-earnings/EPV 倍数带 + 当前位置）——独立 spec，先核 `prices` 表历史深度（≥5 年才做）。
