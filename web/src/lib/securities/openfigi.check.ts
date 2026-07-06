/**
 * openfigi.check.ts — 证券类型分类自检(排除非经营性载体)。
 * Run: cd web && npx tsx src/lib/securities/openfigi.check.ts
 * 断言值取自真 OpenFIGI /v3/mapping 响应(2026-07-04)与 securities 表实际标签分布。
 */
import assert from "node:assert";
import { isOperatingSecurity, parseMappingResult } from "./openfigi";

// 1) 非经营性载体 → 排除(实测 securities 表标签:ETP=SIVR/GLD, Closed-End Fund, Equity WRT=权证)
for (const t of ["ETP", "Mutual Fund", "Closed-End Fund", "Equity WRT", "Warrant", "Right", "Unit", "Index"])
  assert(isOperatingSecurity(t) === false, `${t} → non-operating (excluded)`);

// 2) 经营性实体 → 保留(实测标签:Common Stock/REIT/ADR/MLP/NY Reg Shrs/Tracking Stk 都算真生意)
for (const t of ["Common Stock", "REIT", "ADR", "MLP", "NY Reg Shrs", "Tracking Stk", "Preferred Stock"])
  assert(isOperatingSecurity(t) === true, `${t} → operating (kept)`);

// 3) 未知/未回填(null/undefined/空)→ 保守视为可估,不静默漏真公司
for (const t of [null, undefined, ""])
  assert(isOperatingSecurity(t) === true, `${String(t)} → default keep`);

// 4) parseMappingResult 透传 securityType
{
  const r = parseMappingResult("003264108", "ABRDN PHYSICAL SILVER SHARES", {
    data: [{ ticker: "SIVR", name: "ABRDN PHYSICAL SILVER SHARES", exchCode: "US", figi: "BBG000NK15L3", securityType: "ETP" }],
  });
  assert(r.resolved && r.securityType === "ETP" && isOperatingSecurity(r.securityType) === false, "SIVR parsed as ETP → excluded");
}
// 5) 未匹配行 → securityType=null, 保守可估
{
  const r = parseMappingResult("999999999", "SOME ISSUER", { warning: "no result" });
  assert(r.resolved === false && r.securityType === null && isOperatingSecurity(r.securityType) === true, "unresolved → null type, default keep");
}

console.log("openfigi.check.ts ✓ all assertions passed");
