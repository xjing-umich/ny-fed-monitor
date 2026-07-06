# 个股页 Advance:信号相交 + 持有人趋势上台面 + 共同持仓快照

> 设计文档 · 2026-07-06 · 分支 `feat/stock-signal-crossover`(off `origin/db-foundation` @113b060)

## 背景与诊断

个股页([stocks/[ticker]/page.tsx](../../../src/app/[lang]/stocks/[ticker]/page.tsx))经上一轮去噪后已经干净,但**平**——它如实陈列数据块(外链 / 估值条 / 持有人表 / 出口链 / 折叠佐证),却没有把块之间的信号缝成一个"读法"。用户反馈:"不够 advance"。

本轮补的是**综合与关系**这一层,三件事,全部只读库内已有数据、不引入新外部数据源:

1. **信号相交**:把"聪明钱动作(moves)"和"估值位置(verdict)"两个孤岛,在持有人表头缝成一句**纯事实并置**的可见读法。
2. **持有人趋势上台面**:把已算好、却被折叠埋没的 `trendSeries` 提成一条 inline sparkline。
3. **共同持仓**:个股页底新增一行"持有 X 的这些人还共同重仓 Y、Z…",由**新建的 `consensus_coownership` 快照**驱动。

前置 code review(2026-07-06)结论:个股页两条数据路径(快照 fast-path + fallback 扫描)的期权剔除**已一致且干净**,估值卡 gauge 数学、marginPct、价格 as-of 均已验证安全。因此本轮在可信数据上加料,落地风险低。

## 关键决策(已与用户确认)

| 决策点 | 选择 |
| --- | --- |
| 信号相交句立场 | **纯事实并置**——三段客观事实用 `·` 并列,不写"但是"、不解读张力、不下判断 |
| 共持落点/形态 | **仅个股页**,底部一行共识链,Top-6 chip,带共持人数 |
| 共持载荷 | **快照表** `consensus_coownership`(在 `computeConsensus` 里复用已在内存的 `holderScan` 算出;运行期零 fan-out) |
| 投资人页读法层 | **不做**(下一轮) |

## 全局约束(每个任务隐含遵守)

- **长仓 only**:任何持仓聚合(含共持)必须跳过 `putCall` 行。`holderScan[].holdings[].putCall` 已带标记;过滤谓词统一为 `!h.putCall`。这是全站 #139 后的统一口径,共持不得破例。
- **每 locale 纯本语言**:zh / en 各自成句,禁中英混排(品牌锁形与 strike-zone 既定术语除外)。
- **数据 as-of**:估值段沿用 `handoffVerdict` / `ValueSpine` 既有的 as-of;sparkline 与共持不引入新外部数据,只读库,无需新增 as-of 标注,但趋势/共持须能追溯到 `computed_at`。
- **SSR 全文可爬**:信号相交句、共持链均为服务端渲染的可见全文(替代现在 `sr-only` 的 GEO 句);零 JS 折叠继续用原生 `<details>`。
- **去 AI 腔**(硬验收):无破折号抒情、无对偶、无三元枚举、无对冲词、无 SaaS 样板;每句带具体数字/名词。
- **issuerFreq 与 holders 同步**(review 发现②):`page.tsx:331` 的 `issuerFreq` 派生 `issuer`、`holders[0]` 派生 `topHolder`,二者靠 `holders.length===0 → notFound` 兜底。本轮任何重读 holders 的改动必须保持 `issuerFreq` 与 `holders` 同步填充,否则 `[0][0]` 会在渲染期抛错。
- **验收门**:`cd web && npx tsc --noEmit` = 0 + 本地 `next dev` 目测 375 / 768 / 1280 三档 + grep 断言关键串存在。无测试套件(solo dev)。

## 已知可接受漂移(review 发现③)

fallback trend 走 `d.filings` 不限条数、快照 builder 限 `limit(8)`。二者最终都 `.slice(-8)`,但极老周期计数在极端情形下可能微差。**本轮不修**,记为已知可接受漂移(仅影响无快照的本地/回退路径的老周期,生产走快照)。

---

## 特性 A:信号相交句(持有人表头)

### 落点
`HoldersTable`(`page.tsx`)现有 meta 行(`t.meta(...)` + `QuarterMovesPill`)正下方。现在那里有一条 `sr-only` 的 `buildConsensusSentence` 句([page.tsx:180](../../../src/app/[lang]/stocks/[ticker]/page.tsx))——**本轮把它升级为可见的信号相交句**,人和爬虫都读到。

### 数据(全部现成)
- `moves = { opened, added, trimmed, exited }`——已长仓 only。
- `holders.length`、`totalValue`——已长仓 only。
- `handoffVerdict`(`below` / `within` / `above` / `null`)——来自 `deriveValuationVerdict`,坏数据被健壮性闸置 `null`。**需从 page 传进 `HoldersTable`**(现在只传到 `DiscoveryHandoff`)。

