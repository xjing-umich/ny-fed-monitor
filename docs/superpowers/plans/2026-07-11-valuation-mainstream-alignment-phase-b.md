# 估值对齐主流公式 Phase B 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修 Phase A 的 quick_check 过度抑制皱褶（改 H-model 增长感知基线），并补齐 Graham net-net 减优先股的精确清算口径。

**Architecture:** 两个独立任务。任务 1 纯引擎（`ownerEarningsDcf.ts`），把可靠性闸的 quick_check baseline 从零增长资本化换成 Damodaran 两阶段闭式解 H-model，使基线与 DCF 同增长假设 → 成长股不再被误判 unreliable。任务 2 引擎 + 轻插桩，把已存在的 `preferred_equity` 字段 plumb 进 `computeNetNet`，NCAV 先扣优先股。

**Tech Stack:** TypeScript（Next.js 16 项目 `web/`），纯函数引擎在 `web/src/lib/valuation/`，`.check.ts` 自检用 `node:assert` + `npx tsx` 跑，`tsc --noEmit` 当类型门。

**Worktree:** `../ny-fed-monitor-val-b`（分支 `feat/valuation-mainstream-alignment-b`，off `db-foundation`）。所有命令 `cd` 到该 worktree 下的 `web/`。

**Spec:** `docs/superpowers/specs/2026-07-11-valuation-mainstream-alignment-phase-b-design.md`

## Global Constraints

- 纯函数引擎不得 `import` 含 `server-only` 的模块（保持可 `tsx` 直跑）；不得引入外部 I/O。
- 不跑 `next build`（本机 Google Fonts 被屏蔽会失败，非代码问题）；用 `tsx` 跑 `.check.ts` + `tsc --noEmit` 验证。
- 不新增迁移、不重抓 SEC：两任务都靠已存在的字段与列。
- 引擎序列化输出（JSON）不得含 buy/sell/hold/target price/rating/recommend 记号（既有合规测试会扫）。中文注释/文案不混排英文（术语锁形除外）。
- 守估值哲学：OBSERVATION 非推荐；任务 1 只修「可靠性判定的公平性」，不动价值带底/安全边际口径；任务 2 使 NCAV 更保守（扣优先股）。
- 已核验数值事实（供实现者对齐期望）：成长股 fixture（g1=10%、DGS10=4.25%）新口径 `quick_check_deviation_pct ≈ 3.8%`（旧口径 101.5%）；现实输入下 H-model 与离散 DCF 最大背离 ~17% → **quick_check_flag 修正后在真实输入上几乎不再触发，这是预期效果**（停止误藏成长股，真实不稳定由 `terminal_dependency_flag`/`r_minus_g_flag` 承担）；flag 保留为廉价兜底 + 展示诊断。

---

### Task 1: quick_check 改 H-model 增长感知基线

**Files:**
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts`（新增导出纯函数 `hModelValue`；`deriveOeDcf` 内替换 `quickPerShare` 计算）
- Modify: `web/src/lib/valuation/types.ts:274-276`（`quick_check_*` 字段注释语义更新）
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts:59`（`assessReliability` 上方 quick_check 注释语义更新）
- Test: `web/src/lib/valuation/ownerEarningsDcf.check.ts`

**Interfaces:**
- Consumes: `deriveOeDcf(floor, years, dgs10, price)`（既有）；模块常量 `PROJECTION_YEARS = 10`（既有）。
- Produces: `export function hModelValue(oe0: number, gS: number, gL: number, r: number): number` —— Damodaran H-model 权益价值闭式解，`H = PROJECTION_YEARS / 2`。`deriveOeDcf` 的 `diagnostics.quick_check_per_share` 现等于 `hModelValue(oe0, g1, terminal_growth, discount.midpoint) / shares`。

**背景（实现者必读）：** 当前 `ownerEarningsDcf.ts` 里 `quickPerShare = oe0 / discount.midpoint / shares`（零增长资本化），而 `neutral.per_share` 含终值增长（Phase A 加的 Gordon）→ 任何成长股 `quickDev > 50%` → `quick_check_flag=true` → 经 `assessReliability` 使 `reliable=false` → 在 screener 被藏。修法：baseline 改用与 neutral 档同增长假设的 H-model 闭式解，偏离只在模型真异常时才大。

- [ ] **Step 1: 写失败测试（H-model helper 精确值 + 成长股不再 flag）**

在 `web/src/lib/valuation/ownerEarningsDcf.check.ts` 顶部 import 加入 `hModelValue`：

```ts
import {
  deriveOeDcf,
  pickLatestFredPoint,
  GROWTH_CAP,
  R_STRICT,
  DGS10_PREMIUM,
  FALLBACK_BAND,
  reconcileMethods,
  hModelValue,
} from "./ownerEarningsDcf";
```

