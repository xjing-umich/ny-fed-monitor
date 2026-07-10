# 个股页结论上第一屏 + 生意质量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 个股详情页把已算出的估值结论(verdict+安全边际)搬上 masthead 第一屏,并新增「生意质量」小节(当期四指标 + 多年趋势),全部复用页面已加载数据。

**Architecture:** 纯页面派生 + 两个纯函数(`valuationVerdictChip` / `deriveBusinessQuality`),复用 `handoffVerdict`(已算)与 `sec.latest/sec.annual`(已加载)。零新读取器、零迁移、零部署 op。

**Tech Stack:** Next 16 App Router / React 19 RSC / TypeScript / Tailwind v4 `--tt-*` 令牌 / 复用 `Sparkline`。

## Global Constraints

- **回复与文档正文中文**(代码/类名/命令/既定术语/路径除外)。
- **数据 as-of**:生意质量小节带基本面 as-of(`bq.asOf`),与 13F 披露期分开标(CLAUDE.md 硬规)。
- **quality_status = 可信度闸,非质量评级**:low/unresolved/missing/null → `reliable=false` → 指标加注脚,不据此说生意好坏。
- **估值哲学**:verdict 徽章是位置陈述(进入区/低于价值带/带内/高于价值),纯 OBSERVATION,无 BUY/SELL;红旗(reliable=false)的便宜档降级为 neutral tone(不标「已确认便宜」)。
- **去 AI 腔**:朴素、每句带数字/名词;禁破折号抒情/对偶/三元枚举/对冲词/装饰图标。
- **每 locale 纯本语言**,禁中英混排。
- **SSR 全文可爬**(RSC 默认);**优雅降级**:handoffVerdict/latestPrice/sec.latest 缺 → 「—」或整节不渲染,页面不炸。
- **验收门**:`cd web && npx tsc --noEmit` = 0;两 `.check.ts` OK;`npm run ai-check` 无新增;本地 `next dev` 目测(便宜股/贵股/无地板股各一)。无测试套件(solo dev)。

---

### Task 1: 纯函数 `valuationVerdictChip`(masthead 徽章映射)+ 断言

**Files:**
- Create: `web/src/lib/stocks/valuationVerdictChip.ts`
- Test: `web/src/lib/stocks/valuationVerdictChip.check.ts`

**Interfaces:**
- Consumes: `ValuationVerdict`(from `@/lib/valuation/deriveValuationVerdict`,字段 `bucket:"below"|"within"|"above"` / `inStrikeZone:boolean` / `reliable:boolean`);`Tone`(from `@/components/entity/types`,`"positive"|"warn"|"negative"|"neutral"`);`Lang`。
- Produces: `valuationVerdictChip(v, lang): { label: string; tone: Tone } | null`。供 Task 3 masthead。

- [ ] **Step 1: 写断言(先失败)** — Create `web/src/lib/stocks/valuationVerdictChip.check.ts`:

```ts
import { valuationVerdictChip } from "./valuationVerdictChip";
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exit(1); } }

function v(p: Partial<ValuationVerdict>): ValuationVerdict {
  return { bucket: "within", inStrikeZone: false, valueFloor: 10, marginPct: null, coverage: "full", reliable: true, ...p } as ValuationVerdict;
}

// null → null
assert(valuationVerdictChip(null, "zh") === null, "null → null");
// 进入区优先于 bucket, 可信 → positive
const strike = valuationVerdictChip(v({ inStrikeZone: true, bucket: "below" }), "en");
assert(strike?.label === "Strike zone" && strike?.tone === "positive", `strike zone positive, got ${JSON.stringify(strike)}`);
// below 可信 → positive
assert(valuationVerdictChip(v({ bucket: "below" }), "zh")?.tone === "positive", "below reliable → positive");
assert(valuationVerdictChip(v({ bucket: "below" }), "zh")?.label === "低于价值带", "below zh label");
// 便宜档但 reliable=false → neutral(不标已确认便宜)
assert(valuationVerdictChip(v({ bucket: "below", reliable: false }), "en")?.tone === "neutral", "below unreliable → neutral");
assert(valuationVerdictChip(v({ inStrikeZone: true, reliable: false }), "en")?.tone === "neutral", "strike unreliable → neutral");
// within → neutral, above → warn
assert(valuationVerdictChip(v({ bucket: "within" }), "en")?.tone === "neutral", "within → neutral");
const above = valuationVerdictChip(v({ bucket: "above" }), "zh");
assert(above?.label === "高于价值" && above?.tone === "warn", `above warn, got ${JSON.stringify(above)}`);
// zh/en 纯语言
assert(valuationVerdictChip(v({ bucket: "within" }), "en")?.label === "Within band", "within en label");

console.log("valuationVerdictChip.check OK");
```

