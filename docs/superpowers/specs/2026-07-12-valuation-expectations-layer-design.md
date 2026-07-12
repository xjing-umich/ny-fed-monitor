# 反向 DCF「预期合理性」层（估值改造 Phase 1）— 设计

- 日期：2026-07-12
- 分支：`plan/valuation-expectations-layer`（off `db-foundation` @ 3cc6fa8）
- 状态：设计待认可
- 上位纲领：[[north-star-strategy]]（权威站·代表作）、[[valuation-philosophy-constraint]]（禁投机/推荐）、[[product-direction]]（13F×估值×宏观融合）
- 相关既有层：[[valuation-oe-dcf-crosscheck]]（OE-DCF 两法夹逼）、[[valuation-mainstream-alignment]]（A档终值抬上沿/只温和抬上沿不放松买点）、[[valuation-broad-universe-guardrails]]（健壮性/可靠性闸）

## 一、目标与背景（为什么做这一层）

**竞品审计（2026-07-11，真实页面核实）的结论**：我们唯一的差异化是「13F × 值不值」融合，但它**结构性哑火**——估值引擎只有一层「保守价值地基」（Greenwald EPV / OE-DCF / net-net），对优质复利股（AAPL、巴菲特全部持仓）永远判「远高于价值」。证据：Buffett 29 个持仓估值列全是「—」、BELOW BAND=0；击球区里只剩价值陷阱/中概 ADR/困境零售。于是「击球区集合」与「超投持仓集合」天然不相交，融合永远无法触发。

**三组独立竞品/方法研究（Morningstar、GuruFocus/AlphaSpread、Mauboussin/Damodaran）收敛到同一解**：破解「优质股永远太贵」不是放松地基，而是**在地基之上加一层不同提问方向的判断**。本 Phase 1 加的是其中最高杠杆、最契合品牌、零新数据源的一层——**反向 DCF（隐含预期）**。

**这一层做什么**：对地基判「高于价值」的优质股，回答「**贵得合不合理**」。不预测未来，而是把现价当方程，反解出「市场已经 price-in 了多大的增长」，摆到公司**自己**的历史实绩旁，输出一句**只陈述事实、不给买卖**的判断：

> 「现价隐含未来 10 年 owner-earnings 年增 **12%**；它过去实际做到 **8%**。市场在赌它加速。」

这正是 dataroma/WhaleWisdom/券商结构上写不出、且在超投真正持有的票上开口的那句话——融合由此激活。

## 二、非目标（YAGNI / 明确留给后续 Phase）

- **不做**护城河 → 超额回报期（CAP/fade 时长）接线 → **Phase 2**。本层沿用现有 OE-DCF 的固定显式期结构。
- **不做**自身历史倍数回归（GF Value 内核）→ **Phase 3**。
- **不引入**任何分析师一致预期 / Wall St forecast——只用 SEC 历史 + 已持久化的 DGS10 锚。
- **不做**同业 base-rate 对照（需要行业分组，暂缺）——本层只对照**公司自己的历史**。
- **不做**买卖/目标价/评级——只谈「预期合理性」。
- **不改**现有地基层（EPV/OE-DCF/net-net/`deriveValuationVerdict` 的 bucket）——预期层是**并联新增**，地基一行不动。

## 三、方法（反向 DCF，全部复用现有引擎输入）

### 输入（均已存在）
- 现价 `price`、股数 `shares`、`oe0`（当前 owner earnings，来自 `ownerEarningsDcf` 的 lamp）。
- 贴现率 `r`：DGS10 锚定的 midpoint（`discountBand`，已持久化 last-good，见 [[dgs10-anchoring-fix]]）。
- 终值增速上限 `gTerminal`：`min(dgs10, GDP_NOMINAL_CAP)`（现有 `ownerEarningsDcf.ts` 已用）。
- 历史增长 `historicalGrowth`：`netIncomeCagr(windowYears)`（现有函数）。

### 反解
用**与现有 OE-DCF 完全相同的投影结构**（Y1–5 恒增长 `g`、Y6–10 线性 fade `g→gTerminal`、终值 Gordon），把每股内在值写成隐含增长 `g` 的单调函数 `V(g)`。用**有界二分**解出使 `V(g*) = price` 的 `g*` = **市场隐含增长率**。
- `V(g)` 对 `g` 单调递增 → 二分收敛确定、可测。
- 搜索区间 `g ∈ [G_MIN, G_MAX]`（如 `[-0.10, 0.30]`）；越界处理：`price ≤ V(G_MIN)` → 隐含增长 ≤ 下限（已便宜，预期层非主角）；`price ≥ V(G_MAX)` → 隐含增长 > 上限（标注「超 30%/年，罕见」，不外插假精度）。

### 次级量：隐含 CAP（年数）
在**历史增长**假设下，反解「撑住现价需要超额回报再延续多少年」（固定 g=历史增长，解显式期长度 H）。作为**次级句**，不上 masthead（叉口①已定：头条用隐含增长率）。

### 结论三态（预期合理性，非买卖）
以 `g*` vs `historicalGrowth`（记 `h`）：
- `g* ≤ h` → **温和**（市场要求 ≤ 它自己做到过的）
- `h < g* ≤ h × (1+BUFFER)`（BUFFER 如 0.25）→ **公允**
- `g* > h × (1+BUFFER)` 或 g* 超历史峰值 → **苛刻**（赌它超越自己最好水平）

