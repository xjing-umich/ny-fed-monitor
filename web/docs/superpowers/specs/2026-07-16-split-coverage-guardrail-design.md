# 拆股口径护栏(Phase 1)— 设计

日期:2026-07-16
分支:jlz/interesting-euclid-e45ae8(base = db-foundation)
状态:设计已定,待写实现计划

## 背景与根因(已复现)

生产站个股页把 **KLAC** 判为「低于内在价值 / 击球区(有安全边际)」,是**假信号**。

KLA Corporation 于 **2026-06-12 完成 10-for-1 拆股**。价格层已更新到拆股后口径($224.50,as-of 2026-07-15,Yahoo),但每股内在价值仍用**拆股前**的 `shares_diluted` 计算,两个口径差 10 倍,造出巨大假安全边际。

真实探针输出(真实引擎实时路径,`computeValuationFloor → deriveStrikeZone → deriveOeDcf → deriveValuationVerdict`):

| 字段 | 输出 |
|---|---|
| `shares_diluted`(FY2025,as-of 2025-06-30,**拆股前**) | 133,750,000 |
| 价格(**拆股后**) | $224.50 |
| 零增长底/股 | $258.83 |
| 中枢 IV/股 | $465.15 |
| 安全边际 | 51.7% |
| verdict | `below` + `inStrikeZone=true` + `reliable=true` |

51.7% < `SANE_MARGIN_MAX`(80%),恰好漏出现有护栏。

### 决定性约束(定死了修法边界)

1. **不是快照重算问题,是口径问题**:拆股后 KLAC 至今**无任何 SEC 申报**(财年 6/30 结束,FY2026 约 2026 年 8 月才报),SEC 侧数据全是拆股前的。用同样股数重算快照 → 结果不变。
2. **拆股信号在库里不可恢复**:存储的价格历史已被 Yahoo 回溯复权(2026-06-12 前后**无 10 倍跳空**,整条序列都是拆股后口径),SEC 股数还没更新。拆股这件事今天**只存在于 Yahoo 的 splits 事件流**里,当前 ingest 未抓。
3. 全代码库无任何拆股调整逻辑;`SANE_MARGIN_MAX`、`EXTREME_OE_YIELD`(33%)两道闸都因"拆股后价格本身不小、误差落在看似合理区"而被绕过(KLAC 假 OE 收益率 ~12% < 33%)。

## 目标与非目标

**目标**:当"基本面 as-of 早于最近一次拆股、且价格已是拆股后口径"时,**抑制**被放大的假估值判定(整条 verdict 返回 null),并在个股页给一句诚实说明。护栏对全 universe 通用,非 KLAC 专修。

**非目标(留 Phase 2,另开 thread)**:纠正每股数字口径(把拆股前期数的 `shares_diluted × 累积拆股因子` restate 到拆股后基准,让 KLAC 正确显示"远高于内在价值")。

## 设计决策(已与用户确认)

- 拆股数据源 = Yahoo `chart` 请求加 `&events=splits`,新建 `stock_splits` 表存储。
- 触发时**整条 verdict 返回 null**(走现有 `isImplausibleBand` 的"无可信判定"语义),非只标 `reliable=false`——因为拆股场景下整条价值带($259–$589/股)本身错 10 倍。
- 抑制时个股页**给一句 en+zh 说明**,而非静默空缺。
- as-of 精度 = **最新 FY `period_end` 全日期**(非仅 `as_of_fiscal_year` 年份),避免跨年边界误判。

## 改动单元

### 单元 1 — Yahoo splits 抓取

文件:`web/src/lib/prices/providers/yahoo.ts`(+ types)

- `chart` URL 加 `&events=splits`(现为 `?interval=1d&range=...`)。
- 新增解析 `chart.result[0].events.splits`(形如 `{ "<ts>": { date, numerator, denominator, splitRatio } }`)→ 归一为 `{ ticker, split_date(ISO), ratio = numerator/denominator }`。
- 价格 provider 接口(`PriceProvider` / `DailyClose` 所在 `types.ts`)扩展一个可选返回通道传出拆股事件,或新增 `fetchSplits(ticker)` 方法。实现时择一,保持接口内聚。
- **单元测试**:喂一段含 splits 的 Yahoo JSON fixture,断言解析出正确 `{split_date, ratio}`;喂无 splits 的 JSON,断言返回空。价格解析行为不回归(未复权 close 不变)。

### 单元 2 — `stock_splits` 表

文件:`web/supabase/migrations/20260716_create_stock_splits.sql`

```sql
create table if not exists public.stock_splits (
  ticker text not null,
  split_date date not null,
  ratio numeric not null,
  primary key (ticker, split_date)
);
notify pgrst, 'reload schema';
```

- 幂等(`if not exists`),模仿现有迁移(`20260706_create_consensus_coownership.sql` 等)风格。
- 价格 ingest(`web/scripts/prices.ts`)在抓价时顺带 `upsert` 拆股事件到此表。

### 单元 3 — 护栏纯函数 + 收口

新文件:`web/src/lib/valuation/splitCoverage.ts`

