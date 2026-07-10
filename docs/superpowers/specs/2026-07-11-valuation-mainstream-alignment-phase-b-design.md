# 估值对齐主流公式 Phase B — 设计

**日期**：2026-07-11
**分支**：`feat/valuation-mainstream-alignment-b`（off `db-foundation`，含 Phase A / PR#155）
**前置**：Phase A 已合并（终值 Gordon 带 / net-net ⅔ 双层 / SBC 披露）。设计文档见 `2026-07-10-valuation-mainstream-alignment-design.md`。

## 目标

对齐 Damodaran / Greenwald 主流口径，收口 Phase A 的一个后遗症并补齐 Graham 优先股正确性：

1. **quick_check 基线改 H-model** —— 解 Phase A 引入的 screener 过度抑制皱褶。
2. **net-net NCAV 减优先股** —— 补齐 Graham 精确清算口径。

**明确不做（移入 Phase C）**：#2 重置价值改毛 PP&E。它性质不同（新增 SEC 抽取字段 + 迁移列 + 重跑整轮 SEC fundamentals 写生产 + 资产侧「全额加回累计折旧 vs 打折」的估值判断），且利好重资产老经济股、对轻资产科技股几乎无影响，与 Phase C 的重置价值/行业化改造（R&D 摊销、SG&A 资本化、行业 β）同类，一起做更内聚。

## 背景：Phase A 的皱褶

`ownerEarningsDcf.ts` 的 `quick_check` 是可靠性闸（喂 `assessReliability` → `deriveValuationVerdict` 的 `reliable`）。当前实现：

- `neutral.per_share` = PV(10 年显式 OE，g1 衰减) + PV(终值 Gordon at gTerminal)（Phase A 后含终值增长）。
- `quickPerShare = oe0 / discount.midpoint / shares`（**零增长**资本化）。
- `quickDev = |neutral.per_share − quickPerShare| / quickPerShare`，`> 0.5` → flag。

问题：neutral 含增长、baseline 零增长 → **任何真成长股都必然偏离 >50%**，flag 误触 → `reliable=false` → 在 screener 被藏（`reliable` 是三面口径闸）。这不是在测「模型不稳定」，是在测「有没有增长」。Phase A 抬高中枢档后此皱褶显性化，把一批 5–7% CAGR 优质成长股藏起。

## 组件 1 — quick_check 改 H-model 基线

**性质**：纯引擎，零数据，`tsc` + `.check.ts` 可验，不碰生产。

**文件**：
- 改：`web/src/lib/valuation/ownerEarningsDcf.ts`（`deriveOeDcf` 内 baseline 计算）
- 改：`web/src/lib/valuation/types.ts`（`quick_check_per_share` 等字段注释）
- 改：`web/src/lib/valuation/deriveValuationVerdict.ts`（`assessReliability` 上方 quick_check 语义注释，约 L59）
- 测试：`web/src/lib/valuation/ownerEarningsDcf.check.ts`

**算法**：把零增长 baseline 换成 Damodaran 两阶段线性衰减闭式解（H-model），用与 neutral 档**同一套输入**：

```
gS = g1                      // 近期增长（stage-1）
gL = gTerminal               // 封顶终值增长（Phase A：min(dgs10, 3%GDP, g1)；下滑/高杠杆股为 0）
r  = discount.midpoint       // 与 neutral 档同一贴现率
H  = PROJECTION_YEARS / 2    // = 5

V             = OE0 × [ (1 + gL) + H × (gS − gL) ] / (r − gL)
quickPerShare = V / shares
quickDev      = |neutral.per_share − quickPerShare| / quickPerShare
quick_check_flag = quickDev > QUICK_CHECK_DEV_FLAG    // 阈值维持 0.5
```

