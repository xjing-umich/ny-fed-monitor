# 估值编排清晰化（`runValuation` + coverage 语义）— 设计

**日期：** 2026-07-19  
**状态：** 已实现 · 实现计划见 `docs/superpowers/plans/2026-07-19-valuation-orchestration-clarity.md`  
**对应路线：** 估值腿 · 可维护性 / 概念债清理 · [[prd-roadmap]]  
**硬约束：** [[valuation-philosophy-constraint]]（禁 BUY/SELL/目标价；输出=保守区间+位置+信心）  
**基线：** `web/src/lib/valuation/*`；编排现重复于个股页与 `valuation-ingest.ts`  
**前序：** NVDA 真数据复核（2026-07-19）：`coverage=single_lamp` 在 OE-DCF 可评估时仍成立；双编排；成长双轨决策散落  
**用户约束：** **A — 允许小幅语义修正**（coverage / badge `*` 可变；公式与 bucket/MOS/reliable **不动**）

---

## 0. 为什么做这个

估值**公式主干**已完整；维护痛点在**编排与命名**：

1. **编排重复**：page / ingest 各写一条链，parity 靠注释。  
2. **`coverage` 撒谎**：`full` 绑 Greenwald **GV ceilings**；AI-hog 票有 OE-DCF 仍标 `single_lamp` + 徽章 `*`。  
3. **决策表未成契约**：GV vs OE-DCF g₁ 开/闸散落三处。  
4. **文档漂移**：spec 写 8–10%；代码 9–11%。

**本 spec 只做清晰化与编排收口，不改估值公式。**

---

## 1. 目标与非目标

### 目标

1. 单一编排入口 `runValuation`（canonical ordered pipeline + 文档化短路）。  
2. 诚实的 `coverage`：有 OE-DCF **且** 零增长 EPV → `full`；仅零增长 EPV → `single_lamp`。  
3. 结构化 `methods`（单一派生函数，无循环依赖）。  
4. 成长双轨决策表固化。  
5. 折现带文档对齐；badge 文案对齐新 `single_lamp` 语义。

### 非目标

- 不改公式与具名常数；不改 bucket / IV 锚 / MOS / `assessReliability`。  
- 不做 SOTP / multiples / 完整 WACC / 厚领域模型。  
- 不在本 spec 修 `stock_splits` 回填（另开任务）。

---

## 2. 架构：`runValuation`

### 2.1 位置与导出

- `web/src/lib/valuation/runValuation.ts` + `.check.ts`  
- `deriveValuationMethods.ts`（或同文件顶部纯函数）— **methods 唯一派生点**  
- `index.ts` 导出 `runValuation`、`deriveValuationMethods`、相关类型  

### 2.2 输入

调用方负责 I/O；编排只收已解析输入：

```ts
type RunValuationInput = {
  floorInput: ValuationFloorInput;
  /** 用于 strike/DCF/verdict 的价。调用方规则见 §2.4：stale → 传 null，并设 priceStale。 */
  price: LatestPrice | null;
  dgs10: { value: number; date: string } | null;
  guards: {
    adsSuppressed: boolean;
    fundamentalsStale: boolean;
    /** 现价存在但超 PRICE_MAX_AGE_DAYS；此时 price 必须为 null。 */
    priceStale: boolean;
    splitCoverageStale: boolean;
    /** 若省略，编排内对 floorInput.years 调用 fundamentalsIntegrityViolated。 */
    fundamentalsCorrupt?: boolean;
  };
  /** 默认 false。true → deriveExpectations({ suppressed: true })。 */
  suppressExpectations?: boolean;
};
```

`capitalStructureDistorted` 由编排在 floor 算出后读取 `floor.moat_reading.capital_structure_distorted`，不入 guards。

### 2.3 输出

