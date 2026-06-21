# 估值引擎 v2·对齐原典（Greenwald 三层 + 真 Buffett OE）— 设计

**日期：** 2026-06-21
**状态：** 设计已校验（公式/理论独立审计通过），待用户审阅 → writing-plans
**对应路线：** 估值腿（值不值）· sub-PRD「引擎对齐原典」· [[prd-roadmap]]
**硬约束：** [[valuation-philosophy-constraint]]（禁 BUY/SELL/目标价/评级；输出=保守内在价值区间+安全边际%+护城河+位置，判断交用户）
**权威口径来源：** `/Users/junlinzhu/.claude/skills/_shared/value-investing/formulas.md`（§1–§10，三个估值 skill 共用单一真相源）+ `greenwald-valuation` / `buffett-valuation` SKILL.md
**基线：** `origin/db-foundation`（已含 `web/src/lib/valuation/` v1 引擎、`company_fundamentals_periods` 富表、`getLatestPrice`/`getPriceHistory`）

---

## 0. 为什么做这个（诊断）

现 v1 引擎是「挂着 Greenwald/Buffett 名字的零增长净利 EPV」，对着权威口径逐条核，有三处**实质偏离**（均被引擎自己的 method 注脚诚实标注，是简化而非错误）：

| 部件 | 权威口径 | v1 实际 | 偏离 |
|---|---|---|---|
| EPV | `(NOPAT+D&A−维持capex)/WACC` | 假设维持capex=D&A=0，无 AI 大户规则 | 🔴 招牌 AI 巨头 EPV 系统性高估 |
| Owner Earnings | `净利+D&A−维持capex±ΔNWC` | `=多年净利均值` | 🔴 实为正常化净利，非真 OE |
| 资产层 AV | `有形净资产+资本化R&D+资本化品牌`（重置价值） | `=有形账面` | 🔴 误区#1（账面冒充重置价值），对研发密集公司低估 AV |
| 护城河 | EPV vs **重置价值** | EPV vs **账面** | 🟠 系统性高估护城河 |
| Greenwald GV | §6 完整公式 | **无** | 🔴 缺第三层 |

**根因（已查实）：** 三处 🔴 所缺数据**全部已入库**——`20260613_expand_fundamentals_fields.sql`（注释「for valuation」）已加 `d_and_a/capex/rd_expense/sga_expense/stock_based_comp/interest_expense/share_repurchases/working_capital/current_assets/current_liabilities/ppe_net/operating_cash_flow` 列，且 `normalize-facts.ts`+`fundamental-tags.ts` 确实从真 XBRL 标签抓取写入。**只是 `fundamentalsToFloorInput.ts` 没映射、`epvFloor.ts` 没读。** 故本 spec 把已入库字段接进引擎，修这三处 🔴 → 做成**忠实的 Greenwald 三层 + 真 Buffett OE**。

**交付边界：** 本 spec 只做**引擎纯函数层**。呈现层（估值带 + 价格位置 + 历史估值锚 + 三档敏感性可视化）另起 spec，叠在忠实引擎上。

---

## 0.5 前置验证（撞全局数据准确性硬规则，plan 第 0 步）

`d_and_a/capex/rd_expense/working_capital/ppe_net` 这些列**列在 ≠ 跨 13F 全集有值**（per-company XBRL 标签覆盖不一；normalize-facts 里这些字段「intentionally do NOT gate quality」即可能为 null）。**plan 第 0 步：有凭据环境核这些列在 13F 全集的填充率**，据此定每字段退化分支覆盖面。引擎每个字段走「可评估/退化」分支（沿用现有 `assessable` 模式），**任一字段缺失 → 该灯/该层退化、不崩、诚实标注**。

---

## 1. 已校验的公式口径（落地基准）

> 以下每条均对照 `formulas.md` + 独立方法论审计（2026-06-21）定稿。审计修正 6 处见 §1.7。

### 1.1 维持性 capex（formulas.md §3，四法取中位）

