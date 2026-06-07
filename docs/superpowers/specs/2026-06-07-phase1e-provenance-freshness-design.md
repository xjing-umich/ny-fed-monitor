# Phase 1E — 统一 provenance / freshness（脊梁侧派生层）

- 日期: 2026-06-07
- 适用: 数据层「来源 + as-of + 新鲜度」的统一展示，覆盖 13F / 价格两类脊梁数据
- 前置: Phase 1A 脊梁、1B 共识、1C 价格 + 自动更新均已完成并入 `db-foundation`
- 关联记忆: 全局数据准确性硬规则（每次拉数据须确认最新、标注来源+日期）；`valuation-philosophy-constraint`（本期不涉估值，仅事实陈述）

## 1. 目标与非目标

**目标**：让用户在消费数据时，一眼看到每个数字的**来源、截止日期（as-of）、是否新鲜**。具体到本期：
- 价格：日更，落后超过阈值自动标"过期"。
- 13F：季度，按户判定；某户晚报（如 Scion 晚三季）自动标红。
- 顺带修复 `prices.as_of` 重跑不刷新的已知问题（1C 遗留）。

**非目标（本期明确不做）**：
- 不动 macro 既有的 `market_data_sources / market_freshness_status` 等表与 `db/freshness.ts`——macro 路径维持现状。
- 不新建任何通用 provenance 维度表（`data_sources / ingestion_runs / freshness_status` 的全量泛化推迟）。
- 不做独立 `/data` 状态页。
- 不涉及估值/财报（Phase 2/3）。

## 2. 设计原则（本期的硬约束）

1. **零新表**：新鲜度全部从**已加载的数据**派生，不新增任何 DB 表。
2. **零新查询路径**：不新建 `freshnessRead.ts` 之类的并行读取器；as-of 值复用现有读取器已经返回的字段（见 §4）。
3. **零 macro 耦合**：脊梁侧自带一个极小的 `FreshnessStatus` 类型，取值是 macro enum 字符串的**子集**，便于将来并轨，但当前不 import macro 模块。
4. **单一扩展点**：未来要给 fundamentals 等新数据加新鲜度，只需在纯函数模块里加一个 `xxxFreshness`，UI / 类型不变。

## 3. 唯一新增逻辑：纯函数模块

`web/src/lib/freshness/derive.ts`（纯逻辑、无 `server-only`、无 DB 依赖 → 可单测、可复用）：

```ts
export type FreshnessStatus = "fresh" | "stale" | "empty";
// 取值是 macro `MarketFreshnessStatusValue` 的子集；将来并轨零摩擦，当前不耦合。

export const PRICE_STALE_AFTER_TRADING_DAYS = 3; // 价格：最新交易日落后超过 3 个工作日 → stale
export const FILING_DEADLINE_DAYS = 45;          // 13F：季度末 + 45 天为 SEC 截止日

// 价格新鲜度：latestDate 为最新价格交易日 (YYYY-MM-DD)，today 注入便于测试
export function priceFreshness(latestDate: string | null, today: Date): FreshnessStatus;

// 13F 新鲜度：latestPeriod 为某户最新 filing 期 (YYYY-MM-DD, 季度末)，today 注入
export function filingFreshness(latestPeriod: string | null, today: Date): FreshnessStatus;

// 辅助（纯）
export function mostRecentDueQuarter(today: Date): Date; // 最近一个已过 45 天截止的季度末
export function tradingDaysBetween(from: Date, to: Date): number; // 工作日（周一~周五）计数
```

**判定规则**：
- `priceFreshness`：`latestDate` 为空 → `empty`；`tradingDaysBetween(latestDate, today) > 3` → `stale`；否则 `fresh`。
- `filingFreshness`：`latestPeriod` 为空 → `empty`；`latestPeriod < mostRecentDueQuarter(today)` → `stale`（晚报）；否则 `fresh`。

**节假日处理**：`tradingDaysBetween` 只排除周末、不排除联邦假日。后果是节假日附近**偏向标 stale（保守）**，符合"宁可提示旧、不可谎称新"的硬规则。明确接受，不引节假日表。

**时间注入**：所有函数把 `today` 作为参数（而非内部 `new Date()`），保证纯、可测；调用方在 server 组件传入 `new Date()`。

## 4. as-of 数据来源（全部复用现有读取器，不新增查询）

