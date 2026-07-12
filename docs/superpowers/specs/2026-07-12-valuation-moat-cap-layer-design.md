# 护城河 → 竞争优势期(CAP)层（估值改造 Phase 2）— 设计

- 日期：2026-07-12
- 分支：`plan/valuation-moat-cap-layer`（off `db-foundation` @ 3cc6fa8）
- 状态：设计已认可，待落计划
- **执行依赖**：应在 Phase 1（反向 DCF 预期层，[[valuation-reform-expectations-roadmap]]）合并**之后**执行——本层修改 Phase 1 复用的共享投影 `projectOe`/`dcfTier`。
- 上位：[[valuation-reform-expectations-roadmap]]、[[valuation-mainstream-alignment]]（只温和抬上沿/不放松买点）、[[valuation-philosophy-constraint]]（禁投机/找借口）

## 一、目标与背景

Phase 1 让优质股「开口」（反向 DCF 说出隐含预期）；但优质股的**内在值天花板本身**仍系统性偏低——现价相对 $61–$117 带永远「远高于价值」。根因（Phase 2 摸底确认）：**我们的竞争优势期(CAP)系统性偏短一半**。

现状：
- Greenwald 增长价值 `growthValue.ts` 已实现「护城河→duration→溢价」，但 duration 仅 `DURATION_STRONG=10 / DURATION_MODERATE=8`（Morningstar 宽护城河≈20）。
- OE-DCF `ownerEarningsDcf.ts` 的显式期 `PROJECTION_YEARS=10` **固定、完全无视护城河**（fade：Y1–5 恒 g1、Y6–10 线性归零）。

**本层做什么**：把 CAP 按护城河分级并拉长到主流水平，**只抬乐观上沿、不动保守地基**，让优质股从「荒诞地高于 $61 地基」变成「可信地相对一个护城河调整后天花板」。

**关键定调（防走偏）**：目标**不是**让价值带包住现价（那是 GF Value「追涨泡沫」、给市价找借口）。目标是给一个**可辩护的、按护城河分级的天花板**；优质股仍常高于它——**这没关系**，那段交给 Phase 1 反向 DCF 解释。Phase 2 让「地基→天花板」可信，Phase 1 解释高出部分在赌什么，两层咬合。

## 二、非目标（YAGNI）

- **不动保守地基/买点闸**：悲观档与 `valueFloor`（击球区/安全边际的锚）恒零增长，一行不改。
- **不动终值**：仍 GDP 封顶、零超额（Morningstar Stage 3 同款）。CAP 只延长**显式超额回报期**。
- **不做**同业相对/历史倍数（Phase 3）。
- **不以护城河放松**可靠性闸或买入门槛——护城河只进入估值引擎抬内在值，不进 `assessReliability`（守 [[valuation-mainstream-alignment]]）。

## 三、分级 CAP（叉口已定：强≈20 年，两条腿都改）

| 护城河档 | 判据 | CAP（显式超额回报年数） |
|---|---|---|
| **强franchise** | `EPV/AV ≥ MOAT_STRONG_MULTIPLE(2.0)` **且** dual-AV 通过 **且** 耐久性闸通过（见 §五） | **≈20** |
| **中franchise** | franchise 信号（`EPV/AV ≥ 1.25`）但未达强档，或强档但耐久性闸未过 | **≈10** |
| commodity / value_destruction / 非 franchise | — | **0**（无延长，保持现状短/零超额） |

作用于**两条腿**（叉口②：1 和 2）：
1. **Greenwald 增长价值 duration**：`DURATION_STRONG 10→~20`、`DURATION_MODERATE 8→~10`。
2. **OE-DCF 显式期**：把 `PROJECTION_YEARS` 固定 10 参数化为 moat-CAP，重设计按 CAP 伸缩的 fade 曲线（有界高增长子段 + 长线性 fade 到终值）。

## 四、只抬上沿（严守不放松买点）

- 延长的 CAP **只作用于中性/乐观档**（贡献 `rangeHi`）。
- **悲观档保持基线 CAP（零增长底）**，`valueFloor`/击球区/安全边际的锚**完全不变**——买点闸纹丝不动。
- 结果：优质股 `rangeHi` 上移 → bucket 从「above_optimistic」更可能落到「within/approaching」→ 判定有梯度；而「便宜到有安全边际」仍由不变的保守底裁定。

## 五、耐久性证据闸（20 年是最敏感旋钮，闸必须硬）

