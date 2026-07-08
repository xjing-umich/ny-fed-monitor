# 估值展示价值带口径统一 Implementation Plan

> **For agentic workers (Cursor):** 按任务顺序逐个执行。步骤用 `- [ ]` 复选框跟踪。本仓库无 Jest/Vitest，测试即"跑 `.check.ts` 脚本 + `tsc --noEmit`"。

**Goal:** 让"展示价值带下沿"与"安全边际/strike 判据"锚定同一个保守底（`epv.valueFloor`），消除 screener/首页榜/个股卡片三处同时出现的自相矛盾（如 GCO 显示价值带 $5–$50 却标 33% 安全边际）。

**Architecture:** 单点修改——`deriveValuationVerdict` 把 `rangeLo` 从"两法端点最小值（OE-DCF+增长包络的下沿，会塌到近零）"改为 `epv.valueFloor`（= inStrikeZone/position/marginPct 已经在用的保守底）。三处展示（`ScreenerTable`、`StrikeLeadersCard`、`EarningsPowerFloorCard`）都读 `verdict.rangeLo`，故一处改动三面自洽。`rangeHi` 不变（仍是乐观上沿）。附带一个点带（lo≈hi）折叠显示的小修。

**Tech Stack:** TypeScript、tsx（跑自检）、Supabase（PostgREST）、Next 16 RSC。

## Global Constraints（每个任务隐含遵守）

- 注释与文档正文用中文（代码/术语/路径除外），与既有文件风格一致。
- 无测试框架：自检文件 `*.check.ts`，`npx tsx <file>` 跑，`assert` 断言，末行打印 `✓ all assertions passed`。
- 门禁：`npx tsc --noEmit -p tsconfig.json`（app）零错误。所有命令在 `web/` 下。
- 不改分档逻辑（bucket/inStrikeZone/position/reliable 全不动），只改 `rangeLo` 的取值与展示。
- `marginPct` 已锚 `valueFloor`（Class A，已合并）——本 plan 让展示带与它对齐，不改 margin 公式。

---

## ⚠️ 背景与关键事实（务必先读）

- **根因**：`marginPct`/`inStrikeZone`/`position` 锚 `epv.valueFloor`（EPV 保守底），但 `rangeLo` 是 `Math.min(...ends)`（OE-DCF+增长端点的最小值），对单灯发散名会塌到近零（HLX rangeLo=$0.61）或塌成一个点。三处展示都画 `[rangeLo, rangeHi]`，于是"价值带"与"安全边际"参照不同底 → 矛盾。已实测 below tab 14 只 reliable 里 ≥5 只矛盾（GCO/HLX/PDLB/MUR/GTLS）。
- **为何改 `rangeLo` 安全**：`rangeLo` 现有消费者只有(1)三处展示，(2)`isImplausibleBand` 的退化检查 `rangeLo>0 && rangeHi>=rangeLo`。而在现有 `ends` 构造下（`conservative` 仅当 OE-DCF 两端 `finitePositive` 才计入；`growth` 端点 = ceilings 或 base，均 >0），`rangeLo=min(ends)` **恒 >0**、`rangeHi>=rangeLo` **恒成立** → 那两个退化分支**本就是死分支**，改 `rangeLo=valueFloor` 不削弱健壮性闸（唯一活跃闸是 `marginPct>0.8`，锚 valueFloor 不变）。
- **`rangeHi >= valueFloor` 恒成立**：`rangeHi=max(ends)` 含 `growth.hi=base=max(AV, ceiling) >= valueFloor`。故新带 `[valueFloor, rangeHi]` 永远合法。
- **卡片是实时算、不读快照**：`EarningsPowerFloorCard` 在个股页实时调 `deriveValuationVerdict`（组件内），改代码即生效，**无需重跑 ingest**。screener/首页榜/投资人徽章读 `valuation_snapshot`，需重跑 ingest 才刷新 `range_lo` 列（Task 3）。
- 分支已切：`fix/valuation-band-coherence`（off db-foundation HEAD a453400）。

---

## Task 1: 核心——`rangeLo` 锚定 `valueFloor`

