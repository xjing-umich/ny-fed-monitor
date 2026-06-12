# 数据卫生 + 13F 新鲜度护栏（Freshness Guard）设计稿

日期：2026-06-12
状态：已通过 brainstorm 评审
落地 roadmap：1E provenance/freshness

## 1. 背景与问题

另一 thread 已只读核对 Supabase REST + SEC EDGAR（2026-06-12），诊断结论直接采信：

- DB 深度没问题：34 位 manager 全是 8 季（`managers`/`filings`/`holdings`）。
- **问题①——源头停报却被当"当前持仓"展示**（违反数据准确性硬要求）。CIK 均正确，SEC 侧无新数据，重跑 ingest 救不回：
  - `ruane-cunniff`（CIK 0000728014）最新 13F-HR = 2018-03-31，主体 "RUANE, CUNNIFF & GOLDFARB INC" 之后停报，疑似重组换新 CIK。
  - `aquamarine`（CIK 0001404599，Guy Spier）最新 2022-06-30，停报（疑跌破 $100M 门槛）。
  - `greenlight-capital`（CIK 0001079114）最新 2023-12-31；Einhorn 仍活跃，几乎肯定换主体申报，应有继任 CIK。
  - `scion`（CIK 0001649339，Burry）最新 2025-09-30（2025-11-03 提交）；保密处理惯例，落后约 2 季，可接受但须标注。
- **问题②——bridgewater 缺失**：CIK 0001350694（Bridgewater Associates, LP）SEC 有当前全套 8 季（最新 2026-03-31），但不在 `web/config/managers.json` 也不在 DB；生产页靠旧形状孤儿文件 `web/src/data/13f/bridgewater-associates.json`（{manager,latest,prior,changes}，无 filings[]）回退，只有 2 季旧数据。

## 2. 已拍板的决策

1. **停报且无继任 CIK 的基金 → 完全退役移除**（不保留历史存档页）。适用：aquamarine（确定）；ruane-cunniff、greenlight-capital 若找不到继任主体。
2. **聚合页对"偏旧"manager → 保留 + 标注**：consensus 照常计入但行内标注「数据截至 {period}」；buys/sells 只统计全局最新季有申报的 manager（落后者天然无"当季变动"，口径诚实而非惩罚）。
3. **阈值**（以全局最新季为基准的落后季数）：0–1 = current（当前）/ 2–3 = stale（偏旧）/ ≥4 = inactive（停报）。落后 1 季属 13F 正常申报节奏（季后 45 天截止）。
4. ConvictionPicks gate：current 照常；stale **降级不抑制**（信号在其数据截至日仍成立，保留卡片 + 区块头部 as-of 警示）；inactive 整个组件不渲染。

## 3. 设计

### A. 数据卫生（一次性运维 + seed 变更）

**A1. bridgewater 接入**
- `web/config/managers.json` 增加 `{ "cik": "0001350694", "slug": "bridgewater-associates", "person": "Ray Dalio" }`（沿用孤儿 JSON 的 slug，URL 连续）。
- 跑 `web/scripts/ingest-13f.ts` 抓 8 季写 DB + JSON；新 JSON（filings[] 形状）直接覆盖旧形状孤儿文件。

**A2. 继任 CIK 排查（greenlight-capital、ruane-cunniff）**
- 用 SEC EDGAR company search + full-text search 按基金名/管理人找新申报主体（如 "Greenlight Capital"、"Ruane Cunniff"、DL Partners 之类变体）。判定标准：新主体有连续近期 13F-HR、持仓风格/规模与原主体衔接。
- **找到** → 只更新 managers.json 中该 slug 的 `cik`（slug 与 URL 不变），重抓 8 季；清理 DB 中旧 CIK 的 filings/holdings（避免双主体混淆）。
- **找不到** → 走 A3 退役。