```ts
type ValuationMethods = {
  zeroGrowthEpv: boolean;           // strikeZone.epv 存在（见 §3.1 不变量）
  oeDcf: boolean;                   // oeDcf.assessable
  greenwaldGrowthCeilings: boolean; // epv.ceilings 存在
};

type SuppressedReason =
  | "ads_suppressed"
  | "fundamentals_stale"
  | "per_share_unavailable"
  | "thin_or_unvaluable_floor"   // computeValuationFloor → undefined
  | "no_price"                   // price==null && !priceStale
  | "price_stale"                // priceStale（price 已 null）
  | "currency_mismatch"
  | "split_coverage_stale"       // verdict null 且因此
  | "capital_structure_distorted"
  | "fundamentals_corrupt";

type ValuationRun = {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone: StrikeZoneAssessment | undefined;
  oeDcf: OeDcfAssessment | undefined;
  reconciliation: MethodReconciliation | undefined;
  verdict: ValuationVerdict | null;
  /** 与今日 ingest 对齐：无 DCF 时为 { assessable:false, reason:"no_oe_dcf" }，不用 undefined 表示「未跑」。 */
  expectations: ExpectationsAssessment;
  methods: ValuationMethods;
  suppressedReason?: SuppressedReason;
};
```

### 2.4 Canonical pipeline（有文档化短路）

**调用方价规则（page / ingest 统一）：**

- `fetched.stale === true` → 传入 `price: null` **且** `guards.priceStale: true`。  
- 无报价 → `price: null`，`priceStale: false`。  
- 非 stale 好价 → 原样传入，`priceStale: false`。

**编排顺序：**

```
1. adsSuppressed → floor=undefined, suppressedReason=ads_suppressed, 早退
   （expectations={assessable:false,reason:"suppressed_ads"} 或同等；methods 全 false）
2. fundamentalsStale → 同上，reason=fundamentals_stale
3. floor = computeValuationFloor(floorInput)
4. floor undefined → thin_or_unvaluable_floor 早退
5. floor.kind === per_share_unavailable → 该 floor 保留，verdict=null，reason=per_share_unavailable；仍可停
6. strikeZone = deriveStrikeZone(floor, price)
   - priceStale 或 no price → strike 可能无 epv → verdict 后为 null；
     suppressedReason = priceStale ? "price_stale" : (无价则 "no_price")
   - currencyMismatch → currency_mismatch
7. oeDcf = deriveOeDcf(floor, years, dgs10, price)
   （price null 时 DCF 仍可评估区间，diagnostics 中 oe_yield 等缺价字段为空——与今日 deriveOeDcf 行为一致，不新增「因 stale 跳过 DCF」）
8. reconciliation = reconcileMethods(ceilings, oeDcf, price)
9. corrupt / capitalStructure / split → 传入 deriveValuationVerdict
10. methods = deriveValuationMethods({ floor, strikeZone, oeDcf })
11. verdict = deriveValuationVerdict({ ..., methods })
    （函数内用 methods 填 coverage 与 verdict.methods；见 §3）
12. expectations（互斥分支，禁止把「有 DCF 但无 verdict」标成 no_oe_dcf）:
    - 若 !oeDcf?.assessable || !oeDcf.expectations_inputs
        → { assessable: false, reason: "no_oe_dcf" }
    - else if !verdict
        → { assessable: false, reason: "no_verdict" }
           // 常见：price_stale / no_price / currency / split / corrupt / capital_structure
           // 此时 OE-DCF 区间可能仍可评估；reason 不得写成 no_oe_dcf
    - else
        → deriveExpectations({ ...oeDcf.expectations_inputs, price: verdict.price,
             historicalGrowth: historicalGrowthBaseRate(years),
             suppressed: suppressExpectations === true })
```

**关于 stale 价与 DCF：**  
统一为 page 语义：stale → 不当现价做 strike/verdict，但 **不**单独禁止 `deriveOeDcf`（DCF 主产出是每股区间，价只进 diagnostics）。ingest 今日「stale 整票 skip」改为：**与 page 相同**——`priceStale` 导致无 verdict → 不入 snapshot 行（`intentionallyUnvaluable`），与「无可信判定」一致；不再在 floor 之后因 stale 单独 `continue` 的另一套语义。

**`suppressedReason` 优先级（多条件时取最先触发的编排短路；verdict 护栏覆盖价因）：**  
`ads_suppressed` > `fundamentals_stale` > `thin_or_unvaluable_floor` / `per_share_unavailable` >  
（若 verdict==null）`fundamentals_corrupt` > `capital_structure_distorted` > `split_coverage_stale` >  
`currency_mismatch` > `price_stale` > `no_price`。  
即：split/corrupt 等 verdict 护栏优先于单纯缺价说明。

**ingest 早退统一到 page：**  
`ads` / `fundamentalsStale` 在 **算 floor 前** 抑制（不再先算再丢）。

