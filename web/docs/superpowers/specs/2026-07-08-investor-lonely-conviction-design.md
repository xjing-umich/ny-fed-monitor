# 投资人页读法层:独门重仓(Lonely Conviction)

> 设计文档 · 2026-07-08 · 分支 `feat/investor-lonely-conviction`(off `origin/db-foundation`)

## 背景与诊断

投资人详情页([investors/[slug]/page.tsx](../../../src/app/[lang]/investors/[slug]/page.tsx))经前几轮已干净,但头条 keyFacts([page.tsx:408](../../../src/app/[lang]/investors/[slug]/page.tsx:408))是**组合市值 / 持仓数 / 第一大持仓 / 第一大仓占比**——四个都是"这人有多大",没有一个是"这人有什么独到判断"。同一"体量 → 质量"的缺口,上一轮已在个股页补上,本轮搬到投资人页。

页面**已加载、却没用足**的信号:`holderCounts`([page.tsx:308](../../../src/app/[lang]/investors/[slug]/page.tsx:308),每只持仓被几家超投共持)只做了持仓表一列数字,没派生成"**独门重仓**"这一读法。

## 数据可得性(已核实)

`readHolderCounts`([consensusRead.ts:71-76](../../../src/lib/managers/consensusRead.ts:71))对 `consensus_holdings` 做 `.select("ticker,holder_count").in("ticker", upper)`,**没有 `.gte(CONSENSUS_MIN_HOLDERS)` 门**(该门只在 `readConsensusCount`/`readConsensusHeldTop`)。而 `consensus_holdings` 写入端不过滤([compute.ts:40](../../../src/lib/consensus/compute.ts:40) `holder_count = holders.size` 全量写),故 count=1(只此人持有)的独门票**既在表里、也能被 `readHolderCounts` 读到**。

→ 因此**不需要新读取器、不需要迁移、无部署 op**。本轮纯页面改动 + 一个纯函数,复用页面已加载的 `holderCounts`。

## 关键决策(已与用户确认)

| 决策点 | 选择 |
| --- | --- |
| 头条主角 | **逆势/独门持仓** |
| "独门"定义 | **孤独的重仓(双闸)**:少人持(共持数 ≤ 阈)**且**在该组合权重达阈 |
| 呈现 | **头条数字**(keyFacts 换一项)**+ 独立小节**(持仓表上方,列出这几只) |

## 组件

### A. 纯函数 `deriveLonelyConviction`

**新建** `web/src/lib/managers/lonelyConviction.ts`。

```ts
export type LonelyHolding = {
  issuer: string;
  ticker: string;
  weight: number;        // 组合权重(0–1 fraction),= value / totalValue
  holderCount: number;   // 被几家超投共持(含本人)
  value: number;
};

export function deriveLonelyConviction(input: {
  holdings: { cusip: string; issuer: string; value: number }[];
  cusipToTicker: Map<string, string>;
  holderCounts: Map<string, number>;   // ticker(大写) → 精确共持数(含 1)
  totalValue: number;    // 组合长仓合计市值(= longTotalValue),用于自算权重
}): LonelyHolding[];
```

阈值直接用模块常量,**不设可选参数**(单一调用方,YAGNI)。逻辑:遍历长仓 holdings → `ticker = cusipToTicker.get(cusip)`(无 → 跳);`count = holderCounts.get(ticker.toUpperCase())`;**权重自算** `weight = value / totalValue`(与 keyFacts 同源,绕开 `h.weight` 量纲不确定性);**双闸**:`count != null && count <= LONELY_MAX_HOLDERS` **且** `weight >= MIN_CONVICTION_WEIGHT`。命中者按 `weight` 降序、取 `LONELY_LIMIT`。共持数缺失(undefined)→ 保守跳过。`totalValue <= 0` → 返回 `[]`(降级)。

- 纯函数、零 IO → `.check.ts` 断言(见测试)。
- 常量 `LONELY_MAX_HOLDERS = 2`、`MIN_CONVICTION_WEIGHT = 0.03`、`LONELY_LIMIT = 6`,**导出**供页面引导句插值(阈值单一真相源,不硬编码进文案)。

### B. 头条数字(keyFacts:体量 → 质量)

**修改** `page.tsx` 的 `keyFacts`([page.tsx:408](../../../src/app/[lang]/investors/[slug]/page.tsx:408))。现四项末两项是"第一大持仓"(名)+"第一大仓占比"(%)。**直接用独门重仓替换掉最体量的那项"第一大仓占比"**(不合并、不制造挤字符串,每项仍是一个干净值),"第一大持仓"保持不动:

```
{ label: "独门重仓" / "Lonely bets", value: `${lonely.length} 只` / `${lonely.length}` }
```