纯函数 `maintenanceCapex(years)`：
1. **D&A proxy** = 当期 `d_and_a`
2. **Greenwald 销售法** = `总capex − median₅(ppe_net/revenue) × ΔRevenue`
   — ⚠️ `median(PP&E/Sales)×ΔSales` 本身是**成长capex**，维持capex = 总capex 减它（审计修正 #1）
3. **PP&E/使用寿命** = `ppe_net / 寿命`（寿命带 7–15 年，取中性 10 年；走敏感性）
4. 业务逻辑锚 — 确定性引擎做不了逐行业判断 → **v2 略**（仅 1–3 取中位）

- 取可得方法**中位数**；方法间分歧 >50% → `maint_capex_confidence: "degraded"` 标注。
- **AI 大户规则**（§3 强制）：`capex_t / capex_{t−2} ≥ 2` → 维持capex 下限 = `capex_t × 0.5` + `ai_capex_distortion_warning: true`。
- 反向陷阱护栏：绝不用全额 capex 当维持性。

### 1.2 EPV — Greenwald 获利能力价值（§4，**写法 A**）

```
EPV(Biz)   = (NOPAT + D&A − 维持capex) / WACC
NOPAT      = 正常化EBIT × (1 − 正常化税率)
正常化EBIT = ≥5年平均营业利润率 × 最新可持续收入
EPV(Equity)= EPV(Biz) + 超额现金 − 有息负债
每股       = EPV(Equity) / 稀释股数
```

- **写法 A（审计修正 #2）**：维持capex 从税后 NOPAT 中**全额现金扣除、不再乘 (1−税)**。拒绝 `formulas.md` 的「等价写法」B（`[EBIT−max(0,维持capex−D&A)]×(1−税)`）——B 给超额 capex 套了当期不该有的税盾，违背 capex 资本化的税法实质。当 `维持capex=D&A` 时退回简化口径 `NOPAT/WACC`，与 A 一致。
- **杜绝双重扣除**：严禁 `NOPAT − 维持capex`（D&A 已在 EBIT 内扣过）。
- 折现率：保留披露带 `[0.08, 0.10]`（低杠杆/净现金近似），高杠杆（净债/权益>1.0）降级警示（v1 已有）。逐公司 WACC（§10 分档）留 v3。
- D&A 半税盾（Greenwald 保守细节 `平均D&A×0.5×税率`）：v2 **不做**，列 v3 候选 + 落地核原书第 8 章（审计提示二手源写法有出入）。

### 1.3 Owner Earnings — Buffett（§1，零增长地板灯）

```
Owner Earnings = 净利润 + D&A − 维持capex        （地板灯：去掉 ΔNWC）
地板值         = OE / 折现带[0.08,0.10]          （已是股权流，无企业→股权桥）
每股           = 地板值 / 稀释股数
```

- **ΔNWC 只入 GV（审计修正 #3）**：零增长 = 营运资本存量恒定 → 维持性 ΔNWC ≈ 0，故**地板灯不扣 ΔNWC**；成长驱动的 ΔNWC 归 GV 层（§1.6）。这是对 Buffett「维持竞争地位与单位销量所需」限定词的忠实执行，且避免与 GV 双算。
- **SBC（审计 #6）**：净利已扣 SBC，**保持原样**——不加回（违 Buffett 1998）、不重扣。另输出 `sbc_to_oe_pct` 披露（真实稀释成本）。
- 折现：本灯理论上应用股权成本（高于 WACC），v2 仍用同一 8–10% 带 → 微欠折现/微高估，**诚实标注**，v3 修。

### 1.4 资产价值 AV — Greenwald 重置价值（§5）

```
AV          = 有形净资产 + 资本化R&D (+ 资本化品牌)
有形净资产  = 股东权益 − 商誉 − 收购无形
资本化R&D   = Σ rd_expense(t) × (N − (当前年 − t)) / N     （N 默认 5 = Greenwald 默认）
每股        = AV / 稀释股数
```

