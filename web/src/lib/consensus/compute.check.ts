// Task 10: 期权(put/call)必须被剔除出四张共识快照——不是长仓,别算持有人/买卖动向。
import { computeConsensus } from "./compute";

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

console.log("compute.check OK");
