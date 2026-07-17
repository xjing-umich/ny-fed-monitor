# 护城河判定地基修复 实施计划(重置价值纳入无形重建 + ROIC 兜底 + 死角诚实标注)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让轻资产/无形密集的强 franchise(NFLX/MA/SPGI/ADBE 主路径、MCO ROIC 兜底)不再被误判"无护城河 + 无成长价值 + 远高于内在价值",同时把资本结构被回购摧毁的深度负权益名(MSCI/ORLY)诚实标注"不可评估"而非假"太贵",且不误伤真烂账反例(W/CVNA/PTON)与对照组(MSFT/AAPL)。

**Architecture:** 动四处引擎地基 —— `reproductionValue.ts`(层①:有形为负但净重置为正时以 avCore 为单一重置底)、`epvFloor.buildMoatReading`+`moatCap.deriveMoatCap`(层②兜底:AV 不可评估但 ROIC 长期极高稳 → franchise;层②死角:AV 与 ROIC 双不可评估 → 标记资本结构扭曲)、`deriveValuationVerdict.ts`+个股页(层②死角抑制,仿 splitCoverageStale)、`growthValue.ts`(层③:成长再投资纳入无形投资,**先验证后实施,可能延 Phase 2**)。地基已有 `acquiredResetProxy`/`reproduction_per_share`/dual-AV 闸脚手架,本计划补上被短路的通路与两条兜底/死角分支。

**Tech Stack:** TypeScript(Next.js App Router,worktree `.claude/worktrees/moat-intangibles/web`),纯函数估值引擎 + `.check.ts` 断言脚本(`tsx`),真数据探针(`tsx --tsconfig scripts/tsconfig.json`)。

## Global Constraints

- **分支/worktree**:全部改动在 worktree `.claude/worktrees/moat-intangibles`,分支 `plan/valuation-intangible-reproduction`(off `db-foundation` 081d2ec)。所有路径相对 `web/`。
- **正文语言**:回复正文、plan/文档正文、代码注释一律中文;代码标识符/术语/路径除外([[reply-and-plan-in-chinese]])。
- **不跑测试框架**:本项目无测试套件,验证只用 `.check.ts` 断言脚本 + `npx tsc --noEmit`;禁引入 jest/vitest([[no-tests-solo-dev]])。
- **文案去 AI 感**:新增 en/zh 用户可见文案各自独立地道,禁 AI 腔(破折号抒情/对偶/三元枚举/对冲词),遵 `web/docs/copy-voice.md`([[anti-ai-product-sense]]、[[no-mixed-language-copy]])。
- **常量纪律**:任何"待校准"参数用全市场真数据定分位、记 provenance,禁无出处常量;校准脚本只读不写库(仿 `scripts/leverage-premium-calibrate.ts`)([[sec-valuation-ingest-ops]])。
- **引擎口径纪律**:验证一律走真引擎探针(`fundamentalsToFloorInput → computeValuationFloor → deriveStrikeZone → deriveOeDcf → reconcileMethods → deriveValuationVerdict`),不手写 SQL;只读 `fiscal_period=FY` 行([[graham-net-net-floor]]、[[cusip-corruption-episode]])。
- **既有常量(复用,不新增同义)**:`RD_CAPITALIZATION_YEARS=5`、`ACQUIRED_RESET_DISCOUNT=0.5`、`MOAT_FRANCHISE_MULTIPLE=1.25`、`ROIC_MOAT_MIN_YEARS=6`、`ROIC_MOAT_STRONG=0.22`、`ROIC_MOAT_CV=0.35`。
- **验收票集(13)**:主路径救 NFLX/MA/SPGI/ADBE;兜底救 MCO;死角标注 MSCI/ORLY;对照不漂移 MSFT/AAPL;烂账反例 W/CVNA/PTON;数据问题 V(单独,不阻塞)。
- **上线**:纯代码,生产效果需合并后授权跑 `npm run valuation:ingest` 才落地。

---

## 文件结构

| 文件 | 责任 | 层 | Task |
|---|---|---|---|
| `web/scripts/probe-moat-intangibles.ts`(新建) | 13 票真引擎探针,打印重置底/护城河/GV/verdict,BEFORE↔AFTER diff 的测量仪 | 全 | 1,2,3,4,5,6 |
| `web/src/lib/valuation/reproductionValue.ts` | 有形为负但 avCore 为正 → 以 avCore 为单一重置底;有形为正保持 dual 零漂移 | 层① | 2 |
| `web/src/lib/valuation/reproductionValue.check.ts` | 断言 avCore 分支 + 有形为正不漂移 + avCore≤0 仍不可评估 | 层① | 2 |
| `web/src/lib/valuation/types.ts` | `MoatReading` 加 `moat_via_roic?`、`capital_structure_distorted?` | 层② | 3,4 |
| `web/src/lib/valuation/epvFloor.ts` | 重排 roicLongStrong 前置;`buildMoatReading` 加 ROIC 兜底 + 死角标记分支 | 层② | 3,4 |
| `web/src/lib/valuation/epvFloor.check.ts` | 断言兜底 franchise / 死角标记 | 层② | 3,4 |
| `web/src/lib/valuation/moatCap.ts` | `deriveMoatCap` 处理 AV 无值的 ROIC-only franchise 定档 | 层② | 3 |
| `web/src/lib/valuation/moatCap.check.ts` | 断言 roicOnly 定档 | 层② | 3 |
| `web/src/lib/valuation/deriveValuationVerdict.ts` | 加 `capitalStructureDistorted` 入参,早返回 null(仿 splitCoverageStale) | 层② | 4 |
| `web/src/lib/valuation/deriveValuationVerdict.check.ts` | 断言死角抑制 | 层② | 4 |
| `web/src/app/[lang]/stocks/[ticker]/page.tsx` | 算死角 flag 传入 verdict;死角分支渲染说明(仿 splitPaused) | 层② | 4 |
| `web/scripts/valuation-ingest.ts` | 算死角 flag 传入 verdict(死角 → null → 不入表 → 下游自动缺席) | 层② | 4 |
| `web/src/components/valuation/EarningsPowerFloorCard.tsx` | 护城河明细区死角文案(not_assessable + 资本结构扭曲) | 层② | 4 |
| `web/src/lib/stocks/stockCopy.ts` | en/zh `moatDistorted` 说明键 | 层② | 4 |
| `web/src/lib/valuation/growthValue.ts` | (条件)成长再投资纳入无形投资;早返回条件放宽 | 层③ | 5 |
| `web/scripts/gv-intangible-calibrate.ts`(条件新建) | (条件)层③ 纳入比例只读校准 | 层③ | 5 |

---

## Task 1: 真引擎探针 harness + BEFORE 基线

**目标**:建一个覆盖 13 票的只读探针,打印每票的重置底口径、护城河信号、成长价值、verdict,作为后续每层改动的测量仪;先跑一次 BEFORE 基线,坐实每只目标票走"有形为负"还是"有形为正但被阻断"分支(锁定 Task 2 的分支设计)。

**Files:**
- Create: `web/scripts/probe-moat-intangibles.ts`
- Baseline artifact: `web/scripts/.moat-probe-before.txt`(git 忽略即可,不必提交;或提交到 `docs/` 供追溯——见 Step 4)

