# 估值覆盖缺口修复：分股类经济股数回退 + 金融股口径收敛（件①+件②）

日期：2026-07-26 · 分支：`plan/valuation-multiclass-shares`（off `origin/db-foundation` @18e7958）

## 0. 背景与实证诊断（全部真数据核实，非推测）

用户问题：V / AXP / BRK.B 在站上无法估值。诊断结论是**三种不同的病**：

- **V**：`per_share_unavailable`（`epvFloor.ts` G2 闸）。V 的 A/B/C 三类股经济权利不同，SEC 规则要求股数/EPS 全部带 `ClassOfStockAxis` 维度申报；companyfacts API 在接口层剥掉带维度事实 → us-gaap 股数三 tag + `EarningsPerShareDiluted` 对 V **全部 404**（已逐一 curl 验证）。`dei:EntityCommonStockSharesOutstanding` 只有 2009-2010 两条陈旧行——dei 捷径是死路。
- **BRK.B**：同一道 G2 闸，外加：us-gaap basic 股数 tag 停在 2015-Q3 且是 Class A 等价口径（补股数必须换算成 B 等价，否则每股价值放大 ~1500 倍被 `isImplausibleBand` 拦）；净利含未实现投资损益（件③另案，见 §6）。
- **AXP**：**引擎已跑通**（verdict=above、带 137–296、现价 326），"消失"是 `reliable=false` 被全部聚合面（screener 击球区/低估视图、首页榜、投资人 posture、徽章）过滤。真引擎探针逐位确认元凶 = **`ai_capex_distortion_warning=true` 且 structural_confidence 0.58<0.8**（quick_check/declined/oe_yield/杠杆全未触发）。另有口径 bug：AXP sic=6199，`isFinancialSic` 只认 [6020,6099]∪[6300,6399]，61xx 消费金融（AXP/COF/SYF）漏判为非金融，与 D7 spec"金融豁免"意图不符。

**波及面**：`company_fundamentals_periods` 近一年 FY 行「有净利、缺 `shares_diluted`」共 58 票（含 HSY/COKE/FWONA/FWONK/ERIE 等真·多股权票；混有 MLP/ETF，其 instance 里没有普通股类事实，回退自然找不到、保持诚实空缺）。

## 1. 承重 spike（已跑通，方案的可行性证据）

对 V 与 BRK 最新 10-K 的**提取版 XBRL instance**（`{primaryDocument去掉.htm}_htm.xml`，V 2.5MB / BRK 13.5MB）解析验证：

- **V FY2025**：分股类摊薄 EPS：A=10.20 / B1=15.95 / B2=15.70 / C=40.82；分股类摊薄股数：A=1,966M（**as-converted 经济总股数**，含 B/C 折算）。交叉验证：总净利 20,058M ÷ EPS_A 10.20 = 1,966.5M ✓（偏差 0.03%）。
- **BRK FY2025**：`EquivalentClassBMember` basic 股数 = 2,157.3M（B 等价总股数）；EPS_B=31.04。66,968M ÷ 31.04 = 2,157.4M ✓。BRK 无摊薄工具只报 basic。
- instance 里每份 10-K 带 3 个 FY 的利润表事实（BRK 实测含 FY2023-2025）→ 最近 3 份 10-K 覆盖 6-FY 窗口有余。

**结论**：经济股数可由两条独立路线互证得到，1:1500 之类换算率**由 EPS 比率天然内生**，无需硬编码任何换算表。

## 2. 件① 设计：分股类经济股数回退（解 V/BRK.B 的 G2）

### 2.1 触发条件（窄闸，不动其他票）

`ingestCompany`（`web/src/lib/sec/ingest.ts`）在 `normalizeCompanyFacts` 之后、落库之前：仅当 **annual 全部年份 `shares_diluted == null` 且至少一年 `net_income != null`** 时触发回退。字段已有值的票零影响。

### 2.2 取数

- 从本次已拉到的 `filings`（`normalizeRecentFilings` 产物，含 accession + primary_document）取最近 **3 份 10-K**。
- instance URL = `filingIndexUrl(cik, accession)` + `primary_document.replace(/\.htm$/i, "_htm.xml")`；404 时回退读该目录 `index.json` 找 `*_htm.xml`。
- 请求带 `SEC_USER_AGENT`，间隔 `sleep(300)`，任何失败 try/catch 吞掉并打日志——**回退绝不允许打断主 ingest**。

### 2.3 解析与推导（纯函数，可独立验证）

