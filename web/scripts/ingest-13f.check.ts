import { hasLongHoldings, isRealHolding, isZeroHoldingsReport } from "./lib/holdingFilters";
import { includedManagerSeq, noticeOtherManagerCiks, rowHasManagerSeq } from "./lib/notice13f";
function assert(c: boolean, msg: string) { if (!c) { console.error("FAIL:", msg); process.exit(1); } }
assert(isRealHolding({ cusip: "037833100", issuer: "APPLE INC", value: 1e9, shares: 1000 }), "real holding kept");
assert(!isRealHolding({ cusip: "000000000", issuer: "NONE", value: 0, shares: 0 }), "NONE placeholder dropped");
assert(!isRealHolding({ cusip: "000000000", issuer: "NONE", value: 0, shares: 0 }) === true, "NONE dropped (bool)");
assert(!isRealHolding({ cusip: "", issuer: "X", value: 1, shares: 1 }), "empty cusip dropped");
assert(
  !hasLongHoldings([{ cusip: "69608A108", issuer: "PALANTIR TECHNOLOGIES INC", value: 9e8, shares: 100, putCall: "Put" }]),
  "filing with only put/call rows must not become latest long-only filing"
);
assert(
  hasLongHoldings([
    { cusip: "69608A108", issuer: "PALANTIR TECHNOLOGIES INC", value: 9e8, shares: 100, putCall: "Put" },
    { cusip: "037833100", issuer: "APPLE INC", value: 1e8, shares: 1000 },
  ]),
  "filing with at least one common-stock row remains eligible"
);

// ── 零持仓 13F-HR(EDGAR 不许空表,只能填一行全 0 占位)────────────────────────
// Olstein 2026Q2 0000894189-26-021028:nameOfIssuer "0" / cusip 000000000 / value 0 / sshPrnamt 0。
assert(isZeroHoldingsReport([{ value: 0, shares: 0 }]), "Olstein 2026Q2 single all-zero row = zero report");
// Makaira 2026Q1 0001540866-26-000002:nameOfIssuer "NONE",同样全 0。
assert(isZeroHoldingsReport([{ value: 0, shares: 0 }, { value: 0, shares: 0 }]), "multiple all-zero rows = zero report");
assert(!isZeroHoldingsReport([]), "no rows at all is a parse failure, not a zero report");
assert(!isZeroHoldingsReport([{ value: 0, shares: 0 }, { value: 21986, shares: 65000 }]), "any real row → not zero report");

// ── 13F-NT 代报跟随(Pershing Square Capital Mgmt 2026Q2,EDGAR 2026-08-14 原文节选)──────────
const PSCM_NT_COVER = `<edgarSubmission><formData><coverPage>
  <reportType>13F NOTICE</reportType>
  <otherManagersInfo><otherManager><cik>0002026053</cik><form13FFileNumber>028-25746</form13FFileNumber><name>PERSHING SQUARE INC.</name></otherManager></otherManagersInfo>
  <additionalInformation>Holdings of this reporting manager are now included in the report of its public parent company.</additionalInformation>
</coverPage></formData></edgarSubmission>`;
const nt = noticeOtherManagerCiks(PSCM_NT_COVER);
assert(nt.length === 1 && nt[0] === "0002026053", `NT cover → parent CIK 0002026053, got ${nt.join(",")}`);
assert(noticeOtherManagerCiks("<edgarSubmission/>").length === 0, "NT without otherManagersInfo → no parent");

// PERSHING SQUARE INC. 2026Q2 13F-HR 0001172661-26-003790 封面 <otherManagers2Info>(6 个 included manager)。
const PSI_Q2_COVER = `<summaryPage><otherIncludedManagersCount>6</otherIncludedManagersCount><otherManagers2Info>
  <otherManager2><sequenceNumber>1</sequenceNumber><otherManager><cik>0001336528</cik><name>Pershing Square Capital Management, L.P.</name></otherManager></otherManager2>
  <otherManager2><sequenceNumber>2</sequenceNumber><otherManager><cik>0001336477</cik><name>PSCM GP, LLC</name></otherManager></otherManager2>
  <otherManager2><sequenceNumber>5</sequenceNumber><otherManager><cik>0002129160</cik><name>Pershing Square PSUS Holdings, LLC</name></otherManager></otherManager2>
</otherManagers2Info></summaryPage>`;
assert(includedManagerSeq(PSI_Q2_COVER, "0001336528") === 1, "PSCM is included manager #1");
assert(includedManagerSeq(PSI_Q2_COVER, "1336528") === 1, "CIK match ignores zero padding");
assert(includedManagerSeq(PSI_Q2_COVER, "0009999999") === null, "unlisted manager → null (do not take the whole parent table)");

// 行级归属:母公司表 15 行里 14 行挂 "1, 2, 3, 4"(或含 6),PERSHING SQUARE USA LTD 那行只挂 "3, 4, 5",不属于 PSCM。
assert(rowHasManagerSeq("1, 2, 3, 4", 1), "row tagged 1,2,3,4 belongs to PSCM");
assert(rowHasManagerSeq("1, 2, 3, 4, 6", 1), "HHH block tagged 1,2,3,4,6 belongs to PSCM");
assert(!rowHasManagerSeq("3, 4, 5", 1), "PSUS row tagged 3,4,5 excluded");
assert(!rowHasManagerSeq("11, 12", 1), "seq 1 must not match 11/12");
assert(!rowHasManagerSeq(undefined, 1), "untagged row (parent's own) excluded");
console.log("ingest-13f.check OK");
