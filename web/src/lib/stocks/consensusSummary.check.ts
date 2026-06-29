import { strict as assert } from "node:assert";
import { buildConsensusSentence } from "./consensusSummary";

const base = { issuer: "Apple Inc", ticker: "AAPL", n: 12, period: "2026Q1" };

// 1) 有动向: 英文句含计数、各动作、as-of, 无禁词
const en = buildConsensusSentence(
  { ...base, moves: { opened: 3, added: 2, trimmed: 1, exited: 0 } },
  "en",
);
assert.ok(en.includes("12 superinvestors"), `en count: ${en}`);
assert.ok(en.includes("Apple Inc") && en.includes("AAPL"), `en entity: ${en}`);
assert.ok(/3 opened/.test(en) && /2 added/.test(en) && /1 trimmed/.test(en), `en moves: ${en}`);
assert.ok(en.includes("2026Q1"), `en as-of: ${en}`);

// 2) 全零动向 → 退化句(无变动), 仍含计数 + as-of
const flat = buildConsensusSentence(
  { ...base, moves: { opened: 0, added: 0, trimmed: 0, exited: 0 } },
  "en",
);
assert.ok(/no .*change/i.test(flat), `flat phrasing: ${flat}`);
assert.ok(flat.includes("12 superinvestors") && flat.includes("2026Q1"), `flat keeps facts: ${flat}`);

// 3) 中文句: 纯中文(无英文动作词), 含计数 + as-of
const zh = buildConsensusSentence(
  { ...base, moves: { opened: 1, added: 0, trimmed: 0, exited: 2 } },
  "zh",
);
assert.ok(/12 位超级投资者/.test(zh), `zh count: ${zh}`);
assert.ok(/1 家新进/.test(zh) && /2 家清仓/.test(zh), `zh moves: ${zh}`);
assert.ok(!/opened|added|trimmed|exited|hold/i.test(zh), `zh no english: ${zh}`);

// 4) 合规: 任一句都不含买卖/目标价/评级词元
for (const s of [en, flat, zh]) {
  assert.ok(!/\b(buy|sell|hold|target|rating|recommend)\b/i.test(s), `compliance: ${s}`);
}

// 5) 单数: n=1 用单数 superinvestor
const one = buildConsensusSentence(
  { ...base, n: 1, moves: { opened: 0, added: 1, trimmed: 0, exited: 0 } },
  "en",
);
assert.ok(/\b1 superinvestor\b/.test(one) && !/superinvestors/.test(one), `singular: ${one}`);

console.log("consensusSummary.check.ts: all assertions passed");
