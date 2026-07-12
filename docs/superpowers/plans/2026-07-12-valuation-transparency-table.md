# 逐年估值推导透明度表 Implementation Plan（估值改造 Phase 3）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把估值卡「方法与数字」折叠块从散文升级为逐年、可追溯 SEC/FRED 的推导表——收官 P1+P2，让整条估值推导可审计。

**Architecture:** 引擎附加返回 `ValuationDerivation`（逐年投影 + 现值 + 终值拆解 + 带组装 + 贴现出处，不改算法）→ ingest 写入 `valuation_snapshot.payload.derivation`（jsonb 无需改表）→ 页面读快照，在现有 `MethodDetails` 折叠块内渲染逐年表。纯呈现，不改任何估值数值。

**Tech Stack:** TypeScript + `.check.ts`、Next.js RSC、Supabase 快照、`--tt-*` token。

## Global Constraints

- 分支：`plan/valuation-transparency-table`，off `db-foundation` @ 3cc6fa8。
- **执行依赖**：在 Phase 1 + Phase 2 合并**之后**执行（表含隐含预期行 + CAP 行，逐年投影已被 P2 拉长）。off 含 P1+P2 的最新 `db-foundation`。
- **不改任何估值数值/判定**——纯呈现，读引擎已算好的中间值，**禁**在表里另算一套（避免表与结论对不上）。
- 扩充**现有** `MethodDetails`（`EarningsPowerFloorCard`），默认折叠，不占第一屏，不新建小节。
- 无买卖/目标价；双 locale 纯本语言（遵 `web/docs/copy-voice.md`）；仅 `--tt-*` token；窄屏 `overflow-x` 横向滚动不破版。
- 降级：`payload.derivation` 缺失 → 保留现有散文披露，不渲染表（非报错）；P1/P2 行字段缺失各自省略。
- 无常驻测试（solo dev）：`npx tsc --noEmit`（`web/`下）+ `.check.ts` + 部署后抽查。**禁** `next build`。**用独立 worktree**；**禁**碰无关在途文件。

## File Structure

- 改 `web/src/lib/valuation/ownerEarningsDcf.ts`（或 floor builder）— 附加返回 `ValuationDerivation`。
- 改 `web/src/lib/valuation/types.ts` — `ValuationDerivation` 类型。
- 新建 `web/src/lib/valuation/derivation.check.ts` — 逐年 PV 自洽断言。
- 改 `web/scripts/valuation-ingest.ts` + `web/src/lib/valuation/valuationSnapshot.ts` — 写入/读回 `payload.derivation`。
- 改 `web/src/components/valuation/EarningsPowerFloorCard.tsx` — `MethodDetails` 内渲染逐年表。

---

### Task 1: 引擎暴露 `ValuationDerivation`（附加返回，不改算法）

**Files:**
- Modify: `web/src/lib/valuation/types.ts`
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts`
- Test: `web/src/lib/valuation/derivation.check.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type DerivationYear = { year: number; oe: number; growth: number; pv: number };
  export type ValuationDerivation = {
    oe0: number; shares: number; discountRate: number;
    dgs10?: { value: number; date: string };
    capYears: number;
    perYear: DerivationYear[];                // 长度 = capYears
    terminal: { value: number; pv: number; gTerminal: number; pctOfTotal: number };
    band: { valueFloor: number; oeDcfLow?: number; oeDcfHigh?: number; growthCeiling?: number; rangeLo: number; rangeHi: number };
    // P2/P1 行由 ingest 从既有 moatCap/expectations 补齐，不在引擎层
  };
  ```
- Consumes: 引擎既有 `projectOe`/`dcfTier` 的**同一次计算**（neutral 或用于区间的那一档）——不另跑一套。

- [ ] **Step 1: 写自洽测试（先失败）**

`derivation.check.ts`：
```ts
import { buildDerivation } from "./ownerEarningsDcf"; // Step 2 导出
function assert(c: boolean, m: string){ if(!c){console.error("FAIL:",m);process.exitCode=1;} else console.log("ok:",m); }
{
  const d = buildDerivation({ oe0: 100, g1: 0.08, r: 0.09, shares: 10, gTerminal: 0.03, capYears: 10 });
  const sumPv = d.perYear.reduce((s, y) => s + y.pv, 0) + d.terminal.pv;
  const perShareEquity = sumPv / d.shares;
  // 逐年 PV 之和 + 终值 PV == dcfTier 的每股权益值(同源)
  assert(Math.abs(d.perYear.length - d.capYears) === 0, "perYear 行数 = capYears");
  assert(d.terminal.pctOfTotal > 0 && d.terminal.pctOfTotal < 1, "终值占比 (0,1)");
  assert(Number.isFinite(perShareEquity) && perShareEquity > 0, "逐年PV+终值PV 自洽为正每股值");
}
console.log(process.exitCode ? "SOME TESTS FAILED" : "ALL PASS");
```

- [ ] **Step 2: 从既有计算导出 derivation**

在 `ownerEarningsDcf.ts` 加 `export function buildDerivation(input)`，**复用** `projectOe`/`dcfTier` 的中间量（勿另写投影）：逐年 `oe`/`growth`/`pv`、终值 `value`/`pv`/`pctOfTotal`（=terminalPv/(explicitPv+terminalPv)）、`gTerminal`。在 `buildOeDcf` 结果上附加 `derivation?: Omit<ValuationDerivation,"band">`（band 由 floor builder/verdict 侧补：`valueFloor`/`rangeLo`/`rangeHi` 来自 `deriveValuationVerdict` 同源值）。**算法一行不改**，只把已算的量结构化输出。

- [ ] **Step 3: 运行测试通过 + 类型门**

`npx tsx src/lib/valuation/derivation.check.ts`（ALL PASS）；`npx tsc --noEmit` 零错。

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/valuation/ownerEarningsDcf.ts web/src/lib/valuation/types.ts web/src/lib/valuation/derivation.check.ts
git commit -m "feat(valuation): 引擎暴露ValuationDerivation(逐年投影+终值拆解,复用既有计算)"
```

