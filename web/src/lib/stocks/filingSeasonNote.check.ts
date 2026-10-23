// 运行: npx tsx src/lib/stocks/filingSeasonNote.check.ts
import assert from "node:assert/strict";
import { filingSeasonNote } from "./filingSeasonNote";

const season = {
  period: "2026-06-30",
  reason: "before_deadline" as const,
  maxPeriod: "2026-09-30",
  coverage: { filed: 2, total: 94, excluded: 3 },
};
assert.equal(
  filingSeasonNote(season, true, "zh"),
  "Q3 2026 申报中 2/94。标 Q3 2026 的行是新申报，不计入上面的 Q2 2026 动作。",
);
assert.equal(
  filingSeasonNote(season, true, "en"),
  "Q3 2026 filings arriving: 2 of 94. Rows marked Q3 2026 are new filings and aren't counted in the Q2 2026 moves above.",
);
assert.equal(filingSeasonNote(season, false, "zh"), "Q3 2026 申报中 2/94。", "表里没有混季行 → 只写进度");
assert.equal(
  filingSeasonNote({ ...season, period: "2026-09-30", reason: "due_and_covered" }, true, "zh"),
  null,
  "已切季 → 不写",
);
assert.equal(filingSeasonNote({ ...season, reason: "empty", maxPeriod: null }, false, "en"), null);
console.log("filingSeasonNote.check OK");