- 修掉 v1「账面冒充重置价值」（误区#1）。资本化 R&D 用已入库 `rd_expense` 历史直线摊销。
- **资本化品牌：v2 略**——需逐公司判断（KO 资本化、GOOG/META/AAPL 不），确定性引擎做不了 → 默认不资本化（保守，对消费品牌偏低，**标注**）。
- 退化：`rd_expense` 全缺 → AV 退回有形账面 + 标注（即 v1 行为）；无形字段缺 → 总账面回退（v1 已有）。

### 1.5 护城河 — Franchise 检验（§4）

```
EPV > AV  → franchise（真护城河），Franchise Value = EPV − AV
EPV ≈ AV  → commodity（普通生意）
EPV < AV  → value_destruction（疑价值陷阱，不给击球区）
```

- 比较对象改为 **EPV vs AV(重置价值)**（v1 是 EPV vs 账面）。
- 阈值沿用具名常量 `MOAT_FRANCHISE_MULTIPLE=1.25` / `MOAT_COMMODITY_FLOOR=0.75`（比 canon 的 >1 更严，留安全垫，**标注为本站启发式**）。

### 1.6 Greenwald 成长价值 GV（§6，真·主轴上沿，护城河开闸）

```
GV = 年成长再投资 × (ROIIC − WACC)/WACC × Duration年金系数
年成长再投资 = 总capex − 维持capex + ΔNWC        （略净并购 → 偏保守，标注）
ROIIC = N年NOPAT增量 / Σ(年成长再投资)            （累积口径，5y窗口）
Duration年金系数 = [1 − 1/(1+r)^N] / r
合理价(Greenwald) = max(AV, EPV) + GV
```

- **护城河开闸**：仅 `franchise` 才算 GV；`commodity`/`value_destruction` → **GV = 0**（格林沃尔德原教旨）。
- **ROIIC（审计修正 #4）**：用累积成长投资分母（与上面「年成长再投资」项同源自洽，避免与 Mauboussin Δ投入资本口径勾稽错配）；**端点对齐**——分母排除窗口末 1–2 年未兑现的成长投资（消累积口径残留低估偏差）；严格只放成长性投资，不混维持性。
- `ROIIC ≤ WACC → GV = 0`（增长本身不创造价值，只有高回报增长才创造）。
- Duration N 按护城河强度：强 franchise 15–20 / 中 10–15 / 弱 5–10 / 无 0；**保守取低端**（强=10、中=8…具名常量，plan 定）。
- **三档敏感性**（skill 强制）：悲观/中性/乐观 = (低/中/高 ROIIC × 短/中 Duration)。
- ΔNWC 来自 `working_capital` 年差（成长部分），与 §1.3 地板灯不重复。

### 1.7 审计修正汇总（2026-06-21 独立方法论审计）

1. 维持capex 销售法：`总capex − PP&E/Sales×ΔSales`（原误把成长capex 当维持capex）
2. EPV 用写法 A（维持capex 全额现金扣，不套税盾）；拒写法 B
3. 零增长地板 OE 去掉 ΔNWC（维持性≈0），ΔNWC 只入 GV → 杜绝双算
4. ROIIC 用累积成长投资分母 + 窗口端点对齐 + 严格只放成长
5. WACC vs 股权成本：v2 单带简化，标注，v3 分档
6. SBC 保留在净利、不加回不重扣，另作披露

---

## 2. 架构与文件

延续现有确定性流水线（纯函数 + `.check.ts` via `npx tsx`，RSC，零运行时 LLM）。

**新增：**
- `web/src/lib/valuation/maintenanceCapex.ts` + `.check.ts` — §1.1 四法取中位 + AI 大户规则（整个 v2 拱顶石）
- `web/src/lib/valuation/reproductionValue.ts` + `.check.ts` — §1.4 AV 重置价值（资本化 R&D）
- `web/src/lib/valuation/growthValue.ts` + `.check.ts` — §1.6 Greenwald GV

