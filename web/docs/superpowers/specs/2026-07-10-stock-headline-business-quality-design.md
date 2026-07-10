# 个股页读法层:结论上第一屏 + 生意质量(Headline + Business Quality)

> 设计文档 · 2026-07-10 · 分支 `feat/stock-headline-business-quality`(off `origin/db-foundation`)

## 背景与诊断

个股详情页([stocks/[ticker]/page.tsx](../../../src/app/[lang]/stocks/[ticker]/page.tsx))读法已丰富(估值卡/价值带、信号相交句、持有人趋势、共同持仓),但两处「已加载却没用足」:

1. **结论没上第一屏**。masthead `keyFacts={[]}` 空([page.tsx:479](../../../src/app/[lang]/stocks/[ticker]/page.tsx:479))、`verdict` 没传;`handoffVerdict` 已算全(`bucket/marginPct/inStrikeZone/coverage/reliable`)却只取了 `.bucket` 一个字段([page.tsx:522](../../../src/app/[lang]/stocks/[ticker]/page.tsx:522))喂给页底 handoff。**精确安全边际 `marginPct` 从没印成数字**。对照 investor 页第一屏就亮 verdict+keyFacts([investors/[slug]/page.tsx:414-421](../../../src/app/[lang]/investors/[slug]/page.tsx:414))。
2. **基本面质量层整个被丢弃**。`getSecCompanyData(ticker)`([page.tsx:364](../../../src/app/[lang]/stocks/[ticker]/page.tsx:364))取回 `sec.latest`(营收增速/净利率/ROE/FCF 利润率/quality_status)+ `sec.annual`(多年 FY),页面只用 `sec.annual` 喂估值引擎([page.tsx:368](../../../src/app/[lang]/stocks/[ticker]/page.tsx:368)),其余全扔。用户看得到「便宜/贵」,看不到支撑它的生意轨迹。

均为**零新数据源**——纯页面派生 + 纯函数,复用页面已加载数据。

## 关键校正(设计前置)

`quality_status`(来自 ingest 的 `data_quality`,取值 low/unresolved/missing/high 等,[sec/ingest.ts](../../../src/lib/sec/ingest.ts))是**基本面数据完整度/可信度**,**不是**「这门生意好不好」。真正的生意质量信号是 `latest_revenue_yoy / net_margin / roe / fcf_margin` 这些**指标本身**。故 `quality_status` 只作**可信度闸**(低则加注脚或抑制),**绝不标成质量评级**。

## 数据可得性(已核实)

- `handoffVerdict: ValuationVerdict`([deriveValuationVerdict.ts:17](../../../src/lib/valuation/deriveValuationVerdict.ts:17))字段:`bucket:"below"|"within"|"above"` / `inStrikeZone` / `marginPct:number|null`(vs `epv.valueFloor` 保守底,仅 below/strike 有意义)/ `reliable`。`kind!=floor`/红旗 → `handoffVerdict=null`。
- `latestPrice`([page.tsx:374](../../../src/app/[lang]/stocks/[ticker]/page.tsx:374))仅在 `valuationFloor.kind==="floor"` 时取,含 `price/priceDate`;否则 null。
- `n`(持有人数)/`totalValue`(13F 合计持有市值)/`holders` 页面已备。
- `sec.latest: SecLatestSummary`([sec/read.ts:3](../../../src/lib/sec/read.ts:3)):`latest_revenue_yoy/latest_net_margin/latest_roe/latest_fcf_margin`(均分数或 null)、`quality_status`、`latest_10k_period_end/latest_10q_period_end/latest_filing_date`(as-of)。`sec.latest` 可为 null。
- `sec.annual`(FY 行,`period_end` 降序):含 `revenue/net_income/operating_margin/fiscal_year`。营收序列 = revenue;净利率序列 = net_income/revenue。
- `ValuationBadge` 的 COPY([ValuationBadge.tsx:14](../../../src/components/valuation/ValuationBadge.tsx:14)):进入区/低于价值带/带内/高于价值 / Strike zone/Below value/Within band/Above value。
- `fmtMarginPct(pct)`([format.ts:16](../../../src/lib/format.ts:16))→ `−N%`(≤0 显 `<1%`)。
- `Sparkline`([components/common/Sparkline.tsx](../../../src/components/common/Sparkline.tsx))通用件,`HolderTrend` 已复用;趋势线直接用它。
- `EntityPage` props:`verdict?: {label; tone}`、`keyFacts: KeyFact[]`([EntityPage.tsx:23-24](../../../src/components/entity/EntityPage.tsx:23))。masthead 已支持 VerdictChip + KeyFacts,只是个股页没传。