```ts
/** 基本面 as-of 早于最近拆股日期 → 每股口径与拆股后价格错配,判定不可信。 */
export function isSplitCoverageStale(input: {
  fundamentalsAsOf: string | null; // 最新 FY period_end(ISO date)
  latestSplitDate: string | null;  // stock_splits 中该 ticker 最近拆股日期
}): boolean {
  const { fundamentalsAsOf, latestSplitDate } = input;
  if (!latestSplitDate || !fundamentalsAsOf) return false;
  return latestSplitDate > fundamentalsAsOf; // ISO date 字符串可字典序比较
}
```

改 `web/src/lib/valuation/deriveValuationVerdict.ts`:

- 入参 `input` 增可选字段 `splitCoverageStale?: boolean`。
- 函数最前(拿到 floor 之后、计算 bucket 之前)：`if (input.splitCoverageStale) return null;`。语义与 `isImplausibleBand` 一致——无可信判定,不污染最敏感的面。
- 更新文件顶部注释,登记这道新护栏。

**单元测试**(`splitCoverage.check.ts` + 扩 `deriveValuationVerdict.check.ts`):
- `isSplitCoverageStale`:split 晚于 as-of → true;split 早于/等于 as-of → false;任一为 null → false。
- `deriveValuationVerdict`:`splitCoverageStale=true` → 返回 null(即便 floor/strikeZone 完整);`false`/`undefined` → 行为逐字不变(回归)。

### 单元 4 — 三个调用点接线

各调用点读取 `getLatestSplit(ticker)` + 取最新 FY `period_end`,算 flag 传入 `deriveValuationVerdict`。

新增读取器:`web/src/lib/managers/priceRead.ts`(或就近)`getLatestSplit(ticker): Promise<string | null>` — 查 `stock_splits` 该 ticker `max(split_date)`;无 env/无行 → null;`cache()` 包裹。

调用点:
1. `web/src/app/[lang]/stocks/[ticker]/page.tsx:412`(个股页,实时)
2. `web/src/components/valuation/EarningsPowerFloorCard.tsx:294`(卡片)—— 若为客户端/纯展示组件,`splitCoverageStale` 由其服务端父级作为 prop 传入,组件不自行取数。
3. `web/scripts/valuation-ingest.ts:165`(快照)

"最新 FY period_end":调用方已持有 `sec.annual`,取 `fiscal_period==='FY'` 中最大 `period_end`。抽一个小工具 `latestFyPeriodEnd(rows)` 复用于三处,避免逻辑漂移。

### 单元 5 — 个股页说明文案

文件:`web/src/app/[lang]/stocks/[ticker]/page.tsx` 估值结论区。

- 同一 `splitCoverageStale` 为 true 且 verdict 为 null 时,渲染一句说明(遵 `docs/copy-voice.md`,具体、去 AI 腔,en/zh 各自独立):
  - zh:「该公司近期拆股,每股估值口径待下一份财报对齐后恢复。」
  - en:「Recent stock split — per-share valuation is paused until the next filing restates the share count.」
- 仅个股页需此文案;投资人页/screener 遇 null 照旧静默(可接受)。

## 数据流

```
price ingest ──(Yahoo &events=splits)──► stock_splits 表
                                               │
个股页/卡片/快照 ── getLatestSplit(ticker) ────┤
                 ── latestFyPeriodEnd(annual) ─┤
                                               ▼
                        isSplitCoverageStale(...) = true
                                               │
                    ┌──────────────────────────┴───────────────┐
                    ▼                                           ▼
        deriveValuationVerdict → null              个股页渲染 en/zh 说明
```

## 自愈

拆股后 10-K/10-Q 被 ingest → 最新 FY `period_end ≥ split_date` → `isSplitCoverageStale` 自动转 false → 估值恢复,无需人工干预。

## 错误处理与边界

- `stock_splits` 表缺失 / 无 env → `getLatestSplit` 返回 null → 护栏不触发(降级为今日行为,不崩)。
- 无价格 / 货币不匹配等既有分支不受影响(护栏只在 verdict 本可算出时才抢先返回 null)。
- ISO date 字符串字典序比较对 `YYYY-MM-DD` 安全。

## 上线步骤(需用户授权)

1. 合并后跑一次 **price ingest**(带新 `&events=splits`)→ 填 `stock_splits`,护栏才生效。
2. 估值快照重算走 **valuation:ingest** → 生产快照消化护栏(KLAC 快照行变为无判定)。

## 验证(真数据 + 真页面)

- 改造后重跑 KLAC 探针:verdict 应为 `null`(附加 `splitCoverageStale=true`)。
- 对照票:挑一只近期无拆股的票(如 AAPL 最近一次拆股 2020-08,早于其 as-of)→ verdict 与今日逐字一致,证明零误伤。
- 个股页(dev server / preview)看 KLAC 估值区渲染 en/zh 说明而非假击球区。
- `npx tsc` 零错;`.check.ts` 单测全绿。

## 相关记忆

`[[bug-audit-2026-07]]`、`[[valuation-broad-universe-guardrails]]`(同源 per-share 口径 bug)、`[[sec-valuation-ingest-ops]]`、`[[graham-net-net-floor]]`(验证铁律:查 `fiscal_period=FY` 行,交验走真引擎)。
