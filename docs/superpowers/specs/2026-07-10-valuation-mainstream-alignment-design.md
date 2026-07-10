# 估值引擎主流对齐 v3 — 设计文档

日期：2026-07-10
分支基线：db-foundation
状态：Phase A 待实现；Phase B/C 为路线图

## 背景与目标

对现有 valuation 引擎（`web/src/lib/valuation/`）逐个方法与主流开源/学术公式做了对照（Damodaran、Greenwald 原著二手教材、simplywall.st 公开方法论、Mauboussin SBC 论文、Oppenheimer 1986）。核心指导原则由用户确定：

- **对齐主流正确算法**，不为保守而保守。
- 分期落地：先做零新数据依赖的 **Phase A**，需数据字段的 **Phase B**、需外部数据集+行业映射的 **Phase C** 后续各自开规格。
- 股权成本终点确定为**行业自下而上 β**（Phase C），但按分期推进。

对照后的关键判定（含一处反转）：

| # | 方法 | 现状 | 主流正确做法 | 结论 |
|---|---|---|---|---|
| 1 | 重置价值 | 有形净资产 + R&D(5年一刀切) | 毛PP&E + 资本化30% SG&A/3年 + R&D按行业分档 | 三块全需 B/C 数据 → 并入 B/C |
| 2 | DCF 终值 | 零增长 `OE/r` | 带上限 Gordon，g=min(无风险利率,GDP≈3%) 与贴现率同源 | **Phase A**：零增长做底 + 封顶 Gordon 做中枢 → 带宽 |
| 3 | Net-Net | 触发=`P<全额NCAV`（唯一无安全边际口径） | 全额NCAV(减优先股)=资产底信号；⅔NCAV=买入线 | **Phase A**：拆双层（减优先股留 B） |
| 4 | 股权成本 | 固定 9–11% 带（隐含 β≈1） | `Ke=DGS10+行业β(夹0.8–2.0)×4.5%ERP`（simplywall.st 口径） | **Phase C** 终点 |
| 5 | SBC | 不加回、只披露 | **就是 Damodaran 主流严谨派**，非过度保守 | **Phase A**：仅加"回购≠回馈"披露 |

**#5 的反转**：原以为"对科技股过度保守"。研究结论——"不加回 + 用摊薄股数"恰是 Damodaran 主流做法；真正失真的是"加回 SBC 却用当前股数"（会**高估**科技股）。引擎分母已用摊薄股数（`share_count_basis: "diluted"`），故只需补披露。

## 数据层可行性核对

`ValuationFloorYear`（`types.ts`）现有字段：`sga_expense` ✅、`stock_based_comp` ✅、`share_repurchases` ✅、`ppe_net` ✅（但**无累计折旧/毛PP&E**）、`rd_expense` ✅、`current_assets`/`total_liabilities` ✅、`shares_diluted` ✅。**无优先股字段、无行业/SIC 字段**。

因此重置价值三块（毛PP&E 需累计折旧、R&D 分档需行业、SG&A 门控需行业）与 Net-Net 减优先股、行业 β，全部落 B/C。Phase A 仅含零新数据的三项。

---

## Phase A — 详细设计（本次实现）

### A1 · 终值 Gordon 带宽（`ownerEarningsDcf.ts`）

**动机**：零增长永续 `OE₁₀/r` 是主流谱系里最保守一端，系统性低估优质复利股。量化：r=10% 时 Gordon(g=2.5%) 终值比零增长高 +37%，g=4% 时高 +73%；终值通常占 DCF 内在价值 60–80%。主流最标准落点是**带上限 Gordon**（Damodaran 铁律 + simplywall.st 原样实现）。

**设计**：保留三档 tier 结构（pessimistic/neutral/optimistic），只把终值增长率 `gTerminal` 参数化到 `dcfTier`：

- 新增常量：
  - `GDP_NOMINAL_CAP = 0.03`（名义 GDP 长期上限，g 的封顶之一）。
  - `MIN_RG_SPREAD = 0.03`（`r − g` 的最小间距，防终值爆炸）。
- 修改 `dcfTier(oe0, g1, r, shares)` → 增参 `gTerminal`：
  - `gTerminal > 0` 且 `r − gTerminal ≥ MIN_RG_SPREAD` 时：`TV = OE₁₀ × (1+gTerminal) / (r − gTerminal)`；
  - 否则退回 `TV = OE₁₀ / r`（零增长）。
