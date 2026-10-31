import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeRecentFilings, type SecSubmission } from "./company-submissions";
import { parseNativeFinancials } from "./native-financials";
const fixture = (name: string) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

for (const ticker of ["BMM", "NICM"]) {
  const submission = JSON.parse(fixture(`${ticker.toLowerCase()}-submissions.json`)) as SecSubmission;
  const filing = normalizeRecentFilings(ticker, submission).find(f => f.form === "40-F");
  assert.ok(filing, `${ticker}: latest annual cannot be truncated by newer 6-K filings`);
  const xml = fixture(`${ticker.toLowerCase()}-40f.xml`);
  const periods = parseNativeFinancials(ticker, filing, xml, `${filing.sec_index_url}fixture_htm.xml`);
  assert.deepEqual(periods.map(p => p.period_end), ["2025-12-31", "2024-12-31"]);
  const current = periods[0];
  assert.equal(current.reporting_currency, "CAD");
  assert.equal(current.accounting_standard, "IFRS");
  assert.equal(current.valuation_eligible, false);
  assert.equal(current.share_basis, "issuer_ordinary");
  assert.equal(current.profit_loss, ticker === "BMM" ? -38772860 : -5524828);
  assert.equal(current.revenue, ticker === "BMM" ? null : 1535138, "missing revenue stays null");
  assert.equal(current.total_assets, ticker === "BMM" ? 254098193 : 14549897);
  assert.equal(current.operating_cash_flow, ticker === "BMM" ? -29569179 : -5568902);
  assert.equal(current.is_comparative, false);
  assert.equal(current.weighted_average_shares, ticker === "BMM" ? 51778782 : 185967860);
  assert.equal(current.diluted_weighted_average_shares, ticker === "BMM" ? 51778782 : 185967860, "issuer ordinary shares are not ADR-adjusted");
  assert.throws(() => parseNativeFinancials(ticker, filing, xml.replaceAll(filing.cik, "0000000001"), "fixture"), /native financial/i, "context entity must match issuer");
  assert.throws(() => parseNativeFinancials(ticker, filing, xml.replaceAll("<entity>", "<entity><segment>dimension</segment>"), "fixture"), /native financial/i, "dimensional facts cannot substitute for consolidated financials");
  const nilProfit = xml.replace(/<ifrs-full:ProfitLoss /g, '<ifrs-full:ProfitLoss xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true" ');
  assert.throws(() => parseNativeFinancials(ticker, filing, nilProfit, "fixture"), /native financial/i, "nil profit is unavailable, not zero");
  const conflict = xml.replace(/(<ifrs-full:ProfitLoss [^>]*>)-?\d+/, "$1999999999");
  assert.throws(() => parseNativeFinancials(ticker, filing, conflict, "fixture"), /Conflicting/, "contradictory duplicate facts fail rather than first-wins");
  assert.equal(periods[1].is_comparative, true);
  assert.equal(current.raw_facts.profit_loss?.unit, "CAD");
  assert.ok(current.raw_facts.profit_loss?.context_id);
  assert.match(current.raw_facts.profit_loss!.concept, /ifrs.*ProfitLoss/);
  const acceptedRebindings: string[] = [];
  for (const [name, rebound] of [
    ["taxonomy", xml.replaceAll("<ifrs-full:ProfitLoss ", '<ifrs-full:ProfitLoss xmlns:ifrs-full="https://example.com/wrong-taxonomy" ')],
    ["currency", xml.replaceAll("<measure>iso4217:CAD", '<measure xmlns:iso4217="https://example.com/wrong-currency">iso4217:CAD')],
  ]) {
    try { parseNativeFinancials(ticker, filing, rebound, "fixture"); acceptedRebindings.push(name); }
    catch (error) { assert.match(String(error), /namespace|native financial/i); }
  }
  assert.deepEqual(acceptedRebindings, [], "locally rebound taxonomy/unit QNames must never be labeled IFRS/CAD");
  const monetaryUSD = xml.replaceAll("iso4217:CAD", "iso4217:USD");
  assert.throws(() => parseNativeFinancials(ticker, filing, monetaryUSD, "fixture"), /CAD|native financial/i, "USD footnotes cannot become CAD financials");
  assert.throws(() => parseNativeFinancials(ticker, { ...filing, cik: "0000000001" }, xml, "fixture"), /identity/i);
  assert.throws(() => parseNativeFinancials(ticker, filing, xml.replaceAll("https://xbrl.ifrs.org/taxonomy/2025-03-27/ifrs-full", "https://example.com/ifrs-full"), "fixture"), /native financial/i, "namespace identity matters, not prefix spelling");
}
console.log("native 40-F annual periods, CAD units and source identity checks OK");
