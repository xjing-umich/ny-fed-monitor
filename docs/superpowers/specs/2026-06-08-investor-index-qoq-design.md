# 投资人列表页 · 季度变化（QoQ）信号 设计

> 状态：设计已与用户分段确认（2026-06-08，版式 A + 数据层方案① + 性能硬化），待用户审阅 spec 后转 writing-plans。
> 前序：本特性建立在 `feat/investor-qoq-comparison`（详情页 QoQ，已实现）之上，是"把超级投资者做透"主线的下一块。
> 相关记忆：[[prd-roadmap]]、[[product-direction]]、[[data-layer-state]]。

## 1. 背景与目标

投资人**详情页** `/investors/[slug]` 已有 QoQ（权重上季→本季、清仓行、组合环比）。但**列表页** `/investors`（超级投资者主页）的表格只有静态快照（投资人/组合市值/持仓数/报告期/第一大持仓），**没有任何季度变化信号**——用户在列表上看不出谁在加仓、谁清了仓，缺少点进详情的钩子。

**目标**：在列表表格每行加上轻量 QoQ 信号，作为"点进详情看细节"的引导，且**不影响任何页面性能**（硬约束）。

**非目标（YAGNI）**：多季趋势、按活跃度排序、sparkline、把详情页的完整 changes 搬到列表。

## 2. 展示的 4 个信号（版式 A）

每行展示 4 个季度信号，口径与详情页一致：

1. **组合市值环比 %** — 内联在「组合市值」列：`$264.0B −3%`（绿涨橙跌）
2. **持仓数 Δ** — 内联在「持仓数」列：`38 −2`
3. **整体加仓/减仓 chip** — 新「本季动作」列：`整体加仓 / 整体减仓 / 持仓微调`
4. **本季最大动作** — 同列 chip 下方：`最大：Apple 减仓`

**版式 A（已选定）**：内联 Δ + 新增「本季动作」列**取代**原「第一大持仓」列。理由：Δ 紧贴其修饰的数字最易读；chip+top move 合成一个专列形成可竖向扫读的"钩子列"；第一大持仓为静态信息、引导力弱，且详情页仍保留。

**列结构（桌面 → 移动响应式）**：

| 列 | 内容 | 响应式 |
|---|---|---|
| 投资人 / 机构 | person + firm（不变） | 常显 |
| 组合市值 | `formatUSD(totalValue)` + `Δ%` 内联 | 常显（含 Δ%） |
| 持仓数 | `holdingCount` + `Δ` 内联 | 常显 |
| 报告期 | `period`（不变） | `hidden sm:table-cell`（同现状） |
| **本季动作**（新，取代第一大持仓） | verdict chip + `最大：{issuer} {kind}` | chip 常显；top move 文案 `hidden sm:table-cell`（移动端最窄只留 chip + 市值 Δ%） |

## 3. 数据层（方案①：页面级独立 RPC，热路径零改动）

### 3.1 性能策略（硬约束的核心）

**`manager_index()` 与根布局 `getManagerIndex()` 一字不动。** 经核查（`[lang]/layout.tsx:131`），根布局只用 `managers` 的 `person`/`slug` 拼搜索框条目，**不需要 QoQ**。因此**绝不**把 QoQ 塞进每页都跑的热路径 RPC。

QoQ 改为**新增一个页面级独立 SQL 函数 `manager_qoq()`**，**只在 `/investors` 列表页调用一次**：

- **热路径零回归**：全站搜索框/每页渲染的取数完全不变。
- **一次往返**：`manager_qoq()` 在库内把 holdings diff 全算成标量返回（每户一行），无 N+1、无应用层扇出。
- **ISR 兜住用户**：`/investors` 静态预渲染（`revalidate=3600`），用户拿 CDN HTML；QoQ 计算每小时最多在重验时跑一次，不在用户请求路径上。
- **复用现有索引**：`filings(cik, period desc)`、`holdings(filing_id)`、`holdings(cusip)` 已覆盖 diff 的 join。
- **优雅兜底**：函数未部署 → RPC error → `getManagerQoQ()` 返回空 Map → 列表不显 QoQ、不报错、不增延迟；SQL 部署后自动出现。

### 3.2 `manager_qoq()` SQL 草稿

新增到 `web/supabase/schema.sql`（紧随 `manager_index()`，同样"纯加新、缺失自动降级"）：