**Files:**
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts`
- Test: `web/src/lib/valuation/deriveValuationVerdict.check.ts`

**Interfaces:**
- Consumes: `epv.valueFloor: number`（`StrikeZoneAssessment.epv`，已存在）。
- Produces: `ValuationVerdict.rangeLo` 语义变为 = `epv.valueFloor`；`rangeHi` 不变。下游三处展示自动对齐，无需改动它们的读取。

- [ ] **Step 1: 更新自检以编码新行为（先失败）**

在 `deriveValuationVerdict.check.ts`：

test 1（第 60–61 行）改注释与断言（rangeLo 现 = valueFloor = 120）：
```ts
  // rangeLo 现 = epv.valueFloor（sz 默认 120，与 margin/strike 同底）；rangeHi = max 两法端点 = 320。
  assert(v!.rangeLo === 120 && v!.rangeHi === 320, "rangeLo=valueFloor, rangeHi=optimistic top");
```

test 8a（第 98–109 行）整块替换——它原本锁 `rangeLo` 不随 valueFloor 变，现在正相反，rangeLo 就应等于 valueFloor：
```ts
// 8a) 价值带下沿 rangeLo 现锚 epv.valueFloor（与 margin/strike 同底），不再是两法端点最小值。
//     valueFloor=15 ≪ 两法带最小端 90;rangeLo 必须 = 15，与 margin=(15-100)/15 同底（消除展示矛盾）。
{
  const v = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: 15 }),
    oeDcf: oe(),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(v && v.bucket === "below", "below bucket with divergent valueFloor still resolves");
  assert(v!.rangeLo === 15, "rangeLo now anchored to valueFloor (band coherent with margin)");
  assert(v!.rangeHi === 320, "rangeHi unchanged (optimistic top)");
  assert(Math.abs(v!.marginPct! - (15 - 100) / 15) < 1e-9, "marginPct and rangeLo share the valueFloor anchor");
}
```

test 8b（第 111–120 行）整块替换——valueFloor=0 时 rangeLo=0，被 `isImplausibleBand` 退化分支整条抑制为 null（比旧口径"发 null margin"更保守，且 valueFloor≤0 现实不会发生）：
```ts
// 8b) valueFloor ≤ 0（现实不会发生，仅退化保护）→ rangeLo=0 触发 isImplausibleBand 退化分支 → 整条 null。
{
  const v = deriveValuationVerdict({
    floor: floorStub(),
    strikeZone: sz("in_strike_zone", { valueFloor: 0 }),
    oeDcf: oe(),
    reconciliation: recon("both_margin_of_safety"),
  });
  assert(v === null, "valueFloor<=0 → 退化带抑制为 null");
}
```

- [ ] **Step 2: 跑自检确认失败**

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: FAIL（实现仍用 `Math.min(...ends)`：test 1 得 rangeLo=90≠120；test 8a 得 90≠15；test 8b 得非 null）。

- [ ] **Step 3: 改实现**

`deriveValuationVerdict.ts`，把（第 130 行）：
```ts
  const rangeLo = Math.min(...ends);
  const rangeHi = Math.max(...ends);
```
改为：
```ts
  // 展示价值带下沿 = 保守底 valueFloor（与 inStrikeZone/position/marginPct 同底），
  // 而非两法端点最小值 —— 后者对单灯发散名会塌到近零(HLX $0.61)/塌成点，令"价值带"与
  // "安全边际"参照不同底、三处展示自相矛盾(GCO 带 $5–$50 却标 33%)。rangeHi 仍是乐观上沿。
  const rangeHi = Math.max(...ends);
  const rangeLo = epv.valueFloor;
```
（`const ends = [...]` 与 `if (ends.length === 0) return null;` 保持不变——`ends` 仍用于 `rangeHi` 与空判定。）

同步更新类型文档（第 22–23 行）：
```ts
  /** 展示用价值带下沿（每股，= epv.valueFloor 保守底，与 inStrikeZone/marginPct 同锚）。 */
  rangeLo: number;