在文件末尾 `console.log(...)` 之前插入：

```ts
// ── B1. H-model baseline 精确闭式解 ─────────────────────────────────────────
// 权益价值 V = OE0·[(1+gL) + H·(gS−gL)] / (r−gL), H = PROJECTION_YEARS/2 = 5.
// oe0=1000, gS=0.10, gL=0.03, r=0.10 → 1000·(1.03+5·0.07)/0.07 = 1000·1.38/0.07 = 19714.2857
{
  const v = hModelValue(1000, 0.1, 0.03, 0.1);
  assert.ok(Math.abs(v - (1000 * (1.03 + 5 * 0.07)) / 0.07) < 1e-6, `H-model closed form, got ${v}`);
  // gS=gL=0 退化为零增长资本化 oe0/r
  assert.ok(Math.abs(hModelValue(1000, 0, 0, 0.1) - 1000 / 0.1) < 1e-9, "gS=gL=0 → oe0/r");
  // 纯增长感知：gS>0 时严格大于零增长资本化
  assert.ok(hModelValue(1000, 0.08, 0.03, 0.1) > 1000 / 0.1, "growth-aware > no-growth anchor");
}

// ── B2. 成长股不再被 quick_check 误判 unreliable（Phase A 皱褶修复）──────────
// g1=10% 成长股：旧零增长基线 dev≈101%（flag true），新 H-model 基线 dev<5%（flag false）。
{
  const years = [yr(2024, 133.1), yr(2023, 121), yr(2022, 110), yr(2021, 100)];
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), years, { value: 4.25, date: "2026-06-19" }, price(120));
  assert.ok(r.assessable, "growth fixture assessable");
  assert.strictEqual(r.diagnostics!.quick_check_flag, false, "growth stock NOT flagged (H-model baseline)");
  assert.ok(r.diagnostics!.quick_check_deviation_pct! < 0.5, "deviation under threshold");
  // 诊断基线 = 独立重算的 H-model / shares（口径自洽，不硬编码 fixture 数）
  const expected = hModelValue(1000, r.growth_g1!, r.terminal_growth!, r.discount!.midpoint) / 100;
  assert.ok(Math.abs(r.diagnostics!.quick_check_per_share! - expected) < 1e-6, "quick baseline = H-model per share");
  // 增长感知：新基线严格高于旧零增长锚 oe0/midpoint/shares
  assert.ok(r.diagnostics!.quick_check_per_share! > 1000 / r.discount!.midpoint / 100, "baseline > old zero-growth anchor");
}

// ── B3. 零增长名回归不变：g1=0 → H-model 退化为 oe0/r，与旧口径同值 ───────────
{
  const r = deriveOeDcf(floorWith(lamp(1000, 100, [2022, 2023, 2024])), [yr(2024, 100), yr(2023, 100)], { value: 4, date: "d" }, null);
  assert.strictEqual(r.diagnostics!.quick_check_flag, false, "flat earnings not flagged");
  assert.ok(Math.abs(r.diagnostics!.quick_check_per_share! - 1000 / r.discount!.midpoint / 100) < 1e-9, "g1=0 baseline unchanged vs zero-growth");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: FAIL —— `hModelValue` 未导出（`SyntaxError: ... does not provide an export named 'hModelValue'` 或 `TypeError`）。

- [ ] **Step 3: 实现 `hModelValue` 并替换 baseline**

在 `web/src/lib/valuation/ownerEarningsDcf.ts` 里 `dcfTier` 函数之后（约 L103 后）新增导出纯函数：

```ts
/**
 * Damodaran 两阶段线性衰减增长的闭式解（H-model），返回权益价值：
 *   V = OE0 · [ (1 + gL) + H · (gS − gL) ] / (r − gL),  H = PROJECTION_YEARS / 2.
 * 用作 quick-check 基线：与 neutral 档同增长假设(gS=g1, gL=gTerminal, r=midpoint)，
 * 故 |neutral − 此基线| 只在离散 10 年 DCF 对分档/贴现异常敏感时才大 —— 这才是
 * 名副其实的可靠性信号，而非把「有增长」误当「不稳定」。gS=gL=0 时退化为 OE0/r。
 * r−gL 在本引擎恒 ≥ ~5%（midpoint ≥ 8.25%、gL ≤ 3%），r−gL ≤ 0 时防御性退回 OE0/r。
 */
export function hModelValue(oe0: number, gS: number, gL: number, r: number): number {
  const H = PROJECTION_YEARS / 2;
  const denom = r - gL;
  if (!(denom > 0)) return oe0 / r; // 防御：现实输入不会触及
  return (oe0 * ((1 + gL) + H * (gS - gL))) / denom;
}
```

在 `deriveOeDcf` 内把（约 L268）：

```ts
  const quickPerShare = oe0 / discount.midpoint / shares; // no-growth capitalization
