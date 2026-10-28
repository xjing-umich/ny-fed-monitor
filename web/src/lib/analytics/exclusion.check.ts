import { parseInternalParam, exclusionReason } from "./exclusion";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const HEADLESS = CHROME.replace("Chrome/", "HeadlessChrome/");

assert(parseInternalParam("?tc_internal=1") === true, "=1 标记内部");
assert(parseInternalParam("?view=all&tc_internal=0") === false, "=0 取消内部");
assert(parseInternalParam("?tc_internal=yes") === null, "其它值不改动");
assert(parseInternalParam("") === null, "缺省不改动");

assert(exclusionReason({ internalFlag: null, webdriver: false, userAgent: CHROME }) === null, "普通 Chrome 计入");
assert(exclusionReason({ internalFlag: "1", webdriver: false, userAgent: CHROME }) === "internal", "内部标记排除");
assert(exclusionReason({ internalFlag: null, webdriver: true, userAgent: CHROME }) === "automation", "webdriver 排除（伪装 UA 的无头浏览器）");
assert(exclusionReason({ internalFlag: null, webdriver: false, userAgent: HEADLESS }) === "automation", "HeadlessChrome UA 排除");
assert(exclusionReason({ internalFlag: null, webdriver: false, userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1)" }) === "automation", "爬虫 UA 排除");
assert(exclusionReason({ internalFlag: null, webdriver: false, userAgent: CHROME.replace("Chrome/", "Claude/4.29.0 Chrome/") }) === "automation", "Claude 桌面内置浏览器排除");
assert(exclusionReason({ internalFlag: "0", webdriver: false, userAgent: CHROME }) === null, "非 1 的旧值不算内部");

console.log("exclusion.check: ok");
