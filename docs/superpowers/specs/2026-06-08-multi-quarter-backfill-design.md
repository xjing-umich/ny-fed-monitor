# 多季 13F 回填 / Multi-Quarter Backfill 设计

> 状态：设计已与用户分段确认（2026-06-08），待用户审阅 spec 后转 writing-plans。
> 所属规划 thread：Compounder 产品长期规划。
> 分支：`feat/multi-quarter-backfill`（worktree `.claude/worktrees/multi-quarter-backfill`，基于 origin/db-foundation 最新）。
> 相关记忆：[[product-direction]]、[[data-layer-state]]、[[no-tests-solo-dev]]。
> 后继：本 PRD 是「多季历史 / 趋势图（2b）」的**数据前置**；趋势图 UI 不在本 PRD。

## 1. 背景与目标

13F 数据当前**每位投资人只存最近 2 个季度**（latest + prior），三处硬编码为 2：`ingest-13f.ts` 的 `getLatestFilings(cik, 2)`、`ManagerDetail{latest, prior}` 类型、`supabase.ts` 读取的 `.limit(2)`。因此"多季历史 / 趋势图"一行都无法做——**没有数据可画**。

**目标**：把每位投资人保留的历史从 2 季加深到 **8 季（2 年）**，作为趋势图（2b）的数据地基。**本 PRD 只做数据层，不含任何 UI。**

**关键设计判断（2026-06-08 爆炸半径核查）——这是"加法"，非全量重构：**
绝大多数消费方只把 `.latest` 当"当前状态"读；真正依赖 `.prior` 的只有投资人页 QoQ 与 `aggregations.ts`。因此采用**加法**：新增 `filings: FilingData[]`，`latest`/`prior`/`changes` 语义保持不变 → 下游全部零改动。

**用户已确认的三项配置：**
- 季度数 **N = 8**。
- 投资人范围 = **维持现有集合，只加深**（不顺带扩投资人数量——那是另一条 PRD）。
- 存储 = **Supabase 与 JSON 都加深到 8**（无库回退环境也能拿到多季）。

## 2. 类型与"单一来源"装配

### 2.1 类型变更（`web/src/lib/managers/types.ts`）
- `Holding` / `FilingData` / `HoldingChange` / `Manager` **不变**。
- `ManagerDetail` **新增** `filings: FilingData[]`（按 `period` 降序，`[0]` = 最新）。
- 保留 `latest` / `prior?` / `changes`，**语义不变**：`latest = filings[0]`、`prior = filings[1]`、`changes = computeChanges(filings[0], filings[1])`。

### 2.2 单一来源 + 读取层装配（避免冗余）
- **存储只存 `filings[]` 这一份历史**；`latest`/`prior`/`changes` **不再各存一份**，而是在**读取/构造层装配**时算出来填上。
- 新增 `web/src/lib/managers/assemble.ts`：
  - `assembleManagerDetail(manager: Manager, filings: FilingData[]): ManagerDetail`
    —— 按 period 降序排序 filings，取 `[0]/[1]` 填 `latest/prior`，调 `computeChanges` 填 `changes`，返回完整 `ManagerDetail`。
  - **把现重复在 `ingest-13f.ts` 与 `supabase.ts` 两处的 `computeChanges` 收敛到 `assemble.ts` 一处**（DRY；属于"动到的代码顺手修"，不扩范围）。`ingest`/`supabase`/`jsonDetail` 三处统一 import 它。
- 装配语义与今天逐字一致：`prior` 不存在时 `changes = []`（与现状相同）。

## 3. 摄取（`web/scripts/ingest-13f.ts`）

- `getLatestFilings(cik, maxCount)`：调用处 `2` → `8`；解析每期 XML infoTable → `Holding[]`，组装 `FilingData[]`（最多 8 期，按 period 降序）。
- **JSON 写出**：bundle 结构改为 `{ manager: Manager, filings: FilingData[] }`（**不再写** `latest`/`prior`/`changes` —— 读取层装配）。
- **Supabase 写出**：照旧逐期 upsert `managers` / `filings` / `holdings`。`filings.accession` 唯一约束保证**幂等**，重跑安全、不产生重复行。
- **SEC 礼貌访问**：保留现有 User-Agent 头与限速节流；8 期 × 现有投资人会使抓取请求数上升，须确保节流到 EDGAR 公平访问限内（避免触发限流/封禁）。`computeChanges` 不再在 ingest 内调用（移交装配层），ingest 只负责抓取+写 `filings[]`。

