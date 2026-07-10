# formulas.md ↔ 产品引擎对齐笔记（Task 4）

**日期：** 2026-07-11  
**分支：** `fix/valuation-fy-drift-and-stale`  
**权威源（仓外）：** `/Users/junlinzhu/.claude/skills/_shared/value-investing/formulas.md`  
**本文件：** 仓内摘要 only — 不替代 formulas.md；历史 valuation specs 不重写。

## 对齐要点（已写入 formulas.md）

| 节 | 产品引擎行为 | formulas 口径 |
|---|---|---|
| §4 EPV | write A：`(NOPAT + D&A − maint) / WACC`（`epvFloor.ts`） | 主公式 = write A；旧税前调整式标为弃用 / 仅当 maint≈D&A 等价 |
| §3 AI-hog | `max(median, min(0.5×capex, D&A))`；触发 → `reliable=false` + GV=0 | 与 `maintenanceCapex.ts` / `growthValue.ts` / `deriveValuationVerdict` 一致 |
| §5 AV | `AV_repr = AV_cons + 0.5×(GW+intangibles)`；franchise 须双过 1.25× | 与 `reproductionValue.ts` + `MOAT_FRANCHISE_MULTIPLE` 一致 |

## 非目标

- 不重写 `2026-06-21-valuation-engine-v2-canonical-design.md` 等历史规格全文。
- 不做 Task 5 全量验证套件（仅文档对齐）。