### 文案规则(纯事实并置)
三段,用 ` · ` 并列;每段一个客观事实,不加连接词、不加判断:

```
{n} 位超级投资者持有 · 本季 {opened} 家新建、{trimmed>0? "X 家减仓" }、{exited} 家清仓 · {估值段}
```

- **动作段**:只列非零的动作(opened/added/trimmed/exited)。全为 0(无 prior)→ 省略动作段。
- **估值段**:
  - `above` → zh「现价高于保守价值带」/ en「price above the conservative value band」
  - `within` → 「现价落在保守价值带内」/「price within the conservative value band」
  - `below` → 「现价低于保守价值带」/「price below the conservative value band」
  - `null`(缺价/不可估值/坏数据被闸)→ **省略估值段**,只留前两段。
- 冲突不解释:`added>0` 且 `above` 就如实并排,读者自己连点。
- 句尾附 as-of:沿用 `buildConsensusSentence` 的 `(as of {period})` 惯例,或估值段自带的价格 as-of。

### 实现方式
扩展 [consensusSummary.ts](../../../src/lib/stocks/consensusSummary.ts) 的 `buildConsensusSentence`,新增 `verdict?: "below"|"within"|"above"` 入参,在句尾拼估值段;或新建 `buildSignalCrossover(...)`。**倾向后者**(职责单一,`buildConsensusSentence` 保持 GEO 语义纯净),由 `HoldersTable` 渲染为可见 `<p>`。删除原 `sr-only` 那句(内容被可见句覆盖,避免重复 DOM)。

---

## 特性 B:持有人趋势 sparkline 上台面

### 落点
同 `HoldersTable` meta 区。`trendSeries`(已算好:快照 `readStockTrend` 或 fallback,[page.tsx:284](../../../src/app/[lang]/stocks/[ticker]/page.tsx))从底部 `FoldedSection`(现 [page.tsx:504](../../../src/app/[lang]/stocks/[ticker]/page.tsx))**提上来**。

### 形态
一条极简 inline sparkline(近 8 季持有人数),配一句「持有人数:{first} → {last}(近 {len} 季)」/「Holders: {first} → {last} (last {len} quarters)」。

- 复用 [HolderTrend.tsx](../../../src/components/entity/HolderTrend.tsx),新增紧凑 `inline` 变体(或 `variant="inline"`),**不引入图表库**(纯 SVG polyline 或已有实现)。
- `trendSeries.length < 2` → 不渲染(现有阈值一致)。
- **删除**底部「持有人趋势」`FoldedSection`(内容已上台面,避免重复 DOM 与 SEO 重复)。

---

## 特性 C:共同持仓快照

### C1. 数据库表
新建 migration `supabase/migrations/20260706_create_consensus_coownership.sql`,仿 `20260620_create_consensus_stock_holders.sql` 的注释与回退风格:

```sql
-- 共同持仓快照(ticker-keyed,每 (ticker, co_ticker) 一行 = 同时持有两票的机构数)。
-- 目的: 个股页"持有 X 的这些人还共同重仓 Y"一行,零运行期 fan-out。
-- 写入: scripts/lib/computeConsensus.ts(npm run consensus,复用内存中的 holderScan)。
-- 读取: src/lib/managers/consensusRead.ts readCoOwnership(ticker)。
-- 回退: 表缺失/未填充 → 该节不渲染(优雅降级,非破坏,可随时部署)。
create table if not exists consensus_coownership (
  ticker text not null,             -- 目标票
  co_ticker text not null,          -- 共持票
  co_issuer text,                   -- 共持票 issuer 名(展示用)
  shared_holders int not null default 0,   -- 同时持有两票的机构数
  co_total_value bigint not null default 0, -- 这些共持机构在 co_ticker 上的合计市值(并列破平用)
  computed_at timestamptz not null default now(),
  primary key (ticker, co_ticker)
);
create index if not exists consensus_coownership_ticker_idx
  on consensus_coownership (ticker, shared_holders desc, co_total_value desc);
```

### C2. 计算(compute.ts + computeConsensus.ts)
新增纯函数 `computeCoOwnership(holderScan, cmap): CoOwnershipRow[]`(在 [compute.ts](../../../src/lib/consensus/compute.ts)):

- 对每位持有人,取其**长仓** ticker 集合 `S`(`holdings.filter(h => !h.putCall)` 经 `keyOf(cusip, cmap)` 归一化到 ticker,去重)。
- 对每个有序对 `(a, b), a≠b, a∈S, b∈S`,累加 `coCount[a][b] += 1`,并累加 `coValue[a][b] += (b 在该持有人处的 value)`。
- 对每个 `a`,输出按 `shared_holders desc, co_total_value desc` 排序、**取 Top-K(K=8,读侧再截 6,留缓冲)** 的行。
- 复杂度 O(Σ holdings²),约几百万次,构建期一次性,可接受。