**A3. 退役机制**（aquamarine 确定退役；ruane/greenlight 视 A2 结果）
1. 从 `web/config/managers.json` 移除条目。
2. 删除 `web/src/data/13f/{slug}.json`。
3. 删除 DB 行（顺序：holdings → filings → managers）。
4. `[slug]` 页自然 notFound()，sitemap 自动剔除。
5. grep 全站（learn 文章、aliases、内链、conviction/consensus 引用）清理对退役 slug 的引用。

**A4. 数据准确性验收**
- ingest 后用 SEC submissions API 比对：每位在档 manager 的 DB 最新 period 必须等于 SEC 侧最新 13F-HR period。

### B. 新鲜度判定（纯函数）

新建 `web/src/lib/managers/freshness.ts`，零 IO、确定性（与 `conviction.ts` 同风格，ISR 静态渲染安全）：

```ts
export type Freshness = "current" | "stale" | "inactive";

/** 两个季末日（YYYY-MM-DD）之间相差的季数，globalLatest >= period 时为非负 */
export function quarterLag(period: string, globalLatest: string): number;

/** 0–1 → current；2–3 → stale；>=4 → inactive */
export function freshnessOf(period: string, globalLatest: string): Freshness;
```

- 阈值具名常量（`STALE_MIN_LAG = 2`、`INACTIVE_MIN_LAG = 4`），便于日后调。
- **全局最新季不硬编码**：调用点取 `max(latest.period)` over 全部 manager（index/summaries 已有该数据，无新增查询）。
- **不动既有类型**：不往 `ManagerSummary`/`ManagerDetail` 加字段，各页面现算。缓存/JSON 形状不变。
- `inactive` 档按决策①会被退役、理论上站上不出现，但保留作 **tripwire**：未来某 manager 静默停报，满 4 季自动亮红，提示运维走退役流程。

### C. UI 展示

**C1. `FreshnessBadge` 组件**（common 组件体系，--tt-* token，内联 `COPY={zh,en}` 双语）
- 所有档位常显：「数据截至 {period}（{filedAt} 提交）· 来源 SEC EDGAR」——满足任何展示的财务数据必须标来源+截止日的硬要求。
- `stale`：amber 警示「该投资者最新公开 13F 为 {period}，落后当前披露季 {n} 季」。
- `inactive`：显著横幅「已停报：{period} 后未再申报」。
- 落点：manager 详情页（`/[lang]/investors/[slug]`）头部 + ConvictionPicks 区。

**C2. 聚合页**（`/[lang]/investors/{consensus,buys,sells}`）
- `consensus`（持仓快照叠加）：stale manager 照常计入，名字旁挂小标记（tooltip/辅助文案「数据截至 {period}」）。
- `buys`/`sells`（季度变动）：只统计 `latest.period === 全局最新季` 的 manager；页脚注明统计基准季与未计入名单。
- `inactive` manager 不参与任何聚合（tripwire 兜底，正常情况下已退役）。

**C3. ConvictionPicks gate**
- `current` → 照常渲染。
- `stale` → 保留卡片，区块头部加 as-of 警示（复用 FreshnessBadge）。
- `inactive` → 整个组件不渲染。

### D. 非目标（YAGNI）

- 不做自动退役（inactive 只报警，退役是人工 seed 变更）。
- 不做加权降级 / 可调权重。
- 不做停报基金的"历史存档"展示模式。
- 不改 ingest 调度 / cron。

## 4. 验证（solo dev 约定，不写测试）

在 `web/` 下：`npx tsc --noEmit` + `npm run build`，再人工看页面：
- scion 页：stale 警示 + as-of 标注正确。
- bridgewater 页：8 季新数据、filings[] 形状、conviction 正常。
- consensus/buys/sells：口径与脚注正确，退役者不出现。
- 任一 current manager 页：仅常显来源行，无多余警示。
- A4 数据准确性比对通过。

## 5. 工程约束

- worktree `.claude/worktrees/freshness-guard`、分支 `feat/freshness-guard`，基于 origin/db-foundation；只在该 worktree 内改动。
- 写 Next 代码前先读 `web/node_modules/next/dist/docs/` 对应指南。
- 实现在独立 thread 执行（本 thread 止于 plan）。
