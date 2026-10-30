import assert from "node:assert/strict";
import { extractGaapFacts } from "./filing-backfill";
const xml = `<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:issuer="https://example.test/issuer" xmlns:us-gaap="http://fasb.org/us-gaap/2026"><xbrli:context id="fy"><xbrli:entity><xbrli:identifier scheme="x">1</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context><xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit><xbrli:unit id="cny"><xbrli:measure>iso4217:CNY</xbrli:measure></xbrli:unit><issuer:PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets contextRef="fy" unitRef="usd">163744000</issuer:PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets><issuer:PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets contextRef="fy" unitRef="cny">1145077000</issuer:PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets><issuer:PaymentsToAcquireInvestments contextRef="fy" unitRef="usd">999999</issuer:PaymentsToAcquireInvestments></xbrli:xbrl>`;
const capex = extractGaapFacts(xml).filter(
  (f) =>
    f.tag ===
    "PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets",
);
assert.equal(
  capex.length,
  1,
  "only exactly identified USD capital expenditure is eligible",
);
assert.equal(capex[0].value, 163744000);
assert.equal(
  capex[0].sourceTag,
  "issuer:PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets",
);
assert.ok(
  !extractGaapFacts(xml).some((f) => f.value === 999999),
  "financial investments are never mapped to operating capex",
);
console.log("capital expenditure extension checks passed");
import { findMissingCapitalExpenditureFilings } from "./filing-backfill";
import { normalizeCompanyFacts } from "./normalize-facts";
import type { CompanyFacts } from "./company-facts";
import type { NormalizedFiling } from "./company-submissions";
const historyFact = {
  start: "2022-01-01",
  end: "2022-12-31",
  val: 1000,
  form: "20-F",
  filed: "2023-04-26",
  accn: "0001104659-23-049927",
};
const historical: CompanyFacts = {
  cik: 1,
  entityName: "Fixture",
  facts: {
    "us-gaap": {
      Revenues: { units: { USD: [historyFact] } },
      NetIncomeLoss: { units: { USD: [{ ...historyFact, val: 100 }] } },
    },
  },
};
const recentFiling = {
  ticker: "ANY",
  cik: "0000000001",
  form: "20-F",
  accession_number: "0001104659-26-050727",
  report_date: "2025-12-31",
  filing_date: "2026-04-29",
  primary_document: "annual.htm",
} as NormalizedFiling;
assert.ok(
  findMissingCapitalExpenditureFilings(historical, [recentFiling]).some(
    (f) => f.report_date === "2022-12-31",
  ),
  "source accessions outside the recent24 filing list remain eligible for field backfill",
);
assert.equal(
  normalizeCompanyFacts("ANY", "0000000001", historical, []).annual[0].form,
  "20-F",
  "historical foreign forms come from the source fact, not a default 10-K guess",
);