```sql
-- ── manager_qoq() ───────────────────────────────────────────────────────────
-- 投资人列表页季度变化信号:每户返回 市值环比% / 持仓数Δ / 整体买卖向 / 本季最大动作。
-- 仅 /investors 列表页调用一次(非根布局热路径),库内一次算完 holdings diff,故对全站
-- 取数零影响。函数缺失时应用层 getManagerQoQ 返回空 → 列表优雅退回无 QoQ。
-- 口径与详情页 getManagerDetail 的 changes/verdict 一致:
--   buy=new+increased, sell=exited+decreased(按持股数 shares 判定真实买卖,不受股价漂移影响)。
-- 部署:Supabase SQL Editor 执行;若 PostgREST 报找不到函数 → notify pgrst, 'reload schema';
create or replace function manager_qoq()
returns table (
  cik text,
  value_delta_pct double precision,   -- null: 无 prior 或 prior.total_value=0
  count_delta int,                     -- null: 无 prior
  verdict text,                        -- 'buying' | 'selling' | 'mixed' | null(无prior)
  top_move_issuer text,                -- null: 无 prior 或无变动
  top_move_kind text                   -- 'new'|'exited'|'increased'|'decreased' | null
)
language sql
stable
as $$
  with latest as (
    select distinct on (f.cik)
      f.cik, f.id as filing_id, f.period, f.total_value, f.holding_count
    from filings f
    order by f.cik, f.period desc
  ),
  prior as (
    select distinct on (f.cik)
      f.cik, f.id as filing_id, f.total_value, f.holding_count
    from filings f
    join latest l on l.cik = f.cik and f.period < l.period
    order by f.cik, f.period desc
  ),
  hl as (  -- 最新一期全持仓(带 cik)
    select l.cik, h.cusip, h.issuer, h.value, h.shares
    from latest l join holdings h on h.filing_id = l.filing_id
  ),
  hp as (  -- 上一期全持仓(带 cik)
    select p.cik, h.cusip, h.issuer, h.value, h.shares
    from prior p join holdings h on h.filing_id = p.filing_id
  ),
  diff as (  -- 按 (cik,cusip) 全外连接 → 每只票一个 kind + 美元影响
    select
      coalesce(hl.cik, hp.cik) as cik,
      coalesce(hl.issuer, hp.issuer) as issuer,
      case
        when hp.cusip is null then 'new'
        when hl.cusip is null then 'exited'
        when hl.shares > hp.shares then 'increased'
        when hl.shares < hp.shares then 'decreased'
        else 'unchanged'
      end as kind,
      case
        when hp.cusip is null then coalesce(hl.value, 0)
        when hl.cusip is null then coalesce(hp.value, 0)
        else abs(coalesce(hl.value, 0) - coalesce(hp.value, 0))
      end as impact,
      coalesce(hl.value, 0) as latest_value
    from hl
    full outer join hp on hp.cik = hl.cik and hp.cusip = hl.cusip
  ),
  verdicts as (
    select cik,
      count(*) filter (where kind in ('new','increased'))  as buys,
      count(*) filter (where kind in ('exited','decreased')) as sells
    from diff
    where kind <> 'unchanged'
    group by cik
  ),
  topmove as (  -- 每户取 |美元影响| 最大的一笔(并列取 latest_value 大者)
    select distinct on (cik) cik, issuer as top_move_issuer, kind as top_move_kind
    from diff
    where kind <> 'unchanged'
    order by cik, impact desc, latest_value desc
  )
  select
    l.cik,
    case when p.cik is not null and p.total_value > 0
         then (l.total_value - p.total_value)::double precision / p.total_value
         else null end as value_delta_pct,
    case when p.cik is not null
         then l.holding_count - p.holding_count
         else null end as count_delta,
    case when p.cik is null then null
         when coalesce(v.buys,0) > coalesce(v.sells,0) then 'buying'
         when coalesce(v.sells,0) > coalesce(v.buys,0) then 'selling'
         else 'mixed' end as verdict,
    tm.top_move_issuer,
    tm.top_move_kind
  from latest l
  left join prior   p  on p.cik  = l.cik
  left join verdicts v on v.cik = l.cik
  left join topmove tm on tm.cik = l.cik;
$$;
```

**已知假设**（与详情页一致）：一期申报内同一 cusip 唯一（13F 每只票一行）。详情页 `priorByCusip` 也按此 Map 去重，故口径一致。

### 3.3 应用层

- `web/src/lib/managers/types.ts`：新增
  ```ts
  export type ManagerQoQ = {
    valueDeltaPct: number | null;
    countDelta: number | null;
    verdict: "buying" | "selling" | "mixed" | null;
    topMoveIssuer: string | null;
    topMoveKind: "new" | "exited" | "increased" | "decreased" | null;
  };
  ```
  `ManagerSummary` **不动**（热路径用）。

- `web/src/lib/managers/source.ts`：新增 `getManagerQoQ(): Promise<Map<string, ManagerQoQ>>`（`cache()` 包裹）。`hasSupabaseEnv()` → `supa.getManagerQoQ()`，否则空 Map。

- `web/src/lib/managers/supabase.ts`：新增 `getManagerQoQ()`：`db.rpc("manager_qoq")`；`error` 或无 data → **返回空 Map**（优雅降级，不抛）；否则映射 snake_case → camelCase，按 `cik` 建 Map。