阈值为设计常量，写进纯函数，`.check.ts` 固定。

## 四、呈现（叉口①②已定：隐含增长率领衔 + 双徽章共存）

- **个股页估值小节**新增「价格在赌什么」块：
  - 主句：「现价隐含未来 ~10 年 owner-earnings 年增 **X%**；公司过去做到 **Y%** → 预期【温和/公允/苛刻】。」
  - 次句（隐含 CAP）：「或等价地：撑住现价需其超额回报再延续约 **N 年**。」
  - 可展开：逐年 OE 投影 + 折现因子 + 终值拆解（每个数字追溯 SEC 行——我们对竞品的碾压项）。
- **masthead**：保留现有地基结论徽章（如「ABOVE VALUE」），**旁边并列**一个预期微徽章「预期 · 温和/公允/苛刻」。两个判断各自独立、各自可追溯（叉口②：双徽章共存，不融成单句，避免荒唐组合与推断风险）。

## 五、合规与设计红线

- 全程只谈「市场隐含预期 vs 公司历史」的**事实对照**，无 BUY/SELL/目标价/「该买」。契合 [[valuation-philosophy-constraint]]。
- 隐含数字**永远与历史 base-rate 并排**，禁单独展示（单独看无意义，只有对照才锋利且诚实）。
- 每 locale 纯本语言，仅 `--tt-*` token，纯 RSC 派生（估值在 ingest 期算、页面读快照）。

## 六、护栏（硬编码进引擎，防「给贵估值找借口」）

1. 终值增速封顶名义 GDP（复用现有 `GDP_NOMINAL_CAP`）；贴现用持久化 DGS10 锚，不实时拍（1% 误差 → 25–40% 价值摆动）。
2. **抑制闸**（任一触发 → 不出预期结论，优雅空缺，不误导）：
   - `oe0 ≤ 0`（无正 owner earnings，反解无意义）。
   - 周期/高杠杆：复用现有 `assessReliability` 的红旗（`declined` / `high_leverage_warning` / `ai_capex_distortion_warning` / 极端 OE 收益率）。
   - 数据健壮性：复用 `isImplausibleBand` 思路，坏 shares/拆股不一致 → 抑制。
3. 隐含增长越界（超 `G_MAX`）只标「> 上限，罕见」，不外插精确值。

## 七、数据 / 留存 / 降级

- **留存**：预期字段（`impliedGrowth` / `historicalGrowth` / `tier` / `impliedCapYears?` / `assessable`）写进现有 `valuation_snapshot.payload`（jsonb，**无需改表**）。screener 是否加列筛选留待需要时再定（本 Phase 不加）。
- **写入**：`valuation-ingest.ts` 在现有逐 ticker 估值后附算预期层，塞进 payload。
- **降级**：抑制闸触发 / 缺 oe0 / 缺价格 → payload 无 expectations 字段 → 页面不渲染该块（非 404、非报错）。地基层完全不受影响，可随时部署。

## 八、测试与验收

项目无常驻测试套件（solo dev），纯函数走 `.check.ts`（沿用 `ownerEarningsDcf.check.ts` 模式）。
1. `impliedExpectations.check.ts`：
   - 已知输入 → 解出的 `g*` 使 `|V(g*) − price|` < 容差（二分正确）。
   - 单调性：price↑ → g*↑。
   - 三态阈值：`g*≤h`→温和；`h<g*≤h×1.25`→公允；`g*>h×1.25`→苛刻。
   - 抑制闸：`oe0≤0` / 红旗 → assessable=false。
   - 越界：price 极高 → 「> G_MAX」标记而非 NaN/外插。
2. `npx tsc --noEmit`（`web/` 下）零错。
3. 部署后真数据抽查（tsx 或页面）：AAPL/GOOGL 等优质股应得到「温和/公允/苛刻」而非空缺；巴菲特页估值列不再全「—」。
4. 人工核对合规：无任何买卖/目标价措辞；隐含数字均带历史对照。

## 九、触及文件清单

- 新建 `web/src/lib/valuation/impliedExpectations.ts` — 纯函数：反解隐含增长 + CAP + 三态。
- 新建 `web/src/lib/valuation/impliedExpectations.check.ts` — 纯函数测试。
- 改 `web/src/lib/valuation/types.ts` — 新增 `ExpectationsAssessment` 类型。
- 改 `web/scripts/valuation-ingest.ts` — 附算预期层，写入 `valuation_snapshot.payload`。
- 改 `web/src/lib/valuation/valuationSnapshot.ts` — 读回 payload.expectations（若需强类型）。
- 改 `web/src/app/[lang]/stocks/[ticker]/page.tsx` — masthead 预期微徽章 + 估值小节「价格在赌什么」块。
- 可能改 `web/src/components/valuation/EarningsPowerFloorCard.tsx` — 承载新块（或新建小组件）。

## 十、这一层如何咬合竞争力

竞争力 = 忠于巴菲特地基的诚实（第 1 层）+ 一层别人不做的「反向 DCF 预期判断」（第 2 层），让「聪明钱在买 × 这价格在赌什么」成为全网唯一能说出、且在优质股上开口的那句话。战略（融合）本就对，这一层是让它真正开火的引擎。Phase 2（护城河→CAP）、Phase 3（历史倍数 + 透明度表）在此之上继续加深。
