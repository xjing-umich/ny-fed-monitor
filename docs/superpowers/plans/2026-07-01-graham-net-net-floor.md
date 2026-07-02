# Graham Net-Net 资产底 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给估值引擎加一条 Graham 净流动资产(NCAV/net-net)底,平时隐形,仅当现价低于每股 NCAV 时在个股页价值带下方显示一行中性注脚。

**Architecture:** 纯函数 `computeNetNet` 算每股 NCAV → 在现有 `assembleFloor` 组装点挂到 `ValuationFloor.net_net`(价格无关的纯基本面量)→ `deriveValuationVerdict` 结合现价算 `triggered` 并加进 verdict(自动进 valuation_snapshot 的 `payload` 且供卡片实时读)→ `EarningsPowerFloorCard` 条件渲染一行注脚。不改 6 档价值带、不改 `verdict_bucket`、不碰徽章、无 migration。

**Tech Stack:** TypeScript,Next.js 16(App Router),纯函数 + `node:assert` 自检脚本(`npx tsx`),Supabase(仅经现有 ingest 写 payload jsonb)。

## Global Constraints

- 回复/文档正文中文,代码与术语英文(项目硬规定)。
- 本项目**不跑测试套件**;本地门 = `npx tsc --noEmit` + 逐个 `npx tsx src/lib/valuation/<x>.check.ts`。
- 所有估值输出是 OBSERVATION,禁 BUY/SELL/目标价;注脚须中性 + 风险提示。
- UI 文案禁中英混排:每 locale 纯本语言。
- USD 金额格式统一 `en-US` 分组;币种符号用 `$`(当前 universe 全 USD)。
- 诚实降级:任何字段缺失只废本层、绝不抛异常、绝不阻断既有 floor。
- 所有命令在 `web/` 下运行(仓库根无 package.json)。
- 分支 `feat/valuation-net-net`(已存在,含 spec 提交);从 `db-foundation` 切出。

---

### Task 1: net-net 纯函数 + 自检

**Files:**
- Create: `web/src/lib/valuation/netNet.ts`
- Test: `web/src/lib/valuation/netNet.check.ts`

**Interfaces:**
- Produces: `computeNetNet(input: { currentAssets?: number; totalLiabilities?: number; sharesDiluted?: number }): NetNetLamp`
- Produces type: `NetNetLamp = { assessable: true; per_share: number; ncav: number } | { assessable: false; reason: string }`

- [ ] **Step 1: 写失败测试** — 新建 `web/src/lib/valuation/netNet.check.ts`:

```ts
/**
 * netNet.check.ts — Graham 净流动资产(NCAV)纯函数自检。
 * Run: cd web && npx tsx src/lib/valuation/netNet.check.ts
 */
import assert from "node:assert";
import { computeNetNet } from "./netNet";

const approx = (a: number, b: number, tol = 1e-6, msg = "") =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} (got ${a}, want ${b})`);

// 1) 正常:NCAV=(1000−400)/100=6/股。
const ok = computeNetNet({ currentAssets: 1000, totalLiabilities: 400, sharesDiluted: 100 });
assert.ok(ok.assessable, "normal case assessable");
if (ok.assessable) { approx(ok.ncav, 600, 1e-6, "ncav"); approx(ok.per_share, 6, 1e-6, "per_share"); }

// 2) 缺字段(金融股无 current_assets)→ 不可评估。
assert.ok(!computeNetNet({ totalLiabilities: 400, sharesDiluted: 100 }).assessable, "missing currentAssets → not assessable");

// 3) 负 NCAV(负债>流动资产)→ 不可评估。
assert.ok(!computeNetNet({ currentAssets: 300, totalLiabilities: 400, sharesDiluted: 100 }).assessable, "negative NCAV → not assessable");

// 4) 股数非正 → 不可评估。
assert.ok(!computeNetNet({ currentAssets: 1000, totalLiabilities: 400, sharesDiluted: 0 }).assessable, "shares<=0 → not assessable");