- [ ] **Step 2: 跑, 确认失败** — `cd web && npx tsx src/lib/stocks/valuationVerdictChip.check.ts`(报模块不存在)。

- [ ] **Step 3: 写实现** — Create `web/src/lib/stocks/valuationVerdictChip.ts`:

```ts
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";
import type { Tone } from "@/components/entity/types";
import type { Lang } from "@/lib/nav";

// 标签复用 ValuationBadge 同款位置词(进入区/低于价值带/带内/高于价值)。纯位置陈述, 无荐买卖。
const COPY = {
  zh: { strike: "进入区", below: "低于价值带", within: "带内", above: "高于价值" },
  en: { strike: "Strike zone", below: "Below value", within: "Within band", above: "Above value" },
} as const;

/**
 * 估值 verdict → masthead 徽章 {label,tone}。null → 无徽章。
 * 便宜档(进入区/低于价值带)可信才 positive; 红旗(reliable=false)降 neutral(不标已确认便宜,
 * 与 ValuationBadge / screener strike_zone 信心闸同口径)。带内 neutral, 高于价值 warn。
 */
export function valuationVerdictChip(
  v: ValuationVerdict | null,
  lang: Lang,
): { label: string; tone: Tone } | null {
  if (v == null) return null;
  const t = COPY[lang];
  if (v.inStrikeZone || v.bucket === "below") {
    const label = v.inStrikeZone ? t.strike : t.below;
    return { label, tone: v.reliable ? "positive" : "neutral" };
  }
  if (v.bucket === "within") return { label: t.within, tone: "neutral" };
  return { label: t.above, tone: "warn" };
}
```

- [ ] **Step 4: 跑, 确认通过** — `cd web && npx tsx src/lib/stocks/valuationVerdictChip.check.ts` → `valuationVerdictChip.check OK`

- [ ] **Step 5: tsc** — `cd web && npx tsc --noEmit` → 0。

- [ ] **Step 6: 提交**
```bash
git add web/src/lib/stocks/valuationVerdictChip.ts web/src/lib/stocks/valuationVerdictChip.check.ts
git commit -m "feat(stocks): valuationVerdictChip 纯映射(档位→徽章, 红旗降neutral, 断言)"
```

---

### Task 2: 纯函数 `deriveBusinessQuality`(生意质量派生)+ 断言

**Files:**
- Create: `web/src/lib/stocks/businessQuality.ts`
- Test: `web/src/lib/stocks/businessQuality.check.ts`

**Interfaces:**
- Consumes: `SecLatestSummary`(from `@/lib/sec/read`,已导出;字段 `latest_revenue_yoy/latest_net_margin/latest_roe/latest_fcf_margin/quality_status/latest_10k_period_end/latest_10q_period_end/latest_filing_date`);annual 行子集 `{revenue,net_income,period_end}`。
- Produces: `deriveBusinessQuality(input): BusinessQuality | null`、类型 `BusinessQuality`。供 Task 3。

