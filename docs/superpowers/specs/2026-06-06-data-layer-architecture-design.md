# Compounder 数据层目标架构 设计

- 日期: 2026-06-06
- 状态: 已与用户讨论确认方向，待写实现计划
- 适用: 数据层（持久化 + 摄取 + 读取 + 新鲜度/来源）整体重构，撑起「三合一」产品愿景
- 关联: `2026-05-30-productization-architecture-design.md`（13F/宏观早期方案，本文在其上收敛）；记忆 `product-direction`、`valuation-philosophy-constraint`

---

## 1. 背景：现状是三个互不相通的孤岛

北斗星愿景：**一页看懂某只股票——谁在买它(13F) × 它值不值(估值) × 大环境如何(宏观)**。产品 IA 已把 `/stocks/[ticker]` 提为一级。但当前数据层无法支撑：

| 支柱 | 现状 | 问题 |
|---|---|---|
| 谁在买(13F) | 打包 JSON `src/data/13f/*.json`（6 户、仅 latest+prior）；Supabase 4 表 schema 已建但线上无人灌，DB 只是 `source.ts` 回退分支 | 真源是 JSON（Bridgewater 单户 687KB），无法扩到 50 户×多季；无逐户新鲜度（Scion 晚三季无人察觉） |
| 大环境(宏观) | **双路径并存**：页面 `build.ts` 实时抓第三方 API；另有 `market_*` 5 表 + cron + freshness 的 DB 路，但前台不读它 | 前台裸抓、DB 白搭；一致性/成本/新鲜度割裂 |
| 值不值(估值) | **完全不存在** | 对标 AlphaSpread、手握价值投资 Skill 的护城河，却是数据层空白 |

**核心结论：愿景是「股票为中心」，但数据层没有一个被填充的、以 ticker 为锚的股票实体把三支柱接起来。** `securities` 表建了没填，13F 仍是 CUSIP 世界，估值无地基——「三合一」目前只是导航上的三合一。

---

## 2. 目标

1. 建立**以 ticker 为锚的「证券主表」脊梁**，三支柱事实表挂其上，使「三合一」在数据上成立。
2. **DB 成为唯一真源**，打包 JSON 退为无密钥本地/CI 回退种子；为扩到 50 户×多季做准备。
3. 把宏观那套成熟的 **provenance/freshness 契约提炼为全站公共能力**，13F/估值/宏观统一登记来源 + as-of（命中全局数据准确性规则）。
4. 为**估值支柱**建地基：多年财报事实层 + 保守估值产物层，并加一道**价值投资护栏**（禁投机/推荐/目标价）。
5. **聚合预计算**（共识/最多人持有），SEO 页直接读，不在请求时全表扫。
6. 收敛宏观双路径：前台改读库，cron 负责写。

---

## 3. 核心设计原则

- **P1 脊梁换锚点**：`securities` 以 `ticker` 为主键并被真正填充；CUSIP 退化为映射字段/别名。这是「三合一」总开关。
- **P2 DB 为真源**：保留 `source.ts` 的「有 env 读库、否则读 JSON」优雅回退，但翻转语义——线上必须有库，JSON 仅 dev/CI。
- **P3 统一 provenance**：`data_sources / ingestion_runs / freshness_status / ai_analysis_cache` 不再是 macro 专属，全站共用。
- **P4 事实与产物分离**：原始事实表（财报、持仓、价格、时间序列）与派生产物表（共识、估值、AI 叙述）分层，产物可重算、可缓存、可审计。
- **P5 估值护栏**：估值层不存 `rating(buy/sell/hold)` / `target_price` / 任何投机信号；只存「保守内在价值区间 + 安全边际 + 业务质量 + 是否进 strike zone」，让用户自己判断。（见 §4.4 与 `valuation-philosophy-constraint` 记忆）
- **P6 预计算优于请求时计算**：跨经理人共识等物化成表/视图。

---

## 4. 目标数据模型

