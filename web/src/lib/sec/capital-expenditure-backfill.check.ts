import assert from "node:assert/strict";
import { backfillMissingFilings, backfillCapitalExpenditures, extractGaapFacts } from "./filing-backfill";
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

for (const measure of ["xbrli:shares", "iso4217:USD/xbrli:shares"]) {
  const wrongUnit = xml.replace('<xbrli:measure>iso4217:USD</xbrli:measure>',
    `<xbrli:measure>${measure}</xbrli:measure>`);
  assert.equal(extractGaapFacts(wrongUnit).filter(f =>
    f.tag === "PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets").length, 0,
    "extension CapEx must be USD at extraction, including the core filing-backfill path");
}

// Never spend the daily fetch budget on discarded years after recent periods are already complete.
const allYears = Array.from({ length: 8 }, (_, i) => ({ ...historyFact,
  start: `${2025-i}-01-01`, end: `${2025-i}-12-31`, filed: `${2026-i}-04-26`,
  accn: `0000000001-${String(26-i)}-000001` }));
const completeRecent: CompanyFacts = { cik: 1, entityName: "Fixture", facts: { "us-gaap": {
  Revenues: { units: { USD: allYears } }, NetIncomeLoss: { units: { USD: allYears } },
  PaymentsToAcquirePropertyPlantAndEquipment: { units: { USD: allYears.slice(0, 6) } },
} } };
assert.equal(findMissingCapitalExpenditureFilings(completeRecent, [recentFiling]).length, 0,
  "older missing fields outside six retained fiscal years cannot cause daily filing downloads");

async function productionPathUnitChecks() {
  const savedFetch = globalThis.fetch;
  const savedAgent = process.env.SEC_USER_AGENT;
  process.env.SEC_USER_AGENT = "Local fixture; network disabled";
  const tag = "PaymentsToAcquirePropertyEquipmentAndSoftwareAndIntangibleAssets";
  try {
    for (const [measure, expected] of [
      ["<xbrli:measure>xbrli:shares</xbrli:measure>", null],
      ["<xbrli:divide><xbrli:unitNumerator><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unitNumerator><xbrli:unitDenominator><xbrli:measure>xbrli:shares</xbrli:measure></xbrli:unitDenominator></xbrli:divide>", null],
      ["<xbrli:measure>iso4217:USD</xbrli:measure>", -12345],
    ] as const) {
      const source = `<xbrli:xbrl><xbrli:context id="fy"><xbrli:entity/><xbrli:period><xbrli:startDate>2025-01-01</xbrli:startDate><xbrli:endDate>2025-12-31</xbrli:endDate></xbrli:period></xbrli:context><xbrli:unit id="test">${measure}</xbrli:unit><xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit><us-gaap:Revenues contextRef="fy" unitRef="usd">100000</us-gaap:Revenues><us-gaap:NetIncomeLoss contextRef="fy" unitRef="usd">1000</us-gaap:NetIncomeLoss><issuer:${tag} contextRef="fy" unitRef="test">12345</issuer:${tag}></xbrli:xbrl>`;
      const old = { start: "2024-01-01", end: "2024-12-31", val: 1000, form: "10-K", filed: "2025-02-01", accn: "0000000001-25-000001" };
      const facts: CompanyFacts = { cik: 1, entityName: "Fixture", facts: { "us-gaap": {
        Revenues: { units: { USD: [old] } }, NetIncomeLoss: { units: { USD: [old] } },
      } } };
      const filing: NormalizedFiling = { ...recentFiling, accession_number: "0000000001-26-000001", form: "10-K", filing_date: "2026-02-01", primary_document: "annual.htm" };
      globalThis.fetch = async () => new Response(source);
      await backfillMissingFilings(facts, [filing]);
      await backfillCapitalExpenditures(facts, [filing]);
      const result = normalizeCompanyFacts("ANY", filing.cik, facts, [filing]).annual[0];
      assert.equal(result.period_end, "2025-12-31");
      assert.equal(result.capex, expected, "both filing backfill paths enforce USD before normalization");
      if (expected != null) assert.equal((result.raw_facts?.capex as { tag?: string } | undefined)?.tag, `issuer:${tag}`);
    }
  } finally {
    globalThis.fetch = savedFetch;
    if (savedAgent === undefined) delete process.env.SEC_USER_AGENT;
    else process.env.SEC_USER_AGENT = savedAgent;
  }
}
productionPathUnitChecks();
