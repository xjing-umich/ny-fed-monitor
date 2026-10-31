import assert from "node:assert/strict";
import fs from "node:fs";
import { parseIbnAnnual } from "./ibn";
const html=fs.readFileSync(new URL('./fixtures/ibn-2026-20f.html',import.meta.url),'utf8');
const expected=JSON.parse(fs.readFileSync(new URL('./fixtures/expected.json',import.meta.url),'utf8')).IBN;
const periods=parseIbnAnnual(html,"2026-03-31");
assert.deepEqual(periods.map(x=>x.period_end),["2026-03-31","2025-03-31"]);
assert.deepEqual(periods.map(x=>x.period_start),["2025-04-01","2024-04-01"]);
for(const p of periods)for(const [metric,value] of Object.entries(expected[p.period_end]))assert.equal(p.metrics[metric],value,metric);
assert.equal(periods[0].metrics.revenue,undefined,"bank gross total income is not ordinary normalized revenue");
assert.equal(periods[0].metrics.weighted_average_shares,undefined,"do not derive shares from rounded EPS or US-GAAP reconciliations");
assert.equal(periods[0].raw_facts.total_income.scale,1000);assert.equal(periods[0].raw_facts.basic_eps.scale,1);
assert.equal(periods[0].raw_facts.profit_loss_attributable_to_owners.unit,"INR");
for(const [index,bad] of [
 html.replaceAll('ICICI','OTHER'),html.replaceAll('Consolidated','Standalone'),
 html.replaceAll('Indian GAAP','US GAAP'),html.replaceAll('in thousands','in millions'),
 html.replaceAll('2025','2024'),html.replaceAll('542,077,028','..'),
].entries())assert.throws(()=>parseIbnAnnual(bad,"2026-03-31"),/IBN/,`malformed case ${index}`);
assert.throws(()=>parseIbnAnnual(html+html,"2026-03-31"),/IBN/,'ambiguous duplicate primary tables fail');
assert.throws(()=>parseIbnAnnual(html,"2026-12-31"),/IBN/);
console.log('IBN primary Indian-GAAP table identity, scale, periods and bank income semantics checks OK');
