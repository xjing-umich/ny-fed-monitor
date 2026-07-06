// Task 10: 期权(put/call)必须被剔除出四张共识快照——不是长仓,别算持有人/买卖动向。
import { computeConsensus, computeStockHolders } from "./compute";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const cmap = new Map([["PLTRCUSIP", { ticker: "PLTR", name: "Palantir" }]]);

// (a) 一个 put 持有人 + 一个正股持有人 → holder_count=1,total_value 排除 put 名义值。
const scan = [
  { slug: "scion", holdings: [{ cusip: "PLTRCUSIP", issuer: "Palantir", value: 9e8, putCall: "Put" }], changes: [] },
  { slug: "longonly", holdings: [{ cusip: "PLTRCUSIP", issuer: "Palantir", value: 1e8 }], changes: [] },
] as any;
const { holdings } = computeConsensus(scan, cmap);
const pltr = holdings.find((h) => h.ticker === "PLTR");
assert(pltr?.holder_count === 1, `PLTR只有1个长仓持有人(排除put), got ${pltr?.holder_count}`);
assert(pltr?.total_value === 1e8, `total_value排除put名义值, got ${pltr?.total_value}`);

// (b) 某经理对某票唯一的 change 是新建 put → 该票不应出现在 mostBought(moves 里没有 bought 方向的该票行,或人数为 0)。
const scan2 = [
  { slug: "scion", holdings: [], changes: [{ cusip: "PLTRCUSIP", issuer: "Palantir", kind: "new", value: 9e8, putCall: "Put" }] },
] as any;
const { moves } = computeConsensus(scan2, cmap);
const pltrBought = moves.find((m) => m.ticker === "PLTR" && m.direction === "bought");
assert(!pltrBought, `新建put不应计入mostBought, got ${JSON.stringify(pltrBought)}`);

// (c) computeStockHolders 的"清仓行"loop:某经理对 ticker Z 当前无持仓,changes 里唯一相关项是
// 一个已平仓的 put(kind='exited', putCall='Put')——期权到期/平仓不是长仓清仓,不应生成 phantom
// 清仓持有人行(gap from Task 10:该 loop 此前漏了 putCall 过滤)。
const zCmap = new Map([
  ["ZCUSIP", { ticker: "Z", name: "ZCorp" }],
  ["WCUSIP", { ticker: "W", name: "WCorp" }],
]);
const stockHolderScan = [
  {
    cik: "1",
    slug: "mgr1",
    person: "Manager One",
    period: "2026Q1",
    filedAt: "2026-05-01",
    holdings: [],
    changes: [
      { cusip: "ZCUSIP", issuer: "ZCorp", kind: "exited", value: 0, putCall: "Put" },
      { cusip: "WCUSIP", issuer: "WCorp", kind: "exited", value: 0 }, // 真实长仓清仓,无 putCall
    ],
  },
] as any;
const stockHolderRows = computeStockHolders(stockHolderScan, zCmap);
const zRow = stockHolderRows.find((r) => r.ticker === "Z");
assert(!zRow, `期权(put)平仓不应生成phantom清仓持有人行, got ${JSON.stringify(zRow)}`);
const wRow = stockHolderRows.find((r) => r.ticker === "W" && r.kind === "exited");
assert(!!wRow, `真实长仓清仓(无putCall)仍应正常生成清仓行, got ${JSON.stringify(wRow)}`);

// (d) prior_weight 只应携带上季长仓权重,不能把同 ticker 的 put 名义权重合进去。
const priorWeightRows = computeStockHolders([
  {
    cik: "2",
    slug: "mgr2",
    person: "Manager Two",
    period: "2026Q2",
    filedAt: "2026-08-01",
    holdings: [{ cusip: "PLTRCUSIP", issuer: "Palantir", value: 10, shares: 10, weight: 0.1 }],
    priorHoldings: [
      { cusip: "PLTRCUSIP", weight: 0.05 },
      { cusip: "PLTRCUSIP", weight: 0.6, putCall: "Put" },
    ],
    changes: [{ cusip: "PLTRCUSIP", issuer: "Palantir", kind: "increased", value: 10 }],
  },
] as any, cmap);
const priorWeightRow = priorWeightRows.find((r) => r.ticker === "PLTR");
assert(priorWeightRow?.prior_weight === 0.05, `prior_weight应排除上季put权重, got ${priorWeightRow?.prior_weight}`);

console.log("compute.check OK");