- 各 tier 的 `gTerminal`（在 `deriveOeDcf` 内计算，函数签名不新增外部依赖）：
  - **pessimistic**：`gTerminal = 0`（**保留零增长底，安全边际锚不动**）。
  - **neutral / optimistic**：
    ```
    base = min(discount.dgs10_value ?? 0.025, GDP_NOMINAL_CAP)   // g 与贴现率同源(复用 DGS10)
    gTerminal = min(base, g1)                                     // 永续不快于近期 stage1
    if (declined || floor.high_leverage_warning) gTerminal = 0    // 恶化/高杠杆不给终值增长
    // 若 r − gTerminal < MIN_RG_SPREAD，dcfTier 内自动退回零增长
    ```
    其中 `declined` 引擎已有；`high_leverage_warning` 从 `floor` 读取（`deriveOeDcf` 已接收 `floor`）。
- **输出形状不变**：`per_share_low` 仍 = pessimistic（零增长底）、`per_share_high` = optimistic（Gordon 抬升）→ 天然接现有 `strikeZone` 5/6 档价值带。`terminal_share_pct` / `terminal_dependency_flag` 按 neutral 档重算（用其 `gTerminal`）。
- 新增 provenance/披露字段（`OeDcfAssessment` 内，供卡片展示）：
  - `terminal_growth`（neutral 档实际用的 g）、`terminal_method`：`"gordon_capped" | "zero_growth"`。
  - 披露文案："终值用带上限 Gordon 永续，g = min(10Y 国债, 名义 GDP 3%) 且不快于近期增速；悲观档保留零增长作安全边际底。"
- `reconcileMethods` 无需改（仍读 tiers）。

**边界**：`dgs10` 不可用时 `base` 退 2.5%；`g1=0`（无增长/数据不足）时 `gTerminal=0` 自动退回零增长——即无增长证据的票行为与现状一致，只有有正增长证据且 reliable 的票获得 Gordon 抬升。

**验证**：更新 `ownerEarningsDcf.check.ts`——新增用例：(a) 优质增长票 neutral/optimistic 终值 > 零增长且 low 档不变；(b) `declined` 票全档退回零增长；(c) 高杠杆票退回零增长；(d) `r−g` 触及下限时 clamp。

### A2 · Net-Net ⅔ 双层（`netNet.ts` + 两处消费方）

**动机**：现 `isNetNetTriggered` 用 `P < 全额NCAV`，是所有主流口径里**唯一无安全边际**的。学术黄金标准（Oppenheimer 1986）= 全额 NCAV + ⅔ 买入线；Graham 原文明确 `P ≤ ⅔ × NCAV`。区分"识别信号"与"买入触发"是标准做法。

**设计**（`netNet.ts`）：
- 新增常量 `GRAHAM_NCAV_BUY_FRACTION = 2 / 3`。
- 拆为两个判定函数（保留 `NETNET_MAX_DISCOUNT = 0.8` 数据存疑闸于两者）：
  - `isNetNetAssetFloor(lamp, price)`：`price < per_share`（全额 NCAV）且折让 ≤ 80% → **资产底信号**（= 现 `isNetNetTriggered` 逻辑）。
  - `isNetNetBuy(lamp, price)`：`price ≤ per_share × GRAHAM_NCAV_BUY_FRACTION` 且折让 ≤ 80% → **Graham 买入区**。
- 删除 `isNetNetTriggered`（仅两处消费方，均在本次更新，无需保留别名）。
- `computeNetNet` 公式暂不动；加代码注释标注"减优先股为 Phase B（数据层无优先股字段）"。

**消费方改动**：
- `deriveValuationVerdict.ts:157`：`netNet` 字段现 `{ perShare, triggered }`。扩为 `{ perShare, assetFloor: boolean, buy: boolean }`（或保留 `triggered=assetFloor` 并新增 `buy`）。verdict 徽章/结论用 `buy` 判"便宜可买"，用 `assetFloor` 判"存在清算底"。
- `EarningsPowerFloorCard.tsx:364`：`netNetTriggered` 拆为 `assetFloor` / `buy` 两态，文案分别为"存在清算资产底（净流动资产 > 市值）"与"进入 Graham 买入区（现价 ≤ ⅔ 净流动资产）"。中英文案各一版（禁混排，见项目文案纪律）。

**验证**：`netNet.check.ts` 新增：`P` 在 `(⅔NCAV, NCAV)` 之间 → assetFloor=true、buy=false；`P ≤ ⅔NCAV` → 两者 true；折让 > 80% → 两者 false。

### A3 · SBC "回购≠回馈"披露（`epvFloor.ts` buffett lamp / snapshot）

