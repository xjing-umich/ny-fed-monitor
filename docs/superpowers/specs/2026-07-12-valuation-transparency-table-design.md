# 逐年估值推导透明度表（估值改造 Phase 3）— 设计

- 日期：2026-07-12
- 分支：`plan/valuation-transparency-table`（off `db-foundation` @ 3cc6fa8）
- 状态：设计已认可，待落计划
- **执行依赖**：应在 Phase 1（预期层）+ Phase 2（护城河→CAP）合并**之后**执行——表内含隐含预期行与 CAP 行，且逐年投影已被 P2 的 moat-CAP 拉长。
- 上位：[[valuation-reform-expectations-roadmap]]、[[valuation-philosophy-constraint]]、[[frontend-design-language]]

## 一、目标与背景

走完 P1（反向 DCF 预期）+ P2（护城河→CAP）后，估值核心问题已解。Phase 3 是**收官**：把产出估值带与各结论的**全部推导**摊成一张逐年、可追溯 SEC/FRED 的透明度表。

**为什么做**（审计裁定的差异化）：竞品全是黑箱或半黑箱——Morningstar 分析师模型不可复现、GuruFocus 权重 proprietary。我们「每个数字追溯 SEC 原始行」是对它们的**碾压项**。逐年推导表让我们成为**全网唯一能让用户审计整条估值推导的 13F 站**（Simply Wall St 对其 DCF 有，但 13F 领域无人有），配上我们的 13F=独一份。它还让 P1/P2 的抬值杠杆**全部可见可辩**——抬了值就得让人看见怎么抬的，这是信任护城河。

**Phase 3 = 只做透明度表**（叉口已定）。自身历史倍数 lens 缓做/降级：走完 P1+P2 后它不再承重、是最不契合价值品牌的市场锚定法（追涨泡沫风险），且被「历史价格按月删、快照无留存」的数据缺口卡死——不为它背数据债与品牌风险。

## 二、非目标（YAGNI）

- **不做**自身历史倍数回归 / pricing lens（缓做，见上）。
- **不改**任何估值数值/判定——纯呈现层，读已算好的值。
- **不新建**估值小节——**扩充现有** `EarningsPowerFloorCard` 的 `MethodDetails`（「Method & numbers / 方法与数字」可展开块，默认折叠）从散文升级为逐年表，不另起炉灶。
- **不做**图表可视化——一张可追溯的数字表即可（真数据当主角，禁装饰）。

## 三、架构（ingest 算、页面读，与全站一致）

现状：`MethodDetails` 已用散文披露方法/假设/贴现出处，但**逐年 OE 投影、逐年现值、终值拆解是引擎内部值，未暴露**。故：
1. **引擎暴露** `ValuationDerivation`（附加返回，不改算法）：逐年投影行 + 现值拆解 + 终值拆解 + 价值带组装 + 贴现出处。
2. **ingest 写入** `valuation_snapshot.payload.derivation`（jsonb，无需改表）。
3. **页面读快照**渲染逐年表（纯 RSC，零实时抓取）。

## 四、表内容（每行可追溯来源）

| 分组 | 行 | 来源标注 |
|---|---|---|
| 归一化输入 | owner earnings 基数、所用 FY 年、保守正常化(是否 capped)、股数、税率、维持性 capex 法 | SEC EDGAR 10-K |
| 贴现 | 贴现率(midpoint) + DGS10 锚值/日期/带 | FRED DGS10 |
| **逐年投影** | Y1..CAP：OE 路径、该年增长、现值 PV | 派生(公式可追) |
| 终值 | 终值、Gordon 输入(gTerminal=min(DGS10,3%GDP))、终值 PV、占总值% | 派生 |
| 价值带组装 | valueFloor(保守底)、OE-DCF 低/高、Greenwald 增长上沿、rangeLo/rangeHi | 派生 |
| **护城河/CAP**(P2) | 护城河档、CAP 年数、判据 | 派生 |
| **隐含预期**(P1) | 隐含增长、历史 base-rate、三态、隐含 CAP | 派生 |
| 现价 | 价格 + as-of + 源 | Yahoo/Eastmoney |

- 逐年投影行是核心新增（现在只有区间端点，没有过程）。
- 终值占比行直接印证现有 `terminal_dependency_flag`「终值占现值 70% 以上」的告警——让告警从一句话变成可核对的数字。

## 五、呈现与设计

- 位置：扩充 `MethodDetails` 的 `<details>` 折叠块（默认折叠，不占第一屏）。
- 逐年表用 mono 等宽数字、`--tt-*` token；响应式：窄屏可横向滚动（`overflow-x`），不破版。
- 文案遵 `web/docs/copy-voice.md`，双 locale 纯本语言；无买卖/目标价。
- 降级：`payload.derivation` 缺失（旧快照/未 ingest）→ 保留现有散文披露，不渲染逐年表（非报错）。P1/P2 行在对应字段缺失时各自省略（可独立降级）。

## 六、数据准确性

- 逐年投影 = 引擎既有 `projectOe`/`dcfTier` 的真实中间值，**不另算一套**（避免表与结论对不上）——引擎暴露什么，表就印什么。
- FY 行、DGS10 锚、价格 as-of 均沿用既有口径与出处标注（守 CLAUDE.md 数据来源+日期规）。

## 七、测试与验收

- 引擎暴露的 `ValuationDerivation` 加纯函数断言：逐年 PV 之和 + 终值 PV = 每股权益值（与 `dcfTier` 输出一致，证明表与结论同源）。
- `npx tsc --noEmit` 零错。
- 部署后：AAPL 展开「方法与数字」，逐年表齐全、数字自洽（PV 累加=区间端点）、来源标注正确、终值占比与告警一致；旧快照/缺字段优雅退回散文。

## 八、触及文件清单

- 改 `web/src/lib/valuation/ownerEarningsDcf.ts`（或 floor builder）：附加返回 `ValuationDerivation`（逐年+终值+带组装+贴现出处）。
- 改 `web/src/lib/valuation/types.ts`：`ValuationDerivation` 类型。
- 改 `web/scripts/valuation-ingest.ts` + `valuationSnapshot.ts`：写入/读回 `payload.derivation`。
- 改 `web/src/components/valuation/EarningsPowerFloorCard.tsx`：`MethodDetails` 内渲染逐年表。
- 新建 `.check.ts`：逐年 PV 自洽断言。
