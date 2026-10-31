import assert from "node:assert/strict";
import {valuationPeriods, adsRatioDisclosure, perSecurityUnit} from "./displayFacts";
for(const lang of ["en","zh"] as const){
 assert.match(valuationPeriods([2026,2025],lang,{year:2026,periodEnd:"2026-03-31"}), /2026/);
 assert(valuationPeriods([2025],lang,{year:2026,periodEnd:"2026-03-31"}).includes("FY 2025"),"R&D subset must not relabel its first FY as TTM");
 assert.equal(valuationPeriods([2026,2025],lang,null),lang==="zh"?"期间口径未保留":"Period basis was not retained");
 assert(adsRatioDisclosure("ADS",undefined,lang)?.includes(lang==="zh"?"未知":"unknown"));
 assert.equal(perSecurityUnit("unknown",lang),lang==="zh"?"/ 单位未知":"/ unit unknown");
}
console.log("displayFacts.check OK");