**动机**：处理逻辑已达标（不加回 + 摊薄股数 = Damodaran 主流派）。唯一升级是 Mauboussin 洞见：大额回购常年仅够抵消 SBC 稀释时，不应视为净回馈，应作可信度信号。

**设计**：
- 不改 owner-earnings 计算、不加回 SBC。
- buffett lamp 已有 `sbc_to_oe_pct`。新增判定：读 `share_repurchases` 与 `stock_based_comp` 的多年均值（`share_repurchases` 存储可能为负的现金流出，取绝对值/magnitude 对齐 SBC 的正费用口径），当 `avg(|share_repurchases|) ≤ avg(stock_based_comp)`（回购未超 SBC）→ 置 `buyback_offsets_sbc = true`，附披露文案"回购主要抵消 SBC 稀释，非净回馈"。仅在两字段均有数据时判定，否则不置该信号。
- 该信号接现有 `quality_status` 可信度闸的定位（不改估值数值，仅作展示/可信度提示）。
- 卡片 SBC 披露区展示该文案（已有 SBC/OE 披露锚点）。

**验证**：`epvFloor.check.ts` 新增：`share_repurchases ≈ stock_based_comp` → `buyback_offsets_sbc=true`；无回购/回购远超 SBC → false。

---

## Phase B — 路线图（需数据层加字段，后续开规格）

- **重置价值·毛PP&E**：normalize 层（`@/lib/sec/normalize-facts`）新增累计折旧 / 毛 PP&E 字段；`reproductionValue.ts` 用毛值（净值 + 累计折旧）近似重置成本替换净账面。方向性上调，修正对重资产股的系统性低估。数据在 10-K 现成。
- **Net-Net 减优先股**：normalize 层加优先股字段；`computeNetNet` 改 `NCAV = 流动资产 − 总负债 − 优先股`（Oppenheimer 精确口径）。多数美股无优先股，缺字段时降级为现口径。

## Phase C — 路线图（需外部数据集 + 行业映射，后续开规格）

- **股权成本·行业自下而上 β（#4，终点）**：
  - 引入 Damodaran 年度行业无杠杆 β 表（免费，年度同步一次）。
  - 建 ticker → 行业映射（复用引擎已有 SIC/行业字段，若无则新建）。
  - `Ke = Rf + βL × ERP`，`Rf = DGS10`（可 5 年均值平滑，学 simplywall.st）、`ERP = 4.5%`（与 OE-DCF 现有口径统一）、`βL = βU × (1 + (1−t)×D/E)`，夹 0.8–2.0。
  - 替换固定 9–11% 带；低 β 稳健股与高 β 周期股不再共用贴现率。
  - 工程难点：ticker→行业映射 + D/E 数据质量（total_debt 覆盖已知有缺口）。
- **重置价值·R&D 按行业分档**：软件 3 年、工业/一般 5 年、制药/航空 10 年（Damodaran 分档），替换现全场 5 年。
- **重置价值·资本化 SG&A（行业门控）**：资本化 30% SG&A（区间 20–50%，消费品牌高端、纯 B2B/大宗 = 0），3 年直线（或 Peters-Taylor 20%/年永续）。**必须行业门控**，否则对 B2B/大宗股失真地高估资产底——故绑定行业映射，与 R&D 分档同期。

## 主流来源锚点

- 终值/贴现率：Damodaran《Closure in Valuation》、simplywall.st `Company-Analysis-Model/MODEL.markdown`（g = 10Y 国债、Rf = 10Y 5 年均值、ERP = Damodaran 隐含）。
- Net-Net：Graham《The Intelligent Investor》⅔ working-capital 原文；Oppenheimer 1986 (FAJ)。
- SBC：Damodaran《A Primer on Free Cash Flows》/ "accounting nightmare" 博客；Mauboussin & Callahan, Morgan Stanley Counterpoint Global 2023。
- 重置价值：Greenwald《Value Investing》二手教材（StableBread / Old School Value）；Damodaran R&D 资本化；Peters-Taylor (2017 JFE) 无形资本（SG&A 30% / 20%年、R&D 15%年）。

## 验证策略

沿项目既有约定：每个引擎文件配套 `.check.ts`（纯函数断言，`tsx` 运行）；改动同步更新对应 `.check.ts`。渲染层受 Google Fonts 屏蔽无法本地 `next build`，用 `tsc` 当类型门 + 真 loader 跑数据层 QA（见 memory）。Phase A 全为纯函数改动，`.check.ts` + `tsc` 可完整覆盖。
