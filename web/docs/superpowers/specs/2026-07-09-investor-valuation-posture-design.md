# 投资人页读法层:估值姿态升为头条(Valuation Posture)

> 设计文档 · 2026-07-09 · 分支 `feat/investor-valuation-posture`(off `origin/db-foundation`)

## 背景与诊断

本站的差异化是「13F × 估值 × 宏观」三合一。投资人详情页([investors/[slug]/page.tsx](../../../src/app/[lang]/investors/[slug]/page.tsx))已把估值**加载进来**却没**摆到台面**:

- `verdicts = readValuationVerdicts(holdingTickers)`([page.tsx:308](../../../src/app/[lang]/investors/[slug]/page.tsx:308))每只持仓的估值判断(bucket / inStrikeZone / marginPct / reliable)已就绪。
- 持仓表每行已有 ValuationBadge(便宜/高信念),但那是**逐行**信号,不是**组合级读法**。
- `strikeCount`(现价落在击球区的持仓数)已算([page.tsx:315](../../../src/app/[lang]/investors/[slug]/page.tsx:315)),但**只喂页底 DiscoveryHandoff**([page.tsx:550](../../../src/app/[lang]/investors/[slug]/page.tsx:550))——埋在最下面当去 screener 的出口,没进头条读法。

缺口:投资人页的头条 keyFacts 四项(组合市值 / 持仓数 / 第一大持仓 / 独门重仓)与两个读法小节里,**没有一处回答「这个基金现在持有多少便宜货」**——而这正是价值投资读者最想要、dataroma 等纯 13F 站给不了的融合读法。

## 数据可得性(已核实)

- `readValuationVerdicts`([valuationSnapshot.ts:41](../../../src/lib/valuation/valuationSnapshot.ts:41))批量读估值快照,已优雅降级(无 env / 表未迁移 / 出错 → 空 Map,页面照常),且读层已过 `isImplausibleBand` 滤脏行。
- 详情页**已调用**它(line 308),`verdicts` 现成。→ **纯页面派生 + 一个纯函数,零新读取器、零迁移、零部署 op**(与独门重仓同一打法)。
- `SnapshotVerdict` 字段:`bucket: "below"|"within"|"above"`、`inStrikeZone`、`marginPct: number|null`(分数,`Math.round(marginPct*100)` 得 %,口径同 [StrikeLeadersCard.tsx:55](../../../src/components/home/StrikeLeadersCard.tsx:55))、`reliable`、`priceDate`。

## 关键决策(已与用户确认)

| 决策点 | 选择 |
| --- | --- |
| 头条主角 | **估值姿态**(现价 vs 保守价值带) |
| 呈现 | **头条数字**(keyFact 第 4 项换成击球区)**+ 紧凑读法小节**(持仓表上方,列出便宜持仓) |
| keyFact 取舍 | **换不加**(四列硬布局容不下第 5 项);「独门重仓」从 keyFact 移出,**计数搬进独门小节自己的 h2**(页面信息零损失) |
| 信心口径 | **只认 `reliable=true`**(与 screener strike_zone 视图同闸),现 line 315 的 strikeCount 未加此闸,顺手 DRY 补齐 |

## 组件

### A. 纯函数 `deriveValuationPosture`

**新建** `web/src/lib/managers/valuationPosture.ts`。

```ts
import type { SnapshotVerdict } from "@/lib/valuation/valuationSnapshot";
import type { VerdictBucket } from "@/lib/valuation/deriveValuationVerdict";

export type CheapHolding = {
  issuer: string;
  ticker: string;
  marginPct: number | null; // 安全边际(分数); 展示 Math.round(*100)%
  inStrikeZone: boolean;
  bucket: VerdictBucket;
};

export type ValuationPosture = {
  covered: number;      // 有可信估值(reliable)的长仓持仓数(做分母, 诚实)
  strikeCount: number;  // inStrikeZone && reliable
  belowCount: number;   // bucket==="below" && reliable
  cheap: CheapHolding[]; // 便宜(inStrikeZone || below)持仓, marginPct 降序(null 垫底)
  asOf: string;         // 参与计数的行里最大 priceDate(估值 as-of); 无则 ""
};

export const POSTURE_LIMIT = 6;

export function deriveValuationPosture(input: {
  holdings: { cusip: string; issuer: string }[];
  cusipToTicker: Map<string, string>;
  verdicts: Map<string, SnapshotVerdict>;
}): ValuationPosture;
```