| 数据 | as-of 值 | 现有来源（已在查） |
|---|---|---|
| 价格 | `price.date` | `priceRead.getLatestPrice()` 已返回 `date` |
| 13F（个股页） | 持有方最新 `period` / `latestFiledAt` | 个股页已从已加载的 filing 数据算出 |
| 13F（经理人列表/详情） | 每户最新 `period` | `managers/supabase.ts` 的 `IndexRow` 已带 `period` |

结论：**无需新增任何 DB 读取**，新鲜度在各页面对"手头已有的数据"调用 §3 的纯函数即可。

## 5. UI（最小扩展，不重写）

- `components/entity/SourceFooter.tsx`：`Source` 类型加可选 `status?: FreshnessStatus`；每个来源名前加一盏 `<FreshnessDot>`。
- 新增 `components/entity/FreshnessDot.tsx`：极小组件，按 `fresh/stale/empty` 渲染绿/琥珀/灰圆点 + `aria-label`/title（无障碍 + hover 说明）。徽章场景复用同一组件。
- 文案英文优先、中英双语（遵 `seo-english-first` 记忆）。

## 6. 接入三处（喂已加载数据）

1. **个股页 `/stocks/[ticker]`**：`sources` 的价格项与 13F 项各带 `status`（`priceFreshness` / `filingFreshness`）。替换现有手写 sources 块的纯文本。
2. **经理人/投资人 列表 + 详情**：每户一个 13F 新鲜度徽章（`FreshnessDot` + 最新季度标签，如 `Q1 2026`），晚报标红。
3. **首页共识区**：一行整体新鲜度提示——"数据截至 最近 filings (Qx 20xx) / 收盘 (YYYY-MM-DD)" + 整体灯（取最差状态）。

## 7. 顺带修复：`prices.as_of` 刷新

`scripts/lib/updatePrices.ts` 的 upsert 负载加 `as_of: new Date().toISOString()`，使同 `(ticker, date)` 重跑也刷新内部 provenance 时间戳。说明：用户可见的 as-of 是交易日 `date`，不受影响；`as_of` 是内部 provenance 字段。

## 8. 测试与验证门禁

项目无常驻测试套件（solo dev）：`vitest` 未安装、无 `test` 脚本，现有 4 个 `.test.ts`（openfigi/consensusRead/priceRead/securities）是 ad-hoc `npx vitest` 跑的。本期沿用同一约定，不引入新测试流水线。

- **纯逻辑测试**：新增 `web/src/lib/freshness/derive.test.ts`，**沿用现有 vitest 风格**（与上述 4 个文件一致），可 `npx vitest run src/lib/freshness` 临跑。覆盖：
  - 价格：当天/隔周末仍 `fresh`；落后 > 3 工作日 `stale`；空 `empty`。
  - 13F：当季已报 `fresh`；晚一/三季（Scion 场景）`stale`；空 `empty`。
  - `mostRecentDueQuarter` / `tradingDaysBetween` 边界（季度末跨年、45 天临界、周末计数）。
- **日常门禁（必过）**：`node_modules/typescript/bin/tsc --noEmit` + `npm run build` + 人工看页面（个股页/经理人页/首页）。
- **环境提醒**：本机 nvm 默认是古董 v10；务必用 `.nvmrc` 指定的 node 20（`~/.nvm/versions/node/v20.20.0/bin`）跑 tsc/build，否则 tsc 自身因 `??` 语法报错。

## 9. 验收标准

- 个股页价格与 13F 各显示来源 + as-of + 新鲜度灯；价格 cron 连挂会标黄/红。
- 经理人列表/详情每户带 13F 新鲜度徽章；构造一个晚报户能看到标红。
- 首页共识区有一行整体新鲜度提示。
- `derive.ts` 纯函数测试通过；`npm run build` 通过；JSON 回退（无密钥本地）不报错（无价格/无库时显示 `empty` 灰灯，不崩）。
- 未新建任何 DB 表；未改动 macro 模块与文件。
- `prices.as_of` 重跑后刷新（可在脚本层验证）。

## 10. 净增清单（自检：简洁）

- 新增 1 个纯模块 `lib/freshness/derive.ts`（+ 测试）。
- 新增 1 个小组件 `FreshnessDot.tsx`。
- 改 `SourceFooter.tsx` 加 1 个可选字段。
- 3 处页面接入（个股页 / 经理人 / 首页）调用纯函数。
- `updatePrices.ts` 加 1 行 `as_of`。

零新表、零新查询、零 macro 耦合。