## 关键决策(已与用户确认)

| 决策点 | 选择 |
| --- | --- |
| 本轮范围 | Stock 详情页「结论上第一屏 + 生意质量」(零部署纯页面) |
| 生意质量趋势 | **加趋势版**:当期四指标 + `sec.annual` 多年营收/净利率 sparkline |
| quality_status | **可信度闸**(低/缺 → 注脚或抑制),不当质量评级 |
| masthead verdict | `handoffVerdict.bucket` → ValuationBadge 档位标签;便宜档 green / 带内 neutral / 高于价值 warn;null → 不显 |

## 组件

### A. masthead 头条化(verdict 徽章 + keyFacts)

**修改** `page.tsx` 的 `EntityPage` 调用([page.tsx:474-481](../../../src/app/[lang]/stocks/[ticker]/page.tsx:474))。

**A1. verdict 徽章** —— 新建纯函数 `web/src/lib/stocks/valuationVerdictChip.ts`:
```ts
import type { ValuationVerdict } from "@/lib/valuation/deriveValuationVerdict";
import type { Tone } from "@/components/entity/types";
import type { Lang } from "@/lib/nav";
export function valuationVerdictChip(
  v: ValuationVerdict | null, lang: Lang,
): { label: string; tone: Tone } | null;
```
逻辑:`v==null` → null。label 复用 ValuationBadge 同款 COPY:`v.inStrikeZone` → 进入区/Strike zone;`bucket==="below"` → 低于价值带/Below value;`within` → 带内/Within band;`above` → 高于价值/Above value。tone:进入区/低于价值带 → `positive`;带内 → `neutral`;高于价值 → `warn`。守估值哲学:纯 OBSERVATION,无 BUY/SELL(标签均为位置陈述)。`.check.ts` 断言四档 + null。
- `EntityPage` 传 `verdict={valuationVerdictChip(handoffVerdict, lang)}`(prop 可选,null 时 masthead 无徽章)。

**A2. keyFacts 四项**([page.tsx:479](../../../src/app/[lang]/stocks/[ticker]/page.tsx:479) `keyFacts={[]}` → 实值):
```
现价 · 安全边际 · 持有人数 · 合计市值
```
- **现价**:`latestPrice ? $price（priceDate）: "—"`。
- **安全边际**:仅**可信便宜档**(`reliable && (inStrikeZone || bucket==="below")`)且 `marginPct!=null` 显 `fmtMarginPct(marginPct)`,否则「—」(终审 M1:红旗 below 股徽章已降 neutral 拒绝背书便宜,安全边际数字须同闸 reliable,否则印精确边际=对红旗估值背书,与全站信心闸不一致)(带内/高于价值/无地板 → 「—」,诚实:非便宜即无安全边际)。**preview 定案**:初版只判 `marginPct!=null`,但高于价值股 marginPct 非 null(负值)、`fmtMarginPct` 夹成「<1%」会被误读成有微薄边际;改按 verdict 便宜档才显,与徽章 tone 同源。
- **持有人数**:`String(n)`。
- **合计市值**:`formatUSD(totalValue)`(13F 永远有,兜底)。
- 缺值一律「—」不炸;无地板股(薄数据/金融/多股权)现价+安全边际显「—」,估值卡自陈原因。

### B. 生意质量小节(sec.latest + sec.annual,零新查询)

**B1. 纯函数** `web/src/lib/stocks/businessQuality.ts`:
```ts
import type { SecLatestSummary } from "@/lib/sec/read"; // 若未导出则 spec 内联最小字段类型
export type BusinessQuality = {
  revenueYoy: number | null;   // 分数
  netMargin: number | null;
  roe: number | null;
  fcfMargin: number | null;
  asOf: string;                // latest_10k_period_end ?? latest_10q_period_end ?? latest_filing_date ?? ""
  reliable: boolean;           // quality_status ∉ {low, unresolved, missing, null}
  revenueSeries: number[];     // sec.annual 营收, 升序(最早→最新), 供 sparkline
  marginSeries: number[];      // 净利率 = net_income/revenue, 升序
};
export function deriveBusinessQuality(input: {
  latest: {/* revenue_yoy/net_margin/roe/fcf_margin/quality_status/period ends */} | null;
  annual: { revenue: number|null; net_income: number|null; period_end: string|null }[];
}): BusinessQuality | null;
```
逻辑:`latest==null` → null。四指标从 latest 取(缺 → null)。`asOf` 三级兜底。`reliable = !(qs==null||["low","unresolved","missing"].includes(qs))`。序列:annual 按 period_end 升序,`revenueSeries` = revenue(过滤 null),`marginSeries` = net_income/revenue(revenue>0 才算)。**四指标全 null 且序列 <2 → 返回 null**(整节不渲染,降级)。纯函数 → `.check.ts` 断言(指标透传/可信度闸/序列升序与派生/asOf 兜底/全空→null)。