```
                    ┌──────────────────────────────┐
                    │  securities  (脊梁 / 主表)     │  ticker 为锚
                    │  ticker PK, name, exchange,    │
                    │  sector, cusips[], figi, ...   │
                    └───────────────┬───────────────┘
        ┌───────────────────────────┼───────────────────────────┐
   谁在买│                       值不值│                       大环境│(弱关联)
┌────────▼─────────┐      ┌──────────▼──────────┐      ┌─────────▼─────────┐
│ managers          │      │ fundamentals (多年)  │      │ market_*           │
│ filings           │      │ prices (日更)        │      │ (series 为主,      │
│ holdings          │      │ valuation_runs       │      │  与个股弱关联)      │
│ consensus_* (物化) │      │  (估值产物/缓存)      │      └───────────────────┘
└──────────────────┘      └─────────────────────┘
   公共契约: data_sources / ingestion_runs / freshness_status / ai_analysis_cache
```

### 4.1 脊梁：`securities`（ticker 主表）

```
securities (
  ticker text primary key,            -- 锚点（如 AAPL）
  name text, exchange text, sector text, industry text,
  figi text,                          -- OpenFIGI/Finnhub 富化
  primary_cusip text,
  status text,                        -- active/delisted
  source text, as_of date,            -- provenance
  updated_at timestamptz
)
security_cusips (                      -- 一票多 CUSIP / 历史 CUSIP 映射
  cusip text primary key,
  ticker text references securities(ticker)
)
```
- 由 OpenFIGI/Finnhub 把 13F 出现过的全部 CUSIP 解析到 ticker——**同时解决「脊梁」与「CUSIP→ticker 桥」，是 Phase 1 第一步**。
- 现有 `securities(cusip PK)` 表语义反了（以 CUSIP 为主键），需迁移：ticker 升主键，CUSIP 入 `security_cusips`。

### 4.2 谁在买（13F）：基本沿用现有 + 加共识物化

- `managers / filings / holdings` 保留现有规范化模型（`web/supabase/schema.sql` 已有，设计正确）。
- `holdings.cusip` 经 `security_cusips` 关联到 ticker 脊梁。
- **新增物化层**（替代 `aggregations.ts` 的请求时全表扫）：
```
consensus_holdings (         -- 「最多人持有」按季预算
  period date, ticker text, holder_count int, total_value bigint,
  primary key(period, ticker)
)
consensus_moves (            -- 「最多人买/卖」按季预算
  period date, ticker text, direction text, manager_count int, net_value bigint,
  primary key(period, ticker, direction)
)
```
  摄取后一次性算好，SEO 页直接读。

### 4.3 值不值（估值）— 事实层

```
fundamentals (               -- 必须多年, 不是单年快照
  ticker text references securities(ticker),
  fiscal_year int, period_type text,        -- annual/quarter
  revenue, operating_income, net_income bigint,
  d_and_a, capex, working_capital_change bigint,  -- owner earnings 原料
  total_assets, total_equity bigint,
  shares_diluted numeric, dividends bigint,
  source text, filing_period date, as_of date,    -- 命中数据准确性规则
  primary key(ticker, fiscal_year, period_type)
)
prices (                     -- 日更 (Finnhub 主 / AkShare 兜底)
  ticker text references securities(ticker),
  date date, close numeric, currency text,
  source text, as_of timestamptz,
  primary key(ticker, date)
)
```
- 多年是硬需求：owner earnings / normalized earnings / EPV 都要跨周期，主键含 `fiscal_year`。

### 4.4 值不值（估值）— 产物层（带价值投资护栏）

```
valuation_runs (             -- 每种方法一行, 可复核
  id, ticker text references securities(ticker),
  method text,               -- 'graham' | 'epv_zero_growth' | 'owner_earnings_dcf' | 'sotp'
  layer text,                -- 'floor'(保守地基) | 'with_growth'(乐观叠加)
  intrinsic_low numeric, intrinsic_high numeric,   -- 区间, 非单点目标价
  margin_of_safety_pct numeric,                    -- 安全边际是一等公民
  quality_score numeric, moat_grade text,          -- 业务质量, 非价格信号
  in_strike_zone boolean,                          -- 是否进打击区, 让用户判断
  assumptions jsonb,         -- 折现率/增长/终值口径, 显式存, 可审计
  narrative_ref uuid references ai_analysis_cache(id),
  model text, source_data_timestamp text, created_at timestamptz
)
```

**护栏（不可妥协，见 `valuation-philosophy-constraint`）：**
- **禁止字段/表**：`rating(buy/sell/hold)`、`target_price`、技术/动量/情绪信号。任何「喊单」不进库。
- 输出只能是：保守内在价值区间 + 安全边际% + 质量/护城河 + 是否进 strike zone。
- `layer` 区分「保守 floor（资产价值/零增长 EPV）」与「含增长乐观值」，floor 永远先给地板，符合 margin of safety 哲学。
- 复用 Skill 产物落库：analyze-stock / buffett-valuation / greenwald-valuation / circle-of-competence-check / moat-assessment。
- AI 叙述 prompt 契约写死：解释业务质量/护城河/价值区间/安全边际，**不输出买卖建议**。

