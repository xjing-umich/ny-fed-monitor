# strong 分档持续盈利闸 + 基本面口径完整性护栏

日期: 2026-07-17
Base: origin/db-foundation @ e870702（护城河地基修复 PR #173 已合并）
状态: 设计（待写 plan）

## 背景

护城河地基修复（层①无形重置底 / 层② ROIC 兜底 / 层③ g1 解封 gFund，PR #173 已合并）终审留下一个疑点：层③放开 gFund 封零后，ABNB（below +24.5%）、MGRC（below +60%）被翻成"便宜"。终审判定这不是层③过度计入（g1 从不超过已证实增长），而是既有 moat 分档把它们判成 **strong → 20 年 CAP + 20% 增长 cap** 的下游放大，怀疑 strong 分档对"高增长但护城河存疑 / 盈利历史短"的名字过松。

本设计基于真引擎探针（`web/scripts/probe-moat-intangibles.ts`，`.claude/worktrees/moat-intangibles` worktree 有 env+tsx）核实后的结论，解决**两个不同子系统**的问题：

1. **护城河 strong 分档过松**（估值引擎逻辑）——ABNB 是真假阳。
2. **基本面口径损坏**（数据完整性）——MGRC 及 ~19 只名字的 revenue 字段被 SEC XBRL 概念取错，`operating_income > revenue` 物理不可能。

## 诊断（真数据坐实）

### strong 分档只有两条路径（两者都要 `roicStable` + franchise 信号）

- **pathA**：`EPV/AV（剔超额现金）≥ 2×` 且 `dual_test_passed`
- **pathB**：`roicLongTermStrong`（6 年 / 均值 ROIC ≥ 22% / CV < 0.35）

**缺陷**：pathA 对盈利历史长度 / 连续盈利年数 / 投入资本是否真实**零门槛**。

### ABNB = 真假阳（pathA，roicLongStrong=false）

逐年 ROIC（真引擎）：
| FY | net income | operating income | invested capital | ROIC |
|----|-----------|------------------|------------------|------|
| 2020 | −45.8 亿 | −35.9 亿 | 负（跳过） | — |
| 2021 | **−3.5 亿** | +4.3 亿 | 6.9 亿 | 62.1% |
| 2022 | +18.9 亿 | +18.0 亿 | **1.69 亿** | **1066%**（被 300% sanity 剔） |
| 2023 | +47.9 亿 | +15.2 亿 | 32.8 亿 | 46.3% |
| 2024 | +26.5 亿 | +25.5 亿 | 35.4 亿 | 72.1% |
| 2025 | +25.1 亿 | +25.4 亿 | 36.4 亿 | 69.9% |

三条证据：
1. **`roicStable=true` 建在失真的近零投入资本上**。ABNB 资产负债表被"代客户持有资金"浮存撑成近零净投入资本（FY2022 ic 仅 1.69 亿对 84 亿营收），ROIC 机械性爆表，不是真实资本上的持续高回报。300% sanity 只挡住最极端的 FY2022（1066%），放行了同样失真的 62%（当年还净亏 3.5 亿）/72%。
2. **只有 ~3 年 GAAP 盈利**，最早年 FY2020 巨亏 46 亿 → 增长引擎自己因此**算不出 cagr_raw（返回 NA）**。
3. 却经 pathA 拿 **20 年 CAP + 20% 增长 cap**。内在矛盾：引擎一边宣告"测不出增长轨迹"，一边断言"20 年护城河"。放大链：strong → `cap=20%` + `capYears=20`；g1 = gRaw（营收 log 回归 27%）截到 20%，20 年窗口复利 → IV 195.71 → **below +24.5% 假便宜**。降 moderate（7% cap + 10 年）verdict 大概率翻正。

### 对终审的更正：MGRC 不是"干净可辩护"，是坏数据

终审把 MGRC 与 ABNB 并列为"分档过松"。真数据显示**根因不同**：MGRC 的 FY2020–2022 基本面损坏。

| FY | revenue | operating income | op margin | gross profit |
|----|---------|------------------|-----------|--------------|
| 2020 | 1.28 亿 | 1.41 亿 | **110%** | 2.64 亿 |
| 2021 | 1.29 亿 | 1.32 亿 | **103%** | 2.81 亿 |
| 2022 | 1.55 亿 | 1.66 亿 | **107%** | 3.37 亿 |
| 2023 | 8.31 亿 | 1.90 亿 | 23% | 3.94 亿 |
| 2024 | 9.11 亿 | 2.44 亿 | 27% | 4.35 亿 |
| 2025 | 9.44 亿 | 2.44 亿 | 26% | 4.55 亿 |