```

- [ ] **Step 4: 跑自检确认通过**

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: PASS — `deriveValuationVerdict.check.ts ✓ all assertions passed`

- [ ] **Step 5: tsc 门禁**

Run: `cd web && npx tsc --noEmit -p tsconfig.json`
Expected: 无输出。

- [ ] **Step 6: 提交**
```bash
git add web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/deriveValuationVerdict.check.ts
git commit -m "fix(valuation): 展示价值带下沿 rangeLo 锚定 valueFloor,消除带/margin 口径矛盾"
```

---

## Task 2: 点带折叠显示（lo≈hi 时显示单值而非 $X–$X）

**Files:**
- Modify: `web/src/lib/format.ts`（加共享 `fmtValueBand`）
- Modify: `web/src/app/[lang]/stocks/screener/ScreenerTable.tsx`
- Modify: `web/src/components/home/StrikeLeadersCard.tsx`
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx`

**背景：** Task 1 后，单灯无增长名的 `rangeLo=rangeHi=valueFloor`（如 GCO $50=$50），三处会显示 "$50–$50"。诚实但难看 → 折叠为 "$50"。

**Interfaces:**
- Produces: `fmtValueBand(lo: number, hi: number, fmt: (n: number) => string): string` —— rounded(lo)===rounded(hi) → `fmt(lo)`，否则 `${fmt(lo)}–${fmt(hi)}`。

- [ ] **Step 1: 在 `lib/format.ts` 末尾加共享 helper**
```ts
/** 价值带展示：下沿≈上沿(取整相等,如单灯无增长名 valueFloor=rangeHi)时折叠为单值，否则 lo–hi。 */
export function fmtValueBand(lo: number, hi: number, fmt: (n: number) => string): string {
  return Math.round(lo) === Math.round(hi) ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
}
```

- [ ] **Step 2: `ScreenerTable.tsx` 用它**

删除本文件顶部的局部 `band()` 函数（第 13–15 行）：
```ts
function band(lo: number, hi: number): string {
  return `$${Math.round(lo).toLocaleString()}–$${Math.round(hi).toLocaleString()}`;
}
```
import 改为（第 5 行加 `fmtValueBand`）：
```ts
import { cleanIssuer, fmtMarginPct, fmtValueBand } from "@/lib/format";
```
band 列 cell（原第 67 行 `{band(r.rangeLo, r.rangeHi)}`）改为：
```ts
      cell: (r) => <span className="font-mono tabular-nums text-[var(--tt-muted)]">{fmtValueBand(r.rangeLo, r.rangeHi, (n) => `$${Math.round(n).toLocaleString()}`)}</span>,
```

- [ ] **Step 3: `StrikeLeadersCard.tsx` 用它**

在文件 import 区加 `import { fmtValueBand } from "@/lib/format";`（若已 import 其他 format 成员则并入）。把第 51 行：
```ts
                {`$${Math.round(row.rangeLo).toLocaleString()}–$${Math.round(row.rangeHi).toLocaleString()}`}
```
改为：
```ts
                {fmtValueBand(row.rangeLo, row.rangeHi, (n) => `$${Math.round(n).toLocaleString()}`)}
```

- [ ] **Step 4: `EarningsPowerFloorCard.tsx` 用它**

在文件 import 区加 `import { fmtValueBand } from "@/lib/format";`。把第 244 行：
```ts
  const valueRange = `${usd0(rangeLo)}–${usd0(rangeHi)} ${t.perSh}`;
```
改为：
```ts
  const valueRange = `${fmtValueBand(rangeLo, rangeHi, usd0)} ${t.perSh}`;
```
把第 307 行：
```ts
          <span>{t.valueEstimate(`${usd0(rangeLo)} – ${usd0(rangeHi)}`)}</span>
```
改为：
```ts
          <span>{t.valueEstimate(fmtValueBand(rangeLo, rangeHi, usd0))}</span>
```

- [ ] **Step 5: tsc 门禁**

Run: `cd web && npx tsc --noEmit -p tsconfig.json`
Expected: 无输出。