- `web/src/app/[lang]/investors/page.tsx`：`Promise.all([getManagerIndex(), getManagerQoQ()])` 并行；按 `cik` 合并为 `rows: Array<ManagerSummary & { qoq?: ManagerQoQ }>`，传给 `InvestorListClient`。

## 4. 前端渲染（`InvestorListClient.tsx`）

- 入参由 `managers: ManagerSummary[]` 改为 `managers: Array<ManagerSummary & { qoq?: ManagerQoQ }>`（标量，可序列化，client component 安全）。
- 「组合市值」单元格：`formatUSD` 后内联 `Δ%`（`qoq.valueDeltaPct` 非空且≠0 才显，绿涨橙跌，0/无 prior 不显）。
- 「持仓数」单元格：内联 `Δ`（`qoq.countDelta` 非空且≠0 才显）。
- 删「第一大持仓」列，**新增「本季动作」列**：verdict chip（`qoq.verdict` 映射文案+色）+ 下方 `最大：{topMoveIssuer} {kind文案}`（`hidden sm:table-cell`）。`qoq` 缺失或 verdict 为 null → 该格留空（首次申报户）。
- **搜索/排序不变**（仍按市值/持仓数；不新增 QoQ 排序，YAGNI）。

**文案（zh/en）**：
- verdict：`整体加仓/Net buying`、`整体减仓/Net selling`、`持仓微调/Mostly held`
- kind：`新建/New`、`清仓/Exited`、`加仓/Added`、`减仓/Trimmed`
- 前缀：`最大：/Top:`
- 色：buying/加仓→`--tt-positive`；selling/减仓→`--tt-warn`；mixed/持有→灰；清仓→`--tt-negative`（沿用详情页主题变量）

## 5. 修改文件清单

- `web/supabase/schema.sql` — 新增 `manager_qoq()` 函数（纯加新）
- `web/src/lib/managers/types.ts` — 新增 `ManagerQoQ` 类型
- `web/src/lib/managers/source.ts` — 新增 `getManagerQoQ()`（cache + env 分流）
- `web/src/lib/managers/supabase.ts` — 新增 `getManagerQoQ()`（RPC + 优雅降级 + 映射）
- `web/src/app/[lang]/investors/page.tsx` — 并行取数 + 按 cik 合并
- `web/src/app/[lang]/investors/InvestorListClient.tsx` — 版式 A 渲染

**不动**：`manager_index()`、`getManagerIndex()`、根布局、详情页、其他调用 `getManagerIndex` 的页面（consensus/stocks/managers/sitemap 等）。

## 6. 性能与验证（项目约定：不写单测，验证=构建+人工+计时）

- **构建验证**：`cd web && nvm use 20 && npm run build`（类型 + ISR 预渲染必过，Node 20）。
- **性能闸门**：
  1. 对 `manager_qoq()` 跑 `EXPLAIN ANALYZE`，确认毫秒级、走索引（`holdings_filing_idx`）。
  2. 确认 `manager_index()` 与根布局取数路径**未改动**（git diff 仅触及第 5 节文件，且不含 `manager_index`）。
- **人工核对** `npm start`：
  - `/zh/investors` 与 `/en/...`：市值列 `$X (−3%)`、持仓列 `38 (−2)`、本季动作列 chip + `最大：…`，绿橙色正确。
  - 无 prior 户（首次申报）：QoQ 全空、行不报错、不显 chip/Δ。
  - 移动端窄屏：只留 chip + 市值 Δ%，不溢出。
  - RPC 未部署场景（或临时改名模拟）：列表退回无 QoQ、页面正常。

## 7. 验收标准

1. `/investors` 表格每行显示 4 信号（版式 A：内联 Δ + 「本季动作」列取代第一大持仓）。
2. 信号口径与详情页一致（verdict 按持股数买卖向；top move 取 |美元影响| 最大）。
3. **根布局/`manager_index()` 零改动**；QoQ 仅 `/investors` 页查一次；`EXPLAIN ANALYZE` 毫秒级。
4. 无 prior / RPC 未部署 → 优雅退回无 QoQ，不报错。
5. zh/en 双语；移动端响应式不溢出；`npm run build`（Node 20）通过。

## 8. 风险与备注

- **性能**："十几秒"历史问题源于应用层 34× 串行往返，本设计是单次 in-DB RPC + 页面级 + ISR，三重隔离，不重蹈覆辙；仍以 `EXPLAIN ANALYZE` 实测把关。
- **top move 定义**：以 |美元变动额| 衡量"最大动作"（new=全额建仓、exited=全额清仓、增减=差额）；并列取 latest_value 大者。若后续希望"最大"偏向新建/清仓而非加减仓，可调 `order by`，非本期范围。
- **full outer join 重复**：依赖一期内 cusip 唯一假设；与详情页同口径。
- 主题变量 `--tt-positive/--tt-warn/--tt-negative/--tt-faint` 沿用现有。
- 实现全程在 worktree `.claude/worktrees/investor-qoq`（分支 `feat/investor-qoq-comparison`）。