### 4.5 大环境（宏观）：沿用 `market_*` + 收敛双路径

- `market_data_sources / market_time_series_observations / market_ingestion_runs / market_freshness_status / market_ai_analysis_runs` 保留（设计成熟，见 `web/supabase/schema.sql`）。
- **收敛双路径**：`build.ts` 改为读 `lib/db/market.ts`（DB），cron `/api/cron/market-ingest` 负责写；前台不再裸抓第三方。
- 宏观与个股弱关联（如行业/利率环境），不强行塞进脊梁。

### 4.6 公共 provenance 契约（全站共用）

把宏观已有的 `market_data_sources / market_ingestion_runs / market_freshness_status` 提炼为通用维度，13F filing、prices、fundamentals 都登记来源 + as-of + 新鲜度。`ai_analysis_cache`（已存在，`lib/ai/deepseek.ts` 在用）作为全站 AI 产物缓存。
- 收益：Scion「悄悄晚三季」会被 freshness 自动标红；每条数据 UI 可统一展示来源+日期。

---

## 5. 与现有实现的差异 / 迁移要点

| 现状 | 目标 | 动作 |
|---|---|---|
| `securities(cusip PK)` 未填充 | `securities(ticker PK)` + `security_cusips` | 迁移主键 + OpenFIGI/Finnhub 富化 |
| 13F 真源 = 打包 JSON | DB 真源，JSON 退回退 | ingest 写库为主路；`source.ts` 语义翻转 |
| `aggregations.ts` 请求时全表扫 | `consensus_*` 物化表 | 摄取后预算，页面改读表 |
| 估值无表 | `fundamentals / prices / valuation_runs` | 新建（Phase 1/2/3） |
| 宏观 `build.ts` 实时抓 | 读 `market_*` DB | 切数据源，cron 写 |
| provenance 仅 macro | 全站统一 | 13F/估值接入 freshness |

---

## 6. 分阶段落地（映射 Phase 路线）

- **Phase 1（数据地基）——先做脊梁，再做日更价**
  1. `securities` 升 ticker 主表 + `security_cusips` + CUSIP 富化（OpenFIGI/Finnhub）。
  2. 13F 真正落库（DB 成真源，JSON 退回退）；接入统一 provenance/freshness。
  3. `consensus_*` 物化；页面改读表。
  4. `prices` 日更（Finnhub 主/AkShare 兜底），挂脊梁。
  5. 宏观 `build.ts` 切读库，消灭双路径。
- **Phase 2** `fundamentals` 多年财报回填——估值燃料。
- **Phase 3** `valuation_runs` + Skill 产物落库 + AI 叙述（复用 `ai_analysis_cache`）；SEO/GEO/打点/分享卡。

---

## 7. 未决问题（待后续确认，不阻塞本设计）

1. 财报数据源选型（Finnhub fundamentals? SEC XBRL? 财报覆盖年限目标，如近 10 年）。
2. Supabase 免费档容量核算：50 户×~20 季×数百持仓 + 多年财报 + 日更价，是否仍在 500MB 内。
3. 摄取托管：GitHub Actions 批处理（回填/重活，免 300s 限）vs Vercel cron 的分工边界。
4. `securities` 主键迁移期间的 13F 兼容（CUSIP-keyed 页面 301 到 ticker）。

---

## 8. 验收标准

- 存在被填充的 `securities`(ticker) 脊梁，13F holdings 可经 CUSIP 关联到 ticker。
- 13F 数据持久化于 Supabase（DB 真源），无密钥本地仍可 build（JSON 回退）。
- 共识/最多人持有走物化表，SEO 页不再请求时全表扫。
- 估值层 schema 含 `fundamentals/prices/valuation_runs`，且**不含任何推荐/目标价字段**；估值产物含区间+安全边际+质量+假设。
- 全站数据可统一展示来源 + as-of + 新鲜度状态。
- 宏观前台改读库，单一数据路径。
- 全程免费档可运行；`npm run build` 通过；保留 JSON 回退便于无密钥开发。
