# 数据正确性修复 — 设计文档

**日期**: 2026-07-04
**触发**: 用户发现 Scion(Michael Burry)投资人页把 PLTR 显示成"第一大持仓"——实为 Put 看空。
**审计**: 35-agent workflow 深度审计(8 子系统并行 → 对抗式 verify),确认 **18 CONFIRMED + 1 PLAUSIBLE**(另 8 条理论存在但真实数据不可达,已否)。全部 P0/P1 + 代表性 P2/P3 已由人工读实码独立复核。

## 背景与根因

站点是 13F 超投追踪 + 估值 + 宏观的财经内容站,正确性 = 可信度。审计发现三大簇缺陷:

1. **期权口径**: 数据层 `holdings.put_call` 存了(对),但**全下游把 put/call 当多头股票**——算进共识持有人数/most-bought-sold/投资人页 top-holding/组合市值/权重。后果最重的是 Scion:Palantir Put 显示成 66% 第一大重仓(信号完全反向)。
2. **估值假信号**: 陈旧价当现价、外股用美元 ADR 价配本币普通股股数、total_debt 重复计入重叠 XBRL 概念、margin 锚定与展示价值带不一致——都会给出错误的"低估/低于价值"绿灯。
3. **数据卫生**: `NONE`/$0 占位申报被当最新持仓(Makaira Partners 线上正显示 $0 组合)、格式化、日期 off-by-one 等。

## 设计决策(已与用户确认)

- **期权**: 聚合口径**剔除**期权(共识持有人数/most-bought-sold/投资人页 top-holding/组合市值/持仓数),只算普通股;但投资人自己的**持仓表仍显示**期权,清楚标 `PUT`/`CALL` + 名义价值注明。→ 跨股信号纯净,投资人页如实。
- **外股/ADR**: 做 ADR 比率 + 币种归一(得到真实估值)。**因工程量大、需逐名核 ADR ratio,单独拆一个 spec,不在本批**。
- **节奏**: 分阶段。Phase 1(P0 + 独立机械修)→ Phase 2(期权簇)→ Phase 3(估值小修);ADR 归一化 = 独立 Phase 4 / 另起 spec。

## Phase 1 — P0 + 独立机械修

各自隔离、可单独提交、低风险。

| # | Bug | 位置 | 修法 |
|---|---|---|---|
| P0 | `NONE`/空申报被当最新 | `scripts/ingest-13f.ts:220` | `parseInfoTable` 过滤 issuer=`NONE`/全零 cusip/value+shares 全 0 的行;过滤后 0 持仓的 filing **不得成为"最新"**(回退上一期真申报——在 filing 选择/组装层跳过空 filing);清已入库脏数据后重跑 ingest |
| P1 | most-sold 全清仓显 $0 | `scripts/lib/computeConsensus.ts:28` | `diff()` 的 exited 行 value 用**上季 `ph.value`**(可得)而非 0;`src/lib/aggregations.ts` + `src/lib/managers/assemble.ts` 同步(fallback 路径口径一致) |
| P1 | total_debt 双算重叠概念 | `src/lib/sec/normalize-facts.ts:282` | 定义优先级组,每组只取一个:`{current:[LongTermDebtAndFinanceLeaseObligationsCurrent, LongTermDebtCurrent], noncurrent:[…Noncurrent, LongTermDebtNoncurrent], short:[ShortTermBorrowings]}`,组内有合并租赁 tag 则优先、否则退纯 LongTermDebt |
| P3 | 45 天截止日当天误判 stale | `src/lib/freshness/derive.ts:62` | `<=` → `<`;`derive.check.ts` 补 `2026-05-15` 边界用例 |
| P3 | `$1000.0M` 不滚 `$1.00B` | `src/lib/format.ts:8` | 舍入后 M 值 ≥1000 滚到 B(B→T 同理) |
| P3 | companyShortName 剥 GROUP/HOLDINGS | `src/lib/aliases/resolve.ts:48` | 从 `CORP_SUFFIXES` 移除 `group/holdings/holding`,或仅当非唯一区分词才剥 |
| P3 | Screener `−0%` | `src/app/[lang]/stocks/screener/ScreenerTable.tsx:48` | 四舍五入到 0 但实际 >0 → 显示 `<1%`(不带负号) |
| P3 | WeightQoQ 箭头可与权重数字反向 | `src/components/common/qoqDirection.tsx:42` | 箭头/颜色改由**权重数字本身**(prior_weight vs weight)驱动,而非股数 `kind` |
| PLAUSIBLE | CUSIP→ticker 跳转信任脏 ticker | `src/app/[lang]/stocks/[ticker]/page.tsx:246` | 跳转前加 `isLikelyTicker` 闸(与 `resolve.ts:73`/`sitemap.ts:97` 一致) |