console.log("netNet.check.ts OK");
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/netNet.check.ts`
Expected: FAIL — `Cannot find module './netNet'`。

- [ ] **Step 3: 写最小实现** — 新建 `web/src/lib/valuation/netNet.ts`:

```ts
// netNet.ts — Graham 净流动资产价值(NCAV)。清算式资产底:只认流动资产减全部负债。
// 价格无关的纯基本面量;触发判定(现价 < 每股)在 verdict 层结合现价完成。
// 缺字段/负 NCAV/股数非正 → 不可评估(诚实降级,金融/外国股天然无 current_assets)。

export type NetNetLamp =
  | { assessable: true; per_share: number; ncav: number }
  | { assessable: false; reason: string };

export function computeNetNet(input: {
  currentAssets?: number;
  totalLiabilities?: number;
  sharesDiluted?: number;
}): NetNetLamp {
  const { currentAssets, totalLiabilities, sharesDiluted } = input;
  if (currentAssets == null || totalLiabilities == null || sharesDiluted == null)
    return { assessable: false, reason: "缺少流动资产/总负债/摊薄股数,无法计算净流动资产。" };
  if (!(sharesDiluted > 0))
    return { assessable: false, reason: "摊薄股数非正,无法计算每股净流动资产。" };
  const ncav = currentAssets - totalLiabilities;
  const per_share = ncav / sharesDiluted;
  if (!(per_share > 0)) return { assessable: false, reason: "净流动资产为负,非 net-net。" };
  return { assessable: true, per_share, ncav };
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/netNet.check.ts`
Expected: PASS — 打印 `netNet.check.ts OK`。

- [ ] **Step 5: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出(通过)。

- [ ] **Step 6: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/valuation/netNet.ts web/src/lib/valuation/netNet.check.ts
git commit -m "feat(valuation): Graham net-net 纯函数 computeNetNet + 自检"
```

---

### Task 2: 打通 total_liabilities + 挂 net_net 到 ValuationFloor

**Files:**
- Modify: `web/src/lib/valuation/types.ts`(`ValuationFloorYear` 加 `total_liabilities`;`ValuationFloor` 加 `net_net`;import 或内联 `NetNetLamp`)
- Modify: `web/src/lib/valuation/fundamentalsToFloorInput.ts:41-42`(映射 `total_liabilities`)
- Modify: `web/src/lib/valuation/epvFloor.ts`(`assembleFloor` 组装点挂 `net_net`)
- Test: `web/src/lib/valuation/epvFloor.check.ts`(加一个 net-net 断言)

**Interfaces:**
- Consumes: `computeNetNet` (Task 1),`NetNetLamp` (Task 1)
- Produces: `ValuationFloor.net_net: NetNetLamp`(两路 full/single-lamp 均填充)

- [ ] **Step 1: 类型加字段** — `web/src/lib/valuation/types.ts`:
  - 在文件顶部 import 段加:`import type { NetNetLamp } from "./netNet";`
  - `ValuationFloorYear` 类型里,`current_liabilities` 同组附近加一行:`total_liabilities?: number;`
  - `ValuationFloor` 类型(`kind: "floor"` 那个,约 line 71-82)在 `asset_floor` 下面加一行:`net_net: NetNetLamp;`

- [ ] **Step 2: 映射 total_liabilities** — `web/src/lib/valuation/fundamentalsToFloorInput.ts`,在 line 42 `current_liabilities: u(r.current_liabilities),` 之后加一行:

```ts
      total_liabilities: u(r.total_liabilities),
```

- [ ] **Step 3: 组装点挂 net_net** — `web/src/lib/valuation/epvFloor.ts`:
  - 顶部 import 段加:`import { computeNetNet } from "./netNet";`
  - 在 `assembleFloor` 的 `return { kind: "floor", ... }` 对象里,`asset_floor: assetFloor,` 之后加一行(注意用已解析的 `shares` 而非 `latest.shares_diluted`,以复用其 stub-year 兜底):

```ts
    net_net: computeNetNet({
      currentAssets: latest.current_assets,
      totalLiabilities: latest.total_liabilities,
      sharesDiluted: shares,
    }),
```

- [ ] **Step 4: 加 floor 断言** — `web/src/lib/valuation/epvFloor.check.ts` 末尾(`console.log` 之前)追加:

```ts
// net-net:current_assets − total_liabilities，用已解析 shares。
{
  const f = computeValuationFloor({
    ticker: "NETNET", company_name: "NetNet Co",
    years: [
      { fiscal_year: 2025, revenue: 1000, operating_income: 100, operating_margin: 0.1, net_income: 80, shareholders_equity: 500, cash: 50, total_debt: 0, shares_diluted: 100, d_and_a: 20, capex: 20, current_assets: 1000, total_liabilities: 400 },
      { fiscal_year: 2024, revenue: 950, operating_income: 95, operating_margin: 0.1, net_income: 76, shareholders_equity: 480, shares_diluted: 100, d_and_a: 20, capex: 20 },
      { fiscal_year: 2023, revenue: 900, operating_income: 90, operating_margin: 0.1, net_income: 72, shareholders_equity: 460, shares_diluted: 100, d_and_a: 20, capex: 20 },
    ],
  });
  assert.ok(f && f.kind === "floor", "netnet fixture yields floor");
  if (f && f.kind === "floor") {
    assert.ok(f.net_net.assessable, "net_net assessable");
    if (f.net_net.assessable) assert.ok(Math.abs(f.net_net.per_share - 6) < 1e-6, "net_net per_share = 6");
  }
}
```

  (若 `epvFloor.check.ts` 顶部未 import `computeValuationFloor`,确认已 import;通常已在。)

- [ ] **Step 5: 跑测试**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: PASS。

- [ ] **Step 6: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出。若报 `ValuationFloor.net_net` 在别处构造缺失,检查是否有其它地方手工构造 `{ kind: "floor" }`(应只有 `assembleFloor`)。

- [ ] **Step 7: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/valuation/types.ts web/src/lib/valuation/fundamentalsToFloorInput.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts
git commit -m "feat(valuation): 打通 total_liabilities,net_net 挂进 ValuationFloor"
```

---

### Task 3: verdict 加 netNet(triggered 结合现价)

**Files:**
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts`(`ValuationVerdict` 加 `netNet`;return 计算)
- Test: `web/src/lib/valuation/deriveValuationVerdict.check.ts`(加触发/不触发两个断言)

**Interfaces:**
- Consumes: `ValuationFloor.net_net` (Task 2)
- Produces: `ValuationVerdict.netNet?: { perShare: number; triggered: boolean }`(自动进 valuation_snapshot payload,因 ingest 存 `payload: v`)

- [ ] **Step 1: 类型加字段** — `deriveValuationVerdict.ts` 的 `ValuationVerdict` 类型(约 line 16-39),在 `reliable: boolean;` 后加:

```ts
  /**
   * Graham 净流动资产(net-net)信号:现价低于每股 NCAV 时 triggered=true。
   * 平时 undefined(不可评估)或 triggered=false。独立于 6 档价值带与 reliable,仅供个股页注脚。
   */
  netNet?: { perShare: number; triggered: boolean };
```

- [ ] **Step 2: return 计算** — 在 `deriveValuationVerdict` 函数 return 语句之前(约 line 139 `const reliable = ...` 之后)加:

```ts
  // net-net:现价 < 每股 NCAV → 触发(独立信号,不入 bucket、不入 reliable)。
  const nn = floor.net_net;
  const netNet =
    nn.assessable && Number.isFinite(nn.per_share) && nn.per_share > 0
      ? { perShare: nn.per_share, triggered: price < nn.per_share }
      : undefined;
```

  再把 return 对象末尾加 `netNet`:

```ts
  return { bucket, inStrikeZone, rangeLo, rangeHi, price, priceDate: strikeZone!.price.date, marginPct, coverage, reliable, netNet };
```

- [ ] **Step 3: 加断言** — `deriveValuationVerdict.check.ts` 末尾追加(复用文件已有的 floor/strikeZone 构造 helper;若无,构造一个 floor 使 `net_net.assessable` 且 per_share 已知,price 分别取低于/高于 per_share):

```ts
// net-net:price < 每股NCAV → triggered;price > 每股NCAV → 不触发。
// (借助已有 fixture:确保 floor.net_net.assessable。若本文件用真实 computeValuationFloor 造 floor,
//  给 fixture 年份补 current_assets/total_liabilities 使 net_net.per_share 已知,再取两档价格断言。)
```

  实现者:在本文件现有构造 verdict 的模式上,补一个 `net_net.assessable=true, per_share=6` 的 floor,分别用 `price=5`(期望 `verdict.netNet.triggered===true`)和 `price=7`(期望 `false`)断言。若本文件直接 mock `ValuationFloor`,在 mock 上加 `net_net: { assessable: true, per_share: 6, ncav: 600 }`。

- [ ] **Step 4: 跑测试**

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: PASS。

- [ ] **Step 5: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出。

- [ ] **Step 6: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/deriveValuationVerdict.check.ts
git commit -m "feat(valuation): verdict 加 net-net triggered 信号(入 payload)"
```

---

### Task 4: 个股页价值带下方 net-net 注脚

**Files:**
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`(加 zh/en 注脚文案 + 条件渲染)

**Interfaces:**
- Consumes: `verdict.netNet`(Task 3);卡片 line 215 已有 `const verdict = deriveValuationVerdict({ floor, strikeZone: sz, oeDcf, reconciliation });`

- [ ] **Step 1: 加文案** — 在 `EarningsPowerFloorCard.tsx` 的 `COPY`(`const COPY = {` 起,含 `en`/`zh` 两块)里,各加一条 `netNet` 函数式文案(与其它文案同风格):

```ts
    // en 块内:
    netNet: (ps: string) =>
      `⚑ Price is below net current asset value (${ps}/share). A Graham "net-net" — historically rare and usually a sign of business distress; beware the value trap.`,
```
```ts
    // zh 块内:
    netNet: (ps: string) =>
      `⚑ 现价低于每股净流动资产（${ps}）。格雷厄姆式"净 net"深度价值,历史极罕见——常伴随经营困境,须警惕价值陷阱。`,
```

- [ ] **Step 2: 条件渲染** — 在卡片主视图渲染价值带/strike 区域之后(`verdict` 已在作用域,`perShare` 格式化函数已定义),加一段仅在触发时显示的注脚。定位:在主组件 return 的 JSX 里,价值带 spine 之后、卡片主体收尾处插入:

```tsx
{verdict?.netNet?.triggered ? (
  <p className="mt-2 text-[13px] leading-snug text-[var(--tt-faint)]">
    {t.netNet(perShare(verdict.netNet.perShare))}
  </p>
) : null}
```

  (`t` = 当前 locale 的 COPY 块;`perShare` 是文件顶部已定义的 `$x.xx` 格式化器。若主组件里 locale 变量名不是 `t`,用该文件既有的命名。)

- [ ] **Step 3: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 无输出。

- [ ] **Step 4: 人工看渲染(本项目验证法)**

因本机 next build 受 Google Fonts 屏蔽(见 [[local-build-google-fonts-blocked]]),优先起 dev server 或部署后抽查:一只已知深度破净股(触发)显示注脚、一只正常股(不触发)完全不显示。tsc 通过即可提交,部署后复验。

- [ ] **Step 5: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
git add web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "feat(valuation): 个股页 net-net 触发注脚(中性+风险提示)"
```

---

## 落地后

- 合并到 `db-foundation` 后,跑一次 `npm run valuation:ingest`(或等每日 12:00 UTC cron)使 payload 带上 `netNet`。
- 抽查:历史深度破净小盘工业股应出现注脚;正常股/金融股(无 current_assets)完全不显示。

## Self-Review(已核对)

- **Spec 覆盖:** ①计算=Task1 ②归属/数据流=Task2+3 ③注脚=Task4 ④护栏(缺字段/负NCAV/股数非正/独立于80%闸)=Task1 逻辑 + Task3 只读 net_net 不入 isImplausibleBand ⑤测试=Task1/2/3 的 check。全覆盖。
- **无占位:** 每步含真实代码/命令/预期。Task3-Step3 的断言给了明确构造指引(mock 或真实 floor 两法),非"类似上文"。
- **类型一致:** `NetNetLamp`(netNet.ts)→ `ValuationFloor.net_net`(types.ts)→ `verdict.netNet`(deriveValuationVerdict.ts)贯穿一致;`computeNetNet` 入参 `{currentAssets,totalLiabilities,sharesDiluted}` 在 Task2-Step3 调用处字段名一致。
- **发现并修补 spec 隐含缺口:** spec 未提 `total_liabilities` 未在 ValuationFloorInput 中——Task2 补上管道。