仍是四项,末项从体量(占比)换成质量(独门数)。`lonely` 由 `deriveLonelyConviction(...)` 在页面算一次,同时喂 keyFact 与小节(单一真相源,N 永不漂移)。`lonely.length === 0` → keyFact 显 `0 只`(诚实:该人无独门重仓 = 偏共识跟随),小节不渲染。替换后原 `top1Pct`/`top1` 若无别处引用则一并删除,避免 unused。

### C. 独立小节 "独门重仓 / Lonely conviction"

**修改** `page.tsx`,在 `<HoldingsTable .../>`([page.tsx:506](../../../src/app/[lang]/investors/[slug]/page.tsx:506))**之前**插入一节(仅 `lonely.length > 0` 时渲染):

- 语义 `<h2>`,视觉沿用页内既有 eyebrow(`border-t` + `font-display text-[10px] uppercase tracking`)。
- 一句朴素引导(SSR 全文可爬),阈值由常量插值(不硬编码),zh:`以下持仓仅被 ≤{LONELY_MAX_HOLDERS} 家超投持有、且各占该组合 {pct}% 以上（截至 {period}）：`;en:`Held by ≤{LONELY_MAX_HOLDERS} tracked superinvestors, each ≥{pct}% of this portfolio (as of {period}):`(`pct = Math.round(MIN_CONVICTION_WEIGHT*100)`)。
- 每只一行/一 chip:`{issuer}（{ticker}） · {weight}% · 仅 {holderCount} 家持有` / `{issuer} ({ticker}) · {weight}% · held by {holderCount}`,链到 `stockPath(lang, ticker)`(强内链)。
- 视觉复用持仓表既有 token,不新造组件族。

## 全局约束(沿用硬规则)

- **长仓 only**:`holderCounts` 已长仓口径(compute 侧剔 putCall);`holdings` 入参用页面的 `longHoldings`。
- **每 locale 纯本语言**,禁中英混排;去 AI 腔(朴素、每句带数字/名词,无破折号抒情/对偶/三元/对冲词)。
- **数据 as-of**:小节引导句带共持数据 as-of(`latest.period`,13F 披露期)。
- **SSR 全文可爬**:头条数字与小节均可见服务端全文。
- **优雅降级**:`holderCounts` 空(无 env/出错)→ `deriveLonelyConviction` 返回 `[]` → 小节不渲染、keyFact 显 0,页面其余照常。
- **验收门**:`cd web && npx tsc --noEmit` = 0 + `lonelyConviction.check.ts` 断言 + 本地 `next dev` 目测 375/768/1280 + `npm run ai-check` 无新增。无测试套件(solo dev)。

## 受影响文件

**新建**
- `web/src/lib/managers/lonelyConviction.ts` — `deriveLonelyConviction` + 常量 + 类型
- `web/src/lib/managers/lonelyConviction.check.ts` — 断言脚本

**修改**
- `web/src/app/[lang]/investors/[slug]/page.tsx` — 算 `lonely`、keyFacts 末项替换为独门、插独门小节

## 非目标(本轮不做)

- 组合估值姿态(strikeCount 成头条)、集中度信念——另两个候选主角,今轮只做独门。
- 投资人**列表**页(只做详情页)。
- 相对全市场共识的 overweight 偏离(需额外基准,重)。
- 新读取器 / 迁移 / 快照(数据已现成,无需)。

## 测试(纯函数 `.check.ts`)

`deriveLonelyConviction` 断言覆盖:
- (a) 双闸交集:少人持(count ≤ 2)且够重(weight ≥ 3%)才入选;
- (b) 单闸不入选:count ≤ 2 但 weight < 3%(芝麻小仓)排除;count 大(≥3)但权重高也排除;
- (c) 共持数缺失(undefined)→ 保守跳过;
- (d) 按 weight 降序 + limit 截断;
- (e) 长仓口径由入参保证(页面传 longHoldings),函数不自行处理 putCall。

## 验收清单

- [ ] `cd web && npx tsc --noEmit` = 0;`npx tsx src/lib/managers/lonelyConviction.check.ts` OK
- [ ] 双闸正确:少人持 ∩ 够重;单闸不入选;undefined 跳过;weight 降序 + limit
- [ ] keyFacts:末两项合并为"第一大持仓 · X%",新增"独门重仓 N 只";N 与小节同源
- [ ] 小节:仅 `lonely.length>0` 渲染;chip 链对;引导句带 as-of;zh/en 无混排
- [ ] 优雅降级:holderCounts 空 → 小节不渲染、keyFact 显 0、页面不炸
- [ ] 本地三档目测;`npm run ai-check` 无新增;去 AI 腔人工审
