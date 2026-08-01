# 件③：盈利力口径剔除投资性重估损益（marks adjustment）

日期：2026-07-26 · 分支：`plan/valuation-ni-marks`（off `origin/db-foundation` @39bcf4c，已含件①②/PR#187）

## 0. 问题与实证（全部真数据核实）

ASU 2016-01 后，持有权益证券的公司 GAAP 净利含**未实现投资损益**，保险集团尤甚。BRK 六年 `GainLossOnInvestments`（含衍生品，比 `EquitySecuritiesFvNiGainLoss` 更完整）：+40.9/+77.6/−67.9/+74.9/+52.8/+39.1B——GAAP 净利被投资 marks 主导，引擎的 owner-earnings 基数失真（BRK.B 在件①修通股数后 above+unreliable 即此病）。

**口径已被巴菲特亲自验证**：`NI_adj = NI − gains×(1−21%)` 得 10.2/28.5/**30.8**/**37.0**/**47.3**/36.1B（FY20-25），与股东信披露的 operating earnings（2022=30.8/2023=37.4/2024=47.4）逐年吻合。剧烈震荡序列变平滑增长经营序列；FY2022 GAAP 亏损年（−22.8B）还原为 +30.8B 真实经营盈利。

**波及面实测**（44 家保险/综合类，|gains 均值|/mean(|NI|) 对齐 FY）：BRK.B 53.4% / MKL 52.8% / RLI 37.4% / WTM 34.4% / RGA 33.1%，随后 **~8pp 天然间隔** → FAF 20.6% / SPNT 16.6% / UNM 16.1% / CNO 15.9% …连续衰减；TRV/PRU/CB/ALL 等 tag 不可得（天然不动）。

**MSTR/crypto 侧**：MSTR 近五年净利全负（FY2025 −3.85B），盈利闸本已压制；ASU 2023-08 gain 侧 tag 在其 companyfacts 尚不存在（只有 `CryptoAssetUnrealizedLossOperating`），且提取框架是单 tag 择优、无法合成 gain−loss 净额。**v1 明确不做 crypto tag**（比提案时的"备位"进一步收缩：无现实收益 + tag 不成熟 + 框架不支持合成，硬塞是伪覆盖），tag 成熟后另案。

## 1. 方案（用户已拍：方案 B + 对称调整）

**材料性阈值 25%，v1 只动五家公司（六个 ticker：BRK.B/BRK.A/MKL/RLI/WTM/RGA）**；阈值利用 33.1% vs 20.6% 的 ~8pp 实测间隔（与件② capex 阈值同款校准法）。**调整对称**：gains 均值为负的票（RGA −0.25B/年）NI_adj 抬升 ~27%，口径一致性优先，验收 sweep 逐票裁决兜底。

## 2. 设计

### 2.1 提取层（SEC ingest）

- migration `web/supabase/migrations/20260726_add_investment_fv_gain_loss.sql`：`company_fundamentals_periods` 加可空 numeric 列 `investment_fv_gain_loss` + `notify pgrst, 'reload schema'`。**须先 apply 到生产再跑 ingest**（否则 upsert 带新键报错）。
- `fundamental-tags.ts`：新流量字段 `investment_fv_gain_loss`，tag 优先级 `["GainLossOnInvestments", "EquitySecuritiesFvNiGainLoss"]`（BRK 两 tag 实测几乎同值，前者含衍生品更完整）。
- `normalize-facts.ts`：字段随 FLOW_FIELDS 自动进 annual/quarterly 序列；`FundamentalPeriod` 类型 + `finalizeRow` 显式映射补一行。**不进 REQUIRED_HIGH**（quality 口径不动）。
- `ttmBasis.ts`：`FLOW_FIELDS` 加该字段（TTM = FY + Σ新Q − Σ同期Q；缺季度值 → 落 `degraded_fields`，回退 FY 原值——下游会因此丢 TTM，见 2.2）。

### 2.2 引擎层（单注入点）

全部调整发生在 `fundamentalsToFloorInput`（NI 的单一入口，下游 Buffett 灯/SGR/结构性置信/oeDcf/TTM 自动吃同一序列，杜绝口径分叉）：

