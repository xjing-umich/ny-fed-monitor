# 件④：控股集团/投资主导主体 —— 口径一致性修正 + 诚实抑制

日期：2026-08-02 · 分支：`plan/valuation-holdco-not-assessable`（off `origin/db-foundation` @eb39b98，已含件①②③）

## 0. 问题（真数据实证）

生产上 BRK.B 的估值卡给出：**value_destruction（价值毁灭）→ 无护城河 → CAP 0 年 → 成长价值归零 → 价值带塌缩为 [298.50, 298.50] → 比价值带贵 124%**。对伯克希尔而言这是假结论，且是站上最刺眼的一只票。

**根因是件③引入的口径不对称**：件③把投资组合的重估收益从盈利里剔除（正确），但组合本身仍按市值 100% 留在资产基数里。于是 franchise 测试拿「剔除了组合回报的盈利」去比「含组合市值的资产」——分子分母不同源。

| 口径 | EPV/AV | 判定（≥1.25 franchise，<0.75 value_destruction） |
|---|---|---|
| 现状 | 165.6 / 298.5 = **0.55** | value_destruction |
| 剔除被 marks 剔了收益的资产后 | 165.6 / 160.4 = **1.03** | commodity |

**已被真数据否决的判据**（记录以防重蹈）：用「投资资产/有形净资产」识别投资主导型主体是**方向反的**——BRK 该比值 60%，是全体保险股里最低的（RGA 802%、AFL 391%、PGR 336%、CB 298%），因为保险公司的组合由浮存金（负债）撑着不进权益，而伯克希尔的股票是股东权益自己买的。按此闸会误伤一批判定正常的保险股而放过 BRK。

**21 只票扫描实测**：落进 value_destruction 的只有 **BRK.B（0.55）与 Loews（0.66）**——两家都是多元化控股集团。

## 1. 设计

### 件④-1 口径一致性修正（复用既有通道）

`epvFloor.assembleFloor` 已有 `epvAvRatioOperating` 通道，用于剔除超额现金后再比 EPV/AV（当初为 GOOGL/META 的千亿现金撑大分母而建）。本件把该通道的剔除项从「超额现金」扩展为「超额现金 + 被 marks 调整剔除了收益的权益证券」：

```
excludedPerShare = excessCashPerShare + (equity_securities_fv / shares，仅当 marks_adjustment 生效)
assetOperating   = asset_per_share_compared − excludedPerShare
```

**只在 `marks_adjustment` 生效时剔除权益证券**——这是内生的一致性条件：我们剔了它的收益，才剔它的资产。marks 未生效的票（组合回报仍在盈利里）零影响。

需要新字段 `equity_securities_fv`（migration + tag `["EquitySecuritiesFvNi"]`，标准无维度 tag，BRK FY2025 = $2,978 亿实测可取）。

### 件④-2 诚实抑制（三闸全中才触发）

当以下三条**同时**成立：

1. `marks_adjustment` 生效（我们确实剔除了投资回报）；
2. 件④-1 修正后 `epvAvRatioOperating` 仍 **< MOAT_FRANCHISE_MULTIPLE（1.25）**（修正后依旧测不出 franchise）；
3. 全窗 `operating_income` 缺失（无独立的经营透镜——Graham 灯本就不亮）；

则：

- `moat_reading.signal = "not_assessable"`，reason 说明「合并报表层面的盈利力/重置成本测试不适用于投资主导型控股集团：组合的重置成本就是其市价，持有它不构成竞争壁垒」；
- `deriveValuationVerdict` 返回 **null**（整条抑制，与既有 `split_coverage_stale` / `fundamentals_corrupt` 同款 fail-closed 通道），`runValuation.suppressedReason = "holdco_not_assessable"`；
- 个股页不渲染价值带与结论，改出一句说明；资产底**仍作为「底」展示**（它是诚实的清算参考，只是不能兼作「顶」）。

**为什么是抑制而不是"让它显示护城河"**：修正后 BRK 比值 1.03 属 Greenwald 的中性带，硬调到 franchise 就是放水。抑制是唯一不撒谎的选项，且符合项目既定「宁可诚实空缺，不给假数字」。

### 1.3 明确不做（留给件⑤）

两栏法/分部 SOTP（投资按市值 + 剔除投资收益后的经营盈利资本化）是伯克希尔的**正确**估值方法，但它是按公司形态定制的方法，不能推广到 1,000+ 只票，须作为独立的「控股集团轨」立项。已核实其取数可行性：分部 tag（`SegmentReportingInformationOperatingIncomeLoss` / `Revenue` / `Assets`）与浮存金、投资收益均带维度，被 companyfacts 剥掉，**但件①已建成 XBRL instance 维度解析能力，同一套机器可直接复用**。

## 2. 预期影响与回归护栏

- **BRK.B / BRK.A**：value_destruction 消失，verdict 抑制，页面只剩资产底 + 说明。
- **MKL / RLI**：件④-1 使其分母变小、比值上升，franchise 维持或增强 → **不触发抑制**（闸 2 不满足）。
- **RGA / WTM**：无 `EquitySecuritiesFvNi`（组合是 AFS 债券，利息收入仍在盈利里）→ 件④-1 对其零影响；是否触发抑制取决于闸 2/3 实测，**验收时逐票裁决**。
- **marks 未生效的全部票（含 PGR/CB/TRV/AFL/JPM/MSFT/V/AXP）**：两闸均不满足 → **逐字段零漂移**（硬断言）。
- Loews（value_destruction 0.66）marks 未生效 → 本件不覆盖，留作件⑤观察项。

## 3. 验收标准

1. fixture check：件④-1 的剔除只在 marks 生效时发生；三闸缺一不触发抑制；抑制时 verdict 为 null 且 reason 正确。
2. 真数据探针（只读）：BRK.B 修正后比值落在 [0.9, 1.2] 且触发抑制；MKL/RLI 维持 franchise 且不被抑制；RGA/WTM 打印实测供裁决；零漂移组（PGR/CB/AFL/MSFT/V/AXP）verdict JSON 逐字段全等。
3. 全部既有 `*.check.ts` + `npx tsc --noEmit` 绿。
4. 个股页 en/zh 说明文案符合 `docs/copy-voice.md`（禁 AI 腔）。

## 4. 上线运维（须授权）

1. **先 apply migration**（`equity_securities_fv` 列，可空，须早于合并部署——件③的教训）；
2. 合并 PR；
3. `npm run sec:ingest -- BRK.A / BRK.B / MKL / RLI / WTM / RGA`（回填新列）；
4. `npm run valuation:ingest`；
5. 看页 `/stocks/BRK.B`（应无价值带、无护城河判定、有说明句与资产底）、`/stocks/MKL`（franchise 维持）；
6. 抽查零漂移组快照未变。