在 [computeConsensus.ts](../../../scripts/lib/computeConsensus.ts) `computeAndStoreConsensus` 内:调用 `computeCoOwnership(holderScan, cmap)` → 仿 `consensus_stock_holders` 的写法 `delete().neq + upsert(onConflict: "ticker,co_ticker")`,**表缺失时 `console.warn` 跳过**(与 stock_holders/trend 一致的优雅降级),返回计数并入 `computeAndStoreConsensus` 的返回对象。

### C3. 读取器(consensusRead.ts)
新增 `readCoOwnership(ticker: string, limit = 6): CoOwnershipApp[]`(在 [consensusRead.ts](../../../src/lib/managers/consensusRead.ts)),仿 `readStockHolders`:
- `.from("consensus_coownership").select("co_ticker,co_issuer,shared_holders,co_total_value").eq("ticker", ticker.toUpperCase()).order("shared_holders",{ascending:false}).order("co_total_value",{ascending:false}).limit(limit)`。
- 无 env / 表缺失 / 空 → 返回 `[]`(优雅降级,不阻断页面)。
- **无 fallback 即时计算**(与快照架构一致;本地无库时该节不渲染,可接受)。

### C4. 渲染(page.tsx)
在 `DiscoveryHandoff`([page.tsx:497](../../../src/app/[lang]/stocks/[ticker]/page.tsx))**上方**新增一节:

```
持有 {issuer}({ticker})的这些人还共同重仓 →  [BAC 5 人] [KO 4 人] [AXP 4 人] …
```
- 每个 chip:`co_issuer`(或 co_ticker)+ `shared_holders`,链到 `stockPath(lang, co_ticker)`(强内链)。
- 排除自身(compute 侧已 `a≠b`);读侧再兜一层 `co_ticker !== ticker`。
- `readCoOwnership(ticker)` 返回空 → 整节不渲染。
- 文案 zh/en 各自成句;chip 样式复用 exited-chip 的 `rounded-md border` 视觉族。

### C5. 部署 runbook(写入 migration 头注 + 交付说明)
1. Supabase SQL Editor 执行 `20260706_create_consensus_coownership.sql`。
2. 跑 `npm run consensus` 填充(与其余快照同一次摄取重算)。
3. 未跑前:读取器返回空 → 个股页共持节静默不渲染,**不报错、不破坏**,可先合码后填数。

---

## 受影响文件

**新建**
- `supabase/migrations/20260706_create_consensus_coownership.sql`
- (可选)`src/lib/stocks/signalCrossover.ts`——`buildSignalCrossover(...)`

**修改**
- `src/lib/consensus/compute.ts`——加 `computeCoOwnership` + `CoOwnershipRow` 类型
- `scripts/lib/computeConsensus.ts`——调用 + upsert `consensus_coownership`,返回计数
- `src/lib/managers/consensusRead.ts`——加 `readCoOwnership` + `CoOwnershipApp` 类型
- `src/app/[lang]/stocks/[ticker]/page.tsx`——传 `handoffVerdict` 进 `HoldersTable`;渲染信号相交句(替 sr-only)、inline sparkline;删底部趋势 fold;`readCoOwnership` + 共持节
- `src/lib/stocks/consensusSummary.ts`——若走扩展 `buildConsensusSentence` 路线
- `src/components/entity/HolderTrend.tsx`——加 inline 紧凑变体

## 非目标(本轮不做)

- 投资人页读法层(strikeCount/集中度/逆势独门持仓成头条)——下一轮。
- `conviction.ts` 期权 shares 泄漏——已起独立后台任务(task_555a0c8b)。
- 共持关系图可视化、估值历史轨迹。
- 共持的本地即时回退(无库时该节不渲染即可)。

## 验收清单

- [ ] `cd web && npx tsc --noEmit` = 0
- [ ] 信号相交句:动作全零省动作段、verdict=null 省估值段、冲突如实并置、可见且 SSR 全文
- [ ] sparkline 上台面、底部趋势 fold 已删、`<2` 季不渲染
- [ ] 共持:`computeCoOwnership` 跳 putCall、排除自身、Top-6、空则整节不渲染、chip 内链正确
- [ ] `issuerFreq` 与 `holders` 保持同步(重读 holders 后 `[0][0]` 不抛)
- [ ] 本地 375/768/1280 三档目测;去 AI 腔硬验收;zh/en 无混排
- [ ] migration 头注含部署 runbook