营业利润率 >100%、毛利 > 营收，物理上不可能（营业费用/COGS 为负）。McGrath RentCorp 真实 2020 营收约 5.6 亿，存的 1.28 亿约为 1/5——SEC XBRL 营收概念被 ingest 取错单条/分部行。FY2023 起才正确。**MGRC 的 strong 与便宜信号建在坏数据上**，不能当"分档过松"处理。

### 口径损坏是系统性簇（全宇宙扫描）

`company_fundamentals_periods` 全部 9215 个 FY 行扫描：
- **`operating_income > revenue`（revenue>0）：19 只**——`AMT AVB BFH CCI CRCL CWEN ESS EXR GLNG GLPI MGRC NRP SBAC SBGI SUNB UDR UHAL VAL WINA`（REIT 为主）
- **`gross_profit > revenue`（revenue>0）：7 只**——`DEI ESS FCFS IPAR MGRC SBAC SUNB`

### INTU / ENSG 等确实干净

均 pathA / roicLongStrong=false，但 6 年真实资本上稳定 ROIC（INTU 10–87% / ENSG 17–25%）、cagr_raw 可得、无口径违反。它们的 strong 可辩护，本设计不影响。

## 设计

两件独立改动，同一 spec 协调交付。

### 件① 护城河 strong 分档：前置"持续盈利轨迹"闸

**判据**：strong（pathA 与 pathB 都适用）额外要求 **≥ 5 个连续最近 FY 年 `net_income > 0`**。

- 新纯函数 `sustainedProfitStreak(fyYears)`（放 `moatCap.ts`）：按 `fiscal_year` 降序，从最新年起数连续 `net_income > 0` 的年数，返回整数。
- `assembleFloor`（`epvFloor.ts`）从 `allYears` 算出 `sustainedProfitYears = sustainedProfitStreak(allYears)`，作为新入参传入 `deriveMoatCap`。
- `deriveMoatCap` 在两条 strong 路径（正常 AV 路径的 `durablePassed`、`roicOnly` 兜底路径的 `durablePassed`）都加前置条件 `sustainedProfitYears >= STRONG_MIN_PROFIT_STREAK`（=5）。不满足 → 降 **moderate**（`CAP_MODERATE=10`），非 none。basis 文案说明"持续盈利年数不足 N 年，暂不授予强档"。

**常量**：`STRONG_MIN_PROFIT_STREAK = 5`，`moatCap.ts` 导出单一来源。

**N=5 依据**：SEC 每票最多约 6 个有效 FY 年。N=6 要求满窗零瑕疵，与"全为正"一样脆——会误伤只有 5 年干净史的年轻名或有一个最老亏损年的成熟名。N=5 允许至多一个**最老**年亏损，仍要求 5 年实打实连续盈利 track record，够刚性挡住"刚转盈"的 ABNB（连续仅 4 年，亏损在 2020–2021），又不惩罚一次性老冲击后长期恢复的 franchise。真数据 30 票篮子校准：所有当前 strong 名字里**只有 ABNB 连续盈利 <5**（其余 MGRC/INTU/ENSG/PCTY/ROL/MA/NFLX/ADBE/MSFT/AAPL/MCO/COST/NVDA/PYPL 全 6/6）→ 只降 ABNB，零误伤。

**口径**：用 `allYears`（能拿到的最长历史）而非 5 年正常化窗口，因为判的是"长期轨迹"。

**范围红线**：不动 pathA（EPV/AV≥2×）/ pathB（roicLongTermStrong 6年/22%/CV<0.35）既有阈值；不动层③ / 结构性置信 / 杠杆地基；gate 只管 strong，moderate/none 不碰（避免波及 DIS 这类一次性老亏损的 moderate 名字）。

### 件② 基本面口径完整性护栏（止血，不修源头）

**谓词**：新纯函数模块 `fundamentalsIntegrity.ts`，`fundamentalsIntegrityViolated(years: ValuationFloorYear[]): boolean`——任一 FY 年满足以下之一即返回 true：
- `revenue != null && revenue > 0 && operating_income != null && operating_income > revenue`
- `revenue != null && revenue > 0 && gross_profit != null && gross_profit > revenue`

只用这两个物理不变量违反（营业费用/COGS 为负，绝不可能）。**不含**"营收跳变/加速"这类会误伤真收购的软判据。

