# DGS10 持久化 last-good + DB 回退 — 设计

> 日期：2026-06-27 · 分支：`worktree-dgs10-persist-fallback`（off `origin/db-foundation` @ 12ab4a4）
> 状态：设计已与用户确认（方案 A），待写实现 plan

## 1. 背景与问题

估值引擎的 OE-DCF 贴现带应锚定到当日 10 年期国债收益率（FRED **DGS10**）。实测（2026-06-27）：

- `getLatestDgs10`（`web/src/lib/managers/treasuryRead.ts`）走**实时 FRED**：`fetchFredSeries("DGS10")` 打 `https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10`（keyless 但慢），外层套 **6s 硬超时**（`DGS10_TIMEOUT_MS`，原为保护页面预渲染不挂死）。
- **该抓取在生产 CI 也稳定超时**：`valuation.yml`（每日 12:00 UTC，ubuntu）2026-06-27 那次日志 `getLatestDgs10 failed: DGS10 fetch timed out after 6000ms`。
- 后果：全表 **1028 只估值都用未锚定回退带**（`ownerEarningsDcf.ts` 的 `FALLBACK_BAND` 9–11%，标 `anchored:false`）。影响**程度温和**（9–11% 刻意贴近典型锚定值），但**违背"锚定实时国债"承诺与 provenance，且利率明显变动时会静默漂移**。
- DB 里**无**物化 DGS10：`macro_snapshot` 仅含 NY Fed 国债监测（回购/RRP/拍卖/SOMA），不含 10Y 收益率；`market_rates`/`treasury_rates` 等表不存在。live FRED 是唯一来源。

## 2. 目标与方案（已确认 = 方案 A）

让 `getLatestDgs10` 在 live FRED 失败时**回退到 DB 持久化的上次成功值（带日期）**，使估值始终锚定到真 10Y（最多落后一两天、且诚实标日期），而非泛用回退带。配一个**耐心 writer** 在 FRED 可达时播种/刷新该 DB 值。

## 3. 范围

**做：**
- 新表 `market_rates`（通用利率 last-good 存储）。
- `fetchFredSeries` 加可选 `timeoutMs` 参数（不改默认行为）。
- 新增 writer `persistDgs10()`：耐心抓取 + 重试 + upsert。
- `getLatestDgs10` live 失败 → 读 `market_rates` 回退。
- valuation-ingest 循环前调用 `persistDgs10()`。

**不做（YAGNI）：**
- 不改页面渲染的 6s 上限（渲染仍快失败，但现在多一层 DB 回退）。
- 不引入 FRED API key（除非 §7 兜底升级被触发）。
- 不把 DGS10 纳入 macro_snapshot 物化（路线图 1D，更大，另议）。
- 不动其它 FRED 消费方（buildAllSections 等）。

## 4. 架构与单元

### 4.1 新表 `market_rates`（migration `20260627_create_market_rates.sql`）

```sql
create table if not exists market_rates (
  series_id  text primary key,
  value      double precision not null,
  as_of      date not null,
  updated_at timestamptz not null default now()
);
```
通用：DGS10 为首行；将来其它单值利率（如 DGS2）可复用。

### 4.2 `fetchFredSeries(id, timeoutMs?)`（`web/src/lib/sources/fred.ts` 改）

加可选第二参 `timeoutMs`（默认 `FRED_TIMEOUT_MS=8000`，**现有调用零行为变化**）。内部 `AbortSignal.timeout(timeoutMs)`。供耐心 writer 传更长值。

### 4.3 writer `persistDgs10()`（`treasuryRead.ts` 新增导出）

- **耐心抓取**：调 `fetchFredSeries("DGS10", 20000)`，失败重试 2 次（共 3 次尝试，指数退避带抖动可选）。
- 成功 → `pickLatestFredPoint` 取最新有效点 → `upsert market_rates {series_id:'DGS10', value, as_of:date}`（`onConflict: series_id`）。
- 失败 → 不抛、记 `console.warn`，返回 `false`（不污染既有 last-good）。返回 `boolean` 表是否刷新成功。
- server-only 模块；在 ingest（server-only 被 stub）与 cron 上下文可用。DB 用 `getDb()`（`@/lib/managers/db`）。

### 4.4 `getLatestDgs10()`（`treasuryRead.ts` 改）

保持现有 live-first（6s + 进程熔断，求新鲜、保护渲染）：
- live 成功 → 返回 live `{value, date}`（不写库；写库只在 writer/ingest 上下文）。
- live 失败/超时/熔断 → **读 `market_rates` where series_id='DGS10'** → 命中返回 `{value, date: as_of}`；未命中 → `null`（维持现有诚实降级）。
- DB 读出错（表缺 42P01/PGRST205 等）→ 静默 → `null`。

> provenance 诚实：消费方 `discountBand` 已在 note 里打印 `dgs10_date`，故"昨天的值"会如实显示为 as-of 该日，不冒充当日。

### 4.5 接线 valuation-ingest

`web/scripts/valuation-ingest.ts`：universe 循环**前**先 `await persistDgs10()`（FRED 可达则刷新/播种 `market_rates`），再 `const dgs10 = await getLatestDgs10()`（拿 fresh 或 last-good）→ 全 universe 共享。

## 5. 合规 / 数据准确性

- last-good 始终带 `as_of` 日期，引擎 note 如实标注锚定日期 → 不违背"标来源/日期、不用过时数据冒充最新"。
- 不引入买卖/估值判断；纯利率数据。

## 6. 验证

- `tsc --noEmit` 净（软链 node_modules）。
- server-only + 网络 + DB，难本地单测；本机出网受限抓不到 FRED，**真实锚定验证在 CI**：
  - valuation.yml 跑后查 `select * from market_rates where series_id='DGS10'` 有行且 as_of 近日；
  - 抽一只 coverage=full 票，其 payload/discount note 显示 `anchored: true … as of <date>`（非 fallback）。
- 退化路径（FRED 不可达 + 表已有 last-good）逻辑由代码评审守（无法本地造网络失败）。

## 7. 兜底升级路径（若耐心抓取在 CI 仍失败）

若 `fetchFredSeries("DGS10", 20000)`+重试在 CI 仍超时（graph-CSV 端点根本性不可靠），升级为 **FRED 官方 JSON API**：`https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=...&file_type=json&sort_order=desc&limit=1`（快、稳），需新增 `FRED_API_KEY` 到 CI secrets + 本地 env。本 spec 先不做；保留为已知升级钩子。一旦 `market_rates` 被任一成功抓取播种，后续即便 live 全失败也有 last-good，问题即缓解。

## 8. 触及文件

- 新增：`web/supabase/migrations/20260627_create_market_rates.sql`
- 改：`web/src/lib/sources/fred.ts`（加 `timeoutMs` 参）
- 改：`web/src/lib/managers/treasuryRead.ts`（`persistDgs10()` + `getLatestDgs10` DB 回退）
- 改：`web/scripts/valuation-ingest.ts`（循环前 `persistDgs10()`）

## 9. 风险

- **首次播种依赖一次成功抓取**：若 CI 从未成功，表为空、回退无值 → 仍是 fallback 带（无回归，等同现状）。§7 升级路径化解。
- **last-good 过旧**：若 FRED 长期不可达，会持续用旧值；但带 as-of 日期诚实可见，且远优于泛用带。可后续加"过旧则降级回 fallback"阈值（YAGNI，暂不做）。
- 部署：先跑 migration 建 `market_rates`，再随分支合并；valuation.yml 下次跑即播种。
