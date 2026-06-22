# Spec A · 把完整 Greenwald 合理价 (max(AV,EPV)+GV) 提为头条 — 设计

**日期：** 2026-06-22
**状态：** 设计已确认，待 writing-plans
**对应路线：** 估值腿 · 呈现层 · [[prd-roadmap]] · 硬约束 [[valuation-philosophy-constraint]]
**基线：** `origin/db-foundation`（+ 已开但未合的 v2 价值带 PR `feat/valuation-presentation`；本 spec 在其之上或其后落地）
**前序：** `2026-06-22-valuation-presentation-band-design.md`（v2 价值带，已交付）
**配套：** Spec B `2026-06-22-owner-earnings-dcf-design.md`（OE-DCF 增长腿，独立大 spec）

---

## 0. 病灶（呈现框架弱点）

`formulas.md §6`：`Greenwald 合理价 = max(AV, EPV) + Growth Value`。但当前卡片**头条是零增长 EPV**（两盏灯 $68–86 / $67–84），GV 只藏在 v2 价值带的三条上沿刻度里、且引擎 `ValuationFloor` 没有一个合并好的 `greenwald_fair_value` 字段。读者第一眼永远看到最保守那个数 → 观感"低估、没加 GV"。

本 spec 把**完整 Greenwald 合理价（max(AV,EPV)+GV）显式提为一等头条数字**，让读者直接看到"地板 → 合理价"，而不必从带的上沿自己推。**纯呈现 + 一个派生数字，零数据风险，不碰引擎纯函数/ingest/价格层。**

---

## 1. 派生（确定性，全部来自已产出字段）

```
EPV_low / EPV_high  = 现 strikeZone.epv.floorConservative / ceiling（可评估灯的 min low / max high）
AV_ps               = asset_floor.per_share（可评估时）
valueFloor          = max(AV_ps, EPV_low)        // 地板保守端（已在 v2 epv.valueFloor）
base                = max(AV_ps, EPV_high)        // 零增长价值顶（已在 v2 epv.base）
fairValue[s]        = base + growth_value.per_share[s]   // s∈{pess,neut,opt}；= v2 epv.ceilings[s]
```

- **完整 Greenwald 合理价 = `fairValue`（= v2 价值带的三条上沿）**。本 spec 不新算任何东西，只是把这三档**作为头条"合理价区间"显式呈现**，并配一行"地板 $X → 合理价 $Y–$Z（含护城河增长）"。
- GV 坍缩（gated/不可评估，如 MA/AAPL）→ `fairValue` 坍缩回 `base` → 头条诚实写"合理价 = 零增长价值 $base，未计增长价值（原因）"。这正是 Apple 这类收割型的诚实读数。
- floor undefined（外国 filer）→ 整段不渲染（page 已门控）。

## 2. 呈现改动（RSC，复用 v2 组件）

- `EarningsPowerFloorCard` 头部区（EPV 两灯之下、价值带之上）加一行**头条合理价**：
  - GV>0：`Greenwald 合理价 $pess–$opt / 股（地板 $valueFloor · 零增长顶 $base · +护城河增长）`，中性值 `$neut` 加粗。
  - GV 坍缩：`Greenwald 合理价 ≈ $base / 股（零增长价值，未计增长价值 — {原因}）`。
- 强制保留免责 + as-of/财年/退化项 stamps（沿用 v2）。无 BUY/SELL/目标价/评级 —— 头条是"合理价区间"非买卖点。
- 复用 v2 的 `perShare`/`usd` helper、`--tt-*`、`font-mono tabular-nums`、无 `"use client"`。

## 3. 架构与文件

- 仅改 `web/src/components/valuation/EarningsPowerFloorCard.tsx`（加头条合理价行；数据全取自已传入的 `floor` + `strikeZone.epv`）。
- 可选：在 `strikeZone.ts` 的 `epv` 上加一个语义别名 `fairValue`（= 现 `ceilings`）便于卡片读，或卡片直接读 `ceilings`。倾向**不加字段，卡片直接读 `ceilings`/`base`**（YAGNI）。
- **不碰**：引擎纯函数、ingest、价格层、page.tsx。

## 4. 测试与验收

- 无新引擎逻辑 → 无新 check 断言（数字 = v2 已测的 ceilings）。`tsc --noEmit` 绿。
- 真数据 QA（[[local-build-google-fonts-blocked]] 用 tsx 绕渲染或看页）：MSFT/GOOG 头条显"合理价 $X–$Y（含增长）"；MA/AAPL 头条显"合理价 ≈ 零增长价值，未计增长价值"。

## 5. 合规与边界

无判决/目标价；头条是"区间"非点位；每结论标 as-of/退化项。本 spec 仅呈现层小改，与 Spec B（OE-DCF）独立、可先行单独合入。