### 2.5 expectations 默认

`suppressExpectations` 默认 `false`。个股页与 ingest 均传 `false`，数字同源；列表用 `reliable` 闸展示，不依赖 expectations 抑制。

### 2.6 调用方

| 调用方 | 改后 |
|---|---|
| 个股 `page.tsx` | I/O → `runValuation`；**必须**把 `run.verdict` 传给卡片（含 `null`） |
| `valuation-ingest.ts` | 同；写 `coverage`/`payload`（含 `methods`、`expectations`） |
| `EarningsPowerFloorCard` | 见下方 prop 契约 |
| `valuationSnapshot.ts` | `SnapshotVerdict` / `Row.payload` 增加可选 `methods`；解码透传 |
| `ValuationBadge` | 文案见 §5（交付范围内） |
| 所有 `deriveValuationVerdict(` 调用点 | checks / probe / fusion check **一并**改为传入 `methods`（或先 `deriveValuationMethods`）；禁止遗漏 |

**`EarningsPowerFloorCard` prop 契约（三态，禁止 `verdict ?? selfDerive`）：**

```ts
verdict?: ValuationVerdict | null;
// undefined → 遗留自算（仅 .check / 故事；生产 page 不得走此支）
// null      → 权威抑制：不渲染 ValueSpine（与 split/corrupt/stale 等护栏一致）
// ValuationVerdict → 只展示，不再调用 deriveValuationVerdict
```

生产 path（page）**永远传入** `run.verdict`（`ValuationVerdict | null`），从不省略 prop。

---

## 3. `methods` 与 `coverage`

### 3.1 `deriveValuationMethods`（唯一权威）

```ts
function deriveValuationMethods(args: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
}): ValuationMethods
```

不变量（引用 `strikeZone.ts`）：`epv` 仅在至少一盏灯 `per_share_low/high` 均为正时创建 → `zeroGrowthEpv ⇔ !!strikeZone?.epv`。

- `oeDcf ⇔ oeDcf?.assessable === true` **且** `per_share_low/high` 均为有限正数（与今日 verdict 内 `oeOk` / `finitePositive` **同一条件**，不以裸 `assessable` 为准）  
- `greenwaldGrowthCeilings ⇔ !!strikeZone?.epv?.ceilings`  

`runValuation` 与 `deriveValuationVerdict` **都调用此函数**（或 verdict 接收已算好的 `methods` 入参，避免再算）——**禁止** `runValuation` import verdict 再反向依赖 run。推荐：

```ts
const methods = deriveValuationMethods(...);
const verdict = deriveValuationVerdict({ ..., methods });
```

### 3.2 coverage 新定义（非 null verdict 时）

非 null 的 `ValuationVerdict` **今日与改造后都要求** `strikeZone.epv` 存在（否则函数返回 null）。因此：

| coverage | 条件 |
|---|---|
| `full` | `methods.oeDcf && methods.zeroGrowthEpv` |
| `single_lamp` | `methods.zeroGrowthEpv && !methods.oeDcf` |

**不存在**「仅 OE-DCF、无 EPV」的非 null verdict——该情况 `verdict=null`；`ValuationRun.methods` 仍可报告 `oeDcf:true, zeroGrowthEpv:false`（诊断用）。旧文「DCF-only → single_lamp」作废。

类型名保留 `"full" | "single_lamp"`。

### 3.3 verdict 内改动

```ts
// 入参增加 methods: ValuationMethods（由调用方 deriveValuationMethods 传入）
const canReconcile = methods.oeDcf && methods.greenwaldGrowthCeilings;
// 无 IV 时 bucket 回退：用 canReconcile 替代旧 bothMethods（绑 ceilings）——保持「夹逼才用 consistency」
const coverage = methods.oeDcf && methods.zeroGrowthEpv ? "full" : "single_lamp";
// 返回值带 methods
```

**有 IV 时 bucket 路径零漂移**（不读 coverage）。

### 3.4 reconcile（逻辑不变）

GV ceilings 缺 → `comparable: false`。  
**夹逼**看 `reconciliation.comparable`；**coverage** 只表示「零增长 EPV + OE-DCF 是否都在」。

### 3.5 下游（约束 A 允许）

