/** Run: cd web && npx tsx src/lib/share/shareText.check.ts */
import { buildShareText } from "./shareText";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

// 调用方传 EDGAR 原名,分享文案里也必须是清洗后的名字(与页面展示一致)。
const inv = buildShareText(
  { kind: "investor", managerName: "Warren Buffett", topHolding: "APPLE INC", addedName: "CHUBB LIMITED" },
  "en",
  "Fallback",
);
assert(!inv.includes("APPLE INC") && inv.includes("Apple Inc"), `investor topHolding 清洗: ${inv}`);
assert(!inv.includes("CHUBB LIMITED"), `investor addedName 清洗: ${inv}`);

for (const kind of ["consensus", "buys", "sells"] as const) {
  const input =
    kind === "consensus"
      ? { kind, topName: "MICROSOFT CORP", holderCount: 41, managerCount: 92 }
      : { kind, topName: "MICROSOFT CORP", count: 12, quarterLabel: "Q2 2026" };
  for (const lang of ["zh", "en"] as const) {
    const t = buildShareText(input, lang, "Fallback");
    assert(!t.includes("MICROSOFT CORP") && t.includes("Microsoft Corp"), `${kind}/${lang} topName 清洗: ${t}`);
  }
}

// 缺槽位仍退化为标题,不因清洗而拼出断言。
assert(
  buildShareText({ kind: "investor", managerName: "X", topHolding: null, addedName: null }, "zh", "标题") === "标题 via @thecompounder",
  "缺 topHolding 退化",
);

console.log("shareText.check OK");
