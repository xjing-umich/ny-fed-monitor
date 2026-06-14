# 免费价格数据层设计（Yahoo v8 主源 + Stooq + Twelve Data 三源降级）

**日期**: 2026-06-14
**状态**: 设计已确认，待写实现计划
**作者**: brainstorming session

## 背景与目标

研究/估值页需要股票价格（最新收盘价 + 历史），用于市值、PE、P/FCF、走势图、历史估值带。
要求：**零付费**、覆盖全 `securities` universe（~1545 票）、有历史、不被单一源锁死。

调研结论（2026-06）：

- Finnhub 免费档历史 K 线已转付费，只剩当日 quote，无法做历史回填。
- Stooq 免费、无硬性限速、按符号 CSV 返回完整日线历史且含最新 EOD，能同时干"历史 + 每日"。
- Twelve Data 免费档 8 次/分、800 次/天，限速紧，不足以扛全量每日，但适合补缺口。

**决策**：三个零/免费源藏在同一 provider 抽象后，resolver 按 `[Yahoo, Stooq, TwelveData]` 顺序降级（第一个新鲜结果即用）；Yahoo v8 chart 作主力（结构化 JSON、`range=max/5y` 一次拿全历史、`range=5d` 拿每日），Stooq/Twelve Data 兜底；退役旧 Finnhub 代码。三家不同运营商分散 ToS/宕机风险。

> **更新（源选型）**：原计划 Stooq 主、Twelve Data 补；调研 simonlin1212/global-stock-data（Apache-2.0）后确认 Yahoo v8 chart 零 key 端点返回干净 JSON、一次拿全历史，比 Stooq CSV 更优，故提为主力，Stooq 降为次源。中国主机源（Sina/Tencent/Eastmoney）不进生产热路径（美国节点访问不稳）。

## 已确认的关键决策

| 决策点 | 选择 |
|---|---|
| 每日价格覆盖范围 | 全 `securities` ~1545 票（方案 A） |
| 源优先级 | Yahoo v8 chart 主 → Stooq 次 → Twelve Data 末（逐个降级，互为兜底）|
| 历史深度 | 默认近 5 年（可配，约 200 万行） |
| 每日 runner | Vercel cron（轻量 1545 票 < 300s） |
| 旧 Finnhub 代码 | 退役删除，不留为 provider 备选 |

## 架构

```
  Yahoo v8 ────▶┌─────────────────────────────────┐
  Stooq ───────▶│   PriceProvider 抽象层           │
  TwelveData ──▶│ ([Yahoo, Stooq, TwelveData] 降级) │
                └──────────────┬──────────────────┘
                               ▼
                        prices 表 (入库)
                               ▼
       getLatestPrice() / getPriceHistory()  ← 页面/估值只读库
```

沿用现有 "store-first" 模式：入库 + 定时刷新，页面永不直连外部源（与 SEC fundamentals 读存储一致）。

## 组件设计

### 1. Provider 抽象 — 新增 `web/src/lib/prices/providers/`

```ts
type PriceSource = 'yahoo' | 'stooq' | 'twelvedata';

interface DailyClose {
  ticker: string;
  date: string;       // YYYY-MM-DD (UTC)
  close: number;
  currency: string;   // 'USD'
  source: PriceSource;
}

interface PriceProvider {
  name: PriceSource;
  fetchDaily(ticker: string): Promise<DailyClose | null>;            // 最新 EOD
  fetchHistory(ticker: string, sinceYears: number): Promise<DailyClose[]>;
}
```

文件：

- `providers/yahoo.ts`（**主源**）
  - 历史：`https://query2.finance.yahoo.com/v8/finance/chart/{sym}?interval=1d&range=5y`（或 `max`，JSON OHLCV）
  - 每日：同端点 `range=5d` 取末行收盘
  - 符号：US 原样大写，点号转连字符（`BRK.B` → `BRK-B`）；带 `User-Agent` 头
- `providers/stooq.ts`（次源）
  - 历史：`https://stooq.com/q/d/l/?s={sym}&i=d`（完整日线 CSV）
  - 每日轻量 quote：`https://stooq.com/q/l/?s={sym}&f=sd2t2ohlcv&h&e=csv`
- `providers/twelveData.ts`（末源）
  - 历史：`/time_series?symbol={ticker}&interval=1day&outputsize=...`；每日：`/quote?symbol={ticker}`
  - 仅用于补前两源缺口，受 800/天额度约束（按天计数并限额）