| 面 | 变化 |
|---|---|
| Badge `*` | 仅 `single_lamp`（真缺 OE-DCF） |
| Badge tooltip | 见 §5，不再写「仅金融」 |
| Screener | 仍以 `reliable` 为主；不强制 `full` |
| Snapshot | 重跑后 `coverage`/`payload.methods` 更新 |

---

## 4. 成长双轨决策表（契约）

| 条件 | GV | OE-DCF g₁ | `greenwaldGrowthCeilings` | 非 null 时 `coverage` | `reconciliation.comparable` |
|---|---|---|---|---|---|
| franchise，非 AI-hog，非 via_growth | 开 | 开 | true | full（若 DCF 也在） | 可为 true |
| franchise + AI-hog | 闸 0 | 主承载 | false | **full**（EPV+DCF） | false |
| franchise + moat_via_growth | 闸 0 | 主承载 | false | **full** | false |
| commodity / value_destruction | 闸 0 | 弱/低封顶 | false | full 若 DCF 在，否则 single_lamp | false |
| 金融：仅 Buffett 零增长灯，OE-DCF 可评估 | — | 开 | false | **full** | 多 false |
| 金融：仅 Buffett 灯，OE-DCF 不可评估 | — | — | false | **single_lamp** | false |

---

## 5. Badge 与文档（交付范围）

### 5.1 `ValuationBadge` 文案（必须改）

| lang | 旧 `lamp` | 新 `lamp` |
|---|---|---|
| zh | 金融单灯口径 | 单法口径（无所有者盈利 DCF） |
| en | Single-lamp basis (financials) | Single-method basis (no owner-earnings DCF) |

`*` 触发条件不变：`coverage === "single_lamp"` 且非 unconfirmedCheap 叠 ⚠。

### 5.2 文档勘误

1. `2026-06-21-valuation-engine-v2-canonical-design.md` 顶注：运行时折现 **9–11%**。  
2. `2026-06-23-valuation-oe-dcf-cross-check-design.md` 注：`coverage=full` ≠ GV 夹逼成功；夹逼看 `reconciliation.comparable`。  
3. 本 spec §4 为成长双轨叙事源。

### 5.3 卡片句子

`bothMethods`（夹逼句）⇔ `methods.oeDcf && methods.greenwaldGrowthCeilings`。  
`oeDcf && !ceilings` ⇔ 已有 UX「保守价值带」句式。优先用传入的 `verdict.methods`。

---

## 6. 测试与验收

### 6.1 `.check.ts`

- `deriveValuationMethods`：三旗组合。  
- `deriveValuationVerdict`：无 ceilings + 有 DCF → `full`；无 DCF → `single_lamp`；有 IV 的 bucket **逐位不变**。  
- `runValuation`：ads / fundamentalsStale 早退；`priceStale` vs `no_price`；expectations 形状（含 `no_oe_dcf`）；methods 与 verdict.methods 一致。  
- Badge：不强制 RTL；至少常量/文案断言或手工 QA 清单。

### 6.2 真数据

| ticker | 期望 |
|---|---|
| NVDA | `coverage=full`，`reliable=false`，`bucket=above`，`methods.greenwaldGrowthCeilings=false`，徽章无 `*` |
| 真·无 DCF 单灯 | `single_lamp` + `*`（若展示） |
| franchise 双开 | `full`，ceilings true |

### 6.3 操作

`tsc`、相关 checks、部署前 `valuation:ingest`。

---

## 7. 风险

| 风险 | 缓解 |
|---|---|
| coverage 分布突变 | 约束 A；PR 说明 |
| ingest stale 语义与旧 skip 细微差别 | 统一为「无 verdict 不入表」；监控 intentionallyUnvaluable 计数 |
| 卡片未接 verdict prop | 交付清单强制 page 传入 |

---

## 8. 落地顺序

1. `deriveValuationMethods` + verdict coverage/methods + checks  
2. `runValuation` + checks  
3. page / ingest 接线；page 传 `verdict` 入卡片  
4. `ValuationBadge` 文案；snapshot `methods` 透传  
5. 文档勘误  
6. 真数据抽检 + ingest  

---

## 9. 成功标准

- 维护者读 `runValuation.ts` + §4 即可叙述全链。  
- NVDA 不为 `single_lamp`、无误导性 `*`。  
- page / ingest 无重复编排。  
- bucket / reliable / IV 抽检与改造前一致（coverage / methods / `*` / badge 文案除外）。  