**改：**
- `web/src/lib/valuation/types.ts` — `ValuationFloorYear` 加 `d_and_a/capex/rd_expense/sga_expense/stock_based_comp/working_capital/ppe_net/operating_cash_flow`；新增 `MaintCapex`/`ReproductionValue`/`GrowthValue` 类型 + 扩 `ValuationFloor`（GV 层、franchise value、三档、置信度/警告标）
- `web/src/lib/valuation/fundamentalsToFloorInput.ts` — 映射上述新字段
- `web/src/lib/valuation/epvFloor.ts` — EPV 用写法 A + 维持capex；OE 用真 owner earnings（去 ΔNWC）；护城河改 EPV vs AV；接 GV
- `web/src/lib/sec/read.ts` — 确认 `FundamentalPeriod`/annual 行透出新列（`select("*")` 已透，按需补类型）

**不碰：** ingest（数据已入库）、`/research`（孤岛）、价格层、Finnhub。

---

## 3. 测试（[[no-tests-solo-dev]]，不引测试框架）

各 `.check.ts`（`npx tsx`）断言：
- **maintenanceCapex**：四法中位、分歧>50%降级标、AI 翻倍规则触发（capex_t/capex_{t−2}≥2 → 0.5×capex 下限+警告）、销售法=总capex−成长capex、字段缺退化。
- **reproductionValue**：资本化 R&D 直线摊销（N=5 权重 5/5…1/5）、AV=有形净资产+R&D、rd 全缺→退有形账面、无形缺→总账面回退、负有形→不可评估。
- **EPV（写法A）**：维持capex 全额扣不套税盾、维持capex=D&A 退回 NOPAT/WACC、杜绝双重扣除、企业→股权桥(+现金−债)、高杠杆降级。
- **Owner Earnings**：=净利+D&A−维持capex、**不含ΔNWC**、不加回SBC、SBC/OE%披露、负→不可评估。
- **护城河**：EPV vs AV 三档（franchise/commodity/value_destruction）、阈值边界。
- **GV**：护城河开闸（非franchise→0）、ROIIC≤WACC→0、累积ROIIC+端点对齐、Duration 按护城河强度、三档敏感性、ΔNWC 不与地板重复。
- **退化矩阵**：任一新字段全缺 → 对应层退化、页不崩、诚实标注。

集成：`npx tsc --noEmit` + `npm run build`（worktree 需 `npm ci` 真包，见 [[worktree-build-needs-real-node-modules]]）。

**真数据 QA**（需 Supabase 凭据，把主 checkout `web/.env.local` 拷进 worktree）：
- AAPL/GOOG/META：验 **AI 大户 EPV 被正确压低**（维持capex>D&A）、R&D 进 AV、franchise、GV 三档合理。
- 一只无 R&D/无护城河票：AV=有形账面、GV=0、commodity/value_destruction。
- 一只 `working_capital`/`capex` 缺的薄票：对应层退化、页 200。

---

## 4. 合规护栏（底线不变）

- 仍**无 BUY/SELL/目标价/评级**。skill 的「击球区/合理区/观察区/高估区」四区**不照搬成判决**。
- 引擎输出 = 保守内在价值**区间**（AV / EPV / GV 三档）+ Franchise Value + 安全边际%（呈现层算）+ 护城河方向 + provenance；**位置由用户自判**。
- 每个结论标来源（SEC XBRL 派生字段）+ as-of + 用了哪些财年 + 退化/简化项（品牌略、并购略、单带 WACC、半税盾未做）。

---

## 5. 交付边界与后续

本 thread 仅产 spec + plan，执行在独立 worktree/分支（从 `origin/db-foundation` 切）。
- **后续呈现层 spec**：估值带（地板 max(AV,EPV) → 上沿 +GV）+ 价格位置 + 历史估值锚 + 三档可视化，叠在本引擎上。
- **v3 候选**：逐公司 WACC（§10 分档）、股权成本 vs WACC 分离、D&A 半税盾、资本化品牌、净并购入 GV、Buffett 三阶段 OE-DCF（§8，与 GV 对账 ±20%）。