- fast-xml-parser（已有依赖 ^5.8.0），**`parseTagValue:false`**（CUSIP 科学计数法事故的既定纪律），`ignoreAttributes:false`。命名空间前缀一律取 localName（V 用默认命名空间无前缀、其他 filer 可能带 `xbrli:` 前缀，都要兼容）。
- 提取：context（id → start/end/维度成员）+ 四个 tag 的事实：`EarningsPerShareDiluted`、`EarningsPerShareBasic`、`WeightedAverageNumberOfDilutedSharesOutstanding`、`WeightedAverageNumberOfSharesOutstandingBasic`，只要 context 维度含 `ClassOfStock`（兼容 `StatementClassOfStockAxis` 等变体）。
- **挂牌股类判定**：ticker 后缀 `.A`→`ClassA`、`.B`→`ClassB`，无后缀默认 `ClassA`；成员匹配 = localName 含该 token 且 token 后一位不是数字（把 V 的 `CommonClassB1/B2Member` 从 `ClassB` 匹配里排除；`CommonClassAMember` 与 BRK 的 `EquivalentClassBMember` 均正确命中）。
- 每个 FY（duration 350–380 天，对齐 `flowBucket` 口径）推导：
  - **路线 B（定值）**：`经济股数 = 该期总净利 net_income ÷ 挂牌类摊薄 EPS`（摊薄缺则 basic）。这是"能复现挂牌类每股收益的经济除数"，正是 per-share 估值需要的定义。
  - **路线 A（对账）**：挂牌类股数 tag（摊薄优先，basic 兜底）。
  - **双路互证硬闸**：两路都在且 |A−B|/B ≤ 10% 才接受，取路线 B；任一路缺或超差 → 该年不补（诚实空缺）。此闸同时天然拒绝"V 的 basic A 股数（1,714M，非经济总量）"这类错误来源（对路线 B 偏差 14.7% > 10%）。净利 ≤0 的年份路线 B 无定义 → 不补。

### 2.4 落库与溯源

- 按 `period_end` 匹配 annual 行，写 `shares_diluted`；`eps_diluted` 为空时一并写入挂牌类摊薄 EPS（这就是公司申报的挂牌类 EPS，非合成值）。
- `raw_facts.shares_diluted` 写入溯源对象（对齐现有 `{tag,val,filed,days,derived}` 形态）：`tag="class-dimension:eps-implied"`、`derived:true`，另加 `member` 与 `cross_check_pct` —— 满足数据来源标注硬规则。
- 季度行 v1 不补：TTM 路径已有 `shares_from_fy` 回退（引擎自处理），不新增取数面。

### 2.5 防坏数据（继承 + 新增）

继承：`isImplausibleBand`（margin>80% 拦截）、拆股口径闸不变。（不是"继承 `normalizeDilutedShares` 量纲交叉校验"——回退在 `finalizeRow` **之后** patch `shares_diluted`，不会重新过一遍那个函数；但路线 B 把股数定义为 `net_income ÷ eps`，这正是 `normalizeDilutedShares` 用来验证量纲的同一个 `implied = NI/EPS` 比值，按定义直接等价，不需要也不会再跑一遍该校验。）新增：上述 10% 双路互证。任何一环不过 → 该票维持 `per_share_unavailable` 现状，宁缺毋假。

## 3. 件② 设计：金融股口径收敛（解 AXP）

### 3.1 `isFinancialSic` 纳入 61xx

`moatCap.ts` 新增 `SIC_CREDIT_RANGE: [6100, 6199]`（非存款类信贷机构：AXP 6199 / COF·SYF 6141 等），并入 `isFinancialSic`。62xx 券商（GS/MS/SCHW 6211）**本轮不动**——它们当前判定已可用（MS/SCHW reliable=true），扩围需独立校准，不搭车。

### 3.2 ai_capex 闸对金融股豁免

`epvFloor.ts` `assembleFloor`：`aiCapexDistortion = mc.ai_capex_distortion_warning && !isFinancial`。

**口径论证（非放水）**：AI-hog 规则（capex 两年 ≥2×）是"维护性 capex 被增长性 capex 污染"的工业企业透镜；金融企业的资产负债表扩张由存款/应收/监管资本驱动，PP&E capex 是经营成本级小项，该透镜对其无判别力（AXP 即误伤实例）。金融股风险的既定通道是 D7 的可信度闸（`high_leverage_warning && is_financial`）与 SGR 封顶，不叠这盏错灯。`maintenanceCapex()` 内部的 OE 数值修正保持不变（其上限已被 D&A 封死，量级无害），只掐 flag 的发布与传播（同一变量顺带流入 `suppressedFlags` 与 `growthValue`，行为一致化）。