## 4. 读取层

- `web/src/lib/managers/supabase.ts:getManagerDetail`：`.limit(2)` → `.limit(8)`，按 `period desc` 取回最多 8 期 filings 及其 holdings → 调 `assembleManagerDetail` 返回。`mapDetailRows` 改为构造 `filings[]` 后委托 `assembleManagerDetail`（不再自行手算 latest/prior/changes）。
- `web/src/lib/managers/source.ts:jsonDetail`（无 Supabase env 回退路径）：读新 JSON（含 `filings[]`）→ 同一 `assembleManagerDetail`。
- `getManagerDetail` **对外签名不变**（仍返回 `ManagerDetail | null`），下游全部无感。
- `getManagerIndex` 不受影响（仍取每人最新一期）。

## 5. 数据重生与体积

- 重跑 ingest，把现有 **6 个静态 bundle**（`web/src/data/13f/*.json`）重生成为 8 季结构。
- 体积：约 4× 每人（最大 Bridgewater ~672KB → ~2.7MB）；JSON 为构建期 import、gzip 压缩 ~70–80%，对 CDN/内存可忽略。
- Supabase：`filings` 6 人 × 8 季 = 48 行（现 12 行）、`holdings` 约 4× 行数，均有索引，`.limit(8)` 与 `.limit(2)` 同为索引扫描，查询成本可忽略。

## 6. 明确不做（守住范围）

- **趋势图 / 历史对比 UI = 2b，本 PRD 不做。**
- 不预先计算"每相邻两季的 changes 全集"——趋势图（2b）需要时自行从 `filings[]` 派生。
- **零改动**：`aggregations.ts`（mostHeld/notableMoves/holderDeltas）、AI 叙述（`investorNarrative*`）、个股页、consensus/buys/sells 页、OG 路由、投资人页 QoQ —— 它们仍读 `latest/prior/changes`，装配后语义不变。
- 不扩投资人数量（投资人覆盖是另一条 PRD）。
- 无 UI、无打点。

## 7. 验收标准

1. `ManagerDetail.filings` 存在、按 period 降序、长度 ≤ 8；`latest`/`prior`/`changes` 经 `assembleManagerDetail` 装配后语义与改前逐字一致。
2. 两条读取路径（有 Supabase / 无库回退 JSON）都返回带 `filings[]` 的 `ManagerDetail`；无库回退也能给出 ≤8 期。
3. `computeChanges` 仅存于 `assemble.ts` 一处；`ingest-13f.ts` 与 `supabase.ts` 不再各自实现。
4. 现有页面（投资人 / 个股 / consensus / buys / sells）全部照常渲染、无回归（`tsc --noEmit` + `next build` 通过、人工抽查关键页）。
5. 重跑 ingest 幂等（重复运行不产生重复 filings 行）；6 个 JSON bundle 重生成为 8 季结构。
6. ingest 对 SEC 的请求保持在公平访问限速内。

## 8. 风险与备注

- **数据质量**：越早的季度，CUSIP→issuer 映射、申报格式可能有历史差异；解析需对缺字段优雅降级（沿用现有 holding 解析的容错）。若某投资人历史不足 8 期，按实际期数存（`filings.length < 8` 合法，验收 #1 已含 ≤8）。
- **抓取时长/限流**：8 期 × 现有投资人，ingest 运行时间和请求数上升，须确认节流；必要时分批/带退避重试。
- **JSON 体积进仓**：bundle 变大但 gzip 后可忽略；如未来投资人数量大增需再评估是否改为仅 DB（本 PRD 维持现集合，不触发该问题）。
- **多 session 共用主工作树**：实现应在本 worktree / `feat/multi-quarter-backfill` 进行；主工作树当前被其他 session 占用（`feat/lean-index`），勿切主树、勿与其他在飞 worktree 并发改同文件。
- **装配是唯一行为变更点**：latest/prior/changes 从"存储字段"变为"读取层派生字段"，须确保**所有**构造 `ManagerDetail` 的入口（supabase 路径、json 路径、以及任何测试/脚本 mock）都经 `assembleManagerDetail`，避免出现未装配的半成品对象。