**B2. 渲染**([page.tsx](../../../src/app/[lang]/stocks/[ticker]/page.tsx),在「估值·地基层」卡**之前**——价值投资顺序:先懂生意→再估值):
- 语义 `<h2>`「生意质量 / Business quality」,视觉沿用页内既有 eyebrow。
- 四指标 tile:营收增速 / 净利率 / ROE / FCF 利润率(百分比,营收增速带正负号;null → 「—」)。带**基本面 as-of**(`bq.asOf`,与 13F 披露期分开标)。
- 趋势(仅序列 ≥2):营收 `Sparkline` + 净利率 `Sparkline`,各带一句端点文字(`营收 $X → $Y · 近 N 年` / `净利率 A% → B%`),`aria-hidden` sparkline,文字承载绝对值(同 HolderTrend 无障碍口径)。
- **可信度闸**:`bq.reliable===false` → 指标照显 + 一行注脚「基本面数据不完整，仅供参考 / Fundamentals data incomplete — read with care」。
- `bq===null`(sec.latest 空或全空)→ 整节不渲染。

## 全局约束(沿用硬规则)

- **数据 as-of**:生意质量小节带基本面 as-of(`bq.asOf`),与 13F 披露期分开标;安全边际/现价隐含估值快照口径不变(CLAUDE.md 硬规)。
- **每 locale 纯本语言**,禁中英混排;去 AI 腔(朴素、每句带数字/名词,无破折号抒情/对偶/三元/对冲词/装饰图标)。
- **SSR 全文可爬**:masthead 数字与生意质量小节均服务端全文可见。
- **优雅降级**:`handoffVerdict=null` → 无徽章、安全边际「—」;`latestPrice=null` → 现价「—」;`sec.latest=null` → 无生意质量节;各自不炸。
- **估值哲学**:纯 OBSERVATION,verdict 徽章是位置陈述非荐买卖;`quality_status` 不作质量评级。
- **验收门**:`cd web && npx tsc --noEmit` = 0 + 两个 `.check.ts` 断言 + 本地 `next dev` 目测 375/桌面(含无地板股/薄数据股降级)+ `npm run ai-check` 无新增。无测试套件(solo dev)。

## 受影响文件

**新建**
- `web/src/lib/stocks/valuationVerdictChip.ts` + `.check.ts` — bucket→徽章纯映射
- `web/src/lib/stocks/businessQuality.ts` + `.check.ts` — 生意质量派生纯函数

**修改**
- `web/src/app/[lang]/stocks/[ticker]/page.tsx` — masthead 传 verdict+keyFacts、插生意质量小节(估值卡之前)、算 `bq`

## 非目标(本轮不做)

- Stocks 列表页注入估值(另一方向,排队)。
- Investor 列表页 per-manager 聚合(需数据层,排队)。
- 死代码 `buildConsensusSentence`([consensusSummary.ts](../../../src/lib/stocks/consensusSummary.ts))清理(单开 task chip)。
- 相对全市场估值排位/百分位(需新排位计算)。
- 持有人 conviction 序列徽章(需新数据面)。
- 改估值引擎 / SEC ingest / 任何读取器(只读现成)。

## 测试(纯函数 `.check.ts`)

`valuationVerdictChip`:四档标签+tone 对;`inStrikeZone` 优先于 bucket;null → null;zh/en 标签纯语言。
`deriveBusinessQuality`:(a) 四指标透传+缺→null;(b) 可信度闸 reliable 对(low/unresolved/missing/null→false,high→true);(c) 序列升序 + 净利率=net_income/revenue、revenue≤0 跳过;(d) asOf 三级兜底;(e) latest=null→整体 null;(f) 四指标全 null 且序列<2 → null(降级)。

## 验收清单

- [ ] `tsc`=0;两 `.check.ts` OK
- [ ] masthead:verdict 徽章按档位+tone;keyFacts 四项(现价/安全边际/持有人数/合计市值),缺值「—」不炸
- [ ] 生意质量:四指标+双趋势 sparkline;带基本面 as-of(与 13F 分标);reliable=false 注脚;bq=null 不渲染
- [ ] 无地板股/薄数据股:masthead 现价+安全边际「—」、生意质量按数据有无降级,页面不炸
- [ ] 本地 375/桌面目测(便宜股/贵股/无地板股各一);`ai-check` 无新增;去 AI 腔人工审;zh/en 无混排
