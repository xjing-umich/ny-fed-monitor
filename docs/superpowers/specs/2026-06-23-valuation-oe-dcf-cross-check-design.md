# Spec B · Buffett Owner-Earnings DCF（作 Greenwald 夹逼/对账）— 设计

**日期：** 2026-06-23
**状态：** 设计已确认（折现=活DGS10 / 终值=零增长 / 呈现=夹逼），待用户审阅 → writing-plans
**对应路线：** 估值腿（值不值）· 第二内在值法 + 两法夹逼 · [[prd-roadmap]] · 硬约束 [[valuation-philosophy-constraint]]
**权威口径：** `formulas.md §8`(OE-DCF 三阶段) `§9`(危险信号+对账 DCF≈EPV+GV±20%) `§10`(WACC/MOS/OE Yield) + `buffett-valuation` SKILL.md §8
**基线：** `origin/db-foundation`（引擎 v2 已产 `buffett_epv.normalized_earnings`=真OE、`growth_value`、Greenwald 合理价头条=`max(AV,EPV)+GV` 区间；macro 层有 DGS10）
**前序：** `2026-06-22-greenwald-fair-value-headline-design.md`（Spec A 头条，已上线，文末引用本 Spec B）

> **勘误（2026-07-19）：** `coverage` 不等于 Greenwald 成长上限与 OE-DCF 的“夹逼”/对账。`coverage=full` 表示零增长 EPV 与 OE-DCF 均在；夹逼是否可用看 `reconciliation.comparable`。完整定义见[估值编排清晰化设计](2026-07-19-valuation-orchestration-clarity-design.md#32-coverage-新定义非-null-verdict-时)。

---

## 0. 为什么做这个（补两法夹逼）

引擎 v2 + Spec A 给了完整 Greenwald 合理价（`max(AV,EPV)+GV`）。但 skill 把**稳健判断**定义为 **Buffett OE-DCF 与 Greenwald 两法夹逼的交集**（`buffett §9 验证3`、`formulas.md §9` 对账 `DCF≈EPV+GV±20%`）。本 spec 加**第二条独立内在值法**（Buffett 三阶段 OE-DCF），**但产品面不是再出一个目标价，而是和 Greenwald 合理价做夹逼/对账**——两法一致才是高置信，分歧>20% 则诚实标"假设需复查"。

**根本挑战（合规）：** buffett-valuation skill 是交互式教练流（用户逐步选增长/折现/终值），本层要**确定性 + 零目标价**。做法：每个危险旋钮都取**最保守确定值**，输出**区间**，呈现为**夹逼**而非点位。

**纯新增纯函数 + 一个 macro 读 + 卡片夹逼段，不碰引擎 v2 纯函数 / ingest / 价格层。**

---

## 1. 确定性保守 OE-DCF（formulas.md §8，每个旋钮取最保守）

纯函数 `deriveOeDcf(floor, discount, now)`，输入全来自引擎 v2 输出 + DGS10：

### 1.1 OE 基数
`OE = buffett_epv.normalized_earnings`（引擎 v2 已算的真 owner earnings = 多年正常化「净利+D&A−维持capex」）。不可评估 → 本层不输出。

### 1.2 增长路径（三阶段，业绩封顶，确定性）
- `g1 = clamp(自身历史 OE/净利 CAGR, 0, GROWTH_CAP=0.10)`（与引擎 v2 GV 同口径、同上限）。历史下滑→g1=0。
- 阶段1（Y1–5）= g1；阶段2（Y6–10）= 线性 fade g1→0；阶段3（Y11+）= **零增长**。
- **不发明乐观预测**：增长绑自身已证实业绩 + 硬封顶 + fade，全外显。

### 1.3 折现率（活 DGS10 锚，canon §10 + 数据准确性规则）
- 读最新 `DGS10`（FRED 10Y 美债，via 市场数据层/`referenceRates`），**标 as-of date**。
- 带：`r_aggressive = DGS10 + 0.025`（中性 Buffett，国债+2–3%）；`r_strict = 0.10`（严格门槛/股市基础回报）。
- 值区间：高端用 `r_aggressive`，低端用 `r_strict`（保守端=高折现）。守序：`r_strict ≥ r_aggressive`；若 DGS10≥7.5% 致倒挂 → 取 `[min,max]` 并标注。
- **DGS10 读不到 → 退回引擎 8–10% 带 + 标"未锚实时美债"**（优雅退化）。

### 1.4 终值（零增长，避开最危险旋钮）
- `TV = OE_10 / r`（OE_10 = 第10年 OE；零增长永续）。**不用 Gordon、不用退出倍数**（躲 (r−g) 陷阱与退出倍数判断）。
- **危险诊断（仍输出，skill 纪律）**：`terminal_share_pct = PV(TV)/总现值`；>70% → 标"估值高度依赖远期"。

### 1.5 桥与每股
- **无企业→股权桥**：OE 自净利起（已含息、是股权流），**不加净现金、不减债**——与引擎 v2 owner-earnings 灯一致（加桥会重扣利息，审计已确认）。明确标注（与 skill §8 "+净现金"的偏离 + 理由）。
- 每股 = 内在价值 / 稀释股数。
- **输出三档**（pess/neutral/opt，镜像 GV）：由（增长 × 折现）配对——pess=(½g1, r_strict)、neutral=(g1, 中点 r)、opt=(g1, r_aggressive)。

### 1.6 危险诊断行（skill §9/§10，作诚实披露非判决）
`terminal_share_pct`（>70%标）、`oe_yield = 每股OE/价` vs DGS10（差>300bps 标）、快检 `OE×合理倍数带` 偏离>50% 标。

---

## 2. 两法夹逼 / 对账（§9，**产品核心面**）

纯函数 `reconcileMethods(greenwaldFairValue, oeDcf, price)`：
- 两区间：Greenwald = v2 `epv.ceilings`（`max(AV,EPV)+GV` 三档）；Buffett = 本层 OE-DCF 三档。
- **一致性读数**（观察，非判决）：
  - 价格 < 两区间下沿 → "两法都显示安全边际"
  - 价格 ∈ 两区间 → "落在两法价值区间内"
  - 价格 > 两区间上沿 → "高于两法价值"
  - 两区间中点偏离 >20%（`formulas.md §9` 对账线）→ "**两法分歧 >20%，假设需复查**"（诚实，非判决）。
- 退化：Greenwald 或 OE-DCF 任一不可评估 → 只显存在的那个 + 标"无法夹逼"。

---

## 3. 可视化（RSC、零 hydration）

卡片新增"两法夹逼"段：Greenwald 区间 vs Buffett OE-DCF 区间**并排**（同数轴或两条带）+ 当前价标记 + 一致性读数句 + 危险诊断行（终值占比/OE yield）+ 折现率 as-of(DGS10 date) + 强制免责。沿用 `--tt-*`、font-mono、无 `"use client"`。

---

## 4. 架构与文件

- 新增 `web/src/lib/valuation/ownerEarningsDcf.ts` + `.check.ts` — `deriveOeDcf` + `reconcileMethods`。
- 改 `web/src/lib/valuation/types.ts` — `OeDcfAssessment`（三档区间 + 危险诊断 + 折现 provenance）、`MethodReconciliation`。
- 新增/复用 macro 读：`web/src/lib/managers/`（或 market 读层）取最新 DGS10 `{value, date}`（server-only，cache）。
- 改 `web/src/app/[lang]/stocks/[ticker]/page.tsx` — 取 DGS10 + 算 `oeDcf`/`reconciliation`，传卡片。
- 改 `web/src/components/valuation/EarningsPowerFloorCard.tsx` — 夹逼段。
- **不碰**：引擎纯函数（epvFloor/growthValue/…）、ingest、`/research`、价格层。

---

## 5. 测试（[[no-tests-solo-dev]]）

`ownerEarningsDcf.check.ts`（`npx tsx`）：
- 三阶段增长（g1 封顶[0,10%]、Y6–10 线性 fade、Y11+ 零增长）、历史下滑→g1=0。
- 折现带由 DGS10 推（含倒挂守序）、DGS10 缺→退回 8–10% 带。
- 零增长终值 = OE_10/r、`terminal_share_pct` 计算 + >70% 标。
- 无桥（不加净现金不减债）、三档每股、危险诊断（OE yield/快检偏离）。
- `reconcileMethods`：四种一致性读数边界、分歧>20% 标、任一法缺→不夹逼。
- 退化：OE 不可评估→无输出；外国 filer→无输出。
- 合规：输出无 BUY/SELL/目标价/评级字样。

集成：`tsc --noEmit` + `npm run build`（worktree 真包）。真数据 QA（拷 `.env.local`）：GOOG/MSFT 两法区间应大致同量级（验对账）、价格落点一致性读数合理；一只历史下滑票 g1=0；DGS10 as-of 在位。

---

## 6. 合规护栏（底线不变，本层最敏感）

- **绝无单一内在值/目标价**：OE-DCF 永远三档区间，且主面是"对 Greenwald 的夹逼读数"。
- 无 BUY/SELL/HOLD/评级；一致性读数=观察，判断交用户。
- 每个危险旋钮取最保守确定值（零增长终值、严格折现端、业绩封顶增长），假设全外显。
- 标来源：OE 财年、DGS10 as-of、增长 CAGR 窗口、退化项（无桥、未锚美债 fallback、终值占比>70%）。

---

## 7. 交付边界与后续（v3 候选）

本 thread 仅产 spec + plan，执行在独立 worktree/分支（从 `origin/db-foundation` 切）。
- **v3**：退出倍数终值交叉验证、SOTP 分部估值（多业务质量差异大的 GOOG/META/AMZN/BRK，skill §8 强制）、Graham 历史盈利法第四验证、逐公司 WACC。