逻辑:遍历 holdings → `ticker = cusipToTicker.get(cusip)`(无 → 跳);`v = verdicts.get(ticker.toUpperCase())`;**`v == null || !v.reliable` → 跳**(信心闸);`covered++`;`v.inStrikeZone → strikeCount++`;`v.bucket==="below" → belowCount++`;**便宜判据** `v.inStrikeZone || v.bucket==="below"` → push 到 `cheap`(记 `marginPct/inStrikeZone/bucket`,`asOf` 取 max `priceDate`)。`cheap` 按 `marginPct` 降序、`null` 垫底(不截断,截断挪展示层,与 lonelyConviction 同修正)。空输入 / 无命中 → 各计数 0、`cheap: []`、`asOf: ""`。

- 纯函数、零 IO → `.check.ts` 断言。常量 `POSTURE_LIMIT = 6` 导出供展示层截断。

### B. 头条数字(keyFacts 第 4 项:独门重仓 → 击球区)

**修改** `page.tsx` 的 `keyFacts`([page.tsx:412](../../../src/app/[lang]/investors/[slug]/page.tsx:412))。现第 4 项是「独门重仓 N 只」。换成:

```
{ label: lang==="zh"?"击球区":"Strike zone", value: String(posture.strikeCount) }
```

- 固定 label(击球区/Strike zone,本站签名术语),value = `posture.strikeCount`(整数;0 也诚实显 0)。
- 「独门重仓」计数不丢:搬进独门小节 h2(见 D)。keyFacts 仍四项。

### C. 紧凑读法小节 "估值姿态 / Valuation posture"

**修改** `page.tsx`,在**独门重仓小节之前**([page.tsx:510](../../../src/app/[lang]/investors/[slug]/page.tsx:510) 那个 `{lonely.length>0 && …}` 之前)插入一节(仅 `posture.cheap.length > 0` 时渲染):

- 语义 `<h2>`,视觉沿用独门小节同款 eyebrow(`border-t` + `font-display text-[10px] uppercase tracking-[0.12em] text-[var(--tt-faint)]`)。
- 朴素引导句(SSR 全文可爬,带**估值 as-of**=`posture.asOf`,与 13F 披露期 `latest.period` 分开标),句构造器按 strikeCount 是否 >0 拼接:
  - zh:`这只基金 ${covered} 只可估值美股持仓中,有 ${cheap.length} 只现价低于保守价值带` + `${strikeCount>0 ? `(其中 ${strikeCount} 只落在击球区)` : ""}` + `(估值截至 ${asOf}):`
  - en:`Of ${covered} valued US positions, ${cheap.length} trade below a conservative value band` + `${strikeCount>0 ? ` (${strikeCount} in the strike zone)` : ""}` + ` (as of ${asOf}):`
  - `asOf===""` 时省去「(估值截至 …)」段。
- chip 行(`flex flex-wrap gap-2`,复用独门小节同款 chip 样式),每只 `cheap.slice(0, POSTURE_LIMIT)`:
  - `{cleanIssuer(issuer)}` + `{marginPct != null ? `${Math.round(marginPct*100)}% 安全边际` : ""}` + `{inStrikeZone ? "击球区" : "低于价值带"}`(en: `margin` / `strike zone` / `below band`),`·` 分隔,marginPct=null 省该段。
  - 链到 `stockPath(lang, ticker)`(强内链)。

### D. 独门小节 h2 补计数(承接 B 的信息迁移)

**修改** `page.tsx` 独门小节 h2([page.tsx:513](../../../src/app/[lang]/investors/[slug]/page.tsx:513)):文本 `独门重仓` → `独门重仓 · ${lonely.length} 只` / `Lonely conviction · ${lonely.length}`。`aria-label` 保持不变。这样从 keyFacts 移出独门计数后,页面零信息损失。