**抑制**：`deriveValuationVerdict` 新增第三个入参 `fundamentalsCorrupt?: boolean`，在开头与 `splitCoverageStale` / `capitalStructureDistorted` 并列早返回 `null`（语义完全相同：口径损坏 → 无可信判定，不把坏数据算出的信号推到最敏感的面）。

**接线面**（逐点照抄拆股护栏 `isSplitCoverageStale` 的既有布线）：
- `fundamentalsIntegrity.ts`——谓词（新文件）+ `.check.ts`
- `deriveValuationVerdict.ts`——新入参 + 早返回 null；更新顶部护栏登记注释
- `index.ts`——barrel 导出谓词
- `src/app/[lang]/stocks/[ticker]/page.tsx`——算旗 → 传入 verdict → 整卡不渲染 → 加 en/zh"基本面数据存疑，暂不评估"说明（复用拆股护栏的抑制说明位置与文案骨架，措辞遵 `docs/copy-voice.md`）
- `scripts/valuation-ingest.ts`——快照写入同步抑制，让 screener / 投资人页 / verdict chip 等**读快照的聚合端自动继承**（无需逐个改）
- `scripts/probe-moat-intangibles.ts`——探针同步传入（否则漏显）

**效果**：生产命中 ~19 只（MGRC/AMT/AVB/CCI/ESS/EXR/SBAC/UDR… REIT 为主）从发假信号改为"暂不评估"。

**范围红线**：只加护栏抑制，**不修**营收 XBRL 源头标签（那是 ingest 管线的独立大件，全宇宙重跑 + 不同验证体系，记为独立数据层待办另开）。护栏是止血，接受"MGRC 这类仅老年份坏、其余可用的名字被整体抑制"的过度保守——守 [[valuation-philosophy-constraint]]：宁可诚实空缺，也不发假便宜信号。

## 验证

本项目不跑测试套件（[[no-tests-solo-dev]]），验证用 tsc + `.check.ts` 断言脚本 + 真引擎探针：

1. **件① 单测**（`moatCap.check.ts` / `epvFloor.check.ts`）：`sustainedProfitStreak` 计数正确（含最新年亏损=0、中间断裂、全正）；`deriveMoatCap` 在 streak<5 时两条 strong 路径都降 moderate、streak≥5 时行为不变。
2. **件② 单测**（`fundamentalsIntegrity.check.ts` / `deriveValuationVerdict.check.ts`）：谓词对 opInc>rev、gross>rev、干净数据、缺字段各分支正确；verdict 在 `fundamentalsCorrupt=true` 时返回 null，false 时行为不变。
3. **真引擎验收（探针实测，2026-07-17）**：
   - **ABNB：grade strong→moderate（capYears 20→10），g1 0.20→0.07，IV(neutral) 195.71→63.62，verdict below +24.5% → within −129.5%**（假便宜信号消失）。✅
   - **坏数据抑制**：MGRC / AMT / ESS / SBAC / DEI / FCFS / IPAR / UDR 全部 `verdict → null（暂不评估）`；其中 DEI/FCFS/IPAR 仅靠 `gross>revenue` 触发，证明该不变量生效。✅
   - **干净 strong 零漂移**：INTU/ENSG/PCTY/ROL/MA/SPGI/NFLX/ADBE/MSFT/AAPL/MCO/COST/NVDA/PYPL 全部 grade 不变、**IV(neutral) 与改动前逐一相同**（引擎逻辑零漂移）；个别 marginPct/bucket 边界的微小变化纯为 live price 日间波动（如 ENSG 现价恰越过 IV 边界 within→below，IV 172.67 未变、grade 仍 strong）。✅ ABNB 是全宇宙唯一降级。
4. `tsc` 全绿；4 个 `.check.ts`（moatCap/fundamentalsToFloorInput/fundamentalsIntegrity/deriveValuationVerdict）全 PASS；本地 `next build` 受 google fonts 屏蔽不作门（[[local-build-google-fonts-blocked]]）。

## 遗留 / 独立待办（不在本 spec）

- **营收 XBRL 源头标签修复**：REIT/租赁类 revenue 概念取错的 ingest 层修复 + 全宇宙重跑，独立数据层 spec。
- MGRC 若源头修好后，可从"暂不评估"恢复为真实 verdict。
- `roicLongTermStrong` 一票多用抬升（见 [[valuation-leverage-cost-of-equity]] 遗留）不在本次。

## 部署

合并后需授权跑 `npm run valuation:ingest` 重算快照，件①（ABNB 降档）与件②（~19 只抑制）才落地生产 screener/聚合面。tsc/探针仅证代码正确，不等于生产已生效。