## Phase 2 — 期权口径簇(聚合剔除 + 表内标注)

- **`scripts/lib/computeConsensus.ts`**: `readAll` holdings 时读 `put_call`,构建 holder-count / stock_holders / moves / trend **前先剔除期权行**(根治点)。`diff()` 的 cusip 键碰撞在剔除期权后自然消失。
- **`src/lib/aggregations.ts`**(fallback): `computeMostHeld` / `computeNotableMoves` 同样剔除期权(需 ScanRow/HoldingChange 带 putCall)。
- **投资人页 `src/app/[lang]/investors/[slug]/page.tsx`**: `topHolding`(L331)、`top1`(L380)、`totalValue` 展示、`holdings.length`(L370)、QoQ(L350-352)全部基于**长仓 only**(过滤 `putCall`)计算。
- **`HoldingsTable` + `EntityName`**: 期权行**保留显示**,加 `PUT`/`CALL` 徽章 + 名义价值注明(不进上述汇总)。
- **收尾**: 重跑 consensus ingest 刷新 `consensus_holdings`/`consensus_stock_holders`/`consensus_moves`/`consensus_stock_trend` 四表。

## Phase 3 — 估值信号簇(小修)

- **陈旧价**: `src/lib/managers/priceRead.ts:16` `getLatestPrice` 加最大时龄上限(或在 `scripts/valuation-ingest.ts:106` 消费处判);超龄标 stale / 不喂 strike-zone。
- **margin 锚定 F14/F15**(延续未提交的 `valueFloor` 改动): 把画面展示的价值带对齐到 marginPct 同一锚(valueFloor);处理 `valueFloor≤0` 的空白 margin 绿标(`src/lib/valuation/deriveValuationVerdict.ts:147` + `src/app/[lang]/stocks/screener/ScreenerTable.tsx:67`)。
- **OE-DCF `anchored` 标志**: `src/lib/valuation/ownerEarningsDcf.ts:115` last-good DGS10 过旧时置 `anchored:false`。

## 不在本批(Out of Scope)

- **外股 ADR 归一化**(P1,`scripts/valuation-ingest.ts:99` 无外币护栏)→ 另起独立 spec。当前 BABA/ASML 等会被算错;短期若要止血,可在 ADR spec 落地前临时 gate 掉外股(留待该 spec 决定)。
- 已否的 8 条(formatUSD 负值/NaN、宏观 KPI 负值红箭头、`Math.max([])=-Infinity`、unit 启发式对现有数据不触发等)——不修。

## 验证方式(本项目无测试套件,solo dev)

- **静态**: `tsc` 当门(本机 google fonts 被墙,`next build` 必挂,不用它)。
- **纯函数自检**: 沿用 `*.check.ts` 模式(derive/normalize 等),新增边界用例。
- **数据层**: Phase 1 P0 与 Phase 2 改完后**重跑 ingest / consensus 脚本**,查 Scion 页 top-holding 不再是 Palantir、PLTR 个股页持有人不含 Burry、Makaira 页非 $0。
- **人工**: 关键页面(Scion、PLTR、consensus、screener)部署 preview 后真机看。

## 风险

- Phase 2 剔除期权会改变 `holder_count`,据记忆 holder_count 喂首页榜/投资人徽章/screener 闸,需确认三面口径一致(剔除后应更纯净,方向正确)。
- total_debt 优先级组改动会影响估值 value band 与杠杆红旗,需抽查几只已知高杠杆/含租赁的票对账。