- **启用条件（三闸全过才调，fail-closed）**：
  1. FY 行中每个 `net_income != null` 的年份都有 `investment_fv_gain_loss != null`（整窗覆盖，防序列内口径混杂）；
  2. 对齐年数 ≥ 3；
  3. 材料性 `|mean(gains)| / mean(|NI|) ≥ MARKS_MATERIALITY_MIN = 0.25`。
- **调整**：`net_income_adj = net_income − investment_fv_gain_loss × (1 − MARKS_TAX_RATE)`，`MARKS_TAX_RATE = 0.21` 常量（法定税率；分年 effective rate 被 marks 本身污染不可用；21% 有 Buffett op-earnings 逐年对账背书）。
- **TTM 一致性**：调整启用时，若 `ttmSyn.degraded_fields` 含 `investment_fv_gain_loss`（或 TTM 行该值缺失）→ **丢弃 TTM 整体回退纯 FY**（与 ttmBasis 闸4"核心流量必须真 TTM"同精神）；否则 TTM 行同式调整。
- **披露**：`ValuationFloorInput` 增 `marks_adjustment?: { tax_rate, materiality, per_year: {fiscal_year, pretax, net_income_reported, net_income_adjusted}[] }`；`computeValuationFloor` 透传给 `assembleFloor` 发布到 floor（进 payload），并把说明句并入 `earnings_basis_note`（v1 五票全是无营业利润的单灯保险股，卡片该位置天然渲染；文案英文、跟随既有 method 简化句风格，禁 AI 腔）。

### 2.3 明确不做（v1）

- crypto tag（理由见 §0）；全员无阈值调整（方案 A，回归面不可控）；equity 分母同步调整——**方向不对称**：gains 为正（多数票）时 SGR 的 ROE 分母仍含投资组合 → SGR 偏低，保守方向，接受；gains 均值为负（RGA，见 §0 对称调整）时方向相反——NI 被上抬而 equity 分母不动 → ROE/SGR 偏高、moat cap 上抬，**非保守**。此为用户已拍板的对称调整代价（口径一致性优先于单向保守），非遗漏；阈值下票（FAF 20.6% 及以下）零改动；RGA 上线后随观察项列入合并后运维验收（见 progress.md RGA 证据小节）。

## 3. 验收标准

1. check fixtures（无网络）：整窗覆盖闸（缺一年 gains → 不调）/材料性闸（24% 不调、26% 调）/对称性（负 gains 抬升）/TTM degraded → 丢 TTM/BRK 形态数字对账（NI_adj 复现 Buffett op earnings ±1%）。
2. 真数据探针（只读，live companyfacts → 真 normalize → 真引擎，in-memory）：五票 before/after 对比表（BRK.B 需叠加件①的股数回退 in-memory，若生产行尚无股数）；**BRK.B 预期**：基数从 GAAP 序列切到 ~31.6B 均值的平滑经营序列，verdict 仍 above 但序列平滑后 `oeDcf.declined` 预期解除；RLI/WTM（现 true,below）便宜信号预期**收紧**——方向逐票裁决。
3. 零漂移断言：FAF（阈值下最近邻）/PGR/V/AXP/MSFT 引擎输出与现状逐字段一致。
4. 全部既有 `*.check.ts` + `npx tsc --noEmit` 绿。

## 4. 上线运维（须授权；与件①②欠的四步合并执行）

0. **【终审 Critical·顺序硬约束】apply migration 必须早于合并/部署**：周六 GH Actions 全量 fundamentals（~1.6k 票）与周日 Vercel cron 跑合并后代码，若列不存在，`ingest.ts` 的 upsert 会对每票 throw、整条数据线断更。列可空，提前 apply 对旧代码零影响。
1. apply migration（Supabase，先于合并）→ 合并 PR；
2. `npm run sec:ingest -- V / BRK.B / BRK.A / MKL / RLI / WTM / RGA`（新列回填 + 件①股数回退落库）；
3. `npm run valuation:ingest`；
4. 看页：/stocks/BRK.B（调整后带 + 披露句）、/stocks/MKL、/stocks/V、/stocks/AXP；
5. 抽查五票 snapshot 行与阈值下票零漂移。
