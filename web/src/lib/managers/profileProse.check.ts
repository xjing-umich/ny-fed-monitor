import assert from "node:assert/strict";
import { displayFundName } from "./profileProse";

// 混合大小写不再绕过机构清洗；策展名内部大小写仍保持。
assert.equal(displayFundName("Baupost Group Llc/Ma"), "Baupost Group LLC");
assert.equal(displayFundName("Dodge & Cox Dodge & Cox"), "Dodge & Cox");
assert.equal(displayFundName("Cooperman Leon G"), "Leon G Cooperman");
assert.equal(displayFundName("eValue Capital LLC/CA"), "eValue Capital LLC");
assert.equal(displayFundName("Fundsmith LLP"), "Fundsmith LLP");
assert.equal(displayFundName("Appaloosa LP"), "Appaloosa LP");
console.log("profileProse.check OK");
