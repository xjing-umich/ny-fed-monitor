// 运行: npx tsx src/components/home/filingProgressText.check.ts
import assert from "node:assert/strict";
import { filingProgressText } from "./filingProgressText";

const c = { filed: 2, total: 94, excluded: 3 };
assert.equal(
  filingProgressText("zh", "Q3 2026", c, "11 月 16 日"),
  "Q3 2026 申报进行中 · 94 位中 2 位已交（另有 3 位上季未申报，不计入） · 11 月 16 日截止后切换",
);
assert.equal(
  filingProgressText("en", "Q3 2026", c, "Nov 16"),
  "Q3 2026 filings arriving · 2 of 94 in (3 others missed last quarter and aren't counted) · switches after Nov 16",
);
assert.equal(
  filingProgressText("en", "Q3 2026", { filed: 1, total: 94, excluded: 1 }, "Nov 16"),
  "Q3 2026 filings arriving · 1 of 94 in (1 other missed last quarter and isn't counted) · switches after Nov 16",
  "单数",
);
assert.equal(
  filingProgressText("zh", "Q3 2026", { filed: 2, total: 97, excluded: 0 }, "11 月 16 日"),
  "Q3 2026 申报进行中 · 97 位中 2 位已交 · 11 月 16 日截止后切换",
  "excluded=0 不出括号",
);
console.log("filingProgressText.check OK");