- [ ] **Step 1: 写断言(先失败)** — Create `web/src/lib/stocks/businessQuality.check.ts`:

```ts
import { deriveBusinessQuality } from "./businessQuality";
import type { SecLatestSummary } from "@/lib/sec/read";

function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exit(1); } }

function latest(p: Partial<SecLatestSummary>): SecLatestSummary {
  return {
    ticker: "X", company_name: "X", latest_10k_period_end: null, latest_10q_period_end: null,
    latest_filing_date: null, latest_revenue: null, latest_net_income: null, latest_fcf: null,
    latest_cash: null, latest_debt: null, latest_equity: null, latest_revenue_yoy: null,
    latest_net_margin: null, latest_roe: null, latest_fcf_margin: null, quality_status: "high", ...p,
  } as SecLatestSummary;
}
const annual = [
  { revenue: 100, net_income: 10, period_end: "2023-12-31" }, // 净利率 0.10
  { revenue: 120, net_income: 18, period_end: "2024-12-31" }, // 0.15
  { revenue: 0, net_income: 5, period_end: "2022-12-31" },    // revenue<=0 跳过
  { revenue: 90, net_income: null, period_end: "2021-12-31" },// net_income null: 入 revenueSeries, 不入 marginSeries
];

// (a) 指标透传 + (c) 序列升序/派生/跳过
const bq = deriveBusinessQuality({
  latest: latest({ latest_revenue_yoy: 0.2, latest_net_margin: 0.15, latest_roe: 0.25, latest_fcf_margin: 0.12, latest_10k_period_end: "2024-12-31" }),
  annual,
});
assert(bq !== null, "有数据 → 非 null");
assert(bq!.revenueYoy === 0.2 && bq!.netMargin === 0.15 && bq!.roe === 0.25 && bq!.fcfMargin === 0.12, "四指标透传");
// 升序: 2021(90) → 2023(100) → 2024(120); 2022 revenue=0 跳过
assert(JSON.stringify(bq!.revenueSeries) === JSON.stringify([90, 100, 120]), `revenueSeries 升序去0, got ${JSON.stringify(bq!.revenueSeries)}`);
// marginSeries: 2021 net_income null 跳过 → [0.10, 0.15]
assert(bq!.marginSeries.length === 2 && Math.abs(bq!.marginSeries[0] - 0.10) < 1e-9 && Math.abs(bq!.marginSeries[1] - 0.15) < 1e-9, `marginSeries, got ${JSON.stringify(bq!.marginSeries)}`);
// (d) asOf 三级兜底: 10k 优先
assert(bq!.asOf === "2024-12-31", `asOf 10k 优先, got ${bq!.asOf}`);
// (b) 可信度闸
assert(bq!.reliable === true, "quality_status=high → reliable");
assert(deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, quality_status: "low" }), annual })!.reliable === false, "low → 不可信");
assert(deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, quality_status: null }), annual })!.reliable === false, "null → 不可信");
// asOf 兜底次级: 无 10k → 10q → filing
assert(deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, latest_10q_period_end: "2025-03-31" }), annual })!.asOf === "2025-03-31", "10q 次级");
assert(deriveBusinessQuality({ latest: latest({ latest_revenue_yoy: 0.1, latest_filing_date: "2025-05-01" }), annual })!.asOf === "2025-05-01", "filing 末级");
// (e) latest=null → null
assert(deriveBusinessQuality({ latest: null, annual }) === null, "latest=null → null");
// (f) 四指标全 null 且序列 <2 → null(降级)
assert(deriveBusinessQuality({ latest: latest({}), annual: [{ revenue: 100, net_income: 10, period_end: "2024-12-31" }] }) === null, "全空+序列<2 → null");
// 四指标全 null 但序列>=2 → 仍渲染(趋势有料)
assert(deriveBusinessQuality({ latest: latest({}), annual }) !== null, "全空但序列>=2 → 非 null");

console.log("businessQuality.check OK");
```