CAP 20 年约能让天花板翻倍，是最强抬值杠杆。故**强档 CAP 必须挂可验证证据**，任一不满足 → 降到中档或不延长：
1. `EPV/AV ≥ 2.0` 且 dual-AV 通过（现有强franchise 判据）。
2. **盈利未下滑**：复用 OE-DCF `declined` 标志——周期峰值幻觉不配长 CAP。
3. **无 AI-hog / 高杠杆红旗**：复用现有抑制闸。
4. **ROIC > 资本成本 在可得历史上稳定**：从 NOPAT / 投入资本（复用 `growthValue`/reproduction 口径）逐 FY 年算 ROIC，要求窗口内多数年 > 贴现率。**只吃 `fiscal_period=FY` 行**（[[cusip-corruption-episode]] 数据准确性纪律），稳健度量（非单年）。实现前先核实 ROIC 可从现有口径干净算出；不可靠则本条降级为「franchise 稳定性」近似并显式披露。

## 六、终值方法论红利（诚实标注，支持 20 年选择）

CAP 拉到 20 年后，终值（最脆的一块）占总值比例**下降**，更多价值落在显式期——Mauboussin「长显式期降低终值敏感性」。故 20 年不只抬值，还让估值**更稳**。这是选 20 年的方法论依据，非副作用。

## 七、与 Phase 1 的组合（共享投影接缝）

Phase 1 的 `solveImpliedGrowth` 复用 `dcfTier`。Phase 2 让 `projectOe`/`dcfTier` 接受 CAP 参数后：
- Phase 1 的反向解必须传入**同一个 moat-CAP** → 优质股隐含增长自动变低（护城河越宽、要求的额外增长越少）——数学自洽、是正确行为。
- 两层接缝须一起测：同一票，CAP 变长 → rangeHi 升、Phase 1 隐含增长降，方向一致。

## 八、呈现与透明度（别悄悄抬值，披露旋钮）

- 估值卡/带自动反映升高的 `rangeHi`（现有基元）。
- **显式披露 CAP 假设**：估值小节标注「假设宽/窄护城河 · 竞争优势期约 N 年」+ 判据一句话（EPV/AV 比、耐久性）。守我们「每个数字可追溯」的碾压项——抬值的杠杆必须可见、可辩。
- 无买卖/目标价措辞。

## 九、留存 / 降级 / 数据准确性

- CAP 档 + 年数 + 判据写进 `valuation_snapshot.payload`（jsonb，无需改表）。
- 耐久性闸/ROIC 只吃 FY 行；缺数据 → 不延长 CAP（退回基线），非报错。
- 非 franchise / 抑制闸触发 → CAP=0，行为等同现状（安全降级）。

## 十、测试与验收

纯函数 `.check.ts`：
1. 护城河档 → CAP 映射：强+稳定→~20；强比率但 `declined`→降中档~10；非 franchise→0。
2. 只抬上沿：延长 CAP 后悲观档/`valueFloor` 数值**不变**，仅 `rangeHi` 升。
3. 单调：CAP↑ → rangeHi↑（其余不变）。
4. Phase 1 组合：同票 CAP↑ → `solveImpliedGrowth` 隐含增长↓。
5. 耐久性闸：ROIC 不稳/盈利下滑 → 不给强档 CAP。
6. `npx tsc --noEmit` 零错；部署后真数据抽查（AAPL/GOOGL/MCO 等强护城河股天花板升高但**不等于**现价、周期股不受益）。

## 十一、触及文件清单

- 改 `web/src/lib/valuation/growthValue.ts`：`DURATION_STRONG/MODERATE` 提高；护城河分级 → CAP。
- 改 `web/src/lib/valuation/ownerEarningsDcf.ts`：`projectOe`/`dcfTier`/`PROJECTION_YEARS` 参数化为 moat-CAP；fade 曲线按 CAP 伸缩；悲观档保持基线。
- 改 `web/src/lib/valuation/epvFloor.ts`（或新建 `moatCap.ts`）：护城河档 → CAP + 耐久性闸（含 ROIC 稳定性）。
- 改 `web/src/lib/valuation/impliedExpectations.ts`（Phase 1）：`solveImpliedGrowth` 传入 moat-CAP。
- 改 `web/scripts/valuation-ingest.ts` + `valuationSnapshot.ts`：CAP 判据写入/读回 payload。
- 改 `web/src/app/[lang]/stocks/[ticker]/page.tsx` / `EarningsPowerFloorCard.tsx`：披露 CAP 假设。
- 新建对应 `.check.ts`。