### E. 页底 DiscoveryHandoff 改喂共享 strikeCount

**修改** `page.tsx` line 315 的 ad-hoc `strikeCount` reduce 块 → 删除,改由 `deriveValuationPosture(...)` 一次算出;line 550 `investorHandoffFor(posture.strikeCount, …)`。三处(keyFact / 小节 / 页底)共用一份 reliable-gated 计数,N 永不漂移。`investorHandoffFor` 签名/文案不变。

## 全局约束(沿用硬规则)

- **长仓 only**:`holdings` 入参用页面 `longHoldings`;`verdicts` 已长仓口径(键来自 longHoldings 的 ticker)。
- **每 locale 纯本语言**,禁中英混排;去 AI 腔(朴素、每句带数字/名词,无破折号抒情/对偶/三元/对冲词)。
- **数据 as-of**:小节引导句带估值 as-of(`posture.asOf`=价格日),与 13F 披露期分开(CLAUDE.md 数据新鲜度硬规)。
- **SSR 全文可爬**:头条数字与小节均服务端全文可见。
- **优雅降级**:`verdicts` 空(无 env / 表未迁移 / 出错)→ `deriveValuationPosture` 各计数 0、`cheap: []` → 小节不渲染、keyFact 显 `0`、页面其余照常。
- **信心闸**:只认 `reliable=true`(与 screener strike_zone / below 视图同口径)。
- **验收门**:`cd web && npx tsc --noEmit` = 0 + `valuationPosture.check.ts` 断言 + 本地 `next dev` 目测 375/桌面 + `npm run ai-check` 无新增。无测试套件(solo dev)。

## 受影响文件

**新建**
- `web/src/lib/managers/valuationPosture.ts` — `deriveValuationPosture` + 类型 + `POSTURE_LIMIT`
- `web/src/lib/managers/valuationPosture.check.ts` — 断言脚本

**修改**
- `web/src/app/[lang]/investors/[slug]/page.tsx` — 算 `posture`(替换 line 315 块)、keyFacts 第 4 项换击球区、插估值姿态小节、独门 h2 补计数、handoff 改喂 posture.strikeCount

## 非目标(本轮不做)

- 投资人**列表**页注入估值信号(需 per-manager 聚合 = 数据层改动,另开)。
- 相对全市场/同侪的估值偏离基准(重)。
- 改 `readValuationVerdicts` / 估值引擎 / screener(只读现成快照)。
- 独门重仓功能的其它改动(仅 h2 补计数一处)。

## 测试(纯函数 `.check.ts`)

`deriveValuationPosture` 断言覆盖:
- (a) 信心闸:`reliable=false` 的行不计入任何计数、不进 cheap;
- (b) 计数正确:strikeCount(inStrikeZone)、belowCount(bucket below)、covered(有可信估值数)分别对;
- (c) cheap 判据 = inStrikeZone ∪ below;`within`/`above` 不进 cheap;
- (d) cheap 按 marginPct 降序、null 垫底、**不截断**(返回全部,截断在展示层);
- (e) asOf = 参与行最大 priceDate;
- (f) 空输入 / verdicts 空 → 全 0 + `cheap:[]` + `asOf:""`(降级)。

## 验收清单

- [ ] `cd web && npx tsc --noEmit` = 0;`npx tsx src/lib/managers/valuationPosture.check.ts` OK
- [ ] 信心闸:reliable=false 不计;strike/below/covered 计数对;cheap=strike∪below、降序、不截断;asOf 对;空→降级
- [ ] keyFacts:第 4 项为「击球区 N」;独门计数已搬入独门 h2(`独门重仓 · N 只`);仍四项
- [ ] 小节:仅 `posture.cheap.length>0` 渲染;chip 链对、marginPct 格式与全站一致;引导句带估值 as-of;zh/en 无混排
- [ ] 页底 handoff 用 posture.strikeCount;三处计数同源
- [ ] 优雅降级:verdicts 空 → 小节不渲染、keyFact 显 0、页面不炸
- [ ] 本地 375/桌面目测;`npm run ai-check` 无新增;去 AI 腔人工审