**Interfaces:**
- Consumes:`@/lib/sec/read`(`getSecCompanyData`)、`@/lib/valuation`(`fundamentalsToFloorInput`/`computeValuationFloor`/`deriveStrikeZone`/`deriveOeDcf`/`reconcileMethods`/`deriveValuationVerdict`)、`@/lib/managers/priceRead`(`getLatestPrice`)、`@/lib/valuation/moatCap`(`roicHelpers`/`roicLongTermStrong`)。
- Produces:命令行探针,后续 Task 均以 `npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts <tickers...>` 复跑并对齐验收表。

- [ ] **Step 1: 写探针脚本**

复制 `web/scripts/probe-klac-split.ts` 的 env 装载与编排骨架(逐字保留 `loadEnv`、SUPABASE 凭据校验),把打印面换成护城河/重置底口径。完整文件:

```ts
/**
 * probe-moat-intangibles.ts — 护城河地基修复的真引擎测量仪(只读)。
 * 对每只 ticker 跑真引擎,打印重置底口径(tangible/avCore/reproduction)、护城河信号、
 * 成长价值、roicLongTermStrong、verdict。BEFORE↔AFTER 用同一脚本 diff。
 *
 * 用法: cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts NFLX MA SPGI ADBE MCO MSCI ORLY MSFT AAPL W CVNA PTON V
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { getSecCompanyData } from "@/lib/sec/read";
import {
  fundamentalsToFloorInput,
  computeValuationFloor,
  deriveStrikeZone,
  deriveOeDcf,
  reconcileMethods,
  deriveValuationVerdict,
} from "@/lib/valuation";
import { getLatestPrice } from "@/lib/managers/priceRead";
import { roicHelpers, roicLongTermStrong } from "@/lib/valuation/moatCap";
import { normalizedTaxRate } from "@/lib/valuation/epvFloor";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadEnv(): Record<string, string> {
  const candidates = [path.join(__dirname, "../.env.local")];
  const out: Record<string, string> = {};
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
      }
      break;
    }
  }
  return { ...out, ...process.env } as Record<string, string>;
}

const DEFAULT = ["NFLX", "MA", "SPGI", "ADBE", "MCO", "MSCI", "ORLY", "MSFT", "AAPL", "W", "CVNA", "PTON", "V"];
const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT;

function n(x: number | null | undefined, d = 2): string {
  return x == null || !Number.isFinite(x) ? "—" : x.toFixed(d);
}

async function main() {
  const env = loadEnv();
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("BLOCKED: 缺少 SUPABASE 凭据。");
    process.exit(1);
  }

  for (const ticker of TICKERS) {
    console.log(`\n======== ${ticker} ========`);
    const sec = await getSecCompanyData(ticker);
    const fyRows = (sec.annual ?? []).filter((r) => r.fiscal_period === "FY");
    const latest = fyRows.sort((a, b) => (b.fiscal_year ?? 0) - (a.fiscal_year ?? 0))[0];
    if (latest) {
      console.log(`latest FY ${latest.fiscal_year}: equity=${n(latest.shareholders_equity, 0)} goodwill=${n(latest.goodwill, 0)} intangibles=${n(latest.intangibles, 0)} shares=${n(latest.shares_diluted, 0)}`);
    }

    const sicRaw = (sec.company as { sic?: unknown } | null)?.sic;
    const sicNum = sicRaw == null ? undefined : Number(sicRaw);
    const sic = sicNum != null && Number.isFinite(sicNum) ? sicNum : undefined;
    const floorInput = fundamentalsToFloorInput(ticker, ticker, sec.annual, 1, sic);
    const floor = computeValuationFloor(floorInput);
    if (!floor || floor.kind !== "floor") {
      console.log(`floor: not assessable (${floor?.kind})`);
      continue;
    }

    // 重置底口径
    const af = floor.asset_floor;
    console.log(`asset_floor: assessable=${af.assessable} dual_av_comparable=${af.dual_av_comparable} tangible=${n(af.tangible_net_assets, 0)} capRd=${n(af.capitalized_rd, 0)} proxy=${n(af.acquired_reset_proxy, 0)} per_share(AV)=${n(af.per_share)} reproduction_per_share=${n(af.reproduction_per_share)}`);

    // 护城河 + CAP
    const mr = floor.moat_reading;
    console.log(`moat: signal=${mr.signal} via_roic=${(mr as { moat_via_roic?: boolean }).moat_via_roic ?? false} capital_distorted=${(mr as { capital_structure_distorted?: boolean }).capital_structure_distorted ?? false} epv_ps=${n(mr.epv_per_share_compared)} asset_ps=${n(mr.asset_per_share_compared)}`);
    console.log(`moat_cap: grade=${floor.moat_cap.grade} capYears=${floor.moat_cap.capYears}`);

    // roicLongTermStrong(独立复算,验证兜底判据)
    const tax = normalizedTaxRate(floorInput.years);
    const { nopatOf, investedCapitalOf } = roicHelpers(tax.rate);
    const rls = roicLongTermStrong({ fyYears: floorInput.years, nopatOf, investedCapitalOf });
    console.log(`roicLongTermStrong=${rls}`);

    // 成长价值
    const gv = floor.growth_value;
    console.log(`growth_value: assessable=${gv.assessable} gated_to_zero=${gv.gated_to_zero} roiic=${n(gv.roiic, 3)} neutral_ps=${n(gv.per_share?.neutral)} reason=${gv.not_assessable_reason ?? "—"}`);

    // verdict
    const price = await getLatestPrice(ticker);
    if (!price) {
      console.log(`verdict: (no price)`);
      continue;
    }
    const strikeZone = deriveStrikeZone(floor, price);
    const oeDcf = deriveOeDcf(floor, floorInput.years, { value: 4.4, date: "2026-07-15" }, price);
    const reconciliation = strikeZone && oeDcf ? reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, price) : undefined;
    const verdict = deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation });
    console.log(`verdict:`, verdict ? { bucket: verdict.bucket, reliable: verdict.reliable, marginPct: n(verdict.marginPct == null ? undefined : verdict.marginPct * 100, 1) } : "null (suppressed)");
  }
}

main().catch((err) => {
  console.error("探针失败:", err);
  process.exit(1);
});
```

- [ ] **Step 2: 确认 `normalizedTaxRate` 已导出(探针依赖)**

`normalizedTaxRate` 在 `epvFloor.ts:89` 已是 `export function`(读过)。若 tsc 报未导出则补 `export`。

Run: `cd web && npx tsc --noEmit`
Expected: 无与 `probe-moat-intangibles.ts` 相关的类型错误(其余既有告警不管)。