---

### Task 2: ingest 写入 + 读回 payload.derivation

**Files:**
- Modify: `web/scripts/valuation-ingest.ts`
- Modify: `web/src/lib/valuation/valuationSnapshot.ts`

**Interfaces:**
- Consumes: `ValuationDerivation`（Task 1）、既有 `moatCap`(P2)/`expectations`(P1)。

- [ ] **Step 1: 组装完整 derivation 写入 payload**

在 `valuation-ingest.ts`，把 Task 1 的引擎 derivation + `band`（来自 verdict 的 valueFloor/rangeLo/rangeHi）+ P2 `moatCap` + P1 `expectations` 汇成 `payload.derivation`。缺任一子块 → 该子块省略（页面据此降级），主体（逐年/终值/带）应尽量齐全。

- [ ] **Step 2: 读回强类型**

`valuationSnapshot.ts` 把 `derivation?: ValuationDerivation` 纳入 payload 解析与返回类型，透传给页面。

- [ ] **Step 3: 类型门**

`npx tsc --noEmit` 零错。

- [ ] **Step 4: Commit**

```bash
git add web/scripts/valuation-ingest.ts web/src/lib/valuation/valuationSnapshot.ts
git commit -m "feat(valuation): 逐年推导写入valuation_snapshot.payload.derivation"
```

---

### Task 3: `MethodDetails` 内渲染逐年推导表

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`

**Interfaces:**
- Consumes: 快照读回的 `derivation?: ValuationDerivation`。

- [ ] **Step 1: 在折叠块内渲染表**

在 `MethodDetails` 的 `<details>` 内、现有散文之上/之下，新增（仅当 `derivation` 存在）：
- **逐年表**：列 = 年 / OE / 该年增长% / 现值 PV；等宽 mono 数字；外层 `overflow-x-auto` 容器防窄屏破版。
- **终值行**：终值 / PV / 占总值%（与现有 `terminal_dependency_flag` 告警呼应）。
- **价值带组装行**：valueFloor / OE-DCF 低-高 / 增长上沿 / rangeLo–rangeHi。
- **贴现出处行**：贴现率 + DGS10 值/日期。
- **CAP 行**（P2，`derivation` 若含 moatCap）：护城河档 + CAP 年数 + 判据。
- **隐含预期行**（P1，若含 expectations）：隐含增长 vs 历史 + 三态。
- 每分组标注来源（SEC EDGAR 10-K / FRED DGS10 / 价格源）。
- 文案双 locale 纯本语言；仅 `--tt-*` token；无买卖/目标价。

- [ ] **Step 2: 降级自检**

`derivation` 为 undefined（旧快照）→ 不渲染表，保留现有散文披露；缺 moatCap/expectations 子块 → 对应行省略。均无报错、无空壳。

- [ ] **Step 3: 类型门**

`npx tsc --noEmit` 零错。

- [ ] **Step 4: Commit**

```bash
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): 方法与数字块渲染逐年推导表(可追溯SEC/FRED,收官P1+P2)"
```

---

## 验收（部署后）

1. 各 Task `.check.ts` PASS、`npx tsc --noEmit` 零错。
2. 跑 `npm run valuation:ingest`（授权后）→ `payload.derivation` 落字段。
3. 真数据抽查：AAPL 展开「方法与数字」，逐年表齐全、**PV 累加 + 终值 PV 自洽**（与区间端点一致）、来源标注正确、终值占比与 `terminal_dependency` 告警一致、含 CAP 行(P2)与隐含预期行(P1)。
4. 降级：旧快照/缺 `derivation` → 优雅退回散文；缺 P1/P2 子块 → 对应行省略无报错。
5. 窄屏（mobile 预设）逐年表横向滚动不破版；dark/light 各扫一眼；双 locale 纯本语言、无买卖措辞。

## Self-Review

- **Spec 覆盖**：§三架构(引擎暴露→ingest→页面读)→Task 1/2/3；§四表内容→Task 3 Step 1；§五呈现(扩充 MethodDetails/折叠/overflow-x/降级)→Task 3；§六数据准确性(复用引擎中间值不另算)→Task 1 Step 2 + 自洽测试；§七测试→各 Task。无遗漏。
- **占位扫描**：无 TBD/TODO；含实现指引与真实符号(`MethodDetails`/`projectOe`/`dcfTier`/`deriveValuationVerdict`/`terminal_dependency_flag`)。
- **类型一致**：`ValuationDerivation`/`DerivationYear`（Task 1 定义）→ Task 2 payload / Task 3 消费同名字段；`buildDerivation` 签名跨任务一致。
- **顺序/风险**：纯呈现+数据plumbing，不改估值数值(§二)，自洽测试证明表与结论同源；执行须在 P1+P2 合并后。任一提交点不破坏构建、不改判定。