- [ ] **Step 6: 提交**
```bash
git add web/src/lib/format.ts web/src/app/[lang]/stocks/screener/ScreenerTable.tsx web/src/components/home/StrikeLeadersCard.tsx web/src/components/valuation/EarningsPowerFloorCard.tsx
git commit -m "polish(valuation): 价值带 lo≈hi 折叠为单值(fmtValueBand),避免 \$50–\$50"
```

---

## Task 3: 重跑 ingest 刷新快照 + 复验口径一致

**前提：** Task 1–2 全绿。个股卡片已随代码生效（实时算）；screener/首页/徽章读快照的 `range_lo` 列，需重跑 ingest 刷新。

- [ ] **Step 1: 重跑估值快照（会重写 valuation_snapshot.range_lo = valueFloor）**

Run: `cd web && npm run valuation:ingest`
Expected 日志：`估值快照完成: 入表 ~1108, ... 排除非经营性 ~128, ...`（DGS10 若超时回退 last-good，正常）。

- [ ] **Step 2: 复验 below/strike tab 口径一致（新建只读校验脚本）**

创建 `web/scripts/_verify-band.ts`：
```ts
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import * as fs from "fs"; import * as path from "path"; import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env: Record<string,string> = {};
for (const l of fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8").split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, ""); }
(async () => {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });
  const { data } = await db.from("valuation_snapshot").select("ticker,range_lo,range_hi,price,margin_pct").eq("verdict_bucket","below").eq("reliable",true);
  const rows = (data ?? []) as any[];
  let bad = 0;
  for (const r of rows) {
    // 口径一致后：below 名 price < rangeLo(=valueFloor)，故 price/rangeLo < 1；且 margin≈(rangeLo-price)/rangeLo
    const marginExp = (r.range_lo - r.price) / r.range_lo;
    const coherent = r.price <= r.range_lo + 1e-6 && Math.abs((r.margin_pct ?? -9) - marginExp) < 1e-3 && r.range_lo <= r.range_hi + 1e-6;
    if (!coherent) { bad++; console.log(`  ✗ ${r.ticker} price=${r.price} rangeLo=${r.range_lo} rangeHi=${r.range_hi} margin=${r.margin_pct}`); }
  }
  console.log(`below/strike reliable 行 ${rows.length}，口径不一致 ${bad} ${bad===0?"✓":"✗"}`);
  process.exit(0);
})();
```
Run: `cd web && npx tsx --env-file=.env.local scripts/_verify-band.ts`
Expected: `口径不一致 0 ✓`（每只 below 名现价都 ≤ 展示带下沿，margin 与带下沿同底）。

- [ ] **Step 3: 删除临时校验脚本**

Run: `rm web/scripts/_verify-band.ts`

- [ ] **Step 4: 收尾** — 汇总 2 个代码提交（Task 1、2），准备开 PR（base `db-foundation`）。合并后下一次每日 `valuation.yml` 自动刷新快照；个股卡片随部署即生效。

---

## Self-Review 记录

- **Spec 覆盖**：口径统一→Task 1（源头改 rangeLo）；点带显示→Task 2；刷新+复验→Task 3。
- **不改分档**：bucket/inStrikeZone/position/reliable/coverage 全未触碰；仅 `rangeLo` 取值 + 展示折叠。
- **健壮性闸不削弱**：已论证 `rangeLo>0 / rangeHi>=rangeLo` 在现有 ends 构造下恒成立（死分支），改 rangeLo=valueFloor 不放松抑制；唯一活跃闸 `marginPct>0.8`（锚 valueFloor）不变。test 8b 覆盖 valueFloor≤0 退化→null。
- **类型一致**：`rangeLo` 仍是 `number`，读层 `SnapshotVerdict/ScreenerRow/StrikeLeader` 无需改字段（只是值口径变），`fmtValueBand` 签名在 Task 2 定义、Task 2 三处消费一致。
- **锚点校对**：deriveValuationVerdict.ts:130 / .check.ts test1(60-61)/8a(98-109)/8b(111-120) / ScreenerTable.tsx:13-15,67 / StrikeLeadersCard.tsx:51 / EarningsPowerFloorCard.tsx:244,307 均对 HEAD a453400 核实。