**关键性质**：
- 分母 `r − gL`：gL=gTerminal ≤ 3%、r ≥ ~9% → 恒 ≥ 6%，无爆炸风险；无需额外 `MIN_RG_SPREAD` 兜底。
- `gTerminal = 0` 时（下滑/高杠杆/或 g1=0）退化为 `V = OE0 × (1 + H·g1) / r`，仍捕捉近期增长——不把成长当不稳定。
- 语义从「DCF vs 零增长资本化」变为「DCF vs 同增长假设的闭式解」。偏离 >50% 现在真的意味着离散 10 年分档 DCF 与平滑闭式解显著背离 = 模型对分档/贴现异常敏感，才是名副其实的可靠性信号。
- 阈值维持 `QUICK_CHECK_DEV_FLAG = 0.5`：H-model（假设增长从第 0 年即线性衰减）与本引擎（前 5 年恒定 g1、后 5 年衰减）有结构性差异，健康名通常 <15%；真发散是 2–3×，0.5 足以分开两者。

**字段/接口不变**：`quick_check_per_share` / `quick_check_deviation_pct` / `quick_check_flag` 名称与类型保持；只改计算与注释语义。`assessReliability` 逻辑不变（仍读 `quick_check_flag`）。

**测试**：
- 高 g1 成长股（如 g1=8–10%、gTerminal>0）：旧零增长口径 `quickDev>0.5` 会 flag；新 H-model 口径 `quickDev<0.5` 不 flag。
- 真发散名（人为构造 neutral 与 H-model 偏离 >50%，如极端 r−g 压缩或分档畸形）：仍 flag。
- `gTerminal=0` 退化路径：baseline 仍随 g1 变化（非纯 oe0/r），断言其 >零增长值。
- 既有断言（`quick_check_flag` 为 boolean 等）保持通过。

## 组件 2 — net-net NCAV 减优先股

**性质**：引擎 + 轻插桩。`preferred_equity` 概念标签（`fundamental-tags.ts`）+ DB 列（迁移 `20260613_expand_fundamentals_fields.sql`）均已存在 → **无新迁移、无 SEC 重抓**。

**文件**：
- 改：`web/src/lib/valuation/types.ts`（`ValuationFloorYear` 加 `preferred_equity?: number`）
- 改：`web/src/lib/valuation/fundamentalsToFloorInput.ts`（映射 `preferred_equity: u(r.preferred_equity)`）
- 改：`web/src/lib/valuation/netNet.ts`（`computeNetNet` 加可选入参 `preferredStock?`；删 L45 「Phase B 补」注释）
- 改：`web/src/lib/valuation/epvFloor.ts`（L152 `computeNetNet` 调用传 `preferredStock: latest.preferred_equity`）
- 测试：`web/src/lib/valuation/netNet.check.ts`

**算法**：

```
ncav = currentAssets − totalLiabilities − (preferredStock ?? 0)
```

Graham 精确口径：优先股有优先于普通股的求偿权，普通股每股 NCAV 须先扣优先股账面。缺失时 `?? 0` 恒等降级（对无优先股的绝大多数公司零行为变化）。

**测试**：
- 有优先股用例：`{currentAssets:1000, totalLiabilities:400, preferredStock:100, shares:100}` → ncav=500、per_share=5（对照无优先股的 6）。
- 不传 `preferredStock`（undefined）→ 与旧行为等价（恒等降级）。
- 既有断言（缺字段/负 NCAV/股数非正/⅔ 买入线/80% 折让闸）全部保持。

## 部署与数据

- **无迁移**：两组件都靠已存在的字段与列。
- **re-ingest**：合并后跑一次 `cd web && npm run valuation:ingest`（写生产 Supabase，届时另行取得授权 + 确认 env）。这正是 Phase A 推迟的那次重跑——现在 quick_check 皱褶已修，可安全重跑，让「可靠性修正」+「优先股口径」一起落到 screener/首页快照。
- 个股页卡片纯页面派生，下次 deploy 自动生效，无需 ingest。

## 验证

- `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
- `cd web && npx tsx src/lib/valuation/netNet.check.ts`
- `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
- `cd web && npx tsc --noEmit`
- 不跑 `next build`（本机 Google Fonts 屏蔽，非代码问题）。

## 守则

守 `valuation-philosophy-constraint`：OBSERVATION 非推荐，不放松安全边际门槛。组件 1 只修「可靠性判定的公平性」（不再把增长误判成不稳定），不动价值带底/安全边际口径。组件 2 使 NCAV 更保守（扣优先股），方向与保守估值一致。