- [ ] **Step 3: 跑 BEFORE 基线**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts | tee scripts/.moat-probe-before.txt`
Expected(BEFORE,坐实病征):
- NFLX/MA/SPGI/ADBE/MCO/MSCI/ORLY:`moat.signal=not_assessable`(或 commodity),`moat_cap.grade=none`,`growth_value.gated_to_zero=true`(护城河非 franchise → GV 被零乘)。
- MSFT/AAPL:`moat.signal=franchise`,`grade=strong`(对照基线)。
- 每票记下 `tangible`、`per_share(AV)`、`reproduction_per_share`、`epv_ps`、`roicLongTermStrong`。

- [ ] **Step 4: 判定 Task 2 分支归属(锁定设计)**

看 BEFORE 输出,对 NFLX/MA/SPGI/ADBE 逐票确认 `tangible` 的正负:
- **若 `tangible ≤ 0`(预期)** → 走 Task 2 的"有形为负、avCore 为单一重置底"分支。记录每票 `avCore = tangible + capRd + proxy` 是否 > 0(应为正,否则该票落死角或需查数据)。
- **若某票 `tangible > 0` 却仍 `not_assessable`/`commodity`** → 说明它被 dual 测试的 avRepr 臂阻断(`franchise_blocked_by_reproduction`),Task 2 的 sign-split 不会救它;在本 Step 记为**例外票**,在 Task 2 Step 6 附录分支单独处理(见 Task 2)。

把结论(每票分支 + avCore 正负)记进提交信息或 `docs/` 追溯笔记。

- [ ] **Step 5: 提交探针**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/moat-intangibles
git add web/scripts/probe-moat-intangibles.ts
git commit -m "test(valuation): 护城河地基修复真引擎探针 + BEFORE 基线

探针打印 13 票重置底口径/护城河信号/GV/verdict,作为逐层测量仪。
BEFORE 坐实 NFLX/MA/SPGI/ADBE/MCO/MSCI/ORLY 护城河 not_assessable→GV 归零。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 层① — reproductionValue 以 avCore 为单一重置底(有形为负时)

**目标**:有形净资产为负但净重置(含已收购无形代理 + R&D research asset)为正时,以 avCore 为单一重置底供护城河测试比较;有形为正的对照票(MSFT/AAPL)保持今天的 dual-AV 结构 byte-for-byte 零漂移。

**Files:**
- Modify: `web/src/lib/valuation/reproductionValue.ts:64-83`
- Modify: `web/src/lib/valuation/reproductionValue.check.ts:67-72`(负有形用例改判 + 新增 avCore>0 用例)

**Interfaces:**
- Consumes:Task 1 Step 4 的分支归属结论。
- Produces:`buildReproductionValue` 在有形为负、avCore>0 时返回 `assessable:true, dual_av_comparable:false, per_share=avCore/shares`(路由 `buildMoatReading` 单-AV franchise 测试对 avCore 比较)。

- [ ] **Step 1: 写失败断言(先改测试)**

在 `reproductionValue.check.ts` 的负有形用例(现 `:67-72`)后追加 avCore>0 用例,并把原负有形用例的期望改为"avCore 仍≤0 → 不可评估"(数值 −250,证明 proxy 不能无条件翻正):

```ts
// 有形为负但 avCore(含已收购无形代理)仍为负 → 不可评估(proxy 不能无条件翻正)。
const negCore: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 1_000, goodwill: 2_000, intangibles: 500 },
];
const nc = buildReproductionValue(negCore, 1_000);
// tangible = 1000 − 2000 − 500 = −1500; proxy = 2500×0.5 = 1250; avCore = −1500 + 1250 = −250 ≤ 0。
assert.strictEqual(nc.assessable, false, "avCore≤0 → not assessable");

// 有形为负但 avCore 为正(轻资产 franchise)→ 以 avCore 为单一重置底,dual 关闭。
const negTangPosCore: ValuationFloorYear[] = [
  { fiscal_year: 2025, shareholders_equity: 1_000, goodwill: 1_200, intangibles: 300 },
];
const pc = buildReproductionValue(negTangPosCore, 1_000);
// tangible = 1000 − 1200 − 300 = −500; proxy = 1500×0.5 = 750; avCore = −500 + 750 = 250 > 0。
assert.ok(pc.assessable, "avCore>0 → assessable");
assert.strictEqual(pc.dual_av_comparable, false, "负有形分支关 dual,单-AV 对 avCore 比较");
approx(pc.tangible_net_assets!, -500, 1e-6, "tangible 仍如实为负");
approx(pc.acquired_reset_proxy!, 750, 1e-6, "proxy = (gw+intang)×0.5");
approx(pc.per_share!, 250 / 1_000, 1e-6, "per_share = avCore/shares");
```

同时删掉现有 `:67-72` 的旧负有形用例(被 `negCore` 取代)。

- [ ] **Step 2: 跑测试确认失败**

Run: `cd web && npx tsx src/lib/valuation/reproductionValue.check.ts`
Expected: FAIL —— `negTangPosCore` 现在会命中旧代码 `if (tangible <= 0) return not_assessable` → `pc.assessable` 为 false,断言 `avCore>0 → assessable` 失败。

- [ ] **Step 3: 实现 avCore 分支**

把 `reproductionValue.ts:64-83`(从 `const goodwill = latest.goodwill ?? 0;` 到函数结尾 `}`)整段替换为:

```ts
  const goodwill = latest.goodwill ?? 0;
  const intangibles = latest.intangibles ?? 0;
  const tangible = equity - goodwill - intangibles;
  const acquiredResetProxy = (goodwill + intangibles) * ACQUIRED_RESET_DISCOUNT;
  const rd = capitalizedRd ?? 0;

  if (tangible > 0) {
    // 有形为正(MSFT/AAPL 类):保持今天的 dual-AV 结构 byte-for-byte,零漂移(spec §6.4 对照回归守护)。
    const basis = capitalizedRd != null
      ? "Reproduction value = tangible net assets (equity − goodwill − intangibles) + capitalized R&D (5y straight-line), ÷ diluted shares."
      : "Tangible net assets = shareholders' equity − goodwill − intangibles, ÷ diluted shares (no R&D history to capitalize).";
    const total = tangible + rd;
    const reproductionTotal = total + acquiredResetProxy;
    return {
      assessable: true, basis, intangibles_separated: true, dual_av_comparable: true,
      tangible_net_assets: tangible, capitalized_rd: capitalizedRd,
      total_value: total, per_share: total / shares, rd_years_used: capitalizedRd != null ? rdYearsUsed : undefined,
      acquired_reset_proxy: acquiredResetProxy,
      reproduction_total_value: reproductionTotal,
      reproduction_per_share: reproductionTotal / shares,
    };
  }

  // 有形为负但净重置为正(NFLX/MA/SPGI/ADBE 类轻资产 franchise):以 avCore 为**单一**重置底。
  // Greenwald 原意:重建其收购来的品牌/网络/牌照仍有成本 → 剔除无形代理的"avCons"对这类公司恒为负、
  // 是伪保守。改单-AV 对 avCore 比较(dual 关闭),护城河测试才不被负分母击穿。
  const avCore = tangible + rd + acquiredResetProxy;
  const basis = capitalizedRd != null
    ? "Reproduction value = intangible-inclusive net reproduction (tangible net assets + acquired-intangible reset proxy + capitalized R&D), ÷ diluted shares; tangible net assets alone are negative for this asset-light franchise."
    : "Reproduction value = tangible net assets + acquired-intangible reset proxy, ÷ diluted shares; tangible net assets alone are negative for this asset-light franchise (no R&D history to capitalize).";
  if (avCore <= 0) {
    return { assessable: false, not_assessable_reason: "Intangible-inclusive net reproduction value is negative, so no asset floor is shown.", basis, intangibles_separated: true, dual_av_comparable: false };
  }
  return {
    assessable: true, basis, intangibles_separated: true, dual_av_comparable: false,
    tangible_net_assets: tangible, capitalized_rd: capitalizedRd,
    total_value: avCore, per_share: avCore / shares, rd_years_used: capitalizedRd != null ? rdYearsUsed : undefined,
    acquired_reset_proxy: acquiredResetProxy,
  };