- [ ] **Step 2: 跑, 确认失败** — `cd web && npx tsx src/lib/stocks/businessQuality.check.ts`

- [ ] **Step 3: 写实现** — Create `web/src/lib/stocks/businessQuality.ts`:

```ts
import type { SecLatestSummary } from "@/lib/sec/read";

export type BusinessQuality = {
  revenueYoy: number | null; // 分数
  netMargin: number | null;
  roe: number | null;
  fcfMargin: number | null;
  asOf: string;              // 基本面 as-of; 无则 ""
  reliable: boolean;         // quality_status ∉ {low, unresolved, missing, null}
  revenueSeries: number[];   // 营收, 升序(最早→最新)
  marginSeries: number[];    // 净利率 = net_income/revenue, 升序
};

const LOW_QUALITY = new Set(["low", "unresolved", "missing"]);

/**
 * 从已加载的 sec.latest + sec.annual 派生生意质量读数。纯函数、零 IO。
 * quality_status 仅作可信度闸(reliable), 不作质量评级。
 * latest=null, 或四指标全 null 且趋势序列<2 → 返回 null(整节不渲染)。
 */
export function deriveBusinessQuality(input: {
  latest: SecLatestSummary | null;
  annual: { revenue: number | null; net_income: number | null; period_end: string | null }[];
}): BusinessQuality | null {
  const { latest, annual } = input;
  if (latest == null) return null;

  const asc = [...annual]
    .filter((r) => r.period_end != null)
    .sort((a, b) => (a.period_end as string).localeCompare(b.period_end as string));
  const revenueSeries: number[] = [];
  const marginSeries: number[] = [];
  for (const r of asc) {
    if (r.revenue != null && r.revenue > 0) {
      revenueSeries.push(r.revenue);
      if (r.net_income != null) marginSeries.push(r.net_income / r.revenue);
    }
  }

  const revenueYoy = latest.latest_revenue_yoy;
  const netMargin = latest.latest_net_margin;
  const roe = latest.latest_roe;
  const fcfMargin = latest.latest_fcf_margin;
  const noMetrics = revenueYoy == null && netMargin == null && roe == null && fcfMargin == null;
  if (noMetrics && revenueSeries.length < 2) return null;

  const asOf = latest.latest_10k_period_end ?? latest.latest_10q_period_end ?? latest.latest_filing_date ?? "";
  const qs = latest.quality_status;
  const reliable = !(qs == null || LOW_QUALITY.has(qs));

  return { revenueYoy, netMargin, roe, fcfMargin, asOf, reliable, revenueSeries, marginSeries };
}
```

- [ ] **Step 4: 跑, 确认通过** — `cd web && npx tsx src/lib/stocks/businessQuality.check.ts` → `businessQuality.check OK`

- [ ] **Step 5: tsc** — `cd web && npx tsc --noEmit` → 0。

- [ ] **Step 6: 提交**
```bash
git add web/src/lib/stocks/businessQuality.ts web/src/lib/stocks/businessQuality.check.ts
git commit -m "feat(stocks): deriveBusinessQuality 纯函数(四指标+多年序列+可信度闸, 断言)"
```

---

### Task 3: 个股页整合(masthead verdict+keyFacts + 生意质量小节)

**Files:**
- Modify: `web/src/app/[lang]/stocks/[ticker]/page.tsx`

**Interfaces:**
- Consumes: Task 1 `valuationVerdictChip`、Task 2 `deriveBusinessQuality`;页面已有 `handoffVerdict` / `latestPrice` / `n` / `totalValue` / `sec` / `lang`;既有 `fmtMarginPct`(`@/lib/format`)、`fmtPriceFact`(`@/lib/managers/priceRead`)、`formatUSD`、`Sparkline`(`@/components/common/Sparkline`)。
- Produces: 无(终端页面)。