```

替换为：

```ts
  // quick-check 基线：与 neutral 档同增长假设的 H-model 闭式解（非零增长资本化），
  // 使偏离只在模型真不稳定时才大 —— 成长股不再被误判 unreliable（Phase A 皱褶修复）。
  const quickPerShare = hModelValue(oe0, g1, gTerminal, discount.midpoint) / shares;
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: PASS —— 末行打印 `ownerEarningsDcf.check.ts: deriveOeDcf + reconcileMethods OK`。

- [ ] **Step 5: 更新注释语义（types.ts + deriveValuationVerdict.ts）**

`web/src/lib/valuation/types.ts` 把 L274-276 三行注释改为：

```ts
    quick_check_per_share?: number; // H-model baseline: OE_0·[(1+gL)+H(gS−gL)]/(r−gL) / shares
    quick_check_deviation_pct?: number; // |neutral_ps − H-model baseline| / baseline
    quick_check_flag?: boolean;    // > 50% —— 离散 DCF 显著背离同增长闭式解 = 模型不稳定
```

`web/src/lib/valuation/deriveValuationVerdict.ts` 把 L59 一行注释改为：

```ts
 *  - quick_check_flag：DCF 与同增长假设的 H-model 闭式解偏离>50% → 模型对分档/贴现异常敏感、不稳。
```

- [ ] **Step 6: 全套自检 + 类型门**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts && npx tsc --noEmit`
Expected: 两个 check 打印各自 OK 行；`tsc` 无输出（0 错）。

- [ ] **Step 7: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-val-b
git add web/src/lib/valuation/ownerEarningsDcf.ts web/src/lib/valuation/ownerEarningsDcf.check.ts web/src/lib/valuation/types.ts web/src/lib/valuation/deriveValuationVerdict.ts
git commit -m "fix(valuation): quick_check 基线改 H-model 增长感知闭式解 (Phase B #1)

零增长资本化基线对含终值增长的 neutral 档系统性偏离>50%，把成长股误判
unreliable 并在 screener 藏起（Phase A 后遗症）。改用同增长假设的 Damodaran
H-model 闭式解为基线，偏离只在模型真不稳定时才触发。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: net-net NCAV 减优先股

**Files:**
- Modify: `web/src/lib/valuation/netNet.ts`（`computeNetNet` 加可选入参 `preferredStock`；删 L45 「Phase B 补」注释）
- Modify: `web/src/lib/valuation/types.ts:186-188`（`ValuationFloorYear` 加 `preferred_equity?`）
- Modify: `web/src/lib/valuation/fundamentalsToFloorInput.ts`（映射 `preferred_equity`）
- Modify: `web/src/lib/valuation/epvFloor.ts:152-156`（`computeNetNet` 调用传 `preferredStock`）
- Test: `web/src/lib/valuation/netNet.check.ts`

**Interfaces:**
- Consumes: `computeNetNet(input)`（既有）；`FundamentalPeriod.preferred_equity`（`@/lib/sec/normalize-facts`，既有 `number | null`）。
- Produces: `computeNetNet` 入参新增可选 `preferredStock?: number`；`ncav = currentAssets − totalLiabilities − (preferredStock ?? 0)`。`ValuationFloorYear` 新增可选 `preferred_equity?: number`。

- [ ] **Step 1: 写失败测试（优先股压低 NCAV + 缺省恒等）**

在 `web/src/lib/valuation/netNet.check.ts` 里 case 4 之后、case 5 之前插入：

```ts
// 4b) 优先股：NCAV=(1000−400−100)/100=5/股（对照无优先股的 6）。
{
  const withPref = computeNetNet({ currentAssets: 1000, totalLiabilities: 400, sharesDiluted: 100, preferredStock: 100 });
  assert.ok(withPref.assessable, "with preferred assessable");
  if (withPref.assessable) { approx(withPref.ncav, 500, 1e-6, "ncav minus preferred"); approx(withPref.per_share, 5, 1e-6, "per_share minus preferred"); }
  // 缺省 preferredStock（undefined）→ 与旧口径恒等（?? 0 降级）。
  const noPref = computeNetNet({ currentAssets: 1000, totalLiabilities: 400, sharesDiluted: 100 });
  if (noPref.assessable) approx(noPref.per_share, 6, 1e-6, "no preferred → unchanged");
  // preferredStock=0 显式传 → 同缺省。
  const zeroPref = computeNetNet({ currentAssets: 1000, totalLiabilities: 400, sharesDiluted: 100, preferredStock: 0 });
  if (zeroPref.assessable) approx(zeroPref.per_share, 6, 1e-6, "preferred 0 → unchanged");
}
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/netNet.check.ts`
Expected: FAIL —— `computeNetNet` 忽略 `preferredStock`，`ncav` 仍为 600，`approx(... 500 ...)` 断言失败（`AssertionError: ncav minus preferred (got 600, want 500)`）。

- [ ] **Step 3: 实现 `computeNetNet` 减优先股**

`web/src/lib/valuation/netNet.ts` 把 `computeNetNet` 入参与函数体改为：

```ts
export function computeNetNet(input: {
  currentAssets?: number;
  totalLiabilities?: number;
  sharesDiluted?: number;
  preferredStock?: number;
}): NetNetLamp {
  const { currentAssets, totalLiabilities, sharesDiluted, preferredStock } = input;
  if (currentAssets == null || totalLiabilities == null || sharesDiluted == null)
    return { assessable: false, reason: "缺少流动资产/总负债/摊薄股数,无法计算净流动资产。" };
  if (!(sharesDiluted > 0))
    return { assessable: false, reason: "摊薄股数非正,无法计算每股净流动资产。" };
  // Graham 精确口径:优先股有优先求偿权,普通股 NCAV 须先扣优先股账面(缺失则 ?? 0 恒等降级)。
  const ncav = currentAssets - totalLiabilities - (preferredStock ?? 0);
  const per_share = ncav / sharesDiluted;
  if (!(per_share > 0)) return { assessable: false, reason: "净流动资产为负,非 net-net。" };
  return { assessable: true, per_share, ncav };
}
```

（同时删除原 L45 那行 `// 注:精确 Graham 口径应再减优先股...Phase B 补。` 注释——已实现，注释过时。）

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/netNet.check.ts`
Expected: PASS —— 末行打印 `netNet.check.ts OK`。

- [ ] **Step 5: 插桩 —— 类型 + 映射 + 调用点**

`web/src/lib/valuation/types.ts` 在 `ValuationFloorYear` 的 `total_liabilities?: number;`（L188）之后加一行：

```ts
  preferred_equity?: number;