```

> 注:有形为负分支 `dual_av_comparable:false` 会把 `buildMoatReading` 路由到单-AV fallback(`epvFloor.ts:546-560`),该路径用 `reproduction.per_share`(=avCore)算 `ratioCons = epvMid/avCore`,≥1.25 → franchise。无需改 `buildMoatReading` 的单-AV 分支本身。

- [ ] **Step 4: 跑测试确认通过**

Run: `cd web && npx tsx src/lib/valuation/reproductionValue.check.ts`
Expected: `reproductionValue.check.ts: OK`

- [ ] **Step 5: 真数据复跑 + 对照回归守护**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts NFLX MA SPGI ADBE MSFT AAPL`
Expected:
- NFLX/MA/SPGI/ADBE:`moat.signal=franchise`(对 avCore 比较过 1.25×),`asset_floor.dual_av_comparable=false`,`per_share(AV)` 为正。
- **MSFT/AAPL:`moat.signal=franchise` 不变**,`asset_floor.per_share` 与 BEFORE 基线一致(有形为正分支 byte-for-byte 未动)。若 MSFT/AAPL 任一 signal 或 per_share 相对 `scripts/.moat-probe-before.txt` 漂移 → 停,回看是否误触负分支(不应发生,因它们 tangible>0)。

- [ ] **Step 6:(条件)例外票附录 —— 仅当 Task 1 Step 4 标记了 `tangible>0 却被阻断` 的票**

若 Task 1 发现某目标票 `tangible>0` 却被 dual 的 avRepr 臂判 commodity(`franchise_blocked_by_reproduction=true`):这是 avRepr 臂对该票过严,不属本 sign-split 覆盖。**记录该票为已知遗留**,在 Task 6 验收表标注"未修(avRepr 臂过严,另开 spec)",不在本计划强行放宽 avRepr 臂(会波及全体有形为正名,超范围)。若无此类票(预期),跳过本 Step。

- [ ] **Step 7: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/moat-intangibles
git add web/src/lib/valuation/reproductionValue.ts web/src/lib/valuation/reproductionValue.check.ts
git commit -m "feat(valuation): 层① 有形为负时以 avCore 为单一重置底

有形净资产为负但含已收购无形代理+R&D research asset 的净重置为正时,
以 avCore 为重置底供护城河测试比较(dual 关闭);有形为正保持 dual 零漂移。
救回 NFLX/MA/SPGI/ADBE,MSFT/AAPL 对照不动。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 层② — ROIC 兜底路径(AV 不可评估但回报质量过硬 → franchise)

**目标**:当净重置 avCore≤0(AV 不可评估)但 EPV 强且 `roicLongTermStrong`=true 时,凭 Greenwald §1.1.1"sustained high ROIC"终极判据直接判 franchise;并让 `deriveMoatCap` 在 AV 无值时也能给出 CAP 档。

**Files:**
- Modify: `web/src/lib/valuation/types.ts:65-81`(`MoatReading` 加两字段)
- Modify: `web/src/lib/valuation/epvFloor.ts`(assembleFloor 重排 roicLongStrong 前置 + `buildMoatReading` 签名与兜底分支)
- Modify: `web/src/lib/valuation/moatCap.ts:26-33`(`deriveMoatCap` roicOnly 定档)
- Modify: `web/src/lib/valuation/epvFloor.check.ts`、`web/src/lib/valuation/moatCap.check.ts`(断言)

**Interfaces:**
- Consumes:`roicLongTermStrong`(已有,`moatCap.ts:147`)、`roicHelpers`(已有)。
- Produces:`MoatReading.moat_via_roic?: boolean`(兜底路径标记);`buildMoatReading(epvLamp, reproduction, shares, roicLongStrong)` 新签名;`deriveMoatCap` 对 `moat_via_roic` 票用 roicLongTermStrong 定 strong/moderate。

- [ ] **Step 1: types.ts 加字段**

在 `types.ts` 的 `MoatReading`(`:65-81`)`dual_test_passed?` 之后追加:

```ts
  /** true when the franchise signal came from the ROIC fallback (AV not assessable). */
  moat_via_roic?: boolean;
  /** true when both AV (avCore≤0) and the ROIC fallback fail — capital structure distorted by buybacks; moat not assessable. */
  capital_structure_distorted?: boolean;
```

- [ ] **Step 2: 写断言(epvFloor.check.ts)—— 兜底 franchise**

在 `epvFloor.check.ts` 末尾(`console.log(... OK)` 前)追加一个直接调用 `buildMoatReading` 的用例。先确认 `buildMoatReading` 已 `export`(现为模块内私有 `function buildMoatReading`,`epvFloor.ts:474`)——本 Task Step 4 会加 `export`。断言:

```ts
import { buildMoatReading } from "./epvFloor";
import type { EpvLamp, ReproductionValue } from "./types";

// AV 不可评估 + EPV 强 + roicLongStrong → ROIC 兜底 franchise。
const strongEpv: EpvLamp = {
  label: "x", assessable: true, per_share_low: 80, per_share_high: 120,
  method: { earnings_basis: "", leverage_treatment: "", denominator: "", bridge: "", discount_rate_low: 0.09, discount_rate_high: 0.11, years_used: [], simplifications: [] },
};
const noAv: ReproductionValue = { assessable: false, basis: "", intangibles_separated: true, dual_av_comparable: false };
const viaRoic = buildMoatReading(strongEpv, noAv, 10, true);
assert.strictEqual(viaRoic.signal, "franchise", "AV 不可评估 + roicLongStrong → franchise");
assert.strictEqual(viaRoic.moat_via_roic, true, "标记兜底路径");

// AV 不可评估 + roicLongStrong=false → 死角标记(Task 4 消费)。
const distorted = buildMoatReading(strongEpv, noAv, 10, false);
assert.strictEqual(distorted.signal, "not_assessable", "AV+ROIC 双不可评估 → not_assessable");
assert.strictEqual(distorted.capital_structure_distorted, true, "标记资本结构扭曲");
```