- [ ] **Step 1: import** — 顶部 import 区新增:
```ts
import { valuationVerdictChip } from "@/lib/stocks/valuationVerdictChip";
import { deriveBusinessQuality } from "@/lib/stocks/businessQuality";
import { fmtPriceFact } from "@/lib/managers/priceRead";
import { fmtMarginPct } from "@/lib/format";
import { Sparkline } from "@/components/common/Sparkline";
```
> 校验:`fmtMarginPct`/`formatUSD` 若已 import 则不重复;`Sparkline` 若 HolderTrend 间接引入但本文件未直接 import 则需新增。tsc 会抓重复/缺失。

- [ ] **Step 2: 算 bq(在 `sec` 取得之后, return 之前, 约 page.tsx:364 附近)**
```ts
  // 生意质量(复用已加载 sec.latest/sec.annual, 零新查询)。null → 整节不渲染。
  const bq = deriveBusinessQuality({ latest: sec.latest, annual: sec.annual });
```

- [ ] **Step 3: masthead 传 verdict + keyFacts** — 改 `EntityPage`([page.tsx:474-481](../../../src/app/[lang]/stocks/[ticker]/page.tsx:474)):把 `keyFacts={[]}` 替换、并加 `verdict`:
```tsx
      <EntityPage
        lang={lang}
        title={issuer}
        subtitle={subtitle}
        disclaimer={disclaimer}
        verdict={valuationVerdictChip(handoffVerdict, lang) ?? undefined}
        keyFacts={[
          { label: lang === "zh" ? "现价" : "Price", value: fmtPriceFact(latestPrice) },
          { label: lang === "zh" ? "安全边际" : "Margin of safety", value: handoffVerdict?.marginPct != null ? fmtMarginPct(handoffVerdict.marginPct) : "—" },
          { label: lang === "zh" ? "持有人数" : "Holders", value: String(n) },
          { label: lang === "zh" ? "合计市值" : "Value held", value: formatUSD(totalValue) },
        ]}
        sources={[{ name: "SEC EDGAR 13F", asOf: latestPeriod, filed: latestFiledAt, status: filingFreshness(latestPeriod || null, new Date()) }]}
        footerCta={<NewsletterCTA lang={lang} source="stock" />}
      >
```
> 其余 props(sources/footerCta)保持不变;`disclaimer` 保留。