- `providers/index.ts` — resolver：按 `[Yahoo, Stooq, TwelveData]` 顺序逐个尝试，返回第一个非陈旧结果；都陈旧则返回首个非空；记录实际命中源到 `DailyClose.source`
- `symbol.ts` — `toYahooSymbol`（点号转连字符）+ `toStooqSymbol`（小写 + `.us`，点号转连字符）
- 纯解析函数 `parseYahooChart` / `parseStooqCsv` / `parseTwelve*` 与网络 IO 分离（沿用现有 `parseQuote` 风格，便于手测/单测）

### 2. 数据库 — 新增 migration `web/supabase/migrations/20260614_create_prices.sql`

```sql
create table if not exists prices (
  ticker text not null references securities(ticker),
  date date not null,
  close numeric not null,
  currency text not null default 'USD',
  source text not null,           -- 'yahoo' | 'stooq' | 'twelvedata'
  as_of timestamptz not null default now(),
  primary key (ticker, date)
);
create index if not exists prices_ticker_date_idx on prices(ticker, date desc);

create table if not exists price_ingest_runs (
  id bigint generated always as identity primary key,
  run_type text not null,         -- 'backfill' | 'daily'
  status text not null,           -- 'running' | 'success' | 'error'
  rows_written int,
  tickers_total int,
  tickers_filled_by_fallback int,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
```

`prices` 天然支持多源（`source` 列）。`price_ingest_runs` 镜像 `sec_ingest_runs`，供运维 + health-watchdog。

### 3. 两个入口

- **一次性回填** `npm run prices:backfill`
  - 遍历全 `securities`（1000 行分页，沿用 `updatePrices.ts` 既有读法）
  - 每票 Stooq 拉近 5 年日线入库；Stooq 缺则 Twelve Data 补
  - 长任务，本地或 GitHub Action 跑；幂等 upsert（PK = ticker+date）可断点重跑
- **每日增量** Vercel cron `/api/cron/prices/route.ts`
  - 复用 `isAuthorizedIngestRequest`（Bearer `CRON_SECRET` / `INGEST_SECRET`）
  - 全 1545 票走 Stooq 轻量 quote，并发限流（控制在 ~4 分钟内，< 300s 函数上限）
  - 当日 Stooq 缺口用 Twelve Data 补（≤800/天）
  - 写入前后记 `price_ingest_runs`
  - 加入 `web/vercel.json` crons，工作日收盘后（如 `30 21 * * 1-5` UTC，约美东收盘后）

### 4. 读取层 & 估值接入

- 保留 `web/src/lib/managers/priceRead.ts` 的 `getLatestPrice(ticker)`（读最新一条）
- 新增 `getPriceHistory(ticker, range)` 供走势图 / 历史估值带
- `web/src/lib/research/valuation/calculateValuation.ts` 改为**读库**（`getLatestPrice`）而非 live fetch；库里没有再可选 live 兜底
- 删除/退役 `web/src/lib/prices/finnhub.ts` 与估值里的 Finnhub live fetch（`priceProvider.ts` 重写为指向新 provider 抽象）

## 数据准确性（呼应全局规则）

- 每条价格带 `source` + `date` + `as_of`
- 页面/估值显示"截至 {date}，来源 Stooq / Twelve Data"
- `price_ingest_runs` + health-watchdog 检测 latest date 陈旧（> N 个交易日）告警
- 绝不静默供旧价；陈旧时 UI 明示

## 错误处理

- Stooq 单票失败/超时：跳过并计数，不中断整批；交由 Twelve Data 补或下次重试
- Twelve Data 达额度上限：停止补洞，记录到 `price_ingest_runs.error_message`，不报错中断
- 符号映射不中：记录未覆盖 ticker，供人工核对
- 幂等 upsert：任何入口可安全重跑

## 验证方式

项目惯例无测试套件（见 memory `no-tests-solo-dev`）：

- `tsc` 通过
- 纯解析函数 `parseStooqCsv` / `parseTwelveData` 手测样例 CSV
- 跑 backfill 抽样（AAPL、BRK.B 含点号符号、一只 ETF）核对入库行数与已知收盘价
- 每日 cron 本地 dry-run 核对 Stooq 命中率 + Twelve Data 补洞计数

## 范围外（YAGNI）

- 不做技术指标 / 均线 / 买卖信号（违反估值哲学约束，见 memory `valuation-philosophy-constraint`）
- 不做盘中/实时价（只做 EOD）
- 不做全历史（默认 5 年，按需再扩）
- 不接付费源（留 provider 口子，将来要换零改动）
```