**final-review 补丁（2026-07-26）**：上面的 `!isFinancial` 是纯 SIC 一刀切，有漏洞——`SIC_CREDIT_RANGE [6100,6199]` 同时收纳比特币矿企（SEC 常把 MSTR/RIOT/CLSK/CORZ/IREN/WULF/HUT/COIN 等归类到 6199），对它们 PP&E capex 就是生意本身，被金融豁免会拆掉唯一判对的信号。修正为 `aiCapexDistortion = mc.ai_capex_distortion_warning && !(isFinancial && capexImmaterial)`，其中 `capexImmaterial = mean(|capex|)/mean(revenue)`（over `assembleFloor` 的 `years` 窗口，缺两项之一的年份跳过；一年都算不出 → 保守按不豁免处理）低于校准阈值 `AI_CAPEX_FINANCIAL_EXEMPT_MAX_CAPEX_TO_REVENUE = 0.20`。阈值来自真数据校准（`company_fundamentals_periods` FY 行）：银行/保险/发卡行（AXP/HBAN/KNSL/GL）实测 1.2%–14.7%；比特币矿企（CLSK/RIOT/CORZ/IREN/WULF）实测 28.8%+；两组间 ~14pp 净间隔，20% 取中，两侧各留 ~5pp 余量。豁免机制因此从"属于金融 SIC"改为"capex 相对这门受监管融资类生意的资产负债表规模确实不重要"，SIC 只是前置必要条件，不再是充分条件。

### 3.3 预期行为变化与回归护栏

- AXP：`is_financial` → true；探针已证其 `high_leverage_warning=false`、其余红旗全灭 → **`reliable=true`，verdict 维持 above**（有效估值 ≠ 显示便宜）。`is_financial` 翻转同时切换 moatCap 金融 SGR 路径与杠杆溢价豁免（AXP 溢价本就是 0，带宽可能因 CAP/GV 路径微移——属于正确透镜下的合理变化，验收时逐项看）。
- 全量回归 sweep（验收硬件）：对 sic∈[6100,6199] 的翻转票 + 存量金融（6020-6099/63xx）+ 现有 ai_capex 触发票，逐票对比生产快照，**枚举所有 reliable/bucket 翻转并逐票人工裁决**。已知观察点：SYF（当前 below+unreliable）若因 ai_capex 解封会进入击球区聚合面——须逐票确认其不可靠来源，翻转合理才放行。
- 生产基线（2026-07-25 快照）：JPM/MS/PGR/SCHW reliable=true；BAC/WFC/COF/GS/SYF reliable=false。sweep 以此为对照。

## 4. 明确不做（本轮）

- 件③ 保险集团净利剔除投资损益（BRK 的第三层病）：依赖件①落地后观察真实输出再定深度。已核实 `EquitySecuritiesFvNiGainLoss`（FY2025=$40.0B）无维度可取，可行性无忧。**本轮后 BRK.B 的预期状态**：股数修通、单灯出带（NI 六年均值 ~$60B 拉平部分波动），大概率 above 且可能因 `oeDcf.declined` 不可靠——个股页有估值、不进聚合面，诚实。
- 62xx 券商扩围、外币（ASML）、季度行分股类补数、`shares_outstanding` 引擎兜底。

## 5. 验收标准

1. `class-shares-fallback` 纯函数 check（fixture，无网络）：V 形态/BRK 形态/超差拒绝/B1B2 排除/负净利跳过 全绿。
2. 真数据探针（只读，不写库）：V 推导股数 ∈[1.8B,2.2B]、BRK.B ∈[2.0B,2.3B]、双路偏差 <1%；in-memory 走完 `runValuation`：V 与 BRK.B 均产出非 null verdict、无 `isImplausibleBand` 抑制、V bucket 合理（现价 ~$340 级别 vs 带）。
3. 金融 sweep：AXP reliable=true 且 bucket=above；翻转清单逐票裁决无不可解释项；61xx/ai_capex 之外的票**零漂移**（对照生产快照逐字段）。
4. `npx tsc --noEmit` 全绿（no-tests 项目纪律：tsc + check 脚本 + 真数据探针）。

## 6. 上线运维（合并后，须用户授权）

1. `npm run sec:ingest -- <票>`（或 holdings 全量周更自然覆盖）重刷 V/BRK.A/BRK.B 等回退票的基本面行；
2. `npm run valuation:ingest` 重算快照（老规矩）；
3. 观察 BRK.B 输出决定件③是否立案。