- [ ] **Step 4: 插生意质量小节** — 在「支柱① 估值结论」注释([page.tsx:490](../../../src/app/[lang]/stocks/[ticker]/page.tsx:490))**之前**插入(即紧接 ExternalFinanceLinks section 之后):
```tsx
          {bq && (
            <section aria-label={lang === "zh" ? "生意质量" : "Business quality"}>
              <h2 className="border-t border-[var(--tt-border)] pt-4 pb-3 font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
                {lang === "zh" ? "生意质量" : "Business quality"}
              </h2>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                {[
                  { k: lang === "zh" ? "营收增速" : "Revenue growth", v: bq.revenueYoy, sign: true },
                  { k: lang === "zh" ? "净利率" : "Net margin", v: bq.netMargin, sign: false },
                  { k: "ROE", v: bq.roe, sign: false },
                  { k: lang === "zh" ? "FCF 利润率" : "FCF margin", v: bq.fcfMargin, sign: false },
                ].map((m) => (
                  <div key={m.k}>
                    <dt className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">{m.k}</dt>
                    <dd className="tnum mt-1 font-mono text-lg text-[var(--tt-text)]">
                      {m.v == null ? "—" : `${m.sign && m.v > 0 ? "+" : ""}${(m.v * 100).toFixed(1)}%`}
                    </dd>
                  </div>
                ))}
              </dl>
              {bq.asOf && (
                <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
                  {lang === "zh" ? `基本面截至 ${bq.asOf}` : `Fundamentals as of ${bq.asOf}`}
                </p>
              )}
              {(bq.revenueSeries.length >= 2 || bq.marginSeries.length >= 2) && (
                <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3">
                  {bq.revenueSeries.length >= 2 && (
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-[var(--tt-muted)]">
                        {lang === "zh"
                          ? `营收 ${formatUSD(bq.revenueSeries[0])} → ${formatUSD(bq.revenueSeries[bq.revenueSeries.length - 1])} · 近 ${bq.revenueSeries.length} 年`
                          : `Revenue ${formatUSD(bq.revenueSeries[0])} → ${formatUSD(bq.revenueSeries[bq.revenueSeries.length - 1])} · ${bq.revenueSeries.length}y`}
                      </span>
                      <Sparkline series={bq.revenueSeries} color="var(--tt-muted)" />
                    </div>
                  )}
                  {bq.marginSeries.length >= 2 && (
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-[11px] text-[var(--tt-muted)]">
                        {lang === "zh"
                          ? `净利率 ${(bq.marginSeries[0] * 100).toFixed(0)}% → ${(bq.marginSeries[bq.marginSeries.length - 1] * 100).toFixed(0)}%`
                          : `Net margin ${(bq.marginSeries[0] * 100).toFixed(0)}% → ${(bq.marginSeries[bq.marginSeries.length - 1] * 100).toFixed(0)}%`}
                      </span>
                      <Sparkline series={bq.marginSeries} color="var(--tt-muted)" />
                    </div>
                  )}
                </div>
              )}
              {!bq.reliable && (
                <p className="mt-3 text-xs text-[var(--tt-muted)]">
                  {lang === "zh" ? "基本面数据不完整，仅供参考。" : "Fundamentals data incomplete — read with care."}
                </p>
              )}
            </section>
          )}
```

- [ ] **Step 4b: 单位校验(preview 前置提醒, 写进报告)** — `latest_net_margin/roe/fcf_margin/revenue_yoy` 假定为**分数**(×100 得 %)。实现按分数写;控制方 preview 时用一只真股(如 AAPL)核对 net_margin 显示是否合理(如 ~25%),若发现库里已是百分数(如 25 而非 0.25)则回报,改去掉 ×100。tsc 不校验此语义。

- [ ] **Step 5: tsc** — `cd web && npx tsc --noEmit` → 0(确认无重复 import、无未用变量)。

- [ ] **Step 6: ai-check** — `cd web && npm run ai-check` → 无新增违规。

- [ ] **Step 7: 提交**
```bash
git add "web/src/app/[lang]/stocks/[ticker]/page.tsx"
git commit -m "feat(stocks): 结论上第一屏(masthead verdict+keyFacts)+生意质量小节(四指标+多年趋势)"
```

---

## Self-Review(写完计划回看)

- **Spec coverage**:A1→Task1;A2→Task3 Step3;B1→Task2;B2→Task3 Step4。全覆盖。
- **Placeholder scan**:无 TBD;每步含真实代码/命令/期望。
- **Type consistency**:`valuationVerdictChip(v,lang)→{label,tone}|null` Task1 定义、Task3 `?? undefined` 适配 EntityPage 可选 prop;`deriveBusinessQuality(input)→BusinessQuality|null` 字段(revenueYoy/netMargin/roe/fcfMargin/asOf/reliable/revenueSeries/marginSeries)Task2 定义、Task3 逐一消费一致;`Sparkline({series,color})`、`fmtPriceFact(latestPrice)`、`fmtMarginPct(number)`、`KeyFact{label,value}` 均与既有签名一致。
- **降级路径**:handoffVerdict=null→无徽章+安全边际「—」;latestPrice=null→现价「—」;bq=null→无小节。三处独立,页面不炸。
- **口径**:verdict 徽章与页底 handoff 同源 `handoffVerdict`;安全边际数字与徽章 tone 同源(reliable 闸)。
- **数据单位风险**:已在 Step 4b 显式标注 preview 核验(百分比×100 假设)。
