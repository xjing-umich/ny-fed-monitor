import { buildSignalCrossover } from "./signalCrossover";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

// (a) 三段齐全, 冲突(加仓 + above)如实并置, 不写"但是"。
const s = buildSignalCrossover(
  { n: 6, moves: { opened: 3, added: 0, trimmed: 0, exited: 1 }, verdict: "above", period: "2026-03-31" }, "zh");
assert(s.includes("6 位") && s.includes("3 家新建") && s.includes("1 家清仓"), `三段动作缺失: ${s}`);
assert(s.includes("现价高于保守价值带"), `估值段缺失: ${s}`);
assert(s.includes(" · "), `应以 · 并置: ${s}`);
assert(!s.includes("但") && !s.includes("however"), `不得写连接/转折词: ${s}`);
assert(s.includes("截至 2026-03-31"), `句尾缺 as-of: ${s}`);

// (b) verdict=null → 省估值段(只前两段)。
const s2 = buildSignalCrossover(
  { n: 2, moves: { opened: 0, added: 1, trimmed: 0, exited: 0 }, verdict: null, period: "2026-03-31" }, "en");
assert(s2.includes("2 superinvestors") && s2.includes("1 added"), `英文段缺失: ${s2}`);
assert(!/value band/.test(s2), `verdict=null 不应有估值段: ${s2}`);

// (c) 动作全 0 → 省动作段(只 holder 段 + 估值段)。
const s3 = buildSignalCrossover(
  { n: 4, moves: { opened: 0, added: 0, trimmed: 0, exited: 0 }, verdict: "below", period: "2026-03-31" }, "zh");
assert(!s3.includes("本季"), `动作全 0 应省动作段: ${s3}`);
assert(s3.includes("4 位") && s3.includes("现价低于保守价值带"), `holder/估值段缺失: ${s3}`);

console.log("signalCrossover.check OK");
