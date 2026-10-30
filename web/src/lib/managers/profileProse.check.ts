import assert from "node:assert/strict";
import { displayFundName, buildInvestorProse } from "./profileProse";
import type { ManagerDetail } from './types';

// 混合大小写不再绕过机构清洗；策展名内部大小写仍保持。
assert.equal(displayFundName("Baupost Group Llc/Ma"), "Baupost Group LLC");
assert.equal(displayFundName("Dodge & Cox Dodge & Cox"), "Dodge & Cox");
assert.equal(displayFundName("Cooperman Leon G"), "Leon G Cooperman");
assert.equal(displayFundName("eValue Capital LLC/CA"), "eValue Capital LLC");
assert.equal(displayFundName("Fundsmith LLP"), "Fundsmith LLP");
assert.equal(displayFundName("Appaloosa LP"), "Appaloosa LP");
console.log("profileProse.check OK");

const filing = { period: '2026-06-30', filedAt: '2026-08-14', accession: 'fixture', totalValue: 100, holdings: [{ cusip: '008073AA6', issuer: 'Convertible note', value: 100, shares: 1 }] };
const detail: ManagerDetail = { manager: { cik: '1', slug: 'fixture', name: 'Fixture', person: 'Manager' }, latest: filing, filings: [filing], changes: [] };
for (const lang of ['en','zh'] as const) {
 const text = buildInvestorProse(detail, lang).flat().filter((s) => typeof s === 'string').join(' ');
 assert.ok(!/only long positions in US-listed equities|仅涵盖美股多头/.test(text), '13F covers more than equities');
 assert.ok(text.includes(lang === 'en' ? 'Section 13(f)' : '13(f)'), 'scope follows the SEC list');
 assert.ok(text.includes(lang === 'en' ? 'within 45 days after quarter-end' : '季末后 45 天内'), '45 days is a deadline');
}