```

`web/src/lib/valuation/fundamentalsToFloorInput.ts` 在 `.map(...)` 对象里 `total_liabilities: u(r.total_liabilities),` 之后加一行：

```ts
      preferred_equity: u(r.preferred_equity),
```

`web/src/lib/valuation/epvFloor.ts` 把 `computeNetNet({ ... })`（L152-156）调用改为传优先股：

```ts
    net_net: computeNetNet({
      currentAssets: latest.current_assets,
      totalLiabilities: latest.total_liabilities,
      sharesDiluted: shares,
      preferredStock: latest.preferred_equity,
    }),
```

- [ ] **Step 6: 类型门 + 复跑相关自检**

Run: `cd web && npx tsx src/lib/valuation/netNet.check.ts && npx tsc --noEmit`
Expected: `netNet.check.ts OK`；`tsc` 无输出（0 错）。

- [ ] **Step 7: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor-val-b
git add web/src/lib/valuation/netNet.ts web/src/lib/valuation/netNet.check.ts web/src/lib/valuation/types.ts web/src/lib/valuation/fundamentalsToFloorInput.ts web/src/lib/valuation/epvFloor.ts
git commit -m "feat(valuation): net-net NCAV 减优先股 —— Graham 精确清算口径 (Phase B #3)

优先股有优先于普通股的求偿权,普通股每股 NCAV 须先扣优先股账面。
preferred_equity 概念标签与 DB 列已存在,无新迁移/无 SEC 重抓;缺失时恒等降级。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 部署与数据（合并后，非本计划任务）

- **无迁移**。两任务都靠已存在的字段与列。
- 合并后跑一次 `cd web && npm run valuation:ingest` 刷新 `valuation_snapshot`（写生产 Supabase，届时另行取得授权 + 确认 env）——即 Phase A 推迟的那次 re-ingest，现在 quick_check 皱褶已修，可安全重跑，让「可靠性修正」+「优先股口径」一起落到 screener/首页快照。
- 个股页卡片纯页面派生，下次 deploy 自动生效，无需 ingest。

## 自检记录（写计划时已核对）

- **Spec 覆盖**：组件 1 → Task 1；组件 2 → Task 2；#2 毛 PP&E 明确移入 Phase C（spec 已述），本计划不含。
- **占位符扫描**：无 TBD/TODO；每个改代码步骤含完整代码。
- **类型一致**：`hModelValue(oe0,gS,gL,r): number`、`computeNetNet` 入参 `preferredStock?`、`ValuationFloorYear.preferred_equity?` 三处签名跨步骤一致；`preferred_equity` 源字段名与 `FundamentalPeriod`/`fundamental-tags.ts` 一致。