- [ ] **Step 3: 跑确认失败**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts`
Expected: FAIL —— `buildMoatReading` 未导出 / 签名只接 3 参 / 无兜底分支。

- [ ] **Step 4: epvFloor.ts —— 导出 + 重排 + 兜底/死角分支**

(a) `buildMoatReading` 加 `export`,签名加第 4 参 `roicLongStrong: boolean`(`epvFloor.ts:474`):

```ts
export function buildMoatReading(epvLamp: EpvLamp, reproduction: ReproductionValue, shares: number, roicLongStrong: boolean): MoatReading {
```

(b) 把 `epvFloor.ts:489-491` 的 `if (!reproduction.assessable || reproduction.per_share == null) { return not_assessable }` 整段替换为兜底 + 死角双分支:

```ts
  if (!reproduction.assessable || reproduction.per_share == null) {
    // 层② ROIC 兜底(spec §3.2):AV 因深度负权益/无形主导不可评估,但 EPV 强(本行已过 epvLamp.assessable)
    // 且 ROIC 长期极高稳 → Greenwald §1.1.1「sustained high ROIC」是护城河终极判据,AV 只是 backstop。
    if (roicLongStrong && epvLamp.per_share_low != null && epvLamp.per_share_high != null) {
      const epvMid = (epvLamp.per_share_low + epvLamp.per_share_high) / 2;
      return {
        signal: "franchise",
        label: "Reproduction value is not assessable (capital structure distorted), but sustained high ROIC signals a durable franchise — a moat signal on the returns test, not a verdict.",
        basis_note: basisNote,
        epv_per_share_compared: epvMid,
        moat_via_roic: true,
      };
    }
    // 层② 死角(spec §3.3):AV 与 ROIC 双不可评估 → 资本结构被回购扭曲,护城河不可评估。
    return {
      signal: "not_assessable",
      label: "The earnings-power vs reproduction-value comparison is unavailable: the capital structure is distorted by buybacks (deeply negative equity) and returns history is too short or unstable to judge a moat.",
      basis_note: basisNote,
      capital_structure_distorted: true,
    };
  }
```

(c) 在 `assembleFloor` 里**把 `roicLongStrong` 计算前置到 `buildMoatReading` 之前**。当前 `assembleFloor:173-174` 先算 `assetFloor`/`moatReading`,`roicLongStrong` 在 `:202`。改为:在 `:172`(`const tax = normalizedTaxRate(years);`)之后、`:173` 之前插入:

```ts
  const { nopatOf: nopatMoat, investedCapitalOf: investedCapitalMoat } = roicHelpers(tax.rate);
  const roicLongStrongMoat = roicLongTermStrong({ fyYears: allYears, nopatOf: nopatMoat, investedCapitalOf: investedCapitalMoat });
```

然后把 `:174` 改为传入第 4 参:

```ts
  const moatReading = buildMoatReading(moatRefLamp, assetFloor, shares, roicLongStrongMoat);
```

并把原 `:202` 的 `const roicLongStrong = roicLongTermStrong({...})` 改为复用 `roicLongStrongMoat`(删除重复计算,`:190-191` 的 `roicHelpers` 若仅此处用可保留给 `roicStable`/`roicTrend`;`deriveMoatCap` 的 `roicLongTermStrong: roicLongStrong` 入参 `:232` 改为 `roicLongStrongMoat`)。确保无重复声明导致 tsc 报错。

- [ ] **Step 5: moatCap.ts —— roicOnly 定档**

把 `deriveMoatCap`(`moatCap.ts:26-33`)的门槛与 franchise 判定改为识别 `moat_via_roic`:

```ts
  const { moat, epvAvRatio, epvAvRatioOperating, declined, suppressedFlags, roicStable, roicLongTermStrong } = input;
  const roicOnly = moat.moat_via_roic === true;
  if (moat.signal !== "franchise" || (!roicOnly && epvAvRatio == null && epvAvRatioOperating == null)) {
    return { grade: "none", capYears: CAP_NONE, durablePassed: false, basis: "无护城河信号，不延长竞争优势期。" };
  }
  if (roicOnly) {
    // AV 无值(兜底路径):凭 ROIC 长期极高稳定档。franchiseCore 去掉 strongRatio(无 AV 比率),
    // 由 roicLongTermStrong 直接承担强档判据;仍受盈利下滑/资本开支红旗/ROIC 不稳降档。
    const franchiseCore = !declined && !suppressedFlags && roicStable === true;
    const durablePassed = franchiseCore && roicLongTermStrong === true;
    if (durablePassed) {
      return { grade: "strong", capYears: CAP_STRONG, durablePassed: true, roicStable: true,
        basis: `强护城河（AV 不可评估，但 ROIC 长期极高且稳定）→ 竞争优势期约 ${CAP_STRONG} 年。` };
    }
    const reason = declined ? "盈利下滑" : suppressedFlags ? "资本开支红旗" : "ROIC 稳定性不足";
    return { grade: "moderate", capYears: CAP_MODERATE, durablePassed: false,
      ...(roicStable != null ? { roicStable } : {}),
      basis: `${reason}（AV 不可评估，凭 ROIC 兜底）→ 竞争优势期约 ${CAP_MODERATE} 年。` };
  }
  const ratioForMoat = epvAvRatioOperating ?? epvAvRatio;
```

(即在原 `:30` `const ratioForMoat = ...` 之前插入 roicOnly 块,保留其后既有逻辑不动。)

- [ ] **Step 6: moatCap.check.ts 断言 roicOnly 定档**

在 `moatCap.check.ts` 追加:

```ts
// roicOnly(AV 无值)+ roicLongTermStrong + roicStable + 未下滑 → strong。
const roicOnlyStrong = deriveMoatCap({
  moat: { signal: "franchise", label: "", basis_note: "", moat_via_roic: true },
  epvAvRatio: undefined, epvAvRatioOperating: undefined,
  declined: false, suppressedFlags: false, roicStable: true, roicLongTermStrong: true,
});
assert.strictEqual(roicOnlyStrong.grade, "strong", "roicOnly + 稳 + 未下滑 → strong");
assert.strictEqual(roicOnlyStrong.capYears, CAP_STRONG);

// roicOnly 但盈利下滑 → moderate。
const roicOnlyMod = deriveMoatCap({
  moat: { signal: "franchise", label: "", basis_note: "", moat_via_roic: true },
  epvAvRatio: undefined, epvAvRatioOperating: undefined,
  declined: true, suppressedFlags: false, roicStable: true, roicLongTermStrong: true,
});
assert.strictEqual(roicOnlyMod.grade, "moderate", "roicOnly + 下滑 → moderate");
```

(确认 `moatCap.check.ts` 顶部已 import `CAP_STRONG`;缺则补。)

- [ ] **Step 7: 跑两个 check + tsc**

Run: `cd web && npx tsx src/lib/valuation/epvFloor.check.ts && npx tsx src/lib/valuation/moatCap.check.ts && npx tsc --noEmit`
Expected: 两个 `OK` + tsc 零错。

- [ ] **Step 8: 真数据复跑 —— MCO 兜底 + 反例不误伤**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts MCO MSCI ORLY W CVNA PTON`
Expected:
- **MCO:`moat.signal=franchise`,`via_roic=true`,`moat_cap.grade=strong`,`roicLongTermStrong=true`**。
- MSCI/ORLY:`moat.signal=not_assessable`,`capital_distorted=true`,`roicLongTermStrong=false`(死角标记就位,Task 4 才抑制 verdict)。
- W/CVNA/PTON:`roicLongTermStrong=false`;`moat.signal` 为 `value_destruction`(EPV 不可评估)或 `not_assessable`;**不得出现 `via_roic=true`**(不误判 franchise)。若某反例出现 `capital_distorted=true`,记录留待 Task 4 确认其 verdict 抑制是否合理(EPV 若为负应走 value_destruction 而非死角)。

- [ ] **Step 9: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/moat-intangibles
git add web/src/lib/valuation/types.ts web/src/lib/valuation/epvFloor.ts web/src/lib/valuation/epvFloor.check.ts web/src/lib/valuation/moatCap.ts web/src/lib/valuation/moatCap.check.ts
git commit -m "feat(valuation): 层② ROIC 兜底 franchise + 死角标记

AV 不可评估但 EPV 强 + roicLongTermStrong → franchise(via_roic),deriveMoatCap
凭 ROIC 定 strong/moderate;AV 与 ROIC 双不可评估 → capital_structure_distorted 标记。
救回 MCO;MSCI/ORLY 标记就位。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 层② — 死角 verdict 抑制 + 个股页 en/zh 说明

**目标**:资本结构扭曲(`capital_structure_distorted`)的票,verdict 抑制为 null(不判 above/太贵),个股页渲染"资本结构扭曲,护城河不可评估"说明;screener/榜单/投资人页因无快照行自动缺席(零改动)。

**Files:**
- Modify: `web/src/lib/valuation/deriveValuationVerdict.ts:136-146`(加 `capitalStructureDistorted` 入参 + 早返回)
- Modify: `web/src/lib/valuation/deriveValuationVerdict.check.ts`(断言抑制)
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx:411-420,622-624`(算 flag + 死角说明分支)
- Modify: `web/scripts/valuation-ingest.ts:166-170`(算 flag 传入)
- Modify: `web/src/lib/stocks/stockCopy.ts:79,123`(en/zh `moatDistorted`)
- Modify: `web/src/components/valuation/EarningsPowerFloorCard.tsx:48-57`(护城河明细死角文案,可选增强)

**Interfaces:**
- Consumes:`floor.moat_reading.capital_structure_distorted`(Task 3 产出)。
- Produces:`deriveValuationVerdict({..., capitalStructureDistorted})` 早返回 null;`stockCopy.moatDistorted[lang]` 说明文案。

- [ ] **Step 1: deriveValuationVerdict.check.ts 断言抑制**

在 `deriveValuationVerdict.check.ts` 追加(参照现有 `splitCoverageStale` 用例的构造):

```ts
// capital_structure_distorted → verdict 抑制为 null(仿 splitCoverageStale)。
const distortedVerdict = deriveValuationVerdict({
  floor: someAssessableFloor,       // 复用文件内已构造的可估值 floor 夹具
  strikeZone: someStrikeZone,
  oeDcf: someOeDcf,
  capitalStructureDistorted: true,
});
assert.strictEqual(distortedVerdict, null, "资本结构扭曲 → verdict 抑制为 null");
```

(用文件内已有的可估值夹具;若无现成,构造一个最小 `floor.kind==="floor"` + `strikeZone.epv` 的夹具,参照 `splitCoverageStale` 既有用例。)

- [ ] **Step 2: 跑确认失败**

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: FAIL —— `capitalStructureDistorted` 尚非入参,verdict 非 null。

- [ ] **Step 3: deriveValuationVerdict.ts 加入参 + 早返回**

在入参类型(`:143` `splitCoverageStale?` 之后)追加,并在早返回处(`:146` 之后)加一行:

```ts
  /** 资本结构被回购扭曲(深度负权益,AV 与 ROIC 双不可评估)→ 护城河不可评估,不判 above/太贵,整条抑制。
   *  语义同 splitCoverageStale,由调用方从 floor.moat_reading.capital_structure_distorted 传入。 */
  capitalStructureDistorted?: boolean;
```

```ts
  const { floor, strikeZone, oeDcf, reconciliation, splitCoverageStale, capitalStructureDistorted } = input;
  if (splitCoverageStale) return null;
  if (capitalStructureDistorted) return null; // 资本结构扭曲 → 无可信判定(护城河/成长价值不可评估,零增长底会假判太贵)
```

同步更新文件顶部护栏登记注释(`:4-9`)加一行说明 `capitalStructureDistorted`。

- [ ] **Step 4: 跑确认通过**

Run: `cd web && npx tsx src/lib/valuation/deriveValuationVerdict.check.ts`
Expected: OK。

- [ ] **Step 5: stockCopy.ts 加 en/zh 文案**

在 `stockCopy.ts` 的 zh 块(`splitPaused` 邻近,`:79`)与 en 块(`:123`)各加一键(去 AI 感,陈述式):

```ts
// zh 块:
moatDistorted: "该公司多年回购使股东权益转负,重置价值与护城河无法从资产端可靠评估,故此处不给出估值判定。",
// en 块:
moatDistorted: "Years of buybacks have pushed shareholders' equity negative, so reproduction value and the moat can't be judged from the asset side — no valuation verdict is shown here.",
```

- [ ] **Step 6: page.tsx 算 flag + 死角说明分支**

(a) 在 `page.tsx:411-414` 的 `splitCoverageStale` 计算之后加:

```ts
  const capitalStructureDistorted =
    valuationFloor?.kind === "floor" && valuationFloor.moat_reading.capital_structure_distorted === true;
```

(b) `page.tsx:417-420` 的 `deriveValuationVerdict({...})` 调用加入参 `capitalStructureDistorted`。

(c) `page.tsx:622-624` 现为 `splitCoverageStale ? <说明> : <EarningsPowerFloorCard>`。改为三分支(死角优先于卡片,与 split 并列):

```tsx
        {splitCoverageStale ? (
          <p className="...(照抄现有 splitPaused 那句的 className)">{copy.valuation.splitPaused}</p>
        ) : capitalStructureDistorted ? (
          <p className="...(同上 className)">{copy.valuation.moatDistorted}</p>
        ) : (
          <EarningsPowerFloorCard .../>
        )}
```

(实现时照抄现有 `splitPaused` 那一句的确切 className 与 `copy.valuation` 取值路径,保持一致。)

- [ ] **Step 7: valuation-ingest.ts 算 flag 传入**

`valuation-ingest.ts:166-170`,在 `splitCoverageStale` 之后、`deriveValuationVerdict` 调用之前加:

```ts
      const capitalStructureDistorted = floor.moat_reading.capital_structure_distorted === true;
      const v = deriveValuationVerdict({ floor, strikeZone, oeDcf, reconciliation, splitCoverageStale, capitalStructureDistorted });
```

(`v===null` 时既有 `:171-175` 已 `continue`/不入表 → screener/榜单/投资人页/徽章自动缺席,无需改下游。)

- [ ] **Step 8:(可选增强)护城河明细死角文案**

`EarningsPowerFloorCard.tsx:48-57` 的 `MOAT_SHORT` 对 `not_assessable` 已有短标签;死角与普通 not_assessable 共用即可,`moat_reading.basis_note`/`label`(Task 3 已写"capital structure distorted...")已带说明。**本 Step 可跳过**(卡片明细非死角主展示面,主展示已在 Step 6 page.tsx 那句)。若要精确化,可在 `MOAT_SHORT` 判 `moat_reading.capital_structure_distorted` 显示专用短标签——非必需。

- [ ] **Step 9: tsc + 真数据复跑**

Run: `cd web && npx tsc --noEmit && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts MSCI ORLY NFLX MA MCO`
Expected:
- **MSCI/ORLY:`verdict: null (suppressed)`**(不再 bucket=above)。
- NFLX/MA/MCO:`verdict` 有 bucket(franchise 已救,不被死角误伤)。

- [ ] **Step 10: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/moat-intangibles
git add web/src/lib/valuation/deriveValuationVerdict.ts web/src/lib/valuation/deriveValuationVerdict.check.ts web/src/app/\[lang\]/stocks/\[ticker\]/page.tsx web/scripts/valuation-ingest.ts web/src/lib/stocks/stockCopy.ts
git commit -m "feat(valuation): 层② 死角 verdict 抑制 + 个股页说明

capital_structure_distorted → deriveValuationVerdict 抑制为 null(仿 splitCoverageStale),
个股页渲染 en/zh 说明;死角票无快照行 → screener/榜单/投资人页自动缺席。
MSCI/ORLY 不再假判太贵。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 层③ 校准 — S_STRUCTURAL_GROWTH 门槛(已完成)

> **本 Task 由控制器 inline 完成并提交(`fb4e833`)**,记录于此供追溯 + 给 Task 6 提供门槛 provenance。

**背景(验证驱动的重设计)**:原计划的层③(在 `growthValue.ts` ROIIC 里纳入 R&D 无形投资)经真数据验证**不成立**:MA/SPGI 的成长非 R&D 驱动(R&D 极少),且 verdict 锚的是 OE-DCF 的 IV 而非 Greenwald GV。真根因在 `ownerEarningsDcf.ts`:g1 = min(gRaw 营收log回归, **gFund=ROIC×净再投资率**, cagr) 受 grade cap 封顶,而 gFund 对近零再投资的轻资产 franchise 结构性≈0 → 经 `Math.min` 把已证实增长盖成 0 → 护城河把 CAP 拉到 20 年却施加在零增长流上(MA/SPGI/NFLX 层①② 后仍判 above 的真机制)。

**已做**:`web/scripts/structural-growth-calibrate.ts`(只读,持仓并集 1910 票全宇宙),统计非金融 franchise 在各 s 门槛下 g1 的移动。provenance 落 `docs/superpowers/calibration/2026-07-17-structural-growth-threshold.md`。

**锁定结论**:门槛 `S_STRUCTURAL_GROWTH = 0.5`。依据:目标票 MA(s=0.59)/SPGI(0.60)/NFLX(0.69)/ADBE(1.00)全放行,提到 0.6 会误伤 MA → 0.5 是保住目标的刚性上界;顺周期 CAT(0.35)/KO(0.45)被挡;63 movers 中位 +4.7pp,仅 6 个 >10pp(INTU/PCTY/ROL/ENSG 真高增长 + ABNB/MGRC 封在既有 20% strong cap 内,列 Task 7 watch-list 复核 moat 分档)。

---

## Task 6: 层③ 实施 — 结构性 franchise 的 g1 不再被 gFund 封零

**目标**:非金融 franchise 且 `structural_confidence ≥ S_STRUCTURAL_GROWTH(0.5)` 时,把 `gFund`(=ROIC×净再投资率,对轻资产恒≈0)从 OE-DCF 的 g1 上限候选里剔除,改由已证实的 `gRaw`(营收 log 回归)+ `cagr` 决定 g1(仍受 grade cap 与 `declined` 闸约束)。金融股走 SGR 不涉及;顺周期股(低 s)保留 gFund。

**Files:**
- Modify: `web/src/lib/valuation/ownerEarningsDcf.ts`(常量 + g1 候选装配 `:294-315` 区)
- Modify: `web/src/lib/valuation/ownerEarningsDcf.check.ts`(断言)
- Modify: `web/scripts/probe-moat-intangibles.ts`(探针加打印 g1 + IV,供验收)

**Interfaces:**
- Consumes:`floor.structural_confidence`(已有)、`floor.moat_cap.grade`、`floor.is_financial`、`floor.sustainable_growth`、`historicalGrowthBaseRate`(已 import)。
- Produces:`S_STRUCTURAL_GROWTH` 常量;`g1` 对结构性 franchise 剔除 gFund。

- [ ] **Step 1: 加常量**

在 `ownerEarningsDcf.ts` 的 `GROWTH_CAP_NONE`(`:16`)之后追加:

```ts
export const S_STRUCTURAL_GROWTH = 0.5; // 结构性置信门槛:≥此值的非金融 franchise，其 g1 不再受 gFund(=ROIC×净再投资率)封零 —— 近零再投资复利股的成长靠定价权/网络效应而非砸钱。真数据校准(548 franchise，门槛 0.5 保住 MA/SPGI/NFLX/ADBE、挡住 CAT/KO)，provenance 见 docs/superpowers/calibration/2026-07-17-structural-growth-threshold.md。
```

- [ ] **Step 2: 写断言(ownerEarningsDcf.check.ts)**

先读 `ownerEarningsDcf.check.ts` 现有夹具构造方式(它如何造一个 `ValuationFloor` + `deriveOeDcf` 调用)。追加三个用例(用文件内既有夹具工厂;若无,构造最小 floor:`buffett_epv` 可估值、`moat_cap.grade` 可设、`sustainable_growth`/`structural_confidence`/`is_financial` 可设、几年 FY `years` 带 revenue/net_income 使 gRaw/cagr 为正):

```ts
// 结构性 franchise(s≥0.5)+ gFund≈0 + gRaw/cagr 为正 → g1 不被封零(> 0)。
const structFr = deriveOeDcf(floorWith({ grade: "strong", sustainable_growth: 0, structural_confidence: 0.6, is_financial: false }), yearsGrowing, DGS10, price);
assert.ok(structFr.assessable && structFr.growth_g1 != null && structFr.growth_g1 > 0, "结构性 franchise g1 不被 gFund 封零");

// 低 s(<0.5)franchise + gFund≈0 → 仍被 gFund 封零(g1 = 0)。
const lowS = deriveOeDcf(floorWith({ grade: "strong", sustainable_growth: 0, structural_confidence: 0.3, is_financial: false }), yearsGrowing, DGS10, price);
assert.strictEqual(lowS.growth_g1, 0, "低 s 仍受 gFund 封零(顺周期不计入峰值增长)");

// 金融 franchise(is_financial) → 不参与本修法,行为不变(gFund 通常 undefined,走 SGR)。
const finFr = deriveOeDcf(floorWith({ grade: "moderate", sustainable_growth: 0, structural_confidence: 0.9, is_financial: true }), yearsGrowing, DGS10, price);
// 断言金融路径未因本改动改变(g1 由 gRaw/financial cap 决定,与改前一致)——具体值照现有金融用例。
```

(以上 `floorWith`/`yearsGrowing`/`DGS10`/`price` 用文件内既有等价夹具;若命名不同照实调整,保持断言语义。)

- [ ] **Step 3: 跑确认失败**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts`
Expected: FAIL —— 结构性 franchise 用例现在 g1=0(gFund 仍在 Math.min 里)。

- [ ] **Step 4: 实现 g1 候选装配改动**

把 `ownerEarningsDcf.ts:310-315`(从 `const cagrFallback = ...` 到 `const g1 = ...`)替换为:

```ts
  const cagrFallback = cagr != null && cagr > 0 ? cagr : undefined;
  // 层③(增长率引擎修正):近零再投资的轻资产 franchise，gFund=ROIC×净再投资率 结构性≈0，经 Math.min
  // 把已证实的营收/盈利增长盖成 0(MA/SPGI 现价被误判远超内在价值的真机制)。非金融 franchise 且
  // 结构性置信 s≥S_STRUCTURAL_GROWTH 时，gFund 不再作 g1 上限 —— 改由已证实的 gRaw(营收 log 回归)+
  // cagr 决定，仍受 grade cap 与 declined 闸约束。金融股走 SGR 不涉及；顺周期股(低 s，如 CAT/KO)
  // 保留 gFund，不给峰值增长计入。门槛 provenance 见 docs/superpowers/calibration/2026-07-17-structural-growth-threshold.md。
  const structuralFranchise =
    (grade === "strong" || grade === "moderate") &&
    floor.is_financial !== true &&
    floor.structural_confidence != null &&
    floor.structural_confidence >= S_STRUCTURAL_GROWTH;
  const fundamentalCeilings = structuralFranchise ? [gRaw, cagrFallback] : [gRaw, gFund, cagrFallback];
  const candidates = fundamentalCeilings.filter(
    (n): n is number => n != null && Number.isFinite(n) && n >= 0,
  );
  // gRaw/gFund 皆缺 → candidates 仅剩 cagrFallback(退回今天行为,但用新 cap);全缺 → 0。
  const g1 = declined ? 0 : candidates.length ? clamp(Math.min(...candidates), 0, cap) : 0;
```

(即只把原 `candidates` 单行拆成 `structuralFranchise` 判定 + `fundamentalCeilings` 选择;`gRaw`/`gFund`/`grade`/`cap`/`cagr`/`declined` 均沿用上文既有声明,不重复定义。)

- [ ] **Step 5: 跑确认通过 + tsc**

Run: `cd web && npx tsx src/lib/valuation/ownerEarningsDcf.check.ts && npx tsc --noEmit`
Expected: OK + tsc 零错。

- [ ] **Step 6: 探针加 g1 + IV 打印**

在 `probe-moat-intangibles.ts` 的 verdict 打印之前,追加一行打印 OE-DCF 的 g1 与中枢 IV(便于验收):

```ts
    console.log(`oeDcf: g1=${n(oeDcf?.growth_g1, 3)} cagr_raw=${n(oeDcf?.cagr_raw, 3)} IV(neutral)=${n(oeDcf?.tiers?.neutral.per_share)}`);
```

(`oeDcf` 变量已在 verdict 上文算出;若探针里名字不同照实取。)

- [ ] **Step 7: 真数据验收**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts MA SPGI NFLX ADBE MSFT AAPL CAT KO`
Expected:
- **MA/SPGI/NFLX/ADBE:`oeDcf.g1 > 0`**(MA≈4.6% / SPGI≈7% / NFLX≈11.6% / ADBE≈10.3%),IV 抬升,`verdict.marginPct` 显著改善(MA 从 ≈−270% 大幅收窄)。
- **CAT/KO:`oeDcf.g1` 与改前一致**(CAT≈1.7% / KO≈3.4%,gFund 仍生效,峰值增长未计入)。
- MSFT/AAPL:g1 上升到 ≈13.5% / 4.3%(真实增长如实计入,封在 20% cap 内),不越界。

- [ ] **Step 8: 提交**

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/moat-intangibles
git add web/src/lib/valuation/ownerEarningsDcf.ts web/src/lib/valuation/ownerEarningsDcf.check.ts web/scripts/probe-moat-intangibles.ts
git commit -m "feat(valuation): 层③ 结构性 franchise 的 g1 不再被 gFund 封零

非金融 franchise 且 structural_confidence≥0.5 时,gFund(ROIC×净再投资率,轻资产恒≈0)
不再作 g1 上限,改由已证实 gRaw/cagr 决定(仍受 grade cap+declined 闸)。
MA/SPGI/NFLX 的成长终于计入 IV;CAT/KO 顺周期不动。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 全套回归 + tsc 终验

**目标**:跑全部 `.check.ts` + 13 票探针 AFTER,对齐验收表,确认无回退、无误伤、tsc 零错。

**Files:** 无改动(纯验证);若发现回归,回到对应 Task 修。

- [ ] **Step 1: 全套 check.ts**

Run: `cd web && for f in src/lib/valuation/*.check.ts; do echo "== $f =="; npx tsx "$f" || break; done`
Expected: 每个都打印 `OK`,无中断。

- [ ] **Step 2: tsc**

Run: `cd web && npx tsc --noEmit`
Expected: 零错(与改动相关)。

- [ ] **Step 3: 13 票探针 AFTER,对齐验收表**

Run: `cd web && npx tsx --tsconfig scripts/tsconfig.json scripts/probe-moat-intangibles.ts | tee scripts/.moat-probe-after.txt`
Expected(逐票):

| 组 | 票 | 期望 |
|---|---|---|
| 主路径救(层①) | NFLX, MA, SPGI, ADBE | `moat.signal=franchise`;verdict 有 bucket(非 null) |
| 兜底救(层②) | MCO | `moat.signal=franchise`,`via_roic=true`,`grade=strong` |
| 死角标注(层②) | MSCI, ORLY | `moat.signal=not_assessable`,`capital_distorted=true`,`verdict=null (suppressed)` |
| 成长计入(层③) | MA, SPGI, NFLX, ADBE | `oeDcf.g1 > 0`(gFund 不再封零),IV 抬升、marginPct 显著收窄 |
| 顺周期不动(层③护栏) | CAT, KO | `oeDcf.g1` 与 BEFORE 一致(gFund 仍生效,峰值增长未计入) |
| 对照不漂移 | MSFT, AAPL | `moat.signal=franchise`,`per_share(AV)` 与 BEFORE 一致;g1 如实计入真实增长、封在 20% cap 内 |
| 烂账反例 | W, CVNA, PTON | `via_roic=false`;`value_destruction`/`not_assessable`;不误判 franchise |
| 数据问题 | V | 记录 `per_share_unavailable` 现状(不阻塞;另开排查) |
| 层③ watch-list | ABNB, MGRC | 复核 moat 分档是否恰当(g1 抬到 20% cap,是 moat 定档问题非本改动;记录不阻塞) |

- [ ] **Step 4: BEFORE↔AFTER diff 复核**

Run: `cd web && diff scripts/.moat-probe-before.txt scripts/.moat-probe-after.txt || true`
逐行确认:变化落在目标票(NFLX/MA/SPGI/ADBE/MCO 转 franchise、MSCI/ORLY 转 suppressed、层③ franchise g1>0),顺周期(CAT/KO)与反例票无非预期漂移。

- [ ] **Step 5: 提交验收产物(可选)**

若要留追溯,把 AFTER 快照落 `docs/`:

```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/.claude/worktrees/moat-intangibles
git add web/scripts/.moat-probe-after.txt 2>/dev/null || true
git commit -m "test(valuation): 护城河地基修复 13 票 AFTER 验收对齐" --allow-empty
```

---

## 上线(合并后,需授权)

1. 网页开 PR:base `db-foundation` ← `plan/valuation-intangible-reproduction`。
2. 合并后授权跑 `cd web && npm run valuation:ingest` 重算快照(死角票不入表 → 生产 screener/榜单/投资人页自动清掉 MSCI/ORLY 假信号,主路径票带上 franchise/GV)。
3. 复验生产:`/stocks/NFLX` `/stocks/MCO` 出护城河/估值判定,`/stocks/MSCI` 显示"资本结构扭曲"说明。

## Self-Review

- **Spec coverage**:层①(Task 2)、层②兜底(Task 3)、层②死角+抑制+UI(Task 3+4)、层③(Task 5 校准 + Task 6 实施)、13+票验收(Task 1+7)、对照回归守护(Task 2 Step 5 + Task 7)、死角展示 en/zh(Task 4)—— 均有对应 Task。
- **层③ 重设计说明**:原条件层③(growthValue R&D 无形投资)经 Task 5 前身的真数据验证**不成立**(MA/SPGI 成长非 R&D 驱动,verdict 锚 OE-DCF IV 非 GV);真根因 = OE-DCF g1 被 `gFund=ROIC×再投资` 封零。已按 spec §3.4"层③不假设成立、验证后回到设计"重设计为 Task 5(校准)+ Task 6(g1 实施),门槛 0.5 有全宇宙 provenance,顺周期护栏(s<0.5)+ watch-list(ABNB/MGRC)守住不过度计入。spec §3.4/§9 需在 Task 7 后同步更新为此结论。
- **Placeholder scan**:无 TBD;Task 6 的 g1 改动、常量、断言、验收数值均具体。
- **Type consistency**:`buildMoatReading` 四参签名(Task 3)与 check、探针一致;`MoatReading.moat_via_roic`/`capital_structure_distorted`(Task 3)被 epvFloor/moatCap/deriveValuationVerdict/page/ingest 一致消费;`capitalStructureDistorted` 入参名三处一致;`S_STRUCTURAL_GROWTH`(Task 6)在 ownerEarningsDcf 定义并本地消费,探针/校准脚本各自内联同口径。
